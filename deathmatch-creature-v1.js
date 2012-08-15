deathmatch = window.deathmatch || {};
deathmatch.creature = (function() {
  var MASS = 100;
  var MIN_PART_MASS = .51;
  var MAX_OBLIQUE = 5;
  var DENSITY = .01;
	
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

  return {
    generate: generate,
    T: T
  }
})()