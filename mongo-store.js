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

  function loadSimulation(name, handler /* err, simulation, generation */ ) {
    var simulation, generation, complete = false;

    request({url:'/simulations/'+encodeURIComponent(name), 
      handler: function(o) { done( simulation = JSON.parse(o) ); },
      errorHandler: errorHandler('simulation') });
    request({url:'/latest-generation/'+encodeURIComponent(name), 
      handler: function(o) { done( generation = JSON.parse(o) ); }, 
      errorHandler: errorHandler("generation") });

    function done() { 
      if (simulation && generation) {
        simulation.index = generation.index;
        handler(null, simulation, generation);
        complete = true;
      }
    }
    function errorHandler(type) {
      return function(status) { 
        if ( ! complete )
          handler(type+" not found");
        complete = true;
      }
    }
  }

  function loadGeneration(name, generationIndex, handler /* err, simulation, generation */ ) {
    var simulation, generation, complete = false;

    request({url:'/simulations/'+encodeURIComponent(name), 
      handler: function(o) { done( simulation = JSON.parse(o) ); },
      errorHandler: errorHandler('simulation') });
    request({url:'/generations/'+createKey(name, generationIndex), 
      handler: function(o) { done( generation = JSON.parse(o) ); }, 
      errorHandler: errorHandler("generation") });

    function done() { 
      if (simulation && generation) {
        simulation.index = generation.index;
        handler(null, simulation, generation);
        complete = true;
      }
    }
    function errorHandler(type) {
      return function(status) { 
        if ( ! complete )
          handler(type+" not found");
        complete = true;
      }
    }
  }

  function createKey( simulationName, generationIndex ) {
    return encodeURIComponent(simulationName)+'-'+lpad(7,generationIndex)
  }

  function saveGeneration( simulation, generation ) {
    var key = createKey( simulation.name, simulation.index );
    generation.simulation = simulation.name;
    generation.index = simulation.index;
    request({
      method:'PUT',
      url:'/generations/'+key,
      headers: { 'Content-type':'application/json' },
      body: JSON.stringify(generation)
    })
  }

  function saveSimulation( simulation ) {
    var key = encodeURIComponent(simulation.name);
    request({
      method:'PUT',
      url:'/simulations/'+key,
      headers: { 'Content-type':'application/json' },
      body: JSON.stringify(simulation)
    })
  }

  return {
    loadSimulation : loadSimulation,
    loadGeneration : loadGeneration,
    saveSimulation : saveSimulation,
    saveGeneration : saveGeneration
  }
})();