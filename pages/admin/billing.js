// EDX — Billing & Usage (production)
// Accessible table (aria-sort), keyboardable pagination, state persistence, CSV exports,
// Details modal with line items, and robust client-side pagination & sorting.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const main = $('#app-main');
const jsonUrl = 'billing.json';

const state = {
  rows: [],
  page: 1,
  pageSize: 10,
  isLoading: false,
  q: '',
  sortKey: 'tenant',
  sortDir: 'asc',
  openedInvoice: null,
  prefsKey: 'edx.billing.prefs'
};

init().catch(console.error);

async function init() {
  restorePrefs();
  await loadData(true);
  render();
}

function restorePrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(state.prefsKey) || '{}');
    if (p.pageSize) state.pageSize = p.pageSize;
    if (typeof p.q === 'string') state.q = p.q;
    if (p.sortKey) state.sortKey = p.sortKey;
    if (p.sortDir) state.sortDir = p.sortDir;
  } catch {}
}
function persistPrefs() {
  localStorage.setItem(state.prefsKey, JSON.stringify({
    pageSize: state.pageSize, q: state.q, sortKey: state.sortKey, sortDir: state.sortDir
  }));
}

async function loadData(bust = false) {
  try {
    state.isLoading = true;
    const url = bust ? `${jsonUrl}?t=${Date.now()}` : jsonUrl;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => ({ accounts: [] }));

    const rows = Array.isArray(data.accounts) ? data.accounts : [];
    state.rows = rows.map(normalizeRow);

    // keep page in range
    const max = Math.max(1, Math.ceil(state.rows.length / state.pageSize));
    if (state.page > max) state.page = max;
  } catch (e) {
    console.error('Failed to load billing data:', e);
    state.rows = [];
    state.page = 1;
  } finally {
    state.isLoading = false;
  }
}

/* ---------- Normalize & helpers ---------- */
function normalizeRow(r) {
  const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const usage = n(r.usage_gb);
  const incl = n(r.included_gb);
  const over = Math.max(0, usage - incl);
  const unit = n(r.unit_cost_gb);

  return {
    tenant_id: String(r.tenant_id ?? ''),
    tenant: String(r.tenant ?? ''),
    plan: String(r.plan ?? ''),
    seats: n(r.seats),
    usage: usage,
    included_gb: incl,
    overage_gb: over,
    unit_cost_gb: unit,
    subtotal: n(r.subtotal),
    credits: n(r.credits),
    taxes: n(r.taxes),
    total: n(r.total),
    period: String(r.period ?? ''),
    period_start: String(r.period_start ?? ''),
    period_end: String(r.period_end ?? ''),
    invoice_id: String(r.invoice_id ?? ''),
    status: String(r.status ?? ''),
    payment_method: String(r.payment_method ?? ''),
    next_invoice_date: String(r.next_invoice_date ?? ''),
    billing_contact: r.billing_contact ? {
      name: String(r.billing_contact.name ?? ''), email: String(r.billing_contact.email ?? '')
    } : { name: '', email: '' },
    line_items: Array.isArray(r.line_items) ? r.line_items.map(li => ({
      sku: String(li.sku ?? ''), description: String(li.description ?? ''), quantity: n(li.quantity),
      unit: String(li.unit ?? ''), unit_price: n(li.unit_price), amount: n(li.amount), meta: li.meta ?? {}
    })) : []
  };
}

