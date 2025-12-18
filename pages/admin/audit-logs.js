// EDX — Audit Logs (production)
// Self-contained: loads data, renders filters, pagination, CSV export, and persists UI state.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  all: [],            // full dataset
  filtered: [],       // after filters
  page: 1,
  pageSize: 10,
  q: '',
  action: '',
  result: '',
  from: null,
  to: null,
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  loading: false,
  dataUrl: 'audit-logs.json'
};

init().catch(console.error);

async function init() {
  // Restore persisted UI
  restorePreferences();
  $('#tzLabel') && ($('#tzLabel').textContent = state.tz);

  // Wire events
  const debouncedFilter = debounce(onFilterChange, 300);
  $('#q')?.addEventListener('input', debouncedFilter);
  $('#fAction')?.addEventListener('change', onFilterChange);
  $('#fResult')?.addEventListener('change', onFilterChange);
  $('#fromTs')?.addEventListener('change', onFilterChange);
  $('#toTs')?.addEventListener('change', onFilterChange);
  $('#pageSize')?.addEventListener('change', onPageSize);
  $('#btnRefresh')?.addEventListener('click', () => loadData(true));
  $('#btnExport')?.addEventListener('click', onExport);

  await loadData(true);
}

function restorePreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('edx.audit.prefs') || '{}');
    Object.assign(state, saved);
  } catch {}
  $('#q') && ($('#q').value = state.q || '');
  $('#fAction') && ($('#fAction').value = state.action || '');
  $('#fResult') && ($('#fResult').value = state.result || '');
  if (state.from && $('#fromTs')) $('#fromTs').value = toLocalInputValue(new Date(state.from));
  if (state.to && $('#toTs')) $('#toTs').value = toLocalInputValue(new Date(state.to));
  $('#pageSize') && ($('#pageSize').value = String(state.pageSize || 10));
}

function persistPreferences() {
  const prefs = {
    q: state.q, action: state.action, result: state.result,
    pageSize: state.pageSize, from: state.from, to: state.to
  };
  localStorage.setItem('edx.audit.prefs', JSON.stringify(prefs));
}

async function loadData(bust = false) {
  try {
    setLoading(true, 'Loading logs…');
    const url = bust ? `${state.dataUrl}?t=${Date.now()}` : state.dataUrl;
    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json();
    const rows = Array.isArray(json?.logs) ? json.logs : [];
    state.all = rows.map(normalizeRow);
    hydrateFilterDropdowns(state.all);
    applyFilters();
  } catch (e) {
    console.error(e);
    state.all = [];
    state.filtered = [];
    renderTable([]);
    renderPager(1, 1);
    updateKpi(0);
    setStatus('Failed to load logs.', true);
  } finally {
    setLoading(false);
  }
}

function normalizeRow(r) {
  // Expect ISO-like UTC timestamps in r.time; keep original for export.
  const originalTime = r.time;
  let d = new Date(originalTime);
  if (Number.isNaN(d.getTime())) d = new Date(String(originalTime).replace(' ', 'T'));
  return {
    originalTime,
    localTime: formatLocal(d),
    actor: String(r.actor ?? ''),
    action: String(r.action ?? ''),
    target: String(r.target ?? ''),
    result: String(r.result ?? ''),
    details: String(r.details ?? '')
  };
}

function hydrateFilterDropdowns(rows) {
  // Populate action/result dropdowns with unique values
  const actions = [...new Set(rows.map(r => r.action).filter(Boolean))].sort();
  const results = [...new Set(rows.map(r => r.result).filter(Boolean))].sort();
  fillSelect($('#fAction'), actions, state.action);
  fillSelect($('#fResult'), results, state.result);
}

function fillSelect(sel, values, selected) {
  if (!sel) return;
  const current = sel.value;
  const v = selected || current || '';
  sel.innerHTML = `<option value="">All</option>` + values.map(x =>
    `<option value="${esc(x)}"${x===v?' selected':''}>${esc(x)}</option>`
  ).join('');
}

function onFilterChange() {
  state.q = ($('#q')?.value || '').trim();
  state.action = $('#fAction')?.value || '';
  state.result = $('#fResult')?.value || '';
  state.from = $('#fromTs')?.value ? new Date($('#fromTs').value).toISOString() : null;
  state.to   = $('#toTs')?.value   ? new Date($('#toTs').value).toISOString()   : null;
  state.page = 1;
  persistPreferences();
  applyFilters();
}

function onPageSize() {
  state.pageSize = parseInt($('#pageSize')?.value, 10) || 10;
  state.page = 1;
  persistPreferences();
  applyFilters();
}

