(function(){
"use strict";
if(window.__smartCompareLoaded)return;
window.__smartCompareLoaded=true;

let lastUrl=location.href, panelVisible=false, pollInterval=null, cachedData=null, chartInstance=null, heartbeatTimer=null, connectionState='unknown';

function isContextValid(){
  try{ return !!(chrome && chrome.runtime && chrome.runtime.id); }catch(e){ return false; }
}

const PLATFORMS={
  "amazon.in":{name:"Amazon",cls:"amazon",tier:1},
  "flipkart.com":{name:"Flipkart",cls:"flipkart",tier:1},
  "croma.com":{name:"Croma",cls:"croma",tier:2},
  "reliancedigital.in":{name:"Reliance Digital",cls:"reliancedigital",tier:2},
  "vijaysales.com":{name:"Vijay Sales",cls:"vijaysales",tier:2},
  "apple.com":{name:"Apple India",cls:"apple",tier:3,d2c:true},
  "myntra.com":{name:"Myntra",cls:"myntra",tier:3},
  "ajio.com":{name:"Ajio",cls:"ajio",tier:3},
  "nykaa.com":{name:"Nykaa",cls:"nykaa",tier:3},
  "tatacliq.com":{name:"TataCliq",cls:"tatacliq",tier:3},
  "firstcry.com":{name:"FirstCry",cls:"firstcry",tier:3},
  "blinkit.com":{name:"Blinkit",cls:"blinkit",tier:3},
  "zeptonow.com":{name:"Zepto",cls:"zepto",tier:3},
  "bigbasket.com":{name:"BigBasket",cls:"bigbasket",tier:3},
  "jiomart.com":{name:"JioMart",cls:"jiomart",tier:3},
  "decathlon.in":{name:"Decathlon",cls:"decathlon",tier:3},
  "kitabay.com":{name:"Kitabay",cls:"kitabay",tier:3}
};

function detectPlatform(){
  const h=location.hostname;
  for(const k of Object.keys(PLATFORMS)){if(h.includes(k))return k;}
  return null;
}

function qs(s){try{return document.querySelector(s)}catch(e){return null}}
function qt(s){return qs(s)?.innerText?.trim()||null}
function parsePrice(s){if(!s)return null;const c=s.replace(/[^0-9]/g,"");return c?parseInt(c,10):null}

function findSemanticPrice(container) {
  if (!container) return null;
  const allEls = container.querySelectorAll('div,span,strong,p');
  let best = null;
  let bestLen = Infinity;
  for (const el of allEls) {
    if (el.children.length > 0) continue;
    const text = (el.innerText || '').trim();
    if (/^\u20b9[\s\d,]+$/.test(text)) {
      const val = parseInt(text.replace(/[^0-9]/g,''), 10);
      if (!isNaN(val) && val > 100 && text.length < bestLen) {
        const style = window.getComputedStyle(el);
        if (style.textDecoration && style.textDecoration.includes('line-through')) continue;
        best = text;
        bestLen = text.length;
      }
    }
  }
  return best;
}

function extractAmazon(){
  const titleEl = document.querySelector("#productTitle");
  if (!titleEl) return null;
  const t = titleEl.innerText.trim();
  const p = parsePrice(qt(".a-price-whole") || qt(".a-color-price") || qt(".priceToPay") || qt("#priceblock_ourprice"));
  const data = {
    title:t, price:p, currency:"INR", brand:qt("#bylineInfo"),
    asin:(location.href.match(/\/dp\/([A-Z0-9]{10})/)||[])[1]||null,
    modelNumber:findSpecValue(["Model","Part Number"]),
    color:findSpecValue(["Color","Colour"]),
    ram:findSpecValue(["RAM","Memory"]),
    storage:findSpecValue(["Storage","Memory Storage Capacity"]),
    url:location.href, platform:"amazon.in"
  };
  return data;
}

function extractFlipkart(){
  try {
  if (!location.href.includes("/p/")) return null;
  // Title: robust fallback chain
  var t = qt('.B_NuCI') || qt('.yhB1nd') || qt('h1._9E25nV') || qt('h1 span') || qt('h1');
  
  // Price: multi-strategy with robust fallback chain
  var p = null;
  // Strategy 1: Known Flipkart CSS class selectors (rotated frequently)
  var priceSelectors = [
    '._30jeq3._16Jk6d',
    '._16Jk6d',
    '.Nx9bqj.CxhGGd',
    '.CEmiEU .Nx9bqj',
    '._25b18c ._30jeq3',
    'div[class*="CxhGGd"]',
    'div[class*="Nx9bqj"]',
    'div[class*="_30jeq3"]',
    'div[class*="_16Jk6d"]',
    'span[class*="CxhGGd"]',
    'span[class*="Nx9bqj"]',
    '[class*="price"] [class*="30jeq"]',
  ];
  for (var si = 0; si < priceSelectors.length && !p; si++) {
    try {
      var pel = document.querySelector(priceSelectors[si]);
      if (pel && pel.innerText) p = parsePrice(pel.innerText);
    } catch(e) { /* selector parse error, skip */ }
  }
  
  // Strategy 2: Find any element whose text starts with ₹ + digits
  if (!p) {
    var allEls = document.querySelectorAll('div,span,strong');
    for (var i = 0; i < allEls.length && !p; i++) {
      var el = allEls[i];
      if (!el || !el.innerText) continue;
      var childCount = 0; try { childCount = el.children.length; } catch(e) { continue; }
      if (childCount > 2) continue;
      var txt = el.innerText.trim();
      if (txt.length > 20 || txt.length < 2) continue;
      if (/\u20b9\s*[\d,]+/.test(txt)) {
        try {
          var style = window.getComputedStyle(el);
          if (style && style.textDecoration && style.textDecoration.includes('line-through')) continue;
        } catch(e) { /* skip style check */ }
        var val = parseInt(txt.replace(/[^0-9]/g,''), 10);
        if (val > 100 && val < 10000000) { p = val; break; }
      }
    }
  }
  
  var flipkartPid =
    (location.href.match(/\/p\/itm([A-Za-z0-9]+)/i)||[])[1] ||
    (new URLSearchParams(location.search)).get('pid') || null;
  return {
    title: t, price: p, currency: "INR",
    brand: qt("._2WkVRV") || qt(".mEh187") || null,
    flipkartPid: flipkartPid,
    modelNumber: findSpecValue(["Model Name","Model Number"]),
    color: findSpecValue(["Color","Colour"]),
    ram: findSpecValue(["RAM"]),
    storage: findSpecValue(["Internal Storage","Storage"]),
    url: location.href, platform: "flipkart.com"
  };
  } catch(ex) { console.warn('[SCP] Flipkart extract error:', ex); return null; }
}

function extractMyntra(){
  return{title:qt(".pdp-title")||qt("h1.pdp-title"),price:parsePrice(qt(".pdp-price strong")),
    currency:"INR",brand:qt(".pdp-title h1"),url:location.href,platform:"myntra"};
}
function extractCroma(){
  return{title:qt(".pd-title"),price:parsePrice(qt(".pdp-price")),
    currency:"INR",modelNumber:qt('[data-testid="model-number"]'),url:location.href,platform:"croma"};
}
function extractAjio(){
  return{title:qt(".prod-name"),price:parsePrice(qt(".prod-sp")),
    currency:"INR",brand:qt(".brand-name"),url:location.href,platform:"ajio"};
}
function extractNykaa(){
  return{title:qt(".product-title h1")||qt("h1"),price:parsePrice(qt(".post-card__info-price")||qt('[class*="price"]')),
    currency:"INR",brand:qt(".product-brand")||qt('[data-at="brand-name"]'),
    imageUrl:qs(".product-image img")?.src||"",url:location.href,platform:"nykaa"};
}
function extractTatacliq(){
  return{title:qt(".pdp-title")||qt("h1"),price:parsePrice(qt(".final-price")||qt('[class*="price"]')),
    currency:"INR",brand:qt(".brand-name")||qt('[class*="brand"]'),url:location.href,platform:"tatacliq"};
}
function extractRelianceDigital(){
  return{title:qt(".pdp__product-name")||qt("h1"),price:parsePrice(qt(".pdp__offer-price")||qt('[class*="price"]')),
    currency:"INR",brand:qt(".pdp__brand-name"),url:location.href,platform:"reliancedigital"};
}
function extractFirstcry(){
  return{title:qt("h1.title")||qt(".product-title")||qt("h1"),price:parsePrice(qt(".price-discounted")||qt('[class*="price"]')),
    currency:"INR",brand:qt(".brand-name"),url:location.href,platform:"firstcry"};
}
function extractBlinkit(){
  return{title:qt('[data-testid="product-name"]')||qt(".product__name")||qt("h1"),
    price:parsePrice(qt('[data-testid="product-price"]')||qt('[class*="price"]')),
    currency:"INR",url:location.href,platform:"blinkit"};
}
function extractZepto(){
  return{title:qt(".product-name")||qt("h1"),price:parsePrice(qt(".final-price")||qt('[class*="price"]')),
    currency:"INR",url:location.href,platform:"zepto"};
}
function extractBigbasket(){
  return{title:qt("h1.prod-name")||qt(".product-name")||qt("h1"),
    price:parsePrice(qt(".discnt-price")||qt('[class*="price"]')),
    currency:"INR",brand:qt(".brand-name"),url:location.href,platform:"bigbasket"};
}
function extractJiomart(){
  return{title:qt("h1.product-title")||qt(".product-name")||qt("h1"),
    price:parsePrice(qt(".final-price")||qt('[class*="price"]')),
    currency:"INR",brand:qt(".brand-name"),url:location.href,platform:"jiomart"};
}
function extractVijaySales(){
  return{title:qt("h1")||qt(".product-title"),price:parsePrice(qt(".product-price")||qt('[class*="price"]')),
    currency:"INR",url:location.href,platform:"vijaysales.com"};
}
function extractAppleIndia(){
  return{title:qt("h1")||qt(".product-title"),price:parsePrice(qt(".rc-prices-fullprice")||qt(".as-price-currentprice")),
    currency:"INR",brand:"Apple",url:location.href,platform:"apple.com"};
}
function extractDecathlon(){
  return{title:qt("h1")||qt(".product-title"),price:parsePrice(qt("[data-aut=product-price]")||qt('[class*="price"]')),
    currency:"INR",brand:"Decathlon",url:location.href,platform:"decathlon.in"};
}
function extractKitabay(){
  return{title:qt("h1")||qt(".product-title"),price:parsePrice(qt(".price-item--sale")||qt(".price-item--regular")),
    currency:"INR",url:location.href,platform:"kitabay.com"};
}

function findSpecValue(keys){
  const rows=document.querySelectorAll("tr,li,.a-list-item");
  for(const r of rows){const t=r.textContent;for(const k of keys){
    if(t.includes(k)){const c=r.querySelectorAll("td,span");if(c.length>=2)return c[c.length-1].textContent.trim();}
  }}return null;
}

const EXTRACTORS={"amazon.in":extractAmazon,"flipkart.com":extractFlipkart,
  "myntra.com":extractMyntra,"croma.com":extractCroma,"ajio.com":extractAjio,
  "nykaa.com":extractNykaa,"tatacliq.com":extractTatacliq,
  "reliancedigital.in":extractRelianceDigital,"firstcry.com":extractFirstcry,
  "blinkit.com":extractBlinkit,"zeptonow.com":extractZepto,
  "bigbasket.com":extractBigbasket,"jiomart.com":extractJiomart,
  "vijaysales.com":extractVijaySales,"apple.com":extractAppleIndia,
  "decathlon.in":extractDecathlon,"kitabay.com":extractKitabay};

function extractProductData(platform){
  var fn=EXTRACTORS[platform];if(!fn)return null;
  try {
    var d=fn();
    if(!d) return null;
    // Allow null price — backend handles it. Only require title OR url.
    if(!d.title && !d.url) return null;
    return d;
  } catch(e) {
    console.warn('[SCP] Extraction error on', platform, e);
    return null;
  }
}

function msg(m){return new Promise(function(res,rej){
  if(!isContextValid()){rej(new Error('Extension context invalidated'));return;}
  try{
    chrome.runtime.sendMessage(m,function(r){if(chrome.runtime.lastError){rej(new Error(chrome.runtime.lastError.message));return;}res(r);});
  }catch(e){rej(e);}
})}

// -- Panel CSS --
function loadPanelCSS(){
  if(document.getElementById('scp-panel-css'))return;
  if(!isContextValid())return;
  try{
    var l=document.createElement('link');l.id='scp-panel-css';l.rel='stylesheet';
    l.href=chrome.runtime.getURL('panel.css');document.head.appendChild(l);
  }catch(e){console.warn('[SCP] CSS load:',e);}
}
function pushPageBody(open){
  var existing=document.getElementById('scp-body-style');
  if(open&&!existing){
    var s=document.createElement('style');s.id='scp-body-style';
    s.textContent='body{margin-left:440px!important;transition:margin-left .5s cubic-bezier(.16,1,.3,1)!important}';
    document.head.appendChild(s);
  }else if(!open&&existing){
    existing.textContent='body{margin-left:0!important;transition:margin-left .4s cubic-bezier(.87,0,.13,1)!important}';
    setTimeout(function(){existing.remove()},400);
  }
}
function injectPanel(){
  if(document.getElementById('scp-panel'))return;
  loadPanelCSS();
  var p=document.createElement('div');p.id='scp-panel';p.className='sc-panel';
  p.innerHTML='<header class="sc-header"><div class="sc-header-left"><button class="sc-back-btn" title="Back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg></button><div class="sc-logo-group"><div class="sc-logo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div><span class="sc-logo-text">SmartCompare</span><span class="sc-pro-badge">PRO</span></div></div><div class="sc-header-right"><div id="scp-live-dot" style="width:8px;height:8px;border-radius:50%;background:#ccc;transition:all .3s" title="Checking..."></div><button class="sc-header-btn" id="scp-close-btn" title="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div></header><div class="sc-content" id="scp-content"><div id="scp-product-area"></div><div id="scp-main-content"></div></div><nav class="sc-bottom-nav"><button class="sc-nav-item active" data-tab="compare"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg><span class="sc-nav-label">Compare</span></button><button class="sc-nav-item" data-tab="alerts"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9m-4.27 13a2 2 0 01-3.46 0"/></svg><span class="sc-nav-label">Alerts</span></button><button class="sc-nav-item" data-tab="history"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><span class="sc-nav-label">History</span></button><button class="sc-nav-item" data-tab="settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg><span class="sc-nav-label">Settings</span></button></nav>';
  document.body.appendChild(p);
  document.getElementById('scp-close-btn').addEventListener('click',function(){hidePanel()});
  p.querySelectorAll('.sc-nav-item').forEach(function(n){n.addEventListener('click',function(){
    p.querySelectorAll('.sc-nav-item').forEach(function(x){x.classList.remove('active')});n.classList.add('active');
  })});
  startHeartbeat();
  requestAnimationFrame(function(){requestAnimationFrame(function(){p.classList.add('open');pushPageBody(true);panelVisible=true;})});
}
function hidePanel(){var p=document.getElementById('scp-panel');if(p){p.classList.remove('open');pushPageBody(false);panelVisible=false;}stopHeartbeat();}
function showPanel(){var p=document.getElementById('scp-panel');if(p){p.classList.add('open');pushPageBody(true);panelVisible=true;}}
function removePanel(){var p=document.getElementById('scp-panel');if(p)p.remove();pushPageBody(false);panelVisible=false;}
if(isContextValid()){try{chrome.runtime.onMessage.addListener(function(m){if(m.type==="TOGGLE_PANEL"){panelVisible?hidePanel():showPanel();}});}catch(e){}}
function fmtINR(n){if(n==null)return"\u2013";return"\u20b9"+Number(n).toLocaleString("en-IN")}
function timeAgo(d){if(!d)return"";var s=Math.floor((Date.now()-new Date(d))/1000);if(s<60)return"just now";if(s<3600)return Math.floor(s/60)+"m ago";if(s<86400)return Math.floor(s/3600)+"h ago";return Math.floor(s/86400)+"d ago";}

function inferCategory(title){
  if(!title)return'general';var t=title.toLowerCase();
  if(/\b(phone|smartphone|iphone|galaxy|pixel|oneplus|redmi|realme|poco|vivo|oppo|iqoo)\b/.test(t))return'smartphones';
  if(/\b(laptop|notebook|macbook|thinkpad|chromebook|vivobook|ideapad)\b/.test(t))return'laptops';
  if(/\b(tv|television|smart tv|oled|qled|bravia)\b/.test(t))return'tvs';
  if(/\b(earbuds|headphone|earphone|airpods|headset|speaker|soundbar)\b/.test(t))return'audio';
  if(/\b(playstation|xbox|nintendo|ps5|ps4|gaming console)\b/.test(t))return'gaming';
  return'electronics';
}

function computeDealTags(r,priceStats,allResults){
  var tags=[];if(!r||!r.price)return tags;
  var best=allResults.length>0?Math.min.apply(null,allResults.filter(function(x){return x.price}).map(function(x){return x.price})):0;
  if(r.price===best&&allResults.length>1)tags.push('BEST DEAL');
  if(priceStats){
    if(priceStats.all_time_low&&r.price<=priceStats.all_time_low*1.02)tags.push('ALL TIME LOW');
    if(priceStats.avg_price_90d&&r.price<priceStats.avg_price_90d*0.9)tags.push('PRICE DROP');
  }
  return tags;
}
function freshnessClass(dateStr){
  if(!dateStr)return'stale';var h=(Date.now()-new Date(dateStr))/3600000;
  if(h<1)return'live';if(h<24)return'fresh';return'stale';
}

function setLoading(){
  var el=document.getElementById('scp-main-content');if(!el)return;
  el.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 24px;gap:16px"><div style="width:40px;height:40px;border:3px solid rgba(124,92,252,0.15);border-top-color:#7c5cfc;border-radius:50%;animation:sc-spin 0.8s linear infinite"></div><div style="font-size:13px;color:#64668b">Analyzing market data...</div><style>@keyframes sc-spin{to{transform:rotate(360deg)}}</style></div>';
}
function setError(message,errorType){
  var el=document.getElementById('scp-main-content');if(!el)return;
  var icons={network:'\ud83d\udd0c',auth:'\ud83d\udd12',extract:'\ud83d\udcce',server:'\u2699\ufe0f',generic:'\u26a0\ufe0f'};
  el.innerHTML='<div style="text-align:center;padding:40px 24px"><div style="font-size:36px;margin-bottom:12px">'+(icons[errorType]||'\u26a0\ufe0f')+'</div><div style="font-size:15px;font-weight:600;color:#1a1a2e;margin-bottom:8px">'+(message||'Connection error')+'</div><button class="sc-alert-btn" id="scp-retry" style="margin-top:16px">Retry</button></div>';
  var rb=document.getElementById('scp-retry');if(rb)rb.addEventListener('click',function(){runComparison()});
  updateLiveDot('disconnected');
}
function setNoMatch(){
  var el=document.getElementById('scp-main-content');if(!el)return;
  el.innerHTML='<div style="text-align:center;padding:40px 24px"><div style="font-size:36px;margin-bottom:12px">\ud83d\udd0d</div><div style="font-size:15px;font-weight:600;color:#1a1a2e">No matches found</div><div style="font-size:13px;color:#64668b;margin-top:8px">We couldn\'t find this product on other platforms yet.</div></div>';
}
function setQueued(retryNum){
  var el=document.getElementById('scp-main-content');if(!el)return;
  var attempt=retryNum||1;
  var statusText=attempt>1?'Checking... (attempt '+attempt+')':'Prices are being fetched. Check back shortly.';
  el.innerHTML='<div style="text-align:center;padding:40px 24px"><div style="font-size:36px;margin-bottom:12px">\ud83d\udd56</div><div style="font-size:15px;font-weight:600;color:#1a1a2e">Tracking started</div><div style="font-size:13px;color:#64668b;margin-top:8px">'+statusText+'</div><div style="width:100%;height:2px;background:#e2e4ea;border-radius:2px;margin-top:16px;overflow:hidden;position:relative"><div style="position:absolute;left:0;top:0;height:100%;width:'+Math.min(attempt*8,100)+'%;background:linear-gradient(90deg,#7c5cfc,#6366f1);border-radius:2px;transition:width 0.5s ease"></div></div></div>';
}
function renderFound(data){cachedData=data;renderProductCard(data);renderCompareSection(data);renderInsightsSection(data);renderAlternativesSection(data);renderChartSection(data);renderAlertSection(data);}

function renderProductCard(d){
  var el=document.getElementById('scp-product-area');if(!el)return;
  // Find the current platform's listing (match_confidence=1 or source platform)
  var currPlatform=detectPlatform();
  var currentListing=null;
  if(d.results){
    for(var ci=0;ci<d.results.length;ci++){
      if(d.results[ci].match_confidence>=1||(currPlatform&&d.results[ci].platform&&d.results[ci].platform.indexOf(currPlatform.split('.')[0])>=0)){
        currentListing=d.results[ci];break;
      }
    }
  }
  if(!currentListing&&d.results&&d.results.length>0)currentListing=d.results[0];
  var title=d.product_title||(currentListing?currentListing.title:null)||'Product';
  var price=currentListing?currentListing.price:null;
  var platName=currentListing?currentListing.platform:(currPlatform||'');
  // Match method badge
  var conf=currentListing?currentListing.match_confidence:null;
  var method=currentListing?currentListing.match_method:null;
  var badgeText='Verified';
  if(conf>=1||method==='extension')badgeText='Exact Match';
  else if(method==='deterministic'||method==='asin')badgeText='Exact Match';
  else if(method==='nlp_high')badgeText='Strong Match';
  else if(method==='nlp_likely'||method==='title_match')badgeText='Likely Match';
  else if(method==='image_hash')badgeText='Visual Match';
  else if(method==='url_cache')badgeText='Cached';
  el.innerHTML='<div class="sc-product-card"><div class="sc-product-img"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg></div><div class="sc-product-info"><div class="sc-product-name">'+title+'</div><div class="sc-product-category">'+platName+'</div>'+(price?'<div style="font-size:16px;font-weight:700;color:#7c5cfc;margin-top:4px">'+fmtINR(price)+'</div>':'')+'<div class="sc-ai-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> '+badgeText+'</div></div></div>';
}

function renderCompareSection(d){
  var el=document.getElementById('scp-main-content');if(!el)return;
  var results=d.results||[];var ps=d.price_stats||{};
  
  var currPlatform=detectPlatform();var currPrice=0;
  if(results){
    for(var ci=0;ci<results.length;ci++){
      if(results[ci].match_confidence>=1||(currPlatform&&results[ci].platform&&results[ci].platform.indexOf(currPlatform.split('.')[0])>=0)){
        currPrice=results[ci].price;break;
      }
    }
  }
  if(!currPrice&&results[0])currPrice=results[0].price;

  var h='<div class="sc-section"><div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">1.</span><span class="sc-section-title">Compare across websites</span></div><span class="sc-result-count">'+results.length+' results</span></div><div class="sc-compare-list">';
  var prices=results.filter(function(r){return r.price}).map(function(r){return r.price});
  var best=prices.length>0?Math.min.apply(null,prices):0;
  for(var i=0;i<results.length;i++){
    var r=results[i];
    var platKey=null;var keys=Object.keys(PLATFORMS);
    for(var ki=0;ki<keys.length;ki++){if(r.platform&&r.platform.toLowerCase().indexOf(keys[ki].split('.')[0])>=0){platKey=keys[ki];break;}}
    platKey=platKey||r.platform;
    var pi=PLATFORMS[platKey]||{name:r.platform,cls:'',tier:3};
    var colors={amazon:'#FF9900',flipkart:'#2874F0',myntra:'#FF3F6C',ajio:'#E31837',apple:'#555',croma:'#65AC2A',vijaysales:'#E21F26',reliancedigital:'#1B3A8E',nykaa:'#FC2779'};
    var color=colors[pi.cls]||'#7c5cfc';
    var isBest=r.price===best&&results.length>1;
    var conf=r.match_confidence!=null?r.match_confidence:1;
    var confBadge=conf>=1?'<span class="sc-conf-badge exact">Exact</span>':'<span class="sc-conf-badge likely">Likely '+(conf*100|0)+'%</span>';
    var fc=freshnessClass(r.last_scraped_at);
    var freshBadge='<span class="sc-fresh-badge '+fc+'">'+timeAgo(r.last_scraped_at)+'</span>';
    var d2cBadge=pi.d2c?'<span class="sc-d2c-badge">Official Store</span>':'';
    var dealTags=computeDealTags(r,ps,results);
    var dealHtml='';for(var di=0;di<dealTags.length;di++){dealHtml+='<span class="sc-deal-tag '+dealTags[di].toLowerCase().replace(/ /g,'-')+'">'+dealTags[di]+'</span>';}
    var saveHtml='';
    if(currPrice&&r.price&&r.price<currPrice){var saved=currPrice-r.price;var pct=((saved/currPrice)*100).toFixed(1);saveHtml='<div class="sc-savings">Save '+fmtINR(saved)+' ('+pct+'%)</div>';}
    h+='<a class="sc-compare-card'+(isBest?' best':'')+'" href="'+(r.url||'#')+'" target="_blank" style="animation-delay:'+i*0.06+'s"><div class="sc-store-logo" style="background:'+color+'">'+(pi.name?pi.name[0]:'?')+'</div><div class="sc-store-info"><div class="sc-store-name">'+pi.name+'</div><div class="sc-store-meta">'+confBadge+freshBadge+d2cBadge+'</div><div class="sc-deal-tags">'+dealHtml+'</div></div><div class="sc-price-col"><div class="sc-price-main">'+fmtINR(r.price)+'</div>'+saveHtml+(isBest?'<div class="sc-best-pill">Best Price</div>':'')+'</div><svg class="sc-compare-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></a>';
  }
  h+='</div></div>';
  el.innerHTML=h;
}
function renderInsightsSection(d){
  var el=document.getElementById('scp-main-content');if(!el)return;
  var ps=d.price_stats||{};var br=d.buy_recommendation||{};
  // CURRENT = current page's price (match_confidence=1), not cheapest
  var currPlatform=detectPlatform();var cp=0;
  if(d.results){
    for(var ci=0;ci<d.results.length;ci++){
      if(d.results[ci].match_confidence>=1||(currPlatform&&d.results[ci].platform&&d.results[ci].platform.indexOf(currPlatform.split('.')[0])>=0)){
        cp=d.results[ci].price;break;
      }
    }
  }
  if(!cp&&d.results&&d.results[0])cp=d.results[0].price;
  var recClass=br.score>=50?'buy':'wait';
  var recText=br.label||'Analyzing...';
  var avg=ps.avg_price_90d||0;
  var posHtml='';
  if(cp&&ps.all_time_low){var diff=cp-ps.all_time_low;posHtml=diff<=0?'<div class="sc-price-position at-low">\ud83c\udfaf At the lowest price!</div>':'<div class="sc-price-position above-low">You\'re '+fmtINR(diff)+' above the lowest</div>';}
  el.innerHTML+='<div class="sc-section" style="animation-delay:0.2s"><div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">2.</span><span class="sc-section-title">Price intelligence</span></div></div><div class="sc-insights-grid"><div class="sc-insight-card high"><div class="sc-insight-icon">\ud83d\udcc8</div><div class="sc-insight-label">Highest</div><div class="sc-insight-value">'+fmtINR(ps.all_time_high)+'</div></div><div class="sc-insight-card low"><div class="sc-insight-icon">\ud83d\udcc9</div><div class="sc-insight-label">Lowest</div><div class="sc-insight-value">'+fmtINR(ps.all_time_low)+'</div></div><div class="sc-insight-card current"><div class="sc-insight-icon">\ud83d\udcca</div><div class="sc-insight-label">Current</div><div class="sc-insight-value">'+fmtINR(cp)+'</div></div><div class="sc-insight-card avg"><div class="sc-insight-icon">\ud83d\udccb</div><div class="sc-insight-label">Average</div><div class="sc-insight-value">'+fmtINR(avg)+'</div></div></div>'+posHtml+'<div class="sc-ai-rec '+recClass+'"><span class="sc-ai-rec-icon">'+(br.score>=50?'\ud83d\ude80':'\u23f3')+'</span><span class="sc-ai-rec-text">'+recText+'</span></div></div>';
}

function renderAlternativesSection(d){
  var el=document.getElementById('scp-main-content');if(!el)return;
  var alts=d.alternatives||[];
  if(alts.length===0)return;
  var h='<div class="sc-section" style="animation-delay:0.25s"><div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">3.</span><span class="sc-section-title">AI Recommendations</span></div></div><div class="sc-alts-list">';
  for(var i=0;i<alts.length;i++){
    var a=alts[i];
    h+='<div class="sc-alt-card"><div class="sc-alt-info"><div class="sc-alt-name">'+a.name+'</div><div class="sc-alt-reason">\u2728 '+a.reason+'</div></div><div class="sc-alt-price">'+fmtINR(a.price)+'</div></div>';
  }
  h+='</div></div>';
  el.innerHTML+=h;
}

function renderChartSection(d){
  var el=document.getElementById('scp-main-content');if(!el)return;
  var history=d.price_history||[];
  if(history.length===0)return;
  el.innerHTML+='<div class="sc-chart-section" style="animation-delay:0.3s"><div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">4.</span><span class="sc-section-title">Price history</span></div></div><div class="sc-chart-card"><div class="sc-chart-filters"><button class="sc-chart-pill" data-range="30">1M</button><button class="sc-chart-pill" data-range="90">3M</button><button class="sc-chart-pill" data-range="180">6M</button><button class="sc-chart-pill active" data-range="0">All</button></div><div class="sc-chart-area"><canvas id="scp-chart"></canvas></div></div></div>';
  document.querySelectorAll('.sc-chart-pill').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.sc-chart-pill').forEach(function(b){b.classList.remove('active')});
      btn.classList.add('active');loadChart(history,parseInt(btn.dataset.range)||0);
    });
  });
  loadChart(history);
}

