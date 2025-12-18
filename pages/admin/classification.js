// EDX — Classification & Tagging (production-ready, fixed indexing & markup)
// Keeps your client-side UX with localStorage; adds robust indexing and cleans markup.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');
const jsonUrl = 'classification.json';
const LS_KEY = 'edx_classification';

const state = {
  tags: [],
  rules: [],
  isLoading: false,
  q: '',
  sortKey: 'pattern',   // 'pattern' | 'scope' | 'addCount'
  sortDir: 'asc',
  page: 1,
  pageSize: 10
};

init().catch(console.error);

async function init() {
  await loadFromLocalOrSource();
  render();
}

async function loadFromLocalOrSource(bust=false) {
  state.isLoading = true; renderStatus();
  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached && !bust) {
      const parsed = JSON.parse(cached);
      state.tags = Array.isArray(parsed.tags) ? parsed.tags : [];
      state.rules = Array.isArray(parsed.rules) ? parsed.rules : [];
    } else {
      const url = bust ? `${jsonUrl}?t=${Date.now()}` : jsonUrl;
      const src = await fetch(url, { cache: 'no-store' }).then(r=>r.json()).catch(()=>({ tags:[], rules:[] }));
      state.tags = Array.isArray(src.tags) ? src.tags.slice() : [];
      state.rules = Array.isArray(src.rules) ? src.rules.slice() : [];
    }
  } finally {
    state.isLoading = false; render();
  }
}

/* ---------- Render ---------- */

