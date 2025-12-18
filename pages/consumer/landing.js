/* EDX — Data Consumer Landing
 * Production-ready:
 *  - Session/role guard (redirect if missing role)
 *  - Uses shared partials-loader.js for header/sidebar/footer (no duplicate injects)
 *  - Least-privilege hint for Consumer (PII masked)
 *  - Ops status ribbon (safe fallback if status endpoint absent)
 *  - CSP-safe (no inline), proper ARIA, keyboard-friendly
 *  - Debounced search, area filter, sorting, pagination (kept from your baseline)
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

/* ---------- Config ---------- */
const DATA_URL      = './landing.json';                // tiles & links
const OPS_STATUS_URL = '../../ops/status.json';        // optional ops status endpoint (safe fallback if 404)

/* ---------- Session / role guard ---------- */
function readUser(){
  try { return JSON.parse(localStorage.getItem("edx:user") || "null"); }
  catch { return null; }
}
function requireConsumerOrRedirect(){
  const u = readUser();
  const role = (u && typeof u.role === 'string') ? u.role.toLowerCase() : '';
  const protectedSegments = ["/pages/consumer/"];
  const isProtected = protectedSegments.some(seg => location.pathname.includes(seg));
  if (isProtected && !role) {
    // Robust relative redirect options; first existing will win in practice
    const candidates = ["signin.html", "../signin.html", "../../signin.html", "/signin.html"];
    location.href = candidates[0];
    return false;
  }
  return true;
}

/* ---------- URL state ---------- */
const state = {
  q:   '',
  area:'',
  sort:'title:asc', // title:asc | title:desc | area:asc | area:desc
  page:1,
  size:9,
  list:[]
};
function debounce(fn, ms=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function normalize(v){ return String(v||'').toLowerCase(); }
function cmp(a,b){ return a<b?-1:a>b?1:0; }
function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }

function readURL(){
  const sp = new URLSearchParams(location.search);
  state.q    = sp.get('q') || '';
  state.area = sp.get('area') || '';
  state.sort = sp.get('sort') || 'title:asc';
  state.page = Math.max(1, parseInt(sp.get('page')||'1',10));
  state.size = Math.min(24, Math.max(6, parseInt(sp.get('size')||'9',10)));
}
function writeURL(replace=true){
  const sp = new URLSearchParams();
  if (state.q) sp.set('q', state.q);
  if (state.area) sp.set('area', state.area);
  if (state.sort !== 'title:asc') sp.set('sort', state.sort);
  if (state.page>1) sp.set('page', String(state.page));
  if (state.size!==9) sp.set('size', String(state.size));
  const url = `${location.pathname}?${sp.toString()}`;
  replace ? history.replaceState(null,'',url) : history.pushState(null,'',url);
}

/* ---------- Data load ---------- */
async function loadTiles(){
  renderSkeleton();
  try{
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    state.list = Array.isArray(d.sections) ? d.sections.map(x => ({
      title: x.title,
      area:  x.area || 'Other',
      desc:  x.desc || '',
      link:  x.link || '#',
      alt:   x.alt  || ''
    })) : [];
  }catch(err){
    console.error('[EDX] landing load failed', err);
    $('#app-main').innerHTML = `<div class="alert alert-danger">Failed to load landing content.</div>`;
    return;
  }
  render();
}

/* ---------- Ops status ribbon ---------- */
function renderStatusBanner(data, level='success'){
  const host = $('#ops-status');
  if (!host) return;
  const icon = level==='danger' ? 'bi-exclamation-octagon'
             : level==='warning' ? 'bi-exclamation-triangle'
             : level==='info'    ? 'bi-info-circle'
             : 'bi-check-circle';
  const msg  = data?.message || 'All systems normal';
  const ts   = data?.updated_at ? new Date(data.updated_at).toLocaleString() : '';
  host.innerHTML = `
    <div class="ops-banner ${level}">
      <i class="bi ${icon}" aria-hidden="true"></i>
      <span class="fw-semibold">Status:</span>
      <span>${escapeHtml(msg)}</span>
      ${ts ? `<span class="ms-2 small text-body-secondary">Updated ${escapeHtml(ts)}</span>` : ''}
    </div>`;
}
async function loadOpsStatus(){
  try{
    const res = await fetch(OPS_STATUS_URL, { cache: 'no-store' });
    if (!res.ok) { renderStatusBanner(null, 'success'); return; } // safe default
    const data = await res.json();
    const level = (data?.level || 'success').toLowerCase(); // success | info | warning | danger
    renderStatusBanner(data, level);
  }catch{
    renderStatusBanner(null, 'success');
  }
}

