/* Promotion Gates (Steward) — production-ready
 * - Gate CRUD (type, severity, scope, params, waiver)
 * - Assignment (routes, dataset patterns, classifications)
 * - Test & Simulate evaluator + evidence panel
 * - Waiver policy configuration
 * - Versions & Audit: snapshot/rollback, CSV/JSON export
 * - Search + filters + pagination; CSP-safe; a11y-friendly
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const JSON_URL = 'promotion-gates.json';
const LS_KEY   = 'edx_promo_gates_state_v1'; // demo persistence

const STATE = {
  raw: null,
  page: 1,
  pageSize: 10,
  q: '',
  type: 'Any',
  severity: 'Any',
  route: 'Any',
  selected: new Set(),
  tab: 'gates'
};

(async function init(){
  const boot = await fetch(JSON_URL, { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  const saved = loadLocal();
  STATE.raw = deepClone(saved?.raw || boot || { defaults:{}, gates:[], versions:[], audit:[] });
  renderShell();
  wireGlobal();
  draw();
})();

/* ---------------- Shell ---------------- */
function renderShell(){
  $('#app-main').innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">Promotion Gates</h1>
        <div class="small text-body-secondary">Define, scope, and simulate the checks required before promotion. All changes are versioned and auditable.</div>
      </div>
      <div class="d-flex actions">
        <button id="btnExportCsv" class="btn btn-outline-secondary btn-sm">Export CSV</button>
        <button id="btnExportJson" class="btn btn-outline-secondary btn-sm">Export JSON</button>
        <button id="btnSnapshot" class="btn btn-outline-primary btn-sm">Create Snapshot</button>
        <button id="btnRollback" class="btn btn-outline-danger btn-sm">Rollback…</button>
      </div>
    </div>

    <ul class="nav nav-tabs" role="tablist" id="tabs">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" data-tab="gates" type="button" role="tab">Gates</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" data-tab="simulate" type="button" role="tab">Test & Simulate</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" data-tab="waiver" type="button" role="tab">Waiver Policy</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" data-tab="versions" type="button" role="tab">Versions & Audit</button>
      </li>
    </ul>

    <div id="tab-panels" class="mt-3"></div>

    <!-- Gate Modal -->
    <div class="modal fade" id="gateModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <form class="modal-content" id="gateForm">
          <div class="modal-header">
            <h2 class="modal-title fs-6" id="gateTitle">New Gate</h2>
            <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">Name</label>
                <input class="form-control" id="g_name" required />
              </div>
              <div class="col-md-6">
                <label class="form-label">ID</label>
                <input class="form-control" id="g_id" required pattern="[a-z0-9_\\.\\-]+" />
                <div class="form-text">Lowercase letters, digits, underscore, dot, dash.</div>
              </div>
              <div class="col-md-4">
                <label class="form-label">Type</label>
                <select class="form-select" id="g_type" required></select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Severity</label>
                <select class="form-select" id="g_sev" required></select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Waiver</label>
                <div class="input-group">
                  <select class="form-select" id="g_waiver_allowed">
                    <option value="true">Allowed</option>
                    <option value="false">Not allowed</option>
                  </select>
                  <span class="input-group-text">Max days</span>
                  <input class="form-control" type="number" min="0" max="365" id="g_waiver_days" value="0" />
                </div>
              </div>

              <div class="col-12">
                <label class="form-label mb-1">Scope</label>
                <div class="row g-2">
                  <div class="col-md-6">
                    <label class="form-label small">Routes (from → to)</label>
                    <div id="g_routes" class="d-flex flex-wrap gap-2"></div>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small">Classifications</label>
                    <div id="g_classes" class="d-flex flex-wrap gap-2"></div>
                  </div>
                  <div class="col-12">
                    <label class="form-label small">Dataset patterns (comma-separated)</label>
                    <input class="form-control" id="g_patterns" placeholder="e.g., pub_*, canonical.ceds_*" />
                  </div>
                </div>
              </div>

              <div class="col-12">
                <label class="form-label">Parameters (JSON)</label>
                <textarea id="g_params" class="form-control" rows="5" placeholder='{"min_score":95}'></textarea>
                <div class="form-text">Validated as JSON. Parameter keys depend on the gate type.</div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-primary" id="gateSave" type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Evidence Offcanvas -->
    <div class="offcanvas offcanvas-end" tabindex="-1" id="evidencePanel" aria-labelledby="evidenceTitle">
      <div class="offcanvas-header">
        <h2 class="offcanvas-title fs-6" id="evidenceTitle">Simulation Evidence</h2>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
      </div>
      <div class="offcanvas-body">
        <div class="small text-body-secondary">Gate results and evaluation details.</div>
        <pre id="evidencePre" class="small mt-2 mb-0"></pre>
      </div>
    </div>

    <!-- Rollback Modal -->
    <div class="modal fade" id="rollbackModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <form class="modal-content" id="rollbackForm">
          <div class="modal-header">
            <h2 class="modal-title fs-6">Rollback to Snapshot</h2>
            <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body" id="rollbackBody"></div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-danger" type="submit">Rollback</button>
          </div>
        </form>
      </div>
    </div>
  `;
  renderTabs();
}

/* ---------------- Tabs ---------------- */
function renderTabs(){
  const d = STATE.raw;
  const routes = d.defaults?.routes || [];
  const types  = d.defaults?.types || [];
  const sevs   = d.defaults?.severities || [];

  const gatesTab = `
    <div class="d-flex align-items-center justify-content-between mb-2">
      <div class="tab-help">Manage gate definitions. Scope gates by route, dataset patterns, and classifications.</div>
      <div class="d-flex actions">
        <button class="btn btn-primary btn-sm" id="btnNewGate">New Gate</button>
      </div>
    </div>

    <div class="card shadow-sm">
      <div class="card-body border-bottom bg-body-tertiary filters">
        <form class="row g-2 align-items-end" id="filterForm">
          <div class="col-12 col-sm-6 col-md-4 col-xl-3">
            <label class="form-label small text-body-secondary" for="search">Search (name, id)</label>
            <input id="search" class="form-control form-control-sm" placeholder="Type to search…">
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label class="form-label small text-body-secondary" for="type">Type</label>
            <select id="type" class="form-select form-select-sm"><option>Any</option>${types.map(t=>`<option>${t}</option>`).join('')}</select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label class="form-label small text-body-secondary" for="severity">Severity</label>
            <select id="severity" class="form-select form-select-sm"><option>Any</option>${sevs.map(s=>`<option>${s}</option>`).join('')}</select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label class="form-label small text-body-secondary" for="route">Route</label>
            <select id="route" class="form-select form-select-sm">
              <option>Any</option>${routes.map(r=>`<option>${r.from}→${r.to}</option>`).join('')}
            </select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label class="form-label small text-body-secondary" for="pageSize">Rows per page</label>
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
              <th>Gate</th>
              <th>Type</th>
              <th>Severity</th>
              <th>Scope</th>
              <th>Waiver</th>
              <th>Params</th>
              <th class="text-end">Action</th>
            </tr>
          </thead>
          <tbody id="rows"><tr><td colspan="8"><div class="empty text-center">Loading…</div></td></tr></tbody>
        </table>
      </div>

      <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
        <div id="rangeLabel" class="small text-body-secondary">Rows 0–0 of 0</div>
        <nav aria-label="Pagination"><ul class="pagination pagination-sm mb-0" id="pager"></ul></nav>
      </div>
    </div>
  `;

  const simulateTab = `
    <div class="card shadow-sm">
      <div class="card-body">
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label">Route</label>
            <select id="sim_route" class="form-select">
              ${routes.map(r=>`<option>${r.from}→${r.to}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-8">
            <label class="form-label">Dataset (name & classifications)</label>
            <div class="input-group">
              <input id="sim_dataset" class="form-control" placeholder="e.g., pub_k12_attendance_daily">
              <input id="sim_classes" class="form-control" placeholder="comma-separated classifications, e.g., PII_STRICT,DISCIPLINE">
              <button id="btnSimulate" class="btn btn-primary" type="button">Run</button>
            </div>
            <div class="form-text">Checks are matched by route, dataset pattern, and classification tags.</div>
          </div>
        </div>

        <div class="table-responsive mt-3">
          <table class="table align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Gate</th>
                <th>Result</th>
                <th>Details</th>
                <th class="text-end">Evidence</th>
              </tr>
            </thead>
            <tbody id="sim_rows"><tr><td colspan="4"><div class="empty text-center">Run a simulation to see results.</div></td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const waiverTab = `
    <div class="card shadow-sm">
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Allowed roles</label>
            <input id="wp_roles" class="form-control" value="${escapeAttr((STATE.raw.defaults?.waiver_policy?.allowed_roles||[]).join(', '))}">
          </div>
          <div class="col-md-3">
            <label class="form-label">Max days</label>
            <input id="wp_days" type="number" min="0" max="365" class="form-control" value="${escapeAttr(String(STATE.raw.defaults?.waiver_policy?.max_days||0))}">
          </div>
          <div class="col-12">
            <label class="form-label">Reason template</label>
            <textarea id="wp_template" class="form-control" rows="3">${escapeHtml(STATE.raw.defaults?.waiver_policy?.reason_template||'')}</textarea>
          </div>
        </div>
        <div class="mt-3 d-flex gap-2">
          <button id="btnSaveWaiver" class="btn btn-primary btn-sm" type="button">Save Policy</button>
          <span class="tab-help">Governance: Promotion approvals will enforce this policy when waivers are used.</span>
        </div>
      </div>
    </div>
  `;

  const versionsTab = `
    <div class="card shadow-sm">
      <div class="card-body">
        <div class="table-responsive">
          <table class="table align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Snapshot</th>
                <th>Created</th>
                <th>Author</th>
                <th>Notes</th>
                <th class="text-end">Action</th>
              </tr>
            </thead>
            <tbody id="ver_rows">
              ${renderVersionRows()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  $('#tab-panels').innerHTML = `
    <div data-panel="gates">${gatesTab}</div>
    <div data-panel="simulate" class="d-none">${simulateTab}</div>
    <div data-panel="waiver" class="d-none">${waiverTab}</div>
    <div data-panel="versions" class="d-none">${versionsTab}</div>
  `;

  // Populate selects in modal
  const typeSel = $('#g_type'); const sevSel = $('#g_sev');
  typeSel.innerHTML = (STATE.raw.defaults?.types||[]).map(t=>`<option>${t}</option>`).join('');
  sevSel.innerHTML = (STATE.raw.defaults?.severities||[]).map(s=>`<option>${s}</option>`).join('');

  // Route & class chips
  $('#g_routes').innerHTML = (STATE.raw.defaults?.routes||[]).map(r => chip(`${r.from}→${r.to}`, 'route')).join('');
  $('#g_classes').innerHTML = (STATE.raw.defaults?.classifications||[]).map(c => chip(c, 'class')).join('');
}

function chip(label, kind){
  return `<label class="btn btn-outline-secondary btn-sm">
    <input type="checkbox" class="form-check-input me-1" data-${kind} value="${escapeAttr(label)}"> ${escapeHtml(label)}
  </label>`;
}

function renderVersionRows(){
  const rows = (STATE.raw.versions||[]).slice().reverse();
  if (!rows.length) return `<tr><td colspan="5"><div class="empty text-center">No snapshots yet.</div></td></tr>`;
  return rows.map(v => `
    <tr>
      <td class="fw-semibold">${escapeHtml(v.name)} <div class="small text-body-secondary"><code>${escapeHtml(v.id)}</code></div></td>
      <td>${escapeHtml(v.created_at||'')}</td>
      <td>${escapeHtml(v.author||'')}</td>
      <td class="text-trunc" title="${escapeAttr(v.notes||'')}">${escapeHtml(v.notes||'')}</td>
      <td class="text-end">
        <button class="btn btn-outline-secondary btn-sm" data-ver-view="${escapeAttr(v.id)}">View</button>
        <button class="btn btn-outline-danger btn-sm" data-ver-rollback="${escapeAttr(v.id)}">Rollback</button>
      </td>
    </tr>
  `).join('');
}

/* ---------------- Wiring ---------------- */
function wireGlobal(){
  // Tabs
  $$('#tabs [data-tab]').forEach(btn => btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-tab');
    STATE.tab = tab;
    $$('#tabs .nav-link').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    $$('#tab-panels > div').forEach(p => p.classList.add('d-none'));
    $(`#tab-panels [data-panel="${tab}"]`).classList.remove('d-none');
    if (tab === 'versions') { $('#ver_rows').innerHTML = renderVersionRows(); }
  }));

  // Filters
  $('#filterForm')?.addEventListener('submit', e => e.preventDefault());
  $('#search').addEventListener('input', e => { STATE.q = e.target.value.trim().toLowerCase(); STATE.page = 1; draw(); });
  $('#type').addEventListener('change', e => { STATE.type = e.target.value; STATE.page = 1; draw(); });
  $('#severity').addEventListener('change', e => { STATE.severity = e.target.value; STATE.page = 1; draw(); });
  $('#route').addEventListener('change', e => { STATE.route = e.target.value; STATE.page = 1; draw(); });
  $('#pageSize').addEventListener('change', e => { STATE.pageSize = Number(e.target.value)||10; STATE.page = 1; draw(); });

  // Actions
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn  = e.target.closest('[data-del]');
    const viewBtn = e.target.closest('[data-view]');
    const evidenceBtn = e.target.closest('[data-evidence]');
    const selCb   = e.target.closest('input[data-select]');
    const verView = e.target.closest('[data-ver-view]');
    const verRb   = e.target.closest('[data-ver-rollback]');

    if (editBtn) { openGateModal(editBtn.getAttribute('data-edit')); return; }
    if (delBtn)  { deleteGate(delBtn.getAttribute('data-del')); return; }
    if (viewBtn) { viewGate(viewBtn.getAttribute('data-view')); return; }
    if (evidenceBtn){ openEvidence(evidenceBtn.getAttribute('data-evidence')); return; }
    if (selCb){
      const id = selCb.getAttribute('data-select');
      if (selCb.checked) STATE.selected.add(id); else STATE.selected.delete(id);
      updateSelAll();
    }
    if (verView){ viewSnapshot(verView.getAttribute('data-ver-view')); return; }
    if (verRb){ openRollback(); return; }
  });

  $('#selAll')?.addEventListener('change', (e) => {
    const all = $$('#rows input[type="checkbox"][data-select]');
    all.forEach(c => { c.checked = e.target.checked; const id = c.getAttribute('data-select'); if (e.target.checked) STATE.selected.add(id); else STATE.selected.delete(id); });
  });

  // New gate
  $('#btnNewGate').addEventListener('click', () => openGateModal(null));

  // Save Waiver policy
  $('#btnSaveWaiver').addEventListener('click', saveWaiverPolicy);

  // Simulate
  $('#btnSimulate').addEventListener('click', simulate);

  // Exports & versions
  $('#btnExportCsv').addEventListener('click', exportCsv);
  $('#btnExportJson').addEventListener('click', exportJson);
  $('#btnSnapshot').addEventListener('click', createSnapshot);
  $('#btnRollback').addEventListener('click', openRollback);

  // Modal submit
  $('#gateForm').addEventListener('submit', submitGate);
  $('#rollbackForm').addEventListener('submit', doRollback);
}

