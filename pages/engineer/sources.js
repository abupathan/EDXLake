// sources.js — Sources list + New Connector wizard (EDX aligned)
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const jsonUrl = 'sources.json';

const STATE = {
  all: [],
  filtered: [],
  page: 0,
  pageSize: 10,
  registry: null,
  wizardStep: 1,
  draft: {
    category: '', vendor: '', name: '',
    authType: '', auth: {},
    scope: { type: 'District', values: [] },
    schedule: { cadence: 'Daily', start: '02:00', retry: { maxAttempts: 3, backoff: 'exponential' } },
    classifications: ['PII_DIRECTORY'], purposeAck: false
  }
};

(async function init(){
  // Load partials then data
  try {
    if (window.EDXPartials && typeof window.EDXPartials.loadPartials === 'function') {
      window.EDXPartials.loadPartials({ sidebar: 'engineer' });
    }
  } catch {}
  const data = await fetch(jsonUrl).then(r=>r.json()).catch(()=>({ sources: [], registry: null }));
  STATE.all = data.sources || [];
  STATE.registry = data.registry || null;
  bindFilters(STATE.registry);
  applyFilters();
  // Deep link: #new opens wizard
  if (location.hash === '#new') openWizard();
  $('#btn-new').addEventListener('click', openWizard);
})();

// ---------- Table & Pagination ----------
function applyFilters(){
  const q = ($('#q')?.value || '').toLowerCase().trim();
  const cat = $('#f-category')?.value || '';
  const ven = $('#f-vendor')?.value || '';
  const st  = $('#f-status')?.value || '';
  STATE.filtered = STATE.all.filter(x => {
    const okQ = !q || JSON.stringify(x).toLowerCase().includes(q);
    const okC = !cat || x.category === cat;
    const okV = !ven || x.system === ven;
    const okS = !st  || x.status === st;
    return okQ && okC && okV && okS;
  });
  STATE.page = 0;
  renderTable();
}

function renderTable(){
  const rows = $('#rows');
  if (!rows) return;
  const start = STATE.page * STATE.pageSize;
  const pageItems = STATE.filtered.slice(start, start + STATE.pageSize);
  rows.innerHTML = pageItems.map(s => rowHtml(s)).join('') || `<tr><td class="p-3" colspan="7">No sources match.</td></tr>`;
  const pages = Math.max(1, Math.ceil(STATE.filtered.length / STATE.pageSize));
  $('#pg-info').textContent = `Page ${STATE.page + 1} of ${pages}`;
  $('#pg-first').disabled = $('#pg-prev').disabled = STATE.page <= 0;
  $('#pg-last').disabled  = $('#pg-next').disabled = STATE.page >= pages - 1;
  // wire row actions
  rows.querySelectorAll('button[data-action="test"]').forEach(b => b.addEventListener('click', onTestConnection));
  rows.querySelectorAll('button[data-action="disable"]').forEach(b => b.addEventListener('click', ()=>alert('Disabled (demo)')));
  rows.querySelectorAll('button[data-action="delete"]').forEach(b => b.addEventListener('click', onDelete));
}

function rowHtml(s){
  const tone = { Healthy:'success', Warning:'warning', Error:'danger', Disabled:'secondary' }[s.status] || 'secondary';
  return `
    <tr>
      <td class="fw-semibold">${s.system}</td>
      <td>${s.category}</td>
      <td>${s.auth}</td>
      <td>${s.cadence}</td>
      <td><span class="badge text-bg-${tone}">${s.status}</span></td>
      <td class="text-nowrap">${s.last_run || '—'}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <a class="btn btn-outline-secondary" href="pipeline-detail.html">Runs</a>
          <button class="btn btn-outline-secondary" data-action="test">Test</button>
          <button class="btn btn-outline-secondary" data-action="disable">Disable</button>
          <button class="btn btn-outline-danger" data-action="delete">Delete</button>
        </div>
      </td>
    </tr>`;
}

function bindFilters(reg){
  // search
  $('#q').addEventListener('input', applyFilters);
  // dropdowns
  const catSel = $('#f-category'), venSel = $('#f-vendor'), stSel = $('#f-status');
  const cats = reg?.categories || Array.from(new Set(STATE.all.map(s=>s.category)));
  catSel.innerHTML = `<option value="">All</option>${cats.map(c=>`<option>${c}</option>`).join('')}`;
  // vendors follow category selection
  catSel.addEventListener('change', ()=>{
    const vens = (reg?.vendors?.[catSel.value]) || (STATE.all.filter(s=>!catSel.value || s.category===catSel.value).map(s=>s.system));
    venSel.innerHTML = `<option value="">All</option>${Array.from(new Set(vens)).map(v=>`<option>${v}</option>`).join('')}`;
    applyFilters();
  });
  venSel.addEventListener('change', applyFilters);
  stSel.addEventListener('change', applyFilters);

  // pager
  $('#pg-first').addEventListener('click', ()=>{ STATE.page=0; renderTable(); });
  $('#pg-prev').addEventListener('click', ()=>{ STATE.page=Math.max(0, STATE.page-1); renderTable(); });
  $('#pg-next').addEventListener('click', ()=>{ const pages = Math.ceil(STATE.filtered.length/STATE.pageSize); STATE.page=Math.min(pages-1, STATE.page+1); renderTable(); });
  $('#pg-last').addEventListener('click', ()=>{ const pages = Math.ceil(STATE.filtered.length/STATE.pageSize); STATE.page=pages-1; renderTable(); });
}

