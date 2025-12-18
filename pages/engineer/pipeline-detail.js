// pipeline-detail.js — Integrated with Pipelines list; supports ?pipeline=<name> and fallback from pipelines.json
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const main = $('#app-main');

const detailCatalogUrl = 'pipeline-detail.json';
const pipelinesUrl = 'pipelines.json';

// State for runs pagination & filter
const STATE = { data: null, page: 0, pageSize: 10, filter: '' };

(async function init(){
  try {
    if (window.EDXPartials && typeof window.EDXPartials.loadPartials === 'function') {
      await window.EDXPartials.loadPartials({ sidebar: 'engineer' });
    }
  } catch (e) { console.error('Partials load failed', e); }

  const qs = new URLSearchParams(location.search);
  const pipelineName = qs.get('pipeline') || '';

  // Load catalog + optional fallback
  const [catalog, list] = await Promise.all([
    fetch(detailCatalogUrl, { cache: 'no-store' }).then(r=>r.json()).catch(()=>({pipelines:[]})),
    fetch(pipelinesUrl,      { cache: 'no-store' }).then(r=>r.json()).catch(()=>({pipelines:[]}))
  ]);

  const byName = (arr, n) => (arr||[]).find(p => (p.name||'').toLowerCase() === (n||'').toLowerCase());

  // Prefer detailed catalog entry; otherwise synthesize minimal detail from list
  let found = pipelineName ? byName(catalog.pipelines, pipelineName) : null;
  if (!found) {
    const minimal = pipelineName ? byName(list.pipelines, pipelineName) : null;
    if (minimal) {
      found = {
        name: minimal.name,
        source: minimal.source,
        zone: minimal.zone,
        owner: minimal.owner,
        status: minimal.status === 'Healthy' ? 'Success' : (minimal.status || '—'),
        last_run: minimal.last_run || '—',
        duration: '—',
        next: '—',
        runs: [],
        last_log: '',
        inputs: [],
        outputs: []
      };
    }
  }

  // If still not found, pick the first catalog entry (demo UX)
  STATE.data = found || (catalog.pipelines && catalog.pipelines[0]) || null;

  render(STATE.data);
})();

function statusBadge(s){
  const map = { "Success":"success", "Running":"primary", "Failed":"danger", "Queued":"secondary", "Warning":"warning", "Healthy":"success" };
  const tone = map[s] || "secondary";
  return `<span class="badge text-bg-${tone}">${s}</span>`;
}

