// EDX — Tenants (production-grade)
// Features: search, filters, sort, pagination; Add/Edit/Activate/Suspend/Delete;
// CSV preview & copy; localStorage demo persistence; Bootstrap-first modals
// with safe fallback; no top-level await.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'tenant-provisioning.json';
const LS_KEY  = 'edx_tenants_v1';

let model = { meta:{}, tenants:[] };
const ui = {
  q:'', env:'All', status:'All',
  sortKey:'name', sortDir:'asc',
  page:1, size:10
};

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
    model = { meta:{}, tenants:[] };
  }
  model.tenants = (model.tenants||[]).map(n=>normalize(n));
  render();
}

function normalize(t){
  return {
    id: String(t.id || genId()),
    name: String(t.name||''),
    env: String(t.env||'Sandbox'),
    owner: String(t.owner||''),
    status: String(t.status||'Provisioning'),
    domains: Array.isArray(t.domains) ? t.domains : String(t.domains||'').split(',').map(s=>s.trim()).filter(Boolean),
    sso: String(t.sso||'None'),
    created: t.created || new Date().toISOString(),
    notes: String(t.notes||'')
  };
}
function genId(){ return 'tenant_' + Math.random().toString(36).slice(2,10) + '_' + Date.now().toString(36); }
function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify(model)); alert('Saved (demo): tenants stored in your browser.'); }
function resetLocal(){ localStorage.removeItem(LS_KEY); init(); }

/* --------------------- Rendering ------------------------------ */
function render(){
  const total = model.tenants.length;
  const prod = model.tenants.filter(t=>t.env==='Production').length;
  const active = model.tenants.filter(t=>t.status==='Active').length;

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Tenants</h1>
        <span class="kpi-chip"><span class="dot"></span> Total: ${total}</span>
        <span class="kpi-chip"><span class="dot"></span> Production: ${prod}</span>
        <span class="kpi-chip"><span class="dot"></span> Active: ${active}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="btn-group btn-group-sm">
          <button id="btnExport" class="btn btn-outline-secondary">Export CSV</button>
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>
        <button id="btnNew" class="btn btn-primary btn-sm" type="button">New Tenant</button>
      </div>
    </div>

    <div class="card card-elevated">
      <div class="card-body">
        <div class="d-flex flex-wrap gap-2 mb-2">
          <div class="input-group input-group-sm search-wrap">
            <span class="input-group-text">Search</span>
            <input id="q" class="form-control" placeholder="name, owner, domain, sso…" value="${escAttr(ui.q)}">
          </div>
          <div class="input-group input-group-sm" style="width:auto;">
            <label class="input-group-text">Environment</label>
            <select id="fEnv" class="form-select form-select-sm">
              ${['All','Production','Staging','Development','Sandbox'].map(v=>`<option ${v===ui.env?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="input-group input-group-sm" style="width:auto;">
            <label class="input-group-text">Status</label>
            <select id="fStatus" class="form-select form-select-sm">
              ${['All','Active','Provisioning','Suspended'].map(v=>`<option ${v===ui.status?'selected':''}>${v}</option>`).join('')}
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
          <table class="table align-middle mb-0" id="tenTable">
            <thead class="table-light">
              <tr>
                ${th('name','Name')}
                ${th('env','Environment')}
                ${th('owner','Owner')}
                ${th('status','Status')}
                ${th('domainsCount','Domains')}
                ${th('created','Created')}
                <th>SSO</th>
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody id="tenBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card-footer d-flex align-items-center justify-content-between">
        <small class="text-body-secondary">Tenant operations are fully audited; changes here simulate platform admin flows.</small>
        <nav><ul id="pager" class="pagination pagination-sm mb-0"></ul></nav>
      </div>
    </div>
  `;

  // wiring
  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnReset').addEventListener('click', resetLocal);
  $('#btnExport').addEventListener('click', ()=>exportCSV(getAllFilteredSorted()));
  $('#btnNew').addEventListener('click', ()=> openEditor(null));

  $('#q').addEventListener('input', e=>{ ui.q=e.target.value; ui.page=1; mountTable(); });
  $('#fEnv').addEventListener('change', e=>{ ui.env=e.target.value; ui.page=1; mountTable(); });
  $('#fStatus').addEventListener('change', e=>{ ui.status=e.target.value; ui.page=1; mountTable(); });
  $('#pageSize').addEventListener('change', e=>{ ui.size=Number(e.target.value)||10; ui.page=1; mountTable(); });

  main.querySelectorAll('#tenTable thead th[data-sort-key]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key=th.getAttribute('data-sort-key');
      if(ui.sortKey===key) ui.sortDir = (ui.sortDir==='asc'?'desc':'asc');
      else { ui.sortKey=key; ui.sortDir='asc'; }
      mountTable();
    });
  });

  mountTable();
}

