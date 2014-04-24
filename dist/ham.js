"use strict";
var _ = require("lodash")["default"] || require("lodash");
var request = require("superagent")["default"] || require("superagent");
var async = require("async")["default"] || require("async");

//Holds things I should find libraries for

var MetaArray = function() {
  var arr = []
  arr.push.apply(arr, arguments)
  arr.__proto__ = MetaArray.prototype
  return arr;
};
exports.MetaArray = MetaArray;
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
exports.MetaObject = MetaObject;
MetaObject.prototype = new Object;

MetaObject.prototype.setMeta = function(meta) {
  this.__meta = _.extend(this.__meta || {}, meta)
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
        if (f(task) === false) {
          self.close()
        }
        callback()
      }, 1)
      self.queue.push(self._backlog)
      self._backlog = null
    },
    close: function() {
      if(!self.closed) {
        self.queue.kill()
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

exports.Channel = Channel;var urlTemplatePattern = /\{([^\{\}]*)\}/g;
exports.urlTemplatePattern = urlTemplatePattern;
function renderUrl(link, params) {
  var url = link.href;
  _.each(params, function(val, key) {
    url = url.replace("{"+key+"}", val, "g")
  })
  return url;
}

exports.renderUrl = renderUrl;function renderUrlRegexp(link) {
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

exports.renderUrlRegexp = renderUrlRegexp;function renderUrlMatcher(link) {
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

exports.renderUrlMatcher = renderUrlMatcher;function assocIn(struct, path, value) {
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

exports.assocIn = assocIn;function dissocIn(struct, path) {
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

exports.dissocIn = dissocIn;function getIn(struct, path) {
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

exports.getIn = getIn;function doRequest(url, method, headers, data, callback) {
  method = method && method.toUpperCase() || "GET"
  headers = headers || {}
  headers.accept = headers.accept || 'application/json'
  headers['Content-Type'] = headers['Content-Type'] || 'application/json'
  var redirects = []
  var req = request(method, url).on('redirect', function(res) {
    redirects.push(res.headers.location)
  }).withCredentials().set(headers)

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
exports.doRequest = doRequest;;"use strict";
var _ = require("lodash")["default"] || require("lodash");
var Channel = require("./common").Channel;
var renderUrl = require("./common").renderUrl;
var MetaArray = require("./common").MetaArray;
var MetaObject = require("./common").MetaObject;
var renderUrlMatcher = require("./common").renderUrlMatcher;
var assocIn = require("./common").assocIn;
var dissocIn = require("./common").dissocIn;
var getIn = require("./common").getIn;
var doRequest = require("./common").doRequest;


var HamProcessor = {
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
  subscribeURI: function(url, method, data, chan) {
    var self = this,
        useCache = false,
        subId = _.uniqueId();

    function subscribe() {
      //can i get a lock? or a real pub sub...
      assocIn(self.channels, [url, subId], chan)
      chan.onClose = function() {
        dissocIn(self.channels, [url, subId])
      }
    }

    function subscribeAndSend(response) {
      chan.send(response)
      //subscribe to the result
      url = self.getMeta(response).uri || url
      subscribe()
    }

    if (method == "GET") {
      useCache = this.sendCache(url, chan)
    }
    if (useCache) {
      subscribe()
    } else {
      this.callURI(url, method, data, subscribeAndSend)
    }

  },
  parseResponse: function(response) {
    console.log('parsing response:', response)
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
        console.log("setting cache", url, document)
        this.objects[url] = document

        //add the object to our instances cache
        var instancesUrl = this.resolveInstancesUrlFromDetailUrl(url),
            instancesDocument = this.objects[instancesUrl];
        console.log("check instances:", instancesUrl, instancesDocument)
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
    sendCache: function(url, chan) {
      var cache = this.objects[url];
      if (cache) {
        chan.send(cache)
        var time_since = (new Date().getTime()) - this.getMeta(cache).timestamp;
        if (time_since < this.cacheTime) {
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

        schemas = _.transform(schemas, function(result, val, key) {
          if(typeof val == "object") {
            result[key] = val
          }
        });

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

exports.Ham = Ham;