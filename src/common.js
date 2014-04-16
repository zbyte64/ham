import _ from 'lodash';
import reqwest from 'reqwest';

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

function async(func) {
  var args = [func, 1];
  args.push.apply(args, _.toArray(arguments).slice(1))
  window.setTimeout.apply(window, args)
}

export function Channel(props) {
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

export var urlTemplatePattern = /\{([^\{\}]*)\}/;

export function renderUrl(link, params) {
  var url = link.href;
  _.each(params, function(val, key) {
    url = url.replace("{"+key+"}", val, "g")
  })
  return url;
}

export function renderUrlMatcher(link) {
  var matchS = link.href,
      parts = matchS.match(urlTemplatePattern);
  _.each(parts, function(val) {
    matchS.replace("{"+val+"}", "(?P<"+val+">[\w\d]+)")
  })
  return new RegExp(matchS);
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

export function doRequest(url, method, headers, data, callback) {
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
