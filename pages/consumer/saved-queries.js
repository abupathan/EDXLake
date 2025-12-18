/* EDX — Saved Queries (Data Consumer)
 * Fixes:
 *  - Removes inline styles (CSP-safe) — uses CSS utility classes instead.
 *  - Fixes rows(...).join is not a function (rows() already returns a string).
 * Features:
 *  - last-run status chips, version drift indicator (major bump)
 *  - one-click re-run → Export with purpose confirmation
 *  - pagination + bulk selection (delete, bulk re-run)
 *  - search, filters, sort
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const main = $('#app-main');

const DATA_URL = './saved-queries.json';
const PURPOSES = ["Operational","Research","Compliance"];
const EXPORT_BATCH_STORAGE = 'edx:exports:batch';

const state = {
  q: '',
  tag: '',
  owner: '',
  sort: { key: 'last_run', dir: 'desc' }, // last_run|name|owner|dataset
  page: 1,
  size: 10,
  list: [],
  tags: [],
  owners: [],
  favs: new Set(),
  selected: new Set()
};

function debounce(fn, ms=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function normalize(v){ return String(v||'').toLowerCase(); }
function cmp(a,b){ return a<b?-1:a>b?1:0; }
function toTimeKey(s){ const t = Date.parse(s); return isNaN(t)?0:t; }
function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }
function escapeAttr(v){ return escapeHtml(v).replace(/"/g,'&quot;'); }
function cssId(v){ return String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-'); }

/* ---------- URL State ---------- */
function readURL(){
  const sp = new URLSearchParams(location.search);
  state.q = sp.get('q') || '';
  state.tag = sp.get('tag') || '';
  state.owner = sp.get('owner') || '';
  const sort = sp.get('sort') || 'last_run:desc';
  const [k,d] = sort.split(':'); state.sort = { key:k, dir: (d==='asc'?'asc':'desc') };
  state.page = Math.max(1, parseInt(sp.get('page')||'1',10));
  state.size = Math.min(100, Math.max(5, parseInt(sp.get('size')||'10',10)));
}
function writeURL(replace=true){
  const sp = new URLSearchParams();
  if (state.q) sp.set('q', state.q);
  if (state.tag) sp.set('tag', state.tag);
  if (state.owner) sp.set('owner', state.owner);
  const sort = `${state.sort.key}:${state.sort.dir}`;
  if (sort!=='last_run:desc') sp.set('sort', sort);
  if (state.page>1) sp.set('page', String(state.page));
  if (state.size!==10) sp.set('size', String(state.size));
  const url = `${location.pathname}?${sp.toString()}`;
  replace ? history.replaceState(null,'',url) : history.pushState(null,'',url);
}

/* ---------- Data Load ---------- */
async function load(){
  skeleton();
  try{
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const list = Array.isArray(d.queries) ? d.queries : [];
    state.list = list.map(q => ({
      id: q.id || cssId(q.name),
      name: q.name,
      sql: q.sql,
      dataset: q.dataset || inferDatasetFromSQL(q.sql),
      schema_version_saved: q.schema_version_saved || '1.0.0',
      schema_version_current: q.schema_version_current || q.schema_version_saved || '1.0.0',
      last_run: q.last_run || '—',
      last_run_status: q.last_run_status || 'ok', // ok|warn|fail
      tags: q.tags || [],
      owner: q.owner || 'Unknown'
    }));
    state.tags = Array.from(new Set(state.list.flatMap(q=>q.tags))).sort();
    state.owners = Array.from(new Set(state.list.map(q=>q.owner))).sort();
  }catch(e){
    console.error('[EDX] saved-queries load failed', e);
    main.innerHTML = `<div class="alert alert-danger">Failed to load saved queries.</div>`;
    return;
  }
  try { state.favs = new Set(JSON.parse(localStorage.getItem('edx:fav-queries')||'[]')); } catch {}
  render();
}

