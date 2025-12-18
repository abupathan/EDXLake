// EDX — Secrets & Keys (production-grade)
// Features: search, filters, sort, pagination; Add/Edit/View/Rotate/Delete;
// CSV preview & copy; localStorage demo persistence; Bootstrap-first modals
// with safe fallback; no top-level await.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'secrets-vault.json';
const LS_KEY  = 'edx_secrets_keys_v1';

let model = { meta:{}, items:[] };
const ui = {
  q:'', type:'All', owner:'All',
  sortKey:'name', sortDir:'asc',
  page:1, size:10
};
let viewIndex = -1; // for View modal

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

/* --------------------- Init / Load ---------------------------- */
init().catch(console.error);
async function init(){
  try{
    const saved = localStorage.getItem(LS_KEY);
    if (saved) model = JSON.parse(saved);
    else model = await fetch(SRC_URL, { cache:'no-store' }).then(r=>r.json());
  } catch {
    model = { meta:{}, items:[] };
  }
  // normalize & add derived fields if missing
  model.items = (model.items||[]).map(n => normalize(n));
  render();
}
function normalize(x){
  return {
    id: String(x.id || genId()),
    name: String(x.name||''),
    type: String(x.type||''),
    owner: String(x.owner||''),
    value: String(x.value||''),
    updated: x.updated || new Date().toISOString(),
    version: Number.isFinite(x.version) ? x.version : 1
  };
}
function genId(){ return 's_' + Math.random().toString(36).slice(2,10) + '_' + Date.now().toString(36); }
function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify(model)); alert('Saved (demo): secrets stored in your browser.'); }
function resetLocal(){ localStorage.removeItem(LS_KEY); init(); }

