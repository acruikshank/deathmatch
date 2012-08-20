deathmatch = window.deathmatch || {};
deathmatch.creature = (function() {
  var MASS = 100;
  var MIN_PART_MASS = .51;
  var MAX_OBLIQUE = 5;
  var DENSITY = .01;
  var TRAITS = ['tak','giv','obl','ext','ang','flx'];
	
  var ta = {};
  ta.project=  function(p,t) { return {x:t.a*p.x+t.c*p.y+t.e, y:t.b*p.x+t.d*p.y+t.f}; };
  ta.multiply=function(t2,t1){ return {a:t1.a*t2.a+t1.b*t2.c, c:t1.c*t2.a+t1.d*t2.c, 
                                       b:t1.a*t2.b+t1.b*t2.d, d:t1.c*t2.b+t1.d*t2.d, 
                                       e:t1.e*t2.a+t1.f*t2.c+t2.e, f:t1.e*t2.b+t1.f*t2.d+t2.f}; };
  ta.translate=function(x,y) { return {a:1,b:0,c:0,d:1,e:x,f:y}; };
  ta.rotate= function(theta) { return {a:Math.cos(theta), b:Math.sin(theta),
                                       c:-Math.sin(theta),d:Math.cos(theta),e:0,f:0}; }
  ta.scale=    function(x,y) { return {a:x,b:0,c:0,d:y,e:0,f:0}; }
  ta.ident=       function() { return {a:1,b:0,c:0,d:1,e:0,f:0}; }
  ta.clone=      function(t) { return {a:t.a,b:t.b,c:t.c,d:t.d,e:t.e,f:t.f}; }
  ta.inverse=    function(t) { var det=t.a*t.d-t.c*t.b; return {a:t.d/det, b:-t.b/det, c:-t.c/det,
                               d:t.a/det, e:(t.c*t.f-t.e*t.d)/det, f:(t.e*t.b-t.a*t.f)/det}; }
                               var ci=0;
  ta.apply=  function(ctx,t) { ctx.setTransform(t.a,t.b,t.c,t.d,t.e,t.f); }

  function T(transform) { this.t = transform || ta.ident(), public={}; }
  T.prototype = { 
    project:function(p) {return ta.project(p,this.t);},
    clone:function() { return new T(ta.clone(this.t)); },
    inverse:function() { return new T(ta.inverse(this.t)); },
    multiply:function(transform) { this.t = ta.multiply(this.t,transform.t); return this; },
    translate:function(x,y) { this.t = ta.multiply(this.t, ta.translate(x,y)); return this; },
    rotate:function(theta) { this.t = ta.multiply(this.t, ta.rotate(theta)); return this; },
    scale:function(x,y) { this.t = ta.multiply(this.t, ta.scale(x,y)); return this; },
    apply:function(ctx) { ta.apply(ctx,this.t); return this; }
  }


  function obliqueness( oblong ) {
    return Math.exp( Math.log(MAX_OBLIQUE) * (.5-oblong) );
  }

  function extension( ext, r, sides ) {
    var half_angle = Math.PI/sides, min = sides % 2 ? -r : -r*Math.cos(half_angle), max = r*Math.cos(half_angle);
    return min + (max - min)*ext;
  }

  function radius_for_mass( mass, sides ) {
    var angle = 2 * Math.PI / sides;
    return Math.sqrt( 2 * mass / (DENSITY * sides * Math.sin( angle ) ) );
  }

  function generate( genome, transform, leftFacing, PIXELS_PER_METER ) {
    var direction = leftFacing ? -1 : 1;
    transform.scale(1,-1);
    var creature = { type:0, mass:MASS, transform:new T(transform.t), genome:genome, joints:[], leftFacing:leftFacing };
    var generation = [ creature ];
    var next_generation;
    creature.transform.scale( PIXELS_PER_METER, PIXELS_PER_METER );

    while ( generation.length > 0 ) {
      next_generation = [];
      for ( var i=0,l=generation.length,part; part = generation[i], i<l; i++ ) {
        if ( ! part ) continue;

        var type = genome[part.type];
        var mass_to_give = part.mass - Math.max( part.mass * (1-type.giv), MIN_PART_MASS );

        var tak_groups = {}
        var total_take = 0;
        var child_masses = [];
        for ( var j=0,l2=type.chd.length; j<l2; chd_type=j++ ) {
          var child_type = genome[type.chd[j]];
          if ( child_type ) {
            total_take += child_type.tak;
            (tak_groups[child_type.tak] = tak_groups[child_type.tak] || []).push({index:j,tak:child_type.tak});
          }
        }
        var tak_group_list = []; for (var take in tak_groups) tak_group_list.push(tak_groups[take]);
        tak_group_list.sort(function(a,b) {return a[0].tak - b[0].tak;})
        var first_tak_group = 0;
        for (var k=0,tak_group; tak_group=tak_group_list[k]; k++) {
          var child_mass = mass_to_give * tak_group[0].tak / total_take;
          if ( child_mass >= MIN_PART_MASS ) {
            for (var j=0,tge; tge = tak_group[j]; j++) child_masses[tge.index] = child_mass;
            part.mass -= child_mass * tak_group.length;
          } else {
            total_take -= tak_group[0].tak * tak_group.length;
          }
        }

        part.r = radius_for_mass( part.mass, type.chd.length );

        var obl = obliqueness( type.obl );
        var ext = extension( type.ext, part.r, type.chd.length ) / obl;
        part.transform.rotate(direction * Math.PI*(2*type.ang-1));
        part.transform.translate( 0, ext );

        part.origin = part.transform.project({x:0,y:0});

        var half_angle = Math.PI / type.chd.length;
        var work_transform = part.transform.clone().scale(1/obl,obl);
        var point = work_transform.project({x:part.r,y:0}), 
            dx = point.x-part.origin.x, dy = point.y-part.origin.y;
        part.theta = Math.atan2(dy,dx);
        work_transform.rotate(Math.PI+half_angle);

        for ( var j=0,l2=type.chd.length; j<l2; chd_type=j++ ) {
          var index = leftFacing ? j : type.chd.length - j - 1;
          var child_type = genome[type.chd[index]];
          if ( child_type && child_masses[index] ) {

            point = work_transform.project({x:part.r/PIXELS_PER_METER,y:0}); 
            dx = point.x-part.origin.x; dy = point.y-part.origin.y;
            var child_transform = part.transform.clone().rotate(
              Math.atan2(dy,dx)-part.theta).translate(0,Math.sqrt(dx*dx+dy*dy));

            part.children = part.children || [];
            part.children[index] = {
                parent: part,
                index: index,
                type: type.chd[index],
                mass: child_masses[index],
                transform: child_transform };
          }
          work_transform.rotate(2 * half_angle);
        }

        part.oblong = obl;
        part.flex = type.flx;
        part.theta += Math.PI;
        part.sides = type.chd.length;
        part.transform.scale( obl, 1/obl );
        part.health = { integrity:1, instant_integrity:1, blows:{} };

        if ( part.children ) next_generation = next_generation.concat( part.children );
      }
      generation = next_generation;
    }

    return creature;
  }

  var TRAIT_SNP_PROBABILITY,
      SIDE_SNP_PROBABILITY,
      TRAIT_SHIFT_PROBABILITY,
      SIDE_SHIFT_PROBABILITY,
      SIDE_DUPLICATION_PROBABILITY,
      SIDE_DELETION_PROBILITY,
      CHROMOSOME_DUPLICATION_PROBABILITY,
      CHROMOSOME_DELETION_PROBABILITY;

  function coinFlip() { return Math.random() < .5; }
  function randIndex(ar) { return (Math.random() * ar.length)|0; }
  function randBetween(a,b) { return a + Math.random() * (b-a); }
  function normalRandom() { return Math.sqrt( -2 * Math.log(Math.random()||1) ) * Math.cos(2*Math.PI*(Math.random()||1)); }

  function cloneChromosome(c) { 
    var clone = {};
    for (var trait in c) 
      clone[trait] = (trait == 'chd' ? c.chd.slice(0) : c[trait]);
    return clone;
  }

  function randomCreature() {
    var creature = [];
    var chromosomes = Math.max( 1, Math.round(2 + normalRandom()) );
    for ( var i=0; i < chromosomes; i++ ) {
      var chromosome = {};
      for (var j=0,trait; trait=TRAITS[j]; j++)
        chromosome[trait] = Math.random();
      var children = Math.max( 3, Math.round(4 + normalRandom()) );
      chromosome.chd = [];
      for (var j=0; j<children; j++)
        chromosome.chd[j] = Math.max( 0, Math.round( 2 + normalRandom()*2 ) );
      creature.push(chromosome);
    }
    return creature;
  }

  /*
  recombine - take 2 genomes and generate a third offspring genome.
  Recombination should take genetic components from each parent such that any compnent
    has an equal but random chance of coming from either parent. For the most part,
    components should come whole from one parent or the other, though there could be
    some averaging at recombination boundaries. Recombination maintains heritability
    while generating offspring distributed over the genotypical space constrained by
    the total genetic variation in the population.
  SNP's are a mutation of a single genetic component in a random direction. SNP's introduce
    genetic variation into the population. Since SNP's aren't inherited from the prior 
    generation and aren't influenced by the fitness of the parent, they should be rare.
    The mutation rate will affect the rate of evolution and the ultimate fitness of the
    creatures.
  Transcription errors are shifts in meaning of genetic components (e.g. each component
    in a section of a parents chromosome will be interpreted as the component before it
    in the child). Errors also include duplications and deletions of whole chromosomes.
    Transcription errors should usually be fatal to the child, but they provide the
    potential to jump to different areas of morphological space. Duplications have the 
    potential to add non-functioning genetic material that may later evolve into 
    advantageous structures. Deletions have the potential to remove unnecessary genetic
    material that creates a more stable genetic population.

  Implementation
    For overlapping chromosomes, randomly choose a chromosome from a parent. Then choose
    two random trait indexes and copy each trait in-between the indexes from the other
    parent. For the traits at the indices, choose a random value between the parents using
    a parameterizable distribution that favors values close to one parent or the other.
    A transcription error might occur here that tries to copy the values one trait early
    or one trait late. A SNP might occur that selects a new value for one of the traits.
    Recombination of the side indices is similar to the traits. If one parent has more
    sides on a chromosome, they will be all kept or all deleted depeneding on the first
    coin flip. Any side index may be duplicated or deleted.
    The entire chormosome may be duplicated or deleted.
    A coin flip will determine whether non-overlapping chromosomes are preserved in the
    child. There will be no recombination for these chromosomes, but all the mutations
    will apply.
  */
  function recombine( parent1, parent2 ) {
    var child = [], 
        min = Math.min(parent1.length,parent2.length), 
        max = Math.max(parent1.length,parent2.length);
    for ( var i=0; i < min; i++ ) {
      var first = coinFlip();
      var cloner = cloneChromosome( first ? parent1[i] : parent2[i] );
      var donor = first ? parent2[i] : parent1[i];

      // traits
      var ti1 = randIndex(TRAITS), ti2 = randIndex(TRAITS),
          start = Math.min(ti1,ti2), end = Math.max(ti1,ti2);
      cloner[TRAITS[start]] = randBetween( cloner[TRAITS[start]], donor[TRAITS[start]] );
      for ( var j=start+1; j<end-1; j++ )
        cloner[TRAITS[j]] = donor[TRAITS[j]];
      cloner[TRAITS[end]] = randBetween( cloner[TRAITS[end]], donor[TRAITS[end]] );

      // child indices
      ti1 = randIndex(donor.chd); ti2 = randIndex(donor.chd);
      start = Math.min(ti1,ti2); end = Math.max(ti1,ti2);
      for ( var j=start; j<end; j++ )
        cloner.chd[j] = donor[j];

      child.push(cloner);
    }
    for ( i=min; i < max; i++ )
      child.push(parent1[i] || parent2[i]);

    return child;
  }

  return {
    generate: generate,
    randomCreature : randomCreature,
    recombine : recombine,
    T: T
  }
})()