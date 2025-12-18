/* Data Shares (Steward) — production-ready
 * - CSP-safe (no inline); uses partials-loader for shared UI + auth
 * - Search, filters, cursor-style pagination, bulk actions
 * - New Share (demo) flow; Copy Link / Rotate / Revoke / Resume with reason capture
 * - Guardrails: masking_inherited + rls_inherited always apply; consent_ok gates resume
 * - Audit stubs are logged to console (replace with backend calls)
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const JSON_URL = 'data-shares.json';
const STATE = { rows: [], page: 1, pageSize: 10, q: '', status: 'Any', scope: 'Any' };

(async function init(){
  const d = await fetch(JSON_URL, { cache: 'no-store' })
    .then(r => r.json())
    .catch(() => ({ defaults:{pageSize:10}, shares: [] }));
  STATE.rows = (d.shares || []).sort((a,b)=> (b.created_ts||'').localeCompare(a.created_ts||''));
  STATE.pageSize = d?.defaults?.pageSize || 10;
  renderShell(d);
  wireFilters(d);
  draw();
})();

function renderShell(d){
  $('#app-main').innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">Data Shares</h1>
        <div class="small text-body-secondary">
          Shares inherit masking & row policies; revocation is immediate. All actions are audit-logged.
        </div>
      </div>
      <div class="d-flex actions">
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm" type="button" aria-label="Refresh list">
          <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Refresh
        </button>
        <button id="btnNewShare" class="btn btn-primary btn-sm" type="button">New Share</button>
        <button id="btnRevokeBulk" class="btn btn-outline-danger btn-sm" type="button" disabled>Revoke selected</button>
      </div>
    </div>

    <div class="card shadow-sm">
      <div class="card-body border-bottom bg-body-tertiary filters">
        <form class="row g-2 align-items-end" id="filterForm">
          <div class="col-12 col-sm-6 col-md-4 col-xl-3">
            <label for="search" class="form-label small text-body-secondary">Search (name, recipient, dataset)</label>
            <input id="search" class="form-control form-control-sm" type="search" placeholder="Type to search…" />
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="status" class="form-label small text-body-secondary">Status</label>
            <select id="status" class="form-select form-select-sm" aria-label="Status">
              <option>Any</option>
              ${opt(['Active','Suspended','Revoked','Expired'])}
            </select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="scope" class="form-label small text-body-secondary">Scope tag</label>
            <select id="scope" class="form-select form-select-sm" aria-label="Scope tag">
              <option>Any</option>
              ${(d.defaults?.scope_tags || []).map(s=>`<option>${s}</option>`).join('')}
            </select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="pageSize" class="form-label small text-body-secondary">Rows per page</label>
            <select id="pageSize" class="form-select form-select-sm page-size" aria-label="Rows per page">
              ${[10,20,50].map(n => `<option value="${n}" ${n==(STATE.pageSize||10)?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
        </form>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" id="shareTable">
          <thead class="table-light">
            <tr>
              <th scope="col" style="width:1%"><input id="selAll" class="form-check-input" type="checkbox" aria-label="Select all"></th>
              <th scope="col">Share</th>
              <th scope="col">Recipient</th>
              <th scope="col">Datasets</th>
              <th scope="col">Scope</th>
              <th scope="col">Expires</th>
              <th scope="col">Status</th>
              <th scope="col">Last access</th>
              <th scope="col" class="text-end">Action</th>
            </tr>
          </thead>
          <tbody id="shareBody"><tr><td colspan="9"><div class="empty text-center">Loading…</div></td></tr></tbody>
        </table>
      </div>

      <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
        <div id="rangeLabel" class="small text-body-secondary">Rows 0–0 of 0</div>
        <nav aria-label="Pagination">
          <ul class="pagination pagination-sm mb-0" id="pager"></ul>
        </nav>
      </div>
    </div>

    <!-- New Share Modal -->
    <div class="modal fade" id="newShareModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <form class="modal-content" id="newShareForm">
          <div class="modal-header">
            <h2 class="modal-title fs-6">Create New Share</h2>
            <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-12 col-md-6">
                <label class="form-label">Recipient name</label>
                <input class="form-control" id="nsRecipient" required placeholder="e.g., State Agency (Roster Team)">
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label">Recipient email</label>
                <input class="form-control" id="nsRecipientEmail" type="email" required placeholder="team@agency.gov">
              </div>
              <div class="col-12">
                <label class="form-label">Datasets (comma separated)</label>
                <input class="form-control" id="nsDatasets" required placeholder="pub_k12_roster@3, pub_k12_attendance_daily@1">
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label">Scope tags</label>
                <select class="form-select" id="nsScope" multiple>
                  ${(d.defaults?.scope_tags||[]).map(s=>`<option>${s}</option>`).join('')}
                </select>
                <div class="form-text">Tags drive masking and downstream contracts.</div>
              </div>
              <div class="col-6 col-md-3">
                <label class="form-label">Permissions</label>
                <select class="form-select" id="nsPerms">
                  ${(d.defaults?.permission_presets||['ReadOnly','Read+Download']).map(p=>`<option>${p}</option>`).join('')}
                </select>
              </div>
              <div class="col-6 col-md-3">
                <label class="form-label">Expiry</label>
                <select class="form-select" id="nsExpiry">
                  ${(d.defaults?.expiry_windows||['90 days']).map(e=>`<option>${e}</option>`).join('')}
                </select>
              </div>
              <div class="col-12">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="nsConsentOk">
                  <label class="form-check-label" for="nsConsentOk">Consent checks satisfied</label>
                </div>
                <div class="form-text">Consent must be true to activate the share.</div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-primary" type="submit">Create</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Decision Modal (Revoke/Resume/Rotate) -->
    <div class="modal fade" id="decisionModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <form class="modal-content" id="decisionForm">
          <div class="modal-header">
            <h2 class="modal-title fs-6" id="decisionTitle">Decision</h2>
            <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div id="decisionSummary" class="small mb-2"></div>
            <div class="mb-2">
              <label for="decisionReason" class="form-label">Reason (required)</label>
              <textarea id="decisionReason" class="form-control" rows="3" required placeholder="Explain the decision for audit…"></textarea>
            </div>
            <div class="form-text">This will be audit-logged with your identity and policy snapshot id.</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancel</button>
            <button id="decisionSubmit" class="btn btn-primary" type="submit">Submit</button>
          </div>
        </form>
      </div>
    </div>
  `;

  $('#btnRefresh').addEventListener('click', () => location.reload());
  $('#btnNewShare').addEventListener('click', () => bootstrap.Modal.getOrCreateInstance($('#newShareModal')).show());
  $('#newShareForm').addEventListener('submit', createShare);
}

function opt(list){ return list.map(v=>`<option>${v}</option>`).join(''); }

function wireFilters(d){
  $('#filterForm')?.addEventListener('submit', e => e.preventDefault());
  $('#search').addEventListener('input', e => { STATE.q = e.target.value.trim().toLowerCase(); STATE.page = 1; draw(); });
  $('#status').addEventListener('change', e => { STATE.status = e.target.value; STATE.page = 1; draw(); });
  $('#scope').addEventListener('change', e => { STATE.scope = e.target.value; STATE.page = 1; draw(); });
  $('#pageSize').addEventListener('change', e => { STATE.pageSize = Number(e.target.value)||10; STATE.page = 1; draw(); });
}

function filtered(){
  const q = STATE.q;
  const has = (s) => String(s||'').toLowerCase().includes(q);
  return STATE.rows.filter(r => {
    const matchesQ = !q || has(r.name) || has(r.recipient) || has(r.datasets?.join(',')) || has(r.id);
    const matchesStatus = (STATE.status==='Any') || r.status === STATE.status;
    const matchesScope  = (STATE.scope==='Any')  || (r.scope||[]).includes(STATE.scope);
    return matchesQ && matchesStatus && matchesScope;
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

  const tbody = $('#shareBody');
  tbody.innerHTML = slice.map(renderRow).join('') ||
    `<tr><td colspan="9"><div class="empty text-center">No matching shares</div></td></tr>`;

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

  // Bulk
  const allBoxes = $$('#shareBody input[type="checkbox"]');
  const selAll = $('#selAll');
  selAll.checked = false;
  selAll.indeterminate = false;
  selAll.addEventListener('change', () => {
    allBoxes.forEach(b => b.checked = selAll.checked);
    updateBulkButtons();
  });
  allBoxes.forEach(b => b.addEventListener('change', updateBulkButtons));
  $('#btnRevokeBulk').addEventListener('click', () => openDecision('revoke', getSelectedIds()));
  updateBulkButtons();
}

function renderRow(r){
  const scopes = (r.scope||[]).map(s => `<span class="badge rounded-pill badge-scope me-1">${s}</span>`).join('');
  const perms  = `<span class="badge rounded-pill badge-perm">${r.permissions||'ReadOnly'}</span>`;
  const datasets = (r.datasets||[]).join(', ');
  const statusBadge = badgeForStatus(r.status);
  const actions = actionButtons(r);
  return `
    <tr data-id="${r.id}">
      <td><input class="form-check-input row-select" type="checkbox" aria-label="Select ${r.name}"></td>
      <td class="fw-semibold"><div>${r.name}</div><div class="small text-body-secondary">${r.id}</div></td>
      <td>${r.recipient}<div class="small text-body-secondary">${r.recipient_email||''}</div></td>
      <td class="text-trunc-md" title="${datasets}">${datasets}</td>
      <td class="text-nowrap">${scopes} ${perms}</td>
      <td class="text-nowrap">${r.expires || '—'}</td>
      <td>${statusBadge}</td>
      <td class="text-nowrap">${fmtDate(r.last_access_ts) || '—'}</td>
      <td class="text-end">${actions}</td>
    </tr>`;
}

function badgeForStatus(s){
  const map = { Active:'success', Suspended:'warning', Revoked:'danger', Expired:'secondary' };
  const cls = map[s] || 'secondary';
  return `<span class="badge text-bg-${cls}">${s||'—'}</span>`;
}

function actionButtons(r){
  const copy = `<button class="btn btn-outline-secondary btn-sm" data-action="copy">Copy Link</button>`;
  const rotate = `<button class="btn btn-outline-secondary btn-sm" data-action="rotate">Rotate</button>`;
  const revoke = `<button class="btn btn-outline-danger btn-sm" data-action="revoke" ${r.status==='Revoked'?'disabled':''}>Revoke</button>`;
  const resume = `<button class="btn btn-success btn-sm" data-action="resume" ${(r.status!=='Suspended')?'disabled':''}>Resume</button>`;
  return `<div class="btn-group btn-group-sm">${copy}${rotate}${revoke}${resume}</div>`;
}

function getSelectedIds(){
  return $$('#shareBody tr').filter(tr => tr.querySelector('.row-select')?.checked)
                            .map(tr => tr.getAttribute('data-id'));
}
function updateBulkButtons(){
  const ids = getSelectedIds();
  $('#btnRevokeBulk').disabled = ids.length === 0;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const tr = e.target.closest('tr[data-id]');
  const id = tr?.getAttribute('data-id');
  if (!id) return;
  const share = STATE.rows.find(x => x.id === id);
  const action = btn.dataset.action;
  if (action === 'copy') {
    navigator.clipboard?.writeText(share.link || '').then(()=>{}).catch(()=>{});
  } else if (action === 'rotate') {
    openDecision('rotate', [id]);
  } else if (action === 'revoke') {
    openDecision('revoke', [id]);
  } else if (action === 'resume') {
    openDecision('resume', [id]);
  }
});

function openDecision(kind, ids){
  if (!ids?.length) return;
  const modalEl = $('#decisionModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  $('#decisionTitle').textContent = kind.charAt(0).toUpperCase() + kind.slice(1);
  $('#decisionSummary').innerHTML = `${kind==='rotate'?'Rotate keys for': kind==='revoke'?'Revoke': 'Resume'} <strong>${ids.length}</strong> share(s).`;
  const form = $('#decisionForm');
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const reason = $('#decisionReason').value.trim();
    if (!reason) return;
    ids.forEach(id => applyDecision(kind, id, reason));
    $('#decisionReason').value = '';
    modal.hide();
    draw();
  };
  modal.show();
}

function applyDecision(kind, id, reason){
  const r = STATE.rows.find(x=>x.id===id);
  if (!r) return;
  if (kind === 'rotate') {
    // rotation keeps status; would rotate presigned URL/keys server-side
    audit('share.rotated', r, reason);
  } else if (kind === 'revoke') {
    r.status = 'Revoked';
    audit('share.revoked', r, reason);
  } else if (kind === 'resume') {
    // resume only allowed if consent_ok is true and not expired/revoked
    if (r.status === 'Suspended' && r.consent_ok) {
      r.status = 'Active';
      audit('share.resumed', r, reason);
    } else {
      audit('share.resume_blocked', r, `Blocked. consent_ok=${r.consent_ok}, status=${r.status}. ${reason}`);
    }
  }
}

function audit(event, r, reason){
  console.log('[AUDIT]', {
    event,
    share_id: r.id,
    share_name: r.name,
    recipient: r.recipient_email || r.recipient,
    policy_snapshot_id: r.policy_snapshot_id || null,
    reason,
    ts: new Date().toISOString()
  });
}

function fmtDate(iso){
  if (!iso) return '';
  try { const d = new Date(iso); return d.toLocaleString(); } catch { return iso; }
}

/* ---------- Create New Share (demo, client-side) ---------- */
function createShare(ev){
  ev.preventDefault();
  const datasets = $('#nsDatasets').value.split(',').map(s=>s.trim()).filter(Boolean);
  const scope = Array.from($('#nsScope').selectedOptions).map(o=>o.value);
  const entry = {
    id: `SHR-${String(STATE.rows.length+1).padStart(3,'0')}`,
    name: `${($('#nsRecipient').value||'recipient').toLowerCase().replace(/\s+/g,'_')}_share`,
    recipient: $('#nsRecipient').value,
    recipient_email: $('#nsRecipientEmail').value,
    datasets,
    scope,
    permissions: $('#nsPerms').value || 'ReadOnly',
    masking_inherited: true,
    rls_inherited: true,
    consent_ok: $('#nsConsentOk').checked,
    policy_snapshot_id: `pol-${Math.random().toString(16).slice(2,8)}`,
    link: `s3://edx-shares/${Date.now()}`,
    created_ts: new Date().toISOString(),
    last_access_ts: null,
    expires: computeExpiry($('#nsExpiry').value),
    status: $('#nsConsentOk').checked ? 'Active' : 'Suspended'
  };
  STATE.rows.unshift(entry);
  bootstrap.Modal.getOrCreateInstance($('#newShareModal')).hide();
  audit('share.created', entry, 'Created via UI');
  STATE.page = 1;
  draw();
}

function computeExpiry(windowLabel){
  const mapDays = {'30 days':30,'90 days':90,'180 days':180,'1 year':365};
  const days = mapDays[windowLabel] || 90;
  const d = new Date(); d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}
