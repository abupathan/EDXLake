/* Approvals Queue (Steward) — production-ready
 * Adds: Evidence summary with consent context, effective Masking plan, and RLS predicate.
 * - Reads approvals-queue.json (existing)
 * - Optionally reads policy-simulator.json to resolve dataset consent/masking/RLS
 * - CSP-safe (no inline code)
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const JSON_URL = 'approvals-queue.json';
const POLICY_URL = 'policy-simulator.json'; // optional enrichment (if present)

const CURRENT_ROLES = ['Data Steward'];

const STATE = {
  raw: null,
  policy: null,        // optional policy matrix
  page: 1,
  pageSize: 10,
  q: '',
  type: 'Any',
  status: 'Any',
  priority: 'Any',
  fromEnv: 'Any',
  toEnv: 'Any',
  selected: new Set()
};

(async function init(){
  const d = await fetch(JSON_URL, { cache: 'no-store' })
    .then(r => r.json())
    .catch(() => ({ defaults:{pageSize:10,types:[],statuses:[],priorities:[],envs:[],dq_thresholds:{}}, items:[] }));

  // Try to load policy metadata (non-fatal if missing)
  const policy = await fetch(POLICY_URL, { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .catch(() => null);

  STATE.raw = d;
  STATE.policy = policy;
  STATE.pageSize = d?.defaults?.pageSize || 10;

  renderShell(d);
  wireGlobal(d);
  draw();
})();

/* ---------- Shell ---------- */
function renderShell(d){
  $('#app-main').innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">Approvals Queue</h1>
        <div class="small text-body-secondary">Your roles: <code>${escapeHtml(CURRENT_ROLES.join(', '))}</code></div>
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
            <label for="search" class="form-label small text-body-secondary">Search (title, dataset, id, requester)</label>
            <input id="search" class="form-control form-control-sm" placeholder="Type to search…">
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="type" class="form-label small text-body-secondary">Type</label>
            <select id="type" class="form-select form-select-sm"><option>Any</option>${(d.defaults?.types||[]).map(t=>`<option>${t}</option>`).join('')}</select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="status" class="form-label small text-body-secondary">Status</label>
            <select id="status" class="form-select form-select-sm"><option>Any</option>${(d.defaults?.statuses||[]).map(s=>`<option>${s}</option>`).join('')}</select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="priority" class="form-label small text-body-secondary">Priority</label>
            <select id="priority" class="form-select form-select-sm"><option>Any</option>${(d.defaults?.priorities||[]).map(p=>`<option>${p}</option>`).join('')}</select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="fromEnv" class="form-label small text-body-secondary">From</label>
            <select id="fromEnv" class="form-select form-select-sm"><option>Any</option>${(d.defaults?.envs||[]).map(e=>`<option>${e}</option>`).join('')}</select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="toEnv" class="form-label small text-body-secondary">To</label>
            <select id="toEnv" class="form-select form-select-sm"><option>Any</option>${(d.defaults?.envs||[]).map(e=>`<option>${e}</option>`).join('')}</select>
          </div>
          <div class="col-12">
            <div class="small text-body-secondary">Env filters apply to Promotion items only.</div>
          </div>
          <div class="col-12 col-sm-6 col-md-4 col-xl-3">
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
              <th>Item</th>
              <th>Type</th>
              <th>Context</th>
              <th>Summary</th>
              <th>Created</th>
              <th>Requester</th>
              <th>Priority</th>
              <th>Status</th>
              <th class="text-end">Action</th>
            </tr>
          </thead>
          <tbody id="rows"><tr><td colspan="10"><div class="empty text-center">Loading…</div></td></tr></tbody>
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
              Auto-gates are not satisfied. Provide a waiver reason to proceed (Promotion items).
            </div>

            <div class="mb-2">
              <label class="form-label" for="decisionReason">Reason (required)</label>
              <textarea id="decisionReason" class="form-control" rows="3" required placeholder="Explain decision & scope…"></textarea>
            </div>

            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="useWaiver">
              <label class="form-check-label" for="useWaiver">Approve Promotion items with waiver</label>
            </div>

            <div class="small text-body-secondary">All decisions are auditable. Waivers should be time-bounded.</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-primary" id="decisionSubmit" type="submit">Submit</button>
          </div>
        </form>
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
  $('#type').addEventListener('change', e => { STATE.type = e.target.value; STATE.page = 1; draw(); });
  $('#status').addEventListener('change', e => { STATE.status = e.target.value; STATE.page = 1; draw(); });
  $('#priority').addEventListener('change', e => { STATE.priority = e.target.value; STATE.page = 1; draw(); });
  $('#fromEnv').addEventListener('change', e => { STATE.fromEnv = e.target.value; STATE.page = 1; draw(); });
  $('#toEnv').addEventListener('change', e => { STATE.toEnv = e.target.value; STATE.page = 1; draw(); });
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

/* ---------- Data helpers ---------- */
function getById(id){ return STATE.raw.items.find(x => x.id === id) || null; }
function replaceById(obj){
  const idx = STATE.raw.items.findIndex(x => x.id === obj.id);
  if (idx >= 0) STATE.raw.items[idx] = obj;
}

function gatesOk(item){
  if (item.type !== 'Promotion') return true;
  const gatePass = (item.gates||[]).every(g => (g.status||'').toUpperCase()==='PASS');
  const thresh = STATE.raw.defaults?.dq_thresholds?.[item.to] ?? 95.0;
  const dqOk = (item.dq_score!=null) ? (Number(item.dq_score) >= Number(thresh)) : false;
  return gatePass && dqOk;
}

function curStep(item){
  if (item.type !== 'Promotion') return null;
  const flow = item.flow || {};
  const steps = flow.steps || [];
  const idx = (typeof flow.current_step === 'number')
    ? steps.findIndex(s => s.step === flow.current_step)
    : steps.findIndex(s => (s.state||'Pending') === 'Pending');
  if (idx < 0) return null;
  return steps[idx];
}

/* ---------- Filtering & drawing ---------- */
function filtered(){
  const q = STATE.q;
  const has = (s) => String(s||'').toLowerCase().includes(q);
  return (STATE.raw.items || []).filter(it => {
    const matchesQ = !q || has(it.title) || has(it.dataset||'') || has(it.id) || has(it.requester||'') || has(it.summary||'');
    const matchesType = (STATE.type==='Any') || it.type === STATE.type;
    const matchesStatus = (STATE.status==='Any') || (it.status||'Pending') === STATE.status;
    const matchesPriority = (STATE.priority==='Any') || it.priority === STATE.priority;
    const matchesFrom = (STATE.fromEnv==='Any') || (it.type==='Promotion' && it.from === STATE.fromEnv);
    const matchesTo   = (STATE.toEnv==='Any')   || (it.type==='Promotion' && it.to   === STATE.toEnv);
    return matchesQ && matchesType && matchesStatus && matchesPriority && matchesFrom && matchesTo;
  });
}

function draw(){
  const rows = filtered().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / STATE.pageSize));
  if (STATE.page > pages) STATE.page = pages;

  const startIdx = (STATE.page - 1) * STATE.pageSize;
  const endIdx   = Math.min(startIdx + STATE.pageSize, total);
  const slice    = rows.slice(startIdx, endIdx);

  $('#rows').innerHTML = slice.map(rowHtml).join('') || `<tr><td colspan="10"><div class="empty text-center">No matching items</div></td></tr>`;
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

