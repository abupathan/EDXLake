// New Source Wizard — production-ready (Bootstrap UI, validation, least-privilege, audit copy)
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const main    = $('#app-main');
const jsonUrl = 'source-wizard.json';

const STATE = {
  step: 1,
  data: {},
  form: {
    connector: null,
    auth_mode: null,   // 'oauth2' | 'sftp'
    creds: {},         // secrets handled as masked inputs (tenant-scoped)
    domains: [],
    cadence: null,
    tz: null,
    window: { start:'', end:'' },
    retry_policy: null,
    abac: { org:'DIST-001', campus:'', program:'', term:'' }
  }
};

(async function init(){
  try {
    // Load header/sidebar/footer via global partials
    if (window.EDXPartials && typeof window.EDXPartials.loadPartials === 'function') {
      await window.EDXPartials.loadPartials({ sidebar: 'engineer' });
    }
  } catch(e){ console.error('Partials load failed', e); }

  STATE.data = await fetch(jsonUrl, { cache:'no-store' }).then(r=>r.json()).catch(()=>({}));
  // seed defaults
  STATE.form.cadence      = STATE.data.defaults?.cadence || 'Daily';
  STATE.form.tz           = STATE.data.defaults?.tz || 'UTC';
  STATE.form.window       = STATE.data.defaults?.window || { start:'02:00', end:'04:00' };
  STATE.form.retry_policy = STATE.data.defaults?.retry_policy || 'default_exponential';

  render();
})();