function inferDatasetFromSQL(sql=''){
  const m = /\bfrom\s+([a-zA-Z0-9_\.]+)/i.exec(sql);
  const t = m ? m[1] : '';
  const pub = (t||'').split('.').pop();
  return /^pub_/.test(pub) ? pub : 'pub_unknown';
}

/* ---------- Skeleton (CSP-safe) ---------- */
function skeleton(){
  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 toolbar">
      <h1 class="h4 mb-0">Saved Queries</h1>
      <div class="d-flex gap-2">
        <div class="skeleton w-260 h-38"></div>
        <div class="skeleton w-200 h-38"></div>
        <div class="skeleton w-200 h-38"></div>
      </div>
    </div>
    <div class="card shadow-sm"><div class="card-body">
      ${Array.from({length:6}).map(()=>`<div class="skeleton mb-2 h-38"></div>`).join('')}
    </div></div>`;
}

/* ---------- Render ---------- */
function render(){
  const toolbar = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Saved Queries</h1>
        <div class="vr"></div>
        <div class="btn-group btn-group-sm" role="group" aria-label="Bulk actions">
          <button class="btn btn-outline-secondary" id="bulkSelectPage">Select page</button>
          <button class="btn btn-outline-secondary" id="bulkClear">Clear</button>
          <button class="btn btn-outline-danger" id="bulkDelete" disabled>Delete</button>
          <button class="btn btn-outline-primary" id="bulkExport" disabled>Re-run → Export</button>
        </div>
      </div>
      <div class="d-flex gap-2 flex-wrap" role="search" aria-label="Filter saved queries">
        <input id="q" class="form-control form-control-sm" placeholder="Search by name, SQL, tag…" value="${escapeAttr(state.q)}">
        <select id="tag" class="form-select form-select-sm">
          <option value="">All tags</option>
          ${state.tags.map(t=>`<option value="${escapeAttr(t)}" ${state.tag===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}
        </select>
        <select id="owner" class="form-select form-select-sm">
          <option value="">All owners</option>
          ${state.owners.map(o=>`<option value="${escapeAttr(o)}" ${state.owner===o?'selected':''}>${escapeHtml(o)}</option>`).join('')}
        </select>
        <select id="sort" class="form-select form-select-sm" title="Sort">
          ${[
            ['last_run:desc','Last Run (new→old)'],
            ['last_run:asc','Last Run (old→new)'],
            ['name:asc','Name (A→Z)'],
            ['name:desc','Name (Z→A)'],
            ['owner:asc','Owner (A→Z)'],
            ['owner:desc','Owner (Z→A)'],
            ['dataset:asc','Dataset (A→Z)'],
            ['dataset:desc','Dataset (Z→A)']
          ].map(([val,label])=>`<option value="${val}" ${val===`${state.sort.key}:${state.sort.dir}`?'selected':''}>${label}</option>`).join('')}
        </select>
        <button id="btnNew" class="btn btn-primary btn-sm">
          <i class="bi bi-plus-lg" aria-hidden="true"></i> New Query
        </button>
      </div>
    </div>`;

  const filtered = filterList();
  const sorted   = sortList(filtered);
  const page     = paginate(sorted, state.page, state.size);

  const table = `
    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col" style="width:36px;">
                <input class="form-check-input" type="checkbox" id="checkAllPage" aria-label="Select all on page">
              </th>
              ${th('name','Name')}
              ${th('sql','SQL')}
              ${th('dataset','Dataset')}
              <th scope="col">Version</th>
              ${th('last_run','Last Run')}
              <th scope="col">Status</th>
              ${th('tags','Tags')}
              ${th('owner','Owner')}
              <th class="text-end" scope="col" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody id="rows">
            ${rows(page.slice)}
          </tbody>
        </table>
      </div>
      ${pager(page)}
    </div>`;

  main.innerHTML = `${toolbar}${table}${modals()}${toasts()}`;

  wireToolbar();
  wireSort();
  wirePager(page.pages);
  wireRowActions();
  wireBulk(page.slice.map(x=>x.id));

  updateBulkButtons();
}

function th(key, label){
  const aria = state.sort.key===key ? (state.sort.dir==='asc'?'ascending':'descending') : 'none';
  const ind  = `<i class="bi bi-caret-down-fill sort-ind" aria-hidden="true"></i>`;
  return `<th scope="col" class="sortable" data-key="${key}" aria-sort="${aria}" title="Sort by ${escapeAttr(label)}">${escapeHtml(label)} ${ind}</th>`;
}

function badgeTag(t){ return `<span class="badge rounded-pill badge-tag me-1">${escapeHtml(t)}</span>`; }

function versionCell(saved, current){
  const changed = majorBump(saved, current);
  const pill = `<span class="ver-pill ${changed?'changed':''}" title="${changed?'Schema changed (major bump)':''}">v${escapeHtml(saved)} → v${escapeHtml(current)}</span>`;
  return pill;
}

function statusBadge(s){
  const key = s==='warn' ? 'warn' : s==='fail' ? 'fail' : 'ok';
  const label = key==='ok'?'OK': key==='warn'?'Warn':'Fail';
  return `<span class="badge badge-status ${key}">${label}</span>`;
}

function rowCheckbox(id){
  const checked = state.selected.has(id) ? 'checked' : '';
  return `<input class="form-check-input row-check" type="checkbox" data-id="${escapeAttr(id)}" ${checked} aria-label="Select ${escapeAttr(id)}">`;
}

function rows(list){
  return list.map(q=>{
    const fav = state.favs.has(q.id);
    return `
      <tr data-id="${escapeAttr(q.id)}">
        <td>${rowCheckbox(q.id)}</td>
        <td class="fw-semibold">
          <button class="btn btn-link btn-sm p-0" data-action="open" title="Open in Workbench">${escapeHtml(q.name)}</button>
        </td>
        <td class="code-clip"><code>${escapeHtml(q.sql)}</code></td>
        <td class="text-nowrap">${escapeHtml(q.dataset)}</td>
        <td class="text-nowrap">${versionCell(q.schema_version_saved, q.schema_version_current)}</td>
        <td class="text-nowrap" data-sort="${toTimeKey(q.last_run)}">${escapeHtml(q.last_run)}</td>
        <td>${statusBadge(q.last_run_status)}</td>
        <td>${(q.tags||[]).map(badgeTag).join('')}</td>
        <td>${escapeHtml(q.owner)}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm" role="group" aria-label="Actions for ${escapeAttr(q.name)}">
            <button class="btn btn-outline-secondary" data-action="run">Run</button>
            <button class="btn btn-outline-secondary" data-action="export">Re-run → Export</button>
            <button class="btn btn-outline-secondary" data-action="edit">Edit</button>
            <button class="btn btn-outline-secondary" data-action="dup">Duplicate</button>
            <button class="btn btn-outline-secondary" data-action="share">Share</button>
            <button class="btn btn-outline-danger" data-action="del">Delete</button>
            <button class="btn btn-outline-warning btn-fav" data-action="fav" aria-pressed="${fav}" title="Favorite">
              <i class="bi ${fav?'bi-star-fill':'bi-star'}" aria-hidden="true"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
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
            ${[10,20,50,100].map(n=>`<option value="${n}" ${n===state.size?'selected':''}>${n}</option>`).join('')}
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

/* ---------- Filters / Sort / Paging ---------- */
function filterList(){
  const term = normalize(state.q);
  return state.list.filter(q=>{
    const hit = !term || normalize(q.name).includes(term) || normalize(q.sql).includes(term) ||
                normalize(q.owner).includes(term) || normalize((q.tags||[]).join(' ')).includes(term) ||
                normalize(q.dataset).includes(term);
    const tagOk = !state.tag || (q.tags||[]).includes(state.tag);
    const ownOk = !state.owner || q.owner===state.owner;
    return hit && tagOk && ownOk;
  });
}
function sortList(list){
  const { key, dir } = state.sort; const m = dir==='asc'?1:-1;
  return list.slice().sort((a,b)=>{
    let va, vb;
    if (key==='last_run'){ va=toTimeKey(a.last_run); vb=toTimeKey(b.last_run); }
    else if (key==='name'){ va=normalize(a.name); vb=normalize(b.name); }
    else if (key==='owner'){ va=normalize(a.owner); vb=normalize(b.owner); }
    else if (key==='dataset'){ va=normalize(a.dataset); vb=normalize(b.dataset); }
    else { va=normalize(a.name); vb=normalize(b.name); }
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

/* ---------- Interactions ---------- */
function wireToolbar(){
  $('#q')?.addEventListener('input', debounce(()=>{ state.q=$('#q').value; state.page=1; writeURL(); render(); }));
  $('#tag')?.addEventListener('change', ()=>{ state.tag=$('#tag').value; state.page=1; writeURL(); render(); });
  $('#owner')?.addEventListener('change', ()=>{ state.owner=$('#owner').value; state.page=1; writeURL(); render(); });
  $('#sort')?.addEventListener('change', ()=>{ const [k,d]= $('#sort').value.split(':'); state.sort={key:k, dir:d}; state.page=1; writeURL(); render(); });
  $('#btnNew')?.addEventListener('click', ()=> openEditor({ id:'', name:'New Query', sql:'SELECT 1;', tags:[], owner: state.owners[0] || 'You' }));
}
function wireSort(){
  $$('.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.key;
      if (state.sort.key===key) state.sort.dir = state.sort.dir==='asc'?'desc':'asc';
      else state.sort = { key, dir: key==='name'?'asc':'desc' };
      state.page=1; writeURL(); render();
    });
  });
}
function wirePager(pages){
  const host = $('[data-paginate]');
  host?.querySelector('[data-first]')?.addEventListener('click', ()=>{ state.page=1; writeURL(); render(); });
  host?.querySelector('[data-prev]') ?.addEventListener('click', ()=>{ state.page=Math.max(1,state.page-1); writeURL(); render(); });
  host?.querySelector('[data-next]') ?.addEventListener('click', ()=>{ state.page=Math.min(pages,state.page+1); writeURL(); render(); });
  host?.querySelector('[data-last]') ?.addEventListener('click', ()=>{ state.page=pages; writeURL(); render(); });
  host?.querySelector('input[type="number"]')?.addEventListener('change', (e)=>{ const v=Math.min(pages,Math.max(1,parseInt(e.target.value||'1',10))); state.page=v; writeURL(); render(); });
  $('#pageSize')?.addEventListener('change', (e)=>{ state.size=parseInt(e.target.value,10)||10; state.page=1; writeURL(); render(); });
}
function wireRowActions(){
  $('#rows')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if (!btn) return;
    const tr = e.target.closest('tr[data-id]'); const id = tr?.dataset.id;
    const q = state.list.find(x=>x.id===id); if (!q) return;

    const act = btn.dataset.action;
    if (act==='open') return runWorkbench(q);
    if (act==='run')  return runWorkbench(q);
    if (act==='export') return exportWithPurpose([q]);
    if (act==='edit') return openEditor(q);
    if (act==='dup')  return duplicateQuery(q);
    if (act==='share') return shareQuery(q);
    if (act==='del') return deleteQuery(q);
    if (act==='fav') return toggleFav(q, btn);
  });

  // checkbox selections
  $('#rows')?.addEventListener('change', (e)=>{
    const cb = e.target.closest('.row-check'); if (!cb) return;
    const id = cb.getAttribute('data-id');
    if (cb.checked) state.selected.add(id); else state.selected.delete(id);
    updateBulkButtons();
  });

  // select-all on page
  $('#checkAllPage')?.addEventListener('change', (e)=>{
    const checked = e.target.checked;
    $$('#rows .row-check').forEach(cb=>{
      cb.checked = checked;
      const id = cb.getAttribute('data-id');
      if (checked) state.selected.add(id); else state.selected.delete(id);
    });
    updateBulkButtons();
  });
}

