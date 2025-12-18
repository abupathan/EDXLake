// EDX — Promotion Controls (Read-only), production-grade
// Features: search, multi-filter, column sort, pagination, CSV preview/copy,
// Bootstrap-first modal with safe fallback (no top-level await), robust rendering.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'promotion-controls-ro.json';
const LS_KEY  = 'edx_promotion_controls_ro_v1';

let model = { meta:{}, flows:[] };

const ui = {
  q: '',
  from: 'All',
  to: 'All',
  sortKey: 'name', // name | from | to | gates | approvers
  sortDir: 'asc',
  page: 1,
  size: 10
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
    if (saved) { model = JSON.parse(saved); }
    else { model = await fetch(SRC_URL, { cache:'no-store' }).then(r=>r.json()); }
  } catch {
    model = { meta:{}, flows:[] };
  }
  render();
}
function resetLocal(){ localStorage.removeItem(LS_KEY); init(); }

/* --------------------- Rendering ------------------------------ */
function render(){
  const flows = (model.flows||[]).map((f,i)=>({
    name:String(f.name||''), from:String(f.from||''), to:String(f.to||''),
    gates:Array.isArray(f.gates)?f.gates:[], approvers:Array.isArray(f.approvers)?f.approvers:[],
    index:i
  }));

  const froms = ['All', ...Array.from(new Set(flows.map(f=>f.from))).sort()];
  const tos   = ['All', ...Array.from(new Set(flows.map(f=>f.to))).sort()];

  // filter/search
  const q = ui.q.trim().toLowerCase();
  let rows = flows.filter(f=>{
    const hay = `${f.name} ${f.from} ${f.to} ${f.gates.join(' ')} ${f.approvers.join(' ')}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okFrom = ui.from==='All' || f.from===ui.from;
    const okTo   = ui.to==='All' || f.to===ui.to;
    return okQ && okFrom && okTo;
  });

  // sort
  rows.sort((a,b)=>{
    const dir = ui.sortDir==='asc'?1:-1;
    const key = ui.sortKey;
    const va = key==='gates' ? a.gates.length : key==='approvers' ? a.approvers.join(',') : String(a[key]||'').toLowerCase();
    const vb = key==='gates' ? b.gates.length : key==='approvers' ? b.approvers.join(',') : String(b[key]||'').toLowerCase();
    return (va<vb?-1:va>vb?1:0) * dir;
  });

  // pagination
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/ui.size));
  ui.page = Math.min(Math.max(1, ui.page), pages);
  const start = (ui.page-1)*ui.size;
  const pageRows = rows.slice(start, start+ui.size);

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Promotion Controls (Read-only)</h1>
        <span class="kpi"><span class="dot"></span> Flows: ${flows.length}</span>
        <span class="kpi"><span class="dot"></span> From-states: ${froms.length-1}</span>
        <span class="kpi"><span class="dot"></span> To-states: ${tos.length-1}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="btn-group btn-group-sm">
          <button id="btnExport" class="btn btn-outline-secondary">Export CSV</button>
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
        </div>
      </div>
    </div>

    <div class="card card-elevated">
      <div class="card-body">
        <div class="d-flex flex-wrap gap-2 mb-2">
          <div class="input-group input-group-sm search-wrap">
            <span class="input-group-text">Search</span>
            <input id="q" class="form-control" placeholder="flow, gate, approver…" value="${escAttr(ui.q)}">
          </div>

          <div class="input-group input-group-sm" style="width:auto;">
            <label class="input-group-text">From</label>
            <select id="fFrom" class="form-select form-select-sm">
              ${froms.map(v=>`<option ${v===ui.from?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>

          <div class="input-group input-group-sm" style="width:auto;">
            <label class="input-group-text">To</label>
            <select id="fTo" class="form-select form-select-sm">
              ${tos.map(v=>`<option ${v===ui.to?'selected':''}>${v}</option>`).join('')}
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
                ${th('name','Flow')}
                ${th('from','From')}
                ${th('to','To')}
                ${th('gates','Gates')}
                ${th('approvers','Approvers')}
              </tr>
            </thead>
            <tbody>
              ${pageRows.map(r=>tr(r)).join('')}
              ${pageRows.length? '' : `<tr><td colspan="5" class="text-center text-body-secondary py-4">No matching flows</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card-footer d-flex align-items-center justify-content-between">
        <small class="text-body-secondary">Managed by Data Stewards. Admins have visibility but cannot modify gates/approvers here.</small>
        <nav aria-label="Pagination"><ul class="pagination pagination-sm mb-0">${pagesHtml(ui.page, pages)}</ul></nav>
      </div>
    </div>
  `;

  // wire: controls
  $('#btnExport').addEventListener('click', ()=> exportCSV(rows));
  $('#btnReset').addEventListener('click', resetLocal);
  $('#q').addEventListener('input', e=>{ ui.q=e.target.value; ui.page=1; render(); });
  $('#fFrom').addEventListener('change', e=>{ ui.from=e.target.value; ui.page=1; render(); });
  $('#fTo').addEventListener('change', e=>{ ui.to=e.target.value; ui.page=1; render(); });
  $('#pageSize').addEventListener('change', e=>{ ui.size=Number(e.target.value)||10; ui.page=1; render(); });

  // sort + pagination
  main.querySelectorAll('th[data-sort-key]').forEach(thEl=>{
    thEl.addEventListener('click', ()=>{
      const key = thEl.getAttribute('data-sort-key');
      if (ui.sortKey === key) ui.sortDir = (ui.sortDir==='asc'?'desc':'asc');
      else { ui.sortKey = key; ui.sortDir = 'asc'; }
      render();
    });
  });
  main.querySelectorAll('.pagination .page-link[data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.page = Number(btn.getAttribute('data-page')); render(); });
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
      <td class="text-nowrap">${esc(r.from)}</td>
      <td class="text-nowrap">${esc(r.to)}</td>
      <td class="text-nowrap">${r.gates.map(g=>`<span class="badge rounded-pill badge-step me-1">${esc(g)}</span>`).join('')}</td>
      <td class="text-nowrap">${esc(r.approvers.join(', '))}</td>
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

/* --------------------- Export CSV ---------------------------- */
function exportCSV(rows){
  const hdr = ['Flow','From','To','Gates','Approvers'];
  const body = rows.map(r=>[r.name, r.from, r.to, r.gates.join('|'), r.approvers.join('|')]);
  const csv = toCSV([hdr, ...body]);

  $('#csvModalLabel').textContent = `CSV Preview — promotion_controls_${ts()}.csv`;
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
