// EDX — Platform Admin Landing (production-grade grid)
// Features: search, filter by area, sort, pagination, resilient loader, skeleton,
// empty/error states, keyboard-friendly buttons.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'landing.json';
const LS_KEY = 'edx_landing_cache_v1';

const state = {
  q: '',
  area: 'All',
  sortKey: 'title',     // 'title' | 'area'
  sortDir: 'asc',       // 'asc' | 'desc'
  page: 1,
  size: 9               // cards per page
};

let model = { meta:{}, sections:[] };

init().catch(err => renderError(err));

async function init(){
  try {
    // load from source; cache in localStorage for snappy reloads (demo-only)
    const src = await fetch(SRC_URL, { cache:'no-store' }).then(r => r.json());
    model = normalize(src);
    localStorage.setItem(LS_KEY, JSON.stringify(model));
  } catch {
    const cached = localStorage.getItem(LS_KEY);
    model = cached ? JSON.parse(cached) : { meta:{}, sections:[] };
  }
  render();
}

function normalize(d){
  const sec = (d.sections||[]).map(s => ({
    title: String(s.title||''),
    area: String(s.area||''),
    desc: String(s.desc||''),
    link: String(s.link||'#'),
    alt:  String(s.alt||'')
  }));
  return { meta: d.meta||{}, sections: sec };
}

function getAreas(){
  return ['All', ...Array.from(new Set(model.sections.map(s => s.area))).sort()];
}

function filterSort(){
  const q = state.q.trim().toLowerCase();
  let list = model.sections.filter(s => {
    const hay = `${s.title} ${s.area} ${s.desc}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okA = state.area==='All' || s.area===state.area;
    return okQ && okA;
  });
  list.sort((a,b)=>{
    const dir = state.sortDir==='asc' ? 1 : -1;
    const ka = String(a[state.sortKey]||'').toLowerCase();
    const kb = String(b[state.sortKey]||'').toLowerCase();
    return (ka<kb?-1:ka>kb?1:0) * dir;
  });
  return list;
}

function tile(s, idx){
  const id = `card-${idx}`;
  const hasAlt = s.alt && s.alt !== s.link;
  return `
    <div class="col-12 col-sm-6 col-xl-4">
      <div class="card shadow-sm card-link h-100" tabindex="0" aria-labelledby="${id}">
        <div class="card-body d-flex flex-column">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h2 class="h6 mb-0" id="${id}">${esc(s.title)}</h2>
            <span class="badge text-bg-light border">${esc(s.area)}</span>
          </div>
          <p class="small text-body-secondary flex-grow-1">${esc(s.desc)}</p>
          <div class="d-flex gap-2 mt-1 tools">
            <a class="btn btn-primary btn-sm" href="${escAttr(s.link)}" role="button" aria-label="Open ${escAttr(s.title)}">Open</a>
            ${ hasAlt ? `<a class="btn btn-outline-secondary btn-sm" href="${escAttr(s.alt)}" role="button" aria-label="Open alternate for ${escAttr(s.title)}">Alt</a>` : '' }
          </div>
        </div>
      </div>
    </div>`;
}

function render(){
  const list = filterSort();
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / state.size));
  state.page = Math.min(Math.max(1, state.page), pages);
  const start = (state.page-1) * state.size;
  const pageRows = list.slice(start, start + state.size);

  const areas = getAreas();
  const sortIcon = (key) => state.sortKey===key ? (state.sortDir==='asc'?'▲':'▼') : '';

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Platform Admin</h1>
        <span class="kpi"><span class="dot"></span> Sections: ${model.sections.length}</span>
        <span class="kpi"><span class="dot"></span> Showing: ${pageRows.length}</span>
      </div>

      <div class="d-flex flex-wrap gap-2">
        <div class="input-group input-group-sm search-wrap">
          <span class="input-group-text">Search</span>
          <input id="q" class="form-control" placeholder="title, area, description…" value="${escAttr(state.q)}">
        </div>

        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text">Area</label>
          <select id="fArea" class="form-select form-select-sm">
            ${areas.map(a=>`<option ${a===state.area?'selected':''}>${a}</option>`).join('')}
          </select>
        </div>

        <div class="btn-group btn-group-sm" role="group" aria-label="Sort">
          <button id="sortTitle" class="btn btn-outline-secondary" type="button">Title ${sortIcon('title')}</button>
          <button id="sortArea" class="btn btn-outline-secondary" type="button">Area ${sortIcon('area')}</button>
        </div>

        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text">Cards/page</label>
          <select id="pageSize" class="form-select form-select-sm">
            ${[6,9,12,18].map(n=>`<option value="${n}" ${n===state.size?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div class="card card-elevated">
      <div class="card-body">
        ${
          pageRows.length
          ? `<div class="row g-3">${pageRows.map(tile).join('')}</div>`
          : `<div class="empty">No sections match your filters.</div>`
        }
      </div>
      <div class="card-footer d-flex align-items-center justify-content-between">
        <small class="text-body-secondary">Choose a section to manage tenants, users, policies, connectors, audit, and billing.</small>
        <nav aria-label="Pagination">
          <ul class="pagination pagination-sm mb-0">
            ${pagesHtml(state.page, pages)}
          </ul>
        </nav>
      </div>
    </div>
  `;

  // Wire controls
  $('#q').addEventListener('input', e => { state.q = e.target.value; state.page = 1; render(); });
  $('#fArea').addEventListener('change', e => { state.area = e.target.value; state.page = 1; render(); });
  $('#pageSize').addEventListener('change', e => { state.size = Number(e.target.value)||9; state.page = 1; render(); });

  $('#sortTitle').addEventListener('click', ()=> toggleSort('title'));
  $('#sortArea').addEventListener('click', ()=> toggleSort('area'));

  main.querySelectorAll('.pagination .page-link[data-page]').forEach(btn => {
    btn.addEventListener('click', ()=>{ state.page = Number(btn.getAttribute('data-page')); render(); });
  });

  // keyboard: Enter on card opens primary link
  main.querySelectorAll('.card-link').forEach(card=>{
    card.addEventListener('keydown', (e)=>{
      if(e.key==='Enter'){ const a = card.querySelector('.btn.btn-primary'); a?.click(); }
    });
  });
}

function toggleSort(key){
  if (state.sortKey===key) state.sortDir = (state.sortDir==='asc'?'desc':'asc');
  else { state.sortKey = key; state.sortDir = 'asc'; }
  render();
}

function pagesHtml(page,total){
  const out=[];
  const add=(n,l=n,dis=false)=> out.push(`<li class="page-item ${n===page?'active':''} ${dis?'disabled':''}">
    <button class="page-link" data-page="${n}" type="button">${l}</button></li>`);
  add(Math.max(1,page-1),'«',page===1);
  if(total<=7){ for(let i=1;i<=total;i++) add(i); }
  else{
    add(1);
    if(page>3) out.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
    for(let i=Math.max(2,page-1); i<=Math.min(total-1,page+1); i++) add(i);
    if(page<total-2) out.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
    add(total);
  }
  add(Math.min(total,page+1),'»',page===total);
  return out.join('');
}

function renderError(err){
  main.innerHTML = `
    <div class="alert alert-danger" role="alert">
      Failed to load landing content. ${esc(err?.message||'')}
    </div>`;
}

/* ---------- utils ---------- */
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
