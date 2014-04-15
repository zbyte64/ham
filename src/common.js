import {_} from 'lodash';
//TODO which library do I use?
import {xhr} from 'xhr-browserify';
//Things I should find libraries for


function async(func) {
  var args = [func, 1]
  args.push.apply(args, _.toArray(arguments).slice(1))
  setTimeout.apply(args)
}

export function Channel(props) {
  return _.extend({}, {
    _queue: [],
    send: function(data) {
      if (!this.callback) {
        this._queue.push(data)
        return;
      }
      async(this.doSend, data)
    },
    doSend: function(data) {
      var response = this.callback(data);
      if (response === false) {
        this.close()
      }
      return response
    },
    doQueue: function() {
      _.each(this._queue, this.send)
      this._queue = null;
    },
    bind: function(callback) {
      this.callback = callback
      async(this.doQueue)
    },
    close: function() {
      if(!this.closed) {
        this._queue = null;
        this.closed = true;
        this.onClose()
      }
    },
    onClose: function() {}
  }, props)
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
      parts = urlTemplatePattern.match(matchS);
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

export function doRequest(url, method, data, callback) {
  var request = new xhr();
  request.open(method, url, function(err, data) {
    callback(data)
  });
};
