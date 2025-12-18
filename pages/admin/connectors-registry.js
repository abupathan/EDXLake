// EDX — Connectors Registry
// Fix: Ensure modals are appended to <body> before opening (solves stacking/overflow issues).
// Also keeps Bootstrap-first + fallback modal logic.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');
const jsonUrl = 'connectors-registry.json';
const LS_KEY = 'edx_connectors_registry_v2';

const state = {
  rows: [],
  page: 1,
  pageSize: 10,
  isLoading: false,
  q: '',
  typeFilter: 'All',
  statusFilter: 'All',
  ownerFilter: 'All',
  sortKey: 'name',
  sortDir: 'asc',

  // wizard
  editingId: null,
  editingIndex: -1,
  scratch: null
};

init().catch(console.error);

/* ===== Modal helpers (Bootstrap-first, hardened fallback) ===== */

function _isBootstrapAvailable() {
  return !!(window.bootstrap && typeof window.bootstrap.Modal === 'function');
}

// NEW: make sure modal lives directly under <body> to avoid transform/overflow/z-index traps.
function ensureModalInBody(el) {
  if (!el) return el;
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
  return el;
}

function showModal(el) {
  if (!el) return;
  ensureModalInBody(el);

  if (_isBootstrapAvailable()) {
    // Dispose any prior instance (if markup was moved)
    const prev = window.bootstrap.Modal.getInstance(el);
    if (prev) prev.dispose?.();
    const inst = new window.bootstrap.Modal(el, { backdrop: true, keyboard: true, focus: true });
    el._modalInstance = inst;
    inst.show();
  } else {
    // Fallback: minimal accessible modal
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.removeAttribute('aria-hidden');
    el.classList.add('show');
    el.style.display = 'block';
    document.body.classList.add('modal-open');

    // Backdrop
    let bd = document.createElement('div');
    bd.className = 'modal-backdrop fade show';
    bd.dataset.fallback = '1';
    document.body.appendChild(bd);

    // Close buttons fallback
    el.querySelectorAll('[data-bs-dismiss="modal"], .btn-close').forEach(btn=>{
      btn._fallbackHandler = () => hideModal(el);
      btn.addEventListener('click', btn._fallbackHandler);
    });

    // ESC key
    el._escHandler = (ev)=>{ if(ev.key==='Escape') hideModal(el); };
    document.addEventListener('keydown', el._escHandler);
  }
}

function hideModal(el) {
  if (!el) return;
  if (_isBootstrapAvailable()) {
    const inst = window.bootstrap.Modal.getInstance(el) || el._modalInstance;
    if (inst) inst.hide();
  } else {
    el.setAttribute('aria-hidden', 'true');
    el.classList.remove('show');
    el.style.display = 'none';
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.modal-backdrop[data-fallback="1"]').forEach(b=>b.remove());
    el.querySelectorAll('[data-bs-dismiss="modal"], .btn-close').forEach(btn=>{
      if (btn._fallbackHandler) {
        btn.removeEventListener('click', btn._fallbackHandler);
        delete btn._fallbackHandler;
      }
    });
    if (el._escHandler) {
      document.removeEventListener('keydown', el._escHandler);
      delete el._escHandler;
    }
  }
}

/* ===== Init / Load ===== */

async function init(){
  await loadFromLocalOrSource();
  render();
}

async function loadFromLocalOrSource(bust=false){
  state.isLoading = true; renderStatus();
  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached && !bust) {
      const parsed = JSON.parse(cached);
      state.rows = Array.isArray(parsed.rows) ? parsed.rows.map(normalize) : [];
    } else {
      const url = bust ? `${jsonUrl}?t=${Date.now()}` : jsonUrl;
      const d = await fetch(url, { cache:'no-store' }).then(r=>r.json()).catch(()=>({connectors:[]}));
      state.rows = Array.isArray(d.connectors) ? d.connectors.map(normalize) : [];
    }
  } finally { state.isLoading = false; render(); }
}

