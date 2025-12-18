// schedules-retries.js — Production-ready Schedules & Retries (Bootstrap UI, filters, pagination, audit copy)
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const main    = $('#app-main');
const jsonUrl = 'schedules-retries.json';

const STATE = {
  data: { schedules:[], retry_policies:[], meta:{}, summary:{} },
  filters: { q:'', enabled:'', tz:'' },
  pages:   { sched:0, policy:0 },
  pageSize: 10,
};

(async function init(){
  // Shared partials as global
  try {
    if (window.EDXPartials && typeof window.EDXPartials.loadPartials === 'function') {
      await window.EDXPartials.loadPartials({ sidebar: 'engineer' });
    }
  } catch(e){ console.error('Partials load failed', e); }

  await loadData();
  renderShell();
  bindToolbar();
  renderAll();
})();

async function loadData(){
  try {
    const d = await fetch(jsonUrl, { cache: 'no-store' }).then(r=>r.json());
    STATE.data = d || STATE.data;
  } catch { /* keep defaults */ }
}

/* -------------------- Shell -------------------- */
function renderShell(){
  const sum = STATE.data.summary || {};
  const tzs = Array.from(new Set((STATE.data.schedules||[]).map(s => s.tz))).filter(Boolean);

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-1">Schedules & Retries</h1>
        <p class="text-muted mb-0">Operational schedules and retry policies. Actions are audit-logged; promotion remains Steward-gated.</p>
      </div>
      <div class="d-flex toolbar align-items-center flex-wrap">
        <input id="q" class="form-control form-control-sm" placeholder="Search pipelines & policies…" style="max-width:260px">
        <select id="f-enabled" class="form-select form-select-sm">
          <option value="">Enabled: All</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
        <select id="f-tz" class="form-select form-select-sm">
          <option value="">Timezone: All</option>
          ${tzs.map(t=>`<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join('')}
        </select>
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm ms-1">Refresh</button>
      </div>
    </div>

    <!-- KPIs -->
    <section class="kpis" aria-label="Schedules summary">
      <div class="kpi"><div class="label">Pipelines</div><div class="value" id="k-pipes">${sum.pipelines_total ?? (STATE.data.schedules||[]).length}</div><div class="foot">Configured</div></div>
      <div class="kpi"><div class="label">Enabled</div><div class="value" id="k-enabled">${sum.enabled ?? '—'}</div><div class="foot">Active schedules</div></div>
      <div class="kpi"><div class="label">Policies</div><div class="value" id="k-policies">${(STATE.data.retry_policies||[]).length}</div><div class="foot">Retry definitions</div></div>
      <div class="kpi"><div class="label">Timezones</div><div class="value" id="k-tz">${(sum.tz_used||[]).length || '-'}</div><div class="foot">${(sum.tz_used||[]).join(', ') || '—'}</div></div>
    </section>

    <div class="row g-3">
      <!-- Schedules -->
      <div class="col-lg-7">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body d-flex justify-content-between align-items-center">
            <strong>Pipeline Schedules</strong>
            <button class="btn btn-outline-primary btn-sm" id="btnNewSched">New Schedule</button>
          </div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light"><tr>
                <th>Pipeline</th><th>Source</th><th>Zone</th><th>Cron</th><th>TZ</th><th>SLA</th><th>Policy</th><th>Next</th><th>Enabled</th><th class="text-end">Actions</th>
              </tr></thead>
              <tbody id="rows-sched"></tbody>
            </table>
          </div>
          <div class="card-footer d-flex justify-content-between align-items-center">
            <small class="text-body-secondary">Blackouts and maintenance windows are enforced by the scheduler.</small>
            <nav class="pager">
              <button class="btn btn-sm btn-outline-secondary" id="pgS-first">&laquo;</button>
              <button class="btn btn-sm btn-outline-secondary" id="pgS-prev">&lsaquo;</button>
              <span class="small" id="pgS-info">Page 1 of 1</span>
              <button class="btn btn-sm btn-outline-secondary" id="pgS-next">&rsaquo;</button>
              <button class="btn btn-sm btn-outline-secondary" id="pgS-last">&raquo;</button>
            </nav>
          </div>
        </div>
      </div>

      <!-- Retry Policies -->
      <div class="col-lg-5">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body d-flex justify-content-between align-items-center">
            <strong>Retry Policies</strong>
            <button class="btn btn-outline-primary btn-sm" id="btnNewPolicy">New Policy</button>
          </div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light"><tr>
                <th>Name</th><th>Strategy</th><th>Max</th><th>Backoff</th><th>Jitter</th><th class="text-end">Actions</th>
              </tr></thead>
              <tbody id="rows-policy"></tbody>
            </table>
          </div>
          <div class="card-footer small text-body-secondary">Non-retryable errors stop attempts immediately.</div>
        </div>
      </div>
    </div>
  `;
}

/* -------------------- Filters & Events -------------------- */
function bindToolbar(){
  $('#q').addEventListener('input', e => { STATE.filters.q = e.target.value.toLowerCase().trim(); STATE.pages.sched = 0; STATE.pages.policy = 0; renderAll(); });
  $('#f-enabled').addEventListener('change', e => { STATE.filters.enabled = e.target.value; STATE.pages.sched = 0; renderSchedules(); });
  $('#f-tz').addEventListener('change', e => { STATE.filters.tz = e.target.value; STATE.pages.sched = 0; renderSchedules(); });
  $('#btnRefresh').addEventListener('click', async ()=>{ await loadData(); renderShell(); bindToolbar(); renderAll(); });

  // New item (demo)
  $('#btnNewSched').addEventListener('click', ()=> openScheduleModal());
  $('#btnNewPolicy').addEventListener('click', ()=> openPolicyModal());
}

/* -------------------- Rendering -------------------- */
function renderAll(){
  renderSchedules();
  renderPolicies();
}

function filterSchedules(){
  const { q, enabled, tz } = STATE.filters;
  return (STATE.data.schedules||[]).filter(s=>{
    const okQ = !q || JSON.stringify(s).toLowerCase().includes(q);
    const okE = !enabled || String(s.enabled) === enabled;
    const okT = !tz || s.tz === tz;
    return okQ && okE && okT;
  });
}
function schedPages(){ return Math.max(1, Math.ceil(filterSchedules().length / STATE.pageSize)); }

function renderSchedules(){
  const list = filterSchedules();
  const pages = schedPages();
  STATE.pages.sched = Math.min(STATE.pages.sched, pages-1);
  const start = STATE.pages.sched * STATE.pageSize;
  const slice = list.slice(start, start + STATE.pageSize);

  $('#rows-sched').innerHTML = slice.map(s => `
    <tr>
      <td class="text-nowrap">${escapeHtml(s.pipeline)}</td>
      <td class="text-nowrap">${escapeHtml(s.source||'—')}</td>
      <td class="text-nowrap">${escapeHtml(s.zone||'—')}</td>
      <td class="cron">${escapeHtml(s.cron)}</td>
      <td>${escapeHtml(s.tz)}</td>
      <td>${s.sla_minutes ? `${s.sla_minutes}m` : '—'}</td>
      <td><a href="#" class="act-policy" data-name="${escapeAttr(s.retry_policy||'')}">${escapeHtml(s.retry_policy||'—')}</a></td>
      <td class="text-nowrap">${escapeHtml(s.next_run||'—')}</td>
      <td>${s.enabled ? '<span class="badge text-bg-success">Yes</span>' : '<span class="badge text-bg-secondary">No</span>'}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary act-run" data-p="${escapeAttr(s.pipeline)}">Run Now</button>
          <button class="btn btn-outline-secondary act-edit" data-p="${escapeAttr(s.pipeline)}">Edit</button>
          <button class="btn btn-outline-secondary act-toggle" data-p="${escapeAttr(s.pipeline)}">${s.enabled ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-outline-danger act-delete" data-p="${escapeAttr(s.pipeline)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td class="p-3" colspan="10">No schedules.</td></tr>`;

  // pager
  $('#pgS-info').textContent = `Page ${STATE.pages.sched + 1} of ${pages}`;
  $('#pgS-first').disabled = $('#pgS-prev').disabled = STATE.pages.sched <= 0;
  $('#pgS-last').disabled  = $('#pgS-next').disabled = STATE.pages.sched >= pages - 1;
  $('#pgS-first').onclick = ()=>{ STATE.pages.sched = 0; renderSchedules(); };
  $('#pgS-prev').onclick  = ()=>{ STATE.pages.sched = Math.max(0, STATE.pages.sched-1); renderSchedules(); };
  $('#pgS-next').onclick  = ()=>{ STATE.pages.sched = Math.min(pages-1, STATE.pages.sched+1); renderSchedules(); };
  $('#pgS-last').onclick  = ()=>{ STATE.pages.sched = pages-1; renderSchedules(); };

  // row actions
  $$('.act-run').forEach(b => b.addEventListener('click', ()=> alert(`RUN NOW requested for ${b.dataset.p}\n(demo — audit-logged).`)));
  $$('.act-edit').forEach(b => b.addEventListener('click', ()=> openScheduleModal(b.dataset.p)));
  $$('.act-toggle').forEach(b => b.addEventListener('click', ()=> alert(`TOGGLE requested for ${b.dataset.p}\n(demo — audit-logged).`)));
  $$('.act-delete').forEach(b => b.addEventListener('click', ()=> alert(`DELETE requested for ${b.dataset.p}\n(demo — audit-logged).`)));

  // policy link
  $$('.act-policy').forEach(a => a.addEventListener('click', (e)=>{
    e.preventDefault();
    const name = a.getAttribute('data-name');
    if (!name) return;
    openPolicyModal(name);
  }));
}

function renderPolicies(){
  const q = STATE.filters.q;
  const list = (STATE.data.retry_policies||[]).filter(p => !q || JSON.stringify(p).toLowerCase().includes(q));

  const pages = Math.max(1, Math.ceil(list.length / STATE.pageSize));
  STATE.pages.policy = Math.min(STATE.pages.policy, pages-1);
  const start = STATE.pages.policy * STATE.pageSize;
  const slice = list.slice(start, start + STATE.pageSize);

  $('#rows-policy').innerHTML = slice.map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.strategy)}</td>
      <td>${p.max_attempts}</td>
      <td>${escapeHtml(p.base_backoff)}${p.max_backoff ? ` → ${escapeHtml(p.max_backoff)}` : ''}</td>
      <td>${p.jitter ? 'Yes' : 'No'}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary act-view-policy" data-name="${escapeAttr(p.name)}">View</button>
          <button class="btn btn-outline-secondary act-edit-policy" data-name="${escapeAttr(p.name)}">Edit</button>
          <button class="btn btn-outline-danger act-del-policy" data-name="${escapeAttr(p.name)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td class="p-3" colspan="6">No retry policies.</td></tr>`;

  // actions
  $$('.act-view-policy').forEach(b => b.addEventListener('click', ()=> openPolicyModal(b.dataset.name)));
  $$('.act-edit-policy').forEach(b => b.addEventListener('click', ()=> openPolicyModal(b.dataset.name)));
  $$('.act-del-policy').forEach(b => b.addEventListener('click', ()=> alert(`DELETE policy ${b.dataset.name}\n(demo — audit-logged).`)));
}

/* -------------------- Modals (Demo-safe) -------------------- */
function openScheduleModal(pipeline){
  const sched = (STATE.data.schedules||[]).find(s => s.pipeline === pipeline) || {
    pipeline: '', source:'', zone:'', cron:'', tz:'UTC', enabled:true, sla_minutes:15, retry_policy:'default_exponential',
    window:{start:'00:00', end:'23:59'}, blackouts:[]
  };
  $('#schedModalLabel').textContent = pipeline ? `Edit Schedule — ${pipeline}` : 'New Schedule';
  $('#schedModalBody').innerHTML = `
    <div class="row g-3">
      <div class="col-md-6"><label class="form-label">Pipeline</label><input id="fPipeline" class="form-control" value="${escapeAttr(sched.pipeline)}" ${pipeline?'disabled':''}></div>
      <div class="col-md-3"><label class="form-label">Zone</label><input id="fZone" class="form-control" value="${escapeAttr(sched.zone||'')}"></div>
      <div class="col-md-3"><label class="form-label">Source</label><input id="fSource" class="form-control" value="${escapeAttr(sched.source||'')}"></div>
      <div class="col-md-4"><label class="form-label">Cron</label><input id="fCron" class="form-control cron" value="${escapeAttr(sched.cron)}" placeholder="m h dom mon dow"></div>
      <div class="col-md-3"><label class="form-label">TZ</label><input id="fTz" class="form-control" value="${escapeAttr(sched.tz||'UTC')}"></div>
      <div class="col-md-2"><label class="form-label">Enabled</label><select id="fEnabled" class="form-select"><option value="true" ${sched.enabled?'selected':''}>Yes</option><option value="false" ${!sched.enabled?'selected':''}>No</option></select></div>
      <div class="col-md-3"><label class="form-label">SLA (min)</label><input id="fSla" type="number" min="1" class="form-control" value="${escapeAttr(String(sched.sla_minutes||''))}"></div>
      <div class="col-md-6"><label class="form-label">Retry Policy</label><input id="fPolicy" class="form-control" value="${escapeAttr(sched.retry_policy||'')}"></div>
      <div class="col-md-3"><label class="form-label">Window Start</label><input id="fWStart" class="form-control" value="${escapeAttr(sched.window?.start||'00:00')}"></div>
      <div class="col-md-3"><label class="form-label">Window End</label><input id="fWEnd" class="form-control" value="${escapeAttr(sched.window?.end||'23:59')}"></div>
      <div class="col-12"><label class="form-label">Blackouts (YYYY-MM-DD, comma-sep)</label><input id="fBlackouts" class="form-control" value="${escapeAttr((sched.blackouts||[]).join(', '))}"></div>
      <div class="col-12"><small class="text-body-secondary">All changes are audit-logged; enforcement occurs server-side.</small></div>
    </div>
  `;
  const modal = new bootstrap.Modal($('#schedModal')); modal.show();
  $('#schedSaveBtn').onclick = ()=> {
    alert('SAVE schedule (demo). Audit log recorded.');
    modal.hide();
  };
}

function openPolicyModal(name){
  const p = (STATE.data.retry_policies||[]).find(x => x.name === name) || {
    name:'', strategy:'exponential', max_attempts:5, base_backoff:'1m', max_backoff:'16m', jitter:false,
    retry_on:['network_error','rate_limit'], non_retryable:['auth_failure','schema_mismatch']
  };
  $('#policyModalLabel').textContent = name ? `Retry Policy — ${name}` : 'New Retry Policy';
  $('#policyModalBody').innerHTML = `
    <div class="row g-3">
      <div class="col-md-6"><label class="form-label">Name</label><input id="pName" class="form-control" value="${escapeAttr(p.name)}" ${name?'disabled':''}></div>
      <div class="col-md-3"><label class="form-label">Strategy</label><input id="pStrategy" class="form-control" value="${escapeAttr(p.strategy)}"></div>
      <div class="col-md-3"><label class="form-label">Max Attempts</label><input id="pMax" type="number" min="1" class="form-control" value="${escapeAttr(String(p.max_attempts))}"></div>
      <div class="col-md-3"><label class="form-label">Base Backoff</label><input id="pBase" class="form-control" value="${escapeAttr(p.base_backoff||'')}"></div>
      <div class="col-md-3"><label class="form-label">Max Backoff</label><input id="pMaxB" class="form-control" value="${escapeAttr(p.max_backoff||'')}"></div>
      <div class="col-md-3"><label class="form-label">Jitter</label><select id="pJitter" class="form-select"><option value="true" ${p.jitter?'selected':''}>Yes</option><option value="false" ${!p.jitter?'selected':''}>No</option></select></div>
      <div class="col-md-6"><label class="form-label">Retry On (comma-sep)</label><input id="pOn" class="form-control" value="${escapeAttr((p.retry_on||[]).join(', '))}"></div>
      <div class="col-md-6"><label class="form-label">Non-retryable (comma-sep)</label><input id="pNo" class="form-control" value="${escapeAttr((p.non_retryable||[]).join(', '))}"></div>
      <div class="col-12"><small class="text-body-secondary">Backoff & decisions are enforced server-side; UI reflects policy.</small></div>
    </div>
  `;
  const modal = new bootstrap.Modal($('#policyModal')); modal.show();
  $('#policySaveBtn').onclick = ()=> {
    alert('SAVE retry policy (demo). Audit log recorded.');
    modal.hide();
  };
}

/* -------------------- Utils -------------------- */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }
