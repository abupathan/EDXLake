// pipelines.js — Production-ready EDX Pipelines page (links → pipeline-detail.html?pipeline=<name>)
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const main = $('#app-main');
const jsonUrl = 'pipelines.json';

// ---- State ----
const STATE = {
  all: [],
  view: [],
  page: 0,
  pageSize: 10,
  filters: { q:'', status:'', zone:'', source:'' }
};

// ---- Init ----
(async function init(){
  // Ensure header/sidebar/footer are injected by global loader
  try {
    if (window.EDXPartials && typeof window.EDXPartials.loadPartials === 'function') {
      await window.EDXPartials.loadPartials({ sidebar: 'engineer' });
    }
  } catch (e) {
    console.error('Partials load failed', e);
  }

  // Load data, then render
  try {
    const d = await fetch(jsonUrl, {cache:'no-store'}).then(r=>r.json());
    STATE.all = Array.isArray(d.pipelines) ? d.pipelines : [];
  } catch {
    STATE.all = [];
  }
  renderShell();
  bindToolbar();
  applyFilters();
})();

// ---- Rendering ----
function renderShell(){
  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-1">Pipelines</h1>
        <p class="text-muted mb-0">Operate ETL/ELT pipelines. Actions are audit-logged. Promotion to canonical/publish remains Steward-gated.</p>
      </div>
      <div class="d-flex toolbar align-items-center flex-wrap">
        <input id="q" class="form-control form-control-sm" placeholder="Search pipelines…" style="max-width:260px">
        <select id="f-status" class="form-select form-select-sm">
          <option value="">Status: All</option>
          <option>Healthy</option><option>Running</option><option>Warning</option><option>Failed</option><option>Queued</option>
        </select>
        <select id="f-zone" class="form-select form-select-sm">
          <option value="">Zone: All</option>
          <option>staging</option><option>canonical</option><option>publish</option>
        </select>
        <select id="f-source" class="form-select form-select-sm">
          <option value="">Source: All</option>
        </select>
        <div class="btn-group btn-group-sm ms-1" role="group" aria-label="Bulk actions">
          <button id="bulk-rerun"  class="btn btn-outline-secondary" disabled>Rerun</button>
          <button id="bulk-pause"  class="btn btn-outline-secondary" disabled>Pause</button>
          <button id="bulk-resume" class="btn btn-outline-secondary" disabled>Resume</button>
        </div>
      </div>
    </div>

    <!-- KPIs -->
    <section class="kpis" aria-label="Pipeline health KPIs">
      <div class="kpi"><div class="label">Total</div><div class="value" id="k-total">0</div><div class="foot">All pipelines</div></div>
      <div class="kpi"><div class="label">Healthy</div><div class="value" id="k-healthy">0</div><div class="foot"><span class="badge text-bg-success">Healthy</span></div></div>
      <div class="kpi"><div class="label">Running</div><div class="value" id="k-running">0</div><div class="foot"><span class="badge text-bg-primary">Running</span></div></div>
      <div class="kpi"><div class="label">Failed / Warning</div><div class="value" id="k-issues">0</div><div class="foot"><span class="badge text-bg-danger">Failed</span> / <span class="badge text-bg-warning">Warning</span></div></div>
    </section>

    <!-- Table -->
    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th style="width:32px"><input type="checkbox" id="sel-all" aria-label="Select all"></th>
              <th>Pipeline</th>
              <th>Source</th>
              <th>Zone</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Last Run</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody id="rows"><tr><td class="p-3" colspan="8">Loading…</td></tr></tbody>
        </table>
      </div>
      <div class="card-footer d-flex justify-content-between align-items-center flex-wrap gap-2">
        <small class="text-body-secondary">Select a pipeline to view run history and logs.</small>
        <nav class="pager">
          <button class="btn btn-sm btn-outline-secondary" id="pg-first" disabled>&laquo;</button>
          <button class="btn btn-sm btn-outline-secondary" id="pg-prev"  disabled>&lsaquo;</button>
          <span class="small" id="pg-info">Page 1 of 1</span>
          <button class="btn btn-sm btn-outline-secondary" id="pg-next"  disabled>&rsaquo;</button>
          <button class="btn btn-sm btn-outline-secondary" id="pg-last"  disabled>&raquo;</button>
        </nav>
      </div>
    </div>
  `;

  // Populate source filter options from data
  const sources = Array.from(new Set(STATE.all.map(p => p.source).filter(Boolean)));
  $('#f-source').innerHTML = `<option value="">Source: All</option>${sources.map(s=>`<option>${s}</option>`).join('')}`;
}

function statusBadge(s){
  const map = { "Healthy":"success", "Running":"primary", "Failed":"danger", "Queued":"secondary", "Warning":"warning" };
  const tone = map[s] || "secondary";
  return `<span class="badge text-bg-${tone}">${s}</span>`;
}

function rowHtml(p, idx){
  const q = encodeURIComponent(p.name);
  return `
    <tr data-idx="${idx}">
      <td><input type="checkbox" class="sel-row" aria-label="Select ${p.name}"></td>
      <td class="pipeline-name"><a href="pipeline-detail.html?pipeline=${q}">${p.name}</a></td>
      <td>${p.source}</td>
      <td class="text-nowrap">${p.zone}</td>
      <td>${p.owner}</td>
      <td>${statusBadge(p.status)}</td>
      <td class="text-nowrap">${p.last_run}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <a class="btn btn-outline-secondary" href="pipeline-detail.html?pipeline=${q}">Runs</a>
          <button class="btn btn-outline-secondary act-rerun">Rerun</button>
          <button class="btn btn-outline-secondary act-pause">Pause</button>
          <button class="btn btn-outline-secondary act-resume">Resume</button>
        </div>
      </td>
    </tr>`;
}

// ---- Filters / Search / Pagination ----
function bindToolbar(){
  $('#q').addEventListener('input', e => { STATE.filters.q = e.target.value.toLowerCase().trim(); applyFilters(); });
  $('#f-status').addEventListener('change', e => { STATE.filters.status = e.target.value; applyFilters(); });
  $('#f-zone').addEventListener('change', e => { STATE.filters.zone = e.target.value; applyFilters(); });
  $('#f-source').addEventListener('change', e => { STATE.filters.source = e.target.value; applyFilters(); });

  // pager
  $('#pg-first').addEventListener('click', ()=>{ STATE.page=0; renderTable(); });
  $('#pg-prev').addEventListener('click', ()=>{ STATE.page=Math.max(0, STATE.page-1); renderTable(); });
  $('#pg-next').addEventListener('click', ()=>{ const pages = Math.ceil(STATE.view.length/STATE.pageSize); STATE.page=Math.min(pages-1, STATE.page+1); renderTable(); });
  $('#pg-last').addEventListener('click', ()=>{ const pages = Math.ceil(STATE.view.length/STATE.pageSize); STATE.page=pages-1; renderTable(); });
}

function applyFilters(){
  const { q, status, zone, source } = STATE.filters;
  STATE.view = STATE.all.filter(p => {
    const okQ = !q || JSON.stringify(p).toLowerCase().includes(q);
    const okS = !status || p.status === status;
    const okZ = !zone   || p.zone   === zone;
    const okSrc = !source || p.source === source;
    return okQ && okS && okZ && okSrc;
  });
  STATE.page = 0;
  renderKpis();
  renderTable();
}

function renderKpis(){
  const total = STATE.view.length;
  const healthy = STATE.view.filter(p=>p.status==='Healthy').length;
  const running = STATE.view.filter(p=>p.status==='Running').length;
  const issues  = STATE.view.filter(p=>p.status==='Failed' || p.status==='Warning').length;
  $('#k-total').textContent = total;
  $('#k-healthy').textContent = healthy;
  $('#k-running').textContent = running;
  $('#k-issues').textContent = issues;
}

function renderTable(){
  const tbody = $('#rows');
  const start = STATE.page * STATE.pageSize;
  const rows = STATE.view.slice(start, start + STATE.pageSize).map((p, i)=>rowHtml(p, start+i)).join('');
  tbody.innerHTML = rows || `<tr><td class="p-3" colspan="8">No pipelines match.</td></tr>`;

  // pager enablement
  const pages = Math.max(1, Math.ceil(STATE.view.length / STATE.pageSize));
  $('#pg-info').textContent = `Page ${STATE.page + 1} of ${pages}`;
  $('#pg-first').disabled = $('#pg-prev').disabled = STATE.page <= 0;
  $('#pg-last').disabled  = $('#pg-next').disabled = STATE.page >= pages - 1;

  // wire row selections & actions
  $('#sel-all').checked = false;
  $('#sel-all').onchange = () => $$('.sel-row').forEach(cb => cb.checked = $('#sel-all').checked) || updateBulk();
  $$('.sel-row').forEach(cb => cb.addEventListener('change', updateBulk));

  $$('.act-rerun').forEach(btn => btn.addEventListener('click', e => rowAction(e,'rerun')));
  $$('.act-pause').forEach(btn => btn.addEventListener('click', e => rowAction(e,'pause')));
  $$('.act-resume').forEach(btn => btn.addEventListener('click', e => rowAction(e,'resume')));

  updateBulk();
}

// ---- Actions ----
function selectedRows(){
  return $$('.sel-row').map((cb,i) => cb.checked ? Number(cb.closest('tr').dataset.idx) : null).filter(v => v!==null);
}
function updateBulk(){
  const any = selectedRows().length > 0;
  $('#bulk-rerun').disabled  = !any;
  $('#bulk-pause').disabled  = !any;
  $('#bulk-resume').disabled = !any;
}
function rowAction(e, kind){
  const idx = Number(e.target.closest('tr').dataset.idx);
  const p = STATE.view[idx];
  if (!p) return;
  alert(`${kind.toUpperCase()} requested for ${p.name} (demo). Action will be audit-logged.`);
}
['bulk-rerun','bulk-pause','bulk-resume'].forEach(id => {
  const kind = id.replace('bulk-','');
  document.addEventListener('click', e => {
    if (e.target.id !== id) return;
    const idxs = selectedRows();
    if (!idxs.length) return;
    const names = idxs.map(i => STATE.view[i]?.name).filter(Boolean);
    alert(`${kind.toUpperCase()} requested for ${names.length} pipeline(s):\n- ${names.join('\n- ')}\n(demo)`);
  });
});
