/* EDX — External BI & Tools (Data Consumer)
 * Repurposed from Reports & Dashboards:
 * - Lists approved downstream tools/portals with SSO deep links
 * - No embedded analytics; verified links only
 * - Connection instructions per tool (warehouse, auth, steps)
 * - Search, filter (Category/Owner/Tag), sort, pagination, favorites, share
 * - CSP-safe; uses ./reports-dashboards.json (new schema below)
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const main = $('#app-main');
const DATA_URL = './reports-dashboards.json';

const state = {
  q: '',
  tag: '',
  owner: '',
  category: '',         // BI Portal, State System, External Tool
  sort: { key: 'updated', dir: 'desc' }, // updated|title|owner|category
  page: 1,
  size: 9,
  items: [],
  tags: [],
  owners: [],
  categories: ['BI Portal','State System','External Tool'],
  favs: new Set()
};

function debounce(fn, ms=250){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; }
function cmp(a,b){ return a<b?-1:a>b?1:0; }
function normalize(v){ return String(v||'').toLowerCase(); }
function toTimeKey(txt){
  const t = Date.parse(txt);
  return isNaN(t) ? 0 : t;
}

/* ---------- Load ---------- */
async function load(){
  skeleton();
  try{
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    state.items  = Array.isArray(d.tools) ? d.tools : [];
    state.tags   = Array.isArray(d.tags) ? d.tags : [];
    state.owners = Array.isArray(d.owners) ? d.owners : [];
  }catch(e){
    console.error('[EDX] Tools load failed', e);
    state.items = []; state.tags = []; state.owners = [];
    main.innerHTML = `<div class="alert alert-danger">Failed to load external tools. Please retry.</div>`;
    return;
  }
  try {
    state.favs = new Set(JSON.parse(localStorage.getItem('edx:favs:tools')||'[]'));
  } catch {}
  render();
}

