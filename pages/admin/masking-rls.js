// EDX — Masking Policies (production-grade)
// Features: search/filter/sort, pagination, CRUD, CSV preview/copy,
// resilient Bootstrap-first modal with fallback, demo persistence.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'masking-rls.json';
const LS_KEY = 'edx_masking_policies_v1';

const ui = {
  q: '',
  level: 'All',
  type: 'All',
  sortKey: 'name',
  sortDir: 'asc',
  page: 1,
  size: 10
};

let model = { meta:{}, policies:[] };
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
  try {
    const d = await fetch(SRC_URL, { cache:'no-store' }).then(r=>r.json());
    d.policies = (d.policies||[]).map(normalize);
    return d;
  } catch {
    return { meta:{}, policies:[] };
  }
}
function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify(model)); alert('Saved (demo): Policies stored in your browser.'); }
function resetLocal(){ localStorage.removeItem(LS_KEY); init(); }

/* --------------------- Normalize ----------------------------- */
function normalize(p){
  return {
    name: String(p.name||''),
    level: String(p.level||''),
    mask_type: String(p.mask_type||''),
    example: String(p.example||''),
    notes: String(p.notes||'')
  };
}

/* --------------------- Rendering ----------------------------- */
function render(){
  const levels = ['All', ...Array.from(new Set(model.policies.map(p=>p.level))).sort()];
  const types  = ['All', ...Array.from(new Set(model.policies.map(p=>p.mask_type))).sort()];

  let rows = model.policies.slice();

  // filter + search
  const q = ui.q.trim().toLowerCase();
  rows = rows.filter(p=>{
    const hay = `${p.name} ${p.level} ${p.mask_type} ${p.example} ${p.notes}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okL = ui.level==='All' || p.level===ui.level;
    const okT = ui.type==='All' || p.mask_type===ui.type;
    return okQ && okL && okT;
  });

  // sort
  rows.sort((a,b)=>{
    const dir = ui.sortDir==='asc'?1:-1;
    if (ui.sortKey==='name' || ui.sortKey==='level' || ui.sortKey==='mask_type'){
      const va=String(a[ui.sortKey]||'').toLowerCase();
      const vb=String(b[ui.sortKey]||'').toLowerCase();
      return (va<vb?-1:va>vb?1:0) * dir;
    }
    return 0;
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
        <h1 class="h4 mb-0">Masking Policies</h1>
        <span class="kpi"><span class="dot"></span> Total: ${model.policies.length}</span>
        <span class="kpi"><span class="dot"></span> Showing: ${pageRows.length}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="input-group input-group-sm search-wrap">
          <span class="input-group-text">Search</span>
          <input id="q" class="form-control" placeholder="name, level, type…" value="${escAttr(ui.q)}">
        </div>
        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text">Level</label>
          <select id="fLevel" class="form-select form-select-sm">
            ${levels.map(l=>`<option ${l===ui.level?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text">Mask Type</label>
          <select id="fType" class="form-select form-select-sm">
            ${types.map(t=>`<option ${t===ui.type?'selected':''}>${t}</option>`).join('')}
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
        <button id="btnNew" class="btn btn-primary btn-sm">New Policy</button>
      </div>
    </div>

    <div class="card card-elevated">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              ${th('name','Name')}
              ${th('level','Level')}
              ${th('mask_type','Mask Type')}
              <th>Example</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pageRows.map((p,i)=>tr(p, start+i)).join('')}
            ${pageRows.length? '' : `<tr><td colspan="5" class="text-center text-body-secondary py-4">No policies</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="card-footer d-flex align-items-center justify-content-between">
        <small class="text-body-secondary">Masking applies consistently across SQL, APIs, exports, and shares.</small>
        <nav><ul class="pagination pagination-sm mb-0">${pagesHtml(ui.page, pages)}</ul></nav>
      </div>
    </div>
  `;

  // wire controls
  $('#q').addEventListener('input', e=>{ ui.q=e.target.value; ui.page=1; render(); });
  $('#fLevel').addEventListener('change', e=>{ ui.level=e.target.value; ui.page=1; render(); });
  $('#fType').addEventListener('change', e=>{ ui.type=e.target.value; ui.page=1; render(); });
  $('#pageSize').addEventListener('change', e=>{ ui.size=Number(e.target.value)||10; ui.page=1; render(); });

  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnReset').addEventListener('click', resetLocal);
  $('#btnExportCSV').addEventListener('click', ()=>exportCSV(rows));

  main.querySelectorAll('th[data-sort-key]').forEach(thEl=>{
    thEl.addEventListener('click', ()=>{
      const key = thEl.getAttribute('data-sort-key');
      if (ui.sortKey === key) ui.sortDir = (ui.sortDir==='asc'?'desc':'asc');
      else { ui.sortKey = key; ui.sortDir = 'asc'; }
      render();
    });
  });

  main.querySelectorAll('.pagination [data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.page = Number(btn.getAttribute('data-page')); render(); });
  });

  $('#btnNew').addEventListener('click', ()=>openEditor(null));
  main.addEventListener('click', onRowAction);
}

/* --------------------- Row helpers --------------------------- */
function th(key,label){
  const active = ui.sortKey===key;
  const arrow = active ? (ui.sortDir==='asc'?'▲':'▼') : '';
  return `<th data-sort-key="${key}" role="button">${label} <span class="sort">${arrow}</span></th>`;
}
function tr(p, idx){
  return `
    <tr>
      <td class="fw-semibold">${esc(p.name)}</td>
      <td>${esc(p.level)}</td>
      <td>${esc(p.mask_type)}</td>
      <td class="small">${esc(p.example)}</td>
      <td class="text-end tbl-tools">
        <div class="btn-group btn-group-sm">
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
  if (act==='edit') return openEditor(idx);
  if (act==='del') return deletePolicy(idx);
}

function openEditor(index){
  editingIndex = (index ?? -1);
  const row = editingIndex>=0 ? model.policies[editingIndex] : { name:'', level:'', mask_type:'', example:'', notes:'' };
  $('#policyModalLabel').textContent = editingIndex>=0 ? `Edit Policy — ${row.name}` : 'New Masking Policy';
  $('#pName').value = row.name || '';
  $('#pLevel').value = row.level || '';
  $('#pMaskType').value = row.mask_type || '';
  $('#pExample').value = row.example || '';
  $('#pNotes').value = row.notes || '';
  ['pName','pLevel','pMaskType'].forEach(id=>$('#'+id).classList.remove('is-invalid'));
  $('#btnSavePolicy').onclick = saveFromEditor;
  openModal('#policyModal');
}
function saveFromEditor(){
  const name = $('#pName').value.trim();
  const level = $('#pLevel').value;
  const mask_type = $('#pMaskType').value;
  const example = $('#pExample').value.trim();
  const notes = $('#pNotes').value.trim();

  // validations
  let ok = true;
  const dup = model.policies.some((p, i)=> p.name.toLowerCase()===name.toLowerCase() && i!==editingIndex);
  if(!name || dup){ $('#pName').classList.add('is-invalid'); ok=false; } else $('#pName').classList.remove('is-invalid');
  if(!level){ $('#pLevel').classList.add('is-invalid'); ok=false; } else $('#pLevel').classList.remove('is-invalid');
  if(!mask_type){ $('#pMaskType').classList.add('is-invalid'); ok=false; } else $('#pMaskType').classList.remove('is-invalid');
  if(!ok) return;

  const newRow = { name, level, mask_type, example, notes };
  if (editingIndex>=0) model.policies[editingIndex] = newRow;
  else model.policies.push(newRow);

  closeModal('#policyModal');
  render();
}
function deletePolicy(index){
  const row = model.policies[index]; if(!row) return;
  if (confirm(`Delete policy "${row.name}"?`)) { model.policies.splice(index,1); render(); }
}

/* --------------------- CSV export ----------------------------- */
function exportCSV(rows){
  const hdr = ['Name','Level','Mask Type','Example','Notes'];
  const body = rows.map(r=>[r.name,r.level,r.mask_type,r.example,r.notes]);
  const csv = toCSV([hdr, ...body]);
  $('#csvModalLabel').textContent = `CSV Preview — masking_policies_${ts()}.csv`;
  $('#csvPreview').textContent = csv;
  $('#btnCopyCsv').onclick = async ()=>{ try{ await navigator.clipboard.writeText(csv); alert('Copied!'); } catch{ alert('Copy failed'); } };
  openModal('#csvModal');
}

/* --------------------- Utils -------------------------------- */
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function toCSV(rows){ const BOM='\uFEFF'; return BOM + rows.map(r=>r.map(c=>csvCell(c)).join(',')).join('\r\n'); }
function csvCell(v){ const s=String(v??''); return /[",\r\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