// ---------- Row Actions ----------
async function onTestConnection(e){
  const tr = e.target.closest('tr');
  const name = tr?.querySelector('td')?.textContent || 'Source';
  e.target.disabled = true;
  e.target.textContent = 'Testing…';
  setTimeout(()=>{
    e.target.disabled = false;
    e.target.textContent = 'Test';
    const ok = Math.random() > 0.1;
    const msg = ok ? `${name}: connection OK (demo)` : `${name}: connection error (demo)`;
    alert(msg);
  }, 900);
}

function onDelete(e){
  if (!confirm('Delete this connector? This action is audit-logged (demo).')) return;
  const tr = e.target.closest('tr');
  const sys = tr.querySelector('td').textContent;
  STATE.all = STATE.all.filter(x => x.system !== sys);
  applyFilters();
}

// ---------- Wizard ----------
let wizardModal, step = 1;

function openWizard(){
  // build steps into container
  step = 1;
  renderStep();
  wizardModal = new bootstrap.Modal($('#wizard'));
  wizardModal.show();
  $('#btn-back').disabled = true;
  $('#btn-create').classList.add('d-none');
  $('#btn-next').classList.remove('d-none');

  $('#btn-back').onclick = () => { if (step>1){ step--; renderStep(); } };
  $('#btn-next').onclick = () => { if (validateStep(step)){ step++; renderStep(); } };
  $('#btn-create').onclick = onCreateConnector;
  $('#wiz-close').onclick = () => { if (location.hash === '#new') history.replaceState(null, '', 'sources.html'); };
}

function renderStep(){
  $('#step-container').innerHTML = stepHtml(step);
  // buttons
  $('#btn-back').disabled = (step === 1);
  const isFinal = (step === 6);
  $('#btn-create').classList.toggle('d-none', !isFinal);
  $('#btn-next').classList.toggle('d-none', isFinal);
  // update breadcrumb active marker
  $$('#stepper .breadcrumb-item').forEach((li, i)=> li.classList.toggle('active', i===step-1));
  // wire dynamic bits
  if (step === 1) bindStep1();
  if (step === 2) bindStep2();
  if (step === 3) bindStep3();
  if (step === 4) bindStep4();
  if (step === 5) bindStep5();
}

