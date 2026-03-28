/* ─── dashboard.js – Summary cards + Chart generation ───────────────────── */

'use strict';

// Chart.js defaults
Chart.defaults.color           = '#94a3b8';
Chart.defaults.borderColor     = '#2a3148';
Chart.defaults.font.family     = "'Inter','Segoe UI',system-ui,sans-serif";
Chart.defaults.font.size       = 12;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding  = 16;

// Color palette
const PALETTE = [
  '#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b',
  '#ef4444','#ec4899','#14b8a6','#f97316','#84cc16',
];

function alpha(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Entry point (called from app.js after data is ready) ──────────────────
function buildDashboard() {
  buildSummaryCards();
  buildCharts();
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY CARDS
// ─────────────────────────────────────────────────────────────────────────────
function buildSummaryCards() {
  const grid = document.getElementById('summaryGrid');
  grid.innerHTML = '';

  const { headers, colTypes, colStats, raw } = window.appState;

  // Total rows card
  grid.appendChild(makeCard({
    label: 'Total Rows',
    value: raw.length.toLocaleString(),
    sub: `${headers.length} columns`,
    color: '#6366f1',
  }));

  // Per-column cards
  headers.forEach(col => {
    const type  = colTypes[col];
    const stats = colStats[col];

    const colorMap = { number: '#06b6d4', date: '#f59e0b', category: '#10b981', text: '#94a3b8' };
    const color = colorMap[type] || '#94a3b8';

    let value, sub;

    if (type === 'number') {
      value = fmtNum(stats.mean);
      sub   = `min ${fmtNum(stats.min)} · max ${fmtNum(stats.max)}`;
    } else if (type === 'date') {
      value = stats.count.toLocaleString();
      sub   = 'date values';
    } else if (type === 'category') {
      value = stats.unique.toLocaleString();
      sub   = `unique · top: "${stats.topValues[0]?.[0] ?? '—'}"`;
    } else {
      value = stats.count.toLocaleString();
      sub   = `${stats.unique || '?'} unique values`;
    }

    const missing = stats.missing > 0 ? ` · ${stats.missing} missing` : '';
    grid.appendChild(makeCard({ label: col, value, sub: sub + missing, color, type }));
  });
}

function makeCard({ label, value, sub, color, type }) {
  const div = document.createElement('div');
  div.className = 'summary-card';
  div.innerHTML = `
    <div class="summary-card-label">
      <span class="type-dot" style="background:${color}"></span>
      ${escHtml(label)}
    </div>
    <div class="summary-card-value" style="color:${color}">${escHtml(String(value))}</div>
    <div class="summary-card-sub">${escHtml(String(sub))}</div>
  `;
  return div;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARTS
// ─────────────────────────────────────────────────────────────────────────────
function buildCharts() {
  const grid = document.getElementById('chartsGrid');
  grid.innerHTML = '';

  // Destroy any existing Chart.js instances to free memory
  Chart.helpers.each(Chart.instances, c => c.destroy());

  const { headers, colTypes, colStats, raw } = window.appState;

  const numCols  = headers.filter(h => colTypes[h] === 'number');
  const catCols  = headers.filter(h => colTypes[h] === 'category');
  const dateCols = headers.filter(h => colTypes[h] === 'date');

  let chartsBuilt = 0;

  // 1. Number column → histogram / distribution
  numCols.forEach((col, i) => {
    if (chartsBuilt >= 10) return;
    const card = createChartCard(col, 'Distribution', 'histogram');
    grid.appendChild(card);
    drawHistogram(card.querySelector('canvas'), col, colStats[col], PALETTE[i % PALETTE.length]);
    chartsBuilt++;
  });

  // 2. Category column → bar or pie
  catCols.forEach((col, i) => {
    if (chartsBuilt >= 10) return;
    const stats  = colStats[col];
    const unique = stats.unique;
    const type   = unique <= 6 ? 'pie' : 'bar';
    const card   = createChartCard(col, `Top ${Math.min(10, unique)} values`, type);
    grid.appendChild(card);
    if (type === 'pie') drawPie(card.querySelector('canvas'), col, stats);
    else                drawBar(card.querySelector('canvas'), col, stats, PALETTE[i % PALETTE.length]);
    chartsBuilt++;
  });

  // 3. Date + first numeric → line chart
  if (dateCols.length > 0 && numCols.length > 0) {
    const dateCol = dateCols[0];
    const numCol  = numCols[0];
    if (chartsBuilt < 10) {
      const card = createChartCard(`${numCol} over ${dateCol}`, 'Time Series', 'line');
      card.classList.add('wide');
      grid.appendChild(card);
      drawLine(card.querySelector('canvas'), dateCol, numCol, raw);
      chartsBuilt++;
    }
  }

  // 4. Scatter: first two numeric cols
  if (numCols.length >= 2 && chartsBuilt < 10) {
    const [xCol, yCol] = numCols;
    const card = createChartCard(`${xCol} vs ${yCol}`, 'Scatter', 'scatter');
    grid.appendChild(card);
    drawScatter(card.querySelector('canvas'), xCol, yCol, raw);
    chartsBuilt++;
  }

  // 5. Numeric totals comparison (if 2+ numeric cols)
  if (numCols.length >= 2 && chartsBuilt < 10) {
    const card = createChartCard('Column Totals', 'Numeric columns comparison', 'bar');
    grid.appendChild(card);
    drawColumnTotals(card.querySelector('canvas'), numCols, colStats);
    chartsBuilt++;
  }

  if (chartsBuilt === 0) {
    grid.innerHTML = '<p style="color:var(--text3);padding:24px">No numeric or categorical columns detected for charting.</p>';
  }
}

// ── Chart card scaffold ────────────────────────────────────────────────────
function createChartCard(title, subtitle, type) {
  const card = document.createElement('div');
  card.className = 'chart-card';
  card.innerHTML = `
    <div class="chart-card-header">
      <div>
        <div class="chart-card-title">${escHtml(title)}</div>
        <div class="chart-card-subtitle">${escHtml(subtitle)}</div>
      </div>
      <span class="chart-type-badge">${escHtml(type)}</span>
    </div>
    <div class="chart-canvas-wrap">
      <canvas></canvas>
    </div>
  `;
  return card;
}

// ── Histogram ──────────────────────────────────────────────────────────────
function drawHistogram(canvas, col, stats, color) {
  const nums = stats.nums;
  if (!nums || nums.length === 0) return;

  const bins = 10;
  const min  = stats.min;
  const max  = stats.max;
  const step = (max - min) / bins || 1;

  const counts = Array(bins).fill(0);
  nums.forEach(n => {
    let idx = Math.floor((n - min) / step);
    if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  });

  const labels = counts.map((_, i) => {
    const lo = min + i * step;
    const hi = lo + step;
    return `${fmtNum(lo)}–${fmtNum(hi)}`;
  });

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: col,
        data: counts,
        backgroundColor: alpha(color, 0.7),
        borderColor: color,
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: chartOptions({ yLabel: 'Count', xLabel: 'Range', legend: false })
  });
}

// ── Bar chart (category) ───────────────────────────────────────────────────
function drawBar(canvas, col, stats, color) {
  const top    = stats.topValues.slice(0, 10);
  const labels = top.map(([k]) => k.length > 20 ? k.slice(0, 18) + '…' : k);
  const data   = top.map(([, v]) => v);

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Count',
        data,
        backgroundColor: alpha(color, 0.7),
        borderColor: color,
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: chartOptions({ yLabel: 'Count', legend: false, horizontal: false })
  });
}

