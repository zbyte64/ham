Hypermedia Abtraction Mapper (HAM) provides client bindings to webservices that are annotated using JSON Hyper-Schema [http://json-schema.org/latest/json-schema-hypermedia.html]

Usage::

  var Ham = require("ham").Ham;

  //Construct our schema-json aware client
  var client = Ham()

  //helper function to load up schemas from a url
  client.populateSchemasFromUri('/api/v2/schemas/')

  //get a document
  client.getDocument('assets', {rel: 'instances'}, null, null, function(response) {
    console.log("got assets document:", response)
  })

  //create something new
  client.getDocument('assets', {rel: 'create'}, null, {title: "hello"}, function(response) {
    console.log("create asset response:", response)
  })


  //manually register a schemma
  client.registerSchema('assets', {schema info})

  //retrieve a Link Description Object [LDO]
  client.getLink('assets', {rel: 'update', method: 'patch'})

  //do a URL lookup
  client.getURI('assets', {rel: 'update', method: 'patch'}, {site_id: 1})


Ham also allows you to customize your client so that event streams (bacon.js) and channels (postal.js) can be used.

Postal.js Example::

  function makeClient(props) {
    props = props || {};
    props = _.extend({
      notifySubscribers: function(document) {
        //Put on postal.js channel
        var url = this.getMeta(document).uri;
        postal.publish({
          channel: "API",
          topic: url,
          data: document
        });
      },
      getURISubscription: function(url, callback) {
        //wrap postal.js subscription
        var self = this;

        function guardedCallback(val) {
          var ret = false;
          if (callback) ret = callback(val)
          if (ret !=== false) {
            var meta = self.getMeta(val)
            if (meta.action == "DELETE") {
              ret = false;
            }
          }
          if (ret === false) {
            subscription.unsubscribe()
          }
        }

        var subscription = postal.subscribe({
          channel: "API",
          topic: url,
          callback: guardedCallback
        })

        return guardedCallback
      }
    }, props);
    return Ham(props)
  }

