/*! ham 2014-04-15 */
define("ham", ["/ham"], function(ham) {return ham});
define("/common", 
  ["lodash","reqwest","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var _ = __dependency1__["default"] || __dependency1__;
    var reqwest = __dependency2__["default"] || __dependency2__;

    //Holds things I should find libraries for


    function async(func) {
      var args = [func, 1];
      args.push.apply(args, _.toArray(arguments).slice(1))
      window.setTimeout.apply(window, args)
    }

    function Channel(props) {
      var self = _.extend({}, {
        _queue: [],
        send: function(data) {
          if (!self.callback) {
            self._queue.push(data)
            return;
          }
          async(self.doSend, data)
        },
        doSend: function(data) {
          var response = self.callback(data);
          if (response === false) {
            self.close()
          }
          return response
        },
        doQueue: function() {
          _.each(self._queue, function(data) {
            self.doSend(data)
          })
          self._queue = [];
        },
        bind: function(callback) {
          self.callback = callback
          async(self.doQueue)
        },
        close: function() {
          if(!self.closed) {
            self._queue = null;
            self.callback = null;
            self.closed = true;
            self.onClose()
          }
        },
        onClose: function() {}
      }, props)
      return self;
    }

    __exports__.Channel = Channel;var urlTemplatePattern = /\{([^\{\}]*)\}/;
    __exports__.urlTemplatePattern = urlTemplatePattern;
    function renderUrl(link, params) {
      var url = link.href;
      _.each(params, function(val, key) {
        url = url.replace("{"+key+"}", val, "g")
      })
      return url;
    }

    __exports__.renderUrl = renderUrl;function renderUrlMatcher(link) {
      var matchS = link.href,
          parts = matchS.match(urlTemplatePattern);
      _.each(parts, function(val) {
        matchS.replace("{"+val+"}", "(?P<"+val+">[\w\d]+)")
      })
      return new RegExp(matchS);
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
      var r = reqwest({
        url: url,
        method: method,
        data: (data && method != "GET") && JSON.stringify(data) || null,
        contentType: 'application/json',
        headers: headers,
        type: 'json',
        withCredentials: true,
        success: function(payload) {
          var response = {
            headers: r.request.getAllResponseHeaders(),
            content: payload
          }
          callback(response)
        }
      });
    };
    __exports__.doRequest = doRequest;
  });;define("/ham", 
  ["lodash","/common","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var _ = __dependency1__["default"] || __dependency1__;
    var Channel = __dependency2__.Channel;
    var renderUrl = __dependency2__.renderUrl;
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
        return _.filter(_.last(ptr.split('#', 2)).split('/'))
      },
      subObject: function(document, ptr) {
        var parts = this.splitURIptr(ptr),
            docMeta = document.__meta,
            subObject = getIn(document, parts);
        subObject.__meta = {
            timestamp: docMeta.timestamp,
            uri: docMeta.uri + ptr
          }

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
          callback(document);
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
      getLink: function(identifierOrDocument, filters) {
        var links = null;
        if (typeof identifierOrDocument == "string") {
          var schema = this.schemas[identifierOrDocument];
          //TODO get link defs for schema through schema definition
          if (!schema) {
            console.log("failed to find schema:", identifierOrDocument, this.schemas)
          } else {
            links = schema.links
          }
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
      parseResponse: function(response) {
        return response.content
      },
      callURI: function(url, method, rel, data, callback) {
        var self = this;
        doRequest(url, method, self.headers, data, function(response) {
          //TODO if response is 500 then simply push to callback
          var contentType = response.headers['Content-Type'] || "",
              profileURI = _.last(contentType.match(self.regexProfileURI)),
              document = self.parseResponse(response);

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
                  matches = url.match(matcher);
              if (matches) {
                found_link = link
                //TODO
                params = {} //matches
                return false
              }
            })
          })
          if (found_link) {
            return renderUrl(found_link, params)
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
                  path = this.splitURIptr(instances.__meta.uri);
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
            var time_since = (new Date().getTime()) - cache.__meta.timestamp;
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
            _.each(schemas, function(schema, key) {
              self.registerSchema(key, schema)
            });
            chan.send(schemas)
          });
          return chan
        }
      }, props);
    }

    __exports__.Ham = Ham;
  });