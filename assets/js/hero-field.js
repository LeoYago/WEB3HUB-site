/* WEB3HUB v2 · hero field
   A distributed network seen in perspective: a field of nodes running to the
   horizon, breathing slowly. Every few seconds a block is confirmed somewhere
   and its wave propagates through the field. The first one starts under the
   Politecnico di Milano node of the bridge. Canvas 2D, paused off-screen. */
(function(){
  const hero=document.getElementById('hero');
  if(!hero)return;
  const cv=document.createElement('canvas');
  cv.className='hero-field';cv.setAttribute('aria-hidden','true');
  hero.insertBefore(cv,hero.firstChild);
  const ctx=cv.getContext('2d');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NAVY='#1B3664',BRIGHT='#3a6bc8';

  let W=0,H=0,dpr=1,f=1,horizon=0,zMin=2,zMax=26,pts=[],camH=3;
  let mx=0,tx=0;                // camera sway, eased toward the pointer
  const waves=[];               // {x,z,t0}
  let running=false,raf=0,t0=performance.now(),nextWave=1.4;

  // layout position of the hub node (offsets ignore the intro's translate)
  function hubY(){
    let el=hero.querySelector('.hb-hub-node'),y=0;
    if(!el||!el.offsetHeight)return 0;
    y=el.offsetHeight/2;
    while(el&&el!==hero){y+=el.offsetTop;el=el.offsetParent;}
    return el===hero?y:0;
  }
  function hubTarget(){
    // the field point that projects under the bridge hub
    const sy=horizon+90;
    return {x:0,z:camH*f/(sy-horizon)};
  }

  function build(){
    const r=hero.getBoundingClientRect();
    W=r.width;H=r.height;
    dpr=Math.min(2,window.devicePixelRatio||1);
    cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const small=W<700;
    f=Math.max(W,900)*.62;
    // the horizon sits on the Politecnico node: the network opens out from it
    const hy=hubY();
    horizon=hy?Math.max(H*.3,Math.min(H*.72,hy-34)):H*(small?.36:.5);
    camH=3;
    zMin=camH*f/(H*1.04-horizon);
    // rows placed by screen height, so the field reads evenly from the
    // horizon down; columns keep a constant world spacing and converge
    const dx=small?.6:.42;
    pts=[];
    let sy=horizon+2.5;zMax=camH*f/2.5;
    while(sy<H*1.04){
      const z=camH*f/(sy-horizon);
      const step=Math.max(dx,z*10/f);          // never denser than ~10px on screen
      const n=Math.ceil((z*(W/2)/f*1.06+1)/step);
      for(let j=-n;j<=n;j++)pts.push(j*step,z,Math.random()*6.283);
      sy+=2.2+(sy-horizon)*(small?.075:.06);
    }
  }

  function height(x,z,t){
    return .26*Math.sin(x*.34+t*.38)*Math.cos(z*.27-t*.3)
         + .16*Math.sin((x+z)*.21+t*.22)
         + .07*Math.sin(x*1.1-z*.8+t*.6);
  }

  function frame(now){
    const t=(now-t0)/1000;
    mx+=(tx-mx)*.04;
    if(!reduce&&t>nextWave){
      const first=!waves.length&&nextWave<2;
      const o=first?hubTarget():{x:(Math.random()-.5)*16,z:zMin+3+Math.random()*12};
      waves.push({x:o.x,z:o.z,t0:t});
      nextWave=t+4.2+Math.random()*2.6;
    }
    for(let i=waves.length-1;i>=0;i--)if(t-waves[i].t0>7)waves.splice(i,1);

    ctx.clearRect(0,0,W,H);
    // the field rises out of the white on load, after the headline
    const intro=reduce?1:Math.min(1,Math.max(0,(t-.35)/2.2)),fade=1-Math.pow(1-intro,3);
    const cx=W/2,fadeTop=horizon,fadeBot=H*.86;
    const hi=[];
    ctx.fillStyle=NAVY;
    for(let i=0;i<pts.length;i+=3){
      const x=pts[i]-mx,z=pts[i+1];
      let y=height(pts[i],z,t),amp=0;
      for(const w of waves){
        const age=t-w.t0,d=Math.hypot(pts[i]-w.x,z-w.z),front=age*4.6;
        const k=Math.exp(-((d-front)*(d-front))/1.1)*Math.max(0,1-age/7);
        amp+=k;
      }
      y+=amp*.42;
      const sx=cx+x/z*f, py=horizon+(camH-y)/z*f;   // eye camH above the ground plane
      if(sx<-4||sx>W+4||py<horizon-2||py>H+4)continue;
      // depth fog toward the horizon, soft vignette at the sides and the bottom seam
      const k0=Math.min(1,(py-horizon)/(H*.2));
      let a=(.22+.78*k0)*.8;
      const e=Math.abs(sx-cx)/(W/2);a*=1-Math.pow(e,3)*.7;
      if(py>fadeBot)a*=Math.max(0,1-(py-fadeBot)/(H-fadeBot));
      // keep the Politecnico node and its label clear
      const ex=(sx-cx)/150,ey=(py-horizon-40)/44,er=ex*ex+ey*ey;
      if(er<1)a*=er*er;
      a*=.75+.25*Math.sin(t*.8+pts[i+2]);
      const s=Math.min(2.8,Math.max(.9,.06*f/z));
      if(amp>.06){hi.push(sx,py,s,Math.min(1,a+amp*.7)*fade,amp);continue;}
      if(a<.02)continue;
      ctx.globalAlpha=a*fade;ctx.fillRect(sx-s/2,py-s/2,s,s);
    }
    ctx.fillStyle=BRIGHT;
    for(let i=0;i<hi.length;i+=5){
      const s=hi[i+2]*(1+Math.min(1,hi[i+4])*.5);
      ctx.globalAlpha=hi[i+3];ctx.fillRect(hi[i]-s/2,hi[i+1]-s/2,s,s);
    }
    ctx.globalAlpha=1;
    if(running&&!reduce)raf=requestAnimationFrame(frame);
  }

  function play(){if(running||reduce)return;running=true;raf=requestAnimationFrame(frame);}
  function stop(){running=false;cancelAnimationFrame(raf);}

  build();
  document.fonts&&document.fonts.ready.then(()=>build());
  window.addEventListener('load',()=>build());
  if(reduce){frame(t0+8000);}
  new IntersectionObserver(es=>{es[0].isIntersecting?play():stop();}).observe(hero);
  document.addEventListener('visibilitychange',()=>{document.hidden?stop():(hero.getBoundingClientRect().bottom>0&&hero.offsetParent&&play());});
  let rt=0;
  new ResizeObserver(()=>{clearTimeout(rt);rt=setTimeout(()=>{build();if(reduce)frame(t0+8000);},80);}).observe(hero);
  if(matchMedia('(hover:hover) and (pointer:fine)').matches&&!reduce){
    window.addEventListener('pointermove',e=>{tx=(e.clientX/window.innerWidth-.5)*1.6;},{passive:true});
  }
  // a fresh first wave each time the home view comes back
  window.addEventListener('hashchange',()=>{if(/^#?(home)?$/.test(location.hash)){waves.length=0;t0=performance.now();nextWave=1.4;}});
})();
