/* Promotion Approvals (Steward) — production-ready
 * FIX: Persist decisions by updating STATE.raw.requests in-place (not detached copies)
 * - Multi-step flows per route (from→to), step-level approve/reject
 * - Auto-gates: DQ threshold & gate PASS required; allows Waiver capture
 * - Search + filters + pagination; Evidence panel; CSV export; audit stubs
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const JSON_URL = 'promotion-approvals.json';

// Demo: current user's roles for step enforcement.
const CURRENT_ROLES = ['Data Steward']; // add 'Platform Admin' to demo step 2

const STATE = {
  raw: null,
  page: 1,
  pageSize: 10,
  q: '',
  fromEnv: 'Any',
  toEnv: 'Any',
  status: 'Any',
  selected: new Set()
};

(async function init(){
  const d = await fetch(JSON_URL, { cache: 'no-store' })
    .then(r => r.json())
    .catch(() => ({ defaults:{pageSize:10,envs:[],statuses:[],dq_thresholds:{},flows:[]}, requests:[] }));

  STATE.raw = d;
  STATE.pageSize = d?.defaults?.pageSize || 10;
  renderShell(d);
  wireGlobal(d);
  draw();
})();

/* ---------- Render ---------- */
function renderShell(d){
  $('#app-main').innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">Promotion Approvals</h1>
        <div class="small text-body-secondary">Multi-step approvals with auto-gates and waiver controls. Your roles: <code>${escapeHtml(CURRENT_ROLES.join(', '))}</code></div>
      </div>
      <div class="d-flex actions">
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm" type="button" aria-label="Refresh">
          <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Refresh
        </button>
        <button id="btnExport" class="btn btn-outline-secondary btn-sm" type="button">Export CSV</button>
        <button id="btnApprove" class="btn btn-success btn-sm" type="button" disabled>Approve selected</button>
        <button id="btnReject" class="btn btn-outline-danger btn-sm" type="button" disabled>Reject selected</button>
      </div>
    </div>

    <div class="card shadow-sm">
      <div class="card-body border-bottom bg-body-tertiary filters">
        <form class="row g-2 align-items-end" id="filterForm">
          <div class="col-12 col-sm-6 col-md-4 col-xl-3">
            <label for="search" class="form-label small text-body-secondary">Search (dataset, id, requester)</label>
            <input id="search" class="form-control form-control-sm" placeholder="Type to search…">
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="fromEnv" class="form-label small text-body-secondary">From</label>
            <select id="fromEnv" class="form-select form-select-sm"><option>Any</option>${(d.defaults?.envs||[]).map(e=>`<option>${e}</option>`).join('')}</select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="toEnv" class="form-label small text-body-secondary">To</label>
            <select id="toEnv" class="form-select form-select-sm"><option>Any</option>${(d.defaults?.envs||[]).map(e=>`<option>${e}</option>`).join('')}</select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="status" class="form-label small text-body-secondary">Status</label>
            <select id="status" class="form-select form-select-sm"><option>Any</option>${(d.defaults?.statuses||[]).map(s=>`<option>${s}</option>`).join('')}</select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="pageSize" class="form-label small text-body-secondary">Rows per page</label>
            <select id="pageSize" class="form-select form-select-sm page-size">
              ${[10,20,50].map(n=>`<option value="${n}" ${n==(STATE.pageSize||10)?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
        </form>
      </div>

      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th style="width:1%"><input id="selAll" class="form-check-input" type="checkbox" aria-label="Select all"></th>
              <th>Request</th>
              <th>From → To</th>
              <th>Dataset</th>
              <th>Gates</th>
              <th>DQ</th>
              <th>Current step</th>
              <th>Requested</th>
              <th>Requested By</th>
              <th>Status</th>
              <th class="text-end">Action</th>
            </tr>
          </thead>
          <tbody id="rows"><tr><td colspan="11"><div class="empty text-center">Loading…</div></td></tr></tbody>
        </table>
      </div>

      <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
        <div id="rangeLabel" class="small text-body-secondary">Rows 0–0 of 0</div>
        <nav aria-label="Pagination"><ul class="pagination pagination-sm mb-0" id="pager"></ul></nav>
      </div>
    </div>

    <!-- Decision Modal -->
    <div class="modal fade" id="decisionModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <form class="modal-content" id="decisionForm">
          <div class="modal-header">
            <h2 class="modal-title fs-6" id="decisionTitle">Approve</h2>
            <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div id="decisionSummary" class="small mb-2"></div>

            <div class="alert alert-warning d-none" id="gateBlock" role="status">
              Auto-gates are not satisfied. Provide a waiver reason to proceed (if policy allows).
            </div>

            <div class="mb-2">
              <label class="form-label" for="decisionReason">Reason (required)</label>
              <textarea id="decisionReason" class="form-control" rows="3" required placeholder="Explain decision & scope (e.g., gates passed or waiver context)…"></textarea>
            </div>

            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="useWaiver">
              <label class="form-check-label" for="useWaiver">Approve with waiver</label>
            </div>

            <div class="small text-body-secondary">All decisions and waivers are auditable. Waivers should be time-bounded per policy.</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-primary" id="decisionSubmit" type="submit">Submit</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Evidence Offcanvas -->
    <div class="offcanvas offcanvas-end" tabindex="-1" id="evidencePanel" aria-labelledby="evidenceTitle">
      <div class="offcanvas-header">
        <h2 class="offcanvas-title fs-6" id="evidenceTitle">Evidence</h2>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
      </div>
      <div class="offcanvas-body">
        <div class="small text-body-secondary">Gate outcomes, schema/row deltas, approvals/waiver trail, and run context.</div>
        <pre id="evidencePre" class="small mt-2 mb-0"></pre>
      </div>
    </div>
  `;
}

/* ---------- Wiring ---------- */
function wireGlobal(d){
  $('#btnRefresh').addEventListener('click', () => location.reload());
  $('#btnExport').addEventListener('click', exportCsv);

  $('#filterForm')?.addEventListener('submit', e => e.preventDefault());
  $('#search').addEventListener('input', e => { STATE.q = e.target.value.trim().toLowerCase(); STATE.page = 1; draw(); });
  $('#fromEnv').addEventListener('change', e => { STATE.fromEnv = e.target.value; STATE.page = 1; draw(); });
  $('#toEnv').addEventListener('change', e => { STATE.toEnv = e.target.value; STATE.page = 1; draw(); });
  $('#status').addEventListener('change', e => { STATE.status = e.target.value; STATE.page = 1; draw(); });
  $('#pageSize').addEventListener('change', e => { STATE.pageSize = Number(e.target.value)||10; STATE.page = 1; draw(); });

  document.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-id]');
    const evidenceBtn = e.target.closest('[data-evidence]');
    const approveBtn = e.target.closest('[data-approve]');
    const rejectBtn  = e.target.closest('[data-reject]');
    const checkbox   = e.target.closest('input[data-select]');

    if (evidenceBtn && row){ openEvidence(row.dataset.id); return; }
    if (approveBtn && row){ openDecision([row.dataset.id], 'Approve'); return; }
    if (rejectBtn && row){ openDecision([row.dataset.id], 'Reject'); return; }
    if (checkbox){
      const id = checkbox.getAttribute('data-select');
      if (checkbox.checked) STATE.selected.add(id); else STATE.selected.delete(id);
      updateBulkButtons();
      const all = $$('#rows input[type="checkbox"][data-select]');
      const checked = all.filter(c => c.checked).length;
      const selAll = $('#selAll');
      selAll.indeterminate = checked > 0 && checked < all.length;
      selAll.checked = checked === all.length;
    }
  });

  $('#selAll').addEventListener('change', (e) => {
    const all = $$('#rows input[type="checkbox"][data-select]');
    all.forEach(c => { c.checked = e.target.checked; const id = c.getAttribute('data-select'); if (e.target.checked) STATE.selected.add(id); else STATE.selected.delete(id); });
    updateBulkButtons();
  });

  $('#btnApprove').addEventListener('click', () => openDecision(Array.from(STATE.selected), 'Approve'));
  $('#btnReject').addEventListener('click', () => openDecision(Array.from(STATE.selected), 'Reject'));
}

