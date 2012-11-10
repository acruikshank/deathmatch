var express = require('express');
var mongodb = require('mongodb');
var app = express();

app.configure(function() {
  app.use(express.errorHandler({ showStack: true, dumpExceptions: true }));
  app.use(express.bodyParser());
  app.use(express.static(__dirname));
});

// DB Setup
var connection;
var db;

function guard(onError, onSuccess) {
  return function(error, data) {
    if(error) return onError(error);
    onSuccess(data);
  }
};

function connect(onConnect) {
  if (!connection)
    connection = new mongodb.Db('deathmatch', new mongodb.Server("127.0.0.1",27017, { auto_reconnect : true }), {safe:false});

  if (db) return onConnect(null,db);

  connection.open(function(error, db_) {
    db = db_;
    onConnect(null,db);
  });
};

function collection(collectionName) {
  return function(onLoad) {
    connect(function(error, db) {
      if(error) return onLoad(error);
      db.collection(collectionName, onLoad);
    });
  };
};

function save(collection, message, onSaved) {
  return collection(guard(onSaved,save));
  function save(collection) {
    collection.save(message, onSaved);
  }
};

function stream(collection, criteria, onEach, onDone) {
  var cursor;
  return collection(guard(onEach,withCollection));

  function withCollection(collection) {
    cursor = collection.find(criteria);
    cursor.nextObject(next);
  }
  function next(error, message) {
    if(!error && !message) return onDone ? onDone() : null;
    onEach(error, message);
    cursor.nextObject(next);
  }
}

function find(collection, criteria, cb) {
  return collection(guard(cb,withCollection));
  function withCollection(collection) { collection.find(criteria, guard(cb,withCursor)) }
  function withCursor(c) { c.each(cb) }
}

var simulations = collection('simulations');
var generations = collection('generations');

connect(function() {
  simulations(function(err,collection) {
    collection.ensureIndex('key')
  })
  generations(function(err,collection) {
    collection.ensureIndex('key');
    collection.ensureIndex('simulation');
    collection.ensureIndex('generation');
  })
})

app.get('/', function(request, response, next) {
  response.send({ok:true});
});

app.get('/simulations/:key', function( request, response, next ) {
  return find(simulations, {key:request.params.key}, withResult);
  function withResult(err, simulation) {
    if (err) return next(err);
    if (!simulation) return response.send(404)
    return response.send(simulation);
  }
})

app.put('/simulations/:key', function( request, response, next ) {
  request.body.key = request.params.key;
  return save(simulations, request.body, onSave);
  function onSave(err) {
    if (err) return next(err);
    return response.send(201);
  }
})

app.get('/latest-generation/:simulation', function( request, response, next ) {
  generations(function(err,collection) {
    collection.aggregate([{$match:{simulation:request.params.key}},{$sort:{generation:-1}},{$limit:1}], function(err,g) { 
      if (g && g.length)
        response.send(g[0]); 
      else
        response.send(404)
    });
  })
})

app.get('/generations/:key', function( request, response, next ) {
  return find(generations, {key:request.params.key}, withResult);
  function withResult(err, generations) {
    if (err) return next(err);
    return response.send(result);
  }
})

app.put('/generations/:key', function( request, response, next ) {
  request.body.key = request.params.key;
  return save(generations, request.body, onSave);
  function onSave(err) {
    if (err) return next(err);
    return response.send(201);
  }
})

app.listen('9024')
console.log("listening on 9024")