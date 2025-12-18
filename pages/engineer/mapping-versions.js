// Mapping Versions — timeline + diff + approvals (Bootstrap UI, pagination, safe escaping, audit copy)
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const main    = $('#app-main');
const jsonUrl = 'mapping-versions.json';

const STATE = {
  data: { mappings:[], filters:{}, meta:{} },
  // query/filter state
  q: '', standard: '', status: '', steward: '',
  // pagination per mapping's version list
  pageById: new Map(), // id -> page index
  pageSize: 5,
  // for diff modal
  diffCtx: { id:null, left:null, right:null }
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
  renderList();
})();

async function loadData(){
  try {
    const d = await fetch(jsonUrl, { cache:'no-store' }).then(r=>r.json());
    STATE.data = d || STATE.data;
  } catch { /* keep defaults */ }
}

/* -------------------- Shell -------------------- */
function renderShell(){
  const filters = STATE.data.filters || {};
  const standards = filters.standards || [];
  const statuses  = filters.statuses  || [];
  const stewards  = filters.stewards  || [];

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-1">Mapping Versions</h1>
        <p class="text-muted mb-0">Versioned mappings with Steward approvals. Promotion to publish is gated; all edits are audit-logged.</p>
      </div>
      <div class="d-flex toolbar align-items-center flex-wrap">
        <input id="q" class="form-control form-control-sm" placeholder="Search source/target…" style="max-width:260px">
        <select id="f-standard" class="form-select form-select-sm">
          <option value="">Standard: All</option>
          ${standards.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('')}
        </select>
        <select id="f-status" class="form-select form-select-sm">
          <option value="">Status: All</option>
          ${statuses.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('')}
        </select>
        <select id="f-steward" class="form-select form-select-sm">
          <option value="">Steward: All</option>
          ${stewards.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('')}
        </select>
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm ms-1">Refresh</button>
        <a href="mappings.html" class="btn btn-outline-primary btn-sm ms-1">Back to Mappings</a>
      </div>
    </div>

    <div id="versionList"></div>
  `;
}

function bindToolbar(){
  $('#q').addEventListener('input', e => { STATE.q = e.target.value.toLowerCase().trim(); renderList(); });
  $('#f-standard').addEventListener('change', e => { STATE.standard = e.target.value; renderList(); });
  $('#f-status').addEventListener('change',   e => { STATE.status   = e.target.value; renderList(); });
  $('#f-steward').addEventListener('change',  e => { STATE.steward  = e.target.value; renderList(); });
  $('#btnRefresh').addEventListener('click', async ()=>{ await loadData(); renderShell(); bindToolbar(); renderList(); });
}

/* -------------------- Listing -------------------- */
function filteredMappings(){
  const q = STATE.q, std = STATE.standard, st = STATE.status, sw = STATE.steward;
  return (STATE.data.mappings||[]).filter(m=>{
    const okQ = !q || JSON.stringify({source:m.source,target:m.target,id:m.id}).toLowerCase().includes(q);
    const okS = !std || m.standard === std;
    const okT = !st  || (m.versions||[]).some(v => (v.status||'').toLowerCase() === st.toLowerCase());
    const okW = !sw  || (m.versions||[]).some(v => (v.steward||'') === sw);
    return okQ && okS && okT && okW;
  });
}

function renderList(){
  const container = $('#versionList');
  const list = filteredMappings();

  if (!list.length){
    container.innerHTML = `<div class="card shadow-sm"><div class="card-body">No mappings found.</div></div>`;
    return;
  }

  container.innerHTML = list.map(m => mappingCard(m)).join('');

  // wire version pagers + buttons
  list.forEach(m => {
    const pages = pagesFor(m);
    const pid = safeId(m.id);
    const pageIdx = Math.min(STATE.pageById.get(m.id) ?? 0, pages-1);
    STATE.pageById.set(m.id, pageIdx);
    renderVersionRows(m); // first render

    // pager controls
    const pgFirst = $(`#pg-${pid}-first`), pgPrev = $(`#pg-${pid}-prev`),
          pgNext  = $(`#pg-${pid}-next`),  pgLast = $(`#pg-${pid}-last`);
    const updatePager = ()=>{
      const pagesNow = pagesFor(m);
      const p = STATE.pageById.get(m.id) ?? 0;
      $(`#pg-${pid}-info`).textContent = `Page ${p+1} of ${pagesNow}`;
      pgFirst.disabled = pgPrev.disabled = p <= 0;
      pgLast .disabled = pgNext.disabled = p >= pagesNow-1;
    };
    pgFirst.addEventListener('click', ()=>{ STATE.pageById.set(m.id, 0); renderVersionRows(m); updatePager(); });
    pgPrev .addEventListener('click', ()=>{ STATE.pageById.set(m.id, Math.max(0, (STATE.pageById.get(m.id)||0)-1)); renderVersionRows(m); updatePager(); });
    pgNext .addEventListener('click', ()=>{ const p=pagesFor(m); STATE.pageById.set(m.id, Math.min(p-1, (STATE.pageById.get(m.id)||0)+1)); renderVersionRows(m); updatePager(); });
    pgLast .addEventListener('click', ()=>{ const p=pagesFor(m); STATE.pageById.set(m.id, p-1); renderVersionRows(m); updatePager(); });
    updatePager();

    // diff buttons
    $$( `[data-act="diff"][data-id="${cssEscape(m.id)}"]` ).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const left  = btn.getAttribute('data-left');
        const right = btn.getAttribute('data-right');
        openDiff(m.id, left, right);
      });
    });
  });
}

