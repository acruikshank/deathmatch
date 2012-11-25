deathmatch = window.deathmatch || {};
deathmatch.render = (function() {

  var MATCH_BACKGROUND = 'rgba(40,40,40,.8)';
  var MATCH_BACKGROUND_HARD = 'rgb(40,40,40)';

  function eachChild( part, f, arg1, arg2 ) {
    if (part.children) 
      for ( var i=0,child,l=part.children.length; child = part.children[i], i<l; i++ )
        if (child) f( child, arg1, arg2 );
  }

  function hsvTransform( color, H, S, V) {
    var VSU = V*S*Math.cos(H*Math.PI/180);
    var VSW = V*S*Math.sin(H*Math.PI/180);
    return {
      r : (.299*V+.701*VSU+.168*VSW)*color.r + (.587*V-.587*VSU+.330*VSW)*color.g + (.114*V-.114*VSU-.497*VSW)*color.b,
      g : (.299*V-.299*VSU-.328*VSW)*color.r + (.587*V+.413*VSU+.035*VSW)*color.g + (.114*V-.114*VSU+.292*VSW)*color.b,
      b : (.299*V-.3*VSU+1.25*VSW)*color.r + (.587*V-.588*VSU-1.05*VSW)*color.g + (.114*V+.886*VSU-.203*VSW)*color.b }
  }

  var partFillColors = [], partStrokeColors = [];
  function colorString(c,alpha) { return 'rgba('+(c.r|0)+','+(c.g|0)+','+(c.b|0)+','+alpha+')' }
  for (var i=0; i<360; i++) {
    partFillColors.push( colorString(hsvTransform({r:110,g:110,b:255}, i*2, 1, 1),'.55') )
    partStrokeColors.push( colorString(hsvTransform({r:75,g:75,b:255}, i*2, 1, 1),'1') )
  }

  function render( part, ctx, genome ) {
    var colorIndex = (part.type+1) * part.depth*5;
    ctx.fillStyle = partFillColors[colorIndex % partFillColors.length];
    ctx.strokeStyle = partStrokeColors[colorIndex % partFillColors.length];

    var s = deathmatch.contest.PIXELS_PER_METER;

    genome = genome || part.genome;
    var type = genome[part.type], sides = type.chd.length, half_angle = Math.PI / sides;

    ctx.save();
    ctx.scale( 1/s, 1/s );
    ctx.lineWidth = 2*s;
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

  function renderToFit( creature, ctx ) {
    var bounds = deathmatch.creature.bounds( creature );
    if ( ! bounds.width || ! bounds.height ) return;
    var widthRatio = ctx.canvas.width / bounds.width;
    var heightRatio = ctx.canvas.height / bounds.height;
    ctx.save();
    if ( widthRatio > heightRatio ) {
      ctx.lineWidth = ctx.lineWidth / heightRatio;
      ctx.scale( heightRatio, heightRatio );
      ctx.translate( -bounds.x + (ctx.canvas.width / heightRatio - bounds.width) / 2, -bounds.y );
    } else {
      ctx.lineWidth = ctx.lineWidth / widthRatio;
      ctx.scale( widthRatio, widthRatio );
      ctx.translate( -bounds.x, -bounds.y + (ctx.canvas.height / widthRatio - bounds.height) / 2 );
    }

    render(creature,ctx);
    ctx.restore();
  }

  function renderCage( ctx, match ) {
    var p = deathmatch.contest.cageParameters;
    ctx.save();
    ctx.beginPath()
    ctx.moveTo( -p.CAGE_MARGIN, -20 );
    ctx.lineTo( p.CAGE_MARGIN, -20 );
    ctx.lineTo( p.CAGE_MARGIN, match.sideCageIntercept );
    ctx.lineTo( p.CAGE_WIDTH / 2, match.centerCageIntercept );
    ctx.lineTo( p.CAGE_WIDTH - p.CAGE_MARGIN, match.sideCageIntercept );
    ctx.lineTo( p.CAGE_WIDTH - p.CAGE_MARGIN, -20 );
    ctx.lineTo( p.CAGE_WIDTH + p.CAGE_MARGIN, -20 );
    ctx.lineTo( p.CAGE_WIDTH + p.CAGE_MARGIN, p.CAGE_BOTTOM+20 );
    ctx.lineTo( - p.CAGE_MARGIN, p.CAGE_BOTTOM+20 );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  var junkGradient = [];
  var junkGradientColors = [
    [255,255,255, 1],
    [249,255,157, 2],
    [255,180,  2, 2],
    [255, 92,  1, 6],
    [145, 18,  2, 8],
    [ 20, 18, 21,32]
  ]

  function interp( a, b, x ) { return parseInt(b + (a-b) * x); }
  function interpColor( c1, c2, tween ) {
    var x = tween / c1[3];
    return "rgba(" + interp(c1[0],c2[0],x) + "," + interp(c1[1],c2[1],x) + "," + interp(c1[2],c2[2],x) + ","
  }
  for (var age=0, i=0, scaled=0, lastColor=junkGradientColors[0], color=lastColor; color; age++ ) {
    junkGradient[age] = interpColor( color, lastColor, scaled );
    scaled += .35;
    if (scaled > color[3]) {
      scaled -= color[3];
      lastColor = color;
      color = junkGradientColors[++i];
    }
  }
  junkGradient.push( interpColor(lastColor, lastColor, 0) );

  function renderJunk( part, match, ctx ) {
    var s = deathmatch.contest.PIXELS_PER_METER;
    var points = part.body.m_fixtureList.m_shape.m_vertices;

    ctx.save();

    var junkAge = parseInt((match.iterations - part.junked_at) * part.mass);
    var color = junkGradient[junkAge] || junkGradient[junkGradient.length - 1];
    ctx.strokeStyle = color + '1)';
    ctx.fillStyle = color + '.75)';

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
    var size = .2;
    var s = deathmatch.contest.PIXELS_PER_METER;
    ctx.save();
    ctx.scale( 1/s, 1/s );
    ctx.lineWidth = s;
    ctx.beginPath();
    ctx.arc( part.origin.x, part.origin.y, size*part.mass*s, 0, 2*Math.PI, true );
    ctx.fillStyle = left ? '#00f' : '#0d0';
    ctx.fill();
    ctx.fillStyle = ctx.strokeStyle = '#fff'; 
    ctx.stroke();

    ctx.beginPath();
    ctx.arc( part.origin.x, part.origin.y, size*part.mass*Math.max(0,part.health.instant_integrity)*s, 0, 2*Math.PI, true );
    ctx.fill(); i
    ctx.restore();
//    eachChild( part, drawDamage, ctx, left );
  }

  function renderCanvas( ctx, match, background, hard ) {
    ctx.fillStyle = hard ? MATCH_BACKGROUND_HARD : MATCH_BACKGROUND;
    ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);

    ctx.save();
    ctx.lineWidth = deathmatch.contest.PIXELS_PER_METER;

    for ( var id in match.junk )
      renderJunk( match.junk[id], match, ctx );

    if ( ! match.rightCreature.junk )
      render( match.rightCreature, ctx );
    if ( ! match.leftCreature.junk ) 
      render( match.leftCreature, ctx );
    if ( ! match.leftCreature.junk ) 
      drawDamage( match.leftCreature, ctx, true );
    if ( ! match.rightCreature.junk )
      drawDamage( match.rightCreature, ctx, false );

    ctx.fillStyle = background;
    ctx.strokeStyle = 'rgba(0,0,0,.8)';
    ctx.lineWidth = 1;
    renderCage(ctx, match);
    ctx.restore();    
  }

  return {
    render: render,
    renderCage : renderCage,
    renderJunk: renderJunk,
    renderCanvas: renderCanvas,
    renderToFit: renderToFit
	}
})()