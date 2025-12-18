/* Dataset Tagging (Steward) — production-ready, CSP-safe
 * Enhancements in this build:
 *  - Click dataset name OR "Columns" button to open column editor; keyboard accessible.
 *  - Tag add works on Enter; non-blocking toasts for success/validation.
 *  - Per-row Add inputs use a <datalist> to suggest approved tags from JSON.
 *  - Strict CSP remains: no inline styles/scripts.
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const JSON_URL = 'dataset-tagging.json';
const STATE = {
  rows: [],
  tags: [],
  owners: [],
  page: 1,
  pageSize: 10,
  q: '',
  owner: 'Any',
  tag: 'Any',
  consentReq: 'Any',      // Any | Yes | No
  directoryInfo: 'Any',   // Any | Yes | No
  readinessMin: 0,        // 0..100
  dirty: false,
  validPattern: /^[A-Z0-9_]+$/
};

let toast; // bootstrap toast instance

(async function init(){
  const d = await fetch(JSON_URL, { cache: 'no-store' })
    .then(r => r.json())
    .catch(() => ({ defaults:{pageSize:10, owners:[], valid_pattern:'^[A-Z0-9_]+$'}, tags:[], datasets:[] }));

  STATE.rows   = (d.datasets || []).map(x => ({...x}));
  STATE.tags   = (d.tags || []).slice();
  STATE.owners = (d.defaults?.owners || []);
  STATE.pageSize = d?.defaults?.pageSize || 10;
  STATE.validPattern = new RegExp(d?.defaults?.valid_pattern || '^[A-Z0-9_]+$');

  renderShell();
  wireFilters();
  draw();

  // Toast init
  try {
    toast = new bootstrap.Toast($('#edxToaster'), { autohide: true, delay: 2400 });
  } catch (_) {}

  $('#btnSave').addEventListener('click', doSave);
  $('#btnRefresh').addEventListener('click', () => location.reload());
  $('#addTagBtn').addEventListener('click', addGlobalTag);
  $('#addTagInput').addEventListener('keydown', onAddGlobalKey);
})();

function renderShell(){
  $('#app-main').innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">Dataset Tagging</h1>
        <div class="small text-body-secondary">Classification tags drive masking & row-level security. Use stable, precise tags.</div>
      </div>
      <div class="d-flex actions">
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm" type="button" aria-label="Refresh">
          <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Refresh
        </button>
        <button id="btnSave" class="btn btn-primary btn-sm" type="button" disabled>Save changes</button>
      </div>
    </div>

    <div class="alert alert-warning py-2 px-3 d-none" id="dirtyBanner" role="status">
      Unsaved changes. Review and click <strong>Save changes</strong>.
    </div>

    <div class="card shadow-sm mb-3">
      <div class="card-body border-bottom bg-body-tertiary filters">
        <form class="row g-2 align-items-end" id="filterForm">
          <div class="col-12 col-sm-6 col-md-4 col-xl-3">
            <label for="search" class="form-label small text-body-secondary">Search (dataset, owner, tag)</label>
            <input id="search" class="form-control form-control-sm" type="search" placeholder="Type to search…">
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="owner" class="form-label small text-body-secondary">Owner</label>
            <select id="owner" class="form-select form-select-sm" aria-label="Owner filter">
              <option>Any</option>
              ${STATE.owners.map(o=>`<option>${o}</option>`).join('')}
            </select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="tag" class="form-label small text-body-secondary">Has tag</label>
            <select id="tag" class="form-select form-select-sm" aria-label="Tag filter">
              <option>Any</option>
              ${STATE.tags.map(t=>`<option>${t}</option>`).join('')}
            </select>
          </div>

          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="consentReq" class="form-label small text-body-secondary">Consent required?</label>
            <select id="consentReq" class="form-select form-select-sm" aria-label="Consent required">
              <option>Any</option><option>Yes</option><option>No</option>
            </select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="directoryInfo" class="form-label small text-body-secondary">Directory info?</label>
            <select id="directoryInfo" class="form-select form-select-sm" aria-label="Directory info">
              <option>Any</option><option>Yes</option><option>No</option>
            </select>
          </div>
          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="readinessMin" class="form-label small text-body-secondary">Readiness ≥</label>
            <input id="readinessMin" class="form-control form-control-sm" type="number" min="0" max="100" value="0" aria-label="Readiness minimum">
          </div>

          <div class="col-6 col-sm-4 col-md-2 col-xl-2">
            <label for="pageSize" class="form-label small text-body-secondary">Rows per page</label>
            <select id="pageSize" class="form-select form-select-sm page-size" aria-label="Rows per page">
              ${[10,20,50].map(n=>`<option value="${n}" ${n==STATE.pageSize?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
        </form>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col" class="schema-col">Dataset</th>
              <th scope="col">Owner</th>
              <th scope="col">Tags & Signals</th>
              <th scope="col" class="text-end">Action</th>
            </tr>
          </thead>
          <tbody id="rows"><tr><td colspan="4"><div class="empty text-center">Loading…</div></td></tr></tbody>
        </table>
      </div>

      <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
        <div id="rangeLabel" class="small text-body-secondary">Rows 0–0 of 0</div>
        <nav aria-label="Pagination"><ul class="pagination pagination-sm mb-0" id="pager"></ul></nav>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-lg-8">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body d-flex align-items-center justify-content-between">
            <strong>Available Tags</strong>
            <div class="input-group input-group-sm maxw-280">
              <input class="form-control" id="addTagInput" placeholder="Add new tag (UPPER_SNAKE_CASE)">
              <button class="btn btn-primary" id="addTagBtn" type="button">Add</button>
            </div>
          </div>
          <div class="card-body">
            <div id="tagPool"></div>
            <div class="form-text mt-2">Tags must match <code>${STATE.validPattern}</code>. Example: <code>PII_STRICT</code></div>
          </div>
        </div>
      </div>

      <div class="col-lg-4">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body"><strong>Column-level Tagging</strong></div>
          <div class="card-body small">
            <div class="text-body-secondary">Click a dataset name (or its button) to review/edit column classifications.</div>
            <div id="colEditor" class="mt-2" aria-live="polite"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Global datalist for suggested tags (referenced by row inputs) -->
    <datalist id="tagSuggestions"></datalist>
  `;

  // Fill tag pool + datalist after shell render
  $('#tagPool').innerHTML = renderTagChips(STATE.tags);
  $('#tagSuggestions').innerHTML = STATE.tags.map(t=>`<option value="${escapeAttr(t)}">`).join('');
}

function wireFilters(){
  $('#filterForm')?.addEventListener('submit', e => e.preventDefault());
  $('#search').addEventListener('input', e => { STATE.q = e.target.value.trim().toLowerCase(); STATE.page = 1; draw(); });
  $('#owner').addEventListener('change', e => { STATE.owner = e.target.value; STATE.page = 1; draw(); });
  $('#tag').addEventListener('change', e => { STATE.tag = e.target.value; STATE.page = 1; draw(); });
  $('#consentReq').addEventListener('change', e => { STATE.consentReq = e.target.value; STATE.page = 1; draw(); });
  $('#directoryInfo').addEventListener('change', e => { STATE.directoryInfo = e.target.value; STATE.page = 1; draw(); });
  $('#readinessMin').addEventListener('input', e => { STATE.readinessMin = Math.max(0, Math.min(100, Number(e.target.value)||0)); STATE.page = 1; draw(); });
  $('#pageSize').addEventListener('change', e => { STATE.pageSize = Number(e.target.value)||10; STATE.page = 1; draw(); });

  document.addEventListener('click', (e)=>{
    // Per-row Add
    const addBtn = e.target.closest('[data-add-btn]');
    if (addBtn){
      const tr = e.target.closest('tr[data-name]');
      const name = tr.getAttribute('data-name');
      const input = tr.querySelector('[data-add-input]');
      addTagToDataset(name, (input.value||'').trim());
      input.value = '';
      return;
    }

    // Remove a tag chip from dataset
    const rm = e.target.closest('[data-dtag]');
    if (rm){
      const tr = e.target.closest('tr[data-name]');
      const name = tr.getAttribute('data-name');
      const tag = rm.getAttribute('data-dtag');
      removeTagFromDataset(name, tag);
      return;
    }

    // Open column editor (button)
    const colsBtn = e.target.closest('button[data-columns]');
    if (colsBtn){
      const tr = e.target.closest('tr[data-name]');
      openColumnEditor(tr.getAttribute('data-name'));
      return;
    }

    // Open column editor when clicking dataset name cell
    const nameCell = e.target.closest('td[data-cell="name"]');
    if (nameCell){
      const tr = nameCell.closest('tr[data-name]');
      openColumnEditor(tr.getAttribute('data-name'));
      return;
    }
  });

  // Keyboard add on Enter for per-row inputs
  document.addEventListener('keydown', (e)=>{
    if (e.key !== 'Enter') return;
    const input = e.target.closest('input[data-add-input]');
    if (input){
      e.preventDefault();
      const tr = input.closest('tr[data-name]');
      const name = tr.getAttribute('data-name');
      addTagToDataset(name, (input.value||'').trim());
      input.value = '';
    }
  });
}

function filtered(){
  const q = STATE.q;
  const has = (s) => String(s||'').toLowerCase().includes(q);

  return STATE.rows.filter(r => {
    const matchesQ = !q || has(r.name) || has(r.owner) || has((r.tags||[]).join(','));
    const matchesOwner = (STATE.owner==='Any') || r.owner === STATE.owner;
    const matchesTag   = (STATE.tag==='Any')   || (r.tags||[]).includes(STATE.tag);

    const consentRequired = !!r.consent?.required;
    const matchesConsentReq =
      (STATE.consentReq==='Any') ||
      (STATE.consentReq==='Yes' && consentRequired) ||
      (STATE.consentReq==='No'  && !consentRequired);

    const directory = !!r.directory_info;
    const matchesDirectory =
      (STATE.directoryInfo==='Any') ||
      (STATE.directoryInfo==='Yes' && directory) ||
      (STATE.directoryInfo==='No'  && !directory);

    const readinessScore = Number(r.readiness?.score ?? 0);
    const matchesReadiness = readinessScore >= (STATE.readinessMin||0);

    return matchesQ && matchesOwner && matchesTag && matchesConsentReq && matchesDirectory && matchesReadiness;
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
    `<tr><td colspan="4"><div class="empty text-center">No matching datasets</div></td></tr>`;

  $('#rangeLabel').textContent = `Rows ${total ? (startIdx+1) : 0}–${endIdx} of ${total}`;

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
  const tagChips = (r.tags||[]).map(t => chip(t, { removable:true, onRemove:`data-dtag="${escapeAttr(t)}"`})).join('') || '<span class="text-body-secondary">None</span>';

  const readiness = Number(r.readiness?.score ?? 0);
  const readinessClass =
    readiness >= 80 ? 'bg-success' :
    readiness >= 50 ? 'bg-warning text-dark' : 'bg-danger';

  const readinessBadge = `<span class="badge ${readinessClass} me-1">Readiness ${readiness}%</span>`;
  const consentBadge = r.consent?.required
    ? `<span class="badge text-bg-warning border border-warning-subtle me-1">Consent req.</span>`
    : `<span class="badge text-bg-light border me-1">No consent</span>`;
  const dirBadge = r.directory_info
    ? `<span class="badge text-bg-info border border-info-subtle me-1">Directory</span>`
    : ``;

  // name cell is now an interactive link/button for accessibility
  const nameCell = `
    <button class="btn btn-link p-0 text-decoration-none fw-semibold" data-cell="name" type="button">
      ${escapeHtml(r.name)}
    </button>`;

  return `
    <tr data-name="${escapeAttr(r.name)}">
      <td class="text-nowrap schema-col">${nameCell}</td>
      <td>${escapeHtml(r.owner||'')}</td>
      <td class="text-wrap" data-tags>
        <div class="mb-1">${readinessBadge}${consentBadge}${dirBadge}</div>
        ${tagChips}
        <div class="input-group input-group-sm maxw-320 mt-2">
          <input class="form-control" placeholder="Add tag (UPPER_SNAKE_CASE)" data-add-input list="tagSuggestions">
          <button class="btn btn-outline-primary" type="button" data-add-btn>Add</button>
        </div>
      </td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" type="button" data-columns>Columns</button>
        </div>
      </td>
    </tr>`;
}

function chip(text, {removable=false, onRemove=''} = {}){
  return `<span class="badge rounded-pill badge-tag me-1 tag-editable" title="${escapeAttr(text)}">
    ${escapeHtml(text)}
    ${removable ? `<button class="btn-close btn-close-white btn-close-sm ms-1" aria-label="Remove" ${onRemove}></button>` : ``}
  </span>`;
}

function addGlobalTag(){
  const input = $('#addTagInput');
  const tag = (input.value||'').trim();
  if (!validateTag(tag)) return;
  if (!STATE.tags.includes(tag)){
    STATE.tags.push(tag);
    $('#tagPool').innerHTML = renderTagChips(STATE.tags);
    // update global datalist too
    $('#tagSuggestions').insertAdjacentHTML('beforeend', `<option value="${escapeAttr(tag)}">`);
  }
  input.value = '';
  showToast(`Added library tag: ${tag}`);
}
function onAddGlobalKey(e){
  if (e.key === 'Enter'){
    e.preventDefault();
    addGlobalTag();
  }
}

function renderTagChips(list){
  return (list||[]).map(t => `<span class="badge rounded-pill badge-tag me-1">${escapeHtml(t)}</span>`).join('');
}

function addTagToDataset(name, tag){
  if (!validateTag(tag)) return;
  const ds = STATE.rows.find(x => x.name === name);
  if (!ds) return;
  if (!ds.tags) ds.tags = [];
  if (ds.tags.includes(tag)){
    showToast(`Tag already exists on ${name}`, true);
    return;
  }
  ds.tags = [...ds.tags, tag];
  markDirty();
  draw();
  showToast(`Added ${tag} to ${name}`);
}

function removeTagFromDataset(name, tag){
  const ds = STATE.rows.find(x => x.name === name);
  if (!ds) return;
  ds.tags = (ds.tags||[]).filter(t => t !== tag);
  markDirty();
  draw();
  showToast(`Removed ${tag} from ${name}`);
}

function validateTag(tag){
  if (!tag){
    showToast('Enter a tag value', true);
    return false;
  }
  if (!STATE.validPattern.test(tag)){
    showToast(`Invalid tag. Must match ${STATE.validPattern}`, true);
    return false;
  }
  return true;
}

function markDirty(){
  STATE.dirty = true;
  $('#btnSave').disabled = false;
  $('#dirtyBanner').classList.remove('d-none');
}

/* ---------- Column-level tagging (demo) ---------- */
function openColumnEditor(datasetName){
  const demoCols = [
    { name:'student_id',    tags:['PII_STRICT'] },
    { name:'student_name',  tags:['PII_DIRECTORY'] },
    { name:'email',         tags:['PII_DIRECTORY'] },
    { name:'absence_code',  tags:['DISCIPLINE'] },
    { name:'aid_amount',    tags:['FINANCIAL'] },
    { name:'notes',         tags:[] }
  ];

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="small mb-2"><strong>${escapeHtml(datasetName)}</strong> — Column classifications</div>
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-2">
        <thead class="table-light"><tr><th>Column</th><th>Tags</th><th class="text-end">Action</th></tr></thead>
        <tbody>
          ${demoCols.map(c => `
            <tr data-col="${escapeAttr(c.name)}">
              <td class="text-nowrap"><code>${escapeHtml(c.name)}</code></td>
              <td data-col-tags>${(c.tags||[]).map(t=>chip(t,{removable:true,onRemove:`data-ctag="${escapeAttr(t)}"`})).join('')||'<span class="text-body-secondary">None</span>'}</td>
              <td class="text-end">
                <div class="input-group input-group-sm maxw-260">
                  <input class="form-control" placeholder="Add tag" data-col-add list="tagSuggestions">
                  <button class="btn btn-outline-primary" type="button" data-col-add-btn>Add</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  const editor = $('#colEditor');
  editor.innerHTML = '';
  editor.appendChild(wrap);

  // one-time wiring for column editor actions
  editor.addEventListener('click', (e)=>{
    const addBtn = e.target.closest('[data-col-add-btn]');
    if (addBtn){
      const tr = e.target.closest('tr[data-col]');
      const input = tr.querySelector('[data-col-add]');
      const tag = (input.value||'').trim();
      if (!validateTag(tag)) return;
      const cell = tr.querySelector('[data-col-tags]');
      const tags = Array.from(cell.querySelectorAll('.badge.tag-editable')).map(b=>b.textContent.trim());
      if (!tags.includes(tag)){
        cell.insertAdjacentHTML('beforeend', chip(tag,{removable:true,onRemove:`data-ctag="${escapeAttr(tag)}"`}));
        showToast(`Added column tag ${tag}`);
      } else {
        showToast(`Column already tagged with ${tag}`, true);
      }
      input.value = '';
    }
    const rm = e.target.closest('[data-ctag]');
    if (rm){
      rm.parentElement.remove();
      showToast('Removed column tag');
    }
  }, { once:true });
}

/* ---------- Save (demo stub; replace with API call) ---------- */
function doSave(){
  const changed = STATE.rows;
  console.info('[AUDIT] dataset-tagging.save', { changed_count: changed.length, at: new Date().toISOString() });
  showToast('Changes captured (demo). In production this would POST to Steward API.');
  STATE.dirty = false;
  $('#btnSave').disabled = true;
  $('#dirtyBanner').classList.add('d-none');
}

/* ---------- utils ---------- */
function showToast(text, isError=false){
  const body = $('#toastBody');
  if (!body) return alert(text);
  body.textContent = text;
  const el = $('#edxToaster');
  el.classList.toggle('text-bg-danger', !!isError);
  el.classList.toggle('text-bg-dark', !isError);
  try { toast.show(); } catch(_) { /* no-op if bootstrap missing */ }
}
function escapeHtml(s=''){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s=''){ return escapeHtml(s); }