/* -------------------- Render -------------------- */
function render(){
  const s = STATE.step;
  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">New Source Wizard</h1>
        <div class="small text-body-secondary">Tenant-scoped configuration. Secrets are stored in a secure vault. All actions are audit-logged.</div>
      </div>
      <div class="wiz-actions">
        <a class="btn btn-outline-secondary btn-sm" href="sources.html">Cancel</a>
        ${s>1 ? `<button id="btnPrev" class="btn btn-outline-secondary btn-sm">Back</button>` : ''}
        <button id="btnNext" class="btn btn-primary btn-sm">${s<5?'Next':'Finish'}</button>
      </div>
    </div>

    ${stepper(s)}

    ${s===1 ? step1() : s===2 ? step2() : s===3 ? step3() : s===4 ? step4() : step5()}
  `;

  $('#btnNext').addEventListener('click', onNext);
  if ($('#btnPrev')) $('#btnPrev').addEventListener('click', ()=>{ STATE.step = Math.max(1, STATE.step-1); render(); });

  // wire per-step extras
  if (s===1) bindStep1();
  if (s===2) bindStep2();
  if (s===3) bindStep3();
  if (s===4) bindStep4();
  if (s===5) bindStep5();
}

function stepper(step){
  const labels = ['Connector','Credentials','Scope & Schedule','Policy Preview','Test & Create'];
  return `
    <div class="stepper">
      ${labels.map((label,i)=>`
        <div class="step ${i+1===step?'active':''}">
          <span class="idx">${i+1}</span>${label}
        </div>`).join('')}
    </div>`;
}

/* -------------------- Step 1: Choose connector & mode -------------------- */
function step1(){
  const list = STATE.data.connectors||[];
  return `
    <div class="card shadow-sm">
      <div class="card-header bg-body d-flex justify-content-between align-items-center">
        <strong>Choose Connector</strong>
        <span class="small text-body-secondary">Supported auth: OAuth2 / SFTP (per connector)</span>
      </div>
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light"><tr><th>System</th><th>Category</th><th>Modes</th><th>Auth</th><th class="text-end">Select</th></tr></thead>
          <tbody>
            ${list.map(c=>`
              <tr>
                <td class="fw-semibold">${escapeHtml(c.system)}</td>
                <td>${escapeHtml(c.category)}</td>
                <td>${escapeHtml(c.modes)}</td>
                <td>${escapeHtml(c.auth)}</td>
                <td class="text-end">
                  <button class="btn btn-sm btn-outline-primary pick-connector" data-system="${escapeAttr(c.system)}">Use</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card-footer small text-body-secondary">Selection is tenant-scoped; catalog visibility is governed.</div>
    </div>`;
}
function bindStep1(){
  $$('.pick-connector').forEach(b=> b.addEventListener('click', ()=>{
    STATE.form.connector = b.dataset.system;
    // pick auth mode default (prefer OAuth2 if available)
    STATE.form.auth_mode = /OAuth2/i.test(getConnector(STATE.form.connector)?.auth || '') ? 'oauth2' : 'sftp';
    render();
  }));
}
function getConnector(name){ return (STATE.data.connectors||[]).find(c => c.system === name); }

/* -------------------- Step 2: Credentials (least-privilege) -------------------- */
function step2(){
  const authMode = STATE.form.auth_mode || 'oauth2';
  const schema = STATE.data.auth_schemas?.[authMode]?.fields || [];
  return `
    <div class="card shadow-sm">
      <div class="card-header bg-body d-flex justify-content-between align-items-center">
        <strong>Credentials</strong>
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" role="switch" id="modeSwitch" ${authMode==='sftp'?'checked':''}>
          <label class="form-check-label" for="modeSwitch">Use SFTP</label>
        </div>
      </div>
      <div class="card-body">
        <div class="row g-3">
          ${schema.map(f => `
            <div class="col-md-6">
              <label class="form-label">${escapeHtml(f.label)} ${f.required?'<span class="text-danger">*</span>':''}</label>
              ${inputFor(f)}
              <div class="form-text">${hintFor(f)}</div>
            </div>`).join('')}
          <div class="col-12"><small class="text-body-secondary">Secrets are stored encrypted in the vault; values are masked in logs.</small></div>
        </div>
      </div>
    </div>`;
}
function inputFor(f){
  const val = STATE.form.creds[f.id] || '';
  if (f.type === 'textarea') return `<textarea data-id="${f.id}" class="form-control" rows="3" placeholder="${escapeAttr(f.label)}">${escapeHtml(val)}</textarea>`;
  return `<input data-id="${f.id}" class="form-control" type="${f.type||'text'}" placeholder="${escapeAttr(f.label)}" value="${escapeAttr(val)}">`;
}
function hintFor(f){
  const map = {
    token_url: 'Vendor token endpoint (OAuth2).',
    auth_url:  'Used for interactive OAuth2 consent if required.',
    scope:     'Space-delimited OAuth scopes (least-privilege).',
    host:      'SFTP hostname provided by vendor.',
    key:       'Paste private key PEM if key-based auth is required.'
  };
  return map[f.id] || '';
}
function bindStep2(){
  // toggle mode
  $('#modeSwitch').addEventListener('change', (e)=>{
    STATE.form.auth_mode = e.target.checked ? 'sftp' : 'oauth2';
    STATE.form.creds = {}; // reset for mode change
    render();
  });
  // bind inputs
  $$('#app-main [data-id]').forEach(el => el.addEventListener('input', (e)=>{
    const id = e.target.getAttribute('data-id');
    STATE.form.creds[id] = e.target.value;
  }));
}

/* -------------------- Step 3: Scope & Schedule -------------------- */
function step3(){
  const domains = STATE.data.domains||[];
  const cadences = STATE.data.cadences||[];
  const policies = STATE.data.retry_policies||[];
  const cad = STATE.form.cadence;
  const tz  = STATE.form.tz;

  return `
    <div class="card shadow-sm">
      <div class="card-header bg-body"><strong>Scope & Schedule</strong></div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Domains <span class="text-danger">*</span></label>
            <select id="fDomains" class="form-select" multiple>
              ${domains.map(x=>`<option ${STATE.form.domains.includes(x)?'selected':''}>${escapeHtml(x)}</option>`).join('')}
            </select>
            <div class="form-text">Domains influence policy tags and masking.</div>
          </div>
          <div class="col-md-3">
            <label class="form-label">Cadence</label>
            <select id="fCadence" class="form-select">
              ${cadences.map(x=>`<option ${x===cad?'selected':''}>${escapeHtml(x)}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Timezone</label>
            <input id="fTz" class="form-control" value="${escapeAttr(tz)}" placeholder="UTC">
          </div>
          <div class="col-md-3">
            <label class="form-label">Window Start</label>
            <input id="fWStart" class="form-control" value="${escapeAttr(STATE.form.window.start)}" placeholder="HH:MM">
          </div>
          <div class="col-md-3">
            <label class="form-label">Window End</label>
            <input id="fWEnd" class="form-control" value="${escapeAttr(STATE.form.window.end)}" placeholder="HH:MM">
          </div>
          <div class="col-md-6">
            <label class="form-label">Retry Policy</label>
            <select id="fRetry" class="form-select">
              ${policies.map(p=>`<option ${p.name===STATE.form.retry_policy?'selected':''} value="${escapeAttr(p.name)}">${escapeHtml(p.name)} (${escapeHtml(p.strategy)})</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    </div>`;
}
function bindStep3(){
  $('#fDomains').addEventListener('change', (e)=>{
    STATE.form.domains = Array.from(e.target.selectedOptions).map(o=>o.value);
  });
  $('#fCadence').addEventListener('change', e => STATE.form.cadence = e.target.value);
  $('#fTz').addEventListener('input', e => STATE.form.tz = e.target.value);
  $('#fWStart').addEventListener('input', e => STATE.form.window.start = e.target.value);
  $('#fWEnd').addEventListener('input', e => STATE.form.window.end = e.target.value);
  $('#fRetry').addEventListener('change', e => STATE.form.retry_policy = e.target.value);
}

/* -------------------- Step 4: Policy Preview (masking & ABAC) -------------------- */
function step4(){
  const policyHints = STATE.data.policy?.classification_hints || {};
  const tags = STATE.form.domains.flatMap(d => policyHints[d] || []);
  const uniqTags = Array.from(new Set(tags));
  const abac = STATE.form.abac;

  return `
    <div class="card shadow-sm">
      <div class="card-header bg-body"><strong>Policy Preview</strong></div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-lg-6">
            <div class="border rounded p-3">
              <div class="small text-body-secondary mb-1">Classification & Masking</div>
              ${uniqTags.length
                ? uniqTags.map(t => `<span class="badge rounded-pill text-bg-secondary me-1">${escapeHtml(t)}</span>`).join(' ')
                : '<span class="text-body-secondary">No inferred tags</span>'}
              <div class="small mt-2">Masking applies across SQL, API, exports, and shares.</div>
            </div>
          </div>
          <div class="col-lg-6">
            <div class="border rounded p-3">
              <div class="small text-body-secondary mb-1">Row-Level Scope (ABAC)</div>
              <div class="row g-2">
                <div class="col-md-6"><label class="form-label">Org</label><input id="abacOrg" class="form-control" value="${escapeAttr(abac.org)}"></div>
                <div class="col-md-6"><label class="form-label">Campus</label><input id="abacCampus" class="form-control" value="${escapeAttr(abac.campus)}"></div>
                <div class="col-md-6"><label class="form-label">Program</label><input id="abacProgram" class="form-control" value="${escapeAttr(abac.program)}"></div>
                <div class="col-md-6"><label class="form-label">Term</label><input id="abacTerm" class="form-control" value="${escapeAttr(abac.term)}"></div>
              </div>
              <div class="small mt-2 text-body-secondary">Preview only; actual enforcement occurs server-side.</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}
function bindStep4(){
  $('#abacOrg').addEventListener('input', e => STATE.form.abac.org = e.target.value);
  $('#abacCampus').addEventListener('input', e => STATE.form.abac.campus = e.target.value);
  $('#abacProgram').addEventListener('input', e => STATE.form.abac.program = e.target.value);
  $('#abacTerm').addEventListener('input', e => STATE.form.abac.term = e.target.value);
}

/* -------------------- Step 5: Test & Create (demo-safe) -------------------- */
function step5(){
  const test = STATE.data.simulated_test || { success:false, latency_ms:0, scopes_granted:[] };
  return `
    <div class="card shadow-sm">
      <div class="card-header bg-body"><strong>Test & Create</strong></div>
      <div class="card-body">
        <p class="mb-2">Validate credentials and connectivity before enabling. All actions are audit-logged.</p>
        <div class="d-flex gap-2 mb-3">
          <button class="btn btn-outline-secondary btn-sm" id="btnTest">Run Test</button>
          <span id="testStatus" class="small text-body-secondary"></span>
        </div>
        <div class="border rounded p-3">
          <div class="small text-body-secondary mb-1">Summary</div>
          <pre class="mb-0 small bg-light p-2 border rounded">${escapeHtml(JSON.stringify(STATE.form, null, 2))}</pre>
        </div>
      </div>
    </div>`;
}
function bindStep5(){
  $('#btnTest').addEventListener('click', ()=>{
    // demo-only success based on JSON fixture
    const ok = STATE.data.simulated_test?.success;
    const note = ok ? `Success in ${STATE.data.simulated_test.latency_ms}ms` : 'Failed — check credentials';
    $('#testStatus').textContent = note + ' (demo)';
    setTimeout(()=>$('#testStatus').textContent='', 2000);
  });
}

/* -------------------- Navigation & Validation -------------------- */
function onNext(){
  if (!validateStep(STATE.step)) return;
  if (STATE.step < 5) { STATE.step += 1; render(); }
  else {
    alert('Source created (demo). Promotion to publish remains Steward-gated. Audit log recorded.');
    window.location.href = 'sources.html';
  }
}

function validateStep(step){
  if (step === 1){
    if (!STATE.form.connector){
      alert('Please pick a connector.'); return false;
    }
  }
  if (step === 2){
    const mode = STATE.form.auth_mode || 'oauth2';
    const fields = (STATE.data.auth_schemas?.[mode]?.fields || []).filter(f=>f.required);
    for (const f of fields){
      if (!STATE.form.creds[f.id] || !String(STATE.form.creds[f.id]).trim()){
        alert(`Missing required: ${f.label}`); return false;
      }
    }
  }
  if (step === 3){
    if (!STATE.form.domains.length){
      alert('Select at least one domain.'); return false;
    }
    if (!/^\d{2}:\d{2}$/.test(STATE.form.window.start) || !/^\d{2}:\d{2}$/.test(STATE.form.window.end)){
      alert('Window must be HH:MM.'); return false;
    }
  }
  return true;
}

/* -------------------- Utils -------------------- */
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return String(s ?? '').replace(/"/g,'&quot;'); }
