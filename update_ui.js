const fs = require('fs');
const path = require('path');

const contentJsPath = path.join(__dirname, 'extension', 'content.js');
let content = fs.readFileSync(contentJsPath, 'utf8');

const markerStart = '// ── Inline Panel CSS ────────────────────────────────';
const markerEnd = '// ── Main Flow ───────────────────────────────────────';

const startIndex = content.indexOf(markerStart);
const endIndex = content.indexOf(markerEnd);

if (startIndex === -1 || endIndex === -1) {
    console.error("Markers not found");
    process.exit(1);
}

const newCode = markerStart + '\n' + \`
const SCP_CSS = \\\`
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;700;800&family=DM+Mono:wght@400;500&family=Manrope:wght@400;500&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

#scp-panel {
  --scp-bg-base:      #f7f9ff;
  --scp-bg-elevated:  #ffffff;
  --scp-bg-surface:   #edf4ff;
  --scp-bg-surface-high: #d8eaff;
  --scp-bg-overlay:   rgba(255,255,255,0.8);
  --scp-border-dim:   rgba(199,196,216,0.2);
  --scp-border-base:  rgba(199,196,216,0.4);
  --scp-border-bright:rgba(199,196,216,0.8);
  
  --scp-text-primary: #091d2d;
  --scp-text-secondary: #464555;
  --scp-text-tertiary: #777587;
  
  --scp-primary:      #465d7b;
  --scp-secondary:    #4a3ee6;
  --scp-tertiary:     #3cd7ff;
  
  --scp-red:          #ba1a1a;
  --scp-red-dim:      #ffdad6;
  --scp-green:        #059669;
  --scp-green-dim:    #d1fae5;
  --scp-amber:        #d97706;
  --scp-amber-dim:    #fef3c7;
  
  --scp-ease-out:     cubic-bezier(0.16, 1, 0.3, 1);
  
  --scp-amazon:       #fbbf24;
  --scp-flipkart:     #3b82f6;
  --scp-myntra:       #ec4899;
  --scp-croma:        #14b8a6;
  --scp-ajio:         #1d4ed8;
  --scp-nykaa:        #be185d;
  --scp-tatacliq:     #111827;
  --scp-reliancedigital:#dc2626;
  --scp-appleindia:   #475569;
  --scp-decathlon:    #2563eb;
  --scp-kitabay:      #8b5cf6;
  --scp-vijaysales:   #ea580c;

  font-family: 'Manrope', sans-serif;
  color: var(--scp-text-primary);
  position: fixed;
  top: 0;
  right: -380px;
  width: 380px;
  height: 100vh;
  background: var(--scp-bg-base);
  box-shadow: -10px 0 30px rgba(0,0,0,0.05);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  transition: right 0.5s var(--scp-ease-out), transform 0.4s var(--scp-ease-out);
  border-left: 1px solid var(--scp-border-base);
}

#scp-panel.scp-open {
  right: 0;
}

#scp-panel * {
  box-sizing: border-box;
}

.material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }

.scp-header {
  background: #0A2540;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  height: 52px;
  flex-shrink: 0;
}
.scp-logo {
  display: flex;
  align-items: center;
  gap: 8px;
}
.scp-logo-icon {
  color: var(--scp-tertiary);
  font-size: 20px;
}
.scp-logo-text {
  font-family: 'Sora', sans-serif;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.05em;
}
.scp-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.scp-live-dot {
  width: 8px;
  height: 8px;
  background: var(--scp-tertiary);
  border-radius: 50%;
  animation: scp-pulse 2s infinite;
}
@keyframes scp-pulse { 0% { box-shadow: 0 0 0 0 rgba(60,215,255,0.4); } 70% { box-shadow: 0 0 0 6px rgba(60,215,255,0); } 100% { box-shadow: 0 0 0 0 rgba(60,215,255,0); } }
.scp-close {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  color: #fff;
  width: 24px;
  height: 24px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
}
.scp-close:hover {
  background: rgba(255,255,255,0.2);
}

.scp-tabs {
  display: flex;
  position: relative;
  border-bottom: 1px solid var(--scp-border-base);
  background: var(--scp-bg-elevated);
}
.scp-tab {
  flex: 1;
  padding: 14px 0;
  background: none;
  border: none;
  color: var(--scp-text-tertiary);
  font-family: 'Sora', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s;
}
.scp-tab:hover { color: var(--scp-text-primary); }
.scp-tab--active { color: var(--scp-secondary); }
.scp-tab-indicator {
  position: absolute;
  bottom: 0;
  height: 2px;
  background: var(--scp-secondary);
  transition: all 0.3s var(--scp-ease-out);
}

.scp-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 80px;
}
.scp-content::-webkit-scrollbar { width: 4px; }
.scp-content::-webkit-scrollbar-thumb { background: var(--scp-border-bright); border-radius: 4px; }
.scp-tab-panel {
  display: none;
  flex-direction: column;
  gap: 16px;
}
.scp-tab-panel--active {
  display: flex;
  animation: scp-fade-in 0.3s var(--scp-ease-out);
}
@keyframes scp-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.scp-card {
  background: var(--scp-bg-elevated);
  border: 1px solid var(--scp-border-dim);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
}
.scp-card-title {
  font-family: 'Sora', sans-serif;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--scp-text-primary);
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.scp-product-id {
  display: flex;
  gap: 12px;
  align-items: center;
}
.scp-product-img {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: var(--scp-bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.scp-product-img img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.scp-product-info {
  flex: 1;
  overflow: hidden;
}
.scp-product-title {
  font-family: 'Sora', sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: var(--scp-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}
.scp-product-price-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.scp-product-price {
  font-family: 'DM Mono', monospace;
  font-size: 18px;
  font-weight: 500;
  color: var(--scp-text-primary);
}

.scp-platform-row {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--scp-bg-surface);
  border-radius: 8px;
  text-decoration: none !important;
  transition: all 0.2s;
  margin-bottom: 4px;
}
.scp-platform-row:hover {
  background: var(--scp-bg-surface-high);
}
.scp-platform-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.scp-platform-icon {
  width: 32px;
  height: 32px;
  border-radius: 16px;
  background: var(--scp-bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  border: 1px solid var(--scp-border-dim);
}
.scp-platform-details {
  display: flex;
  flex-direction: column;
}
.scp-platform-name {
  font-family: 'Sora', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--scp-text-primary);
}
.scp-platform-tag {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: -0.05em;
  width: fit-content;
  margin-top: 2px;
}
.scp-platform-tag--save { background: var(--scp-green-dim); color: var(--scp-green); }
.scp-platform-tag--more { background: var(--scp-red-dim); color: var(--scp-red); }
.scp-platform-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.scp-platform-price {
  font-family: 'DM Mono', monospace;
  font-size: 15px;
  font-weight: 500;
  color: var(--scp-text-primary);
}
.scp-platform-go {
  width: 28px;
  height: 28px;
  border-radius: 14px;
  background: var(--scp-bg-elevated);
  border: 1px solid var(--scp-border-base);
  color: var(--scp-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.scp-platform-row:hover .scp-platform-go {
  background: var(--scp-secondary);
  color: #fff;
  border-color: var(--scp-secondary);
  transform: scale(1.1);
}
.scp-platform-go .material-symbols-outlined { font-size: 18px; }

.scp-chart-wrapper {
  height: 120px;
  width: 100%;
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
}
.scp-chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.scp-chart-lowest {
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  color: var(--scp-tertiary);
}

.scp-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 12px 16px;
  background: #F6F9FC;
  border-top: 1px solid #E6E9F0;
  z-index: 10;
}
.scp-alert-btn {
  width: 100%;
  height: 44px;
  background: var(--scp-secondary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-family: 'Sora', sans-serif;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(74,62,230,0.2);
  cursor: pointer;
  transition: all 0.2s;
}
.scp-alert-btn:hover { background: #3d31d9; }
.scp-alert-btn:active { transform: scale(0.98); }
.scp-alert-btn--watching { background: var(--scp-green); box-shadow: 0 4px 12px rgba(5,150,105,0.2); }

.scp-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px; padding: 40px 24px; position: relative; }
.scp-spinner { width: 40px; height: 40px; border: 3px solid var(--scp-bg-surface-high); border-top-color: var(--scp-secondary); border-radius: 50%; animation: scp-spin 1s linear infinite; }
@keyframes scp-spin { to { transform: rotate(360deg); } }
.scp-loading-text { font-family: 'Manrope', sans-serif; font-size: 13px; color: var(--scp-text-tertiary); text-align: center; font-weight: 500; line-height:1.5; }

.scp-state-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 24px; text-align: center; }
.scp-state-icon { font-size: 32px; color: var(--scp-text-tertiary); opacity: 0.5; font-variation-settings: 'FILL' 0; }
.scp-state-title { font-family: 'Sora', sans-serif; font-size: 16px; font-weight: 700; color: var(--scp-text-primary); }
.scp-state-sub { font-size: 13px; color: var(--scp-text-secondary); line-height: 1.5; }
.scp-retry-btn { margin-top: 12px; padding: 8px 20px; background: var(--scp-bg-surface); border: 1px solid var(--scp-border-base); border-radius: 8px; color: var(--scp-text-primary); font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.scp-retry-btn:hover { background: var(--scp-bg-surface-high); }
\\\`;

function pushPageBody(open) {
  const existing = document.getElementById('scp-body-style')
  if (open && !existing) {
    const style = document.createElement('style')
    style.id = 'scp-body-style'
    style.textContent = \`body { margin-right: 380px !important; transition: margin-right 0.5s cubic-bezier(0.16, 1, 0.3, 1) !important; }\`
    document.head.appendChild(style)
  } else if (!open && existing) {
    existing.textContent = \`body { margin-right: 0 !important; transition: margin-right 0.4s cubic-bezier(0.87, 0, 0.13, 1) !important; }\`
    setTimeout(() => existing.remove(), 400)
  }
}

function updateTabIndicator(activeTab) {
  const indicator = document.querySelector('#scp-panel .scp-tab-indicator')
  if (!indicator || !activeTab) return;
  const rect = activeTab.getBoundingClientRect()
  const parentRect = activeTab.parentElement.getBoundingClientRect()
  indicator.style.left = (rect.left - parentRect.left) + 'px'
  indicator.style.width = rect.width + 'px'
}

function injectPanel() {
  if (document.getElementById("scp-panel")) return;
  
  if (!document.getElementById("scp-inline-styles")) {
    const style = document.createElement("style"); style.id = "scp-inline-styles";
    style.textContent = SCP_CSS; document.head.appendChild(style);
  }

  // Inject Chart.js if not present
  if (!document.getElementById("scp-chartjs-script")) {
    const s = document.createElement("script");
    s.id = "scp-chartjs-script";
    s.src = "https://cdn.jsdelivr.net/npm/chart.js";
    document.head.appendChild(s);
  }

  const panel = document.createElement("div"); panel.id = "scp-panel";
  panel.innerHTML = \`
    <header class="scp-header">
      <div class="scp-logo">
        <span class="material-symbols-outlined scp-logo-icon" style="font-variation-settings: 'FILL' 1;">monitoring</span>
        <div class="scp-logo-text">PricePulse</div>
      </div>
      <div class="scp-header-right">
        <div class="scp-live-dot" title="Live data"></div>
        <button class="scp-close" id="scp-close-btn" aria-label="Close panel">
          <span class="material-symbols-outlined" style="font-size:18px">close</span>
        </button>
      </div>
    </header>
    <nav class="scp-tabs">
      <button class="scp-tab scp-tab--active" data-tab="scanner">Scanner</button>
      <button class="scp-tab" data-tab="pricedrop">Price Drop</button>
      <div class="scp-tab-indicator"></div>
    </nav>
    <div class="scp-content" id="scp-content">
      <div class="scp-tab-panel scp-tab-panel--active" id="scp-tab-scanner"></div>
      <div class="scp-tab-panel" id="scp-tab-pricedrop"></div>
    </div>
    <footer class="scp-footer">
      <button class="scp-alert-btn" id="scp-watchlist-btn" data-pid="">
        <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">notifications_active</span>
        Set Alert
      </button>
    </footer>
  \`;
  document.body.appendChild(panel);

  document.getElementById("scp-close-btn").addEventListener("click", () => hidePanel());

  panel.querySelectorAll(".scp-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      panel.querySelectorAll(".scp-tab").forEach(t => t.classList.remove("scp-tab--active"));
      panel.querySelectorAll(".scp-tab-panel").forEach(p => p.classList.remove("scp-tab-panel--active"));
      tab.classList.add("scp-tab--active");
      document.getElementById("scp-tab-" + tab.dataset.tab).classList.add("scp-tab-panel--active");
      updateTabIndicator(tab);
    });
  });

  requestAnimationFrame(() => requestAnimationFrame(() => {
    panel.classList.add("scp-open");
    pushPageBody(true);
    panelVisible = true;
    const activeTab = panel.querySelector('.scp-tab--active');
    if (activeTab) updateTabIndicator(activeTab);
  }));
}

function hidePanel() {
  const p = document.getElementById("scp-panel");
  if (p) { p.classList.remove("scp-open"); pushPageBody(false); panelVisible = false; }
}
function showPanel() {
  const p = document.getElementById("scp-panel");
  if (p) { p.classList.add("scp-open"); pushPageBody(true); panelVisible = true; }
}
function removePanel() {
  const p = document.getElementById("scp-panel"); if (p) p.remove();
  pushPageBody(false); panelVisible = false;
}

if(isContextValid()){
  try{
    chrome.runtime.onMessage.addListener((m)=>{
      if(m.type==="TOGGLE_PANEL"){panelVisible?hidePanel():showPanel();}
    });
  }catch{ /* context invalidated — ignore */ }
}

function setLoading() {
  const s = document.getElementById("scp-tab-scanner");
  const p = document.getElementById("scp-tab-pricedrop");
  if (s) {
    s.innerHTML = \`
      <div class="scp-loading">
        <div class="scp-spinner"></div>
        <div class="scp-loading-text">Analyzing market data...</div>
      </div>
    \`;
  }
  if (p) p.innerHTML = "";
}

function setError(message) {
  const s = document.getElementById("scp-tab-scanner");
  if (s) {
    s.innerHTML = \`
      <div class="scp-state-empty">
        <span class="material-symbols-outlined scp-state-icon">error</span>
        <div class="scp-state-title">Data Unavailable</div>
        <div class="scp-state-sub">\${message}</div>
        <button class="scp-retry-btn" onclick="runComparison()">Try Again</button>
      </div>
    \`;
  }
}

function setNoMatch() {
  const s = document.getElementById("scp-tab-scanner");
  if (s) {
    s.innerHTML = \`
      <div class="scp-state-empty">
        <span class="material-symbols-outlined scp-state-icon">search_off</span>
        <div class="scp-state-title">No Matches Found</div>
        <div class="scp-state-sub">We couldn't find exact matches for this product across our supported platforms.</div>
      </div>
    \`;
  }
}

function setQueued(data) {
  const s = document.getElementById("scp-tab-scanner");
  if (s) {
    s.innerHTML = \`
      <div class="scp-loading">
        <div class="scp-spinner"></div>
        <div class="scp-loading-text">Scanning stores in real-time...<br><span style="font-size:11px;color:var(--scp-text-tertiary)">This usually takes 10-15 seconds</span></div>
      </div>
    \`;
  }
}

function fmtINR(n){if(n==null)return"—";return"₹"+Number(n).toLocaleString("en-IN")}
function timeAgo(d){if(!d)return"";const s=Math.floor((Date.now()-new Date(d))/1000);
  if(s<60)return"just now";if(s<3600)return Math.floor(s/60)+"m ago";
  if(s<86400)return Math.floor(s/3600)+"h ago";return Math.floor(s/86400)+"d ago";}

function renderFound(data) {
  cachedData = data;
  renderDealScanner(data);
  renderPriceDrop(data);
  setupWatchlistBtn(data);
}

function renderDealScanner(d) {
  const el = document.getElementById("scp-tab-scanner");
  if (!el) return;

  const results = d.results || [];
  const currPagePrice = results.find(r => location.href.includes(r.url?.split("/")[2]))?.price;
  
  let h = '';
  
  // Product Identity Card
  const imageUrl = results[0]?.imageUrl || "https://via.placeholder.com/48";
  h += \`
    <div class="scp-card scp-product-id">
      <div class="scp-product-img"><img src="\${imageUrl}" alt="Product"></div>
      <div class="scp-product-info">
        <div class="scp-product-title" title="\${d.product_name || 'Product'}">\${d.product_name || 'Product'}</div>
        <div class="scp-product-price-row">
          <span class="scp-product-price">\${fmtINR(results[0]?.price)}</span>
        </div>
      </div>
    </div>
  \`;

  // Chart Section
  if (d.price_history && d.price_history.length > 0) {
    const lowestPrice = Math.min(...d.price_history.map(r => r.price));
    h += \`
      <div class="scp-card">
        <div class="scp-chart-header">
          <div class="scp-card-title" style="margin:0">30-Day History</div>
          <div class="scp-chart-lowest">Lowest: \${fmtINR(lowestPrice)}</div>
        </div>
        <div class="scp-chart-wrapper">
          <canvas id="scp-chart"></canvas>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:9px;font-family:'DM Mono',monospace;color:var(--scp-text-tertiary);">
          <span>30 DAYS AGO</span><span>TODAY</span>
        </div>
      </div>
    \`;
  }

  // Comparison List
  h += \`
    <div style="margin-top:8px;">
      <div class="scp-card-title">Compare Prices</div>
  \`;
  
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const platKey = Object.keys(PLATFORMS).find(k => r.platform.toLowerCase().includes(k.split(".")[0])) || r.platform;
    const platInfo = PLATFORMS[platKey] || { name: r.platform, cls: "" };
    
    let tagHtml = "";
    if (currPagePrice && r.price < currPagePrice && currPagePrice !== r.price) {
      const saved = currPagePrice - r.price;
      tagHtml = \`<span class="scp-platform-tag scp-platform-tag--save">SAVE \${fmtINR(saved)}</span>\`;
    } else if (currPagePrice && r.price > currPagePrice) {
      const more = r.price - currPagePrice;
      tagHtml = \`<span class="scp-platform-tag scp-platform-tag--more">+\${fmtINR(more)}</span>\`;
    }

    const initial = platInfo.name.charAt(0).toUpperCase();
    const iconColor = \`var(--scp-\${platInfo.cls}, var(--scp-indigo))\`;

    h += \`
      <a class="scp-platform-row" href="\${r.url}" target="_blank">
        <div class="scp-platform-left">
          <div class="scp-platform-icon" style="color:\${iconColor}">\${initial}</div>
          <div class="scp-platform-details">
            <span class="scp-platform-name">\${platInfo.name}</span>
            \${tagHtml}
          </div>
        </div>
        <div class="scp-platform-right">
          <span class="scp-platform-price">\${fmtINR(r.price)}</span>
          <div class="scp-platform-go">
            <span class="material-symbols-outlined">chevron_right</span>
          </div>
        </div>
      </a>
    \`;
  }
  
  h += \`</div>\`;
  el.innerHTML = h;
  
  const btn = document.getElementById("scp-watchlist-btn");
  if(btn) btn.dataset.pid = d.product_id;
  
  if (d.price_history && d.price_history.length > 0) {
    setTimeout(() => {
      loadChart(d.price_history, 30);
    }, 100);
  }
}

function renderPriceDrop(d) {
  const el = document.getElementById("scp-tab-pricedrop");
  if (!el) return;
  const br = d.buy_recommendation || { score: 50, label: "Insufficient data", reason: "", score_1week: 50, score_1month: 50 };
  const recCls = br.score >= 75 ? "scp-green" : br.score >= 50 ? "scp-tertiary" : br.score >= 25 ? "scp-amber" : "scp-red";

  let h = \`
    <div class="scp-card" style="text-align:center; padding: 24px 16px;">
      <div style="font-size:42px; font-weight:800; font-family:'Sora',sans-serif; color:var(--\${recCls}); margin-bottom:8px;">
        \${br.score}<span style="font-size:20px;color:var(--scp-text-tertiary)">/100</span>
      </div>
      <div style="font-family:'Sora',sans-serif; font-size:16px; font-weight:700; color:var(--scp-text-primary); margin-bottom:8px;">
        \${br.label}
      </div>
      <div style="font-size:13px; color:var(--scp-text-secondary); line-height:1.5;">
        \${br.reason}
      </div>
    </div>
  \`;

  const ps = d.price_stats || {};
  h += \`
    <div class="scp-card-title" style="margin-top:16px;">Price Statistics</div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
      <div class="scp-card">
        <div style="font-size:10px; font-weight:700; color:var(--scp-text-tertiary); text-transform:uppercase; margin-bottom:4px;">Highest</div>
        <div class="scp-product-price">\${fmtINR(ps.all_time_high)}</div>
      </div>
      <div class="scp-card">
        <div style="font-size:10px; font-weight:700; color:var(--scp-text-tertiary); text-transform:uppercase; margin-bottom:4px;">Average</div>
        <div class="scp-product-price">\${fmtINR(ps.avg_price_90d)}</div>
      </div>
      <div class="scp-card">
        <div style="font-size:10px; font-weight:700; color:var(--scp-text-tertiary); text-transform:uppercase; margin-bottom:4px;">Lowest</div>
        <div class="scp-product-price">\${fmtINR(ps.all_time_low)}</div>
      </div>
      <div class="scp-card" style="background:var(--scp-bg-surface-high);">
        <div style="font-size:10px; font-weight:700; color:var(--scp-secondary); text-transform:uppercase; margin-bottom:4px;">Current</div>
        <div class="scp-product-price" style="color:var(--scp-secondary)">\${fmtINR(d.results?.[0]?.price)}</div>
      </div>
    </div>
  \`;

  el.innerHTML = h;
}

function setupWatchlistBtn(data){
  const btn=document.getElementById("scp-watchlist-btn");if(!btn)return;
  
  if(data.on_watchlist){
    btn.innerHTML = \`<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">check_circle</span> Alert Active\`;
    btn.className="scp-alert-btn scp-alert-btn--watching";
  } else {
    btn.innerHTML = \`<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">notifications_active</span> Set Alert\`;
    btn.className="scp-alert-btn";
  }

  btn.onclick = async () => {
    const pid=btn.dataset.pid;
    if(data.on_watchlist){
      const r=await msg({type:"REMOVE_WATCHLIST",product_id:pid});
      if(r&&r.success){
        data.on_watchlist=false;
        btn.innerHTML=\`<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">notifications_active</span> Set Alert\`;
        btn.className="scp-alert-btn";
      }
    }else{
      const currentPrice = data.results?.[0]?.price;
      const tp = currentPrice ? currentPrice * 0.9 : null; // target 10% drop by default
      const r=await msg({type:"ADD_WATCHLIST",payload:{product_id:pid,target_price:tp}});
      if(r&&r.success){
        data.on_watchlist=true;
        btn.innerHTML=\`<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">check_circle</span> Alert Active\`;
        btn.className="scp-alert-btn scp-alert-btn--watching";
      }
    }
  };
}

let chartInstance = null;

function initPriceChart(historyData) {
  if (typeof Chart === 'undefined') {
    setTimeout(() => initPriceChart(historyData), 200);
    return null;
  }
  const canvas = document.getElementById('scp-chart');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 120);
  gradient.addColorStop(0,   'rgba(74, 62, 230, 0.15)');
  gradient.addColorStop(1,   'rgba(74, 62, 230, 0.00)');

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: historyData.map(d => {
        const dt = new Date(d.date);
        return dt.toLocaleDateString("en-IN", {day: "numeric", month: "short"});
      }),
      datasets: [{
        data: historyData.map(d => d.price),
        borderColor: '#4a3ee6',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#3cd7ff',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
        backgroundColor: gradient,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff',
          borderColor: 'rgba(199,196,216,0.4)',
          borderWidth: 1,
          titleColor: '#777587',
          bodyColor: '#091d2d',
          titleFont: { family: "'Manrope', sans-serif", size: 10 },
          bodyFont: { family: "'DM Mono', monospace", size: 13, weight: '500' },
          padding: 8,
          cornerRadius: 6,
          displayColors: false,
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => '₹' + item.raw.toLocaleString('en-IN'),
          }
        }
      },
      scales: {
        x: { display: false },
        y: { display: false, min: Math.min(...historyData.map(d=>d.price))*0.95 }
      }
    }
  });
  return chart;
}

function loadChart(history, rangeDays = 30) {
  let data = history || [];
  if (rangeDays > 0) {
    const cutoff = new Date(Date.now() - rangeDays * 86400000);
    data = history.filter(h => new Date(h.date) >= cutoff);
  }
  if (data.length === 0) return;
  if (chartInstance) { chartInstance.destroy(); }
  chartInstance = initPriceChart(data);
}

\` + '\\n';

const newContent = content.substring(0, startIndex) + newCode + content.substring(endIndex);
fs.writeFileSync(contentJsPath, newContent, 'utf8');
console.log("Updated content.js successfully");
