/**
 * builder.js – Dashboard builder logic for SheetDash
 * Requires: parser.js, charts.js
 */

/* ─── State ──────────────────────────────────────────────── */
let sheetData   = null;   // { columns, rows, totalRows }
let widgets     = [];     // Widget[]
let editingId   = null;   // widget id being edited, or null
let modalType   = 'bar';
let modalSize   = 'half';
let modalPalette= 'indigo';

/* ─── Boot ───────────────────────────────────────────────── */
(function init() {
  // Load sheet data from sessionStorage
  const raw = sessionStorage.getItem('sheetData');
  if (!raw) {
    // No data – redirect back to upload page
    showToast('No data found. Please upload a spreadsheet first.', 'error');
    setTimeout(() => { window.location.href = 'index.html'; }, 1800);
    return;
  }

  sheetData = JSON.parse(raw);
  const name = sessionStorage.getItem('sheetName') || 'Untitled Sheet';

  // Update nav info
  document.getElementById('nav-sheet-name').textContent = name;
  document.getElementById('nav-row-count').textContent  = sheetData.totalRows.toLocaleString();

  // Populate sidebar columns
  renderSidebar();

  // Build palette picker
  buildPalettePicker();

  // Populate modal column selects
  populateColumnSelects();

  // Restore saved widgets from localStorage
  const saved = localStorage.getItem('sheetdash_widgets_' + btoa(name).slice(0, 20));
  if (saved) {
    try {
      widgets = JSON.parse(saved);
      widgets.forEach(renderWidget);
      toggleEmptyState();
    } catch (_) { /* ignore corrupt saves */ }
  }

  // Wire up events
  wireEvents();
})();

/* ─── Sidebar ────────────────────────────────────────────── */
function renderSidebar() {
  const container = document.getElementById('sidebar-cols');
  document.getElementById('sidebar-col-count').textContent = sheetData.columns.length;

  container.innerHTML = sheetData.columns.map(col => {
    const icon  = col.type === 'numeric' ? '#' : col.type === 'date' ? '⏱' : 'Aa';
    const label = col.type === 'numeric' ? 'num' : col.type === 'date' ? 'date' : 'text';
    return `
      <div class="col-item" title="${esc(col.name)}">
        <span class="col-type-badge ${col.type}">${icon}</span>
        <span class="col-name">${esc(col.name)}</span>
        <span class="col-type-label">${label}</span>
      </div>`;
  }).join('');
}

/* ─── Palette picker ─────────────────────────────────────── */
function buildPalettePicker() {
  const grid = document.getElementById('palette-grid');
  const palettes = Charts.getPalettes();
  grid.innerHTML = palettes.map(([name, color]) => `
    <button class="palette-btn ${name === 'indigo' ? 'active' : ''}"
            data-palette="${name}"
            title="${name}"
            style="background:transparent">
      <span class="palette-swatch" style="background:${color}"></span>
    </button>`).join('');

  grid.querySelectorAll('.palette-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      modalPalette = btn.dataset.palette;
    });
  });
}

/* ─── Column selects ─────────────────────────────────────── */
function populateColumnSelects() {
  const allCols     = sheetData.columns;
  const numericCols = allCols.filter(c => c.type === 'numeric');

  // X-axis: all columns
  const xSel = document.getElementById('x-col');
  xSel.innerHTML = allCols.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');

  // Y-axis: numeric columns preferred
  const ySel = document.getElementById('y-col');
  const yList = numericCols.length ? numericCols : allCols;
  ySel.innerHTML = yList.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');

  // KPI column: numeric preferred
  const kpiSel = document.getElementById('kpi-col');
  kpiSel.innerHTML = yList.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');

  // Table column checkboxes
  const tableDiv = document.getElementById('table-col-checks');
  tableDiv.innerHTML = allCols.map((c, i) => `
    <label style="display:flex;align-items:center;gap:5px;font-size:0.8375rem;cursor:pointer;
                  background:var(--bg);border:1.5px solid var(--border);border-radius:6px;
                  padding:4px 8px;user-select:none">
      <input type="checkbox" name="tcol" value="${esc(c.name)}" ${i < 5 ? 'checked' : ''} />
      ${esc(c.name)}
    </label>`).join('');
}

