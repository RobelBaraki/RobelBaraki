/* ─── app.js – File handling, parsing, column type detection ─────────────── */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  raw: [],          // array of row objects (header → value)
  headers: [],      // column names in order
  colTypes: {},     // colName → 'number' | 'date' | 'category' | 'text'
  colStats: {},     // colName → stats object
  fileName: '',
  filteredRows: [], // current filtered view for the table
  sortCol: null,
  sortDir: 'asc',
  workbook: null,   // raw XLSX workbook if multi-sheet
};

// ── DOM refs ───────────────────────────────────────────────────────────────
const uploadView           = document.getElementById('uploadView');
const dashboardView        = document.getElementById('dashboardView');
const dropZone             = document.getElementById('dropZone');
const fileInput            = document.getElementById('fileInput');
const loadingOverlay       = document.getElementById('loadingOverlay');
const sheetSelectorOverlay = document.getElementById('sheetSelectorOverlay');
const sheetList            = document.getElementById('sheetList');
const headerActions        = document.getElementById('headerActions');
const resetBtn             = document.getElementById('resetBtn');
const exportBtn            = document.getElementById('exportBtn');
const tableSearch          = document.getElementById('tableSearch');

// ── File Input Events ──────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

resetBtn.addEventListener('click', () => {
  fileInput.value = '';
  state.workbook = null;
  dashboardView.style.display = 'none';
  uploadView.style.display    = 'flex';
  headerActions.style.display = 'none';
});

exportBtn.addEventListener('click', exportDashboard);

// ── File Handler ───────────────────────────────────────────────────────────
function handleFile(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    alert('Please upload a CSV, XLSX, or XLS file.');
    return;
  }
  state.fileName = file.name;
  showLoading(true);

  const reader = new FileReader();

  if (name.endsWith('.csv')) {
    reader.onload = e => {
      Papa.parse(e.target.result, {
        header: true, skipEmptyLines: true, dynamicTyping: false,
        complete: result => {
          showLoading(false);
          if (result.data.length === 0) { alert('The CSV appears to be empty.'); return; }
          processData(result.data, result.meta.fields);
        },
        error: () => { showLoading(false); alert('Failed to parse CSV.'); }
      });
    };
    reader.readAsText(file);
  } else {
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        showLoading(false);
        state.workbook = wb;
        if (wb.SheetNames.length === 1) {
          loadSheet(wb, wb.SheetNames[0]);
        } else {
          showSheetSelector(wb);
        }
      } catch {
        showLoading(false);
        alert('Failed to read the Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

function loadSheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  if (rows.length === 0) { alert('The selected sheet is empty.'); return; }
  const headers = Object.keys(rows[0]);
  processData(rows, headers);
}

// ── Sheet Selector ─────────────────────────────────────────────────────────
function showSheetSelector(wb) {
  sheetList.innerHTML = '';
  wb.SheetNames.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'sheet-btn';
    btn.textContent = name;
    btn.addEventListener('click', () => {
      sheetSelectorOverlay.style.display = 'none';
      loadSheet(wb, name);
    });
    sheetList.appendChild(btn);
  });
  sheetSelectorOverlay.style.display = 'flex';
}

// ── Data Processing ────────────────────────────────────────────────────────
function processData(rows, headers) {
  state.raw     = rows;
  state.headers = headers;
  state.colTypes = {};
  state.colStats = {};

  headers.forEach(col => {
    const values = rows.map(r => r[col]);
    state.colTypes[col] = detectType(values);
    state.colStats[col] = computeStats(values, state.colTypes[col]);
  });

  state.filteredRows = [...state.raw];
  state.sortCol = null;
  state.sortDir = 'asc';

  buildDashboard();
  buildTable();

  uploadView.style.display    = 'none';
  dashboardView.style.display = 'block';
  headerActions.style.display = 'flex';

  document.getElementById('fileNameBadge').textContent = state.fileName;
  document.getElementById('rowCountChip').textContent  = `${rows.length.toLocaleString()} rows`;
  document.getElementById('colCountChip').textContent  = `${headers.length} columns`;
}

// ── Type Detection ─────────────────────────────────────────────────────────
function detectType(values) {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonEmpty.length === 0) return 'text';

  const numCount = nonEmpty.filter(v => isNumeric(v)).length;
  if (numCount / nonEmpty.length >= 0.85) return 'number';

  const dateCount = nonEmpty.filter(v => isDateLike(v)).length;
  if (dateCount / nonEmpty.length >= 0.80) return 'date';

  const unique = new Set(nonEmpty.map(v => String(v).trim()));
  if (unique.size <= Math.min(30, nonEmpty.length * 0.4)) return 'category';

  return 'text';
}

function isNumeric(v) {
  if (v === null || v === undefined || String(v).trim() === '') return false;
  return !isNaN(parseFloat(String(v).replace(/,/g, ''))) && isFinite(String(v).replace(/,/g, ''));
}

