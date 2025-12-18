/* EDX — My Access & Purpose (Data Consumer)
 * Enhancements:
 * - Effective Access panel (role, scopes, sensitivity outcome, purposes)
 * - Read-only Policy Decision Trace for selected dataset + purpose
 * - “Request broader access” link
 * Keeps:
 * - Search, Purpose filter, Sort, Pagination, Simulator
 * CSP-safe; data from ./my-access.json
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const main = $('#app-main');

const DATA_URL = './my-access.json';

const state = {
  q: '',
  purpose: '',
  sort: { key: 'name', dir: 'asc' },
  page: 1,
  size: 10,
  roles: [],
  purposesEnabled: [],
  scopes: { org:'—', campus:'—', program:'—', term:'—' },
  sensitivity_outcome: 'PII masked',
  datasets: [],
  decisions: [] // for decision trace demo
};

/* ---------- Utilities ---------- */
function normalize(v){ return String(v||'').toLowerCase(); }
function cmp(a,b){ return a<b?-1:a>b?1:0; }
function debounce(fn, ms=200){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; }

function paginate(arr, page, size){
  const total = arr.length;
  const pages = Math.max(1, Math.ceil(total/size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p-1)*size, end = Math.min(total, start+size);
  return { total, pages, page: p, start, end, slice: arr.slice(start, end) };
}

function badge(text, cls='badge-mini'){ return `<span class="badge rounded-pill ${cls} me-1">${text}</span>`; }
function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }

/* ---------- Data ---------- */
async function loadData(){
  try{
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();

    state.roles = d.roles || [];
    state.purposesEnabled = d.purposes_enabled || [];
    state.scopes = d.scopes || state.scopes;
    state.sensitivity_outcome = d.sensitivity_outcome || state.sensitivity_outcome;

    state.datasets = (d.datasets || []).map(x=>({
      name: x.name,
      purposes: x.purposes || [],
      masked_columns: x.masked_columns || [],
      notes: x.notes || '',
      scope_overrides: x.scope_overrides || null // optional
    }));

    state.decisions = Array.isArray(d.decisions) ? d.decisions : [];

  }catch(e){
    console.error('[EDX] my-access load failed', e);
    state.roles = []; state.purposesEnabled = []; state.datasets = []; state.decisions = [];
  }
}

/* ---------- Effective Access Panel ---------- */
function renderEffectiveAccess(){
  // role line
  const roleLine = `${(state.roles||[]).join(', ') || '—'}`;
  $('#accessRoleLine').textContent = `Role(s): ${roleLine}`;

  // scopes
  const s = state.scopes || {};
  $('#accessScopes').innerHTML = [
    badge(`Org=${escapeHtml(s.org||'—')}`),
    badge(`Campus=${escapeHtml(s.campus||'—')}`),
    badge(`Program=${escapeHtml(s.program||'—')}`),
    badge(`Term=${escapeHtml(s.term||'—')}`)
  ].join('');

  // purposes
  $('#accessPurposes').innerHTML = (state.purposesEnabled||[]).map(p=>badge(escapeHtml(p))).join('') || '—';

  // sensitivity badge outcome
  const sens = (state.sensitivity_outcome || '').toLowerCase();
  const sensEl = $('#accessSensitivity');
  sensEl.textContent = state.sensitivity_outcome || '—';
  sensEl.classList.remove('pii','deid','unmask');
  if (sens.includes('unmask')) sensEl.classList.add('unmask');
  else if (sens.includes('deid')) sensEl.classList.add('deid');
  else sensEl.classList.add('pii'); // default to masked
}

/* ---------- KPIs / Toolbar / Table (existing) ---------- */

function renderKPIs(){
  const uniqueMasked = new Set();
  state.datasets.forEach(d => (d.masked_columns||[]).forEach(c => uniqueMasked.add(c)));
  const datasetsCount = state.datasets.length;
  const maskedCols = uniqueMasked.size;

  return `
    <div class="row g-3 kpi">
      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm"><div class="card-body">
          <div class="small text-body-secondary">Roles</div>
          <div class="value">${state.roles.length}</div>
          <div class="small text-body-secondary">${state.roles.map(r=>badge(r)).join('')}</div>
        </div></div>
      </div>
      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm"><div class="card-body">
          <div class="small text-body-secondary">Enabled Purposes</div>
          <div class="value">${state.purposesEnabled.length}</div>
          <div class="small text-body-secondary">${state.purposesEnabled.map(p=>badge(p)).join('')}</div>
        </div></div>
      </div>
      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm"><div class="card-body">
          <div class="small text-body-secondary">Datasets (Publish)</div>
          <div class="value">${datasetsCount}</div>
          <div class="small text-body-secondary">Governed views available</div>
        </div></div>
      </div>
      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm"><div class="card-body">
          <div class="small text-body-secondary">Masked Columns (unique)</div>
          <div class="value">${maskedCols}</div>
          <div class="small text-body-secondary">Applies across permitted datasets</div>
        </div></div>
      </div>
    </div>`;
}