// ── Pie / Donut chart ──────────────────────────────────────────────────────
function drawPie(canvas, col, stats) {
  const top    = stats.topValues.slice(0, 6);
  const labels = top.map(([k]) => k);
  const data   = top.map(([, v]) => v);
  const colors = PALETTE.slice(0, labels.length);

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => alpha(c, 0.8)),
        borderColor: colors,
        borderWidth: 2,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, padding: 12 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${((ctx.parsed / data.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)`
          }
        }
      }
    }
  });
}

// ── Line chart (time series) ───────────────────────────────────────────────
function drawLine(canvas, dateCol, numCol, raw) {
  // Sort by date, sample if large
  const pairs = raw
    .map(r => ({ d: new Date(r[dateCol]), v: parseFloat(String(r[numCol]).replace(/,/g, '')) }))
    .filter(p => !isNaN(p.d) && !isNaN(p.v))
    .sort((a, b) => a.d - b.d);

  const sampled = sampleArray(pairs, 100);
  const labels  = sampled.map(p => p.d.toLocaleDateString());
  const data    = sampled.map(p => p.v);
  const color   = PALETTE[0];

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: numCol,
        data,
        borderColor: color,
        backgroundColor: alpha(color, 0.1),
        fill: true,
        tension: 0.3,
        pointRadius: sampled.length > 50 ? 0 : 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      }]
    },
    options: chartOptions({ yLabel: numCol, legend: false })
  });
}

// ── Scatter chart ──────────────────────────────────────────────────────────
function drawScatter(canvas, xCol, yCol, raw) {
  const points = raw
    .map(r => ({
      x: parseFloat(String(r[xCol]).replace(/,/g, '')),
      y: parseFloat(String(r[yCol]).replace(/,/g, '')),
    }))
    .filter(p => !isNaN(p.x) && !isNaN(p.y));

  const sampled = sampleArray(points, 300);
  const color   = PALETTE[2];

  new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [{
        label: `${xCol} × ${yCol}`,
        data: sampled,
        backgroundColor: alpha(color, 0.5),
        pointRadius: 4,
        pointHoverRadius: 6,
      }]
    },
    options: chartOptions({ xLabel: xCol, yLabel: yCol, legend: false })
  });
}

// ── Column totals bar ──────────────────────────────────────────────────────
function drawColumnTotals(canvas, numCols, colStats) {
  const labels = numCols;
  const data   = numCols.map(col => colStats[col].sum ?? 0);
  const colors = numCols.map((_, i) => PALETTE[i % PALETTE.length]);

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels.map(l => l.length > 16 ? l.slice(0, 14) + '…' : l),
      datasets: [{
        label: 'Sum',
        data,
        backgroundColor: colors.map(c => alpha(c, 0.7)),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: chartOptions({ yLabel: 'Total', legend: false })
  });
}

// ── Shared chart options ───────────────────────────────────────────────────
function chartOptions({ xLabel = '', yLabel = '', legend = true, horizontal = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: {
      legend: { display: legend },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      x: {
        grid: { color: 'rgba(42,49,72,.6)' },
        ticks: { maxRotation: 35, maxTicksLimit: 10 },
        title: xLabel ? { display: true, text: xLabel, color: '#64748b' } : { display: false }
      },
      y: {
        grid: { color: 'rgba(42,49,72,.6)' },
        ticks: { maxTicksLimit: 6 },
        title: yLabel ? { display: true, text: yLabel, color: '#64748b' } : { display: false }
      }
    }
  };
}

// ── Utility: sample an array evenly ───────────────────────────────────────
function sampleArray(arr, max) {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  return Array.from({ length: max }, (_, i) => arr[Math.floor(i * step)]);
}

// Expose for app.js
window.buildDashboard = buildDashboard;