function updateBulkButtons(){
  const has = STATE.selected.size > 0;
  $('#btnApprove').disabled = !has;
  $('#btnReject').disabled = !has;
}

/* ---------- Data helpers ---------- */
function findFlow(from, to){
  return (STATE.raw.defaults?.flows||[]).find(f => f.from===from && f.to===to) || null;
}
function getById(id){ return STATE.raw.requests.find(r => r.id === id) || null; }
function replaceById(obj){
  const idx = STATE.raw.requests.findIndex(r => r.id === obj.id);
  if (idx >= 0) STATE.raw.requests[idx] = obj;
}
function currentStep(r){
  const flow = findFlow(r.from, r.to);
  if (!flow) return null;
  const steps = materializeApprovals(r, flow);
  const idx = steps.findIndex(s => s.state === 'Pending');
  if (idx === -1) return null;
  return { index: idx, step: steps[idx], steps };
}
function materializeApprovals(r, flow){
  const given = r.approvals || [];
  const base = (flow.steps||[]).map((s, i) => {
    const match = given.find(g => g.step === i+1) || {};
    return {
      step: i+1,
      role: s.role,
      name: s.name,
      state: match.state || 'Pending',
      actor: match.actor || null,
      at: match.at || null,
      reason: match.reason || null
    };
  });
  return base;
}
function gatesOk(r){
  const gateStatuses = (r.gates||[]).every(g => (g.status||'').toUpperCase()==='PASS');
  const targetThresh = STATE.raw.defaults?.dq_thresholds?.[r.to] ?? 95.0;
  const dqOk = (r.dq_score!=null) ? (Number(r.dq_score) >= Number(targetThresh)) : false;
  return gateStatuses && dqOk;
}