function rowHtml(it){
  const typeBadge = `<span class="badge rounded-pill badge-type">${escapeHtml(it.type)}</span>`;
  const prBadge = `<span class="badge rounded-pill badge-priority" data-level="${escapeAttr(it.priority||'')}">${escapeHtml(it.priority||'')}</span>`;
  const st = it.status || 'Pending';
  const stBadge = `<span class="badge rounded-pill badge-status" data-status="${escapeAttr(st)}">${escapeHtml(st)}</span>`;

  let context = '—';
  let stepBadge = '';
  let canAct = st === 'Pending';

  if (it.type === 'Promotion') {
    const env = `<span class="badge rounded-pill badge-env me-1">${escapeHtml(it.from)}</span> → <span class="badge rounded-pill badge-env ms-1">${escapeHtml(it.to)}</span>`;
    context = `${env} ${it.dataset ? ' · ' + escapeHtml(it.dataset) : ''}`;
    const s = curStep(it);
    if (s) {
      stepBadge = `<span class="badge rounded-pill badge-step ms-1" data-state="${escapeAttr((s.state||'Pending').toLowerCase())}">${escapeHtml(s.name)} — ${escapeHtml(s.state||'Pending')}</span>`;
      canAct = canAct && CURRENT_ROLES.includes(s.role);
    } else {
      stepBadge = `<span class="badge rounded-pill badge-step ms-1" data-state="approved">Flow complete</span>`;
      canAct = false;
    }
  } else if (it.type === 'DQ Waiver') {
    context = `${escapeHtml(it.dataset||'')} · Rule: ${escapeHtml(it.rule||'')} · Window: ${escapeHtml(it.window||'')}`;
  } else if (it.type === 'Export') {
    context = `${escapeHtml(it.dataset||'')} · Slice: ${escapeHtml(it.slice||'')}`;
  } else if (it.type === 'Policy') {
    context = `${escapeHtml(it.dataset||'')} · ${escapeHtml(it.change?.category||'Change')}`;
  }

  const waiverBadge = (it.type === 'Promotion' && it.waiver) ? `<span class="badge rounded-pill badge-waiver ms-1" title="${escapeAttr(it.waiver.reason||'Waiver')}">Waiver</span>` : '';

  return `
    <tr data-id="${escapeAttr(it.id)}">
      <td><input class="form-check-input" type="checkbox" data-select="${escapeAttr(it.id)}" ${STATE.selected.has(it.id)?'checked':''}></td>
      <td class="fw-semibold text-nowrap"><code>${escapeHtml(it.id)}</code> ${waiverBadge}<div class="small text-body-secondary">${escapeHtml(it.title||'')}</div></td>
      <td class="text-nowrap">${typeBadge}</td>
      <td class="text-trunc" title="${escapeAttr(context)}">${context}${stepBadge}</td>
      <td class="text-trunc" title="${escapeAttr(it.summary||'')}">${escapeHtml(it.summary||'')}</td>
      <td class="text-nowrap">${escapeHtml((it.created_at||'').replace('T',' ').replace('Z','Z'))}</td>
      <td class="text-nowrap">${escapeHtml(it.requester||'')}</td>
      <td class="text-nowrap">${prBadge}</td>
      <td class="text-nowrap">${stBadge}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-evidence>Evidence</button>
          <button class="btn btn-success" data-approve ${canAct?'':'disabled'}>Approve</button>
          <button class="btn btn-outline-danger" data-reject ${canAct?'':'disabled'}>Reject</button>
        </div>
      </td>
    </tr>`;
}

