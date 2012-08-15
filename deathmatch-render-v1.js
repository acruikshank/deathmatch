deathmatch = window.deathmatch || {};
deathmatch.render = (function() {

  function eachChild( part, f, arg1, arg2 ) {
    if (part.children) 
      for ( var i=0,child,l=part.children.length; child = part.children[i], i<l; i++ )
        if (child) f( child, arg1, arg2 );
  }

  function render( part, ctx, genome ) {
    var s = deathmatch.contest.PIXELS_PER_METER;

    genome = genome || part.genome;
    var type = genome[part.type], sides = type.chd.length, half_angle = Math.PI / sides;

    ctx.save();
    ctx.scale( 1/s, 1/s );
    ctx.lineWidth = s;
    ctx.translate( part.origin.x, part.origin.y );
    ctx.rotate( part.theta );
    ctx.scale( part.oblong, 1 / part.oblong );

    ctx.beginPath();
    ctx.rotate(Math.PI+half_angle);
    ctx.moveTo( 0, part.r * s );
    for (var i=0; i < sides; i++) {
      ctx.rotate( 2*half_angle );
      ctx.lineTo( 0, part.r * s );
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (part.children) {
      for ( var i=0,c=part.children,l=c.length,child; child=c[i], i<l; i++ ) {
        if (child) render( child, ctx, genome );
      }
    }
  }

  function renderCage( ctx ) {
    var p = deathmatch.contest.cageParameters;
    ctx.save();
    ctx.beginPath()
    ctx.moveTo( -p.CAGE_MARGIN, -20 );
    ctx.lineTo( p.CAGE_MARGIN, -20 );
    ctx.lineTo( p.CAGE_MARGIN, p.sideCageIntercept );
    ctx.lineTo( p.CAGE_WIDTH / 2, p.centerCageIntercept );
    ctx.lineTo( p.CAGE_WIDTH - p.CAGE_MARGIN, p.sideCageIntercept );
    ctx.lineTo( p.CAGE_WIDTH - p.CAGE_MARGIN, -20 );
    ctx.lineTo( p.CAGE_WIDTH + p.CAGE_MARGIN, -20 );
    ctx.lineTo( p.CAGE_WIDTH + p.CAGE_MARGIN, p.CAGE_BOTTOM+20 );
    ctx.lineTo( - p.CAGE_MARGIN, p.CAGE_BOTTOM+20 );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function renderJunk( part, ctx ) {
    var s = deathmatch.contest.PIXELS_PER_METER;
    var points = part.body.m_fixtureList.m_shape.m_vertices;

    ctx.save();
    ctx.scale( 1/s, 1/s );
    ctx.lineWidth = s;
    var pos = part.body.GetPosition();
    ctx.translate( pos.x, pos.y );
    ctx.rotate( part.body.GetAngle() );

    ctx.beginPath();
    ctx.moveTo( points[0].x, points[0].y );
    for (var i=1; i < points.length; i++)
      ctx.lineTo( points[i].x, points[i].y );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawDamage( part, ctx, left ) {
    var s = deathmatch.contest.PIXELS_PER_METER;
    ctx.save();
    ctx.scale( 1/s, 1/s );
    ctx.lineWidth = s;
    ctx.beginPath();
    ctx.arc( part.origin.x, part.origin.y, .4*part.mass*s, 0, 2*Math.PI, true );
    ctx.fillStyle = left ? '#00f' : '#0d0';
    ctx.fill();
    ctx.fillStyle = ctx.strokeStyle = '#fff'; 
    ctx.stroke();

    ctx.beginPath();
    ctx.arc( part.origin.x, part.origin.y, .4*part.mass*Math.max(0,part.health.instant_integrity)*s, 0, 2*Math.PI, true );
    ctx.fill(); i
    ctx.restore();
    eachChild( part, drawDamage, ctx, left );
  }

  function renderCanvas( ctx ) {
    ctx.save();
    ctx.lineWidth = deathmatch.contest.PIXELS_PER_METER;

    ctx.fillStyle = 'rgba(40,40,40,.3)';
    ctx.strokeStyle = '#666';
    var junk = deathmatch.contest.junk();
    for ( var id in junk )
      renderJunk( junk[id], ctx );

    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    if ( ! deathmatch.contest.rightCreature().junk )
      render( deathmatch.contest.rightCreature(), ctx );
    if ( ! deathmatch.contest.leftCreature().junk ) 
      render( deathmatch.contest.leftCreature(), ctx );
    if ( ! deathmatch.contest.leftCreature().junk ) 
      drawDamage( deathmatch.contest.leftCreature(), ctx, true );
    if ( ! deathmatch.contest.rightCreature().junk )
      drawDamage( deathmatch.contest.rightCreature(), ctx, false );

    ctx.fillStyle = '#ccc';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    renderCage(ctx);
    ctx.restore();    
  }

  return {
    render: render,
    renderCage : renderCage,
    renderJunk: renderJunk,
    renderCanvas: renderCanvas
	}
})()