/* ---------- Evidence & Decisions ---------- */
function openEvidence(id){
  const r = getById(id);
  if (!r) return;
  const pack = {
    request: r,
    gates_ok: gatesOk(r),
    dq_threshold_target: STATE.raw.defaults?.dq_thresholds?.[r.to] ?? null,
    flow: findFlow(r.from, r.to),
    approvals: r.approvals || [],
    waiver: r.waiver || null
  };
  $('#evidenceTitle').textContent = `Evidence — ${r.id}`;
  $('#evidencePre').textContent = JSON.stringify(pack, null, 2);
  bootstrap.Offcanvas.getOrCreateInstance($('#evidencePanel')).show();
}

function openDecision(ids, kind){
  if (!ids?.length) return;

  const summaries = ids.map(id => {
    const r = getById(id);
    const cur = r ? currentStep(r) : null;
    const label = r ? (cur ? `${r.id} — Step ${cur.index+1}: ${cur.step.name} (${cur.step.role})` : `${r.id} — Flow complete`) : id;
    return label;
  }).join('\n');

  $('#decisionTitle').textContent = `${kind} step`;
  $('#decisionSummary').textContent = summaries;
  $('#useWaiver').checked = false;
  $('#gateBlock').classList.add('d-none');
  const modal = bootstrap.Modal.getOrCreateInstance($('#decisionModal'));

  const blocked = kind === 'Approve' && ids.some(id => {
    const r = getById(id);
    return r && !gatesOk(r) && !r.waiver;
  });
  if (blocked) $('#gateBlock').classList.remove('d-none');

  $('#decisionForm').onsubmit = (ev) => {
    ev.preventDefault();
    const reason = $('#decisionReason').value.trim();
    if (!reason) return;
    const useWaiver = $('#useWaiver').checked;

    ids.forEach(id => {
      const r = getById(id);
      if (!r) return;

      const flow = findFlow(r.from, r.to);
      const cur = currentStep(r);
      if (!flow || !cur) return;

      if (!CURRENT_ROLES.includes(cur.step.role)) return;

      if (kind === 'Approve' && !gatesOk(r) && !useWaiver && !r.waiver) {
        audit('promotion.approve.blocked', { id: r.id, step: cur.index+1, reason: 'Auto-gates not satisfied and no waiver' });
        return;
      }

      if (useWaiver && !r.waiver) {
        r.waiver = { reason, actor: actorEmail(), at: new Date().toISOString() };
        audit('promotion.waiver.recorded', { id: r.id, reason });
      }

      // Apply decision in-place
      r.approvals = materializeApprovals(r, flow);
      r.approvals[cur.index].state  = (kind === 'Approve' ? 'Approved' : 'Rejected');
      r.approvals[cur.index].actor  = actorEmail();
      r.approvals[cur.index].at     = new Date().toISOString();
      r.approvals[cur.index].reason = reason;

      // Overall status
      if (r.approvals.some(s => s.state === 'Rejected')) {
        r.status = 'Rejected';
      } else if (r.approvals.every(s => s.state === 'Approved')) {
        r.status = 'Approved';
      } else {
        r.status = 'Pending';
      }

      replaceById(r); // <— persist change to master array
      audit(kind === 'Approve' ? 'promotion.step.approve' : 'promotion.step.reject', {
        id: r.id, step: cur.index+1, role: cur.step.role, reason, waiver_used: !!useWaiver
      });

      STATE.selected.delete(r.id);
    });

    $('#decisionReason').value = '';
    modal.hide();
    draw();
    updateBulkButtons();
  };

  modal.show();
}

