Hypermedia Abtraction Mapper (HAM) provides client bindings to webservices that are annotated using JSON Hyper-Schema [http://json-schema.org/latest/json-schema-hypermedia.html]

Usage::

  //Hypermedia abstraction mapper
  client = Ham()

  //get a document, plain and simple
  client.getDocument('identifier', {filters}, {params}, {data})

  //get a channel that gets updates
  client.openChannel('identifier', {filters}, {params}, {data})

  //get the defined root of the document
  (Ham || client).root(document)
  (Ham || client).subDocument(document, ptr='#')

  //bind a callback to a channel, return false to close the channel
  Ham.bindCallback(chan, callback)

  //manually register a schemma
  client.registerSchema('identifier', {data})

  //retrieve a Link Description Object [LDO]
  client.getLink('identifier', {filters})

