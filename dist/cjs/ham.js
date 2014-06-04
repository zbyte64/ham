"use strict";
var _ = require("lodash")["default"] || require("lodash");
var postal = require("postal")["default"] || require("postal");
var _rr = require("postal.request-response")["default"] || require("postal.request-response");
var renderUrl = require("./common").renderUrl;
var MetaArray = require("./common").MetaArray;
var MetaObject = require("./common").MetaObject;
var renderUrlMatcher = require("./common").renderUrlMatcher;
var assocIn = require("./common").assocIn;
var dissocIn = require("./common").dissocIn;
var getIn = require("./common").getIn;
var doRequest = require("./common").doRequest;

if (_.isFunction(_rr)) _rr(postal);

var HamProcessor = {
  baseURI: '',
  channel: 'ham',
  timeout: 5000,
  regexProfileURI: /.*;.*profile\=([A-Za-z0-9\-_\/\#]+).*/,
  rootLink: function(document) {
    return this.getLink(document, {rel: 'root'});
  },
  splitURIptr: function(uri) {
    if (!uri) return []
    var ptr = uri.split('#', 2)[1]
    if (!ptr) return []
    return _.filter(ptr.split('/'))
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
      action: docMeta.action,
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
      this.setMeta(rootObject, {rel: "root"});
      return rootObject;
    } else {
      return document
    }
  },
  getDocument: function(identifier, filters, params, data, callback) {
    var stream = this.openChannel(identifier, filters, params, data, true);
    if (callback) return stream.then(callback);
    return stream
  },
  streamDocument: function(identifier, filters, params, data, callback) {
    //TODO this will mean open a websocket
    var stream = this.openChannel(identifier, filters, params, data, false);
    if (callback) return stream.then(callback)
    return stream
  },
  setupResponses: function() {
    if (_.isString(this.channel)) {
      this.channel = postal.channel(this.channel);
    }
    var self = this;
    this.setupResponsesDone = this.channel.subscribe(
      "open",
      function(data, envelope) {
        var useCache = false;
        var deferred = postal.configuration.promise.createDeferred();
        if (data.method == "GET") {
          useCache = self.sendCache(data.url, data.payload)
        }

        if (!useCache) {
          self.callURI(data.url, data.method, data.payload).then(function(doc) {
            deferred.resolve(doc)
          }, function(reason) {
            deferred.reject(reason)
          })
        } else {
          deferred.resolve(useCache)
        }
        envelope.reply(postal.configuration.promise.getPromise(deferred))
      }
    );
  },
  openChannel: function(identifier, filters, params, data, once) {
    if (!this.setupResponsesDone) this.setupResponses()
    //lookup the endpoint and return a subscription to the result
    var self = this,
        link = this.getLink(identifier, filters),
        url = renderUrl(link, params),
        method = link.method && link.method.toUpperCase() || "GET";
    if (this.baseURI && url[0] == '/') {
      url = this.baseURI + url;
    }

    var stream = {
      then: function(subcallback, onerror) {
        onerror = onerror || (typeof window == "undefined") ? console.error : (window.onerror || console.error)
        var subscription = self.channel.subscribe("document:"+url, function(){});

        function exitableCallback(document) {
          if (subcallback(document) === false) {
            subscription.unsubscribe();
          }
        }

        self.channel.request({
          topic: "open",
          data: {
            url: url,
            payload: data,
            method: method
          },
          timeout: self.timeout
        }).then(function(doc) {
          if (doc !== null) {
            if (subcallback(doc) === false || once) {
              subscription.unsubscribe()
            } else {
              subscription.subscribe(exitableCallback);
            }
          } else {
            subscription.subscribe(exitableCallback);
          }
        }, function(error) {
          //timeout
          subscription.unsubscribe()
          onerror(error)
        });
        //fire it off
        if (once) return subscription.once()
        return subscription;
      }
    }
    return stream;
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
        console.log("failed to find schema:", identifierOrDocument, filters)
      } else {
        links = schema.links
      }
    } else {
      //TODO get links from document by processing schema
      var schema = this.getMeta(identifierOrDocument).schema || {};
      links = _.merge([], schema.links, identifierOrDocument.links)
    }

    //case insensitive matching
    links = _.transform(links, function(result, link) {
      if (_.every(filters, function(value, key) {
        if (typeof value == "string") {
          return link[key].toLowerCase() == value.toLowerCase()
        }
        return link[key] == value
      })) {
         result.push(link)
      }
    });
    if (_.size(links) > 1) {
      //TODO error, more then one link found
    }
    return _.first(links)
  },
  getURI: function(identifierOrDocument, filters, params) {
    return renderUrl(this.getLink(identifierOrDocument, filters), params)
  },
  parseResponse: function(response) {
    if (response.error) {
      throw(response.error)
    }

    //TODO there is no guarantee we will have a these headers.
    //Seperate out a less assuming parser
    var uri = response.headers.uri || response.headers.location || response.req.url,
        action = response.req.method

    if (response.headers.length) {
      uri = response.headers[response.headers.length-1]
      if (action != "DELETE") {
        action = "GET"
      }
    }

    var document = response.body;
    document = this.setMeta(document, {
      timestamp: new Date().getTime(),
      uri: uri,
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
  callURI: function(url, method, data) {
    var self = this,
        deferred = postal.configuration.promise.createDeferred();

    doRequest(url, method, self.headers, data, function(response) {
      var document = self.parseResponse(response);
      self.publishDocument(document);
      deferred.resolve(document);
    }, function(response) {
      deferred.reject(response.text)
    });
    return postal.configuration.promise.getPromise(deferred);
  },
  publishDocument: function(document, success) {
    if (!success && !this.checkSuccess(document)) return
    var meta = this.getMeta(document)
    this.updateCache(document)
    this.notifySubscribers(document)
  },
  checkSuccess: function(document) {
    return true;
  },
  notifySubscribers: function(document) {
    if (!this.setupResponsesDone) this.setupResponses()
    var url = this.getMeta(document).uri;
    this.channel.publish({
      topic: "document:"+url,
      data: document
    });
  },
  updateCache: function() {
    //no-op
  },
  sendCache: function(url, callback) {
    //no-op
    return false;
  },
  headers: {}
};
exports.HamProcessor = HamProcessor;
var HamCacher = {
  cacheTime: 5 * 60 * 1000, //in milliseconds, 5 minute default
  schemas: {},
  objects: {},
  recycle_bin: {},
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
    //console.log("update cache on:", meta)
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
          instancesDocument = this.setMeta(instances, this.getMeta(instancesDocument))
        }
        this.publishDocument(instancesDocument, true)
      }
      //the result of a get or modification
    } else if (meta.action == "GET" || meta.action == "PATCH" ||
               meta.action == "POST" || meta.action == "PUT") {
      this.objects[url] = document

      //add the object to our instances cache
      var instancesUrl = this.resolveInstancesUrlFromDetailUrl(url),
          instancesDocument = this.objects[instancesUrl];
      if (instancesDocument) {
        var instances = this.rootObject(instancesDocument),
            detailLink = this.getLink(instancesDocument, {rel: "full", method: "GET"}),
            path = this.splitURIptr(this.getMeta(instances).uri),
            root = this.rootObject(document),
            newObject = true;
        instances = _.transform(instances, function(result, instance) {
          if (renderUrl(detailLink, instance) == url) {
            result.push(root)
            newObject = false;
          } else {
            result.push(instance)
          }
        })
        if (newObject) instances.push(root)
        if (_.size(path)) {
          assocIn(instancesDocument, path, instances)
        } else {
          instancesDocument = this.setMeta(instances, this.getMeta(instancesDocument))
        }
        this.publishDocument(instancesDocument, true)
      }
    }
  },
  sendCache: function(url, payload) {
    if (payload) return false;
    var cache = this.objects[url];
    if (cache) {
      var time_since = (new Date().getTime()) - this.getMeta(cache).timestamp;
      if (time_since < this.cacheTime) {
        return cache;
      }
    }
    return false
  },
  populateSchemasFromUri: function(url) {
    var self = this,
        deferred = postal.configuration.promise.createDeferred();
    doRequest(url, "GET", this.headers, null, function(response) {
      var schemas = self.parseResponse(response)
      self.schema_sources[url] = schemas;

      schemas = _.transform(schemas, function(result, val, key) {
        if(typeof val == "object") {
          result[key] = val
        }
      });

      _.each(schemas, function(schema, key) {
        self.registerSchema(key, schema)
        self.registerSchema(url + "#/" + key, schema)
      });
      deferred.resolve(schemas)
    });
    return postal.configuration.promise.getPromise(deferred)
  }
};
exports.HamCacher = HamCacher;
function Ham(props) {
  return _.extend({}, HamProcessor, HamCacher, props)
};
exports.Ham = Ham;