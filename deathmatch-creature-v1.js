/*
  Glossary:
    organism: An organism is a genome plus information about genome's performance and
            lineage. Organism's will compete in matches througout a generation and then
            be bred to produce the next generation.
    genome: An organism's genetic material. The genome is the basic plan for a creature. 
            It persists for an entire generation, then parts of it are passed on to the
            organism's children.
    creature: The body of an organism. A creature will be generated from the organism's 
            genome for each match. The creature contains the geometry and physics of the
            organism as well as damage received during the course of a match. A creature
            may be said to be the genome's phenotype.
    generation: A generation is a set of organisms. These organisms will compete in
            matches to determine relative fitness. This information will then be used to
            breed a new generation of organisms.
    species: Species create a partition of organisms that span generations. Organisms may
            only breed within species. Also organisms within a species should not fight
            matches against each other. Species may sub-divide to produce new species.
            Species span generations.
 */
deathmatch = window.deathmatch || {};
deathmatch.creature = (function() {
  var MASS = 100;
  var MIN_PART_MASS = .51;
  var MAX_OBLIQUE = 5;
  var DENSITY = .01;
  var TRAITS = ['tak','giv','obl','ext','ang','flx'];
	
  var DEFAULT_RATES = { 
    MUTATION_NEARNESS : .04,  // smaller number means smaller chance of big mutations
    GENERAL_MUTATION_RATE : .2,
    TRAIT_SNP : 1,
    CHILD_SNP : .5,
    TRAIT_SHIFT : .1,
    CHILD_SHIFT : .2,
    CHILD_DUPLICATION : .05,
    CHILD_DELETION : .05,
    CHROMOSOME_DUPLICATION : .4,
    CHROMOSOME_DELETION : .45
  }

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
    var depth=0;
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
        part.depth = depth;

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
      depth++;
    }

    return creature;
  }

  function bounds( part, genome, dimensions ) {
    var s = deathmatch.contest.PIXELS_PER_METER;


    genome = genome || part.genome;
    var type = genome[part.type], sides = type.chd.length, half_angle = Math.PI / sides;

    var t = new T();
    t.scale( 1/s, 1/s );
    t.translate( part.origin.x, part.origin.y );
    t.rotate( part.theta );
    t.scale( part.oblong, 1 / part.oblong );

    var p = t.project({x:0, y:0});
    dimensions = dimensions || {x:p.x, y:p.y, width:0, height:0};

    for (var i=0; i < sides; i++) {
      var p = t.project( {x:0, y:part.r * s})
      if ( p.x < dimensions.x ) {
        dimensions.width += dimensions.x - p.x;
        dimensions.x = p.x;
      }
      if ( p.y < dimensions.y ) {
        dimensions.height += dimensions.y - p.y;
        dimensions.y = p.y;
      }
      if ( dimensions.x + dimensions.width < p.x )
        dimensions.width = p.x - dimensions.x;
      if ( dimensions.y + dimensions.height < p.y )
        dimensions.height = p.y - dimensions.y;
      t.rotate( 2*half_angle );
    }

    if (part.children) {
      for ( var i=0,c=part.children,l=c.length,child; child=c[i], i<l; i++ ) {
        if (child) bounds( child, genome, dimensions );
      }
    }
    return dimensions;
  }

  function parts( part ) {
    var count = 1;
    if (part.children)
      for ( var i=0,c=part.children,l=c.length,child; child=c[i], i<l; i++ )
        if (child) count += parts( child );
    return count;
  }

  function newSpecies( members, rates ) {
    var species = { id: randId(), parent: null };
    var adam = randomOrganism( species ), eve = randomOrganism( species );
    var organisms = [];
    for (var i=0; i<members; i++)
      organisms.push( breedOrganisms(adam, eve, rates) );
    return organisms;
  }

  function randomOrganism( species ) {
    return { species:species, genome:blockyGenome(), generation:0 };
  }

  function breedOrganisms( organism1, organism2, rates, stats ) {
    if ( organism1.species.id != organism2.species.id )
      throw new Error( "attempt to breed organisms of different species" );
    return { 
      species:organism1.species, 
      genome:recombine( organism1.genome, organism2.genome, rates, stats ), 
      generation: Math.max(organism1.generation, organism2.generation) + 1
    }
  }

  function randomGenome() {
    var genome = [];
    var chromosomes = Math.max( 1, Math.round(1 + normalRandom()/2) );
    for ( var i=0; i < chromosomes; i++ ) {
      var chromosome = {};
      for (var j=0,trait; trait=TRAITS[j]; j++)
        chromosome[trait] = Math.random();
      var children = Math.max( 3, Math.round(4 + normalRandom()) );
      chromosome.chd = [];
      for (var j=0; j<children; j++)
        chromosome.chd[j] = Math.max( 0, Math.round( 2 + normalRandom()*2 ) );
      genome.push(chromosome);
    }
    return genome;
  }

  function blockyGenome() {
    var genome = [], chromosomes = 1;
    for ( var i=0; i < chromosomes; i++ ) {
      var chromosome = {};
      for (var j=0,trait; trait=TRAITS[j]; j++)
        chromosome[trait] = trait == 'giv' ? 0 : .5;
      chromosome.chd = [];
      for (var j=0; j< 3; j++)
        chromosome.chd[j] = 0;
      genome.push(chromosome);
    }
    return genome;
  }

  function coinFlip() { return Math.random() < .5; }
  function randInt() { return (2*Math.random()-1)*(1<<32); }
  function randId() { var id=[],c='abcdefghijklmnopqrstuvwxyz0123456789A'.split(''); 
                      for (var i=0;i<15; i++) id.push(randItem(c)); return id.join('') }
  function randIndex(ar) { return (Math.random() * ar.length)|0; }
  function randItem(ar) { return ar[randIndex(ar)]; }
  function sigmoidDist(slope) { var x=Math.random(); return x < .5 ? Math.pow(2*x,slope)/2 : 1 - Math.pow(2*(1-x),slope)/2; }
  function randBetween(a,b,slope) { return a + sigmoidDist(slope) * (b-a); }
  function normalRandom() { return Math.sqrt( -2 * Math.log(Math.random()||1) ) * Math.cos(2*Math.PI*(Math.random()||1)); }

  /*
   We want a function y = f(X,d) s.t. 0 <= X,y < 1. s.t.:
   - X is a uniformly distributed number between 0 and 1.
   - abs(y1-d) < abs(y2-d) => P(y1) > P(y2)
   - integral(f(x,d),0,1) = 1 for every x
   - P(y) st. abs(y-x) ~= 1 is small but not vanishing (i.e. not exponentially decreasing).
   Start with c/(c+(-d+x)^2), where d is the current value, and c is constant that determines
   how likely the next value is to be near ther current value.
   Integrate: integral c/(c+(-d+x)^2) dx = -sqrt(c) atan((d-x)/sqrt(c))+constant
   Normalize: N = 1 / [-sqrt(c) * ( atan((d-1)/sqrt(c)) - atan(d/sqrt(c)) )]
   So our normalized function is N * c/(c+(-d+x)^2).
   -N * sc * ( atan((d-x)/sc) - atan(d/sc) )
   A * ( atan((d-x)/B) - C), where B = sqrt(c), C = atan(d/B), N=-1/(B*(atan((d-1)/B) - C)),  A = -N*B
   inv = d - B*tan((A*C + x) / A)
   */
  function randomMutation( currentValue, nearness ) {
    var B = Math.sqrt(nearness), C = Math.atan(currentValue/B), 
        N=-1/(B*(Math.atan((currentValue-1)/B) - C)), A = -N*B;
    return currentValue - B * Math.tan( (A * C + Math.random()) / A);
  }

  function cloneChromosome(c) { 
    var clone = {};
    for (var trait in c) 
      clone[trait] = (trait == 'chd' ? c.chd.slice(0) : c[trait]);
    return clone;
  }

  /*
  recombine - take 2 genomes and generate a third offspring genome.
  Recombination should take genetic components from each parent such that any compnent
    has an equal but random chance of coming from either parent. For the most part,
    components should come whole from one parent or the other, though there could be
    some averaging at transcription boundaries. Recombination maintains heritability
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
    child. There will be no recombination for these chromosomes, but SNPs, duplications
    and deletions will apply.
  */
  function statAdd( stats, property, n ) { 
    if (!stats) return; 
    stats[property] = (stats[property]||0)+n; 
    stats['is_'+property] = true;
  }
  function setStatFlags( stats ) { 
    if (!stats) return; 
    for (var key in stats) if (key.match(/^is_/) && stats[key]) {
      var has = 'has_'+key.substring(3);
      stats[has] = (stats[has] || 0) + stats[key]; 
      delete stats[key];
    }
  }
  function recombine( parent1, parent2, rates, stats ) {
    function eventOccurance(type) { return Math.random() < rates[type] * rates.GENERAL_MUTATION_RATE; }
    function mutate( chromosome ) {
      if ( eventOccurance('TRAIT_SNP') ) {
        chromosome[randItem(TRAITS)] = randomMutation(chromosome[randItem(TRAITS)], rates.MUTATION_NEARNESS);
        statAdd(stats,'trait_snp',1);
      }

      if ( eventOccurance('CHILD_SNP') ) {
        var index = randIndex(chromosome.chd);
        chromosome.chd[index] = Math.max(0, chromosome.chd[index] + (coinFlip() ? 1 : -1));
        statAdd(stats,'child_snp',1);
      }

      if ( eventOccurance('CHILD_DUPLICATION') ) {
        var index = randIndex(chromosome.chd);
        chromosome.chd.splice(index,0,chromosome.chd[index]);
        statAdd(stats,'child_dup',1);
      }

      if ( chromosome.chd.length > 3 && eventOccurance('CHILD_DELETION') ) {
        var index = randIndex(chromosome.chd);
        chromosome.chd.splice(index,1);
        statAdd(stats,'child_dup',1);
      }

      return chromosome;
    }

    stats = stats || {};
    rates = rates || DEFAULT_RATES;
    statAdd(stats, 'recombinations', 1);
    var child = [], 
        min = Math.min(parent1.length,parent2.length), 
        max = Math.max(parent1.length,parent2.length);
    for ( var i=0; i < min; i++ ) {
      var first = coinFlip();
      var cloner = cloneChromosome( first ? parent1[i] : parent2[i] );
      var donor = first ? parent2[i] : parent1[i];
      statAdd(stats, first?'clone1':'clone2', 1);

      // traits
      var ti1 = randIndex(TRAITS), ti2 = randIndex(TRAITS),
          start = Math.min(ti1,ti2), end = Math.max(ti1,ti2);
      statAdd(stats, 'recombined_traits', TRAITS.length);

      // handle traitshift mutation
      var donorShift = 0;
      if ( eventOccurance('TRAIT_SHIFT') ) {
        donorShift = coinFlip() ? 1 : -1;
        statAdd(stats,'trait_shifts',1);
      }

      // copy donor traits
      for ( var j=start; j<=end; j++ ) {
        if (j+donorShift >= 0 && j+donorShift < TRAITS.length) {
          cloner[TRAITS[j]] = donor[TRAITS[donorShift+j]];
          statAdd(stats, 'donor_traits', 1)
        }
      }        

      // child indices
      ti1 = randIndex(donor.chd); ti2 = randIndex(donor.chd);
      start = Math.min(ti1,ti2); 
      end = Math.max(ti1,ti2);
      statAdd(stats,'children',cloner.chd.length);

      // handle child shift mutations
      donorShift = 0;
      if ( eventOccurance('CHILD_SHIFT') ) {
        donorShift = coinFlip() ? 1 : -1;
        statAdd(stats, 'child_shift', 1);
      }

      // copy over donor children (sides)
      for ( var j=start; j<=end; j++ ) {
        if (j+donorShift >= 0 && j+donorShift < donor.chd.length) {
          cloner.chd[j] = donor.chd[j+donorShift];
          statAdd(stats, 'donor_children', 1);
        }
      }

      // apply additional mutations to chromosome and clone
      child.push( mutate(cloner) );
    }

    if ( coinFlip() ) {
      for ( i=min; i < max; i++ ) {
        child.push( mutate( parent1[i] || parent2[i] ) );
        statAdd( stats, parent1[i] ? 'clone1' : 'clone2', 1);
      }
    }

    // apply chromosome duplication mutation
    if ( eventOccurance('CHROMOSOME_DUPLICATION') ) {
      var index = randIndex(child);
      child.splice(index,0,child[index]);
      statAdd(stats,'chromosome_dup',1);
    }

    // apply chromosome deletion mutation
    if ( child.length > 1 && eventOccurance('CHROMOSOME_DELETION') ) {
      var index = randIndex(child);
      child.splice(index,1);
      statAdd(stats,'chromosome_del',1);
    }

    setStatFlags(stats);
    return child;
  }

  return {
    DEFAULT_RATES : DEFAULT_RATES,
    newSpecies: newSpecies,
    generate: generate,
    bounds: bounds,
    parts: parts,
    randomGenome : randomGenome,
    breedOrganisms : breedOrganisms,
    recombine : recombine,
    T: T
  }
})()