function wireBulk(pageIds){
  $('#bulkSelectPage')?.addEventListener('click', ()=>{
    pageIds.forEach(id=> state.selected.add(id));
    render();
  });
  $('#bulkClear')?.addEventListener('click', ()=>{
    state.selected.clear(); render();
  });
  $('#bulkDelete')?.addEventListener('click', ()=>{
    if (!state.selected.size) return;
    if (!confirm(`Delete ${state.selected.size} selected queries?`)) return;
    state.list = state.list.filter(q=>!state.selected.has(q.id));
    state.selected.clear();
    render();
    showToast('Deleted.');
  });
  $('#bulkExport')?.addEventListener('click', ()=>{
    if (!state.selected.size) return;
    const selected = state.list.filter(q=>state.selected.has(q.id));
    exportWithPurpose(selected);
  });
}
function updateBulkButtons(){
  const hasSel = state.selected.size>0;
  $('#bulkDelete')?.toggleAttribute('disabled', !hasSel);
  $('#bulkExport')?.toggleAttribute('disabled', !hasSel);
}

/* ---------- Actions ---------- */
function runWorkbench(q){
  try { sessionStorage.setItem('edx:workbench-sql', q.sql); } catch {}
  const url = new URL('./query-workbench.html', location.href);
  url.searchParams.set('dataset', q.dataset);
  location.href = url.toString();
}