function renderAlertSection(d){
  var el=document.getElementById('scp-main-content');if(!el)return;
  var currPlatform=detectPlatform();var cp='';
  if(d.results){
    for(var ci=0;ci<d.results.length;ci++){
      if(d.results[ci].match_confidence>=1||(currPlatform&&d.results[ci].platform&&d.results[ci].platform.indexOf(currPlatform.split('.')[0])>=0)){
        cp=d.results[ci].price;break;
      }
    }
  }
  if(!cp&&d.results&&d.results[0])cp=d.results[0].price;
  
  el.innerHTML+='<div class="sc-section" style="animation-delay:0.4s"><div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">5.</span><span class="sc-section-title">Smart alerts</span></div></div><div class="sc-alerts-card"><div class="sc-alert-row"><input class="sc-alert-input" id="scp-alert-price" type="number" value="'+cp+'" placeholder="Target price"><button class="sc-alert-btn" id="scp-watchlist-btn" data-pid="'+(d.product_id||'')+'">Set Alert</button></div></div></div><div style="height:24px"></div>';
  setupWatchlistBtn(d);
}

function setupWatchlistBtn(data){
  var btn=document.getElementById('scp-watchlist-btn');if(!btn)return;
  btn.addEventListener('click',function(){
    if(btn.disabled)return;btn.disabled=true;
    var input=document.getElementById('scp-alert-price');
    var tp=input?parseFloat(input.value):null;
    msg({type:'ADD_WATCHLIST',payload:{product_id:btn.dataset.pid,target_price:tp}}).then(function(r){
      if(r&&r.success){btn.textContent='\u2713 Watching';btn.style.background='var(--sc-green)';btn.style.boxShadow='0 4px 14px rgba(34,197,94,.3)';}
      else{btn.textContent='Error';setTimeout(function(){btn.textContent='Set Alert'},2000);}
      btn.disabled=false;
    }).catch(function(){btn.textContent='Failed';btn.disabled=false;});
  });
}
// -- Chart --
var chartJsLoaded=false;
function loadChartJs(){return new Promise(function(res,rej){
  if(chartJsLoaded){res();return;}if(!isContextValid()){rej(new Error('ctx'));return;}
  try{var u=chrome.runtime.getURL('chart.min.js');var s=document.createElement('script');s.src=u;
    s.onload=function(){chartJsLoaded=true;res()};s.onerror=function(){rej(new Error('Chart.js fail'))};document.head.appendChild(s);
  }catch(e){rej(e);}
})}
function initPriceChart(historyData){
  var canvas=document.getElementById('scp-chart');if(!canvas)return null;
  var ctx=canvas.getContext('2d');
  var grad=ctx.createLinearGradient(0,0,0,200);
  grad.addColorStop(0,'rgba(124,92,252,0.25)');grad.addColorStop(1,'rgba(124,92,252,0.01)');
  return new Chart(ctx,{type:'line',data:{
    labels:historyData.map(function(d){var dt=new Date(d.date);return dt.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}),
    datasets:[{data:historyData.map(function(d){return d.price}),borderColor:'#7c5cfc',borderWidth:2.5,pointRadius:3,pointBackgroundColor:'#7c5cfc',pointBorderColor:'#fff',pointBorderWidth:2,pointHoverRadius:6,backgroundColor:grad,fill:true,tension:0.4}]
  },options:{responsive:true,maintainAspectRatio:false,animation:{duration:1200,easing:'easeOutQuart'},
    interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},
      tooltip:{backgroundColor:'rgba(26,26,46,.95)',titleColor:'#fff',bodyColor:'#c4c6db',borderColor:'rgba(124,92,252,.3)',borderWidth:1,cornerRadius:10,padding:12,displayColors:false,
        callbacks:{label:function(c){return'\u20b9'+c.raw.toLocaleString('en-IN')}}}},
    scales:{x:{grid:{color:'rgba(0,0,0,.04)',drawBorder:false},border:{display:false},ticks:{color:'#9b9dba',font:{size:10},maxTicksLimit:5,maxRotation:0}},
      y:{grid:{color:'rgba(0,0,0,.04)',drawBorder:false},border:{display:false},ticks:{color:'#9b9dba',font:{size:10},callback:function(v){return v>=100000?'\u20b9'+(v/100000).toFixed(1)+'L':'\u20b9'+(v/1000).toFixed(0)+'K'},maxTicksLimit:4}}}}});
}
function loadChart(history,rangeDays){
  if(rangeDays===undefined)rangeDays=0;
  loadChartJs().then(function(){
    var data=history;if(rangeDays>0){var c=new Date(Date.now()-rangeDays*86400000);data=history.filter(function(h){return new Date(h.date)>=c});}
    if(data.length===0)return;if(chartInstance){chartInstance.destroy();}chartInstance=initPriceChart(data);
  }).catch(function(){});
}
// -- Heartbeat --
function updateLiveDot(state){
  connectionState=state;var dot=document.getElementById('scp-live-dot');if(!dot)return;
  var colors={connected:'#22c55e',checking:'#f59e0b',disconnected:'#ef4444'};
  dot.style.background=colors[state]||'#ccc';dot.style.boxShadow='0 0 6px '+(colors[state]||'#ccc');
  dot.title=state==='connected'?'Connected':state==='checking'?'Checking...':'Disconnected';
}
function checkHeartbeat(){
  if(!isContextValid()||!panelVisible)return;updateLiveDot('checking');
  msg({type:'API_REQUEST',method:'GET',endpoint:'/api/health'}).then(function(r){updateLiveDot(r?'connected':'disconnected')}).catch(function(){updateLiveDot('disconnected')});
}
function startHeartbeat(){stopHeartbeat();checkHeartbeat();heartbeatTimer=setInterval(checkHeartbeat,30000);}
function stopHeartbeat(){if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null;}}

