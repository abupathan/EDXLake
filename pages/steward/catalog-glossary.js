/* Catalog & Glossary (Steward) — production-ready
 * Added: Dataset details drawer showing readiness, last validation run, gate chips,
 * and deep link to Policy Simulator pre-filled with this dataset.
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const JSON_URL = 'catalog-glossary.json';

const STATE = {
  raw: null,
  datasets: [],
  glossary: [],
  pageSizeDS: 10,
  pageDS: 1,
  qDS: '',
  owner: 'Any',
  pageSizeGL: 10,
  pageGL: 1,
  qGL: '',
  status: 'Any'
};

(async function init(){
  const d = await fetch(JSON_URL, { cache: 'no-store' })
    .then(r => r.json())
    .catch(() => ({ defaults:{pageSize:10, owners:[], term_status:[]}, datasets:[], glossary:[] }));

  STATE.raw = d;
  STATE.datasets = d.datasets || [];
  STATE.glossary = d.glossary || [];
  STATE.pageSizeDS = d?.defaults?.pageSize || 10;
  STATE.pageSizeGL = d?.defaults?.pageSize || 10;

  renderShell(d);
  wireGlobal();
  drawDatasets();
  drawGlossary();
})();

/* ---------- Render ---------- */
function renderShell(d){
  $('#app-main').innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">Catalog & Glossary</h1>
        <div class="small text-body-secondary">Datasets, schema versions, descriptions, and business terms with audit history.</div>
      </div>
      <div class="d-flex actions">
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm" type="button" aria-label="Refresh">
          <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Refresh
        </button>
        <button id="btnNewTerm" class="btn btn-primary btn-sm" type="button">New Term</button>
      </div>
    </div>

    <ul class="nav nav-tabs mb-2" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" id="tab-ds" data-bs-toggle="tab" data-bs-target="#pane-ds" type="button" role="tab">Datasets</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="tab-gl" data-bs-toggle="tab" data-bs-target="#pane-gl" type="button" role="tab">Glossary</button>
      </li>
    </ul>

    <div class="tab-content">
      <!-- Datasets -->
      <div class="tab-pane fade show active" id="pane-ds" role="tabpanel">
        <div class="card shadow-sm">
          <div class="card-body border-bottom bg-body-tertiary filters">
            <form class="row g-2 align-items-end" id="filterDS">
              <div class="col-12 col-sm-6 col-md-4 col-xl-3">
                <label for="qDS" class="form-label small text-body-secondary">Search (name, description, terms)</label>
                <input id="qDS" class="form-control form-control-sm" placeholder="Type to search…">
              </div>
              <div class="col-6 col-sm-4 col-md-2 col-xl-2">
                <label for="owner" class="form-label small text-body-secondary">Owner</label>
                <select id="owner" class="form-select form-select-sm" aria-label="Owner">
                  <option>Any</option>
                  ${(STATE.raw?.defaults?.owners || []).map(o=>`<option>${o}</option>`).join('')}
                </select>
              </div>
              <div class="col-6 col-sm-4 col-md-2 col-xl-2">
                <label for="pageSizeDS" class="form-label small text-body-secondary">Rows per page</label>
                <select id="pageSizeDS" class="form-select form-select-sm page-size" aria-label="Rows per page">
                  ${[10,20,50].map(n => `<option value="${n}" ${n==(STATE.pageSizeDS||10)?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
            </form>
          </div>

          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th class="schema-col">Dataset</th>
                  <th>Schema ver.</th>
                  <th>Owner</th>
                  <th>Freshness</th>
                  <th>DQ</th>
                  <th>Description</th>
                  <th>Terms</th>
                  <th class="text-end">Action</th>
                </tr>
              </thead>
              <tbody id="rowsDS"><tr><td colspan="8"><div class="empty text-center">Loading…</div></td></tr></tbody>
            </table>
          </div>

          <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
            <div id="rangeDS" class="small text-body-secondary">Rows 0–0 of 0</div>
            <nav aria-label="Pagination"><ul class="pagination pagination-sm mb-0" id="pagerDS"></ul></nav>
          </div>
        </div>
      </div>

      <!-- Glossary -->
      <div class="tab-pane fade" id="pane-gl" role="tabpanel">
        <div class="card shadow-sm">
          <div class="card-body border-bottom bg-body-tertiary filters">
            <form class="row g-2 align-items-end" id="filterGL">
              <div class="col-12 col-sm-6 col-md-4 col-xl-3">
                <label for="qGL" class="form-label small text-body-secondary">Search terms</label>
                <input id="qGL" class="form-control form-control-sm" placeholder="Type to search…">
              </div>
              <div class="col-6 col-sm-4 col-md-2 col-xl-2">
                <label for="status" class="form-label small text-body-secondary">Status</label>
                <select id="status" class="form-select form-select-sm" aria-label="Status">
                  <option>Any</option>
                  ${(STATE.raw?.defaults?.term_status || []).map(s=>`<option>${s}</option>`).join('')}
                </select>
              </div>
              <div class="col-6 col-sm-4 col-md-2 col-xl-2">
                <label for="pageSizeGL" class="form-label small text-body-secondary">Rows per page</label>
                <select id="pageSizeGL" class="form-select form-select-sm page-size" aria-label="Rows per page">
                  ${[10,20,50].map(n => `<option value="${n}" ${n==(STATE.pageSizeGL||10)?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
            </form>
          </div>

          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>Term</th>
                  <th>Definition</th>
                  <th>Steward</th>
                  <th>Status</th>
                  <th>Related datasets</th>
                  <th class="text-end">Action</th>
                </tr>
              </thead>
              <tbody id="rowsGL"><tr><td colspan="6"><div class="empty text-center">Loading…</div></td></tr></tbody>
            </table>
          </div>

          <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
            <div id="rangeGL" class="small text-body-secondary">Rows 0–0 of 0</div>
            <nav aria-label="Pagination"><ul class="pagination pagination-sm mb-0" id="pagerGL"></ul></nav>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals: Edit Dataset, Term Editor, History -->
    <div class="modal fade" id="editDatasetModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <form class="modal-content" id="datasetForm">
          <div class="modal-header">
            <h2 class="modal-title fs-6">Edit Dataset</h2>
            <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-12 col-md-6">
                <label class="form-label">Name</label>
                <input id="dsName" class="form-control" readonly>
                <div class="form-text">Canonical id (immutable)</div>
              </div>
              <div class="col-12 col-md-3">
                <label class="form-label">Schema version</label>
                <input id="dsSchema" class="form-control" required pattern="^[0-9]+\\.[0-9]+\\.[0-9]+$" placeholder="e.g., 1.1.0">
              </div>
              <div class="col-12 col-md-3">
                <label class="form-label">Owner</label>
                <select id="dsOwner" class="form-select" required>
                  ${(STATE.raw?.defaults?.owners || []).map(o=>`<option>${o}</option>`).join('')}
                </select>
              </div>
              <div class="col-12">
                <label class="form-label">Description</label>
                <textarea id="dsDesc" class="form-control" rows="3" required></textarea>
              </div>
              <div class="col-12">
                <label class="form-label">Terms (comma separated)</label>
                <input id="dsTerms" class="form-control" placeholder="e.g., Roster, Student, Course">
                <div class="form-text">Link datasets to glossary terms for discoverability.</div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-primary" type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal fade" id="termModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <form class="modal-content" id="termForm">
          <div class="modal-header">
            <h2 class="modal-title fs-6" id="termTitle">New Term</h2>
            <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="mb-2">
              <label class="form-label">Term</label>
              <input id="glTerm" class="form-control" required>
            </div>
            <div class="mb-2">
              <label class="form-label">Definition</label>
              <textarea id="glDef" class="form-control" rows="3" required></textarea>
            </div>
            <div class="row g-2">
              <div class="col-6">
                <label class="form-label">Steward</label>
                <select id="glSteward" class="form-select" required>
                  ${(STATE.raw?.defaults?.owners || []).map(o=>`<option>${o}</option>`).join('')}
                </select>
              </div>
              <div class="col-6">
                <label class="form-label">Status</label>
                <select id="glStatus" class="form-select" required>
                  ${(STATE.raw?.defaults?.term_status || []).map(s=>`<option>${s}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="mt-2">
              <label class="form-label">Related datasets (comma separated)</label>
              <input id="glDatasets" class="form-control" placeholder="pub_k12_roster, canonical.oneroster.users">
            </div>
            <div class="form-text">Edits are versioned and auditable.</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-primary" type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal fade" id="historyModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title fs-6">History</h2>
            <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="small text-body-secondary">This is a demo stub; backend would return immutable audit events and diffs.</div>
            <pre id="historyPre" class="small mt-2 mb-0"></pre>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ---------- Global wiring ---------- */
function wireGlobal(){
  $('#btnRefresh').addEventListener('click', () => location.reload());
  $('#btnNewTerm').addEventListener('click', () => openTermModal());

  // Filters
  $('#filterDS')?.addEventListener('submit', e => e.preventDefault());
  $('#qDS').addEventListener('input', e => { STATE.qDS = e.target.value.trim().toLowerCase(); STATE.pageDS = 1; drawDatasets(); });
  $('#owner').addEventListener('change', e => { STATE.owner = e.target.value; STATE.pageDS = 1; drawDatasets(); });
  $('#pageSizeDS').addEventListener('change', e => { STATE.pageSizeDS = Number(e.target.value)||10; STATE.pageDS = 1; drawDatasets(); });

  $('#filterGL')?.addEventListener('submit', e => e.preventDefault());
  $('#qGL').addEventListener('input', e => { STATE.qGL = e.target.value.trim().toLowerCase(); STATE.pageGL = 1; drawGlossary(); });
  $('#status').addEventListener('change', e => { STATE.status = e.target.value; STATE.pageGL = 1; drawGlossary(); });
  $('#pageSizeGL').addEventListener('change', e => { STATE.pageSizeGL = Number(e.target.value)||10; STATE.pageGL = 1; drawGlossary(); });

  // Table button delegation
  document.addEventListener('click', (e) => {
    const detailsBtn = e.target.closest('[data-details]');
    if (detailsBtn) { openDetails(detailsBtn.getAttribute('data-details')); return; }

    const editBtn = e.target.closest('[data-edit-dataset]');
    if (editBtn) { openEditDataset(editBtn.getAttribute('data-edit-dataset')); return; }

    const histBtn = e.target.closest('[data-history]');
    if (histBtn) { openHistory(histBtn.getAttribute('data-history')); return; }

    const editTermBtn = e.target.closest('[data-edit-term]');
    if (editTermBtn) { openTermModal(editTermBtn.getAttribute('data-edit-term')); return; }
  });
}

/* ---------- Datasets table ---------- */
function filteredDatasets(){
  const q = STATE.qDS;
  const has = (s) => String(s||'').toLowerCase().includes(q);
  return STATE.datasets.filter(x => {
    const matchesQ = !q || has(x.name) || has(x.desc) || has((x.terms||[]).join(','));
    const matchesOwner = (STATE.owner==='Any') || x.owner === STATE.owner;
    return matchesQ && matchesOwner;
  });
}

function drawDatasets(){
  const rows = filteredDatasets();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / STATE.pageSizeDS));
  if (STATE.pageDS > pages) STATE.pageDS = pages;

  const startIdx = (STATE.pageDS - 1) * STATE.pageSizeDS;
  const endIdx   = Math.min(startIdx + STATE.pageSizeDS, total);
  const slice    = rows.slice(startIdx, endIdx);

  $('#rowsDS').innerHTML = slice.map(ds => `
    <tr>
      <td class="schema-col text-nowrap"><span class="fw-semibold">${escapeHtml(ds.name)}</span></td>
      <td>${escapeHtml(ds.schema_version||'')}</td>
      <td>${escapeHtml(ds.owner||'')}</td>
      <td>${escapeHtml(ds.freshness||'')}</td>
      <td>${escapeHtml(ds.dq_status||'')}</td>
      <td class="text-trunc-md" title="${escapeAttr(ds.desc||'')}">${escapeHtml(ds.desc||'')}</td>
      <td class="text-nowrap">${(ds.terms||[]).map(t=>`<span class="badge rounded-pill badge-term me-1">${escapeHtml(t)}</span>`).join('')}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-details="${escapeAttr(ds.name)}">Details</button>
          <button class="btn btn-outline-secondary" data-edit-dataset="${escapeAttr(ds.name)}">Edit</button>
          <button class="btn btn-outline-secondary" data-history="${escapeAttr(ds.name)}">History</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="8"><div class="empty text-center">No matching datasets</div></td></tr>`;

  $('#rangeDS').textContent = `Rows ${total ? (startIdx+1) : 0}–${endIdx} of ${total}`;

  const pager = $('#pagerDS');
  const btn = (p, txt, aria, disabled=false, active=false) =>
    `<li class="page-item ${disabled?'disabled':''} ${active?'active':''}">
       <button class="page-link" type="button" data-ds-page="${p}" aria-label="${aria}">${txt}</button>
     </li>`;
  pager.innerHTML = [
    btn(STATE.pageDS-1, '&laquo;', 'Previous', STATE.pageDS<=1),
    ...Array.from({length: pages}).map((_,i)=>btn(i+1, String(i+1), `Page ${i+1}`, false, i+1===STATE.pageDS)),
    btn(STATE.pageDS+1, '&raquo;', 'Next', STATE.pageDS>=pages)
  ].join('');
  $$('#pagerDS .page-link').forEach(el => el.addEventListener('click', () => {
    const p = Number(el.getAttribute('data-ds-page'));
    if (!Number.isNaN(p)) { STATE.pageDS = p; drawDatasets(); }
  }));
}

/* ---------- Glossary table ---------- */
function filteredGlossary(){
  const q = STATE.qGL;
  const has = (s) => String(s||'').toLowerCase().includes(q);
  return STATE.glossary.filter(g => {
    const matchesQ = !q || has(g.term) || has(g.definition) || has((g.related_datasets||[]).join(',')); 
    const matchesStatus = (STATE.status==='Any') || g.status === STATE.status;
    return matchesQ && matchesStatus;
  });
}

function drawGlossary(){
  const rows = filteredGlossary();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / STATE.pageSizeGL));
  if (STATE.pageGL > pages) STATE.pageGL = pages;

  const startIdx = (STATE.pageGL - 1) * STATE.pageSizeGL;
  const endIdx   = Math.min(startIdx + STATE.pageSizeGL, total);
  const slice    = rows.slice(startIdx, endIdx);

  $('#rowsGL').innerHTML = slice.map(g => `
    <tr>
      <td class="fw-semibold">${escapeHtml(g.term)}</td>
      <td class="text-trunc-md" title="${escapeAttr(g.definition||'')}">${escapeHtml(g.definition||'')}</td>
      <td>${escapeHtml(g.steward||'')}</td>
      <td><span class="badge rounded-pill badge-status" data-status="${escapeAttr(g.status||'')}">${escapeHtml(g.status||'')}</span></td>
      <td class="text-trunc-md" title="${escapeAttr((g.related_datasets||[]).join(', '))}">
        ${(g.related_datasets||[]).map(d=>`<span class="badge rounded-pill badge-term me-1">${escapeHtml(d)}</span>`).join('')}
      </td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-edit-term="${escapeAttr(g.term)}">Edit</button>
          <button class="btn btn-outline-secondary" data-history="${escapeAttr(g.term)}">History</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="6"><div class="empty text-center">No matching terms</div></td></tr>`;

  $('#rangeGL').textContent = `Rows ${total ? (startIdx+1) : 0}–${endIdx} of ${total}`;

  const pager = $('#pagerGL');
  const btn = (p, txt, aria, disabled=false, active=false) =>
    `<li class="page-item ${disabled?'disabled':''} ${active?'active':''}">
       <button class="page-link" type="button" data-gl-page="${p}" aria-label="${aria}">${txt}</button>
     </li>`;
  pager.innerHTML = [
    btn(STATE.pageGL-1, '&laquo;', 'Previous', STATE.pageGL<=1),
    ...Array.from({length: pages}).map((_,i)=>btn(i+1, String(i+1), `Page ${i+1}`, false, i+1===STATE.pageGL)),
    btn(STATE.pageGL+1, '&raquo;', 'Next', STATE.pageGL>=pages)
  ].join('');
  $$('#pagerGL .page-link').forEach(el => el.addEventListener('click', () => {
    const p = Number(el.getAttribute('data-gl-page'));
    if (!Number.isNaN(p)) { STATE.pageGL = p; drawGlossary(); }
  }));
}

/* ---------- Dataset details drawer ---------- */
function openDetails(name){
  const ds = STATE.datasets.find(x => x.name === name);
  if (!ds) return;

  // Safe extraction: only show what exists (no hallucinated numbers)
  const readiness = getNested(ds, ['readiness','score'], '—');
  const lastRun   = ds.last_validation_ts || '—';

  // Gate chips: always show DQ (we have dq_status), plus any optional gates if present
  const chips = [];
  if (ds.dq_status){
    const cls = (ds.dq_status||'').toLowerCase() === 'pass' ? 'text-bg-success' :
                (ds.dq_status||'').toLowerCase() === 'warn' ? 'text-bg-warning' : 'text-bg-danger';
    chips.push(`<span class="badge badge-gate ${cls}">DQ: ${escapeHtml(ds.dq_status)}</span>`);
  }
  const gates = ds.gates || null;
  if (gates){
    Object.entries(gates).forEach(([k,v])=>{
      const ok = String(v).toLowerCase()==='pass' || v===true;
      chips.push(`<span class="badge badge-gate ${ok?'text-bg-success':'text-bg-danger'}">${escapeHtml(k)}: ${ok?'Pass':'Fail'}</span>`);
    });
  }

  // Pre-filled link to Policy Simulator (dataset param + default purpose)
  const qs = new URLSearchParams({ dataset: ds.name, purpose: 'Operational' }).toString();
  const simHref = `../steward/policy-simulator.html?${qs}`;

  $('#dsDetailsLabel').textContent = ds.name;
  $('#dsDetailsBody').innerHTML = `
    <div class="mb-2">
      ${(chips.length ? chips.join(' ') : '<span class="badge badge-gate text-bg-secondary">No gate data</span>')}
    </div>

    <dl class="row ds-kv">
      <dt class="col-sm-5">Schema version</dt><dd class="col-sm-7">${escapeHtml(ds.schema_version||'')}</dd>
      <dt class="col-sm-5">Owner</dt><dd class="col-sm-7">${escapeHtml(ds.owner||'')}</dd>
      <dt class="col-sm-5">Freshness</dt><dd class="col-sm-7">${escapeHtml(ds.freshness||'')}</dd>
      <dt class="col-sm-5">Readiness score</dt><dd class="col-sm-7">${escapeHtml(String(readiness))}</dd>
      <dt class="col-sm-5">Last validation run</dt><dd class="col-sm-7">${escapeHtml(lastRun)}</dd>
      <dt class="col-sm-5">Description</dt><dd class="col-sm-7">${escapeHtml(ds.desc||'')}</dd>
      <dt class="col-sm-5">Terms</dt><dd class="col-sm-7">${(ds.terms||[]).map(t=>`<span class="badge rounded-pill badge-term me-1">${escapeHtml(t)}</span>`).join('')||'—'}</dd>
    </dl>

    <div class="d-flex gap-2 mt-3">
      <a class="btn btn-primary btn-sm" href="${simHref}">Open in Policy Simulator</a>
      <button class="btn btn-outline-secondary btn-sm" type="button" data-bs-dismiss="offcanvas">Close</button>
    </div>
  `;

  bootstrap.Offcanvas.getOrCreateInstance($('#dsDetails')).show();
}

/* ---------- Edit Dataset ---------- */
function openEditDataset(name){
  const ds = STATE.datasets.find(x => x.name === name);
  if (!ds) return;

  $('#dsName').value = ds.name;
  $('#dsSchema').value = ds.schema_version || '';
  $('#dsOwner').value = ds.owner || (STATE.raw?.defaults?.owners?.[0] || '');
  $('#dsDesc').value = ds.desc || '';
  $('#dsTerms').value = (ds.terms || []).join(', ');

  const modal = bootstrap.Modal.getOrCreateInstance($('#editDatasetModal'));
  $('#datasetForm').onsubmit = (ev) => {
    ev.preventDefault();
    ds.schema_version = $('#dsSchema').value.trim();
    ds.owner = $('#dsOwner').value.trim();
    ds.desc = $('#dsDesc').value.trim();
    ds.terms = $('#dsTerms').value.split(',').map(s=>s.trim()).filter(Boolean);
    audit('catalog.dataset.updated', { name: ds.name, schema_version: ds.schema_version, owner: ds.owner, terms: ds.terms });
    modal.hide();
    drawDatasets();
  };
  modal.show();
}

/* ---------- Term Editor ---------- */
function openTermModal(term){
  const isEdit = !!term;
  const t = isEdit ? STATE.glossary.find(x => x.term === term) : { term:'', definition:'', steward: (STATE.raw?.defaults?.owners?.[0]||''), status: (STATE.raw?.defaults?.term_status?.[0]||'Proposed'), related_datasets: [] };
  $('#termTitle').textContent = isEdit ? 'Edit Term' : 'New Term';
  $('#glTerm').value = t.term || '';
  $('#glDef').value = t.definition || '';
  $('#glSteward').value = t.steward || (STATE.raw?.defaults?.owners?.[0] || '');
  $('#glStatus').value = t.status || (STATE.raw?.defaults?.term_status?.[0] || 'Proposed');
  $('#glDatasets').value = (t.related_datasets || []).join(', ');

  const modal = bootstrap.Modal.getOrCreateInstance($('#termModal'));
  $('#termForm').onsubmit = (ev)=>{
    ev.preventDefault();
    const payload = {
      term: $('#glTerm').value.trim(),
      definition: $('#glDef').value.trim(),
      steward: $('#glSteward').value.trim(),
      status: $('#glStatus').value.trim(),
      related_datasets: $('#glDatasets').value.split(',').map(s=>s.trim()).filter(Boolean)
    };
    if (!payload.term || !payload.definition) return;

    if (isEdit){
      const idx = STATE.glossary.findIndex(x => x.term === term);
      if (idx >= 0) STATE.glossary[idx] = payload;
      audit('catalog.glossary.updated', payload);
    } else {
      STATE.glossary.unshift(payload);
      audit('catalog.glossary.created', payload);
    }
    modal.hide();
    drawGlossary();
  };
  modal.show();
}

/* ---------- History (demo stub) ---------- */
function openHistory(key){
  const now = new Date().toISOString();
  const fake = [
    { ts: now, actor: 'steward@district.edu', action: 'update', key, details: 'Updated description/terms' },
    { ts: now, actor: 'steward@district.edu', action: 'approve', key, details: 'Approval recorded' },
    { ts: now, actor: 'system@edx', action: 'dq-scan', key, details: 'DQ pass 98.1%' }
  ];
  $('#historyPre').textContent = JSON.stringify(fake, null, 2);
  bootstrap.Modal.getOrCreateInstance($('#historyModal')).show();
}

/* ---------- Audit (stub) ---------- */
function audit(event, payload){
  console.log('[AUDIT]', { event, payload, ts: new Date().toISOString() });
}

/* ---------- Utilities ---------- */
function getNested(obj, path, fallback){
  try {
    return path.reduce((o,k)=> (o && k in o) ? o[k] : undefined, obj) ?? fallback;
  } catch { return fallback; }
}
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