function duplicateQuery(q){
  const copy = { ...q, id: q.id+'-copy', name: q.name + ' (copy)', last_run:'—', last_run_status:'ok' };
  state.list.unshift(copy);
  render();
  showToast('Query duplicated.');
}

function deleteQuery(q){
  if (!confirm(`Delete saved query "${q.name}"?`)) return;
  state.list = state.list.filter(x=>x.id!==q.id);
  state.selected.delete(q.id);
  render();
  showToast('Query deleted.');
}

function shareQuery(q){
  const m = new bootstrap.Modal($('#shareModal'));
  $('#shareLbl').textContent = `Share: ${q.name}`;
  $('#shareLink').value = `${location.origin}${location.pathname}?q=${encodeURIComponent(q.name)}`;
  $('#copyShare').onclick = async ()=>{ try{ await navigator.clipboard.writeText($('#shareLink').value); showToast('Link copied.'); m.hide(); } catch{ showToast('Copy failed.'); } };
  m.show();
}

function toggleFav(q, btn){
  const pressed = btn.getAttribute('aria-pressed')==='true';
  btn.setAttribute('aria-pressed', String(!pressed));
  btn.querySelector('.bi').className = 'bi ' + (!pressed ? 'bi-star-fill' : 'bi-star');
  if (!pressed) state.favs.add(q.id); else state.favs.delete(q.id);
  try { localStorage.setItem('edx:fav-queries', JSON.stringify(Array.from(state.favs))); } catch {}
}

