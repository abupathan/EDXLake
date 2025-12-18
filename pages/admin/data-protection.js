// EDX — Data Protection (production-grade)
// Features: CRUD (retention/backups), pagination, search/filter, CSV export, test restore,
// modal fallback, localStorage persistence (demo), reset to source.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'data-protection.json';
const LS_KEY = 'edx_data_protection_v1';

const ui = {
  // pagination state
  rPage: 1, rSize: 10,
  bPage: 1, bSize: 10,
  // filters
  q: '',
  zoneFilter: 'All',
  encFilter: 'All'
};

let model = { meta: {}, retention: [], backups: [] };
let editing = { type: null, index: -1 }; // {type:'retention'|'backup', index}

init().catch(console.error);

/* ---------- Bootstrap-first modal with safe fallback ---------- */
function hasBS(){ return !!(window.bootstrap && typeof window.bootstrap.Modal === 'function'); }
function ensureInBody(el){ if(el?.parentElement !== document.body) document.body.appendChild(el); return el; }
function openModal(id){
  const el = ensureInBody($(id));
  if (hasBS()){
    const prev = window.bootstrap.Modal.getInstance(el); if(prev) prev.dispose?.();
    const inst = new window.bootstrap.Modal(el, {backdrop:true,keyboard:true,focus:true});
    el._inst = inst; inst.show();
  } else {
    // fallback
    el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true');
    el.classList.add('show'); el.style.display='block';
    document.body.classList.add('modal-open');
    const bd = document.createElement('div'); bd.className='modal-backdrop fade show'; bd.dataset.f='1';
    document.body.appendChild(bd);
    el.querySelectorAll('[data-bs-dismiss="modal"],.btn-close').forEach(b=>{
      b._h = ()=>closeModal(id); b.addEventListener('click', b._h);
    });
  }
}
function closeModal(id){
  const el = $(id);
  if (hasBS()){
    const inst = window.bootstrap.Modal.getInstance(el) || el._inst; inst?.hide?.();
  } else {
    el?.classList.remove('show'); if(el) el.style.display='none';
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.modal-backdrop[data-f="1"]').forEach(n=>n.remove());
    el?.querySelectorAll('[data-bs-dismiss="modal"],.btn-close').forEach(b=>{
      if(b._h){ b.removeEventListener('click', b._h); delete b._h; }
    });
  }
}

/* --------------------- Data loading & saving ------------------ */
async function init(){
  // prefer saved
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
    // normalize
    d.retention = (d.retention||[]).map(r=>({
      zone:String(r.zone||''),
      time_travel:String(r.time_travel||''),
      retention:String(r.retention||''),
      notes:String(r.notes||'')
    }));
    d.backups = (d.backups||[]).map(b=>({
      name:String(b.name||''),
      schedule:String(b.schedule||''),
      last_restore_test:String(b.last_restore_test||''),
      encryption:String(b.encryption||'AES-256'),
      geo:String(b.geo||'Yes'),
      retention:String(b.retention||''),
      notes:String(b.notes||'')
    }));
    return d;
  } catch {
    return { meta:{}, retention:[], backups:[] };
  }
}

function saveLocal(){
  localStorage.setItem(LS_KEY, JSON.stringify(model));
  alert('Saved (demo): Data persisted in your browser.');
}
function resetLocal(){
  localStorage.removeItem(LS_KEY);
  init();
}

