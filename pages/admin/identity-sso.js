// EDX — SSO / SCIM (production-grade)
// Features: tabs (SSO / SCIM), form validation, metadata preview/validate,
// attribute mappings (search/sort/pagination + CSV preview), provisioning logs
// (filters, sort, pagination + CSV preview), SCIM token generate/rotate/reveal,
// demo persistence with localStorage, Bootstrap-first modals (safe fallback).

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'identity-sso.json';
const LS_KEY  = 'edx_sso_scim_v1';

let model = {
  meta:{},
  idp:{ providers:[], protocols:[], provider:'', protocol:'', issuer:'', metadata_url:'' },
  scim:{ enabled:false, base_url:'', token:'' },
  mappings:[],
  logs:[]
};

const ui = {
  // mappings table
  mQ:'', mSort:'source', mDir:'asc', mPage:1, mSize:10, mSystem:'All',
  // logs table
  lQ:'', lResult:'All', lSort:'time', lDir:'desc', lPage:1, lSize:10
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
    // fall back to empty model
  }
  normalize();
  render();
}

function normalize(){
  model.idp ||= {};
  model.scim ||= {};
  model.mappings = Array.isArray(model.mappings) ? model.mappings : [];
  model.logs = Array.isArray(model.logs) ? model.logs : [];
}

function saveLocal(){
  localStorage.setItem(LS_KEY, JSON.stringify(model));
  alert('Saved (demo): configuration persisted in your browser.');
}
function resetLocal(){
  localStorage.removeItem(LS_KEY);
  init();
}

