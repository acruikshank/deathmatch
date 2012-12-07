wordevolve = (function() {
  var el;

  function gen(type,attributes) {
    var el = document.createElementNS("http://www.w3.org/2000/svg",type);
    if (attributes) for (var key in attributes) el.setAttribute(key,attributes[key]);
    return el;
  }

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

  function splinef( x1, y1, x2, y2 ) {
    var ax=3*x1-3*x2+1, bx=-6*x1+3*x2, cx=3*x1, a=3*y1-3*y2+1, b=-6*y1+3*y2, c=3*y1;
    return function(x) {
      var t=0,t2=0,dt=-x;
      while (Math.abs(dt) > .0001) { t-=dt;t2=t*t;dt=(x-t*cx-t2*bx-t2*t*ax) / (-3*t2*ax-2*t*bx-cx); }
      return a*t2*t + b*t2 + c*t; 
    };
  }

  var xEasing = yEasing = splinef(.2,.2,.8,.8);
  var Y_DISPLACEMENT = 150;
  var STEP_MS = 400;
  var GEN_SIZE = 10;
  var scrolling, animationKey;
  var bestChild, generation, generationIndex, target;
  var requestAnimationFrame = window.requestAnimationFrame 
    || window.webkitRequestAnimationFrame || mozRequestAnimationFrame || msRequestAnimationFrame;

  function randomLetter() {
    return String.fromCharCode(65+((26*Math.random())|0));
  }

  function randomWord(length) {
    for (var i=0, str=[]; i<length; i++) str.push(randomLetter());
    return str;
  }

  function score( word, target ) {
    return word.reduce(function(score,letter,i) { return score+(letter==target[i]?1:0)}, 0);
  }

  function best( generation, target ) {
    var winners = generation.reduce(function(best,next,i) {
      var nextScore = score(next,target);
      if (nextScore > best[1]) return [[i],nextScore]
      else if (nextScore == best[1]) return [best[0].concat([i]),best[1]];
      return best;
    }, [[],0] )
    return [winners[0][(winners[0].length*Math.random())|0], winners[1]]
  }

  function startSimulation() {
    target = el('target').value.toUpperCase().replace(/[^A-Z]/g,'');
    if (! target)
      return;
    var length = target.length;
    generation = [];
    for (var i=0; i < GEN_SIZE; i++)
      generation.push(randomWord(length));

    function getSections() {return el('solutions').getElementsByTagName('g')}
    for (var sections=getSections(),section;section=sections[0];sections=getSections()) 
      el('solutions').removeChild(section);
    renderGeneration(generation, target, -1, 1);

    bestChild = best(generation, target);
    addClass(el('starter'),'ready')
    removeClass( el('starter-thumb'), 'on')
    generationIndex = 1;
  }

  function nextGeneration( bestChild ) {
    var generation = [];
    for ( var i=0; i < GEN_SIZE; i++ ) {
      if ( Math.random() < .5 ) {
        var j = (Math.random() * bestChild.length)|0;        
        generation.push( bestChild.slice(0,j).concat([randomLetter()]).concat(bestChild.slice(j+1)) )
      } else {
        generation.push( bestChild );          
      }
    }
    return generation;
  }

  function groupLetters(word, target) {
    var grouping = [], group =[];
    var correct = false;
    for (var i=0,l=word.length; i<l; i++) {
      var match = word[i] == target[i];
      if ((match && !correct) || (correct && !match)) {
        correct = !correct;
        grouping.push(group);
        group = [];
      }
      group.push(word[i]);
    }
    grouping.push(group)
    return grouping;
  }

  function diagonal(x1,y1,x2,y2) {
    if ( y2 <= y1 ) return "M0,0Z";
    var m1 = y1+.25*(y2 - y1), m2 = y1+.75*(y2 - y1),
        theta = Math.atan2(x2-x1,y2-y1), r=1.5, yoff=r*Math.sin(theta), xoff=r*Math.cos(theta);
    return 'M'+x1+' '+y1
      +'C'+[x1+xoff,m2+yoff,x2+xoff,m1+yoff,x2,y2].join(' ')
      +'C'+[x2-xoff,m1-yoff,x1-xoff,m2-yoff,x1,y1].join(' ')
  }

  function startScrolling() {
    var length = target.length;
    yEasing = splinef(.2,.2,.8,.8);
    scrolling = true;
    (function scroll() {
      if (( ! scrolling ) || ( bestChild[1] >= length ))
        return step(function() { scrolling = false });
      step(scroll);
    })()      
  }

  function step(done) {
    var length = target.length;
    if ( bestChild[1] >= length ) {
      removeClass( el('starter'),'ready')
      return;
    }
    generation = nextGeneration( generation[bestChild[0]] );
    generationIndex++;
    var group = renderGeneration(generation, target, bestChild[0], generationIndex);

    animateGeneration(group, generation, bestChild[0], generationIndex, function() {
      if ( generationIndex >= 5 ) {
        var groups = el('solutions').getElementsByTagName('g');
        var group = groups[generationIndex-5];
        while (group.childNodes[0]) group.removeChild(group.childNodes[0]);
      }
      if (done) done();
    })
    bestChild = best(generation, target);      
  }

  function animateGeneration(group, generation, bestChildIndex, generationIndex, done) {
    var start = new Date().getTime();
    animationKey = new Object();
    var localKey = animationKey;
    requestAnimationFrame(function animate() { 
      var time = new Date().getTime();
      var fraction = (time-start) / STEP_MS;
      if ((localKey !== animationKey) || (fraction >= 1)) {
        moveGeneration(group, generation, bestChildIndex, 1, generationIndex)
        animationKey = null;
        if ( done ) done();
        return;
      }
      moveGeneration(group, generation, bestChildIndex, fraction, generationIndex)
      requestAnimationFrame(animate);
    });
  }

  function positionX(index) { return 80 + index*110; };

  function moveGeneration(group, generation, bestChildIndex, fraction, generationIndex) {
    var bestChildX = positionX( bestChildIndex )
    var bestChildY = 15 + 2*Y_DISPLACEMENT;
    var y = Y_DISPLACEMENT * yEasing(fraction)
    var paths = group.getElementsByTagName('path');
    var text = group.getElementsByClassName('solution');

    var label = group.getElementsByClassName('label')[0];
    label.setAttribute('opacity',fraction)
    label.setAttribute('y',bestChildY + y)

    for ( var i=0,l=generation.length; i < l; i++ ) {
      var x = positionX(bestChildIndex + 1 * (i-bestChildIndex));
      paths[i].setAttribute('d',diagonal(bestChildX,bestChildY+3, x, bestChildY + y-15))
      text[i].setAttribute('x', x);
      text[i].setAttribute('y', bestChildY + y);
      text[i].setAttribute('fill-opacity',fraction)
    }
    var groups = el('solutions').getElementsByTagName('g');
    for (var i=0; g = groups[i]; i++)
      g.setAttribute('transform','translate(0,'+((i+2-generationIndex)*Y_DISPLACEMENT - y)+')')
  }

  function renderGeneration(generation, target, bestChildIndex, generationIndex) {
    var y = 15 + 3 * Y_DISPLACEMENT;
    var container = gen('g',{x:0,y:0})
    for (var i=0,solution; solution = generation[i]; i++) {
      if ( bestChildIndex >= 0 ) {
        var path = gen('path',{})
        container.appendChild(path);
      }
      var genLabel = gen('text',{class:'label', x: 5, y:y, opacity:~bestChildIndex?0:1});
      genLabel.appendChild( document.createTextNode(String(generationIndex)) );
      container.appendChild(genLabel); 

      var position = bestChildIndex < 0 ? i : bestChildIndex;
      var text = gen('text',{class:'solution', x: positionX( position ), y:y});
      for (var j=0, grouping=groupLetters(solution,target), correct=false; group=grouping[j]; j++, correct=!correct) {
        var tspan = gen('tspan',{class:correct?'correct':'incorrect'});
        tspan.appendChild( document.createTextNode(group.join('')) )
        text.appendChild(tspan);
      }
      container.appendChild(text);
    }
    el('solutions').insertBefore(container, el('solutions-top'));
    return container;
  }

  function init() {
    var wordevolve = document.getElementById('wordevolve');
    el = function el(clss) { return wordevolve.getElementsByClassName(clss)[0]; }

    el('target').onkeypress = function(e) {
      if (e.keyCode == 13) {
        startSimulation()
        return false;
      }
      e.stopPropagation()
    }
    el('target').onkeyup = function(e) { e.stopPropagation() }

    var dragging = false, mouseStart, starterOn = false;
    el('starter').onmousedown = function(e) {
      dragging = true;
      starterOn = hasClass(el('starter-thumb'),'on');
      mouseStart = e.clientY - (starterOn ? 40 : 0);
    }
    el('starter').onmousemove = function(e) {
      if (!dragging) return;
      var diff = Math.max(0,Math.min(40,e.clientY - mouseStart));
      el('starter-thumb').style.backgroundColor = 'rgb(204,'+((204-102*diff/40)|0)+',102)';
      el('starter-thumb').style.top = diff + 'px';
    }
    el('starter').onmouseout = function(e) {
      if (( e.target != el('starter') && e.target != el('starter-thumb') ) 
          || ( e.relatedTarget != el('starter') && e.relatedTarget != el('starter-thumb') )) {
        return el('starter').onmouseup(e);
      }
    }
    el('starter').onmouseup = function(e) {
      if (!dragging) return;
      el('starter-thumb').style.top = '';
      el('starter-thumb').style.backgroundColor = '';
      dragging = false;

      if (! bestChild) return;

      if (starterOn) {
        scrolling = false;
        removeClass( el('starter-thumb'),'on')
      } else if (e.clientY - mouseStart < 20) {
        yEasing = splinef(.4,0,.6,1);
        step();
      } else {
        startScrolling();
        addClass(el('starter-thumb'),'on')
      }
    }
  }

  function hide() {
    animationKey = null;
    scrolling = false;
    removeClass( el('starter-thumb'),'on')
    el('target').blur();
  }

  function show() {
  }

  return {init:init, show:show, hide:hide};
})();
