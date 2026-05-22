/**
 * SmartCompare Pro — Content Script (extension/content.js)
 *
 * CHANGES:
 * - FIX A: Added lazy History tab fetch via API_REQUEST to GET /api/history/:product_id
 * - FIX B: Fixed setupWatchlistBtn with proper success/error UX, Set/Remove Alert toggle
 * - FIX C: renderAlternativesSection now lazy-fetches AI recommendations from
 *          GET /api/compare/recommendations/:product_id with better_for badges
 *
 * Message types used (sent to background.js):
 *   - API_REQUEST: { type, endpoint, method } — proxied to backend with auth header
 *   - COMPARE: product data payload
 *   - ADD_WATCHLIST: { type, payload: { product_id, target_price } }
 *   - REMOVE_WATCHLIST: { type, product_id }
 *   - GET_TOKEN, OBSERVE
 *
 * Endpoint URLs used:
 *   - /api/history/{product_id} (History tab)
 *   - /api/compare/recommendations/{product_id} (AI Recommendations)
 *   - /api/watchlist (POST — Set Alert)
 *   - /api/watchlist/{product_id} (DELETE — Remove Alert)
 */
(function(){
"use strict";
if(window.__smartCompareLoaded)return;
window.__smartCompareLoaded=true;

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
  "nykaafashion.com":{name:"Nykaa Fashion",cls:"nykaa",tier:3},
  "tatacliq.com":{name:"TataCliq",cls:"tatacliq",tier:3},
  "firstcry.com":{name:"FirstCry",cls:"firstcry",tier:3},
  "blinkit.com":{name:"Blinkit",cls:"blinkit",tier:3},
  "bigbasket.com":{name:"BigBasket",cls:"bigbasket",tier:3},
  "decathlon.in":{name:"Decathlon",cls:"decathlon",tier:3},
  "kitabay.com":{name:"Kitabay",cls:"kitabay",tier:3}
};

function detectPlatform(){
  const h=location.hostname;
  for(const k of Object.keys(PLATFORMS)){if(h.includes(k))return k;}
  return null;
}

function getProductIdentifier() {
  const url = location.href;
  const platform = detectPlatform();
  if (!platform) return null;
  
  if (platform === 'amazon.in') {
    const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/i) || url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
    return asinMatch ? `amazon-${asinMatch[1].toUpperCase()}` : url;
  }
  if (platform === 'flipkart.com') {
    const itmMatch = url.match(/\/p\/(itm[a-zA-Z0-9]+)/i);
    if (itmMatch) return `flipkart-${itmMatch[1].toLowerCase()}`;
    const pid = (new URLSearchParams(location.search)).get('pid');
    if (pid) return `flipkart-pid-${pid.toLowerCase()}`;
    return url;
  }
  try {
    const parsed = new URL(url);
    return `${platform}-${parsed.pathname}`;
  } catch (e) {
    return url;
  }
}

let lastProductIdent=getProductIdentifier(), panelVisible=false, pollInterval=null, cachedData=null, chartInstance=null, heartbeatTimer=null, connectionState='unknown', activeTab='compare';
let historyFetched=false;

function isContextValid(){
  try{ return !!(chrome && chrome.runtime && chrome.runtime.id); }catch(e){ return false; }
}

function qs(s){try{return document.querySelector(s)}catch(e){return null}}
function qt(s){return qs(s)?.innerText?.trim()||null}
function parsePrice(s){
  if(!s)return null;
  let clean = String(s).trim();
  const parts = clean.split(/(?:MRP|mrp|Off|off|Save|save|Discount|discount|%)/i);
  if (parts.length > 0) {
    clean = parts[0];
  }
  if (/\.\d{2}$/.test(clean)) {
    clean = clean.substring(0, clean.length - 3);
  } else if (/\.\d{1}$/.test(clean)) {
    clean = clean.substring(0, clean.length - 2);
  }
  const c=clean.replace(/[^0-9]/g,"");
  return c?parseInt(c,10):null;
}

// Extract price and availability from JSON-LD structured data (works on ALL e-commerce sites)
function extractJsonLd() {
  function findProductInJsonLd(obj) {
    if (!obj) return null;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        var res = findProductInJsonLd(obj[i]);
        if (res) return res;
      }
    } else if (typeof obj === 'object') {
      if (obj['@type'] === 'Product' || (typeof obj['@type'] === 'string' && obj['@type'].indexOf('Product') >= 0)) {
        return obj;
      }
      if (obj['@graph']) {
        return findProductInJsonLd(obj['@graph']);
      }
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          var res = findProductInJsonLd(obj[key]);
          if (res) return res;
        }
      }
    }
    return null;
  }

  var scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (var i = 0; i < scripts.length; i++) {
    try {
      var data = JSON.parse(scripts[i].textContent);
      var product = findProductInJsonLd(data);
      if (product && product.offers) {
        var offers = Array.isArray(product.offers) ? product.offers : 
                     (product.offers['@type'] === 'AggregateOffer' ? [product.offers] : [product.offers]);
        for (var k = 0; k < offers.length; k++) {
          var offer = offers[k];
          var price = offer.price || offer.lowPrice || offer.highPrice;
          if (price) {
            var avail = offer.availability || '';
            var inStock = !avail || avail.toLowerCase().indexOf('instock') >= 0 || avail.toLowerCase().indexOf('in_stock') >= 0;
            var parsed = parsePrice(price);
            if (parsed) {
              return { price: parsed, availability: inStock ? 'in_stock' : 'out_of_stock', name: product.name || null };
            }
          }
        }
      }
    } catch (e) { /* skip invalid JSON-LD */ }
  }
  return null;
}