function stepHtml(s){
  switch(s){
    case 1: return `
      <div class="wiz-grid">
        <div>
          <label class="form-label">Category</label>
          <select id="w-cat" class="form-select" required>
            <option value="">Select…</option>
            ${(STATE.registry?.categories||[]).map(c=>`<option ${c===STATE.draft.category?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Vendor</label>
          <select id="w-vendor" class="form-select" required>
            <option value="">Select…</option>
          </select>
        </div>
        <div class="col-12">
          <label class="form-label mt-2">Connector Name</label>
          <input id="w-name" class="form-control" placeholder="e.g., sis-powerschool" value="${STATE.draft.name||''}" required>
          <div class="form-text">Use a short, unique, lowercase name. This appears in runs & audit.</div>
        </div>
      </div>`;
    case 2: return `
      <div class="wiz-grid">
        <div>
          <label class="form-label">Auth Method</label>
          <select id="w-auth" class="form-select" required>
            <option value="">Select…</option>
            ${Object.keys(STATE.registry?.auth_methods||{}).map(k=>`<option ${k===STATE.draft.authType?'selected':''}>${k}</option>`).join('')}
          </select>
          <div class="help mt-2">Secrets are stored in the platform vault; only masked previews are shown here.</div>
        </div>
        <div id="auth-fields"></div>
        <div class="col-12">
          <button id="btn-test" type="button" class="btn btn-outline-primary btn-sm"><i class="bi bi-wifi"></i> Test Connection</button>
          <span id="test-result" class="ms-2 small"></span>
        </div>
      </div>`;
    case 3: return `
      <div class="wiz-grid-3">
        <div>
          <label class="form-label">Scope Type</label>
          <select id="w-scope-type" class="form-select">
            ${['District','School','Program','Term'].map(x=>`<option ${x===STATE.draft.scope.type?'selected':''}>${x}</option>`).join('')}
          </select>
          <div class="form-text">ABAC row-level policies will constrain data to selected scope(s).</div>
        </div>
        <div class="col-12">
          <label class="form-label">Scope Values</label>
          <input id="w-scope-values" class="form-control" placeholder="Comma-separated codes (e.g., DIST-001, HS-EAST)" value="${STATE.draft.scope.values.join(', ')}">
          <div class="form-text">Enter 1+ identifiers. You can refine later.</div>
        </div>
        <div class="col-12">
          <label class="form-label">Preview (sample)</label>
          <div class="border rounded p-2 code">/ingest/${STATE.draft.name||'connector'}/{entity}?scope=${STATE.draft.scope.type.toLowerCase()}</div>
        </div>
      </div>`;
    case 4: return `
      <div class="wiz-grid">
        <div>
          <label class="form-label">Cadence</label>
          <select id="w-cadence" class="form-select">
            ${['Hourly','Nightly','Daily','Weekly','Term'].map(c=>`<option ${c===STATE.draft.schedule.cadence?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Start Window (local time)</label>
          <input id="w-start" type="time" class="form-control" value="${STATE.draft.schedule.start}">
        </div>
        <div>
          <label class="form-label">Retry Policy</label>
          <div class="input-group">
            <span class="input-group-text">Attempts</span>
            <input id="w-retry-attempts" type="number" min="0" max="10" class="form-control" value="${STATE.draft.schedule.retry.maxAttempts}">
            <span class="input-group-text">Backoff</span>
            <select id="w-retry-backoff" class="form-select">
              ${['fixed','linear','exponential'].map(b=>`<option ${b===STATE.draft.schedule.retry.backoff?'selected':''}>${b}</option>`).join('')}
            </select>
          </div>
          <div class="form-text">Operational SLOs and alerts are applied after creation.</div>
        </div>
      </div>`;
    case 5: return `
      <div class="wiz-grid">
        <div>
          <label class="form-label">Data Classifications (from spec)</label>
          <div class="form-check">${STATE.registry.classifications.map(c => `
            <input class="form-check-input" type="checkbox" value="${c}" id="cls-${c}">
            <label class="form-check-label" for="cls-${c}">${c}</label>`).join('')}
          </div>
          <div class="help mt-2">Masking rules will be applied dynamically across SQL/API/Exports.</div>
        </div>
        <div>
          <div class="form-check mt-4">
            <input class="form-check-input" type="checkbox" id="w-purpose">
            <label class="form-check-label" for="w-purpose">I acknowledge purpose limitation & masking enforcement for this connector.</label>
          </div>
          <div class="help mt-2">Promotion to canonical/publish requires Steward approval; this step only creates the ingest connector.</div>
        </div>
      </div>`;
    case 6: return `
      <div class="wiz-grid">
        <div class="border rounded p-2">
          <h6>Summary</h6>
          <ul class="mb-0 small">
            <li><strong>Name:</strong> ${STATE.draft.name || '(not set)'}</li>
            <li><strong>System:</strong> ${STATE.draft.vendor || '(not set)'} <span class="text-body-secondary">(${STATE.draft.category})</span></li>
            <li><strong>Auth:</strong> ${STATE.draft.authType}</li>
            <li><strong>Scope:</strong> ${STATE.draft.scope.type} → ${STATE.draft.scope.values.join(', ') || '(all)'} </li>
            <li><strong>Schedule:</strong> ${STATE.draft.schedule.cadence} @ ${STATE.draft.schedule.start}, retries ${STATE.draft.schedule.retry.maxAttempts} (${STATE.draft.schedule.retry.backoff})</li>
            <li><strong>Classifications:</strong> ${STATE.draft.classifications.join(', ')}</li>
          </ul>
        </div>
        <div class="border rounded p-2">
          <h6>Compliance & Audit</h6>
          <ul class="small mb-0">
            <li>Secrets are stored in the vault; only masked previews appear in UI.</li>
            <li>All actions are immutably audit-logged with actor & timestamp.</li>
            <li>ABAC row policies will constrain reads; masking applies everywhere.</li>
            <li>Steward approval is required for promotion to canonical/publish.</li>
          </ul>
        </div>
      </div>`;
  }
}

function bindStep1(){
  const catSel = $('#w-cat'), venSel = $('#w-vendor'), nameIn = $('#w-name');
  const fillVendors = ()=>{
    const list = (STATE.registry?.vendors?.[catSel.value]) || [];
    venSel.innerHTML = `<option value="">Select…</option>${list.map(v=>`<option ${v===STATE.draft.vendor?'selected':''}>${v}</option>`).join('')}`;
  };
  catSel.addEventListener('change', ()=>{ STATE.draft.category = catSel.value; fillVendors(); });
  venSel.addEventListener('change', ()=>{ STATE.draft.vendor = venSel.value; if(!nameIn.value && venSel.value) nameIn.value = slug(venSel.value); });
  nameIn.addEventListener('input', ()=> STATE.draft.name = nameIn.value.trim());
  // init values
  if (STATE.draft.category) catSel.value = STATE.draft.category;
  fillVendors();
  if (STATE.draft.vendor) venSel.value = STATE.draft.vendor;
}

function bindStep2(){
  const authSel = $('#w-auth'), authFields = $('#auth-fields'), testBtn = $('#btn-test'), testOut = $('#test-result');
  const renderAuth = ()=>{
    const fields = STATE.registry?.auth_methods?.[authSel.value] || [];
    STATE.draft.authType = authSel.value;
    STATE.draft.auth = Object.fromEntries(fields.map(f => [f, '']));
    authFields.innerHTML = fields.map(label => `
      <div class="mb-2">
        <label class="form-label">${label}</label>
        <input class="form-control" data-auth="${label}">
      </div>`).join('') || `<div class="help">Select an auth method to continue.</div>`;
    // updates
    authFields.querySelectorAll('input[data-auth]').forEach(inp => {
      inp.addEventListener('input', ()=> STATE.draft.auth[inp.dataset.auth] = inp.value);
    });
  };
  authSel.addEventListener('change', renderAuth);
  renderAuth();
  testBtn.addEventListener('click', ()=>{
    testBtn.disabled = true; testOut.textContent = 'Testing…';
    setTimeout(()=>{
      testBtn.disabled = false;
      const ok = !!STATE.draft.authType && Object.values(STATE.draft.auth).some(v => v && v.length>2);
      testOut.textContent = ok ? 'Connection OK (demo)' : 'Connection failed (demo)';
      testOut.className = 'ms-2 small ' + (ok ? 'text-success' : 'text-danger');
    }, 900);
  });
}

function bindStep3(){
  const tSel = $('#w-scope-type'), vIn = $('#w-scope-values');
  tSel.addEventListener('change', ()=> STATE.draft.scope.type = tSel.value);
  vIn.addEventListener('input', ()=> STATE.draft.scope.values = vIn.value.split(',').map(s=>s.trim()).filter(Boolean));
}

function bindStep4(){
  $('#w-cadence').addEventListener('change', e => STATE.draft.schedule.cadence = e.target.value);
  $('#w-start').addEventListener('input',  e => STATE.draft.schedule.start   = e.target.value);
  $('#w-retry-attempts').addEventListener('input', e => STATE.draft.schedule.retry.maxAttempts = Number(e.target.value||0));
  $('#w-retry-backoff').addEventListener('change', e => STATE.draft.schedule.retry.backoff     = e.target.value);
}

function bindStep5(){
  // checks for classifications + purpose ack
  (STATE.registry?.classifications||[]).forEach(c=>{
    const el = document.getElementById(`cls-${c}`);
    if (!el) return;
    el.checked = STATE.draft.classifications.includes(c);
    el.addEventListener('change', ()=> {
      if (el.checked && !STATE.draft.classifications.includes(c)) STATE.draft.classifications.push(c);
      if (!el.checked) STATE.draft.classifications = STATE.draft.classifications.filter(x=>x!==c);
    });
  });
  const ack = $('#w-purpose');
  ack.checked = STATE.draft.purposeAck;
  ack.addEventListener('change', ()=> STATE.draft.purposeAck = ack.checked);
}

function validateStep(s){
  if (s === 1){
    if (!STATE.draft.category || !STATE.draft.vendor || !STATE.draft.name){
      alert('Please select category/vendor and provide a name.');
      return false;
    }
  }
  if (s === 2){
    if (!STATE.draft.authType){ alert('Choose an auth method.'); return false; }
  }
  if (s === 5){
    if (!STATE.draft.purposeAck){ alert('Please acknowledge purpose & masking.'); return false; }
  }
  return true;
}

function onCreateConnector(){
  // Append to table (demo). Real system would call API and wait for Steward promotion for publish.
  const created = {
    system: STATE.draft.vendor,
    category: STATE.draft.category,
    auth: STATE.draft.authType,
    cadence: STATE.draft.schedule.cadence,
    status: "Healthy",
    last_run: ""
  };
  STATE.all.unshift(created);
  applyFilters();
  wizardModal.hide();
  alert('Connector created (demo). Audit log recorded. Steward approval required to promote downstream artifacts.');
  if (location.hash === '#new') history.replaceState(null, '', 'sources.html');
}

function slug(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }
