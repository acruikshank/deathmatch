deathmatch = (window.deathmatch || {});
deathmatch.contest = (function() {
  var PIXELS_PER_METER = .01;

  var DAMAGE_FACTOR = 25;
  var JUNK_DAMAGE_FACTOR = 10;

  var MAX_FLEX_TORQUE = .5, MIN_FLEX_TORQUE = 100;
  var MAX_DRIVER_SPEED = 10, MIN_DRIVER_SPEED = .5;
  var MAX_DRIVER_TORQUE = 1000, MIN_DRIVER_TORQUE = 100000000;
  var ANGULAR_DAMPING = 4;

  var CAGE_WIDTH = 800, CAGE_MARGIN = 10;
  var CAGE_BOTTOM = 500, DROP_HEIGHT = 300, LEFT_DROP_X = 200, RIGHT_DROP_X = CAGE_WIDTH - LEFT_DROP_X;
  var cageParameters =  {
    CAGE_WIDTH : CAGE_WIDTH,
    CAGE_MARGIN : CAGE_MARGIN,
    CAGE_BOTTOM : CAGE_BOTTOM
  };

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

  var sideCageIntercept, centerCageIntercept;

  function boundedExponential( x, min, max ) { return min * Math.exp( Math.log(max / min) * x ); }
  function blowDamage( blow, part ) { return (part.junk?JUNK_DAMAGE_FACTOR:DAMAGE_FACTOR) * (blow||0) / part.mass; }

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

  function startMatch( leftOrganism, rightOrganism ) {
    var match = { leftOrganism:leftOrganism, rightOrganism:rightOrganism, junk:{} }
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

    addContactListeners( match.world );

    return match;
  }

  function updateMatch( match ) {
    match.world.Step( 1 / 60 /* frame-rate */,  10 /* velocity iterations*/,  1 /* position iterations */);

    updateCreature( match.leftCreature, match );
    updateCreature( match.rightCreature, match );
    updateJunk( match );

    match.world.ClearForces();    
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

  function updateCreature( creature, match ) {
    updatePart(creature);
    for ( var i=0,joint; joint = creature.joints[i]; i++ ) {
      if ( joint.type === 'flex' ) {
        joint.joint.SetMotorSpeed( (joint.joint.GetJointAngle()>0?-1:1)   );
        joint.joint.SetMaxMotorTorque( Math.abs(joint.joint.GetJointAngle() * joint.constant) );
      }
    }
    assessDamage( creature, match );
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

    if ( part.health.instant_integrity <= 0 )
      junkify( part, match );

    eachChild( part, assessDamage, match );
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
    updateMatch : updateMatch,
    addPhysics : addPhysics,
    updateCreature : updateCreature
  }
})();