function renderToolbar(){
  const purposes = Array.from(new Set(state.datasets.flatMap(d => d.purposes))).sort();
  return `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 toolbar">
      <h1 class="h4 mb-0">My Access & Purpose</h1>
      <div class="d-flex gap-2 flex-wrap" role="search">
        <input id="q" class="form-control form-control-sm" placeholder="Search datasets or notes…" value="${escapeHtml(state.q)}">
        <select id="purpose" class="form-select form-select-sm">
          <option value="">All purposes</option>
          ${purposes.map(p=>`<option value="${escapeHtml(p)}" ${state.purpose===p?'selected':''}>${escapeHtml(p)}</option>`).join('')}
        </select>
        <a class="btn btn-outline-secondary btn-sm" href="./query-workbench.html">
          <i class="bi bi-terminal me-1" aria-hidden="true"></i> Open Workbench
        </a>
      </div>
    </div>`;
}

function th(key, label){
  const aria = state.sort.key===key ? (state.sort.dir==='asc'?'ascending':'descending') : 'none';
  const ind  = `<i class="bi bi-caret-down-fill sort-ind" aria-hidden="true"></i>`;
  return `<th scope="col" class="sortable" data-key="${key}" aria-sort="${aria}" title="Sort by ${escapeHtml(label)}">${escapeHtml(label)} ${ind}</th>`;
}

function row(d){
  const purp = (d.purposes||[]).map(p=>badge(p)).join('');
  const masked = (d.masked_columns||[]).map(c=>badge(c, 'badge-pii')).join('') || badge('None', 'badge-ok');
  return `
    <tr>
      <td class="text-nowrap fw-semibold">${escapeHtml(d.name)}</td>
      <td>${purp}</td>
      <td>${masked}</td>
      <td>${escapeHtml(d.notes || '')}</td>
    </tr>`;
}

function renderTable(list){
  const head = `
    <thead class="table-light">
      <tr>
        ${th('name','Dataset')}
        ${th('purposes','Purposes')}
        ${th('masked','Masked Columns')}
        ${th('notes','Notes')}
      </tr>
    </thead>`;

  const body = list.map(row).join('') ||
    `<tr><td colspan="4" class="text-center text-body-secondary py-4">No datasets match your filters.</td></tr>`;

  return `
    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          ${head}
          <tbody id="rows">${body}</tbody>
        </table>
      </div>
      ${renderPager(list.length)}
    </div>`;
}

function renderPager(totalFiltered){
  const pages = Math.max(1, Math.ceil(totalFiltered/state.size));
  const page  = Math.min(state.page, pages);
  return `
    <div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div class="small text-body-secondary" aria-live="polite">
        Page <strong>${page}</strong> of <strong>${pages}</strong> • Rows per page
        <label for="pageSize" class="visually-hidden">Rows per page</label>
        <select id="pageSize" class="form-select form-select-sm d-inline-block" style="width:auto" aria-label="Rows per page">
          ${[10,20,50,100].map(n=>`<option value="${n}" ${n===state.size?'selected':''}>${n}</option>`).join('')}
        </select>
      </div>
      <div class="pagination-wrap" data-paginate>
        <button class="btn btn-outline-secondary btn-sm" data-first ${page===1?'disabled':''} aria-label="First page">«</button>
        <button class="btn btn-outline-secondary btn-sm" data-prev  ${page===1?'disabled':''} aria-label="Previous page">‹</button>
        <span class="small">Page</span>
        <input class="form-control form-control-sm page-input" type="number" min="1" max="${pages}" value="${page}" aria-label="Current page">
        <span class="small">of ${pages}</span>
        <button class="btn btn-outline-secondary btn-sm" data-next ${page===pages?'disabled':''} aria-label="Next page">›</button>
        <button class="btn btn-outline-secondary btn-sm" data-last ${page===pages?'disabled':''} aria-label="Last page">»</button>
      </div>
    </div>`;
}

/* ---------- Simulator (kept) ---------- */