/* ---------- Filtering & drawing ---------- */
function filtered(){
  const q = STATE.q;
  const has = (s) => String(s||'').toLowerCase().includes(q);
  return (STATE.raw.requests || []).filter(r => {
    const matchesQ = !q || has(r.dataset) || has(r.id) || has(r.requested_by) || has(r.summary||'');
    const matchesFrom = (STATE.fromEnv==='Any') || r.from === STATE.fromEnv;
    const matchesTo   = (STATE.toEnv==='Any')   || r.to === STATE.toEnv;
    const matchesSt   = (STATE.status==='Any')  || (r.status||'Pending') === STATE.status;
    return matchesQ && matchesFrom && matchesTo && matchesSt;
  });
}

function draw(){
  const rows = filtered().sort((a,b)=>String(b.requested_at||'').localeCompare(String(a.requested_at||'')));
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / STATE.pageSize));
  if (STATE.page > pages) STATE.page = pages;

  const startIdx = (STATE.page - 1) * STATE.pageSize;
  const endIdx   = Math.min(startIdx + STATE.pageSize, total);
  const slice    = rows.slice(startIdx, endIdx);

  $('#rows').innerHTML = slice.map(r => rowHtml(r)).join('') ||
    `<tr><td colspan="11"><div class="empty text-center">No matching requests</div></td></tr>`;

  $('#rangeLabel').textContent = `Rows ${total ? (startIdx+1) : 0}–${endIdx} of ${total}`;

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
}

