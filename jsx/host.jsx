/**
 * Speedpunk-AI Host  –  Illustrator 2024 CEP (ES3)
 * v 4.3.0 – straight-tick adaptive length + 5-pt smoothing
 * -----------------------------------------------
 *   • CompoundPathItem 対応
 *   • カラーマップ: rainbow, viridis, magma, heat,
 *                   gray-yel-red, green-yel-red, black-purple-yel-red
 *   • 直線チック長 = min(両端 comb)
 *   • 5-点移動平均で連続性向上
 *   • RGBClamp で Error 1240 回避
 */

(function(){

  var HOST_VERSION = '4.3.0';
  
  /* ---------- math helpers ---------- */
  function hypot(x,y){return Math.sqrt(x*x+y*y);}
  function clamp(v){v=Math.round(v);return(v<0||isNaN(v))?0:(v>255?255:v);}
  
  /* Bézier */
  function bp(p0,p1,p2,p3,t){
    var mt=1-t,mt2=mt*mt,t2=t*t;
    return[
      p0[0]*mt2*mt+3*p1[0]*mt2*t+3*p2[0]*mt*t2+p3[0]*t2*t,
      p0[1]*mt2*mt+3*p1[1]*mt2*t+3*p2[1]*mt*t2+p3[1]*t2*t
    ];
  }
  function bd(p0,p1,p2,p3,t){
    var mt=1-t;
    return[
      3*(p1[0]-p0[0])*mt*mt+6*(p2[0]-p1[0])*mt*t+3*(p3[0]-p2[0])*t*t,
      3*(p1[1]-p0[1])*mt*mt+6*(p2[1]-p1[1])*mt*t+3*(p3[1]-p2[1])*t*t
    ];
  }
  function kappa(p0,p1,p2,p3,t){
    var d=bd(p0,p1,p2,p3,t),
        dd=[p2[0]-2*p1[0]+p0[0]+(p3[0]-2*p2[0]+p1[0])*t*2,
            p2[1]-2*p1[1]+p0[1]+(p3[1]-2*p2[1]+p1[1])*t*2],
        n=Math.abs(d[0]*dd[1]-d[1]*dd[0]),
        d2=Math.pow(d[0]*d[0]+d[1]*d[1],1.5);
    return d2?n/d2:0;
  }
  function orient(path){
    var a=0,pts=path.pathPoints,l=pts.length,i;
    for(i=0;i<l;i++){
      var c=pts[i].anchor,n=pts[(i+1)%l].anchor;
      a+=c[0]*n[1]-n[0]*c[1];
    }
    return a>=0?1:-1;
  }
  
  /* colour maps */
  function hsv2rgb(h,s,v){
    var c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c,r=0,g=0,b=0;
    if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}
    else if(h<180){g=c;b=x;}else if(h<240){g=x;b=c;}
    else if(h<300){r=x;b=c;}else{r=c;b=x;}
    return[clamp((r+m)*255),clamp((g+m)*255),clamp((b+m)*255)];
  }
  function cmapFn(name){
    function lerp(a,b,t){return a+(b-a)*t;}
    var V;
    if(name==='viridis'){
      V=[[68,1,84],[59,82,139],[32,145,140],[94,201,97],[253,231,37]];
    }else if(name==='magma'){
      V=[[0,0,4],[77,5,113],[130,32,129],[185,55,119],[236,109,79],[252,253,191]];
    }else if(name==='heat'){
      return function(t){return[clamp(255*t),clamp(200*t),clamp(60*t)];};
    }else if(name==='gray'){
      V=[[85,85,85],[255,214,51],[255,0,0]];
    }else if(name==='gyr'){
      V=[[0,153,102],[255,255,102],[255,0,0]];
    }else if(name==='purp'){
      V=[[0,0,0],[106,0,168],[249,221,29],[255,0,0]];
    }else{ /* rainbow */
      return function(t){return hsv2rgb((1-t)*240,1,1);};
    }
    return function(t){
      var n=V.length-1,i=t*n|0,f=t*n-i,a=V[i],b=V[Math.min(i+1,n)];
      return[lerp(a[0],b[0],f),lerp(a[1],b[1],f),lerp(a[2],b[2],f)];
    };
  }
  
  /* ---------- core ---------- */
  function sp_speedpunkAnalyze(step,mag,op,lock,dir,pos,gamma,stroke,cmap,tickSpace){
    step=parseFloat(step)||0.05;
    mag =parseFloat(mag) ||200;
    op  =parseFloat(op)  ||70;
    gamma=parseFloat(gamma)||1.4;
    stroke=parseFloat(stroke)||1;
    tickSpace=parseFloat(tickSpace)||12;
    lock=!!parseInt(lock,10);
    dir =parseInt(dir,10)||0;
    pos =parseInt(pos,10)||0;
    cmap=cmap||'rainbow';
  
    if(app.documents.length===0) return 'ERROR:no doc';
    if(app.selection.length===0) return 'ERROR:no selection';
  
    /* layer */
    var doc=app.activeDocument, layer;
    try{layer=doc.layers.getByName('_SpeedpunkCurvature');}
    catch(e){layer=doc.layers.add();layer.name='_SpeedpunkCurvature';}
    layer.locked=false; layer.visible=true;
    while(layer.pageItems.length) layer.pageItems[0].remove();
    pos?layer.zOrder(ZOrderMethod.SENDTOBACK):layer.zOrder(ZOrderMethod.BRINGTOFRONT);
  
    /* path list */
    var paths=[], sel=app.selection,i,j;
    for(i=0;i<sel.length;i++){
      if(sel[i].typename==='PathItem') paths.push(sel[i]);
      else if(sel[i].typename==='CompoundPathItem')
        for(j=0;j<sel[i].pathItems.length;j++) paths.push(sel[i].pathItems[j]);
    }
    if(!paths.length) return 'ERROR:no path';
  
    var cm=cmapFn(cmap), count=0, window=2;
  
    /* main loops */
    for(var p=0;p<paths.length;p++){
      var path=paths[p], sign=path.closed?orient(path):1,
          pts=path.pathPoints, last=pts.length-1,
          samples=[];
  
      /* -------- collect samples -------- */
      for(i=0;i<pts.length;i++){
        var lastPt=(i===last); if(!path.closed && lastPt) continue;
        var ni=lastPt?0:i+1;
  
        var A=pts[i].anchor,  R=pts[i].rightDirection,
            B=pts[ni].leftDirection, C=pts[ni].anchor;
  
        var straight=(A[0]===R[0]&&A[1]===R[1]&&C[0]===B[0]&&C[1]===B[1]);
        if(straight){
          var segLen=hypot(C[0]-A[0],C[1]-A[1]),
              ticks=Math.max(1,Math.round(segLen/tickSpace)-1),
              vx=C[0]-A[0],vy=C[1]-A[1],nr=hypot(vx,vy);
          if(!nr) continue;
          var nx=-vy/nr, ny=vx/nr;
  
          /* comb length at both ends */
          var Lprev = kappa(
              (i===0)?pts[last].anchor:pts[i-1].anchor,
              (i===0)?pts[last].rightDirection:pts[i-1].rightDirection,
              pts[i].leftDirection,
              pts[i].anchor, 1)*mag;
          var Lnext = kappa(A,R,B,C,0)*mag;
          var tickLen=Math.min(Lprev,Lnext);
  
          for(j=1;j<=ticks;j++){
            var r=j/(ticks+1);
            samples.push({
              pt:[A[0]+vx*r,A[1]+vy*r],
              nx:nx,ny:ny,len:tickLen,
              straight:true,sign:sign
            });
          }
          continue;
        }
  
        for(var t=0;t<=1;t+=step){
          var pt=bp(A,R,B,C,t), d=bd(A,R,B,C,t),nr=hypot(d[0],d[1]);
          if(!nr) continue;
          samples.push({
            pt:pt,
            nx:-d[1]/nr, ny:d[0]/nr,
            len:kappa(A,R,B,C,t)*mag,
            straight:false,sign:sign
          });
        }
      }
  
      /* -------- 5-点移動平均 -------- */
      var nS=samples.length, smoothed=[], idx;
      for(idx=0;idx<nS;idx++){
        var sum=0,cnt=0;
        for(j=-window;j<=window;j++){
          var k=idx+j;
          if(k<0||k>=nS) continue;
          sum+=samples[k].len; cnt++;
        }
        smoothed.push(sum/cnt);
      }
  
      /* -------- draw -------- */
      for(idx=0;idx<nS;idx++){
        var s=samples[idx], L=smoothed[idx],
            rgb=cm(Math.pow(Math.min(1,L/mag),gamma)),
            col=new RGBColor();
        col.red=clamp(rgb[0]); col.green=clamp(rgb[1]); col.blue=clamp(rgb[2]);
  
        function draw(side){
          var it=layer.pathItems.add();
          it.setEntirePath([s.pt,[s.pt[0]+s.nx*L*side,
                                  s.pt[1]+s.ny*L*side]]);
          it.stroked=true; it.filled=false;
          it.strokeWidth=s.straight?0.5*stroke:0.7*stroke;
          it.opacity=s.straight?30:op;
          it.strokeColor=s.straight?(function(){var g=new GrayColor();g.gray=60;return g;})():col;
          count++;
        }
        if(s.straight){ draw(1); continue; }
  
        if(dir===2){ draw(s.sign); draw(-s.sign); }
        else       { draw(dir===1?-s.sign:s.sign); }
      }
    }
  
    if(lock) layer.locked=true;
    return 'OK:'+count+' combs (host v '+HOST_VERSION+')';
  }
  
  /* CEP global */
  $.global.sp_speedpunkAnalyze = sp_speedpunkAnalyze;
  
  })(); /* end IIFE */
  