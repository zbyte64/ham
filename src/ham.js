import _ from 'lodash';
import {Channel, renderUrl, MetaArray, MetaObject, renderUrlMatcher, assocIn, dissocIn, getIn, doRequest} from './common';


export var HamProcessor = {
  regexProfileURI: /.*;.*profile\=([A-Za-z0-9\-_\/\#]+).*/,
  rootLink: function(document) {
    return this.getLink(document, {rel: 'root'});
  },
  splitURIptr: function(ptr) {
    if (!ptr) return []
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
    } else if (document == null) {
      //TODO something with a false evaluation?
      var da = new MetaObject();
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
    this.subscribeURI(url, method, data, chan)
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
  subscribeURI: function(url, method, data, chan) {
    var self = this,
        okay = method == "GET" && this.sendCache(url, chan),
        subId = _.uniqueId();
    if (!okay) {
      this.callURI(url, method, data, chan.send)
    }
    //keep tabs on chan
    assocIn(this.channels, [url, subId], chan)
    chan.onClose = function() {
      dissocIn(self.channels, [url, subId])
    }
  },
  parseResponse: function(response) {
    console.log('parsing response:', response)
    if (response.error) {
      throw(error)
    }

    //TODO handle redirects properly
    var uri = response.req.url,
        action = response.req.method
    /*
    if (response.status >= 300 && response.status < 400 && response.headers.Location) {
      uri = response.headers.Location
    }*/

    var document = response.body;
    document = this.setMeta(document, {
      timestamp: new Date().getTime(),
      uri: response.req.url,
      action: action
    })

    if (response.profile) {
      //TODO if profile has not been seen, fetch it
      var schema = this.getSchema(response.profile)
      document.setMeta({
        schema: schema,
        schema_url: response.profile
      })
    }

    return document
  },
  callURI: function(url, method, data, callback) {
    var self = this;
    doRequest(url, method, self.headers, data, function(response) {
      var document = self.parseResponse(response);
      self.publishDocument(document);
      if (callback) callback(document);
    });
  },
  publishDocument: function(document, success) {
    if (!success && !this.checkSuccess(document)) return
    var meta = this.getMeta(document)
    this.updateCache(document)
    //publish to listening channels
    _.each(this.channels[meta.uri], function(chan) {
      chan.send(document)
      if (meta.action == "DELETE") {
        chan.close()
      }
    })
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
    resolveInstancesUrlFromDetailUrl: function(url) {
      var self = this,
          found_link = null,
          params = null;
      _.each(this.schemas, function(schema, ident) {
        if (found_link) return false
        var full_link = self.getLink(schema, {rel: "full", method: "GET"}),
            instances_link = self.getLink(schema, {rel: "instances", method: "GET"});
        if (full_link && instances_link) {
          var matcher = renderUrlMatcher(full_link),
              matches = matcher(url);
          if (matches) {
            found_link = instances_link
            params = matches
            return false;
          }
        }
      })
      if (found_link) {
        return renderUrl(found_link, params)
      } else {
        return false;
      }
    },
    updateCache: function(document) {
      var meta = this.getMeta(document),
          url = meta.uri;
      this.objects[url] = document
      if (meta.action == "DELETE") {
        dissocIn(this.objects, [url])

        //remove the object from our instances cache
        var instancesUrl = this.resolveInstancesUrlFromDetailUrl(url),
            instancesDocument = this.objects[instancesUrl];
        if (instancesDocument) {
          var instances = this.rootObject(instancesDocument),
              detailLink = this.getLink(instancesDocument, {rel: "full", method: "GET"}),
              path = this.splitURIptr(this.getMeta(instances).uri);
          //if (!detailLink) return;
          instances = _.filter(instances, function(instance) {
            return renderUrl(detailLink, instance) != url
          })
          if (_.size(path)) {
            assocIn(instancesDocument, path, instances)
          } else {
            //TODO we need meta
            instancesDocument = instances
          }
          this.publishDocument(instancesDocument, true)
        }
      } else if (meta.action == "GET") {
        //add the object to our instances cache
        var instancesUrl = this.resolveInstancesUrlFromDetailUrl(url),
            instancesDocument = this.objects[instancesUrl];
        if (instancesDocument) {
          var instances = this.rootObject(instancesDocument),
              root = this.rootObject(document);
          instances.push(root)
          this.publishDocument(instancesDocument, true)
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
