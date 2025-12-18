// EDX — Evidence Exports (production-grade)
// Features: search/filter/sort, pagination, CRUD (new/edit), preview modal, CSV copy,
// resilient Bootstrap modal (with fallback), localStorage demo persistence.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'evidence-packs.json';
const LS_KEY = 'edx_evidence_exports_v1';

let model = { meta:{}, bundles:[] };
const ui = {
  q: '',
  owner: 'All',
  sortKey: 'created',
  sortDir: 'desc',
  page: 1,
  size: 10
};
let editingIndex = -1;

/* ---------- Bootstrap-first modal with safe fallback ---------- */
function hasBS(){ return !!(window.bootstrap && typeof window.bootstrap.Modal === 'function'); }
function ensureInBody(el){ if(el?.parentElement !== document.body) document.body.appendChild(el); return el; }
function openModal(id){
  const el = ensureInBody($(id));
  if (hasBS()){
    const prev = window.bootstrap.Modal.getInstance(el); if(prev) prev.dispose?.();
    const inst = new window.bootstrap.Modal(el, {backdrop:true, keyboard:true, focus:true});
    el._inst = inst; inst.show();
  } else {
    el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true');
    el.classList.add('show'); el.style.display='block'; document.body.classList.add('modal-open');
    const bd=document.createElement('div'); bd.className='modal-backdrop fade show'; bd.dataset.f='1'; document.body.appendChild(bd);
    el.querySelectorAll('[data-bs-dismiss="modal"],.btn-close').forEach(b=>{ b._h = ()=>closeModal(id); b.addEventListener('click', b._h); });
  }
}
function closeModal(id){
  const el = $(id);
  if (hasBS()){ const inst = window.bootstrap.Modal.getInstance(el) || el._inst; inst?.hide?.(); }
  else{
    el?.classList.remove('show'); if(el) el.style.display='none';
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.modal-backdrop[data-f="1"]').forEach(n=>n.remove());
    el?.querySelectorAll('[data-bs-dismiss="modal"],.btn-close').forEach(b=>{ if(b._h){ b.removeEventListener('click', b._h); delete b._h; } });
  }
}

/* --------------------- Data loading -------------------------- */
init().catch(console.error);

async function init(){
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    try { model = JSON.parse(saved); }
    catch { model = await fetchSource(); }
  } else {
    model = await fetchSource();
  }
  render();
}
async function fetchSource(){
  try { return await fetch(SRC_URL, { cache:'no-store' }).then(r=>r.json()); }
  catch { return { meta:{}, bundles:[] }; }
}
function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify(model)); alert('Saved (demo): Evidence list stored in your browser.'); }
function resetLocal(){ localStorage.removeItem(LS_KEY); init(); }

