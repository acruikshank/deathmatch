/*
   parameters:
     obliqness
     extension
     take
     give
     angl(e|ular velocity)
     flex|torque
     descendants

   area of regular polygon as function of radius:
     triangle: 3**cos(30)*r^2/2
     square: 2 r^2
     pentagon: 5*cos(PI/5)*sin(PI/5)*r^2
     n-gon: n*cos(PI/n)*sin(PI/n)*r^2 = n*sin(2*PI/n)*r^2/2
     given an area a: r = sqrt( 2*a / (n*sin(2*PI/n)) )

  oblong can be used wihtout affecting area by using a scale transform:
    scale( f(oblong), 1/f(oblong) )
    f must map 0-1 such that f(.5) = 1 and f(x) = 1/f(1-x).
    f(0) and f(1) should probably finite and tunable.
    f = exp( A * (.5-x) )
    if A = ln(N), then the width can be at most N times the height and vice versa.
    f = exp( ln(N) * (.5-x) )

  extension should map 0-1 to a y translation s.t. the part remains touching it's origini (after oblong).
    extension = t(0)*obl = -r*cos(half_angle), t(1)*obl = sides%2==0 ? r*cos(half_angle) : r.

  generating to conserve mass
    function create_part( part_def, mass )
      part = create_part(part_def)
      total_child_mass = min( mass * (1-give), mass - MIN_MASS )
      child_defs = [create_def(point) for points in part_def]
      child_def_group = group child_defs by take
      sort child_def_groups by take (ascending)
      total_take = sum(child_def_group.take * child_def_group.length for child_def_group in child_def_groups)
      for child_def_group in child_def_groups
        child_mass = total_child_mass * child_def_group.take / total_take
        if child_mass >= MIN_MASS
          for child_def in child_def_group
            part.children.push( create_part[child_def], child_mass )
        else
          total_take -= child_def_group.take * child_def_group.length
 */