function getFilteredSortedRows() {
  const q = state.q.trim().toLowerCase();
  let out = q ? state.rows.filter(r =>
    r.tenant.toLowerCase().includes(q) ||
    r.tenant_id.toLowerCase().includes(q) ||
    r.plan.toLowerCase().includes(q) ||
    String(r.seats).includes(q) ||
    r.period.toLowerCase().includes(q) ||
    r.status.toLowerCase().includes(q) ||
    r.invoice_id.toLowerCase().includes(q)
  ) : [...state.rows];

  const { sortKey, sortDir } = state;
  out.sort((a,b) => {
    let va = a[sortKey], vb = b[sortKey];
    const numericKeys = ['seats','usage','included_gb','overage_gb','unit_cost_gb','subtotal','credits','taxes','total'];
    const isNum = numericKeys.includes(sortKey);
    if (isNum) { va = Number(va); vb = Number(vb); }
    else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return out;
}

/* ---------- Rendering ---------- */
function render() {
  const filtered = getFilteredSortedRows();
  const { page, pageSize, isLoading, sortKey, sortDir, q } = state;
  const total = filtered.length;
  const grandTotal = sum(filtered.map(r => r.total));
  const totalUsage = sum(filtered.map(r => r.usage));
  const totalOver = sum(filtered.map(r => r.overage_gb));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = (page - 1) * pageSize;
  const slice = filtered.slice(startIdx, startIdx + pageSize);

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Billing &amp; Usage</h1>
        <span class="kpi small text-body-secondary">Tenants: <strong>${fmtNum(total)}</strong></span>
        <span class="kpi small text-body-secondary">Usage (GB): <strong>${fmtNum(totalUsage)}</strong></span>
        <span class="kpi small text-body-secondary">Overage (GB): <strong>${fmtNum(totalOver)}</strong></span>
        <span class="kpi small text-body-secondary">Total ($): <strong>${fmtCurrency(grandTotal)}</strong></span>
      </div>

      <div class="toolbar d-flex flex-wrap">
        <div class="input-group input-group-sm search-wrap">
          <span class="input-group-text">Search</span>
          <input id="search" class="form-control" placeholder="Tenant, plan, invoice, status, period" value="${escAttr(q)}" />
        </div>
        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text" for="pageSize">Rows/page</label>
          <select id="pageSize" class="form-select form-select-sm">
            ${[10,25,50,100].map(v => `<option value="${v}" ${v===pageSize?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <button id="btnExport" class="btn btn-outline-secondary btn-sm" ${isLoading?'disabled':''} title="Export filtered rows as CSV">Export CSV</button>
        <button id="btnRefresh" class="btn btn-primary btn-sm" ${isLoading?'disabled':''} title="Reload from source">${isLoading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </div>

    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              ${th('tenant','Tenant',sortKey,sortDir)}
              ${th('plan','Plan',sortKey,sortDir)}
              ${th('seats','Seats',sortKey,sortDir,'end')}
              ${th('usage','Usage (GB)',sortKey,sortDir,'end')}
              ${th('included_gb','Included (GB)',sortKey,sortDir,'end')}
              ${th('overage_gb','Overage (GB)',sortKey,sortDir,'end')}
              ${th('unit_cost_gb','$/GB (Overage)',sortKey,sortDir,'end')}
              ${th('subtotal','Subtotal ($)',sortKey,sortDir,'end')}
              ${th('credits','Credits ($)',sortKey,sortDir,'end')}
              ${th('taxes','Taxes ($)',sortKey,sortDir,'end')}
              ${th('total','Total ($)',sortKey,sortDir,'end')}
              ${th('period','Period',sortKey,sortDir)}
              ${th('status','Status',sortKey,sortDir)}
              <th scope="col"><span class="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            ${slice.map(r => rowHtml(r)).join('')}
            ${slice.length ? '' : `<tr><td colspan="14" class="text-center text-body-secondary py-4">No matching rows</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
        <small class="text-body-secondary">Demo data for EDX billing; integrate with API later.</small>
        <nav aria-label="Billing pagination">
          <ul class="pagination pagination-sm mb-0">
            <li class="page-item ${page<=1?'disabled':''}">
              <button class="page-link" data-page="${page-1}" aria-label="Previous">&laquo;</button>
            </li>
            ${renderPageNumbers(page, totalPages)}
            <li class="page-item ${page>=totalPages?'disabled':''}">
              <button class="page-link" data-page="${page+1}" aria-label="Next">&raquo;</button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  `;

  // Wire controls
  $('#btnExport')?.addEventListener('click', handleExport);
  $('#btnRefresh')?.addEventListener('click', () => loadData(true).then(render));
  $('#pageSize')?.addEventListener('change', e => { state.pageSize = Number(e.target.value) || 10; state.page = 1; persistPrefs(); render(); });
  $('#search')?.addEventListener('input', e => { state.q = e.target.value || ''; state.page = 1; persistPrefs(); render(); });

  // Sorting
  $$('#app-main th[data-sort-key]').forEach(thEl => {
    thEl.addEventListener('click', () => {
      const key = thEl.getAttribute('data-sort-key');
      if (state.sortKey === key) state.sortDir = (state.sortDir === 'asc' ? 'desc' : 'asc');
      else { state.sortKey = key; state.sortDir = 'asc'; }
      persistPrefs();
      render();
    });
    // aria-sort
    thEl.setAttribute('aria-sort',
      thEl.getAttribute('data-sort-key') === sortKey ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
  });

  // Pagination
  $$('#app-main .pagination .page-link[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const goto = Number(btn.getAttribute('data-page'));
      if (!Number.isNaN(goto)) {
        const maxPages = Math.max(1, Math.ceil(getFilteredSortedRows().length / state.pageSize));
        state.page = Math.min(Math.max(1, goto), maxPages);
        render();
      }
    });
  });

  // Details buttons
  $$('#app-main button[data-action="details"]').forEach(btn => {
    btn.addEventListener('click', () => openDetails(btn.getAttribute('data-tenant-id')));
  });
}

/* ---------- Render pieces ---------- */
function th(key, label, sortKey, sortDir, align) {
  const active = key === sortKey;
  const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '';
  const klass = align === 'end' ? ' class="text-end"' : '';
  return `<th scope="col"${klass} data-sort-key="${key}">${label} <span class="sort">${arrow}</span></th>`;
}

function rowHtml(r) {
  return `
    <tr>
      <td>${esc(r.tenant)}</td>
      <td>${esc(r.plan)}</td>
      <td class="text-end">${fmtNum(r.seats)}</td>
      <td class="text-end">${fmtNum(r.usage)}</td>
      <td class="text-end">${fmtNum(r.included_gb)}</td>
      <td class="text-end">${fmtNum(r.overage_gb)}</td>
      <td class="text-end">${fmtCurrency(r.unit_cost_gb)}</td>
      <td class="text-end">${fmtCurrency(r.subtotal)}</td>
      <td class="text-end">${fmtCurrency(r.credits)}</td>
      <td class="text-end">${fmtCurrency(r.taxes)}</td>
      <td class="text-end fw-semibold">${fmtCurrency(r.total)}</td>
      <td class="text-nowrap">${esc(r.period)}</td>
      <td class="text-nowrap">${statusBadge(r.status)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary" data-action="details" data-tenant-id="${escAttr(r.tenant_id)}">Details</button>
      </td>
    </tr>
  `;
}

function statusBadge(s) {
  const v = String(s || '').toLowerCase();
  const cls = v === 'paid' ? 'text-success' : v === 'open' ? 'text-warning' : 'text-body';
  return `<span class="${cls}">${esc(s)}</span>`;
}

/* ---------- Export ---------- */
async function handleExport() {
  try {
    setDisabled('#btnExport', true);
    const rows = getFilteredSortedRows();
    const csv = toCSV([
      ['Tenant ID','Tenant','Plan','Seats','Usage (GB)','Included (GB)','Overage (GB)','$ / GB (Overage)','Subtotal ($)','Credits ($)','Taxes ($)','Total ($)','Invoice','Status','Period','Start','End','Payment Method','Next Invoice'],
      ...rows.map(r => [
        r.tenant_id, r.tenant, r.plan, r.seats, r.usage, r.included_gb, r.overage_gb, r.unit_cost_gb,
        r.subtotal, r.credits, r.taxes, r.total, r.invoice_id, r.status, r.period, r.period_start, r.period_end, r.payment_method, r.next_invoice_date
      ])
    ]);
    downloadBlob(csv, `edx_billing_${ts()}.csv`, 'text/csv;charset=utf-8');
  } finally {
    setDisabled('#btnExport', false);
  }
}

/* ---------- Details Modal ---------- */
function openDetails(tenantId) {
  const account = state.rows.find(r => r.tenant_id === tenantId);
  if (!account) return;

  state.openedInvoice = account;

  const totalsTable = `
    <table class="table table-sm">
      <tbody>
        <tr><th class="w-25">Plan</th><td>${esc(account.plan)}</td></tr>
        <tr><th>Seats</th><td>${fmtNum(account.seats)}</td></tr>
        <tr><th>Usage (GB)</th><td>${fmtNum(account.usage)}</td></tr>
        <tr><th>Included (GB)</th><td>${fmtNum(account.included_gb)}</td></tr>
        <tr><th>Overage (GB)</th><td>${fmtNum(account.overage_gb)}</td></tr>
        <tr><th>$ / GB (Overage)</th><td>${fmtCurrency(account.unit_cost_gb)}</td></tr>
        <tr><th>Subtotal</th><td>${fmtCurrency(account.subtotal)}</td></tr>
        <tr><th>Credits</th><td>${fmtCurrency(account.credits)}</td></tr>
        <tr><th>Taxes</th><td>${fmtCurrency(account.taxes)}</td></tr>
        <tr class="table-active"><th>Total</th><td class="fw-semibold">${fmtCurrency(account.total)}</td></tr>
      </tbody>
    </table>
  `;

  const metaTable = `
    <table class="table table-sm">
      <tbody>
        <tr><th class="w-25">Tenant</th><td>${esc(account.tenant)} <span class="text-body-secondary monospace">(${esc(account.tenant_id)})</span></td></tr>
        <tr><th>Invoice</th><td class="monospace">${esc(account.invoice_id)}</td></tr>
        <tr><th>Status</th><td>${statusBadge(account.status)}</td></tr>
        <tr><th>Period</th><td>${esc(account.period)} <span class="text-body-secondary">(${esc(account.period_start)} → ${esc(account.period_end)})</span></td></tr>
        <tr><th>Payment</th><td>${esc(account.payment_method)}</td></tr>
        <tr><th>Next Invoice</th><td>${esc(account.next_invoice_date)}</td></tr>
        <tr><th>Billing Contact</th><td>${esc(account.billing_contact.name)} &lt;${esc(account.billing_contact.email)}&gt;</td></tr>
      </tbody>
    </table>
  `;

  const items = account.line_items ?? [];
  const itemsTable = `
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead class="table-light">
          <tr>
            <th>SKU</th>
            <th>Description</th>
            <th class="text-end">Qty</th>
            <th>Unit</th>
            <th class="text-end">Unit Price</th>
            <th class="text-end">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(li => `
            <tr>
              <td class="monospace">${esc(li.sku)}</td>
              <td>${esc(li.description)}</td>
              <td class="text-end">${fmtNum(li.quantity)}</td>
              <td>${esc(li.unit)}</td>
              <td class="text-end">${fmtCurrency(li.unit_price)}</td>
              <td class="text-end">${fmtCurrency(li.amount)}</td>
            </tr>
          `).join('')}
          ${items.length ? '' : `<tr><td colspan="6" class="text-center text-body-secondary">No line items</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  $('#detailsModalLabel').textContent = `Billing Details — ${account.tenant}`;
  $('#detailsBody').innerHTML = `
    <div class="row g-3">
      <div class="col-lg-6">
        <h6>Totals</h6>
        ${totalsTable}
      </div>
      <div class="col-lg-6">
        <h6>Invoice & Tenant</h6>
        ${metaTable}
      </div>
      <div class="col-12">
        <h6>Itemized Charges</h6>
        ${itemsTable}
        <div class="small text-body-secondary">
          Formula: <span class="monospace">total = subtotal - credits + taxes</span>.
          Overage subtotal is <span class="monospace">max(0, usage - included) × unit_cost_gb</span>.
        </div>
      </div>
    </div>
  `;

  // Export invoice button
  $('#btnExportInvoice')?.addEventListener('click', () => {
    const acc = state.openedInvoice;
    if (!acc) return;
    const invoiceCsv = toCSV([
      ['Invoice','Tenant ID','Tenant','Period','Start','End','Status','Payment'],
      [acc.invoice_id, acc.tenant_id, acc.tenant, acc.period, acc.period_start, acc.period_end, acc.status, acc.payment_method],
      [],
      ['SKU','Description','Qty','Unit','Unit Price','Amount'],
      ...acc.line_items.map(li => [li.sku, li.description, li.quantity, li.unit, li.unit_price, li.amount]),
      [],
      ['Subtotal','Credits','Taxes','Total'],
      [acc.subtotal, acc.credits, acc.taxes, acc.total]
    ]);
    downloadBlob(invoiceCsv, `edx_invoice_${acc.invoice_id || ts()}.csv`, 'text/csv;charset=utf-8');
  });

  const modal = new bootstrap.Modal($('#detailsModal'));
  modal.show();
}

/* ---------- Utilities ---------- */
function setDisabled(sel, flag) { const el = $(sel); if (el) el.disabled = !!flag; }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v) { return esc(v).replace(/"/g,'&quot;'); }
function fmtNum(n) { return Number.isFinite(n) ? n.toLocaleString() : '0'; }
function fmtCurrency(n) { return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'; }
function sum(arr) { return arr.reduce((a,b) => a + (Number.isFinite(b) ? b : 0), 0); }
function renderPageNumbers(page, totalPages) {
  const out = [];
  const item = (n, label=n) => out.push(`<li class="page-item ${n===page?'active':''}"><button class="page-link" data-page="${n}">${label}</button></li>`);
  const dot = () => out.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
  if (totalPages <= 7) { for (let n=1;n<=totalPages;n++) item(n); }
  else { item(1); if (page>3) dot(); for (let n=Math.max(2,page-1); n<=Math.min(totalPages-1,page+1); n++) item(n); if (page<totalPages-2) dot(); item(totalPages); }
  return out.join('');
}
function toCSV(rows) { const BOM = '\uFEFF'; const lines = rows.map(cols => cols.map(csvEscape).join(',')); return BOM + lines.join('\r\n'); }
function csvEscape(v) { const s = String(v ?? ''); const needs = /[",\r\n]/.test(s); const escd = s.replace(/"/g, '""'); return needs ? `"${escd}"` : escd; }
function downloadBlob(text, filename, mime) { const blob = new Blob([text], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function ts() { return new Date().toISOString().replace(/[:.]/g,'-'); }