function isDateLike(v) {
  const s = String(v).trim();
  if (s.length < 4) return false;
  // ISO-ish, US-ish, or Date object
  return /^\d{4}-\d{2}-\d{2}/.test(s) ||
         /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s) ||
         (!isNaN(Date.parse(s)) && s.length > 5);
}

// ── Statistics ─────────────────────────────────────────────────────────────
function computeStats(values, type) {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  const missing  = values.length - nonEmpty.length;
  const stats = { count: nonEmpty.length, missing, total: values.length };

  if (type === 'number') {
    const nums = nonEmpty.map(v => parseFloat(String(v).replace(/,/g, ''))).filter(n => !isNaN(n));
    nums.sort((a, b) => a - b);
    stats.min    = nums[0];
    stats.max    = nums[nums.length - 1];
    stats.sum    = nums.reduce((a, b) => a + b, 0);
    stats.mean   = stats.sum / nums.length;
    stats.median = nums.length % 2 === 0
      ? (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2
      : nums[Math.floor(nums.length / 2)];
    stats.nums   = nums;
  } else {
    const freq = {};
    nonEmpty.forEach(v => { const k = String(v).trim(); freq[k] = (freq[k] || 0) + 1; });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    stats.freq      = freq;
    stats.topValues = sorted.slice(0, 10);
    stats.unique    = Object.keys(freq).length;
  }

  return stats;
}

// ── Table ──────────────────────────────────────────────────────────────────
function buildTable() {
  buildTableHead();
  renderTableBody();
  updateTableCount();

  tableSearch.addEventListener('input', () => {
    const q = tableSearch.value.toLowerCase();
    state.filteredRows = q
      ? state.raw.filter(row => state.headers.some(h => String(row[h]).toLowerCase().includes(q)))
      : [...state.raw];
    renderTableBody();
    updateTableCount();
  });
}

function buildTableHead() {
  const thead = document.getElementById('tableHead');
  const tr = document.createElement('tr');
  state.headers.forEach(col => {
    const th = document.createElement('th');
    const type = state.colTypes[col];
    const typeTag = `<span class="col-type-tag ${type}">${type === 'category' ? 'cat' : type}</span>`;
    const sortIcon = `<span class="sort-icon"></span>`;
    th.innerHTML = `${escHtml(col)}${typeTag}${sortIcon}`;
    th.addEventListener('click', () => sortTable(col, th));
    tr.appendChild(th);
  });
  thead.innerHTML = '';
  thead.appendChild(tr);
}

function renderTableBody() {
  const tbody = document.getElementById('tableBody');
  const MAX_ROWS = 500;
  const rows = state.filteredRows.slice(0, MAX_ROWS);
  const html = rows.map(row => {
    const cells = state.headers.map(col => {
      const val = row[col];
      const type = state.colTypes[col];
      const isEmpty = val === null || val === undefined || String(val).trim() === '';
      const cls = isEmpty ? 'empty' : type === 'number' ? 'numeric' : '';
      const display = isEmpty ? '—' : escHtml(String(val));
      return `<td class="${cls}" title="${isEmpty ? '' : escHtml(String(val))}">${display}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  tbody.innerHTML = html;
}

function sortTable(col, thEl) {
  if (state.sortCol === col) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortCol = col;
    state.sortDir = 'asc';
  }

  document.querySelectorAll('th').forEach(t => t.classList.remove('sorted-asc', 'sorted-desc'));
  thEl.classList.add(state.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');

  const type = state.colTypes[col];
  state.filteredRows.sort((a, b) => {
    let av = a[col], bv = b[col];
    if (type === 'number') { av = parseFloat(String(av).replace(/,/g, '')) || 0; bv = parseFloat(String(bv).replace(/,/g, '')) || 0; }
    else { av = String(av ?? '').toLowerCase(); bv = String(bv ?? '').toLowerCase(); }
    return state.sortDir === 'asc' ? (av > bv ? 1 : av < bv ? -1 : 0) : (av < bv ? 1 : av > bv ? -1 : 0);
  });
  renderTableBody();
}

function updateTableCount() {
  const el = document.getElementById('tableRowCount');
  const total = state.raw.length;
  const shown = Math.min(state.filteredRows.length, 500);
  el.textContent = state.filteredRows.length < total
    ? `Showing ${shown} of ${state.filteredRows.length} filtered (${total} total)`
    : `Showing ${shown} of ${total}`;
}

// ── Export ─────────────────────────────────────────────────────────────────
function exportDashboard() {
  window.print();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function showLoading(on) { loadingOverlay.style.display = on ? 'flex' : 'none'; }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e4) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Expose helpers for dashboard.js
window.appState  = state;
window.fmtNum    = fmtNum;
window.escHtml   = escHtml;
