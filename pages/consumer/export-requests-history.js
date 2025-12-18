/* EDX — Export Requests: History (Data Consumer)
 * New:
 * - Job status stream (queued/running/succeeded/failed) with attempts and reason codes
 * - Manifest viewer (hashes, row count, filters) + Reproduce button
 * - Server-side-style pagination & filtering (dataset/date/status) — simulated locally for demo
 * Kept:
 * - CSP-safe structure, modular partials, sortable table, withdraw action
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const main = $('#app-main');

const DATA_URL = './export-requests-history.json';

const state = {
  q: '',
  dataset: '',
  jobStatus: '',
  dateFrom: '',
  dateTo: '',
  sort: { key: 'updated', dir: 'desc' }, // updated|id|dataset|purpose|approval|job
  page: 1,
  size: 10,
  pageData: { total: 0, items: [] }, // results from "server"
  datasets: [],
  statuses: ['queued','running','succeeded','failed'],
  approvals: ['Pending','Approved','Rejected','Withdrawn']
};

/* ---------- Utilities ---------- */
function toTime(s){ const t = Date.parse(s); return isNaN(t) ? 0 : t; }
function cmp(a,b){ return a<b?-1:a>b?1:0; }
function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }
function norm(v){ return String(v||'').toLowerCase(); }
function debounce(fn, ms=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function badgeJob(s){
  const map = { queued:'q', running:'r', succeeded:'s', failed:'f' };
  const cls = map[(s||'').toLowerCase()] || '';
  return `<span class="badge rounded-pill badge-job ${cls}">${esc(s)}</span>`;
}
function badgeApproval(s){
  const tone = s==='Approved'?'success': s==='Rejected'?'danger' : s==='Pending'?'secondary' : s==='Withdrawn'?'warning':'secondary';
  return `<span class="badge text-bg-${tone} badge-status">${esc(s)}</span>`;
}

/* ---------- "Server" adapter (demo) ---------- */
/* In production this would be:
 *   GET /api/exports/history?page=..&size=..&dataset=..&status=..&from=..&to=..&q=..&sort=updated:desc
 * For the demo we load the JSON once, then filter/sort/paginate here to emulate the server result.
 */
let _raw = null;
async function serverFetch(params){
  if (!_raw){
    const res = await fetch(DATA_URL, { cache:'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _raw = await res.json();
    // derive datasets for filters
    const set = new Set((_raw.requests||[]).map(r=>r.dataset));
    state.datasets = Array.from(set).sort();
  }
  const { q, dataset, jobStatus, dateFrom, dateTo, page, size, sort } = params;

  // Filter
  let list = (_raw.requests||[]).slice();
  if (q){
    const n = norm(q);
    list = list.filter(r => norm(r.id).includes(n) || norm(r.dataset).includes(n) ||
      norm((r.scope||[]).join(' ')).includes(n) || norm(r.purpose).includes(n));
  }
  if (dataset) list = list.filter(r => r.dataset === dataset);
  if (jobStatus) list = list.filter(r => (r.job_status||'').toLowerCase() === jobStatus.toLowerCase());
  if (dateFrom){ const from = toTime(dateFrom); list = list.filter(r => toTime(r.updated) >= from); }
  if (dateTo){ const to  = toTime(dateTo); list = list.filter(r => toTime(r.updated) <= to); }

  // Sort
  const [key,dir] = (sort||'updated:desc').split(':');
  const m = dir==='asc'?1:-1;
  list.sort((a,b)=>{
    let va, vb;
    if (key==='updated'){ va=toTime(a.updated); vb=toTime(b.updated); }
    else if (key==='dataset' || key==='purpose' || key==='id'){ va=a[key]; vb=b[key]; }
    else if (key==='approval'){ va=a.approval_status||''; vb=b.approval_status||''; }
    else if (key==='job'){ va=a.job_status||''; vb=b.job_status||''; }
    else { va=a[key]; vb=b[key]; }
    return m*cmp(va,vb);
  });

  // Page
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total/size));
  const pg = Math.min(Math.max(1,page), pages);
  const start = (pg-1)*size, end = Math.min(total, start+size);
  const items = list.slice(start, end);

  return { total, page: pg, pages, size, items };
}

/* ---------- Rendering ---------- */
function renderToolbar(){
  return `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 toolbar">
      <h1 class="h4 mb-0">Export Requests — History</h1>
      <div class="d-flex gap-2 flex-wrap" role="search">
        <input id="q" class="form-control form-control-sm" placeholder="Search request ID, dataset, scope…" value="${esc(state.q)}" />
        <select id="dataset" class="form-select form-select-sm">
          <option value="">All datasets</option>
          ${state.datasets.map(d=>`<option value="${esc(d)}" ${state.dataset===d?'selected':''}>${esc(d)}</option>`).join('')}
        </select>
        <select id="jobStatus" class="form-select form-select-sm">
          <option value="">All job status</option>
          ${state.statuses.map(s=>`<option value="${esc(s)}" ${state.jobStatus===s?'selected':''}>${esc(s)}</option>`).join('')}
        </select>
        <input id="from" type="date" class="form-control form-control-sm" value="${esc(state.dateFrom)}" aria-label="From date">
        <input id="to"   type="date" class="form-control form-control-sm" value="${esc(state.dateTo)}" aria-label="To date">
        <select id="sort" class="form-select form-select-sm" title="Sort">
          ${[
            ['updated:desc','Updated (new→old)'],
            ['updated:asc','Updated (old→new)'],
            ['id:asc','Request (A→Z)'],
            ['id:desc','Request (Z→A)'],
            ['dataset:asc','Dataset (A→Z)'],
            ['dataset:desc','Dataset (Z→A)'],
            ['job:asc','Job (A→Z)'],
            ['job:desc','Job (Z→A)'],
            ['approval:asc','Approval (A→Z)'],
            ['approval:desc','Approval (Z→A)']
          ].map(([v,l])=>`<option value="${v}" ${v===`${state.sort.key}:${state.sort.dir}`?'selected':''}>${l}</option>`).join('')}
        </select>
        <a class="btn btn-primary btn-sm" href="./export-requests-new.html">
          <i class="bi bi-plus-lg" aria-hidden="true"></i> New Request
        </a>
      </div>
    </div>`;
}

function th(key, label){
  const aria = state.sort.key===key ? (state.sort.dir==='asc'?'ascending':'descending') : 'none';
  const ind  = `<i class="bi bi-caret-down-fill sort-ind" aria-hidden="true"></i>`;
  return `<th scope="col" class="sortable" data-key="${key}" aria-sort="${aria}" title="Sort by ${esc(label)}">${esc(label)} ${ind}</th>`;
}

function row(r){
  // Build status stream
  const stream = (r.status_stream||[]).map(st=>{
    const code = (st.status||'').toLowerCase().startsWith('queue') ? 'q'
              : (st.status||'').toLowerCase().startsWith('run')   ? 'r'
              : (st.status||'').toLowerCase().startsWith('succ')  ? 's'
              : (st.status||'').toLowerCase().startsWith('fail')  ? 'f' : '';
    const reason = st.reason_code ? ` <span class="meta">(${esc(st.reason_code)})</span>` : '';
    const retry = st.attempt && st.attempt>1 ? ` <span class="meta">attempt ${st.attempt}</span>` : '';
    return `<span class="stage ${code}"><span class="dot"></span>${esc(st.status)}${retry}${reason}</span>`;
  }).join('');

  const scope = (r.scope||[]).join(', ');
  const job = r.job_status ? badgeJob(r.job_status) : '—';
  const appr = r.approval_status ? badgeApproval(r.approval_status) : '—';

  return `
    <tr data-id="${esc(r.id)}">
      <td class="fw-semibold text-nowrap">${esc(r.id)}</td>
      <td class="text-nowrap">${esc(r.dataset)}</td>
      <td class="text-nowrap">${esc(r.purpose)}</td>
      <td>${esc(scope)}</td>
      <td class="text-nowrap">${esc(r.retention||'—')}</td>
      <td class="text-nowrap">${appr}</td>
      <td class="text-nowrap">${job}</td>
      <td class="text-nowrap" data-sort="${toTime(r.updated)}">${esc(r.updated)}</td>
      <td>
        <div class="stream">${stream}</div>
      </td>
      <td class="text-end">
        <div class="btn-group btn-group-sm" role="group" aria-label="Actions for ${esc(r.id)}">
          <button class="btn btn-outline-secondary" data-action="manifest">Manifest</button>
          <a class="btn btn-outline-secondary" href="./export-requests-new.html?reproduce=${encodeURIComponent(r.id)}">Reproduce</a>
          <button class="btn btn-outline-danger" data-action="withdraw" ${r.approval_status!=='Pending'?'disabled':''}>Withdraw</button>
        </div>
      </td>
    </tr>`;
}

function renderTable(items){
  const head = `
    <thead class="table-light">
      <tr>
        ${th('id','Request')}
        ${th('dataset','Dataset')}
        ${th('purpose','Purpose')}
        ${th('scope','Scope')}
        ${th('retention','Retention')}
        ${th('approval','Approval')}
        ${th('job','Job')}
        ${th('updated','Updated')}
        <th scope="col">Status Stream</th>
        <th class="text-end" scope="col" aria-label="Actions"></th>
      </tr>
    </thead>`;

  const body = items.map(row).join('') ||
    `<tr><td colspan="10" class="text-center text-body-secondary py-4">No requests match your filters.</td></tr>`;

  return `
    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          ${head}
          <tbody id="rows">${body}</tbody>
        </table>
      </div>
      ${pager()}
    </div>`;
}

function pager(){
  const { total, page, pages, size } = state.pageData;
  return `
    <div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div class="small text-body-secondary" aria-live="polite">
        Showing <strong>${total? ( (page-1)*size + 1) : 0}</strong>–<strong>${Math.min(total, page*size)}</strong> of <strong>${total}</strong>
      </div>
      <div class="pagination-wrap" data-paginate>
        <div class="d-flex align-items-center gap-2">
          <label for="pageSize" class="small me-1">Rows</label>
          <select id="pageSize" class="form-select form-select-sm" aria-label="Rows per page">
            ${[10,20,50,100].map(n=>`<option value="${n}" ${n===state.size?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
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

/* ---------- Manifest Modal ---------- */
function manifestModal(){
  return `
  <div class="modal fade" id="manifestModal" tabindex="-1" aria-labelledby="manifestLbl" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header">
        <h1 class="modal-title fs-6" id="manifestLbl">Export Manifest</h1>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <div id="manifestBody"></div>
      </div>
      <div class="modal-footer">
        <a id="btnReproduce" class="btn btn-primary" href="#">Reproduce export</a>
      </div>
    </div></div>
  </div>`;
}

function renderManifest(r){
  const m = r.manifest || {};
  const filters = (m.filters||[]).map(f=>`<li><code>${esc(f.field)}</code> ${esc(f.op)} <code>${esc(f.value)}</code></li>`).join('') || '<li>None</li>';
  const hashes  = (m.hashes||[]).map(h=>`<li><code>${esc(h.part)}</code> — <code>${esc(h.sha256)}</code></li>`).join('') || '<li>None</li>';
  const kv = `
    <dl class="manifest-kv">
      <dt>Dataset</dt><dd><code>${esc(r.dataset)}</code></dd>
      <dt>Schema Version</dt><dd>${esc(m.schema_version||'—')}</dd>
      <dt>Row Count</dt><dd>${typeof m.row_count==='number'? m.row_count.toLocaleString() : '—'}</dd>
      <dt>Generated</dt><dd>${esc(m.generated_at||'—')}</dd>
      <dt>Policy Snapshot</dt><dd><code>${esc(m.policy_snapshot_id||'—')}</code></dd>
    </dl>
    <hr class="my-3">
    <div class="row">
      <div class="col-md-6">
        <h6>Applied Filters</h6>
        <ol class="small mb-0">${filters}</ol>
      </div>
      <div class="col-md-6">
        <h6>Hashes</h6>
        <ol class="small mb-0">${hashes}</ol>
      </div>
    </div>`;
  $('#manifestBody').innerHTML = kv;
  $('#btnReproduce').setAttribute('href', `./export-requests-new.html?reproduce=${encodeURIComponent(r.id)}`);
}

/* ---------- URL state ---------- */
function readURL(){
  const sp = new URLSearchParams(location.search);
  state.q        = sp.get('q') || '';
  state.dataset  = sp.get('dataset') || '';
  state.jobStatus= sp.get('job') || '';
  state.dateFrom = sp.get('from') || '';
  state.dateTo   = sp.get('to') || '';
  const sort = sp.get('sort') || 'updated:desc';
  const [k,d] = sort.split(':'); state.sort = { key:k, dir:(d==='asc'?'asc':'desc') };
  state.page = Math.max(1, parseInt(sp.get('page')||'1',10));
  state.size = Math.min(100, Math.max(5, parseInt(sp.get('size')||'10',10)));
}
function writeURL(replace=true){
  const sp = new URLSearchParams();
  if (state.q) sp.set('q',state.q);
  if (state.dataset) sp.set('dataset', state.dataset);
  if (state.jobStatus) sp.set('job', state.jobStatus);
  if (state.dateFrom) sp.set('from', state.dateFrom);
  if (state.dateTo) sp.set('to', state.dateTo);
  if (state.page>1) sp.set('page', String(state.page));
  if (state.size!==10) sp.set('size', String(state.size));
  const sort = `${state.sort.key}:${state.sort.dir}`; if (sort!=='updated:desc') sp.set('sort', sort);
  const url = `${location.pathname}?${sp.toString()}`;
  replace ? history.replaceState(null,'',url) : history.pushState(null,'',url);
}

/* ---------- Main render ---------- */
async function render(){
  // fetch page from "server"
  const params = {
    q: state.q, dataset: state.dataset, jobStatus: state.jobStatus,
    dateFrom: state.dateFrom, dateTo: state.dateTo,
    page: state.page, size: state.size,
    sort: `${state.sort.key}:${state.sort.dir}`
  };
  state.pageData = await serverFetch(params);

  const toolbar = renderToolbar();
  const table   = renderTable(state.pageData.items);
  const modals  = manifestModal();

  main.innerHTML = `${toolbar}${table}${modals}`;

  wireToolbar();
  wireSort();
  wirePager();
  wireRowActions();
}

function wireToolbar(){
  $('#q')?.addEventListener('input', debounce(()=>{ state.q=$('#q').value; state.page=1; writeURL(); render(); }));
  $('#dataset')?.addEventListener('change', ()=>{ state.dataset=$('#dataset').value; state.page=1; writeURL(); render(); });
  $('#jobStatus')?.addEventListener('change', ()=>{ state.jobStatus=$('#jobStatus').value; state.page=1; writeURL(); render(); });
  $('#from')?.addEventListener('change', ()=>{ state.dateFrom=$('#from').value; state.page=1; writeURL(); render(); });
  $('#to')?.addEventListener('change', ()=>{ state.dateTo=$('#to').value; state.page=1; writeURL(); render(); });
  $('#sort')?.addEventListener('change', ()=>{ const [k,d] = $('#sort').value.split(':'); state.sort={key:k,dir:d}; state.page=1; writeURL(); render(); });
}

function wireSort(){
  $$('.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.key;
      if (state.sort.key===key) state.sort.dir = state.sort.dir==='asc'?'desc':'asc';
      else state.sort = { key, dir: key==='updated'?'desc':'asc' };
      state.page=1; writeURL(); render();
    });
  });
}

