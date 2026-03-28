/**
 * parser.js – File parsing & data utilities for SheetDash
 * Dependencies: PapaParse, SheetJS (XLSX)
 */
const Parser = {

  /* ── Public: parse a File object ─────────────────────────── */
  async parseFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv')                return this._parseCSV(file);
    if (['xls','xlsx'].includes(ext)) return this._parseExcel(file);
    throw new Error('Unsupported format. Please upload CSV, XLS, or XLSX.');
  },

  /* ── CSV via PapaParse ────────────────────────────────────── */
  _parseCSV(file) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: result => {
          if (!result.data.length) { reject(new Error('CSV file appears to be empty.')); return; }
          resolve(this._build(result.meta.fields || [], result.data));
        },
        error: err => reject(new Error('CSV error: ' + err.message)),
      });
    });
  },

  /* ── Excel via SheetJS ────────────────────────────────────── */
  _parseExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
          if (!rows.length) { reject(new Error('Spreadsheet appears to be empty.')); return; }
          resolve(this._build(Object.keys(rows[0]), rows));
        } catch (err) {
          reject(new Error('Excel error: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsArrayBuffer(file);
    });
  },

  /* ── Build normalised data structure ─────────────────────── */
  _build(headers, rows) {
    const columns = headers.map(name => {
      const vals = rows.map(r => r[name]).filter(v => v !== '' && v != null);
      const type = this._detectType(vals);
      const col = { name, type };
      if (type === 'numeric') {
        const nums = vals.map(v => parseFloat(v)).filter(v => !isNaN(v));
        col.stats = this._stats(nums);
      }
      return col;
    });
    return { columns, rows, totalRows: rows.length };
  },

  /* ── Type detection ──────────────────────────────────────── */
  _detectType(vals) {
    if (!vals.length) return 'string';
    const numOk  = vals.filter(v => v !== '' && !isNaN(parseFloat(v)) && isFinite(v)).length;
    if (numOk / vals.length >= 0.85) return 'numeric';
    const dateOk = vals.filter(v => { const d = new Date(v); return !isNaN(d) && String(v).length > 4; }).length;
    if (dateOk / vals.length >= 0.8) return 'date';
    return 'string';
  },

  /* ── Descriptive stats ───────────────────────────────────── */
  _stats(nums) {
    if (!nums.length) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    return { sum, avg: sum / nums.length, min: Math.min(...nums), max: Math.max(...nums), count: nums.length };
  },

  /* ── Aggregate rows for charts ───────────────────────────── */
  aggregate(rows, xCol, yCol, aggregation = 'sum') {
    const groups = {};
    rows.forEach(row => {
      const key = String(row[xCol] ?? '(empty)');
      const val = parseFloat(row[yCol]) || 0;
      (groups[key] = groups[key] || []).push(val);
    });

    let entries = Object.entries(groups).map(([label, vals]) => ({
      label,
      value: this._applyAgg(vals, aggregation),
    }));

    // Sort descending by value, cap at 30 groups for readability
    entries.sort((a, b) => b.value - a.value);
    entries = entries.slice(0, 30);

    return { labels: entries.map(e => e.label), values: entries.map(e => e.value) };
  },

  _applyAgg(vals, agg) {
    switch (agg) {
      case 'sum':   return vals.reduce((a, b) => a + b, 0);
      case 'avg':   return vals.reduce((a, b) => a + b, 0) / vals.length;
      case 'count': return vals.length;
      case 'min':   return Math.min(...vals);
      case 'max':   return Math.max(...vals);
      default:      return vals.reduce((a, b) => a + b, 0);
    }
  },

  /* ── Compute a single KPI value ─────────────────────────── */
  computeKPI(rows, column, aggregation) {
    const nums = rows.map(r => parseFloat(r[column])).filter(v => !isNaN(v));
    if (!nums.length) return { value: 0, formatted: '—', count: 0 };
    const value = this._applyAgg(nums, aggregation);
    return { value, formatted: this.formatNumber(value), count: nums.length };
  },

  /* ── Human-readable number formatting ───────────────────── */
  formatNumber(n) {
    if (n == null || isNaN(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e9)  return (n / 1e9).toFixed(2)  + 'B';
    if (abs >= 1e6)  return (n / 1e6).toFixed(2)  + 'M';
    if (abs >= 1e4)  return (n / 1e3).toFixed(1)  + 'K';
    return Number.isInteger(n) ? n.toLocaleString() : parseFloat(n.toFixed(2)).toLocaleString();
  },

  /* ── Built-in sample dataset ─────────────────────────────── */
  getSampleData() {
    const rows = [
      { Month:'Jan', Region:'North', Product:'Laptop',  Sales:'12500', Units:'25', Profit:'3750' },
      { Month:'Jan', Region:'South', Product:'Phone',   Sales:'8200',  Units:'41', Profit:'2460' },
      { Month:'Jan', Region:'East',  Product:'Tablet',  Sales:'6700',  Units:'20', Profit:'2010' },
      { Month:'Jan', Region:'West',  Product:'Laptop',  Sales:'11000', Units:'22', Profit:'3300' },
      { Month:'Feb', Region:'North', Product:'Phone',   Sales:'9800',  Units:'49', Profit:'2940' },
      { Month:'Feb', Region:'South', Product:'Tablet',  Sales:'7100',  Units:'21', Profit:'2130' },
      { Month:'Feb', Region:'East',  Product:'Laptop',  Sales:'13200', Units:'26', Profit:'3960' },
      { Month:'Feb', Region:'West',  Product:'Phone',   Sales:'8900',  Units:'44', Profit:'2670' },
      { Month:'Mar', Region:'North', Product:'Tablet',  Sales:'5900',  Units:'18', Profit:'1770' },
      { Month:'Mar', Region:'South', Product:'Laptop',  Sales:'14500', Units:'29', Profit:'4350' },
      { Month:'Mar', Region:'East',  Product:'Phone',   Sales:'10200', Units:'51', Profit:'3060' },
      { Month:'Mar', Region:'West',  Product:'Tablet',  Sales:'7800',  Units:'23', Profit:'2340' },
      { Month:'Apr', Region:'North', Product:'Laptop',  Sales:'15200', Units:'30', Profit:'4560' },
      { Month:'Apr', Region:'South', Product:'Phone',   Sales:'9500',  Units:'47', Profit:'2850' },
      { Month:'Apr', Region:'East',  Product:'Tablet',  Sales:'8100',  Units:'24', Profit:'2430' },
      { Month:'Apr', Region:'West',  Product:'Laptop',  Sales:'12800', Units:'25', Profit:'3840' },
      { Month:'May', Region:'North', Product:'Phone',   Sales:'11000', Units:'55', Profit:'3300' },
      { Month:'May', Region:'South', Product:'Tablet',  Sales:'8600',  Units:'26', Profit:'2580' },
      { Month:'May', Region:'East',  Product:'Laptop',  Sales:'16100', Units:'32', Profit:'4830' },
      { Month:'May', Region:'West',  Product:'Phone',   Sales:'10300', Units:'51', Profit:'3090' },
      { Month:'Jun', Region:'North', Product:'Tablet',  Sales:'6800',  Units:'21', Profit:'2040' },
      { Month:'Jun', Region:'South', Product:'Laptop',  Sales:'17200', Units:'34', Profit:'5160' },
      { Month:'Jun', Region:'East',  Product:'Phone',   Sales:'11500', Units:'57', Profit:'3450' },
      { Month:'Jun', Region:'West',  Product:'Tablet',  Sales:'9200',  Units:'27', Profit:'2760' },
    ];
    return this._build(['Month','Region','Product','Sales','Units','Profit'], rows);
  },
};
