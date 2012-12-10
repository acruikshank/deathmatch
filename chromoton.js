chromoton = (function() {
  var el;
  var PRIME_INC = 457;
  var NEIGHBOR_SEQUENCE = [[-1, -1], [1, 1], [1, -1], [-1, 1], [0, -1], [0, 1], [1, 0], [-1, 0]];
  var NUMBER_OF_GENES = 24;
  var MAX_MATES = 3;                        // maximum number of times a chromoton can breed
  var MUTATION_RATE = 0.002;                  // likelyhood that a mutation will occur
  var xDim = 80;                           // dimensions of arrays in x direction
  var yDim = 80;                           // dimensions of arrays in y direction

  var population = [];
  var populationNext = [];
  var targetRed = 17, targetGreen = 179,  targetBlue = 162;
  //var targetRed = 40, targetGreen = 40,  targetBlue = 40;
  var simulationInterval;

  function removeClass(el, clss) {
    var re = new RegExp("^"+clss+"$|^"+clss+"\\s+|\\s+"+clss+"$|\\s+"+clss+"(\\s+)");
    el.setAttribute( "class", (el.getAttribute('class')||'').replace(re,"$1") )
  }
  function addClass(el, clss) {
    removeClass(el,clss)
    el.setAttribute( 'class', (el.getAttribute('class') || '') + ' ' + clss )
  }
  function hasClass(el, clss) {
    return !!(el.getAttribute('class')||'').match(new RegExp("(\\s+|^)"+clss+"(\\s+|$)"));
  }

  function render(population) {
    var canvas = el('chromotons');
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width, canvas.height)
    for (var i=0; i<yDim; i++) {
      var row = population[i];
      for (var j=0; j<xDim; j++)  {
        var chromoton = row[j];
        ctx.fillStyle = 'rgb('+chromoton.red+','+chromoton.green+','+chromoton.blue+')'
        ctx.fillRect(j*6,i*6,5.9,5.9);
      }
    }
  }

  function startSimulation() {
    addClass( el('starter-thumb'), 'on' )
    clearInterval(simulationInterval);
    simulationInterval = setInterval(step,100);
  }

  function stopSimulation() {
    removeClass(el('starter-thumb'), 'on')
    clearInterval(simulationInterval);
  }

  function Chromoton(chromosome) {
    var pub = {chromosome:chromosome};

    // initialize parents
    pub.parentX = -1;
    pub.parentY = -1;
    
    // initialize red, green and blue
    pub.red = 0;
    pub.green = 0;
    pub.blue = 0;
    
    // set chromosome and determine color of chromoton
    for ( var i=0; i < NUMBER_OF_GENES; i++ )
    {
      // calculate ith low chromosome gene
      var gene = (chromosome[i] & 0x1F);
      var colorVal = gene >> 3;
      var multiplier = gene & 0x7;
      switch ( colorVal )
      {
        case 1:     // red
          pub.red += (1 << multiplier);
          break;
        case 2:     // green
          pub.green += (1 << multiplier);
          break;
        case 3:     // blue
          pub.blue += (1 << multiplier);
          break;
      }
    }
    if ( pub.red > 255 ) pub.red = 255;
    if ( pub.green > 255 ) pub.green = 255;
    if ( pub.blue > 255 ) pub.blue = 255;
    
    // determine deviance
    pub.deviance = Math.abs(pub.red - targetRed) + Math.abs(pub.green - targetGreen) + Math.abs(pub.blue - targetBlue);
    
    // reset times chromoton has bred
    pub.breedTimes = 0;

    return pub;
  }

  function step() {
    var size = xDim * yDim;             // dimensions of array
    var index = 0;                      // index of current chromoton
    var subIndex = 0;                   // index moded into range of array
    var deviance = 1<<30;               // deviance of current mate
    var x = 0;                          // x position of current chromoton
    var y = 0;                          // y position of current chromoton
    var lowX = 0;                       // x position of best mate for chromoton
    var lowY = 0;                       // y position of best mate for chromoton
    var testX = 0;                      // index of potential mate
    var testY = 0;                      // index of potential mate
    var current;                        // current chrmoton
    var mate;                           // mate chromoton
    var child;                          // child of current and mate or clone of current
    var child;                          // child in next generation
    var tmpPopulation;                  // temporary population used to swap populations
    var sequenceIndex = 0;              // which direction to begin mate search

    // perform a semi-random traversal of population
    index = (( Math.random() * size )|0);
    for ( var i=0; i < size; i++ ) {
      subIndex = index % size;
      y = (subIndex / xDim)|0;
      x = subIndex % xDim;
      
      current = population[y][x];
      deviance = 1<<30;
      lowX = -1;
      lowY = -1;

      // loop through potential mates
      for ( var k=0; k < 8; k++ )
      {
        testX = x + NEIGHBOR_SEQUENCE[ ( k + sequenceIndex ) & 0x7 ][0];
        testY = y + NEIGHBOR_SEQUENCE[ ( k + sequenceIndex ) & 0x7 ][1];

        if (( testY >= 0 ) && ( testY < yDim ) && ( testX >= 0 ) && ( testX < xDim )) {
          mate = population[testY][testX];
          
          // if mate's deviance is too high, don't bother
          if (( mate.deviance < deviance ) && ( mate.breedTimes <= MAX_MATES )) {
            // make sure chromotons aren't siblings
            if ((( current.parentX != testX ) || ( current.parentY != testY ))
                && (( current.parentX != mate.parentX ) || ( current.parentY != mate.parentY ))) {
              // this ones an ok mate
              lowX = testX;
              lowY = testY;
              deviance = mate.deviance;
            }
          }
        }
      }

      // if mate found, breed into next generation, else clone
      if (( lowX >= 0 ) && ( lowY >= 0 )) {            
        mate = population[lowY][lowX];
        child = breed(current, mate);
        child.parentX = lowX;
        child.parentY = lowY;
        mate.breedTimes = (mate.breedTimes||0)+1;
      } else {
        child = Chromoton(current.chromosome);
        child.parentX = x;
        child.parentY = y;
      }
      populationNext[y][x] = child;
      
      // increment index
      index += PRIME_INC;
      
      // increment sequenceIndex
      sequenceIndex++;

    }
    
    // population mate complate swap populations
    tmpPopulation = population;
    population = populationNext;
    populationNext = tmpPopulation;

    render(population);
  }

  function breed( mother, father ) {
    var chromosome = [];                // new gene
    var mutationBit = 0;                // which bit should be mutated
    
    // create new chromosome
    for ( var i = 0; i < NUMBER_OF_GENES; i++ ) {
      var mask = (256 * Math.random()) | 0;
      chromosome[i] = ( mother.chromosome[i] & mask ) | ( father.chromosome[i] & ~mask );
    }
        
    // determine if a mutation should occur
    if ( Math.random() < MUTATION_RATE ) {
      i = (Math.random() * NUMBER_OF_GENES) | 0;
      
      // mutate a single bit
      chromosome[i] ^= 1 << ((Math.random()*7)|0);
    }
      
    // re-initialize chomoton as offspring
    return Chromoton(chromosome)
  }

  function init() {
    var chromoton = document.getElementById('chromoton');
    el = function el(clss) { return chromoton.getElementsByClassName(clss)[0]; }
    el('target-color').onclick = function() {
      targetRed = (Math.random() * 256)|0;
      targetGreen = (Math.random() * 256)|0;
      targetBlue = (Math.random() * 256)|0;
      el('target-color').style.backgroundColor = 'rgb('+targetRed+','+targetGreen+','+targetBlue+')'
    }

    el('target-color').style.backgroundColor = 'rgb('+targetRed+','+targetGreen+','+targetBlue+')'
    el('starter-thumb').onclick = function() {
      var thumb = el('starter-thumb');
      if ( hasClass(thumb,'on') )
        stopSimulation();
      else
        startSimulation();
    }

    // initialize defaultChromosome
    var defaultChromosome = [13,11,21,19,29,27];
    for ( var i=defaultChromosome.length; i < NUMBER_OF_GENES; i++ ) defaultChromosome[i] = 0;

    // create arrays of default chrmotons
    for ( var i=0; i < yDim; i++ ) {
      // allocate row
      population[i] = [];
      populationNext[i] = [];

      for ( var j=0; j < xDim; j++ ) {
        population[i][j] = Chromoton(defaultChromosome);
        
        // set parent to self (so there won't be imbreeding problems in first step)
        population[i][j].parentX = j;
        population[i][j].parentY = i;
      }
    }
//    render(population)
  }

  return {init:init, show:function() {}, hide:stopSimulation}
})()