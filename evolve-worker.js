importScripts('Box2dWeb-2_1_a_3.js', 'deathmatch-creature-v1.js', 'deathmatch-v1.js');

var POPULATION_DEFAULTS = {
  POPULATION_SIZE : 128,
  SPECIES_SIZE : 22
}
var REPLAY_QUEUE_SIZE = 10;

var match, pairs, runInterval, roundSize, population, roundIndex, matchIndex;
var matchTimeout, simulation, generation, round, simulationName;
var state = 'PRE_TOURNAMENT';
var replayQueue = [];

onmessage = function(e) {
  ({
    start: initializeTournament,
    replay: nextReplay,
    population: sendPopulation,
  }[e.data.type] || function() {}).apply(this, e.data.args || [])
}

function initializeTournament(_simulation) {
  simulation = _simulation

  population = [];
  while ( population.length < simulation.POPULATION_SIZE ) {
    var size = Math.min(simulation.SPECIES_SIZE, simulation.POPULATION_SIZE-population.length)
    population = population.concat( deathmatch.creature.newSpecies( size, simulation ) );
  }
  for ( var i=0, organism; organism = population[i]; i++ )
    organism.index = i;
  startTournament();
}

function startTournament() {
  generation = {population:population, rounds:[]}
  round = [];

  // initialize stats
  for ( var i=0, l=population.length; i<l; i++ ) {
    population[i].wins = 0;
    population[i].score = 0;
  }

  shuffle( population );
  roundSize = simulation.POPULATION_SIZE/2;
  pairs = deathmatch.contest.pairOpponents( population, roundSize );

  nextMatch();
}

function nextGeneration() {
  population = deathmatch.contest.nextGeneration(generation, simulation);
  simulation.index++;
  startTournament();
}

function nextRound() {
  round = [];

  if ( roundSize < 2 ) {
    if ( simulationName && simulationName.length )
      deathmatch.store.saveGeneration( simulation, generation)

    return nextGeneration();
  }

  roundSize /= 2;

  population.sort( deathmatch.contest.compareOpponents );
  pairs = deathmatch.contest.pairOpponents( population, roundSize );

  roundIndex++;
  matchIndex = 0;

  nextMatch();
}

function nextMatch() {
  var pair = pairs.splice(0,1)[0];
  match = deathmatch.contest.startMatch( pair[0], pair[1] );
  if ( match.result ) // immediate disqualification
    return matchComplete();

  state = 'IN_MATCH';
  play();
}

function play() {
  if ( state == 'IN_MATCH' ) {
    runInterval = setInterval(function(){
      updateMatch();
    }, 2 );
  } else if ( state == 'PRE_ROUND' ) {
    nextRound();
  } else if ( state == 'PRE_MATCH' ) {
    nextMatch();
  }
}

function updateMatch() {
  if ( ! deathmatch.contest.updateMatch( match, simulation ) ) {
    clearInterval(runInterval);
    runInterval = null;
    return matchComplete();
  }
}

function matchComplete() {
  round.push( deathmatch.contest.matchSummary(match) );
  queueReplay({
    score: 200 - match.leftStats.health - match.rightStats.health,
    left: match.leftOrganism,
    right: match.rightOrganism,
    floorSlope: match.floorSlope
  })

  if ( ! pairs.length ) {
    generation.rounds.push(round);
    state = 'PRE_ROUND';
    return nextRound()
  }

  matchIndex++;
  state = 'PRE_MATCH';
  nextMatch()
}

function queueReplay(replay) {
  if (replayQueue.length < REPLAY_QUEUE_SIZE) {
    replayQueue.push(replay)
    replayQueue.sort(replaySort);
  } else if (replay.score > replayQueue[0].score) {
    replay[0] = replay;
    replayQueue.sort(replaySort);
  }
}

function nextReplay() {
  var replay = replayQueue.length ? replayQueue.pop() : null;
  postMessage({type:'replay', args:[replay]})
}

function sendPopulation() {
  postMessage({type:'population', args:[population]});
}

function replaySort(a,b) { return a.score - b.score; }

function simulationHandler( err, sim, gen ) {
  if ( err ) {
    initializeTournament()
    return
  }

  simulation = sim;
  generation = gen;
  population = generation.population;
  nextGeneration();
}

function extend() {
  var o = {};
  for (var i=0,l=arguments.length; i<l; i++)
    for ( var key in arguments[i] )
      o[key] = arguments[i][key];
  return o;
}

function shuffle(ar) {
  for (var i=0, l=ar.length,t,dx; i<l; i++) { dx=(Math.random()*l)|0; t=ar[dx]; ar[dx]=ar[i]; ar[i]=t; }
}
