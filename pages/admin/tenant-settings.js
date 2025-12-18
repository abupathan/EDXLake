// EDX — Tenant Settings (production-grade)
// Tabs: General, Data Retention, Features, Notifications, API/Webhooks
// Validations, CSV/JSON preview, paginated tables, localStorage demo persistence.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'tenant-settings.json';
const LS_KEY  = 'edx_tenant_settings_v1';

let model = {
  meta:{},
  tenant_name:'',
  region:'',
  regions:[],
  notes:'',
  data_retention:{ pii_days:365, logs_days:90, exports_days:30, legal_hold:false },
  features:{ masking:true, rls:true, catalog:true, exports:true, webhooks:true },
  notifications:{ owners:[], threshold_errors:50, send_daily:true, send_weekly:false },
  api_keys:[],
  webhooks:[]
};

const ui = {
  // tables
  kQ:'', kSort:'label', kDir:'asc', kPage:1, kSize:10,
  wQ:'', wEvent:'All', wSort:'name', wDir:'asc', wPage:1, wSize:10
};

init().catch(console.error);

/* --------------------- Init / Load ---------------------------- */
async function init(){
  try{
    const saved = localStorage.getItem(LS_KEY);
    if (saved) model = JSON.parse(saved);
    else model = await fetch(SRC_URL, { cache:'no-store' }).then(r=>r.json());
  } catch { /* keep defaults */ }
  normalize();
  render();
}

function normalize(){
  model.notifications ||= {};
  model.notifications.owners = Array.isArray(model.notifications.owners) ? model.notifications.owners : [];
  model.api_keys = Array.isArray(model.api_keys) ? model.api_keys : [];
  model.webhooks = Array.isArray(model.webhooks) ? model.webhooks : [];
}

