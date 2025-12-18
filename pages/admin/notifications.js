// EDX — Notifications & Webhooks (production-grade)
// Features: search/sort/pagination for Channels & Webhooks, Add/Edit/Delete modals with
// validation, CSV preview/copy, simulated "Test delivery", localStorage persistence,
// Bootstrap-first modal handling with safe fallback, no top-level await.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'notifications.json';
const LS_KEY  = 'edx_notifications_webhooks_v1';

const ALL_EVENTS = [
  'PipelineFailure','ValidationError','DriftDetected','Quarantined',
  'PromotionRequested','PromotionApproved','PromotionRejected',
  'PolicyChange','ShareCreated','ShareRevoked','ExportReady',
  'AnomalousAccess','BillingThreshold','BackupFailed'
];

let model = { meta:{}, channels:[], webhooks:[] };
const ui = {
  ch: { q:'', sortKey:'address', sortDir:'asc', page:1, size:10 },
  wh: { q:'', sortKey:'url',     sortDir:'asc', page:1, size:10 }
};

let editCtx = { kind:'ch', index:-1 }; // 'ch' or 'wh'

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
    model = { meta:{}, channels:[], webhooks:[] };
  }
  render();
}
function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify(model)); alert('Saved (demo): settings stored in your browser.'); }
function resetLocal(){ localStorage.removeItem(LS_KEY); init(); }

/* --------------------- Validators ----------------------------- */
const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
function isEmail(v){ return reEmail.test(v); }
function isHttpsUrl(v){
  try { const u = new URL(v); return u.protocol==='https:'; } catch { return false; }
}
function hasEvents(arr){ return Array.isArray(arr) && arr.length>0; }
function nonEmpty(s, n=6){ return typeof s==='string' && s.trim().length>=n; }

