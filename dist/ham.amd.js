/*! ham 2015-04-06 */
"use strict";

define("/common", ["lodash", "superagent", "exports"], function (__dependency1__, __dependency2__, __exports__) {
  "use strict";
  var _ = __dependency1__["default"] || __dependency1__;
  var request = __dependency2__["default"] || __dependency2__;

  //Holds things I should find libraries for

  var MetaArray = (function (_MetaArray) {
    function MetaArray() {
      return _MetaArray.apply(this, arguments);
    }

    MetaArray.toString = function () {
      return _MetaArray.toString();
    };

    return MetaArray;
  })(function () {
    var arr = [];
    arr.push.apply(arr, arguments);
    arr.__proto__ = MetaArray.prototype;
    return arr;
  });
  __exports__.MetaArray = MetaArray;
  MetaArray.prototype = new Array();

  MetaArray.prototype.setMeta = function (meta) {
    this.__meta = _.extend(this.__meta || {}, meta);
  };

  MetaArray.prototype.getMeta = function () {
    return this.__meta || {};
  };

  var MetaObject = (function (_MetaObject) {
    function MetaObject() {
      return _MetaObject.apply(this, arguments);
    }

    MetaObject.toString = function () {
      return _MetaObject.toString();
    };

    return MetaObject;
  })(function () {
    var obj = _.extend({}, arguments[0] || {});
    obj.__proto__ = MetaObject.prototype;
    return obj;
  });
  __exports__.MetaObject = MetaObject;
  MetaObject.prototype = new Object();

  MetaObject.prototype.setMeta = function (meta) {
    this.__meta = _.extend(this.__meta || {}, meta);
  };

  MetaObject.prototype.getMeta = function () {
    return this.__meta || {};
  };

  var urlTemplatePattern = /\{([^\{\}]*)\}/g;
  __exports__.urlTemplatePattern = urlTemplatePattern;
  function renderUrl(link, params) {
    var url = link.href;
    _.each(params, function (val, key) {
      url = url.replace("{" + key + "}", val, "g");
    });
    return url;
  }

  __exports__.renderUrl = renderUrl;
  function renderUrlRegexp(link) {
    var matchS = link.href,
        parts = matchS.match(urlTemplatePattern),
        args = [];
    matchS = matchS.replace("/", "\\/", "g");
    _.each(parts, function (val) {
      //because javascript includes the brackets (its not like you wanted real regexp after all)
      matchS = matchS.replace(val, "([^\\/]*)");
      args.push(val.substr(1, val.length - 2));
    });
    return [new RegExp("^" + matchS + "$"), args];
  }

  __exports__.renderUrlRegexp = renderUrlRegexp;
  function renderUrlMatcher(link) {
    var res = renderUrlRegexp(link),
        matcher = res[0],
        parts = res[1];
    return function (url) {
      var values = _.rest(url.match(matcher)),
          ret = {};
      _.each(values, function (val, index) {
        ret[parts[index]] = val;
      });
      return _.size(ret) && ret || null;
    };
  }

  __exports__.renderUrlMatcher = renderUrlMatcher;
  function assocIn(struct, path, value) {
    var first = _.first(path),
        rest = _.rest(path);
    if (rest.length) {
      if (struct[first] == null) {
        struct[first] = {};
      }
      assocIn(struct[first], rest, value);
    } else {
      struct[first] = value;
    }
  }

  __exports__.assocIn = assocIn;
  function dissocIn(struct, path) {
    var first = _.first(path),
        rest = _.rest(path);
    if (rest.length) {
      if (struct[first] == null) {
        return;
      }
      dissocIn(struct[first], rest);
    } else {
      delete struct[first];
    }
  }

  __exports__.dissocIn = dissocIn;
  function getIn(_x, _x2) {
    var _again = true;

    _function: while (_again) {
      first = rest = undefined;
      _again = false;
      var struct = _x,
          path = _x2;

      var first = _.first(path),
          rest = _.rest(path);
      if (rest.length) {
        if (struct[first] == null) {
          return;
        }
        _x = struct[first];
        _x2 = rest;
        _again = true;
        continue _function;
      } else {
        return struct[first];
      }
    }
  }

  __exports__.getIn = getIn;
  function doRequest(url, method, headers, data, callback, onError) {
    method = method && method.toUpperCase() || "GET";
    headers = headers || {};
    headers.accept = headers.accept || "application/json";
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    var redirects = [];
    var req = request(method, url).on("redirect", function (res) {
      redirects.push(res.headers.location);
    }).set(headers);

    if (req.withCredentials) {
      req = req.withCredentials();
    }

    if (data) {
      if (method == "GET" || method == "HEAD" || method == "OPTIONS") {
        req.query(data);
      } else {
        //TODO allow FormData
        req.send(JSON.stringify(data));
      }
    }
    req.end(function (error, res) {
      if (error) {
        return onError(error);
      }
      res.redirects = redirects;
      if (res.ok) {
        callback(res);
      } else {
        onError(res);
      }
    });
    return req;
  };
  __exports__.doRequest = doRequest;
});;define("/ham", ["lodash", "./common", "exports"], function (__dependency1__, __dependency2__, __exports__) {
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
    baseURI: "",
    timeout: 5000,
    regexProfileURI: /.*;.*profile\=([A-Za-z0-9\-_\/\#]+).*/,
    rootLink: function rootLink(document) {
      return this.getLink(document, { rel: "root" });
    },
    splitURIptr: function splitURIptr(uri) {
      if (!uri) {
        return [];
      }var ptr = uri.split("#", 2)[1];
      if (!ptr) {
        return [];
      }return _.filter(ptr.split("/"));
    },
    setMeta: function setMeta(document, meta) {
      if (document instanceof MetaArray || document instanceof MetaObject) {
        document.setMeta(meta);
        return document;
      } else if (document instanceof Array) {
        var da = new MetaArray();
        da.push.apply(da, document);
        da.setMeta(meta);
        return da;
      } else if (document instanceof Object) {
        var da = new MetaObject(document);
        da.setMeta(meta);
        return da;
      } else if (document == null) {
        //TODO something with a false evaluation?
        var da = new MetaObject();
        da.setMeta(meta);
        return da;
      }
      console.log("Unrecognized", document);
    },
    getMeta: function getMeta(document) {
      return document.getMeta && document.getMeta() || {};
    },
    subObject: function subObject(document, ptr) {
      var parts = this.splitURIptr(ptr),
          docMeta = this.getMeta(document),
          subObject = getIn(document, parts);
      subObject = this.setMeta(subObject, {
        timestamp: docMeta.timestamp,
        action: docMeta.action,
        uri: docMeta.uri + ptr
      });

      /*
      if (false) {
        //TODO resolve sub schema
        var schema = this.schemas[profileURI]
        subObject.__meta.schema = schema
        subObject.__meta.schema_url = profileURI
      } */
      return subObject;
    },
    rootObject: function rootObject(document) {
      var link = this.rootLink(document);
      if (link) {
        var rootObject = this.subObject(document, link.href);
        this.setMeta(rootObject, { rel: "root" });
        return rootObject;
      } else {
        return document;
      }
    },
    getDocument: function getDocument(identifier, filters, params, data, callback, errorCallback) {
      var stream = this.openChannel(identifier, filters, params, data);
      if (callback) {
        return stream.then(callback, errorCallback);
      }return stream;
    },
    streamDocument: function streamDocument(identifier, filters, params, data, callback, errorCallback) {
      //TODO this will mean open a websocket
      var stream = this.openChannel(identifier, filters, params, data);
      if (callback) {
        return stream.then(callback, errorCallback);
      }return stream;
    },
    sendRequest: function sendRequest(data) {
      var _this2 = this;

      return new Promise(function (resolve, reject) {
        var useCache = false;
        if (data.method === "GET") {
          useCache = _this2.sendCache(data.url, data.payload);
        }
        if (!useCache) {
          _this2.callURI(data.url, data.method, data.payload).then(resolve, reject);
        } else {
          resolve(useCache);
        }
      });
    },
    openChannel: function openChannel(identifier, filters, params, data) {
      //lookup the endpoint and return a subscription to the result
      var self = this,
          link = this.getLink(identifier, filters),
          url = renderUrl(link, params),
          method = link.method && link.method.toUpperCase() || "GET";
      if (this.baseURI && url[0] === "/") {
        url = this.baseURI + url;
      }

      return this.sendRequest({
        url: url,
        payload: data,
        method: method
      });
    },
    registerSchema: function registerSchema(identifier, schema) {
      this.schemas[identifier] = schema;
    },
    getSchema: function getSchema(identifier) {
      return this.schemas[identifier];
    },
    getLink: function getLink(identifierOrDocument, filters) {
      var links = null;
      if (typeof identifierOrDocument === "string") {
        var schema = this.getSchema(identifierOrDocument);
        //TODO get link defs for schema through schema definition
        if (!schema) {
          console.log("failed to find schema:", identifierOrDocument, filters);
        } else {
          links = schema.links;
        }
      } else {
        //TODO get links from document by processing schema
        var schema = this.getMeta(identifierOrDocument).schema || {};
        links = _.merge([], schema.links, identifierOrDocument.links);
      }

      //case insensitive matching
      links = _.transform(links, function (result, link) {
        if (_.every(filters, function (value, key) {
          if (typeof value === "string") {
            return link[key].toLowerCase() == value.toLowerCase();
          }
          return link[key] == value;
        })) {
          result.push(link);
        }
      });
      if (_.size(links) > 1) {}
      return _.first(links);
    },
    getURI: function getURI(identifierOrDocument, filters, params) {
      return renderUrl(this.getLink(identifierOrDocument, filters), params);
    },
    parseResponse: function parseResponse(response) {
      if (response.error) {
        throw response.error;
      }

      //TODO there is no guarantee we will have a these headers.
      //Seperate out a less assuming parser
      var uri = response.headers.uri || response.headers.location || response.req.url,
          action = response.req.method;

      if (response.headers.length) {
        uri = response.headers[response.headers.length - 1];
        if (action !== "DELETE") {
          action = "GET";
        }
      }

      var document = response.body;
      document = this.setMeta(document, {
        timestamp: new Date().getTime(),
        uri: uri,
        action: action
      });

      if (response.profile) {
        //TODO if profile has not been seen, fetch it
        var schema = this.getSchema(response.profile);
        document.setMeta({
          schema: schema,
          schema_url: response.profile
        });
      }

      return document;
    },
    callURI: function callURI(url, method, data) {
      var self = this;
      return new Promise(function (resolve, reject) {
        doRequest(url, method, self.headers, data, function (response) {
          var document = self.parseResponse(response);
          self.publishDocument(document);
          resolve(document);
        }, reject);
      });
    },
    publishDocument: function publishDocument(document, success) {
      if (!success && !this.checkSuccess(document)) {
        return;
      }var meta = this.getMeta(document);
      this.updateCache(document);
      this.notifySubscribers(document);
    },
    checkSuccess: function checkSuccess(document) {
      return true;
    },
    notifySubscribers: function notifySubscribers(document) {
      return;
    },
    updateCache: function updateCache() {},
    sendCache: function sendCache(url, callback) {
      //no-op
      return false;
    },
    headers: {}
  };
  __exports__.HamProcessor = HamProcessor;
  var HamCacher = {
    cacheTime: 5 * 60 * 1000, //in milliseconds, 5 minute default
    resolveInstancesUrlFromDetailUrl: function resolveInstancesUrlFromDetailUrl(url) {
      var self = this,
          found_link = null,
          params = null;
      _.each(this.schemas, function (schema, ident) {
        if (found_link) return false;
        var full_link = self.getLink(schema, { rel: "full", method: "GET" }),
            instances_link = self.getLink(schema, { rel: "instances", method: "GET" });
        if (full_link && instances_link) {
          var matcher = renderUrlMatcher(full_link),
              matches = matcher(url);
          if (matches) {
            found_link = instances_link;
            params = matches;
            return false;
          }
        }
      });
      if (found_link) {
        return renderUrl(found_link, params);
      } else {
        return false;
      }
    },
    updateCache: function updateCache(document) {
      var meta = this.getMeta(document),
          url = meta.uri;
      //console.log("update cache on:", meta)
      if (meta.action === "DELETE") {
        dissocIn(this.objects, [url]);

        //remove the object from our instances cache
        var instancesUrl = this.resolveInstancesUrlFromDetailUrl(url),
            instancesDocument = this.objects[instancesUrl];
        if (instancesDocument) {
          var instances = this.rootObject(instancesDocument),
              detailLink = this.getLink(instancesDocument, { rel: "full", method: "GET" }),
              path = this.splitURIptr(this.getMeta(instances).uri);
          //if (!detailLink) return;
          instances = _.filter(instances, function (instance) {
            return renderUrl(detailLink, instance) != url;
          });

          if (_.size(path)) {
            assocIn(instancesDocument, path, instances);
          } else {
            instancesDocument = this.setMeta(instances, this.getMeta(instancesDocument));
          }
          this.publishDocument(instancesDocument, true);
        }
        //the result of a get or modification
      } else if (meta.action === "GET" || meta.action === "PATCH" || meta.action === "POST" || meta.action === "PUT") {
        this.objects[url] = document;

        //add the object to our instances cache
        var instancesUrl = this.resolveInstancesUrlFromDetailUrl(url),
            instancesDocument = this.objects[instancesUrl];
        if (instancesDocument) {
          var instances = this.rootObject(instancesDocument),
              detailLink = this.getLink(instancesDocument, { rel: "full", method: "GET" }),
              path = this.splitURIptr(this.getMeta(instances).uri),
              root = this.rootObject(document),
              newObject = true;
          instances = _.transform(instances, function (result, instance) {
            if (renderUrl(detailLink, instance) == url) {
              result.push(root);
              newObject = false;
            } else {
              result.push(instance);
            }
          });
          if (newObject) instances.push(root);
          if (_.size(path)) {
            assocIn(instancesDocument, path, instances);
          } else {
            instancesDocument = this.setMeta(instances, this.getMeta(instancesDocument));
          }
          this.publishDocument(instancesDocument, true);
        }
      }
    },
    sendCache: function sendCache(url, payload) {
      if (payload) {
        return false;
      }var cache = this.objects[url];
      if (cache) {
        var time_since = new Date().getTime() - this.getMeta(cache).timestamp;
        if (time_since < this.cacheTime) {
          return cache;
        }
      }
      return false;
    },
    populateSchemasFromUri: function populateSchemasFromUri(url) {
      var _this3 = this;

      return new Promise(function (resolve, reject) {
        var self = _this3;
        doRequest(url, "GET", _this3.headers, null, function (response) {
          var schemas = self.parseResponse(response);
          self.schema_sources[url] = schemas;

          schemas = _.transform(schemas, function (result, val, key) {
            if (typeof val == "object") {
              result[key] = val;
            }
          });

          _.each(schemas, function (schema, key) {
            self.registerSchema(key, schema);
            self.registerSchema(url + "#/" + key, schema);
          });
          resolve(schemas);
        });
      });
    }
  };
  __exports__.HamCacher = HamCacher;
  function Ham(props) {
    return _.extend({
      schemas: {},
      objects: {},
      recycle_bin: {},
      schema_sources: {} }, HamProcessor, HamCacher, props);
  };
  __exports__.Ham = Ham;
});define("ham", ["/ham"], function (ham) {
  return ham;
});

//TODO error, more then one link found

//no-op