function normalize(c){
  return {
    id: String(c.id || genId()),
    name: String(c.name||''),
    type: String(c.type||''),
    status: String(c.status||'Inactive'),
    owner: String(c.owner||''),
    desc: String(c.desc||''),
    config: c.config && typeof c.config==='object' ? c.config : {},
    secretsConfigured: !!c.secretsConfigured,
    schedule: c.schedule && typeof c.schedule==='object' ? c.schedule : { frequency:'Manual', window:'', labels:[] }
  };
}

function genId(){ return 'c_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36); }
function getIndexById(id){ return state.rows.findIndex(r => r.id === id); }

/* ===== Lists & Filters ===== */

function ownersList(){ const set=new Set(state.rows.map(r=>r.owner).filter(Boolean)); return ['All', ...Array.from(set).sort()]; }
function typesList(){ const set=new Set(state.rows.map(r=>r.type).filter(Boolean)); return ['All', ...Array.from(set).sort()]; }

function getFilteredSorted(){
  const q = state.q.trim().toLowerCase();
  let list = state.rows.filter(r=>{
    const hay = [r.name,r.type,r.status,r.owner,r.desc,(r.schedule?.labels||[]).join(' ')].join(' ').toLowerCase();
    const cfgStr = JSON.stringify(r.config||{}).toLowerCase();
    const qmatch = !q || hay.includes(q) || cfgStr.includes(q);
    const tmatch = state.typeFilter==='All' || r.type===state.typeFilter;
    const smatch = state.statusFilter==='All' || r.status===state.statusFilter;
    const omatch = state.ownerFilter==='All' || r.owner===state.ownerFilter;
    return qmatch && tmatch && smatch && omatch;
  });

  const {sortKey,sortDir}=state;
  list.sort((a,b)=>{
    const va=String(a[sortKey]||'').toLowerCase(); const vb=String(b[sortKey]||'').toLowerCase();
    if(va<vb) return sortDir==='asc'?-1:1; if(va>vb) return sortDir==='asc'?1:-1; return 0;
  });
  return list;
}

/* ===== Render main page ===== */

function render(){
  const list = getFilteredSorted();
  const { page, pageSize, isLoading, sortKey, sortDir } = state;
  const total = list.length;
  const totalActive = list.filter(r=>r.status==='Active').length;
  const totalInactive = list.filter(r=>r.status==='Inactive').length;
  const totalError = list.filter(r=>r.status==='Error').length;
  const totalPages = Math.max(1, Math.ceil(total/pageSize));
  const start=(page-1)*pageSize; const pageRows=list.slice(start,start+pageSize);

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Connectors Registry</h1>
        <span class="badge rounded-pill badge-active badge-chip">Active: ${totalActive}</span>
        <span class="badge rounded-pill badge-inactive badge-chip">Inactive: ${totalInactive}</span>
        <span class="badge rounded-pill badge-error badge-chip">Error: ${totalError}</span>
        <span class="badge rounded-pill text-bg-secondary">Total: ${total}</span>
      </div>

      <div class="d-flex flex-wrap gap-2">
        <div class="input-group input-group-sm search-wrap">
          <span class="input-group-text">Search</span>
          <input id="q" class="form-control" placeholder="Name, type, owner, status, config..." value="${escAttr(state.q)}">
        </div>

        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text">Type</label>
          <select id="filterType" class="form-select form-select-sm">
            ${typesList().map(t=>`<option ${t===state.typeFilter?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>

        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text">Status</label>
          <select id="filterStatus" class="form-select form-select-sm">
            ${['All','Active','Inactive','Error'].map(s=>`<option ${s===state.statusFilter?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>

        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text">Owner</label>
          <select id="filterOwner" class="form-select form-select-sm">
            ${ownersList().map(o=>`<option ${o===state.ownerFilter?'selected':''}>${o}</option>`).join('')}
          </select>
        </div>

        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text" for="pageSize">Rows/page</label>
          <select id="pageSize" class="form-select form-select-sm">
            ${[10,25,50,100].map(v=>`<option value="${v}" ${v===state.pageSize?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>

        <div class="btn-group btn-group-sm">
          <button id="btnExport" class="btn btn-outline-secondary" ${isLoading?'disabled':''}>Export CSV</button>
          <button id="btnRefresh" class="btn btn-primary" ${isLoading?'disabled':''}>${isLoading?'Refreshing…':'Refresh'}</button>
        </div>

        <div class="btn-group btn-group-sm">
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnDiscard" class="btn btn-outline-secondary">Discard</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>

        <button id="btnNew" class="btn btn-outline-primary btn-sm" type="button">New Connector</button>
      </div>
    </div>

    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              ${th('name','Name',sortKey,sortDir)}
              ${th('type','Type',sortKey,sortDir)}
              ${th('status','Status',sortKey,sortDir)}
              ${th('owner','Owner',sortKey,sortDir)}
              <th>Configured</th>
              <th>Description</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pageRows.map(r=>tr(r)).join('')}
            ${pageRows.length? '' : `<tr><td colspan="7" class="text-center text-body-secondary py-4">No matching connectors</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
        <small class="text-body-secondary">Secrets are managed securely; this registry stores non-secret metadata only.</small>
        <nav aria-label="Pagination">
          <ul class="pagination pagination-sm mb-0">
            ${renderPages(state.page, totalPages)}
          </ul>
        </nav>
      </div>
    </div>
  `;

  // Controls
  $('#q')?.addEventListener('input', e=>{ state.q=e.target.value||''; state.page=1; render(); });
  $('#filterType')?.addEventListener('change', e=>{ state.typeFilter=e.target.value; state.page=1; render(); });
  $('#filterStatus')?.addEventListener('change', e=>{ state.statusFilter=e.target.value; state.page=1; render(); });
  $('#filterOwner')?.addEventListener('change', e=>{ state.ownerFilter=e.target.value; state.page=1; render(); });
  $('#pageSize')?.addEventListener('change', e=>{ state.pageSize=Number(e.target.value)||10; state.page=1; render(); });

  main.querySelectorAll('th[data-sort-key]').forEach(thEl=>{
    thEl.addEventListener('click', ()=>{
      const key=thEl.getAttribute('data-sort-key');
      if(state.sortKey===key) state.sortDir = (state.sortDir==='asc'?'desc':'asc');
      else { state.sortKey=key; state.sortDir='asc'; }
      render();
    });
  });
  main.querySelectorAll('.pagination .page-link[data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const goto=Number(btn.getAttribute('data-page'));
      const max=Math.max(1,Math.ceil(getFilteredSorted().length/state.pageSize));
      state.page=Math.min(Math.max(1,goto),max);
      render();
    });
  });

  $('#btnExport')?.addEventListener('click', ()=>exportCSV(getFilteredSorted()));
  $('#btnRefresh')?.addEventListener('click', ()=>loadFromLocalOrSource(true));
  $('#btnReset')?.addEventListener('click', ()=>{ localStorage.removeItem(LS_KEY); loadFromLocalOrSource(true); });
  $('#btnDiscard')?.addEventListener('click', ()=>{ const c=localStorage.getItem(LS_KEY); if(c){ state.rows=(JSON.parse(c).rows||[]).map(normalize); render(); }});
  $('#btnSave')?.addEventListener('click', ()=>{ localStorage.setItem(LS_KEY, JSON.stringify({ rows: state.rows })); alert('Saved locally for demo.'); });

  $('#btnNew')?.addEventListener('click', (e)=>{
    e.preventDefault();
    const newRow = { id: genId(), name:'', type:'', status:'', owner:'', desc:'', config:{}, secretsConfigured:false, schedule:{frequency:'Manual',window:'',labels:[]} };
    openWizard(newRow, null);
  });

  // Row actions
  main.addEventListener('click', onRowAction);
}

/* ===== Table helpers ===== */

function th(key,label,sortKey,sortDir){ const active=key===sortKey; const arrow=active?(sortDir==='asc'?'▲':'▼'):''; return `<th data-sort-key="${key}">${label} <span class="sort">${arrow}</span></th>`; }

function tr(r){
  const statusBadge = r.status==='Active'?'badge-active' : r.status==='Error'?'badge-error' : 'badge-inactive';
  return `
    <tr>
      <td class="fw-semibold">${esc(r.name)}</td>
      <td>${esc(r.type)}</td>
      <td><span class="badge ${statusBadge} badge-chip">${esc(r.status)}</span></td>
      <td>${esc(r.owner)}</td>
      <td>${r.secretsConfigured ? '<span class="badge text-bg-success">Yes</span>' : '<span class="badge text-bg-secondary">No</span>'}</td>
      <td class="small">${esc(r.desc)}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" data-action="test" data-id="${escAttr(r.id)}" type="button">Test</button>
          <button class="btn btn-outline-secondary" data-action="edit" data-id="${escAttr(r.id)}" type="button">Edit</button>
          <button class="btn btn-outline-danger" data-action="del" data-id="${escAttr(r.id)}" type="button">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

function onRowAction(e){
  const btn=e.target.closest('button[data-action]'); if(!btn) return;
  const id=btn.getAttribute('data-id'); const action=btn.getAttribute('data-action'); if(!id) return;
  const idx = getIndexById(id);
  if (idx < 0) return;

  if(action==='edit') openWizard(state.rows[idx], state.rows[idx].id);
  else if(action==='del') { if(confirm(`Delete connector "${state.rows[idx].name}"?`)){ state.rows.splice(idx,1); render(); } }
  else if(action==='test') runTest(state.rows[idx]);
}

/* ===== Wizard ===== */

function openWizard(row, id){
  state.editingId = id;
  state.editingIndex = (id ? getIndexById(id) : -1);
  state.scratch = deepClone(row);

  $('#connectorModalLabel').textContent = (id ? 'Edit Connector' : 'New Connector');
  $('#bName').value = state.scratch.name || '';
  $('#bType').value = state.scratch.type || '';
  $('#bStatus').value = state.scratch.status || '';
  $('#bDesc').value = state.scratch.desc || '';
  $('#bNameDup').style.display = 'none';
  ['input','change'].forEach(evt=>{
    $('#bName').addEventListener(evt, validateBasics);
    $('#bType').addEventListener(evt, ()=>{ validateBasics(); renderTypeFields(); });
    $('#bStatus').addEventListener(evt, validateBasics);
  });

  renderTypeFields();

  $('#sOwner').value = state.scratch.owner || '';
  $('#sFrequency').value = state.scratch.schedule?.frequency || 'Manual';
  $('#sWindow').value = state.scratch.schedule?.window || '';
  $('#sLabels').value = (state.scratch.schedule?.labels||[]).join(', ');

  renderReview();

  $('#btnWizardPrev').onclick = navPrev;
  $('#btnWizardNext').onclick = navNext;
  $('#btnTest').onclick = () => runTest(state.scratch);
  $('#btnSaveConnector').onclick = onWizardSave;

  setWizardButtons();

  // **Critical**: open after ensuring the modal is under <body>
  const modalEl = ensureModalInBody($('#connectorModal'));
  showModal(modalEl);
}

function validateBasics(){
  const name = ($('#bName').value||'').trim();
  const type = $('#bType').value;
  const status = $('#bStatus').value;

  let ok = true;
  if(!name){ $('#bName').classList.add('is-invalid'); ok=false; } else { $('#bName').classList.remove('is-invalid'); }
  if(!type){ $('#bType').classList.add('is-invalid'); ok=false; } else { $('#bType').classList.remove('is-invalid'); }
  if(!status){ $('#bStatus').classList.add('is-invalid'); ok=false; } else { $('#bStatus').classList.remove('is-invalid'); }

  const dup = state.rows.some(r => r.name.trim().toLowerCase() === name.toLowerCase() && r.id !== state.editingId);
  if(dup){ $('#bName').classList.add('is-invalid'); $('#bNameDup').style.display='block'; ok=false; }
  else { $('#bNameDup').style.display='none'; }

  state.scratch.name = name;
  state.scratch.type = type;
  state.scratch.status = status;
  state.scratch.desc = ($('#bDesc').value||'').trim();

  setWizardButtons();
  return ok;
}

function renderTypeFields(){
  const type = $('#bType').value || state.scratch.type || '';
  const host = $('#connectionFields'); host.innerHTML = buildTypeFields(type, state.scratch);

  host.querySelectorAll('[data-cfg]').forEach(inp=>{
    const key = inp.getAttribute('data-cfg');
    const isJson = inp.getAttribute('data-json')==='1';
    inp.addEventListener('input', ()=>{
      let val = inp.value;
      if(isJson){
        try { JSON.parse(val); inp.classList.remove('is-invalid'); }
        catch { inp.classList.add('is-invalid'); }
      }
      setCfg(state.scratch, key, val);
      setWizardButtons();
      renderReview();
    });
  });

  const secBtn = $('#btnConfigureSecrets');
  if (secBtn) secBtn.addEventListener('click', ()=>{
    const ok = prompt(`Enter secrets for ${type} (demo):\nThese values are NOT stored; only a configured flag is set.\nType "OK" to simulate secrets configured.`);
    if (ok && ok.trim().toUpperCase()==='OK') {
      state.scratch.secretsConfigured = true;
      renderTypeFields();
      renderReview();
      setWizardButtons();
    }
  });
}

function buildTypeFields(type, scratch){
  const cfg = scratch.config || {};
  const yesNo = scratch.secretsConfigured ? '<span class="badge text-bg-success">Configured</span>' : '<span class="badge text-bg-secondary">Not configured</span>';
  const secretBlock = `
    <fieldset class="secret">
      <legend>Secrets</legend>
      <div class="d-flex align-items-center justify-content-between">
        <div class="small">Secret values are not stored. Only the “configured” flag is kept for demo.</div>
        <button id="btnConfigureSecrets" class="btn btn-sm btn-outline-primary" type="button">Configure Secrets</button>
      </div>
      <div class="mt-2">Status: ${yesNo}</div>
    </fieldset>
  `;

  const input = (label, key, placeholder='', help='', required=false, extra='') => `
    <div>
      <label class="form-label">${label}${required? ' <span class="text-danger">*</span>' : ''}</label>
      <input class="form-control" data-cfg="${key}" value="${escAttr(getCfg(cfg,key)||'')}" placeholder="${escAttr(placeholder)}" ${extra}>
      ${help? `<div class="form-text">${help}</div>`:''}
    </div>
  `;
  const ta = (label, key, placeholder='', help='', json=false) => `
    <div>
      <label class="form-label">${label}</label>
      <textarea class="form-control" rows="3" data-cfg="${key}" ${json?'data-json="1"':''} placeholder="${escAttr(placeholder)}">${esc(getCfg(cfg,key)||'')}</textarea>
      ${help? `<div class="form-text">${help}</div>`:''}
    </div>
  `;

  switch(type){
    case 'REST':
      return `
        ${input('Base URL','rest.base_url','https://api.example.com','')}
        <div class="row g-3">
          <div class="col-md-6">${input('Auth Method','rest.auth_method','none|api_key|bearer|oauth2','',false)}</div>
          <div class="col-md-3">${input('Timeout (s)','rest.timeout','30','',false)}</div>
          <div class="col-md-3">${input('Max Retries','rest.retries','3','',false)}</div>
        </div>
        ${ta('Headers (JSON)','rest.headers','{"Accept":"application/json"}','Provide valid JSON object.', true)}
        ${secretBlock}
      `;
    case 'GraphQL':
      return `
        ${input('Endpoint URL','gql.endpoint','https://api.example.com/graphql','')}
        ${ta('Headers (JSON)','gql.headers','{"Authorization":"Bearer ..."}','Provide valid JSON object.', true)}
        ${secretBlock}
      `;
    case 'SFTP':
      return `
        <div class="row g-3">
          <div class="col-md-5">${input('Host','sftp.host','sftp.example.com','',true)}</div>
          <div class="col-md-3">${input('Port','sftp.port','22','',true)}</div>
          <div class="col-md-4">${input('Username','sftp.username','','',true)}</div>
        </div>
        ${input('Remote Path','sftp.path','/inbound/oneroster','')}
        ${input('Auth Method','sftp.auth_method','password|private_key','','')}
        ${secretBlock}
      `;
    case 'JDBC':
      return `
        ${input('Driver','jdbc.driver','org.postgresql.Driver','')}
        ${input('JDBC URL','jdbc.url','jdbc:postgresql://host:5432/db','',true)}
        <div class="row g-3">
          <div class="col-md-6">${input('Username','jdbc.username','','',true)}</div>
          <div class="col-md-6">${input('Parameters','jdbc.params','sslmode=require','')}</div>
        </div>
        ${secretBlock}
      `;
    case 'ODBC':
      return `
        ${input('DSN','odbc.dsn','BannerProd','',true)}
        <div class="row g-3">
          <div class="col-md-6">${input('Username','odbc.username','','',true)}</div>
          <div class="col-md-6">${input('Extra Params','odbc.params','','')}</div>
        </div>
        ${secretBlock}
      `;
    case 'OneRoster':
      return `
        ${input('Provider Base URL','oneroster.base_url','https://provider.example/oneroster','',true)}
        ${input('Version','oneroster.version','v1.1','')}
        ${secretBlock}
      `;
    case 'CEDS':
      return `
        ${input('Mapping Profile','ceds.profile','K12-v8','',true)}
        ${input('CEDS Version','ceds.version','v8','')}
        ${ta('Notes','ceds.notes','','',false)}
      `;
    case 'Google Sheets':
      return `
        ${input('Spreadsheet ID','gs.sheet_id','1abc...','',true)}
        ${input('Worksheet (tab)','gs.worksheet','Sheet1','')}
        ${secretBlock}
      `;
    case 'AWS S3':
      return `
        <div class="row g-3">
          <div class="col-md-6">${input('Bucket','s3.bucket','edx-landing','',true)}</div>
          <div class="col-md-3">${input('Region','s3.region','us-east-1','',true)}</div>
          <div class="col-md-3">${input('Prefix','s3.prefix','/','')}</div>
        </div>
        ${input('Endpoint (optional)','s3.endpoint','','For S3-compatible stores (MinIO, etc.)')}
        ${secretBlock}
      `;
    case 'Azure Blob':
      return `
        <div class="row g-3">
          <div class="col-md-6">${input('Account','az.account','myaccount','',true)}</div>
          <div class="col-md-6">${input('Container','az.container','edx-archive','',true)}</div>
        </div>
        ${input('Endpoint (optional)','az.endpoint','','https://<account>.blob.core.windows.net')}
        ${secretBlock}
      `;
    default:
      return `<div class="alert alert-info">Choose a connector <em>Type</em> in Basics to see connection fields.</div>`;
  }
}

function setCfg(scratch, dottedKey, value){
  scratch.config = scratch.config || {};
  const parts = String(dottedKey).split('.');
  let obj = scratch.config;
  while(parts.length>1){ const p = parts.shift(); obj[p] = obj[p] || {}; obj = obj[p]; }
  obj[parts[0]] = value;
}

function getCfg(cfg, dottedKey){
  const parts = String(dottedKey).split('.');
  let obj = cfg || {};
  for (const p of parts){ if (obj && typeof obj==='object' && p in obj) obj=obj[p]; else return ''; }
  return obj;
}

function navPrev(){
  const active = document.querySelector('#wizardTabs .nav-link.active');
  if(active?.id==='tab-basics') return;
  (active.previousElementSibling)?.click();
  setWizardButtons();
  renderReview();
}

function navNext(){
  const active = document.querySelector('#wizardTabs .nav-link.active');
  if(active?.id==='tab-basics' && !validateBasics()) return;
  if(active?.id==='tab-connection' && !validateConnection()) return;
  (active.nextElementSibling)?.click();
  setWizardButtons();
  renderReview();
}

function validateConnection(){
  const t = state.scratch.type || $('#bType').value;
  const cfg = state.scratch.config || {};
  const need = (paths) => paths.every(k => (getCfg(cfg,k)||'').toString().trim()!=='');
  let ok = true;
  if (t==='REST') ok = need(['rest.base_url']);
  else if (t==='GraphQL') ok = need(['gql.endpoint']);
  else if (t==='SFTP') ok = need(['sftp.host','sftp.port','sftp.username']);
  else if (t==='JDBC') ok = need(['jdbc.url','jdbc.username']);
  else if (t==='ODBC') ok = need(['odbc.dsn','odbc.username']);
  else if (t==='OneRoster') ok = need(['oneroster.base_url']);
  else if (t==='Google Sheets') ok = need(['gs.sheet_id']);
  else if (t==='AWS S3') ok = need(['s3.bucket','s3.region']);
  else if (t==='Azure Blob') ok = need(['az.account','az.container']);
  const needsSecrets = ['REST','GraphQL','SFTP','JDBC','ODBC','OneRoster','Google Sheets','AWS S3','Azure Blob'].includes(t);
  if (needsSecrets && !state.scratch.secretsConfigured) ok = false;
  setWizardButtons();
  return ok;
}

function renderReview(){
  const s = state.scratch;
  const cfg = JSON.stringify(s.config||{}, null, 2);
  $('#reviewBody').innerHTML = `
    <div class="row g-3">
      <div class="col-lg-6">
        <h6>Summary</h6>
        <table class="table table-sm">
          <tbody>
            <tr><th class="w-25">Name</th><td>${esc(s.name||'')}</td></tr>
            <tr><th>Type</th><td>${esc(s.type||'')}</td></tr>
            <tr><th>Status</th><td>${esc(s.status||'')}</td></tr>
            <tr><th>Owner</th><td>${esc(s.owner||'')}</td></tr>
            <tr><th>Secrets</th><td>${s.secretsConfigured?'<span class="badge text-bg-success">Configured</span>':'<span class="badge text-bg-secondary">Not configured</span>'}</td></tr>
            <tr><th>Description</th><td>${esc(s.desc||'')}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="col-lg-6">
        <h6>Schedule</h6>
        <table class="table table-sm">
          <tbody>
            <tr><th class="w-25">Frequency</th><td>${esc(s.schedule?.frequency||'')}</td></tr>
            <tr><th>Window</th><td>${esc(s.schedule?.window||'')}</td></tr>
            <tr><th>Labels</th><td>${(s.schedule?.labels||[]).join(', ') || ''}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="col-12">
        <h6>Connection (non-secret)</h6>
        <pre class="inline-json mb-0">${esc(cfg)}</pre>
      </div>
    </div>
  `;
}

function setWizardButtons(){
  const active = document.querySelector('#wizardTabs .nav-link.active');
  const atBasics = active?.id==='tab-basics';
  const atReview = active?.id==='tab-review';

  $('#btnWizardPrev').disabled = atBasics;
  $('#btnWizardNext').style.display = atReview ? 'none' : '';
  $('#btnTest').disabled = !(validateBasics() && (atReview ? validateConnection() : true));
  $('#btnSaveConnector').disabled = !(validateBasics() && validateConnection() && atReview);
}

function onWizardSave(){
  state.scratch.owner = ($('#sOwner').value||'').trim();
  state.scratch.schedule = {
    frequency: $('#sFrequency').value || 'Manual',
    window: ($('#sWindow').value||'').trim(),
    labels: ($('#sLabels').value||'').split(',').map(s=>s.trim()).filter(Boolean)
  };

  const nameLower = (state.scratch.name||'').toLowerCase();
  const dup = state.rows.some(r => r.name.trim().toLowerCase() === nameLower && r.id !== state.editingId);
  if (dup) { alert('A connector with this name already exists.'); return; }

  if (state.editingIndex >= 0) {
    state.rows[state.editingIndex] = deepClone(state.scratch);
  } else {
    if (!state.scratch.id) state.scratch.id = genId();
    state.rows.push(deepClone(state.scratch));
  }

  hideModal($('#connectorModal'));
  render();
}

/* ===== Testing (simulated strict) ===== */

function runTest(row){
  const min = {
    REST: !!row.config?.rest?.base_url && row.secretsConfigured,
    GraphQL: !!row.config?.gql?.endpoint && row.secretsConfigured,
    SFTP: !!row.config?.sftp?.host && !!row.config?.sftp?.port && !!row.config?.sftp?.username && row.secretsConfigured,
    JDBC: !!row.config?.jdbc?.url && !!row.config?.jdbc?.username && row.secretsConfigured,
    ODBC: !!row.config?.odbc?.dsn && !!row.secretsConfigured && !!row.config?.odbc?.username,
    OneRoster: !!row.config?.oneroster?.base_url && row.secretsConfigured,
    'Google Sheets': !!row.config?.gs?.sheet_id && row.secretsConfigured,
    'AWS S3': !!row.config?.s3?.bucket && !!row.config?.s3?.region && row.secretsConfigured,
    'Azure Blob': !!row.config?.az?.account && !!row.config?.az?.container && row.secretsConfigured
  };
  const okMin = row.type in min ? min[row.type] : true;

  if (!okMin) {
    alert('Test failed: required fields or secrets are missing.');
    row.status = 'Error';
    render();
    return;
  }

  const ok = /ops|engineer|platform/i.test(row.owner) || /active/i.test(row.status);
  alert(`Testing "${row.name}"...\nResult: ${ok ? 'SUCCESS' : 'ERROR'}`);
  row.status = ok ? 'Active' : 'Error';
  render();
}

/* ===== Export ===== */

function exportCSV(rows){
  const hdr = ['Name','Type','Status','Owner','Configured','Frequency','Window','Labels','Description'];
  const body = rows.map(r=>[
    r.name, r.type, r.status, r.owner, r.secretsConfigured?'Yes':'No',
    r.schedule?.frequency||'', r.schedule?.window||'', (r.schedule?.labels||[]).join('|'),
    r.desc
  ]);
  const csv = toCSV([hdr, ...body]);
  openCsvPreview(csv, `edx_connectors_${ts()}.csv`);
}

function openCsvPreview(text, filename){
  $('#csvModalLabel').textContent = `CSV Preview — ${filename}`;
  $('#csvPreview').textContent = text;
  $('#btnCopyCsv').onclick = async ()=>{ try{ await navigator.clipboard.writeText(text); alert('Copied!'); } catch{ alert('Copy failed'); } };
  showModal(ensureModalInBody($('#csvModal')));
}

/* ===== Utilities ===== */

function renderStatus(){ /* spinner hook if needed */ }
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
function toCSV(rows){ const BOM='\uFEFF'; return BOM + rows.map(cols=>cols.map(csvEsc).join(',')).join('\r\n'); }
function csvEsc(v){ const s=String(v??''); return /[",\r\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function renderPages(page,total){ const out=[]; const li=(n,l=n)=>out.push(`<li class="page-item ${n===page?'active':''}"><button class="page-link" data-page="${n}" type="button">${l}</button></li>`); const dot=()=>out.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`); if(total<=7){ for(let n=1;n<=total;n++) li(n); } else { li(1); if(page>3) dot(); for(let n=Math.max(2,page-1); n<=Math.min(total-1,page+1); n++) li(n); if(page<total-2) dot(); li(total); } return out.join(''); }
function deepClone(x){ return JSON.parse(JSON.stringify(x)); }
