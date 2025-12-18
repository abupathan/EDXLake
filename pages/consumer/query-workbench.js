/* EDX — Query Workbench (Data Consumer)
 * Production updates:
 *  - Restrict to publish views (allow-list)
 *  - Purpose required; audit hook on Run
 *  - Policy-aware preview (masking tags + ABAC scope chips)
 *  - Server-style limits (100–500) & stable ORDER BY
 *  - Saved query compatibility check (warn on major version bump)
 *  - CSP-safe, accessible; no inline JS
 *
 * Demo mode uses ./query-workbench.json.
 */

const $  = (s, r=document) => r.querySelector(s);

const DEMO_URL = './query-workbench.json';
const STORAGE_SAVED = 'edx:workbench:lastSaved';
const STORAGE_AUDIT = 'edx:workbench:audit';
const STORAGE_USER  = 'edx:user';

const state = {
  allowlist: [],          // [{key, display_name, schema_version}, ...]
  purposes: [],           // ["Operational","Research","Compliance"]
  applied_policy: null,   // {masking, org, term, role, policy_snapshot_id}
  dataset: null,          // selected dataset key
  dataset_version: null,  // current schema_version for selected dataset
  default_sql: '',
  masked_columns: [],     // columns to show as masked in preview
  headers: [],            // preview headers
  rows: [],               // preview rows (unmasked demo rows)
  page: 1,
  size: 100,              // server-enforced style choices: 100..500
  error: null
};

/* ---------- helpers ---------- */
function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }

function readJSON(k, fallback){ try{ return JSON.parse(localStorage.getItem(k) || ''); } catch{ return fallback; } }
function writeJSON(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); } catch{} }

function readUser(){
  try { return JSON.parse(localStorage.getItem(STORAGE_USER) || 'null'); } catch { return null; }
}

