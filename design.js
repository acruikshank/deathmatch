design = (function() {
   if (typeof Box2D !== 'undefined') {
     var   b2Vec2 = Box2D.Common.Math.b2Vec2
      , dyn = Box2D.Dynamics, shapes = Box2D.Collision.Shapes, joints = dyn.Joints
      , b2BodyDef = dyn.b2BodyDef
      , b2Body = dyn.b2Body
      , b2FixtureDef = dyn.b2FixtureDef
      , b2Fixture = dyn.b2Fixture
      , b2World = dyn.b2World
      , b2MassData = shapes.b2MassData
      , b2PolygonShape = shapes.b2PolygonShape
      , b2CircleShape = shapes.b2CircleShape
      , b2RevoluteJointDef = joints.b2RevoluteJointDef
      , b2WeldJointDef = joints.b2WeldJointDef
      , b2DebugDraw = dyn.b2DebugDraw ;
    var PIXELS_PER_METER = deathmatch.contest.PIXELS_PER_METER;
  }

  var ANGULAR_DAMPING = 4;
  var leftFacing = false;

  var debug = false;

  var genome = [
    { obl:.5, giv:0, ext:.5, tak:.5, ang:.5, flx:.5, chd:[1,1,1] }
  ];

  var runInterval;

  var world, creature;

  var el;
  function childOf(el,clss) { if (! el || el.tagName == 'BODY') return null; return (el.getAttribute('class') === clss ? el : childOf(el.parentNode,clss)); }
  function offset(el) { if ( el.tagName === 'BODY' ) return {left:0, top:0}; var o = offset(el.offsetParent); return {left:o.left+el.offsetLeft, top:o.top+el.offsetTop}; }

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

  function draw() {
    var ctx = el('display').getContext('2d');
    ctx.fillStyle = 'rgba(40,40,40,.8)';
    if (! debug) ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);

    ctx.save();
    ctx.fillStyle = 'rgba(10,10,10,.3)';
    ctx.strokeStyle = 'rgb(255,255,255)';
    ctx.lineWidth = PIXELS_PER_METER;

    deathmatch.render.render( creature, null, ctx );
    ctx.restore();
  }

  function statbox( top, left, right, bottom ) {
    var bodyDef = new b2BodyDef;
    bodyDef.type = b2Body.b2_staticBody;
    bodyDef.position.x = (left + (right-left)/2) * PIXELS_PER_METER;
    bodyDef.position.y = (bottom + (top-bottom)/2) * PIXELS_PER_METER;
    var fixDef = new b2FixtureDef;
    fixDef.density = 1.0;
    fixDef.friction = 0.5;
    fixDef.restitution = 0.2;
    fixDef.shape = new b2PolygonShape;
    fixDef.shape.SetAsBox((right-left) * PIXELS_PER_METER, (top-bottom) * PIXELS_PER_METER);
    fixDef.filter.groupIndex = 2;
    world.CreateBody(bodyDef).CreateFixture(fixDef);
  }

  function addPhysics( creature ) {
    world = new b2World( new b2Vec2(0, 10),  true );
    var ctx = el("display").getContext("2d");

    //create ground
    statbox( ctx.canvas.height, -20, -7, 0 );
    statbox( ctx.canvas.height+20, -ctx.canvas.width / 2, 1.5 * ctx.canvas.width, ctx.canvas.height + 7 );
    statbox( ctx.canvas.height, ctx.canvas.width + 7, ctx.canvas.width + 20, 0 );

    deathmatch.contest.addPhysics( creature, 1, world );

    //setup debug draw
    if (debug) {
      var debugDraw = new b2DebugDraw();
      ctx.save();
      debugDraw.SetSprite(ctx);
      debugDraw.SetDrawScale(1/PIXELS_PER_METER);
      debugDraw.SetFillAlpha(0.3);
      debugDraw.SetLineThickness(1.0);
      debugDraw.SetFlags(b2DebugDraw.e_shapeBit | b2DebugDraw.e_jointBit);
      world.SetDebugDraw(debugDraw);
      ctx.restore();
    }
  }

  function update() {
    var ctx = el('display').getContext('2d');
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);

    clearInterval(runInterval);
    removeClass( el('starter-thumb'), 'on')

    localStorage.genome = JSON.stringify(genome);

    var transform = new deathmatch.creature.T().translate( 
      el('display').width*PIXELS_PER_METER/2, 
      el('display').height*PIXELS_PER_METER/2 );
    creature = deathmatch.creature.generate( genome, transform, leftFacing, PIXELS_PER_METER );

    draw();

    el('types').innerHTML = genome.map(type_template).join('')+et('span','add-type','+');
  }

  function import_genome() {
    genome = JSON.parse(el('genome').value);
    update();
  }

  function et(name, clss, contents,data,height) { return ['<',name,' class="',clss,'"',(data?' data="'+data+'"':'')
    ,(height?' style="height:'+height+'px"':''),'>',contents,'</',name,'>'].join(''); }


  function type_template( type, index ) {
    return et('div','type', et('span','index',index)
    + ['tak','giv','ang','ext','obl','flx'].map(trait_template).join('')
    + et('div','chd', et('span','delete','-',index+'') + ' [ ' + type.chd.map(chd_template).join(',') + ' ] ' + et('span','add','+',index+'') )
    + et('span','delete-type','x',index) );

    function trait_template( name ) { return et('div','choose '+name,et('div','outer',et('div','inner','', null, Math.round(40*type[name])), [index,name])); }
    function chd_template(cindex,slot) { return et('span','chd-index', et('span','up','&#x25b2;')+et('span','chd-display',cindex)+et('span','down','&#x25bC;'),[index,slot] ); }
  }

  function handleNodes(event, handlers) {
    var node;
    for ( var name in handlers ) {
      node = childOf(event.target,name);
      if( node ) {
        handlers[name]( node );
        update();
        return;
      }
    }
  }

  function output_genome( genome ) {
    return '[' + genome.map(format_gene).join(',\n ') + ']'
  }

  function format_gene( gene ) {
    var out = []; 
    for (var key in gene) out.push('"'+key+'":'+(key=='chd'?'['+gene[key]+']':gene[key].toFixed(3)));
    return '{'+out.join(', ')+'}';
  }

  function handle_click( event ) {
    handleNodes( event, {
      'add':        function(node) { genome[data(node)].chd.push(genome[data(node)].chd.slice(-1)[0]); },
      'delete':     function(node) { var chd = genome[data(node)].chd; if (chd.length>3) chd.pop(); },
      'up':         function(node) { var cin=childOf(node,'chd-index'),gene=genome[data(cin,0)],ci=data(cin,1);
                      if (gene.chd[ci] < 9) gene.chd[ci]++; },
      'down':       function(node) { var cin=childOf(node,'chd-index'),gene=genome[data(cin,0)],ci=data(cin,1);
                      if (gene.chd[ci] > 0) gene.chd[ci]--; },
      'delete-type':function(node) { if (genome.length > 1) genome.splice(data(node),1) },
      'add-type':   function(node) { genome.push({ obl:.5, giv:.0, ext:.5, tak:.5, ang:.5, flx:.5, 
                                                   chd:[genome.length+1,genome.length+1,genome.length+1] }); }
    } );
    function data(node,idx) { return parseInt(node.getAttribute('data').split(',')[idx||0]); }
  }

  function handle_drag( event ) {
    var node = childOf(event.target,'outer');
    if ( node ) {
      var startY = event.clientY;
      var data = node.getAttribute('data').split(',');
      var gene = genome[parseInt(data[0])];
      var trait = data[1];
      var value = gene[trait];
      var inner = node.firstChild;

      var pos = offset(node);
      el('trait').style.display='block';
      el('trait').style.top = pos.top+'px';
      el('trait').style.left = (pos.left - 100)+'px';
      el('trait').innerHTML = Math.round(value*100)+'%';
      document.onselectstart = function(){ return false; }
      document.body.style.cursor = 'ns-resize';

      window.onmousemove = function(event) {
        value = Math.max(Math.min(1, value + (startY - event.clientY)/200),0);
        gene[trait] = value;
        update();
        startY = event.clientY;
        el('trait').innerHTML = Math.round(value*100)+'%';
        inner.style.height = Math.round(40*value)+'px';
      }

      window.onmouseup = function() {
        gene[trait] = value;
        update();
        el('trait').style.display = 'none';
        window.onmouseup = null;
        window.onmousemove = null;
        document.onselectstart = null;
        document.body.style.cursor = null;
      }
    }
  }

  function togglePhysics() {
    if ( hasClass( el('starter-thumb'), 'on' ) ) {
      update();
    } else {
      addPhysics(creature); 
      runInterval = setInterval(physicsUpdate, 1000/60);
      addClass( el('starter-thumb'), 'on' )
    }
  }

  function init() {
    var design = document.getElementById('design');
    el = function el(clss) { return design.getElementsByClassName(clss)[0]; }

    el('types').onclick = handle_click;
    el('types').onmousedown = handle_drag;

    el('starter-thumb').onclick = togglePhysics;
    update();
  };

  function physicsUpdate() {
    world.Step( 1 / 60 /* frame-rate */,  10 /* velocity iterations*/,  1 /* position iterations */);
    if (debug) world.DrawDebugData();
    deathmatch.contest.updateCreature(creature);

    world.ClearForces();

    draw();
  }

  return {init:init, show:function(){}, hide:update}
})()