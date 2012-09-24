deathmatch = (window.deathmatch || {});
deathmatch.contest = (function() {
  /* TODO:
     Separate out physics related function (including damage) into deathmatch-physics
     */

  var PIXELS_PER_METER = .01;

  var DAMAGE_FACTOR = 25;
  var JUNK_DAMAGE_FACTOR = 10;
  var MINIMUM_MOTION = .02;
  var TKO_ITERATIONS = 100;
  var BOTH_IMMOBILE_ITERATIONS = 50;
  var WIN_BONUS = 200;
  var KO_BONUS = 25;
  var MAXIMUM_PARTS = 50;
  var DRAW_ITERATIONS = 500;

  var MAX_FLEX_TORQUE = .5, MIN_FLEX_TORQUE = 100;
  var MAX_DRIVER_SPEED = 10, MIN_DRIVER_SPEED = .5;
  var MAX_DRIVER_TORQUE = 1000, MIN_DRIVER_TORQUE = 100000000;
  var ANGULAR_DAMPING = 4;

  var CAGE_WIDTH = 800, CAGE_MARGIN = 10;
  var CAGE_BOTTOM = 500, DROP_HEIGHT = 200, LEFT_DROP_X = 200, RIGHT_DROP_X = CAGE_WIDTH - LEFT_DROP_X;
  var cageParameters =  {
    CAGE_WIDTH : CAGE_WIDTH,
    CAGE_MARGIN : CAGE_MARGIN,
    CAGE_BOTTOM : CAGE_BOTTOM
  };

  var ROUND_PRIZES = { 1:8, 2:4, 4:2, 8:1 };

  var fixture_index = 10;

  var b2Vec2 = Box2D.Common.Math.b2Vec2
    , dyn = Box2D.Dynamics, shapes = Box2D.Collision.Shapes, joints = dyn.Joints
    , b2BodyDef = dyn.b2BodyDef
    , b2Body = dyn.b2Body
    , b2FixtureDef = dyn.b2FixtureDef
    , b2Fixture = dyn.b2Fixture
    , b2FilterData = dyn.b2FilterData
    , b2World = dyn.b2World
    , b2MassData = shapes.b2MassData
    , b2PolygonShape = shapes.b2PolygonShape
    , b2CircleShape = shapes.b2CircleShape
    , b2RevoluteJointDef = joints.b2RevoluteJointDef
    , b2WeldJointDef = joints.b2WeldJointDef

  var FIXTURE_DEF = new b2FixtureDef;
  FIXTURE_DEF.density = 1.0;
  FIXTURE_DEF.friction = 0.5;
  FIXTURE_DEF.restitution = 0.2;

  var CAGE_FIXTURE_DEF = new b2FixtureDef;
  CAGE_FIXTURE_DEF.density = .5;
  CAGE_FIXTURE_DEF.friction = 1;
  CAGE_FIXTURE_DEF.restitution = 0.2;

  var CAGE_BODY_DEF = new b2BodyDef;
  CAGE_BODY_DEF.angularDamping = 4;

  var MIN_ORGANISM_BREED_WEIGHT = 50;

  var sideCageIntercept, centerCageIntercept;

  function boundedExponential( x, min, max ) { return min * Math.exp( Math.log(max / min) * x ); }
  function blowDamage( damage, part ) { return (part.junk?JUNK_DAMAGE_FACTOR:DAMAGE_FACTOR) * (damage||0) / part.mass; }

  function closestPoint( vec, points ) {
    var min = 0, min_dist = Math.abs(vec.x-points[0].x) + Math.abs(vec.y-points[0].y), dist;
    for ( var i=1, point; point = points[i]; i++ ) {
      dist = Math.abs(vec.x-point.x) + Math.abs(vec.y-point.y);
      if (dist < min_dist) min = i, min_dist = dist;
    }
    return min;
  }

  function abs_dot( v1, v2 ) { return Math.abs(v1.x * v2.x + v1.y * v2.y); }

  function eachChild( part, f, arg1, arg2 ) {
    if (part.children) 
      for ( var i=0,child,l=part.children.length; child = part.children[i], i<l; i++ )
        if (child) f( child, arg1, arg2 );
  }

  function sumChild( part, f, arg1, arg2 ) {
    var sum = 0;
    if (part.children) 
      for ( var i=0,child,l=part.children.length; child = part.children[i], i<l; i++ )
        if (child) sum += f( child, arg1, arg2 );
    return sum;
  }

  /*
    The breeding algorithm needs to strike a balance between inter and intra species competition.
    If species are allocated an equal number of slots, an individual of a poorly performing species
    need only score slightly higher than the rest of its species to ensure reproductive success.
    If tournament success is the only determinant of reproductive success, poor performing species
    will go extinct more often than this simulation can afford. This algorithm mixes the two.
    For each match, if match has winner, breed it X times each with a different randomly chosen member
    of the same species. X is the prize set per round.
    Allocate (remaining slots / number of species) slots to each species so that exactly remiaining
    slots are taken, but the slots allocated to any two species differs by no more than 1.
    For each species, take the highest scoring organism and breed it ceil(species slots/2) times
    with diferent randomly selected members of the same species, repeat the procedure with the second
    highest scoring organism and so on until the slots are filled.
    The number of members of a species going into the next generation cannot exceed half the population
    size. The first section can just cut the prizes when the species is about to go over the limit. The
    second algorithm is more complicated. Entering the second stage, so long as the remaining slots 
    are > the number of species, there can be at most one species that would exceed the half population
    limit by receiving an equal share of remaining slots. So to fix this problem, start by finding this
    species (if it exists) giving it exactly as many slots as it can have, then removing it from the
    pool. From there the equal distribution algorithm shouldn't cause a problem.
   */
  function randIndex(ar) { return (Math.random() * ar.length)|0; }
  function randItem(ar) { return ar[randIndex(ar)]; }
  function mapInc(m,k) { m[k] = (m[k]||0) + 1; }
  function mapAdd(m,k,n) { m[k] = (m[k]||0) + n; }
  function Chooser( objects ) {
    var choices=[], weights=[0], totalWeight=0, chooser={};
    var add = chooser.add = function( obj, weight ) {
      choices.push(obj);
      weights.push( totalWeight += weight );
      return chooser;
    }
    chooser.choose = function() {
      if ( choices.length == 0 ) return null;
      var choice = Math.random() * totalWeight, start=0, end=weights.length-1, next;
      while ( end > start + 1 ) {
        next=start+Math.floor((end - start)/2);
        choice >= weights[next] ? start = next : end = next;
      }
      return choices[start];
    }
    if ( objects ) for (var key in objects) add( key, objects[key] );
    return chooser;
  }
  function breedRandomly( organism, speciesChooser ) {
    var mate = speciesChooser.choose();
    while ( mate === organism )
      mate = speciesChooser.choose();
    return deathmatch.creature.breedOrganisms( organism, mate );
  }
  function nextSpeciesGeneration( species, slots, speciesChooser ) {
    var speciesNext = [], harem = Math.ceil(slots / 2);
    species.sort( compareOpponents );

    for ( var i=0,a; (a = species[i]) && speciesNext.length < slots; i++ ) {
      for (var j=1; j <= harem && speciesNext.length < slots; j++ ) {
        speciesNext.push( breedRandomly(a,speciesChooser) );
      }
      harem = Math.ceil(harem/2);
    } 
    return speciesNext;
  }
  function nextGeneration( generationSummary ) {
    var bySpecies = {}, byIndex=[], speciesCount={}, next=[], winner, speciesLimit = generationSummary.population.length/2;
    var speciesChoosers = {};
    for ( var i=0,organism; organism=generationSummary.population[i]; i++) {
      var id = organism.species.id;
      (bySpecies[id] = bySpecies[id] || []).push(organism);
      speciesChoosers[id] = speciesChoosers[id] || Chooser();
      speciesChoosers[id].add( organism, Math.max(organism.score, MIN_ORGANISM_BREED_WEIGHT) );
      byIndex[organism.index] = organism;
    }

    // award slots for winning matches
    for (var i=generationSummary.rounds.length-1,round; round = generationSummary.rounds[i]; i--) {
      var prize = ROUND_PRIZES[round.length];
      if ( prize ) for (var j=0,match; match = round[j]; j++) {
        winner = ( match.left.winner && byIndex[match.left.index] )
                 || ( match.right.winner && byIndex[match.right.index] );
        if (winner) for (var k=0; k<prize && (speciesCount[winner.species.id]||0) < speciesLimit; k++) {
          next.push( breedRandomly( winner, speciesChoosers[winner.species.id] ) );
          mapInc( speciesCount, winner.species.id );
        }
      }
    }

    // find species with most slots and number of species
    var numberOfSpecies=0, biggestSpecies, remainingSlots = generationSummary.population.length - next.length;
    for ( var id in bySpecies ) {
      numberOfSpecies++;
      if ( speciesCount[id] && ( ! biggestSpecies || speciesCount[biggestSpecies] < speciesCount[id] ) )
        biggestSpecies = id;
    }

    // avoid adding too many slots for biggest species and remove it from the next calculation
    if ( biggestSpecies && speciesCount[biggestSpecies] ) {
      var slots = Math.min(speciesLimit - speciesCount[biggestSpecies], Math.ceil(remainingSlots/numberOfSpecies) );
      next = next.concat( nextSpeciesGeneration(bySpecies[biggestSpecies], slots, speciesChoosers[biggestSpecies]) )
      numberOfSpecies--;
      remainingSlots -= slots;
      mapAdd(speciesCount, biggestSpecies, slots);
      delete bySpecies[biggestSpecies];
    }

    // allocate slots roughly evenly to the rest of species.
    for ( var id in bySpecies ) {
      slots = Math.ceil(remainingSlots / numberOfSpecies);
      next = next.concat( nextSpeciesGeneration(bySpecies[id], slots, speciesChoosers[id]) )
      numberOfSpecies--;
      remainingSlots -= slots;
      mapAdd( speciesCount, id, slots);
    }
    console.log( speciesCount );

    // assign an index to each organism
    for (var i=0; i < next.length; i++) next[i].index = i;

    return next;
  }

  /*
    pairOpponents( population, matchCount ) - create a list of pairs for competition
    - Assume matchCount does not exceed half the population size.
    - Assume number of organisms with the same species parent cannot exceed half the population size.
    - Assume if scores are available, the organisms are sorted. Otherwise, they are shuffled.
    - Constraint: No organism with the same species parent may be paired.
    - Constraint: No organism may be paired more than once.
    - 2*matchCount organisms are moved into the opponent list starting from the begining of the population.
    -   We keep a count for each species parent encountered. 
    -   If the count is = matchCount any organisms with that species parent will be skipped.
    - The first pair is created from the first organism in opponent list and the last compatible organism.
    -   These are removed from the opponent list.
    -   This process is repeated until all the organisms are matched.
   */
  function parentSpeciesId( organism ) { return (organism.species.parent || organism.species).id }
  function siblingSpecies( org1, org2 ) {  return parentSpeciesId(org1) == parentSpeciesId(org2); }
  function lastCompatibleIndex( org, participants ) {
    for (var i=participants.length-1, organism; organism=participants[i]; i--)
      if ( ! siblingSpecies(org,organism) ) return i;
    return -1;
  }
  function pairOpponents( population, matchCount ) {
    var speciesCount = {}, participants = [], pairs = [];
    for (var i=0,organism; participants.length < 2*matchCount && (organism=population[i]); i++) {
      if ( (speciesCount[parentSpeciesId(organism)]||0) + 1 <= matchCount ) {
        participants.push(organism);
        speciesCount[parentSpeciesId(organism)] = (speciesCount[parentSpeciesId(organism)]||0) + 1;
      }
    }

    while ( participants.length > 0 ) {
      var pair = participants.splice(0,1), other = lastCompatibleIndex(pair[0],participants);

      if ( ~other ) {
        pair.push( participants.splice(other,1)[0] );
      } else {
        // The last two are of sibling species. There must be at least one other
        // match where neither of the participants are related to this one.
        for ( var i=pairs.length-1, otherPair; otherPair = pairs[i]; i-- ) {
          if ( ! siblingSpecies(pair[0],otherPair[0]) && ! siblingSpecies(pair[0],otherPair[1]) ) {
            pair = otherPair.splice(1,1,pair[0]);
            pair.push( participants.splice(0,1)[0] );
            break;
          }
        }
      }
      pairs.push(pair);
    }

    return pairs;
  }

  /*
   used as a sorting function to rank organsims after a round of matches
   */
  function compareOpponents( opponent1, opponent2 ) {
    return opponent2.score - opponent1.score;
  }

  function startMatch( leftOrganism, rightOrganism ) {
    var match = { leftOrganism:leftOrganism, rightOrganism:rightOrganism, junk:{} };
    var s = PIXELS_PER_METER;
    match.world = new b2World( new b2Vec2(0, 10),  false );
    match.floorSlope = (.5  + Math.random()) / 10;

    generateCage(match);

    var transform = new deathmatch.creature.T().translate( LEFT_DROP_X*s, (CAGE_BOTTOM - DROP_HEIGHT)*s );
    match.leftCreature = deathmatch.creature.generate( leftOrganism.genome, transform, true, s );
    addPhysics( match.leftCreature, 1, match.world );

    transform = new deathmatch.creature.T().translate( RIGHT_DROP_X*s, (CAGE_BOTTOM - DROP_HEIGHT)*s );
    match.rightCreature  = deathmatch.creature.generate( rightOrganism.genome, transform, false, s );
    addPhysics( match.rightCreature, 2, match.world );

    match.leftStats = {
      health:assessDamage(match.leftCreature),
      lastPosition:{x:match.leftCreature.origin.x, y:match.leftCreature.origin.y},
      immobileIterations:0
    }

    match.rightStats = {
      health:assessDamage(match.rightCreature),
      lastPosition:{x:match.rightCreature.origin.x, y:match.rightCreature.origin.y},
      immobileIterations:0
    }

    match.iterations = 0;

    addContactListeners( match.world );

    var leftParts = deathmatch.creature.parts(match.leftCreature);
    var rightParts = deathmatch.creature.parts(match.rightCreature);
    if ( leftParts > MAXIMUM_PARTS ) {
      if ( rightParts > MAXIMUM_PARTS ) {
        match.result = 'DOUBLE PARTS DQ';
      } else {
        match.rightCreature.wins++;
        match.result = 'RIGHT BY PARTS DQ';
      }
    } else if ( rightParts > MAXIMUM_PARTS ) {
      match.leftCreature.wins++;
      match.result = 'LEFT BY PARTS DQ';      
    }

    return match;
  }

  function updateMatch( match ) {
    match.world.Step( 1 / 60 /* frame-rate */,  10 /* velocity iterations*/,  1 /* position iterations */);

    updateCreature( match.leftCreature, match, match.leftStats );
    updateCreature( match.rightCreature, match, match.rightStats );
    updateJunk( match );

    match.world.ClearForces();

    match.iterations++;

    return assessMatch(match);
  }

  function assessMatch( match ) {
    if ( match.rightStats.health <= 0.0 )
      return updateMatchStats(match, "LEFT KO", true, false );

    if ( match.leftStats.health <= 0.0 )
      return updateMatchStats(match, "RIGHT KO", false, true );

    if ( match.rightStats.immobileIterations >= TKO_ITERATIONS )
      return updateMatchStats(match, "LEFT TKO", true, false );

    if ( match.leftStats.immobileIterations >= TKO_ITERATIONS )
      return updateMatchStats(match, "RIGHT TKO", false, true );

    if ( match.leftStats.immobileIterations >= BOTH_IMMOBILE_ITERATIONS 
       && match.rightStats.immobileIterations >= BOTH_IMMOBILE_ITERATIONS )
      return updateMatchStats(match, "BOTH IMMOBILE", false, false );

    if ( match.iterations >= DRAW_ITERATIONS ) {
      var leftScore = score(match.leftStats,match.rightStats, false);
      var rightScore = score(match.rightStats,match.leftStats, false);

      if ( leftScore - rightScore > .00001 )
        return updateMatchStats(match, "LEFT ON POINTS", true, false );

      if ( rightScore - leftScore > .00001 )
        return updateMatchStats(match, "RIGHT ON POINTS", false, true );

      return updateMatchStats(match, "DRAW", false, false );
    }
    return true;    
  }

  function matchSummary(match) {
    return {
      floorSlope: match.floorSlope,
      result: match.result,
      iterations: match.iterations,
      left: { 
        index: match.leftOrganism.index,
        winner: match.leftStats.winner,
        health: match.leftStats.health
      },
      right: {
        index: match.rightOrganism.index,
        winner: match.rightStats.winner,
        health: match.rightStats.health
      }
    }
  }

  function updateMatchStats( match, status, leftWinner, rightWinner ) {
    match.result = status;
    if (leftWinner) {
      match.leftOrganism.wins++;
      match.leftOrganism.score += WIN_BONUS;
      match.leftStats.winner = true;
    }
    if (rightWinner) {
      match.rightOrganism.wins++;
      match.rightOrganism.score += WIN_BONUS;
      match.rightStats.winner = true;      
    }
    return updateScores(match);
  }

  function updateScores(match) {
    match.leftOrganism.score += score(match.leftStats,match.rightStats, false);
    match.rightOrganism.score += score(match.rightStats,match.leftStats, false);
    return false;
  }

  function score(organismStats, opponentStats, ko) {
    var score = Math.max(100 - opponentStats.health, 0);
    if (ko) score += KO_BONUS;
    return score;
  }

  function generateCage( match ) {
    var bottom  = statbox( match.world, 0, CAGE_BOTTOM-3*CAGE_MARGIN, CAGE_WIDTH/2 + CAGE_MARGIN, 2*CAGE_MARGIN);
    bottom.SetAngle( match.floorSlope );
    var bottom  = statbox( match.world, CAGE_WIDTH/2-CAGE_MARGIN, CAGE_BOTTOM-3*CAGE_MARGIN, CAGE_WIDTH/2 + CAGE_MARGIN, 2*CAGE_MARGIN);
    bottom.SetAngle( -match.floorSlope );

    statbox( match.world, 0, -CAGE_BOTTOM, CAGE_MARGIN, 4*CAGE_BOTTOM);
    statbox( match.world, CAGE_WIDTH-CAGE_MARGIN, -CAGE_BOTTOM, CAGE_MARGIN, 4*CAGE_BOTTOM);

    var x0 = (CAGE_WIDTH/2 + CAGE_MARGIN)/2, y0 = CAGE_BOTTOM-3*CAGE_MARGIN;
    var y1 = y0 + CAGE_MARGIN * match.floorSlope * Math.sqrt( 1 / (1 + match.floorSlope*match.floorSlope) );
    var x1 = x0 + CAGE_MARGIN * Math.sqrt( 1 / (1 + match.floorSlope*match.floorSlope) );
    match.sideCageIntercept = y1 - (x1 - CAGE_MARGIN) * match.floorSlope;
    match.centerCageIntercept = y1 - (x1 - CAGE_WIDTH / 2) * match.floorSlope;
  }

  function statbox( world, x, y, w, h ) {
    var s = PIXELS_PER_METER;
    CAGE_BODY_DEF.type = b2Body.b2_staticBody;
    CAGE_BODY_DEF.position.x = (x + w/2)*s;
    CAGE_BODY_DEF.position.y = (y + h/2)*s;
    CAGE_BODY_DEF.angle = 0;

    CAGE_FIXTURE_DEF.shape = new b2PolygonShape.AsBox( w*s/2, h*s/2 );
    var body = world.CreateBody(CAGE_BODY_DEF)
    body.CreateFixture(CAGE_FIXTURE_DEF);
    return body;
  }

  function addContactListeners( world ) {
    world.SetContactListener({
      BeginContact: function(contact) {
        if ( ! contact.m_fixtureA.m_body.id || ! contact.m_fixtureB.m_body.id ) return;
      },
      EndContact: function(contact) {
        if ( ! contact.m_fixtureA.m_body.id || ! contact.m_fixtureB.m_body.id ) return;
        var partA = contact.m_fixtureA.m_body.part;
        var partB = contact.m_fixtureB.m_body.part;

        var blow = partA.health.blows[partB.body.id];
        if ( blow ) {
          partA.health.integrity -= blowDamage(blow.damage, partA);
          if ( partA.junk )
            partA.resize = blow;
          delete partA.health.blows[partB.body.id];
        }

        blow = partB.health.blows[partA.body.id];
        if ( blow ) {
          partB.health.integrity -= blowDamage(blow.damage, partB);
          if ( partB.junk )
            partB.resize = blow;
          delete partB.health.blows[partA.body.id];
        }
      },
      PreSolve: function() {},
      PostSolve: function(contact, impulse) { 
        if ( ! contact.m_fixtureA.m_body.id || ! contact.m_fixtureB.m_body.id ) return;
        applyDamage(contact,impulse) 
      }
    });
  }

  function addPhysics( creature, group, world ) {
    var bodyDef = new b2BodyDef;
    bodyDef.angularDamping = ANGULAR_DAMPING;

    //create some objects
    (function addPart(part) {
      bodyDef.type = b2Body.b2_dynamicBody;
      bodyDef.position.x = part.origin.x;
      bodyDef.position.y = part.origin.y;
      bodyDef.angle = part.theta;

      var points = [];
      var half_angle = Math.PI / part.sides;
      var t = new deathmatch.creature.T().scale(part.oblong,1/part.oblong);
      t.rotate(Math.PI+half_angle);
      for (var i=0; i < part.sides; i++) {
        var point = t.project({x:0, y:part.r * PIXELS_PER_METER});
        points.push( new b2Vec2(point.x,point.y) );
        t.rotate( 2 * half_angle );
      }
      FIXTURE_DEF.filter.groupIndex = -group;
      FIXTURE_DEF.shape = new b2PolygonShape.AsArray( points, points.length );

      part.body = world.CreateBody(bodyDef)
      part.body.id = fixture_index++;
      part.body.part = part;

      part.body.CreateFixture(FIXTURE_DEF);

      if (part.children) for (var i=0,child; child=part.children[i],i<part.sides; i++) {
        if ( child ) {
          var index = creature.leftFacing ? i : part.sides - i - 1;
          addPart(child);
          creature.joints.push( addJoint(part, child, points[index], creature.leftFacing, world ) );
        }
      }
    })(creature);
  }

  function addJoint( parent, child, point, leftFacing, world ) {
    var type, jointDef, sym_flex = Math.abs(child.flex - .5), constant;
    if ( sym_flex >= .3 ) {
      type = 'driver'
      var jointDef = new b2RevoluteJointDef();
      jointDef.Initialize(parent.body, child.body, parent.body.GetWorldPoint(point));
      jointDef.enableMotor = true;
      jointDef.motorSpeed = (child.flex>.5?1:-1)*boundedExponential(5*(sym_flex-.3),MIN_DRIVER_SPEED,MAX_DRIVER_SPEED);
      if ( leftFacing ) jointDef.motorSpeed = -jointDef.motorSpeed;
      jointDef.maxMotorTorque = boundedExponential( 5*(sym_flex-.3), MIN_DRIVER_TORQUE, MAX_DRIVER_TORQUE );
    } else if ( sym_flex >= .1 ) {
      type = 'flex'
      var jointDef = new b2RevoluteJointDef();
      jointDef.Initialize(parent.body, child.body, parent.body.GetWorldPoint(point));
      jointDef.enableMotor = true;
      constant = boundedExponential( 5*(sym_flex-.1), MIN_FLEX_TORQUE, MAX_FLEX_TORQUE );
    } else {
      type = 'weld'
      var jointDef = new b2WeldJointDef();
      jointDef.Initialize(parent.body, child.body, parent.body.GetWorldPoint(point));
    }
    child.attachment = world.CreateJoint(jointDef);
    return {joint:child.attachment, constant:constant, type:type}
  }

  function updateCreature( creature, match, stats ) {
    updatePart(creature);
    for ( var i=0,joint; joint = creature.joints[i]; i++ ) {
      if ( joint.type === 'flex' ) {
        joint.joint.SetMotorSpeed( (joint.joint.GetJointAngle()>0?-1:1)   );
        joint.joint.SetMaxMotorTorque( Math.abs(joint.joint.GetJointAngle() * joint.constant) );
      }
    }
    if ( stats ) {
      stats.health = assessDamage( creature, match );
      if ( Math.abs( creature.origin.x - stats.lastPosition.x ) > MINIMUM_MOTION ) {
        stats.immobileIterations = 0;
        stats.lastPosition = {x:creature.origin.x, y:creature.origin.y};
      } else {
        stats.immobileIterations++;        
      }
    }
  }

  function updatePart(part) {
    var pos = part.body.GetPosition();
    part.origin.x = pos.x;
    part.origin.y = pos.y;
    part.theta = part.body.GetAngle();
    eachChild( part, updatePart );
  }

  function assessDamage( part, match ) {
    var totalDamage = 0, health = part.health;
    for ( var id in health.blows ) totalDamage += health.blows[id].damage
    health.instant_integrity = health.integrity - blowDamage( totalDamage, part );

    if ( part.health.instant_integrity <= 0 ) {
      junkify( part, match );
      return 0;
    }

    return health.instant_integrity * part.mass + sumChild( part, assessDamage, match );
  }

  function junkify( part, match ) {
    var filterData = new b2FilterData();
    filterData.groupIndex = 0;
    part.body.m_fixtureList.SetFilterData(filterData);
    part.junk = true;
    match.junk[part.body.id] = part;
    part.health.integrity = 1;

    if (part.parent) { 
      match.world.DestroyJoint( part.attachment );
      part.attachment = null;
      delete part.parent.children[part.index];
      part.parent = null;
    }

    eachChild( part, junkify, match );
  }

  function updateJunk( match ) {
    for ( var id in match.junk ) {
      var part = match.junk[id];
      if ( part.health.integrity < 0 ) {
        match.world.DestroyBody(part.body);
        delete match.junk[id];
      } else if ( part.resize ) {
        resizeJunk( part, part.resize );
        part.resize = null;
      }
    }
  }

  function resizeJunk( part, blow ) {
    var angle = Math.atan2(blow.normal.y, blow.normal.x);
    var scale = part.health.integrity / (part.health.integrity + blowDamage(blow.damage,part) );
    var transform = new deathmatch.creature.T().rotate(-angle).scale(scale,1).rotate(angle);

    var points = part.body.m_fixtureList.m_shape.m_vertices;
    for ( var i=0, v; v = points[i]; i++ ) {
      var p = transform.project(v);
      points[i] = new b2Vec2(p.x,p.y);
    }
    FIXTURE_DEF.filter.groupIndex = 0;
    FIXTURE_DEF.shape = new b2PolygonShape.AsArray( points, points.length );
    part.body.DestroyFixture(part.body.m_fixtureList);
    part.body.CreateFixture(FIXTURE_DEF);

    part.body.ResetMassData();
  }

  function applyDamage( contact, impulse ) {
    if ( ! contact.m_fixtureA.m_body.part || ! contact.m_fixtureB.m_body.part ||
      contact.m_manifold.m_type != 2 && contact.m_manifold.m_type != 4 ) return false;

    var attacker = contact.m_manifold.m_type == 2 ? contact.m_fixtureB.m_body : contact.m_fixtureA.m_body;
    var defender = contact.m_manifold.m_type == 4 ? contact.m_fixtureB.m_body : contact.m_fixtureA.m_body;

    // use contact point to determine leading point of attacker's fixture
    var worldManifold = new Box2D.Collision.b2WorldManifold();
    contact.GetWorldManifold(worldManifold);
    var localPoint = attacker.GetLocalPoint(worldManifold.m_points[0]);

    var points = attacker.m_fixtureList.m_shape.m_vertices;
    var index = closestPoint( localPoint, points );
    var vertex = attacker.GetWorldPoint(points[index]);

    // compute vectors of both sides of the point
    var side1 = attacker.GetWorldPoint(points[(points.length+index-1) % points.length]);
    side1.Subtract(vertex);
    side1.Normalize();

    var side2 = attacker.GetWorldPoint(points[(index+1) % points.length]);
    side2.Subtract(vertex);
    side2.Normalize();

    var impulseNorm = worldManifold.m_normal.Copy();
    impulseNorm.Normalize();

    // sharp factor is the square of the dot product of the shallowest edge with normal of
    // the defenders edge.  That is, if theta is the angle the smaller of the angles the
    // edges make with the defender's side, then sharp_factor = sin(theta)^2.
    var sharp_factor = Math.min(abs_dot(impulseNorm,side1), abs_dot(impulseNorm,side2));
    sharp_factor *= sharp_factor;

    // We store the damage as a blow. The blow will be permenently subtracted from the part's
    // health once contact has ended.  We store the maximum damage reported over the
    // period of contact.
    var damage = (impulse.normalImpulses[0] + impulse.normalImpulses[1]) * sharp_factor;
    if (damage == 0)
      return false;
    var blows = defender.part.health.blows, blow = blows[attacker.id] = blows[attacker.id] || {damage:0};
    if ( damage > blow.damage ) {
      blow.damage = damage;
      blow.normal = impulseNorm;
    }
    return true;
  }

  return {
    PIXELS_PER_METER : PIXELS_PER_METER,
    cageParameters : cageParameters,
    startMatch : startMatch,
    updateCreature : updateCreature,
    updateMatch : updateMatch,
    addPhysics : addPhysics,
    nextGeneration : nextGeneration,
    compareOpponents : compareOpponents,
    matchSummary : matchSummary,
    pairOpponents : pairOpponents
  }
})();

