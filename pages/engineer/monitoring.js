// monitoring.js — Monitoring & Alerts + Auto DQ Alerts + Policy Simulator (Bootstrap, pagination, filters)
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const main    = $('#app-main');
const jsonUrl = 'monitoring.json';

const STATE = {
  data: { alerts:[], dq_hits:[], drift:[], kpis:{}, policy_simulator:{} },
  filters: { q:'', sev:'', status:'', source:'' },
  pages:   { alerts:0, dq:0, drift:0 },
  pageSize: 10
};

(async function init(){
  // Inject header/sidebar/footer via global partials
  try {
    if (window.EDXPartials && typeof window.EDXPartials.loadPartials === 'function') {
      await window.EDXPartials.loadPartials({ sidebar: 'engineer' });
    }
  } catch(e){ console.error('Partials load failed', e); }

  await loadData();
  autoCreateDQAlerts(); // demo: create alerts for breached DQ rules (idempotent)
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

/* -------------------- Auto-create DQ Alerts (demo, idempotent) -------------------- */
function autoCreateDQAlerts(){
  const alerts = STATE.data.alerts || [];
  const key = (x)=> `${x.rule}::${x.dataset}`;
  const existingKeys = new Set(alerts.filter(a=>a.tags?.includes('dq')).map(a => a.tags.find(t=>t.startsWith('dqkey:'))?.slice(6)).filter(Boolean));

  (STATE.data.dq_hits||[]).forEach(hit => {
    if (hit.status !== 'breached') return;
    const k = key(hit);
    if (existingKeys.has(k)) return; // already have an alert

    const id = `DQ-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
    alerts.push({
      id,
      opened: new Date().toISOString().replace('T',' ').replace(/\..+/, 'Z'),
      title: `DQ breach: ${hit.rule}`,
      sev: hit.severity === 'high' ? 'P1' : 'P2',
      status: 'Open',
      source: '—',
      pipeline: '—',
      run_id: '',
      owner: 'Ivy Engineer',
      tags: ['dq', `dqkey:${k}`],
      description: `Threshold ${hit.threshold} exceeded with ${hit.hits_24h} hits on ${hit.dataset}.`
    });
  });

  STATE.data.alerts = alerts;
  // Update KPI for open alerts (demo)
  const openCount = alerts.filter(a => a.status === 'Open').length;
  STATE.data.kpis.open_alerts = openCount;
}

/* -------------------- Render shell (includes Policy Simulator banner) -------------------- */
function renderShell(){
  const k = STATE.data.kpis || {};
  const sim = STATE.data.policy_simulator || {};
  const users = sim.users || [];
  const datasets = sim.datasets || [];

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-1">Monitoring & Alerts</h1>
        <p class="text-muted mb-0">Operate with least-privilege. All actions are audit-logged. Steward approvals govern promotion.</p>
      </div>
      <div class="d-flex toolbar align-items-center flex-wrap">
        <input id="q" class="form-control form-control-sm" placeholder="Search alerts…" style="max-width:240px">
        <select id="f-sev" class="form-select form-select-sm">
          <option value="">Sev: All</option><option>P1</option><option>P2</option><option>P3</option>
        </select>
        <select id="f-status" class="form-select form-select-sm">
          <option value="">Status: All</option><option>Open</option><option>Acknowledged</option><option>Resolved</option>
        </select>
        <select id="f-source" class="form-select form-select-sm">
          <option value="">Source: All</option><option>Canvas</option><option>PowerSchool</option><option>NWEA MAP</option><option>—</option>
        </select>
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm ms-1">Refresh</button>
      </div>
    </div>

    <!-- Policy Simulator -->
    <section class="sim-banner mb-2">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <strong>Policy Simulator</strong>
        <button id="simTrace" class="btn btn-outline-secondary btn-sm">Open Decision Trace</button>
      </div>
      <div class="sim-grid">
        <div>
          <label class="form-label mb-1">User</label>
          <select id="simUser" class="form-select form-select-sm">
            ${users.map(u=>`<option value="${u.id}">${escapeHtml(u.display)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label mb-1">Dataset</label>
          <select id="simDataset" class="form-select form-select-sm">
            ${datasets.map(d=>`<option value="${d.name}">${escapeHtml(d.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label mb-1">Purpose</label>
          <select id="simPurpose" class="form-select form-select-sm">
            <option value="analytics">Analytics</option>
            <option value="export">Export</option>
            <option value="ad-hoc">Ad-hoc</option>
          </select>
        </div>
        <div class="d-flex align-items-end">
          <button id="simRun" class="btn btn-primary btn-sm w-100">Preview Access</button>
        </div>
      </div>
      <div class="row g-2 mt-2">
        <div class="col-lg-4">
          <div class="sim-result" id="simDecision"><span class="text-body-secondary">Decision will appear here…</span></div>
        </div>
        <div class="col-lg-4">
          <div class="sim-result" id="simMasking"><span class="text-body-secondary">Masking preview…</span></div>
        </div>
        <div class="col-lg-4">
          <div class="sim-result" id="simRls"><span class="text-body-secondary">Row-level scope…</span></div>
        </div>
      </div>
    </section>

    <!-- KPIs -->
    <section class="kpis" aria-label="Monitoring KPIs">
      <div class="kpi"><div class="label">Uptime (30d)</div><div class="value" id="k-uptime">${k.uptime_30d || '—'}</div><div class="foot">Across ingest & canonical jobs</div></div>
      <div class="kpi"><div class="label">Open Alerts</div><div class="value" id="k-open">${k.open_alerts ?? '—'}</div><div class="foot">Actionable incidents</div></div>
      <div class="kpi"><div class="label">DQ Hits (24h)</div><div class="value" id="k-dq">${k.dq_hits_24h ?? '—'}</div><div class="foot">Threshold breaches</div></div>
      <div class="kpi"><div class="label">Drift Signals (7d)</div><div class="value" id="k-drift">${k.drift_signals_7d ?? '—'}</div><div class="foot">Statistical anomalies</div></div>
    </section>

    <div class="row g-3">
      <!-- Alerts -->
      <div class="col-12">
        <div class="card shadow-sm">
          <div class="card-header bg-body d-flex justify-content-between align-items-center">
            <strong>Active Alerts</strong>
            <div class="small text-body-secondary">Acknowledging or resolving is audit-logged; escalation follows policy.</div>
          </div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light"><tr>
                <th>Opened</th><th>Title</th><th>Sev</th><th>Status</th><th>Source</th><th>Pipeline</th><th class="text-end">Actions</th>
              </tr></thead>
              <tbody id="rows-alerts"></tbody>
            </table>
          </div>
          <div class="card-footer d-flex justify-content-between align-items-center">
            <small class="text-body-secondary">Use detail to triage and follow run links for logs.</small>
            <nav class="d-flex align-items-center gap-2">
              <button class="btn btn-sm btn-outline-secondary" id="pgA-first">&laquo;</button>
              <button class="btn btn-sm btn-outline-secondary" id="pgA-prev">&lsaquo;</button>
              <span class="small" id="pgA-info">Page 1 of 1</span>
              <button class="btn btn-sm btn-outline-secondary" id="pgA-next">&rsaquo;</button>
              <button class="btn btn-sm btn-outline-secondary" id="pgA-last">&raquo;</button>
            </nav>
          </div>
        </div>
      </div>

      <!-- Data Quality -->
      <div class="col-xl-6">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body"><strong>Data Quality Rule Hits (24h)</strong></div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light"><tr><th>Rule</th><th>Dataset</th><th>Severity</th><th>Hits</th><th>Threshold</th><th>Status</th></tr></thead>
              <tbody id="rows-dq"></tbody>
            </table>
          </div>
          <div class="card-footer small text-body-secondary">Breaches can automatically open alerts per policy.</div>
        </div>
      </div>

      <!-- Drift -->
      <div class="col-xl-6">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body"><strong>Drift Signals (7d)</strong></div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light"><tr><th>Field</th><th>Segment</th><th>From → To</th><th>Δ</th><th>Test</th><th>Status</th></tr></thead>
              <tbody id="rows-drift"></tbody>
            </table>
          </div>
          <div class="card-footer small text-body-secondary">Investigate upstream changes or mapping regressions.</div>
        </div>
      </div>
    </div>
  `;
}

/* -------------------- Toolbar & rendering -------------------- */
function bindToolbar(){
  $('#q').addEventListener('input', e => { STATE.filters.q = e.target.value.toLowerCase().trim(); STATE.pages.alerts = 0; renderAlerts(); });
  $('#f-sev').addEventListener('change', e => { STATE.filters.sev = e.target.value; STATE.pages.alerts = 0; renderAlerts(); });
  $('#f-status').addEventListener('change', e => { STATE.filters.status = e.target.value; STATE.pages.alerts = 0; renderAlerts(); });
  $('#f-source').addEventListener('change', e => { STATE.filters.source = e.target.value; STATE.pages.alerts = 0; renderAlerts(); });
  $('#btnRefresh').addEventListener('click', async ()=>{ await loadData(); autoCreateDQAlerts(); renderAll(); });

  // Policy simulator
  $('#simRun').addEventListener('click', runSimulator);
  $('#simTrace').addEventListener('click', openSimTrace);
}

function renderAll(){
  renderAlerts();
  renderDQ();
  renderDrift();
}

/* -------------------- Alerts (filter + pagination) -------------------- */
function sevBadge(s){
  const map = { "P1":"danger", "P2":"warning", "P3":"secondary" };
  const tone = map[s] || "secondary";
  return `<span class="badge text-bg-${tone}">${s}</span>`;
}
function statusBadge(s){
  const tone = s === 'Open' ? 'danger' : (s === 'Acknowledged' ? 'warning' : 'success');
  return `<span class="badge text-bg-${tone}">${s}</span>`;
}
function filterAlerts(){
  const { q, sev, status, source } = STATE.filters;
  return (STATE.data.alerts || []).filter(a=>{
    const okQ = !q || JSON.stringify(a).toLowerCase().includes(q);
    const okS = !status || a.status === status;
    const okV = !sev || a.sev === sev;
    const okSrc = !source || a.source === source;
    return okQ && okS && okV && okSrc;
  });
}
function alertsPages(){ return Math.max(1, Math.ceil(filterAlerts().length / STATE.pageSize)); }
function renderAlerts(){
  const list = filterAlerts();
  const start = STATE.pages.alerts * STATE.pageSize;
  const pageItems = list.slice(start, start + STATE.pageSize);
  $('#rows-alerts').innerHTML = pageItems.map(a => `
    <tr>
      <td class="text-nowrap">${a.opened}</td>
      <td>${escapeHtml(a.title)}</td>
      <td>${sevBadge(a.sev)}</td>
      <td>${statusBadge(a.status)}</td>
      <td>${escapeHtml(a.source || '—')}</td>
      <td><a href="pipeline-detail.html?pipeline=${encodeURIComponent(a.pipeline || '')}">${escapeHtml(a.pipeline || '—')}</a></td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary act-detail" data-id="${a.id}">Detail</button>
          <button class="btn btn-outline-secondary act-ack"    data-id="${a.id}">Acknowledge</button>
          <button class="btn btn-outline-secondary act-resolve" data-id="${a.id}">Resolve</button>
        </div>
      </td>
    </tr>`).join('') || `<tr><td class="p-3" colspan="7">No alerts.</td></tr>`;

  // pager controls
  const pages = alertsPages();
  $('#pgA-info').textContent = `Page ${STATE.pages.alerts + 1} of ${pages}`;
  $('#pgA-first').disabled = $('#pgA-prev').disabled = STATE.pages.alerts <= 0;
  $('#pgA-last').disabled  = $('#pgA-next').disabled = STATE.pages.alerts >= pages - 1;
  $('#pgA-first').onclick = ()=>{ STATE.pages.alerts = 0; renderAlerts(); };
  $('#pgA-prev').onclick  = ()=>{ STATE.pages.alerts = Math.max(0, STATE.pages.alerts-1); renderAlerts(); };
  $('#pgA-next').onclick  = ()=>{ STATE.pages.alerts = Math.min(pages-1, STATE.pages.alerts+1); renderAlerts(); };
  $('#pgA-last').onclick  = ()=>{ STATE.pages.alerts = pages-1; renderAlerts(); };

  // wire actions
  $$('.act-detail').forEach(b=> b.addEventListener('click', ()=> openAlertModal(b.dataset.id)));
  $$('.act-ack').forEach(b=> b.addEventListener('click', ()=> acknowledge(b.dataset.id)));
  $$('.act-resolve').forEach(b=> b.addEventListener('click', ()=> resolveAlert(b.dataset.id)));
}

function openAlertModal(id){
  const a = (STATE.data.alerts || []).find(x => x.id === id);
  if (!a) return;
  $('#alertModalLabel').textContent = `${a.id} — ${a.title}`;
  $('#alertModalBody').innerHTML = `
    <dl class="row mb-0">
      <dt class="col-4">Opened</dt><dd class="col-8">${a.opened}</dd>
      <dt class="col-4">Severity</dt><dd class="col-8">${sevBadge(a.sev)}</dd>
      <dt class="col-4">Status</dt><dd class="col-8">${statusBadge(a.status)}</dd>
      <dt class="col-4">Source</dt><dd class="col-8">${escapeHtml(a.source||'—')}</dd>
      <dt class="col-4">Pipeline</dt><dd class="col-8"><a href="pipeline-detail.html?pipeline=${encodeURIComponent(a.pipeline||'')}">${escapeHtml(a.pipeline||'—')}</a></dd>
      <dt class="col-4">Run ID</dt><dd class="col-8"><code>${escapeHtml(a.run_id||'—')}</code></dd>
      <dt class="col-4">Owner</dt><dd class="col-8">${escapeHtml(a.owner||'—')}</dd>
      <dt class="col-4">Tags</dt><dd class="col-8">${(a.tags||[]).map(t=>`<span class="badge rounded-pill badge-mini me-1">${escapeHtml(t)}</span>`).join('')}</dd>
      <dt class="col-4">Description</dt><dd class="col-8">${escapeHtml(a.description||'')}</dd>
    </dl>
    <div class="small text-body-secondary mt-2">All actions are immutably audit-logged. Promotion to publish remains Steward-gated.</div>
  `;
  const modal = new bootstrap.Modal($('#alertModal'));
  modal.show();

  $('#alertAckBtn').onclick = ()=> acknowledge(id, modal);
  $('#alertCloseBtn').onclick = ()=> resolveAlert(id, modal);
}

function acknowledge(id, modal){
  alert(`Alert ${id} acknowledged (demo). Audit log recorded.`);
  const a = (STATE.data.alerts || []).find(x => x.id === id);
  if (a) a.status = 'Acknowledged';
  renderAll();
  if (modal) modal.hide();
}
function resolveAlert(id, modal){
  alert(`Alert ${id} resolved (demo). Audit log recorded.`);
  const a = (STATE.data.alerts || []).find(x => x.id === id);
  if (a) a.status = 'Resolved';
  renderAll();
  if (modal) modal.hide();
}

/* -------------------- Data Quality & Drift (pagination) -------------------- */
function dqPages(){ return Math.max(1, Math.ceil((STATE.data.dq_hits||[]).length / STATE.pageSize)); }
function renderDQ(){
  const start = STATE.pages.dq * STATE.pageSize;
  const list = (STATE.data.dq_hits||[]).slice(start, start + STATE.pageSize);
  $('#rows-dq').innerHTML = list.map(x => `
    <tr>
      <td class="text-nowrap">${escapeHtml(x.rule)}</td>
      <td>${escapeHtml(x.dataset)}</td>
      <td class="text-nowrap">${escapeHtml(x.severity)}</td>
      <td>${x.hits_24h}</td>
      <td>${x.threshold}</td>
      <td class="text-nowrap">${escapeHtml(x.status)}</td>
    </tr>`).join('') || `<tr><td class="p-3" colspan="6">No rule hits in the last 24 hours.</td></tr>`;
}
function driftPages(){ return Math.max(1, Math.ceil((STATE.data.drift||[]).length / STATE.pageSize)); }
function renderDrift(){
  const start = STATE.pages.drift * STATE.pageSize;
  const list = (STATE.data.drift||[]).slice(start, start + STATE.pageSize);
  $('#rows-drift').innerHTML = list.map(x => `
    <tr>
      <td class="text-nowrap">${escapeHtml(x.field)}</td>
      <td class="text-nowrap">${escapeHtml(x.segment||'—')}</td>
      <td>${escapeHtml(x.from)} → ${escapeHtml(x.to)}</td>
      <td><span class="badge rounded-pill badge-mini">${escapeHtml(x.delta)}</span></td>
      <td class="text-nowrap">${escapeHtml(x.test||'—')}</td>
      <td class="text-nowrap">${escapeHtml(x.status||'—')}</td>
    </tr>`).join('') || `<tr><td class="p-3" colspan="6">No drift signals in the selected window.</td></tr>`;
}

/* -------------------- Policy Simulator logic -------------------- */
function runSimulator(){
  const sim = STATE.data.policy_simulator || {};
  const users = sim.users || [];
  const datasets = sim.datasets || [];
  const userId = $('#simUser').value;
  const dsName = $('#simDataset').value;
  const purpose = $('#simPurpose').value;

  const user = users.find(u => u.id === userId);
  const ds   = datasets.find(d => d.name === dsName);
  if (!user || !ds) return;

  // ABAC: must match org; if dataset has term, user's terms must include it (if rule enabled)
  const orgOk  = !sim.abac?.org_must_match || !ds.scope?.org || (user.org && ds.scope.org && user.org.split(',').includes(ds.scope.org));
  const termOk = !sim.abac?.term_must_match_if_present || !ds.scope?.term || (user.terms||[]).includes(ds.scope.term) || (user.terms||[]).includes('All');

  // Masking: map classifications → masked/clear
  const maskMap = sim.masking_rules || {};
  const maskSummary = (ds.classifications||[]).map(c => `${c}: ${maskMap[c] || 'masked'}`);

  // Decision: role & ABAC
  let allow = orgOk && termOk;
  // Data Consumer never gets PII_STRICT in clear
  if (user.role === 'Data Consumer' && (ds.classifications||[]).includes('PII_STRICT')) {
    // allowed with masking only
    allow = allow; // still allowed, but masked
  }
  // Purpose gate: exports require explicit approval (simulated)
  if (purpose === 'export' && user.role === 'Data Consumer') {
    // allowed only if dataset is DEIDENTIFIED
    if (!(ds.classifications||[]).includes('DEIDENTIFIED')) allow = false;
  }

  $('#simDecision').innerHTML = allow
    ? `<span class="text-success fw-semibold">ALLOW</span> <span class="text-body-secondary">(enforced masking & ABAC)</span>`
    : `<span class="text-danger fw-semibold">DENY</span> <span class="text-body-secondary">(outside policy scope)</span>`;

  $('#simMasking').innerHTML = `<div class="small">Classifications → action</div><div>${maskSummary.map(s=>`<span class="badge rounded-pill badge-mini me-1">${escapeHtml(s)}</span>`).join(' ')}</div>`;
  $('#simRls').innerHTML = `
    <div class="small">Row scope derived from attributes</div>
    <div>org=${escapeHtml(ds.scope?.org || '—')}, term=${escapeHtml(ds.scope?.term || '—')}</div>
    <div class="small text-body-secondary">user.org=${escapeHtml(user.org)}, user.terms=${escapeHtml((user.terms||[]).join(','))}</div>
  `;
}

function openSimTrace(){
  const u = $('#simUser'); const d = $('#simDataset'); const p = $('#simPurpose');
  const userText = u.options[u.selectedIndex]?.text || '';
  const dsText   = d.options[d.selectedIndex]?.text || '';
  const purpose  = p.value;
  const body = `
    <div class="mb-2"><strong>Inputs</strong></div>
    <pre class="mb-3 bg-light p-2 border rounded small">${escapeHtml(JSON.stringify({
      user: STATE.data.policy_simulator.users.find(x=>x.id===u.value),
      dataset: STATE.data.policy_simulator.datasets.find(x=>x.name===d.value),
      purpose
    }, null, 2))}</pre>
    <div class="mb-2"><strong>Rules Evaluated</strong></div>
    <ul class="small">
      <li>ABAC: org must match dataset.scope.org (if present)</li>
      <li>ABAC: term must match when dataset.scope.term is present</li>
      <li>Masking: PII_STRICT & PII_DIRECTORY → masked; DEIDENTIFIED → clear</li>
      <li>Purpose: Data Consumer exporting non-DEIDENTIFIED → deny</li>
    </ul>
    <div class="text-body-secondary">All final enforcement occurs server-side; this is a UI preview for governance and debugging.</div>
  `;
  $('#simModalLabel').textContent = `Policy Simulator — ${userText} × ${dsText}`;
  $('#simModalBody').innerHTML = body;
  new bootstrap.Modal($('#simModal')).show();
}

/* -------------------- Utils -------------------- */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
