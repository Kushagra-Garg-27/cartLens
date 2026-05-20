/* ═══════════════════════════════════════════════════
   SmartCompare Pro — Panel Interactions & Data
   Mega Spec Aligned Prototype
   ═══════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Store Data (Tier 1/2/3) ──────────────────────
  const STORES = [
    { name: 'Amazon', price: 64999, conf: 1, fresh: '15m ago', freshCls: 'live', stock: 'in', tier: 1, color: '#FF9900', logo: 'A', deals: ['BEST DEAL','LOWEST TODAY'] },
    { name: 'Flipkart', price: 66499, conf: 1, fresh: '1h ago', freshCls: 'fresh', stock: 'in', tier: 1, color: '#2874F0', logo: 'F', deals: [] },
    { name: 'Croma', price: 67999, conf: 0.92, fresh: '3h ago', freshCls: 'fresh', stock: 'in', tier: 2, color: '#65AC2A', logo: 'C', deals: [] },
    { name: 'Reliance Digital', price: 65999, conf: 0.88, fresh: '6h ago', freshCls: 'fresh', stock: 'in', tier: 2, color: '#1B3A8E', logo: 'R', deals: ['PRICE DROP'] },
    { name: 'Apple India', price: 69900, conf: 1, fresh: '2d ago', freshCls: 'stale', stock: 'in', tier: 3, d2c: true, color: '#555', logo: '🍎', deals: [] },
    { name: 'Vijay Sales', price: 66499, conf: 0.85, fresh: '12h ago', freshCls: 'fresh', stock: 'in', tier: 2, color: '#E21F26', logo: 'VS', deals: [] },
  ];

  const INSIGHTS = {
    highest: { value: 79990, icon: '📈' },
    lowest: { value: 61999, icon: '📉' },
    current: { value: 64999, icon: '📊' },
    average: { value: 67450, icon: '📋' },
  };

  const currentPrice = 64999;

  // ── Render Compare Cards ───────────────────────
  function renderCompareCards() {
    const list = document.getElementById('scCompareList');
    if (!list) return;
    list.innerHTML = '';

    STORES.forEach((s, i) => {
      const card = document.createElement('a');
      card.href = '#';
      card.className = 'sc-compare-card' + (s.deals.includes('BEST DEAL') ? ' best' : '');
      card.style.animationDelay = (i * 0.06) + 's';

      const confBadge = s.conf >= 1
        ? '<span class="sc-conf-badge exact">Exact</span>'
        : '<span class="sc-conf-badge likely">Likely ' + (s.conf * 100 | 0) + '%</span>';
      const freshBadge = '<span class="sc-fresh-badge ' + s.freshCls + '">' + s.fresh + '</span>';
      const stockBadge = s.stock === 'in'
        ? '<span class="sc-stock-badge in">In Stock</span>' : '';
      const d2cBadge = s.d2c
        ? '<span class="sc-d2c-badge">Official Store</span>' : '';
      const dealTags = s.deals.map(t =>
        '<span class="sc-deal-tag ' + t.toLowerCase().replace(/\s/g, '-') + '">' + t + '</span>'
      ).join('');

      let saveHtml = '';
      if (s.price < currentPrice) {
        const saved = currentPrice - s.price;
        const pct = ((saved / currentPrice) * 100).toFixed(1);
        saveHtml = '<div class="sc-savings">Save ₹' + saved.toLocaleString('en-IN') + ' (' + pct + '%)</div>';
      }

      card.innerHTML = `
        <div class="sc-store-logo" style="background:${s.color}">${s.logo}</div>
        <div class="sc-store-info">
          <div class="sc-store-name">${s.name}</div>
          <div class="sc-store-meta">${confBadge}${freshBadge}${stockBadge}${d2cBadge}</div>
          <div class="sc-deal-tags">${dealTags}</div>
        </div>
        <div class="sc-price-col">
          <div class="sc-price-main">₹${s.price.toLocaleString('en-IN')}</div>
          ${saveHtml}
          ${s.deals.includes('BEST DEAL') ? '<div class="sc-best-pill">Best Price</div>' : ''}
        </div>
        <svg class="sc-compare-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      `;
      list.appendChild(card);
    });
  }

  // ── Render Insights ────────────────────────────
  function renderInsights() {
    const grid = document.getElementById('scInsightsGrid');
    if (!grid) return;
    grid.innerHTML = `
      <div class="sc-insight-card high" style="animation-delay:0.15s">
        <div class="sc-insight-icon">${INSIGHTS.highest.icon}</div>
        <div class="sc-insight-label">Highest</div>
        <div class="sc-insight-value">₹${INSIGHTS.highest.value.toLocaleString('en-IN')}</div>
      </div>
      <div class="sc-insight-card low" style="animation-delay:0.2s">
        <div class="sc-insight-icon">${INSIGHTS.lowest.icon}</div>
        <div class="sc-insight-label">Lowest</div>
        <div class="sc-insight-value">₹${INSIGHTS.lowest.value.toLocaleString('en-IN')}</div>
      </div>
      <div class="sc-insight-card current" style="animation-delay:0.25s">
        <div class="sc-insight-icon">${INSIGHTS.current.icon}</div>
        <div class="sc-insight-label">Current</div>
        <div class="sc-insight-value">₹${INSIGHTS.current.value.toLocaleString('en-IN')}</div>
      </div>
      <div class="sc-insight-card avg" style="animation-delay:0.3s">
        <div class="sc-insight-icon">${INSIGHTS.average.icon}</div>
        <div class="sc-insight-label">Average</div>
        <div class="sc-insight-value">₹${INSIGHTS.average.value.toLocaleString('en-IN')}</div>
      </div>
    `;

    // Update price note
    const note = document.getElementById('scPriceNote');
    if (note) {
      const diff = currentPrice - INSIGHTS.lowest.value;
      if (diff <= 0) {
        note.innerHTML = '<span class="sc-price-position at-low">🎯 At the lowest price!</span>';
      } else {
        note.innerHTML = '<span class="sc-price-position above-low">You\'re ₹' + diff.toLocaleString('en-IN') + ' above the lowest</span>';
      }
    }

    // Add intelligence row after insights
    const section = grid.closest('.sc-section');
    if (section && !section.querySelector('.sc-intel-row')) {
      const intelRow = document.createElement('div');
      intelRow.className = 'sc-intel-row';
      intelRow.innerHTML = `
        <div class="sc-intel-item"><span class="sc-intel-label">Volatility</span><span class="sc-intel-value">📊 Low</span></div>
        <div class="sc-intel-item"><span class="sc-intel-label">30d Trend</span><span class="sc-intel-value falling">↓ 3.2%</span></div>
      `;
      const aiRec = section.querySelector('.sc-ai-rec');
      if (aiRec) section.insertBefore(intelRow, aiRec);
    }
  }

  // ── Build Chart ────────────────────────────────
  function buildChart() {
    const ctx = document.getElementById('scChart');
    if (!ctx || typeof Chart === 'undefined') return;

    const labels = ['May \'24','Jul \'24','Sep \'24','Nov \'24','Jan \'25','Mar \'25','May \'25'];
    const prices = [69990, 74990, 64999, 79990, 67999, 61999, 64999];

    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Price',
          data: prices,
          borderColor: '#7c5cfc',
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return 'rgba(124,92,252,0.1)';
            const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            grad.addColorStop(0, 'rgba(124,92,252,0.25)');
            grad.addColorStop(1, 'rgba(124,92,252,0.01)');
            return grad;
          },
          fill: true,
          tension: 0.4,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#7c5cfc',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointHoverRadius: 7,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(26,26,46,0.95)',
            titleColor: '#fff',
            bodyColor: '#c4c6db',
            borderColor: 'rgba(124,92,252,0.3)',
            borderWidth: 1,
            cornerRadius: 10,
            padding: 12,
            displayColors: false,
            callbacks: { label: (c) => '₹' + c.parsed.y.toLocaleString('en-IN') },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
            ticks: { color: '#9b9dba', font: { family: 'Inter', size: 10 }, maxRotation: 0 },
            border: { display: false },
          },
          y: {
            grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
            ticks: {
              color: '#9b9dba', font: { family: 'Inter', size: 10 },
              callback: (v) => v >= 100000 ? '₹' + (v / 100000).toFixed(1) + 'L' : '₹' + (v / 1000).toFixed(0) + 'K',
            },
            border: { display: false },
          },
        },
        animation: { duration: 1200, easing: 'easeOutQuart' },
      },
    });

    // Add chart stats row
    const chartCard = ctx.closest('.sc-chart-card');
    if (chartCard && !chartCard.querySelector('.sc-chart-stats')) {
      const statsRow = document.createElement('div');
      statsRow.className = 'sc-chart-stats';
      statsRow.innerHTML = `
        <div class="sc-chart-stat"><span class="sc-chart-stat-label">Average</span><span class="sc-chart-stat-value">₹67,450</span></div>
        <div class="sc-chart-stat"><span class="sc-chart-stat-label">Volatility</span><span class="sc-chart-stat-value">Low</span></div>
        <div class="sc-chart-stat"><span class="sc-chart-stat-label">30d Trend</span><span class="sc-chart-stat-value falling">↓ 3.2%</span></div>
      `;
      chartCard.appendChild(statsRow);
    }
  }

  // ── Toggle Switches ────────────────────────────
  document.querySelectorAll('.sc-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => toggle.classList.toggle('active'));
  });

  // ── Chart Filter Pills ─────────────────────────
  document.querySelectorAll('.sc-chart-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.sc-chart-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  // ── Bottom Nav ─────────────────────────────────
  document.querySelectorAll('.sc-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sc-nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // ── Panel Open/Close ───────────────────────────
  const panel = document.getElementById('scPanel');
  const fab = document.getElementById('scFab');
  const backdrop = document.getElementById('scBackdrop');
  const closeBtn = document.getElementById('scClose');

  function closePanel() {
    if (panel) panel.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    if (fab) fab.style.display = 'flex';
  }
  function openPanel() {
    if (panel) panel.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
    if (fab) fab.style.display = 'none';
  }

  if (closeBtn) closeBtn.addEventListener('click', closePanel);
  if (fab) fab.addEventListener('click', openPanel);
  if (backdrop) backdrop.addEventListener('click', closePanel);

  // ── Set Alert Button ───────────────────────────
  const alertBtn = document.getElementById('scSetAlert');
  if (alertBtn) {
    alertBtn.addEventListener('click', () => {
      alertBtn.textContent = '✓ Watching';
      alertBtn.style.background = 'var(--sc-green)';
      alertBtn.style.boxShadow = '0 4px 14px rgba(34,197,94,0.3)';
      setTimeout(() => {
        alertBtn.textContent = 'Set Alert';
        alertBtn.style.background = '';
        alertBtn.style.boxShadow = '';
      }, 2500);
    });
  }

  // ── Init ───────────────────────────────────────
  renderCompareCards();
  renderInsights();
  setTimeout(buildChart, 300);
})();
