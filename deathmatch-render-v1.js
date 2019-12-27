deathmatch = window.deathmatch || {};
deathmatch.render = (function() {


  var MATCH_BACKGROUND = 'rgba(30,30,30,.8)';
  var MATCH_BACKGROUND_HARD = 'rgb(10,10,10)';

  function eachChild( part, f, arg1, arg2 ) {
    if (part.children)
      for ( var i=0,child,l=part.children.length; child = part.children[i], i<l; i++ )
        if (child) f( child, arg1, arg2 );
  }

  // COLOR MATH
  function hsvTransform( color, H, S, V) {
    var VSU = V*S*Math.cos(H*Math.PI/180);
    var VSW = V*S*Math.sin(H*Math.PI/180);
    return {
      r : (.299*V+.701*VSU+.168*VSW)*color.r + (.587*V-.587*VSU+.330*VSW)*color.g + (.114*V-.114*VSU-.497*VSW)*color.b,
      g : (.299*V-.299*VSU-.328*VSW)*color.r + (.587*V+.413*VSU+.035*VSW)*color.g + (.114*V-.114*VSU+.292*VSW)*color.b,
      b : (.299*V-.3*VSU+1.25*VSW)*color.r + (.587*V-.588*VSU-1.05*VSW)*color.g + (.114*V+.886*VSU-.203*VSW)*color.b }
  }

  function colorString(c,alpha) { return 'rgba('+(c.r|0)+','+(c.g|0)+','+(c.b|0)+','+alpha+')' }
  function interp( a, b, x ) { return parseInt(a + (b-a) * x); }
  function interpColor( c1, c2, x ) {
    return {r:interp(c1.r,c2.r,x), g:interp(c1.g,c2.g,x), b:interp(c1.b,c2.b,x)}
  }

  // PRE-COMPUTED COLORS
  var baseFillColor = {r:110,g:110,b:255};
  var baseStrokeColor = {r:75,g:75,b:255};
  var deadFillColor = hsvTransform(baseFillColor, 0, 0, 1);
  var deadStrokeColor = hsvTransform(baseStrokeColor, 0, 0, 1);
  var partFillColors = [], partStrokeColors = [], junkGradient = [], speciesPalette=[], speciesColors={};
  var junkGradientColors = [
    [{r:255, g:255, b:255}, 1],
    [{r:249, g:255, b:157}, 2],
    [{r:255, g:180, b:  2}, 2],
    [{r:255, g: 92, b:  1}, 6],
    [{r:145, g: 18, b:  2}, 8],
    [{r: 20, g: 18, b: 21},32]
  ]

  function initSpeciesColors(population) {
    speciesColors={};
    var species = {}, speciesList = [];
    for ( var i=0, organism; organism = population[i]; i++ ) species[organism.species.id] = true;
    for (var id in species) speciesList.push(id);
    speciesList.sort()
    for ( var i=0, id; id = speciesList[i]; i++ ) speciesColors[id] = speciesPalette[i%speciesPalette.length];
  }

  var primaries = [0,120,240]
  var secondaries = [60,180,300];
  var tertiaries = [30,90,120,150,180,210,240,270,280,310,340];
  var color1 = {r:190, g:60, b:80}, color2 = {r:200, g:160, b:10}, color3 = {r:40, g:190, b:210};

  speciesPalette = speciesPalette.concat( primaries.map(function(r) { return colorString(hsvTransform(color1,r,1,1),'1') }) )
  speciesPalette = speciesPalette.concat( primaries.map(function(r) { return colorString(hsvTransform(color2,r,1,1),'1') }) )
  speciesPalette = speciesPalette.concat( secondaries.map(function(r) { return colorString(hsvTransform(color2,r,1,1),'1') }) )
  speciesPalette = speciesPalette.concat( primaries.map(function(r) { return colorString(hsvTransform(color3,r,1,1),'1') }) )
  speciesPalette = speciesPalette.concat( secondaries.map(function(r) { return colorString(hsvTransform(color1,r,1,1),'1') }) )
  speciesPalette = speciesPalette.concat( secondaries.map(function(r) { return colorString(hsvTransform(color3,r,1,1),'1') }) )
  speciesPalette = speciesPalette.concat( tertiaries.map(function(r) { return colorString(hsvTransform(color1,r,1,1),'1') }) )
  speciesPalette = speciesPalette.concat( tertiaries.map(function(r) { return colorString(hsvTransform(color2,r,1,1),'1') }) )
  speciesPalette = speciesPalette.concat( tertiaries.map(function(r) { return colorString(hsvTransform(color3,r,1,1),'1') }) )

  for (var i=0; i<360; i++) {
    partFillColors.push( hsvTransform(baseFillColor, i*2, 1, 1) )
    partStrokeColors.push( hsvTransform(baseStrokeColor, i*2, 1, 1) )
  }

  for (var age=0, i=0, scaled=0, lastColor=junkGradientColors[0], color=lastColor; color; age++ ) {
    junkGradient[age] = interpColor( lastColor[0], color[0], scaled / color[1] );
    scaled += .35;
    if (scaled > color[1]) {
      scaled -= color[1]; lastColor = color; color = junkGradientColors[++i];
    }
  }
  junkGradient.push( interpColor(lastColor[0], lastColor[0], 0) );

  function render( part, match, ctx, genome ) {
    var colorIndex = (part.type+1) * part.depth*5;

    var strokeColor = partStrokeColors[colorIndex % partFillColors.length];
    strokeColor = interpColor(deadStrokeColor, strokeColor, part.health.instant_integrity);

    var fillColor = partFillColors[colorIndex % partFillColors.length];
    fillColor = interpColor(deadFillColor, fillColor, part.health.instant_integrity);

    if ( match && part.last_hit_at  && match.iterations - part.last_hit_at < 20 ) {
      var glowProgress = 1 - (match.iterations - part.last_hit_at) / 20;
      var junkColor =  junkGradient[ (junkGradient.length - (junkGradient.length * glowProgress)) |0 ];
      fillColor = interpColor( junkColor, fillColor, Math.max(0,1 - (glowProgress * part.last_hit)*2) );
      strokeColor = interpColor( junkColor, strokeColor, Math.max(0,1 - (glowProgress * part.last_hit)*2) );
    }

    ctx.fillStyle = colorString(fillColor,'.55');
    ctx.strokeStyle = colorString(strokeColor,'1');

    var s = deathmatch.contest.PIXELS_PER_METER;

    genome = genome || part.genome;
    var type = genome[part.type], sides = type.chd.length, half_angle = Math.PI / sides;

    ctx.save();
    ctx.scale( 1/s, 1/s );
    ctx.lineWidth = 1*s;
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
        if (child) render( child, match, ctx, genome );
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

    render(creature, null, ctx);
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


  function renderJunk( part, match, ctx ) {
    var s = deathmatch.contest.PIXELS_PER_METER;
    var points = part.body.m_fixtureList.m_shape.m_vertices;

    ctx.save();

    var junkAge = parseInt((match.iterations - part.junked_at) * part.mass);
    var color = junkGradient[junkAge] || junkGradient[junkGradient.length - 1];
    ctx.strokeStyle = colorString(color,'1');
    ctx.fillStyle = colorString(color,'.75');

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

  function drawDamage( creature, organism, ctx, left ) {
    var size = .2;
    var s = deathmatch.contest.PIXELS_PER_METER;
    ctx.save();
    ctx.scale( 1/s, 1/s );
    ctx.lineWidth = s;
    ctx.beginPath();
    ctx.arc( creature.origin.x, creature.origin.y, 5*s, 0, 2*Math.PI, true );
    ctx.fillStyle = speciesColors[organism.species.id] || '#fff';
    ctx.fill();
    ctx.strokeStyle = 'rgb(40,40,40)';
    ctx.stroke();
    ctx.restore();

//    ctx.beginPath();
//    ctx.arc( part.origin.x, part.origin.y, size*part.mass*Math.max(0,part.health.instant_integrity)*s, 0, 2*Math.PI, true );
//    ctx.fill();
//    ctx.restore();
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
      render( match.rightCreature, match, ctx );
    if ( ! match.leftCreature.junk )
      render( match.leftCreature, match, ctx );

    if ( ! match.leftCreature.junk )
      drawDamage( match.leftCreature, match.leftOrganism, ctx, true );
    if ( ! match.rightCreature.junk )
      drawDamage( match.rightCreature, match.rightOrganism, ctx, false );

    ctx.fillStyle = background;
    ctx.strokeStyle = 'rgba(200,200,200)';
    ctx.lineWidth = 1;
    renderCage(ctx, match);
    ctx.restore();
  }

  return {
    render: render,
    renderCage : renderCage,
    renderJunk: renderJunk,
    renderCanvas: renderCanvas,
    renderToFit: renderToFit,
    initSpeciesColors: initSpeciesColors
	}
})()