/* --------------------- Render ---------------------------- */
function render(){
  const totalKeys = model.api_keys.length;
  const totalHooks = model.webhooks.length;

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Tenant Settings</h1>
        <span class="kpi-chip"><span class="dot"></span> API Keys: ${totalKeys}</span>
        <span class="kpi-chip"><span class="dot"></span> Webhooks: ${totalHooks}</span>
        <span class="badge ${model.features.masking?'text-bg-success':'text-bg-secondary'} badge-chip">Masking ${model.features.masking?'On':'Off'}</span>
        <span class="badge ${model.features.rls?'text-bg-success':'text-bg-secondary'} badge-chip">RLS ${model.features.rls?'On':'Off'}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="btn-group btn-group-sm">
          <button id="btnExportJson" class="btn btn-outline-secondary">Export JSON</button>
          <button id="btnExportCsv" class="btn btn-outline-secondary">Export CSV</button>
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>
      </div>
    </div>

    <ul class="nav nav-tabs mb-3" id="tsTabs" role="tablist">
      <li class="nav-item" role="presentation"><button class="nav-link active" id="tab-general" data-bs-toggle="tab" data-bs-target="#pane-general" type="button" role="tab">General</button></li>
      <li class="nav-item" role="presentation"><button class="nav-link" id="tab-retention" data-bs-toggle="tab" data-bs-target="#pane-retention" type="button" role="tab">Data Retention</button></li>
      <li class="nav-item" role="presentation"><button class="nav-link" id="tab-features" data-bs-toggle="tab" data-bs-target="#pane-features" type="button" role="tab">Features</button></li>
      <li class="nav-item" role="presentation"><button class="nav-link" id="tab-notifications" data-bs-toggle="tab" data-bs-target="#pane-notifications" type="button" role="tab">Notifications</button></li>
      <li class="nav-item" role="presentation"><button class="nav-link" id="tab-api" data-bs-toggle="tab" data-bs-target="#pane-api" type="button" role="tab">API / Webhooks</button></li>
    </ul>

    <div class="tab-content">
      ${paneGeneral()}
      ${paneRetention()}
      ${paneFeatures()}
      ${paneNotifications()}
      ${paneAPI()}
    </div>
  `;

  // Actions
  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnReset').addEventListener('click', resetLocal);
  $('#btnExportJson').addEventListener('click', () => exportPreview('json'));
  $('#btnExportCsv').addEventListener('click', () => exportPreview('csv'));

  // General
  $('#tName').addEventListener('input', e=>{ model.tenant_name = e.target.value; validateGeneral(); });
  $('#tRegion').addEventListener('change', e=>{ model.region = e.target.value; });
  $('#tNotes').addEventListener('input', e=>{ model.notes = e.target.value; });

  // Retention
  ['pii_days','logs_days','exports_days'].forEach(id=>{
    $('#dr_'+id).addEventListener('input',e=>{
      const v = Number(e.target.value)||0; model.data_retention[id]=v; validateRetention();
    });
  });
  $('#dr_legal_hold').addEventListener('change', e=>{ model.data_retention.legal_hold = e.target.checked; validateRetention(); });

  // Features
  ['masking','rls','catalog','exports','webhooks'].forEach(k=>{
    $('#f_'+k).addEventListener('change',e=>{ model.features[k]=e.target.checked; render(); });
  });

  // Notifications
  $('#nOwners').addEventListener('input', e=>{
    model.notifications.owners = (e.target.value||'').split(',').map(s=>s.trim()).filter(Boolean);
  });
  $('#nThresh').addEventListener('input', e=>{ model.notifications.threshold_errors = Number(e.target.value)||0; });
  $('#nDaily').addEventListener('change', e=>{ model.notifications.send_daily = e.target.checked; });
  $('#nWeekly').addEventListener('change', e=>{ model.notifications.send_weekly = e.target.checked; });

  // API & Webhooks controls
  // Keys
  $('#kQ').addEventListener('input', e=>{ ui.kQ=e.target.value; ui.kPage=1; mountKeys(); });
  $('#kSize').addEventListener('change', e=>{ ui.kSize=Number(e.target.value)||10; ui.kPage=1; mountKeys(); });
  $('#btnNewKey').addEventListener('click', openKeyModal);
  main.querySelectorAll('#kTable thead th[data-sort-key]').forEach(th=>{
    th.addEventListener('click', ()=>{ const key=th.getAttribute('data-sort-key'); if(ui.kSort===key) ui.kDir=(ui.kDir==='asc'?'desc':'asc'); else{ ui.kSort=key; ui.kDir='asc'; } mountKeys(); });
  });

  // Hooks
  $('#wQ').addEventListener('input', e=>{ ui.wQ=e.target.value; ui.wPage=1; mountHooks(); });
  $('#wEvent').addEventListener('change', e=>{ ui.wEvent=e.target.value; ui.wPage=1; mountHooks(); });
  $('#wSize').addEventListener('change', e=>{ ui.wSize=Number(e.target.value)||10; ui.wPage=1; mountHooks(); });
  $('#btnNewHook').addEventListener('click', ()=>newHook());
  main.querySelectorAll('#wTable thead th[data-sort-key]').forEach(th=>{
    th.addEventListener('click', ()=>{ const key=th.getAttribute('data-sort-key'); if(ui.wSort===key) ui.wDir=(ui.wDir==='asc'?'desc':'asc'); else{ ui.wSort=key; ui.wDir='asc'; } mountHooks(); });
  });

  // mount paginated tables
  mountKeys();
  mountHooks();

  // initial validations
  validateGeneral();
  validateRetention();
}

/* --------------------- Panes --------------------------------- */
function paneGeneral(){
  return `
    <div class="tab-pane fade show active" id="pane-general" role="tabpanel" aria-label="General settings">
      <div class="card card-elevated mb-3">
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Tenant Name <span class="text-danger">*</span></label>
              <input id="tName" class="form-control" value="${escAttr(model.tenant_name||'')}" placeholder="e.g., Acme ISD" />
              <div id="tNameErr" class="invalid-feedback">Tenant name is required.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label">Region / Residency <span class="text-danger">*</span></label>
              <select id="tRegion" class="form-select" aria-label="Select data residency region">
                ${model.regions.map(r=>`<option ${r===model.region?'selected':''}>${r}</option>`).join('')}
              </select>
              <div class="form-text tab-help">Controls residency for governed data and backups.</div>
            </div>
            <div class="col-12">
              <label class="form-label">Notes</label>
              <textarea id="tNotes" class="form-control" rows="3" placeholder="Tenant-specific notes…">${esc(model.notes||'')}</textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function paneRetention(){
  const dr=model.data_retention||{};
  return `
    <div class="tab-pane fade" id="pane-retention" role="tabpanel" aria-label="Data retention settings">
      <div class="card card-elevated mb-3">
        <div class="card-body">
          <div class="row g-3">
            ${retentionField('PII Retention (days)','pii_days',dr.pii_days, 'Strict FERPA zone.')}
            ${retentionField('Log Retention (days)','logs_days',dr.logs_days, 'Audit & system logs.')}
            ${retentionField('Export Retention (days)','exports_days',dr.exports_days, 'Transient export area.')}
            <div class="col-md-4">
              <label class="form-label">Legal Hold</label>
              <div class="form-check form-switch">
                <input id="dr_legal_hold" class="form-check-input" type="checkbox" ${dr.legal_hold?'checked':''}>
                <label class="form-check-label">Prevent deletions until hold lifted</label>
              </div>
            </div>
          </div>
          <div id="retentionWarn" class="alert alert-warning mt-3 d-none">Retention values must be positive integers.</div>
        </div>
      </div>
    </div>
  `;
}
function retentionField(label,key,val,help){
  return `
    <div class="col-md-4">
      <label class="form-label">${label} <span class="text-danger">*</span></label>
      <input id="dr_${key}" class="form-control" type="number" min="1" step="1" value="${Number(val)||1}">
      <div class="form-text">${help}</div>
    </div>
  `;
}

function paneFeatures(){
  const f=model.features||{};
  const toggle=(k,lab)=>`
    <div class="form-check form-switch">
      <input id="f_${k}" class="form-check-input" type="checkbox" ${f[k]?'checked':''}>
      <label class="form-check-label">${lab}</label>
    </div>`;
  return `
    <div class="tab-pane fade" id="pane-features" role="tabpanel" aria-label="Feature toggles">
      <div class="card card-elevated mb-3">
        <div class="card-body">
          <div class="row g-4">
            <div class="col-md-4">
              <h6>Governance</h6>
              ${toggle('masking','Dynamic masking')}
              ${toggle('rls','Row-level security (ABAC)')}
              ${toggle('catalog','Data catalog')}
            </div>
            <div class="col-md-4">
              <h6>Data Movement</h6>
              ${toggle('exports','Exports')}
              ${toggle('webhooks','Notifications / Webhooks')}
            </div>
            <div class="col-md-4">
              <h6>Shortcuts</h6>
              <div class="small tab-help">SSO/SCIM and policy simulators live on their pages.</div>
              <a class="btn btn-outline-primary btn-sm mt-2" href="../admin/identity-sso.html">Open Identity &amp; SSO</a>
              <a class="btn btn-outline-secondary btn-sm mt-2" href="../admin/masking-rls.html">Open Masking &amp; RLS</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function paneNotifications(){
  const n=model.notifications||{};
  return `
    <div class="tab-pane fade" id="pane-notifications" role="tabpanel" aria-label="Notification settings">
      <div class="card card-elevated mb-3">
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-8">
              <label class="form-label">Owner Emails (comma-separated)</label>
              <input id="nOwners" class="form-control" value="${escAttr((n.owners||[]).join(', '))}" placeholder="owner@district.edu, ops@district.edu">
              <div class="form-text">Notified on policy changes, failed pipelines, and security alerts.</div>
            </div>
            <div class="col-md-4">
              <label class="form-label">Error Threshold (per hour)</label>
              <input id="nThresh" class="form-control" type="number" min="0" step="1" value="${Number(n.threshold_errors)||0}">
            </div>
          </div>
          <div class="row g-3 mt-1">
            <div class="col-md-4">
              <div class="form-check form-switch">
                <input id="nDaily" class="form-check-input" type="checkbox" ${n.send_daily?'checked':''}>
                <label class="form-check-label">Send daily digest</label>
              </div>
            </div>
            <div class="col-md-4">
              <div class="form-check form-switch">
                <input id="nWeekly" class="form-check-input" type="checkbox" ${n.send_weekly?'checked':''}>
                <label class="form-check-label">Send weekly digest</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function paneAPI(){
  const events = ['All', ...Array.from(new Set(model.webhooks.map(w=>w.event))).sort()];
  return `
    <div class="tab-pane fade" id="pane-api" role="tabpanel" aria-label="API keys and webhooks">
      <div class="row g-3">
        <div class="col-12">
          <div class="card card-elevated">
            <div class="card-header bg-body d-flex align-items-center justify-content-between">
              <strong>API Keys</strong>
              <div class="d-flex flex-wrap gap-2">
                <div class="input-group input-group-sm search-wrap">
                  <span class="input-group-text">Search</span>
                  <input id="kQ" class="form-control" placeholder="label, scopes…" value="${escAttr(ui.kQ)}">
                </div>
                <div class="input-group input-group-sm" style="width:auto;">
                  <label class="input-group-text">Rows/page</label>
                  <select id="kSize" class="form-select form-select-sm">
                    ${[10,25,50,100].map(n=>`<option value="${n}" ${n===ui.kSize?'selected':''}>${n}</option>`).join('')}
                  </select>
                </div>
                <button id="btnNewKey" class="btn btn-primary btn-sm" type="button">New Key</button>
              </div>
            </div>
            <div class="table-responsive">
              <table id="kTable" class="table align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    ${th('label','Label','k')}
                    ${th('scopes','Scopes','k')}
                    ${th('created','Created','k')}
                    ${th('last_used','Last Used','k')}
                    <th class="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody id="kBody"></tbody>
              </table>
            </div>
            <div class="card-footer d-flex justify-content-end">
              <nav><ul id="kPager" class="pagination pagination-sm mb-0"></ul></nav>
            </div>
          </div>
        </div>

        <div class="col-12">
          <div class="card card-elevated">
            <div class="card-header bg-body d-flex align-items-center justify-content-between">
              <strong>Webhooks</strong>
              <div class="d-flex flex-wrap gap-2">
                <div class="input-group input-group-sm search-wrap">
                  <span class="input-group-text">Search</span>
                  <input id="wQ" class="form-control" placeholder="name, target URL…" value="${escAttr(ui.wQ)}">
                </div>
                <div class="input-group input-group-sm" style="width:auto;">
                  <label class="input-group-text">Event</label>
                  <select id="wEvent" class="form-select form-select-sm">
                    ${events.map(e=>`<option ${e===ui.wEvent?'selected':''}>${e}</option>`).join('')}
                  </select>
                </div>
                <div class="input-group input-group-sm" style="width:auto;">
                  <label class="input-group-text">Rows/page</label>
                  <select id="wSize" class="form-select form-select-sm">
                    ${[10,25,50,100].map(n=>`<option value="${n}" ${n===ui.wSize?'selected':''}>${n}</option>`).join('')}
                  </select>
                </div>
                <button id="btnNewHook" class="btn btn-outline-primary btn-sm" type="button">New Webhook</button>
              </div>
            </div>
            <div class="table-responsive">
              <table id="wTable" class="table align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    ${th('name','Name','w')}
                    ${th('event','Event','w')}
                    ${th('target','Target URL','w')}
                    ${th('status','Status','w')}
                    <th class="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody id="wBody"></tbody>
              </table>
            </div>
            <div class="card-footer d-flex justify-content-end">
              <nav><ul id="wPager" class="pagination pagination-sm mb-0"></ul></nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* --------------------- Mount paginated tables ----------------- */
function mountKeys(){
  const q = ui.kQ.trim().toLowerCase();
  let rows = model.api_keys.filter(k=>{
    const hay = `${k.label} ${(k.scopes||[]).join(' ')}`.toLowerCase();
    return !q || hay.includes(q);
  }).sort((a,b)=>{
    const va = ui.kSort==='created' || ui.kSort==='last_used' ? (a[ui.kSort]||'') : String(a[ui.kSort]||'').toLowerCase();
    const vb = ui.kSort==='created' || ui.kSort==='last_used' ? (b[ui.kSort]||'') : String(b[ui.kSort]||'').toLowerCase();
    const cmp = (va<vb?-1:va>vb?1:0);
    return ui.kDir==='asc'?cmp:-cmp;
  });

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/ui.kSize));
  ui.kPage = Math.min(Math.max(1,ui.kPage), pages);
  const start = (ui.kPage-1)*ui.kSize;
  const pageRows = rows.slice(start, start+ui.kSize);

  $('#kBody').innerHTML = pageRows.map(k=>`
    <tr>
      <td class="fw-semibold">${esc(k.label)}</td>
      <td>${esc((k.scopes||[]).join(', '))}</td>
      <td class="text-nowrap">${esc(fmtTime(k.created))}</td>
      <td class="text-nowrap">${k.last_used? esc(fmtTime(k.last_used)) : '—'}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-kact="reveal" data-id="${escAttr(k.id)}" type="button">Reveal</button>
          <button class="btn btn-outline-danger" data-kact="del" data-id="${escAttr(k.id)}" type="button">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="text-center text-body-secondary py-4">No API keys</td></tr>`;

  $('#kPager').innerHTML = pagesHtml(ui.kPage, pages);
  $('#kPager').querySelectorAll('.page-link[data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.kPage = Number(btn.getAttribute('data-page')); mountKeys(); });
  });

  $('#kBody').onclick = (e)=>{
    const btn = e.target.closest('button[data-kact]'); if(!btn) return;
    const id = btn.getAttribute('data-id'); const ix = model.api_keys.findIndex(k=>k.id===id); if(ix<0) return;
    const act = btn.getAttribute('data-kact');
    if(act==='reveal'){ alert(`Secret (demo): ${model.api_keys[ix].secret||'(not stored)'}`); }
    if(act==='del'){ if(confirm(`Delete API key "${model.api_keys[ix].label}"?`)){ model.api_keys.splice(ix,1); mountKeys(); } }
  };
}

function mountHooks(){
  const q = ui.wQ.trim().toLowerCase();
  let rows = model.webhooks.filter(w=>{
    const hay = `${w.name} ${w.target} ${w.event}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okE = ui.wEvent==='All' || w.event===ui.wEvent;
    return okQ && okE;
  }).sort((a,b)=>{
    const va = String(a[ui.wSort]||'').toLowerCase();
    const vb = String(b[ui.wSort]||'').toLowerCase();
    const cmp = (va<vb?-1:va>vb?1:0);
    return ui.wDir==='asc'?cmp:-cmp;
  });

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/ui.wSize));
  ui.wPage = Math.min(Math.max(1,ui.wPage), pages);
  const start = (ui.wPage-1)*ui.wSize;
  const pageRows = rows.slice(start, start+ui.wSize);

  $('#wBody').innerHTML = pageRows.map(w=>`
    <tr>
      <td>${esc(w.name)}</td>
      <td><span class="badge text-bg-secondary">${esc(w.event)}</span></td>
      <td class="text-truncate" style="max-width:420px;"><span class="inline-json">${esc(w.target)}</span></td>
      <td>${w.active?'<span class="badge text-bg-success">Active</span>':'<span class="badge text-bg-secondary">Disabled</span>'}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-wact="toggle" data-id="${escAttr(w.id)}" type="button">${w.active?'Disable':'Enable'}</button>
          <button class="btn btn-outline-danger" data-wact="del" data-id="${escAttr(w.id)}" type="button">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="text-center text-body-secondary py-4">No webhooks</td></tr>`;

  $('#wPager').innerHTML = pagesHtml(ui.wPage, pages);
  $('#wPager').querySelectorAll('.page-link[data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.wPage = Number(btn.getAttribute('data-page')); mountHooks(); });
  });

  $('#wBody').onclick = (e)=>{
    const btn = e.target.closest('button[data-wact]'); if(!btn) return;
    const id = btn.getAttribute('data-id'); const ix = model.webhooks.findIndex(w=>w.id===id); if(ix<0) return;
    const act = btn.getAttribute('data-wact');
    if(act==='toggle'){ model.webhooks[ix].active = !model.webhooks[ix].active; mountHooks(); }
    if(act==='del'){ if(confirm(`Delete webhook "${model.webhooks[ix].name}"?`)){ model.webhooks.splice(ix,1); mountHooks(); } }
  };
}

/* --------------------- Editor Actions ------------------------- */
function openKeyModal(){
  $('#apiKeyLabel').value = '';
  $('#apiKeyScopes').value = '';
  $('#apiKeyLabel').classList.remove('is-invalid');

  $('#btnCreateApiKey').onclick = ()=>{
    const label = $('#apiKeyLabel').value.trim();
    if(!label){ $('#apiKeyLabel').classList.add('is-invalid'); return; }
    const scopes = ($('#apiKeyScopes').value||'').split(',').map(s=>s.trim()).filter(Boolean);
    const key = {
      id: genId('key'),
      label,
      scopes,
      created: new Date().toISOString(),
      last_used: '',
      secret: 'sk_' + Math.random().toString(36).slice(2,10) + '_' + Date.now().toString(36)
    };
    model.api_keys.unshift(key);
    closeModal('#apiKeyModal');
    mountKeys();
    alert(`API key created (demo). Secret:\n${key.secret}\n\nThis will not be stored persistently beyond this session.`);
  };
  openModal('#apiKeyModal');
}

function newHook(){
  const name = prompt('Webhook name (demo):'); if(!name) return;
  const event = prompt('Event (e.g., pipeline.failed):', 'pipeline.failed') || 'pipeline.failed';
  const target = prompt('Target URL:', 'https://example.com/webhooks/edx') || '';
  model.webhooks.unshift({ id:genId('wh'), name, event, target, active:true });
  mountHooks();
}