/* ---------- Evidence & Decisions ---------- */

// Build policy-derived evidence when possible
function resolvePolicyEvidence(item){
  const P = STATE.policy;
  if (!P || !item?.dataset) return { consent: {required: null, satisfied: null, message:'Unknown (policy metadata unavailable)'},
                                     rls_predicate: 'Unknown',
                                     masking: { purpose: 'Operational', columns: [], summary: 'Unknown' } };

  const ds = (P.datasets||[]).find(x => x.name === item.dataset);
  const rules = P.row_policies?.rules || [];
  const purpose = 'Operational';

  // Consent
  const consentRequired = !!ds?.consent_required;
  const consent = { required: consentRequired, satisfied: null, message: consentRequired ? 'Required (state not provided here)' : 'Not required' };

  // RLS predicate (AND of rules)
  const rlsClauses = rules.map(r => `(${r.dimension} IN [${(r.values||[]).map(v=>`"${v}"`).join(', ')}])`);
  const rls_predicate = rlsClauses.length ? rlsClauses.join(' AND ') : 'TRUE';

  // Masking plan per column
  const strength = ['NONE','PARTIAL_MASK','HASH','TOKENIZE','REDACT','FULL_MASK'];
  const maskFor = (tags=[]) => {
    const decisions = tags.map(tag => (P.mask_policies?.[tag]||{})[purpose]).filter(Boolean);
    if (!decisions.length) return 'NONE';
    return decisions.map(v => (v||'').toUpperCase()).reduce((a,b)=> strength.indexOf(b) > strength.indexOf(a) ? b : a, 'NONE');
  };

  const columns = (ds?.columns||[]).map(c => ({
    column: c.name,
    classifications: c.classifications || [],
    mask: maskFor(c.classifications||[])
  }));

  const maskedCounts = columns.reduce((acc,c)=>{ acc[c.mask]=(acc[c.mask]||0)+1; return acc; },{});
  const summary = Object.keys(maskedCounts).sort().map(k=>`${k}:${maskedCounts[k]}`).join(' · ') || 'NONE';

  return { consent, rls_predicate, masking: { purpose, columns, summary } };
}

