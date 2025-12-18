/* EDX — Export Requests (New)
 * Production features:
 * - Pre-flight: consent, ABAC scope preview, DQ threshold, estimated size/time
 * - Purpose required; default filename template; validation
 * - Chunked export (simulated) with resumable jobs and throttling feedback
 * - Manifest: schema_version, estimated row_count, selected fields
 * - History: pagination, bulk cancel
 * CSP-safe (no inline styles); depends on ./export-requests-new.json for demo data.
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const DEMO_URL = './export-requests-new.json';
const STORAGE_USER  = 'edx:user';
const STORAGE_HISTORY = 'edx:exports:history';
const STORAGE_BATCH   = 'edx:exports:batch'; // from Saved Queries bulk flow

const state = {
  datasets: [],   // allow-listed publish views
  purposes: [],
  policy: null,   // {masking, org, term, role, policy_snapshot_id}
  dq: {},         // {min_threshold}
  // builder
  dataset: null,
  schema_version: null,
  estimated_rows: 0,
  fields_all: [],
  masked_columns: [],
  // runtime
  consent: false,
  dq_ok: false,
  abac_ok: true,
  est_time_sec: 0,
  chunks: [],     // [{idx,status,rows,time,file}]
  job: null,      // {id,status,started,chunkSize,format,purpose,filenameTpl}
  paused: false,
  throttled: false,
  backoff: 0,
  history: [],
  historyPage: 1,
  historySize: 20
};

/* --------------------- Boot --------------------- */
(async function init(){
  try{
    const res = await fetch(DEMO_URL, { cache:'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();

    state.datasets = d.allowlist || [];
    state.purposes = d.purposes  || ["Operational","Research","Compliance"];
    state.policy   = d.applied_policy || null;
    state.dq       = d.dq || { min_threshold: 85 };

    // Seed builder
    const first = state.datasets[0];
    if (first){
      state.dataset = first.key;
      state.schema_version = first.schema_version;
      state.estimated_rows = first.estimated_rows || 250000;
      state.fields_all     = first.fields || [];
      state.masked_columns = first.masked_columns || [];
    }

    // If a batch payload is present (from Saved Queries), preselect dataset/purpose
    hydrateFromBatch();

    // Build UI
    buildSelectors();
    paintPolicy();
    fillDefaults();
    computePreflight();
    renderManifest();
    renderChunksTable();
    loadHistory();
    renderHistory();

    // Wire UI
    wireEvents();

    // focus
    $('#main')?.focus();
  }catch(e){
    console.error('[EDX] export builder failed', e);
    const main = $('#main');
    main?.insertAdjacentHTML('afterbegin', `<div class="alert alert-danger">Failed to initialize export builder.</div>`);
  }
})();

/* --------------------- Helpers --------------------- */
function readUser(){ try { return JSON.parse(localStorage.getItem(STORAGE_USER)||'null'); } catch { return null; } }
function readJSON(k, def){ try { return JSON.parse(localStorage.getItem(k)||''); } catch { return def; } }
function writeJSON(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

function badge(text){ return `<span class="badge rounded-pill badge-tag me-1">${escapeHtml(text)}</span>`; }
function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }

function formatNumber(n){ return n==null ? '—' : n.toLocaleString(); }
function secondsToHms(s){
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = Math.floor(s%60);
  return [h,m,ss].map(x=>String(x).padStart(2,'0')).join(':');
}

/* --------------------- Batch prefill --------------------- */
function hydrateFromBatch(){
  const raw = sessionStorage.getItem(STORAGE_BATCH);
  if (!raw) return;
  let batch = [];
  try { batch = JSON.parse(raw) || []; } catch { return; }
  if (!Array.isArray(batch) || batch.length===0) return;

  // Assume all rows target the same dataset/purpose (Saved Queries flow enforces this)
  const first = batch[0];
  if (first.dataset) {
    const found = state.datasets.find(d => d.key === first.dataset);
    if (found){
      state.dataset = found.key;
      state.schema_version = found.schema_version;
      state.estimated_rows = found.estimated_rows || state.estimated_rows;
      state.fields_all     = found.fields || state.fields_all;
      state.masked_columns = found.masked_columns || state.masked_columns;
    }
  }
  if (first.purpose){
    $('#purpose')?.setAttribute('data-prefill', first.purpose);
  }
}

/* --------------------- UI builders --------------------- */
function buildSelectors(){
  // dataset
  const dsSel = $('#dataset');
  dsSel.innerHTML = state.datasets.map(d => {
    const label = `${d.display_name || d.key} · v${escapeHtml(d.schema_version||'—')}`;
    return `<option value="${escapeHtml(d.key)}" data-schema="${escapeHtml(d.schema_version||'—')}" data-est="${escapeHtml(String(d.estimated_rows||0))}">${escapeHtml(label)}</option>`;
  }).join('');
  dsSel.value = state.dataset || '';

  // purpose
  const pSel = $('#purpose');
  pSel.innerHTML = state.purposes.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  const pre = pSel.getAttribute('data-prefill');
  if (pre) pSel.value = pre;
}

function paintPolicy(){
  const ap = state.policy || {};
  const u  = readUser() || {};
  const role = (u.role || ap.role || 'consumer').replace(/_/g, ' ');
  const line = `${ap.masking || 'PII masked'} · ${ap.org || 'Org=District-12'} · ${ap.term || 'Term=2024-25'} · Role=${role}`;
  $('#policyLine').textContent = line;
  $('#policySnapshot').textContent = `policy_snapshot_id=${ap.policy_snapshot_id || '—'}`;
}

function fillDefaults(){
  // filename template
  const d = new Date();
  const ymd = d.toISOString().slice(0,10);
  const tpl = `{dataset}_${ymd}_{purpose}.csv`;
  $('#filenameTpl').value = tpl;

  // fields suggest button shows typical “safe” subset (non-PII)
  if (state.fields_all?.length) {
    $('#fields').placeholder = `e.g., ${state.fields_all.slice(0,5).join(', ')}`;
  }
}

/* --------------------- Preflight --------------------- */
function computePreflight(){
  // Consent
  state.consent = $('#consentChk')?.checked || false; // might not exist yet
  // DQ check
  const threshold = Number(state.dq?.min_threshold || 85);
  const ds = state.datasets.find(d => d.key===state.dataset);
  const dq = Number(ds?.dq || 100);
  state.dq_ok = dq >= threshold;
  // ABAC scope (demo always true, but show scope line)
  state.abac_ok = true;

  // Estimate size/time
  const chunkSize = Number($('#chunkSize').value || 100000);
  const estRows   = Number(ds?.estimated_rows || state.estimated_rows || 0);
  const chunks    = Math.max(1, Math.ceil(estRows / chunkSize));
  // Simple throughput model: 200k rows/minute
  const rowsPerMin = 200000;
  const minutes = estRows / rowsPerMin;
  state.est_time_sec = Math.max(10, Math.round(minutes * 60));

  // Render checklist
  const ul = $('#preflightList');
  const consentLi = `<li><i class="bi bi-${state.consent?'check-circle ok':'circle'}"></i> <span>I confirm the export has appropriate consent / lawful basis.</span></li>`;
  const abacLi    = `<li><i class="bi bi-${state.abac_ok?'check-circle ok':'exclamation-triangle warn'}"></i> <span>ABAC scope applies (<code>${escapeHtml(ds?.abac || 'Org=District-12; Term=2024-25')}</code>).</span></li>`;
  const dqLi      = `<li><i class="bi bi-${state.dq_ok?'check-circle ok':'x-circle fail'}"></i> <span>Data quality ≥ threshold (<strong>${dq}%</strong> vs min <strong>${threshold}%</strong>).</span></li>`;
  const sizeLi    = `<li><i class="bi bi-stopwatch"></i> <span>Estimated <strong>${formatNumber(estRows)}</strong> rows → <strong>${chunks}</strong> chunk(s), ~<strong>${secondsToHms(state.est_time_sec)}</strong>.</span></li>`;

  ul.innerHTML = consentLi + abacLi + dqLi + sizeLi;

  // Enable Start if purpose & consent & dq_ok
  const purpose = $('#purpose').value;
  const canStart = Boolean(purpose) && state.consent && state.dq_ok;
  $('#btnStart').disabled = !canStart;
}

function renderManifest(){
  const ds = state.datasets.find(d => d.key===state.dataset) || {};
  const fieldsSel = parseFields();
  const dl = $('#manifest');
  dl.innerHTML = `
    <dt class="col-5">Dataset</dt><dd class="col-7">${escapeHtml(ds.display_name || ds.key || '—')}</dd>
    <dt class="col-5">Schema</dt><dd class="col-7">v${escapeHtml(state.schema_version || '—')}</dd>
    <dt class="col-5">Fields</dt><dd class="col-7">${fieldsSel.length ? fieldsSel.map(badge).join('') : 'All'}</dd>
    <dt class="col-5">Masked</dt><dd class="col-7">${(state.masked_columns||[]).map(badge).join('') || 'None'}</dd>
    <dt class="col-5">Est. rows</dt><dd class="col-7">${formatNumber(state.estimated_rows)}</dd>
    <dt class="col-5">Purpose</dt><dd class="col-7">${escapeHtml($('#purpose').value || '—')}</dd>
    <dt class="col-5">Filename</dt><dd class="col-7"><code>${escapeHtml(previewFilename(1))}</code></dd>
  `;
}

function parseFields(){
  const v = ($('#fields').value || '').trim();
  if (!v) return [];
  return v.split(',').map(s=>s.trim()).filter(Boolean);
}

function previewFilename(chunkIdx){
  const tpl = ($('#filenameTpl').value || '{dataset}_{date}_{purpose}.csv').trim();
  const ds = state.datasets.find(d => d.key===state.dataset) || {};
  const d = new Date().toISOString().slice(0,10);
  const purpose = ($('#purpose').value || 'purpose').replace(/\s+/g,'-').toLowerCase();
  return tpl
    .replaceAll('{dataset}', (ds.key||'dataset'))
    .replaceAll('{date}', d)
    .replaceAll('{purpose}', purpose)
    .replaceAll('{chunk}', String(chunkIdx).padStart(3,'0'));
}

/* --------------------- Chunk runner (sim) --------------------- */
function renderChunksTable(){
  const tbody = $('#chunksBody');
  tbody.innerHTML = state.chunks.map(c=>{
    return `<tr>
      <td>#${c.idx}</td>
      <td><span class="job-status ${escapeHtml(c.status)}">${escapeHtml(c.status)}</span></td>
      <td>${formatNumber(c.rows||0)}</td>
      <td>${c.time ? (c.time+'s') : '—'}</td>
      <td>${c.file ? `<code>${escapeHtml(c.file)}</code>` : '—'}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="5" class="text-body-secondary text-center py-3">No chunks yet.</td></tr>`;
}

function updateProgress(){
  const done = state.chunks.filter(c=>c.status==='done').length;
  const total = state.chunks.length || 1;
  const pct = Math.round(done*100/total);
  const el = $('#progressBar');
  el.style.width = pct + '%';
  el.textContent = pct + '%';
}

function randomThrottle(){ return Math.random() < 0.15; } // 15% chance to simulate 429

async function runChunk(c){
  if (state.paused) return;
  // Simulate throttling
  if (randomThrottle()){
    state.throttled = true;
    state.backoff = Math.floor(2 + Math.random()*5);
    $('#throttleAlert').classList.remove('d-none');
    for (let s=state.backoff; s>0; s--){
      $('#backoffSec').textContent = String(s);
      await delay(1000);
      if (state.paused) return;
    }
    $('#throttleAlert').classList.add('d-none');
    state.throttled = false;
  }

  // Simulate chunk processing
  const t = 600 + Math.floor(Math.random()*600); // 0.6–1.2s
  await delay(t);
  c.status = 'done';
  c.rows   = Number($('#chunkSize').value || 100000);
  c.time   = Math.round(t/100)/10;
  c.file   = previewFilename(c.idx);
  renderChunksTable();
  updateProgress();
}

function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function startJob(){
  // Build chunks based on estimate
  const chunkSize = Number($('#chunkSize').value || 100000);
  const estRows   = state.estimated_rows || 0;
  const total = Math.max(1, Math.ceil(estRows / chunkSize));
  state.chunks = Array.from({length: total}, (_,i)=>({ idx:i+1, status:'running', rows:0, time:0, file:'' }));
  state.job = {
    id: 'job_' + Math.random().toString(36).slice(2,9),
    status: 'running',
    started: new Date().toISOString(),
    chunkSize, format: $('#format').value, purpose: $('#purpose').value,
    filenameTpl: $('#filenameTpl').value, dataset: state.dataset, schema_version: state.schema_version
  };
  renderManifest();
  renderChunksTable();
  updateProgress();
  toggleJobButtons(true);

  for (const c of state.chunks){
    if (state.paused || state.job.status!=='running') break;
    await runChunk(c);
  }

  if (state.job.status==='running'){
    state.job.status = 'done';
    finalizeHistory();
  }
  toggleJobButtons(false);
}

function toggleJobButtons(running){
  $('#btnPause').disabled = !running;
  $('#btnCancel').disabled = !running;
  $('#btnResume').disabled = running;
}

function pauseJob(){
  state.paused = true;
  state.job.status = 'paused';
  toggleJobButtons(false);
}
async function resumeJob(){
  if (!state.job || state.job.status!=='paused') return;
  state.paused = false;
  state.job.status = 'running';
  toggleJobButtons(true);
  for (const c of state.chunks.filter(c=>c.status!=='done')){
    if (state.paused || state.job.status!=='running') break;
    await runChunk(c);
  }
  if (state.job.status==='running'){
    state.job.status = 'done';
    finalizeHistory();
    toggleJobButtons(false);
  }
}
function cancelJob(){
  if (!state.job) return;
  state.job.status = 'error';
  state.paused = false;
  toggleJobButtons(false);
  finalizeHistory();
}

/* --------------------- History --------------------- */
function finalizeHistory(){
  const rowsDone = state.chunks.reduce((a,c)=>a+(c.rows||0),0);
  const entry = {
    id: state.job.id,
    dataset: state.job.dataset,
    purpose: state.job.purpose,
    started: state.job.started,
    status: state.job.status,
    chunks: state.chunks.length,
    est_rows: state.estimated_rows,
    schema_version: state.schema_version
  };
  const hist = readJSON(STORAGE_HISTORY, []);
  hist.unshift(entry);
  writeJSON(STORAGE_HISTORY, hist);
  state.history = hist;
  renderHistory();
}

function loadHistory(){
  state.history = readJSON(STORAGE_HISTORY, []);
}

function renderHistory(){
  const list = state.history.slice();
  // pagination
  const size = state.historySize;
  const pages = Math.max(1, Math.ceil(list.length/size));
  state.historyPage = Math.min(Math.max(1, state.historyPage), pages);
  const start = (state.historyPage-1)*size, end = Math.min(list.length, start+size);
  const pageRows = list.slice(start,end);

  const tbody = $('#historyBody');
  tbody.innerHTML = pageRows.map(r=>{
    const status = r.status==='done' ? 'done' : r.status==='error' ? 'error' : r.status==='paused' ? 'paused' : 'running';
    return `<tr>
      <td><input class="form-check-input hist-check" type="checkbox" data-id="${escapeHtml(r.id)}" aria-label="Select ${escapeHtml(r.id)}"></td>
      <td><code>${escapeHtml(r.id)}</code></td>
      <td>${escapeHtml(r.dataset)}</td>
      <td>${escapeHtml(r.purpose)}</td>
      <td>${escapeHtml(r.started)}</td>
      <td><span class="job-status ${status}">${escapeHtml(status)}</span></td>
      <td>${r.chunks}</td>
      <td>${formatNumber(r.est_rows)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="text-body-secondary text-center py-3">No jobs yet.</td></tr>`;

  // meta + pager controls
  $('#historyMeta').textContent = list.length ? `Showing ${start+1}–${end} of ${list.length}` : 'No history';
  $('#historyPages').textContent = String(pages);
  const host = document.querySelector('[data-paginate-history]');
  host.querySelector('[data-first]').disabled = state.historyPage===1;
  host.querySelector('[data-prev]').disabled  = state.historyPage===1;
  host.querySelector('[data-next]').disabled  = state.historyPage===pages;
  host.querySelector('[data-last]').disabled  = state.historyPage===pages;
  $('#historyPage').value = String(state.historyPage);
}

/* --------------------- Events --------------------- */
function wireEvents(){
  // consent checkbox (rendered inside preflightList on first compute; add an external control instead)
  // Add a persistent consent control:
  const ul = $('#preflightList');
  const consentCtl = document.createElement('div');
  consentCtl.className = 'form-check my-2';
  consentCtl.innerHTML = `<input class="form-check-input" type="checkbox" id="consentChk"><label class="form-check-label" for="consentChk">I have appropriate consent / lawful basis to export.</label>`;
  ul.parentElement.insertBefore(consentCtl, ul);
  $('#consentChk').addEventListener('change', ()=>{ state.consent = $('#consentChk').checked; computePreflight(); });

  // selectors
  $('#dataset').addEventListener('change', ()=>{
    const opt = $('#dataset').selectedOptions[0];
    state.dataset = opt?.value || null;
    state.schema_version = opt?.getAttribute('data-schema') || '—';
    state.estimated_rows = Number(opt?.getAttribute('data-est') || 0);
    const ds = state.datasets.find(d => d.key===state.dataset) || {};
    state.fields_all = ds.fields || [];
    state.masked_columns = ds.masked_columns || [];
    computePreflight();
    renderManifest();
  });
  $('#purpose').addEventListener('change', ()=>{ computePreflight(); renderManifest(); });
  $('#fields').addEventListener('input', ()=>{ renderManifest(); });
  $('#filenameTpl').addEventListener('input', ()=>{ renderManifest(); });
  $('#format').addEventListener('change', ()=>{ /* preview unaffected */ });
  $('#chunkSize').addEventListener('change', ()=>{ computePreflight(); });

  $('#btnSuggestFields').addEventListener('click', ()=>{
    // simple suggestion: exclude masked columns, pick first 8 non-PII fields
    const safe = state.fields_all.filter(f => !(state.masked_columns||[]).includes(f)).slice(0,8);
    $('#fields').value = safe.join(', ');
    renderManifest();
  });

  // job controls
  $('#btnStart').addEventListener('click', startJob);
  $('#btnPause').addEventListener('click', pauseJob);
  $('#btnResume').addEventListener('click', resumeJob);
  $('#btnCancel').addEventListener('click', cancelJob);

  // history paging
  const host = document.querySelector('[data-paginate-history]');
  host.querySelector('[data-first]').addEventListener('click', ()=>{ state.historyPage=1; renderHistory(); });
  host.querySelector('[data-prev]') .addEventListener('click', ()=>{ state.historyPage=Math.max(1,state.historyPage-1); renderHistory(); });
  host.querySelector('[data-next]') .addEventListener('click', ()=>{ const pages=Number($('#historyPages').textContent||'1'); state.historyPage=Math.min(pages,state.historyPage+1); renderHistory(); });
  host.querySelector('[data-last]') .addEventListener('click', ()=>{ const pages=Number($('#historyPages').textContent||'1'); state.historyPage=pages; renderHistory(); });
  $('#historyPage').addEventListener('change', (e)=>{ const pages=Number($('#historyPages').textContent||'1'); const v=Math.min(pages,Math.max(1,parseInt(e.target.value||'1',10))); state.historyPage=v; renderHistory(); });
  $('#historySize').addEventListener('change', (e)=>{ state.historySize=parseInt(e.target.value,10)||20; state.historyPage=1; renderHistory(); });

  // history actions
  $('#checkAllHistory').addEventListener('change', (e)=>{
    $$('.hist-check').forEach(cb => cb.checked = e.target.checked);
    updateBulkCancel();
  });
  $('#historyBody').addEventListener('change', (e)=>{
    if (e.target.classList.contains('hist-check')) updateBulkCancel();
  });
  $('#bulkCancel').addEventListener('click', ()=>{
    const ids = $$('.hist-check:checked').map(cb => cb.getAttribute('data-id'));
    if (!ids.length) return;
    const hist = readJSON(STORAGE_HISTORY, []);
    const next = hist.map(h => ids.includes(h.id) ? ({ ...h, status: 'error' }) : h);
    writeJSON(STORAGE_HISTORY, next);
    state.history = next;
    renderHistory();
  });

  $('#refreshHistory').addEventListener('click', ()=>{ loadHistory(); renderHistory(); });
}

function updateBulkCancel(){
  const any = $$('.hist-check:checked').length > 0;
  $('#bulkCancel').disabled = !any;
}
