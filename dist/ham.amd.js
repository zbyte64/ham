/*! ham 2014-04-23 */
define("/common", 
  ["lodash","superagent","async","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var _ = __dependency1__["default"] || __dependency1__;
    var request = __dependency2__["default"] || __dependency2__;
    var async = __dependency3__["default"] || __dependency3__;

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
      this.__meta = _.extend({} || this.__meta, meta)
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
      this.__meta = _.extend({} || this.__meta, meta)
    };

    MetaObject.prototype.getMeta = function() {
      return this.__meta || {}
    };

    function Channel() {
      var self = _.extend({}, {
        _backlog: [],
        queue: null,
        send: function(data) {
          if (!self.queue) {
            self._backlog.push(data)
          } else {
            self.queue.push(data)
          }
        },
        bind: function(f) {
          self.queue = async.queue(function(task, callback) {
            f(task)
            callback()
          })
          self.queue.push(self._backlog)
          self._backlog = null
        },
        close: function() {
          if(!self.closed) {
            self.queue = null;
            self._backlog = null;
            self.closed = true;
            self.onClose()
          }
        },
        onClose: function() {}
      })
      return self;
    }

    __exports__.Channel = Channel;var urlTemplatePattern = /\{([^\{\}]*)\}/g;
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
      return [new RegExp(matchS), args]
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

    __exports__.getIn = getIn;function innerRequest(url, method, headers, data, callback) {
      var req = request(method, url).withCredentials().type('json').accept('json').set(headers).redirects(0)
      if (data) {
        if (method == "GET" || method == "HEAD" || method == "OPTIONS") {
          req.query(data)
        } else {
          req.send(JSON.stringify(data))
        }
      }
      req.end(callback);
      return req
    };

    function doRequest(url, method, headers, data, callback) {
      function handler(response) {
        if (response.status >= 300 && response.status < 400 && response.headers.Location) {
          if (response.status != 307) {
            method = "GET"
          }
          //TODO allow for more then 1 redirect
          innerRequest(response.headers.Location, method, headers, null, callback)
        } else {
          callback(response)
        }
      }
      return innerRequest(url, method, headers, data, handler)
    };
    __exports__.doRequest = doRequest;
  });;define("/ham", 
  ["lodash","./common","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var _ = __dependency1__["default"] || __dependency1__;
    var Channel = __dependency2__.Channel;
    var renderUrl = __dependency2__.renderUrl;
    var MetaArray = __dependency2__.MetaArray;
    var MetaObject = __dependency2__.MetaObject;
    var renderUrlMatcher = __dependency2__.renderUrlMatcher;
    var assocIn = __dependency2__.assocIn;
    var dissocIn = __dependency2__.dissocIn;
    var getIn = __dependency2__.getIn;
    var doRequest = __dependency2__.doRequest;


    var HamProcessor = {
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

    function Ham(props) {
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
                instancesDocument = this.setMeta(instances, {
                  uri: instancesUrl,
                  action: "GET"
                })
              }
              this.publishDocument(instancesDocument, true)
            }
          } else if (meta.action == "GET") {
            this.objects[url] = document

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

    __exports__.Ham = Ham;
  });define("ham", ["/ham"], function(ham) {return ham});
