import _ from 'lodash';
import request from 'superagent';
import async from 'async';

//Holds things I should find libraries for

export var MetaArray = function() {
  var arr = []
  arr.push.apply(arr, arguments)
  arr.__proto__ = MetaArray.prototype
  return arr;
};

MetaArray.prototype = new Array;

MetaArray.prototype.setMeta = function(meta) {
  this.__meta = _.extend({} || this.__meta, meta)
};

MetaArray.prototype.getMeta = function() {
  return this.__meta || {}
};

export var MetaObject = function() {
  var obj = _.extend({}, arguments[0] || {})
  obj.__proto__ = MetaObject.prototype
  return obj;
};

MetaObject.prototype = new Object;

MetaObject.prototype.setMeta = function(meta) {
  this.__meta = _.extend({} || this.__meta, meta)
};

MetaObject.prototype.getMeta = function() {
  return this.__meta || {}
};

export function Channel() {
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

export var urlTemplatePattern = /\{([^\{\}]*)\}/g;

export function renderUrl(link, params) {
  var url = link.href;
  _.each(params, function(val, key) {
    url = url.replace("{"+key+"}", val, "g")
  })
  return url;
}

export function renderUrlRegexp(link) {
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

export function renderUrlMatcher(link) {
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

export function assocIn(struct, path, value) {
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

export function dissocIn(struct, path) {
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

export function getIn(struct, path) {
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

function innerRequest(url, method, headers, data, callback) {
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

export function doRequest(url, method, headers, data, callback) {
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
