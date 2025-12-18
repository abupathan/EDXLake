/* EDX — Request Broader Access (Data Consumer)
 * - Read-only summary of current scopes to reduce back-and-forth
 * - Simple form to request broader scope/purpose
 * - Demo submit: validates, shows confirm modal, "submits" locally, shows reference ID
 * CSP-safe; no inline JS/CSS. All strings loaded from JSON config.
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const main = $('#main');

const DATA_URL = './request-access.json';

let CONFIG = null;

function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }

async function load(){
  try{
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    CONFIG = await res.json();
    render();
  }catch(e){
    console.error('[EDX] request-access load failed', e);
    main.innerHTML = `<div class="alert alert-danger">Failed to load request-access configuration.</div>`;
  }
}

/* ---------- Render ---------- */
function chip(list){ return (list||[]).map(t=>`<span class="badge rounded-pill badge-chip me-1">${esc(t)}</span>`).join(''); }

function summaryCard(){
  const ca = CONFIG.current_access || {};
  const scopes = ca.scopes || {};
  const sensitivity = ca.sensitivity_outcome || 'PII masked';
  return `
    <section class="card shadow-sm summary-card mb-3" aria-labelledby="sumLbl">
      <div class="card-header d-flex align-items-center gap-2">
        <i class="bi bi-person-badge" aria-hidden="true"></i>
        <strong id="sumLbl">Your current access</strong>
      </div>
      <div class="card-body">
        <dl class="row kv mb-0">
          <dt>Role</dt><dd>${esc(ca.role||'Data Consumer')}</dd>
          <dt>Purpose(s)</dt><dd>${chip(ca.purposes||[]) || '—'}</dd>
          <dt>Org scope</dt><dd>${chip(scopes.org||[]) || '—'}</dd>
          <dt>Campus scope</dt><dd>${chip(scopes.campus||[]) || '—'}</dd>
          <dt>Program scope</dt><dd>${chip(scopes.program||[]) || '—'}</dd>
          <dt>Term scope</dt><dd>${chip(scopes.term||[]) || '—'}</dd>
          <dt>Sensitivity outcome</dt><dd><span class="badge text-bg-secondary">${esc(sensitivity)}</span></dd>
        </dl>
      </div>
    </section>`;
}

function optionsHtml(list){ return (list||[]).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join(''); }

function formCard(){
  const o = CONFIG.options || {};
  return `
    <section class="card shadow-sm" aria-labelledby="formLbl">
      <div class="card-header d-flex align-items-center gap-2">
        <i class="bi bi-flag" aria-hidden="true"></i>
        <strong id="formLbl">Request broader access</strong>
      </div>
      <div class="card-body">
        <form id="accessForm" novalidate>
          <div class="form-section">
            <label for="purpose" class="form-label required">Requested purpose</label>
            <select id="purpose" class="form-select" required>
              <option value="">Select a purpose</option>
              ${optionsHtml(o.purposes)}
            </select>
            <div class="form-text help-muted">${esc(CONFIG.help.purpose_hint)}</div>
          </div>

          <fieldset class="form-section" aria-describedby="scopeHelp">
            <legend>Requested scope</legend>
            <div id="scopeHelp" class="help-muted mb-2">${esc(CONFIG.help.scope_hint)}</div>
            <div class="row g-3">
              <div class="col-md-6">
                <label for="org" class="form-label">Organization(s)</label>
                <select id="org" class="form-select" multiple>
                  ${optionsHtml(o.orgs)}
                </select>
              </div>
              <div class="col-md-6">
                <label for="campus" class="form-label">Campus</label>
                <select id="campus" class="form-select" multiple>
                  ${optionsHtml(o.campuses)}
                </select>
              </div>
              <div class="col-md-6">
                <label for="program" class="form-label">Program</label>
                <select id="program" class="form-select" multiple>
                  ${optionsHtml(o.programs)}
                </select>
              </div>
              <div class="col-md-6">
                <label for="term" class="form-label">Term</label>
                <select id="term" class="form-select" multiple>
                  ${optionsHtml(o.terms)}
                </select>
              </div>
            </div>
            <div class="form-text help-muted mt-1">${esc(CONFIG.help.pick_minimum)}</div>
          </fieldset>

          <div class="form-section">
            <label for="datasets" class="form-label">Datasets (optional)</label>
            <select id="datasets" class="form-select" multiple>
              ${optionsHtml(o.datasets)}
            </select>
            <div class="form-text help-muted">${esc(CONFIG.help.datasets_hint)}</div>
          </div>

          <div class="form-section">
            <label for="justification" class="form-label required">Business justification</label>
            <textarea id="justification" class="form-control" rows="4" required
                      placeholder="Explain why broader access is needed, who benefits, and outcomes expected."></textarea>
            <div class="form-text help-muted">${esc(CONFIG.help.justification_hint)}</div>
          </div>

          <div class="form-section">
            <div class="row g-3">
              <div class="col-md-4">
                <label for="retention" class="form-label required">Proposed retention</label>
                <select id="retention" class="form-select" required>
                  <option value="">Select retention</option>
                  ${optionsHtml(o.retentions)}
                </select>
              </div>
              <div class="col-md-4">
                <label for="urgency" class="form-label">Urgency</label>
                <select id="urgency" class="form-select">
                  ${optionsHtml(o.urgency)}
                </select>
              </div>
              <div class="col-md-4">
                <label for="dueBy" class="form-label">Needed by (optional)</label>
                <input id="dueBy" type="date" class="form-control" />
              </div>
            </div>
            <div class="form-text help-muted mt-1">${esc(CONFIG.help.retention_hint)}</div>
          </div>

          <div class="form-section form-check">
            <input class="form-check-input" type="checkbox" id="ack" required>
            <label class="form-check-label required" for="ack">
              I acknowledge masking & ABAC policies continue to apply and all access is logged.
            </label>
          </div>

          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-outline-secondary" id="btnCancel">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btnSubmit">
              <i class="bi bi-send" aria-hidden="true"></i> Submit request
            </button>
          </div>
          <div class="small text-body-secondary mt-2">
            Routed to: <strong>${esc(CONFIG.workflow.queue_name)}</strong> • SLA: ${esc(CONFIG.workflow.sla)}
          </div>
        </form>
      </div>
    </section>

    ${confirmModal()}
    ${toastContainer()}`;
}

