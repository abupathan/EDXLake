// EDX — Users & Roles (production-grade)
// Features: search, role filter, sortable columns, pagination; Invite/Edit/Suspend/Delete;
// CSV preview & copy; localStorage demo persistence; Bootstrap-first modals
// with safe fallback; no top-level await in HTML.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'users-roles.json';
const LS_KEY  = 'edx_users_roles_v1';

let model = { meta:{}, roles:[], users:[] };
const ui = {
  q:'', role:'All', status:'All',
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
    model = { meta:{}, roles:[], users:[] };
  }
  normalize();
  render();
}

function normalize(){
  model.roles = Array.isArray(model.roles) ? model.roles : [];
  model.users = Array.isArray(model.users) ? model.users.map(u=>({
    id: String(u.id || genId()),
    name: String(u.name||''),
    email: String(u.email||''),
    roles: Array.isArray(u.roles) ? u.roles : [],
    status: String(u.status||'Active'),
    notes: String(u.notes||'')
  })) : [];
}

function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify(model)); alert('Saved (demo): users & roles stored in your browser.'); }
function resetLocal(){ localStorage.removeItem(LS_KEY); init(); }

/* --------------------- Rendering ------------------------------ */
function render(){
  const total = model.users.length;
  const active = model.users.filter(u=>u.status==='Active').length;

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Users & Roles</h1>
        <span class="kpi-chip"><span class="dot"></span> Users: ${total}</span>
        <span class="kpi-chip"><span class="dot"></span> Active: ${active}</span>
        <span class="badge text-bg-secondary badge-chip">Roles: ${model.roles.length}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="btn-group btn-group-sm">
          <button id="btnExport" class="btn btn-outline-secondary">Export CSV</button>
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>
        <button id="btnInvite" class="btn btn-primary btn-sm" type="button">Invite User</button>
      </div>
    </div>

    <div class="card card-elevated">
      <div class="card-body">
        <div class="d-flex flex-wrap gap-2 mb-2">
          <div class="input-group input-group-sm search-wrap">
            <span class="input-group-text">Search</span>
            <input id="q" class="form-control" placeholder="name, email, notes…" value="${escAttr(ui.q)}">
          </div>
          <div class="input-group input-group-sm" style="width:auto;">
            <label class="input-group-text">Role</label>
            <select id="fRole" class="form-select form-select-sm">
              ${['All', ...model.roles].map(r=>`<option ${r===ui.role?'selected':''}>${r}</option>`).join('')}
            </select>
          </div>
          <div class="input-group input-group-sm" style="width:auto;">
            <label class="input-group-text">Status</label>
            <select id="fStatus" class="form-select form-select-sm">
              ${['All','Active','Invited','Suspended'].map(v=>`<option ${v===ui.status?'selected':''}>${v}</option>`).join('')}
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
          <table class="table align-middle mb-0" id="usrTable">
            <thead class="table-light">
              <tr>
                ${th('name','User')}
                ${th('email','Email')}
                <th>Roles</th>
                ${th('status','Status')}
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody id="usrBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card-footer d-flex align-items-center justify-content-between">
        <small class="text-body-secondary">All changes are fully audited. This page simulates platform admin flows.</small>
        <nav><ul id="pager" class="pagination pagination-sm mb-0"></ul></nav>
      </div>
    </div>
  `;

  // actions
  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnReset').addEventListener('click', resetLocal);
  $('#btnExport').addEventListener('click', ()=>exportCSV(getAllFilteredSorted()));
  $('#btnInvite').addEventListener('click', ()=> openEditor(null));

  // filters
  $('#q').addEventListener('input', e=>{ ui.q=e.target.value; ui.page=1; mountTable(); });
  $('#fRole').addEventListener('change', e=>{ ui.role=e.target.value; ui.page=1; mountTable(); });
  $('#fStatus').addEventListener('change', e=>{ ui.status=e.target.value; ui.page=1; mountTable(); });
  $('#pageSize').addEventListener('change', e=>{ ui.size=Number(e.target.value)||10; ui.page=1; mountTable(); });

  // sorting
  main.querySelectorAll('#usrTable thead th[data-sort-key]').forEach(th=>{
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
  let rows = model.users.slice();

  rows = rows.filter(u=>{
    const hay = `${u.name} ${u.email} ${u.notes} ${(u.roles||[]).join(' ')}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okR = ui.role==='All' || (u.roles||[]).includes(ui.role);
    const okS = ui.status==='All' || u.status===ui.status;
    return okQ && okR && okS;
  });

  rows.sort((a,b)=>{
    const dir = ui.sortDir==='asc'?1:-1;
    const key = ui.sortKey;
    const va = String(a[key]||'').toLowerCase();
    const vb = String(b[key]||'').toLowerCase();
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

  $('#usrBody').innerHTML = pageRows.map(r=>`
    <tr>
      <td class="fw-semibold">${esc(r.name)}</td>
      <td class="text-truncate">${esc(r.email)}</td>
      <td>${(r.roles||[]).map(x=>`<span class="badge rounded-pill role-chip me-1">${esc(x)}</span>`).join('')}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          ${r.status==='Active'
            ? `<button class="btn btn-outline-warning" data-act="suspend" data-id="${escAttr(r.id)}" type="button">Suspend</button>`
            : `<button class="btn btn-outline-success" data-act="activate" data-id="${escAttr(r.id)}" type="button">Activate</button>`
          }
          <button class="btn btn-outline-secondary" data-act="edit" data-id="${escAttr(r.id)}" type="button">Edit</button>
          <button class="btn btn-outline-danger" data-act="del" data-id="${escAttr(r.id)}" type="button">Remove</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="text-center text-body-secondary py-4">No matching users</td></tr>`;

  $('#pager').innerHTML = pagesHtml(ui.page, pages);
  $('#pager').querySelectorAll('.page-link[data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.page = Number(btn.getAttribute('data-page')); mountTable(); });
  });

  // row actions
  $('#usrBody').onclick = (e)=>{
    const btn = e.target.closest('button[data-act]'); if(!btn) return;
    const id = btn.getAttribute('data-id'); const idx = model.users.findIndex(u=>u.id===id); if(idx<0) return;
    const act = btn.getAttribute('data-act');
    if (act==='edit') openEditor(idx);
    else if (act==='del') delUser(idx);
    else if (act==='suspend') setStatus(idx,'Suspended');
    else if (act==='activate') setStatus(idx,'Active');
  };
}

/* --------------------- Editor & CRUD -------------------------- */
function openEditor(index){
  const editing = index!=null && index>=0;
  const row = editing ? model.users[index] : { name:'', email:'', roles:[], status:'Invited', notes:'' };

  $('#userModalLabel').textContent = editing ? `Edit User — ${row.name}` : 'Invite User';
  $('#uName').value = row.name || '';
  $('#uEmail').value = row.email || '';
  $('#uStatus').value = row.status || 'Invited';
  $('#uNotes').value = row.notes || '';

  // render role checkboxes with guardrails (must exist in model.roles)
  const host = $('#uRoles');
  host.innerHTML = model.roles.map(r=>{
    const checked = (row.roles||[]).includes(r) ? 'checked' : '';
    return `
      <div class="form-check form-check-inline">
        <input class="form-check-input" type="checkbox" id="role_${escAttr(r)}" value="${escAttr(r)}" ${checked}>
        <label class="form-check-label" for="role_${escAttr(r)}">${esc(r)}</label>
      </div>
    `;
  }).join('');

  // clear errors
  $('#uRolesErr').classList.add('d-none');
  ['uName','uEmail'].forEach(id=>$('#'+id).classList.remove('is-invalid'));

  $('#btnSaveUser').onclick = ()=>{
    const name = $('#uName').value.trim();
    const email = $('#uEmail').value.trim();
    const status = $('#uStatus').value;
    const notes = $('#uNotes').value.trim();
    const roles = Array.from(host.querySelectorAll('input[type="checkbox"]:checked')).map(i=>i.value);

    // validation
    let ok = true;
    if(!name){ $('#uName').classList.add('is-invalid'); ok=false; } else $('#uName').classList.remove('is-invalid');
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ $('#uEmail').classList.add('is-invalid'); ok=false; } else $('#uEmail').classList.remove('is-invalid');
    if(!roles.length){ $('#uRolesErr').classList.remove('d-none'); ok=false; } else $('#uRolesErr').classList.add('d-none');
    if(!ok) return;

    if (editing){
      model.users[index] = { ...row, name, email, roles, status, notes };
    } else {
      model.users.unshift({ id: genId(), name, email, roles, status, notes });
    }
    closeModal('#userModal'); render();
  };

  openModal('#userModal');
}

