/* ════════════════════════════════════════════════════════════════
   WEB3HUB · MOTION LAYER
   Runs after the site script and the i18n script. It never rewrites text
   nodes (the IT/EN switch keys on the original markup), it only adds
   classes, CSS variables and transforms.

   1  reveal system (re-armed on every view, so each page enters like a page)
   2  smooth scroll (Lenis, off under reduced motion)
   3  view transitions for the hash router
   4  scroll-linked scenes (GSAP ScrollTrigger), rebuilt per view
   5  micro-interactions: nav marker, card tilt, magnetic buttons,
      scroll-velocity marquees, progress bar
════════════════════════════════════════════════════════════════ */
(function(){
  const root=document.documentElement;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine=window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  const hasGsap=!!(window.gsap&&window.ScrollTrigger);
  const main=document.querySelector('main');
  const currentView=()=>document.querySelector('main > .view.is-active');

  /* ───────────── 1 · REVEALS ───────────── */
  const HEADINGS=[
    '.h-xl','.h-lg','.eco-title','.euro-h','.bmo-h','.xpl-feat-h','.eco-cta-title',
    '.partner-cta .pc-title','.res-news h3','.soul-name'
  ].join(',');
  /* groups whose children enter in sequence */
  const GROUPS=[
    '.pillars-rack','.activity-grid','.why-rack','.spec-sheet','.cases-grid','.values-list',
    '.tier-stack','.events-aside','.team-grid','.ab-wall','.xpl-board','.xpl-dir',
    '.stats-grid','.soul-meta','.euro-fp','.eco-stats','.hero-metrics-inner','.f-cols',
    '.chain','.res-cat__head','.eco-rails'
  ];
  const ITEM_SKIP=/(^|\s)(chain-progress|pc-bl|pc-br|ac-bl|ac-br|wc-bl|wc-br|cc-bl|cc-br|vc-bl|vc-br|eac-bl|eac-br|tgc-bl|tgc-br|erc|svc-foot)(\s|$)/;

  function tagReveals(){
    document.querySelectorAll(HEADINGS).forEach(h=>{
      if(h.closest('#hero')||h.closest('#contact-page'))return;
      h.classList.add('rv-head');
    });
    GROUPS.forEach(sel=>document.querySelectorAll(sel).forEach(g=>{
      if(g.closest('#hero'))return;
      let i=0;
      Array.from(g.children).forEach(c=>{
        if(ITEM_SKIP.test(c.className)||c.classList.contains('fade-up'))return;
        c.classList.add('rv');c.style.setProperty('--i',Math.min(i++,8));
      });
    }));
  }

  /* a masked heading has no visible area, so the observer watches its
     parent and reveals the heading when the parent arrives */
  let io=null;
  const proxies=new Map(); // observed element → elements to reveal
  function armReveals(scope){
    if(reduce||!('IntersectionObserver' in window)||!scope)return;
    if(!io){
      io=new IntersectionObserver(es=>es.forEach(e=>{
        if(!e.isIntersecting)return;
        (proxies.get(e.target)||[]).forEach(el=>el.classList.add('in'));
        proxies.delete(e.target);io.unobserve(e.target);
      }),{threshold:0,rootMargin:'0px 0px -8% 0px'});
    }
    scope.querySelectorAll('.fade-up,.rv,.rv-head,.rv-line').forEach(el=>{
      if(el.closest('#hero'))return;
      el.classList.remove('in');
      const t=el.classList.contains('rv-head')?el.parentElement:el;
      if(!proxies.has(t))proxies.set(t,[]);
      proxies.get(t).push(el);io.observe(t);
    });
  }

  /* ───────────── 2 · SMOOTH SCROLL ───────────── */
  let lenis=null;
  if(!reduce&&window.Lenis){
    lenis=new Lenis({lerp:.095,wheelMultiplier:.95,smoothWheel:true,syncTouch:false});
    ['#contact-page','#mobile-nav','.euro-list','.res-seg'].forEach(s=>document.querySelectorAll(s).forEach(el=>el.setAttribute('data-lenis-prevent','')));
    if(hasGsap){
      lenis.on('scroll',ScrollTrigger.update);
      gsap.ticker.add(t=>lenis.raf(t*1000));
      gsap.ticker.lagSmoothing(0);
    }else{
      const raf=t=>{lenis.raf(t);requestAnimationFrame(raf);};requestAnimationFrame(raf);
    }
    /* overlays own the scroll while open */
    const overlays=['contact-page','mobile-nav'].map(id=>document.getElementById(id)).filter(Boolean);
    const sync=()=>overlays.some(o=>o.classList.contains('open'))?lenis.stop():lenis.start();
    new MutationObserver(sync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  }
  const toTop=()=>{lenis?lenis.scrollTo(0,{immediate:true,force:true}):window.scrollTo(0,0);};

  /* progress bar driven by a transform, not width */
  const prog=document.getElementById('progress');
  function paintProgress(){
    const max=document.documentElement.scrollHeight-window.innerHeight;
    prog&&prog.style.setProperty('--p',max>0?Math.min(1,Math.max(0,window.scrollY/max)).toFixed(4):0);
  }
  window.addEventListener('scroll',paintProgress,{passive:true});

  /* ───────────── 3 · VIEW TRANSITIONS ───────────── */
  const baseShow=window.showView;
  let first=true;
  window.showView=function(name,resetScroll){
    if(first||reduce||!main){
      first=false;baseShow(name,resetScroll);toTop();afterView();return;
    }
    main.classList.add('is-leaving');
    setTimeout(()=>{
      baseShow(name,resetScroll);
      if(resetScroll!==false)toTop();
      afterView();
      requestAnimationFrame(()=>main.classList.remove('is-leaving'));
    },280);
  };

  function replayHero(){
    const t=document.querySelector('.hero-title');
    root.classList.add('hero-reset');
    root.classList.remove('is-loaded');t&&t.classList.remove('in');
    void root.offsetWidth;
    root.classList.remove('hero-reset');
    requestAnimationFrame(()=>requestAnimationFrame(()=>{root.classList.add('is-loaded');t&&t.classList.add('in');}));
  }

  function afterView(){
    const v=currentView();if(!v)return;
    if(v.id==='home'&&!first)replayHero();
    armReveals(v);
    armReveals(document.querySelector('footer'));
    placeMarker();
    buildScenes(v.id);
    paintProgress();
  }

  /* ───────────── 4 · SCROLL SCENES ───────────── */
  let ctx=null;
  function buildScenes(id){
    if(!hasGsap||reduce)return;
    if(ctx)ctx.revert();
    gsap.registerPlugin(ScrollTrigger);
    ctx=gsap.context(()=>{
      if(id==='home'){
        /* hero recedes as the page takes over */
        const hc=document.querySelector('#hero .hero-content');
        hc&&gsap.to(hc,{yPercent:-9,ease:'none',scrollTrigger:{trigger:'#hero',start:'top top',end:'bottom top',scrub:true}});
        // the field stays behind: slower parallax, and it settles away as you leave
        const hf=document.querySelector('#hero .hero-field');
        hf&&gsap.fromTo(hf,{yPercent:0,autoAlpha:1},{yPercent:14,autoAlpha:.15,ease:'none',immediateRender:false,scrollTrigger:{trigger:'#hero',start:'top top',end:'bottom top',scrub:true}});

        /* two souls converge and the bridge draws between them */
        const panels=document.querySelectorAll('#identity .soul-panel');
        const bridge=document.querySelector('#identity .id-bridge');
        const wide=window.matchMedia('(min-width:681px)').matches;
        if(panels.length===2&&wide){
          const tl=gsap.timeline({scrollTrigger:{trigger:'#identity .identity-link',start:'top 92%',end:'center 58%',scrub:1}});
          tl.fromTo(panels[0],{xPercent:-7,rotationY:6,transformPerspective:1400},{xPercent:0,rotationY:0,ease:'none'},0)
            .fromTo(panels[1],{xPercent:7,rotationY:-6,transformPerspective:1400},{xPercent:0,rotationY:0,ease:'none'},0);
          bridge&&tl.fromTo(bridge,{'--bridge':0},{'--bridge':1,ease:'none'},.35);
        }

        /* the stat rules fill as the band is read */
        document.querySelectorAll('.stats .stat-cell').forEach((c,i)=>{
          gsap.fromTo(c,{'--sp':0},{'--sp':1,ease:'none',scrollTrigger:{trigger:'.stats',start:'top '+(80-i*6)+'%',end:'center '+(46-i*4)+'%',scrub:.8}});
        });

        /* the map settles in with a hint of depth */
        const stage=document.querySelector('.euro-map');
        stage&&gsap.fromTo(stage,{yPercent:6,scale:.97},{yPercent:0,scale:1,ease:'none',scrollTrigger:{trigger:'.euro-section',start:'top bottom',end:'center center',scrub:1}});
      }

      /* footer emerges from under the last section, on every page */
      const cols=document.querySelectorAll('footer .f-cols, footer .f-bottom');
      cols.length&&gsap.fromTo(cols,{yPercent:-12},{yPercent:0,ease:'none',scrollTrigger:{trigger:'footer',start:'top bottom',end:'bottom bottom',scrub:true}});
    });
    ScrollTrigger.refresh();
  }

  /* ───────────── 5 · MICRO-INTERACTIONS ───────────── */
  /* sliding marker under the nav links */
  const links=document.querySelector('.nav-links');
  let marker=null;
  if(links){
    marker=document.createElement('span');marker.className='nav-marker';marker.setAttribute('aria-hidden','true');
    links.appendChild(marker);
    links.addEventListener('pointerover',e=>{const a=e.target.closest('a');if(a)moveMarker(a);});
    links.addEventListener('pointerleave',placeMarker);
    window.addEventListener('resize',placeMarker);
  }
  function moveMarker(a){
    if(!marker)return;
    const lr=links.getBoundingClientRect(),ar=a.getBoundingClientRect();
    const pad=15;
    marker.style.width='1px';
    marker.style.transform=`translateX(${ar.left-lr.left+pad}px) scaleX(${Math.max(1,ar.width-pad*2)})`;
    marker.style.opacity='1';
  }
  function placeMarker(){
    if(!marker)return;
    const a=links.querySelector('a.is-active');
    a?moveMarker(a):(marker.style.opacity='0');
  }

  /* hero cards lean gently towards the pointer */
  if(fine&&!reduce){
    document.querySelectorAll('.hb-path').forEach(card=>{
      card.addEventListener('pointermove',e=>{
        const r=card.getBoundingClientRect();
        const x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
        card.style.setProperty('--ry',(x*4).toFixed(2)+'deg');
        card.style.setProperty('--rx',(-y*4).toFixed(2)+'deg');
      });
      card.addEventListener('pointerleave',()=>{card.style.setProperty('--ry','0deg');card.style.setProperty('--rx','0deg');});
    });
  }

  /* primary actions are slightly magnetic */
  if(fine&&!reduce&&hasGsap){
    document.querySelectorAll('.nav-cta .btn--solid,.cases-more,.bmo-cta,.xpl-feat-ctas .btn,.pc-actions .btn,.res-news__submit,.eco-cta-actions .btn').forEach(el=>{
      const xTo=gsap.quickTo(el,'x',{duration:.6,ease:'power3.out'}),yTo=gsap.quickTo(el,'y',{duration:.6,ease:'power3.out'});
      el.addEventListener('pointermove',e=>{
        const r=el.getBoundingClientRect();
        xTo((e.clientX-r.left-r.width/2)*.18);yTo((e.clientY-r.top-r.height/2)*.28);
      });
      el.addEventListener('pointerleave',()=>{xTo(0);yTo(0);});
    });
  }

  /* marquees answer the reader: they speed up with the scroll, then settle */
  if(!reduce&&lenis){
    let rate=1,anims=[],frame=0;
    const collect=()=>{anims=Array.from(document.querySelectorAll('.wire-track,.eco-track')).flatMap(t=>t.getAnimations?t.getAnimations():[]);};
    lenis.on('scroll',({velocity})=>{rate=Math.min(4,1+Math.abs(velocity)*.12);});
    (function tick(){
      if(++frame%60===0)collect();
      rate+=(1-rate)*.06;
      for(const a of anims)a.playbackRate+=(rate-a.playbackRate)*.15;
      requestAnimationFrame(tick);
    })();
  }

  /* ecosystem orbit: the legend brings one circle forward */
  const orbit=document.querySelector('.eco-orbit');
  document.querySelectorAll('.orb-legend li').forEach(li=>{
    li.addEventListener('pointerenter',()=>orbit&&orbit.setAttribute('data-focus',li.dataset.ring));
    li.addEventListener('pointerleave',()=>orbit&&orbit.removeAttribute('data-focus'));
  });

  /* ───────────── START ───────────── */
  tagReveals();
  function start(){
    root.classList.add('is-loaded');
    const t=document.querySelector('.hero-title');t&&t.classList.add('in');
    window.showView((location.hash||'').replace(/^#/,'')||'home',false);
  }
  const ready=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();
  Promise.race([ready,new Promise(r=>setTimeout(r,250))]).then(()=>requestAnimationFrame(start));
  window.addEventListener('load',()=>{hasGsap&&!reduce&&ScrollTrigger.refresh();placeMarker();});
  /* the language switch changes line lengths: re-measure */
  document.getElementById('langToggle')?.addEventListener('click',()=>setTimeout(()=>{placeMarker();hasGsap&&ScrollTrigger.refresh();},60));
})();
