/* Policy Simulator (Steward) — production-ready, CSP-safe
 * Minimal changes per request:
 *  - Inputs: purpose, org_scope (org/campus/program/term), consent flag
 *  - Outputs: Resolved Policies panel with:
 *      • Consent check: PASS/FAIL (explicit badge)
 *      • RLS predicate (resolved)
 *      • Masking plan per column (paginated)
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const JSON_URL = 'policy-simulator.json';
const STATE = {
  data: null,
  page: 1,
  pageSize: 10,
  masked: [],
  selected: {
    role: 'Data Steward',
    purpose: 'Operational',
    dataset: null,
    organization: 'District (LEA-1001)',
    campus: '—',
    program: '—',
    term: '—',
    consent_ok: false,
    path: 'SQL' // SQL | API | Share (kept from prior build; no behavior change)
  }
};

(async function init(){
  const d = await fetch(JSON_URL, { cache: 'no-store' })
    .then(r => r.json())
    .catch(() => ({ roles:[], purposes:[], abac_dimensions:{}, datasets:[], mask_policies:{}, row_policies:{rules:[]} }));

  STATE.data = d;
  if (!STATE.selected.dataset && d.datasets?.length) STATE.selected.dataset = d.datasets[0].name;

  renderShell(d);
  wireControls(d);
  updatePreview();
})();

function renderShell(d){
  $('#app-main').innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">Policy Simulator</h1>
        <div class="small text-body-secondary">Preview effective access (masking + row scope) for a given identity, purpose, and dataset.</div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button id="btnRun" class="btn btn-primary btn-sm">Run Simulation</button>
      </div>
    </div>

    <!-- Who / Why / What -->
    <div class="card card-subtle shadow-sm mb-3">
      <div class="card-header bg-body"><strong class="section-title">Who / Why / What</strong></div>
      <div class="card-body">
        <form class="row g-3" id="simForm">
          <div class="col-md-3">
            <label class="form-label">Role</label>
            <select id="role" class="form-select">
              ${(d.roles||[]).map(r=>`<option ${sel(r,'Data Steward')}>${r}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Purpose</label>
            <select id="purpose" class="form-select">
              ${(d.purposes||[]).map(p=>`<option>${p}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Dataset</label>
            <select id="dataset" class="form-select">
              ${(d.datasets||[]).map(ds=>`<option value="${ds.name}">${ds.display||ds.name}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Access Path</label>
            <select id="path" class="form-select">
              <option>SQL</option><option>API</option><option>Share</option>
            </select>
            <div class="form-text">All paths must enforce the same policies.</div>
          </div>

          <div class="col-12"><hr></div>

          <!-- ABAC -->
          <div class="col-md-3">
            <label class="form-label">Organization</label>
            <select id="organization" class="form-select">
              ${(d.abac_dimensions?.organization||[]).map(v=>`<option>${v}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Campus</label>
            <select id="campus" class="form-select">
              ${(d.abac_dimensions?.campus||[]).map(v=>`<option>${v}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Program</label>
            <select id="program" class="form-select">
              ${(d.abac_dimensions?.program||[]).map(v=>`<option>${v}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Term</label>
            <select id="term" class="form-select">
              ${(d.abac_dimensions?.term||[]).map(v=>`<option>${v}</option>`).join('')}
            </select>
          </div>

          <!-- Consent flag (minimal change) -->
          <div class="col-md-3">
            <div class="form-check mt-2">
              <input id="consentOk" class="form-check-input" type="checkbox">
              <label class="form-check-label" for="consentOk">Consent checks satisfied</label>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Resolved Policies -->
    <div class="card card-subtle shadow-sm">
      <div class="card-header bg-body d-flex align-items-center justify-content-between">
        <strong class="section-title">Resolved Policies</strong>
        <div class="d-flex align-items-center gap-2">
          <label for="pageSize" class="form-label m-0 small text-body-secondary">Rows per page</label>
          <select id="pageSize" class="form-select form-select-sm page-size" aria-label="Rows per page">
            ${[10,20,50].map(n=>`<option value="${n}" ${n===STATE.pageSize?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="card-body">
        <!-- Summary ribbons -->
        <div id="policySummary" class="mb-3"></div>

        <!-- RLS predicate -->
        <div class="mb-3">
          <div class="fw-semibold">Row-level predicate (RLS)</div>
          <code id="rlsPredicate" class="d-block mt-1">—</code>
        </div>

        <!-- Masking plan -->
        <div class="fw-semibold">Masking plan per column</div>
        <div id="grid" class="table-responsive mt-2">
          <table class="table align-middle mb-0">
            <thead class="table-light"><tr><th>Column</th><th>Mask</th><th>Reason</th></tr></thead>
            <tbody id="gridRows"></tbody>
          </table>
          <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
            <div id="rangeLabel" class="small text-body-secondary">Rows 0–0 of 0</div>
            <nav aria-label="Pagination"><ul class="pagination pagination-sm mb-0" id="pager"></ul></nav>
          </div>
        </div>
      </div>
    </div>
  `;
}

function sel(v, def){ return v===def ? 'selected' : ''; }

function wireControls(d){
  $('#btnRun').addEventListener('click', () => updatePreview());

  // All inputs update state
  ['role','purpose','dataset','path','organization','campus','program','term'].forEach(id=>{
    $(`#${id}`).addEventListener('change', (e)=>{ STATE.selected[id] = e.target.value; });
  });
  $('#consentOk').addEventListener('change', e => { STATE.selected.consent_ok = !!e.target.checked; });

  $('#pageSize').addEventListener('change', (e)=>{ STATE.pageSize = Number(e.target.value)||10; STATE.page = 1; drawGrid(); });
}

function updatePreview(){
  const d = STATE.data;
  const dsMeta = d.datasets.find(x => x.name === ($('#dataset').value || STATE.selected.dataset));
  STATE.selected.dataset = dsMeta?.name;

  // ----- Row-level (ABAC) evaluation -----
  const abacRules = d.row_policies?.rules || [];
  const abacReasons = [];
  let abacAllowed = true;

  for (const rule of abacRules){
    const chosen = (STATE.selected[rule.dimension] || '—');
    const ok = rule.values.includes(chosen);
    if (!ok) { abacAllowed = false; }
    abacReasons.push(`${ok?'✔':'✖'} ${rule.dimension} = ${chosen} (rule: ${rule.reason})`);
  }

  // Compose RLS predicate string (AND over dimensions present in rules)
  // Example: (organization IN ["District (LEA-1001)"]) AND (term IN ["2025-Fall","—"]) AND ...
  const rlsClauses = abacRules.map(r => {
    const list = r.values.map(v => `"${v}"`).join(', ');
    return `(${r.dimension} IN [${list}])`;
  });
  const rlsPredicate = rlsClauses.length ? rlsClauses.join(' AND ') : 'TRUE';

  // ----- Consent evaluation -----
  let consentOk = true;
  let consentMessage = 'Consent not required for dataset';
  let consentPass = true;

  if (dsMeta?.consent_required){
    consentOk = !!STATE.selected.consent_ok;
    consentPass = consentOk;
    consentMessage = consentOk ? 'Consent satisfied' : 'Consent required but not satisfied';
  }

  // ----- Masking preview (per column) -----
  const purpose = $('#purpose').value;
  const masked = (dsMeta?.columns || []).map(col=>{
    const tags = col.classifications || [];
    const decisions = tags.map(tag => (STATE.data.mask_policies[tag]||{})[purpose]).filter(Boolean);
    let mask = 'NONE', reason = 'No classification';
    if (decisions.length){
      const strength = ['NONE','PARTIAL_MASK','HASH','TOKENIZE','REDACT','FULL_MASK'];
      // normalize typo variants
      const norm = v => (v||'').toUpperCase();
      mask = decisions.map(norm).reduce((a,b)=> strength.indexOf(b) > strength.indexOf(a) ? b : a, 'NONE');
      reason = tags.map(t=>`${t}→${(STATE.data.mask_policies[t]||{})[purpose]||'NONE'}`).join(', ');
    }
    return { col: col.name, mask, reason };
  });
  STATE.masked = masked;

  // ----- Overall allow/deny (RLS ∧ Consent) -----
  const allowed = abacAllowed && (!dsMeta?.consent_required || consentOk);

  // Summary badges
  const consentBadge = `<span class="badge ${consentPass?'text-bg-success':'text-bg-danger'}">${consentPass ? 'Consent: PASS' : 'Consent: FAIL'}</span>`;
  const rlsBadge = `<span class="badge ${abacAllowed?'text-bg-success':'text-bg-danger'}">${abacAllowed ? 'RLS: PASS' : 'RLS: FAIL'}</span>`;
  const overall = `<span class="badge ${allowed?'text-bg-success':'text-bg-danger'}">${allowed ? 'ALLOWED' : 'DENIED'}</span>`;

  $('#policySummary').innerHTML = `
    <div class="d-flex flex-wrap gap-2 align-items-center">
      ${overall}
      ${rlsBadge}
      ${consentBadge}
      <span class="small text-body-secondary">Role: ${escapeHtml($('#role').value)} • Purpose: ${escapeHtml(purpose)} • Dataset: ${escapeHtml(dsMeta?.display||dsMeta?.name||'')}</span>
    </div>
    <div class="reason mt-2">
      <div><strong>Row policies</strong></div>
      <div class="small">${abacReasons.map(escapeHtml).join('<br>')}</div>
      <div class="mt-2"><strong>Consent</strong></div>
      <div class="small">${escapeHtml(consentMessage)}</div>
    </div>
  `;

  // RLS predicate text
  $('#rlsPredicate').textContent = rlsPredicate;

  // Draw grid (always show, even if DENIED, so Stewards can review masks)
  STATE.page = 1;
  drawGrid();
}

function drawGrid(){
  const rows = STATE.masked;
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / STATE.pageSize));
  if (STATE.page > pages) STATE.page = pages;

  const startIdx = (STATE.page - 1) * STATE.pageSize;
  const endIdx   = Math.min(startIdx + STATE.pageSize, total);
  const slice    = rows.slice(startIdx, endIdx);

  $('#gridRows').innerHTML = slice.map(r => `
    <tr>
      <td><code>${escapeHtml(r.col)}</code></td>
      <td>${escapeHtml(r.mask)}</td>
      <td class="text-wrap">${escapeHtml(r.reason)}</td>
    </tr>
  `).join('') || `<tr><td colspan="3"><div class="empty text-center">No columns</div></td></tr>`;

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
    if (!Number.isNaN(p)) { STATE.page = p; drawGrid(); }
  }));
}

function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