function render(p){
  if (!p) { main.innerHTML = `<div class="alert alert-warning">No pipeline detail available.</div>`; return; }

  const meta = {
    pipeline: p.name, source: p.source, zone: p.zone, owner: p.owner,
    status: p.status, last_run: p.last_run, duration: p.duration, next: p.next
  };

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">${meta.pipeline || 'Pipeline'}</h1>
        <div class="small text-body-secondary">${meta.source || ''} · Zone: ${meta.zone || ''}</div>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-secondary btn-sm" id="act-rerun">Rerun</button>
        <button class="btn btn-outline-secondary btn-sm" id="act-backfill">Backfill</button>
        <a class="btn btn-primary btn-sm" href="pipelines.html">All Pipelines</a>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-xl-4">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body"><strong>Summary</strong></div>
          <div class="card-body">
            <dl class="row kv">
              <dt class="col-5">Owner</dt><dd class="col-7">${meta.owner||'—'}</dd>
              <dt class="col-5">Status</dt><dd class="col-7">${statusBadge(meta.status||'—')}</dd>
              <dt class="col-5">Last Run</dt><dd class="col-7">${meta.last_run||'—'}</dd>
              <dt class="col-5">Duration</dt><dd class="col-7">${meta.duration||'—'}</dd>
              <dt class="col-5">Next Schedule</dt><dd class="col-7">${meta.next||'—'}</dd>
            </dl>
            <div class="small text-body-secondary">
              Operational actions are <strong>audit-logged</strong>. Promotion to canonical/publish remains <strong>Steward-gated</strong>.
            </div>
          </div>
        </div>
      </div>

      <div class="col-xl-8">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body d-flex justify-content-between align-items-center">
            <strong>Recent Runs</strong>
            <div class="d-flex gap-2">
              <input id="q" class="form-control form-control-sm" placeholder="Filter by status/id…" style="max-width:220px" value="${STATE.filter}">
              <div class="btn-group btn-group-sm" role="group" aria-label="Pager">
                <button class="btn btn-outline-secondary" id="pg-first">&laquo;</button>
                <button class="btn btn-outline-secondary" id="pg-prev">&lsaquo;</button>
                <span class="btn btn-outline-secondary disabled" id="pg-info">Page 1 of 1</span>
                <button class="btn btn-outline-secondary" id="pg-next">&rsaquo;</button>
                <button class="btn btn-outline-secondary" id="pg-last">&raquo;</button>
              </div>
              <button class="btn btn-outline-secondary btn-sm" id="btnRefresh">Refresh</button>
            </div>
          </div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>Run ID</th><th>Start</th><th>End</th><th>Status</th><th>Duration</th><th class="text-end">Actions</th>
                </tr>
              </thead>
              <tbody id="runs">${rowsHtml(p.runs||[] , 0, STATE.pageSize)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="card shadow-sm mt-3">
      <div class="card-header bg-body d-flex align-items-center justify-content-between">
        <strong>Last Log Snippet</strong>
        <button class="btn btn-outline-secondary btn-sm" id="openLogs"><i class="bi bi-journal-text"></i> Open in Modal</button>
      </div>
      <div class="card-body">
        <div class="log-box" id="logInline">${escapeHtml(p.last_log||'')}</div>
      </div>
    </div>

    <div class="row g-3 mt-1">
      <div class="col-lg-6">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body"><strong>Inputs</strong></div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light"><tr><th>Object</th><th>Count</th><th>Notes</th></tr></thead>
              <tbody>
                ${(p.inputs||[]).map(x=>`
                  <tr><td class="text-nowrap">${escapeHtml(x.name)}</td><td>${x.count||'—'}</td><td class="text-body-secondary">${escapeHtml(x.notes||'')}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body"><strong>Outputs</strong></div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light"><tr><th>Dataset</th><th>Rows</th><th>Freshness</th></tr></thead>
              <tbody>
                ${(p.outputs||[]).map(x=>`
                  <tr><td class="text-nowrap">${escapeHtml(x.dataset)}</td><td>${x.rows||'—'}</td><td class="text-nowrap">${escapeHtml(x.freshness||'')}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  // Wire search, pager, refresh, actions, logs
  $('#q').addEventListener('input', (e)=>{ STATE.filter = e.target.value.toLowerCase().trim(); STATE.page = 0; refreshRuns(p); });
  $('#btnRefresh').addEventListener('click', ()=> refreshRuns(p, true));
  $('#pg-first').addEventListener('click', ()=>{ STATE.page = 0; refreshRuns(p); });
  $('#pg-prev').addEventListener('click', ()=>{ STATE.page = Math.max(0, STATE.page-1); refreshRuns(p); });
  $('#pg-next').addEventListener('click', ()=>{ STATE.page = Math.min(pages(p)-1, STATE.page+1); refreshRuns(p); });
  $('#pg-last').addEventListener('click', ()=>{ STATE.page = pages(p)-1; refreshRuns(p); });

  $('#act-rerun').addEventListener('click', ()=> alert('RERUN requested (demo). Action will be audit-logged.'));
  $('#act-backfill').addEventListener('click', ()=> alert('BACKFILL requested (demo). Action will be audit-logged.'));

  $('#openLogs').addEventListener('click', ()=>{
    $('#logContent').textContent = $('#logInline').textContent;
    new bootstrap.Modal($('#logModal')).show();
  });
}

function rowsHtml(list, startIdx=0, pageSize=10){
  return list.slice(startIdx, startIdx + pageSize).map(r => `
    <tr>
      <td><code>${escapeHtml(r.id||'')}</code></td>
      <td class="text-nowrap">${escapeHtml(r.start||'')}</td>
      <td class="text-nowrap">${escapeHtml(r.end||'—')}</td>
      <td>${statusBadge(r.status||'')}</td>
      <td>${escapeHtml(r.duration||'—')}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary btn-logs" data-run="${escapeAttr(r.id||'')}">Logs</button>
          <button class="btn btn-outline-secondary btn-rerun" data-run="${escapeAttr(r.id||'')}">Rerun</button>
        </div>
      </td>
    </tr>`).join('');
}

function filterRuns(p){
  const runs = (p?.runs)||[];
  if (!STATE.filter) return runs;
  const t = STATE.filter;
  return runs.filter(x => JSON.stringify(x).toLowerCase().includes(t));
}
function pages(p){
  return Math.max(1, Math.ceil(filterRuns(p).length / STATE.pageSize));
}
function refreshRuns(p, forceReload=false){
  if (forceReload) { /* real app would refetch */ }
  const all = filterRuns(p);
  const start = STATE.page * STATE.pageSize;
  $('#runs').innerHTML = rowsHtml(all, start, STATE.pageSize);
  $('#pg-info').textContent = `Page ${STATE.page + 1} of ${Math.max(1, Math.ceil(all.length / STATE.pageSize))}`;
  $('#pg-first').disabled = $('#pg-prev').disabled = STATE.page <= 0;
  $('#pg-last').disabled  = $('#pg-next').disabled = STATE.page >= Math.max(1, Math.ceil(all.length / STATE.pageSize)) - 1;

  $$('.btn-logs').forEach(b => b.addEventListener('click', ()=>{
    $('#logContent').textContent = $('#logInline').textContent;
    new bootstrap.Modal($('#logModal')).show();
  }));
  $$('.btn-rerun').forEach(b => b.addEventListener('click', ()=>{
    const run = b.getAttribute('data-run');
    alert(`RERUN requested for ${run||'(unknown)'} (demo). Action will be audit-logged.`);
  }));
}

// Safe escaping helpers
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }
