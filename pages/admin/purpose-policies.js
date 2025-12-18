// EDX — Purpose of Use Policies (production-grade)
// Features: search, independent pagination for Roles (rows) & Purposes (columns),
// bulk select/deselect per row/column, dirty-state handling, CSV preview/copy,
// localStorage demo persistence, Bootstrap-first modal handling (safe fallback),
// and no top-level await.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'purpose-policies.json';
const LS_KEY  = 'edx_purpose_of_use_policies_v1';

let model = { meta:{}, roles:[], purposes:[], matrix:{} };
let dirty = false;

const ui = {
  qRole:'', qPurpose:'',
  rPage:1, rSize:10,   // roles pagination
  pPage:1, pSize:8,    // purposes pagination (columns)
};

init().catch(console.error);

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
async function init(){
  try{
    const saved = localStorage.getItem(LS_KEY);
    if (saved) { model = JSON.parse(saved); }
    else {
      model = await fetch(SRC_URL, { cache:'no-store' }).then(r=>r.json());
    }
  } catch {
    model = { meta:{}, roles:[], purposes:[], matrix:{} };
  }
  normalizeModel();
  render();
}

function normalizeModel(){
  model.roles = Array.isArray(model.roles) ? model.roles : [];
  model.purposes = Array.isArray(model.purposes) ? model.purposes : [];
  model.matrix = model.matrix && typeof model.matrix==='object' ? model.matrix : {};
  // ensure all role keys exist
  for (const r of model.roles){ if(!Array.isArray(model.matrix[r])) model.matrix[r]=[]; }
}

function saveLocal(){
  localStorage.setItem(LS_KEY, JSON.stringify(model));
  dirty = false;
  alert('Saved (demo): purpose-of-use matrix stored in your browser.');
}
function resetLocal(){
  localStorage.removeItem(LS_KEY);
  dirty = false;
  init();
}

/* --------------------- Rendering ------------------------------ */
function render(){
  // search filtering
  const roleFilter = model.roles.filter(r => !ui.qRole.trim() || r.toLowerCase().includes(ui.qRole.trim().toLowerCase()));
  const purposeFilter = model.purposes.filter(p => !ui.qPurpose.trim() || p.toLowerCase().includes(ui.qPurpose.trim().toLowerCase()));

  // pagination: roles
  const rPages = Math.max(1, Math.ceil(roleFilter.length / ui.rSize));
  ui.rPage = Math.min(Math.max(1, ui.rPage), rPages);
  const rStart = (ui.rPage-1)*ui.rSize;
  const rolesPage = roleFilter.slice(rStart, rStart + ui.rSize);

  // pagination: purposes (columns)
  const pPages = Math.max(1, Math.ceil(purposeFilter.length / ui.pSize));
  ui.pPage = Math.min(Math.max(1, ui.pPage), pPages);
  const pStart = (ui.pPage-1)*ui.pSize;
  const purposesPage = purposeFilter.slice(pStart, pStart + ui.pSize);

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Purpose of Use Policies</h1>
        <span class="kpi"><span class="dot"></span> Roles: ${model.roles.length}</span>
        <span class="kpi"><span class="dot"></span> Purposes: ${model.purposes.length}</span>
        <span class="badge ${dirty?'text-bg-warning':'text-bg-secondary'} badge-chip">${dirty?'Unsaved changes':'Read/write (demo persisted)'}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="btn-group btn-group-sm">
          <button id="btnExport" class="btn btn-outline-secondary">Export CSV</button>
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>
      </div>
    </div>

    <div class="card card-elevated">
      <div class="card-body">

        <!-- Filters + pagination controls -->
        <div class="row g-2 align-items-end">
          <div class="col-md-4">
            <label class="form-label mb-1">Search Roles</label>
            <div class="input-group input-group-sm search-wrap">
              <span class="input-group-text">Role</span>
              <input id="qRole" class="form-control" placeholder="e.g., Data Steward" value="${escAttr(ui.qRole)}">
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label mb-1">Rows/page</label>
            <select id="rSize" class="form-select form-select-sm">
              ${[10,25,50,100].map(n=>`<option value="${n}" ${n===ui.rSize?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-5">
            <label class="form-label mb-1">Roles pagination</label>
            <nav><ul class="pagination pagination-sm mb-0">${pagesHtml(ui.rPage, rPages, 'r')}</ul></nav>
          </div>

          <div class="col-md-4 mt-3">
            <label class="form-label mb-1">Search Purposes</label>
            <div class="input-group input-group-sm search-wrap">
              <span class="input-group-text">Purpose</span>
              <input id="qPurpose" class="form-control" placeholder="e.g., Research" value="${escAttr(ui.qPurpose)}">
            </div>
          </div>
          <div class="col-md-3 mt-3">
            <label class="form-label mb-1">Columns/page</label>
            <select id="pSize" class="form-select form-select-sm">
              ${[6,8,10,12].map(n=>`<option value="${n}" ${n===ui.pSize?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-5 mt-3">
            <label class="form-label mb-1">Purposes pagination</label>
            <nav><ul class="pagination pagination-sm mb-0">${pagesHtml(ui.pPage, pPages, 'p')}</ul></nav>
          </div>
        </div>

        <!-- Matrix -->
        <div class="table-responsive mt-3">
          <table class="table table-bordered align-middle matrix">
            <thead class="table-light">
              <tr>
                <th class="sticky-top role-col">
                  Role
                  <div class="mt-1">
                    <button class="btn btn-outline-secondary btn-xs" id="btnRowAll">Select all (rows)</button>
                    <button class="btn btn-outline-secondary btn-xs" id="btnRowNone">Clear all (rows)</button>
                  </div>
                </th>
                ${purposesPage.map(p=>`
                  <th class="text-nowrap sticky-top">
                    ${esc(p)}
                    <div class="mt-1">
                      <button class="btn btn-outline-secondary btn-xs" data-col="${escAttr(p)}" data-col-act="all">All</button>
                      <button class="btn btn-outline-secondary btn-xs" data-col="${escAttr(p)}" data-col-act="none">None</button>
                    </div>
                  </th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              ${rolesPage.map(r=>rowHtml(r, purposesPage)).join('')}
            </tbody>
          </table>
        </div>

        <div class="small text-body-secondary">Purpose flags become ABAC conditions enforced across SQL / APIs / Exports / Shares.</div>
      </div>
    </div>
  `;

  // wiring: filters & pagination
  $('#qRole').addEventListener('input', e=>{ ui.qRole=e.target.value; ui.rPage=1; render(); });
  $('#qPurpose').addEventListener('input', e=>{ ui.qPurpose=e.target.value; ui.pPage=1; render(); });
  $('#rSize').addEventListener('change', e=>{ ui.rSize=Number(e.target.value)||10; ui.rPage=1; render(); });
  $('#pSize').addEventListener('change', e=>{ ui.pSize=Number(e.target.value)||8; ui.pPage=1; render(); });

  main.querySelectorAll('.pagination .page-link[data-scope="r"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.rPage = Number(btn.getAttribute('data-page')); render(); });
  });
  main.querySelectorAll('.pagination .page-link[data-scope="p"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.pPage = Number(btn.getAttribute('data-page')); render(); });
  });

  // wiring: CSV/export & persistence
  $('#btnExport').addEventListener('click', exportCSV);
  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnReset').addEventListener('click', resetLocal);

  // wiring: bulk row/column actions
  $('#btnRowAll').addEventListener('click', ()=>{ bulkRows(rolesPage, purposesPage, true); });
  $('#btnRowNone').addEventListener('click', ()=>{ bulkRows(rolesPage, purposesPage, false); });
  main.querySelectorAll('[data-col][data-col-act]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const p = btn.getAttribute('data-col');
      const act = btn.getAttribute('data-col-act');
      bulkColumn(p, rolesPage, act==='all');
    });
  });

  // wiring: individual cells
  main.querySelectorAll('input[data-r][data-p]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const r = cb.getAttribute('data-r');
      const p = cb.getAttribute('data-p');
      setCell(r, p, cb.checked);
      // reflect background style for instant feedback
      const td = cb.closest('td'); td.classList.toggle('cell-on', cb.checked); td.classList.toggle('cell-off', !cb.checked);
    });
  });
}