function findSemanticPrice(container) {
  if (!container) return null;
  const allEls = container.querySelectorAll('div,span,strong,p');
  let best = null;
  let bestLen = Infinity;
  for (const el of allEls) {
    if (el.children.length > 0) continue;
    const text = (el.innerText || '').trim();
    if (/^\u20b9[\s\d,.]+$/.test(text)) {
      const val = parsePrice(text);
      if (val && val > 100 && text.length < bestLen) {
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

  // Detect out-of-stock
  var outOfStock = false;
  var availEl = document.querySelector('#availability, #outOfStock, #unqualifiedBuyBox');
  if (availEl) {
    var availText = (availEl.innerText || '').toLowerCase();
    if (availText.indexOf('unavailable') >= 0 || availText.indexOf('out of stock') >= 0 || availText.indexOf('not available') >= 0) {
      outOfStock = true;
    }
  }

  // Price: prefer JSON-LD (authoritative), fallback to DOM selectors
  var jsonLd = extractJsonLd();
  var p = null;
  var availability = outOfStock ? 'out_of_stock' : 'in_stock';

  if (jsonLd && jsonLd.price) {
    p = jsonLd.price;
    if (jsonLd.availability === 'out_of_stock') availability = 'out_of_stock';
  }

  // Fallback: DOM price selectors
  if (!p) {
    // Try the deal price first (.priceToPay), then regular price
    p = parsePrice(qt('.priceToPay .a-price-whole') || qt('.priceToPay') || qt('.a-price-whole') || qt('.a-color-price') || qt('#priceblock_ourprice') || qt('#priceblock_dealprice'));
  }

  const data = {
    title:t, price:p, currency:"INR", brand:qt("#bylineInfo"),
    asin:(location.href.match(/\/dp\/([A-Z0-9]{10})/)||[])[1]||null,
    modelNumber:findSpecValue(["Model","Part Number"]),
    color:findSpecValue(["Color","Colour"]),
    ram:findSpecValue(["RAM","Memory"]),
    storage:findSpecValue(["Storage","Memory Storage Capacity"]),
    url:location.href, platform:"amazon.in",
    availability: availability
  };
  return data;
}

function extractFlipkart(){
  try {
  if (!location.href.includes("/p/")) return null;
  // Title: robust fallback chain
  var t = qt('.B_NuCI') || qt('.yhB1nd') || qt('h1._9E25nV') || qt('h1 span') || qt('h1');
  
  // Price strategy prioritization:
  var p = null;
  var availability = 'in_stock';
  var titleElement = document.querySelector('.B_NuCI') || document.querySelector('.yhB1nd') || document.querySelector('h1._9E25nV') || document.querySelector('h1');

  // Try JSON-LD first (safest/layout-agnostic)
  var jsonLd = extractJsonLd();
  if (jsonLd && jsonLd.price) {
    p = jsonLd.price;
    availability = jsonLd.availability || 'in_stock';
    if (jsonLd.name && !t) t = jsonLd.name;
  }

  // Fallback 1: Title-Proximity Selectors
  if (!p && titleElement) {
    var parent = titleElement.parentElement;
    for (var depth = 0; depth < 4 && parent && !p; depth++) {
      var priceSelectors = [
        '.Nx9bqj.CxhGGd', '.Nx9bqj', '._30jeq3._16Jk6d', '._30jeq3',
        'div[class*="CxhGGd"]', 'div[class*="Nx9bqj"]', 'div[class*="v1zwn20"]',
        'div[class*="_30jeq3"]', 'div[class*="_16Jk6d"]'
      ];
      for (var si = 0; si < priceSelectors.length; si++) {
        var priceEl = parent.querySelector(priceSelectors[si]);
        if (priceEl && priceEl.innerText) {
          try {
            var style = window.getComputedStyle(priceEl);
            if (style && style.textDecoration && style.textDecoration.includes('line-through')) continue;
          } catch(e) {}
          var val = parsePrice(priceEl.innerText);
          if (val && val > 100) {
            p = val;
            break;
          }
        }
      }
      parent = parent.parentElement;
    }
  }

  // Fallback 2: Global Fallback price selectors
  if (!p) {
    var priceSelectors = [
      '.Nx9bqj.CxhGGd',
      '.CEmiEU .Nx9bqj',
      '._30jeq3._16Jk6d',
      '._16Jk6d',
      '._25b18c ._30jeq3',
      'div[class*="CxhGGd"]',
      'div[class*="Nx9bqj"]',
      'div[class*="v1zwn20"]',
      'div[class*="_30jeq3"]',
      'div[class*="_16Jk6d"]',
      'span[class*="CxhGGd"]',
      'span[class*="Nx9bqj"]',
      '[class*="price"] [class*="30jeq"]'
    ];
    for (var si = 0; si < priceSelectors.length && !p; si++) {
      try {
        var pel = document.querySelector(priceSelectors[si]);
        if (pel && pel.innerText) {
          try {
            var style = window.getComputedStyle(pel);
            if (style && style.textDecoration && style.textDecoration.includes('line-through')) continue;
          } catch(e) {}
          var val = parsePrice(pel.innerText);
          if (val && val > 100) p = val;
        }
      } catch(e) {}
    }
  }

  // Fallback 3: Meta tags
  if (!p) {
    try {
      var metaPrice = document.querySelector('meta[itemprop="price"], [itemprop="price"]');
      if (metaPrice) {
        var val = metaPrice.getAttribute('content') || metaPrice.innerText;
        var valParsed = parsePrice(val);
        if (valParsed && valParsed > 100) p = valParsed;
      }
    } catch(e) {}
  }

  // Fallback 4: Semantic scan
  if (!p) {
    try {
      var semPrice = findSemanticPrice(document.body);
      if (semPrice) {
        var valParsed = parsePrice(semPrice);
        if (valParsed && valParsed > 100) p = valParsed;
      }
    } catch(e) {}
  }

  // Robust Title Fallback
  if (!t) {
    try {
      var ogTitle = document.querySelector('meta[property="og:title"]');
      t = ogTitle ? ogTitle.getAttribute('content') : document.title;
    } catch(e) { t = document.title; }
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
    url: location.href, platform: "flipkart.com",
    availability: availability
  };
  } catch(ex) { console.warn('[SCP] Flipkart extract error:', ex); return null; }
}

function extractMyntra(){
  return{title:qt(".pdp-title")||qt("h1.pdp-title"),price:parsePrice(qt(".pdp-price strong")),
    currency:"INR",brand:qt(".pdp-title h1"),url:location.href,platform:"myntra"};
}
function extractCroma(){
  var t=qt("h1.sc-dkrFOg")||qt("h1[class*='product-name']")||qt("h1");
  var priceContainer=document.querySelector('[class*="price-section"], [class*="pdp-price"], [class*="amount"]');
  var p=parsePrice(qt('[class*="amount"]')||qt('[class*="pdp-price"]')||findSemanticPrice(priceContainer));
  return{title:t,price:p,
    currency:"INR",modelNumber:findSpecValue(["Model","Model Number","Model Name"]),url:location.href,platform:"croma"};
}
function extractAjio(){
  return{title:qt(".prod-name"),price:parsePrice(qt(".prod-sp")),
    currency:"INR",brand:qt(".brand-name"),url:location.href,platform:"ajio"};
}
function extractNykaa(){
  var t=null,p=null,jld=extractJsonLd();
  if(jld){t=jld.name||t;p=jld.price||p;}
  if(!t)t=qt(".product-title h1")||qt("h1");
  if(!p)p=parsePrice(qt(".post-card__info-price")||qt('[class*="price"]'));
  return{title:t,price:p,currency:"INR",brand:qt(".product-brand")||qt('[data-at="brand-name"]'),
    imageUrl:qs(".product-image img")?.src||"",url:location.href,platform:"nykaa"};
}
function extractTatacliq(){
  // Use JSON-LD first — avoids the "all prices concatenated" problem with DOM selectors
  var t=qt(".pdp-title")||qt("h1"),p=null;
  var jld=extractJsonLd();
  if(jld&&jld.price){p=jld.price;if(jld.name&&!t)t=jld.name;}
  if(!p){
    // Try specific selectors in priority order; validate price range (< ₹5 lakh)
    var priceSelectors=['.final-price','[class*="pdp-offer-price"]','[class*="selling-price"]','[data-at="product-price"]'];
    for(var i=0;i<priceSelectors.length&&!p;i++){
      var el=document.querySelector(priceSelectors[i]);
      if(el){var v=parsePrice(el.innerText);if(v&&v>0&&v<500000)p=v;}
    }
  }
  if(!p){var m=qs('meta[property="product:price:amount"]')||qs('meta[itemprop="price"]');if(m)p=parsePrice(m.getAttribute('content'));}
  return{title:t,price:p,currency:"INR",brand:qt(".brand-name")||qt('[class*="brand"]'),url:location.href,platform:"tatacliq"};
}
function extractRelianceDigital(){
  var t=null,p=null,jld=extractJsonLd();
  if(jld){t=jld.name||t;p=jld.price||p;}
  if(!t)t=qt(".pdp__product-name")||qt("h1");
  if(!p)p=parsePrice(qt(".pdp__offer-price")||qt('[class*="price"]'));
  return{title:t,price:p,currency:"INR",brand:qt(".pdp__brand-name"),url:location.href,platform:"reliancedigital"};
}
function extractFirstcry(){
  var t=null,p=null,jld=extractJsonLd();
  if(jld){t=jld.name||t;p=jld.price||p;}
  if(!t)t=qt("h1.title")||qt(".product-title")||qt("h1");
  if(!p)p=parsePrice(qt(".price-discounted")||qt('[class*="price"]'));
  return{title:t,price:p,currency:"INR",brand:qt(".brand-name"),url:location.href,platform:"firstcry"};
}
function extractBlinkit(){
  var t=null,p=null,jld=extractJsonLd();
  if(jld){t=jld.name||t;p=jld.price||p;}
  if(!t)t=qt('[data-testid="product-name"]')||qt(".product__name")||qt('[class*="ProductInfo"]')||qt('[class*="product-name"]')||qt('[class*="ProductName"]')||qt("h1");
  if(!p)p=parsePrice(qt('[data-testid="product-price"]')||qt('[class*="ProductPrice"]')||qt('[class*="product-price"]')||qt('[class*="price"]'));
  if(!t){var og=qs('meta[property="og:title"]');if(og)t=og.getAttribute('content');}
  return{title:t,price:p,currency:"INR",url:location.href,platform:"blinkit"};
}

function extractBigbasket(){
  var t=null,p=null,jld=extractJsonLd();
  if(jld){t=jld.name||t;p=jld.price||p;}
  if(!t)t=qt("h1.prod-name")||qt(".product-name")||qt("h1");
  if(!p)p=parsePrice(qt(".discnt-price")||qt('[class*="price"]'));
  return{title:t,price:p,currency:"INR",brand:qt(".brand-name"),url:location.href,platform:"bigbasket"};
}
function extractVijaySales(){
  var t=null,p=null,jld=extractJsonLd();
  if(jld){t=jld.name||t;p=jld.price||p;}
  if(!t)t=qt("h1")||qt(".product-title");
  if(!p)p=parsePrice(qt('[itemprop="price"]')||qt('[class*="special-price"]')||qt('[class*="product-price"]'));
  return{title:t,price:p,currency:"INR",url:location.href,platform:"vijaysales.com"};
}
function extractAppleIndia(){
  var t = cleanDocumentTitle(document.title);
  if (!t || t.toLowerCase() === "apple" || t.toLowerCase() === "apple (in)") {
    t = qt("h1") || qt(".product-title") || "iPhone";
  }
  var p=null,jld=extractJsonLd();
  if(jld&&jld.price){p=jld.price;}
  if(!p){
    p=parsePrice(qt(".rc-prices-fullprice")||qt(".as-price-currentprice")||qt(".rc-prices-currentprice")||qt(".rf-prices-currentprice")||qt('[data-autom="full-price"]')||qt('[data-autom="current-price"]'));
  }
  return{title:t,price:p,currency:"INR",brand:"Apple",url:location.href,platform:"apple.com"};
}
function extractDecathlon(){
  var t=null,p=null,jld=extractJsonLd();
  if(jld){t=jld.name||t;p=jld.price||p;}
  if(!t)t=qt("h1")||qt('[class*="title"]')||qt('[class*="product-name"]');
  if(!p)p=parsePrice(qt("[data-aut=product-price]")||qt('.product-prices__selling-price')||qt('[class*="selling-price"]')||qt('[class*="price"]'));
  if(!t){var og=qs('meta[property="og:title"]');if(og)t=og.getAttribute('content');}
  return{title:t,price:p,currency:"INR",brand:"Decathlon",url:location.href,platform:"decathlon.in"};
}
function extractKitabay(){
  var t=null,p=null,jld=extractJsonLd();
  if(jld){t=jld.name||t;p=jld.price||p;}
  if(!t)t=qt("h1")||qt(".product-title");
  if(!p)p=parsePrice(qt(".price-item--sale")||qt(".price-item--regular")||qt('[class*="price"]'));
  return{title:t,price:p,currency:"INR",url:location.href,platform:"kitabay.com"};
}

function findSpecValue(keys){
  const rows=document.querySelectorAll("tr,li,.a-list-item");
  for(const r of rows){const t=r.textContent;for(const k of keys){
    if(t.includes(k)){const c=r.querySelectorAll("td,span");if(c.length>=2)return c[c.length-1].textContent.trim();}
  }}return null;
}

const EXTRACTORS={"amazon.in":extractAmazon,"flipkart.com":extractFlipkart,
  "myntra.com":extractMyntra,"croma.com":extractCroma,"ajio.com":extractAjio,
  "nykaa.com":extractNykaa,"nykaafashion.com":extractNykaa,"tatacliq.com":extractTatacliq,
  "reliancedigital.in":extractRelianceDigital,"firstcry.com":extractFirstcry,
  "blinkit.com":extractBlinkit,
  "bigbasket.com":extractBigbasket,
  "vijaysales.com":extractVijaySales,"apple.com":extractAppleIndia,
  "decathlon.in":extractDecathlon,"kitabay.com":extractKitabay};

function cleanDocumentTitle(t) {
  if (!t) return "";
  let clean = t.trim();
  clean = clean.replace(/\s*[-|:|•]\s*(Blinkit|Decathlon|Nykaa|FirstCry|Apple|Kitabay|BigBasket|Vijay\s*Sales|TataCliq|Flipkart|Amazon|Myntra|Croma|Ajio|Reliance\s*Digital|Nykaa\s*Fashion|Zepto).*/i, "");
  clean = clean.replace(/Buy\s+/i, "");
  clean = clean.replace(/\s+Online\s*(at\s*Best\s*Price.*)?/i, "");
  return clean.trim();
}

function extractProductData(platform){
  var fn=EXTRACTORS[platform];if(!fn)return null;
  try {
    var d=fn();
    if(!d) return null;
    if(!d.title) {
      d.title = cleanDocumentTitle(document.title);
    }
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
  p.innerHTML='<header class="sc-header"><div class="sc-header-left"><button class="sc-back-btn" title="Back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg></button><div class="sc-logo-group"><div class="sc-logo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div><span class="sc-logo-text">SmartCompare</span><span class="sc-pro-badge">PRO</span></div></div><div class="sc-header-right"><button class="sc-header-btn" id="scp-refresh-btn" title="Refresh Prices"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/></svg></button><div id="scp-live-dot" style="width:8px;height:8px;border-radius:50%;background:#ccc;transition:all .3s" title="Checking..."></div><button class="sc-header-btn" id="scp-close-btn" title="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div></header><div class="sc-content" id="scp-content"><div id="scp-product-area"></div><div id="scp-main-content"></div></div><nav class="sc-bottom-nav"><button class="sc-nav-item active" data-tab="compare"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg><span class="sc-nav-label">Compare</span></button><button class="sc-nav-item" data-tab="alerts"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9m-4.27 13a2 2 0 01-3.46 0"/></svg><span class="sc-nav-label">Alerts</span></button><button class="sc-nav-item" data-tab="history"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><span class="sc-nav-label">History</span></button><button class="sc-nav-item" data-tab="settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg><span class="sc-nav-label">Settings</span></button></nav>';
  document.body.appendChild(p);
  document.getElementById('scp-close-btn').addEventListener('click',function(){hidePanel()});
  var refreshBtn = document.getElementById('scp-refresh-btn');
  if(refreshBtn) refreshBtn.addEventListener('click', function(){
    if(!cachedData) return;
    refreshBtn.style.animation = 'sc-spin 1s linear infinite';
    runComparison(false, true); // Force refresh
  });
  p.querySelectorAll('.sc-nav-item').forEach(function(n){n.addEventListener('click',function(){
    p.querySelectorAll('.sc-nav-item').forEach(function(x){x.classList.remove('active')});n.classList.add('active');
    var tab=n.dataset.tab;
    activeTab=tab;
    if(tab==='history'){handleHistoryTabClick();}
    else if(tab==='alerts'){handleAlertsTabClick();}
    else if(tab==='compare'){handleCompareTabClick();}
    else if(tab==='settings'){handleSettingsTabClick();}
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
function renderFound(data){
  cachedData=data;
  historyFetched=false;
  renderProductCard(data);
  var el=document.getElementById('scp-main-content');if(!el)return;
  el.innerHTML='<div id="scp-compare-sec"></div><div id="scp-insights-sec"></div><div id="scp-specs-sec"></div><div id="scp-alts-sec"></div><div id="scp-chart-sec"></div><div id="scp-alert-sec"></div>';
  renderCompareSection(data);
  renderInsightsSection(data);
  renderSpecsSection(data);
  renderAlternativesSection(data);
  renderAlertSection(data);
}

// -- Tab content switching --
function handleCompareTabClick(){
  if(!cachedData){runComparison();return;}
  var el=document.getElementById('scp-main-content');if(!el)return;
  el.innerHTML='<div id="scp-compare-sec"></div><div id="scp-insights-sec"></div><div id="scp-specs-sec"></div><div id="scp-alts-sec"></div><div id="scp-chart-sec"></div><div id="scp-alert-sec"></div>';
  renderCompareSection(cachedData);
  renderInsightsSection(cachedData);
  renderSpecsSection(cachedData);
  renderAlternativesSection(cachedData);
  renderAlertSection(cachedData);
}
function handleAlertsTabClick(){
  if(!cachedData){runComparison();return;}
  var el=document.getElementById('scp-main-content');if(!el)return;
  el.innerHTML='<div id="scp-alert-sec"></div>';
  renderAlertSection(cachedData);
}
function handleSettingsTabClick(){
  var el=document.getElementById('scp-main-content');if(!el)return;
  // Load saved settings
  var autoCompare=true,notifications=true;
  try{var s=localStorage.getItem('scp_settings');if(s){var parsed=JSON.parse(s);autoCompare=parsed.autoCompare!==false;notifications=parsed.notifications!==false;}}catch(e){}
  el.innerHTML='<div class="sc-section" style="animation-delay:0.05s"><div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">⚙</span><span class="sc-section-title">Settings</span></div></div>'+
    '<div class="sc-alerts-card" style="padding:16px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.06)"><div><div style="font-size:14px;font-weight:600;color:#1a1a2e">Auto-compare</div><div style="font-size:12px;color:#64668b;margin-top:2px">Automatically compare prices when visiting product pages</div></div><label class="sc-toggle"><input type="checkbox" id="scp-setting-auto"'+(autoCompare?' checked':'')+'/><span class="sc-toggle-slider"></span></label></div>'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.06)"><div><div style="font-size:14px;font-weight:600;color:#1a1a2e">Price drop notifications</div><div style="font-size:12px;color:#64668b;margin-top:2px">Get notified when watched products drop in price</div></div><label class="sc-toggle"><input type="checkbox" id="scp-setting-notif"'+(notifications?' checked':'')+'/><span class="sc-toggle-slider"></span></label></div>'+
    '<div style="padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.06)"><button id="scp-clear-cache" class="sc-alert-btn" style="width:100%;background:linear-gradient(135deg,#ef4444,#dc2626)">Clear cached data</button></div>'+
    '<div style="padding:16px 0 4px;text-align:center"><div style="font-size:13px;font-weight:600;color:#7c5cfc">SmartCompare Pro v3.0.0</div><div style="font-size:11px;color:#9b9dba;margin-top:4px">Compare prices across 15 supported platforms</div></div>'+
    '</div></div>'+
    '<div class="sc-section" style="animation-delay:0.1s; margin-top:16px"><div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">🏬</span><span class="sc-section-title">Supported Platforms</span></div><span class="sc-result-count">15 sites</span></div>'+
    '<div class="sc-alerts-card" style="padding:16px; display:flex; flex-direction:column; gap:16px">'+
    '<div><div style="font-size:10px; font-weight:700; color:var(--sc-text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px">General e-commerce</div><div style="display:flex; flex-wrap:wrap; gap:6px">'+
    '<span class="sc-platform-pill" style="background:rgba(255,153,0,0.1); color:#FF9900; border:1px solid rgba(255,153,0,0.2)">Amazon.in</span>'+
    '<span class="sc-platform-pill" style="background:rgba(40,116,240,0.1); color:#2874F0; border:1px solid rgba(40,116,240,0.2)">Flipkart</span>'+
    '</div></div>'+
    '<div><div style="font-size:10px; font-weight:700; color:var(--sc-text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px">Electronics</div><div style="display:flex; flex-wrap:wrap; gap:6px">'+
    '<span class="sc-platform-pill" style="background:rgba(101,172,42,0.1); color:#65AC2A; border:1px solid rgba(101,172,42,0.2)">Croma</span>'+
    '<span class="sc-platform-pill" style="background:rgba(27,58,142,0.1); color:#1B3A8E; border:1px solid rgba(27,58,142,0.2)">Reliance Digital</span>'+
    '<span class="sc-platform-pill" style="background:rgba(226,31,38,0.1); color:#E21F26; border:1px solid rgba(226,31,38,0.2)">Vijay Sales</span>'+
    '</div></div>'+
    '<div><div style="font-size:10px; font-weight:700; color:var(--sc-text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px">Fashion & Beauty</div><div style="display:flex; flex-wrap:wrap; gap:6px">'+
    '<span class="sc-platform-pill" style="background:rgba(255,63,108,0.1); color:#FF3F6C; border:1px solid rgba(255,63,108,0.2)">Myntra</span>'+
    '<span class="sc-platform-pill" style="background:rgba(227,24,55,0.1); color:#E31837; border:1px solid rgba(227,24,55,0.2)">Ajio</span>'+
    '<span class="sc-platform-pill" style="background:rgba(252,39,121,0.1); color:#FC2779; border:1px solid rgba(252,39,121,0.2)">Nykaa</span>'+
    '<span class="sc-platform-pill" style="background:rgba(124,92,252,0.1); color:#7c5cfc; border:1px solid rgba(124,92,252,0.2)">TataCliq</span>'+
    '<span class="sc-platform-pill" style="background:rgba(255,112,67,0.1); color:#FF7043; border:1px solid rgba(255,112,67,0.2)">FirstCry</span>'+
    '</div></div>'+
    '<div><div style="font-size:10px; font-weight:700; color:var(--sc-text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px">Grocery & Instant Delivery</div><div style="display:flex; flex-wrap:wrap; gap:6px">'+
    '<span class="sc-platform-pill" style="background:rgba(245,194,0,0.1); color:#b59a00; border:1px solid rgba(245,194,0,0.2)">Blinkit</span>'+
    '<span class="sc-platform-pill" style="background:rgba(132,194,37,0.1); color:#84C225; border:1px solid rgba(132,194,37,0.2)">BigBasket</span>'+
    '</div></div>'+
    '<div><div style="font-size:10px; font-weight:700; color:var(--sc-text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px">Specialty & D2C</div><div style="display:flex; flex-wrap:wrap; gap:6px">'+
    '<span class="sc-platform-pill" style="background:rgba(85,85,85,0.1); color:#555555; border:1px solid rgba(85,85,85,0.2)">Apple India</span>'+
    '<span class="sc-platform-pill" style="background:rgba(0,125,188,0.1); color:#007DBC; border:1px solid rgba(0,125,188,0.2)">Decathlon</span>'+
    '<span class="sc-platform-pill" style="background:rgba(139,69,19,0.1); color:#8B4513; border:1px solid rgba(139,69,19,0.2)">Kitabay</span>'+
    '</div></div>'+
    '</div></div>'+
    '<style>.sc-toggle{position:relative;display:inline-block;width:44px;height:24px}.sc-toggle input{opacity:0;width:0;height:0}.sc-toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#ccc;border-radius:24px;transition:.3s}.sc-toggle-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s}.sc-toggle input:checked+.sc-toggle-slider{background:#7c5cfc}.sc-toggle input:checked+.sc-toggle-slider:before{transform:translateX(20px)}.sc-platform-pill{display:inline-flex;align-items:center;padding:4px 10px;border-radius:var(--sc-radius-sm);font-size:11px;font-weight:600;transition:all 0.2s var(--sc-ease);cursor:pointer;}.sc-platform-pill:hover{transform:translateY(-1px);box-shadow:var(--sc-shadow-sm);}</style>';
  // Event listeners for settings
  var autoEl=document.getElementById('scp-setting-auto');
  var notifEl=document.getElementById('scp-setting-notif');
  var clearEl=document.getElementById('scp-clear-cache');
  function saveSettings(){try{localStorage.setItem('scp_settings',JSON.stringify({autoCompare:autoEl?autoEl.checked:true,notifications:notifEl?notifEl.checked:true}));}catch(e){}}
  if(autoEl)autoEl.addEventListener('change',saveSettings);
  if(notifEl)notifEl.addEventListener('change',saveSettings);
  if(clearEl)clearEl.addEventListener('click',function(){
    cachedData=null;historyFetched=false;if(chartInstance){chartInstance.destroy();chartInstance=null;}
    clearEl.textContent='✓ Cache cleared';clearEl.style.background='#22c55e';
    setTimeout(function(){clearEl.textContent='Clear cached data';clearEl.style.background='';},2000);
  });
}
function handleHistoryTabClick(){
  var el=document.getElementById('scp-main-content');if(!el)return;
  if(!cachedData||!cachedData.product_id){
    el.innerHTML='<div style="text-align:center;padding:40px 24px"><div style="font-size:36px;margin-bottom:12px">\ud83d\udcca</div><div style="font-size:14px;color:#64668b">Tracking started \u2014 history will appear once data is collected.</div></div>';
    return;
  }
  
  function renderHistoryDashboard(historyData) {
    el.innerHTML='<div id="scp-chart-sec"></div><div id="scp-history-platforms-sec" class="sc-section"></div><div id="scp-history-log-sec" class="sc-section"></div>';
    renderChartSection(historyData);
    
    // 2. Tracked Platforms List
    var platformsHtml = '<div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">📊</span><span class="sc-section-title">Tracked Platforms</span></div></div><div class="sc-compare-list">';
    if(historyData.platforms && historyData.platforms.length > 0){
      historyData.platforms.forEach(function(plat){
        var hist = plat.history || [];
        var newestEntry = hist[0] || {};
        var currentPrice = newestEntry.price ? fmtINR(newestEntry.price) : 'N/A';
        
        var trend = plat.price_trend || 'stable';
        var trendBadge = '';
        if(trend === 'rising'){
          trendBadge = '<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;background:rgba(239,68,68,0.1);color:#ef4444;gap:4px">📈 Rising</span>';
        } else if(trend === 'falling'){
          trendBadge = '<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;background:rgba(34,197,94,0.1);color:#22c55e;gap:4px">📉 Falling</span>';
        } else {
          trendBadge = '<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;background:rgba(100,102,139,0.1);color:#64668b;gap:4px">➡️ Stable</span>';
        }
        
        var platKey = null;
        var keys = Object.keys(PLATFORMS);
        for(var ki=0;ki<keys.length;ki++){
          if(plat.platform && plat.platform.toLowerCase().indexOf(keys[ki].split('.')[0])>=0){
            platKey = keys[ki];break;
          }
        }
        platKey = platKey || plat.platform;
        var pi = PLATFORMS[platKey] || {name: plat.platform, cls: '', tier: 3};
        var colors = {amazon:'#FF9900',flipkart:'#2874F0',myntra:'#FF3F6C',ajio:'#E31837',apple:'#555',croma:'#65AC2A',vijaysales:'#E21F26',reliancedigital:'#1B3A8E',nykaa:'#FC2779'};
        var color = colors[pi.cls] || '#7c5cfc';
        
        platformsHtml += '<a class="sc-compare-card" href="'+(plat.url || '#')+'" target="_blank"><div class="sc-store-logo" style="background:'+color+'">'+(pi.name?pi.name[0]:'?')+'</div><div class="sc-store-info"><div class="sc-store-name">'+pi.name+'</div><div class="sc-store-meta" style="margin-top:4px">'+trendBadge+'</div></div><div class="sc-price-col"><div class="sc-price-main">'+currentPrice+'</div></div><svg class="sc-compare-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></a>';
      });
    } else {
      platformsHtml += '<div style="text-align:center;font-size:12px;color:#9b9dba;padding:24px;background:var(--sc-surface);border:1px solid var(--sc-border);border-radius:12px">No platform history details available yet.</div>';
    }
    platformsHtml += '</div>';
    var platSec = document.getElementById('scp-history-platforms-sec');
    if(platSec) platSec.innerHTML = platformsHtml;
    
    // 3. Chronological Price Change Log Timeline
    var logHtml = '<div class="sc-section-header" style="margin-top:20px"><div style="display:flex;align-items:center"><span class="sc-section-num">🕒</span><span class="sc-section-title">Price Change Log</span></div></div><div style="position:relative;padding-left:18px;border-left:2px solid rgba(124,92,252,0.1);display:flex;flex-direction:column;gap:16px;margin:8px 8px 24px">';
    
    var events = [];
    if(historyData.platforms){
      historyData.platforms.forEach(function(plat){
        var hist = plat.history || [];
        for(var j = hist.length - 1; j >= 0; j--){
          var curr = hist[j];
          var prev = hist[j + 1];
          var changed = false;
          var eventType = 'tracked';
          var diff = 0;
          if(!prev){
            changed = true;
          } else if(curr.price !== prev.price){
            changed = true;
            diff = curr.price - prev.price;
            eventType = diff < 0 ? 'dropped' : 'raised';
          }
          if(changed){
            events.push({
              platform: plat.platform,
              price: curr.price,
              type: eventType,
              diff: diff,
              date: new Date(curr.scraped_at)
            });
          }
        }
      });
    }
    events.sort(function(a,b){return b.date - a.date;});
    
    if(events.length > 0){
      events.slice(0, 15).forEach(function(ev){
        var timeText = timeAgo(ev.date);
        var platKey = null;
        var keys = Object.keys(PLATFORMS);
        for(var ki=0;ki<keys.length;ki++){
          if(ev.platform && ev.platform.toLowerCase().indexOf(keys[ki].split('.')[0])>=0){
            platKey = keys[ki];break;
          }
        }
        platKey = platKey || ev.platform;
        var pi = PLATFORMS[platKey] || {name: ev.platform};
        
        var icon = '🔍';
        var message = '';
        var priceColor = 'var(--sc-text)';
        if(ev.type === 'dropped'){
          icon = '📉';
          priceColor = '#22c55e';
          message = pi.name+' price dropped by <span style="font-weight:600;color:#22c55e">'+fmtINR(Math.abs(ev.diff))+'</span>';
        } else if(ev.type === 'raised'){
          icon = '📈';
          priceColor = '#ef4444';
          message = pi.name+' price rose by <span style="font-weight:600;color:#ef4444">'+fmtINR(ev.diff)+'</span>';
        } else {
          icon = '✨';
          message = 'Started tracking price on '+pi.name;
        }
        
        logHtml += '<div style="position:relative;animation:sc-slide-up 0.3s var(--sc-ease) both"><div style="position:absolute;left:-24px;top:4px;width:10px;height:10px;border-radius:50%;background:#f8f9fc;border:2px solid #7c5cfc;box-shadow:0 0 0 3px rgba(124,92,252,0.1)"></div><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><div style="font-size:12px;color:var(--sc-text);font-weight:500">'+icon+' '+message+'</div><div style="font-size:10px;color:var(--sc-text-tertiary);margin-top:2px">'+timeText+'</div></div><div style="font-size:12px;font-weight:700;color:'+priceColor+';white-space:nowrap">'+fmtINR(ev.price)+'</div></div></div>';
      });
    } else {
      logHtml += '<div style="text-align:center;font-size:12px;color:#9b9dba;padding:12px">No recent price updates logged yet.</div>';
    }
    logHtml += '</div>';
    var logSec = document.getElementById('scp-history-log-sec');
    if(logSec) logSec.innerHTML = logHtml;
  }
  
  if(historyFetched){
    renderHistoryDashboard(cachedData);
    return;
  }
  
  // Show loading spinner
  el.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 24px;gap:16px"><div style="width:40px;height:40px;border:3px solid rgba(124,92,252,0.15);border-top-color:#7c5cfc;border-radius:50%;animation:sc-spin 0.8s linear infinite"></div><div style="font-size:13px;color:#64668b">Loading price history...</div><style>@keyframes sc-spin{to{transform:rotate(360deg)}}</style></div>';
  
  msg({type:'API_REQUEST',endpoint:'/api/history/'+cachedData.product_id,method:'GET'}).then(function(r){
    if(r&&r.success&&r.data){
      var ph=r.data.price_history;
      if(ph&&ph.length>0){
        cachedData.price_history=ph;
        if(r.data.price_stats)cachedData.price_stats=r.data.price_stats;
        if(r.data.platforms)cachedData.platforms=r.data.platforms;
        historyFetched=true;
        renderHistoryDashboard(cachedData);
      } else {
        el.innerHTML='<div style="text-align:center;padding:40px 24px"><div style="font-size:36px;margin-bottom:12px">\ud83d\udd56</div><div style="font-size:14px;color:#64668b">Price history will appear after 24 hours of tracking.</div></div>';
        historyFetched=true;
      }
    } else {
      var errMsg=(r&&r.success===false&&r.error)?r.error:'Could not load price history. Try again later.';
      el.innerHTML='<div style="text-align:center;padding:40px 24px"><div style="font-size:36px;margin-bottom:12px">\u26a0\ufe0f</div><div style="font-size:14px;color:#ef4444">'+errMsg+'</div></div>';
    }
  }).catch(function(){
    el.innerHTML='<div style="text-align:center;padding:40px 24px"><div style="font-size:36px;margin-bottom:12px">\u26a0\ufe0f</div><div style="font-size:14px;color:#ef4444">Could not load price history. Try again later.</div></div>';
  });
}

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
  var avail = currentListing?currentListing.availability:null;
  var isOutOfStock = avail === 'out_of_stock';
  el.innerHTML='<div class="sc-product-card"><div class="sc-product-img"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg></div><div class="sc-product-info"><div class="sc-product-name">'+title+'</div><div class="sc-product-category">'+platName+'</div>'+(isOutOfStock?'<div style="font-size:14px;font-weight:600;color:#ef4444;margin-top:4px">Currently Unavailable</div>':(price?'<div style="font-size:16px;font-weight:700;color:#7c5cfc;margin-top:4px">'+fmtINR(price)+'</div>':''))+'<div class="sc-ai-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> '+badgeText+'</div></div></div>';
}

let currentSortBy = 'effective';

function renderCompareSection(d){
  var el=document.getElementById('scp-compare-sec');if(!el)return;
  var allResults=d.results||[];
  var ps=d.price_stats||{};
  
  var currPlatform=detectPlatform();var currPrice=0;
  if(allResults){
    for(var ci=0;ci<allResults.length;ci++){
      if(allResults[ci].match_confidence>=1||(currPlatform&&allResults[ci].platform&&allResults[ci].platform.indexOf(currPlatform.split('.')[0])>=0)){
        currPrice=allResults[ci].price;break;
      }
    }
  }
  if(!currPrice&&allResults[0])currPrice=allResults[0].price;

  // Filter out search URLs (deep links only) and deduplicate domains
  var results = [];
  var seenDomains = new Set();
  
  for (var i = 0; i < allResults.length; i++) {
    var r = allResults[i];
    var isSearchUrl = r.url && (r.url.includes('/s?k=') || r.url.includes('search?q=') || r.url.includes('/search/') || r.url.includes('/search?'));
    if (isSearchUrl) continue;
    
    var domainKey = null;
    try {
      if (r.url) {
        domainKey = new URL(r.url).hostname.replace('www.', '');
      } else {
        domainKey = r.platform;
      }
    } catch(e) {
      domainKey = r.platform;
    }
    
    if (seenDomains.has(domainKey)) continue;
    seenDomains.add(domainKey);
    results.push(r);
  }

  // Handle fallback if 0 external stores found
  var externalCount = results.filter(r => !(currPlatform && r.platform && r.platform.indexOf(currPlatform.split('.')[0]) >= 0)).length;
  if (externalCount === 0 && d.status !== 'queued' && d.status !== 'partial') {
    el.innerHTML = '<div class="sc-section"><div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">1.</span><span class="sc-section-title">Compare across websites</span></div></div><div style="text-align:center;padding:40px 24px"><div style="font-size:36px;margin-bottom:12px">🔍</div><div style="font-size:15px;font-weight:600;color:#1a1a2e">We couldn\'t find this product on other stores right now.</div><div style="font-size:13px;color:#64668b;margin-top:8px">Try refreshing or checking back later.</div></div></div>';
    return;
  }

  // Stale platforms
  var stalePlatforms = [];
  var globalFreshnessText = 'Just now';
  var oldestAgeMs = 0;
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (r.last_scraped_at) {
      var age = Date.now() - new Date(r.last_scraped_at).getTime();
      if (age > oldestAgeMs) oldestAgeMs = age;
    }
    if (r.ageWarning) {
      var platKey=null; var keys=Object.keys(PLATFORMS);
      for(var ki=0;ki<keys.length;ki++){if(r.platform&&r.platform.toLowerCase().indexOf(keys[ki].split('.')[0])>=0){platKey=keys[ki];break;}}
      platKey=platKey||r.platform;
      var name = PLATFORMS[platKey] ? PLATFORMS[platKey].name : r.platform;
      if (stalePlatforms.indexOf(name) === -1) stalePlatforms.push(name);
    }
  }
  if (oldestAgeMs > 60000) globalFreshnessText = Math.floor(oldestAgeMs / 60000) + ' min ago';

  var staleBannerHtml = '';
  if (stalePlatforms.length > 0) {
    staleBannerHtml = '<div class="sc-stale-banner">⚠️ Prices for ' + stalePlatforms.join(', ') + ' may be outdated. Refreshing...</div>';
  }

  // Calculate effective price and max MRP for discount display
  var maxPrice = 0;
  for (var i = 0; i < results.length; i++) {
    if (results[i].price > maxPrice) maxPrice = results[i].price;
  }
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var maxDiscount = 0;
    if (r.coupon_codes) {
      r.coupon_codes.forEach(function(c) {
        var disc = c.isPercent ? (r.price * c.discount / 100) : c.discount;
        if (disc > maxDiscount) maxDiscount = disc;
      });
    }
    r.calculated_effective_price = Math.max(0, r.price - maxDiscount);
  }

  results.sort(function(a, b) {
    if (currentSortBy === 'effective') {
      return a.calculated_effective_price - b.calculated_effective_price;
    } else {
      return a.price - b.price;
    }
  });

  var sortToggleHtml = '<div class="sc-sort-toggle"><label class="sc-sort-label"><input type="radio" name="scp_sort" value="effective" ' + (currentSortBy === 'effective' ? 'checked' : '') + '> <span>Effective Price</span></label><label class="sc-sort-label"><input type="radio" name="scp_sort" value="listed" ' + (currentSortBy === 'listed' ? 'checked' : '') + '> <span>Listed Price</span></label></div>';

  // Platform metadata for subtitles & 2-letter abbreviations
  var PLAT_META = {
    'amazon': { abbr: 'AM', subtitle: 'Fast delivery · Prime eligible' },
    'flipkart': { abbr: 'FK', subtitle: 'SuperCoins eligible' },
    'croma': { abbr: 'CR', subtitle: 'Electronics specialist' },
    'reliancedigital': { abbr: 'RD', subtitle: 'Reliance rewards' },
    'vijaysales': { abbr: 'VS', subtitle: 'Electronics retailer' },
    'myntra': { abbr: 'M', subtitle: 'Free delivery · Easy returns 30d' },
    'ajio': { abbr: 'AJ', subtitle: 'Big Bold Sale price' },
    'nykaa': { abbr: 'NK', subtitle: 'Beauty specialist' },
    'tatacliq': { abbr: 'TC', subtitle: 'Authentic guarantee' },
    'apple': { abbr: 'AP', subtitle: 'Official store · AppleCare' },
    'firstcry': { abbr: 'FC', subtitle: 'Kids specialist' },
    'blinkit': { abbr: 'BL', subtitle: 'Quick delivery' },
    'bigbasket': { abbr: 'BB', subtitle: 'Grocery specialist' },
    'decathlon': { abbr: 'DK', subtitle: 'Sports specialist' },
    'kitabay': { abbr: 'KB', subtitle: 'Books specialist' }
  };

  var h='<div class="sc-section"><div class="sc-section-header" style="justify-content:space-between"><div style="display:flex;align-items:center"><span class="sc-section-num">1.</span><span class="sc-section-title">Compare across websites</span></div><span class="sc-result-count">' + results.length + ' stores</span></div>' + sortToggleHtml + staleBannerHtml + '<div class="sc-compare-list-v2">';
  
  var prices=results.filter(function(r){return r.price}).map(function(r){return r.price});
  var best=prices.length>0?Math.min.apply(null,prices):0;

  for(var i=0;i<results.length;i++){
    var r=results[i];
    var platKey=null;var keys=Object.keys(PLATFORMS);
    for(var ki=0;ki<keys.length;ki++){if(r.platform&&r.platform.toLowerCase().indexOf(keys[ki].split('.')[0])>=0){platKey=keys[ki];break;}}
    platKey=platKey||r.platform;
    var pi=PLATFORMS[platKey]||{name:r.platform,cls:'',tier:3};
    var colors={amazon:'#FF9900',flipkart:'#2874F0',myntra:'#FF3F6C',ajio:'#E31837',apple:'#555',croma:'#65AC2A',vijaysales:'#E21F26',reliancedigital:'#1B3A8E',nykaa:'#FC2779',tatacliq:'#7c5cfc',firstcry:'#FF7043',blinkit:'#F5C200',bigbasket:'#84C225',decathlon:'#007DBC',kitabay:'#8B4513'};
    var color=colors[pi.cls]||'#7c5cfc';
    var isBest=r.price===best&&results.length>1;
    var isCurrentStore = (currPlatform && r.platform && r.platform.indexOf(currPlatform.split('.')[0]) >= 0);
    
    // Get platform meta
    var meta = PLAT_META[pi.cls] || { abbr: (pi.name||'?').substring(0,2).toUpperCase(), subtitle: '' };
    
    // Build subtitle line
    var subtitleParts = [];
    if (isCurrentStore) subtitleParts.push('<span style="color:#22c55e;font-weight:600">You\'re here</span>');
    if (pi.d2c) subtitleParts.push('Official store');
    if (meta.subtitle && !isCurrentStore) subtitleParts.push(meta.subtitle);
    var subtitleHtml = subtitleParts.length > 0 ? '<div class="sc-card-subtitle">' + subtitleParts.join(' · ') + '</div>' : '';
    
    // Bank offer line (first one only, compact)
    var bankOfferHtml = '';
    var bankOffers = r.bank_offers || [];
    var couponCodes = r.coupon_codes || [];
    if (bankOffers.length > 0) {
      // Extract the most prominent offer
      var offerText = bankOffers[0];
      // Shorten if too long
      if (offerText.length > 50) offerText = offerText.substring(0, 47) + '...';
      bankOfferHtml = '<div class="sc-card-bank-offer">💳 ' + offerText + '</div>';
    } else if (couponCodes.length > 0) {
      var c = couponCodes[0];
      var discText = c.isPercent ? c.discount + '% off' : '₹' + c.discount + ' off';
      bankOfferHtml = '<div class="sc-card-bank-offer">🏷️ ' + discText + ' with coupon ' + c.code + '</div>';
    }
    
    // Price column — matches reference image exactly
    var mrpHtml = '';
    var discPercentHtml = '';
    var effHtml = '';
    
    // Show MRP strikethrough if current price differs from max price across stores
    if (currPrice && r.price < currPrice) {
      mrpHtml = '<div class="sc-card-mrp">' + fmtINR(currPrice) + '</div>';
      var discPct = Math.round((1 - (r.price / currPrice)) * 100);
      if (discPct > 0) discPercentHtml = '<div class="sc-card-discount">' + discPct + '% off</div>';
    }
    
    var mainPriceHtml = '<div class="sc-card-price">' + fmtINR(r.price) + '</div>';
    
    // Effective price after coupon/bank offer
    if (r.calculated_effective_price < r.price) {
      effHtml = '<div class="sc-card-effective">Eff. ' + fmtINR(r.calculated_effective_price) + '</div>';
    }
    
    // Deal tags
    var dealTags=computeDealTags(r,ps,results);
    var dealHtml='';
    if(isBest) dealHtml += '<span class="sc-card-best-tag">BEST PRICE</span>';
    for(var di=0;di<dealTags.length;di++){
      if(dealTags[di] !== 'BEST DEAL') dealHtml+='<span class="sc-deal-tag '+dealTags[di].toLowerCase().replace(/ /g,'-')+'">'+dealTags[di]+'</span>';
    }

    h += '<div class="sc-card-v2' + (isBest ? ' best' : '') + (isCurrentStore ? ' current' : '') + '" data-platform="' + r.platform + '" data-price="' + (r.price||'') + '" style="animation-delay:' + i*0.06 + 's">';
    h += '<div class="sc-card-left">';
    h += '<div class="sc-card-logo" style="background:' + color + '">' + meta.abbr + '</div>';
    h += '<div class="sc-card-info">';
    h += '<div class="sc-card-name">' + pi.name + '</div>';
    h += subtitleHtml;
    h += bankOfferHtml;
    if (dealHtml) h += '<div class="sc-deal-tags" style="margin-top:4px">' + dealHtml + '</div>';
    h += '</div>';
    h += '</div>';
    h += '<div class="sc-card-right">';
    h += mrpHtml;
    h += mainPriceHtml;
    h += discPercentHtml;
    h += effHtml;
    h += '<button class="sc-visit-btn-v2" data-url="' + r.url + '">Visit ↗</button>';
    h += '</div>';
    h += '</div>';
  }
  h+='</div></div>';
  el.innerHTML=h;
  
  // Attach visit button listeners
  el.querySelectorAll('.sc-visit-btn-v2').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      e.preventDefault();
      var url = btn.getAttribute('data-url');
      if (url) {
        msg({type: 'OPEN_TAB', url: url});
      }
    });
  });

  // Attach sort toggle listeners
  el.querySelectorAll('input[name="scp_sort"]').forEach(function(input){
    input.addEventListener('change', function(e){
      currentSortBy = e.target.value;
      renderCompareSection(d);
    });
  });

  // Ranker: track platform clicks
  if(d.product_id){
    el.querySelectorAll('.sc-card-v2').forEach(function(card){
      card.addEventListener('click',function(){
        var plat=card.getAttribute('data-platform');
        var pr=parseInt(card.getAttribute('data-price'))||null;
        var allR=(d.results||[]).map(function(x){return{platform:x.platform,price:x.price}});
        try{
          msg({type:'API_REQUEST',method:'POST',endpoint:'/api/rank/click',body:{product_id:d.product_id,chosen_platform:plat,chosen_price:pr,all_results:allR}}).catch(function(){});
        }catch(e){}
      });
    });
  }
}
function renderInsightsSection(d){
  var el=document.getElementById('scp-insights-sec');if(!el)return;
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
  el.innerHTML='<div class="sc-section" style="animation-delay:0.2s"><div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">2.</span><span class="sc-section-title">Price intelligence</span></div></div><div class="sc-insights-grid"><div class="sc-insight-card high"><div class="sc-insight-icon">\ud83d\udcc8</div><div class="sc-insight-label">Highest</div><div class="sc-insight-value">'+fmtINR(ps.all_time_high)+'</div></div><div class="sc-insight-card low"><div class="sc-insight-icon">\ud83d\udcc9</div><div class="sc-insight-label">Lowest</div><div class="sc-insight-value">'+fmtINR(ps.all_time_low)+'</div></div><div class="sc-insight-card current"><div class="sc-insight-icon">\ud83d\udcca</div><div class="sc-insight-label">Current</div><div class="sc-insight-value">'+fmtINR(cp)+'</div></div><div class="sc-insight-card avg"><div class="sc-insight-icon">\ud83d\udccb</div><div class="sc-insight-label">Average</div><div class="sc-insight-value">'+fmtINR(avg)+'</div></div></div>'+posHtml+'<div class="sc-ai-rec '+recClass+'"><span class="sc-ai-rec-icon">'+(br.score>=50?'\ud83d\ude80':'\u23f3')+'</span><span class="sc-ai-rec-text">'+recText+'</span></div></div>';
}

function renderSpecsSection(d) {
  var el = document.getElementById('scp-specs-sec');
  if (!el) return;
  var specs = d.spec_comparison || [];
  if (specs.length === 0) {
    el.innerHTML = '';
    return;
  }

  var mismatchDetails = [];
  var specGridHtml = '<div class="sc-spec-grid">';
  
  for (var i = 0; i < specs.length; i++) {
    var spec = specs[i];
    var valKeys = Object.keys(spec.values || {});
    var uniqueVals = [];
    valKeys.forEach(function(k) {
      var val = spec.values[k];
      if (val && uniqueVals.indexOf(val) === -1) {
        uniqueVals.push(val);
      }
    });

    if (uniqueVals.length > 1) {
      mismatchDetails.push(spec.label + ': ' + uniqueVals.join(' vs '));
    }

    var tooltipParts = [];
    valKeys.forEach(function(k) {
      tooltipParts.push(k.split('.')[0] + ': ' + spec.values[k]);
    });
    var tooltip = tooltipParts.length > 0 ? tooltipParts.join(', ') : 'Canonical: ' + spec.canonical;

    specGridHtml += '<div class="sc-spec-item" title="' + tooltip + '">' +
      '<span class="sc-spec-key">' + spec.label + '</span>' +
      '<span class="sc-spec-val">' + spec.canonical + '</span>' +
      '</div>';
  }
  specGridHtml += '</div>';

  var warningHtml = '';
  if (mismatchDetails.length > 0) {
    warningHtml = '<div class="sc-variant-warning">⚠️ Variant mismatch detected: ' + mismatchDetails.join(', ') + '. Please verify specifications on the store page.</div>';
  }

  el.innerHTML = '<div class="sc-section" style="animation-delay:0.22s">' +
    '<div class="sc-section-header">' +
    '<div style="display:flex;align-items:center">' +
    '<span class="sc-section-num">3.</span>' +
    '<span class="sc-section-title">Specifications</span>' +
    '</div>' +
    '</div>' +
    warningHtml +
    specGridHtml +
    '</div>';
}

function renderAlternativesSection(d){
  var el=document.getElementById('scp-alts-sec');if(!el)return;

  // Show loading spinner placeholder
  var altContainerId='scp-alts-container';
  el.innerHTML='<div id="'+altContainerId+'" class="sc-section" style="animation-delay:0.25s"><div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">4.</span><span class="sc-section-title">AI Recommendations</span></div></div><div class="sc-alts-list"><div style="display:flex;align-items:center;justify-content:center;padding:24px;gap:10px"><div style="width:20px;height:20px;border:2px solid rgba(124,92,252,0.15);border-top-color:#7c5cfc;border-radius:50%;animation:sc-spin 0.8s linear infinite"></div><span style="font-size:13px;color:#64668b">Finding recommendations...</span></div></div></div>';

  // If no product_id, render fallback immediately
  if(!d.product_id){
    renderAltsFallback(d.alternatives||[],altContainerId);return;
  }

  // Lazy fetch AI recommendations
  msg({type:'API_REQUEST',endpoint:'/api/compare/recommendations/'+d.product_id,method:'GET'}).then(function(r){
    if(r&&r.success&&r.data&&r.data.recommendations&&r.data.recommendations.length>0){
      renderAltsCards(r.data.recommendations,altContainerId);
    } else if(r&&r.success===false&&r.error){
      var container=document.getElementById(altContainerId);if(container){
        container.innerHTML='<div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">4.</span><span class="sc-section-title">AI Recommendations</span></div></div><div style="text-align:center;padding:20px 16px"><div style="font-size:24px;margin-bottom:8px">\u26a0\ufe0f</div><div style="font-size:13px;color:#ef4444">'+r.error+'</div></div>';
      }
    } else {
      renderAltsFallback(d.alternatives||[],altContainerId);
    }
  }).catch(function(){
    renderAltsFallback(d.alternatives||[],altContainerId);
  });
}

function renderAltsCards(recs,containerId){
  var container=document.getElementById(containerId);if(!container)return;
  var badgeColors={budget:'#22c55e',performance:'#3b82f6',features:'#8b5cf6',value:'#f97316'};
  var h='<div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">4.</span><span class="sc-section-title">AI Recommendations</span></div></div><div class="sc-alts-list">';
  for(var i=0;i<recs.length;i++){
    var a=recs[i];
    var badgeColor=badgeColors[a.better_for]||'#7c5cfc';
    var priceStr=a.estimated_price?('\u20b9'+Number(a.estimated_price).toLocaleString('en-IN')):'\u2013';
    h+='<div class="sc-alt-card" style="animation-delay:'+i*0.08+'s"><div class="sc-alt-info"><div class="sc-alt-name">'+a.name+'</div><div class="sc-alt-reason" style="font-style:italic;font-size:12px;color:#64668b;margin-top:2px">\u2728 '+a.reason+'</div><div style="margin-top:6px"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;color:#fff;background:'+badgeColor+'">'+((a.better_for||'').charAt(0).toUpperCase()+(a.better_for||'').slice(1))+'</span></div></div><div class="sc-alt-price">'+priceStr+'</div></div>';
  }
  h+='</div>';
  container.innerHTML=h;
}

function renderAltsFallback(alts,containerId){
  var container=document.getElementById(containerId);if(!container)return;
  if(!alts||alts.length===0){
    container.innerHTML='<div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">4.</span><span class="sc-section-title">AI Recommendations</span></div></div><div style="text-align:center;padding:20px 16px"><div style="font-size:24px;margin-bottom:8px">\u2728</div><div style="font-size:13px;color:#64668b">AI is analyzing this product. Recommendations will appear on your next visit.</div></div>';
    return;
  }
  var h='<div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">4.</span><span class="sc-section-title">AI Recommendations</span></div></div><div class="sc-alts-list">';
  for(var i=0;i<alts.length;i++){
    var a=alts[i];
    h+='<div class="sc-alt-card"><div class="sc-alt-info"><div class="sc-alt-name">'+a.name+'</div><div class="sc-alt-reason">\u2728 '+a.reason+'</div></div><div class="sc-alt-price">'+fmtINR(a.price)+'</div></div>';
  }
  h+='</div>';
  container.innerHTML=h;
}

function renderChartSection(d){
  var el=document.getElementById('scp-chart-sec');if(!el)return;
  var history=d.price_history||[];
  if(history.length===0){
    el.innerHTML = '';
    return;
  }
  el.innerHTML='<div class="sc-chart-section" style="animation-delay:0.3s"><div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">📊</span><span class="sc-section-title">Price history</span></div></div><div class="sc-chart-card"><div class="sc-chart-filters"><button class="sc-chart-pill" data-range="30">1M</button><button class="sc-chart-pill" data-range="90">3M</button><button class="sc-chart-pill" data-range="180">6M</button><button class="sc-chart-pill active" data-range="0">All</button></div><div class="sc-chart-area"><canvas id="scp-chart"></canvas></div></div></div>';
  el.querySelectorAll('.sc-chart-pill').forEach(function(btn){
    btn.addEventListener('click',function(){
      el.querySelectorAll('.sc-chart-pill').forEach(function(b){b.classList.remove('active')});
      btn.classList.add('active');loadChart(history,parseInt(btn.dataset.range)||0);
    });
  });
  loadChart(history);
}

function renderAlertSection(d){
  var el=document.getElementById('scp-alert-sec');if(!el)return;
  var currPlatform=detectPlatform();var cp='';
  if(d.results){
    for(var ci=0;ci<d.results.length;ci++){
      if(d.results[ci].match_confidence>=1||(currPlatform&&d.results[ci].platform&&d.results[ci].platform.indexOf(currPlatform.split('.')[0])>=0)){
        cp=d.results[ci].price;break;
      }
    }
  }
  if(!cp&&d.results&&d.results[0])cp=d.results[0].price;

  var isWatching=d.on_watchlist===true;
  var btnText=isWatching?'Remove Alert':'Set Alert';
  var btnStyle=isWatching?' style="background:#22c55e;box-shadow:0 4px 14px rgba(34,197,94,.3)"':'';

  el.innerHTML='<div class="sc-section" style="animation-delay:0.4s"><div class="sc-section-header"><div style="display:flex;align-items:center"><span class="sc-section-num">5.</span><span class="sc-section-title">Smart alerts</span></div></div><div class="sc-alerts-card"><div class="sc-alert-row"><input class="sc-alert-input" id="scp-alert-price" type="number" value="'+cp+'" placeholder="Target price"><button class="sc-alert-btn" id="scp-watchlist-btn" data-pid="'+(d.product_id||'')+'"'+btnStyle+'>'+btnText+'</button></div><div id="scp-alert-status" style="margin-top:8px;font-size:13px;min-height:20px">'+(isWatching?'<span style="color:#22c55e">\u2713 Alert active for this product</span>':'')+'</div></div></div><div style="height:24px"></div>';
  setupWatchlistBtn(d,isWatching);
}

function setupWatchlistBtn(data,isWatching){
  var btn=document.getElementById('scp-watchlist-btn');if(!btn)return;
  var statusEl=document.getElementById('scp-alert-status');
  var watching=!!isWatching;

  btn.onclick=function(){
    if(btn.disabled)return;btn.disabled=true;

    if(watching){
      // Remove Alert
      msg({type:'REMOVE_WATCHLIST',product_id:data.product_id}).then(function(r){
        if(r&&r.success){
          watching=false;
          btn.textContent='Set Alert';
          btn.style.background='';btn.style.boxShadow='';
          if(statusEl)statusEl.innerHTML='';
        } else {
          if(statusEl)statusEl.innerHTML='<span style="color:#ef4444">Could not remove alert.</span>';
        }
        btn.disabled=false;
      }).catch(function(){
        if(statusEl)statusEl.innerHTML='<span style="color:#ef4444">Could not remove alert.</span>';
        btn.disabled=false;
      });
    } else {
      // Set Alert
      var input=document.getElementById('scp-alert-price');
      var tp=input?parseInt(input.value):null;
      if(!tp||isNaN(tp)){
        if(statusEl)statusEl.innerHTML='<span style="color:#f59e0b">Please enter a valid target price.</span>';
        btn.disabled=false;return;
      }
      msg({type:'ADD_WATCHLIST',payload:{product_id:data.product_id,target_price:tp}}).then(function(r){
        if(r&&r.success&&r.data){
          watching=true;
          btn.textContent='Remove Alert';
          btn.style.background='#22c55e';btn.style.boxShadow='0 4px 14px rgba(34,197,94,.3)';
          var formatted=Number(tp).toLocaleString('en-IN');
          if(statusEl)statusEl.innerHTML='<span style="color:#22c55e">\u2713 Alert set! We\'ll email you when the price drops below \u20b9'+formatted+'.</span>';
        } else {
          // Check for auth error
          if(r&&r.error&&(r.code==='NO_TOKEN'||r.error.includes('auth')||r.error.includes('401'))){
            if(statusEl)statusEl.innerHTML='<span style="color:#ef4444">Login required to set alerts. <a href="#" id="scp-open-popup-link" style="color:#7c5cfc;text-decoration:underline">Open extension popup</a></span>';
            var link=document.getElementById('scp-open-popup-link');
            if(link)link.addEventListener('click',function(e){e.preventDefault();try{chrome.runtime.sendMessage({type:'OPEN_POPUP'});}catch(ex){}});
          } else {
            if(statusEl)statusEl.innerHTML='<span style="color:#ef4444">Could not set alert. Try again.</span>';
          }
        }
        btn.disabled=false;
      }).catch(function(){
        if(statusEl)statusEl.innerHTML='<span style="color:#ef4444">Could not set alert. Try again.</span>';
        btn.disabled=false;
      });
    }
  };
}
// -- Chart --
function initPriceChart(historyData){
  var canvas=document.getElementById('scp-chart');if(!canvas)return null;
  // Guard: destroy existing chart to prevent "Canvas is already in use" crash
  if(chartInstance){chartInstance.destroy();chartInstance=null;}
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
  var data=history;
  if(rangeDays>0){
    var c=new Date(Date.now()-rangeDays*86400000);
    data=history.filter(function(h){return new Date(h.date)>=c});
  }
  if(data.length===0)return;
  if(chartInstance){chartInstance.destroy();}
  try {
    chartInstance=initPriceChart(data);
  } catch(e) {
    console.error("[SCP] Failed to initialize chart:", e);
  }
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

// -- Main Flow Helpers --
function hasDataChanged(oldData, newData) {
  if (!oldData || !newData) return true;
  if (oldData.status !== newData.status) return true;
  if (oldData.product_id !== newData.product_id) return true;
  
  const oldResults = oldData.results || [];
  const newResults = newData.results || [];
  if (oldResults.length !== newResults.length) return true;
  
  for (let i = 0; i < oldResults.length; i++) {
    if (oldResults[i].url !== newResults[i].url) return true;
    if (oldResults[i].price !== newResults[i].price) return true;
    if (oldResults[i].availability !== newResults[i].availability) return true;
  }
  return false;
}

function setActiveTab(tabName) {
  activeTab = tabName;
  var p = document.getElementById('scp-panel');
  if (p) {
    p.querySelectorAll('.sc-nav-item').forEach(function(x) {
      if (x.dataset.tab === tabName) {
        x.classList.add('active');
      } else {
        x.classList.remove('active');
      }
    });
  }
}

// -- Main Flow --
function runComparison(silent, forceRefresh){
  if(!silent)silent=false;
  if(forceRefresh === undefined) forceRefresh = false;
  if(!isContextValid())return;var platform=detectPlatform();if(!platform)return;
  try{injectPanel();}catch(e){return;}
  // Only set loading spinner if we are comparing and it is a non-silent refresh
  if(!silent && activeTab === 'compare') setLoading();
  var productData=extractProductData(platform);
  if(!productData){
    setTimeout(function(){
      productData=extractProductData(platform);
      if(!productData){
        if(!silent && activeTab === 'compare') {
          var el=document.getElementById('scp-main-content');
          if(el) el.innerHTML='<div style="text-align:center;padding:40px 24px"><div style="font-size:36px;margin-bottom:12px">🤔</div><div style="font-size:15px;font-weight:600;color:#1a1a2e">Navigate to a product page to compare prices.</div></div>';
        }
        return;
      }
      doCompare(productData,silent, forceRefresh);
    },2000);
    return;
  }
  doCompare(productData,silent, forceRefresh);
}

function getCacheKey(productData) {
  var id = productData.asin || productData.flipkartPid || productData.url;
  return 'scp_cache_' + productData.platform + '_' + btoa(id).substring(0, 20);
}

var pollRetries=0;
function doCompare(productData,silent, forceRefresh){
  var cacheKey = getCacheKey(productData);

  function executeCompare() {
    msg({type:'COMPARE',payload:productData}).then(function(response){
      var refreshBtn = document.getElementById('scp-refresh-btn');
      if(refreshBtn) refreshBtn.style.animation = '';

      if(!response)throw new Error('No response');
      if(response.error){
        if(!silent && activeTab === 'compare'){
          response.code==='NO_TOKEN'?setError('Please log in via popup.','auth'):setError(response.error,'server');
        }
        return;
      }
      var data=response.data;if(!data||data.error){
        if(!silent && activeTab === 'compare')setError(data?data.error:'Empty data');
        return;
      }
      
      // Save to chrome.storage if found/ready
      if(data.status === 'found' || data.status === 'partial') {
        var cacheObj = {};
        cacheObj[cacheKey] = {
          timestamp: Date.now(),
          data: data
        };
        chrome.storage.local.set(cacheObj);
      }

      processCompareData(data, silent);
    }).catch(function(err){
      var refreshBtn = document.getElementById('scp-refresh-btn');
      if(refreshBtn) refreshBtn.style.animation = '';
      if(!isContextValid())return;
      if(!silent && activeTab === 'compare')setError('Could not connect to server','network');
    });
  }

  if (forceRefresh) {
    executeCompare();
  } else {
    chrome.storage.local.get([cacheKey], function(result) {
      if (result[cacheKey]) {
        var cached = result[cacheKey];
        var age = Date.now() - cached.timestamp;
        // 15 minute TTL
        if (age < 15 * 60 * 1000) {
          processCompareData(cached.data, silent);
          return;
        }
      }
      executeCompare();
    });
  }
}

function processCompareData(data, silent) {
  // Only re-render if the data actually changed
  var changed = hasDataChanged(cachedData, data);
  cachedData=data;updateLiveDot('connected');
  if (data.product_id) {
    window.__scpProductId = data.product_id;
  }

  var isPollingNeeded = (data.status === 'queued' || data.status === 'partial');

  if (changed || !silent) {
    if(activeTab === 'compare'){
      if(data.results && data.results.length > 0){
        renderFound(data);
        if(isPollingNeeded){
          var el = document.getElementById('scp-main-content');
          if(el && !document.getElementById('scp-poll-indicator')){
            var indicator = document.createElement('div');
            indicator.id = 'scp-poll-indicator';
            indicator.style = 'display:flex;align-items:center;justify-content:center;padding:12px;gap:8px;background:rgba(124,92,252,0.05);border-radius:10px;margin-top:16px;font-size:12px;color:#64668b;';
            indicator.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(124,92,252,0.15);border-top-color:#7c5cfc;border-radius:50%;animation:sc-spin 0.8s linear infinite"></div>Checking for more prices...';
            el.appendChild(indicator);
          }
        }
      } else if(data.status === 'queued' || data.status === 'partial'){
        // 'partial' means product is known but scraping is still in progress — show queued state
        setQueued(pollRetries + 1);
      } else {
        setNoMatch();
      }
    } else {
      renderProductCard(data);
      // Refresh active tab layout so it doesn't get stuck in a stale or loading state
      if (activeTab === 'history') {
        handleHistoryTabClick();
      } else if (activeTab === 'alerts') {
        handleAlertsTabClick();
      } else if (activeTab === 'settings') {
        handleSettingsTabClick();
      }
    }
  }

  if(isPollingNeeded){
    pollRetries++;
    if(pollRetries < 18){ // up to ~3 minutes
      if(pollInterval) clearTimeout(pollInterval);
      var delay = Math.min(5000 + (pollRetries * 3000), 20000);
      var doPoll = function() {
        var pid = window.__scpProductId;
        if(pid){
          // Poll the dedicated endpoint — no re-scraping, just read current DB state
          msg({type:'API_REQUEST', method:'GET', endpoint:'/api/compare/poll/'+pid})
            .then(function(r){
              if(r && r.success && r.data){
                var pollData = r.data;
                // Merge into cachedData
                if(pollData.results && pollData.results.length > 0){
                  cachedData = Object.assign({}, cachedData, pollData);
                  renderFound(cachedData);
                }
                // Keep polling if still partial
                if(pollData.status === 'partial' || pollData.partial){
                  isPollingNeeded = true;
                  pollRetries++;
                  if(pollRetries < 18){
                    if(pollInterval) clearTimeout(pollInterval);
                    var nextDelay = Math.min(5000 + (pollRetries * 3000), 20000);
                    pollInterval = setTimeout(doPoll, nextDelay);
                  } else {
                    var ind = document.getElementById('scp-poll-indicator');
                    if(ind) ind.remove();
                  }
                } else {
                  pollRetries = 0;
                  var ind = document.getElementById('scp-poll-indicator');
                  if(ind) ind.remove();
                }
              }
            })
            .catch(function(){
              // Poll failed — fallback to runComparison
              runComparison(true);
            });
        } else {
          // No product_id yet — fallback to full re-compare
          runComparison(true);
        }
      };
      pollInterval = setTimeout(doPoll, delay);
    } else {
      pollRetries = 0;
      var ind = document.getElementById('scp-poll-indicator');
      if(ind) ind.remove();
    }
  } else {
    pollRetries=0;
    var ind = document.getElementById('scp-poll-indicator');
    if(ind)ind.remove();
  }
}

// -- SPA Nav Observer --
var observer=new MutationObserver(function(){
  var currentIdent = getProductIdentifier();
  if(currentIdent !== lastProductIdent){
    lastProductIdent = currentIdent;
    if(pollInterval){clearTimeout(pollInterval);pollInterval=null;}
    // If the actual product changed, reset view back to Compare tab
    setActiveTab('compare');
    if(detectPlatform()) {
      setTimeout(function(){
        setLoading();
        runComparison();
      },2000);
    } else {
      removePanel();
    }
  }
});
observer.observe(document.body,{childList:true,subtree:true});

// -- Init --
var platform=detectPlatform();
if(platform&&isContextValid()){
  setTimeout(function(){if(!isContextValid())return;var d=extractProductData(platform);if(d)msg({type:'OBSERVE',payload:d}).catch(function(){})},5000);
  setTimeout(runComparison,3000);
}
})();
