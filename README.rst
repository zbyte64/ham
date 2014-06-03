Hypermedia Abtraction Mapper (HAM) provides client bindings to webservices that are annotated using JSON Hyper-Schema [http://json-schema.org/latest/json-schema-hypermedia.html]

Usage::

  var Ham = require("ham").Ham;

  //Construct our schema-json aware client
  var client = Ham()

  //helper function to load up schemas from a url
  client.populateSchemasFromUri('/api/v2/schemas/')

  //get a document
  client.getDocument('assets', {rel: 'instances'}, null, null).then(function(response) {
    console.log("got assets document:", response)
  })

  //create something new
  client.getDocument('assets', {rel: 'create'}, null, {title: "hello"}).then(function(response) {
    console.log("create asset response:", response)
  }, function(error) {
    console.log("there was an error:", error);
  });


  //manually register a schemma
  client.registerSchema('assets', {schema info})

  //retrieve a Link Description Object [LDO]
  client.getLink('assets', {rel: 'update', method: 'patch'})

  //do a URL lookup
  client.getURI('assets', {rel: 'update', method: 'patch'}, {site_id: 1})