function rowHtml(role, purposes){
  return `
    <tr>
      <th class="role-col">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <span class="text-nowrap">${esc(role)}</span>
          <span class="d-flex gap-1">
            <button class="btn btn-outline-secondary btn-xs" data-row="${escAttr(role)}" data-row-act="all">All</button>
            <button class="btn btn-outline-secondary btn-xs" data-row="${escAttr(role)}" data-row-act="none">None</button>
          </span>
        </div>
      </th>
      ${purposes.map(p=>{
        const on = !!(model.matrix?.[role]?.includes(p));
        return `<td class="${on?'cell-on':'cell-off'} text-center">
          <input type="checkbox" data-r="${escAttr(role)}" data-p="${escAttr(p)}" ${on?'checked':''} aria-label="${role} allows ${p}">
        </td>`;
      }).join('')}
    </tr>
  `;
}

/* --------------------- Mutations ------------------------------ */
function setCell(role, purpose, val){
  const arr = model.matrix[role] || (model.matrix[role] = []);
  const i = arr.indexOf(purpose);
  if (val && i<0) arr.push(purpose);
  if (!val && i>=0) arr.splice(i,1);
  dirty = true;
}
function bulkRows(rolesSubset, purposesSubset, val){
  for (const r of rolesSubset){
    for (const p of purposesSubset) setCell(r, p, val);
  }
  render();
}
function bulkColumn(purpose, rolesSubset, val){
  for (const r of rolesSubset) setCell(r, purpose, val);
  render();
}

/* --------------------- CSV Preview ---------------------------- */
function exportCSV(){
  const hdr = ['Role', ...model.purposes];
  const body = model.roles.map(r => [
    r,
    ...model.purposes.map(p => (model.matrix[r]||[]).includes(p) ? '1' : '0')
  ]);
  const csv = toCSV([hdr, ...body]);
  $('#csvModalLabel').textContent = `CSV Preview — purpose_of_use_${ts()}.csv`;
  $('#csvPreview').textContent = csv;
  $('#btnCopyCsv').onclick = async ()=>{ try{ await navigator.clipboard.writeText(csv); alert('Copied!'); } catch{ alert('Copy failed'); } };
  openModal('#csvModal');
}

/* --------------------- Utilities ------------------------------ */
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function pagesHtml(page,total,scope){
  const out=[]; const add=(n,l=n,dis=false)=> out.push(`<li class="page-item ${n===page?'active':''} ${dis?'disabled':''}">
    <button class="page-link" data-page="${n}" data-scope="${scope}" type="button">${l}</button></li>`);
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
function toCSV(rows){ const BOM='\uFEFF'; return BOM + rows.map(r=>r.map(c=>csvCell(c)).join(',')).join('\r\n'); }
function csvCell(v){ const s=String(v??''); return /[",\r\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