function th(key,label){
  const active = ui.sortKey===key;
  const arrow = active ? (ui.sortDir==='asc'?'▲':'▼') : '';
  return `<th data-sort-key="${key}" role="button">${label} <span class="sort">${arrow}</span></th>`;
}

function getAllFilteredSorted(){
  const q = ui.q.trim().toLowerCase();
  let rows = model.tenants.map(t => ({...t, domainsCount: (t.domains||[]).length}));

  rows = rows.filter(t=>{
    const hay = `${t.name} ${t.owner} ${t.env} ${t.status} ${t.sso} ${(t.domains||[]).join(' ')}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okE = ui.env==='All' || t.env===ui.env;
    const okS = ui.status==='All' || t.status===ui.status;
    return okQ && okE && okS;
  });

  rows.sort((a,b)=>{
    const dir = ui.sortDir==='asc'?1:-1;
    const key = ui.sortKey;
    const va = key==='created' ? a.created : String(a[key]||'').toLowerCase();
    const vb = key==='created' ? b.created : String(b[key]||'').toLowerCase();
    return (va<vb?-1:va>vb?1:0) * dir;
  });

  return rows;
}

function mountTable(){
  const rows = getAllFilteredSorted();

  // pagination
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/ui.size));
  ui.page = Math.min(Math.max(1, ui.page), pages);
  const start = (ui.page-1)*ui.size;
  const pageRows = rows.slice(start, start+ui.size);

  $('#tenBody').innerHTML = pageRows.map(r=>`
    <tr>
      <td class="fw-semibold">${esc(r.name)}</td>
      <td>${esc(r.env)}</td>
      <td>${esc(r.owner)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${r.domainsCount}</td>
      <td class="text-nowrap">${esc(fmtTime(r.created))}</td>
      <td>${esc(r.sso)}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          ${r.status==='Active'
            ? `<button class="btn btn-outline-warning" data-act="suspend" data-id="${escAttr(r.id)}" type="button">Suspend</button>`
            : `<button class="btn btn-outline-success" data-act="activate" data-id="${escAttr(r.id)}" type="button">Activate</button>`
          }
          <button class="btn btn-outline-secondary" data-act="edit" data-id="${escAttr(r.id)}" type="button">Edit</button>
          <button class="btn btn-outline-danger" data-act="del" data-id="${escAttr(r.id)}" type="button">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="8" class="text-center text-body-secondary py-4">No matching tenants</td></tr>`;

  $('#pager').innerHTML = pagesHtml(ui.page, pages);
  $('#pager').querySelectorAll('.page-link[data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.page = Number(btn.getAttribute('data-page')); mountTable(); });
  });

  // row actions
  $('#tenBody').onclick = (e)=>{
    const btn = e.target.closest('button[data-act]'); if(!btn) return;
    const id = btn.getAttribute('data-id');
    const idx = model.tenants.findIndex(t=>t.id===id); if(idx<0) return;
    const act = btn.getAttribute('data-act');
    if (act==='edit') openEditor(idx);
    else if (act==='del') delTenant(idx);
    else if (act==='suspend') setStatus(idx, 'Suspended');
    else if (act==='activate') setStatus(idx, 'Active');
  };
}

function statusBadge(v){
  const m = (v||'').toLowerCase();
  const cls = /active/.test(m) ? 'text-bg-success' : /suspend/.test(m) ? 'text-bg-warning' : 'text-bg-secondary';
  return `<span class="badge ${cls}">${esc(v)}</span>`;
}

/* --------------------- Editor & CRUD -------------------------- */
function openEditor(index){
  const editing = index!=null && index>=0;
  const row = editing ? model.tenants[index] : {
    name:'', env:'Sandbox', owner:'', status:'Provisioning',
    domains:[], sso:'None', created:new Date().toISOString(), notes:''
  };

  $('#tenantModalLabel').textContent = editing ? `Edit Tenant — ${row.name}` : 'New Tenant';
  $('#tName').value = row.name || '';
  $('#tEnv').value = row.env || 'Sandbox';
  $('#tStatus').value = row.status || 'Provisioning';
  $('#tOwner').value = row.owner || '';
  $('#tSSO').value = row.sso || 'None';
  $('#tDomains').value = (row.domains||[]).join(', ');
  $('#tCreated').value = toLocalDatetime(row.created);
  $('#tNotes').value = row.notes || '';
  ['tName','tEnv','tStatus','tOwner'].forEach(id=>$('#'+id).classList.remove('is-invalid'));
  $('#tNameDup').style.display='none';

  $('#btnSaveTenant').onclick = ()=>{
    const name = $('#tName').value.trim();
    const env  = $('#tEnv').value;
    const status = $('#tStatus').value;
    const owner = $('#tOwner').value.trim();
    const sso   = $('#tSSO').value;
    const domains = ($('#tDomains').value||'').split(',').map(s=>s.trim()).filter(Boolean);
    const created = fromLocalDatetime($('#tCreated').value) || new Date().toISOString();
    const notes = $('#tNotes').value.trim();

    // validate
    let ok = true;
    if(!name){ $('#tName').classList.add('is-invalid'); ok=false; } else $('#tName').classList.remove('is-invalid');
    if(!env){ $('#tEnv').classList.add('is-invalid'); ok=false; } else $('#tEnv').classList.remove('is-invalid');
    if(!status){ $('#tStatus').classList.add('is-invalid'); ok=false; } else $('#tStatus').classList.remove('is-invalid');
    if(!owner){ $('#tOwner').classList.add('is-invalid'); ok=false; } else $('#tOwner').classList.remove('is-invalid');

    const dup = model.tenants.some(t=>t.name.toLowerCase()===name.toLowerCase() && (!editing || t.id!==row.id));
    if(dup){ $('#tName').classList.add('is-invalid'); $('#tNameDup').style.display='block'; ok=false; } else $('#tNameDup').style.display='none';
    if(!ok) return;

    if (editing){
      model.tenants[index] = { ...row, name, env, status, owner, sso, domains, created, notes };
    } else {
      model.tenants.push({ id:genId(), name, env, status, owner, sso, domains, created, notes });
    }
    closeModal('#tenantModal'); render();
  };

  openModal('#tenantModal');
}

function delTenant(index){
  const r = model.tenants[index]; if(!r) return;
  if (!confirm(`Delete tenant "${r.name}"?`)) return;
  model.tenants.splice(index,1); render();
}
function setStatus(index, status){
  const r = model.tenants[index]; if(!r) return;
  r.status = status; render();
}

/* --------------------- Export CSV ----------------------------- */
function exportCSV(rows){
  const hdr = ['Name','Environment','Owner','Status','Domains','SSO','Created','Notes'];
  const body = rows.map(r=>[
    r.name, r.env, r.owner, r.status, (r.domains||[]).join('|'), r.sso, fmtTime(r.created), r.notes||''
  ]);
  const csv = toCSV([hdr, ...body]);
  $('#csvModalLabel').textContent = `CSV Preview — tenants_${ts()}.csv`;
  $('#csvPreview').textContent = csv;
  $('#btnCopyCsv').onclick = async ()=>{ try{ await navigator.clipboard.writeText(csv); alert('Copied!'); } catch{ alert('Copy failed'); } };
  openModal('#csvModal');
}

/* --------------------- Utilities ------------------------------ */
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
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function fmtTime(iso){ try{ return new Date(iso).toLocaleString(); } catch{ return iso; } }
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
function toCSV(rows){ const BOM='\uFEFF'; return BOM + rows.map(r=>r.map(c=>csvCell(c)).join(',')).join('\r\n'); }
function csvCell(v){ const s=String(v??''); return /[",\r\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function toLocalDatetime(iso){ if(!iso) return ''; const d=new Date(iso); const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fromLocalDatetime(v){ if(!v) return ''; const d=new Date(v); return isNaN(d.getTime())? '' : d.toISOString(); }
