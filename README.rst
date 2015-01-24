Hypermedia Abtraction Mapper (HAM) provides client bindings to webservices that are annotated using JSON Hyper-Schema [http://json-schema.org/latest/json-schema-hypermedia.html]

Usage::

  var Ham = require("ham").Ham;

  //Construct our schema-json aware client
  var client = Ham()

  //Register a schema with links
  client.registerSchema('site', {
    links: [
      {rel: 'instances', method:'GET', href:'/api/v2/sites/'},
      {rel: 'create', method:'POST', href:'/api/v2/sites/{site_id}/'},
      {rel: 'full', method:'GET', href:'/api/v2/sites/{site_id}/'},
      {rel: 'update', method:'PUT', href:'/api/v2/sites/{site_id}/'}
    ]
  });

  //Or use a helper function to load up schemas from a url
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

  //retrieve a Link Description Object [LDO]
  client.getLink('assets', {rel: 'update', method: 'patch'})

  //do a URL lookup
  client.getURI('assets', {rel: 'update', method: 'patch'}, {site_id: 1})