function renderSimulator(){
  const dsOpts = state.datasets.map(d=>`<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
  const puOpts = Array.from(new Set(state.datasets.flatMap(d=>d.purposes))).sort()
                  .map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');

  return `
    <div class="card shadow-sm">
      <div class="card-header bg-body"><strong>Policy Simulator</strong></div>
      <div class="card-body">
        <div class="sim-row">
          <div class="sim-col">
            <label class="form-label" for="simDataset">Dataset</label>
            <select id="simDataset" class="form-select">${dsOpts}</select>
          </div>
          <div class="sim-col">
            <label class="form-label" for="simPurpose">Purpose</label>
            <select id="simPurpose" class="form-select">${puOpts}</select>
          </div>
          <div class="sim-col">
            <button id="simRun" class="btn btn-primary mt-2 mt-sm-0">
              <i class="bi bi-shield-check me-1" aria-hidden="true"></i> Simulate
            </button>
          </div>
        </div>

        <div id="simResult" class="mt-3"></div>
        <div class="help-note text-body-secondary mt-2">
          Simulation is illustrative. Actual masking & row filters are enforced server-side across SQL, APIs, exports, and shares.
        </div>
      </div>
    </div>`;
}

function runSimulation(datasetName, purpose){
  const d = state.datasets.find(x=>x.name===datasetName);
  if (!d) return { allowed:false, reason:'Dataset not found', masked:[] };

  const enabled = state.purposesEnabled.includes(purpose);
  const datasetAllows = (d.purposes||[]).includes(purpose);

  if (!enabled)  return { allowed:false, reason:`Your account is not enabled for purpose "${purpose}".`, masked:[] };
  if (!datasetAllows) return { allowed:false, reason:`Dataset does not permit purpose "${purpose}".`, masked:[] };

  return { allowed:true, reason:'Access allowed. Masking applies as shown.', masked:d.masked_columns||[] };
}

function paintSimulation(){
  const ds = $('#simDataset').value;
  const pu = $('#simPurpose').value;
  const res = runSimulation(ds, pu);
  const b = (t, cls) => `<span class="badge rounded-pill ${cls} me-1">${escapeHtml(t)}</span>`;

  if (!res.allowed){
    $('#simResult').innerHTML = `
      <div class="alert alert-warning mb-2"><i class="bi bi-exclamation-triangle me-1" aria-hidden="true"></i>${escapeHtml(res.reason)}</div>`;
    return;
  }
  const masked = res.masked.length ? res.masked.map(c=>b(c,'badge-pii')).join('') : b('None','badge-ok');
  $('#simResult').innerHTML = `
    <div class="alert alert-success d-flex align-items-center gap-2 mb-2">
      <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
      <div>${escapeHtml(res.reason)}</div>
    </div>
    <div><span class="text-body-secondary">Masked Columns:</span> ${masked}</div>`;
}

/* ---------- Decision Trace ---------- */
function buildDecisionSelectors(){
  const dsSel = $('#traceDataset');
  const puSel = $('#tracePurpose');
  dsSel.innerHTML = state.datasets.map(d=>`<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
  const purposes = Array.from(new Set(state.datasets.flatMap(d=>d.purposes))).sort();
  puSel.innerHTML = purposes.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
}

function evaluateDecision(datasetName, purpose){
  // Find a matching decision from demo JSON; otherwise compute from current state
  const found = state.decisions.find(d => d.dataset===datasetName && d.purpose===purpose);
  if (found) return found;

  const sim = runSimulation(datasetName, purpose);
  const who = (state.roles||[]).join(', ') || 'Data Consumer';
  return {
    dataset: datasetName,
    purpose,
    who,
    why: sim.allowed ? 'Purpose permitted & ABAC scopes satisfied' : 'Purpose not permitted or out of scope',
    outcome: sim.allowed ? 'allow' : 'deny',
    sensitivity: state.sensitivity_outcome || 'PII masked',
    masked_columns: sim.masked || [],
    scope: state.scopes
  };
}

function renderDecisionTrace(){
  const ds = $('#traceDataset').value;
  const pu = $('#tracePurpose').value;
  const dec = evaluateDecision(ds, pu);

  const statusCls = dec.outcome === 'allow' ? 'trace-allow' : 'trace-deny';
  const masked = (dec.masked_columns||[]).length
    ? dec.masked_columns.map(c=>badge(escapeHtml(c),'badge-pii')).join('')
    : badge('None','badge-ok');

  $('#traceResult').innerHTML = `
    <div class="trace-card ${statusCls}">
      <div class="d-flex align-items-center gap-2 mb-2">
        <i class="bi ${dec.outcome==='allow'?'bi-check-circle-fill':'bi-x-octagon-fill'}" aria-hidden="true"></i>
        <strong>${dec.outcome==='allow'?'Allowed':'Denied'}</strong>
        <span class="small text-body-secondary">for <code>${escapeHtml(dec.dataset)}</code> with purpose <code>${escapeHtml(dec.purpose)}</code></span>
      </div>
      <dl class="row small mb-0">
        <dt class="col-4">Who</dt><dd class="col-8">${escapeHtml(dec.who)}</dd>
        <dt class="col-4">Why</dt><dd class="col-8">${escapeHtml(dec.why)}</dd>
        <dt class="col-4">Sensitivity</dt><dd class="col-8">${escapeHtml(dec.sensitivity)}</dd>
        <dt class="col-4">Masked Columns</dt><dd class="col-8">${masked}</dd>
        <dt class="col-4">Scope</dt><dd class="col-8">
          ${badge(`Org=${escapeHtml(dec.scope?.org||'—')}`)}
          ${badge(`Campus=${escapeHtml(dec.scope?.campus||'—')}`)}
          ${badge(`Program=${escapeHtml(dec.scope?.program||'—')}`)}
          ${badge(`Term=${escapeHtml(dec.scope?.term||'—')}`)}
        </dd>
      </dl>
    </div>`;
}

/* ---------- Interactions ---------- */

function wireToolbar(){
  $('#q')?.addEventListener('input', debounce(()=>{ state.q = $('#q').value; state.page=1; renderTableRegion(); }));
  $('#purpose')?.addEventListener('change', ()=>{ state.purpose = $('#purpose').value; state.page=1; renderTableRegion(); });
}

function wireSort(){
  $$('.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.key;
      if (state.sort.key===key) state.sort.dir = state.sort.dir==='asc'?'desc':'asc';
      else { state.sort.key = key; state.sort.dir = key==='name'?'asc':'asc'; }
      state.page = 1; renderTableRegion();
    });
  });
}

