/* Validation & Drift (Steward) — production-ready
 * - CSP-safe (no inline); uses partials-loader for shared UI + auth
 * - Search, filters, cursor-style pagination (10/20/50) for Violations and Drift
 * - Bulk Waive with reason; Investigate panel with evidence stub; Export CSV
 * - Runs history table; audit stubs for evidence trail
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const JSON_URL = 'data-validation.json';

const STATE = {
  raw: null,

  // Violations
  vPage: 1,
  vPageSize: 10,
  vQ: '',
  vSeverity: 'Any',
  vOwner: 'Any',
  vDataset: 'Any',
  vSelected: new Set(),

  // Drift
  dPage: 1,
  dPageSize: 10,
  dQ: '',
  dSeverity: 'Any',
  dDataset: 'Any'
};

(async function init(){
  const d = await fetch(JSON_URL, { cache: 'no-store' })
    .then(r => r.json())
    .catch(() => ({ defaults:{pageSize:10,severities:[],owners:[]}, violations:[], drift:[], runs:[], rules:[] }));

  STATE.raw = d;
  STATE.vPageSize = d?.defaults?.pageSize || 10;
  STATE.dPageSize = d?.defaults?.pageSize || 10;

  renderShell(d);
  wireGlobal(d);
  drawViolations();
  drawDrift();
  drawRuns();
})();

/* ---------- Render ---------- */
function renderShell(d){
  $('#app-main').innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">Validation & Drift</h1>
        <div class="small text-body-secondary">Gate quality at <code>staging/publish</code>, track drift, and keep an auditable trail.</div>
      </div>
      <div class="d-flex actions">
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm" type="button" aria-label="Refresh">
          <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Refresh
        </button>
        <button id="btnExportCSV" class="btn btn-outline-secondary btn-sm" type="button">Export CSV</button>
        <button id="btnWaiveBulk" class="btn btn-outline-danger btn-sm" type="button" disabled>Waive selected</button>
      </div>
    </div>

    <div class="row g-3">
      <!-- Violations -->
      <section class="col-xl-7" aria-label="Rule Violations">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body">
            <div class="d-flex flex-wrap align-items-end gap-2 filters">
              <div class="flex-grow-1" style="max-width: 320px;">
                <label class="form-label small text-body-secondary" for="vQ">Search (rule, dataset, run)</label>
                <input id="vQ" class="form-control form-control-sm" placeholder="Type to search…">
              </div>
              <div>
                <label class="form-label small text-body-secondary" for="vSeverity">Severity</label>
                <select id="vSeverity" class="form-select form-select-sm">
                  <option>Any</option>
                  ${(d.defaults?.severities||[]).map(s=>`<option>${s}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label small text-body-secondary" for="vOwner">Owner</label>
                <select id="vOwner" class="form-select form-select-sm">
                  <option>Any</option>
                  ${(d.defaults?.owners||[]).map(o=>`<option>${o}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label small text-body-secondary" for="vDataset">Dataset</label>
                <select id="vDataset" class="form-select form-select-sm">
                  <option>Any</option>
                  ${Array.from(new Set((d.rules||[]).map(r=>r.dataset))).map(ds=>`<option>${ds}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label small text-body-secondary" for="vPageSize">Rows/page</label>
                <select id="vPageSize" class="form-select form-select-sm page-size">
                  ${[10,20,50].map(n=>`<option value="${n}" ${n==(STATE.vPageSize||10)?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>

          <div class="table-responsive">
            <table class="table align-middle mb-0" id="violTable">
              <thead class="table-light">
                <tr>
                  <th style="width:1%"><input id="vSelAll" class="form-check-input" type="checkbox" aria-label="Select all"></th>
                  <th>When</th>
                  <th>Rule</th>
                  <th>Dataset</th>
                  <th>Severity</th>
                  <th>Count</th>
                  <th>Run</th>
                  <th class="text-end">Action</th>
                </tr>
              </thead>
              <tbody id="violBody"><tr><td colspan="8"><div class="empty text-center">Loading…</div></td></tr></tbody>
            </table>
          </div>

          <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
            <div id="vRange" class="small text-body-secondary">Rows 0–0 of 0</div>
            <nav aria-label="Violations pagination"><ul class="pagination pagination-sm mb-0" id="vPager"></ul></nav>
          </div>
        </div>
      </section>

      <!-- Drift -->
      <section class="col-xl-5" aria-label="Drift Signals">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body">
            <div class="d-flex flex-wrap align-items-end gap-2 filters">
              <div class="flex-grow-1" style="max-width: 320px;">
                <label class="form-label small text-body-secondary" for="dQ">Search (field, dataset)</label>
                <input id="dQ" class="form-control form-control-sm" placeholder="Type to search…">
              </div>
              <div>
                <label class="form-label small text-body-secondary" for="dSeverity">Severity</label>
                <select id="dSeverity" class="form-select form-select-sm">
                  <option>Any</option>
                  ${(d.defaults?.severities||[]).map(s=>`<option>${s}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label small text-body-secondary" for="dDataset">Dataset</label>
                <select id="dDataset" class="form-select form-select-sm">
                  <option>Any</option>
                  ${Array.from(new Set((d.drift||[]).map(x=>x.dataset))).map(ds=>`<option>${ds}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label small text-body-secondary" for="dPageSize">Rows/page</label>
                <select id="dPageSize" class="form-select form-select-sm page-size">
                  ${[10,20,50].map(n=>`<option value="${n}" ${n==(STATE.dPageSize||10)?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>

          <div class="table-responsive">
            <table class="table align-middle mb-0" id="driftTable">
              <thead class="table-light"><tr><th>Field</th><th>From → To</th><th>Δ</th><th>Dataset</th><th>Window</th></tr></thead>
              <tbody id="driftBody"><tr><td colspan="5"><div class="empty text-center">Loading…</div></td></tr></tbody>
            </table>
          </div>

          <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
            <div id="dRange" class="small text-body-secondary">Rows 0–0 of 0</div>
            <nav aria-label="Drift pagination"><ul class="pagination pagination-sm mb-0" id="dPager"></ul></nav>
          </div>
        </div>
      </section>
    </div>

    <!-- Runs -->
    <section class="mt-3" aria-label="Run History">
      <div class="card card-subtle shadow-sm">
        <div class="card-header bg-body"><strong>Run History</strong></div>
        <div class="table-responsive">
          <table class="table align-middle mb-0">
            <thead class="table-light"><tr><th>Run</th><th>Started</th><th>Ended</th><th>Inputs</th><th>Status</th></tr></thead>
            <tbody id="runsBody"><tr><td colspan="5"><div class="empty text-center">Loading…</div></td></tr></tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Decision Modal (Waive) -->
    <div class="modal fade" id="decisionModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <form class="modal-content" id="decisionForm">
          <div class="modal-header">
            <h2 class="modal-title fs-6" id="decisionTitle">Waive</h2>
            <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div id="decisionSummary" class="small mb-2"></div>
            <div class="mb-2">
              <label for="decisionReason" class="form-label">Reason (required)</label>
              <textarea id="decisionReason" class="form-control" rows="3" required placeholder="Explain why the waiver is allowed per policy…"></textarea>
            </div>
            <div class="form-text">This will be audit-logged with your identity and run id; downstream gates will reflect the waiver policy.</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancel</button>
            <button id="decisionSubmit" class="btn btn-primary" type="submit">Submit</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Investigate Offcanvas -->
    <div class="offcanvas offcanvas-end" tabindex="-1" id="investigatePanel" aria-labelledby="investigateTitle">
      <div class="offcanvas-header">
        <h2 class="offcanvas-title fs-6" id="investigateTitle">Investigate</h2>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
      </div>
      <div class="offcanvas-body">
        <div class="small text-body-secondary">Evidence pack (stub): rule config, sample ids, last run metadata, and suggested next steps.</div>
        <pre id="investigatePre" class="small mt-2 mb-0"></pre>
      </div>
    </div>
  `;
}

/* ---------- Wiring ---------- */
function wireGlobal(d){
  $('#btnRefresh').addEventListener('click', () => location.reload());
  $('#btnExportCSV').addEventListener('click', exportCsv);
  $('#btnWaiveBulk').addEventListener('click', () => openWaive(Array.from(STATE.vSelected)));

  // Violations filters
  $('#vQ').addEventListener('input', e => { STATE.vQ = e.target.value.trim().toLowerCase(); STATE.vPage = 1; drawViolations(); });
  $('#vSeverity').addEventListener('change', e => { STATE.vSeverity = e.target.value; STATE.vPage = 1; drawViolations(); });
  $('#vOwner').addEventListener('change', e => { STATE.vOwner = e.target.value; STATE.vPage = 1; drawViolations(); });
  $('#vDataset').addEventListener('change', e => { STATE.vDataset = e.target.value; STATE.vPage = 1; drawViolations(); });
  $('#vPageSize').addEventListener('change', e => { STATE.vPageSize = Number(e.target.value)||10; STATE.vPage = 1; drawViolations(); });

  // Drift filters
  $('#dQ').addEventListener('input', e => { STATE.dQ = e.target.value.trim().toLowerCase(); STATE.dPage = 1; drawDrift(); });
  $('#dSeverity').addEventListener('change', e => { STATE.dSeverity = e.target.value; STATE.dPage = 1; drawDrift(); });
  $('#dDataset').addEventListener('change', e => { STATE.dDataset = e.target.value; STATE.dPage = 1; drawDrift(); });
  $('#dPageSize').addEventListener('change', e => { STATE.dPageSize = Number(e.target.value)||10; STATE.dPage = 1; drawDrift(); });

  // Delegated actions
  document.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-run]');
    const investigateBtn = e.target.closest('button[data-investigate]');
    const waiveBtn = e.target.closest('button[data-waive]');
    const checkbox = e.target.closest('input[data-select]');

    if (investigateBtn && row) {
      const payload = JSON.parse(row.getAttribute('data-run'));
      openInvestigate(payload);
      return;
    }
    if (waiveBtn && row) {
      const payload = JSON.parse(row.getAttribute('data-run'));
      openWaive([payload]);
      return;
    }
    if (checkbox) {
      const key = checkbox.getAttribute('data-select');
      if (checkbox.checked) STATE.vSelected.add(key); else STATE.vSelected.delete(key);
      $('#btnWaiveBulk').disabled = STATE.vSelected.size === 0;
      // update select-all
      const all = $$('#violBody input[type="checkbox"][data-select]');
      const checked = all.filter(c => c.checked).length;
      const selAll = $('#vSelAll');
      selAll.indeterminate = checked > 0 && checked < all.length;
      selAll.checked = checked === all.length;
    }
  });

  // Select all
  $('#vSelAll').addEventListener('change', (e) => {
    const all = $$('#violBody input[type="checkbox"][data-select]');
    all.forEach(c => { c.checked = e.target.checked; const key = c.getAttribute('data-select'); if (e.target.checked) STATE.vSelected.add(key); else STATE.vSelected.delete(key); });
    $('#btnWaiveBulk').disabled = STATE.vSelected.size === 0;
  });
}

/* ---------- Violations ---------- */
function filteredViolations(){
  const q = STATE.vQ;
  const has = (s) => String(s||'').toLowerCase().includes(q);
  return (STATE.raw.violations || []).filter(v => {
    const matchesQ = !q || has(v.rule) || has(v.dataset) || has(v.run_id) || has(JSON.stringify(v.sample_ids||[]));
    const matchesSeverity = (STATE.vSeverity==='Any') || v.severity === STATE.vSeverity;
    const matchesOwner = (STATE.vOwner==='Any') || v.owner === STATE.vOwner;
    const matchesDataset = (STATE.vDataset==='Any') || v.dataset === STATE.vDataset;
    return matchesQ && matchesSeverity && matchesOwner && matchesDataset;
  });
}

function drawViolations(){
  const rows = filteredViolations();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / STATE.vPageSize));
  if (STATE.vPage > pages) STATE.vPage = pages;

  const startIdx = (STATE.vPage - 1) * STATE.vPageSize;
  const endIdx   = Math.min(startIdx + STATE.vPageSize, total);
  const slice    = rows.slice(startIdx, endIdx);

  $('#violBody').innerHTML = slice.map(v => {
    const key = `${v.run_id}:${v.rule}:${v.dataset}`;
    const sevCls = v.severity === 'Fail' ? 'danger' : (v.severity === 'Warn' ? 'warning' : 'secondary');
    return `
      <tr data-run='${escapeAttr(JSON.stringify(v))}'>
        <td><input class="form-check-input" type="checkbox" data-select="${escapeAttr(key)}" ${STATE.vSelected.has(key)?'checked':''}></td>
        <td class="text-nowrap">${escapeHtml(v.when)}</td>
        <td>${escapeHtml(v.rule)}</td>
        <td>${escapeHtml(v.dataset)}</td>
        <td><span class="badge text-bg-${sevCls} status-badge">${escapeHtml(v.severity||'')}</span></td>
        <td>${escapeHtml(v.count)}</td>
        <td class="text-nowrap"><code>${escapeHtml(v.run_id)}</code></td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" data-investigate>Investigate</button>
            <button class="btn btn-outline-danger" data-waive>Waive</button>
          </div>
        </td>
      </tr>`;
  }).join('') || `<tr><td colspan="8"><div class="empty text-center">No matching violations</div></td></tr>`;

  $('#vRange').textContent = `Rows ${total ? (startIdx+1) : 0}–${endIdx} of ${total}`;

  const pager = $('#vPager');
  const btn = (p, txt, aria, disabled=false, active=false) =>
    `<li class="page-item ${disabled?'disabled':''} ${active?'active':''}">
       <button class="page-link" type="button" data-v-page="${p}" aria-label="${aria}">${txt}</button>
     </li>`;
  pager.innerHTML = [
    btn(STATE.vPage-1, '&laquo;', 'Previous', STATE.vPage<=1),
    ...Array.from({length: pages}).map((_,i)=>btn(i+1, String(i+1), `Page ${i+1}`, false, i+1===STATE.vPage)),
    btn(STATE.vPage+1, '&raquo;', 'Next', STATE.vPage>=pages)
  ].join('');
  $$('#vPager .page-link').forEach(el => el.addEventListener('click', () => {
    const p = Number(el.getAttribute('data-v-page'));
    if (!Number.isNaN(p)) { STATE.vPage = p; drawViolations(); }
  }));
}

/* ---------- Drift ---------- */
function filteredDrift(){
  const q = STATE.dQ;
  const has = (s) => String(s||'').toLowerCase().includes(q);
  return (STATE.raw.drift || []).filter(x => {
    const matchesQ = !q || has(x.field) || has(x.dataset) || has(x.window);
    const matchesSeverity = (STATE.dSeverity==='Any') || x.severity === STATE.dSeverity;
    const matchesDataset = (STATE.dDataset==='Any') || x.dataset === STATE.dDataset;
    return matchesQ && matchesSeverity && matchesDataset;
  });
}

function drawDrift(){
  const rows = filteredDrift();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / STATE.dPageSize));
  if (STATE.dPage > pages) STATE.dPage = pages;

  const startIdx = (STATE.dPage - 1) * STATE.dPageSize;
  const endIdx   = Math.min(startIdx + STATE.dPageSize, total);
  const slice    = rows.slice(startIdx, endIdx);

  $('#driftBody').innerHTML = slice.map(x => `
    <tr>
      <td class="text-nowrap">${escapeHtml(x.field)}</td>
      <td>${escapeHtml(x.from)} → ${escapeHtml(x.to)}</td>
      <td><span class="badge rounded-pill badge-mini">${escapeHtml(x.delta)}</span></td>
      <td class="text-nowrap">${escapeHtml(x.dataset||'')}</td>
      <td class="text-nowrap">${escapeHtml(x.window||'')}</td>
    </tr>
  `).join('') || `<tr><td colspan="5"><div class="empty text-center">No matching drift</div></td></tr>`;

  $('#dRange').textContent = `Rows ${total ? (startIdx+1) : 0}–${endIdx} of ${total}`;

  const pager = $('#dPager');
  const btn = (p, txt, aria, disabled=false, active=false) =>
    `<li class="page-item ${disabled?'disabled':''} ${active?'active':''}">
       <button class="page-link" type="button" data-d-page="${p}" aria-label="${aria}">${txt}</button>
     </li>`;
  pager.innerHTML = [
    btn(STATE.dPage-1, '&laquo;', 'Previous', STATE.dPage<=1),
    ...Array.from({length: pages}).map((_,i)=>btn(i+1, String(i+1), `Page ${i+1}`, false, i+1===STATE.dPage)),
    btn(STATE.dPage+1, '&raquo;', 'Next', STATE.dPage>=pages)
  ].join('');
  $$('#dPager .page-link').forEach(el => el.addEventListener('click', () => {
    const p = Number(el.getAttribute('data-d-page'));
    if (!Number.isNaN(p)) { STATE.dPage = p; drawDrift(); }
  }));
}

/* ---------- Runs ---------- */
function drawRuns(){
  const rows = STATE.raw.runs || [];
  $('#runsBody').innerHTML = rows.map(r => `
    <tr>
      <td class="text-nowrap"><code>${escapeHtml(r.run_id)}</code></td>
      <td class="text-nowrap">${escapeHtml(r.started)}</td>
      <td class="text-nowrap">${escapeHtml(r.ended)}</td>
      <td class="text-truncate" style="max-width:420px">${escapeHtml((r.inputs||[]).join(', '))}</td>
      <td>${escapeHtml(r.status||'')}</td>
    </tr>
  `).join('') || `<tr><td colspan="5"><div class="empty text-center">No runs</div></td></tr>`;
}

/* ---------- Investigate / Waive ---------- */
function openInvestigate(payload){
  $('#investigateTitle').textContent = `Investigate — ${payload.rule}`;
  const ruleMeta = (STATE.raw.rules||[]).find(r => r.name === payload.rule && r.dataset === payload.dataset);
  const pack = {
    violation: payload,
    rule_meta: ruleMeta || null,
    suggested_steps: [
      'Review recent schema changes and upstream connectors.',
      'Inspect sample IDs in staging for anomalies.',
      'If non-impacting, consider temporary waiver with expiry.'
    ]
  };
  $('#investigatePre').textContent = JSON.stringify(pack, null, 2);
  bootstrap.Offcanvas.getOrCreateInstance($('#investigatePanel')).show();
}

function openWaive(list){
  if (!list?.length) return;
  const summary = list.length === 1
    ? `${list[0].rule} on ${list[0].dataset} (run ${list[0].run_id})`
    : `${list.length} violations`;
  $('#decisionSummary').innerHTML = escapeHtml(summary);
  const modal = bootstrap.Modal.getOrCreateInstance($('#decisionModal'));
  const form = $('#decisionForm');
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const reason = $('#decisionReason').value.trim();
    if (!reason) return;
    list.forEach(v => audit('dq.waive', { run_id: v.run_id, rule: v.rule, dataset: v.dataset, reason }));
    $('#decisionReason').value = '';
    modal.hide();
  };
  modal.show();
}

/* ---------- Export CSV ---------- */
function exportCsv(){
  const rows = filteredViolations();
  const headers = ['when','rule','dataset','severity','count','run_id','owner'];
  const body = rows.map(v => [v.when, v.rule, v.dataset, v.severity, v.count, v.run_id, v.owner]
    .map(x => `"${String(x??'').replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','), ...body].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edx-validation-violations-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  audit('dq.export.csv', { rows: rows.length });
}

/* ---------- Audit (stub) ---------- */
function audit(event, payload){
  console.log('[AUDIT]', { event, payload, ts: new Date().toISOString() });
}

/* ---------- Utils ---------- */
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
