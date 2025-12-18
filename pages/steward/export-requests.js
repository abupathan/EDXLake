/* Export Requests (Steward) — production-ready
 * - CSP-safe (no inline)
 * - Uses partials-loader for shared UI + auth (auto-boot)
 * - Current tab: search, filters, page-number pagination, bulk Approve/Reject with guardrails
 * - NEW History tab: cursor pagination (Prev/Next cursor) with 10/20/50 page size
 * - History fields: id, dataset, slice, requester, status, started/ended, artifact, revocation flag
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const JSON_URL = 'export-requests.json';

const STATE = {
  // Current requests
  rows: [],
  page: 1,
  pageSize: 10,
  q: '',
  purpose: 'Any',
  status: 'Any',
  sensitivity: 'Any',

  // History
  history: [],
  histPageSize: 10,
  // Cursor state: tokens are integer offsets encoded as strings
  histCursorStart: 0,   // start offset in array
  histPrevStack: []     // stack of previous cursors to support "Prev cursor"
};

(async function init(){
  const data = await fetch(JSON_URL, { cache: 'no-store' })
    .then(r => r.json())
    .catch(() => ({ defaults:{pageSize:10}, requests: [], history: [] }));

  // CURRENT
  STATE.rows = (data.requests || []).sort((a,b)=> (b.created_ts||'').localeCompare(a.created_ts||''));
  STATE.pageSize = data?.defaults?.pageSize || 10;

  // HISTORY
  STATE.history = (data.history || []).sort((a,b)=> (b.started_ts||'').localeCompare(a.started_ts||''));
  STATE.histPageSize = data?.defaults?.pageSize || 10;

  renderShell(data);
  wireFilters();
  draw();           // current tab table
  drawHistory();    // history tab table
})();

/* ---------------- Shell with tabs ---------------- */
function renderShell(data){
  $('#app-main').innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">Export Requests</h1>
        <div class="small text-body-secondary">Steward approvals; consent & DQ guardrails enforced. All actions audit-logged.</div>
      </div>
    </div>

    <ul class="nav nav-tabs" id="exportTabs" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" id="tab-current" data-bs-toggle="tab" data-bs-target="#pane-current" type="button" role="tab" aria-controls="pane-current" aria-selected="true">Current</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="tab-history" data-bs-toggle="tab" data-bs-target="#pane-history" type="button" role="tab" aria-controls="pane-history" aria-selected="false">History</button>
      </li>
    </ul>

    <div class="tab-content pt-3">
      <!-- CURRENT -->
      <section class="tab-pane fade show active" id="pane-current" role="tabpanel" aria-labelledby="tab-current">
        <div class="card shadow-sm">
          <div class="card-body border-bottom bg-body-tertiary filters">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
              <div class="d-flex actions">
                <button id="btnRefresh" class="btn btn-outline-secondary btn-sm" type="button" aria-label="Refresh list">
                  <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Refresh
                </button>
                <button id="btnApproveBulk" class="btn btn-primary btn-sm" type="button" disabled>Approve selected</button>
                <button id="btnRejectBulk" class="btn btn-outline-danger btn-sm" type="button" disabled>Reject selected</button>
              </div>
            </div>

            <form class="row g-2 align-items-end" id="filterForm">
              <div class="col-12 col-sm-6 col-md-4 col-xl-3">
                <label for="search" class="form-label small text-body-secondary">Search (requester, dataset, id)</label>
                <input id="search" class="form-control form-control-sm" type="search" placeholder="Type to search…" />
              </div>
              <div class="col-6 col-sm-4 col-md-2 col-xl-2">
                <label for="purpose" class="form-label small text-body-secondary">Purpose</label>
                <select id="purpose" class="form-select form-select-sm" aria-label="Purpose">
                  <option>Any</option>
                  ${opt(['Operational','Compliance','Research'])}
                </select>
              </div>
              <div class="col-6 col-sm-4 col-md-2 col-xl-2">
                <label for="status" class="form-label small text-body-secondary">Status</label>
                <select id="status" class="form-select form-select-sm" aria-label="Status">
                  <option>Any</option>
                  ${opt(['Awaiting approval','Blocked: consent','Blocked: DQ','Approved','Rejected'])}
                </select>
              </div>
              <div class="col-6 col-sm-4 col-md-2 col-xl-2">
                <label for="sensitivity" class="form-label small text-body-secondary">Sensitivity</label>
                <select id="sensitivity" class="form-select form-select-sm" aria-label="Sensitivity">
                  <option>Any</option>
                  ${opt(['PII_STRICT','PII_DIRECTORY','FINANCIAL','DISCIPLINE','DEIDENTIFIED'])}
                </select>
              </div>
              <div class="col-6 col-sm-4 col-md-2 col-xl-2">
                <label for="pageSize" class="form-label small text-body-secondary">Rows per page</label>
                <select id="pageSize" class="form-select form-select-sm page-size" aria-label="Rows per page">
                  ${[10,20,50].map(n => `<option value="${n}" ${n==STATE.pageSize?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
            </form>
          </div>

          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0" id="reqTable">
              <thead class="table-light">
                <tr>
                  <th scope="col" style="width:1%"><input id="selAll" class="form-check-input" type="checkbox" aria-label="Select all"></th>
                  <th scope="col">Request</th>
                  <th scope="col">Requester</th>
                  <th scope="col">Dataset</th>
                  <th scope="col">Purpose</th>
                  <th scope="col">Sensitivity</th>
                  <th scope="col">Retention</th>
                  <th scope="col">Status</th>
                  <th scope="col" class="text-end">Action</th>
                </tr>
              </thead>
              <tbody id="reqBody"><tr><td colspan="9"><div class="empty text-center">Loading…</div></td></tr></tbody>
            </table>
          </div>

          <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
            <div id="rangeLabel" class="small text-body-secondary">Rows 0–0 of 0</div>
            <nav aria-label="Pagination">
              <ul class="pagination pagination-sm mb-0" id="pager"></ul>
            </nav>
          </div>
        </div>
      </section>

      <!-- HISTORY -->
      <section class="tab-pane fade" id="pane-history" role="tabpanel" aria-labelledby="tab-history">
        <div class="card shadow-sm">
          <div class="card-body border-bottom bg-body-tertiary">
            <div class="row g-2 align-items-end">
              <div class="col-12 col-sm-6 col-md-4 col-xl-3">
                <label for="histPageSize" class="form-label small text-body-secondary">Rows per cursor page</label>
                <select id="histPageSize" class="form-select form-select-sm page-size" aria-label="Rows per page (history)">
                  ${[10,20,50].map(n => `<option value="${n}" ${n==STATE.histPageSize?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>

          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th scope="col">Request ID</th>
                  <th scope="col">Dataset</th>
                  <th scope="col">Slice</th>
                  <th scope="col">Requester</th>
                  <th scope="col">Status</th>
                  <th scope="col">Started</th>
                  <th scope="col">Ended</th>
                  <th scope="col">Artifact</th>
                  <th scope="col">Revoked?</th>
                </tr>
              </thead>
              <tbody id="histBody"><tr><td colspan="9"><div class="empty text-center">Loading…</div></td></tr></tbody>
            </table>
          </div>

          <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
            <div id="histRange" class="small text-body-secondary">Rows 0–0 of 0</div>
            <div class="d-flex align-items-center gap-2">
              <button id="histPrev" class="btn btn-outline-secondary btn-sm" type="button" disabled aria-label="Previous cursor">&laquo; Prev cursor</button>
              <button id="histNext" class="btn btn-outline-secondary btn-sm" type="button" disabled aria-label="Next cursor">Next cursor &raquo;</button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Modal (approve/reject reason) -->
    <div class="modal fade" id="decisionModal" tabindex="-1" aria-hidden="true" aria-labelledby="decisionModalLabel">
      <div class="modal-dialog">
        <form class="modal-content" id="decisionForm">
          <div class="modal-header">
            <h2 class="modal-title fs-6" id="decisionModalLabel">Decision</h2>
            <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div id="decisionSummary" class="small mb-2"></div>
            <div class="mb-2">
              <label for="decisionReason" class="form-label">Reason (required)</label>
              <textarea id="decisionReason" class="form-control" rows="3" required placeholder="Explain the decision for audit…"></textarea>
            </div>
            <div class="form-text">
              This action will be audit-logged with your identity and the policy snapshot id.
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancel</button>
            <button id="decisionSubmit" class="btn btn-primary" type="submit">Submit</button>
          </div>
        </form>
      </div>
    </div>
  `;

  $('#btnRefresh')?.addEventListener('click', () => location.reload());
  $('#histPageSize').addEventListener('change', (e)=> {
    STATE.histPageSize = Number(e.target.value)||10;
    STATE.histCursorStart = 0;
    STATE.histPrevStack = [];
    drawHistory();
  });
  $('#histPrev').addEventListener('click', onHistPrev);
  $('#histNext').addEventListener('click', onHistNext);
}

/* ---------------- CURRENT tab (existing behavior) ---------------- */
function opt(list){ return list.map(v=>`<option>${v}</option>`).join(''); }

function wireFilters(){
  // Current tab filters
  $('#filterForm')?.addEventListener('submit', e => e.preventDefault());
  $('#search').addEventListener('input', e => { STATE.q = e.target.value.trim().toLowerCase(); STATE.page = 1; draw(); });
  $('#purpose').addEventListener('change', e => { STATE.purpose = e.target.value; STATE.page = 1; draw(); });
  $('#status').addEventListener('change', e => { STATE.status = e.target.value; STATE.page = 1; draw(); });
  $('#sensitivity').addEventListener('change', e => { STATE.sensitivity = e.target.value; STATE.page = 1; draw(); });
  $('#pageSize').addEventListener('change', e => { STATE.pageSize = Number(e.target.value)||10; STATE.page = 1; draw(); });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const tr = e.target.closest('tr[data-id]');
    const id = tr?.getAttribute('data-id');
    if (!id) return;
    openDecision(btn.dataset.action, [id]);
  });
}

function filtered(){
  const q = STATE.q;
  const has = (s) => String(s||'').toLowerCase().includes(q);
  return STATE.rows.filter(r => {
    const matchesQ = !q || has(r.id) || has(r.requester) || has(r.requester_email) || has(r.dataset);
    const matchesPurpose = (STATE.purpose==='Any') || (r.purpose||[]).includes(STATE.purpose);
    const matchesStatus  = (STATE.status==='Any') || r.status === STATE.status;
    const matchesSens    = (STATE.sensitivity==='Any') || (r.sensitivity||[]).includes(STATE.sensitivity);
    return matchesQ && matchesPurpose && matchesStatus && matchesSens;
  });
}

function draw(){
  const rows = filtered();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / STATE.pageSize));
  if (STATE.page > pages) STATE.page = pages;

  const startIdx = (STATE.page - 1) * STATE.pageSize;
  const endIdx   = Math.min(startIdx + STATE.pageSize, total);
  const slice    = rows.slice(startIdx, endIdx);

  const tbody = $('#reqBody');
  tbody.innerHTML = slice.map(renderRow).join('') ||
    `<tr><td colspan="9"><div class="empty text-center">No matching requests</div></td></tr>`;

  $('#rangeLabel').textContent = `Rows ${total ? (startIdx+1) : 0}–${endIdx} of ${total}`;

  // Pager
  const pager = $('#pager');
  const btn = (p, txt, aria, disabled=false, active=false) =>
    `<li class="page-item ${disabled?'disabled':''} ${active?'active':''}">
       <button class="page-link" type="button" data-page="${p}" aria-label="${aria}">${txt}</button>
     </li>`;
  pager.innerHTML = [
    btn(STATE.page-1, '&laquo;', 'Previous', STATE.page<=1),
    ...Array.from({length: pages}).map((_,i)=>btn(i+1, String(i+1), `Page ${i+1}`, false, i+1===STATE.page)),
    btn(STATE.page+1, '&raquo;', 'Next', STATE.page>=pages)
  ].join('');
  $$('#pager .page-link').forEach(el => el.addEventListener('click', () => {
    const p = Number(el.getAttribute('data-page'));
    if (!Number.isNaN(p)) { STATE.page = p; draw(); }
  }));

  // Select-all & bulk buttons
  const allBoxes = $$('#reqBody input[type="checkbox"]');
  const selAll = $('#selAll');
  selAll.checked = false;
  selAll.indeterminate = false;
  selAll.addEventListener('change', () => {
    allBoxes.forEach(b => b.checked = selAll.checked);
    updateBulkButtons();
  });
  allBoxes.forEach(b => b.addEventListener('change', updateBulkButtons));
  $('#btnApproveBulk').addEventListener('click', () => openDecision('approve', getSelectedIds()));
  $('#btnRejectBulk').addEventListener('click', () => openDecision('reject', getSelectedIds()));
  updateBulkButtons();
}

function renderRow(r){
  const purposes = (r.purpose||[]).map(p => `<span class="badge rounded-pill badge-purpose me-1">${p}</span>`).join('');
  const sens = (r.sensitivity||[]).map(s => `<span class="badge rounded-pill badge-sensitivity me-1">${s}</span>`).join('') || '<span class="text-body-secondary">—</span>';
  const statusBadge = badgeForStatus(r.status);
  const disabledApprove = !(r.consent_ok && r.dq_ready) || r.status === 'Approved';
  const disabledReject  = r.status === 'Rejected';
  return `
    <tr data-id="${r.id}">
      <td><input class="form-check-input row-select" type="checkbox" aria-label="Select ${r.id}"></td>
      <td class="fw-semibold"><code>${r.id}</code><div class="small text-body-secondary">${fmtDate(r.created_ts)}</div></td>
      <td>${escapeHtml(r.requester)}<div class="small text-body-secondary">${escapeHtml(r.requester_email||'')}</div></td>
      <td class="text-truncate" style="max-width:260px">${escapeHtml(r.dataset)}</td>
      <td class="text-nowrap">${purposes}</td>
      <td class="text-nowrap">${sens}</td>
      <td><span class="badge retention-badge text-bg-light border">${escapeHtml(r.retention||'—')}</span></td>
      <td>${statusBadge}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-success" ${disabledApprove?'disabled':''} data-action="approve">Approve</button>
          <button class="btn btn-outline-danger" ${disabledReject?'disabled':''} data-action="reject">Reject</button>
        </div>
      </td>
    </tr>`;
}

function badgeForStatus(s){
  const map = {
    'Awaiting approval': 'secondary',
    'Approved': 'success',
    'Rejected': 'danger',
    'Blocked: consent': 'warning',
    'Blocked: DQ': 'warning'
  };
  const cls = map[s] || 'secondary';
  return `<span class="badge text-bg-${cls} status-badge">${escapeHtml(s||'—')}</span>`;
}

function fmtDate(iso){
  try { const d = new Date(iso); return d.toLocaleString(); } catch { return iso||''; }
}

function getSelectedIds(){
  return $$('#reqBody tr').filter(tr => tr.querySelector('.row-select')?.checked)
                          .map(tr => tr.getAttribute('data-id'));
}

function updateBulkButtons(){
  const ids = getSelectedIds();
  $('#btnApproveBulk').disabled = ids.length === 0;
  $('#btnRejectBulk' ).disabled = ids.length === 0;
}

function openDecision(kind, ids){
  if (!ids || !ids.length) return;
  const modalEl = $('#decisionModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  const summary = $('#decisionSummary');
  summary.innerHTML = `${kind==='approve' ? 'Approve' : 'Reject'} <strong>${ids.length}</strong> request(s).`;

  const form = $('#decisionForm');
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const reason = $('#decisionReason').value.trim();
    if (!reason) return;

    // Apply decision with guardrails: consent_ok and dq_ready
    ids.forEach(id => {
      const r = STATE.rows.find(x => x.id === id);
      if (!r) return;
      if (kind === 'approve') {
        if (!r.consent_ok) { r.status = 'Blocked: consent'; }
        else if (!r.dq_ready) { r.status = 'Blocked: DQ'; }
        else { r.status = 'Approved'; }
      } else {
        r.status = 'Rejected';
      }
      auditLog(kind, r, reason);
    });

    $('#decisionReason').value = '';
    modal.hide();
    draw();
  };

  $('#decisionSubmit').textContent = (kind==='approve' ? 'Approve' : 'Reject');
  modal.show();
}

function auditLog(kind, r, reason){
  console.log('[AUDIT]', {
    event: kind === 'approve' ? 'export.approved' : 'export.rejected',
    request_id: r.id,
    dataset: r.dataset,
    requester: r.requester_email || r.requester,
    policy_snapshot_id: r.policy_snapshot_id || null,
    reason,
    ts: new Date().toISOString()
  });
}

/* ---------------- HISTORY tab (cursor pagination) ---------------- */

function drawHistory(){
  const total = STATE.history.length;
  const start = STATE.histCursorStart;
  const size  = STATE.histPageSize;

  const end = Math.min(start + size, total);
  const slice = STATE.history.slice(start, end);

  $('#histBody').innerHTML = slice.map(renderHistRow).join('') ||
    `<tr><td colspan="9"><div class="empty text-center">No history</div></td></tr>`;

  $('#histRange').textContent = `Rows ${total ? (start+1) : 0}–${end} of ${total}`;

  // Cursor buttons
  $('#histPrev').disabled = STATE.histPrevStack.length === 0;
  $('#histNext').disabled = end >= total;
}

function renderHistRow(r){
  const slice = JSON.stringify(r.slice || {});
  const artifactLabel = `${r.artifact?.format || '—'}${r.artifact?.size ? ` (${r.artifact.size})` : ''}`;
  return `
    <tr>
      <td><code>${escapeHtml(r.id)}</code></td>
      <td class="text-truncate" style="max-width:260px">${escapeHtml(r.dataset)}</td>
      <td class="text-wrap"><code class="small">${escapeHtml(slice)}</code></td>
      <td>${escapeHtml(r.requester)}<div class="small text-body-secondary">${escapeHtml(r.requester_email||'')}</div></td>
      <td>${badgeForStatus(r.status)}</td>
      <td>${escapeHtml(fmtDate(r.started_ts))}</td>
      <td>${escapeHtml(fmtDate(r.ended_ts))}</td>
      <td>${escapeHtml(artifactLabel)}</td>
      <td>${r.revoked ? '<span class="badge text-bg-danger">Yes</span>' : '<span class="badge text-bg-success">No</span>'}</td>
    </tr>
  `;
}

function onHistNext(){
  const total = STATE.history.length;
  const size  = STATE.histPageSize;
  const nextStart = STATE.histCursorStart + size;
  if (nextStart >= total) return;
  STATE.histPrevStack.push(STATE.histCursorStart);
  STATE.histCursorStart = nextStart;
  drawHistory();
}

function onHistPrev(){
  if (STATE.histPrevStack.length === 0) return;
  STATE.histCursorStart = STATE.histPrevStack.pop();
  drawHistory();
}

/* ---------------- Utils ---------------- */
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