function render() {
  const rulesView = getFilteredSortedRules();
  const total = rulesView.length;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  const start = (state.page-1) * state.pageSize;
  const pageRows = rulesView.slice(start, start + state.pageSize);

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 sticky-toolbar">
      <h1 class="h4 mb-0">Classification &amp; Tagging</h1>
      <div class="d-flex flex-wrap gap-2">
        <div class="input-group input-group-sm search-wrap">
          <span class="input-group-text">Search rules</span>
          <input id="q" class="form-control" placeholder="pattern, scope, tags" value="${escAttr(state.q)}">
        </div>
        <div class="input-group input-group-sm" style="width:auto;">
          <label class="input-group-text" for="pageSize">Rows/page</label>
          <select id="pageSize" class="form-select form-select-sm">
            ${[10,25,50,100].map(v=>`<option value="${v}" ${v===state.pageSize?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>

        <div class="btn-group btn-group-sm">
          <button id="btnExportTags" class="btn btn-outline-secondary">Export Tags (CSV)</button>
          <button id="btnExportRules" class="btn btn-outline-secondary">Export Rules (CSV)</button>
        </div>

        <div class="btn-group btn-group-sm">
          <button id="btnRefresh" class="btn btn-primary" ${state.isLoading?'disabled':''}>${state.isLoading?'Refreshing…':'Refresh'}</button>
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
        </div>

        <div class="btn-group btn-group-sm">
          <button id="btnDiscard" class="btn btn-outline-secondary">Discard</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <!-- Tags -->
      <div class="col-lg-5">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body"><strong>Classification Tags</strong></div>
          <div class="card-body">
            <div id="tagHelp" class="form-text mb-2">
              Tags drive masking &amp; row policies. Use stable, UPPER_SNAKE_CASE names (e.g., PII_STRICT, PII_DIRECTORY, HEALTH, FINANCIAL, DISCIPLINE, DEIDENTIFIED).
            </div>
            <ul class="list-group mb-3" id="tagList">
              ${state.tags.map(t => tagItem(t)).join('') || `<li class="list-group-item text-body-secondary">No tags</li>`}
            </ul>
            <div class="input-group input-group-sm">
              <input id="newTag" class="form-control" placeholder="Add tag (UPPER_SNAKE_CASE)">
              <button id="btnAddTag" class="btn btn-primary">Add</button>
            </div>
            <div id="tagError" class="invalid-feedback d-block" style="display:none;"></div>
          </div>
        </div>
      </div>

      <!-- Rules -->
      <div class="col-lg-7">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body d-flex justify-content-between align-items-center">
            <strong>Auto-Tagging Rules</strong>
            <button id="btnNewRule" class="btn btn-outline-primary btn-sm">New Rule</button>
          </div>

          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light">
                <tr>
                  ${th('pattern','When (pattern)')}
                  ${th('scope','Scope')}
                  ${th('addCount','Tags (count)','end')}
                  <th class="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${pageRows.map(r => ruleRow(r)).join('') || `<tr><td colspan="4" class="text-center text-body-secondary py-4">No matching rules</td></tr>`}
              </tbody>
            </table>
          </div>

          <div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
            <small class="text-body-secondary">
              Patterns match column or dataset names; scope can be <em>column</em> or <em>dataset</em>.
            </small>
            <nav aria-label="Rules pagination">
              <ul class="pagination pagination-sm mb-0">
                ${renderPages(state.page, totalPages)}
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </div>
  `;

  // Wiring
  $('#q')?.addEventListener('input', e => { state.q = e.target.value || ''; state.page=1; render(); });
  $('#pageSize')?.addEventListener('change', e => { state.pageSize = Number(e.target.value)||10; state.page=1; render(); });

  // Sorting
  main.querySelectorAll('th[data-sort-key]')?.forEach(thEl => {
    thEl.addEventListener('click', () => {
      const key = thEl.getAttribute('data-sort-key');
      if (state.sortKey === key) state.sortDir = (state.sortDir === 'asc' ? 'desc' : 'asc');
      else { state.sortKey = key; state.sortDir = 'asc'; }
      render();
    });
  });

  // Pagination
  main.querySelectorAll('.pagination .page-link[data-page]')?.forEach(btn => {
    btn.addEventListener('click', () => {
      const goto = Number(btn.getAttribute('data-page'));
      const max = Math.max(1, Math.ceil(getFilteredSortedRules().length/state.pageSize));
      state.page = Math.min(Math.max(1, goto), max);
      render();
    });
  });

  // Tag actions
  $('#btnAddTag')?.addEventListener('click', onAddTag);
  main.querySelectorAll('button[data-action="del-tag"]')?.forEach(btn => {
    btn.addEventListener('click', () => onDeleteTag(btn.getAttribute('data-tag')));
  });

  // Rule actions (use original index r._idx, not page index!)
  $('#btnNewRule')?.addEventListener('click', () => openRuleModal({ pattern:'', scope:'column', add:[] }, -1));
  main.querySelectorAll('button[data-action="edit-rule"]')?.forEach(btn => {
    const idx = Number(btn.getAttribute('data-index'));
    btn.addEventListener('click', () => openRuleModal(state.rules[idx], idx));
  });
  main.querySelectorAll('button[data-action="del-rule"]')?.forEach(btn => {
    const idx = Number(btn.getAttribute('data-index'));
    btn.addEventListener('click', () => onDeleteRule(idx));
  });

  // Page-level actions
  $('#btnSave')?.addEventListener('click', onSave);
  $('#btnDiscard')?.addEventListener('click', onDiscard);
  $('#btnRefresh')?.addEventListener('click', () => loadFromLocalOrSource(true));
  $('#btnReset')?.addEventListener('click', () => { localStorage.removeItem(LS_KEY); loadFromLocalOrSource(true); });
}

function tagItem(t){
  return `
    <li class="list-group-item d-flex justify-content-between align-items-center">
      <span class="text-monospace">${esc(t)}</span>
      <button class="btn btn-sm btn-outline-danger" data-action="del-tag" data-tag="${escAttr(t)}" title="Delete tag">Delete</button>
    </li>
  `;
}

function ruleRow(r){
  const idx = Number(r._idx);
  return `
    <tr>
      <td><code>${esc(r.pattern)}</code></td>
      <td>${esc(r.scope)}</td>
      <td class="text-end">
        ${(r.add||[]).map(t => `<span class="badge rounded-pill badge-tag me-1">${esc(t)}</span>`).join('')}
        <span class="text-body-secondary small ms-1">(${(r.add||[]).length})</span>
      </td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-action="edit-rule" data-index="${idx}">Edit</button>
          <button class="btn btn-outline-danger" data-action="del-rule" data-index="${idx}">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

function th(key, label, align){
  const active = key===state.sortKey;
  const arrow = active ? (state.sortDir==='asc'?'▲':'▼') : '';
  const klass = align==='end' ? ' class="text-end"' : '';
  return `<th${klass} data-sort-key="${key}">${label} <span class="sort">${arrow}</span></th>`;
}

/* ---------- Tag Handlers ---------- */

function onAddTag(){
  const inp = $('#newTag'); const err = $('#tagError');
  const name = (inp.value||'').trim();
  const valid = /^[A-Z][A-Z0-9_]*$/.test(name);
  if (!valid) {
    err.textContent = 'Tag must be UPPER_SNAKE_CASE (letters, numbers, underscore).';
    err.style.display = 'block';
    return;
  }
  if (state.tags.includes(name)) {
    err.textContent = 'Tag already exists.';
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';
  state.tags.push(name);
  inp.value = '';
  render();
}

function onDeleteTag(tag){
  const usedBy = state.rules.filter(r => (r.add||[]).includes(tag)).length;
  const ok = confirm( usedBy
    ? `Tag "${tag}" is used by ${usedBy} rule(s). Delete anyway?`
    : `Delete tag "${tag}"?`
  );
  if (!ok) return;
  state.tags = state.tags.filter(t => t !== tag);
  state.rules = state.rules.map(r => ({...r, add: (r.add||[]).filter(t => t !== tag) }));
  render();
}

/* ---------- Rules Helpers ---------- */

function getFilteredSortedRules(){
  let out = state.rules.map((r, i) => ({...r, _idx:i, addCount: (r.add||[]).length}));

  const q = state.q.trim().toLowerCase();
  if (q) {
    out = out.filter(r =>
      (r.pattern||'').toLowerCase().includes(q) ||
      (r.scope||'').toLowerCase().includes(q) ||
      (r.add||[]).join(' ').toLowerCase().includes(q)
    );
  }

  const { sortKey, sortDir } = state;
  out.sort((a,b) => {
    let va = a[sortKey], vb = b[sortKey];
    const numeric = sortKey === 'addCount';
    if (numeric) { va = Number(va); vb = Number(vb); }
    else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return sortDir==='asc' ? -1 : 1;
    if (va > vb) return sortDir==='asc' ? 1 : -1;
    return 0;
  });

  return out;
}

/* ---------- Rule Modal ---------- */

function openRuleModal(rule, absoluteIndex){
  const container = document.createElement('div');
  state.tags.forEach(t => {
    const id = `tag-${t}`;
    const checked = (rule.add||[]).includes(t) ? 'checked' : '';
    container.insertAdjacentHTML('beforeend', `
      <div class="form-check form-check-inline">
        <input class="form-check-input" type="checkbox" id="${id}" value="${escAttr(t)}" ${checked}>
        <label class="form-check-label" for="${id}">${esc(t)}</label>
      </div>
    `);
  });

  $('#ruleModalLabel').textContent = (absoluteIndex >= 0) ? 'Edit Rule' : 'New Rule';
  $('#fPattern').value = rule.pattern || '';
  $('#fScope').value = rule.scope || 'column';
  $('#fIndex').value = String(absoluteIndex);
  const host = $('#fTags'); host.innerHTML = ''; host.appendChild(container);

  $('#btnRuleSave').onclick = () => {
    const pattern = $('#fPattern').value.trim();
    const scope = $('#fScope').value;
    const add = Array.from(host.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);

    if (!pattern) { alert('Pattern is required.'); return; }
    if (!['column','dataset'].includes(scope)) { alert('Scope must be column or dataset.'); return; }

    const payload = { pattern, scope, add };
    const idx = Number($('#fIndex').value);

    if (idx >= 0) state.rules[idx] = payload;
    else state.rules.push(payload);

    bootstrap.Modal.getInstance($('#ruleModal')).hide();
    render();
  };

  new bootstrap.Modal($('#ruleModal')).show();
}

function onDeleteRule(idx){
  if (!Number.isFinite(idx)) return;
  if (!confirm('Delete this rule?')) return;
  state.rules.splice(idx, 1);
  render();
}

/* ---------- Page-level actions ---------- */

function onSave(){
  localStorage.setItem(LS_KEY, JSON.stringify({ tags: state.tags, rules: state.rules }));
  alert('Saved locally for demo. (Persisted in browser localStorage)');
}

function onDiscard(){
  const cached = localStorage.getItem(LS_KEY);
  if (cached) {
    const parsed = JSON.parse(cached);
    state.tags = Array.isArray(parsed.tags) ? parsed.tags : [];
    state.rules = Array.isArray(parsed.rules) ? parsed.rules : [];
  }
  state.page = 1;
  render();
}

/* ---------- CSV helpers (with preview) ---------- */

function openCsvPreview(text, filename){
  $('#csvModalLabel').textContent = `CSV Preview — ${filename}`;
  $('#csvPreview').textContent = text;
  $('#btnCopyCsv').onclick = async () => {
    try { await navigator.clipboard.writeText(text); alert('Copied!'); } catch { alert('Copy failed'); }
  };
  new bootstrap.Modal($('#csvModal')).show();
}

function toCSV(rows){
  const BOM = '\uFEFF';
  const lines = rows.map(cols => cols.map(csvEscape).join(','));
  return BOM + lines.join('\r\n');
}
function csvEscape(v){
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

/* ---------- Misc ---------- */

function renderStatus(){
  const btn = $('#btnRefresh');
  if (btn) btn.disabled = !!state.isLoading;
}
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function renderPages(page,total){
  const out=[]; const li=(n,l=n)=>out.push(`<li class="page-item ${n===page?'active':''}"><button class="page-link" data-page="${n}">${l}</button></li>`);
  const dot=()=>out.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
  if(total<=7){ for(let n=1;n<=total;n++) li(n); }
  else { li(1); if(page>3) dot(); for(let n=Math.max(2,page-1);n<=Math.min(total-1,page+1);n++) li(n); if(page<total-2) dot(); li(total); }
  return out.join('');
}
