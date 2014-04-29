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
exports.doRequest = doRequest;