// EDX — Network & Allow-lists (production-grade)
// Features: independent search/sort/pagination for CIDR & Domains, Add/Edit/Delete with
// Bootstrap-first modals (safe fallback), field validation, CSV preview/copy,
// localStorage demo persistence, no top-level await.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'network-access.json';
const LS_KEY  = 'edx_network_allowlists_v1';

let model = { meta:{}, cidr:[], domains:[] };

const ui = {
  // CIDR list
  c: { q:'', sortKey:'value', sortDir:'asc', page:1, size:10 },
  // Domain list
  d: { q:'', sortKey:'value', sortDir:'asc', page:1, size:10 }
};

let editCtx = { list:'c', index:-1 }; // which list ('c' or 'd') & index being edited

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
    if (saved) { model = JSON.parse(saved); }
    else { model = await fetch(SRC_URL, { cache:'no-store' }).then(r=>r.json()); }
  } catch {
    model = { meta:{}, cidr:[], domains:[] };
  }
  render();
}
function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify(model)); alert('Saved (demo): allow-lists stored in your browser.'); }
function resetLocal(){ localStorage.removeItem(LS_KEY); init(); }

/* --------------------- Validators ----------------------------- */
// IPv4, IPv6, CIDR (v4/v6) or single IP
const reIPv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const reIPv6 = /^(([0-9a-fA-F]{1,4}:){1,7}|:):?([0-9a-fA-F]{1,4}){0,7}$/; // permissive for demo
const reCidrV4 = new RegExp(`^(${reIPv4.source})\\/(3[0-2]|[12]?\\d)$`);
const reCidrV6 = /^([0-9a-fA-F:]+)\/(12[0-8]|1[01]\d|\d?\d)$/; // /0–128
const reDomain = /^(?=.{1,253}$)(?!\-)([a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/;

function isValidCidrOrIp(v){
  return reIPv4.test(v) || reIPv6.test(v) || reCidrV4.test(v) || reCidrV6.test(v);
}
function isValidDomain(v){
  // Disallow protocol/path/port
  if (/^(https?:)?\/\//i.test(v) || /[\/:@]/.test(v)) return false;
  return reDomain.test(v) || /^xn--/.test(v); // allow punycode start
}

/* --------------------- Rendering ------------------------------ */
function render(){
  const cidrRows = model.cidr.map(v=>({ value:String(v) }));
  const domRows  = model.domains.map(v=>({ value:String(v) }));

  const c = filterSortPaginate(cidrRows, ui.c);
  const d = filterSortPaginate(domRows,  ui.d);

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Network & Allow-lists</h1>
        <span class="kpi"><span class="dot"></span> CIDR/IP: ${cidrRows.length}</span>
        <span class="kpi"><span class="dot"></span> Domains: ${domRows.length}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="btn-group btn-group-sm">
          <button id="btnExportC" class="btn btn-outline-secondary">Export CIDR CSV</button>
          <button id="btnExportD" class="btn btn-outline-secondary">Export Domains CSV</button>
        </div>
        <div class="btn-group btn-group-sm">
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <!-- CIDR/IP -->
      <div class="col-12 col-xl-6">
        <div class="card card-elevated h-100">
          <div class="card-header bg-body d-flex align-items-center justify-content-between">
            <strong>IP/CIDR Allow-list</strong>
            <div class="d-flex gap-2">
              <button id="btnNewCidr" class="btn btn-primary btn-sm">Add</button>
            </div>
          </div>
          <div class="card-body">
            <div class="d-flex flex-wrap gap-2 mb-2">
              <div class="input-group input-group-sm search-wrap">
                <span class="input-group-text">Search</span>
                <input id="qC" class="form-control" placeholder="e.g., 198.51.100 or /24" value="${escAttr(ui.c.q)}">
              </div>
              <div class="btn-group btn-group-sm" role="group">
                <button id="sortCval" class="btn btn-outline-secondary" type="button">
                  Sort ${ui.c.sortKey==='value' ? (ui.c.sortDir==='asc'?'▲':'▼') : ''}
                </button>
              </div>
              <div class="input-group input-group-sm" style="width:auto;">
                <label class="input-group-text">Rows/page</label>
                <select id="sizeC" class="form-select form-select-sm">
                  ${[10,25,50,100].map(n=>`<option value="${n}" ${n===ui.c.size?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="table-responsive">
              <table class="table align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Value</th>
                    <th class="text-end" style="width:140px">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${c.pageRows.map((r,i)=>rowCidr(r, c.start+i)).join('')}
                  ${c.pageRows.length? '' : `<tr><td colspan="2" class="text-center text-body-secondary py-4">No entries</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
          <div class="card-footer d-flex align-items-center justify-content-between">
            <small class="text-body-secondary">Only traffic from these IPs/CIDRs can reach admin and APIs when enabled at the proxy.</small>
            <nav><ul class="pagination pagination-sm mb-0">${pagesHtml(ui.c.page, c.pages, 'c')}</ul></nav>
          </div>
        </div>
      </div>

      <!-- Domains -->
      <div class="col-12 col-xl-6">
        <div class="card card-elevated h-100">
          <div class="card-header bg-body d-flex align-items-center justify-content-between">
            <strong>Domain Allow-list</strong>
            <div class="d-flex gap-2">
              <button id="btnNewDomain" class="btn btn-primary btn-sm">Add</button>
            </div>
          </div>
          <div class="card-body">
            <div class="d-flex flex-wrap gap-2 mb-2">
              <div class="input-group input-group-sm search-wrap">
                <span class="input-group-text">Search</span>
                <input id="qD" class="form-control" placeholder="e.g., vendor.com" value="${escAttr(ui.d.q)}">
              </div>
              <div class="btn-group btn-group-sm" role="group">
                <button id="sortDval" class="btn btn-outline-secondary" type="button">
                  Sort ${ui.d.sortKey==='value' ? (ui.d.sortDir==='asc'?'▲':'▼') : ''}
                </button>
              </div>
              <div class="input-group input-group-sm" style="width:auto;">
                <label class="input-group-text">Rows/page</label>
                <select id="sizeD" class="form-select form-select-sm">
                  ${[10,25,50,100].map(n=>`<option value="${n}" ${n===ui.d.size?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="table-responsive">
              <table class="table align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Domain</th>
                    <th class="text-end" style="width:140px">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${d.pageRows.map((r,i)=>rowDomain(r, d.start+i)).join('')}
                  ${d.pageRows.length? '' : `<tr><td colspan="2" class="text-center text-body-secondary py-4">No entries</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
          <div class="card-footer d-flex align-items-center justify-content-between">
            <small class="text-body-secondary">Outgoing integrations can call only these hostnames when egress controls are enabled.</small>
            <nav><ul class="pagination pagination-sm mb-0">${pagesHtml(ui.d.page, d.pages, 'd')}</ul></nav>
          </div>
        </div>
      </div>
    </div>
  `;

  // Global buttons
  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnReset').addEventListener('click', resetLocal);
  $('#btnExportC').addEventListener('click', ()=> previewCsv('cidr', cidrRows.map(r=>r.value)));
  $('#btnExportD').addEventListener('click', ()=> previewCsv('domains', domRows.map(r=>r.value)));

  // CIDR wiring
  $('#btnNewCidr').addEventListener('click', ()=> openCidrEditor(null));
  $('#qC').addEventListener('input', e=>{ ui.c.q=e.target.value; ui.c.page=1; render(); });
  $('#sortCval').addEventListener('click', ()=> toggleSort(ui.c));
  $('#sizeC').addEventListener('change', e=>{ ui.c.size=Number(e.target.value)||10; ui.c.page=1; render(); });
  main.addEventListener('click', onCidrAction);
  main.querySelectorAll('.pagination .page-link[data-page][data-scope="c"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.c.page = Number(btn.getAttribute('data-page')); render(); });
  });

  // Domain wiring
  $('#btnNewDomain').addEventListener('click', ()=> openDomainEditor(null));
  $('#qD').addEventListener('input', e=>{ ui.d.q=e.target.value; ui.d.page=1; render(); });
  $('#sortDval').addEventListener('click', ()=> toggleSort(ui.d));
  $('#sizeD').addEventListener('change', e=>{ ui.d.size=Number(e.target.value)||10; ui.d.page=1; render(); });
  main.addEventListener('click', onDomainAction);
  main.querySelectorAll('.pagination .page-link[data-page][data-scope="d"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.d.page = Number(btn.getAttribute('data-page')); render(); });
  });
}

/* --------------------- Table helpers ------------------------- */
function filterSortPaginate(rows, s){
  // filter
  const q = s.q.trim().toLowerCase();
  rows = rows.filter(r=> !q || r.value.toLowerCase().includes(q));
  // sort
  rows.sort((a,b)=>{
    const dir = s.sortDir==='asc'?1:-1;
    const va = String(a.value).toLowerCase();
    const vb = String(b.value).toLowerCase();
    return (va<vb?-1:va>vb?1:0) * dir;
  });
  // paginate
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/s.size));
  s.page = Math.min(Math.max(1, s.page), pages);
  const start = (s.page-1)*s.size;
  const pageRows = rows.slice(start, start+s.size);
  return { total, pages, start, pageRows };
}
function rowCidr(r, idx){
  return `
    <tr>
      <td><span class="text-monospace">${esc(r.value)}</span></td>
      <td class="text-end tbl-tools">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-act="editC" data-idx="${idx}" type="button">Edit</button>
          <button class="btn btn-outline-danger" data-act="delC" data-idx="${idx}" type="button">Delete</button>
        </div>
      </td>
    </tr>`;
}
function rowDomain(r, idx){
  return `
    <tr>
      <td>${esc(r.value)}</td>
      <td class="text-end tbl-tools">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-act="editD" data-idx="${idx}" type="button">Edit</button>
          <button class="btn btn-outline-danger" data-act="delD" data-idx="${idx}" type="button">Delete</button>
        </div>
      </td>
    </tr>`;
}
function pagesHtml(page,total,scope){
  const out=[];
  const add=(n,l=n,dis=false)=> out.push(`<li class="page-item ${n===page?'active':''} ${dis?'disabled':''}">
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
function toggleSort(s){ s.sortDir = (s.sortDir==='asc'?'desc':'asc'); render(); }

/* --------------------- CIDR actions -------------------------- */
function onCidrAction(e){
  const btn=e.target.closest('button[data-act^="editC"],button[data-act^="delC"]'); if(!btn) return;
  const idx=Number(btn.getAttribute('data-idx'));
  const act=btn.getAttribute('data-act');
  if (act==='editC') openCidrEditor(idx);
  if (act==='delC')  delCidr(idx);
}
function openCidrEditor(index){
  editCtx = { list:'c', index:(index ?? -1) };
  $('#cidrModalLabel').textContent = index!=null && index>=0 ? 'Edit CIDR / IP' : 'Add CIDR / IP';
  $('#cidrValue').value = index!=null && index>=0 ? model.cidr[index] : '';
  hideInvalid('#cidrInvalid', '#cidrValue');
  $('#btnSaveCidr').onclick = saveCidrFromModal;
  openModal('#cidrModal');
}
function saveCidrFromModal(){
  const val = $('#cidrValue').value.trim();
  if (!isValidCidrOrIp(val)) { showInvalid('#cidrInvalid', '#cidrValue'); return; }
  if (editCtx.index>=0) model.cidr[editCtx.index] = val;
  else {
    if (model.cidr.some(v=>v.toLowerCase()===val.toLowerCase())) { alert('Duplicate value.'); return; }
    model.cidr.push(val);
  }
  closeModal('#cidrModal');
  render();
}
function delCidr(index){
  const v = model.cidr[index]; if(!v) return;
  if (confirm(`Remove "${v}" from IP/CIDR allow-list?`)){ model.cidr.splice(index,1); render(); }
}

/* --------------------- Domain actions ------------------------ */
function onDomainAction(e){
  const btn=e.target.closest('button[data-act^="editD"],button[data-act^="delD"]'); if(!btn) return;
  const idx=Number(btn.getAttribute('data-idx'));
  const act=btn.getAttribute('data-act');
  if (act==='editD') openDomainEditor(idx);
  if (act==='delD')  delDomain(idx);
}
function openDomainEditor(index){
  editCtx = { list:'d', index:(index ?? -1) };
  $('#domainModalLabel').textContent = index!=null && index>=0 ? 'Edit Domain' : 'Add Domain';
  $('#domainValue').value = index!=null && index>=0 ? model.domains[index] : '';
  hideInvalid('#domainInvalid', '#domainValue');
  $('#btnSaveDomain').onclick = saveDomainFromModal;
  openModal('#domainModal');
}
function saveDomainFromModal(){
  const val = $('#domainValue').value.trim();
  if (!isValidDomain(val)) { showInvalid('#domainInvalid', '#domainValue'); return; }
  if (editCtx.index>=0) model.domains[editCtx.index] = val;
  else {
    if (model.domains.some(v=>v.toLowerCase()===val.toLowerCase())) { alert('Duplicate value.'); return; }
    model.domains.push(val);
  }
  closeModal('#domainModal');
  render();
}
function delDomain(index){
  const v = model.domains[index]; if(!v) return;
  if (confirm(`Remove "${v}" from domain allow-list?`)){ model.domains.splice(index,1); render(); }
}

/* --------------------- CSV preview --------------------------- */
function previewCsv(kind, arr){
  const hdr = kind==='cidr' ? ['Value'] : ['Domain'];
  const csv = toCSV([hdr, ...arr.map(v=>[v])]);
  $('#csvModalLabel').textContent = `CSV Preview — ${kind}_${ts()}.csv`;
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
function showInvalid(feedbackSel, inputSel){ $(feedbackSel).classList.remove('d-none'); $(inputSel).classList.add('is-invalid'); }
function hideInvalid(feedbackSel, inputSel){ $(feedbackSel).classList.add('d-none'); $(inputSel).classList.remove('is-invalid'); }
