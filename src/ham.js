require _ from 'lodash';
require {Channel, renderUrl, assocIn, dissocIn, getIn, doRequest} from '/common';


export var HamProcessor = {
  regexProfileURI: /.*;.*profile\=([A-Za-z0-9\-_\/\#]+).*/,
  rootLink: function(document) {
    return this.getLink(document, {rel: 'root'});
  },
  splitURIptr: function(ptr) {
    return _.filter(_.last(ptr.split('#', 2)).split('/'))
  }
  subObject: function(document, ptr) {
    var parts = this.splitURIptr(ptr),
        docMeta = document.__meta,
        subObject = getIn(document, parts);
    subObject.__meta = {
        timestamp: docMeta.timestamp,
        uri: docMeta.uri + ptr
      }

      if (false) {
        //TODO resolve sub schema
        var schema = this.schemas[profileURI]
        subObject.__meta.schema = schema
        subObject.__meta.schema_url = profileURI
      }
    return subObject
  },
  rootObject: function(document) {
    var link = this.rootLink(document);
    if (link) {
      var rootObject = this.subObject(document, link.href);
      rootObject.__meta.rel = "root";
      return rootObject;
    } else {
      return document
    }
  },
  getDocument: function(identifier, filters, params, data, callback) {
    return this.streamDocument(identifier, filters, params, data, function(document) {
      callback(response);
      return false;
    });
  },
  streamDocument: function(identifier, filters, params, data, callback) {
    var chan = this.openChannel(identifier, filters, params, data)
    chan.bind(callback)
    return chan
  },
  openChannel: function(identifier, filters, params, data) {
    var link = this.getLink(identifier, filters),
        url = renderUrl(link, params),
        chan = Channel();
    this.subscribeURI(url, link.mehod, link.rel, data, chan)
    return chan
  },
  registerSchema: function(identifier, schema) {
    schemas[identifier] = schema;
  },
  getLink: function(identifierOrDocument, filters) {
    var links = null;
    if (typeof identifierOrDocument == "string") {
      var schema = schemas[identifierOrDocument];
      //TODO get link defs for schema through schema definition
      links = schema.links
    } else {
      //TODO get links from document by processing schema
      var schema = identifierOrDocument.__meta.schema || {};
      links = _.merge([], schema.links, identifierOrDocument.links)
    }
    links = _.where(links, filters)
    if (_.size(links) > 1) {
      //TODO error, more then one link found
    }
    return _.first(links)
  },
  subscribeURI: function(url, method, rel, data, chan) {
    var self = this,
        okay = this.sendCache(url, method, rel, chan),
        subId = _.uniqueId();
    if (!okay) {
      this.callURI(url, method, rel, data, chan.send)
    }
    //keep tabs on chan
    assocIn(this.channels, [url, method, rel, subId], chan)
    chan.onClose = function() {
      dissocIn(self.channels, [url, method, rel, subId])
    }
  },
  callURI: function(url, method, rel, data, callback) {
    var self = this;
    doRequest(url, method, data, function(response) {
      //TODO if response is 500 then simply push to callback
      var contentType = response.headers['Content-Type'],
          profileURI = _.first(self.regexProfileURI.matches(contentType)),
          //TODO decouple parsing
          document = JSON.parse(response.body);

      document.__meta = {
        timestamp: new Date().getTime(),
        uri: url
      }

      if (profileURI) {
        //TODO if profileURI has not been seen, fetch it
        var schema = self.schemas[profileURI]
        document.__meta.schema = schema
        document.__meta.schema_url = profileURI
      }
      //CONSIDER: document may be a redirect GET from a POST or PUT
      self.publishURI(url, method, rel, document);
      if (callback) callback(document);
    });
  },
  publishURI: function(url, method, rel, document) {
    if (!this.checkSuccess(document)) return
    this.updateCache(url, method, rel, document)
    //publish to listening channels
    _.each(getIn(this.channels, [url, method, rel], function(chan) {
      chan.send(document)
      if (method == "DELETE") {
        chan.close()
      }
    }))
  },
  checkSuccess: function(document) {
    return true;
  },
  updateCache: function() {
    //no-op
  },
  sendCache: function() {
    //no-op
  }
}

export function Ham(props) {
  return _.extend({}, HamProcessor, {
    cacheTime: 5 * 60 * 1000, //in milliseconds, 5 minute default
    schemas: {},
    objects: {},
    recycle_bin: {},
    channels: {},
    checkSuccess: function(document) {
      return document.status == "success"
    },
    resolveInstancesUrlFromDetailUrl: function(url) {
      //TODO iterate through known schemas/links
      return null
      return this.getLink(null, {rel: "instances", method: "GET"})
    },
    updateCache: function(url, method, rel, document) {
      if (method == "GET") {
        assocIn(this.objects, [url, method, rel], document)
      } else if (method == "DELETE") {
        dissocIn(this.objects, [url, "GET"])

        //remove the object from our instances cache
        var instancesUrl = this.resolveInstancesUrlFromDetailUrl(url),
            instancesDocument = getIn(this.objects, [instancesUrl, "GET", "instances"]);
        if (instancesDocument) {
          var instances = this.rootObject(instancesDocument),
              detailLink = this.getLink(instancesDocument, {rel: "full", method: "GET"}),
              path = this.splitURIptr(instances.__meta.uri);
          instances = _.filter(instance, function(instance) {
            return renderURL(detailLink, instance) != url
          })
          assocIn(instancesDocument, path, instances)
          this.publishURI(instancesUrl, "GET", "instances", instancesDocument)
        }
      } else if (rel == "create") {
        //add the object to our instances cache
        var root = this.rootObject(document),
            instancesUrl = this.resolveInstancesUrlFromDetailUrl(url),
            instancesDocument = getIn(this.objects, [instancesUrl, "GET", "instances"]);
        if (instancesDocument) {
          var instances = this.rootObject(instancesDocument)
          instances.push(root)
          this.publishURI(instancesUrl, "GET", "instances", instancesDocument)
        }
      }
    },
    sendCache: function(url, method, rel, chan) {
      var cache = getIn(this.objects, [url, method, rel]);
      if (cache) {
        chan.send(cache)
        var time_since = (new Date().getTime()) - cache.__meta.timestamp;
        if (method == "GET" && time_since < this.cacheTime) {
          return true;
        }
      }
      return false
    }
  }, props);
}