function wirePager(){
  const { pages, page } = state.pageData;
  const host = $('[data-paginate]');
  host?.querySelector('[data-first]')?.addEventListener('click', ()=>{ state.page=1; writeURL(); render(); });
  host?.querySelector('[data-prev]') ?.addEventListener('click', ()=>{ state.page=Math.max(1,state.page-1); writeURL(); render(); });
  host?.querySelector('[data-next]') ?.addEventListener('click', ()=>{ state.page=Math.min(pages,state.page+1); writeURL(); render(); });
  host?.querySelector('[data-last]') ?.addEventListener('click', ()=>{ state.page=pages; writeURL(); render(); });
  host?.querySelector('input[type="number"]')?.addEventListener('change', (e)=>{
    const v = Math.min(pages, Math.max(1, parseInt(e.target.value||'1',10)));
    state.page = v; writeURL(); render();
  });
  $('#pageSize')?.addEventListener('change', (e)=>{
    state.size = parseInt(e.target.value,10)||10; state.page=1; writeURL(); render();
  });
}

function wireRowActions(){
  $('#rows')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if (!btn) return;
    const tr = e.target.closest('tr[data-id]'); const id = tr?.dataset.id;
    const items = state.pageData.items;
    const r = items.find(x=>x.id===id) || (_raw?.requests||[]).find(x=>x.id===id);
    if (!r) return;

    if (btn.dataset.action==='withdraw'){
      if (!confirm(`Withdraw request ${id}? This will cancel pending processing.`)) return;
      r.approval_status = 'Withdrawn';
      render(); // demo-only re-render
    }
    if (btn.dataset.action==='manifest'){
      renderManifest(r);
      new bootstrap.Modal($('#manifestModal')).show();
    }
  });
}

/* ---------- Boot ---------- */
(async function init(){
  readURL();
  await render();
})();
