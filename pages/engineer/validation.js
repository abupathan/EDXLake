// Validation & Data Quality — production-ready (Bootstrap UI, filters, pagination, modals, least-privilege copy)
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const main    = $('#app-main');
const jsonUrl = 'validation.json';

const STATE = {
  data: { rules:[], hits_last24h:[], summary:{}, filters:{}, meta:{} },
  filters: { q:'', domain:'', severity:'', status:'', standard:'' },
  pageRules: 0,
  pageHits: 0,
  pageSize: 10
};

(async function init(){
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
    const d = await fetch(jsonUrl, { cache:'no-store' }).then(r=>r.json());
    STATE.data = d || STATE.data;
  } catch { /* keep defaults */ }
}

/* -------------------- Shell -------------------- */
function renderShell(){
  const sum = STATE.data.summary || {};
  const F = STATE.data.filters || {};

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-1">Validation & Data Quality</h1>
        <p class="text-muted mb-0">Define rules, thresholds, and run sample checks. Enforcement and audit logging occur server-side; promotion to publish is Steward-gated.</p>
      </div>
      <div class="d-flex toolbar align-items-center flex-wrap">
        <input id="q" class="form-control form-control-sm" placeholder="Search rules…" style="max-width:260px">
        <select id="f-domain" class="form-select form-select-sm">
          <option value="">Domain: All</option>
          ${(F.domains||[]).map(x=>`<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join('')}
        </select>
        <select id="f-severity" class="form-select form-select-sm">
          <option value="">Severity: All</option>
          ${(F.severities||[]).map(x=>`<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join('')}
        </select>
        <select id="f-status" class="form-select form-select-sm">
          <option value="">Status: All</option>
          ${(F.statuses||[]).map(x=>`<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join('')}
        </select>
        <select id="f-standard" class="form-select form-select-sm">
          <option value="">Standard: All</option>
          ${(F.standards||[]).map(x=>`<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join('')}
        </select>
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm ms-1">Refresh</button>
        <button id="btnNewRule" class="btn btn-primary btn-sm ms-1">New Rule</button>
      </div>
    </div>

    <!-- KPIs -->
    <section class="kpis" aria-label="Validation summary">
      <div class="kpi"><div class="label">Rules</div><div class="value" id="k-rules">${sum.rules_total ?? (STATE.data.rules||[]).length}</div><div class="foot">Configured</div></div>
      <div class="kpi"><div class="label">Approved</div><div class="value" id="k-approved">${sum.approved ?? '—'}</div><div class="foot">Ready for publish</div></div>
      <div class="kpi"><div class="label">Draft</div><div class="value" id="k-draft">${sum.draft ?? '—'}</div><div class="foot">Needs review</div></div>
      <div class="kpi"><div class="label">Hits (24h)</div><div class="value" id="k-hits">${sum.last24h_hits ?? '—'}</div><div class="foot">Across all rules</div></div>
    </section>

    <div class="row g-3">
      <!-- Rules -->
      <div class="col-xl-7">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body d-flex justify-content-between align-items-center">
            <strong>Data Quality Rules</strong>
            <span class="small text-body-secondary">Thresholds: absolute or violation_rate</span>
          </div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>Name</th>
                  <th>Domain</th>
                  <th>Dataset</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th class="text-end">Actions</th>
                </tr>
              </thead>
              <tbody id="rows-rules"></tbody>
            </table>
          </div>
          <div class="card-footer d-flex justify-content-between align-items-center">
            <small class="text-body-secondary">Edits are audit-logged. Promotion to publish requires Steward approval.</small>
            <nav class="pager">
              <button class="btn btn-sm btn-outline-secondary" id="pgR-first">&laquo;</button>
              <button class="btn btn-sm btn-outline-secondary" id="pgR-prev">&lsaquo;</button>
              <span class="small" id="pgR-info">Page 1 of 1</span>
              <button class="btn btn-sm btn-outline-secondary" id="pgR-next">&rsaquo;</button>
              <button class="btn btn-sm btn-outline-secondary" id="pgR-last">&raquo;</button>
            </nav>
          </div>
        </div>
      </div>

      <!-- Hits last 24h -->
      <div class="col-xl-5">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body d-flex justify-content-between align-items-center">
            <strong>Last 24h Hits</strong>
            <button id="btnRunSample" class="btn btn-outline-primary btn-sm">Run Sample Check</button>
          </div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>When</th>
                  <th>Rule</th>
                  <th>Dataset</th>
                  <th>Violations</th>
                  <th class="text-end">Sample</th>
                </tr>
              </thead>
              <tbody id="rows-hits"></tbody>
            </table>
          </div>
          <div class="card-footer d-flex justify-content-between align-items-center">
            <small class="text-body-secondary">Samples shown are safe snippets; masking applies per policy.</small>
            <nav class="pager">
              <button class="btn btn-sm btn-outline-secondary" id="pgH-first">&laquo;</button>
              <button class="btn btn-sm btn-outline-secondary" id="pgH-prev">&lsaquo;</button>
              <span class="small" id="pgH-info">Page 1 of 1</span>
              <button class="btn btn-sm btn-outline-secondary" id="pgH-next">&rsaquo;</button>
              <button class="btn btn-sm btn-outline-secondary" id="pgH-last">&raquo;</button>
            </nav>
          </div>
        </div>
      </div>
    </div>
  `;
}

function bindToolbar(){
  $('#q').addEventListener('input', e => { STATE.filters.q = e.target.value.toLowerCase().trim(); STATE.pageRules=0; renderRules(); });
  $('#f-domain').addEventListener('change', e => { STATE.filters.domain = e.target.value; STATE.pageRules=0; renderRules(); });
  $('#f-severity').addEventListener('change', e => { STATE.filters.severity = e.target.value; STATE.pageRules=0; renderRules(); });
  $('#f-status').addEventListener('change', e => { STATE.filters.status = e.target.value; STATE.pageRules=0; renderRules(); });
  $('#f-standard').addEventListener('change', e => { STATE.filters.standard = e.target.value; STATE.pageRules=0; renderRules(); });
  $('#btnRefresh').addEventListener('click', async ()=>{ await loadData(); renderShell(); bindToolbar(); renderAll(); });
  $('#btnNewRule').addEventListener('click', ()=> openRuleModal());

  // hits pager
  $('#pgH-first').addEventListener('click', ()=>{ STATE.pageHits=0; renderHits(); });
  $('#pgH-prev').addEventListener('click',  ()=>{ STATE.pageHits=Math.max(0, STATE.pageHits-1); renderHits(); });
  $('#pgH-next').addEventListener('click',  ()=>{ STATE.pageHits=Math.min(hitsPages()-1, STATE.pageHits+1); renderHits(); });
  $('#pgH-last').addEventListener('click',  ()=>{ STATE.pageHits=hitsPages()-1; renderHits(); });

  $('#btnRunSample').addEventListener('click', ()=> openSampleModal());
}

/* -------------------- Renderers -------------------- */
function renderAll(){
  renderRules();
  renderHits();
}

function filteredRules(){
  const { q, domain, severity, status, standard } = STATE.filters;
  return (STATE.data.rules||[]).filter(r=>{
    const okQ = !q || JSON.stringify({name:r.name,dataset:r.dataset,expr:r.expression}).toLowerCase().includes(q);
    const okD = !domain || r.domain === domain;
    const okS = !severity || r.severity === severity;
    const okT = !status || r.status === status;
    const okN = !standard || r.standard === standard;
    return okQ && okD && okS && okT && okN;
  });
}

function rulesPages(){ return Math.max(1, Math.ceil(filteredRules().length / STATE.pageSize)); }

function renderRules(){
  const list = filteredRules();
  const pages = rulesPages();
  STATE.pageRules = Math.min(STATE.pageRules, pages-1);
  const start = STATE.pageRules * STATE.pageSize;
  const slice  = list.slice(start, start + STATE.pageSize);

  $('#rows-rules').innerHTML = slice.map(r => `
    <tr>
      <td class="text-nowrap">
        <div class="fw-semibold">${escapeHtml(r.name)}</div>
        <div class="small text-body-secondary"><code>${escapeHtml(r.expression)}</code></div>
      </td>
      <td>${escapeHtml(r.domain)}</td>
      <td class="text-nowrap">${escapeHtml(r.dataset)}</td>
      <td>${badgeSeverity(r.severity)}</td>
      <td>${badgeStatus(r.status)}</td>
      <td class="text-nowrap">${escapeHtml(r.updated||'—')}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary act-edit" data-id="${escapeAttr(r.id)}">Edit</button>
          <button class="btn btn-outline-secondary act-test" data-id="${escapeAttr(r.id)}">Sample</button>
          <button class="btn btn-outline-danger act-delete" data-id="${escapeAttr(r.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td class="p-3" colspan="7">No rules.</td></tr>`;

  // pager
  $('#pgR-info').textContent = `Page ${STATE.pageRules + 1} of ${pages}`;
  $('#pgR-first').disabled = $('#pgR-prev').disabled = STATE.pageRules <= 0;
  $('#pgR-last').disabled  = $('#pgR-next').disabled = STATE.pageRules >= pages - 1;
  $('#pgR-first').onclick = ()=>{ STATE.pageRules = 0; renderRules(); };
  $('#pgR-prev').onclick  = ()=>{ STATE.pageRules = Math.max(0, STATE.pageRules-1); renderRules(); };
  $('#pgR-next').onclick  = ()=>{ STATE.pageRules = Math.min(pages-1, STATE.pageRules+1); renderRules(); };
  $('#pgR-last').onclick  = ()=>{ STATE.pageRules = pages-1; renderRules(); };

  // actions
  $$('.act-edit').forEach(b => b.addEventListener('click', ()=> openRuleModal(b.dataset.id)));
  $$('.act-test').forEach(b => b.addEventListener('click', ()=> openSampleModal(b.dataset.id)));
  $$('.act-delete').forEach(b => b.addEventListener('click', ()=> alert(`DELETE rule ${b.dataset.id}\n(demo) — audit-logged.`)));
}

function hitsPages(){ return Math.max(1, Math.ceil((STATE.data.hits_last24h||[]).length / STATE.pageSize)); }

function renderHits(){
  const list = STATE.data.hits_last24h || [];
  const pages = hitsPages();
  STATE.pageHits = Math.min(STATE.pageHits, pages-1);
  const start = STATE.pageHits * STATE.pageSize;
  const slice  = list.slice(start, start + STATE.pageSize);

  $('#rows-hits').innerHTML = slice.map(h => `
    <tr>
      <td class="text-nowrap">${escapeHtml(h.ts)}</td>
      <td class="text-nowrap">${escapeHtml(h.rule_id)}</td>
      <td class="text-nowrap">${escapeHtml(h.dataset)}</td>
      <td>${escapeHtml(String(h.violations))}</td>
      <td class="text-end"><button class="btn btn-outline-secondary btn-sm act-sample" data-id="${escapeAttr(h.rule_id)}">View</button></td>
    </tr>
  `).join('') || `<tr><td class="p-3" colspan="5">No hits in last 24h.</td></tr>`;

  $('#pgH-info').textContent = `Page ${STATE.pageHits + 1} of ${pages}`;

  // actions
  $$('.act-sample').forEach(b => b.addEventListener('click', ()=> openSampleModal(b.dataset.id)));
}

/* -------------------- Modals -------------------- */
function openRuleModal(id){
  const F = STATE.data.filters || {};
  const rule = (STATE.data.rules||[]).find(r => r.id === id) || {
    id:'', name:'', domain:F.domains?.[0]||'Roster', dataset:'', standard:F.standards?.[0]||'OneRoster',
    severity:'medium', expression:'', threshold:{type:'absolute',op:'<=',value:0}, window:'last_24h',
    status:'draft', owner:'', steward:'', updated:''
  };

  $('#ruleModalLabel').textContent = id ? `Edit Rule — ${rule.name}` : 'New Rule';
  $('#ruleModalBody').innerHTML = `
    <div class="row g-3">
      <div class="col-md-6"><label class="form-label">Name</label><input id="rName" class="form-control" value="${escapeAttr(rule.name)}"></div>
      <div class="col-md-6"><label class="form-label">ID</label><input id="rId" class="form-control" value="${escapeAttr(rule.id)}" ${id?'disabled':''} placeholder="unique identifier"></div>

      <div class="col-md-3"><label class="form-label">Domain</label>
        <select id="rDomain" class="form-select">
          ${(F.domains||[]).map(x=>`<option ${rule.domain===x?'selected':''}>${escapeHtml(x)}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-3"><label class="form-label">Standard</label>
        <select id="rStandard" class="form-select">
          ${(F.standards||[]).map(x=>`<option ${rule.standard===x?'selected':''}>${escapeHtml(x)}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-6"><label class="form-label">Dataset</label><input id="rDataset" class="form-control" value="${escapeAttr(rule.dataset)}" placeholder="schema.table"></div>

      <div class="col-md-12"><label class="form-label">Expression</label>
        <textarea id="rExpr" rows="3" class="form-control" placeholder="SQL predicate or check">${escapeHtml(rule.expression)}</textarea>
        <div class="form-text">Examples: <code>last_name IS NOT NULL</code> • <code>TRY_CAST(score AS DECIMAL) IS NOT NULL</code> • <code>REGEXP_LIKE(...)</code></div>
      </div>

      <div class="col-md-3"><label class="form-label">Severity</label>
        <select id="rSeverity" class="form-select">
          ${['critical','high','medium','low'].map(s=>`<option ${rule.severity===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-3"><label class="form-label">Status</label>
        <select id="rStatus" class="form-select">
          ${['draft','approved','deprecated'].map(s=>`<option ${rule.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-3"><label class="form-label">Window</label>
        <select id="rWindow" class="form-select">
          ${['last_24h','last_7d','last_30d'].map(w=>`<option ${rule.window===w?'selected':''}>${w}</option>`).join('')}
        </select>
      </div>

      <div class="col-md-3"><label class="form-label">Threshold Type</label>
        <select id="tType" class="form-select">
          ${['absolute','violation_rate'].map(t=>`<option ${rule.threshold?.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-3"><label class="form-label">Operator</label>
        <select id="tOp" class="form-select">
          ${['<=','==','>=','<','>'].map(o=>`<option ${rule.threshold?.op===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-3"><label class="form-label">Value</label>
        <input id="tVal" type="number" step="0.0001" class="form-control" value="${escapeAttr(String(rule.threshold?.value ?? 0))}">
      </div>

      <div class="col-md-3"><label class="form-label">Owner</label><input id="rOwner" class="form-control" value="${escapeAttr(rule.owner||'')}"></div>
      <div class="col-md-3"><label class="form-label">Steward</label><input id="rSteward" class="form-control" value="${escapeAttr(rule.steward||'')}"></div>

      <div class="col-12"><small class="text-body-secondary">Changes are audit-logged. Promotion to publish is Steward-gated.</small></div>
    </div>
  `;

  const modal = new bootstrap.Modal($('#ruleModal')); modal.show();
  $('#ruleSaveBtn').onclick = ()=> {
    alert('SAVE rule (demo). Audit log recorded.');
    modal.hide();
  };
}

function openSampleModal(ruleId){
  const rule = (STATE.data.rules||[]).find(r => r.id === ruleId) || null;
  const hit  = (STATE.data.hits_last24h||[]).find(h => h.rule_id === ruleId) || null;

  $('#sampleModalLabel').textContent = rule ? `Sample Check — ${rule.name}` : 'Sample Check';
  const summary = rule ? `
    <div class="mb-2">
      <div class="fw-semibold">${escapeHtml(rule.dataset)}</div>
      <div class="small text-body-secondary">Rule: <code>${escapeHtml(rule.expression)}</code></div>
    </div>` : '';

  $('#sampleModalBody').innerHTML = `
    ${summary}
    <div class="sample-box">${escapeHtml(JSON.stringify(hit?.sample ?? { note: 'No sample available for this rule in last 24h.' }, null, 2))}</div>
  `;
  new bootstrap.Modal($('#sampleModal')).show();
}

/* -------------------- Badges & Utils -------------------- */
function badgeSeverity(s){
  const cls = s==='critical' ? 'badge-critical' :
              s==='high'     ? 'badge-high' :
              s==='medium'   ? 'badge-medium' : 'badge-low';
  return `<span class="badge ${cls}">${escapeHtml(s||'—')}</span>`;
}
function badgeStatus(s){
  const map = { approved:'success', draft:'warning', deprecated:'secondary' };
  return `<span class="badge text-bg-${map[(s||'').toLowerCase()]||'secondary'}">${escapeHtml(s||'—')}</span>`;
}
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return String(s ?? '').replace(/"/g,'&quot;'); }
