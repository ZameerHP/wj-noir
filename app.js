const ASSET = '/assets/';
const defaultFragrances = [
  { id: 'the-office', title: 'The Office', upper: 'THE OFFICE', category: 'FOR HIM', tagline: 'Command the moment.', intro: 'Focus. Confidence. All day.', description: 'A confident blend of bright bergamot, aromatic lavender and a lasting woody finish.', story: 'Composed for those who know their presence speaks before they do.', image: 'wj-noir-the-office.jpg', altImage: 'the-office-poster.jpg', gallery: ['wj-noir-the-office.jpg','wj-noir-the-office-studio.jpg','wj-noir-the-office-water.jpg','wj-noir-the-office-box.jpg'], galleryAlt: ['WJ NOIR The Office fragrance on dark wet rocks','WJ NOIR The Office perfume bottle on a reflective white surface','WJ NOIR The Office perfume resting in dark reflective water','WJ NOIR The Office perfume in a black presentation box'], photoPosition: 'center', price: 2999, showPrice: true, tones: ['BERGAMOT', 'LAVENDER', 'WOODY'], notes: [{type:'TOP NOTE',note:'Bergamot',description:'Citrus & fresh'},{type:'HEART NOTE',note:'Lavender',description:'Floral & aromatic'},{type:'BASE NOTE',note:'Woody',description:'Warm & masculine'}], number:'01', texture:'#2b241e' },
  { id: 'ice-desire', title: 'Ice Desire', upper: 'ICE DESIRE', category: 'FOR HIM', tagline: 'A cooler kind of confidence.', intro: 'The allure of the unexpected.', description: 'A rush of crystalline freshness, cool mountain air and quiet confidence.', story: 'For the moment everything stands still, and only your presence remains.', image: 'wj-noir-ice-desire.jpg', altImage: 'dark-collection-alt.webp', gallery: ['wj-noir-ice-desire.jpg','wj-noir-ice-desire-water.jpg','wj-noir-ice-desire-studio.jpg','wj-noir-ice-desire-box.jpg'], galleryAlt: ['WJ NOIR Ice Desire perfume among ice and dark water','WJ NOIR Ice Desire perfume among ice on dark wet rocks','WJ NOIR Ice Desire perfume bottle on a reflective white surface','WJ NOIR Ice Desire perfume in a black presentation box'], video: 'wj-noir-ice-desire-film.mp4', photoPosition: 'center', price: 2499, showPrice: true, tones: ['FRESH', 'COOL', 'REFINED'], notes: [{type:'CHARACTER',note:'Icy freshness',description:'Cool & invigorating'},{type:'FEELING',note:'Crystal clarity',description:'Clean & luminous'},{type:'IMPRESSION',note:'Modern elegance',description:'Distinct & refined'}], number:'02', texture:'#becbd0' },
  { id: 'levoria', title: 'Lévoria', upper: 'LÉVORIA', category: 'FOR HER', tagline: 'A softer form of power.', intro: 'Elegance is unforgettable.', description: 'Golden vanilla, luminous fruits and warm woods in a graceful, lasting signature.', story: 'A fragrance that feels like the first golden light of evening.', image: 'wj-noir-levoria.jpg', altImage: 'dark-collection.webp', gallery: ['wj-noir-levoria-studio.jpg','wj-noir-levoria-box.jpg','wj-noir-levoria-model.jpg','wj-noir-levoria.jpg'], galleryAlt: ['WJ NOIR Lévoria for her perfume bottle on a clean white background','WJ NOIR Lévoria perfume presented in a black gift box','A woman holding the WJ NOIR Lévoria for her perfume','WJ NOIR Lévoria perfume bottle with warm gold accents'], video: 'wj-noir-levoria-film.mp4', photoPosition: 'center', price: 2499, showPrice: true, tones: ['VANILLA', 'FRUITY', 'WOODY'], notes: [{type:'TOP NOTE',note:'Vanilla',description:'Sweet & gourmand'},{type:'HEART NOTE',note:'Fruity',description:'Juicy & elegant'},{type:'BASE NOTE',note:'Woody',description:'Warm & lasting'}], number:'03', texture:'#8c5553' }
];