/* ---------- Export with purpose ---------- */
function exportWithPurpose(queries){
  const sel = $('#purposeSelect');
  sel.innerHTML = PURPOSES.map(p=>`<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`).join('');
  $('#purposeConfirmBtn').onclick = ()=>{
    const purpose = sel.value || PURPOSES[0];
    const batch = queries.map(q=>({
      query_id: q.id,
      name: q.name,
      dataset: q.dataset,
      schema_version: q.schema_version_current,
      purpose,
      sql: q.sql,
      requested_at: new Date().toISOString()
    }));
    try { sessionStorage.setItem(EXPORT_BATCH_STORAGE, JSON.stringify(batch)); } catch {}
    const url = new URL('./export-requests-new.html', location.href);
    url.searchParams.set('from', 'saved-queries');
    url.searchParams.set('batch', String(batch.length));
    location.href = url.toString();
  };
  new bootstrap.Modal($('#purposeModal')).show();
}

/* ---------- Editor Modal ---------- */
function openEditor(q){
  $('#editName').value = q.name || '';
  $('#editSQL').value  = q.sql || '';
  $('#editTags').value = (q.tags||[]).join(', ');
  const m = new bootstrap.Modal($('#editModal'));
  $('#saveEdit').onclick = ()=>{
    const name = $('#editName').value.trim();
    const sql  = $('#editSQL').value.trim();
    const tags = $('#editTags').value.split(',').map(s=>s.trim()).filter(Boolean);
    if (!name || !sql){ showToast('Name and SQL are required.'); return; }
    const idx = state.list.findIndex(x=>x.id===q.id);
    if (idx>=0){
      state.list[idx] = { ...state.list[idx], name, sql, tags };
    }else{
      state.list.unshift({ id: cssId(name), name, sql, tags, last_run:'—', last_run_status:'ok', owner: state.owners[0] || 'You',
        dataset: inferDatasetFromSQL(sql),
        schema_version_saved: '1.0.0',
        schema_version_current: '1.0.0'
      });
    }
    m.hide(); render(); showToast('Saved.');
  };
  m.show();
}