function delUser(index){
  const r = model.users[index]; if(!r) return;
  if (!confirm(`Remove user "${r.name}"?`)) return;
  model.users.splice(index,1); render();
}
function setStatus(index, status){
  const r = model.users[index]; if(!r) return;
  r.status = status; render();
}

/* --------------------- Export CSV ----------------------------- */
function exportCSV(rows){
  const hdr = ['Name','Email','Roles','Status','Notes'];
  const body = rows.map(r=>[ r.name, r.email, (r.roles||[]).join('|'), r.status, r.notes||'' ]);
  const csv = toCSV([hdr, ...body]);
  $('#csvModalLabel').textContent = `CSV Preview — users_${ts()}.csv`;
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
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
function toCSV(rows){ const BOM='\uFEFF'; return BOM + rows.map(r=>r.map(c=>csvCell(c)).join(',')).join('\r\n'); }
function csvCell(v){ const s=String(v??''); return /[",\r\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function genId(){ return 'usr_' + Math.random().toString(36).slice(2,10) + '_' + Date.now().toString(36); }
function statusBadge(v){
  const m = (v||'').toLowerCase();
  const cls = /active/.test(m) ? 'text-bg-success' : /suspend/.test(m) ? 'text-bg-warning' : /invite/.test(m) ? 'text-bg-info' : 'text-bg-secondary';
  return `<span class="badge ${cls}">${esc(v)}</span>`;
}