/* --------------------- Rendering ------------------------------ */
function render(){
  const totalMappings = model.mappings.length;
  const totalLogs = model.logs.length;
  const successLogs = model.logs.filter(l=>l.result==='SUCCESS').length;
  const errorLogs = model.logs.filter(l=>l.result==='ERROR').length;

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Single Sign-On (SSO) & SCIM</h1>
        <span class="kpi"><span class="dot"></span> Mappings: ${totalMappings}</span>
        <span class="kpi"><span class="dot"></span> Logs: ${totalLogs} (✓ ${successLogs} / ✕ ${errorLogs})</span>
        <span class="badge ${model.scim.enabled?'text-bg-success':'text-bg-secondary'} badge-chip">
          SCIM ${model.scim.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="btn-group btn-group-sm">
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>
      </div>
    </div>

    <ul class="nav nav-tabs mb-3" id="ssoTabs" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" id="tab-sso" data-bs-toggle="tab" data-bs-target="#pane-sso" type="button" role="tab">SSO (OIDC / SAML)</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="tab-scim" data-bs-toggle="tab" data-bs-target="#pane-scim" type="button" role="tab">SCIM Provisioning</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="tab-mappings" data-bs-toggle="tab" data-bs-target="#pane-mappings" type="button" role="tab">Attribute Mappings</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="tab-logs" data-bs-toggle="tab" data-bs-target="#pane-logs" type="button" role="tab">Provisioning Logs</button>
      </li>
    </ul>

    <div class="tab-content">
      ${paneSSO()}
      ${paneSCIM()}
      ${paneMappings()}
      ${paneLogs()}
    </div>
  `;

  // global actions
  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnReset').addEventListener('click', resetLocal);

  // SSO actions
  $('#idpProvider').addEventListener('change', e=>{ model.idp.provider = e.target.value; });
  $('#idpProtocol').addEventListener('change', e=>{ model.idp.protocol = e.target.value; });
  $('#idpIssuer').addEventListener('input',  e=>{ model.idp.issuer = e.target.value; });
  $('#idpMetaUrl').addEventListener('input', e=>{ model.idp.metadata_url = e.target.value; });
  $('#btnValidateMeta').addEventListener('click', validateMetadata);
  $('#btnPreviewMeta').addEventListener('click', previewMetadata);
  $('#btnTestLogin').addEventListener('click', testLogin);

  // SCIM actions
  $('#scimToggle').addEventListener('change', e=>{ model.scim.enabled = e.target.checked; render(); });
  $('#scimBase').addEventListener('input', e=>{ model.scim.base_url = e.target.value; });
  $('#scimToken').addEventListener('input', e=>{ model.scim.token = e.target.value; });
  $('#btnRevealToken').addEventListener('click', toggleTokenReveal);
  $('#btnGenToken').addEventListener('click', generateToken);
  $('#btnRotateToken').addEventListener('click', rotateToken);
  $('#btnSyncNow').addEventListener('click', simulateSync);

  // Mappings wiring
  $('#mQ').addEventListener('input', e=>{ ui.mQ=e.target.value; ui.mPage=1; mountMappings(); });
  $('#mSystem').addEventListener('change', e=>{ ui.mSystem=e.target.value; ui.mPage=1; mountMappings(); });
  $('#mSize').addEventListener('change', e=>{ ui.mSize=Number(e.target.value)||10; ui.mPage=1; mountMappings(); });
  $('#btnExportMappings').addEventListener('click', exportMappings);
  main.querySelectorAll('#mTable thead th[data-sort-key]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key=th.getAttribute('data-sort-key');
      if(ui.mSort===key) ui.mDir = (ui.mDir==='asc'?'desc':'asc');
      else { ui.mSort=key; ui.mDir='asc'; }
      mountMappings();
    });
  });

  // Logs wiring
  $('#lQ').addEventListener('input', e=>{ ui.lQ=e.target.value; ui.lPage=1; mountLogs(); });
  $('#lResult').addEventListener('change', e=>{ ui.lResult=e.target.value; ui.lPage=1; mountLogs(); });
  $('#lSize').addEventListener('change', e=>{ ui.lSize=Number(e.target.value)||10; ui.lPage=1; mountLogs(); });
  $('#btnExportLogs').addEventListener('click', exportLogs);
  main.querySelectorAll('#lTable thead th[data-sort-key]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key=th.getAttribute('data-sort-key');
      if(ui.lSort===key) ui.lDir = (ui.lDir==='asc'?'desc':'asc');
      else { ui.lSort=key; ui.lDir='asc'; }
      mountLogs();
    });
  });

  // initial mount for paginated panes
  mountMappings();
  mountLogs();
}

/* --------------------- Panes --------------------------------- */
function paneSSO(){
  const idp = model.idp;
  return `
    <div class="tab-pane fade show active" id="pane-sso" role="tabpanel">
      <div class="card card-elevated mb-3">
        <div class="card-header bg-body"><strong>SSO (OIDC / SAML)</strong></div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Provider</label>
              <select id="idpProvider" class="form-select">
                ${idp.providers.map(p=>`<option ${p===idp.provider?'selected':''}>${p}</option>`).join('')}
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label">Protocol</label>
              <select id="idpProtocol" class="form-select">
                ${idp.protocols.map(p=>`<option ${p===idp.protocol?'selected':''}>${p}</option>`).join('')}
              </select>
            </div>
            <div class="col-12">
              <label class="form-label">Issuer / Entity ID <span class="text-danger">*</span></label>
              <input id="idpIssuer" class="form-control" value="${escAttr(idp.issuer||'')}" placeholder="https://login.microsoftonline.com/<tenant-id>/v2.0">
              <div class="form-text">For SAML, this is the Entity ID; for OIDC, the Issuer URI.</div>
            </div>
            <div class="col-12">
              <label class="form-label">Metadata URL <span class="text-danger">*</span></label>
              <input id="idpMetaUrl" class="form-control" value="${escAttr(idp.metadata_url||'')}" placeholder="https://.../.well-known/openid-configuration OR federationmetadata.xml">
              <div id="idpHelp" class="form-text">Provide your IdP metadata; certificates and redirect URIs will be validated.</div>
            </div>
          </div>
          <div class="d-flex flex-wrap gap-2 mt-3">
            <button id="btnValidateMeta" class="btn btn-outline-secondary btn-sm" type="button">Validate Metadata</button>
            <button id="btnPreviewMeta" class="btn btn-outline-secondary btn-sm" type="button">Preview Metadata</button>
            <button id="btnTestLogin"   class="btn btn-primary btn-sm" type="button">Test Login</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function paneSCIM(){
  const sc = model.scim;
  return `
    <div class="tab-pane fade" id="pane-scim" role="tabpanel">
      <div class="card card-elevated mb-3">
        <div class="card-header bg-body"><strong>SCIM Provisioning</strong></div>
        <div class="card-body">
          <div class="form-check form-switch mb-3">
            <input class="form-check-input" type="checkbox" id="scimToggle" ${sc.enabled?'checked':''}>
            <label class="form-check-label" for="scimToggle">Enable SCIM user provisioning</label>
          </div>
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Base URL <span class="text-danger">*</span></label>
              <input id="scimBase" class="form-control" value="${escAttr(sc.base_url||'')}" placeholder="https://edx.example.com/api/scim/v2">
            </div>
            <div class="col-md-6">
              <label class="form-label">Bearer Token <span class="text-danger">*</span></label>
              <div class="input-group">
                <input id="scimToken" class="form-control" type="password" value="${escAttr(sc.token||'')}" placeholder="Paste or generate">
                <button id="btnRevealToken" class="btn btn-outline-secondary" type="button">Reveal</button>
              </div>
            </div>
          </div>
          <div class="d-flex flex-wrap gap-2 mt-3">
            <button id="btnGenToken" class="btn btn-outline-secondary btn-sm" type="button">Generate Token</button>
            <button id="btnRotateToken" class="btn btn-outline-secondary btn-sm" type="button">Rotate Token</button>
            <button id="btnSyncNow" class="btn btn-primary btn-sm" type="button" ${sc.enabled?'':'disabled'}>Sync Now (Test)</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function paneMappings(){
  const systems = ['All', ...Array.from(new Set(model.mappings.map(m=>m.system))).sort()];
  return `
    <div class="tab-pane fade" id="pane-mappings" role="tabpanel">
      <div class="card card-elevated">
        <div class="card-body">
          <div class="d-flex flex-wrap gap-2 mb-2">
            <div class="input-group input-group-sm search-wrap">
              <span class="input-group-text">Search</span>
              <input id="mQ" class="form-control" placeholder="source, target, note…" value="${escAttr(ui.mQ)}">
            </div>
            <div class="input-group input-group-sm" style="width:auto;">
              <label class="input-group-text">System</label>
              <select id="mSystem" class="form-select form-select-sm">
                ${systems.map(s=>`<option ${s===ui.mSystem?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="input-group input-group-sm" style="width:auto;">
              <label class="input-group-text">Rows/page</label>
              <select id="mSize" class="form-select form-select-sm">
                ${[10,25,50,100].map(n=>`<option value="${n}" ${n===ui.mSize?'selected':''}>${n}</option>`).join('')}
              </select>
            </div>
            <div class="btn-group btn-group-sm">
              <button id="btnExportMappings" class="btn btn-outline-secondary">Export CSV</button>
            </div>
          </div>

          <div class="table-responsive">
            <table id="mTable" class="table align-middle mb-0">
              <thead class="table-light">
                <tr>
                  ${th('source','Source Attribute','m')}
                  ${th('target','Target Attribute','m')}
                  ${th('transform','Transform','m')}
                  ${th('system','System','m')}
                  ${th('note','Note','m')}
                </tr>
              </thead>
              <tbody id="mBody"></tbody>
            </table>
          </div>

          <div class="d-flex align-items-center justify-content-end mt-2">
            <nav aria-label="Mappings pagination"><ul id="mPager" class="pagination pagination-sm mb-0"></ul></nav>
          </div>
        </div>
      </div>
    </div>
  `;
}

function paneLogs(){
  return `
    <div class="tab-pane fade" id="pane-logs" role="tabpanel">
      <div class="card card-elevated">
        <div class="card-body">
          <div class="d-flex flex-wrap gap-2 mb-2">
            <div class="input-group input-group-sm search-wrap">
              <span class="input-group-text">Search</span>
              <input id="lQ" class="form-control" placeholder="user, action, message…" value="${escAttr(ui.lQ)}">
            </div>
            <div class="input-group input-group-sm" style="width:auto;">
              <label class="input-group-text">Result</label>
              <select id="lResult" class="form-select form-select-sm">
                ${['All','SUCCESS','ERROR'].map(r=>`<option ${r===ui.lResult?'selected':''}>${r}</option>`).join('')}
              </select>
            </div>
            <div class="input-group input-group-sm" style="width:auto;">
              <label class="input-group-text">Rows/page</label>
              <select id="lSize" class="form-select form-select-sm">
                ${[10,25,50,100].map(n=>`<option value="${n}" ${n===ui.lSize?'selected':''}>${n}</option>`).join('')}
              </select>
            </div>
            <div class="btn-group btn-group-sm">
              <button id="btnExportLogs" class="btn btn-outline-secondary">Export CSV</button>
            </div>
          </div>

          <div class="table-responsive">
            <table id="lTable" class="table align-middle mb-0">
              <thead class="table-light">
                <tr>
                  ${th('time','Time','l')}
                  ${th('user','User','l')}
                  ${th('action','Action','l')}
                  ${th('result','Result','l')}
                  ${th('message','Message','l')}
                </tr>
              </thead>
              <tbody id="lBody"></tbody>
            </table>
          </div>

          <div class="d-flex align-items-center justify-content-end mt-2">
            <nav aria-label="Logs pagination"><ul id="lPager" class="pagination pagination-sm mb-0"></ul></nav>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* --------------------- Mount paginated tables ----------------- */
function mountMappings(){
  // filter
  const q = ui.mQ.trim().toLowerCase();
  let rows = model.mappings.filter(m=>{
    const hay = `${m.source} ${m.target} ${m.transform} ${m.system} ${m.note}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okS = ui.mSystem==='All' || m.system===ui.mSystem;
    return okQ && okS;
  });
  // sort
  rows.sort((a,b)=>{
    const va = String(a[ui.mSort]||'').toLowerCase();
    const vb = String(b[ui.mSort]||'').toLowerCase();
    const cmp = (va<vb?-1:va>vb?1:0);
    return ui.mDir==='asc'? cmp : -cmp;
  });
  // paginate
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/ui.mSize));
  ui.mPage = Math.min(Math.max(1, ui.mPage), pages);
  const start = (ui.mPage-1)*ui.mSize;
  const pageRows = rows.slice(start, start+ui.mSize);

  $('#mBody').innerHTML = pageRows.map(r=>`
    <tr>
      <td class="code-mono">${esc(r.source)}</td>
      <td class="code-mono">${esc(r.target)}</td>
      <td>${esc(r.transform || '')}</td>
      <td>${esc(r.system)}</td>
      <td class="small">${esc(r.note || '')}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="text-center text-body-secondary py-4">No matching mappings</td></tr>`;

  $('#mPager').innerHTML = pagesHtml(ui.mPage, pages, 'm');
  $('#mPager').querySelectorAll('.page-link[data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.mPage = Number(btn.getAttribute('data-page')); mountMappings(); });
  });
}