function updateSelAll(){
  const all = $$('#rows input[type="checkbox"][data-select]');
  const checked = all.filter(c => c.checked).length;
  const selAll = $('#selAll');
  if (!selAll) return;
  selAll.indeterminate = checked > 0 && checked < all.length;
  selAll.checked = checked === all.length;
}

/* ---------------- Gates table ---------------- */
function filteredGates(){
  const q = STATE.q;
  const has = (s) => String(s||'').toLowerCase().includes(q);
  const wantedRoute = STATE.route;
  return (STATE.raw.gates||[]).filter(g => {
    const matchesQ = !q || has(g.name) || has(g.id);
    const matchesType = (STATE.type==='Any') || g.type === STATE.type;
    const matchesSev  = (STATE.severity==='Any') || g.severity === STATE.severity;
    const matchesRoute = (wantedRoute==='Any') || (g.applies_to?.routes||[]).some(rt => `${rt.from}→${rt.to}`===wantedRoute);
    return matchesQ && matchesType && matchesSev && matchesRoute;
  });
}

function draw(){
  const rows = filteredGates().sort((a,b)=>a.name.localeCompare(b.name));
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / STATE.pageSize));
  if (STATE.page > pages) STATE.page = pages;

  const startIdx = (STATE.page - 1) * STATE.pageSize;
  const endIdx   = Math.min(startIdx + STATE.pageSize, total);
  const slice    = rows.slice(startIdx, endIdx);

  $('#rows').innerHTML = slice.map(g => gateRow(g)).join('') ||
    `<tr><td colspan="8"><div class="empty text-center">No gates match the filters.</div></td></tr>`;

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
}