/* --------------------- Rendering ------------------------------ */
function render(){
  // derive rows
  const chRows = model.channels.map((c,i)=>({ ...c, index:i, events: c.events||[], notes:c.notes||'' }));
  const whRows = model.webhooks.map((w,i)=>({ ...w, index:i, events: w.events||[], notes:w.notes||'' }));

  // filter/sort/paginate (channels)
  const ch = listOps(chRows, ui.ch, r => `${r.address} ${r.events.join(' ')} ${r.notes}`);
  // filter/sort/paginate (webhooks)
  const wh = listOps(whRows, ui.wh, r => `${r.url} ${r.events.join(' ')} ${r.secret} ${r.notes}`);

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Notifications & Webhooks</h1>
        <span class="kpi"><span class="dot"></span> Channels: ${model.channels.length}</span>
        <span class="kpi"><span class="dot"></span> Webhooks: ${model.webhooks.length}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="btn-group btn-group-sm">
          <button id="btnExportCh" class="btn btn-outline-secondary">Export Channels CSV</button>
          <button id="btnExportWh" class="btn btn-outline-secondary">Export Webhooks CSV</button>
        </div>
        <div class="btn-group btn-group-sm">
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <!-- CHANNELS -->
      <div class="col-12 col-xl-6">
        <div class="card card-elevated h-100">
          <div class="card-header bg-body d-flex align-items-center justify-content-between">
            <strong>Email Channels</strong>
            <button id="btnNewChannel" class="btn btn-primary btn-sm">Add</button>
          </div>
          <div class="card-body">
            <div class="d-flex flex-wrap gap-2 mb-2">
              <div class="input-group input-group-sm search-wrap">
                <span class="input-group-text">Search</span>
                <input id="qCh" class="form-control" placeholder="email, event, note…" value="${escAttr(ui.ch.q)}">
              </div>
              <div class="btn-group btn-group-sm" role="group">
                <button id="sortCh" class="btn btn-outline-secondary">Sort ${ui.ch.sortKey==='address' ? (ui.ch.sortDir==='asc'?'▲':'▼') : ''}</button>
              </div>
              <div class="input-group input-group-sm" style="width:auto;">
                <label class="input-group-text">Rows/page</label>
                <select id="sizeCh" class="form-select form-select-sm">
                  ${[10,25,50,100].map(n=>`<option value="${n}" ${n===ui.ch.size?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="table-responsive">
              <table class="table align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Email</th>
                    <th>Events</th>
                    <th>Notes</th>
                    <th class="text-end" style="width:140px">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${ch.pageRows.map(r=>rowCh(r)).join('')}
                  ${ch.pageRows.length? '' : `<tr><td colspan="4" class="text-center text-body-secondary py-4">No channels</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
          <div class="card-footer d-flex align-items-center justify-content-between">
            <small class="text-body-secondary">Use channels for human-read notifications (ops, security, governance).</small>
            <nav><ul class="pagination pagination-sm mb-0">${pagesHtml(ui.ch.page, ch.pages, 'ch')}</ul></nav>
          </div>
        </div>
      </div>

      <!-- WEBHOOKS -->
      <div class="col-12 col-xl-6">
        <div class="card card-elevated h-100">
          <div class="card-header bg-body d-flex align-items-center justify-content-between">
            <strong>Webhooks</strong>
            <button id="btnNewWebhook" class="btn btn-outline-primary btn-sm">New</button>
          </div>
          <div class="card-body">
            <div class="d-flex flex-wrap gap-2 mb-2">
              <div class="input-group input-group-sm search-wrap">
                <span class="input-group-text">Search</span>
                <input id="qWh" class="form-control" placeholder="url, event, secret, note…" value="${escAttr(ui.wh.q)}">
              </div>
              <div class="btn-group btn-group-sm" role="group">
                <button id="sortWh" class="btn btn-outline-secondary">Sort ${ui.wh.sortKey==='url' ? (ui.wh.sortDir==='asc'?'▲':'▼') : ''}</button>
              </div>
              <div class="input-group input-group-sm" style="width:auto;">
                <label class="input-group-text">Rows/page</label>
                <select id="sizeWh" class="form-select form-select-sm">
                  ${[10,25,50,100].map(n=>`<option value="${n}" ${n===ui.wh.size?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="table-responsive">
              <table class="table align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th style="min-width:260px">Endpoint</th>
                    <th>Events</th>
                    <th>Secret</th>
                    <th>Notes</th>
                    <th class="text-end" style="width:180px">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${wh.pageRows.map(r=>rowWh(r)).join('')}
                  ${wh.pageRows.length? '' : `<tr><td colspan="5" class="text-center text-body-secondary py-4">No webhooks</td></tr>`}
                </tbody>
              </table>
            </div>

            <div id="testResult" class="small text-body-secondary mt-2"></div>
          </div>
          <div class="card-footer d-flex align-items-center justify-content-between">
            <small class="text-body-secondary">Webhooks deliver machine-readable events to partner systems.</small>
            <nav><ul class="pagination pagination-sm mb-0">${pagesHtml(ui.wh.page, wh.pages, 'wh')}</ul></nav>
          </div>
        </div>
      </div>
    </div>
  `;

  // Global buttons
  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnReset').addEventListener('click', resetLocal);
  $('#btnExportCh').addEventListener('click', ()=> previewCsv('channels', chRowsForCsv(chRows)));
  $('#btnExportWh').addEventListener('click', ()=> previewCsv('webhooks', whRowsForCsv(whRows)));

  // Channels wiring
  $('#btnNewChannel').addEventListener('click', ()=> openChannelEditor(null));
  $('#qCh').addEventListener('input', e=>{ ui.ch.q=e.target.value; ui.ch.page=1; render(); });
  $('#sortCh').addEventListener('click', ()=> toggleSort(ui.ch));
  $('#sizeCh').addEventListener('change', e=>{ ui.ch.size=Number(e.target.value)||10; ui.ch.page=1; render(); });
  main.addEventListener('click', onChannelAction);
  main.querySelectorAll('.pagination .page-link[data-page][data-scope="ch"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.ch.page = Number(btn.getAttribute('data-page')); render(); });
  });

  // Webhooks wiring
  $('#btnNewWebhook').addEventListener('click', ()=> openWebhookEditor(null));
  $('#qWh').addEventListener('input', e=>{ ui.wh.q=e.target.value; ui.wh.page=1; render(); });
  $('#sortWh').addEventListener('click', ()=> toggleSort(ui.wh));
  $('#sizeWh').addEventListener('change', e=>{ ui.wh.size=Number(e.target.value)||10; ui.wh.page=1; render(); });
  main.addEventListener('click', onWebhookAction);
  main.querySelectorAll('.pagination .page-link[data-page][data-scope="wh"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.wh.page = Number(btn.getAttribute('data-page')); render(); });
  });
}

/* --------------------- List helpers -------------------------- */
function listOps(rows, s, haystack){
  const q = s.q.trim().toLowerCase();
  rows = rows.filter(r => !q || haystack(r).toLowerCase().includes(q));
  rows.sort((a,b)=>{
    const dir = s.sortDir==='asc'?1:-1;
    const va = String(a[s.sortKey]||'').toLowerCase();
    const vb = String(b[s.sortKey]||'').toLowerCase();
    return (va<vb?-1:va>vb?1:0) * dir;
  });
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/s.size));
  s.page = Math.min(Math.max(1, s.page), pages);
  const start = (s.page-1)*s.size;
  const pageRows = rows.slice(start, start+s.size);
  return { total, pages, start, pageRows };
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
function rowCh(r){
  return `
    <tr>
      <td class="fw-semibold">${esc(r.address)}</td>
      <td class="small text-nowrap">${esc(r.events.join(', '))}</td>
      <td class="small">${esc(r.notes||'')}</td>
      <td class="text-end tbl-tools">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-act="editCh" data-idx="${r.index}" type="button">Edit</button>
          <button class="btn btn-outline-danger" data-act="delCh" data-idx="${r.index}" type="button">Remove</button>
        </div>
      </td>
    </tr>`;
}
function rowWh(r){
  return `
    <tr>
      <td class="text-truncate" style="max-width:260px">${esc(r.url)}</td>
      <td class="small text-nowrap">${esc(r.events.join(', '))}</td>
      <td><code>${esc(String(r.secret).slice(0,6))}••••</code></td>
      <td class="small">${esc(r.notes||'')}</td>
      <td class="text-end tbl-tools">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-act="testWh" data-idx="${r.index}" type="button">Test</button>
          <button class="btn btn-outline-secondary" data-act="editWh" data-idx="${r.index}" type="button">Edit</button>
          <button class="btn btn-outline-danger" data-act="delWh" data-idx="${r.index}" type="button">Delete</button>
        </div>
      </td>
    </tr>`;
}

/* --------------------- Channels CRUD ------------------------- */
function onChannelAction(e){
  const btn=e.target.closest('button[data-act^="editCh"],button[data-act^="delCh"]'); if(!btn) return;
  const idx=Number(btn.getAttribute('data-idx'));
  const act=btn.getAttribute('data-act');
  if (act==='editCh') openChannelEditor(idx);
  if (act==='delCh')  delChannel(idx);
}
function populateEventOptions(sel, current=[]){
  sel.innerHTML = ALL_EVENTS.map(ev => `<option value="${ev}" ${current.includes(ev)?'selected':''}>${ev}</option>`).join('');
}
function openChannelEditor(index){
  editCtx = { kind:'ch', index:(index ?? -1) };
  const row = index!=null && index>=0 ? model.channels[index] : { address:'', events:[], notes:'' };

  $('#channelModalLabel').textContent = index!=null && index>=0 ? `Edit Channel — ${row.address}` : 'New Email Channel';
  $('#cAddress').value = row.address || '';
  populateEventOptions($('#cEvents'), row.events || []);
  $('#cNotes').value = row.notes || '';
  ['cAddress','cEvents'].forEach(id=>$('#'+id).classList.remove('is-invalid'));
  $('#btnSaveChannel').onclick = saveChannelFromModal;
  openModal('#channelModal');
}
function saveChannelFromModal(){
  const address = $('#cAddress').value.trim();
  const events = Array.from($('#cEvents').selectedOptions).map(o=>o.value);
  const notes   = $('#cNotes').value.trim();

  let ok = true;
  if(!isEmail(address)){ $('#cAddress').classList.add('is-invalid'); ok=false; } else $('#cAddress').classList.remove('is-invalid');
  if(!hasEvents(events)){ $('#cEvents').classList.add('is-invalid'); ok=false; } else $('#cEvents').classList.remove('is-invalid');
  if(!ok) return;

  const newRow = { address, events, notes };
  if (editCtx.index>=0) model.channels[editCtx.index] = newRow;
  else {
    if (model.channels.some(c=>c.address.toLowerCase()===address.toLowerCase())) { alert('Duplicate email channel.'); return; }
    model.channels.push(newRow);
  }
  closeModal('#channelModal');
  render();
}
function delChannel(index){
  const row = model.channels[index]; if(!row) return;
  if (confirm(`Remove channel "${row.address}"?`)){ model.channels.splice(index,1); render(); }
}

/* --------------------- Webhooks CRUD + Test ------------------ */
function onWebhookAction(e){
  const btn=e.target.closest('button[data-act^="editWh"],button[data-act^="delWh"],button[data-act^="testWh"]'); if(!btn) return;
  const idx=Number(btn.getAttribute('data-idx'));
  const act=btn.getAttribute('data-act');
  if (act==='editWh') return openWebhookEditor(idx);
  if (act==='delWh')  return delWebhook(idx);
  if (act==='testWh') return testWebhook(idx);
}
function openWebhookEditor(index){
  editCtx = { kind:'wh', index:(index ?? -1) };
  const row = index!=null && index>=0 ? model.webhooks[index] : { url:'', events:[], secret:'', notes:'' };

  $('#webhookModalLabel').textContent = index!=null && index>=0 ? `Edit Webhook — ${row.url}` : 'New Webhook';
  $('#wUrl').value = row.url || '';
  populateEventOptions($('#wEvents'), row.events || []);
  $('#wSecret').value = row.secret || '';
  $('#wNotes').value = row.notes || '';
  ['wUrl','wEvents','wSecret'].forEach(id=>$('#'+id).classList.remove('is-invalid'));
  $('#btnSaveWebhook').onclick = saveWebhookFromModal;
  openModal('#webhookModal');
}
function saveWebhookFromModal(){
  const url = $('#wUrl').value.trim();
  const events = Array.from($('#wEvents').selectedOptions).map(o=>o.value);
  const secret = $('#wSecret').value.trim();
  const notes  = $('#wNotes').value.trim();

  let ok = true;
  if(!isHttpsUrl(url)){ $('#wUrl').classList.add('is-invalid'); ok=false; } else $('#wUrl').classList.remove('is-invalid');
  if(!hasEvents(events)){ $('#wEvents').classList.add('is-invalid'); ok=false; } else $('#wEvents').classList.remove('is-invalid');
  if(!nonEmpty(secret,6)){ $('#wSecret').classList.add('is-invalid'); ok=false; } else $('#wSecret').classList.remove('is-invalid');
  if(!ok) return;

  const newRow = { url, events, secret, notes };
  if (editCtx.index>=0) model.webhooks[editCtx.index] = newRow;
  else {
    if (model.webhooks.some(w=>w.url.toLowerCase()===url.toLowerCase())) { alert('Duplicate webhook URL.'); return; }
    model.webhooks.push(newRow);
  }
  closeModal('#webhookModal');
  render();
}
function delWebhook(index){
  const row = model.webhooks[index]; if(!row) return;
  if (confirm(`Delete webhook "${row.url}"?`)){ model.webhooks.splice(index,1); render(); }
}
async function testWebhook(index){
  const row = model.webhooks[index]; if(!row) return;
  const result = $('#testResult');
  result.textContent = `Testing ${row.url}…`;
  // Simulate latency + random 200/401/500 for demo
  await new Promise(r=>setTimeout(r, 700 + Math.random()*600));
  const outcomes = [
    { code:200, msg:'OK — event delivered' },
    { code:401, msg:'Unauthorized — check signing secret' },
    { code:500, msg:'Server error — partner endpoint failed' }
  ];
  const pick = outcomes[Math.random()<0.7 ? 0 : (Math.random()<0.5?1:2)];
  result.textContent = `Test result: ${pick.code} ${pick.msg}`;
  // Auto-clear after a bit
  setTimeout(()=>{ if (result.textContent.startsWith('Test result:')) result.textContent=''; }, 4000);
}

/* --------------------- CSV Preview --------------------------- */
function chRowsForCsv(rows){
  const hdr = ['Email','Events','Notes'];
  return [hdr, ...rows.map(r => [r.address, (r.events||[]).join('|'), r.notes||''])];
}
function whRowsForCsv(rows){
  const hdr = ['URL','Events','Secret (prefix)','Notes'];
  return [hdr, ...rows.map(r => [r.url, (r.events||[]).join('|'), String(r.secret||'').slice(0,6), r.notes||''])];
}
function previewCsv(kind, rows){
  const csv = toCSV(rows);
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