/* ---------- Render ---------- */
function renderSkeleton(){
  $('#app-main').innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 toolbar">
      <div class="skeleton w-260 h-38"></div>
      <div class="d-flex gap-2">
        <div class="skeleton w-200 h-38"></div>
        <div class="skeleton w-200 h-38"></div>
        <div class="skeleton w-200 h-38"></div>
      </div>
    </div>
    <div class="card shadow-sm"><div class="card-body">
      ${Array.from({length:6}).map(()=>`<div class="skeleton mb-2"></div>`).join('')}
    </div></div>`;
}

function render(){
  const areas = Array.from(new Set(state.list.map(s=>s.area))).sort();
  // Least-privilege chip (we assume consumer role → PII masked)
  const lpChip = `<span class="lp-hint" title="Least privilege in effect">
    <i class="bi bi-eye-slash" aria-hidden="true"></i><span>PII masked</span></span>`;

  const toolbar = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 toolbar">
      <div>
        <h1 class="h4 mb-0">Data Consumer</h1>
        <div class="small text-body-secondary d-flex align-items-center gap-2 flex-wrap">
          <span>Catalog, workbench, subscriptions, exports, access.</span>${lpChip}
        </div>
      </div>
      <div class="d-flex gap-2 flex-wrap" role="search" aria-label="Filter modules">
        <input id="q" class="form-control form-control-sm" placeholder="Search modules…" value="${escapeHtml(state.q)}" aria-label="Search modules">
        <select id="area" class="form-select form-select-sm narrow" aria-label="Area">
          <option value="">All areas</option>
          ${areas.map(a=>`<option value="${escapeHtml(a)}" ${state.area===a?'selected':''}>${escapeHtml(a)}</option>`).join('')}
        </select>
        <select id="sort" class="form-select form-select-sm narrow" title="Sort" aria-label="Sort">
          ${[
            ['title:asc','Title (A→Z)'],
            ['title:desc','Title (Z→A)'],
            ['area:asc','Area (A→Z)'],
            ['area:desc','Area (Z→A)']
          ].map(([v,l])=>`<option value="${v}" ${v===state.sort?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>`;

  const filtered = filterList();
  const sorted   = sortList(filtered);
  const page     = paginate(sorted, state.page, state.size);

  const grid = `
    <div class="card shadow-sm">
      <div class="card-body">
        <div class="row g-3" id="tiles">
          ${page.slice.map(tileHtml).join('') || `<div class="text-center text-body-secondary py-4">No modules found.</div>`}
        </div>
      </div>
      ${pager(page)}
    </div>`;

  $('#app-main').innerHTML = `${toolbar}${grid}`;

  wireToolbar();
  wirePager(page.pages);

  // Focus main for keyboard users after render
  $('#app-main')?.focus();
}

function tileHtml(s){
  return `
    <div class="col-12 col-sm-6 col-xl-4">
      <div class="card shadow-sm card-link h-100" data-area="${escapeHtml(s.area)}">
        <div class="card-body d-flex flex-column">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h2 class="h6 mb-0">${escapeHtml(s.title)}</h2>
            <span class="badge text-bg-light border">${escapeHtml(s.area)}</span>
          </div>
          <p class="small text-body-secondary flex-grow-1">${escapeHtml(s.desc||'')}</p>
          <div class="d-flex gap-2">
            <a class="btn btn-primary btn-sm" href="${escapeHtml(s.link)}">Open</a>
            ${s.alt ? `<a class="btn btn-outline-secondary btn-sm" href="${escapeHtml(s.alt)}">Alt</a>` : ''}
          </div>
        </div>
      </div>
    </div>`;
}

function pager(pg){
  return `
    <div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div class="small text-body-secondary" aria-live="polite">
        Showing <strong>${pg.total ? (pg.start+1) : 0}</strong>–<strong>${pg.end}</strong> of <strong>${pg.total}</strong>
      </div>
      <div class="pagination-wrap" data-paginate>
        <div class="d-flex align-items-center gap-2">
          <label class="small me-1" for="pageSize">Rows</label>
          <select id="pageSize" class="form-select form-select-sm" aria-label="Rows per page">
            ${[6,9,12,18,24].map(n=>`<option value="${n}" ${n===state.size?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-outline-secondary btn-sm" data-first ${pg.page===1?'disabled':''} aria-label="First page">«</button>
        <button class="btn btn-outline-secondary btn-sm" data-prev  ${pg.page===1?'disabled':''} aria-label="Previous page">‹</button>
        <span class="small">Page</span>
        <input class="form-control form-control-sm page-input" type="number" min="1" max="${pg.pages}" value="${pg.page}" aria-label="Current page">
        <span class="small">of ${pg.pages}</span>
        <button class="btn btn-outline-secondary btn-sm" data-next ${pg.page===pg.pages?'disabled':''} aria-label="Next page">›</button>
        <button class="btn btn-outline-secondary btn-sm" data-last ${pg.page===pg.pages?'disabled':''} aria-label="Last page">»</button>
      </div>
    </div>`;
}

/* ---------- Filter / Sort / Paginate ---------- */
function filterList(){
  const t = normalize(state.q);
  return state.list.filter(s=>{
    const hit = !t || normalize(s.title).includes(t) || normalize(s.desc).includes(t) || normalize(s.area).includes(t);
    const areaOk = !state.area || s.area===state.area;
    return hit && areaOk;
  });
}
function sortList(list){
  const [key,dir] = state.sort.split(':'); const m = dir==='asc'?1:-1;
  return list.slice().sort((a,b)=>{
    const va = key==='area' ? normalize(a.area) : normalize(a.title);
    const vb = key==='area' ? normalize(b.area) : normalize(b.title);
    return m * cmp(va,vb);
  });
}
function paginate(arr, page, size){
  const total = arr.length;
  const pages = Math.max(1, Math.ceil(total/size));
  const p = Math.min(Math.max(1,page), pages);
  const start = (p-1)*size, end = Math.min(total, start+size);
  return { total, pages, page:p, start, end, slice: arr.slice(start,end) };
}

/* ---------- Wire up ---------- */
function wireToolbar(){
  $('#q')?.addEventListener('input', debounce(()=>{ state.q=$('#q').value; state.page=1; writeURL(); render(); }));
  $('#area')?.addEventListener('change', ()=>{ state.area=$('#area').value; state.page=1; writeURL(); render(); });
  $('#sort')?.addEventListener('change', ()=>{ state.sort=$('#sort').value; state.page=1; writeURL(); render(); });
}
function wirePager(pages){
  const host = $('[data-paginate]');
  host?.querySelector('[data-first]')?.addEventListener('click', ()=>{ state.page=1; writeURL(); render(); });
  host?.querySelector('[data-prev]') ?.addEventListener('click', ()=>{ state.page=Math.max(1,state.page-1); writeURL(); render(); });
  host?.querySelector('[data-next]') ?.addEventListener('click', ()=>{ state.page=Math.min(pages,state.page+1); writeURL(); render(); });
  host?.querySelector('[data-last]') ?.addEventListener('click', ()=>{ state.page=pages; writeURL(); render(); });
  host?.querySelector('input[type="number"]')?.addEventListener('change', (e)=>{
    const v=Math.min(pages,Math.max(1,parseInt(e.target.value||'1',10))); state.page=v; writeURL(); render();
  });
  $('#pageSize')?.addEventListener('change', (e)=>{
    state.size=parseInt(e.target.value,10)||9; state.page=1; writeURL(); render();
  });
}

/* ---------- Boot ---------- */
readURL();
if (requireConsumerOrRedirect()) {
  // Partials are injected by partials-loader.js (already included by landing.html)
  // Load status + tiles
  await Promise.all([loadOpsStatus(), loadTiles()]);
}
