/**
 * charts.js – Chart.js rendering wrappers for SheetDash
 * Dependency: Chart.js v4
 */

const PALETTES = {
  indigo:  ['#4F46E5','#6366F1','#818CF8','#A5B4FC','#C7D2FE','#E0E7FF'],
  violet:  ['#7C3AED','#8B5CF6','#A78BFA','#C4B5FD','#DDD6FE','#EDE9FE'],
  emerald: ['#059669','#10B981','#34D399','#6EE7B7','#A7F3D0','#D1FAE5'],
  amber:   ['#B45309','#D97706','#F59E0B','#FCD34D','#FDE68A','#FEF3C7'],
  rose:    ['#BE123C','#E11D48','#F43F5E','#FB7185','#FDA4AF','#FECDD3'],
  multi:   ['#4F46E5','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#84CC16','#F97316','#EC4899','#14B8A6'],
};

const PALETTE_COLORS = {
  indigo:  '#4F46E5',
  violet:  '#7C3AED',
  emerald: '#059669',
  amber:   '#D97706',
  rose:    '#E11D48',
  multi:   '#4F46E5',
};

const Charts = {
  _instances: {},

  /* Destroy a previous Chart.js instance on the same canvas */
  _destroy(id) {
    if (this._instances[id]) {
      this._instances[id].destroy();
      delete this._instances[id];
    }
  },

  _colors(palette, count) {
    const list = PALETTES[palette] || PALETTES.multi;
    return Array.from({ length: count }, (_, i) => list[i % list.length]);
  },

  _baseOptions(yFormatter = null) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: yFormatter
            ? { label: ctx => ` ${yFormatter(ctx.raw)}` }
            : {},
        },
      },
    };
  },

  /* ── Bar Chart ──────────────────────────────────────────── */
  renderBar(canvasId, labels, values, cfg = {}) {
    this._destroy(canvasId);
    const ctx    = document.getElementById(canvasId).getContext('2d');
    const colors = this._colors(cfg.palette || 'indigo', labels.length);
    const fmt    = v => Parser.formatNumber(v);

    this._instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: cfg.yLabel || 'Value',
          data: values,
          backgroundColor: colors.map(c => c + 'CC'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        ...this._baseOptions(fmt),
        scales: {
          y: {
            beginAtZero: true,
            grid:   { color: '#F1F5F9' },
            border: { display: false },
            ticks:  { color: '#64748B', font: { size: 11 }, callback: fmt },
          },
          x: {
            grid:   { display: false },
            border: { display: false },
            ticks:  { color: '#64748B', font: { size: 11 }, maxRotation: 40 },
          },
        },
      },
    });
  },

  /* ── Line Chart ─────────────────────────────────────────── */
  renderLine(canvasId, labels, values, cfg = {}) {
    this._destroy(canvasId);
    const ctx   = document.getElementById(canvasId).getContext('2d');
    const color = (PALETTES[cfg.palette] || PALETTES.indigo)[0];
    const fmt   = v => Parser.formatNumber(v);

    this._instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: cfg.yLabel || 'Value',
          data: values,
          borderColor: color,
          backgroundColor: color + '22',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: color,
          pointRadius: 4,
          pointHoverRadius: 7,
        }],
      },
      options: {
        ...this._baseOptions(fmt),
        scales: {
          y: {
            grid:   { color: '#F1F5F9' },
            border: { display: false },
            ticks:  { color: '#64748B', font: { size: 11 }, callback: fmt },
          },
          x: {
            grid:   { display: false },
            border: { display: false },
            ticks:  { color: '#64748B', font: { size: 11 }, maxRotation: 40 },
          },
        },
      },
    });
  },

  /* ── Pie / Doughnut ─────────────────────────────────────── */
  renderPie(canvasId, labels, values, cfg = {}) {
    this._destroy(canvasId);
    const ctx    = document.getElementById(canvasId).getContext('2d');
    const colors = this._colors(cfg.palette || 'multi', labels.length);

    this._instances[canvasId] = new Chart(ctx, {
      type: cfg.doughnut ? 'doughnut' : 'pie',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors.map(c => c + 'DD'),
          borderColor: '#fff',
          borderWidth: 2,
          hoverOffset: 8,
        }],
      },
      options: {
        ...this._baseOptions(),
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { padding: 14, font: { size: 11 }, color: '#64748B', boxWidth: 12, boxHeight: 12 },
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = total ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                return ` ${Parser.formatNumber(ctx.raw)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  },

  /* ── KPI Card ───────────────────────────────────────────── */
  renderKPI(containerId, value, cfg = {}) {
    const el    = document.getElementById(containerId);
    const color = PALETTE_COLORS[cfg.palette] || PALETTE_COLORS.indigo;

    el.innerHTML = `
      <div class="kpi-display" style="--kpi-color:${color}">
        <div class="kpi-value">${Parser.formatNumber(value)}</div>
        <div class="kpi-label">${cfg.label || 'Total'}</div>
        ${cfg.subtitle ? `<div class="kpi-subtitle">${cfg.subtitle}</div>` : ''}
      </div>`;
  },

  /* ── Data Table ─────────────────────────────────────────── */
  renderTable(containerId, rows, columns, cfg = {}) {
    const el    = document.getElementById(containerId);
    const limit = Number(cfg.limit) || 10;
    const shown = rows.slice(0, limit);

    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const thead = `<thead><tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${shown.map(row =>
      `<tr>${columns.map(c => `<td>${esc(row[c])}</td>`).join('')}</tr>`
    ).join('')}</tbody>`;

    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">${thead}${tbody}</table>
        ${rows.length > limit
          ? `<div class="table-more">Showing ${limit} of ${rows.length} rows</div>`
          : ''}
      </div>`;
  },

  /* ── Expose palette info for the UI ─────────────────────── */
  getPalettes() { return Object.entries(PALETTE_COLORS); },
};