function openEvidence(id){
  const it = getById(id);
  if (!it) return;

  // Compose base pack
  const pack = {
    item: it,
    kind: it.type,
    promotion: it.type==='Promotion' ? {
      gates_ok: gatesOk(it),
      dq_threshold: STATE.raw.defaults?.dq_thresholds?.[it.to] ?? null,
      current_step: curStep(it),
      waiver: it.waiver || null
    } : null
  };

  // Enrich with policy evidence when a dataset is involved
  let policyPack = null;
  if (['Export','Promotion','Policy'].includes(it.type) && it.dataset){
    policyPack = resolvePolicyEvidence(it);
  }

  $('#evidenceTitle').textContent = `Evidence — ${it.id}`;

  // ------- Structured Summary (badges + quick facts) -------
  const consentBadge = policyPack
    ? (policyPack.consent.required === null
        ? `<span class="badge text-bg-secondary">Consent: Unknown</span>`
        : (policyPack.consent.required
            ? `<span class="badge text-bg-warning">Consent: Required</span>`
            : `<span class="badge text-bg-success">Consent: Not required</span>`))
    : `<span class="badge text-bg-secondary">Consent: N/A</span>`;

  const rlsBadge = policyPack
    ? `<span class="badge text-bg-info">RLS</span> <code class="d-block mt-1">${escapeHtml(policyPack.rls_predicate)}</code>`
    : `<span class="badge text-bg-secondary">RLS: N/A</span>`;

  const maskSummary = policyPack
    ? `<div><span class="badge text-bg-info">Masking</span> <span class="ms-1">${escapeHtml(policyPack.masking.summary)}</span></div>`
    : `<span class="badge text-bg-secondary">Masking: N/A</span>`;

  const colsTable = policyPack ? `
    <div class="table-responsive mt-2">
      <table class="table table-sm align-middle mb-0">
        <thead class="table-light"><tr><th>Column</th><th>Classifications</th><th>Mask</th></tr></thead>
        <tbody>
          ${policyPack.masking.columns.slice(0,50).map(c=>`
            <tr>
              <td><code>${escapeHtml(c.column)}</code></td>
              <td>${escapeHtml((c.classifications||[]).join(', ') || '—')}</td>
              <td>${escapeHtml(c.mask)}</td>
            </tr>`).join('') || `<tr><td colspan="3" class="text-center text-body-secondary">No columns</td></tr>`}
        </tbody>
      </table>
      <div class="small text-body-secondary mt-1">${policyPack.masking.columns.length>50 ? 'Showing first 50 columns…' : ''}</div>
    </div>` : '';

  $('#evidenceSummary').innerHTML = `
    <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
      <span class="badge text-bg-primary">Dataset: ${escapeHtml(it.dataset||'—')}</span>
      ${consentBadge}
    </div>
    <div class="mb-2">${rlsBadge}</div>
    <div class="mb-2">${maskSummary}</div>
    ${colsTable}
  `;

  // Raw evidence (preserved)
  const fullPack = { ...pack, policy: policyPack };
  $('#evidencePre').textContent = JSON.stringify(fullPack, null, 2);

  bootstrap.Offcanvas.getOrCreateInstance($('#evidencePanel')).show();
}

