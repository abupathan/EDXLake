// Pipeline Runs — cross-pipeline history (Bootstrap UI, filters, pagination, safe, audit copy)
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const main    = $('#app-main');
const jsonUrl = 'pipeline-runs.json';

const STATE = {
  data: { runs:[], filters:{}, meta:{} },
  query: { pipeline:'', status:'', q:'' },
  page: 0,
  pageSize: 10
};

(async function init(){
  try {
    if (window.EDXPartials && typeof window.EDXPartials.loadPartials === 'function') {
      await window.EDXPartials.loadPartials({ sidebar: 'engineer' });
    }
  } catch(e){ console.error('Partials load failed', e); }

  await loadData();
  renderShell();
  bindToolbar();
  renderTable();
})();

async function loadData(){
  try {
    const d = await fetch(jsonUrl, { cache:'no-store' }).then(r=>r.json());
    STATE.data = d || STATE.data;
  } catch { /* keep defaults */ }
}

/* -------------------- Shell -------------------- */
function renderShell(){
  const pipes = STATE.data.filters?.pipelines || [];
  const statuses = STATE.data.filters?.statuses || [];

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-1">Pipeline Runs</h1>
        <p class="text-muted mb-0">Aggregated executions across pipelines. Actions are audit-logged; promotion remains Steward-gated.</p>
      </div>
      <div class="d-flex toolbar align-items-center flex-wrap">
        <select id="f-pipeline" class="form-select form-select-sm">
          <option value="">Pipeline: All</option>
          ${pipes.map(p=>`<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`).join('')}
        </select>
        <select id="f-status" class="form-select form-select-sm">
          <option value="">Status: All</option>
          ${statuses.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('')}
        </select>
        <input id="q" class="form-control form-control-sm" placeholder="Search id/owner/source…" style="max-width:240px">
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm ms-1">Refresh</button>
      </div>
    </div>

    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Run ID</th>
              <th>Pipeline</th>
              <th>Source</th>
              <th>Zone</th>
              <th>Owner</th>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
              <th>Duration</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
      <div class="card-footer d-flex justify-content-between align-items-center">
        <small class="text-body-secondary">Retry policy and attempts are recorded per run; sensitive values are redacted.</small>
        <nav class="pager">
          <button class="btn btn-sm btn-outline-secondary" id="pg-first">&laquo;</button>
          <button class="btn btn-sm btn-outline-secondary" id="pg-prev">&lsaquo;</button>
          <span class="small" id="pg-info">Page 1 of 1</span>
          <button class="btn btn-sm btn-outline-secondary" id="pg-next">&rsaquo;</button>
          <button class="btn btn-sm btn-outline-secondary" id="pg-last">&raquo;</button>
        </nav>
      </div>
    </div>
  `;
}

function bindToolbar(){
  $('#f-pipeline').addEventListener('change', e => { STATE.query.pipeline = e.target.value; STATE.page=0; renderTable(); });
  $('#f-status').addEventListener('change',   e => { STATE.query.status   = e.target.value; STATE.page=0; renderTable(); });
  $('#q').addEventListener('input',           e => { STATE.query.q        = e.target.value.toLowerCase().trim(); STATE.page=0; renderTable(); });
  $('#btnRefresh').addEventListener('click', async ()=>{ await loadData(); renderShell(); bindToolbar(); renderTable(); });

  // Pager
  $('#pg-first').addEventListener('click', ()=>{ STATE.page=0; renderTable(); });
  $('#pg-prev').addEventListener('click',  ()=>{ STATE.page=Math.max(0, STATE.page-1); renderTable(); });
  $('#pg-next').addEventListener('click',  ()=>{ STATE.page=Math.min(pages()-1, STATE.page+1); renderTable(); });
  $('#pg-last').addEventListener('click',  ()=>{ STATE.page=pages()-1; renderTable(); });
}

/* -------------------- Table + Pagination -------------------- */
function filtered(){
  const { pipeline, status, q } = STATE.query;
  return (STATE.data.runs||[]).filter(r=>{
    const okP = !pipeline || r.pipeline === pipeline;
    const okS = !status   || r.status   === status;
    const okQ = !q || JSON.stringify({id:r.id, owner:r.owner, source:r.source}).toLowerCase().includes(q);
    return okP && okS && okQ;
  });
}
function pages(){ return Math.max(1, Math.ceil(filtered().length / STATE.pageSize)); }

function renderTable(){
  const list = filtered();
  const count = pages();
  STATE.page = Math.min(STATE.page, count-1);
  const start = STATE.page * STATE.pageSize;
  const slice = list.slice(start, start + STATE.pageSize);

  $('#rows').innerHTML = slice.map(r => `
    <tr>
      <td><code>${escapeHtml(r.id)}</code></td>
      <td><a href="pipeline-detail.html?pipeline=${encodeURIComponent(r.pipeline)}">${escapeHtml(r.pipeline)}</a></td>
      <td>${escapeHtml(r.source||'—')}</td>
      <td>${escapeHtml(r.zone||'—')}</td>
      <td>${escapeHtml(r.owner||'—')}</td>
      <td class="text-nowrap">${escapeHtml(r.start||'')}</td>
      <td class="text-nowrap">${escapeHtml(r.end||'')}</td>
      <td>${badge(r.status)}</td>
      <td>${escapeHtml(r.duration||'—')}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary act-logs" data-id="${escapeAttr(r.id)}">Logs</button>
          <button class="btn btn-outline-secondary act-rerun" data-id="${escapeAttr(r.id)}">Rerun</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td class="p-3" colspan="10">No runs found.</td></tr>`;

  // Pager UI
  $('#pg-info').textContent = `Page ${STATE.page + 1} of ${count}`;
  $('#pg-first').disabled = $('#pg-prev').disabled = STATE.page <= 0;
  $('#pg-last').disabled  = $('#pg-next').disabled = STATE.page >= count - 1;

  // Row actions
  $$('.act-logs').forEach(b => b.addEventListener('click', ()=>{
    const run = (STATE.data.runs||[]).find(x => x.id === b.dataset.id);
    $('#logContent').textContent = (run && run.logs) ? run.logs : '(no logs)';
    new bootstrap.Modal($('#logModal')).show();
  }));
  $$('.act-rerun').forEach(b => b.addEventListener('click', ()=> alert(`RERUN requested for ${b.dataset.id}\n(demo) — action will be audit-logged.`)));
}

/* -------------------- Utils -------------------- */
function badge(s){
  const map = { Success:'success', Failed:'danger', Running:'primary', Warning:'warning', Queued:'secondary' };
  return `<span class="badge text-bg-${map[s]||'secondary'}">${escapeHtml(s||'—')}</span>`;
}
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return String(s ?? '').replace(/"/g,'&quot;'); }