/* ---------- Render ---------- */
function skeleton(){
  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 toolbar">
      <h1 class="h4 mb-0">External BI &amp; Tools</h1>
      <div class="d-flex gap-2">
        <div class="skeleton" style="width:260px;height:38px;"></div>
        <div class="skeleton" style="width:200px;height:38px;"></div>
        <div class="skeleton" style="width:200px;height:38px;"></div>
        <div class="skeleton" style="width:200px;height:38px;"></div>
      </div>
    </div>
    <div class="grid">
      ${Array.from({length:6}).map(()=>`<div class="skeleton"></div>`).join('')}
    </div>`;
}

function render(){
  const toolbar = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 toolbar">
      <h1 class="h4 mb-0">External BI &amp; Tools</h1>
      <div class="d-flex gap-2 flex-wrap" role="search" aria-label="Filter tools">
        <input id="q" class="form-control form-control-sm" placeholder="Search name, tags, owner…" value="${escapeAttr(state.q)}">
        <select id="tag" class="form-select form-select-sm select-sm-narrow">
          <option value="">All tags</option>
          ${state.tags.map(t=>`<option value="${escapeAttr(t)}" ${state.tag===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}
        </select>
        <select id="owner" class="form-select form-select-sm select-sm-narrow">
          <option value="">All owners</option>
          ${state.owners.map(o=>`<option value="${escapeAttr(o)}" ${state.owner===o?'selected':''}>${escapeHtml(o)}</option>`).join('')}
        </select>
        <select id="category" class="form-select form-select-sm select-sm-narrow">
          <option value="">All categories</option>
          ${state.categories.map(c=>`<option value="${escapeAttr(c)}" ${state.category===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}
        </select>
        <select id="sort" class="form-select form-select-sm select-sm-narrow" title="Sort">
          ${[
            ['updated:desc','Updated (new→old)'],
            ['updated:asc','Updated (old→new)'],
            ['title:asc','Name (A→Z)'],
            ['title:desc','Name (Z→A)'],
            ['owner:asc','Owner (A→Z)'],
            ['owner:desc','Owner (Z→A)'],
            ['category:asc','Category (A→Z)'],
            ['category:desc','Category (Z→A)'],
          ].map(([val,label])=>`<option value="${val}" ${val===`${state.sort.key}:${state.sort.dir}`?'selected':''}>${label}</option>`).join('')}
        </select>
      </div>
    </div>`;

  const filtered = filterItems();
  const sorted   = sortItems(filtered);
  const page     = paginate(sorted, state.page, state.size);

  const grid = `
    <div class="grid" id="gridWrap" aria-live="polite">
      ${page.slice.map(card).join('') || `<div class="text-center text-body-secondary py-5">No tools match your filters.</div>`}
    </div>`;

  const pager = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-2">
      <div class="small text-body-secondary">
        Showing <strong>${page.total ? (page.start+1) : 0}</strong>–<strong>${page.end}</strong> of <strong>${page.total}</strong>
      </div>
      <div class="pagination-wrap" data-paginate>
        <button class="btn btn-outline-secondary btn-sm" data-first ${page.page===1?'disabled':''} aria-label="First page">«</button>
        <button class="btn btn-outline-secondary btn-sm" data-prev  ${page.page===1?'disabled':''} aria-label="Previous page">‹</button>
        <span class="small">Page</span>
        <input class="form-control form-control-sm page-input" type="number" min="1" max="${page.pages}" value="${page.page}" aria-label="Current page">
        <span class="small">of ${page.pages}</span>
        <button class="btn btn-outline-secondary btn-sm" data-next ${page.page===page.pages?'disabled':''} aria-label="Next page">›</button>
        <button class="btn btn-outline-secondary btn-sm" data-last ${page.page===page.pages?'disabled':''} aria-label="Last page">»</button>
      </div>
    </div>`;

  main.innerHTML = `${toolbar}
    <div class="card shadow-sm">
      <div class="card-body">
        <div class="alert alert-info d-flex align-items-start gap-2" role="note">
          <i class="bi bi-link-45deg mt-1" aria-hidden="true"></i>
          <div>
            <div class="fw-semibold">Verified links only</div>
            <div class="small text-body-secondary">This directory lists SSO deep links and connection instructions for approved external tools. Data access continues to be governed by EDX policies.</div>
          </div>
        </div>
        ${grid}
        ${pager}
      </div>
    </div>
    ${shareModal()}
    ${toastContainer()}`;

  wireToolbar();
  wirePager(page.pages);
  wireCardActions();
}

/* ---------- Cards ---------- */
function chip(list){ return (list||[]).map(t=>`<span class="badge rounded-pill badge-tag me-1">${escapeHtml(t)}</span>`).join(''); }

function card(t){
  const fav = state.favs.has(t.title);
  const hasGuide = !!t.connection;
  const guideId = 'guide_' + cssId(t.title);
  return `
    <article class="card shadow-sm card-report h-100" data-title="${escapeHtml(t.title)}">
      <div class="card-body d-flex flex-column">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <h2 class="h6 mb-0">${escapeHtml(t.title)}</h2>
          <span class="badge text-bg-light border">${escapeHtml(t.category || '')}</span>
        </div>
        <p class="text-body-secondary small mb-2">${escapeHtml(t.desc||'')}</p>
        <div class="mb-2 small">${chip(t.tags)}</div>
        <dl class="row small mb-0">
          <dt class="col-4">Owner</dt><dd class="col-8">${escapeHtml(t.owner||'')}</dd>
          <dt class="col-4">Updated</dt><dd class="col-8">${escapeHtml(t.updated||'')}</dd>
          <dt class="col-4">SSO</dt><dd class="col-8">${t.sso_link ? `<a href="${escapeAttr(t.sso_link)}" target="_blank" rel="noopener">Open SSO link</a>` : '—'}</dd>
        </dl>
      </div>
      <div class="card-footer d-flex justify-content-between">
        <a class="btn btn-sm btn-outline-secondary" href="${escapeAttr(t.sso_link||'#')}" target="_blank" rel="noopener" ${t.sso_link?'':'aria-disabled="true"'}>Open (SSO)</a>
        <div class="btn-group btn-group-sm" role="group" aria-label="Tool actions">
          ${hasGuide ? `<button class="btn btn-outline-secondary" data-action="toggle-guide" data-target="${guideId}">Instructions</button>` : ''}
          <button class="btn btn-outline-secondary" data-action="share">Share</button>
          <button class="btn btn-outline-secondary btn-fav" data-action="fav" aria-pressed="${fav}" title="Favorite">
            <i class="bi ${fav?'bi-star-fill':'bi-star'}" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      ${hasGuide ? connectionBlock(guideId, t.connection) : ''}
    </article>`;
}

function connectionBlock(id, c){
  const steps = (c.steps||[]).map(s=>`<li>${escapeHtml(s)}</li>`).join('');
  const notes = c.notes ? `<div class="small text-body-secondary mt-2">${escapeHtml(c.notes)}</div>` : '';
  return `
    <div id="${id}" class="m-3 mt-0 d-none conn-block">
      <div class="d-flex align-items-center gap-2 mb-2">
        <i class="bi bi-plug" aria-hidden="true"></i><strong>Connection instructions</strong>
      </div>
      <dl class="row small">
        <dt class="col-4">Warehouse</dt><dd class="col-8"><code>${escapeHtml(c.warehouse||'—')}</code></dd>
        <dt class="col-4">Auth</dt><dd class="col-8">${escapeHtml(c.auth||'—')}</dd>
        <dt class="col-4">Role/Policy</dt><dd class="col-8">${escapeHtml(c.policy||'—')}</dd>
      </dl>
      <ol class="conn-steps small mb-0">${steps}</ol>
      ${notes}
    </div>`;
}

/* ---------- Filtering / Sorting / Paging ---------- */
function filterItems(){
  const term = normalize(state.q);
  return state.items.filter(r=>{
    const tHit = !term || normalize(JSON.stringify(r)).includes(term);
    const tagOk = !state.tag   || (r.tags||[]).includes(state.tag);
    const ownOk = !state.owner || r.owner===state.owner;
    const catOk = !state.category || r.category===state.category;
    return tHit && tagOk && ownOk && catOk;
  });
}

function sortItems(list){
  const { key, dir } = state.sort;
  const m = dir==='asc' ? 1 : -1;
  return list.slice().sort((a,b)=>{
    let va, vb;
    if (key==='updated'){ va=toTimeKey(a.updated); vb=toTimeKey(b.updated); }
    else if (key==='title'){ va=normalize(a.title); vb=normalize(b.title); }
    else if (key==='owner'){ va=normalize(a.owner); vb=normalize(b.owner); }
    else if (key==='category'){ va=normalize(a.category); vb=normalize(b.category); }
    return m * cmp(va, vb);
  });
}

function paginate(arr, page, size){
  const total = arr.length;
  const pages = Math.max(1, Math.ceil(total/size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p-1)*size, end = Math.min(total, start+size);
  return { total, pages, page: p, start, end, slice: arr.slice(start, end) };
}

/* ---------- Interactions ---------- */
function wireToolbar(){
  $('#q').addEventListener('input', debounce(()=>{ state.q = $('#q').value; state.page=1; render(); }));
  $('#tag').addEventListener('change', ()=>{ state.tag = $('#tag').value; state.page=1; render(); });
  $('#owner').addEventListener('change', ()=>{ state.owner = $('#owner').value; state.page=1; render(); });
  $('#category').addEventListener('change', ()=>{ state.category = $('#category').value; state.page=1; render(); });
  $('#sort').addEventListener('change', ()=>{ const [k,d] = $('#sort').value.split(':'); state.sort={ key:k, dir:d }; state.page=1; render(); });
}

function wirePager(pages){
  const host = $('[data-paginate]');
  host?.querySelector('[data-first]')?.addEventListener('click', ()=>{ state.page=1; render(); });
  host?.querySelector('[data-prev]') ?.addEventListener('click', ()=>{ state.page=Math.max(1,state.page-1); render(); });
  host?.querySelector('[data-next]') ?.addEventListener('click', ()=>{ state.page=Math.min(pages,state.page+1); render(); });
  host?.querySelector('[data-last]') ?.addEventListener('click', ()=>{ state.page=pages; render(); });
  host?.querySelector('input[type="number"]')?.addEventListener('change', (e)=>{ const v=Math.min(pages, Math.max(1, parseInt(e.target.value||'1',10))); state.page=v; render(); });
}

function wireCardActions(){
  $('#gridWrap')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button,[data-action],.btn-fav');
    if (!btn) return;
    const card = e.target.closest('.card-report'); if (!card) return;
    const title = card.dataset.title;
    const act = btn.dataset.action;

    if (act==='share'){ openShare(title); return; }
    if (act==='fav'){
      const pressed = btn.getAttribute('aria-pressed')==='true';
      btn.setAttribute('aria-pressed', String(!pressed));
      btn.querySelector('.bi').className = 'bi ' + (!pressed ? 'bi-star-fill' : 'bi-star');
      if (!pressed) state.favs.add(title); else state.favs.delete(title);
      try { localStorage.setItem('edx:favs:tools', JSON.stringify(Array.from(state.favs))); } catch {}
      return;
    }
    if (act==='toggle-guide'){
      const target = document.getElementById(btn.dataset.target);
      if (target) target.classList.toggle('d-none');
      return;
    }
  });
}

/* ---------- Share / Toast ---------- */
function shareModal(){
  return `
    <div class="modal fade" id="shareModal" tabindex="-1" aria-labelledby="shareLbl" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h1 class="modal-title fs-6" id="shareLbl">Share tool</h1>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <label for="shareLink" class="form-label">Link</label>
            <input id="shareLink" class="form-control" readonly>
            <div class="form-text">Copy this link to share with other users who have access.</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" id="copyShare">Copy link</button>
          </div>
        </div>
      </div>
    </div>`;
}

function toastContainer(){
  return `
    <div class="toast-container position-fixed bottom-0 end-0 p-3">
      <div id="toast" class="toast text-bg-success border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body" id="toastMsg">Done</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>
    </div>`;
}

function openShare(title){
  const m = new bootstrap.Modal($('#shareModal'));
  $('#shareLbl').textContent = `Share: ${title}`;
  $('#shareLink').value = location.origin + '/tools/' + encodeURIComponent(title.toLowerCase().replace(/\s+/g,'-'));
  $('#copyShare').onclick = async ()=>{
    try{
      await navigator.clipboard.writeText($('#shareLink').value);
      showToast('Link copied to clipboard.');
      m.hide();
    }catch{
      showToast('Copy failed. Select and copy manually.');
    }
  };
  m.show();
}

function showToast(msg){
  $('#toastMsg').textContent = msg;
  new bootstrap.Toast($('#toast'), { delay: 1500 }).show();
}

/* ---------- Utils ---------- */
function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }
function escapeAttr(v){ return escapeHtml(v).replace(/"/g,'&quot;'); }
function cssId(v){ return String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-'); }

/* ---------- Init ---------- */
load();
