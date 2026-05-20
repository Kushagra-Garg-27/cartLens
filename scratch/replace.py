import os

file_path = r"c:\Users\tanis\OneDrive\Desktop\VIT subjects\SEM-4\EDI\SmartComparison-Tool\extension\content.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

start_marker = "// ── Inline Panel CSS ────────────────────────────────"
end_marker = "// ── Main Flow ───────────────────────────────────────"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Markers not found")
    exit(1)

new_content = """// ── Inline Panel CSS ────────────────────────────────
const SCP_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Syne:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600&display=swap');

#scp-panel {
  --scp-bg-base:      #080a0f;
  --scp-bg-elevated:  #0d1117;
  --scp-bg-surface:   #131820;
  --scp-bg-overlay:   rgba(255,255,255,0.03);
  --scp-border-dim:   rgba(255,255,255,0.06);
  --scp-border-base:  rgba(255,255,255,0.10);
  --scp-border-bright:rgba(255,255,255,0.18);
  --scp-border-glow:  rgba(99,102,241,0.40);
  --scp-text-primary:   #f0f2f5;
  --scp-text-secondary: #7c8a9e;
  --scp-text-tertiary:  #3d4a5c;
  --scp-text-inverse:   #080a0f;
  --scp-indigo:    #6366f1;
  --scp-indigo-dim:#2d2f6b;
  --scp-green:     #10b981;
  --scp-green-dim: #052e1b;
  --scp-amber:     #f59e0b;
  --scp-amber-dim: #2d1f02;
  --scp-red:       #ef4444;
  --scp-red-dim:   #2d0808;
  --scp-cyan:      #06b6d4;
  --scp-cyan-dim:  #012027;
  --scp-amazon:   #FF9900;
  --scp-flipkart: #2874F0;
  --scp-myntra:   #FF3F6C;
  --scp-croma:    #65AC2A;
  --scp-ajio:     #E31837;
  --scp-nykaa:    #FC2779;
  --scp-reliance: #1B3A8E;
  --scp-tatacliq: #7B1FA2;
  --scp-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --scp-ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
  --scp-ease-in-out: cubic-bezier(0.87, 0, 0.13, 1);

  position: fixed;
  top: 0;
  right: 0;
  width: 380px;
  height: 100vh;
  background: var(--scp-bg-base);
  border-left: 1px solid var(--scp-border-dim);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
  transform: translateX(100%);
  transition: transform 0.5s var(--scp-ease-out);
}
#scp-panel.scp-open {
  transform: translateX(0);
}
#scp-panel.scp-open::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 1px;
  background: linear-gradient(to bottom, transparent 0%, var(--scp-indigo) 30%, var(--scp-cyan) 70%, transparent 100%);
  opacity: 0;
  animation: scp-edge-glow 0.8s var(--scp-ease-out) 0.3s forwards;
}
@keyframes scp-edge-glow { to { opacity: 0.6; } }

#scp-panel * { box-sizing: border-box; margin: 0; padding: 0; }

.scp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 12px; border-bottom: 1px solid var(--scp-border-dim);
  background: linear-gradient(180deg, var(--scp-bg-elevated) 0%, transparent 100%);
  flex-shrink: 0;
}
.scp-logo { display: flex; align-items: center; gap: 10px; }
.scp-logo-icon { font-size: 18px; filter: drop-shadow(0 0 8px rgba(99,102,241,0.8)); animation: scp-pulse-glow 3s ease-in-out infinite; }
@keyframes scp-pulse-glow {
  0%, 100% { filter: drop-shadow(0 0 6px rgba(99,102,241,0.6)); }
  50%       { filter: drop-shadow(0 0 14px rgba(99,102,241,1.0)); }
}
.scp-logo-name { font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; color: var(--scp-text-primary); letter-spacing: 0.02em; }
.scp-logo-pro {
  font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 500; color: var(--scp-indigo);
  letter-spacing: 0.15em; background: var(--scp-indigo-dim); border: 1px solid rgba(99,102,241,0.3);
  border-radius: 3px; padding: 1px 5px; vertical-align: middle; margin-left: 4px;
}
.scp-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--scp-green); box-shadow: 0 0 8px var(--scp-green); animation: scp-live-pulse 2s ease-in-out infinite; }
@keyframes scp-live-pulse { 0%, 100% { opacity: 1; box-shadow: 0 0 6px var(--scp-green); } 50% { opacity: 0.4; box-shadow: 0 0 2px var(--scp-green); } }
.scp-header-right { display: flex; align-items: center; gap: 12px; }
.scp-close { background: none; border: none; cursor: pointer; color: var(--scp-text-tertiary); font-size: 16px; padding: 4px 6px; border-radius: 6px; transition: color 0.15s, background 0.15s; }
.scp-close:hover { color: var(--scp-text-primary); background: var(--scp-bg-surface); }

.scp-tabs { position: relative; display: flex; padding: 0 16px; border-bottom: 1px solid var(--scp-border-dim); flex-shrink: 0; gap: 0; }
.scp-tab { flex: 1; background: none; border: none; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--scp-text-tertiary); padding: 12px 0 10px; position: relative; transition: color 0.2s var(--scp-ease-out); }
.scp-tab--active { color: var(--scp-text-primary); }
.scp-tab-indicator { position: absolute; bottom: 0; height: 2px; background: linear-gradient(90deg, var(--scp-indigo), var(--scp-cyan)); border-radius: 2px 2px 0 0; transition: left 0.35s var(--scp-ease-spring), width 0.35s var(--scp-ease-spring); }

.scp-gauge-wrapper { text-align: center; margin-bottom: 16px; margin-top: 8px; position: relative; }
.scp-gauge-svg { width: 220px; height: 140px; margin: 0 auto; display: block; }

.scp-deal-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 100px; font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; border: 1px solid; position: relative; overflow: hidden; animation: scp-badge-appear 0.4s var(--scp-ease-spring) 1s both; }
@keyframes scp-badge-appear { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.scp-deal-badge::after { content: ''; position: absolute; top: 0; left: -100%; right: 0; bottom: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); animation: scp-shimmer 3s ease-in-out 2s infinite; }
@keyframes scp-shimmer { 0% { left: -100%; } 100% { left: 200%; } }
.scp-badge--epic  { color: var(--scp-green);  border-color: rgba(16,185,129,0.4); background: rgba(16,185,129,0.08); }
.scp-badge--good  { color: var(--scp-cyan);   border-color: rgba(6,182,212,0.4);  background: rgba(6,182,212,0.08); }
.scp-badge--fair  { color: var(--scp-amber);  border-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.08); }
.scp-badge--over  { color: var(--scp-red);    border-color: rgba(239,68,68,0.4);  background: rgba(239,68,68,0.08); }

.scp-breakup-list { list-style: none; padding: 0; margin: 0 0 16px 0; display: flex; flex-direction: column; gap: 2px; }
.scp-breakup-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; background: var(--scp-bg-elevated); border: 1px solid var(--scp-border-dim); font-size: 12px; color: var(--scp-text-secondary); transition: background 0.15s, border-color 0.15s; opacity: 0; transform: translateX(-8px); animation: scp-item-in 0.3s var(--scp-ease-out) forwards; }
@keyframes scp-item-in { to { opacity: 1; transform: translateX(0); } }
.scp-breakup-item:hover { background: var(--scp-bg-surface); border-color: var(--scp-border-base); }
.scp-breakup-dot { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.scp-breakup-dot--earned { background: var(--scp-green-dim); border: 1.5px solid var(--scp-green); }
.scp-breakup-dot--missed { background: var(--scp-red-dim); border: 1.5px solid var(--scp-red); }
.scp-breakup-dot--earned::after { content: '✓'; font-size: 9px; color: var(--scp-green); font-weight: 700; }
.scp-breakup-dot--missed::after { content: '–'; font-size: 11px; color: var(--scp-red); font-weight: 700; }
.scp-breakup-label { flex: 1; }
.scp-breakup-pts { font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500; }
.scp-breakup-pts--earned { color: var(--scp-green); }
.scp-breakup-pts--missed { color: var(--scp-text-tertiary); }

.scp-platform-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.scp-platform-card { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--scp-bg-elevated); border: 1px solid var(--scp-border-dim); border-radius: 10px; cursor: pointer; text-decoration: none; transition: border-color 0.2s, background 0.2s, transform 0.15s; overflow: hidden; opacity: 0; transform: translateY(6px); animation: scp-card-in 0.35s var(--scp-ease-out) forwards; }
.scp-platform-card:hover { background: var(--scp-bg-surface); border-color: var(--scp-border-base); transform: translateX(2px); }
.scp-platform-card:active { transform: scale(0.99); }
.scp-platform-card--best { border-left: 2px solid var(--scp-indigo); border-color: rgba(99,102,241,0.25); background: linear-gradient(135deg, rgba(99,102,241,0.06) 0%, var(--scp-bg-elevated) 60%); }
.scp-platform-card--best::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(99,102,241,0.04), transparent 60%); pointer-events: none; }
@keyframes scp-card-in { to { opacity: 1; transform: translateY(0); } }
.scp-platform-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 6px currentColor; }
.scp-platform-name { font-size: 13px; font-weight: 500; color: var(--scp-text-primary); flex: 1; }
.scp-platform-meta { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--scp-text-tertiary); margin-top: 1px; }
.scp-platform-price { font-family: 'DM Mono', monospace; font-size: 15px; font-weight: 500; color: var(--scp-text-primary); text-align: right; }
.scp-platform-savings { font-size: 10px; color: var(--scp-green); text-align: right; margin-top: 1px; }
.scp-platform-tags { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; margin-top: 2px;}
.scp-platform-badge { font-size: 9px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; display: inline-block; }
.scp-badge--exact    { background: rgba(16,185,129,0.12); color: var(--scp-green); border: 1px solid rgba(16,185,129,0.25); }
.scp-badge--likely   { background: rgba(245,158,11,0.12);  color: var(--scp-amber); border: 1px solid rgba(245,158,11,0.25); }
.scp-badge--best-price { background: var(--scp-indigo-dim); color: var(--scp-indigo); border: 1px solid rgba(99,102,241,0.3); }
.scp-badge--in-stock   { background: rgba(16,185,129,0.12); color: var(--scp-green); border: 1px solid rgba(16,185,129,0.25); }
.scp-badge--oos        { background: rgba(239,68,68,0.12); color: var(--scp-red); border: 1px solid rgba(239,68,68,0.25); }

.scp-chart-container { position: relative; height: 160px; margin: 0 -4px; }
.scp-chart-range-pills { display: flex; gap: 4px; justify-content: flex-end; margin-bottom: 8px; }
.scp-range-pill { font-family: 'DM Mono', monospace; font-size: 10px; padding: 3px 10px; border-radius: 100px; border: 1px solid var(--scp-border-dim); color: var(--scp-text-tertiary); background: none; cursor: pointer; transition: all 0.15s; }
.scp-range-pill--active { color: var(--scp-indigo); border-color: rgba(99,102,241,0.4); background: rgba(99,102,241,0.08); }
.scp-range-pill:hover:not(.scp-range-pill--active) { border-color: var(--scp-border-base); color: var(--scp-text-secondary); }

.scp-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 16px;}
.scp-stat-card { background: var(--scp-bg-elevated); border: 1px solid var(--scp-border-dim); border-radius: 10px; padding: 12px 14px; transition: border-color 0.2s, background 0.2s; }
.scp-stat-card:hover { border-color: var(--scp-border-base); background: var(--scp-bg-surface); }
.scp-stat-card--bbd { border-color: rgba(245,158,11,0.2); background: linear-gradient(135deg, rgba(245,158,11,0.06), var(--scp-bg-elevated)); }
.scp-stat-label { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--scp-text-tertiary); margin-bottom: 6px; }
.scp-stat-arrow--up   { color: var(--scp-red);   }
.scp-stat-arrow--down { color: var(--scp-green);  }
.scp-stat-arrow--mid  { color: var(--scp-amber);  }
.scp-stat-value { font-family: 'DM Mono', monospace; font-size: 16px; font-weight: 500; color: var(--scp-text-primary); overflow: hidden; }

.scp-alert-section { padding: 14px; background: var(--scp-bg-elevated); border: 1px solid var(--scp-border-dim); border-radius: 12px; margin-top: 8px; margin-bottom: 16px; }
.scp-alert-label { font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--scp-text-tertiary); margin-bottom: 10px; }
.scp-alert-row { display: flex; gap: 8px; align-items: center; }
.scp-alert-input { flex: 1; background: var(--scp-bg-base); border: 1px solid var(--scp-border-base); border-radius: 8px; padding: 9px 12px; font-family: 'DM Mono', monospace; font-size: 14px; color: var(--scp-text-primary); outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.scp-alert-input:focus { border-color: var(--scp-indigo); box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
.scp-alert-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 16px; background: var(--scp-indigo); border: none; border-radius: 8px; color: #fff; font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background 0.15s, transform 0.1s; position: relative; overflow: hidden; }
.scp-alert-btn:hover  { background: #4f52d4; }
.scp-alert-btn:active { transform: scale(0.97); }
.scp-alert-btn::after { content: ''; position: absolute; inset: 0; background: radial-gradient(circle, rgba(255,255,255,0.25) 0%, transparent 70%); opacity: 0; transition: opacity 0.3s; }
.scp-alert-btn:active::after { opacity: 1; }
.scp-alert-btn--watching { background: var(--scp-green-dim); border: 1px solid rgba(16,185,129,0.4); color: var(--scp-green); }

.scp-content { flex: 1; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: rgba(99,102,241,0.3) transparent; scroll-behavior: smooth; }
.scp-content::-webkit-scrollbar       { width: 3px; }
.scp-content::-webkit-scrollbar-track { background: transparent; }
.scp-content::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 3px; }
.scp-content::-webkit-scrollbar-thumb:hover { background: rgba(99,102,241,0.6); }

.scp-tab-panel { padding: 16px; display: none; flex-direction: column; gap: 14px; }
.scp-tab-panel--active { display: flex; animation: scp-tab-appear 0.25s var(--scp-ease-out); }
@keyframes scp-tab-appear { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.scp-section-label { font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--scp-text-tertiary); margin-bottom: 6px; }

.scp-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 20px; padding: 40px 24px; position: relative; }
.scp-spinner { position: relative; width: 52px; height: 52px; }
.scp-spinner-ring { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid transparent; animation: scp-spin linear infinite; }
.scp-spinner-ring:nth-child(1) { border-top-color: var(--scp-indigo); animation-duration: 1.2s; }
.scp-spinner-ring:nth-child(2) { inset: 8px; border-right-color: var(--scp-cyan); animation-duration: 0.9s; animation-direction: reverse; }
.scp-spinner-ring:nth-child(3) { inset: 16px; border-bottom-color: rgba(99,102,241,0.4); animation-duration: 0.6s; }
.scp-loading-text { font-family: 'Inter', sans-serif; font-size: 13px; color: var(--scp-text-tertiary); text-align: center; line-height: 1.6; }
.scp-scan-line { position: absolute; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--scp-indigo), var(--scp-cyan), transparent); animation: scp-scan 2s var(--scp-ease-in-out) infinite; opacity: 0.4; pointer-events: none;}
@keyframes scp-scan { 0% { top: 0%; opacity: 0; } 10% { opacity: 0.4; } 90% { opacity: 0.4; } 100% { top: 100%; opacity: 0; } }

.scp-queued { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 32px 20px; text-align: center; }
.scp-queued-icon { font-size: 32px; animation: scp-tick 1s ease-in-out infinite; }
@keyframes scp-tick { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.scp-queued-title { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 700; color: var(--scp-text-primary); }
.scp-queued-sub { font-size: 13px; color: var(--scp-text-secondary); line-height: 1.6; max-width: 280px; }
.scp-progress-bar { width: 100%; height: 2px; background: var(--scp-bg-surface); border-radius: 2px; overflow: hidden; margin-top: 8px; position: relative;}
.scp-progress-bar-fill { position: absolute; left: 0; top: 0; height: 100%; width: 40%; background: linear-gradient(90deg, var(--scp-indigo), var(--scp-cyan)); border-radius: 2px; animation: scp-progress-sweep 2s ease-in-out infinite; }
@keyframes scp-progress-sweep { 0% { transform: translateX(-150%); } 100% { transform: translateX(250%); } }

.scp-state-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 24px; text-align: center; }
.scp-state-icon { font-size: 36px; filter: grayscale(0.3); opacity: 0.7; }
.scp-state-title { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700; color: var(--scp-text-primary); }
.scp-state-sub { font-size: 13px; color: var(--scp-text-secondary); line-height: 1.6; max-width: 260px; }
.scp-retry-btn { margin-top: 8px; padding: 9px 24px; background: var(--scp-bg-surface); border: 1px solid var(--scp-border-base); border-radius: 8px; color: var(--scp-text-primary); font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s, border-color 0.15s, transform 0.1s; }
.scp-retry-btn:hover  { background: var(--scp-bg-elevated); border-color: var(--scp-border-bright); }
.scp-retry-btn:active { transform: scale(0.97); }

.scp-rec-label { text-align: center; margin: 8px 0; }
.scp-rec-label span { font-size: 14px; font-weight: 700; }
.scp-rec-label.great span { color: var(--scp-green); }
.scp-rec-label.good span { color: var(--scp-cyan); }
.scp-rec-label.wait span { color: var(--scp-amber); }
.scp-rec-label.bad span { color: var(--scp-red); }
.scp-rec-reason { text-align: center; font-size: 12px; color: var(--scp-text-secondary); margin-bottom: 16px; }

.scp-timeframes { display: flex; gap: 6px; justify-content: center; margin-bottom: 16px; }
.scp-tf-pill { padding: 6px 14px; border-radius: 16px; font-size: 11px; font-weight: 600; color: var(--scp-text-tertiary); background: var(--scp-bg-surface); border: 1px solid var(--scp-border-dim); cursor: pointer; transition: all 0.15s; }
.scp-tf-pill.active { color: var(--scp-text-primary); background: var(--scp-indigo-dim); border-color: rgba(99,102,241,0.5); }
`;

function pushPageBody(open) {
  const existing = document.getElementById('scp-body-style')
  if (open && !existing) {
    const style = document.createElement('style')
    style.id = 'scp-body-style'
    style.textContent = `
      body { margin-right: 380px !important; transition: margin-right 0.5s cubic-bezier(0.16, 1, 0.3, 1) !important; }
    `
    document.head.appendChild(style)
  } else if (!open && existing) {
    existing.textContent = `body { margin-right: 0 !important; transition: margin-right 0.4s cubic-bezier(0.87, 0, 0.13, 1) !important; }`
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

  const panel = document.createElement("div"); panel.id = "scp-panel";
  panel.innerHTML = `
    <header class="scp-header">
      <div class="scp-logo">
        <div class="scp-logo-icon">⚡</div>
        <div class="scp-logo-text">
          <span class="scp-logo-name">SmartCompare</span>
          <span class="scp-logo-pro">PRO</span>
        </div>
      </div>
      <div class="scp-header-right">
        <div class="scp-live-dot" title="Live data"></div>
        <button class="scp-close" id="scp-close-btn" aria-label="Close panel">✕</button>
      </div>
    </header>
    <nav class="scp-tabs">
      <button class="scp-tab scp-tab--active" data-tab="scanner">Deal Scanner</button>
      <button class="scp-tab" data-tab="pricedrop">Price Drop</button>
      <div class="scp-tab-indicator"></div>
    </nav>
    <div class="scp-content" id="scp-content">
      <div class="scp-tab-panel scp-tab-panel--active" id="scp-tab-scanner"></div>
      <div class="scp-tab-panel" id="scp-tab-pricedrop"></div>
    </div>
  `;
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
    s.innerHTML = `
      <div class="scp-loading">
        <div class="scp-scan-line"></div>
        <div class="scp-spinner">
          <div class="scp-spinner-ring"></div>
          <div class="scp-spinner-ring"></div>
          <div class="scp-spinner-ring"></div>
        </div>
        <div class="scp-loading-text">Analyzing market data...</div>
      </div>
    `;
  }
  if (p) p.innerHTML = "";
}

function setError(message) {
  const s = document.getElementById("scp-tab-scanner");
  if (s) {
    s.innerHTML = `
      <div class="scp-state-empty">
        <div class="scp-state-icon">⚠️</div>
        <div class="scp-state-title">Connection Error</div>
        <div class="scp-state-sub">${message || "Could not fetch comparison"}</div>
        <button class="scp-retry-btn" id="scp-retry">Retry Analysis</button>
      </div>
    `;
    const btn = document.getElementById("scp-retry");
    if(btn) btn.addEventListener("click", () => runComparison());
  }
}

function setNoMatch() {
  const s = document.getElementById("scp-tab-scanner");
  if (s) {
    s.innerHTML = `
      <div class="scp-state-empty">
        <div class="scp-state-icon">🔍</div>
        <div class="scp-state-title">No matches found</div>
        <div class="scp-state-sub">We couldn't find this product on other platforms yet.</div>
      </div>
    `;
  }
}

function setQueued(data) {
  const s = document.getElementById("scp-tab-scanner");
  if (s) {
    s.innerHTML = `
      <div class="scp-queued">
        <div class="scp-queued-icon">🕐</div>
        <div class="scp-queued-title">Tracking started</div>
        <div class="scp-queued-sub">Prices are being fetched from all platforms. Check back in a few moments.</div>
        <div class="scp-progress-bar">
          <div class="scp-progress-bar-fill"></div>
        </div>
      </div>
    `;
  }
}

function gaugeHTML(score, label) {
  return `
    <div class="scp-gauge-wrapper">
      <svg class="scp-gauge-svg" viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="scp-gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stop-color="#ef4444"/>
            <stop offset="40%"  stop-color="#f59e0b"/>
            <stop offset="65%"  stop-color="#84cc16"/>
            <stop offset="100%" stop-color="#10b981"/>
          </linearGradient>
          <linearGradient id="scp-needle-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stop-color="#f0f2f5"/>
            <stop offset="100%" stop-color="rgba(240,242,245,0.2)"/>
          </linearGradient>
          <filter id="scp-glow">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <path d="M 20 120 A 90 90 0 0 1 200 120" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="14" stroke-linecap="round"/>
        <path class="scp-gauge-arc" d="M 20 120 A 90 90 0 0 1 200 120" fill="none" stroke="url(#scp-gauge-grad)" stroke-width="14" stroke-linecap="round" stroke-dasharray="283" stroke-dashoffset="283"/>
        <g class="scp-needle" style="transform-origin: 110px 120px; transform: rotate(-90deg);">
          <line x1="110" y1="120" x2="110" y2="42" stroke="url(#scp-needle-grad)" stroke-width="2" stroke-linecap="round" filter="url(#scp-glow)"/>
          <circle cx="110" cy="120" r="5" fill="#f0f2f5" filter="url(#scp-glow)"/>
          <circle cx="110" cy="120" r="8" fill="none" stroke="rgba(240,242,245,0.15)" stroke-width="1"/>
        </g>
        <text class="scp-gauge-score" x="110" y="108" text-anchor="middle" dominant-baseline="auto" font-family="'Syne', sans-serif" font-size="36" font-weight="800" fill="#f0f2f5">0</text>
        <text x="110" y="122" text-anchor="middle" dominant-baseline="auto" font-family="'Inter', sans-serif" font-size="10" font-weight="400" fill="rgba(255,255,255,0.35)" letter-spacing="0.12em">${label.toUpperCase()}</text>
      </svg>
    </div>
  `;
}

function animateGauge(score) {
  const arc = document.querySelector('#scp-panel .scp-gauge-arc')
  if (!arc) return;
  const totalLength = 283
  const targetOffset = totalLength - (score / 100) * totalLength
  arc.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)'
  requestAnimationFrame(() => {
    arc.style.strokeDashoffset = targetOffset
  })

  const needle = document.querySelector('#scp-panel .scp-needle')
  const angle = -90 + (score / 100) * 180  // -90° (left) to +90° (right)
  needle.style.transition = 'transform 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s'
  requestAnimationFrame(() => {
    needle.style.transform = `rotate(${angle}deg)`
  })

  const scoreEl = document.querySelector('#scp-panel .scp-gauge-score')
  let current = 0
  const duration = 1200
  const start = performance.now()
  function countUp(now) {
    const elapsed = now - start
    const progress = Math.min(elapsed / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    current = Math.round(eased * score)
    scoreEl.textContent = current
    if (progress < 1) requestAnimationFrame(countUp)
  }
  requestAnimationFrame(countUp)
}

function animatePrice(el, targetValue) {
  const formatted = '₹' + targetValue.toLocaleString('en-IN')
  el.style.opacity = '0'
  el.style.transform = 'translateY(8px)'
  el.style.transition = 'opacity 0.3s, transform 0.3s'
  setTimeout(() => {
    el.textContent = formatted
    el.style.opacity = '1'
    el.style.transform = 'translateY(0)'
  }, 100)
}

function fmtINR(n){if(n==null)return"—";return"₹"+Number(n).toLocaleString("en-IN")}
function timeAgo(d){if(!d)return"";const s=Math.floor((Date.now()-new Date(d))/1000);
  if(s<60)return"just now";if(s<3600)return Math.floor(s/60)+"m ago";
  if(s<86400)return Math.floor(s/3600)+"h ago";return Math.floor(s/86400)+"d ago";}

function renderFound(data) {
  cachedData = data;
  renderDealScanner(data);
  renderPriceDrop(data);
  
  if (data.deal_score) {
    animateGauge(data.deal_score);
  }
  
  document.querySelectorAll('.scp-anim-price').forEach(el => {
    const p = parseFloat(el.dataset.price);
    if (!isNaN(p) && p > 0) animatePrice(el, p);
    else el.textContent = '—';
  });
}

function renderDealScanner(d) {
  const el = document.getElementById("scp-tab-scanner");
  if (!el) return;

  const badgeCls = d.deal_score >= 80 ? "scp-badge--epic" : d.deal_score >= 60 ? "scp-badge--good" : d.deal_score >= 40 ? "scp-badge--fair" : "scp-badge--over";
  const badgeEmoji = d.deal_score >= 80 ? "🏆" : d.deal_score >= 60 ? "👍" : d.deal_score >= 40 ? "⚖️" : "❌";
  const badgeText = d.deal_badge || "Fair Price";

  let h = `<div style="text-align:center"><div class="scp-deal-badge ${badgeCls}">${badgeEmoji} ${badgeText}</div></div>`;
  h += gaugeHTML(d.deal_score || 50, "Deal Score");

  // Score breakup
  if (d.deal_score_breakup && d.deal_score_breakup.length > 0) {
    h += `<div class="scp-section-label">Score Breakup</div><ul class="scp-breakup-list">`;
    for (let i = 0; i < d.deal_score_breakup.length; i++) {
      const b = d.deal_score_breakup[i];
      h += `
        <li class="scp-breakup-item" style="animation-delay: ${i * 0.06}s">
          <div class="scp-breakup-dot ${b.earned ? "scp-breakup-dot--earned" : "scp-breakup-dot--missed"}"></div>
          <span class="scp-breakup-label">${b.label}</span>
          <span class="scp-breakup-pts ${b.earned ? "scp-breakup-pts--earned" : "scp-breakup-pts--missed"}">${b.earned ? "+" : ""}${b.pts}</span>
        </li>
      `;
    }
    h += `</ul>`;
  }

  // Platform comparison
  h += `<div class="scp-section-label">Price Comparison</div><div class="scp-platform-list">`;
  const results = d.results || [];
  const currPagePrice = results.find(r => location.href.includes(r.url?.split("/")[2]))?.price;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const isBest = i === 0 && results.length > 1;
    const platKey = Object.keys(PLATFORMS).find(k => r.platform.toLowerCase().includes(k.split(".")[0])) || r.platform;
    const platInfo = PLATFORMS[platKey] || { name: r.platform, cls: "" };
    
    const dotColor = \`var(--scp-\${platInfo.cls}, var(--scp-indigo))\`;

    const conf = r.match_confidence != null ? r.match_confidence : 1;
    const confTag = conf >= 1 ? \`<span class="scp-platform-badge scp-badge--exact">Exact</span>\` : \`<span class="scp-platform-badge scp-badge--likely">Likely \${Math.round(conf * 100)}%</span>\`;
    const avail = r.availability === "in_stock" ? \`<span class="scp-platform-badge scp-badge--in-stock">In Stock</span>\` : (r.availability === "out_of_stock" ? \`<span class="scp-platform-badge scp-badge--oos">Out of Stock</span>\` : "");

    let saveHtml = "";
    if (currPagePrice && r.price < currPagePrice && currPagePrice !== r.price) {
      const saved = currPagePrice - r.price;
      const pct = ((saved / currPagePrice) * 100).toFixed(1);
      saveHtml = \`<div class="scp-platform-savings">Save \${fmtINR(saved)} (\${pct}%)</div>\`;
    }

    h += \`
      <a class="scp-platform-card \${isBest ? "scp-platform-card--best" : ""}" style="animation-delay: \${i * 0.08}s" href="\${r.url}" target="_blank">
        <div class="scp-platform-dot" style="color: \${dotColor}; background-color: \${dotColor}"></div>
        <div class="scp-platform-name">
          \${platInfo.name}
          <div class="scp-platform-meta">\${timeAgo(r.last_scraped_at)}</div>
        </div>
        <div>
          <div class="scp-platform-price">\${fmtINR(r.price)}</div>
          \${saveHtml}
          <div class="scp-platform-tags">
            \${isBest ? '<span class="scp-platform-badge scp-badge--best-price">BEST PRICE</span>' : ""}
            \${confTag}
            \${avail}
          </div>
        </div>
      </a>
    \`;
  }
  h += \`</div>\`;

  if (d.partial && results.length <= 1) {
    h += \`<div style="text-align:center;padding:8px;background:rgba(99,102,241,.1);border-radius:8px;font-size:12px;color:#818cf8">📡 More platforms being checked...</div>\`;
  }

  el.innerHTML = h;
}

function renderPriceDrop(d) {
  const el = document.getElementById("scp-tab-pricedrop");
  if (!el) return;
  const br = d.buy_recommendation || { score: 50, label: "Insufficient data", reason: "", score_1week: 50, score_1month: 50 };
  const recCls = br.score >= 75 ? "great" : br.score >= 50 ? "good" : br.score >= 25 ? "wait" : "bad";

  let h = gaugeHTML(br.score, "Buy Recommendation");
  h += \`<div class="scp-rec-label \${recCls}"><span>\${br.label}</span></div>\`;
  h += \`<div class="scp-rec-reason">\${br.reason}</div>\`;

  h += \`<div class="scp-timeframes">
    <button class="scp-tf-pill active" data-score="\${br.score}">2-3 Days</button>
    <button class="scp-tf-pill" data-score="\${br.score_1week}">1 Week</button>
    <button class="scp-tf-pill" data-score="\${br.score_1month}">1 Month</button>
  </div>\`;

  const ps = d.price_stats || {};
  h += \`<div class="scp-section-label">Price Statistics</div>\`;
  h += \`
    <div class="scp-stats-grid">
      <div class="scp-stat-card">
        <div class="scp-stat-label"><span class="scp-stat-arrow--up">↑</span> Highest</div>
        <div class="scp-stat-value scp-anim-price" data-price="\${ps.all_time_high || 0}">—</div>
      </div>
      <div class="scp-stat-card">
        <div class="scp-stat-label"><span class="scp-stat-arrow--mid">↕</span> Average</div>
        <div class="scp-stat-value scp-anim-price" data-price="\${ps.avg_price_90d || 0}">—</div>
      </div>
      <div class="scp-stat-card">
        <div class="scp-stat-label"><span class="scp-stat-arrow--down">↓</span> Lowest</div>
        <div class="scp-stat-value scp-anim-price" data-price="\${ps.all_time_low || 0}">—</div>
      </div>
      <div class="scp-stat-card scp-stat-card--bbd">
        <div class="scp-stat-label"><span class="scp-stat-arrow--mid">🏷</span> Sale Price</div>
        <div class="scp-stat-value scp-anim-price" data-price="\${ps.last_sale_price || 0}">—</div>
      </div>
    </div>
  \`;

  h += \`<div class="scp-section-label">Price History</div>\`;
  h += \`
    <div class="scp-chart-container">
      <div class="scp-chart-range-pills">
        <button class="scp-range-pill" data-range="30">1M</button>
        <button class="scp-range-pill" data-range="90">3M</button>
        <button class="scp-range-pill scp-range-pill--active" data-range="0">Max</button>
      </div>
      <canvas id="scp-chart"></canvas>
    </div>
  \`;

  const currentPrice = d.results?.length > 0 ? d.results[0].price : "";
  if (d.on_watchlist) {
    h += \`
      <div class="scp-alert-section">
        <div class="scp-alert-label">Price Alert</div>
        <button class="scp-alert-btn scp-alert-btn--watching" id="scp-watchlist-btn" data-pid="\${d.product_id}">✓ Watching</button>
      </div>
    \`;
  } else {
    h += \`
      <div class="scp-alert-section">
        <div class="scp-alert-label">Set Price Alert</div>
        <div class="scp-alert-row">
          <input class="scp-alert-input" id="scp-alert-price" type="number" value="\${currentPrice}" placeholder="Target price">
          <button class="scp-alert-btn" id="scp-watchlist-btn" data-pid="\${d.product_id}">Set Alert</button>
        </div>
      </div>
    \`;
  }

  el.innerHTML = h;

  setupTimeframePills();
  setupWatchlistBtn(d);
  setupChartRanges(d.price_history || []);
  loadChart(d.price_history || []);
}

function setupTimeframePills(){
  document.querySelectorAll(".scp-tf-pill").forEach(pill=>{
    pill.addEventListener("click",()=>{
      document.querySelectorAll(".scp-tf-pill").forEach(p=>p.classList.remove("active"));
      pill.classList.add("active");
      const score=parseInt(pill.dataset.score)||50;
      // Update gauge + label
      const wrap=document.querySelector("#scp-tab-pricedrop .scp-gauge-wrapper");
      if(wrap){
        wrap.outerHTML=gaugeHTML(score,"Buy Recommendation");
        animateGauge(score);
        
        const recLabel=document.querySelector("#scp-tab-pricedrop .scp-rec-label");
        if(recLabel){
          const lbl=score>=75?"It's a great time to buy":score>=50?"It's a good time to buy":score>=25?"Consider waiting":"Wait for a better price";
          const cls=score>=75?"great":score>=50?"good":score>=25?"wait":"bad";
          recLabel.className="scp-rec-label "+cls;
          recLabel.innerHTML=\`<span>\${lbl}</span>\`;
        }
      }
    });
  });
}

function setupWatchlistBtn(data){
  const btn=document.getElementById("scp-watchlist-btn");if(!btn)return;
  btn.addEventListener("click",async()=>{
    const pid=btn.dataset.pid;
    if(data.on_watchlist){
      const r=await msg({type:"REMOVE_WATCHLIST",product_id:pid});
      if(r&&r.success){data.on_watchlist=false;btn.textContent="Set Alert";btn.className="scp-alert-btn";}
    }else{
      const input=document.getElementById("scp-alert-price");
      const tp=input?parseFloat(input.value):null;
      const r=await msg({type:"ADD_WATCHLIST",payload:{product_id:pid,target_price:tp}});
      if(r&&r.success){data.on_watchlist=true;btn.textContent="✓ Watching";btn.className="scp-alert-btn scp-alert-btn--watching";}
    }
  });
}

let chartJsLoaded = false;
function loadChartJs() {
  return new Promise((resolve, reject) => {
    if (chartJsLoaded) { resolve(); return; }
    if (!isContextValid()) { reject(new Error('Extension context invalidated')); return; }
    try {
      const url = chrome.runtime.getURL("chart.min.js");
      const s = document.createElement("script"); s.src = url;
      s.onload = () => { chartJsLoaded = true; resolve(); };
      s.onerror = () => { reject(new Error("Chart.js load failed")); };
      document.head.appendChild(s);
    } catch (e) { reject(e); }
  });
}

function initPriceChart(historyData) {
  const canvas = document.getElementById('scp-chart');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 160)
  gradient.addColorStop(0,   'rgba(99, 102, 241, 0.25)')
  gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.08)')
  gradient.addColorStop(1,   'rgba(99, 102, 241, 0.00)')

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: historyData.map(d => {
        const dt = new Date(d.date);
        return dt.toLocaleDateString("en-IN", {day: "numeric", month: "short"});
      }),
      datasets: [{
        data: historyData.map(d => d.price),
        borderColor: '#6366f1',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#6366f1',
        pointHoverBorderColor: '#f0f2f5',
        pointHoverBorderWidth: 2,
        backgroundColor: gradient,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1200,
        easing: 'easeOutQuart',
      },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#131820',
          borderColor: 'rgba(255,255,255,0.10)',
          borderWidth: 1,
          titleColor: '#7c8a9e',
          bodyColor: '#f0f2f5',
          titleFont: { family: "'Inter', sans-serif", size: 10 },
          bodyFont: { family: "'DM Mono', monospace", size: 14, weight: '500' },
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => '₹' + item.raw.toLocaleString('en-IN'),
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#3d4a5c',
            font: { family: "'Inter', sans-serif", size: 10 },
            maxTicksLimit: 5,
            maxRotation: 0,
          }
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          border: { display: false },
          ticks: {
            color: '#3d4a5c',
            font: { family: "'DM Mono', monospace", size: 10 },
            callback: (v) => v >= 100000 ? '₹' + (v/100000).toFixed(1) + 'L' : '₹' + (v/1000).toFixed(0) + 'K',
            maxTicksLimit: 4,
          }
        }
      }
    }
  });
  return chart;
}

async function loadChart(history, rangeDays = 0) {
  try { await loadChartJs(); } catch { return; }
  let data = history;
  if (rangeDays > 0) {
    const cutoff = new Date(Date.now() - rangeDays * 86400000);
    data = history.filter(h => new Date(h.date) >= cutoff);
  }
  if (data.length === 0) return;

  if (chartInstance) { chartInstance.destroy(); }
  chartInstance = initPriceChart(data);
}

function setupChartRanges(history) {
  document.querySelectorAll(".scp-range-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".scp-range-pill").forEach(b => b.classList.remove("scp-range-pill--active"));
      btn.classList.add("scp-range-pill--active");
      loadChart(history, parseInt(btn.dataset.range) || 0);
    });
  });
}

"""

full_content = content[:start_idx] + new_content + content[end_idx:]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(full_content)

print("Replacement complete")