/* ---------- Helpers ---------- */
function modals(){
  return `
  <!-- Edit -->
  <div class="modal fade" id="editModal" tabindex="-1" aria-labelledby="editLbl" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h1 class="modal-title fs-6" id="editLbl">Saved Query</h1>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label for="editName" class="form-label">Name</label>
            <input id="editName" class="form-control" required>
          </div>
          <div class="mb-3">
            <label for="editSQL" class="form-label">SQL</label>
            <textarea id="editSQL" class="form-control font-monospace" rows="8" spellcheck="false"></textarea>
          </div>
          <div>
            <label for="editTags" class="form-label">Tags (comma separated)</label>
            <input id="editTags" class="form-control" placeholder="attendance, k12">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
          <button id="saveEdit" class="btn btn-primary">Save</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Share -->
  <div class="modal fade" id="shareModal" tabindex="-1" aria-labelledby="shareLbl" aria-hidden="true">
    <div class="modal-dialog"><div class="modal-content">
      <div class="modal-header">
        <h1 class="modal-title fs-6" id="shareLbl">Share query</h1>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <label class="form-label" for="shareLink">Link</label>
        <input id="shareLink" class="form-control" readonly>
        <div class="form-text">Copy this link to share with users who have access.</div>
      </div>
      <div class="modal-footer">
        <button id="copyShare" class="btn btn-primary">Copy link</button>
      </div>
    </div></div>
  </div>

  <!-- Purpose for Export -->
  <div class="modal fade" id="purposeModal" tabindex="-1" aria-labelledby="purposeLbl" aria-hidden="true">
    <div class="modal-dialog"><div class="modal-content">
      <div class="modal-header">
        <h1 class="modal-title fs-6" id="purposeLbl">Confirm purpose for export</h1>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <label class="form-label" for="purposeSelect">Purpose</label>
        <select id="purposeSelect" class="form-select"></select>
        <div class="form-text">Purpose will be attached to your export request for policy auditing.</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="purposeConfirmBtn">Continue to Export</button>
      </div>
    </div></div>
  </div>`;
}

function toasts(){
  return `
    <div class="toast-container position-fixed bottom-0 end-0 p-3">
      <div id="toast" class="toast text-bg-success border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div id="toastMsg" class="toast-body">Done</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>
    </div>`;
}
function showToast(msg){
  $('#toastMsg').textContent = msg;
  new bootstrap.Toast($('#toast'), { delay: 1500 }).show();
}

function majorBump(prev, cur){
  const P = String(prev||'0.0.0').split('.').map(n=>parseInt(n,10)||0);
  const C = String(cur ||'0.0.0').split('.').map(n=>parseInt(n,10)||0);
  return (C[0]||0) > (P[0]||0);
}

/* ---------- Boot ---------- */
readURL();
load();