function mappingCard(m){
  const pid = safeId(m.id);
  const latest = (m.versions||[])[(m.versions||[]).length-1];
  const statusBadge = badgeStatus(latest?.status);
  return `
    <div class="card shadow-sm mb-3">
      <div class="card-header bg-body d-flex justify-content-between align-items-center">
        <div>
          <div class="fw-semibold">${escapeHtml(m.source)} <span class="text-body-secondary">→</span> ${escapeHtml(m.target)}</div>
          <div class="small text-body-secondary">Standard: ${escapeHtml(m.standard)} • Latest: <span class="fw-semibold">${escapeHtml(latest?.v || '—')}</span> ${statusBadge}</div>
        </div>
        <a class="btn btn-outline-primary btn-sm" href="mappings.html">Open Mappings</a>
      </div>

      <div class="card-body">
        <div class="row g-3">
          <!-- timeline -->
          <div class="col-lg-5">
            <div class="timeline" aria-label="Version timeline">
              ${(m.versions||[]).slice().reverse().map(v=>`
                <div class="tl-item">
                  <div class="d-flex justify-content-between">
                    <div>
                      <div class="fw-semibold">${escapeHtml(v.v)} ${badgeStatus(v.status)}</div>
                      <div class="small text-body-secondary">${escapeHtml(v.changed_at)} • Steward: ${escapeHtml(v.steward || '—')}</div>
                    </div>
                    <div class="text-end">
                      <button class="btn btn-outline-secondary btn-sm" data-act="diff" data-id="${escapeAttr(m.id)}"
                        data-left="${escapeAttr(prevVersion(m, v)?.v || '')}" data-right="${escapeAttr(v.v)}"
                        ${prevVersion(m, v) ? '' : 'disabled'}
                      >Diff with previous</button>
                    </div>
                  </div>
                  <div class="small mt-1">${escapeHtml(v.change_note || '')}</div>
                </div>`).join('')}
            </div>
          </div>

          <!-- versions table w/ pagination -->
          <div class="col-lg-7">
            <div class="table-responsive">
              <table class="table align-middle mb-0">
                <thead class="table-light"><tr>
                  <th>Version</th><th>Status</th><th>Transform</th><th>Policy Tags</th><th>Changed</th><th>Approvals</th><th class="text-end">Actions</th>
                </tr></thead>
                <tbody id="rows-${pid}"></tbody>
              </table>
            </div>
            <div class="d-flex justify-content-between align-items-center mt-2">
              <small class="text-body-secondary">Promotion to publish is Steward-gated; changes are immutable in audit logs.</small>
              <nav class="pager">
                <button class="btn btn-sm btn-outline-secondary" id="pg-${pid}-first">&laquo;</button>
                <button class="btn btn-sm btn-outline-secondary" id="pg-${pid}-prev">&lsaquo;</button>
                <span class="small" id="pg-${pid}-info">Page 1 of 1</span>
                <button class="btn btn-sm btn-outline-secondary" id="pg-${pid}-next">&rsaquo;</button>
                <button class="btn btn-sm btn-outline-secondary" id="pg-${pid}-last">&raquo;</button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderVersionRows(m){
  const pid = safeId(m.id);
  const versions = (m.versions||[]).slice().reverse(); // latest first for table
  const pages = Math.max(1, Math.ceil(versions.length / STATE.pageSize));
  const pageIdx = Math.min(STATE.pageById.get(m.id) ?? 0, pages-1);
  STATE.pageById.set(m.id, pageIdx);
  const start = pageIdx * STATE.pageSize;
  const slice = versions.slice(start, start + STATE.pageSize);

  $(`#rows-${pid}`).innerHTML = slice.map(v => {
    const approvals = (v.approvals||[]).map(a => `<span class="badge text-bg-light border me-1">${escapeHtml(a.actor)} • ${escapeHtml(a.action)}</span>`).join('') || '—';
    return `
      <tr>
        <td>${escapeHtml(v.v)}</td>
        <td>${badgeStatus(v.status)}</td>
        <td><code>${escapeHtml(v.fields?.sample_transform || 'value')}</code></td>
        <td>${(v.fields?.policy_tags||[]).map(t=>`<span class="badge text-bg-secondary me-1">${escapeHtml(t)}</span>`).join('') || '—'}</td>
        <td class="text-nowrap">${escapeHtml(v.changed_at || '—')}</td>
        <td>${approvals}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" data-act="diff" data-id="${escapeAttr(m.id)}"
              data-left="${escapeAttr(prevVersion(m, v)?.v || '')}" data-right="${escapeAttr(v.v)}"
              ${prevVersion(m, v) ? '' : 'disabled'}
            >Diff</button>
          </div>
        </td>
      </tr>`;
  }).join('') || `<tr><td class="p-3" colspan="7">No versions.</td></tr>`;
}

