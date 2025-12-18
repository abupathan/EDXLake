/* Data Quality Rules (Steward) — production-ready
 * - CSP-safe (no inline); uses partials-loader for shared UI + auth
 * - Search, category/owner/gate filters, dataset/field search, cursor-style pagination (10/20/50)
 * - New / Edit / Delete with confirmation; History viewer (stub); CSV export
 * - Validation: thresholds (% and hour windows), rule name & target syntax; audit stubs
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const JSON_URL = 'dq-rules.json';

const STATE = {
  raw: null,
  rows: [],
  page: 1,
  pageSize: 10,
  q: '',
  category: 'Any',
  owner: 'Any',
  gate: 'Any'
};

(async function init(){
  const d = await fetch(JSON_URL, { cache: 'no-store' })
    .then(r => r.json())
    .catch(() => ({ meta:{}, categories:[], owners:[], defaults:{pageSize:10,gates:[]}, rules:[] }));

  STATE.raw = d;
  STATE.rows = (d.rules || []).map(x => ({...x}));
  STATE.pageSize = d?.defaults?.pageSize || 10;

  renderShell(d);
  wireFilters(d);
  draw();
})();

/* ---------- Render shell ---------- */
function renderShell(d){
  $('#app-main').innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">Data Quality Rules</h1>
        <div class="small text-body-secondary">Quality gates for <code>staging/publish/canonical</code>. Changes are audit-logged.</div>
      </div>
      <div class="d-flex actions">
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm" type="button" aria-label="Refresh">
          <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Refresh
        </button>
        <button id="btnExport" class="btn btn-outline-secondary btn-sm" type="button">Export CSV</button>
        <button id="btnNew" class="btn btn-primary btn-sm" type="button">New Rule</button>
      </div>
    </div>

    <div class="card shadow-sm">
      <div class="card-body border-bottom bg-body-tertiary filters">
        <form class="row g-2 align-items-end" id="filterForm">
          <div class="col-12 col-sm-6 col-md-4 col-xl-3">
            <label for="search" class="form-label small text-body-secondary">Search (rule, target, owner)</label>
            <input id="search" class="form-control form-control-sm" type="search" placeholder="Type to search…">
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="category" class="form-label small text-body-secondary">Category</label>
            <select id="category" class="form-select form-select-sm" aria-label="Category">
              <option>Any</option>
              ${(d.categories||[]).map(c=>`<option>${c}</option>`).join('')}
            </select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="owner" class="form-label small text-body-secondary">Owner</label>
            <select id="owner" class="form-select form-select-sm" aria-label="Owner">
              <option>Any</option>
              ${(d.owners||[]).map(o=>`<option>${o}</option>`).join('')}
            </select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="gate" class="form-label small text-body-secondary">Gate</label>
            <select id="gate" class="form-select form-select-sm" aria-label="Gate">
              <option>Any</option>
              ${(d.defaults?.gates||[]).map(g=>`<option>${g}</option>`).join('')}
            </select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="pageSize" class="form-label small text-body-secondary">Rows per page</label>
            <select id="pageSize" class="form-select form-select-sm page-size" aria-label="Rows per page">
              ${[10,20,50].map(n => `<option value="${n}" ${n==(STATE.pageSize||10)?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
        </form>
      </div>

      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Rule</th>
              <th>Target</th>
              <th>Category</th>
              <th>Threshold</th>
              <th>Owner</th>
              <th>Gate</th>
              <th>Updated</th>
              <th class="text-end">Action</th>
            </tr>
          </thead>
          <tbody id="rows"><tr><td colspan="8"><div class="empty text-center">Loading…</div></td></tr></tbody>
        </table>
      </div>

      <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
        <div id="rangeLabel" class="small text-body-secondary">Rows 0–0 of 0</div>
        <nav aria-label="Pagination"><ul class="pagination pagination-sm mb-0" id="pager"></ul></nav>
      </div>
    </div>

    <!-- Modals -->
    <div class="modal fade" id="ruleModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <form class="modal-content" id="ruleForm">
          <div class="modal-header">
            <h2 class="modal-title fs-6" id="ruleTitle">New Rule</h2>
            <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-12 col-md-6">
                <label class="form-label">Rule name</label>
                <input id="rName" class="form-control" required placeholder="e.g., not_null(last_name)">
                <div class="form-text">Use <code>snake_case(args)</code> convention.</div>
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label">Target dataset/field</label>
                <input id="rTarget" class="form-control" required placeholder="schema.table.column or table.(col1,col2)">
                <div class="form-text">Examples: <code>canonical.oneroster.users.last_name</code>, <code>pub_k12_enrollment_snapshot@1.(student_id,term)</code></div>
              </div>

              <div class="col-6 col-md-4">
                <label class="form-label">Category</label>
                <select id="rCategory" class="form-select" required>
                  ${(d.categories||[]).map(c=>`<option>${c}</option>`).join('')}
                </select>
              </div>
              <div class="col-6 col-md-4">
                <label class="form-label">Threshold</label>
                <input id="rThreshold" class="form-control" required placeholder=">= 99.5% | 100% | <= 24h">
                <div class="form-text">Percent or hours window. Patterns: <code>^((>=\\s*)?\\d{1,3}(\\.\\d+)?%|<=\\s*\\d+h)$</code></div>
              </div>
              <div class="col-6 col-md-4">
                <label class="form-label">Gate</label>
                <select id="rGate" class="form-select" required>
                  ${(d.defaults?.gates||[]).map(g=>`<option>${g}</option>`).join('')}
                </select>
              </div>

              <div class="col-6">
                <label class="form-label">Owner</label>
                <select id="rOwner" class="form-select" required>
                  ${(d.owners||[]).map(o=>`<option>${o}</option>`).join('')}
                </select>
              </div>
              <div class="col-6">
                <label class="form-label">Updated (UTC)</label>
                <input id="rUpdated" class="form-control" type="datetime-local" required>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-primary" type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal fade" id="historyModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title fs-6">History</h2>
            <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="small text-body-secondary">Demo stub: immutable audit events & diffs from backend would render here.</div>
            <pre id="historyPre" class="small mt-2 mb-0"></pre>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;

  $('#btnRefresh').addEventListener('click', () => location.reload());
  $('#btnExport').addEventListener('click', exportCsv);
  $('#btnNew').addEventListener('click', () => openRuleModal());

  $('#ruleForm').addEventListener('submit', saveRule);
}

/* ---------- Filters & pagination ---------- */
function wireFilters(d){
  $('#filterForm')?.addEventListener('submit', e => e.preventDefault());
  $('#search').addEventListener('input', e => { STATE.q = e.target.value.trim().toLowerCase(); STATE.page = 1; draw(); });
  $('#category').addEventListener('change', e => { STATE.category = e.target.value; STATE.page = 1; draw(); });
  $('#owner').addEventListener('change', e => { STATE.owner = e.target.value; STATE.page = 1; draw(); });
  $('#gate').addEventListener('change', e => { STATE.gate = e.target.value; STATE.page = 1; draw(); });
  $('#pageSize').addEventListener('change', e => { STATE.pageSize = Number(e.target.value)||10; STATE.page = 1; draw(); });

  // Delegated row actions
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-del]');
    const histBtn = e.target.closest('[data-hist]');
    if (editBtn){ openRuleModal(editBtn.getAttribute('data-edit')); return; }
    if (delBtn){ delRule(delBtn.getAttribute('data-del')); return; }
    if (histBtn){ openHistory(histBtn.getAttribute('data-hist')); return; }
  });
}

function filtered(){
  const q = STATE.q;
  const has = (s) => String(s||'').toLowerCase().includes(q);
  return STATE.rows.filter(r => {
    const matchesQ = !q || has(r.name) || has(r.target) || has(r.owner) || has(r.category) || has(r.gate||'');
    const matchesCat = (STATE.category==='Any') || r.category === STATE.category;
    const matchesOwner = (STATE.owner==='Any') || r.owner === STATE.owner;
    const matchesGate = (STATE.gate==='Any') || (r.gate||'') === STATE.gate;
    return matchesQ && matchesCat && matchesOwner && matchesGate;
  });
}

function draw(){
  const rows = filtered();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / STATE.pageSize));
  if (STATE.page > pages) STATE.page = pages;

  const startIdx = (STATE.page - 1) * STATE.pageSize;
  const endIdx   = Math.min(startIdx + STATE.pageSize, total);
  const slice    = rows.slice(startIdx, endIdx);

  $('#rows').innerHTML = slice.map(renderRow).join('') ||
    `<tr><td colspan="8"><div class="empty text-center">No matching rules</div></td></tr>`;

  $('#rangeLabel').textContent = `Rows ${total ? (startIdx+1) : 0}–${endIdx} of ${total}`;

  // Pager
  const pager = $('#pager');
  const btn = (p, txt, aria, disabled=false, active=false) =>
    `<li class="page-item ${disabled?'disabled':''} ${active?'active':''}">
       <button class="page-link" type="button" data-page="${p}" aria-label="${aria}">${txt}</button>
     </li>`;
  pager.innerHTML = [
    btn(STATE.page-1, '&laquo;', 'Previous', STATE.page<=1),
    ...Array.from({length: pages}).map((_,i)=>btn(i+1, String(i+1), `Page ${i+1}`, false, i+1===STATE.page)),
    btn(STATE.page+1, '&raquo;', 'Next', STATE.page>=pages)
  ].join('');
  $$('#pager .page-link').forEach(el => el.addEventListener('click', () => {
    const p = Number(el.getAttribute('data-page'));
    if (!Number.isNaN(p)) { STATE.page = p; draw(); }
  }));
}

function renderRow(r){
  return `
    <tr>
      <td class="fw-semibold text-nowrap">${escapeHtml(r.name)}</td>
      <td class="text-trunc-md" title="${escapeAttr(r.target)}"><code>${escapeHtml(r.target)}</code></td>
      <td><span class="badge rounded-pill badge-rule">${escapeHtml(r.category)}</span></td>
      <td class="text-nowrap">${escapeHtml(r.threshold)}</td>
      <td>${escapeHtml(r.owner)}</td>
      <td class="text-nowrap">${escapeHtml(r.gate || '—')}</td>
      <td class="text-nowrap">${escapeHtml(r.updated||'')}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-edit="${escapeAttr(r.name)}">Edit</button>
          <button class="btn btn-outline-secondary" data-hist="${escapeAttr(r.name)}">History</button>
          <button class="btn btn-outline-danger" data-del="${escapeAttr(r.name)}">Delete</button>
        </div>
      </td>
    </tr>`;
}

/* ---------- CRUD ---------- */
function openRuleModal(ruleName){
  const isEdit = !!ruleName;
  const r = isEdit ? STATE.rows.find(x => x.name === ruleName) :
    { name:'', target:'', category:(STATE.raw.categories||[])[0]||'', threshold:'100%', owner:(STATE.raw.owners||[])[0]||'', gate:(STATE.raw.defaults?.gates||[])[0]||'', updated:new Date().toISOString().slice(0,16) };

  $('#ruleTitle').textContent = isEdit ? 'Edit Rule' : 'New Rule';
  $('#rName').value = r.name || '';
  $('#rName').readOnly = isEdit; // immutable name
  $('#rTarget').value = r.target || '';
  $('#rCategory').value = r.category || (STATE.raw.categories?.[0]||'');
  $('#rThreshold').value = r.threshold || '100%';
  $('#rGate').value = r.gate || (STATE.raw.defaults?.gates?.[0]||'');
  $('#rOwner').value = r.owner || (STATE.raw.owners?.[0]||'');
  // convert ISO to local datetime-local input format when editing
  const ts = (r.updated && r.updated.includes('T')) ? r.updated.slice(0,16) : new Date().toISOString().slice(0,16);
  $('#rUpdated').value = ts;

  bootstrap.Modal.getOrCreateInstance($('#ruleModal')).show();
}

function saveRule(ev){
  ev.preventDefault();
  // Validation
  const name = $('#rName').value.trim();
  const target = $('#rTarget').value.trim();
  const category = $('#rCategory').value;
  const threshold = $('#rThreshold').value.trim();
  const gate = $('#rGate').value;
  const owner = $('#rOwner').value;
  const updatedLocal = $('#rUpdated').value; // yyyy-mm-ddThh:mm
  if (!name || !target || !category || !threshold || !owner || !updatedLocal) return;

  const nameOk = /^[a-z0-9_]+\(.*\)$/.test(name);
  const targetOk = /^[\w.@]+(\.[\w@() ,]+)?$/i.test(target);
  const thresholdOk = /^((>=\s*)?\d{1,3}(\.\d+)?%|<=\s*\d+h)$/.test(threshold);
  if (!nameOk){ alert('Invalid rule name. Use pattern like not_null(last_name)'); return; }
  if (!targetOk){ alert('Invalid target. Use schema.table.column or table.(col1,col2)'); return; }
  if (!thresholdOk){ alert('Invalid threshold. Use ">= 99.5%" or "100%" or "<= 24h".'); return; }

  const updated = toUtcIso(updatedLocal);

  const existing = STATE.rows.findIndex(x => x.name === name);
  const payload = { name, target, category, threshold, owner, gate, updated };

  if (existing >= 0) {
    STATE.rows[existing] = payload;
    audit('dq.rule.updated', payload);
  } else {
    STATE.rows.unshift(payload);
    audit('dq.rule.created', payload);
  }

  bootstrap.Modal.getOrCreateInstance($('#ruleModal')).hide();
  draw();
}

function delRule(ruleName){
  if (!ruleName) return;
  if (!confirm(`Delete rule "${ruleName}"? This action is auditable.`)) return;
  STATE.rows = STATE.rows.filter(x => x.name !== ruleName);
  audit('dq.rule.deleted', { name: ruleName });
  draw();
}

/* ---------- History (stub) ---------- */
function openHistory(ruleName){
  const r = STATE.rows.find(x => x.name === ruleName);
  const now = new Date().toISOString();
  const events = [
    { ts: r?.updated || now, actor: 'steward@district.edu', action: 'update', rule: ruleName, details: 'Threshold/owner updated' },
    { ts: now, actor: 'system@edx', action: 'run-eval', rule: ruleName, details: 'Pass 99.7% in last publish run' }
  ];
  $('#historyPre').textContent = JSON.stringify(events, null, 2);
  bootstrap.Modal.getOrCreateInstance($('#historyModal')).show();
}

/* ---------- Export ---------- */
function exportCsv(){
  const rows = filtered();
  const headers = ['name','target','category','threshold','owner','gate','updated'];
  const body = rows.map(r => [r.name, r.target, r.category, r.threshold, r.owner, r.gate||'', r.updated||'']
    .map(x => `"${String(x??'').replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','), ...body].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edx-dq-rules-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  audit('dq.rules.export.csv', { rows: rows.length });
}

/* ---------- Utils ---------- */
function toUtcIso(local){
  // local like '2025-10-18T06:12'; treat as local time, convert to Z
  const d = new Date(local);
  return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().replace(/\.\d{3}Z$/,'Z');
}
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
function audit(event, payload){ console.log('[AUDIT]', { event, payload, ts: new Date().toISOString() }); }