function gateRow(g){
  const type = `<span class="badge rounded-pill badge-type">${escapeHtml(g.type)}</span>`;
  const sev  = `<span class="badge rounded-pill badge-sev" data-sev="${escapeAttr(g.severity)}">${escapeHtml(g.severity)}</span>`;
  const routes = (g.applies_to?.routes||[]).map(rt => `<span class="badge rounded-pill badge-route me-1">${escapeHtml(rt.from)}→${escapeHtml(rt.to)}</span>`).join('') || '—';
  const patterns = (g.applies_to?.dataset_patterns||[]).join(', ') || '*';
  const classes = (g.applies_to?.classifications||[]).map(c => `<span class="badge rounded-pill badge-class me-1">${escapeHtml(c)}</span>`).join('');

  const scope = `${routes}<div class="small text-body-secondary">Patterns: <code class="kv">${escapeHtml(patterns)}</code></div>${classes ? `<div class="small">${classes}</div>` : ''}`;
  const waiver = g.waiver_allowed ? `Allowed (${escapeHtml(String(g.waiver_max_days))}d)` : 'Not allowed';
  const params = `<code class="kv">${escapeHtml(JSON.stringify(g.params||{}, null, 0))}</code>`;

  return `
    <tr>
      <td><input class="form-check-input" type="checkbox" data-select="${escapeAttr(g.id)}"></td>
      <td class="fw-semibold"><div>${escapeHtml(g.name)}</div><div class="small text-body-secondary"><code>${escapeHtml(g.id)}</code></div></td>
      <td class="text-nowrap">${type}</td>
      <td class="text-nowrap">${sev}</td>
      <td>${scope}</td>
      <td class="text-nowrap">${waiver}</td>
      <td class="text-trunc" title="${escapeAttr(JSON.stringify(g.params||{}))}">${params}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-view="${escapeAttr(g.id)}">View</button>
          <button class="btn btn-primary" data-edit="${escapeAttr(g.id)}">Edit</button>
          <button class="btn btn-outline-danger" data-del="${escapeAttr(g.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

/* ---------------- Gate CRUD ---------------- */
function openGateModal(id){
  const editing = !!id;
  const g = editing ? getGate(id) : {
    id: '', name: '', type: (STATE.raw.defaults?.types||[])[0] || 'DQ_THRESHOLD',
    severity: (STATE.raw.defaults?.severities||[])[0] || 'BLOCK',
    applies_to: { routes: [], dataset_patterns: ['*'], classifications: [] },
    waiver_allowed: false, waiver_max_days: 0,
    params: {}
  };

  $('#gateTitle').textContent = editing ? `Edit Gate — ${g.name}` : 'New Gate';
  $('#g_id').disabled = editing;
  $('#g_id').value = g.id;
  $('#g_name').value = g.name;
  $('#g_type').value = g.type;
  $('#g_sev').value  = g.severity;
  $('#g_waiver_allowed').value = g.waiver_allowed ? 'true' : 'false';
  $('#g_waiver_days').value = String(g.waiver_max_days||0);
  $('#g_patterns').value = (g.applies_to?.dataset_patterns||[]).join(', ');
  $('#g_params').value = JSON.stringify(g.params||{}, null, 2);

  // check route & classes
  $$('#g_routes input[type="checkbox"][data-route]').forEach(cb => { cb.checked = (g.applies_to?.routes||[]).some(rt => `${rt.from}→${rt.to}` === cb.value); });
  $$('#g_classes input[type="checkbox"][data-class]').forEach(cb => { cb.checked = (g.applies_to?.classifications||[]).includes(cb.value); });

  $('#gateForm').dataset.editing = editing ? id : '';
  bootstrap.Modal.getOrCreateInstance($('#gateModal')).show();
}

function submitGate(ev){
  ev.preventDefault();
  const editingId = $('#gateForm').dataset.editing || null;

  const id = $('#g_id').value.trim();
  const name = $('#g_name').value.trim();
  const type = $('#g_type').value;
  const severity = $('#g_sev').value;
  const waiver_allowed = $('#g_waiver_allowed').value === 'true';
  const waiver_max_days = Math.max(0, Number($('#g_waiver_days').value)||0);
  const patterns = $('#g_patterns').value.split(',').map(s=>s.trim()).filter(Boolean);
  const routes = $$('#g_routes input[type="checkbox"][data-route]:checked').map(cb => {
    const [from,to] = cb.value.split('→'); return { from, to };
  });
  const classes = $$('#g_classes input[type="checkbox"][data-class]:checked').map(cb => cb.value);

  let params = {};
  try { params = JSON.parse($('#g_params').value || '{}'); }
  catch { alert('Parameters must be valid JSON.'); return; }

  const gate = { id, name, type, severity, applies_to: { routes, dataset_patterns: patterns.length?patterns:['*'], classifications: classes }, waiver_allowed, waiver_max_days, params };

  if (!editingId){
    if (STATE.raw.gates.some(x => x.id === id)) { alert('Gate ID already exists.'); return; }
    STATE.raw.gates.push(gate);
    audit('gates.create', { id });
  } else {
    const idx = STATE.raw.gates.findIndex(x => x.id === editingId);
    if (idx < 0) return;
    STATE.raw.gates[idx] = gate;
    audit('gates.edit', { id });
  }

  saveLocal();
  bootstrap.Modal.getOrCreateInstance($('#gateModal')).hide();
  draw();
}

function deleteGate(id){
  if (!confirm('Delete this gate? This cannot be undone (unless you rollback to a prior snapshot).')) return;
  const idx = STATE.raw.gates.findIndex(x => x.id === id);
  if (idx >= 0) {
    STATE.raw.gates.splice(idx,1);
    audit('gates.delete', { id });
    saveLocal(); draw();
  }
}

function viewGate(id){
  const g = getGate(id); if (!g) return;
  const pre = JSON.stringify(g, null, 2);
  $('#evidenceTitle').textContent = `Gate — ${g.name}`;
  $('#evidencePre').textContent = pre;
  bootstrap.Offcanvas.getOrCreateInstance($('#evidencePanel')).show();
}

function getGate(id){ return (STATE.raw.gates||[]).find(x => x.id === id) || null; }

/* ---------------- Simulation ---------------- */
function simulate(){
  const routeStr = $('#sim_route').value;
  const [from,to] = routeStr.split('→');
  const dataset = $('#sim_dataset').value.trim();
  const classes = $('#sim_classes').value.split(',').map(s=>s.trim()).filter(Boolean);

  if (!dataset) { alert('Dataset is required'); return; }

  const candidates = (STATE.raw.gates||[]).filter(g => {
    const matchRoute = (g.applies_to?.routes||[]).some(rt => rt.from===from && rt.to===to);
    const matchPattern = (g.applies_to?.dataset_patterns||['*']).some(p => matchPatternLike(dataset, p));
    const matchClass = (g.applies_to?.classifications||[]).length === 0 || g.applies_to.classifications.some(c => classes.includes(c));
    return matchRoute && matchPattern && matchClass;
  });

  const dqThresh = STATE.raw.defaults?.dq_thresholds?.[to] ?? 95.0;

  // simulate checks (fake values suitable for demo)
  const fake = {
    dq_score: dataset.includes('attendance') ? 97.8 : 93.0,
    masking_ok: !classes.includes('PII_STRICT') ? true : dataset.startsWith('pub_'),
    rls_ok: classes.some(c=>['PII_STRICT','DISCIPLINE','HEALTH'].includes(c)) ? true : true,
    schema_change: dataset.includes('ceds') ? 'ADD_COLUMN' : 'NO_OP',
    freshness_hours: dataset.includes('daily') ? 4 : 30,
    deps_done: true
  };

  const results = candidates.map(g => {
    const detail = { gate: g.id, type: g.type, severity: g.severity };
    let pass = true; let explanation = '';

    switch (g.type){
      case 'DQ_THRESHOLD':
        pass = fake.dq_score >= (g.params?.min_score ?? dqThresh);
        explanation = `DQ ${fake.dq_score} vs min ${g.params?.min_score ?? dqThresh}`;
        break;
      case 'MASKING':
        pass = !!fake.masking_ok;
        explanation = `Masking ${fake.masking_ok ? 'enabled' : 'missing'}`;
        break;
      case 'RLS':
        pass = !!fake.rls_ok;
        explanation = `RLS ${fake.rls_ok ? 'enforced' : 'not enforced'}`;
        break;
      case 'SCHEMA_DRIFT':
        const allowed = new Set(g.params?.allowed_kinds||[]);
        const blocked = new Set(g.params?.block_on||[]);
        pass = (fake.schema_change==='NO_OP') || allowed.has(fake.schema_change);
        if (blocked.has(fake.schema_change)) pass = false;
        explanation = `Change: ${fake.schema_change}`;
        break;
      case 'FRESHNESS':
        const maxh = Number(g.params?.max_age_hours ?? 24);
        pass = fake.freshness_hours <= maxh;
        explanation = `Age ${fake.freshness_hours}h vs max ${maxh}h`;
        break;
      case 'DEPENDENCY':
        pass = !!fake.deps_done;
        explanation = `Dependencies ${fake.deps_done ? 'complete' : 'pending'}`;
        break;
      default:
        pass = true; explanation = 'Unknown gate type';
    }
    return { ...detail, pass, explanation, waiver_allowed: g.waiver_allowed };
  });

  // Render
  if (!results.length){
    $('#sim_rows').innerHTML = `<tr><td colspan="4"><div class="empty text-center">No gates apply to this dataset/route.</div></td></tr>`;
  } else {
    $('#sim_rows').innerHTML = results.map(r => `
      <tr>
        <td><div class="fw-semibold">${escapeHtml(r.gate)}</div><div class="small text-body-secondary">${escapeHtml(r.type)} · ${escapeHtml(r.severity)}</div></td>
        <td>${r.pass ? '<span class="text-success fw-semibold">PASS</span>' : '<span class="text-danger fw-semibold">FAIL</span>'}</td>
        <td>${escapeHtml(r.explanation)} ${r.waiver_allowed ? '<span class="badge rounded-pill text-bg-warning ms-2">Waiver allowed</span>' : ''}</td>
        <td class="text-end"><button class="btn btn-outline-secondary btn-sm" data-evidence="${escapeAttr(r.gate)}">View Gate</button></td>
      </tr>
    `).join('');
  }
}

/* ---------------- Waiver Policy ---------------- */
function saveWaiverPolicy(){
  const roles = $('#wp_roles').value.split(',').map(s=>s.trim()).filter(Boolean);
  const days  = Math.max(0, Number($('#wp_days').value)||0);
  const templ = $('#wp_template').value;

  STATE.raw.defaults = STATE.raw.defaults || {};
  STATE.raw.defaults.waiver_policy = { allowed_roles: roles, max_days: days, reason_template: templ };
  audit('waiver.policy.save', { roles, days });
  saveLocal();
  alert('Waiver policy saved.');
}

/* ---------------- Versions & Rollback ---------------- */
function createSnapshot(){
  const name = prompt('Snapshot name (required):', `Snapshot ${new Date().toISOString().slice(0,16).replace('T',' ')}`);
  if (!name) return;
  const snap = {
    id: `v${(STATE.raw.versions||[]).length + 1}`,
    name, created_at: new Date().toISOString(),
    author: 'steward@district.edu',
    notes: 'Snapshot captured from UI'
  };
  STATE.raw.versions = STATE.raw.versions || [];
  STATE.raw.versions.push(snap);
  audit('snapshot.create', { id: snap.id, name });
  saveLocal();
  $('#ver_rows').innerHTML = renderVersionRows();
}

function openRollback(){
  const rows = (STATE.raw.versions||[]).slice().reverse();
  if (!rows.length) { alert('No snapshots available.'); return; }
  $('#rollbackBody').innerHTML = rows.map(v => `
    <div class="form-check">
      <input class="form-check-input" type="radio" name="rb_ver" id="rb_${escapeAttr(v.id)}" value="${escapeAttr(v.id)}">
      <label class="form-check-label" for="rb_${escapeAttr(v.id)}">${escapeHtml(v.name)} <span class="small text-body-secondary">(${escapeHtml(v.id)}) — ${escapeHtml(v.created_at||'')}</span></label>
    </div>
  `).join('');
  bootstrap.Modal.getOrCreateInstance($('#rollbackModal')).show();
}

function doRollback(ev){
  ev.preventDefault();
  const id = (new FormData(ev.target)).get('rb_ver') || ($('input[name="rb_ver"]:checked')?.value);
  if (!id) return;
  // In a real app we would restore serialized snapshot content. For demo we record an audit event.
  audit('snapshot.rollback', { to: id });
  bootstrap.Modal.getOrCreateInstance($('#rollbackModal')).hide();
  alert(`Rollback to ${id} recorded (demo). Apply actual state restore in backend.`);
}

/* ---------------- Export ---------------- */
function exportCsv(){
  const rows = (STATE.raw.gates||[]);
  const headers = ['id','name','type','severity','routes','patterns','classifications','waiver_allowed','waiver_max_days','params'];
  const body = rows.map(g => [
    g.id, g.name, g.type, g.severity,
    (g.applies_to?.routes||[]).map(rt=>`${rt.from}→${rt.to}`).join(';'),
    (g.applies_to?.dataset_patterns||[]).join(';'),
    (g.applies_to?.classifications||[]).join(';'),
    g.waiver_allowed ? 'true' : 'false',
    String(g.waiver_max_days||0),
    JSON.stringify(g.params||{})
  ].map(x => `"${String(x??'').replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','), ...body].join('\n');
  downloadBlob(csv, `edx-promotion-gates-${isoDay()}.csv`, 'text/csv');
  audit('gates.export.csv', { rows: rows.length });
}

function exportJson(){
  const js = JSON.stringify(STATE.raw, null, 2);
  downloadBlob(js, `edx-promotion-gates-${isoDay()}.json`, 'application/json');
  audit('gates.export.json', {});
}

/* ---------------- Persistence & Utils ---------------- */
function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify({ raw: STATE.raw })); }
function loadLocal(){ try { return JSON.parse(localStorage.getItem(LS_KEY)||''); } catch { return null; } }
function isoDay(){ return new Date().toISOString().slice(0,10); }
function downloadBlob(text, name, type){
  const blob = new Blob([text], {type}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
function audit(event, payload){ console.log('[AUDIT]', { event, payload, ts: new Date().toISOString() }); }
function matchPatternLike(name, pattern){
  // simple glob: * wildcard only
  if (pattern === '*' || !pattern) return true;
  const esc = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^'+esc+'$').test(name);
}