function applyFilters() {
  const q = state.q.toLowerCase();
  const from = state.from ? new Date(state.from).getTime() : null;
  const to   = state.to   ? new Date(state.to).getTime()   : null;

  state.filtered = state.all.filter(r => {
    // text
    const hay = `${r.actor} ${r.action} ${r.target} ${r.details}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    // action/result
    if (state.action && r.action !== state.action) return false;
    if (state.result && r.result !== state.result) return false;
    // range (compare UTC instant) — align with normalization strategy
    const t = new Date(String(r.originalTime).replace(' ', 'T')).getTime();
    if (from && t < from) return false;
    if (to && t > to) return false;
    return true;
  });

  // Render page
  updateKpi(state.filtered.length);
  renderCurrentPage();
  setStatus(`${state.filtered.length} matching ${state.filtered.length === 1 ? 'row' : 'rows'}.`);
}

function renderCurrentPage() {
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;

  const start = (state.page - 1) * state.pageSize;
  const end = Math.min(state.filtered.length, start + state.pageSize);
  const slice = state.filtered.slice(start, end);

  renderTable(slice);
  renderPager(state.page, totalPages);
}

function renderTable(rows) {
  const tbody = $('#tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-body-secondary py-4">No logs</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="text-nowrap">${esc(r.localTime)}</td>
      <td>${esc(r.actor)}</td>
      <td>${esc(r.action)}</td>
      <td class="text-nowrap">${esc(r.target)}</td>
      <td>${badge(r.result)}</td>
      <td class="text-body-secondary">${esc(r.details)}</td>
    </tr>
  `).join('');
}

function renderPager(page, totalPages) {
  const ul = $('#pager');
  const btn = (p, label = p, disabled = false, active = false, aria = '') =>
    `<li class="page-item ${disabled?'disabled':''} ${active?'active':''}">
       <button class="page-link" data-page="${p}" ${aria}>${label}</button>
     </li>`;
  const dots = `<li class="page-item disabled"><span class="page-link">…</span></li>`;

  let html = '';
  html += btn(page - 1, '«', page <= 1, false, 'aria-label="Previous"');
  if (totalPages <= 7) {
    for (let n=1; n<=totalPages; n++) html += btn(n, n, false, n===page);
  } else {
    html += btn(1, 1, false, page===1);
    html += (page > 3) ? dots : '';
    for (let n=Math.max(2, page-1); n<=Math.min(totalPages-1, page+1); n++) {
      html += btn(n, n, false, n===page);
    }
    html += (page < totalPages-2) ? dots : '';
    html += btn(totalPages, totalPages, false, page===totalPages);
  }
  html += btn(page + 1, '»', page >= totalPages, false, 'aria-label="Next"');

  ul.innerHTML = html;
  $$('#pager .page-link').forEach(el => {
    el.addEventListener('click', () => {
      const p = Number(el.getAttribute('data-page'));
      if (!Number.isNaN(p)) {
        const max = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
        state.page = Math.min(Math.max(1, p), max);
        renderCurrentPage();
      }
    });
  });
}

function onExport() {
  const rows = state.filtered.length ? state.filtered : state.all;
  const csv = toCSV([
    ['Time (UTC)','Time (Local)','Actor','Action','Target','Result','Details'],
    ...rows.map(r => [r.originalTime, r.localTime, r.actor, r.action, r.target, r.result, r.details])
  ]);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `edx_audit_logs_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setLoading(flag, msg = '') {
  state.loading = !!flag;
  setStatus(msg);
  const dis = !!flag;
  $('#btnRefresh') && ($('#btnRefresh').disabled = dis);
  $('#btnExport') && ($('#btnExport').disabled = dis);
}

function setStatus(text, isError = false) {
  const el = $('#status');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('text-danger', !!isError);
}

function updateKpi(n) {
  const el = $('#kpiRows');
  if (!el) return;
  el.innerHTML = `Rows: <strong>${n}</strong>`;
}

function formatLocal(d) {
  try {
    const fmt = new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    return fmt.format(d);
  } catch { return d.toLocaleString(); }
}

function toLocalInputValue(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toCSV(rows) {
  const BOM = '\uFEFF';
  const line = cols => cols.map(csvEscape).join(',');
  return BOM + rows.map(line).join('\r\n');
}
function csvEscape(v) {
  const s = String(v ?? '');
  const needs = /[",\r\n]/.test(s);
  const escd = s.replace(/"/g, '""');
  return needs ? `"${escd}"` : escd;
}
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function badge(result) {
  const r = String(result).toUpperCase();
  const cls = r === 'SUCCESS' || r === 'APPROVED' || r === 'ALLOWED' || r === 'UPDATED'
    ? 'text-success'
    : (r === 'WARNING' ? 'text-warning' : (r === 'BLOCKED' || r === 'DENIED' || r === 'FAILED') ? 'text-danger' : 'text-body');
  return `<span class="${cls}">${esc(result)}</span>`;
}

/* --------- tiny util: debounce --------- */
function debounce(fn, wait=250) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); };
}