/* --------------------- Rendering ------------------------------ */
function render(){
  const list = model.items.slice();

  // filters & search
  const q = ui.q.trim().toLowerCase();
  const owners = ['All', ...Array.from(new Set(list.map(i=>i.owner).filter(Boolean))).sort()];
  const types  = ['All', ...Array.from(new Set(list.map(i=>i.type).filter(Boolean))).sort()];

  let rows = list.filter(i=>{
    const hay = `${i.name} ${i.type} ${i.owner} ${i.version}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okT = ui.type==='All' || i.type===ui.type;
    const okO = ui.owner==='All' || i.owner===ui.owner;
    return okQ && okT && okO;
  });

  // sort
  rows.sort((a,b)=>{
    const dir = ui.sortDir==='asc'?1:-1;
    const key = ui.sortKey;
    const va = key==='updated' ? a.updated : String(a[key]||'').toLowerCase();
    const vb = key==='updated' ? b.updated : String(b[key]||'').toLowerCase();
    return (va<vb?-1:va>vb?1:0) * dir;
  });

  // pagination
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/ui.size));
  ui.page = Math.min(Math.max(1, ui.page), pages);
  const start = (ui.page-1)*ui.size;
  const pageRows = rows.slice(start, start+ui.size);

  // counts
  const totalApi = model.items.filter(i=>/api key/i.test(i.type)).length;
  const totalOAuth = model.items.filter(i=>/oauth/i.test(i.type)).length;

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Secrets & Keys</h1>
        <span class="kpi"><span class="dot"></span> Total: ${model.items.length}</span>
        <span class="kpi"><span class="dot"></span> API Keys: ${totalApi}</span>
        <span class="kpi"><span class="dot"></span> OAuth: ${totalOAuth}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="btn-group btn-group-sm">
          <button id="btnExport" class="btn btn-outline-secondary">Export CSV</button>
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>
        <button id="btnNew" class="btn btn-primary btn-sm" type="button">Add Secret</button>
      </div>
    </div>

    <div class="card card-elevated">
      <div class="card-body">
        <div class="d-flex flex-wrap gap-2 mb-2">
          <div class="input-group input-group-sm search-wrap">
            <span class="input-group-text">Search</span>
            <input id="q" class="form-control" placeholder="name, type, owner…" value="${escAttr(ui.q)}">
          </div>

          <div class="input-group input-group-sm" style="width:auto;">
            <label class="input-group-text">Type</label>
            <select id="fType" class="form-select form-select-sm">
              ${types.map(t=>`<option ${t===ui.type?'selected':''}>${t}</option>`).join('')}
            </select>
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
        </div>

        <div class="table-responsive">
          <table class="table align-middle mb-0">
            <thead class="table-light">
              <tr>
                ${th('name','Name')}
                ${th('type','Type')}
                ${th('updated','Updated')}
                ${th('owner','Owner')}
                ${th('version','Ver.')}
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${pageRows.map(r=>tr(r)).join('')}
              ${pageRows.length? '' : `<tr><td colspan="6" class="text-center text-body-secondary py-4">No matching secrets</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card-footer d-flex align-items-center justify-content-between">
        <small class="text-body-secondary">Demo only — secrets are persisted in localStorage here, not a real vault.</small>
        <nav><ul class="pagination pagination-sm mb-0">${pagesHtml(ui.page, pages)}</ul></nav>
      </div>
    </div>
  `;

  // wiring
  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnReset').addEventListener('click', resetLocal);
  $('#btnExport').addEventListener('click', ()=> exportCSV(rows));

  $('#btnNew').addEventListener('click', ()=> openEditor(null));

  $('#q').addEventListener('input', e=>{ ui.q=e.target.value; ui.page=1; render(); });
  $('#fType').addEventListener('change', e=>{ ui.type=e.target.value; ui.page=1; render(); });
  $('#fOwner').addEventListener('change', e=>{ ui.owner=e.target.value; ui.page=1; render(); });
  $('#pageSize').addEventListener('change', e=>{ ui.size=Number(e.target.value)||10; ui.page=1; render(); });

  main.querySelectorAll('th[data-sort-key]').forEach(thEl=>{
    thEl.addEventListener('click', ()=>{
      const key=thEl.getAttribute('data-sort-key');
      if(ui.sortKey===key) ui.sortDir = (ui.sortDir==='asc'?'desc':'asc');
      else { ui.sortKey=key; ui.sortDir='asc'; }
      render();
    });
  });

  main.querySelectorAll('.pagination .page-link[data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.page = Number(btn.getAttribute('data-page')); render(); });
  });

  // row actions (event delegation)
  main.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-act]'); if(!btn) return;
    const id = btn.getAttribute('data-id');
    const idx = model.items.findIndex(x=>x.id===id); if(idx<0) return;
    const act = btn.getAttribute('data-act');
    if (act==='view') return openViewer(idx);
    if (act==='edit') return openEditor(idx);
    if (act==='rotate') return rotateSecret(idx);
    if (act==='del') return deleteSecret(idx);
  });
}

/* --------------------- Table helpers ------------------------- */
function th(key,label){
  const active = ui.sortKey===key;
  const arrow = active ? (ui.sortDir==='asc'?'▲':'▼') : '';
  return `<th data-sort-key="${key}" role="button">${label} <span class="sort">${arrow}</span></th>`;
}
function tr(r){
  return `
    <tr>
      <td class="fw-semibold">${esc(r.name)}</td>
      <td>${esc(r.type)}</td>
      <td class="text-nowrap">${esc(fmtTime(r.updated))}</td>
      <td>${esc(r.owner)}</td>
      <td>${esc(String(r.version))}</td>
      <td class="text-end tbl-tools">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-act="rotate" data-id="${escAttr(r.id)}" type="button">Rotate</button>
          <button class="btn btn-outline-secondary" data-act="view"   data-id="${escAttr(r.id)}" type="button">View</button>
          <button class="btn btn-outline-secondary" data-act="edit"   data-id="${escAttr(r.id)}" type="button">Edit</button>
          <button class="btn btn-outline-danger"    data-act="del"    data-id="${escAttr(r.id)}" type="button">Delete</button>
        </div>
      </td>
    </tr>
  `;
}
function pagesHtml(page,total){
  const out=[]; const add=(n,l=n,dis=false)=> out.push(`<li class="page-item ${n===page?'active':''} ${dis?'disabled':''}">
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

/* --------------------- CRUD ---------------------------------- */
function openEditor(index){
  const editing = index!=null && index>=0;
  const row = editing ? model.items[index] : { name:'', type:'', owner:'', value:'', version:1 };

  $('#secretModalLabel').textContent = editing ? `Edit Secret — ${row.name}` : 'New Secret';
  $('#sName').value = row.name || '';
  $('#sType').value = row.type || '';
  $('#sOwner').value = row.owner || '';
  $('#sValue').value = row.value || '';
  ['sName','sType','sOwner','sValue'].forEach(id=>$('#'+id).classList.remove('is-invalid'));
  $('#sNameDup').style.display='none';

  $('#btnSaveSecret').onclick = ()=>{
    const name = $('#sName').value.trim();
    const type = $('#sType').value;
    const owner= $('#sOwner').value.trim();
    const value= $('#sValue').value;

    // validate
    let ok = true;
    if(!name){ $('#sName').classList.add('is-invalid'); ok=false; } else $('#sName').classList.remove('is-invalid');
    if(!type){ $('#sType').classList.add('is-invalid'); ok=false; } else $('#sType').classList.remove('is-invalid');
    if(!owner){ $('#sOwner').classList.add('is-invalid'); ok=false; } else $('#sOwner').classList.remove('is-invalid');
    if(!(value && value.trim().length>=6)){ $('#sValue').classList.add('is-invalid'); ok=false; } else $('#sValue').classList.remove('is-invalid');

    const dup = model.items.some(i=>i.name.toLowerCase()===name.toLowerCase() && (!editing || i.id!==row.id));
    if(dup){ $('#sName').classList.add('is-invalid'); $('#sNameDup').style.display='block'; ok=false; } else $('#sNameDup').style.display='none';
    if(!ok) return;

    if (editing){
      model.items[index] = { ...row, name, type, owner, value, updated:new Date().toISOString() };
    } else {
      model.items.push({ id:genId(), name, type, owner, value, updated:new Date().toISOString(), version:1 });
    }
    closeModal('#secretModal');
    render();
  };

  openModal('#secretModal');
}

function openViewer(index){
  viewIndex = index;
  const r = model.items[index]; if(!r) return;

  $('#viewModalLabel').textContent = `View Secret — ${r.name}`;
  $('#vName').textContent = r.name;
  $('#vType').textContent = r.type;
  $('#vOwner').textContent = r.owner;
  $('#vUpdated').textContent = fmtTime(r.updated);
  $('#vVersion').textContent = String(r.version);
  $('#vSecret').type = 'password';
  $('#vSecret').value = mask(r.value);

  $('#btnReveal').onclick = ()=>{
    const inp = $('#vSecret');
    if (inp.type==='password'){ inp.type='text'; inp.value = r.value; $('#btnReveal').textContent='Hide'; }
    else { inp.type='password'; inp.value = mask(r.value); $('#btnReveal').textContent='Reveal'; }
  };
  $('#btnCopy').onclick = async ()=>{
    try{ await navigator.clipboard.writeText(r.value); alert('Copied!'); } catch{ alert('Copy failed'); }
  };

  openModal('#viewModal');
}

function rotateSecret(index){
  const r = model.items[index]; if(!r) return;
  if (!confirm(`Rotate secret "${r.name}"? This will create a new version.`)) return;
  // demo rotation: append suffix and bump version
  const suffix = Math.random().toString(36).slice(2,8);
  r.value = `${r.value.slice(0, Math.max(6, Math.min(16, r.value.length)))}_${suffix}`;
  r.version = (r.version||1) + 1;
  r.updated = new Date().toISOString();
  render();
}

function deleteSecret(index){
  const r = model.items[index]; if(!r) return;
  if (!confirm(`Delete secret "${r.name}"?`)) return;
  model.items.splice(index,1);
  render();
}

/* --------------------- Export CSV ---------------------------- */
function exportCSV(rows){
  const hdr = ['Name','Type','Updated','Owner','Version','Masked'];
  const body = rows.map(r=>[r.name, r.type, fmtTime(r.updated), r.owner, r.version, mask(r.value)]);
  const csv = toCSV([hdr, ...body]);

  $('#csvModalLabel').textContent = `CSV Preview — secrets_${ts()}.csv`;
  $('#csvPreview').textContent = csv;
  $('#btnCopyCsv').onclick = async ()=>{ try{ await navigator.clipboard.writeText(csv); alert('Copied!'); } catch{ alert('Copy failed'); } };
  openModal('#csvModal');
}

/* --------------------- Utilities ------------------------------ */
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function fmtTime(iso){ try{ return new Date(iso).toLocaleString(); } catch{ return iso; } }
function toCSV(rows){ const BOM='\uFEFF'; return BOM + rows.map(r=>r.map(c=>csvCell(c)).join(',')).join('\r\n'); }
function csvCell(v){ const s=String(v??''); return /[",\r\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
function mask(s){ if(!s) return ''; const head = s.slice(0, Math.min(6, s.length)); return head + '••••'; }