// -- Main Flow --
function runComparison(silent){
  if(!silent)silent=false;
  if(!isContextValid())return;var platform=detectPlatform();if(!platform)return;
  try{injectPanel();}catch(e){return;}
  if(!silent)setLoading();
  var productData=extractProductData(platform);
  if(!productData){
    setTimeout(function(){
      productData=extractProductData(platform);
      if(!productData){if(!silent)setError('Could not extract product details.','extract');return;}
      doCompare(productData,silent);
    },2000);
    return;
  }
  doCompare(productData,silent);
}
var pollRetries=0;
function doCompare(productData,silent){
  msg({type:'COMPARE',payload:productData}).then(function(response){
    if(!response)throw new Error('No response');
    if(response.error){if(!silent){response.code==='NO_TOKEN'?setError('Please log in via popup.','auth'):setError(response.error,'server');}return;}
    var data=response.data;if(!data||data.error){if(!silent)setError(data?data.error:'Empty data');return;}
    cachedData=data;updateLiveDot('connected');
    if(data.status==='queued'){
      pollRetries++;
      setQueued(pollRetries);
      if(pollInterval)clearTimeout(pollInterval);
      // Back off: 10s for first 6, 15s for next 6, then 30s
      var delay = pollRetries<=6 ? 10000 : pollRetries<=12 ? 15000 : 30000;
      pollInterval=setTimeout(function(){runComparison(true)},delay);
      return;
    }
    pollRetries=0;
    if(data.status==='found'&&data.results&&data.results.length>0){renderFound(data);}
    else{setNoMatch();}
  }).catch(function(err){if(!isContextValid())return;if(!silent)setError('Could not connect to server','network');});
}

// -- SPA Nav --
var observer=new MutationObserver(function(){
  if(location.href!==lastUrl){lastUrl=location.href;if(pollInterval){clearInterval(pollInterval);pollInterval=null;}
    if(detectPlatform())setTimeout(function(){setLoading();runComparison()},2000);else removePanel();}
});
observer.observe(document.body,{childList:true,subtree:true});

// -- Init --
var platform=detectPlatform();
if(platform&&isContextValid()){
  setTimeout(function(){if(!isContextValid())return;var d=extractProductData(platform);if(d)msg({type:'OBSERVE',payload:d}).catch(function(){})},5000);
  msg({type:'GET_TOKEN'}).then(function(r){if(r&&r.token)setTimeout(runComparison,3000)}).catch(function(){});
}
})();