function mountLogs(){
  const q = ui.lQ.trim().toLowerCase();
  let rows = model.logs.filter(l=>{
    const hay = `${l.user} ${l.action} ${l.message}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okR = ui.lResult==='All' || l.result===ui.lResult;
    return okQ && okR;
  });
  rows.sort((a,b)=>{
    const va = ui.lSort==='time' ? a.time : String(a[ui.lSort]||'').toLowerCase();
    const vb = ui.lSort==='time' ? b.time : String(b[ui.lSort]||'').toLowerCase();
    const cmp = (va<vb?-1:va>vb?1:0);
    return ui.lDir==='asc'? cmp : -cmp;
  });

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/ui.lSize));
  ui.lPage = Math.min(Math.max(1, ui.lPage), pages);
  const start = (ui.lPage-1)*ui.lSize;
  const pageRows = rows.slice(start, start+ui.lSize);

  $('#lBody').innerHTML = pageRows.map(r=>`
    <tr>
      <td class="text-nowrap">${esc(fmtTime(r.time))}</td>
      <td>${esc(r.user)}</td>
      <td>${esc(r.action)}</td>
      <td>${r.result==='SUCCESS' ? '<span class="badge text-bg-success">SUCCESS</span>' : '<span class="badge text-bg-danger">ERROR</span>'}</td>
      <td class="small">${esc(r.message)}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="text-center text-body-secondary py-4">No matching logs</td></tr>`;

  $('#lPager').innerHTML = pagesHtml(ui.lPage, pages, 'l');
  $('#lPager').querySelectorAll('.page-link[data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.lPage = Number(btn.getAttribute('data-page')); mountLogs(); });
  });
}

/* --------------------- Actions --------------------------------*/
async function validateMetadata(){
  const url = (model.idp.metadata_url||'').trim();
  const issuer = (model.idp.issuer||'').trim();
  if(!url || !issuer){ alert('Issuer and Metadata URL are required.'); return; }
  // Demo "validation"
  const ok = /^https?:\/\//i.test(url) && /^https?:\/\//i.test(issuer);
  alert(ok ? 'Metadata looks valid (demo checks).' : 'Metadata appears invalid (demo checks).');
}
async function previewMetadata(){
  const meta = {
    provider: model.idp.provider,
    protocol: model.idp.protocol,
    issuer: model.idp.issuer,
    metadata_url: model.idp.metadata_url,
    authz_endpoint: model.idp.protocol==='OIDC' ? (model.idp.metadata_url + '/authorize') : undefined,
    token_endpoint: model.idp.protocol==='OIDC' ? (model.idp.metadata_url + '/token') : undefined,
    sso_redirect: model.idp.protocol==='SAML2' ? (model.idp.metadata_url + '/SAML2') : undefined
  };
  const text = JSON.stringify(meta, null, 2);
  $('#metadataPreview').textContent = text;
  $('#btnCopyMeta').onclick = async ()=>{ try{ await navigator.clipboard.writeText(text); alert('Copied!'); } catch{ alert('Copy failed'); } };
  openModal('#metadataModal');
}
function testLogin(){
  // Demo: just log an event
  model.logs.unshift({
    time: new Date().toISOString(),
    user: 'idp:test-user',
    action: `SSO Test (${model.idp.protocol})`,
    result: 'SUCCESS',
    message: `Tested login via ${model.idp.provider}`
  });
  saveLocal();
  mountLogs();
}

function toggleTokenReveal(){
  const inp = $('#scimToken');
  const btn = $('#btnRevealToken');
  if (inp.type==='password'){ inp.type='text'; btn.textContent='Hide'; }
  else { inp.type='password'; btn.textContent='Reveal'; }
}
function generateToken(){
  const tok = 'scim_' + Math.random().toString(36).slice(2,10) + '_' + Date.now().toString(36);
  model.scim.token = tok; render();
}
function rotateToken(){
  if(!model.scim.token){ return generateToken(); }
  const suffix = Math.random().toString(36).slice(2,8);
  model.scim.token = model.scim.token.replace(/(_[a-z0-9]+)?$/i, '_'+suffix);
  render();
}
function simulateSync(){
  const ok = Math.random() > 0.1;
  model.logs.unshift({
    time: new Date().toISOString(),
    user: 'scim:system',
    action: 'SCIM Sync',
    result: ok ? 'SUCCESS' : 'ERROR',
    message: ok ? 'Synced 12 users, 3 groups' : 'HTTP 401 from IdP — token rejected'
  });
  saveLocal();
  mountLogs();
}

/* --------------------- Exporters ------------------------------- */
function exportMappings(){
  const hdr = ['Source','Target','Transform','System','Note'];
  const rows = getAllMappingsFiltered().map(m=>[m.source,m.target,m.transform||'',m.system,m.note||'']);
  openCSV('mappings', toCSV([hdr, ...rows]));
}
function exportLogs(){
  const hdr = ['Time','User','Action','Result','Message'];
  const rows = getAllLogsFiltered().map(l=>[fmtTime(l.time), l.user, l.action, l.result, l.message]);
  openCSV('logs', toCSV([hdr, ...rows]));
}
function openCSV(name, text){
  $('#csvModalLabel').textContent = `CSV Preview — ${name}_${ts()}.csv`;
  $('#csvPreview').textContent = text;
  $('#btnCopyCsv').onclick = async ()=>{ try{ await navigator.clipboard.writeText(text); alert('Copied!'); } catch{ alert('Copy failed'); } };
  openModal('#csvModal');
}

/* --------------------- Helpers -------------------------------- */
function th(key,label,scope){
  const active = (scope==='m'?ui.mSort:ui.lSort)===key;
  const dir = scope==='m'?ui.mDir:ui.lDir;
  const arrow = active ? (dir==='asc'?'▲':'▼') : '';
  return `<th data-sort-key="${key}" role="button">${label} <span class="sort">${arrow}</span></th>`;
}
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
function getAllMappingsFiltered(){
  const q = ui.mQ.trim().toLowerCase();
  return model.mappings.filter(m=>{
    const hay = `${m.source} ${m.target} ${m.transform} ${m.system} ${m.note}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okS = ui.mSystem==='All' || m.system===ui.mSystem;
    return okQ && okS;
  }).sort((a,b)=>{
    const va = String(a[ui.mSort]||'').toLowerCase();
    const vb = String(b[ui.mSort]||'').toLowerCase();
    const cmp = (va<vb?-1:va>vb?1:0);
    return ui.mDir==='asc'? cmp : -cmp;
  });
}
function getAllLogsFiltered(){
  const q = ui.lQ.trim().toLowerCase();
  return model.logs.filter(l=>{
    const hay = `${l.user} ${l.action} ${l.message}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okR = ui.lResult==='All' || l.result===ui.lResult;
    return okQ && okR;
  }).sort((a,b)=>{
    const va = ui.lSort==='time' ? a.time : String(a[ui.lSort]||'').toLowerCase();
    const vb = ui.lSort==='time' ? b.time : String(b[ui.lSort]||'').toLowerCase();
    const cmp = (va<vb?-1:va>vb?1:0);
    return ui.lDir==='asc'? cmp : -cmp;
  });
}
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function fmtTime(iso){ try{ return new Date(iso).toLocaleString(); } catch{ return iso; } }
function toCSV(rows){ const BOM='\uFEFF'; return BOM + rows.map(r=>r.map(c=>csvCell(c)).join(',')).join('\r\n'); }
function csvCell(v){ const s=String(v??''); return /[",\r\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
