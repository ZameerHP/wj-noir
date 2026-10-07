const ASSET = '/assets/';
const fragrances = [
  { id: 'the-office', title: 'The Office', upper: 'THE OFFICE', category: 'FOR HIM', tagline: 'Command the moment.', intro: 'Focus. Confidence. All day.', description: 'A confident blend of bright bergamot, aromatic lavender and a lasting woody finish.', story: 'Composed for those who know their presence speaks before they do.', image: 'wj-noir-the-office.jpg', altImage: 'the-office-poster.jpg', gallery: ['wj-noir-the-office.jpg','wj-noir-the-office-studio.jpg','wj-noir-the-office-water.jpg','wj-noir-the-office-box.jpg'], galleryAlt: ['WJ NOIR The Office fragrance on dark wet rocks','WJ NOIR The Office perfume bottle on a reflective white surface','WJ NOIR The Office perfume resting in dark reflective water','WJ NOIR The Office perfume in a black presentation box'], photoPosition: 'center', price: 2999, showPrice: true, tones: ['BERGAMOT', 'LAVENDER', 'WOODY'], notes: [{type:'TOP NOTE',note:'Bergamot',description:'Citrus & fresh'},{type:'HEART NOTE',note:'Lavender',description:'Floral & aromatic'},{type:'BASE NOTE',note:'Woody',description:'Warm & masculine'}], number:'01', texture:'#2b241e' },
  { id: 'ice-desire', title: 'Ice Desire', upper: 'ICE DESIRE', category: 'FOR HIM', tagline: 'A cooler kind of confidence.', intro: 'The allure of the unexpected.', description: 'A rush of crystalline freshness, cool mountain air and quiet confidence.', story: 'For the moment everything stands still, and only your presence remains.', image: 'wj-noir-ice-desire.jpg', altImage: 'dark-collection-alt.webp', gallery: ['wj-noir-ice-desire.jpg','wj-noir-ice-desire-water.jpg','wj-noir-ice-desire-studio.jpg','wj-noir-ice-desire-box.jpg'], galleryAlt: ['WJ NOIR Ice Desire perfume among ice and dark water','WJ NOIR Ice Desire perfume among ice on dark wet rocks','WJ NOIR Ice Desire perfume bottle on a reflective white surface','WJ NOIR Ice Desire perfume in a black presentation box'], video: 'wj-noir-ice-desire-film.mp4', photoPosition: 'center', price: 2499, showPrice: true, tones: ['FRESH', 'COOL', 'REFINED'], notes: [{type:'CHARACTER',note:'Icy freshness',description:'Cool & invigorating'},{type:'FEELING',note:'Crystal clarity',description:'Clean & luminous'},{type:'IMPRESSION',note:'Modern elegance',description:'Distinct & refined'}], number:'02', texture:'#becbd0' },
  { id: 'levoria', title: 'Lévoria', upper: 'LÉVORIA', category: 'FOR HER', tagline: 'A softer form of power.', intro: 'Elegance is unforgettable.', description: 'Golden vanilla, luminous fruits and warm woods in a graceful, lasting signature.', story: 'A fragrance that feels like the first golden light of evening.', image: 'wj-noir-levoria.jpg', altImage: 'dark-collection.webp', gallery: ['wj-noir-levoria-studio.jpg','wj-noir-levoria-box.jpg','wj-noir-levoria-model.jpg','wj-noir-levoria.jpg'], galleryAlt: ['WJ NOIR Lévoria for her perfume bottle on a clean white background','WJ NOIR Lévoria perfume presented in a black gift box','A woman holding the WJ NOIR Lévoria for her perfume','WJ NOIR Lévoria perfume bottle with warm gold accents'], video: 'wj-noir-levoria-film.mp4', photoPosition: 'center', price: 2499, showPrice: true, tones: ['VANILLA', 'FRUITY', 'WOODY'], notes: [{type:'TOP NOTE',note:'Vanilla',description:'Sweet & gourmand'},{type:'HEART NOTE',note:'Fruity',description:'Juicy & elegant'},{type:'BASE NOTE',note:'Woody',description:'Warm & lasting'}], number:'03', texture:'#8c5553' }
];
const app = document.getElementById('app');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let stickyPurchaseUpdate;
const escapeHtml = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cartStorageKey = 'wj-noir-cart';
function loadCart(){
  try {
    const saved=JSON.parse(localStorage.getItem(cartStorageKey)||'null');
    if(Array.isArray(saved))return saved.filter(item=>fragrances.some(p=>p.id===item?.id)&&Number.isSafeInteger(item.quantity)&&item.quantity>0&&item.quantity<=99).map(item=>({id:item.id,quantity:item.quantity}));
    const legacyIds=JSON.parse(localStorage.getItem('wj-noir-selection')||'[]');
    const legacyQuantities=JSON.parse(localStorage.getItem('wj-noir-selection-quantities')||'{}');
    if(Array.isArray(legacyIds))return legacyIds.filter(id=>fragrances.some(p=>p.id===id)).map(id=>({id,quantity:Number.isSafeInteger(legacyQuantities?.[id])?Math.max(1,Math.min(99,legacyQuantities[id])):1}));
  } catch(error) { console.error('Unable to load the saved WJ NOIR cart.',error); }
  return [];
}
let cart=loadCart();
let checkoutDraft=readCheckoutDraft();
let supabaseClientPromise=null;
let backendConfigPromise=null;
let adminChannel=null;
let adminOrders=[];
let selectedAdminOrderId=null;
let checkoutSubmitting=false;
let adminTriggerClicks=0;
let adminTriggerTimeout;
const cartQuantity = () => cart.reduce((total,item)=>total+item.quantity,0);
const cartSubtotal = items => items.reduce((total,item)=>total+(fragrances.find(p=>p.id===item.id)?.price||0)*item.quantity,0);
function saveCart(){
  try { localStorage.setItem(cartStorageKey,JSON.stringify(cart)); }
  catch(error) { console.error('Unable to persist the WJ NOIR cart.',error); showToast('Your cart could not be saved on this device.'); }
  renderBag();
}
const arrow = `<span class="arrow-icon" aria-hidden="true">↗</span>`;
const buttonLink = (href, title, variant='light') => `<a class="button ${variant === 'light' ? 'light-btn' : 'outline-btn'}" href="${href}"><span>${title}</span>${arrow}</a>`;
function card(p, extra='', reveal=true) { return `<article class="product-card ${extra} ${reveal?'reveal':''}"><a class="product-image-wrap" href="/fragrance/${p.id}" aria-label="Discover ${escapeHtml(p.title)}"><img loading="lazy" decoding="async" src="${ASSET+p.image}" alt="WJ NOIR ${escapeHtml(p.title)} fragrance" style="object-position:${p.photoPosition}"/><span class="product-hover">DISCOVER FRAGRANCE ↗</span><span class="product-number">${p.number} / 03</span></a><div class="product-card-info"><div><span class="eyebrow">${p.category} · EAU DE PARFUM</span><h3>${escapeHtml(p.title)}</h3><p>${p.tagline}</p>${p.showPrice?`<p class="product-card-price">PKR ${p.price.toLocaleString('en-PK')}</p>`:''}</div><a class="round-arrow" aria-label="View ${escapeHtml(p.title)}" href="/fragrance/${p.id}">↗</a></div></article>`; }
function home() { return `
  <main>
    <section class="hero" id="hero" aria-label="WJ NOIR fragrance film campaign"><div class="hero-video-wrap"><video id="hero-video" class="hero-video" muted loop playsinline preload="none" poster="${ASSET}the-office-poster.jpg"><source src="${ASSET}the-office-hero.mp4" type="video/mp4"/></video></div><div class="hero-shade"></div><div class="hero-noise"></div><div class="hero-top-copy"><p class="hero-intro animate-in">For those who choose their own way.<br/>Your presence. Your signature. Your rules.</p></div><div class="hero-proof animate-in" aria-label="Three signature fragrances"><div class="hero-fragrance-orbit"><img src="${ASSET}wj-noir-the-office.jpg" alt="" decoding="async" fetchpriority="low"/><img src="${ASSET}wj-noir-ice-desire.jpg" alt="" decoding="async" fetchpriority="low"/><img src="${ASSET}wj-noir-levoria.jpg" alt="" decoding="async" fetchpriority="low"/></div><p>THREE SIGNATURES.<br/>ONE UNMISTAKABLE PRESENCE.</p></div><div class="hero-content"><p class="eyebrow hero-kicker animate-in"><span class="line-accent"></span>THE WORLD OF WJ NOIR <span class="kicker-index">— 001</span></p><h1 class="animate-in hero-heading">WEAR YOUR<br/><em>PRESENCE.</em></h1><p class="hero-description animate-in">An entrance you feel.<br/>An impression that stays.</p></div><div class="hero-actions animate-in">${buttonLink('/about','DISCOVER THE HOUSE','outline')}${buttonLink('/shop','SHOP THE COLLECTION')}</div><div class="hero-bottom"><span class="hero-scroll">SCROLL TO DISCOVER <span class="scroll-line"></span></span><span>01 / 03 — THE SIGNATURE COLLECTION</span><span class="hero-video-mark">FILM 001&nbsp; ↗</span></div></section>
    <section class="about-intro section-pad" id="story"><span class="eyebrow ink-muted">THE HOUSE OF WJ NOIR</span><p>We create fragrances for those who choose their own way. Each scent is thoughtfully composed to express individuality, leave a lasting impression, and feel unmistakably yours.</p><a class="about-intro-link" href="/about">OUR STORY <span>↗</span></a></section>
    <section class="products-section most-wanted-section" id="collection"><div class="section-heading-row reveal"><div><span class="eyebrow ink-muted">THE WJ NOIR COLLECTION</span><h2>MOST WANTED</h2></div><a class="most-wanted-explore" href="/shop">EXPLORE ALL <span>↗</span></a></div><div class="products-grid">${fragrances.map(p=>card(p,'most-wanted-card')).join('')}</div><div class="under-products reveal"><span>THREE DISTINCT WORLDS. ONE UNMISTAKABLE PRESENCE.</span><span>50 ML / EAU DE PARFUM</span></div></section>
    <section class="collection-banner" id="after-hours"><div class="collection-bg"><img loading="lazy" decoding="async" src="${ASSET}dark-collection.webp" alt="WJ NOIR three perfumes on dark wet volcanic rocks and water"/></div><div class="collection-gradient"></div><div class="collection-copy reveal"><div class="eyebrow light-muted"><span class="line-accent"></span>THE COLLECTION / NO. 01</div><h2>AFTER<br/><em>HOURS.</em></h2><p>Dark. Distinct. Uncompromising.<br/>A signature that refuses to go unnoticed.</p>${buttonLink('/shop','EXPLORE COLLECTION')}</div><div class="banner-footnote">THE NOIR EDIT&nbsp; / &nbsp;WJ FRAGRANCE HOUSE</div></section>
    <section class="editorial-section" id="universes"><div class="editorial-heading section-pad reveal"><span class="eyebrow ink-muted">BEYOND THE ORDINARY / 002</span><h2>Three scents.<br/><em>Infinite expression.</em></h2><p>Every signature has its own world. Find the one that feels like yours.</p></div><div class="editorial-grid"><a href="/fragrance/ice-desire" class="editorial-card cold reveal"><div class="editorial-photo"><img loading="lazy" decoding="async" src="${ASSET}wj-noir-ice-desire-water.jpg" alt="Ice Desire perfume among snow, mountains and icy reflective water"/></div><div class="editorial-copy"><span>01 / FRESH. REFINED. UNTOUCHED.</span><div><h3>ICE <em>DESIRE.</em></h3><span class="editorial-arrow">↗</span></div></div></a><a href="/fragrance/levoria" class="editorial-card warm reveal"><div class="editorial-photo"><img loading="lazy" decoding="async" src="${ASSET}wj-noir-levoria.jpg" alt="Lévoria deep burgundy perfume with vanilla blossoms and warm sunlight"/></div><div class="editorial-copy"><span>02 / SOFT. GOLDEN. UNFORGETTABLE.</span><div><h3><em>LÉVORIA.</em></h3><span class="editorial-arrow">↗</span></div></div></a></div></section>
    <section class="quote-section"><div class="quote-outline">WJ NOIR</div><div class="quote-center reveal"><div class="eyebrow gold-muted">THE HOUSE PHILOSOPHY</div><div class="quote-mark">“</div><blockquote>Wear your presence.<br/><em>Leave your story.</em></blockquote><div class="quote-symbol">✦</div></div></section>
    <section class="closing-visual"><img loading="lazy" decoding="async" src="${ASSET}dark-collection.webp" alt="WJ NOIR collection displayed beside a reflective alpine lake"/><div class="closing-overlay"></div><div class="closing-content reveal"><span class="eyebrow">WJ NOIR / THE COLLECTION</span><h2>YOUR NEXT<br/><em>SIGNATURE.</em></h2>${buttonLink('/shop','DISCOVER ALL FRAGRANCES')}</div></section>
  </main>`; }