function wirePager(total){
  const pages = Math.max(1, Math.ceil(total/state.size));
  const host = $('[data-paginate]');
  host?.querySelector('[data-first]')?.addEventListener('click', ()=>{ state.page=1; renderTableRegion(); });
  host?.querySelector('[data-prev]') ?.addEventListener('click', ()=>{ state.page=Math.max(1,state.page-1); renderTableRegion(); });
  host?.querySelector('[data-next]') ?.addEventListener('click', ()=>{ state.page=Math.min(pages,state.page+1); renderTableRegion(); });
  host?.querySelector('[data-last]') ?.addEventListener('click', ()=>{ state.page=pages; renderTableRegion(); });
  host?.querySelector('input[type="number"]')?.addEventListener('change', (e)=>{
    const v = Math.min(pages, Math.max(1, parseInt(e.target.value||'1',10)));
    state.page = v; renderTableRegion();
  });
  $('#pageSize')?.addEventListener('change', (e)=>{
    state.size = parseInt(e.target.value,10)||10; state.page=1; renderTableRegion();
  });
}

function renderTableRegion(){
  const filtered = state.datasets.filter(d=>{
    const term = normalize(state.q);
    const hit = !term || normalize(d.name).includes(term) || normalize(d.notes).includes(term) ||
                normalize((d.purposes||[]).join(' ')).includes(term) ||
                normalize((d.masked_columns||[]).join(' ')).includes(term);
    const okPurpose = !state.purpose || (d.purposes||[]).includes(state.purpose);
    return hit && okPurpose;
  });

  const sorted = filtered.slice().sort((a,b)=>{
    const {key, dir} = state.sort;
    let va, vb;
    if (key==='name'){ va=a.name; vb=b.name; }
    else if (key==='purposes'){ va=(a.purposes||[]).join(' '); vb=(b.purposes||[]).join(' '); }
    else if (key==='masked'){ va=(a.masked_columns||[]).join(' '); vb=(b.masked_columns||[]).join(' '); }
    else if (key==='notes'){ va=a.notes||''; vb=b.notes||''; }
    return (dir==='asc'?1:-1) * cmp(va, vb);
  });

  const pg = paginate(sorted, state.page, state.size);
  $('#tableRegion').innerHTML = renderTable(pg.slice);
  wireSort();
  wirePager(filtered.length);
}

/* ---------- Page Composition ---------- */
function renderPage(){
  const layout = `
    ${renderToolbar()}
    ${renderKPIs()}
    <div class="row g-3 mt-1">
      <div class="col-xl-7">
        <div id="tableRegion">${renderTable(state.datasets)}</div>
      </div>
      <div class="col-xl-5">
        ${renderSimulator()}
      </div>
    </div>`;
  $('#pageMount').innerHTML = layout;
}

/* ---------- Init ---------- */
(async function init(){
  await loadData();
  renderEffectiveAccess();
  renderPage();

  wireToolbar();
  wireSort();
  wirePager(state.datasets.length);

  // Simulator
  $('#simRun')?.addEventListener('click', paintSimulation);
  paintSimulation();

  // Decision trace
  buildDecisionSelectors();
  $('#btnTrace')?.addEventListener('click', renderDecisionTrace);
  renderDecisionTrace();
})();