/* ─── Wire up events ─────────────────────────────────────── */
function wireEvents() {
  // Add widget buttons
  document.getElementById('btn-add-widget')  .addEventListener('click', openModal);
  document.getElementById('sidebar-add-btn') .addEventListener('click', openModal);

  // Widget type selector
  document.getElementById('type-grid').addEventListener('click', e => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    modalType = btn.dataset.type;
    updateModalConfig();
    autoFillTitle();
  });

  // Size selector
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      modalSize = btn.dataset.size;
    });
  });

  // Modal actions
  document.getElementById('modal-close')  .addEventListener('click', closeModal);
  document.getElementById('modal-cancel') .addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', confirmWidget);

  // Close on overlay click
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Save
  document.getElementById('btn-save').addEventListener('click', saveDashboard);

  // Print
  document.getElementById('btn-print').addEventListener('click', () => window.print());

  // Auto-fill title hint when selects change
  ['x-col','y-col','kpi-col','kpi-metric','aggregation'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', autoFillTitle);
  });
}

/* ─── Modal ─────────────────────────────────────────────── */
function openModal(widgetId = null) {
  editingId = widgetId;

  if (widgetId) {
    // Editing existing widget
    const w = widgets.find(w => w.id === widgetId);
    if (!w) return;
    document.getElementById('modal-title').textContent = 'Edit Widget';
    document.getElementById('modal-confirm').textContent = 'Save Changes';
    restoreModalState(w);
  } else {
    document.getElementById('modal-title').textContent = 'Add Widget';
    document.getElementById('modal-confirm').textContent = 'Add Widget';
    resetModal();
  }

  updateModalConfig();
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('widget-title').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingId = null;
}

function resetModal() {
  modalType    = 'bar';
  modalSize    = 'half';
  modalPalette = 'indigo';

  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-type="bar"]').classList.add('active');

  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-size="half"]').classList.add('active');

  document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-palette="indigo"]')?.classList.add('active');

  document.getElementById('widget-title').value = '';
  document.getElementById('aggregation').value   = 'sum';
  document.getElementById('kpi-metric').value    = 'sum';
  document.getElementById('table-limit').value   = '10';

  // Reset table checkboxes to first 5
  document.querySelectorAll('[name="tcol"]').forEach((cb, i) => cb.checked = i < 5);
  autoFillTitle();
}

function restoreModalState(w) {
  modalType    = w.type;
  modalSize    = w.size    || 'half';
  modalPalette = w.palette || 'indigo';

  document.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === w.type);
  });
  document.querySelectorAll('.size-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.size === modalSize);
  });
  document.querySelectorAll('.palette-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.palette === modalPalette);
  });

  document.getElementById('widget-title').value = w.title || '';

  if (['bar','line','pie','doughnut'].includes(w.type)) {
    document.getElementById('x-col').value      = w.xColumn || '';
    document.getElementById('y-col').value      = w.yColumn || '';
    document.getElementById('aggregation').value = w.aggregation || 'sum';
  }
  if (w.type === 'kpi') {
    document.getElementById('kpi-col').value    = w.column || '';
    document.getElementById('kpi-metric').value = w.metric || 'sum';
  }
  if (w.type === 'table') {
    const cols = w.columns || [];
    document.querySelectorAll('[name="tcol"]').forEach(cb => {
      cb.checked = cols.includes(cb.value);
    });
    document.getElementById('table-limit').value = String(w.limit || 10);
  }
}

function updateModalConfig() {
  const isChart   = ['bar','line','pie','doughnut'].includes(modalType);
  const isKPI     = modalType === 'kpi';
  const isTable   = modalType === 'table';

  document.getElementById('chart-config').classList.toggle('hidden', !isChart);
  document.getElementById('kpi-config')  .classList.toggle('hidden', !isKPI);
  document.getElementById('table-config').classList.toggle('hidden', !isTable);
  document.getElementById('palette-group').classList.toggle('hidden', isTable);

  // Update x-axis label for line charts
  if (modalType === 'line') {
    document.getElementById('x-col-label').textContent = 'Category / Date (X)';
  } else {
    document.getElementById('x-col-label').textContent = 'Category (X axis)';
  }
}

