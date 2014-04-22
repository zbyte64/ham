import _ from 'lodash';
import {Channel, renderUrl, MetaArray, MetaObject, renderUrlMatcher, assocIn, dissocIn, getIn, doRequest} from './common';


export var HamProcessor = {
  regexProfileURI: /.*;.*profile\=([A-Za-z0-9\-_\/\#]+).*/,
  rootLink: function(document) {
    return this.getLink(document, {rel: 'root'});
  },
  splitURIptr: function(ptr) {
    return _.filter(_.last(ptr.split('#', 2)).split('/'))
  },
  setMeta: function(document, meta) {
    if (document instanceof MetaArray ||
        document instanceof MetaObject) {
      document.setMeta(meta)
      return document
    } else if (document instanceof Array) {
      var da = new MetaArray();
      da.push.apply(da, document)
      da.setMeta(meta)
      return da
    } else if (document instanceof Object) {
      var da = new MetaObject(document);
      da.setMeta(meta)
      return da
    }
    console.log("Unrecognized", document)
  },
  getMeta: function(document) {
    return document.getMeta && document.getMeta() || {}
  },
  subObject: function(document, ptr) {
    var parts = this.splitURIptr(ptr),
        docMeta = this.getMeta(document),
        subObject = getIn(document, parts);
    subObject = this.setMeta(subObject, {
        timestamp: docMeta.timestamp,
        uri: docMeta.uri + ptr
    })

      /*
      if (false) {
        //TODO resolve sub schema
        var schema = this.schemas[profileURI]
        subObject.__meta.schema = schema
        subObject.__meta.schema_url = profileURI
      } */
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
      if (callback) callback(document);
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
        method = link.method && link.method.toUpperCase() || "GET",
        chan = Channel();
    this.subscribeURI(url, method, link.rel, data, chan)
    return chan
  },
  registerSchema: function(identifier, schema) {
    this.schemas[identifier] = schema;
  },
  getSchema: function(identifier) {
    return this.schemas[identifier]
  },
  getLink: function(identifierOrDocument, filters) {
    var links = null;
    if (typeof identifierOrDocument == "string") {
      var schema = this.getSchema(identifierOrDocument);
      //TODO get link defs for schema through schema definition
      if (!schema) {
        console.log("failed to find schema:", identifierOrDocument, this.schemas)
      } else {
        links = schema.links
      }
    } else {
      //TODO get links from document by processing schema
      var schema = this.getMeta(identifierOrDocument).schema || {};
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
  parseResponse: function(response) {
    return response.body
  },
  callURI: function(url, method, rel, data, callback) {
    var self = this;
    doRequest(url, method, self.headers, data, function(response) {
      //TODO if response is 500 then simply push to callback
      var profileURI = response.profile,
          document = self.parseResponse(response);

      document = self.setMeta(document, {
        timestamp: new Date().getTime(),
        uri: url
      })

      if (profileURI) {
        //TODO if profileURI has not been seen, fetch it
        var schema = self.getSchema(profileURI)
        document.setMeta({
          schema: schema,
          schema_url: profileURI
        })
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
  },
  headers: {}
}

export function Ham(props) {
  return _.extend({}, HamProcessor, {
    cacheTime: 5 * 60 * 1000, //in milliseconds, 5 minute default
    schemas: {},
    objects: {},
    recycle_bin: {},
    channels: {},
    schema_sources: {},
    checkSuccess: function(document) {
      return document.status == "success"
    },
    resolveInstancesUrlFromDetailUrl: function(url) {
      var found_link = null,
          params = null;
      _.each(this.schemas, function(schema, ident) {
        if (found_link) return false
        _.each(schema.links, function(link) {
          //url match href pattern and populate params
          var matcher = renderUrlMatcher(link),
              matches = matcher(url);
          if (matches) {
            found_link = link
            params = matches
            return false
          }
        })
      })
      if (found_link) {
        return renderUrl(found_link, params)
      } else {
        return false;
      }
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
              path = this.splitURIptr(this.getMeta(instances).uri);
          instances = _.filter(instances, function(instance) {
            return renderUrl(detailLink, instance) != url
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
        var time_since = (new Date().getTime()) - this.getMeta(cache).timestamp;
        if (method == "GET" && time_since < this.cacheTime) {
          return true;
        }
      }
      return false
    },
    populateSchemasFromUri: function(url) {
      var chan = Channel(),
          self = this;
      doRequest(url, "GET", this.headers, null, function(response) {
        var schemas = self.parseResponse(response)
        self.schema_sources[url] = schemas;
        _.each(schemas, function(schema, key) {
          self.registerSchema(key, schema)
          self.registerSchema(url + "#/" + key, schema)
        });
        chan.send(schemas)
      });
      return chan
    }
  }, props);
}