function openDecision(ids, kind){
  if (!ids?.length) return;

  const summaries = ids.map(id => {
    const it = getById(id);
    if (!it) return id;
    if (it.type === 'Promotion') {
      const step = curStep(it);
      const stepTxt = step ? ` — ${step.name} (${step.role})` : '';
      return `${it.id} [Promotion${stepTxt}]`;
    }
    return `${it.id} [${it.type}]`;
  }).join('\n');

  $('#decisionTitle').textContent = kind;
  $('#decisionSummary').textContent = summaries;
  $('#useWaiver').checked = false;
  $('#gateBlock').classList.add('d-none');

  const blocked = kind === 'Approve' && ids.some(id => {
    const it = getById(id);
    return it && it.type==='Promotion' && !gatesOk(it) && !it.waiver;
  });
  if (blocked) $('#gateBlock').classList.remove('d-none');

  const modal = bootstrap.Modal.getOrCreateInstance($('#decisionModal'));
  $('#decisionForm').onsubmit = (ev) => {
    ev.preventDefault();
    const reason = $('#decisionReason').value.trim();
    if (!reason) return;
    const useWaiver = $('#useWaiver').checked;

    ids.forEach(id => {
      const it = getById(id);
      if (!it || it.status !== 'Pending') return;

      if (it.type === 'Promotion') {
        const step = curStep(it);
        if (!step || !CURRENT_ROLES.includes(step.role)) {
          audit('queue.approval.blocked.role', { id: it.id, reason: 'Role mismatch or flow complete' });
          return;
        }
        if (kind === 'Approve' && !gatesOk(it) && !useWaiver && !it.waiver) {
          audit('queue.approval.blocked.gates', { id: it.id });
          return;
        }
        if (useWaiver && !it.waiver) {
          it.waiver = { reason, actor: actorEmail(), at: new Date().toISOString() };
          audit('queue.waiver.recorded', { id: it.id, reason });
        }
        // Step decision
        step.state = (kind === 'Approve' ? 'Approved' : 'Rejected');
        step.actor = actorEmail();
        step.at = new Date().toISOString();
        step.reason = reason;

        const nextPending = (it.flow?.steps||[]).find(s => s.state === 'Pending');
        if ((it.flow?.steps||[]).some(s => s.state === 'Rejected')) it.status = 'Rejected';
        else if (!nextPending) it.status = 'Approved';
        else it.status = 'Pending';

        replaceById(it);
        audit(kind === 'Approve' ? 'queue.promotion.approve' : 'queue.promotion.reject',
             { id: it.id, step: step.step, role: step.role, reason, waiver_used: !!useWaiver });

      } else {
        // Non-promotion items
        it.status = (kind === 'Approve' ? 'Approved' : 'Rejected');
        replaceById(it);
        audit(kind === 'Approve' ? 'queue.item.approve' : 'queue.item.reject', { id: it.id, type: it.type, reason });
      }

      STATE.selected.delete(it.id);
    });

    $('#decisionReason').value = '';
    modal.hide();
    draw();
    updateBulkButtons();
  };

  modal.show();
}

/* ---------- Export ---------- */
function exportCsv(){
  const rows = filtered();
  const headers = ['id','type','title','dataset','from','to','created_at','requester','priority','status','summary'];
  const body = rows.map(it => [
    it.id, it.type, it.title||'', it.dataset||'', it.from||'', it.to||'',
    it.created_at||'', it.requester||'', it.priority||'', it.status||'Pending', it.summary||''
  ].map(x => `"${String(x??'').replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','), ...body].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edx-approvals-queue-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  audit('queue.export.csv', { rows: rows.length });
}

/* ---------- Utils ---------- */
function actorEmail(){ return CURRENT_ROLES.includes('Platform Admin') ? 'admin@district.edu' : 'steward@district.edu'; }
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
function updateBulkButtons(){ const has = STATE.selected.size > 0; $('#btnApprove').disabled = !has; $('#btnReject').disabled = !has; }
function audit(event, payload){ console.log('[AUDIT]', { event, payload, ts: new Date().toISOString() }); }