function autoFillTitle() {
  const titleEl = document.getElementById('widget-title');
  if (titleEl.value && editingId) return; // don't overwrite user input when editing

  const aggLabels = { sum:'Total', avg:'Average', count:'Count', min:'Min', max:'Max' };

  if (['bar','line','pie','doughnut'].includes(modalType)) {
    const x   = document.getElementById('x-col')?.value || '';
    const y   = document.getElementById('y-col')?.value || '';
    const agg = document.getElementById('aggregation')?.value || 'sum';
    if (x && y) titleEl.placeholder = `${aggLabels[agg]} ${y} by ${x}`;
  } else if (modalType === 'kpi') {
    const col = document.getElementById('kpi-col')?.value || '';
    const agg = document.getElementById('kpi-metric')?.value || 'sum';
    if (col) titleEl.placeholder = `${aggLabels[agg]} ${col}`;
  } else if (modalType === 'table') {
    titleEl.placeholder = 'Data Table';
  }
}

/* ─── Confirm / build widget ─────────────────────────────── */
function confirmWidget() {
  const titleInput = document.getElementById('widget-title');
  const title      = titleInput.value.trim() || titleInput.placeholder || 'Widget';

  let config = {
    id:      editingId || ('w-' + Date.now()),
    type:    modalType,
    title,
    size:    modalSize,
    palette: modalPalette,
  };

  if (['bar','line','pie','doughnut'].includes(modalType)) {
    config.xColumn     = document.getElementById('x-col').value;
    config.yColumn     = document.getElementById('y-col').value;
    config.aggregation = document.getElementById('aggregation').value;
    if (!config.xColumn || !config.yColumn) {
      showToast('Please select both category and value columns.', 'error');
      return;
    }
  } else if (modalType === 'kpi') {
    config.column = document.getElementById('kpi-col').value;
    config.metric = document.getElementById('kpi-metric').value;
    if (!config.column) { showToast('Please select a column for the KPI.', 'error'); return; }
  } else if (modalType === 'table') {
    config.columns = Array.from(document.querySelectorAll('[name="tcol"]:checked')).map(cb => cb.value);
    config.limit   = Number(document.getElementById('table-limit').value);
    if (!config.columns.length) { showToast('Please select at least one column.', 'error'); return; }
  }

  if (editingId) {
    // Replace existing widget
    const idx = widgets.findIndex(w => w.id === editingId);
    if (idx > -1) widgets[idx] = config;
    // Re-render that widget card
    const card = document.getElementById('card-' + editingId);
    if (card) card.remove();
    renderWidget(config);
  } else {
    widgets.push(config);
    renderWidget(config);
  }

  toggleEmptyState();
  closeModal();
  showToast(editingId ? 'Widget updated.' : 'Widget added!', 'success');
}

/* ─── Render a single widget ─────────────────────────────── */
function renderWidget(w) {
  const grid  = document.getElementById('dashboard-grid');
  const card  = document.createElement('div');
  card.className = `widget-card ${w.size === 'full' ? 'full-width' : ''} ${w.type === 'kpi' ? 'kpi-card' : ''}`;
  card.id = 'card-' + w.id;

  const typeLabels = { bar:'Bar Chart', line:'Line Chart', pie:'Pie Chart', doughnut:'Doughnut', kpi:'KPI Card', table:'Table' };

  card.innerHTML = `
    <div class="widget-header">
      <div>
        <div class="widget-title">${esc(w.title)}</div>
        <div class="widget-subtitle">${typeLabels[w.type] || ''}</div>
      </div>
      <div class="widget-actions">
        <button class="btn btn-ghost btn-icon" title="Edit widget"
                onclick="openModal('${w.id}')">✏️</button>
        <button class="btn btn-ghost btn-icon" title="Expand to full width"
                onclick="toggleSize('${w.id}')">⬌</button>
        <button class="btn btn-ghost btn-icon" title="Remove widget"
                onclick="removeWidget('${w.id}')">🗑</button>
      </div>
    </div>
    <div class="widget-body" id="body-${w.id}">
      ${w.type === 'table' || w.type === 'kpi'
        ? ''
        : `<div class="widget-chart-wrap"><canvas id="canvas-${w.id}"></canvas></div>`}
    </div>`;

  grid.appendChild(card);

  // Render chart / KPI / table
  requestAnimationFrame(() => {
    try {
      drawWidget(w);
    } catch (err) {
      document.getElementById('body-' + w.id).innerHTML =
        `<p style="color:var(--danger);padding:1rem;font-size:0.875rem;">⚠️ ${esc(err.message)}</p>`;
    }
  });
}