/* --------------------- Export ------------------------------ */
function exportPreview(kind){
  if(kind==='json'){
    const text = JSON.stringify(model, null, 2);
    showExport('JSON Preview — tenant-settings.json', text);
  } else {
    const hdr = ['tenant_name','region','pii_days','logs_days','exports_days','legal_hold','masking','rls','catalog','exports','webhooks'];
    const r = model;
    const row = [
      r.tenant_name, r.region,
      r.data_retention.pii_days, r.data_retention.logs_days, r.data_retention.exports_days, r.data_retention.legal_hold ? 'Yes':'No',
      r.features.masking?'Yes':'No', r.features.rls?'Yes':'No', r.features.catalog?'Yes':'No', r.features.exports?'Yes':'No', r.features.webhooks?'Yes':'No'
    ];
    const csv = toCSV([hdr, row]);
    showExport('CSV Preview — tenant-settings.csv', csv);
  }
}
function showExport(title, text){
  $('#exportModalLabel').textContent = title;
  $('#exportPreview').textContent = text;
  $('#btnCopyExport').onclick = async ()=>{ try{ await navigator.clipboard.writeText(text); alert('Copied!'); } catch{ alert('Copy failed'); } };
  openModal('#exportModal');
}

/* --------------------- Validation & Persistence --------------- */
function saveLocal(){ 
  if (!$('#tName').value.trim()) { $('#tName').classList.add('is-invalid'); alert('Tenant Name is required.'); return; }
  localStorage.setItem(LS_KEY, JSON.stringify(model)); 
  alert('Saved (demo): tenant settings stored in your browser.'); 
}
function resetLocal(){ localStorage.removeItem(LS_KEY); init(); }