function loadStoredCustomProducts(){
  try {
    const raw = localStorage.getItem('wj-noir-custom-products');
    if(!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch(e) {
    return [];
  }
}

let fragrances = [...defaultFragrances, ...loadStoredCustomProducts()];

function resolveAssetUrl(src){
  if(!src) return '/assets/dark-collection.webp';
  if(src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')){
    return src;
  }
  return ASSET + src;
}
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
let activeSale = {
  id: 'active',
  is_active: true,
  campaign_title: '11.11 BIG SALE',
  discount_percentage: 16.67,
  target_type: 'all',
  target_category: 'FOR HIM',
  target_product_ids: ['the-office', 'ice-desire', 'levoria'],
  start_date: null,
  end_date: null,
  banner_image: '/assets/wj-noir-11-11-sale-banner.jpg',
  custom_prices: {
    'the-office': 2499,
    'ice-desire': 2082,
    'levoria': 1999
  }
};
let saleCountdownInterval=null;
let salePopupTimer=null;
let catalogRealtimeChannel=null;

try {
  const cached = JSON.parse(localStorage.getItem('wj-noir-sale-settings-cache') || 'null');
  if (cached && typeof cached === 'object') {
    activeSale = {
      ...activeSale,
      ...cached,
      custom_prices: {
        ...activeSale.custom_prices,
        ...(cached.custom_prices || {})
      }
    };
  }
} catch(e) {}

function loadDeletedProductIds(){
  try {
    const fromSale = activeSale?.custom_prices?.__deleted_ids;
    if (Array.isArray(fromSale)) return fromSale;
    const raw = localStorage.getItem('wj-noir-deleted-products');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) {
    return [];
  }
}

function loadOutOfStockIds(){
  try {
    const fromSale = activeSale?.custom_prices?.__out_of_stock_ids;
    if (Array.isArray(fromSale)) return fromSale;
    const raw = localStorage.getItem('wj-noir-out-of-stock-products');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) {
    return [];
  }
}

function isProductOutOfStock(productId){
  return loadOutOfStockIds().includes(productId);
}

function isProductDeleted(productId){
  return loadDeletedProductIds().includes(productId);
}

function updateMenuDrawerScents(){
  const container = document.querySelector('.menu-scents');
  if(!container) return;
  container.innerHTML = `<p class="menu-section-label">OUR FRAGRANCES</p>` +
    fragrances.map(p => `
      <a class="menu-scent" href="/fragrance/${p.id}" data-close="menu">
        <span>${p.number}</span>
        <span>${escapeHtml(p.title)}${p.outOfStock ? ' <small style="font-size:9px;color:#b91c1c;letter-spacing:.08em;margin-left:6px">OUT OF STOCK</small>' : ''}</span>
        <span aria-hidden="true">↗</span>
      </a>
    `).join('');
}

function rebuildFragrancesCatalog(){
  const deletedIds = loadDeletedProductIds();
  const oosIds = loadOutOfStockIds();
  const customList = loadStoredCustomProducts().filter(cp => !deletedIds.includes(cp.id));
  const activeDefaults = defaultFragrances.filter(df => !deletedIds.includes(df.id));
  const combined = [...activeDefaults, ...customList];
  fragrances = combined.map((p, idx) => ({
    ...p,
    number: String(idx + 1).padStart(2, '0'),
    outOfStock: oosIds.includes(p.id)
  }));
  const prevLen = cart.length;
  cart = cart.filter(item => fragrances.some(p => p.id === item.id));
  if (cart.length !== prevLen) {
    try { localStorage.setItem(cartStorageKey, JSON.stringify(cart)); } catch(e){}
  }
  updateMenuDrawerScents();
}

rebuildFragrancesCatalog();

function refreshViewOnBackgroundSync(){
  rebuildFragrancesCatalog();
  renderBag();
  const path = routePath();
  if(path === '/admin'){
    if(document.querySelector('.admin-navbar')){
      getSupabase().then(client => renderAdminDashboard(client)).catch(()=>{});
    }
    return;
  }
  if(path === '/checkout' && document.getElementById('checkout-form')){
    return;
  }
  route();
}

function getProductPricing(p){
  if(!p) return { isSale:false, originalPrice:0, finalPrice:0, discountPercent:0 };
  const orig = Number(p.price) || 0;
  if(!activeSale || !activeSale.is_active){
    return { isSale:false, originalPrice:orig, finalPrice:orig, discountPercent:0 };
  }
  const now = new Date();
  if(activeSale.start_date && new Date(activeSale.start_date) > now){
    return { isSale:false, originalPrice:orig, finalPrice:orig, discountPercent:0 };
  }
  if(activeSale.end_date && new Date(activeSale.end_date) < now){
    return { isSale:false, originalPrice:orig, finalPrice:orig, discountPercent:0 };
  }

  // 1. Separate custom product sale price
  if(activeSale.custom_prices && activeSale.custom_prices[p.id] !== undefined && activeSale.custom_prices[p.id] !== null){
    const customVal = Number(activeSale.custom_prices[p.id]);
    if(customVal > 0 && customVal < orig){
      const discount = Math.round(((orig - customVal) / orig) * 100);
      return { isSale:true, originalPrice:orig, finalPrice:customVal, discountPercent:discount };
    } else if(customVal >= orig){
      return { isSale:false, originalPrice:orig, finalPrice:orig, discountPercent:0 };
    }
  }

  // 2. Scoped percentage fallback
  let applies = false;
  if(activeSale.target_type === 'all'){
    applies = true;
  } else if(activeSale.target_type === 'category'){
    applies = activeSale.target_category === p.category;
  } else if(activeSale.target_type === 'custom'){
    const list = Array.isArray(activeSale.target_product_ids) ? activeSale.target_product_ids : [];
    applies = list.includes(p.id);
  }
  if(!applies){
    return { isSale:false, originalPrice:orig, finalPrice:orig, discountPercent:0 };
  }
  const discount = Math.max(0, Math.min(100, Number(activeSale.discount_percentage) || 0));
  if(discount <= 0){
    return { isSale:false, originalPrice:orig, finalPrice:orig, discountPercent:0 };
  }
  const finalPrice = Math.round(orig * (1 - (discount / 100)));
  return { isSale:true, originalPrice:orig, finalPrice, discountPercent:discount };
}

async function fetchSaleSettings(){
  try {
    const client = await getSupabase();
    const { data, error } = await client.from('sale_settings').select('*').eq('id', 'active').maybeSingle();
    if(!error && data){
      activeSale = {
        ...activeSale,
        ...data,
        custom_prices: (data.custom_prices && typeof data.custom_prices === 'object')
          ? data.custom_prices
          : (activeSale?.custom_prices || { 'the-office': 2499, 'ice-desire': 2082, 'levoria': 1999 })
      };
      if(Array.isArray(activeSale.custom_prices?.__deleted_ids)){
        localStorage.setItem('wj-noir-deleted-products', JSON.stringify(activeSale.custom_prices.__deleted_ids));
      }
      if(Array.isArray(activeSale.custom_prices?.__out_of_stock_ids)){
        localStorage.setItem('wj-noir-out-of-stock-products', JSON.stringify(activeSale.custom_prices.__out_of_stock_ids));
      }
      if(Array.isArray(activeSale.custom_prices?.__custom_products)){
        localStorage.setItem('wj-noir-custom-products', JSON.stringify(activeSale.custom_prices.__custom_products));
      }
      try { localStorage.setItem('wj-noir-sale-settings-cache', JSON.stringify(activeSale)); } catch(e){}
      refreshViewOnBackgroundSync();
      checkAndShowSalePopup();
      return;
    }
  } catch(err) {
    // Falls back to cached activeSale
  }
  if(activeSale){
    refreshViewOnBackgroundSync();
    checkAndShowSalePopup();
  }
}

async function fetchProductsFromDatabase(){
  try {
    const client = await getSupabase();
    const { data, error } = await client.from('products').select('*').order('created_at', { ascending: true });
    if(!error && Array.isArray(data)){
      const deletedIds = loadDeletedProductIds();
      const dbCustom = data
        .filter(row => !defaultFragrances.some(df => df.id === row.id) && !deletedIds.includes(row.id))
        .map(row => ({
          id: row.id,
          title: row.title,
          upper: row.upper || row.title.toUpperCase(),
          category: row.category,
          tagline: row.tagline || '',
          intro: row.intro || '',
          description: row.description || '',
          story: row.story || row.tagline || '',
          image: row.image,
          altImage: row.alt_image || row.image,
          gallery: Array.isArray(row.gallery) && row.gallery.length ? row.gallery : [row.image, row.image],
          photoPosition: 'center',
          price: Number(row.price),
          showPrice: row.show_price ?? true,
          tones: Array.isArray(row.tones) ? row.tones : [],
          notes: Array.isArray(row.notes) ? row.notes : [],
          number: row.number || '04',
          texture: '#1a1a1a',
          isCustom: true
        }));
      const fallbackCustom = Array.isArray(activeSale?.custom_prices?.__custom_products)
        ? activeSale.custom_prices.__custom_products.filter(cp => !deletedIds.includes(cp.id))
        : [];
      const mergedCustom = [...dbCustom];
      fallbackCustom.forEach(fc => {
        if(!mergedCustom.some(mc => mc.id === fc.id)) mergedCustom.push(fc);
      });
      localStorage.setItem('wj-noir-custom-products', JSON.stringify(mergedCustom));
      refreshViewOnBackgroundSync();
    }
  } catch(e) {}
}

function setupPublicCatalogRealtimeSync(){
  if(catalogRealtimeChannel) return;
  getSupabase().then(client => {
    if(catalogRealtimeChannel) return;
    catalogRealtimeChannel = client.channel('wj-noir-public-catalog-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_settings' }, () => {
        fetchSaleSettings();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchProductsFromDatabase();
      })
      .subscribe();
  }).catch(() => {});
}

const cartQuantity = () => cart.reduce((total,item)=>total+item.quantity,0);
const cartSubtotal = items => items.reduce((total,item)=>{
  const p = fragrances.find(prod=>prod.id===item.id);
  return total + (getProductPricing(p).finalPrice)*item.quantity;
},0);
function saveCart(){
  try { localStorage.setItem(cartStorageKey,JSON.stringify(cart)); }
  catch(error) { console.error('Unable to persist the WJ NOIR cart.',error); showToast('Your cart could not be saved on this device.'); }
  renderBag();
}
const arrow = `<span class="arrow-icon" aria-hidden="true">↗</span>`;
const buttonLink = (href, title, variant='light') => `<a class="button ${variant === 'light' ? 'light-btn' : 'outline-btn'}" href="${href}"><span>${title}</span>${arrow}</a>`;
function card(p, extra='', reveal=true) {
  const pricing = getProductPricing(p);
  const isOOS = Boolean(p.outOfStock || isProductOutOfStock(p.id));
  const priceMarkup = isOOS
    ? `<p class="product-card-price"><span class="price-original">PKR ${pricing.originalPrice.toLocaleString('en-PK')}</span> <strong class="price-out-of-stock">OUT OF STOCK</strong></p>`
    : (pricing.isSale
      ? `<p class="product-card-price"><span class="price-original">PKR ${pricing.originalPrice.toLocaleString('en-PK')}</span> <strong class="price-sale">PKR ${pricing.finalPrice.toLocaleString('en-PK')}</strong></p>`
      : (p.showPrice ? `<p class="product-card-price">PKR ${pricing.originalPrice.toLocaleString('en-PK')}</p>` : ''));
  const badge = isOOS
    ? `<span class="sale-badge out-of-stock-badge">OUT OF STOCK</span>`
    : (pricing.isSale
      ? `<span class="sale-badge">-${Math.round(pricing.discountPercent)}%</span>`
      : '');

  const totalCatalogCount = String(fragrances.length).padStart(2, '0');
  return `<article class="product-card ${extra} ${isOOS ? 'is-out-of-stock' : ''} ${reveal?'reveal':''}">
    <a class="product-image-wrap" href="/fragrance/${p.id}" aria-label="Discover ${escapeHtml(p.title)}">
      <img loading="lazy" decoding="async" src="${resolveAssetUrl(p.image)}" alt="WJ NOIR ${escapeHtml(p.title)} fragrance" style="object-position:${p.photoPosition}"/>
      ${badge}
      <span class="product-hover">${isOOS ? 'OUT OF STOCK · VIEW DETAILS ↗' : 'DISCOVER FRAGRANCE ↗'}</span>
      <span class="product-number">${p.number} / ${totalCatalogCount}</span>
    </a>
    <div class="product-card-info">
      <div>
        <span class="eyebrow">${p.category} · EAU DE PARFUM</span>
        <h3>${escapeHtml(p.title)}</h3>
        <p>${p.tagline}</p>
        ${priceMarkup}
      </div>
      <a class="round-arrow" aria-label="View ${escapeHtml(p.title)}" href="/fragrance/${p.id}">↗</a>
    </div>
  </article>`;
}
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
function shop() { return `<main class="interior-page"><section class="page-intro shop-intro"><span class="eyebrow ink-muted">WJ NOIR / THE COLLECTION</span><h1>Find your <em>signature.</em></h1><p>Three distinct expressions of the unforgettable. Discover your world.</p></section><div class="shop-filter-row"><span>THE COMPLETE COLLECTION / ${String(fragrances.length).padStart(2, '0')}</span><span>EAU DE PARFUM · 50 ML</span></div><section class="shop-products section-pad"><div class="products-grid">${fragrances.map(p=>card(p)).join('')}</div></section><section class="shop-visual"><img src="${ASSET}dark-collection-alt.webp" alt="WJ NOIR fragrance collection on glossy black rocks" loading="lazy"/><div class="shop-visual-copy"><span class="eyebrow">A WORLD OF DISTINCTION</span><h2>THE NOIR <em>EDIT.</em></h2></div></section></main>`; }
function about() {
  return `<main class="interior-page about-editorial-page">
    <section class="about-editorial-intro section-pad reveal">
      <span class="eyebrow ink-muted">THE HOUSE OF WJ NOIR · OUR STORY</span>
      <h1>Wear your presence.<br/><em>Leave your story.</em></h1>
      <p class="about-hero-sub">WJ NOIR was founded on a singular conviction: that true luxury never shouts. An entrance you feel. An impression that stays.</p>
    </section>

    <section class="about-fullbleed-section section-pad">
      <div class="about-fullbleed-wrap reveal">
        <img loading="eager" decoding="async" src="${ASSET}dark-collection-alt.webp" alt="WJ NOIR signature fragrance collection on dark alpine stone and water"/>
        <div class="about-fullbleed-caption">
          <span>THE NOIR SIGNATURE</span>
          <span>50 ML EAU DE PARFUM · COMPOSED IN PAKISTAN</span>
        </div>
      </div>
    </section>

    <section class="about-philosophy-section section-pad">
      <div class="about-philosophy-grid reveal">
        <div class="about-philosophy-label">
          <span class="eyebrow ink-muted">THE HOUSE PHILOSOPHY</span>
        </div>
        <div class="about-philosophy-body">
          <h2>A scent can say<br/>what words <em>cannot.</em></h2>
          <p class="about-philosophy-lead">We believe a fragrance is your unwritten introduction. It does not exist to blend in or mask the moment — it exists to command it.</p>
          <p>Every formula in the WJ NOIR house is composed with meticulous restraint: from the sharp, focused confidence of <em>The Office</em>, to the crystalline freshness of <em>Ice Desire</em>, to the intimate golden allure of <em>Lévoria</em>. Three distinct expressions, each crafted to become unmistakably yours.</p>
        </div>
      </div>
    </section>

    <section class="about-editorial-cta section-pad reveal">
      <div class="about-cta-card">
        <span class="eyebrow light-muted">WJ NOIR / THE INVITATION</span>
        <h2>YOUR NEXT<br/><em>SIGNATURE.</em></h2>
        <a class="button light-btn" href="/shop"><span>EXPLORE THE COLLECTION</span><span class="arrow-icon">↗</span></a>
      </div>
    </section>
  </main>`;
}
function product(p) {
  const related = fragrances.filter(other=>other.id!==p.id);
  const gallery = p.gallery || [p.image,p.altImage,p.image,p.altImage];
  const film = p.video || 'the-office-hero.mp4';
  const filmPoster = p.id === 'levoria' ? 'wj-noir-levoria-studio.jpg' : p.id === 'ice-desire' ? 'wj-noir-ice-desire-studio.jpg' : 'the-office-poster.jpg';
  const galleryMarkup = `<div class="product-gallery product-gallery--interactive" aria-label="${escapeHtml(p.title)} fragrance gallery">
        <div class="product-gallery-track" id="product-gallery-track" aria-label="Swipe through product images">
          ${gallery.map((image,index)=>`<figure class="product-gallery-slide" data-gallery-slide="${index}"><button type="button" class="product-gallery-zoom-trigger" data-gallery-zoom="${index}" aria-label="Zoom ${escapeHtml(p.title)} image ${index+1}"><img src="${resolveAssetUrl(image)}" data-fallback="${ASSET}dark-collection.webp" alt="${escapeHtml(p.galleryAlt?.[index]||`WJ NOIR ${p.title} fragrance photograph ${index+1}`)}" width="768" height="1024" loading="eager" fetchpriority="${index===0?'high':'low'}" decoding="async"/><span class="gallery-zoom-hint" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg></span></button></figure>`).join('')}
        </div>
        <div class="product-gallery-thumbnails" role="group" aria-label="Choose a product image">
          ${gallery.map((image,index)=>`<button type="button" class="product-gallery-thumbnail${index===0?' is-active':''}" data-gallery-index="${index}" aria-label="Show image ${index+1}" aria-pressed="${index===0}"><img src="${resolveAssetUrl(image)}" alt="" width="72" height="88" loading="${index===0?'eager':'lazy'}" fetchpriority="low" decoding="async"/></button>`).join('')}
        </div>
        <div class="product-image-zoom" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Zoomed ${escapeHtml(p.title)} product image">
          <button type="button" class="product-image-zoom-backdrop" data-gallery-zoom-close aria-label="Close zoomed image"></button>
          <button type="button" class="product-image-zoom-close" data-gallery-zoom-close aria-label="Close zoomed image">×</button>
          <img class="product-image-zoom-image" alt=""/>
        </div>
      </div>`;
  const pricing = getProductPricing(p);
  const isOOS = Boolean(p.outOfStock || isProductOutOfStock(p.id));
  const priceDisplayMarkup = pricing.isSale
    ? `<div class="product-detail-price-wrap">
        <div class="product-detail-prices">
          <span class="price-original">PKR ${pricing.originalPrice.toLocaleString('en-PK')}</span>
          <strong class="product-detail-price price-sale">PKR ${pricing.finalPrice.toLocaleString('en-PK')}</strong>
        </div>
        ${isOOS
          ? `<span class="sale-urgency-badge out-of-stock-urgency-badge">● Out of Stock</span>`
          : `<span class="sale-urgency-badge"><span class="sale-urgency-icon">⏳</span> Limited Time Offer</span>`
        }
      </div>
      ${(!isOOS && activeSale?.end_date) ? `<div id="sale-countdown" class="sale-countdown" data-end="${escapeHtml(activeSale.end_date)}"></div>` : ''}`
    : (p.showPrice ? `<div class="product-detail-price-wrap"><p class="product-detail-price">PKR ${pricing.originalPrice.toLocaleString('en-PK')}</p>${isOOS ? `<span class="sale-urgency-badge out-of-stock-urgency-badge">● Out of Stock</span>` : ''}</div>` : '');

  const infoMarkup = `<div class="product-info product-info--editorial">
        <div class="product-overview">
          <span class="eyebrow ink-muted">${p.category} / WJ NOIR</span>
          <h1>${escapeHtml(p.upper)}</h1>
          <p class="product-summary">${escapeHtml(p.description)}</p>
          ${priceDisplayMarkup}
          <p class="product-volume product-volume--compact">50 ml <span aria-hidden="true">·</span> Eau de Parfum</p>
        </div>
        <div class="product-purchase">
          <div class="quantity-label">QUANTITY</div>
          <div class="quantity-control${isOOS ? ' is-disabled-oos' : ''}" aria-label="Select quantity">
            <button type="button" data-quantity-adjust="-1" aria-label="Decrease quantity" ${isOOS ? 'disabled' : ''}>−</button>
            <output id="product-quantity" aria-live="polite">1</output>
            <button type="button" data-quantity-adjust="1" aria-label="Increase quantity" ${isOOS ? 'disabled' : ''}>+</button>
          </div>
          ${isOOS
            ? `<button type="button" class="purchase-button purchase-primary is-disabled-oos" disabled aria-disabled="true">OUT OF STOCK</button>
               <button type="button" class="purchase-button purchase-secondary is-disabled-oos" disabled aria-disabled="true">SOLD OUT · UNAVAILABLE</button>
               <p class="product-price-note">This fragrance is currently out of stock. Check back soon for restock updates.</p>`
            : `<button type="button" class="purchase-button purchase-primary" data-buy-now="${p.id}">BUY NOW <span>↗</span></button>
               <button type="button" class="purchase-button purchase-secondary" data-add-cart="${p.id}">ADD TO CART</button>
               <p class="product-price-note">Cash on delivery available. Your order will be confirmed by email.</p>`
          }
        </div>
        <div class="product-accordions">
          <details class="product-accordion">
            <summary>
              <span>Story Behind</span>
              <svg class="accordion-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </summary>
            <div class="accordion-content">
              <p>${escapeHtml(p.story)}</p>
            </div>
          </details>
          <details class="product-accordion" open>
            <summary>
              <span>Fragrance Notes</span>
              <svg class="accordion-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </summary>
            <div class="accordion-content">
              <div class="product-notes-columns">
                ${p.notes.map(n=>`
                  <div class="note-column">
                    <span class="note-type">${escapeHtml(n.type)}</span>
                    <strong class="note-title">${escapeHtml(n.note)}</strong>
                    <small class="note-desc">${escapeHtml(n.description)}</small>
                  </div>
                `).join('')}
              </div>
            </div>
          </details>
        </div>
      </div>`;
  const stickyPurchase = `<div class="product-sticky-purchase" aria-hidden="true">
        <span class="product-sticky-price">PKR ${pricing.finalPrice.toLocaleString('en-PK')}</span>
        ${isOOS
          ? `<button type="button" class="purchase-button purchase-primary is-disabled-oos" disabled tabindex="-1">OUT OF STOCK</button>`
          : `<button type="button" class="purchase-button purchase-primary" data-buy-now="${p.id}" tabindex="-1">BUY NOW <span>↗</span></button>`
        }
      </div>`;
  return `<main class="interior-page product-page product-page--premium"><section class="product-detail-layout">${galleryMarkup}${infoMarkup}</section>${stickyPurchase}<section class="product-film" aria-label="${escapeHtml(p.title)} fragrance film"><video class="product-film-video" muted loop playsinline preload="none" poster="${ASSET+filmPoster}" aria-label="Cinematic WJ NOIR ${escapeHtml(p.title)} perfume film"><source src="${ASSET+film}" type="video/mp4"/></video></section><section class="related-products section-pad"><div class="section-heading-row"><div><span class="eyebrow ink-muted">CONTINUE EXPLORING</span><h2>YOU MAY ALSO <em>LOVE.</em></h2></div><a class="text-link" href="/shop">VIEW ALL <span>↗</span></a></div><div class="products-grid related-grid">${related.map(other=>card(other)).join('')}</div></section></main>`;
}
function notFound(){return `<main class="not-found"><span class="eyebrow">PAGE NOT FOUND</span><h1>Lost your <em>scent?</em></h1><a class="button dark-btn" href="/">RETURN HOME <span>↗</span></a></main>`;}

function setupCountdownTimer(){
  if(saleCountdownInterval){
    clearInterval(saleCountdownInterval);
    saleCountdownInterval=null;
  }
  const el=document.getElementById('sale-countdown');
  if(!el||!el.dataset.end) return;
  const target=new Date(el.dataset.end).getTime();
  if(isNaN(target)) return;

  const update=()=>{
    const diff=target-Date.now();
    if(diff<=0){
      el.innerHTML='<span class="sale-countdown-label">OFFER EXPIRED</span>';
      clearInterval(saleCountdownInterval);
      saleCountdownInterval=null;
      return;
    }
    const d=Math.floor(diff/(1000*60*60*24));
    const h=Math.floor((diff/(1000*60*60))%24);
    const m=Math.floor((diff/(1000*60))%60);
    const s=Math.floor((diff/1000)%60);
    const pad=n=>String(n).padStart(2,'0');
    el.innerHTML=`
      <span class="sale-countdown-label">ENDS IN</span>
      <span class="sale-countdown-timer">${d>0?`${pad(d)}D : `:''}${pad(h)}H : ${pad(m)}M : ${pad(s)}S</span>
    `;
  };
  update();
  saleCountdownInterval=setInterval(update,1000);
}

function compressImageFile(file, maxWidth = 1200, maxHeight = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth || h > maxHeight) {
          const ratio = Math.min(maxWidth / w, maxHeight / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function isSalePopupDismissed(){
  try {
    // Clear any persistent 24-hour block from localStorage so users/testers aren't locked out
    localStorage.removeItem('wj-noir-sale-popup-dismissed-at');
    localStorage.removeItem('wj-noir-sale-popup-dismissed');
  } catch(e){}

  try {
    // Clear session dismissal on page reload so testing always triggers the popup
    const navEntries = performance.getEntriesByType('navigation');
    if (navEntries.length > 0 && navEntries[0].type === 'reload') {
      sessionStorage.removeItem('wj-noir-sale-popup-dismissed-at');
      return false;
    }
  } catch(e){}

  try {
    const dismissedAt = sessionStorage.getItem('wj-noir-sale-popup-dismissed-at');
    if(!dismissedAt) return false;
    const past = Number(dismissedAt);
    if(isNaN(past)) return false;
    // Suppress for 10 minutes within the same browsing session
    return (Date.now() - past) < (10 * 60 * 1000);
  } catch(e) {
    return false;
  }
}

function markSalePopupDismissed(){
  try {
    sessionStorage.setItem('wj-noir-sale-popup-dismissed-at', String(Date.now()));
  } catch(e) {}
}

function renderAndOpenSalePopup(){
  if(routePath() !== '/') return;
  if(activeSale && activeSale.is_active === false) return;
  if(isSalePopupDismissed()) return;
  if(document.getElementById('sale-popup-modal')) return;

  const bannerSrc = (activeSale && activeSale.banner_image) ? activeSale.banner_image : '/assets/wj-noir-11-11-sale-banner.jpg';
  const modal = document.createElement('div');
  modal.id = 'sale-popup-modal';
  modal.className = 'sale-popup-overlay';
  modal.innerHTML = `
    <div class="sale-popup-backdrop" data-close-sale-popup aria-label="Dismiss sale popup"></div>
    <div class="sale-popup-container" role="dialog" aria-modal="true" aria-label="11.11 Big Sale Announcement">
      <button type="button" class="sale-popup-close" data-close-sale-popup aria-label="Close sale announcement">×</button>
      <a href="/shop" class="sale-popup-image-wrap" data-close-sale-popup aria-label="Shop the 11.11 Big Sale">
        <img src="${bannerSrc}" alt="${escapeHtml(activeSale?.campaign_title || '11.11 Big Sale')}" loading="eager"/>
      </a>
      <div class="sale-popup-footer">
        <span class="sale-popup-kicker">LIMITED TIME · 11.11</span>
        <a href="/shop" class="sale-popup-btn" data-close-sale-popup>
          <span>SHOP THE SALE</span>
          <span class="popup-btn-arrow" aria-hidden="true">↗</span>
        </a>
        <button type="button" class="sale-popup-no-thanks" data-close-sale-popup>No thanks</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add('lock-scroll');

  setTimeout(() => {
    modal.classList.add('is-open');
  }, 40);

  const dismiss = () => {
    modal.classList.remove('is-open');
    markSalePopupDismissed();
    document.body.classList.remove('lock-scroll');
    document.removeEventListener('keydown', handleKeyDown);
    setTimeout(() => {
      if(modal.parentNode) modal.parentNode.removeChild(modal);
    }, 280);
  };

  const handleKeyDown = (e) => {
    if(e.key === 'Escape'){
      dismiss();
    } else if(e.key === 'Tab'){
      const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if(!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if(e.shiftKey && document.activeElement === first){
        e.preventDefault();
        last.focus();
      } else if(!e.shiftKey && document.activeElement === last){
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  modal.querySelectorAll('[data-close-sale-popup]').forEach(btn => btn.addEventListener('click', dismiss));

  setTimeout(() => {
    const cta = modal.querySelector('.sale-popup-btn');
    cta?.focus();
  }, 120);
}

function checkAndShowSalePopup(){
  if(routePath() !== '/') {
    if(salePopupTimer){
      clearTimeout(salePopupTimer);
      salePopupTimer = null;
    }
    return;
  }
  if(activeSale && activeSale.is_active === false) return;
  const now = new Date();
  if(activeSale?.start_date && new Date(activeSale.start_date) > now) return;
  if(activeSale?.end_date && new Date(activeSale.end_date) < now) return;
  if(isSalePopupDismissed()) return;
  if(document.getElementById('sale-popup-modal')) return;

  // If timer is already running towards 7 seconds, let it complete
  if(salePopupTimer) return;

  // Open reliably 7 seconds after entering website
  salePopupTimer = setTimeout(() => {
    salePopupTimer = null;
    renderAndOpenSalePopup();
  }, 7000);
}
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
  if(!path.startsWith('/fragrance/') && saleCountdownInterval){
    clearInterval(saleCountdownInterval);
    saleCountdownInterval=null;
  }
  if(path !== '/' && salePopupTimer){
    clearTimeout(salePopupTimer);
    salePopupTimer=null;
  }
  const p=path.startsWith('/fragrance/')?fragrances.find(x=>x.id===path.split('/')[2]):undefined;
  document.body.classList.toggle('home-route',path==='/');
  if(path==='/checkout')app.innerHTML=checkoutPage();
  else if(path==='/order-confirmed')app.innerHTML=confirmationPage();
  else if(path==='/admin')app.innerHTML=adminPage();
  else app.innerHTML=path==='/'?home():path==='/shop'?shop():path==='/about'?about():p?product(p):notFound();
  updateSeo(path,p);
  window.scrollTo({top:0,behavior:'instant'});
  setupReveals();setupVideo();setupGallery();setupPurchaseControls();setupCountdownTimer();
  document.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>addToCart(btn.dataset.add,1)));
  if(path==='/checkout')setupCheckout();
  if(path==='/admin')setupAdmin();
  closeAll();
  checkAndShowSalePopup();
}
function closeAll(){
  document.querySelectorAll('.overlay').forEach(el=>{el.classList.remove('open');el.setAttribute('aria-hidden','true');});
  closeGalleryZoom();
  const saleModal = document.getElementById('sale-popup-modal');
  if(saleModal && routePath() !== '/'){
    saleModal.remove();
  }
  if(!document.getElementById('sale-popup-modal')){
    document.body.classList.remove('lock-scroll');
  }
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
  if(isProductOutOfStock(id)){
    showToast('This fragrance is currently out of stock.');
    return;
  }
  const item=cart.find(entry=>entry.id===id);
  if(item)item.quantity=Math.min(99,item.quantity+quantity);
  else cart.push({id,quantity:Math.min(99,quantity)});
  saveCart();showToast('Added to cart');
}
function buyNow(id,quantity=1){
  if(!fragrances.some(p=>p.id===id)||!Number.isSafeInteger(quantity)||quantity<1)return;
  if(isProductOutOfStock(id)){
    showToast('This fragrance is currently out of stock.');
    return;
  }
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
  if(change>0 && isProductOutOfStock(id)){
    showToast('This fragrance is currently out of stock.');
    return;
  }
  item.quantity=Math.max(1,Math.min(99,item.quantity+change));
  saveCart();
}
function removeFromCart(id){cart=cart.filter(item=>item.id!==id);saveCart();}
function cartItemMarkup(item){
  const p=fragrances.find(product=>product.id===item.id);
  if(!p)return '';
  const pricing = getProductPricing(p);
  const isOOS = Boolean(p.outOfStock || isProductOutOfStock(p.id));
  const priceDisplay = isOOS
    ? `<strong class="price-out-of-stock">OUT OF STOCK</strong>`
    : (pricing.isSale
        ? `<strong><span class="price-original">PKR ${pricing.originalPrice.toLocaleString('en-PK')}</span> <span class="price-sale">PKR ${pricing.finalPrice.toLocaleString('en-PK')}</span></strong>`
        : `<strong>PKR ${pricing.originalPrice.toLocaleString('en-PK')}</strong>`);
  return `<div class="bag-item${isOOS?' is-out-of-stock':''}"><img src="${resolveAssetUrl(p.image)}" alt="${escapeHtml(p.title)}"/><div><span class="eyebrow ink-muted">EAU DE PARFUM / 50 ML</span><h3>${escapeHtml(p.title)}</h3>${priceDisplay}<div class="bag-quantity"><button type="button" data-cart-adjust="-1" data-cart-id="${p.id}" aria-label="Remove one ${escapeHtml(p.title)}">−</button><span>QTY ${item.quantity}</span><button type="button" data-cart-adjust="1" data-cart-id="${p.id}" aria-label="Add one ${escapeHtml(p.title)}" ${isOOS?'disabled':''}>+</button></div><button type="button" data-cart-remove="${p.id}" class="remove-link">REMOVE ×</button></div></div>`;
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
    if(!p) return '';
    const pricing = getProductPricing(p);
    const isOOS = Boolean(p.outOfStock || isProductOutOfStock(p.id));
    const lineTotal = pricing.finalPrice * item.quantity;
    const priceDisplay = isOOS
      ? `<b class="price-out-of-stock">OUT OF STOCK</b>`
      : (pricing.isSale
          ? `<b><span class="price-original">PKR ${(pricing.originalPrice*item.quantity).toLocaleString('en-PK')}</span> <span class="price-sale">PKR ${lineTotal.toLocaleString('en-PK')}</span></b>`
          : `<b>PKR ${lineTotal.toLocaleString('en-PK')}</b>`);
    return `<div class="checkout-item"><img src="${resolveAssetUrl(p.image)}" alt=""/><div><strong>${escapeHtml(p.title)}</strong><span>50 ml · Eau de Parfum · Qty ${item.quantity}${isOOS ? ' · OUT OF STOCK' : ''}</span></div>${priceDisplay}</div>`;
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
    const oosItem=items.find(item=>isProductOutOfStock(item.id)||isProductDeleted(item.id));
    if(oosItem){
      const oosProd=fragrances.find(p=>p.id===oosItem.id);
      errorMessage.textContent=`"${oosProd?oosProd.title:'An item in your bag'}" is currently out of stock. Please remove it from your bag to continue.`;
      errorMessage.hidden=false;
      return;
    }
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
function formatForDateTimeLocal(isoString){
  if(!isoString) return '';
  try {
    const d=new Date(isoString);
    if(isNaN(d.getTime())) return '';
    const pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch(e){ return ''; }
}

function renderAdminSaleSectionMarkup(){
  const s = activeSale || {
    is_active: false,
    campaign_title: '11.11 BIG SALE',
    discount_percentage: 16.67,
    target_type: 'all',
    target_category: 'FOR HIM',
    target_product_ids: ['the-office', 'ice-desire', 'levoria'],
    start_date: null,
    end_date: null,
    banner_image: '/assets/wj-noir-11-11-sale-banner.jpg',
    custom_prices: {
      'the-office': 2499,
      'ice-desire': 2082,
      'levoria': 1999
    }
  };
  const customIds = Array.isArray(s.target_product_ids) ? s.target_product_ids : ['the-office', 'ice-desire', 'levoria'];
  const customPrices = (s.custom_prices && typeof s.custom_prices === 'object') ? s.custom_prices : {
    'the-office': 2499,
    'ice-desire': 2082,
    'levoria': 1999
  };

  return `
    <section class="admin-sale-section" id="admin-sale-section">
      <div class="admin-sale-header">
        <div>
          <span class="eyebrow ink-muted">WJ NOIR / BULK CONTROL</span>
          <h2>Sale Settings</h2>
        </div>
        <div class="sale-switch-wrap">
          <span class="sale-switch-label" id="sale-toggle-status-label">${s.is_active ? 'SALE IS ON' : 'SALE IS OFF'}</span>
          <label class="sale-switch" aria-label="Master Sale Toggle">
            <input type="checkbox" id="admin-sale-toggle" ${s.is_active ? 'checked' : ''}/>
            <span class="sale-slider"></span>
          </label>
        </div>
      </div>
      <div class="admin-sale-form">
        <div class="admin-sale-field">
          <label for="admin-sale-title">Campaign Headline</label>
          <input id="admin-sale-title" value="${escapeHtml(s.campaign_title || '11.11 BIG SALE')}" placeholder="e.g. 11.11 BIG SALE"/>
        </div>
        <div class="admin-sale-field">
          <label for="admin-sale-discount">Discount % (Bulk Formula)</label>
          <input type="number" step="0.01" min="0" max="100" id="admin-sale-discount" value="${s.discount_percentage ?? 16.67}" placeholder="e.g. 16.67 or 50"/>
        </div>
        <div class="admin-sale-field">
          <label>Apply To</label>
          <div class="admin-scope-options">
            <label class="admin-scope-radio">
              <input type="radio" name="admin-sale-scope" value="all" ${s.target_type === 'all' ? 'checked' : ''}/>
              <span>All Products</span>
            </label>
            <label class="admin-scope-radio">
              <input type="radio" name="admin-sale-scope" value="category" ${s.target_type === 'category' ? 'checked' : ''}/>
              <span>Specific Category</span>
            </label>
            <label class="admin-scope-radio">
              <input type="radio" name="admin-sale-scope" value="custom" ${s.target_type === 'custom' ? 'checked' : ''}/>
              <span>Specific Selected Products</span>
            </label>
          </div>
          <div id="admin-category-select-wrap" style="display:${s.target_type === 'category' ? 'block' : 'none'};margin-top:6px">
            <select id="admin-sale-category">
              <option value="FOR HIM" ${s.target_category === 'FOR HIM' ? 'selected' : ''}>FOR HIM (The Office, Ice Desire)</option>
              <option value="FOR HER" ${s.target_category === 'FOR HER' ? 'selected' : ''}>FOR HER (Lévoria)</option>
            </select>
          </div>
          <div id="admin-custom-products-wrap" class="admin-custom-products" style="display:${s.target_type === 'custom' ? 'flex' : 'none'}">
            ${fragrances.map(p => `
              <label class="admin-custom-check">
                <input type="checkbox" class="admin-custom-product-check" value="${p.id}" ${customIds.includes(p.id) ? 'checked' : ''}/>
                <span>${escapeHtml(p.title)}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="admin-sale-field">
          <label for="admin-sale-start">Start Date & Time (Optional)</label>
          <input type="datetime-local" id="admin-sale-start" value="${formatForDateTimeLocal(s.start_date)}"/>
          <label for="admin-sale-end" style="margin-top:10px">End Date & Time (Optional)</label>
          <input type="datetime-local" id="admin-sale-end" value="${formatForDateTimeLocal(s.end_date)}"/>
        </div>
        <div class="admin-sale-field admin-sale-field--full">
          <label>Sale Popup Image (Ultra-Luxury Modal on Website Entry)</label>
          <div class="admin-banner-preview-box">
            <img id="admin-sale-banner-preview" class="admin-banner-thumb" src="${escapeHtml(s.banner_image || '/assets/wj-noir-11-11-sale-banner.jpg')}" alt="Sale Banner Preview"/>
            <div class="admin-banner-controls">
              <strong>Active Popup Graphic</strong>
              <p style="font-size:12px;color:#78766e;margin:0 0 6px">This poster is presented inside the ultra-luxury popup 2 seconds after a visitor lands on the homepage. Upload any new campaign artwork or reset to the 11.11 poster.</p>
              <div class="admin-banner-actions">
                <input type="file" id="admin-sale-banner-file" accept="image/png, image/jpeg, image/webp" style="display:none"/>
                <button type="button" id="admin-banner-upload-trigger" class="button admin-banner-btn">📁 UPLOAD NEW IMAGE</button>
                <button type="button" id="admin-banner-reset-trigger" class="button admin-banner-btn admin-banner-btn-secondary">RESET TO 11.11 POSTER</button>
              </div>
              <span id="admin-banner-filename" style="font-size:11px;color:#8c897f;display:none;margin-top:4px"></span>
            </div>
          </div>
        </div>
      </div>

      <div class="admin-separate-prices">
        <div class="admin-separate-prices-header">
          <div>
            <h3>Separate Product Sale Prices (PKR)</h3>
            <p>Customize individual sale prices separately per product, or click auto-calculate from the bulk discount %.</p>
          </div>
          <button type="button" id="admin-autocalc-prices" class="button outline-btn" style="padding:6px 14px;font-size:11px;cursor:pointer">⚡ Auto-Calculate from Discount %</button>
        </div>
        <div class="admin-separate-prices-grid">
          ${fragrances.map(p => {
            const currentPrice = customPrices[p.id] !== undefined ? customPrices[p.id] : (p.id === 'levoria' ? 1999 : Math.round(p.price * (1 - (s.discount_percentage || 16.67) / 100)));
            return `
              <div class="admin-price-card">
                <div class="admin-price-card-title">
                  <span>${escapeHtml(p.title)}</span>
                  <span class="admin-price-card-orig">Orig: PKR ${p.price.toLocaleString('en-PK')}</span>
                </div>
                <div class="admin-price-card-input-wrap">
                  <span>PKR</span>
                  <input type="number" step="1" min="1" max="99999" id="admin-price-input-${p.id}" class="admin-custom-price-input" data-product-id="${p.id}" value="${currentPrice}"/>
                </div>
                <span class="admin-price-card-savings" id="admin-price-savings-${p.id}" style="font-size:11px;color:#8c897f"></span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="sale-preview-wrap">
        <h3>Live Calculated Preview</h3>
        <table class="sale-preview-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Original Price</th>
              <th>Effective Sale Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="admin-sale-preview-tbody">
          </tbody>
        </table>
      </div>
      <div class="admin-sale-actions">
        <button type="button" id="admin-save-sale" class="admin-sale-save-btn">SAVE SALE SETTINGS</button>
      </div>
    </section>
  `;
}

function setupAdminSaleControls(client){
  const section = document.getElementById('admin-sale-section');
  if(!section) return;

  const toggle = document.getElementById('admin-sale-toggle');
  const toggleLabel = document.getElementById('sale-toggle-status-label');
  const discountInput = document.getElementById('admin-sale-discount');
  const scopeRadios = document.querySelectorAll('input[name="admin-sale-scope"]');
  const categoryWrap = document.getElementById('admin-category-select-wrap');
  const categorySelect = document.getElementById('admin-sale-category');
  const customWrap = document.getElementById('admin-custom-products-wrap');
  const customChecks = document.querySelectorAll('.admin-custom-product-check');
  const customPriceInputs = document.querySelectorAll('.admin-custom-price-input');
  const autoCalcBtn = document.getElementById('admin-autocalc-prices');
  const previewTbody = document.getElementById('admin-sale-preview-tbody');
  const saveBtn = document.getElementById('admin-save-sale');

  let stagedBanner = (activeSale && activeSale.banner_image) ? activeSale.banner_image : '/assets/wj-noir-11-11-sale-banner.jpg';
  const fileInput = document.getElementById('admin-sale-banner-file');
  const uploadTrigger = document.getElementById('admin-banner-upload-trigger');
  const resetTrigger = document.getElementById('admin-banner-reset-trigger');
  const bannerPreview = document.getElementById('admin-sale-banner-preview');
  const bannerFilename = document.getElementById('admin-banner-filename');

  uploadTrigger?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    uploadTrigger.disabled = true;
    uploadTrigger.textContent = 'OPTIMIZING...';
    try {
      const dataUrl = await compressImageFile(file);
      stagedBanner = dataUrl;
      if (bannerPreview) bannerPreview.src = dataUrl;
      if (bannerFilename) {
        bannerFilename.textContent = `Ready: ${file.name} (auto-optimized). Click SAVE SALE SETTINGS to publish.`;
        bannerFilename.style.display = 'block';
      }
      showToast('Image loaded and optimized. Click SAVE SALE SETTINGS to publish sitewide.');
    } catch (err) {
      console.error('Failed to process uploaded image file.', err);
      showToast('Could not process this image. Please choose another.');
    } finally {
      uploadTrigger.disabled = false;
      uploadTrigger.textContent = '📁 UPLOAD NEW IMAGE';
    }
  });

  resetTrigger?.addEventListener('click', () => {
    stagedBanner = '/assets/wj-noir-11-11-sale-banner.jpg';
    if (bannerPreview) bannerPreview.src = stagedBanner;
    if (bannerFilename) {
      bannerFilename.textContent = 'Reset to original 11.11 campaign poster.';
      bannerFilename.style.display = 'block';
    }
    showToast('Reset to 11.11 poster. Click SAVE SALE SETTINGS to publish.');
  });

  const getCustomPricesFromInputs = () => {
    const prices = {
      __deleted_ids: loadDeletedProductIds(),
      __out_of_stock_ids: loadOutOfStockIds(),
      __custom_products: loadStoredCustomProducts()
    };
    customPriceInputs.forEach(input => {
      const pid = input.dataset.productId;
      const val = Number(input.value);
      if(pid && val > 0){
        prices[pid] = val;
      }
    });
    return prices;
  };

  autoCalcBtn?.addEventListener('click', () => {
    const discount = Math.max(0, Math.min(100, Number(discountInput.value) || 0));
    customPriceInputs.forEach(input => {
      const pid = input.dataset.productId;
      const prod = fragrances.find(p => p.id === pid);
      if(prod){
        const newPrice = Math.round(prod.price * (1 - (discount / 100)));
        input.value = newPrice;
      }
    });
    updatePreview();
    showToast(`Recalculated prices from ${discount}% discount.`);
  });

  const updatePreview = () => {
    const isChecked = toggle.checked;
    toggleLabel.textContent = isChecked ? 'SALE IS ON' : 'SALE IS OFF';
    const discount = Math.max(0, Math.min(100, Number(discountInput.value) || 0));
    let selectedScope = 'all';
    scopeRadios.forEach(r => { if(r.checked) selectedScope = r.value; });
    categoryWrap.style.display = selectedScope === 'category' ? 'block' : 'none';
    customWrap.style.display = selectedScope === 'custom' ? 'flex' : 'none';

    const selectedCategory = categorySelect.value;
    const selectedCustomIds = [...customChecks].filter(c => c.checked).map(c => c.value);
    const enteredPrices = getCustomPricesFromInputs();

    fragrances.forEach(p => {
      const savingsEl = document.getElementById(`admin-price-savings-${p.id}`);
      if(savingsEl){
        const entered = enteredPrices[p.id];
        if(entered && entered < p.price){
          const diff = p.price - entered;
          const pct = Math.round((diff / p.price) * 100);
          savingsEl.textContent = `-${pct}% off (Saves PKR ${diff.toLocaleString('en-PK')})`;
          savingsEl.style.color = '#a8803a';
        } else if(entered && entered === p.price){
          savingsEl.textContent = 'Regular Price (No discount)';
          savingsEl.style.color = '#8c897f';
        } else if(entered && entered > p.price){
          savingsEl.textContent = 'Higher than regular price';
          savingsEl.style.color = '#c2410c';
        } else {
          savingsEl.textContent = '';
        }
      }
    });

    previewTbody.innerHTML = fragrances.map(p => {
      let applies = false;
      if(isChecked){
        if(selectedScope === 'all') applies = true;
        else if(selectedScope === 'category') applies = p.category === selectedCategory;
        else if(selectedScope === 'custom') applies = selectedCustomIds.includes(p.id);
      }

      let effectivePrice = p.price;
      let statusText = '';
      const isOOS = Boolean(p.outOfStock || isProductOutOfStock(p.id));

      if(!isChecked){
        statusText = '<span class="sale-preview-inactive">Standard (Sale OFF)</span>';
      } else if(enteredPrices[p.id] !== undefined && enteredPrices[p.id] < p.price){
        effectivePrice = enteredPrices[p.id];
        const pct = Math.round(((p.price - effectivePrice) / p.price) * 100);
        statusText = `<span class="sale-preview-active">Custom Sale Price (-${pct}%)</span>`;
      } else if(applies && discount > 0){
        effectivePrice = Math.round(p.price * (1 - (discount / 100)));
        statusText = `<span class="sale-preview-active">Formula Active (-${discount}%)</span>`;
      } else {
        statusText = '<span class="sale-preview-inactive">Standard (Excluded)</span>';
      }

      if(isOOS){
        statusText += ` <span class="admin-stock-pill is-oos" style="margin-left:6px">OUT OF STOCK</span>`;
      }

      return `<tr>
        <td><strong>${escapeHtml(p.title)}</strong></td>
        <td>${escapeHtml(p.category)}</td>
        <td>PKR ${p.price.toLocaleString('en-PK')}</td>
        <td><strong>PKR ${effectivePrice.toLocaleString('en-PK')}</strong></td>
        <td>${statusText}</td>
      </tr>`;
    }).join('');
  };

  toggle.addEventListener('change', updatePreview);
  discountInput.addEventListener('input', updatePreview);
  scopeRadios.forEach(r => r.addEventListener('change', updatePreview));
  categorySelect.addEventListener('change', updatePreview);
  customChecks.forEach(c => c.addEventListener('change', updatePreview));
  customPriceInputs.forEach(i => i.addEventListener('input', updatePreview));
  updatePreview();

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const origText = saveBtn.textContent;
    saveBtn.textContent = 'SAVING...';
    try {
      const isChecked = toggle.checked;
      const title = document.getElementById('admin-sale-title').value.trim() || '11.11 BIG SALE';
      const discount = Math.max(0, Math.min(100, Number(discountInput.value) || 0));
      let selectedScope = 'all';
      scopeRadios.forEach(r => { if(r.checked) selectedScope = r.value; });
      const selectedCategory = categorySelect.value;
      const selectedCustomIds = [...customChecks].filter(c => c.checked).map(c => c.value);
      const startVal = document.getElementById('admin-sale-start').value;
      const endVal = document.getElementById('admin-sale-end').value;
      const custom_prices = getCustomPricesFromInputs();

      const payload = {
        id: 'active',
        is_active: isChecked,
        campaign_title: title,
        discount_percentage: discount,
        target_type: selectedScope,
        target_category: selectedScope === 'category' ? selectedCategory : null,
        target_product_ids: selectedScope === 'custom' ? selectedCustomIds : fragrances.map(f => f.id),
        start_date: startVal ? new Date(startVal).toISOString() : null,
        end_date: endVal ? new Date(endVal).toISOString() : null,
        banner_image: stagedBanner,
        custom_prices: custom_prices,
        updated_at: new Date().toISOString()
      };

      const { error } = await client.from('sale_settings').upsert(payload);
      if(error) throw new Error(error.message);

      activeSale = payload;
      try { localStorage.setItem('wj-noir-sale-settings-cache', JSON.stringify(payload)); } catch(e){}
      renderBag();
      showToast(isChecked ? 'Sale settings saved. Prices updated successfully sitewide.' : 'Sale settings saved. Sale is OFF.');
      updatePreview();
    } catch(err) {
      console.error('Unable to save sale settings.', err);
      showToast(err.message || 'Unable to save sale settings.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = origText;
    }
  });
}

async function syncCatalogStateToSupabase(client, nextDeletedIds, nextOutOfStockIds, nextCustomProducts){
  try {
    localStorage.setItem('wj-noir-deleted-product-ids', JSON.stringify(nextDeletedIds));
    localStorage.setItem('wj-noir-out-of-stock-ids', JSON.stringify(nextOutOfStockIds));
    localStorage.setItem('wj-noir-custom-products', JSON.stringify(nextCustomProducts));
  } catch(e){}

  const existingSale = activeSale || {
    id: 'active',
    is_active: true,
    campaign_title: '11.11 BIG SALE',
    discount_percentage: 16.67,
    target_type: 'all',
    target_category: null,
    target_product_ids: ['the-office', 'ice-desire', 'levoria'],
    start_date: null,
    end_date: null,
    banner_image: '/assets/wj-noir-11-11-sale-banner.jpg',
    custom_prices: {
      'the-office': 2499,
      'ice-desire': 2082,
      'levoria': 1999
    }
  };

  const baseCustomPrices = (existingSale.custom_prices && typeof existingSale.custom_prices === 'object')
    ? { ...existingSale.custom_prices }
    : { 'the-office': 2499, 'ice-desire': 2082, 'levoria': 1999 };

  baseCustomPrices.__deleted_ids = nextDeletedIds;
  baseCustomPrices.__out_of_stock_ids = nextOutOfStockIds;
  baseCustomPrices.__custom_products = nextCustomProducts;

  const nextPayload = {
    id: 'active',
    is_active: Boolean(existingSale.is_active),
    campaign_title: existingSale.campaign_title || '11.11 BIG SALE',
    discount_percentage: existingSale.discount_percentage ?? 16.67,
    target_type: existingSale.target_type || 'all',
    target_category: existingSale.target_category || null,
    target_product_ids: Array.isArray(existingSale.target_product_ids) ? existingSale.target_product_ids : ['the-office', 'ice-desire', 'levoria'],
    start_date: existingSale.start_date || null,
    end_date: existingSale.end_date || null,
    banner_image: existingSale.banner_image || '/assets/wj-noir-11-11-sale-banner.jpg',
    custom_prices: baseCustomPrices,
    updated_at: new Date().toISOString()
  };

  activeSale = nextPayload;
  try { localStorage.setItem('wj-noir-sale-settings-cache', JSON.stringify(nextPayload)); } catch(e){}
  rebuildFragrancesCatalog();

  if(client){
    const { error } = await client.from('sale_settings').upsert(nextPayload);
    if(error) throw new Error(error.message);
  }
}

function renderAdminProductsMarkup(){
  const deletedIds = loadDeletedProductIds();
  const outOfStockIds = loadOutOfStockIds();
  const deletedCoreProducts = defaultFragrances.filter(d => deletedIds.includes(d.id));
  const oosCount = fragrances.filter(p => outOfStockIds.includes(p.id) || p.outOfStock).length;

  return `
    <div class="admin-products-section">
      <div class="admin-existing-products">
        <div class="admin-catalog-header-row">
          <div>
            <span class="eyebrow ink-muted">WJ NOIR / INVENTORY &amp; CATALOGUE CONTROL</span>
            <h2 style="margin:4px 0 0;font-family:var(--serif);font-size:28px;font-weight:400">Manage Perfumes · Stock &amp; Delete (${fragrances.length})</h2>
            <p style="font-size:13px;color:#78766e;margin:6px 0 0">Mark any fragrance Out of Stock or In Stock, or delete products from the store. Every change syncs across the entire website immediately.</p>
          </div>
          <div class="admin-catalog-summary-pills">
            <span class="admin-stock-pill is-instock">● ${fragrances.length - oosCount} IN STOCK</span>
            <span class="admin-stock-pill is-oos">● ${oosCount} OUT OF STOCK</span>
          </div>
        </div>

        ${fragrances.length ? `
          <div class="admin-catalog-grid">
            ${fragrances.map(p => {
              const isCustom = !['the-office', 'ice-desire', 'levoria'].includes(p.id);
              const isOOS = Boolean(p.outOfStock || outOfStockIds.includes(p.id));
              const pricing = getProductPricing(p);
              return `
                <div class="admin-catalog-card ${isOOS ? 'is-oos-card' : ''}">
                  <div class="admin-catalog-badges-row">
                    <span class="admin-catalog-badge ${isCustom ? 'is-custom' : ''}">${isCustom ? 'CUSTOM ADDED' : 'CORE SIGNATURE'}</span>
                    <span class="admin-stock-pill ${isOOS ? 'is-oos' : 'is-instock'}">${isOOS ? '● OUT OF STOCK' : '● IN STOCK'}</span>
                  </div>
                  <img class="admin-catalog-thumb" src="${resolveAssetUrl(p.image)}" alt="${escapeHtml(p.title)}"/>
                  <div class="admin-catalog-info">
                    <span>${p.number} · ${escapeHtml(p.category)}</span>
                    <strong>${escapeHtml(p.title)}</strong>
                    <div class="catalog-price">
                      ${pricing.isSale
                        ? `<span class="price-original">PKR ${pricing.originalPrice.toLocaleString('en-PK')}</span> <strong class="price-sale">PKR ${pricing.finalPrice.toLocaleString('en-PK')}</strong>`
                        : `PKR ${p.price.toLocaleString('en-PK')}`
                      }
                    </div>
                    <a href="/fragrance/${p.id}" target="_blank" style="font-size:11px;color:#a8803a;text-decoration:underline">View in store ↗</a>
                    <div class="admin-catalog-actions">
                      <button type="button" class="admin-stock-toggle-btn ${isOOS ? 'is-oos' : 'is-instock'}" data-toggle-stock="${p.id}">
                        ${isOOS ? '✓ MARK IN STOCK' : '🚫 MARK OUT OF STOCK'}
                      </button>
                      <button type="button" class="admin-delete-prod-btn" data-delete-product="${p.id}">
                        🗑️ DELETE PRODUCT
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <p class="admin-empty">All products have been deleted from the active storefront. Add a new fragrance below or restore a core signature fragrance.</p>
        `}

        ${deletedCoreProducts.length ? `
          <div class="admin-deleted-core-wrap">
            <div>
              <strong>Deleted Signature Fragrances (${deletedCoreProducts.length})</strong>
              <p>These original WJ NOIR house fragrances are currently hidden/deleted from the storefront. You can restore them anytime:</p>
            </div>
            <div class="admin-deleted-core-list">
              ${deletedCoreProducts.map(d => `
                <button type="button" class="admin-restore-core-btn" data-restore-product="${d.id}">
                  ↺ RESTORE ${escapeHtml(d.upper)}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div class="admin-product-create-card">
        <div class="admin-product-create-header">
          <div>
            <span class="eyebrow ink-muted">WJ NOIR / CATALOG CREATOR</span>
            <h2>Add New Fragrance</h2>
          </div>
        </div>
        <form id="admin-new-product-form" class="admin-product-form">
          <div class="admin-product-form-grid">
            <div class="admin-product-field">
              <label for="new-product-title">Fragrance Title *</label>
              <input id="new-product-title" required placeholder="e.g. Royal Oud or Velvet Noir"/>
            </div>
            <div class="admin-product-field">
              <label for="new-product-category">Category *</label>
              <select id="new-product-category" required>
                <option value="FOR HIM">FOR HIM</option>
                <option value="FOR HER">FOR HER</option>
                <option value="UNISEX">UNISEX</option>
              </select>
            </div>
            <div class="admin-product-field">
              <label for="new-product-price">Regular Price (PKR) *</label>
              <input type="number" id="new-product-price" step="1" min="1" required placeholder="e.g. 2999"/>
            </div>
            <div class="admin-product-field">
              <label for="new-product-stock">Stock Status *</label>
              <select id="new-product-stock" required>
                <option value="in_stock" selected>In Stock (Available to Order)</option>
                <option value="out_of_stock">Out of Stock (Sold Out Badge)</option>
              </select>
            </div>
            <div class="admin-product-field">
              <label for="new-product-tagline">Tagline / Short Hook</label>
              <input id="new-product-tagline" placeholder="e.g. Command your presence."/>
            </div>
            <div class="admin-product-field">
              <label for="new-product-intro">Intro Summary</label>
              <input id="new-product-intro" placeholder="e.g. Warm. Enigmatic. Unforgettable."/>
            </div>
            <div class="admin-product-field admin-product-field--full">
              <label for="new-product-tones">Key Tones (Comma-separated)</label>
              <input id="new-product-tones" placeholder="e.g. AMBER, OUD, SPICED"/>
            </div>
            <div class="admin-product-field admin-product-field--full">
              <label for="new-product-description">Full Editorial Description</label>
              <textarea id="new-product-description" rows="3" placeholder="Describe the character, atmosphere and lasting impression of this perfume..."></textarea>
            </div>
            <div class="admin-product-field admin-product-field--full">
              <label>Fragrance Notes (Top / Heart / Base)</label>
              <div class="admin-product-notes-grid">
                <input id="new-product-note-top" placeholder="Top Note (e.g. Bergamot & Saffron)"/>
                <input id="new-product-note-heart" placeholder="Heart Note (e.g. Amber & Rose)"/>
                <input id="new-product-note-base" placeholder="Base Note (e.g. Rare Oud & Cedarwood)"/>
              </div>
            </div>
            <div class="admin-product-field admin-product-field--full">
              <label>Product Photography</label>
              <div class="admin-product-photo-picker">
                <img id="new-product-thumb-preview" class="admin-product-thumb-preview" src="/assets/dark-collection.webp" alt="Product Image Preview"/>
                <div>
                  <strong>Select Perfume Photo</strong>
                  <p style="font-size:12px;color:#78766e;margin:4px 0 10px">Upload bottle or studio photograph. It is automatically optimized for fast loading.</p>
                  <input type="file" id="new-product-file" accept="image/png, image/jpeg, image/webp" style="display:none"/>
                  <button type="button" id="new-product-file-btn" class="button outline-btn" style="padding:8px 16px;font-size:10px;cursor:pointer">📷 SELECT PHOTO FILE</button>
                  <span id="new-product-filename" style="font-size:11px;color:#8c897f;display:none;margin-left:8px"></span>
                </div>
              </div>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end">
            <button type="submit" id="admin-product-submit" class="admin-product-submit-btn">+ LAUNCH &amp; PUBLISH FRAGRANCE</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function setupAdminProductsControls(client){
  const form = document.getElementById('admin-new-product-form');
  if(!form) return;

  const fileInput = document.getElementById('new-product-file');
  const fileBtn = document.getElementById('new-product-file-btn');
  const thumbPreview = document.getElementById('new-product-thumb-preview');
  const filenameEl = document.getElementById('new-product-filename');
  const submitBtn = document.getElementById('admin-product-submit');

  let stagedImage = '/assets/dark-collection.webp';

  fileBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if(!file) return;
    fileBtn.disabled = true;
    fileBtn.textContent = 'OPTIMIZING...';
    try {
      const dataUrl = await compressImageFile(file, 900, 1200, 0.85);
      stagedImage = dataUrl;
      if(thumbPreview) thumbPreview.src = dataUrl;
      if(filenameEl){
        filenameEl.textContent = `Photo: ${file.name}`;
        filenameEl.style.display = 'inline';
      }
      showToast('Product photo optimized and ready.');
    } catch(err) {
      console.error('Failed to compress product image.', err);
      showToast('Could not optimize this photo. Please try another image.');
    } finally {
      fileBtn.disabled = false;
      fileBtn.textContent = '📷 SELECT PHOTO FILE';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    const origText = submitBtn.textContent;
    submitBtn.textContent = 'PUBLISHING...';

    try {
      const title = document.getElementById('new-product-title').value.trim();
      if(!title) throw new Error('Please enter a fragrance title.');
      const category = document.getElementById('new-product-category').value;
      const price = Number(document.getElementById('new-product-price').value);
      if(!price || price <= 0) throw new Error('Please enter a valid price in PKR.');
      const stockChoice = document.getElementById('new-product-stock')?.value || 'in_stock';
      const isInitialOOS = stockChoice === 'out_of_stock';
      const tagline = document.getElementById('new-product-tagline').value.trim();
      const intro = document.getElementById('new-product-intro').value.trim();
      const description = document.getElementById('new-product-description').value.trim();
      const topNote = document.getElementById('new-product-note-top').value.trim();
      const heartNote = document.getElementById('new-product-note-heart').value.trim();
      const baseNote = document.getElementById('new-product-note-base').value.trim();
      const rawTones = document.getElementById('new-product-tones').value.trim();

      let baseId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'perfume';
      let id = baseId;
      let counter = 1;
      while(fragrances.some(f => f.id === id) || defaultFragrances.some(f => f.id === id)){
        counter++;
        id = `${baseId}-${counter}`;
      }

      const notes = [];
      if(topNote) notes.push({ type: 'TOP NOTE', note: topNote, description: 'Luminous entrance' });
      if(heartNote) notes.push({ type: 'HEART NOTE', note: heartNote, description: 'The soul of the scent' });
      if(baseNote) notes.push({ type: 'BASE NOTE', note: baseNote, description: 'Lasting signature' });
      if(!notes.length){
        notes.push({ type: 'CHARACTER', note: title, description: 'Distinct & memorable' });
      }

      const tones = rawTones ? rawTones.split(',').map(t => t.trim().toUpperCase()).filter(Boolean) : ['SIGNATURE', 'DISTINCT'];
      const nextNum = String(fragrances.length + 1).padStart(2, '0');

      const newProduct = {
        id,
        title,
        upper: title.toUpperCase(),
        category,
        tagline: tagline || 'Wear your presence.',
        intro: intro || 'An entrance you feel.',
        description: description || `${title} Eau de Parfum is an unmistakable signature composed for presence, character and distinction.`,
        story: tagline || intro || 'Composed for those who choose their own way.',
        image: stagedImage,
        altImage: stagedImage,
        gallery: [stagedImage, stagedImage],
        photoPosition: 'center',
        price,
        showPrice: true,
        tones,
        notes,
        number: nextNum,
        texture: '#1a1a1a',
        isCustom: true,
        outOfStock: isInitialOOS
      };

      const customProducts = loadStoredCustomProducts().filter(p => p.id !== id);
      customProducts.push(newProduct);

      const deletedIds = loadDeletedProductIds().filter(dId => dId !== id);
      let outOfStockIds = loadOutOfStockIds().filter(oId => oId !== id);
      if(isInitialOOS) outOfStockIds.push(id);

      await syncCatalogStateToSupabase(client, deletedIds, outOfStockIds, customProducts);

      try {
        await client.from('products').upsert({
          id: newProduct.id,
          title: newProduct.title,
          upper: newProduct.upper,
          category: newProduct.category,
          tagline: newProduct.tagline,
          intro: newProduct.intro,
          description: newProduct.description,
          story: newProduct.story,
          image: newProduct.image,
          alt_image: newProduct.altImage,
          gallery: newProduct.gallery,
          price: newProduct.price,
          show_price: true,
          tones: newProduct.tones,
          notes: newProduct.notes,
          number: newProduct.number
        });
      } catch(dbErr) {
        console.warn('Database table "products" sync deferred:', dbErr);
      }

      showToast(`✨ "${title}" has been launched and synced across the store!`);
      sessionStorage.setItem('wj-noir-admin-tab', 'products');
      renderAdminDashboard(client);
    } catch(err) {
      console.error('Failed to create product.', err);
      showToast(err.message || 'Could not add product.');
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    }
  });

  // Toggle Stock Status (In Stock <-> Out of Stock) for ANY product
  document.querySelectorAll('[data-toggle-stock]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pid = btn.dataset.toggleStock;
      const prod = fragrances.find(p => p.id === pid);
      const title = prod ? prod.title : 'Product';
      const currentlyOOS = isProductOutOfStock(pid);

      btn.disabled = true;
      btn.textContent = 'SYNCING...';

      try {
        const deletedIds = loadDeletedProductIds();
        let outOfStockIds = loadOutOfStockIds();
        if(currentlyOOS){
          outOfStockIds = outOfStockIds.filter(id => id !== pid);
        } else if(!outOfStockIds.includes(pid)){
          outOfStockIds.push(pid);
        }
        const customProducts = loadStoredCustomProducts().map(cp =>
          cp.id === pid ? { ...cp, outOfStock: !currentlyOOS } : cp
        );

        await syncCatalogStateToSupabase(client, deletedIds, outOfStockIds, customProducts);

        showToast(!currentlyOOS
          ? `🚫 "${title}" marked OUT OF STOCK across the store.`
          : `✓ "${title}" is back IN STOCK across the store.`);
        sessionStorage.setItem('wj-noir-admin-tab', 'products');
        renderAdminDashboard(client);
      } catch(err) {
        console.error('Failed to toggle product stock status.', err);
        showToast(err.message || 'Unable to sync stock status.');
        btn.disabled = false;
      }
    });
  });

  // Delete ANY product (Core or Custom)
  document.querySelectorAll('[data-delete-product]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pid = btn.dataset.deleteProduct;
      const prod = fragrances.find(p => p.id === pid);
      const title = prod ? prod.title : 'this product';
      const isCore = ['the-office', 'ice-desire', 'levoria'].includes(pid);
      const confirmMsg = isCore
        ? `Remove "${title}" from the store catalog? (As a core signature fragrance, you can restore it anytime from this page.)`
        : `Permanently delete "${title}" from the store catalog?`;
      if(!window.confirm(confirmMsg)) return;

      btn.disabled = true;
      btn.textContent = 'DELETING...';

      try {
        let deletedIds = loadDeletedProductIds();
        if(isCore && !deletedIds.includes(pid)){
          deletedIds.push(pid);
        }
        const outOfStockIds = loadOutOfStockIds().filter(id => id !== pid);
        const customProducts = loadStoredCustomProducts().filter(p => p.id !== pid);

        await syncCatalogStateToSupabase(client, deletedIds, outOfStockIds, customProducts);

        if(!isCore){
          try {
            await client.from('products').delete().eq('id', pid);
          } catch(e){}
        }

        showToast(`🗑️ "${title}" has been deleted and synced sitewide.`);
        sessionStorage.setItem('wj-noir-admin-tab', 'products');
        renderAdminDashboard(client);
      } catch(err) {
        console.error('Failed to delete product.', err);
        showToast(err.message || 'Unable to delete product.');
        btn.disabled = false;
        btn.textContent = '🗑️ DELETE PRODUCT';
      }
    });
  });

  // Restore a deleted Core Signature fragrance
  document.querySelectorAll('[data-restore-product]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pid = btn.dataset.restoreProduct;
      const coreProd = defaultFragrances.find(d => d.id === pid);
      const title = coreProd ? coreProd.title : pid;

      btn.disabled = true;
      btn.textContent = 'RESTORING...';

      try {
        const deletedIds = loadDeletedProductIds().filter(id => id !== pid);
        const outOfStockIds = loadOutOfStockIds();
        const customProducts = loadStoredCustomProducts();

        await syncCatalogStateToSupabase(client, deletedIds, outOfStockIds, customProducts);

        showToast(`↺ "${title}" has been restored to the store catalog!`);
        sessionStorage.setItem('wj-noir-admin-tab', 'products');
        renderAdminDashboard(client);
      } catch(err) {
        console.error('Failed to restore core fragrance.', err);
        showToast(err.message || 'Unable to restore fragrance.');
        btn.disabled = false;
      }
    });
  });
}

function renderAdminDashboard(client){
  const root=document.getElementById('admin-content');
  if(!root)return;
  const totalRevenue=adminOrders.filter(order=>order.status!=='cancelled').reduce((sum,order)=>sum+Number(order.total_amount),0);
  const activeTab = sessionStorage.getItem('wj-noir-admin-tab') || 'orders';

  root.innerHTML=`
    <div class="admin-heading">
      <div>
        <span class="eyebrow ink-muted">WJ NOIR / PRIVATE</span>
        <h1>Orders &amp; Store Control.</h1>
      </div>
      <div class="admin-heading-actions">
        <button type="button" id="admin-logout" class="admin-logout">SIGN OUT</button>
      </div>
    </div>

    <nav class="admin-navbar" aria-label="Admin Navigation Tabs">
      <button type="button" class="admin-nav-item ${activeTab === 'orders' ? 'is-active' : ''}" data-admin-tab="orders">
        <span>📦 ORDERS</span>
        <span class="admin-nav-badge" id="tab-orders-count">${adminOrders.length}</span>
      </button>
      <button type="button" class="admin-nav-item ${activeTab === 'sales' ? 'is-active' : ''}" data-admin-tab="sales">
        <span>🏷️ SALES</span>
        <span class="admin-nav-badge-sale ${activeSale?.is_active ? 'is-on' : 'is-off'}">${activeSale?.is_active ? 'ON' : 'OFF'}</span>
      </button>
      <button type="button" class="admin-nav-item ${activeTab === 'products' ? 'is-active' : ''}" data-admin-tab="products">
        <span>✨ PRODUCTS &amp; STOCK</span>
        <span class="admin-nav-badge">${fragrances.length}</span>
      </button>
    </nav>

    <!-- Tab 1: Orders -->
    <div id="admin-tab-orders" class="admin-tab-pane ${activeTab === 'orders' ? 'is-active' : ''}">
      <div class="admin-stats">
        <article><span>TOTAL ORDERS</span><strong>${adminOrders.length}</strong></article>
        <article><span>REVENUE · EXCLUDING CANCELLED</span><strong>PKR ${totalRevenue.toLocaleString('en-PK')}</strong></article>
      </div>
      <div class="admin-tools">
        <label class="sr-only" for="admin-search">Search orders</label>
        <input id="admin-search" placeholder="Search name, email, phone or order number"/>
        <label class="sr-only" for="admin-status-filter">Filter by status</label>
        <select id="admin-status-filter">
          <option value="">All statuses</option>
          ${['pending','confirmed','shipped','delivered','cancelled'].map(status=>`<option value="${status}">${status}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
        <button type="button" id="admin-delete-all" class="admin-danger" ${adminOrders.length?'':'disabled'}>DELETE ALL ORDERS</button>
      </div>
      <div id="admin-order-list" class="admin-order-list"></div>
    </div>

    <!-- Tab 2: Sales -->
    <div id="admin-tab-sales" class="admin-tab-pane ${activeTab === 'sales' ? 'is-active' : ''}">
      ${renderAdminSaleSectionMarkup()}
    </div>

    <!-- Tab 3: Products & Add New -->
    <div id="admin-tab-products" class="admin-tab-pane ${activeTab === 'products' ? 'is-active' : ''}">
      ${renderAdminProductsMarkup()}
    </div>
  `;

  // Setup tab switcher
  const tabButtons = root.querySelectorAll('[data-admin-tab]');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.adminTab;
      sessionStorage.setItem('wj-noir-admin-tab', target);
      tabButtons.forEach(b => b.classList.toggle('is-active', b.dataset.adminTab === target));
      root.querySelectorAll('.admin-tab-pane').forEach(p => {
        p.classList.toggle('is-active', p.id === `admin-tab-${target}`);
      });
    });
  });

  setupAdminSaleControls(client);
  setupAdminProductsControls(client);

  document.getElementById('admin-logout')?.addEventListener('click',async()=>{
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
function renderSearch(){const q=document.getElementById('search-input').value.trim().toLowerCase();const results=fragrances.filter(p=>!q||[p.title,p.category,p.tagline,...p.tones,...p.notes.map(n=>n.note)].join(' ').toLowerCase().includes(q));document.getElementById('search-results').innerHTML=results.length?results.map(p=>{const isOOS=Boolean(p.outOfStock||isProductOutOfStock(p.id));return `<a class="search-result" href="/fragrance/${p.id}" data-close="search"><img src="${resolveAssetUrl(p.image)}" alt=""/><span><small>${escapeHtml(p.category)} · EAU DE PARFUM${isOOS?' · OUT OF STOCK':''}</small><strong>${escapeHtml(p.title)}</strong><small>${p.tones.join(' / ')}</small></span><i>↗</i></a>`;}).join(''):`<div class="search-empty">No fragrance matched your search. Try “woody”, “ice” or “vanilla”.</div>`;}
document.getElementById('menu-toggle').addEventListener('click',()=>toggleOverlay('menu'));
document.getElementById('search-toggle').addEventListener('click',()=>toggleOverlay('search'));
document.getElementById('bag-toggle').addEventListener('click',()=>toggleOverlay('bag'));
document.getElementById('search-input').addEventListener('input',renderSearch);
document.addEventListener('click',e=>{const closest=e.target.closest('[data-close]');if(closest)closeAll();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.querySelector('.product-image-zoom.is-open'))closeGalleryZoom();else closeAll();}});
document.getElementById('newsletter-form').addEventListener('submit',e=>{e.preventDefault();document.getElementById('newsletter-message').textContent='Preview only: connect your newsletter provider before launch.';});
document.getElementById('year').textContent=new Date().getFullYear();
window.addEventListener('storage',e=>{
  if(['wj-noir-deleted-product-ids','wj-noir-out-of-stock-ids','wj-noir-custom-products','wj-noir-sale-settings-cache'].includes(e.key)){
    try{
      const cachedSale=localStorage.getItem('wj-noir-sale-settings-cache');
      if(cachedSale)activeSale=JSON.parse(cachedSale);
    }catch(err){}
    rebuildFragrancesCatalog();
    refreshViewOnBackgroundSync();
  }
});
window.addEventListener('hashchange',route);window.addEventListener('popstate',route);setupGlobalCommerceActions();rebuildFragrancesCatalog();renderBag();route();fetchSaleSettings();fetchProductsFromDatabase();setupPublicCatalogRealtimeSync();
window.addEventListener('load',()=>{setTimeout(()=>document.getElementById('loading-screen').classList.add('done'),100);});setTimeout(()=>document.getElementById('loading-screen').classList.add('done'),2800);


// Persistent WhatsApp contact button
(function addWjNoirWhatsAppButton() {
  if (document.getElementById('wj-noir-whatsapp')) return;
  const link = document.createElement('a');
  link.id = 'wj-noir-whatsapp';
  link.href = 'https://wa.me/923363549666?text=' + encodeURIComponent("Assalam-o-Alaikum WJ NOIR! I'd like to know more about your fragrances and placing an order.");
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', 'Chat with WJ NOIR on WhatsApp');
  link.title = 'Chat with WJ NOIR on WhatsApp';
  link.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16.04 3.2A12.7 12.7 0 0 0 5.1 22.35L3.3 28.9l6.7-1.76A12.7 12.7 0 1 0 16.04 3.2Zm0 23.1c-2 0-3.96-.54-5.67-1.57l-.4-.24-3.98 1.05 1.06-3.88-.26-.4a10.35 10.35 0 1 1 9.25 5.04Zm5.68-7.75c-.31-.16-1.85-.91-2.14-1.01-.29-.11-.5-.16-.71.16-.21.31-.81 1.01-.99 1.22-.18.21-.36.24-.67.08-.31-.16-1.3-.48-2.47-1.52-.91-.81-1.53-1.81-1.71-2.12-.18-.31-.02-.48.14-.64.14-.14.31-.36.47-.54.16-.18.21-.31.31-.52.1-.21.05-.39-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.54-.71-.55h-.6c-.21 0-.55.08-.84.39-.29.31-1.1 1.07-1.1 2.61s1.13 3.03 1.28 3.24c.16.21 2.22 3.39 5.38 4.75.75.32 1.34.51 1.8.65.76.24 1.45.21 2 .13.61-.09 1.85-.76 2.11-1.49.26-.73.26-1.35.18-1.49-.08-.13-.29-.21-.6-.36Z"/></svg>';
  link.style.cssText = 'position:fixed;right:22px;bottom:22px;z-index:9999;width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#25D366;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.28);transition:transform .2s ease,box-shadow .2s ease;text-decoration:none;';
  const icon = link.querySelector('svg');
  icon.style.cssText = 'width:31px;height:31px;display:block;';
  link.addEventListener('mouseenter', () => { link.style.transform = 'translateY(-3px) scale(1.04)'; link.style.boxShadow = '0 12px 32px rgba(0,0,0,.34)'; });
  link.addEventListener('mouseleave', () => { link.style.transform = ''; link.style.boxShadow = '0 8px 28px rgba(0,0,0,.28)'; });
  document.body.appendChild(link);
  const mobileStyle = document.createElement('style');
  mobileStyle.textContent = '@media(max-width:600px){#wj-noir-whatsapp{right:16px!important;bottom:16px!important;width:54px!important;height:54px!important}#wj-noir-whatsapp svg{width:29px!important;height:29px!important}}';
  document.head.appendChild(mobileStyle);
})();