function pageChrome(){
  return `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <h1 class="h4 mb-0">Request Broader Access</h1>
      <a class="btn btn-outline-secondary btn-sm" href="./my-access.html">
        <i class="bi bi-arrow-left" aria-hidden="true"></i> Back to My Access
      </a>
    </div>`;
}

function render(){
  main.innerHTML = `${pageChrome()}${summaryCard()}${formCard()}`;
  wireForm();
}

/* ---------- Interactions ---------- */
function getMultiValues(id){
  const sel = $(`#${id}`); if (!sel) return [];
  return Array.from(sel.selectedOptions).map(o=>o.value);
}

function validateForm(form){
  let ok = true;
  const reqIds = ['purpose','justification','retention','ack'];
  reqIds.forEach(id=>{
    const el = $(`#${id}`);
    if (!el) return;
    const valid = (el.type==='checkbox') ? el.checked : !!el.value.trim?.() || !!el.value;
    el.classList.toggle('validation-error', !valid);
    ok = ok && valid;
  });
  return ok;
}

function buildPayload(){
  const ca = CONFIG.current_access || {};
  return {
    requested_by: ca.user || 'current_user',
    current_access: ca,
    request:{
      purpose: $('#purpose').value,
      scope: {
        org: getMultiValues('org'),
        campus: getMultiValues('campus'),
        program: getMultiValues('program'),
        term: getMultiValues('term')
      },
      datasets: getMultiValues('datasets'),
      justification: $('#justification').value.trim(),
      retention: $('#retention').value,
      urgency: $('#urgency').value,
      due_by: $('#dueBy').value || null,
      ack: $('#ack').checked
    },
    routing: CONFIG.workflow
  };
}

function confirmModal(){
  return `
  <div class="modal fade" id="confirmModal" tabindex="-1" aria-labelledby="confirmLbl" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header">
        <h1 class="modal-title fs-6" id="confirmLbl">Confirm request</h1>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body"><div id="confirmBody"></div></div>
      <div class="modal-footer">
        <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Back</button>
        <button class="btn btn-primary" id="confirmSend">Send request</button>
      </div>
    </div></div>
  </div>`;
}

function toastContainer(){
  return `
    <div class="toast-container position-fixed bottom-0 end-0 p-3">
      <div id="toast" class="toast text-bg-success border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body" id="toastMsg">Done</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>
    </div>`;
}

function showToast(msg){
  $('#toastMsg').textContent = msg;
  new bootstrap.Toast($('#toast'), { delay: 1600 }).show();
}

function wireForm(){
  $('#btnCancel')?.addEventListener('click', ()=>{ history.back(); });

  $('#accessForm')?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const form = e.currentTarget;
    if (!validateForm(form)) { showToast('Please complete required fields.'); return; }

    // Build preview
    const payload = buildPayload();
    $('#confirmBody').innerHTML = renderPreview(payload);
    const m = new bootstrap.Modal($('#confirmModal'));
    m.show();

    $('#confirmSend').onclick = async ()=>{
      // Demo: simulate network POST and create a reference id
      const ref = 'REQ-' + Math.random().toString(36).slice(2,8).toUpperCase();
      try{
        // In production: await fetch('/api/access-requests', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload)});
        localStorage.setItem(`edx:access-req:${ref}`, JSON.stringify(payload));
        m.hide();
        showToast(`Submitted. Reference: ${ref}`);
        // Reset form
        form.reset();
      }catch{
        showToast('Submit failed. Please try again.');
      }
    };
  });
}

function renderPreview(p){
  const s = p.request.scope;
  function dl(k,v){ return `<dt>${esc(k)}</dt><dd>${v}</dd>`; }
  const kv = `
    <dl class="row kv">
      ${dl('Purpose', esc(p.request.purpose))}
      ${dl('Org', esc(s.org.join(', ') || '—'))}
      ${dl('Campus', esc(s.campus.join(', ') || '—'))}
      ${dl('Program', esc(s.program.join(', ') || '—'))}
      ${dl('Term', esc(s.term.join(', ') || '—'))}
      ${dl('Datasets', esc((p.request.datasets||[]).join(', ') || '—'))}
      ${dl('Retention', esc(p.request.retention))}
      ${dl('Urgency', esc(p.request.urgency))}
      ${dl('Needed by', esc(p.request.due_by || '—'))}
    </dl>
    <div><strong>Business justification</strong><div class="mt-1">${esc(p.request.justification)}</div></div>
    <hr class="my-3">
    <div class="small text-body-secondary">
      Routed to <strong>${esc(p.routing.queue_name)}</strong> • SLA ${esc(p.routing.sla)} • Approvers: ${esc(p.routing.approvers.join(', '))}
    </div>`;
  return kv;
}

/* ---------- Boot ---------- */
load();