/* --------------------- Rendering ------------------------------ */
function render(){
  const zones = ['All', ...Array.from(new Set(model.retention.map(r=>r.zone))).sort()];
  const encs  = ['All', ...Array.from(new Set(model.backups.map(b=>b.encryption||'AES-256'))).sort()];

  const filteredRet = model.retention.filter(r=>{
    const hay = `${r.zone} ${r.time_travel} ${r.retention} ${r.notes}`.toLowerCase();
    const okQ = !ui.q || hay.includes(ui.q);
    const okZ = ui.zoneFilter==='All' || r.zone===ui.zoneFilter;
    return okQ && okZ;
  });
  const filteredBak = model.backups.filter(b=>{
    const hay = `${b.name} ${b.schedule} ${b.last_restore_test} ${b.encryption} ${b.geo} ${b.retention} ${b.notes}`.toLowerCase();
    const okQ = !ui.q || hay.includes(ui.q);
    const okE = ui.encFilter==='All' || (b.encryption||'AES-256')===ui.encFilter;
    return okQ && okE;
  });

  // paginate
  const rTotal = filteredRet.length, rPages = Math.max(1, Math.ceil(rTotal/ui.rSize));
  ui.rPage = Math.min(Math.max(1, ui.rPage), rPages);
  const rStart=(ui.rPage-1)*ui.rSize, rRows = filteredRet.slice(rStart, rStart+ui.rSize);

  const bTotal = filteredBak.length, bPages = Math.max(1, Math.ceil(bTotal/ui.bSize));
  ui.bPage = Math.min(Math.max(1, ui.bPage), bPages);
  const bStart=(ui.bPage-1)*ui.bSize, bRows = filteredBak.slice(bStart, bStart+ui.bSize);

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Data Protection</h1>
        <span class="kpi"><span class="dot"></span> Zones: ${model.retention.length}</span>
        <span class="kpi"><span class="dot"></span> Backup Sets: ${model.backups.length}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="input-group input-group-sm search-wrap">
          <span class="input-group-text">Search</span>
          <input id="q" class="form-control" placeholder="zone, duration, schedule, notes…" value="${escAttr(ui.q)}">
        </div>
        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text">Zone</label>
          <select id="fZone" class="form-select form-select-sm">
            ${zones.map(z=>`<option ${z===ui.zoneFilter?'selected':''}>${z}</option>`).join('')}
          </select>
        </div>
        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text">Encryption</label>
          <select id="fEnc" class="form-select form-select-sm">
            ${encs.map(e=>`<option ${e===ui.encFilter?'selected':''}>${e}</option>`).join('')}
          </select>
        </div>
        <div class="btn-group btn-group-sm">
          <button id="btnExport" class="btn btn-outline-secondary">Export CSV</button>
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <!-- Retention -->
      <div class="col-12 col-xxl-6">
        <div class="card card-elevated h-100">
          <div class="card-header bg-body d-flex align-items-center justify-content-between">
            <strong>Retention & Time Travel</strong>
            <div class="d-flex align-items-center gap-2">
              <div class="input-group input-group-sm" style="width: auto;">
                <label class="input-group-text" for="rSize">Rows/page</label>
                <select id="rSize" class="form-select form-select-sm">
                  ${[10,25,50].map(n=>`<option value="${n}" ${n===ui.rSize?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
              <button id="btnNewRetention" class="btn btn-primary btn-sm">New</button>
            </div>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table align-middle mb-0">
                <thead class="table-light">
                  <tr><th style="width:18%">Zone</th><th style="width:20%">Time Travel</th><th style="width:20%">Retention</th><th>Notes</th><th class="text-end" style="width:120px">Actions</th></tr>
                </thead>
                <tbody>
                  ${rRows.map((r,i)=>`
                    <tr>
                      <td class="fw-semibold">${esc(r.zone)}</td>
                      <td>${esc(r.time_travel)}</td>
                      <td>${esc(r.retention)}</td>
                      <td class="small">${esc(r.notes)}</td>
                      <td class="text-end tbl-tools">
                        <div class="btn-group btn-group-sm">
                          <button class="btn btn-outline-secondary" data-act="edit-ret" data-idx="${rStart+i}" type="button">Edit</button>
                          <button class="btn btn-outline-danger" data-act="del-ret" data-idx="${rStart+i}" type="button">Delete</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                  ${rRows.length? '' : `<tr><td colspan="5" class="text-center text-body-secondary py-4">No rows</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
          <div class="card-footer d-flex align-items-center justify-content-between">
            <span class="help-hint">Lowering retention requires governance approval. Keep evidence in Audit Logs.</span>
            <nav>
              <ul class="pagination pagination-sm mb-0">${pages(ui.rPage, rPages, 'r')}</ul>
            </nav>
          </div>
        </div>
      </div>

      <!-- Backups -->
      <div class="col-12 col-xxl-6">
        <div class="card card-elevated h-100">
          <div class="card-header bg-body d-flex align-items-center justify-content-between">
            <strong>Backups</strong>
            <div class="d-flex align-items-center gap-2">
              <div class="input-group input-group-sm" style="width: auto;">
                <label class="input-group-text" for="bSize">Rows/page</label>
                <select id="bSize" class="form-select form-select-sm">
                  ${[10,25,50].map(n=>`<option value="${n}" ${n===ui.bSize?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
              <button id="btnNewBackup" class="btn btn-primary btn-sm">New</button>
            </div>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table align-middle mb-0">
                <thead class="table-light">
                  <tr><th style="width:20%">Name</th><th style="width:18%">Schedule</th><th style="width:18%">Last Restore Test</th><th style="width:14%">Encryption</th><th style="width:10%">Geo</th><th>Notes</th><th class="text-end" style="width:180px">Actions</th></tr>
                </thead>
                <tbody>
                  ${bRows.map((b,i)=>`
                    <tr>
                      <td class="fw-semibold">${esc(b.name)}</td>
                      <td>${esc(b.schedule)}</td>
                      <td class="small">${esc(b.last_restore_test)}</td>
                      <td>${esc(b.encryption||'AES-256')}</td>
                      <td>${esc(b.geo||'Yes')}</td>
                      <td class="small">${esc(b.notes)}</td>
                      <td class="text-end tbl-tools">
                        <div class="btn-group btn-group-sm">
                          <button class="btn btn-outline-secondary" data-act="edit-bak" data-idx="${bStart+i}" type="button">Edit</button>
                          <button class="btn btn-outline-danger" data-act="del-bak" data-idx="${bStart+i}" type="button">Delete</button>
                          <button class="btn btn-outline-primary" data-act="test-restore" data-idx="${bStart+i}" type="button">Run Test Restore</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                  ${bRows.length? '' : `<tr><td colspan="7" class="text-center text-body-secondary py-4">No rows</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
          <div class="card-footer d-flex align-items-center justify-content-between">
            <span class="help-hint">Restore tests should execute at least monthly; results appear in Audit Logs.</span>
            <nav>
              <ul class="pagination pagination-sm mb-0">${pages(ui.bPage, bPages, 'b')}</ul>
            </nav>
          </div>
        </div>
      </div>
    </div>
  `;

  // global controls
  $('#q').addEventListener('input', e=>{ ui.q = e.target.value.trim().toLowerCase(); ui.rPage=1; ui.bPage=1; render(); });
  $('#fZone').addEventListener('change', e=>{ ui.zoneFilter = e.target.value; ui.rPage=1; render(); });
  $('#fEnc').addEventListener('change', e=>{ ui.encFilter = e.target.value; ui.bPage=1; render(); });
  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnReset').addEventListener('click', resetLocal);
  $('#btnExport').addEventListener('click', () => exportCSV(filteredRet, filteredBak));

  // per-table
  $('#rSize').addEventListener('change', e=>{ ui.rSize = Number(e.target.value)||10; ui.rPage=1; render(); });
  $('#bSize').addEventListener('change', e=>{ ui.bSize = Number(e.target.value)||10; ui.bPage=1; render(); });
  $('#btnNewRetention').addEventListener('click', ()=> openRetentionEditor(null));
  $('#btnNewBackup').addEventListener('click', ()=> openBackupEditor(null));

  // pagination buttons
  main.querySelectorAll('[data-pager]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const kind = btn.getAttribute('data-kind');
      const page = Number(btn.getAttribute('data-pager'));
      if (kind==='r'){ ui.rPage = page; render(); }
      else { ui.bPage = page; render(); }
    });
  });

  // table actions (delegated)
  main.addEventListener('click', (e)=>{
    const a = e.target.closest('[data-act]'); if(!a) return;
    const act = a.getAttribute('data-act');
    const idx = Number(a.getAttribute('data-idx'));
    if (act==='edit-ret') openRetentionEditor(idx);
    if (act==='del-ret') delRetention(idx);
    if (act==='edit-bak') openBackupEditor(idx);
    if (act==='del-bak') delBackup(idx);
    if (act==='test-restore') runTestRestore(idx);
  });
}

/* -------------------- Pagination helper ---------------------- */
function pages(page,total,kind){
  const out=[];
  const add=(n,l=n,dis=false,act=true)=>out.push(`<li class="page-item ${n===page?'active':''} ${dis?'disabled':''}">
    <button class="page-link" ${act?`data-kind="${kind}" data-pager="${n}"`:''} type="button">${l}</button></li>`);
  add(Math.max(1,page-1),'«',page===1,false);
  if(total<=7){ for(let i=1;i<=total;i++) add(i); }
  else{
    add(1);
    if(page>3) out.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
    for(let i=Math.max(2,page-1); i<=Math.min(total-1,page+1); i++) add(i);
    if(page<total-2) out.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
    add(total);
  }
  add(Math.min(total,page+1),'»',page===total,false);
  return out.join('');
}

/* -------------------- Retention CRUD ------------------------- */
function openRetentionEditor(index){
  editing = { type:'retention', index: index ?? -1 };
  const r = index!=null && index>=0 ? model.retention[index] : { zone:'', time_travel:'', retention:'', notes:'' };
  $('#retentionModalLabel').textContent = (index!=null && index>=0) ? `Edit Retention — ${r.zone}` : 'New Retention Policy';
  $('#rZone').value = r.zone || '';
  $('#rTimeTravel').value = r.time_travel || '';
  $('#rRetention').value = r.retention || '';
  $('#rNotes').value = r.notes || '';
  // clear validity
  ['rZone','rTimeTravel','rRetention'].forEach(id=>{ $('#'+id).classList.remove('is-invalid'); });
  // wire save
  $('#btnSaveRetention').onclick = saveRetentionFromModal;
  openModal('#retentionModal');
}
function saveRetentionFromModal(){
  const zone = $('#rZone').value.trim();
  const tt = $('#rTimeTravel').value.trim();
  const ret = $('#rRetention').value.trim();
  const notes = $('#rNotes').value.trim();
  let ok = true;
  if(!zone){ $('#rZone').classList.add('is-invalid'); ok=false; } else $('#rZone').classList.remove('is-invalid');
  if(!tt){ $('#rTimeTravel').classList.add('is-invalid'); ok=false; } else $('#rTimeTravel').classList.remove('is-invalid');
  if(!ret){ $('#rRetention').classList.add('is-invalid'); ok=false; } else $('#rRetention').classList.remove('is-invalid');
  if(!ok) return;
  const row = { zone, time_travel:tt, retention:ret, notes };
  if (editing.index>=0) model.retention[editing.index] = row;
  else model.retention.push(row);
  closeModal('#retentionModal');
  render();
}
function delRetention(index){
  const r = model.retention[index];
  if (!r) return;
  if (confirm(`Delete retention for zone "${r.zone}"?`)){
    model.retention.splice(index,1);
    render();
  }
}

/* -------------------- Backups CRUD --------------------------- */
function openBackupEditor(index){
  editing = { type:'backup', index: index ?? -1 };
  const b = index!=null && index>=0 ? model.backups[index] :
    { name:'', schedule:'', last_restore_test:'', encryption:'AES-256', geo:'Yes', retention:'', notes:'' };
  $('#backupModalLabel').textContent = (index!=null && index>=0) ? `Edit Backup — ${b.name}` : 'New Backup Policy';
  $('#bName').value = b.name || '';
  $('#bSchedule').value = b.schedule || '';
  $('#bEncryption').value = b.encryption || 'AES-256';
  $('#bGeo').value = b.geo || 'Yes';
  $('#bRetention').value = b.retention || '';
  $('#bNotes').value = b.notes || '';
  ['bName','bSchedule'].forEach(id=>$('#'+id).classList.remove('is-invalid'));
  $('#btnSaveBackup').onclick = saveBackupFromModal;
  openModal('#backupModal');
}
function saveBackupFromModal(){
  const name = $('#bName').value.trim();
  const schedule = $('#bSchedule').value.trim();
  const encryption = $('#bEncryption').value;
  const geo = $('#bGeo').value;
  const retention = $('#bRetention').value.trim();
  const notes = $('#bNotes').value.trim();
  let ok = true;
  if(!name){ $('#bName').classList.add('is-invalid'); ok=false; } else $('#bName').classList.remove('is-invalid');
  if(!schedule){ $('#bSchedule').classList.add('is-invalid'); ok=false; } else $('#bSchedule').classList.remove('is-invalid');
  if(!ok) return;
  const row = { name, schedule, last_restore_test: (editing.index>=0? model.backups[editing.index].last_restore_test : ''), encryption, geo, retention, notes };
  if (editing.index>=0) model.backups[editing.index] = row;
  else model.backups.push(row);
  closeModal('#backupModal');
  render();
}
function delBackup(index){
  const b = model.backups[index];
  if (!b) return;
  if (confirm(`Delete backup policy "${b.name}"?`)){
    model.backups.splice(index,1);
    render();
  }
}

/* -------------------- Actions ------------------------------- */
function runTestRestore(index){
  const b = model.backups[index]; if(!b) return;
  // Simulate a restore test
  const ts = new Date().toISOString().replace('T',' ').replace('Z','Z');
  alert(`Triggering restore test for "${b.name}"...\nThis is a demo-only operation.`);
  b.last_restore_test = ts;
  render();
}

function exportCSV(retRows, bakRows){
  const retHdr = ['Zone','Time Travel','Retention','Notes'];
  const retBody = retRows.map(r=>[r.zone, r.time_travel, r.retention, r.notes]);
  const bakHdr = ['Name','Schedule','Last Restore Test','Encryption','Geo','Retention','Notes'];
  const bakBody = bakRows.map(b=>[b.name,b.schedule,b.last_restore_test,b.encryption||'AES-256',b.geo||'Yes',b.retention,b.notes]);
  const csv = toCSV([['Retention'], retHdr, ...retBody, [], ['Backups'], bakHdr, ...bakBody]);
  // preview modal
  $('#csvModalLabel').textContent = `CSV Preview — data_protection_${ts()}.csv`;
  $('#csvPreview').textContent = csv;
  $('#btnCopyCsv').onclick = async ()=>{ try{ await navigator.clipboard.writeText(csv); alert('Copied!'); } catch{ alert('Copy failed'); } };
  openModal('#csvModal');
}

/* -------------------- Utils -------------------------------- */
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function toCSV(rows){ const BOM='\uFEFF'; return BOM + rows.map(r=>r.map(c=>csvCell(c)).join(',')).join('\r\n'); }
function csvCell(v){ const s=String(v??''); return /[",\r\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
