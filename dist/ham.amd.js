/*! ham 2014-05-20 */
define("/common", 
  ["lodash","superagent","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var _ = __dependency1__["default"] || __dependency1__;
    var request = __dependency2__["default"] || __dependency2__;

    //Holds things I should find libraries for

    var MetaArray = function() {
      var arr = []
      arr.push.apply(arr, arguments)
      arr.__proto__ = MetaArray.prototype
      return arr;
    };
    __exports__.MetaArray = MetaArray;
    MetaArray.prototype = new Array;

    MetaArray.prototype.setMeta = function(meta) {
      this.__meta = _.extend(this.__meta || {}, meta)
    };

    MetaArray.prototype.getMeta = function() {
      return this.__meta || {}
    };

    var MetaObject = function() {
      var obj = _.extend({}, arguments[0] || {})
      obj.__proto__ = MetaObject.prototype
      return obj;
    };
    __exports__.MetaObject = MetaObject;
    MetaObject.prototype = new Object;

    MetaObject.prototype.setMeta = function(meta) {
      this.__meta = _.extend(this.__meta || {}, meta)
    };

    MetaObject.prototype.getMeta = function() {
      return this.__meta || {}
    };

    var urlTemplatePattern = /\{([^\{\}]*)\}/g;
    __exports__.urlTemplatePattern = urlTemplatePattern;
    function renderUrl(link, params) {
      var url = link.href;
      _.each(params, function(val, key) {
        url = url.replace("{"+key+"}", val, "g")
      })
      return url;
    }

    __exports__.renderUrl = renderUrl;function renderUrlRegexp(link) {
      var matchS = link.href,
          parts = matchS.match(urlTemplatePattern),
          args = [];
      matchS = matchS.replace("/", "\\/", "g")
      _.each(parts, function(val) {
        //because javascript includes the brackets (its not like you wanted real regexp after all)
        matchS = matchS.replace(val, "([^\\/]*)")
        args.push(val.substr(1, val.length-2))
      })
      return [new RegExp("^"+matchS+"$"), args]
    }

    __exports__.renderUrlRegexp = renderUrlRegexp;function renderUrlMatcher(link) {
      var res = renderUrlRegexp(link),
          matcher = res[0],
          parts = res[1];
      return function(url) {
        var values = _.rest(url.match(matcher)),
            ret = {};
        _.each(values, function(val, index) {
          ret[parts[index]] = val
        })
        return _.size(ret) && ret || null;
      }
    }

    __exports__.renderUrlMatcher = renderUrlMatcher;function assocIn(struct, path, value) {
      var first = _.first(path),
          rest = _.rest(path);
      if (rest.length) {
        if (struct[first] == null) {
          struct[first] = {}
        }
        assocIn(struct[first], rest, value)
      } else {
        struct[first] = value
      }
    }

    __exports__.assocIn = assocIn;function dissocIn(struct, path) {
      var first = _.first(path),
          rest = _.rest(path);
      if (rest.length) {
        if (struct[first] == null) {
          return
        }
        dissocIn(struct[first], rest)
      } else {
        delete struct[first]
      }
    }

    __exports__.dissocIn = dissocIn;function getIn(struct, path) {
      var first = _.first(path),
          rest = _.rest(path);
      if (rest.length) {
        if (struct[first] == null) {
          return
        }
        return getIn(struct[first], rest)
      } else {
        return struct[first]
      }
    }

    __exports__.getIn = getIn;function doRequest(url, method, headers, data, callback) {
      method = method && method.toUpperCase() || "GET"
      headers = headers || {}
      headers.accept = headers.accept || 'application/json'
      headers['Content-Type'] = headers['Content-Type'] || 'application/json'
      var redirects = []
      var req = request(method, url).on('redirect', function(res) {
        redirects.push(res.headers.location)
      }).set(headers)

      if (req.withCredentials) {
        req = req.withCredentials()
      }

      if (data) {
        if (method == "GET" || method == "HEAD" || method == "OPTIONS") {
          req.query(data)
        } else {
          //TODO allow FormData
          req.send(JSON.stringify(data))
        }
      }
      req.end(function(res) {
        res.redirects = redirects
        callback(res)
      });
      return req
    };
    __exports__.doRequest = doRequest;
  });;define("/ham", 
  ["lodash","./common","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var _ = __dependency1__["default"] || __dependency1__;
    var renderUrl = __dependency2__.renderUrl;
    var MetaArray = __dependency2__.MetaArray;
    var MetaObject = __dependency2__.MetaObject;
    var renderUrlMatcher = __dependency2__.renderUrlMatcher;
    var assocIn = __dependency2__.assocIn;
    var dissocIn = __dependency2__.dissocIn;
    var getIn = __dependency2__.getIn;
    var doRequest = __dependency2__.doRequest;


    var HamProcessor = {
      baseURI: '',
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
        return this.openChannel(identifier, filters, params, data, callback);
      },
      streamDocument: function(identifier, filters, params, data, callback) {
        //TODO this will mean open a websocket
        return this.openChannel(identifier, filters, params, data, callback)
      },
      openChannel: function(identifier, filters, params, data, callback) {
        //lookup the endpoint and return a subscription to the result
        var link = this.getLink(identifier, filters),
            url = renderUrl(link, params),
            method = link.method && link.method.toUpperCase() || "GET";
        if (this.baseURI && url[0] == '/') {
          url = this.baseURI + url;
        }

        var useCache = false,
            f = this.getURISubscription(url, callback);
        if (method == "GET") {
          useCache = this.sendCache(url, f)
        }
        if (!useCache) {
          this.callURI(url, method, data, f)
        }
        return f
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
      getURISubscription: function(url, callback) {
        //Clients can put bacon.js or postal.js here
        return function(val) {
          if (callback) callback(val)
        }
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
        this.notifySubscribers(document)
      },
      checkSuccess: function(document) {
        return true;
      },
      notifySubscribers: function(document) {
        //Clients should notify subscribers here
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
    __exports__.HamProcessor = HamProcessor;
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
      sendCache: function(url, callback) {
        var cache = this.objects[url];
        if (cache) {
          callback(cache)
          var time_since = (new Date().getTime()) - this.getMeta(cache).timestamp;
          if (time_since < this.cacheTime) {
            return true;
          }
        }
        return false
      },
      populateSchemasFromUri: function(url, callback) {
        var chan = this.getURISubscription(url, callback),
            self = this;
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
          chan(schemas)
        });
        return chan
      }
    };
    __exports__.HamCacher = HamCacher;
    function Ham(props) {
      return _.extend({}, HamProcessor, HamCacher, props)
    };
    __exports__.Ham = Ham;
  });define("ham", ["/ham"], function(ham) {return ham});