/* --------------------- Rendering ----------------------------- */
function render(){
  const owners = ['All', ...Array.from(new Set((model.bundles||[]).map(b=>b.owner).filter(Boolean))).sort()];

  let rows = (model.bundles||[]).map(normalize);
  const q = ui.q.trim().toLowerCase();
  rows = rows.filter(b=>{
    const hay = `${b.name} ${b.scope} ${b.created} ${b.owner} ${b.items}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okOwner = ui.owner==='All' || b.owner===ui.owner;
    return okQ && okOwner;
  });

  // sort
  rows.sort((a,b)=>{
    const dir = ui.sortDir==='asc'? 1 : -1;
    if (ui.sortKey==='items') return (a.items - b.items) * dir;
    if (ui.sortKey==='created') return (new Date(a.created) - new Date(b.created)) * dir;
    const va = String(a[ui.sortKey]||'').toLowerCase();
    const vb = String(b[ui.sortKey]||'').toLowerCase();
    return (va<vb?-1:va>vb?1:0) * dir;
  });

  // paginate
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/ui.size));
  ui.page = Math.min(Math.max(1, ui.page), pages);
  const start = (ui.page-1)*ui.size;
  const pageRows = rows.slice(start, start+ui.size);

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Evidence Exports</h1>
        <span class="kpi"><span class="dot"></span> Total: ${model.bundles.length}</span>
        <span class="kpi"><span class="dot"></span> Showing: ${pageRows.length}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="input-group input-group-sm search-wrap">
          <span class="input-group-text">Search</span>
          <input id="q" class="form-control" placeholder="bundle, scope, owner…" value="${escAttr(ui.q)}">
        </div>
        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text">Owner</label>
          <select id="fOwner" class="form-select form-select-sm">
            ${owners.map(o=>`<option ${o===ui.owner?'selected':''}>${o}</option>`).join('')}
          </select>
        </div>

        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text">Rows/page</label>
          <select id="pageSize" class="form-select form-select-sm">
            ${[10,25,50,100].map(n=>`<option value="${n}" ${n===ui.size?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>

        <div class="btn-group btn-group-sm">
          <button id="btnExportCSV" class="btn btn-outline-secondary">Export CSV</button>
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>

        <button id="btnNew" class="btn btn-primary btn-sm">New Export</button>
      </div>
    </div>

    <div class="card card-elevated">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              ${th('name','Bundle')}
              ${th('created','Created')}
              ${th('scope','Scope')}
              ${th('items','Items')}
              ${th('owner','Owner')}
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pageRows.map((b,i)=>tr(b, start+i)).join('')}
            ${pageRows.length? '' : `<tr><td colspan="6" class="text-center text-body-secondary py-4">No exports</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="card-footer d-flex align-items-center justify-content-between">
        <small class="text-body-secondary">Evidence packs include policy changes, access events, and configuration diffs over the selected period.</small>
        <nav><ul class="pagination pagination-sm mb-0">${pagesHtml(ui.page, pages)}</ul></nav>
      </div>
    </div>
  `;

  // wire controls
  $('#q').addEventListener('input', e=>{ ui.q = e.target.value; ui.page=1; render(); });
  $('#fOwner').addEventListener('change', e=>{ ui.owner = e.target.value; ui.page=1; render(); });
  $('#pageSize').addEventListener('change', e=>{ ui.size = Number(e.target.value)||10; ui.page=1; render(); });

  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnReset').addEventListener('click', resetLocal);
  $('#btnExportCSV').addEventListener('click', ()=>exportCSV(rows));

  main.querySelectorAll('th[data-sort-key]').forEach(thEl=>{
    thEl.addEventListener('click', ()=>{
      const key = thEl.getAttribute('data-sort-key');
      if (ui.sortKey === key) ui.sortDir = (ui.sortDir==='asc'?'desc':'asc');
      else { ui.sortKey = key; ui.sortDir = (key==='name' || key==='owner' || key==='scope') ? 'asc' : 'desc'; }
      render();
    });
  });

  main.querySelectorAll('.pagination [data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.page = Number(btn.getAttribute('data-page')); render(); });
  });

  $('#btnNew').addEventListener('click', ()=>openEditor(null));
  main.addEventListener('click', onRowAction);
}

/* --------------------- Row / Table helpers ------------------- */
function normalize(b){
  return {
    name: String(b.name||''),
    created: String(b.created||''), // ISO-ish string
    scope: String(b.scope||''),
    items: Number(b.items||0),
    owner: String(b.owner||'')
  };
}
function th(key,label){
  const active = ui.sortKey===key;
  const arrow = active ? (ui.sortDir==='asc'?'▲':'▼') : '';
  return `<th data-sort-key="${key}" role="button">${label} <span class="sort">${arrow}</span></th>`;
}
function tr(b, idx){
  return `
    <tr>
      <td class="fw-semibold">${esc(b.name)}</td>
      <td class="text-nowrap">${esc(b.created)}</td>
      <td>${esc(b.scope)}</td>
      <td>${b.items}</td>
      <td>${esc(b.owner)}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" data-act="preview" data-idx="${idx}" type="button">Preview</button>
          <button class="btn btn-outline-secondary" data-act="edit" data-idx="${idx}" type="button">Edit</button>
          <button class="btn btn-outline-danger" data-act="del" data-idx="${idx}" type="button">Delete</button>
        </div>
      </td>
    </tr>
  `;
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

/* --------------------- Actions -------------------------------- */
function onRowAction(e){
  const btn = e.target.closest('button[data-act]'); if(!btn) return;
  const idx = Number(btn.getAttribute('data-idx'));
  const act = btn.getAttribute('data-act');
  if (act==='preview') return previewBundle(idx);
  if (act==='edit') return openEditor(idx);
  if (act==='del') return deleteBundle(idx);
}

function openEditor(index){
  editingIndex = (index ?? -1);
  const row = editingIndex>=0 ? model.bundles[editingIndex] : { name:'', scope:'', owner:'', items:0, created: new Date().toISOString().slice(0,16).replace('T',' ')+'Z' };

  $('#exportModalLabel').textContent = editingIndex>=0 ? `Edit Evidence Export — ${row.name}` : 'New Evidence Export';
  $('#xName').value = row.name || '';
  $('#xScope').value = row.scope || '';
  $('#xOwner').value = row.owner || '';

  // defaults for checkboxes; not persisted in JSON, but used for preview message
  $('#incAccess').checked = true;
  $('#incPolicy').checked = true;
  $('#incConfig').checked = true;
  $('#incLineage').checked = false;
  $('#incDQ').checked = false;
  $('#incPii').checked = false;
  $('#xNotes').value = '';

  ['xName','xScope','xOwner'].forEach(id => $('#'+id).classList.remove('is-invalid'));
  $('#btnSaveExport').onclick = saveFromEditor;
  openModal('#exportModal');
}
function saveFromEditor(){
  const name = $('#xName').value.trim();
  const scope = $('#xScope').value.trim();
  const owner = $('#xOwner').value;
  let ok = true;
  if(!name){ $('#xName').classList.add('is-invalid'); ok=false; } else $('#xName').classList.remove('is-invalid');
  if(!scope){ $('#xScope').classList.add('is-invalid'); ok=false; } else $('#xScope').classList.remove('is-invalid');
  if(!owner){ $('#xOwner').classList.add('is-invalid'); ok=false; } else $('#xOwner').classList.remove('is-invalid');
  if(!ok) return;

  const now = new Date().toISOString().replace('T',' ').replace('Z','Z');
  const newRow = {
    name, scope, owner,
    items: Math.floor(Math.random()*900)+100, // demo count
    created: editingIndex>=0 ? model.bundles[editingIndex].created : now
  };

  if (editingIndex>=0) model.bundles[editingIndex] = newRow;
  else model.bundles.unshift(newRow); // newest first

  closeModal('#exportModal');
  render();
}

function deleteBundle(index){
  const row = model.bundles[index]; if(!row) return;
  if (confirm(`Delete evidence bundle "${row.name}"?`)) { model.bundles.splice(index,1); render(); }
}

function previewBundle(index){
  const row = model.bundles[index]; if(!row) return;
  $('#previewModalLabel').textContent = `Evidence Preview — ${row.name}`;
  const csv = toCSV([['Bundle','Created','Scope','Items','Owner'], [row.name,row.created,row.scope,row.items,row.owner]]);
  $('#previewBody').innerHTML = `
    <div class="row g-3">
      <div class="col-lg-6">
        <h6>Summary</h6>
        <table class="table table-sm">
          <tbody>
            <tr><th class="w-25">Bundle</th><td>${esc(row.name)}</td></tr>
            <tr><th>Created</th><td>${esc(row.created)}</td></tr>
            <tr><th>Scope</th><td>${esc(row.scope)}</td></tr>
            <tr><th>Owner</th><td>${esc(row.owner)}</td></tr>
            <tr><th>Items</th><td>${row.items}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="col-lg-6">
        <h6>CSV (first line)</h6>
        <pre class="inline-json mb-0">${esc(csv.split('\\n')[0])}\\n${esc(csv.split('\\n')[1]||'')}</pre>
      </div>
      <div class="col-12">
        <h6>Included Evidence (indicative)</h6>
        <ul class="mb-0">
          <li>Access Events</li>
          <li>Policy Changes</li>
          <li>Configuration Diffs</li>
          <li>Lineage/Data Quality/PII Proof if selected at creation</li>
        </ul>
      </div>
    </div>
  `;
  $('#btnCopyCsv').onclick = async ()=>{ try{ await navigator.clipboard.writeText(csv); alert('Copied!'); } catch{ alert('Copy failed'); } };
  openModal('#previewModal');
}

/* --------------------- Export CSV (list) --------------------- */
function exportCSV(rows){
  const hdr = ['Bundle','Created','Scope','Items','Owner'];
  const body = rows.map(r=>[r.name,r.created,r.scope,r.items,r.owner]);
  const csv = toCSV([hdr, ...body]);
  // Reuse preview modal to show CSV header+first lines
  $('#previewModalLabel').textContent = `CSV Preview — evidence_exports_${ts()}.csv`;
  $('#previewBody').innerHTML = `<pre class="inline-json mb-0">${esc(csv)}</pre>`;
  $('#btnCopyCsv').onclick = async ()=>{ try{ await navigator.clipboard.writeText(csv); alert('Copied!'); } catch{ alert('Copy failed'); } };
  openModal('#previewModal');
}

/* --------------------- Utilities ----------------------------- */
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function toCSV(rows){ const BOM='\uFEFF'; return BOM + rows.map(r=>r.map(c=>csvCell(c)).join(',')).join('\\r\\n'); }
function csvCell(v){ const s=String(v??''); return /[",\\r\\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