function validateGeneral(){
  const name = $('#tName');
  if(!name.value.trim()) name.classList.add('is-invalid'); else name.classList.remove('is-invalid');
}
function validateRetention(){
  const p = Number($('#dr_pii_days').value||0);
  const l = Number($('#dr_logs_days').value||0);
  const e = Number($('#dr_exports_days').value||0);
  const ok = p>0 && l>0 && e>0;
  $('#retentionWarn').classList.toggle('d-none', ok);
}

/* --------------------- Modal helpers (Bootstrap-first) -------- */
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

/* --------------------- Utilities ------------------------------ */
function th(key,label,scope){
  const active = (scope==='k'?ui.kSort:ui.wSort)===key;
  const dir = scope==='k'?ui.kDir:ui.wDir;
  const arrow = active ? (dir==='asc'?'▲':'▼') : '';
  return `<th data-sort-key="${key}" role="button">${label} <span class="sort">${arrow}</span></th>`;
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
function toCSV(rows){ const BOM='\uFEFF'; return BOM + rows.map(r=>r.map(c=>csvCell(c)).join(',')).join('\r\n'); }
function csvCell(v){ const s=String(v??''); return /[",\r\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function fmtTime(iso){ try{ return new Date(iso).toLocaleString(); } catch{ return iso; } }
function genId(prefix='id'){ return `${prefix}_` + Math.random().toString(36).slice(2,10) + '_' + Date.now().toString(36); }
