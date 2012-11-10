deathmatch = (window.deathmatch || {});
deathmatch.store = (function() {
  function lpad(n,d) { return String(Math.pow(10,n) + d).substring(1); }

  /* url (string*), body (string), handler (string->), errorHandler (number->), headers ({:string}) */
  function request( options ) {
    var xhr =  window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if ( xhr.readyState < 4 ) return;
      if ((!xhr.status && (location.protocol == "file:")) || (xhr.status >= 200 && xhr.status < 300) 
          || xhr.status == 304 || xhr.status == 1223) {
        if (options.handler) options.handler(xhr.responseText, xhr);
      } else if (options.errorHandler) options.errorHandler(xhr.status)
    };
    xhr.open(options.method || 'GET', options.url, true );
    if (options.headers) for (var k in options.headers) xhr.setRequestHeader(k, options.headers[k]);
    if (("POST" === options.method) && (( ! options.headers ) || ( ! options.headers['Content-Type'] )))
      xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
    xhr.send( options.body || null );
  }

  function parseCFG( parser, text ) {
    var state = parser.rules[parser.initial_state], lines = text.split(/\r?\n/), ctx={};
    if ( parser.initialize ) parser.initialize(ctx);
    for (var i=0,line; line=lines[i], i<lines.length; i++)
      if (match = line.match(state[0]))
        for (var j=0; j<match.length; j++)
          if (match[j] != null && state[1][j]) {
            state = parser.rules[ state[1][j](match, ctx) ]
            break;
          }
    return ctx;
  }

  var multipartJSONParser = {
    initial_state: 'PREAMBLE',
    initialize: function(ctx) { ctx.content = []; },
    rules: {
      PREAMBLE : [ /^--(.*[^-].|.*[^-])$/, {
        1:function(m, ctx) { ctx.boundary = m[1]; return 'HEADERS'; }}],
      HEADERS : [ /(^$)|^Content-type:\s*(.*?)(;.*)?$/i, {
        1:function(m, ctx) { ctx.chunk = []; return 'CONTENT'; },
        2:function(m, ctx) { 
          if (m[2] == 'multipart/mixed') return 'PREAMBLE';
          ctx.skip = (m[2] != 'application/json'); return 'HEADERS'; }}],
      CONTENT : [ /^--(.*?)--?$|^--(.*)$|^(.*)$/, {
        1:function(m, ctx) {
          if ( m[1] != ctx.boundary ) { ctx.chunk.push(m[0]); return 'CONTENT' }
          if (!ctx.skip) ctx.content.push(JSON.parse(ctx.chunk.join('\n')));
          return 'PREAMBLE'; },
        2:function(m, ctx) {
          if (!ctx.skip && ctx.chunk.length) 
            ctx.content.push(JSON.parse(ctx.chunk.join('\n')));
          ctx.boundary = m[2];
          return 'HEADERS'; },
        3:function(m, ctx) {ctx.chunk.push(m[0]); return 'CONTENT'; }}]
    }
  }

  function multipart_json(body) {
    return parseCFG( multipartJSONParser, body ).content;
  }

  function MapJob( mapper, handler ) {
    var map = [], requestCount = 0;

    function addRequest( url ) {
      requestCount++;
      request({url:url, handler: function(o,xhr) { response(null,o,xhr) }, errorHandler:function(err) { response(err) } });
    }

    function response( err, value, xhr ) {
      if (err) console.log('ERROR', err)
      else map.push( mapper( JSON.parse(value), xhr ) );
      requestCount--;
      if ( requestCount == 0 )
        return handler( map );
    }

    return { request:addRequest };
  }

  function mapReduce( keysUrl, mapper, handler ) {
    request({url:keysUrl, handler: function(o) { 
      var job = MapJob( mapper, handler ), keys = JSON.parse(o).keys;
      for ( var i=0, key; key = keys[i]; i++ )
        job.request('/buckets/generations/keys/' + key);
    }, errorHandler: function(err) { console.log(err); } });
  }

  function loadSimulation(name, handler /* err, simulation, generation */ ) {
    var simulation, generation, complete = false;
    function done() { 
      if (simulation && generation)
        handler(null, simulation, generation);
      complete = true;
    }
    function errorHandler(type) {
      return function(o) { 
        console.log("ERROR", o);
        if ( ! complete )
          handler(type+" not found");
        complete = true;
      }
    }

    request({url:'/buckets/simulations/keys/'+encodeURIComponent(name), 
      handler: function(o) { done( simulation = JSON.parse(o) ); },
      errorHandler: errorHandler('simulation') });
    request({url:'/buckets/simulations/keys/'+encodeURIComponent(name)+'/_,latest,_/', 
      handler: function(o) { done( generation = multipart_json(o)[0] ); }, 
      errorHandler: errorHandler("generation") });
  }

  function saveSimulation( simulation, generation ) {
    var key = encodeURIComponent(simulation.name)+'-'+lpad(7,simulation.index);
    request({
      method:'PUT',
      url:'/buckets/generations/keys/'+key,
      headers: {
        'Content-type':'application/json',
        'x-riak-index-simulation_bin':simulation.name,
        'x-riak-index-generation_int':simulation.index
      },
      body: JSON.stringify(generation)
    });
    request({
      method:'PUT',
      url:'/buckets/simulations/keys/'+encodeURIComponent(simulation.name),
      headers: {
        'Content-type':'application/json',
        Link: '</buckets/generations/keys/'+key+'>; riaktag="latest"'
      },
      body: JSON.stringify(simulation)
    })
  }

  return {
    loadSimulation : loadSimulation,
    saveSimulation : saveSimulation,
    mapReduce      : mapReduce
  }
})();