/* ---------- load demo config ---------- */
async function loadDemo(){
  const res = await fetch(DEMO_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();

  state.purposes = d.purposes || ["Operational","Research","Compliance"];
  state.allowlist = d.allowlist || []; // only publish views
  state.applied_policy = d.applied_policy || null;
  state.default_sql = d.default_sql || '';
  // pick default dataset
  const first = state.allowlist[0];
  if (first){
    state.dataset = first.key;
    state.dataset_version = first.schema_version;
  }
  // dataset-specific demo data (headers/rows/masked)
  if (state.dataset && d.datasets && d.datasets[state.dataset]){
    const ds = d.datasets[state.dataset];
    state.headers = ds.result?.headers || [];
    state.rows = ds.result?.rows || [];
    state.masked_columns = ds.masked_columns || d.masked_columns || [];
  } else {
    state.headers = d.result?.headers || [];
    state.rows = d.result?.rows || [];
    state.masked_columns = d.masked_columns || [];
  }
}

/* ---------- policy banner & applied chips ---------- */
function paintPolicy(){
  const ap = state.applied_policy || {};
  const u = readUser() || {};
  const role = (u.role || ap.role || 'consumer').replace(/_/g,' ');
  const line = `${ap.masking || 'PII masked'} · ${ap.org || 'Org=District-12'} · ${ap.term || 'Term=2024-25'} · Role=${role}`;
  $('#policyLine').textContent = line;
  $('#policySnapshot').textContent = `policy_snapshot_id=${ap.policy_snapshot_id || '—'}`;

  const host = $('#appliedPolicies');
  host.innerHTML = '';
  const chips = [
    ap.masking || 'PII masked',
    ap.org || 'Org=District-12',
    ap.term || 'Term=2024-25',
    `Role=${role}`
  ];
  for (const c of chips){
    const span = document.createElement('span');
    span.className = 'pill';
    span.textContent = c;
    host.appendChild(span);
  }
}

/* ---------- UI setup ---------- */
function buildDatasetSelect(){
  const sel = $('#dataset');
  sel.innerHTML = state.allowlist.map(d => {
    const name = d.display_name || d.key;
    const ver  = d.schema_version || '—';
    return `<option value="${escapeHtml(d.key)}" data-version="${escapeHtml(ver)}">${escapeHtml(name)} · v${escapeHtml(ver)}</option>`;
  }).join('');
  sel.value = state.dataset || '';
}

function buildPurposeSelect(){
  const sel = $('#purpose');
  sel.innerHTML = state.purposes.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
}

function enforceLimitChoices(){
  const sel = $('#limit');
  const allowed = [100,200,300,500];
  sel.value = String(allowed.includes(state.size)? state.size : 100);
}

/* ---------- stable ordering + masking (demo) ---------- */
function applyStableOrdering(rows){
  // If result has event_date or student_id, create a consistent ORDER BY
  const idxDate = state.headers.indexOf('event_date');
  const idxStu  = state.headers.indexOf('student_id');
  const idxKey  = idxStu !== -1 ? idxStu : (idxDate !== -1 ? idxDate : 0);
  return rows.slice().sort((a,b) => {
    const A = a[idxKey] ?? '';
    const B = b[idxKey] ?? '';
    return A < B ? -1 : A > B ? 1 : 0;
  });
}

function applyMasking(rows){
  if (!state.masked_columns || !state.masked_columns.length) return rows;
  const colIdx = state.masked_columns.map(c => state.headers.indexOf(c)).filter(i => i >= 0);
  if (!colIdx.length) return rows;
  return rows.map(r => r.map((v,i) => colIdx.includes(i) ? '●●●●●' : v));
}

/* ---------- results render ---------- */
function paginate(arr, page, size){
  const total = arr.length;
  const pages = Math.max(1, Math.ceil(total/size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p-1)*size, end = Math.min(total, start+size);
  return { total, pages, page: p, start, end, rows: arr.slice(start, end) };
}

function renderResults(){
  const host = $('#results');
  // Apply stable ordering & masking then page
  const ordered = applyStableOrdering(state.rows);
  const masked  = applyMasking(ordered);
  const pg = paginate(masked, state.page, state.size);

  const thead = `<thead class="table-light"><tr>${state.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const body  = pg.rows.map(r=>`<tr>${r.map(v=>`<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('');
  const table = pg.total ? `
    <div class="table-responsive">
      <table class="table align-middle mb-0">${thead}<tbody>${body}</tbody></table>
    </div>` : `<div class="alert alert-info m-3">No rows returned.</div>`;

  host.innerHTML = `
    <div class="card shadow-sm">
      <div class="card-body border-bottom">
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div class="small text-body-secondary">Rows: <strong>${pg.total}</strong></div>
          <div class="d-flex align-items-center gap-2">
            <label class="small me-1" for="pageSize">Rows</label>
            <select id="pageSize" class="form-select form-select-sm" aria-label="Rows per page">
              ${[100,200,300,500].map(n=>`<option value="${n}" ${n===state.size?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      ${table}
      <div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div class="small text-body-secondary" aria-live="polite">
          Showing <strong>${pg.total ? (pg.start+1) : 0}</strong>–<strong>${pg.end}</strong> of <strong>${pg.total}</strong>
        </div>
        <div class="d-flex align-items-center gap-2 flex-wrap" data-paginate>
          <button class="btn btn-outline-secondary btn-sm" data-first ${pg.page===1?'disabled':''} aria-label="First page">«</button>
          <button class="btn btn-outline-secondary btn-sm" data-prev  ${pg.page===1?'disabled':''} aria-label="Previous page">‹</button>
          <span class="small">Page</span>
          <input class="form-control form-control-sm page-input" type="number" min="1" max="${pg.pages}" value="${pg.page}" aria-label="Current page">
          <span class="small">of ${pg.pages}</span>
          <button class="btn btn-outline-secondary btn-sm" data-next ${pg.page===pg.pages?'disabled':''} aria-label="Next page">›</button>
          <button class="btn btn-outline-secondary btn-sm" data-last ${pg.page===pg.pages?'disabled':''} aria-label="Last page">»</button>
        </div>
      </div>
    </div>`;

  // Wire pagination controls
  const hostPg = document.querySelector('[data-paginate]');
  hostPg?.querySelector('[data-first]')?.addEventListener('click', ()=>{ state.page=1; renderResults(); });
  hostPg?.querySelector('[data-prev]') ?.addEventListener('click', ()=>{ state.page=Math.max(1,state.page-1); renderResults(); });
  hostPg?.querySelector('[data-next]') ?.addEventListener('click', ()=>{ state.page=Math.min(pg.pages,state.page+1); renderResults(); });
  hostPg?.querySelector('[data-last]') ?.addEventListener('click', ()=>{ state.page=pg.pages; renderResults(); });
  host.querySelector('#pageSize')?.addEventListener('change', (e)=>{
    state.size = parseInt(e.target.value,10)||100;
    state.page = 1;
    renderResults();
  });
}

/* ---------- run & audit ---------- */
function auditRun(payload){
  const log = readJSON(STORAGE_AUDIT, []);
  log.push(payload);
  writeJSON(STORAGE_AUDIT, log);
}

function onRun(){
  const dsSel = $('#dataset');
  const dsKey = dsSel.value;
  const dsVer = dsSel.selectedOptions[0]?.getAttribute('data-version') || '0.0.0';
  const purpose = $('#purpose').value;
  const limit = parseInt($('#limit').value,10) || 100;
  const sql = $('#sql').value || '';

  // purpose required
  if (!purpose){
    alert('Purpose is required to run a query.');
    $('#purpose').focus();
    return;
  }

  // Restrict to allow-list only
  if (!state.allowlist.find(d => d.key === dsKey)){
    alert('Selected dataset is not in the publish allow-list.');
    return;
  }

  // Enforce server-like limits (100..500)
  state.size = Math.min(500, Math.max(100, limit));

  // Demo: swap dataset sample and masked columns based on selection
  if (window.__demo && window.__demo.datasets && window.__demo.datasets[dsKey]){
    const ds = window.__demo.datasets[dsKey];
    state.headers = ds.result?.headers || [];
    state.rows    = ds.result?.rows || [];
    state.masked_columns = ds.masked_columns || [];
    state.dataset_version = ds.schema_version || dsSel.selectedOptions[0]?.getAttribute('data-version') || '0.0.0';
  }

  // Saved query compatibility check (warn on major version bump)
  const saved = readJSON(STORAGE_SAVED, null);
  if (saved && saved.dataset === dsKey) {
    const warn = majorBump(saved.schema_version, state.dataset_version);
    const pill = $('#compatWarning');
    const txt  = $('#compatText');
    pill.classList.toggle('d-none', !warn);
    if (warn){
      txt.innerHTML = `Saved query created on <code>v${escapeHtml(saved.schema_version||'?')}</code> &nbsp;→&nbsp; current <code>v${escapeHtml(state.dataset_version||'?')}</code>. Review results before use.`;
    }
  } else {
    $('#compatWarning').classList.add('d-none');
  }

  // Build applied policy line for audit
  const ap = state.applied_policy || {};
  const user = readUser() || {};
  const audit = {
    ts: new Date().toISOString(),
    user: user.email || user.name || 'user@example.edu',
    role: user.role || ap.role || 'consumer',
    dataset: dsKey,
    schema_version: state.dataset_version,
    purpose,
    limit: state.size,
    sql,
    applied_policy: {
      masking: ap.masking || 'PII masked',
      org: ap.org || 'Org=District-12',
      term: ap.term || 'Term=2024-25',
      policy_snapshot_id: ap.policy_snapshot_id || '—'
    },
    rowcount_preview: Math.min(state.size, (state.rows||[]).length)
  };
  auditRun(audit);

  // Render
  state.page = 1;
  renderResults();
}

/* ---------- save/load ---------- */
function onSaveQuery(){
  const dsSel = $('#dataset');
  const data = {
    dataset: dsSel.value,
    schema_version: dsSel.selectedOptions[0]?.getAttribute('data-version') || '0.0.0',
    purpose: $('#purpose').value,
    limit: parseInt($('#limit').value,10) || 100,
    sql: $('#sql').value || ''
  };
  writeJSON(STORAGE_SAVED, data);
  alert('Query saved.');
}

function onLoadQuery(){
  const saved = readJSON(STORAGE_SAVED, null);
  if (!saved) { alert('Nothing saved yet.'); return; }
  $('#dataset').value = saved.dataset;
  $('#purpose').value = saved.purpose;
  $('#limit').value   = String(Math.min(500, Math.max(100, saved.limit||100)));
  $('#sql').value     = saved.sql || '';
  // trigger version mismatch warning (if any)
  onRun();
}

/* ---------- utils ---------- */
function majorBump(prev, cur){
  const P = String(prev||'0.0.0').split('.').map(n=>parseInt(n,10)||0);
  const C = String(cur ||'0.0.0').split('.').map(n=>parseInt(n,10)||0);
  return (C[0]||0) > (P[0]||0);
}

/* ---------- init ---------- */
async function init(){
  try{
    const res = await fetch(DEMO_URL, { cache:'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const demo = await res.json();
    window.__demo = demo; // expose for quick dataset swaps during demo
  }catch(e){
    console.error('[EDX] failed to load demo', e);
  }

  await loadDemo();

  // Build UI controls
  buildDatasetSelect();
  buildPurposeSelect();
  enforceLimitChoices();
  paintPolicy();

  // Defaults
  $('#sql').value = state.default_sql || `SELECT * FROM ${state.dataset || 'pub_k12_roster'} ORDER BY 1 LIMIT 100;`;
  $('#dataset').addEventListener('change', ()=>{
    const opt = $('#dataset').selectedOptions[0];
    state.dataset = opt?.value || null;
    state.dataset_version = opt?.getAttribute('data-version') || '0.0.0';
    // Update details link
    const url = new URL('./dataset-detail.html', location.href);
    if (state.dataset) url.searchParams.set('dataset', state.dataset);
    $('#openDetailsBtn').setAttribute('href', url.toString());
    // Rehydrate demo data for selected dataset
    if (window.__demo && window.__demo.datasets && window.__demo.datasets[state.dataset]){
      const ds = window.__demo.datasets[state.dataset];
      state.headers = ds.result?.headers || [];
      state.rows    = ds.result?.rows || [];
      state.masked_columns = ds.masked_columns || [];
    }
    $('#compatWarning').classList.add('d-none');
  });

  $('#runBtn').addEventListener('click', onRun);
  $('#saveQueryBtn').addEventListener('click', onSaveQuery);
  $('#loadQueryBtn').addEventListener('click', onLoadQuery);

  // Prime preview
  onRun();

  // Focus the main region for keyboard users
  $('#main')?.focus();
}

init();