/* -------------------- Diff Modal -------------------- */
function openDiff(id, leftV, rightV){
  const m = (STATE.data.mappings||[]).find(x => x.id === id);
  if (!m || !leftV || !rightV) return;
  const left  = (m.versions||[]).find(v => v.v === leftV);
  const right = (m.versions||[]).find(v => v.v === rightV);
  if (!left || !right) return;

  $('#diffModalLabel').textContent = `Diff — ${m.source} → ${m.target} (${leftV} → ${rightV})`;
  $('#diffModalBody').innerHTML = renderDiff(left, right);
  new bootstrap.Modal($('#diffModal')).show();
}

function renderDiff(a, b){
  // Compare top-level known props + nested fields
  const keys = new Set([
    'status','steward','changed_at','change_note',
    'fields.version','fields.sample_transform','fields.policy_tags'
  ]);

  const rowsLeft  = [];
  const rowsRight = [];

  for (const k of keys){
    const av = getDeep(a, k);
    const bv = getDeep(b, k);
    const {left, right, clsL, clsR} = diffCell(av, bv);
    rowsLeft.push (row(k, left,  clsL));
    rowsRight.push(row(k, right, clsR));
  }

  return `
    <div class="diff-grid">
      <div class="diff-panel">
        <h3>Previous (${escapeHtml(a.v)})</h3>
        ${rowsLeft.join('')}
      </div>
      <div class="diff-panel">
        <h3>Current (${escapeHtml(b.v)})</h3>
        ${rowsRight.join('')}
      </div>
    </div>`;
}

function row(key, val, cls){
  return `<div class="diff-row">
    <div class="diff-key">${escapeHtml(key)}</div>
    <div class="diff-val ${cls||''}">${escapeHtml(formatVal(val))}</div>
  </div>`;
}

function diffCell(av, bv){
  const same = equalVals(av, bv);
  if (same) return { left: av, right: bv, clsL:'', clsR:'' };
  if (av == null && bv != null) return { left: av, right: bv, clsL:'', clsR:'diff-added' };
  if (av != null && bv == null) return { left: av, right: bv, clsL:'diff-removed', clsR:'' };
  return { left: av, right: bv, clsL:'diff-changed', clsR:'diff-changed' };
}

/* -------------------- Helpers -------------------- */
function prevVersion(m, v){
  const idx = (m.versions||[]).findIndex(x => x.v === v.v);
  return idx > 0 ? m.versions[idx-1] : null;
}

function pagesFor(m){ return Math.max(1, Math.ceil((m.versions||[]).length / STATE.pageSize)); }

function formatVal(v){
  if (Array.isArray(v)) return `[${v.join(', ')}]`;
  return v == null ? '—' : String(v);
}
function equalVals(a, b){
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x,i)=>x===b[i]);
  return String(a ?? '') === String(b ?? '');
}
function getDeep(obj, path){
  return path.split('.').reduce((acc, k) => (acc && k in acc) ? acc[k] : undefined, obj);
}
function badgeStatus(s){
  const map = { approved:'success', draft:'warning', deprecated:'secondary' };
  return `<span class="badge text-bg-${map[(s||'').toLowerCase()]||'secondary'}">${escapeHtml(s||'—')}</span>`;
}
function safeId(s){ return s.replace(/[^a-zA-Z0-9_-]+/g, '_'); }
function cssEscape(s){ return s.replace(/"/g, '\\"'); }
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return String(s ?? '').replace(/"/g,'&quot;'); }