var deathmatch = (function() {
  var MASS = 100;
  var MIN_PART_MASS = .51;
  var MAX_OBLIQUE = 5;
  var DENSITY = .01;
  var PIXELS_PER_METER = .01;

  var MAX_FLEX_TORQUE = .5, MIN_FLEX_TORQUE = 100;
  var MAX_DRIVER_SPEED = 10, MIN_DRIVER_SPEED = .5;
  var MAX_DRIVER_TORQUE = 1000, MIN_DRIVER_TORQUE = 100000000;
  var ANGULAR_DAMPING = 4;

  var fixture_index = 10;

  var   b2Vec2 = Box2D.Common.Math.b2Vec2
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

  function generate( genome, transform, leftFacing ) {
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
          var child_type = genome[type.chd[j]];
          if ( child_type && child_masses[j] ) {

            point = work_transform.project({x:part.r/PIXELS_PER_METER,y:0}); 
            dx = point.x-part.origin.x; dy = point.y-part.origin.y;
            var child_transform = part.transform.clone().rotate(
              Math.atan2(dy,dx)-part.theta).translate(0,Math.sqrt(dx*dx+dy*dy));

            part.children = part.children || [];
            part.children[j] = {
                parent: part,
                index: j,
                type: type.chd[j],
                mass: child_masses[j],
                transform: child_transform };
          }
          work_transform.rotate( 2 * half_angle);
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

  function addPhysics( creature, world, group ) {
    var fixDef = new b2FixtureDef;
    fixDef.density = 1.0;
    fixDef.friction = 0.5;
    fixDef.restitution = 0.2;

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
      var t = new T().scale(part.oblong,1/part.oblong);
      t.rotate(Math.PI+half_angle);
      for (var i=0; i < part.sides; i++) {
        var point = t.project({x:0, y:part.r * PIXELS_PER_METER});
        points.push( new b2Vec2(point.x,point.y) );
        t.rotate( 2*half_angle );
      }
      fixDef.filter.groupIndex = -group;
      fixDef.shape = new b2PolygonShape.AsArray( points, points.length );

      part.body = world.CreateBody(bodyDef)
      part.body.id = fixture_index++;
      part.body.part = part;

      part.body.CreateFixture(fixDef);

      if (part.children) for (var i=0,child; child=part.children[i],i<part.sides; i++) {
        if ( child ) {
          addPart(child);
          creature.joints.push( addJoint(part, child, points[i], creature.leftFacing ) );
        }
      }
    })(creature);

    var listener = {
      BeginContact: function(contact) {
        if ( ! contact.m_fixtureA.m_body.id || ! contact.m_fixtureB.m_body.id ) return;
      },
      EndContact: function(contact) {
        if ( ! contact.m_fixtureA.m_body.id || ! contact.m_fixtureB.m_body.id ) return;
        var partA = contact.m_fixtureA.m_body.part;
        var partB = contact.m_fixtureB.m_body.part;
        partA.health.integrity -= blowDamage(partA.health.blows[partB.body.id], partA);
        delete partA.health.blows[partB.body.id];
        partB.health.integrity -= blowDamage(partB.health.blows[partA.body.id], partB);
        delete partB.health.blows[partA.body.id];
      },
      PreSolve: function() {},
      PostSolve: function(contact, impulse) { 
        if ( ! contact.m_fixtureA.m_body.id || ! contact.m_fixtureB.m_body.id ) return;
        applyDamage(contact,impulse) 
      }
    }
    world.SetContactListener(listener);
  }

  function boundedExponential( x, min, max ) {
    return min * Math.exp( Math.log(max / min) * x );
  }

  function addJoint( parent, child, point, leftFacing ) {
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

  function render( part, ctx, genome ) {
    genome = genome || part.genome;
    var type = genome[part.type], sides = type.chd.length, half_angle = Math.PI / sides;

    ctx.save();
    ctx.translate( part.origin.x, part.origin.y );
    ctx.rotate( part.theta );
    ctx.scale( part.oblong, 1 / part.oblong );

    ctx.beginPath();
    ctx.rotate(Math.PI+half_angle);
    ctx.moveTo( 0, part.r * PIXELS_PER_METER );
    for (var i=0; i < sides; i++) {
      ctx.rotate( 2*half_angle );
      ctx.lineTo( 0, part.r * PIXELS_PER_METER );
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (part.children)
      for ( var i=0,c=part.children,l=c.length,child; child=c[i], i<l; i++ ) {
        if (child) render( child, ctx, genome );
      }
  }

  function updatePart(part) {
    var pos = part.body.GetPosition();
    part.origin.x = pos.x;
    part.origin.y = pos.y;
    part.theta = part.body.GetAngle();
    if ( part.children ) for (var i=0,child; child=part.children[i],i<part.sides; i++) if (child) updatePart(child);
  }

  function updateCreature( creature ) {
    updatePart(creature);
    for ( var i=0,joint; joint = creature.joints[i]; i++ ) {
      if ( joint.type === 'flex' ) {
        joint.joint.SetMotorSpeed( (joint.joint.GetJointAngle()>0?-1:1)   );
        joint.joint.SetMaxMotorTorque( Math.abs(joint.joint.GetJointAngle() * joint.constant) );
      }
    }
    computeDamage( creature );
  }

  function computeDamage( part ) {
    var totalBlows = 0, health = part.health;
    for ( var id in health.blows ) totalBlows += health.blows[id]
    health.instant_integrity = health.integrity - blowDamage( totalBlows, part );
    eachChild( part, computeDamage );
  }

  function blowDamage( blow, part ) { return DAMAGE_FACTOR * (blow||0) / part.mass; }

  function closestPoint( vec, points ) {
    var min = 0, min_dist = Math.abs(vec.x-points[0].x) + Math.abs(vec.y-points[0].y), dist;
    for ( var i=1, point; point = points[i]; i++ ) {
      dist = Math.abs(vec.x-point.x) + Math.abs(vec.y-point.y);
      if (dist < min_dist) min = i, min_dist = dist;
    }
    return min;
  }

  function abs_dot( v1, v2 ) { return Math.abs(v1.x * v2.x + v1.y * v2.y); }

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

    // We store the damage as a blow. The blow will permenently subtracted from the part's
    // health once contact has ended.  We keep the maximum damage reported over the
    // period of contact.
    var damage = (impulse.normalImpulses[0] + impulse.normalImpulses[1]) * sharp_factor;
    var blow = defender.part.health.blows[attacker.id] || 0;
    if ( damage > blow )
      defender.part.health.blows[attacker.id] = damage;
    return true;
  }

  return {
    render: render,
    generate: generate,
    addPhysics: addPhysics,
    updateCreature: updateCreature,
    T: T,
    PIXELS_PER_METER : PIXELS_PER_METER
  }
})();