function drawWidget(w) {
  const { rows } = sheetData;

  if (['bar','line','pie','doughnut'].includes(w.type)) {
    const { labels, values } = Parser.aggregate(rows, w.xColumn, w.yColumn, w.aggregation);
    const cfg = { palette: w.palette, yLabel: w.yColumn };

    if      (w.type === 'bar')      Charts.renderBar    (`canvas-${w.id}`, labels, values, cfg);
    else if (w.type === 'line')     Charts.renderLine   (`canvas-${w.id}`, labels, values, cfg);
    else if (w.type === 'pie')      Charts.renderPie    (`canvas-${w.id}`, labels, values, cfg);
    else if (w.type === 'doughnut') Charts.renderPie    (`canvas-${w.id}`, labels, values, { ...cfg, doughnut: true });

  } else if (w.type === 'kpi') {
    const kpi = Parser.computeKPI(rows, w.column, w.metric);
    const aggLabel = { sum:'Total', avg:'Average', count:'Count', min:'Min', max:'Max' }[w.metric] || '';
    Charts.renderKPI(`body-${w.id}`, kpi.value, {
      palette:  w.palette,
      label:    `${aggLabel} ${w.column}`,
      subtitle: `${kpi.count.toLocaleString()} data points`,
    });

  } else if (w.type === 'table') {
    Charts.renderTable(`body-${w.id}`, rows, w.columns, { limit: w.limit });
  }
}

/* ─── Widget actions ─────────────────────────────────────── */
function removeWidget(id) {
  const card = document.getElementById('card-' + id);
  if (card) {
    card.style.transition = 'opacity 0.2s, transform 0.2s';
    card.style.opacity    = '0';
    card.style.transform  = 'scale(0.96)';
    setTimeout(() => { card.remove(); toggleEmptyState(); }, 210);
  }
  widgets = widgets.filter(w => w.id !== id);
  showToast('Widget removed.');
}

function toggleSize(id) {
  const w    = widgets.find(w => w.id === id);
  const card = document.getElementById('card-' + id);
  if (!w || !card) return;

  w.size = w.size === 'full' ? 'half' : 'full';
  card.classList.toggle('full-width', w.size === 'full');

  // Resize chart if applicable
  if (['bar','line','pie','doughnut'].includes(w.type)) {
    setTimeout(() => {
      const instance = Charts._instances[`canvas-${id}`];
      if (instance) instance.resize();
    }, 50);
  }
}

/* ─── Empty state ────────────────────────────────────────── */
function toggleEmptyState() {
  const empty = document.getElementById('empty-state');
  if (empty) empty.style.display = widgets.length ? 'none' : '';
}

/* ─── Save / Load ────────────────────────────────────────── */
function saveDashboard() {
  const name = sessionStorage.getItem('sheetName') || 'Untitled';
  const key  = 'sheetdash_widgets_' + btoa(name).slice(0, 20);
  localStorage.setItem(key, JSON.stringify(widgets));
  showToast('Dashboard saved!', 'success');
}

/* ─── Toast ─────────────────────────────────────────────── */
function showToast(msg, type = '') {
  const tc = document.getElementById('toast-container');
  const t  = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  tc.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ─── HTML escape helper ─────────────────────────────────── */
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