function rowHtml(r){
  const gates = (r.gates||[]).map(g => `<span class="badge rounded-pill badge-gate me-1">${escapeHtml(g.name)}: <strong>${escapeHtml(g.status)}</strong></span>`).join('');
  const status = r.status || 'Pending';
  const stBadge = `<span class="badge rounded-pill badge-status" data-status="${escapeAttr(status)}">${escapeHtml(status)}</span>`;
  const env = `<span class="badge rounded-pill badge-env me-1">${escapeHtml(r.from)}</span> → <span class="badge rounded-pill badge-env ms-1">${escapeHtml(r.to)}</span>`;

  const flow = findFlow(r.from, r.to);
  const cur = currentStep(r);
  const curStepLabel = cur ? `<span class="badge rounded-pill badge-step" data-state="${escapeAttr(cur.step.state.toLowerCase())}">${escapeHtml(cur.step.name)} — ${escapeHtml(cur.step.state)}</span>` : '<span class="badge rounded-pill badge-step" data-state="approved">Flow complete</span>';

  const waiver = r.waiver ? `<span class="badge rounded-pill badge-waiver ms-1" title="${escapeAttr(r.waiver.reason)}">Waiver</span>` : '';
  const canAct = !!cur && CURRENT_ROLES.includes(cur.step.role) && status === 'Pending';

  return `
    <tr data-id="${escapeAttr(r.id)}">
      <td><input class="form-check-input" type="checkbox" data-select="${escapeAttr(r.id)}" ${STATE.selected.has(r.id)?'checked':''}></td>
      <td class="fw-semibold text-nowrap"><code>${escapeHtml(r.id)}</code>${waiver}</td>
      <td class="text-nowrap">${env}</td>
      <td class="text-nowrap">${escapeHtml(r.dataset)}</td>
      <td class="text-nowrap">${gates}</td>
      <td class="text-nowrap">${(r.dq_score!=null)? escapeHtml(String(r.dq_score))+'%' : '—'}</td>
      <td class="text-nowrap">${curStepLabel}</td>
      <td class="text-nowrap">${escapeHtml((r.requested_at||'').replace('T',' ').replace('Z','Z'))}</td>
      <td class="text-nowrap">${escapeHtml(r.requested_by||'')}</td>
      <td class="text-nowrap">${stBadge}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-evidence>Evidence</button>
          <button class="btn btn-success" data-approve ${canAct?'':'disabled'}>Approve step</button>
          <button class="btn btn-outline-danger" data-reject ${canAct?'':'disabled'}>Reject step</button>
        </div>
        <div class="small text-body-secondary mt-1">${flow ? `Flow: ${escapeHtml(flow.from)} → ${escapeHtml(flow.to)} (${(flow.steps||[]).map(s=>s.role).join(' → ')})` : ''}</div>
      </td>
    </tr>`;
}

/* ---------- Export & Utils ---------- */
function exportCsv(){
  const rows = filtered();
  const headers = ['id','from','to','dataset','dq_score','requested_at','requested_by','status','gates','current_step','waiver_reason','approvals_summary'];
  const body = rows.map(r => {
    const cur = currentStep(r);
    const curLbl = cur ? `Step ${cur.index+1}: ${cur.step.name} (${cur.step.state})` : 'Flow complete';
    const appr = (materializeApprovals(r, findFlow(r.from, r.to))||[]).map(a=>`${a.step}:${a.role}:${a.state}`).join('; ');
    return [
      r.id, r.from, r.to, r.dataset, (r.dq_score!=null? r.dq_score+'%' : ''),
      r.requested_at||'', r.requested_by||'', r.status||'Pending',
      (r.gates||[]).map(g=>`${g.name}:${g.status}`).join('; '),
      curLbl,
      r.waiver?.reason || '',
      appr
    ].map(x => `"${String(x??'').replace(/"/g,'""')}"`).join(',');
  });
  const csv = [headers.join(','), ...body].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edx-promotion-approvals-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  audit('promotion.export.csv', { rows: rows.length });
}

function actorEmail(){ return CURRENT_ROLES.includes('Platform Admin') ? 'admin@district.edu' : 'steward@district.edu'; }
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
function updateBulkButtons(){
  const has = STATE.selected.size > 0;
  $('#btnApprove').disabled = !has;
  $('#btnReject').disabled = !has;
}
function audit(event, payload){ console.log('[AUDIT]', { event, payload, ts: new Date().toISOString() }); }