function shop() { return `<main class="interior-page"><section class="page-intro shop-intro"><span class="eyebrow ink-muted">WJ NOIR / THE COLLECTION</span><h1>Find your <em>signature.</em></h1><p>Three distinct expressions of the unforgettable. Discover your world.</p></section><div class="shop-filter-row"><span>THE COMPLETE COLLECTION / 03</span><span>EAU DE PARFUM · 50 ML</span></div><section class="shop-products section-pad"><div class="products-grid">${fragrances.map(p=>card(p)).join('')}</div></section><section class="shop-visual"><img src="${ASSET}dark-collection-alt.webp" alt="WJ NOIR fragrance collection on glossy black rocks" loading="lazy"/><div class="shop-visual-copy"><span class="eyebrow">A WORLD OF DISTINCTION</span><h2>THE NOIR <em>EDIT.</em></h2></div></section></main>`; }
function about() { return `<main class="interior-page"><section class="about-hero"><img src="${ASSET}dark-collection-alt.webp" alt="Dramatic WJ NOIR perfume campaign on black rocks in an alpine landscape"/><div class="about-hero-shade"></div><div class="about-hero-content reveal"><span class="eyebrow">THE STORY / WJ NOIR</span><h1>NOT MADE<br/>TO <em>BLEND IN.</em></h1><p>A fragrance house inspired by presence, character and the beautiful art of being remembered.</p></div></section><section class="about-copy section-pad"><div class="eyebrow ink-muted">OUR PHILOSOPHY / 001</div><h2>A scent can say<br/>what words <em>cannot.</em></h2><div class="about-copy-bottom"><p>We believe a fragrance is a deeply personal signature. It can be bold or quiet, warm or refreshing, but it should always feel unmistakably yours.</p><p>From the focused confidence of The Office to the icy allure of Ice Desire and the intimate warmth of Lévoria, our collection celebrates three very different ways to leave an impression.</p></div></section><section class="about-strip"><img loading="lazy" src="${ASSET}dark-collection-alt.webp" alt="Three WJ NOIR perfumes arranged in the mountains"/></section><section class="about-cta section-pad"><span class="eyebrow ink-muted">THE INVITATION</span><h2>DISCOVER YOUR<br/><em>OWN SIGNATURE.</em></h2><a class="button dark-btn" href="/shop">EXPLORE THE COLLECTION <span>↗</span></a></section></main>`; }
function product(p) {
  const related = fragrances.filter(other=>other.id!==p.id);
  const gallery = p.gallery || [p.image,p.altImage,p.image,p.altImage];
  const film = p.video || 'the-office-hero.mp4';
  const filmPoster = p.id === 'levoria' ? 'wj-noir-levoria-studio.jpg' : p.id === 'ice-desire' ? 'wj-noir-ice-desire-studio.jpg' : 'the-office-poster.jpg';
  const galleryMarkup = `<div class="product-gallery product-gallery--interactive" aria-label="${escapeHtml(p.title)} fragrance gallery">
        <div class="product-gallery-track" id="product-gallery-track" aria-label="Swipe through product images">
          ${gallery.map((image,index)=>`<figure class="product-gallery-slide" data-gallery-slide="${index}"><button type="button" class="product-gallery-zoom-trigger" data-gallery-zoom="${index}" aria-label="Zoom ${escapeHtml(p.title)} image ${index+1}"><img src="${ASSET+image}" data-fallback="${ASSET}dark-collection.webp" alt="${escapeHtml(p.galleryAlt?.[index]||`WJ NOIR ${p.title} fragrance photograph ${index+1}`)}" width="768" height="1024" loading="eager" fetchpriority="${index===0?'high':'low'}" decoding="async"/></button></figure>`).join('')}
        </div>
        <div class="product-gallery-thumbnails" role="group" aria-label="Choose a product image">
          ${gallery.map((image,index)=>`<button type="button" class="product-gallery-thumbnail${index===0?' is-active':''}" data-gallery-index="${index}" aria-label="Show image ${index+1}" aria-pressed="${index===0}"><img src="${ASSET+image}" alt="" width="72" height="88" loading="${index===0?'eager':'lazy'}" fetchpriority="low" decoding="async"/></button>`).join('')}
        </div>
        <div class="product-image-zoom" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Zoomed ${escapeHtml(p.title)} product image">
          <button type="button" class="product-image-zoom-backdrop" data-gallery-zoom-close aria-label="Close zoomed image"></button>
          <button type="button" class="product-image-zoom-close" data-gallery-zoom-close aria-label="Close zoomed image">×</button>
          <img class="product-image-zoom-image" alt=""/>
        </div>
      </div>`;
  const infoMarkup = `<div class="product-info product-info--editorial">
        <div class="product-overview">
          <span class="eyebrow ink-muted">${p.category} / WJ NOIR</span>
          <h1>${escapeHtml(p.upper)}</h1>
          <p class="product-summary">${escapeHtml(p.description)}</p>
          ${p.showPrice?`<p class="product-detail-price">PKR ${p.price.toLocaleString('en-PK')}</p>`:''}
          <p class="product-volume product-volume--compact">50 ml <span aria-hidden="true">·</span> Eau de Parfum</p>
        </div>
        <div class="product-purchase">
          <div class="quantity-label">QUANTITY</div>
          <div class="quantity-control" aria-label="Select quantity">
            <button type="button" data-quantity-adjust="-1" aria-label="Decrease quantity">−</button>
            <output id="product-quantity" aria-live="polite">1</output>
            <button type="button" data-quantity-adjust="1" aria-label="Increase quantity">+</button>
          </div>
          <button type="button" class="purchase-button purchase-primary" data-buy-now="${p.id}">BUY NOW <span>↗</span></button>
          <button type="button" class="purchase-button purchase-secondary" data-add-cart="${p.id}">ADD TO CART</button>
          <p class="product-price-note">Cash on delivery available. Your order will be confirmed by email.</p>
        </div>
        <div class="product-accordions">
          <details class="product-accordion"><summary>Story Behind<span aria-hidden="true"></span></summary><p>${escapeHtml(p.story)}</p></details>
          <details class="product-accordion"><summary>Fragrance Notes<span aria-hidden="true"></span></summary><div class="product-notes">${p.notes.map(n=>`<div><span>${escapeHtml(n.type)}</span><strong>${escapeHtml(n.note)}</strong><small>${escapeHtml(n.description)}</small></div>`).join('')}</div></details>
        </div>
      </div>`;
  const stickyPurchase = `<div class="product-sticky-purchase" aria-hidden="true">
        <span class="product-sticky-price">PKR ${p.price.toLocaleString('en-PK')}</span>
        <button type="button" class="purchase-button purchase-primary" data-buy-now="${p.id}" tabindex="-1">BUY NOW <span>↗</span></button>
      </div>`;
  return `<main class="interior-page product-page product-page--premium"><section class="product-detail-layout">${galleryMarkup}${infoMarkup}</section>${stickyPurchase}<section class="product-film" aria-label="${escapeHtml(p.title)} fragrance film"><video class="product-film-video" muted loop playsinline preload="none" poster="${ASSET+filmPoster}" aria-label="Cinematic WJ NOIR ${escapeHtml(p.title)} perfume film"><source src="${ASSET+film}" type="video/mp4"/></video></section><section class="related-products section-pad"><div class="section-heading-row"><div><span class="eyebrow ink-muted">CONTINUE EXPLORING</span><h2>YOU MAY ALSO <em>LOVE.</em></h2></div><a class="text-link" href="/shop">VIEW ALL <span>↗</span></a></div><div class="products-grid related-grid">${related.map(other=>card(other)).join('')}</div></section></main>`;
}
function notFound(){return `<main class="not-found"><span class="eyebrow">PAGE NOT FOUND</span><h1>Lost your <em>scent?</em></h1><a class="button dark-btn" href="/">RETURN HOME <span>↗</span></a></main>`;}
function setupReveals(){const els=document.querySelectorAll('.reveal'); if(reducedMotion || !('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('is-visible'));return;} const io=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target);}})},{threshold:.08,rootMargin:'0px 0px -35px 0px'});els.forEach(e=>io.observe(e));}
function setupVideo(){
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const allowMotionVideo=!reducedMotion&&!connection?.saveData&&!['slow-2g','2g'].includes(connection?.effectiveType);
  const video=document.getElementById('hero-video');
  if(video){
    video.muted=true;
    if(allowMotionVideo)video.play().catch(()=>{});
  }
  const film=document.querySelector('.product-film-video');
  if(film&&allowMotionVideo){
    const playFilm=()=>film.play().catch(()=>{});
    if('IntersectionObserver' in window){
      const observer=new IntersectionObserver(entries=>{
        if(entries.some(entry=>entry.isIntersecting)){
          observer.disconnect();
          playFilm();
        }
      },{rootMargin:'300px 0px'});
      observer.observe(film);
    }else playFilm();
  }
}
function closeGalleryZoom(){
  const zoom=document.querySelector('.product-image-zoom');
  if(!zoom)return;
  const wasOpen=zoom.classList.contains('is-open');
  zoom.classList.remove('is-open');
  zoom.setAttribute('aria-hidden','true');
  document.body.classList.remove('lock-scroll');
  if(wasOpen&&zoom.dataset.returnFocus){
    document.querySelector(`[data-gallery-zoom="${zoom.dataset.returnFocus}"]`)?.focus();
    delete zoom.dataset.returnFocus;
  }
}
function setupGallery(){
  document.querySelectorAll('.product-gallery-frame img,.product-gallery-slide img').forEach(img=>img.addEventListener('error',()=>{
    if(img.dataset.fallback&&img.getAttribute('src')!==img.dataset.fallback)img.src=img.dataset.fallback;
  },{once:true}));
  const gallery=document.querySelector('.product-gallery--interactive');
  if(!gallery)return;
  const track=gallery.querySelector('.product-gallery-track');
  const slides=[...gallery.querySelectorAll('.product-gallery-slide')];
  const thumbnails=[...gallery.querySelectorAll('.product-gallery-thumbnail')];
  const zoom=gallery.querySelector('.product-image-zoom');
  const zoomImage=gallery.querySelector('.product-image-zoom-image');
  let activeIndex=0;
  let scrollFrame=0;
  const setActive=(index,scroll=false)=>{
    activeIndex=Math.max(0,Math.min(slides.length-1,index));
    const activeImage=slides[activeIndex].querySelector('img');
    if(activeImage)activeImage.loading='eager';
    const thumbnailImage=thumbnails[activeIndex].querySelector('img');
    if(thumbnailImage)thumbnailImage.loading='eager';
    thumbnails.forEach((button,i)=>{
      const active=i===activeIndex;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    if(scroll){
      track.scrollTo({
        left:slides[activeIndex].offsetLeft-track.offsetLeft,
        behavior:reducedMotion?'instant':'smooth'
      });
    }
  };
  thumbnails.forEach(button=>button.addEventListener('click',()=>setActive(Number(button.dataset.galleryIndex),true)));
  track.addEventListener('scroll',()=>{
    cancelAnimationFrame(scrollFrame);
    scrollFrame=requestAnimationFrame(()=>setActive(Math.round(track.scrollLeft/track.clientWidth)));
  },{passive:true});
  gallery.querySelectorAll('[data-gallery-zoom]').forEach(button=>button.addEventListener('click',()=>{
    const image=slides[Number(button.dataset.galleryZoom)].querySelector('img');
    zoom.dataset.returnFocus=button.dataset.galleryZoom;
    zoomImage.src=image.currentSrc||image.src;
    zoomImage.alt=image.alt;
    zoom.classList.add('is-open');
    zoom.setAttribute('aria-hidden','false');
    document.body.classList.add('lock-scroll');
    zoom.querySelector('.product-image-zoom-close').focus();
  }));
  zoom.querySelectorAll('[data-gallery-zoom-close]').forEach(button=>button.addEventListener('click',closeGalleryZoom));
}
function setupStickyPurchase(){
  if(stickyPurchaseUpdate){
    window.removeEventListener('scroll',stickyPurchaseUpdate);
    window.removeEventListener('resize',stickyPurchaseUpdate);
    stickyPurchaseUpdate=null;
  }
  const bar=document.querySelector('.product-sticky-purchase');
  if(!bar)return;
  const controls=document.querySelector('.product-purchase');
  const update=()=>{
    const controlsPassed=controls.getBoundingClientRect().bottom<=0;
    const visible=controlsPassed;
    bar.classList.toggle('is-visible',visible);
    bar.setAttribute('aria-hidden',String(!visible));
    bar.querySelector('button').tabIndex=visible?0:-1;
  };
  let frame=0;
  stickyPurchaseUpdate=()=>{
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(update);
  };
  window.addEventListener('scroll',stickyPurchaseUpdate,{passive:true});
  window.addEventListener('resize',stickyPurchaseUpdate);
  update();
}
function setupPurchaseControls(){
  document.querySelectorAll('[data-quantity-adjust]').forEach(btn=>btn.addEventListener('click',()=>{
    const output=document.getElementById('product-quantity');
    const quantity=Number(output.value||output.textContent);
    output.value=String(Math.max(1,Math.min(99,quantity+Number(btn.dataset.quantityAdjust))));
    output.textContent=output.value;
  }));
  document.querySelectorAll('[data-add-cart],[data-buy-now]').forEach(btn=>btn.addEventListener('click',()=>{
    const output=document.getElementById('product-quantity');
    const id=btn.dataset.addCart||btn.dataset.buyNow;
    const quantity=Number(output.value||output.textContent);
    if(btn.dataset.buyNow)buyNow(id,quantity);
    else addToCart(id,quantity);
  }));
  setupStickyPurchase();
}
const SITE_ORIGIN='https://www.wjnoir.store';
const SEO_ROUTES={
  '/':{
    title:'WJ NOIR | Premium Perfumes in Pakistan',
    description:'Discover WJ NOIR fragrances in Pakistan: The Office, Ice Desire and Lévoria. Three distinct signatures crafted for presence, confidence and individuality.',
    image:'/assets/dark-collection.webp',
    index:true
  },
  '/shop':{
    title:'Shop WJ NOIR Perfumes in Pakistan | The Collection',
    description:'Shop the WJ NOIR fragrance collection in Pakistan. Explore The Office, Ice Desire and Lévoria Eau de Parfum in 50 ml.',
    image:'/assets/dark-collection.webp',
    index:true
  },
  '/about':{
    title:'Our Story | WJ NOIR Fragrance House',
    description:'Discover the story and philosophy behind WJ NOIR, a fragrance house built around individuality, presence and signature scent.',
    image:'/assets/dark-collection.webp',
    index:true
  }
};
function routePath(){
  if(window.location.hash.startsWith('#/')){
    const legacy=window.location.hash.slice(1).split('?')[0]||'/';
    history.replaceState({},'',legacy);
    return legacy;
  }
  return window.location.pathname.replace(/\/+$/,'')||'/';
}
function ensureMeta(selector,create){
  let el=document.head.querySelector(selector);
  if(!el){el=create();document.head.appendChild(el);}
  return el;
}
function setMeta(selector,content,create){
  const el=ensureMeta(selector,create);
  el.setAttribute('content',content);
}
function updateSeo(path,p){
  const privateRoute=['/checkout','/order-confirmed','/admin'].includes(path);
  const seo=p?{
    title:`${p.title} Perfume | WJ NOIR Pakistan`,
    description:`${p.title} by WJ NOIR — ${p.description} Explore the 50 ml Eau de Parfum and order in Pakistan.`,
    image:`${ASSET}${p.image}`,
    index:true
  }:(SEO_ROUTES[path]||{
    title:'Page Not Found | WJ NOIR',
    description:'The requested WJ NOIR page could not be found.',
    image:'/assets/dark-collection.webp',
    index:false
  });

  document.title=privateRoute
    ? (path==='/checkout'?'Checkout | WJ NOIR':path==='/admin'?'Orders | WJ NOIR':'Order Received | WJ NOIR')
    : seo.title;

  const canonicalUrl=`${SITE_ORIGIN}${path==='/'?'':path}`;
  const absoluteImage=new URL(seo.image,SITE_ORIGIN).href;
  const robotsValue=(privateRoute||!seo.index)
    ? 'noindex,nofollow'
    : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';

  setMeta('meta[name="description"]',seo.description,()=>{const e=document.createElement('meta');e.name='description';return e;});
  setMeta('meta[name="robots"]',robotsValue,()=>{const e=document.createElement('meta');e.name='robots';return e;});
  setMeta('meta[property="og:title"]',document.title,()=>{const e=document.createElement('meta');e.setAttribute('property','og:title');return e;});
  setMeta('meta[property="og:description"]',seo.description,()=>{const e=document.createElement('meta');e.setAttribute('property','og:description');return e;});
  setMeta('meta[property="og:image"]',absoluteImage,()=>{const e=document.createElement('meta');e.setAttribute('property','og:image');return e;});
  setMeta('meta[property="og:url"]',canonicalUrl,()=>{const e=document.createElement('meta');e.setAttribute('property','og:url');return e;});
  setMeta('meta[property="og:type"]',p?'product':'website',()=>{const e=document.createElement('meta');e.setAttribute('property','og:type');return e;});
  setMeta('meta[name="twitter:card"]','summary_large_image',()=>{const e=document.createElement('meta');e.name='twitter:card';return e;});
  setMeta('meta[name="twitter:title"]',document.title,()=>{const e=document.createElement('meta');e.name='twitter:title';return e;});
  setMeta('meta[name="twitter:description"]',seo.description,()=>{const e=document.createElement('meta');e.name='twitter:description';return e;});
  setMeta('meta[name="twitter:image"]',absoluteImage,()=>{const e=document.createElement('meta');e.name='twitter:image';return e;});

  const canonical=ensureMeta('link[rel="canonical"]',()=>{const e=document.createElement('link');e.rel='canonical';return e;});
  canonical.href=canonicalUrl;

  let schema=document.getElementById('seo-jsonld');
  if(!schema){
    schema=document.createElement('script');
    schema.type='application/ld+json';
    schema.id='seo-jsonld';
    document.head.appendChild(schema);
  }

  const graph=[{
    '@type':'OnlineStore',
    '@id':`${SITE_ORIGIN}/#store`,
    name:'WJ NOIR',
    url:`${SITE_ORIGIN}/`,
    logo:`${SITE_ORIGIN}/assets/wj-noir-logo.png`,
    email:'wjnoir@gmail.com',
    sameAs:[
      'https://www.instagram.com/wjnoir',
      'https://www.tiktok.com/@wj.noir'
    ]
  }];

  if(p){
    graph.push({
      '@type':'Product',
      '@id':`${canonicalUrl}#product`,
      name:`WJ NOIR ${p.title}`,
      brand:{'@type':'Brand',name:'WJ NOIR'},
      description:p.description,
      image:(p.gallery||[p.image]).map(file=>new URL(ASSET+file,SITE_ORIGIN).href),
      category:'Eau de Parfum',
      size:'50 ml',
      url:canonicalUrl,
      offers:{
        '@type':'Offer',
        url:canonicalUrl,
        priceCurrency:'PKR',
        price:String(p.price),
        itemCondition:'https://schema.org/NewCondition'
      }
    });
  }
  schema.textContent=JSON.stringify({'@context':'https://schema.org','@graph':graph});
}
function navigateTo(path){history.pushState({},'',path);route();}
function route(){
  const path=routePath();
  if(adminChannel){getSupabase().then(client=>client.removeChannel(adminChannel)).catch(error=>console.error('Unable to close the admin live-update channel.',error));adminChannel=null;}
  const p=path.startsWith('/fragrance/')?fragrances.find(x=>x.id===path.split('/')[2]):undefined;
  document.body.classList.toggle('home-route',path==='/');
  if(path==='/checkout')app.innerHTML=checkoutPage();
  else if(path==='/order-confirmed')app.innerHTML=confirmationPage();
  else if(path==='/admin')app.innerHTML=adminPage();
  else app.innerHTML=path==='/'?home():path==='/shop'?shop():path==='/about'?about():p?product(p):notFound();
  updateSeo(path,p);
  window.scrollTo({top:0,behavior:'instant'});
  setupReveals();setupVideo();setupGallery();setupPurchaseControls();
  document.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>addToCart(btn.dataset.add,1)));
  if(path==='/checkout')setupCheckout();
  if(path==='/admin')setupAdmin();
  closeAll();
}
function closeAll(){
  document.querySelectorAll('.overlay').forEach(el=>{el.classList.remove('open');el.setAttribute('aria-hidden','true');});
  closeGalleryZoom();
  document.body.classList.remove('lock-scroll');
  document.getElementById('menu-toggle').setAttribute('aria-expanded','false');
  document.getElementById('search-toggle').setAttribute('aria-expanded','false');
}
function toggleOverlay(type){
  const layer=document.getElementById(`${type}-overlay`);
  const was=layer.classList.contains('open');
  closeAll();
  if(was)return;
  layer.classList.add('open');
  layer.setAttribute('aria-hidden','false');
  document.body.classList.add('lock-scroll');
  if(type==='menu')document.getElementById('menu-toggle').setAttribute('aria-expanded','true');
  if(type==='search'){
    const toggle=document.getElementById('search-toggle');
    const input=document.getElementById('search-input');
    toggle.setAttribute('aria-expanded','true');
    renderSearch();
    requestAnimationFrame(()=>{if(layer.classList.contains('open'))input.focus();});
  }
}
function showToast(message){
  const toast=document.getElementById('cart-toast');
  toast.textContent=message;
  toast.classList.add('is-visible');
  clearTimeout(showToast.timeout);
  showToast.timeout=setTimeout(()=>toast.classList.remove('is-visible'),2600);
}
function addToCart(id,quantity=1){
  if(!fragrances.some(p=>p.id===id)||!Number.isSafeInteger(quantity)||quantity<1)return;
  const item=cart.find(entry=>entry.id===id);
  if(item)item.quantity=Math.min(99,item.quantity+quantity);
  else cart.push({id,quantity:Math.min(99,quantity)});
  saveCart();showToast('Added to cart');
}
function buyNow(id,quantity=1){
  if(!fragrances.some(p=>p.id===id)||!Number.isSafeInteger(quantity)||quantity<1)return;
  checkoutDraft=[{id,quantity:Math.min(99,quantity)}];
  sessionStorage.setItem('wj-noir-checkout-draft',JSON.stringify(checkoutDraft));
  sessionStorage.setItem('wj-noir-checkout-from-cart','false');
  navigateTo('/checkout');
}
function readCheckoutDraft(){
  try{
    const saved=JSON.parse(sessionStorage.getItem('wj-noir-checkout-draft')||'null');
    return Array.isArray(saved)?saved.filter(item=>fragrances.some(p=>p.id===item?.id)&&Number.isSafeInteger(item.quantity)&&item.quantity>0&&item.quantity<=99):null;
  }catch(error){console.error('Unable to read the current checkout selection.',error);return null;}
}
function adjustCartQuantity(id,change){
  const item=cart.find(entry=>entry.id===id);
  if(!item)return;
  item.quantity=Math.max(1,Math.min(99,item.quantity+change));
  saveCart();
}
function removeFromCart(id){cart=cart.filter(item=>item.id!==id);saveCart();}
function cartItemMarkup(item){
  const p=fragrances.find(product=>product.id===item.id);
  if(!p)return '';
  return `<div class="bag-item"><img src="${ASSET+p.image}" alt="${escapeHtml(p.title)}"/><div><span class="eyebrow ink-muted">EAU DE PARFUM / 50 ML</span><h3>${escapeHtml(p.title)}</h3><strong>PKR ${p.price.toLocaleString('en-PK')}</strong><div class="bag-quantity"><button type="button" data-cart-adjust="-1" data-cart-id="${p.id}" aria-label="Remove one ${escapeHtml(p.title)}">−</button><span>QTY ${item.quantity}</span><button type="button" data-cart-adjust="1" data-cart-id="${p.id}" aria-label="Add one ${escapeHtml(p.title)}">+</button></div><button type="button" data-cart-remove="${p.id}" class="remove-link">REMOVE ×</button></div></div>`;
}
function renderBag(){
  const count=cartQuantity();
  document.getElementById('bag-count').textContent=count;
  document.getElementById('bag-count').hidden=count===0;
  document.getElementById('bag-heading-count').textContent=`(${count})`;
  const bagList=document.getElementById('bag-list');
  bagList.innerHTML=cart.length?cart.map(cartItemMarkup).join(''):`<div class="empty-bag"><span class="empty-icon">✧</span><h3>Your next signature awaits.</h3><p>Explore the collection and find a fragrance that speaks to you.</p><a href="/shop" class="button dark-btn" data-close="bag">DISCOVER COLLECTION <span>↗</span></a></div>`;
  const footer=document.getElementById('bag-bottom');
  footer.hidden=cart.length===0;
  document.getElementById('bag-subtotal').textContent=`PKR ${cartSubtotal(cart).toLocaleString('en-PK')}`;
}
function currentCheckoutItems(){return checkoutDraft?.length?checkoutDraft:cart;}
function checkoutPage(){
  const items=currentCheckoutItems();
  if(!items.length)return `<main class="commerce-page checkout-page"><span class="eyebrow ink-muted">YOUR ORDER</span><h1>Your cart is empty.</h1><p>Discover the WJ NOIR collection and choose a signature.</p><a class="button dark-btn" href="/shop">DISCOVER THE COLLECTION <span>↗</span></a></main>`;
  const rows=items.map(item=>{
    const p=fragrances.find(product=>product.id===item.id);
    return p?`<div class="checkout-item"><img src="${ASSET+p.image}" alt=""/><div><strong>${escapeHtml(p.title)}</strong><span>50 ml · Eau de Parfum · Qty ${item.quantity}</span></div><b>PKR ${(p.price*item.quantity).toLocaleString('en-PK')}</b></div>`:'';
  }).join('');
  return `<main class="commerce-page checkout-page"><a class="commerce-back-link" href="/shop">← CONTINUE EXPLORING</a><div class="commerce-heading"><span class="eyebrow ink-muted">WJ NOIR / CHECKOUT</span><h1>Complete your <em>order.</em></h1><p>We will contact you to confirm delivery details.</p></div><div class="checkout-layout"><form id="checkout-form" class="checkout-form" novalidate><h2>Delivery details</h2><div class="checkout-field"><label for="customer-name">Full name</label><input id="customer-name" name="customer_name" autocomplete="name" maxlength="120" required/></div><div class="checkout-field"><label for="customer-email">Email</label><input id="customer-email" name="email" type="email" autocomplete="email" maxlength="254" required/></div><div class="checkout-field"><label for="customer-phone">Phone number</label><input id="customer-phone" name="phone" type="tel" autocomplete="tel" maxlength="30" required/><small>Include at least 10 digits.</small></div><div class="checkout-field"><label for="customer-address">Street address</label><input id="customer-address" name="address" autocomplete="street-address" maxlength="300" required/></div><div class="checkout-field-grid"><div class="checkout-field"><label for="customer-city">City</label><input id="customer-city" name="city" autocomplete="address-level2" maxlength="100" required/></div><div class="checkout-field"><label for="customer-state">State / province</label><input id="customer-state" name="state" autocomplete="address-level1" maxlength="100" required/></div><div class="checkout-field"><label for="customer-postal-code">Postal code</label><input id="customer-postal-code" name="postal_code" autocomplete="postal-code" maxlength="20" required/></div><div class="checkout-field"><label for="customer-country">Country</label><input id="customer-country" name="country" autocomplete="country-name" maxlength="100" required/></div></div><div class="checkout-field"><label for="order-notes">Order notes <span>(optional)</span></label><textarea id="order-notes" name="notes" rows="3" maxlength="1000"></textarea></div><fieldset class="payment-choice"><legend>Payment method</legend><label><input type="radio" name="payment_method" value="Cash on Delivery" checked/><span><strong>Cash on Delivery</strong><small>Pay when your order arrives.</small></span></label></fieldset><p id="checkout-error" class="form-message" role="alert" hidden></p><button id="place-order" type="submit" class="button dark-btn checkout-submit">PLACE ORDER · PKR ${cartSubtotal(items).toLocaleString('en-PK')}</button></form><aside class="checkout-summary"><h2>Order summary</h2>${rows}<div class="checkout-total"><span>Total</span><strong>PKR ${cartSubtotal(items).toLocaleString('en-PK')}</strong></div><p>50 ml · Eau de Parfum</p></aside></div></main>`;
}
function confirmationPage(){
  let confirmation=null;
  try{confirmation=JSON.parse(sessionStorage.getItem('wj-noir-confirmation')||'null');}
  catch(error){console.error('Unable to read the order confirmation.',error);}
  if(!confirmation?.orderNumber)return `<main class="commerce-page confirmation-page"><span class="eyebrow ink-muted">WJ NOIR</span><h1>Your order details are unavailable.</h1><a class="button dark-btn" href="/">RETURN HOME <span>↗</span></a></main>`;
  return `<main class="commerce-page confirmation-page"><span class="confirmation-mark" aria-hidden="true">✓</span><span class="eyebrow ink-muted">WJ NOIR / ORDER RECEIVED</span><h1>Thank you for your <em>order.</em></h1><p class="confirmation-order-number">ORDER ${escapeHtml(confirmation.orderNumber)}</p><p>We have received your order and will contact you soon. A confirmation email will be sent to <strong>${escapeHtml(confirmation.email)}</strong>.</p><div class="confirmation-total"><span>Order total · Cash on Delivery</span><strong>PKR ${Number(confirmation.total).toLocaleString('en-PK')}</strong></div><a class="button dark-btn" href="/">RETURN TO WJ NOIR <span>↗</span></a></main>`;
}
async function getSupabase(){
  if(!supabaseClientPromise){
    supabaseClientPromise=(async()=>{
      if(!backendConfigPromise)backendConfigPromise=fetch('/api/config',{headers:{Accept:'application/json'},cache:'no-store'}).then(async response=>{
        if(!response.ok)throw new Error('Online ordering is not configured for this deployment. Set the Supabase environment variables and run the Vercel development server.');
        return response.json();
      });
      const config=await backendConfigPromise;
      if(!config.supabaseUrl||!config.supabaseAnonKey)throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in the deployment environment.');
      const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
      return createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    })();
  }
  return supabaseClientPromise;
}
function setupCheckout(){
  const form=document.getElementById('checkout-form');
  if(!form)return;
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const errorMessage=document.getElementById('checkout-error');
    const submit=document.getElementById('place-order');
    errorMessage.hidden=true;
    const phone=form.elements.phone.value.trim();
    if(!/^[+\d\s().-]+$/.test(phone)||phone.replace(/\D/g,'').length<10){
      errorMessage.textContent='Enter a valid phone number with at least 10 digits.';
      errorMessage.hidden=false;
      form.elements.phone.focus();
      return;
    }
    if(!form.reportValidity())return;
    const items=currentCheckoutItems();
    if(!items.length){errorMessage.textContent='Your cart is empty.';errorMessage.hidden=false;return;}
    if(checkoutSubmitting)return;
    checkoutSubmitting=true;submit.disabled=true;submit.textContent='PLACING YOUR ORDER…';
    try{
      const client=await getSupabase();
      const values=Object.fromEntries(new FormData(form).entries());
      const {data,error}=await client.rpc('create_order',{
        p_customer_name:String(values.customer_name).trim(),
        p_email:String(values.email).trim(),
        p_phone:phone,
        p_address:String(values.address).trim(),
        p_city:String(values.city).trim(),
        p_state:String(values.state).trim(),
        p_postal_code:String(values.postal_code).trim(),
        p_country:String(values.country).trim(),
        p_notes:String(values.notes||'').trim(),
        p_payment_method:'Cash on Delivery',
        p_items:items.map(item=>({product_id:item.id,quantity:item.quantity}))
      });
      if(error)throw new Error(error.message);
      if(!data?.order_number||!Number.isFinite(Number(data.total_amount)))throw new Error('The order was saved, but its confirmation details were incomplete. Please contact WJ NOIR before placing another order.');
      const orderTotal=Number(data.total_amount);
      sessionStorage.setItem('wj-noir-confirmation',JSON.stringify({orderNumber:data.order_number,email:String(values.email).trim(),total:orderTotal}));
      if(sessionStorage.getItem('wj-noir-checkout-from-cart')==='true'){cart=[];saveCart();}
      sessionStorage.removeItem('wj-noir-checkout-draft');
      sessionStorage.removeItem('wj-noir-checkout-from-cart');
      checkoutDraft=null;
      navigateTo('/order-confirmed');
    }catch(error){
      console.error('Unable to place the WJ NOIR order.',error);
      errorMessage.textContent=error.message||'We could not place your order. Please try again.';
      errorMessage.hidden=false;
    }finally{
      checkoutSubmitting=false;
      if(document.getElementById('place-order')){submit.disabled=false;submit.textContent=`PLACE ORDER · PKR ${cartSubtotal(currentCheckoutItems()).toLocaleString('en-PK')}`;}
    }
  });
}
function adminPage(){return `<main class="commerce-page admin-page"><div id="admin-content"><span class="eyebrow ink-muted">WJ NOIR / PRIVATE</span><h1>Orders.</h1><p>Checking admin access…</p></div></main>`;}
function adminLogin(message=''){
  app.innerHTML=`<main class="commerce-page admin-page"><div id="admin-content"><div class="admin-login"><span class="eyebrow ink-muted">WJ NOIR / PRIVATE</span><h1>Orders.</h1><p>Sign in with your authorized admin account.</p><form id="admin-login-form" class="checkout-form"><div class="checkout-field"><label for="admin-email">Email</label><input id="admin-email" name="email" type="email" autocomplete="username" required/></div><div class="checkout-field"><label for="admin-password">Password</label><input id="admin-password" name="password" type="password" autocomplete="current-password" required/></div><p id="admin-login-error" class="form-message" role="alert" ${message?'':'hidden'}>${escapeHtml(message)}</p><button type="submit" class="button dark-btn checkout-submit">SIGN IN</button></form></div></div></main>`;
  document.getElementById('admin-login-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector('button'),errorBox=document.getElementById('admin-login-error');
    errorBox.hidden=true;button.disabled=true;button.textContent='SIGNING IN…';
    try{
      const client=await getSupabase(),values=new FormData(form);
      const {error}=await client.auth.signInWithPassword({email:String(values.get('email')).trim(),password:String(values.get('password'))});
      if(error)throw new Error(error.message);
      const {data,error:isAdminError}=await client.rpc('is_order_admin');
      if(isAdminError)throw new Error(isAdminError.message);
      if(data!==true){await client.auth.signOut();throw new Error('This account is not authorized to access orders.');}
      await loadAdminDashboard(client);
    }catch(error){console.error('Admin sign-in failed.',error);errorBox.textContent=error.message||'Sign-in failed.';errorBox.hidden=false;}
    finally{button.disabled=false;button.textContent='SIGN IN';}
  });
}
async function setupAdmin(){
  adminLogin();
  try{
    const client=await getSupabase();
    const {data:{session},error}=await client.auth.getSession();
    if(error)throw new Error(error.message);
    if(!session)return;
    const {data,error:isAdminError}=await client.rpc('is_order_admin');
    if(isAdminError)throw new Error(isAdminError.message);
    if(data!==true){await client.auth.signOut();adminLogin('This account is not authorized to access orders.');return;}
    await loadAdminDashboard(client);
  }catch(error){console.error('Unable to verify the admin session.',error);adminLogin(error.message||'Unable to verify admin access.');}
}
async function loadAdminDashboard(client){
  await refreshAdminOrders(client);
  if(adminChannel)return;
  adminChannel=client.channel('wj-noir-admin-orders')
    .on('postgres_changes',{event:'*',schema:'public',table:'orders'},()=>refreshAdminOrders(client).catch(error=>console.error('Unable to refresh admin orders.',error)))
    .subscribe((status,error)=>{
      if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
        console.error('Admin order live updates are unavailable.',error);
        showToast('Live updates are unavailable. Refresh to check for new orders.');
      }
    });
}
async function refreshAdminOrders(client){
  const {data,error}=await client.from('orders').select('*, order_items(*)').order('created_at',{ascending:false});
  if(error)throw new Error(error.message);
  adminOrders=data||[];
  renderAdminDashboard(client);
}
function renderAdminDashboard(client){
  const root=document.getElementById('admin-content');
  if(!root)return;
  const totalRevenue=adminOrders.filter(order=>order.status!=='cancelled').reduce((sum,order)=>sum+Number(order.total_amount),0);
  root.innerHTML=`<div class="admin-heading"><div><span class="eyebrow ink-muted">WJ NOIR / PRIVATE</span><h1>Orders.</h1></div><div class="admin-heading-actions"><button type="button" id="admin-delete-all" class="admin-danger" ${adminOrders.length?'':'disabled'}>DELETE ALL ORDERS</button><button type="button" id="admin-logout" class="admin-logout">SIGN OUT</button></div></div><div class="admin-stats"><article><span>TOTAL ORDERS</span><strong>${adminOrders.length}</strong></article><article><span>REVENUE · EXCLUDING CANCELLED</span><strong>PKR ${totalRevenue.toLocaleString('en-PK')}</strong></article></div><div class="admin-tools"><label class="sr-only" for="admin-search">Search orders</label><input id="admin-search" placeholder="Search name, email, phone or order number"/><label class="sr-only" for="admin-status-filter">Filter by status</label><select id="admin-status-filter"><option value="">All statuses</option>${['pending','confirmed','shipped','delivered','cancelled'].map(status=>`<option value="${status}">${status}</option>`).join('')}</select></div><div id="admin-order-list" class="admin-order-list"></div>`;
  document.getElementById('admin-logout').addEventListener('click',async()=>{
    const {error}=await client.auth.signOut();
    if(error){console.error('Admin sign-out failed.',error);showToast('Unable to sign out. Please try again.');return;}
    adminOrders=[];route();
  });
  document.getElementById('admin-delete-all')?.addEventListener('click',async()=>{
    if(!adminOrders.length){showToast('There are no orders to delete.');return;}
    const typed=window.prompt('This permanently deletes every order and its line items. Type DELETE ALL to continue.');
    if(typed!=='DELETE ALL'){showToast('Delete all cancelled.');return;}
    if(!window.confirm(`Permanently delete all ${adminOrders.length} orders? This cannot be undone.`))return;

    const button=document.getElementById('admin-delete-all');
    button.disabled=true;
    const originalText=button.textContent;
    button.textContent='DELETING...';
    try{
      const {data:sessionData,error:sessionError}=await client.auth.getSession();
      if(sessionError)throw new Error(sessionError.message);
      const accessToken=sessionData?.session?.access_token;
      if(!accessToken)throw new Error('Your admin session expired. Please sign in again.');

      const response=await fetch('/api/delete-orders',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${accessToken}`
        },
        body:JSON.stringify({confirmation:'DELETE ALL'})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Orders could not be deleted.');

      selectedAdminOrderId=null;
      await refreshAdminOrders(client);
      showToast(`${Number(result.deleted||0).toLocaleString()} orders permanently deleted.`);
    }catch(error){
      console.error('Unable to delete all orders.',error);
      showToast(error.message||'Orders could not be deleted.');
      button.disabled=false;
      button.textContent=originalText;
    }
  });
  document.getElementById('admin-search').addEventListener('input',renderAdminOrders);
  document.getElementById('admin-status-filter').addEventListener('change',renderAdminOrders);
  renderAdminOrders();
}
function renderAdminOrders(){
  const container=document.getElementById('admin-order-list');
  if(!container)return;
  const query=(document.getElementById('admin-search')?.value||'').trim().toLowerCase();
  const status=document.getElementById('admin-status-filter')?.value||'';
  const filtered=adminOrders.filter(order=>{
    const matchesStatus=!status||order.status===status;
    const matchesQuery=[order.order_number,order.customer_name,order.email,order.phone].some(value=>String(value||'').toLowerCase().includes(query));
    return matchesStatus&&matchesQuery;
  });
  if(!filtered.length){container.innerHTML='<p class="admin-empty">No orders match your search.</p>';return;}
  container.innerHTML=filtered.map(order=>{
    const isOpen=selectedAdminOrderId===order.id;
    const items=(order.order_items||[]).map(item=>`<div class="admin-detail-item"><span>${escapeHtml(item.product_name)} · ${item.size_ml} ml × ${item.quantity}</span><strong>PKR ${(Number(item.unit_price)*item.quantity).toLocaleString('en-PK')}</strong></div>`).join('');
    const address=[order.address,order.city,order.state,order.postal_code,order.country].filter(Boolean).map(escapeHtml).join(', ');
    return `<article class="admin-order-card"><button class="admin-order-toggle" type="button" data-order-detail="${order.id}" aria-expanded="${isOpen}"><span><strong>${escapeHtml(order.order_number)}</strong><small>${escapeHtml(order.customer_name)} · ${new Date(order.created_at).toLocaleString()}</small></span><span class="admin-order-total">PKR ${Number(order.total_amount).toLocaleString('en-PK')}</span><span class="admin-status admin-status--${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></button>${isOpen?`<div class="admin-order-details"><p><strong>Email</strong> <a href="mailto:${escapeHtml(order.email)}">${escapeHtml(order.email)}</a></p><p><strong>Phone</strong> ${escapeHtml(order.phone)}</p><p><strong>Address</strong> ${address}</p><p><strong>Payment</strong> ${escapeHtml(order.payment_method)}</p>${order.notes?`<p><strong>Notes</strong> ${escapeHtml(order.notes)}</p>`:''}<div class="admin-detail-items">${items}</div><div class="admin-order-actions"><label class="admin-status-control">Update status<select data-order-status="${order.id}">${['pending','confirmed','shipped','delivered','cancelled'].map(value=>`<option value="${value}" ${value===order.status?'selected':''}>${value}</option>`).join('')}</select></label><button type="button" class="admin-delete-order" data-delete-order="${order.id}" data-delete-order-number="${escapeHtml(order.order_number)}">DELETE ORDER</button></div></div>`:''}</article>`;
  }).join('');
  container.querySelectorAll('[data-order-detail]').forEach(button=>button.addEventListener('click',()=>{selectedAdminOrderId=selectedAdminOrderId===button.dataset.orderDetail?null:button.dataset.orderDetail;renderAdminOrders();}));
  container.querySelectorAll('[data-delete-order]').forEach(button=>button.addEventListener('click',async()=>{
    const orderId=button.dataset.deleteOrder;
    const orderNumber=button.dataset.deleteOrderNumber||'this order';
    if(!window.confirm(`Permanently delete ${orderNumber}? This cannot be undone.`))return;

    button.disabled=true;
    const originalText=button.textContent;
    button.textContent='DELETING...';

    try{
      const client=await getSupabase();
      const {data:sessionData,error:sessionError}=await client.auth.getSession();
      if(sessionError)throw new Error(sessionError.message);
      const accessToken=sessionData?.session?.access_token;
      if(!accessToken)throw new Error('Your admin session expired. Please sign in again.');

      const response=await fetch('/api/delete-orders',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${accessToken}`
        },
        body:JSON.stringify({orderId})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Order could not be deleted.');

      if(selectedAdminOrderId===orderId)selectedAdminOrderId=null;
      await refreshAdminOrders(client);
      showToast(`${orderNumber} permanently deleted.`);
    }catch(error){
      console.error('Unable to delete order.',error);
      showToast(error.message||'Order could not be deleted.');
      button.disabled=false;
      button.textContent=originalText;
    }
  }));
  container.querySelectorAll('[data-order-status]').forEach(select=>select.addEventListener('change',async()=>{
    const orderId=select.dataset.orderStatus;
    const nextStatus=select.value;
    select.disabled=true;
    try{
      const client=await getSupabase();
      const {data:sessionData,error:sessionError}=await client.auth.getSession();
      if(sessionError)throw new Error(sessionError.message);
      const accessToken=sessionData?.session?.access_token;
      if(!accessToken)throw new Error('Your admin session expired. Please sign in again.');

      const {error}=await client.from('orders').update({status:nextStatus}).eq('id',orderId);
      if(error)throw new Error(error.message);

      let emailWarning='';
      if(['confirmed','shipped','delivered','cancelled'].includes(nextStatus)){
        try{
          const response=await fetch('/api/order-status-email',{
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization':`Bearer ${accessToken}`
            },
            body:JSON.stringify({orderId,status:nextStatus})
          });
          const result=await response.json().catch(()=>({}));
          if(!response.ok)throw new Error(result.error||'Customer email could not be sent.');
        }catch(emailError){
          console.error('Order status updated, but customer email failed.',emailError);
          const safeMessage=String(emailError?.message||'Customer email could not be sent.').replace(/\s+/g,' ').trim();
          emailWarning=` Status updated, but email failed: ${safeMessage}`;
        }
      }

      await loadAdminDashboard(client);
      showToast(emailWarning||`Order marked ${nextStatus}. Customer email sent.`);
    }catch(error){
      console.error('Unable to update order status.',error);
      showToast(error.message||'Order status could not be updated.');
      select.disabled=false;
    }
  }));
}
function setupGlobalCommerceActions(){
  document.addEventListener('click',event=>{
    const internalLink=event.target.closest('a[href^="/"]');
    if(internalLink&&!event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&internalLink.target!=='_blank'){
      const url=new URL(internalLink.href,window.location.origin);
      if(url.origin===window.location.origin){
        event.preventDefault();
        closeAll();
        navigateTo(url.pathname+url.search);
        return;
      }
    }
    const adminTrigger=event.target.closest('[data-admin-trigger]');
    if(adminTrigger){
      adminTriggerClicks+=1;
      clearTimeout(adminTriggerTimeout);
      if(adminTriggerClicks===5){
        adminTriggerClicks=0;
        navigateTo('/admin');
      }else{
        adminTriggerTimeout=setTimeout(()=>{adminTriggerClicks=0;},2000);
      }
      return;
    }
    const adjust=event.target.closest('[data-cart-adjust]');
    if(adjust){adjustCartQuantity(adjust.dataset.cartId,Number(adjust.dataset.cartAdjust));return;}
    const remove=event.target.closest('[data-cart-remove]');
    if(remove){removeFromCart(remove.dataset.cartRemove);return;}
    const checkout=event.target.closest('[data-start-checkout]');
    if(checkout){
      checkoutDraft=null;
      sessionStorage.removeItem('wj-noir-checkout-draft');
      sessionStorage.setItem('wj-noir-checkout-from-cart','true');
      closeAll();navigateTo('/checkout');return;
    }
  });
}
function renderSearch(){const q=document.getElementById('search-input').value.trim().toLowerCase();const results=fragrances.filter(p=>!q||[p.title,p.category,p.tagline,...p.tones,...p.notes.map(n=>n.note)].join(' ').toLowerCase().includes(q));document.getElementById('search-results').innerHTML=results.length?results.map(p=>`<a class="search-result" href="/fragrance/${p.id}" data-close="search"><img src="${ASSET+p.image}" alt=""/><span><small>${p.category} · EAU DE PARFUM</small><strong>${p.title}</strong><small>${p.tones.join(' / ')}</small></span><i>↗</i></a>`).join(''):`<div class="search-empty">No fragrance matched your search. Try “woody”, “ice” or “vanilla”.</div>`;}
document.getElementById('menu-toggle').addEventListener('click',()=>toggleOverlay('menu'));
document.getElementById('search-toggle').addEventListener('click',()=>toggleOverlay('search'));
document.getElementById('bag-toggle').addEventListener('click',()=>toggleOverlay('bag'));
document.getElementById('search-input').addEventListener('input',renderSearch);
document.addEventListener('click',e=>{const closest=e.target.closest('[data-close]');if(closest)closeAll();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.querySelector('.product-image-zoom.is-open'))closeGalleryZoom();else closeAll();}});
document.getElementById('newsletter-form').addEventListener('submit',e=>{e.preventDefault();document.getElementById('newsletter-message').textContent='Preview only: connect your newsletter provider before launch.';});
document.getElementById('year').textContent=new Date().getFullYear();
window.addEventListener('hashchange',route);window.addEventListener('popstate',route);setupGlobalCommerceActions();renderBag();route();
window.addEventListener('load',()=>{setTimeout(()=>document.getElementById('loading-screen').classList.add('done'),100);});setTimeout(()=>document.getElementById('loading-screen').classList.add('done'),2800);
