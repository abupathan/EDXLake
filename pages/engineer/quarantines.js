// quarantines.js — Production-ready EDX Quarantines (Bootstrap UI, filters, pagination, bulk ops, audit copy)
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const main    = $('#app-main');
const jsonUrl = 'quarantines.json';

const STATE = {
  data: { files:[], rows:[], meta:{} },
  filter: { q:'', reason:'' },
  page: { files:0, rows:0 },
  pageSize: 10,
  selects: { files: new Set(), rows: new Set() },
  active: { file: null, row: null }
};

(async function init(){
  // Load partials (global)
  try {
    if (window.EDXPartials && typeof window.EDXPartials.loadPartials === 'function') {
      await window.EDXPartials.loadPartials({ sidebar: 'engineer' });
    }
  } catch(e){ console.error('Partials load failed', e); }

  // Load data
  try {
    const d = await fetch(jsonUrl, { cache:'no-store' }).then(r=>r.json());
    STATE.data = d || STATE.data;
  } catch { /* keep defaults */ }

  renderShell();
  bindToolbar();
  renderAll();
})();

function renderShell(){
  const totalFiles = (STATE.data.files||[]).length;
  const totalRows  = (STATE.data.rows||[]).length;
  const reasons = Array.from(new Set((STATE.data.files||[]).map(f=>f.reason))).sort();

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-1">Quarantines</h1>
        <p class="text-muted mb-0">Engineers can triage quarantined files/rows. All actions are audit-logged. Steward approvals govern promotion.</p>
      </div>
      <div class="d-flex toolbar align-items-center flex-wrap">
        <input id="q" class="form-control form-control-sm" placeholder="Search files & rows…" style="max-width:260px">
        <select id="f-reason" class="form-select form-select-sm">
          <option value="">Reason: All</option>
          ${reasons.map(r=>`<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('')}
        </select>
        <div class="btn-group btn-group-sm ms-1" role="group" aria-label="Bulk actions">
          <button id="bulk-reprocess" class="btn btn-outline-secondary" disabled>Reprocess</button>
          <button id="bulk-allow"    class="btn btn-outline-secondary" disabled>Allowlist</button>
          <button id="bulk-delete"   class="btn btn-outline-danger"   disabled>Delete</button>
        </div>
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm ms-1">Refresh</button>
      </div>
    </div>

    <!-- KPIs -->
    <section class="kpis" aria-label="Quarantine metrics">
      <div class="kpi"><div class="label">Files Quarantined</div><div class="value" id="k-files">${totalFiles}</div><div class="foot">Pending triage</div></div>
      <div class="kpi"><div class="label">Rows Quarantined</div><div class="value" id="k-rows">${totalRows}</div><div class="foot">Pending triage</div></div>
      <div class="kpi"><div class="label">Selected</div><div class="value" id="k-selected">0</div><div class="foot">Bulk scope</div></div>
      <div class="kpi"><div class="label">Version</div><div class="value" id="k-ver">${escapeHtml(STATE.data.meta?.version || '—')}</div><div class="foot">${escapeHtml(STATE.data.meta?.title || '')}</div></div>
    </section>

    <div class="row g-3">
      <!-- File Quarantines -->
      <div class="col-lg-6">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body d-flex justify-content-between align-items-center">
            <strong>File Quarantines</strong>
            <div class="form-text">Fix upstream or mappings, then reprocess.</div>
          </div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th style="width:32px"><input type="checkbox" id="sel-files" aria-label="Select all files"></th>
                  <th>File</th><th>Reason</th><th>Rows</th><th>Detected</th><th class="text-end">Actions</th>
                </tr>
              </thead>
              <tbody id="fileRows"></tbody>
            </table>
          </div>
          <div class="card-footer d-flex justify-content-between align-items-center flex-wrap gap-2">
            <small class="text-body-secondary">Downloads contain only quarantined data; governed masking still applies.</small>
            <nav class="pager">
              <button class="btn btn-sm btn-outline-secondary" id="pgF-first">&laquo;</button>
              <button class="btn btn-sm btn-outline-secondary" id="pgF-prev">&lsaquo;</button>
              <span class="small" id="pgF-info">Page 1 of 1</span>
              <button class="btn btn-sm btn-outline-secondary" id="pgF-next">&rsaquo;</button>
              <button class="btn btn-sm btn-outline-secondary" id="pgF-last">&raquo;</button>
            </nav>
          </div>
        </div>
      </div>

      <!-- Row Quarantines -->
      <div class="col-lg-6">
        <div class="card shadow-sm h-100">
          <div class="card-header bg-body d-flex justify-content-between align-items-center">
            <strong>Row Quarantines</strong>
            <div class="form-text">Use allowlists where policy permits; audit trail is immutable.</div>
          </div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th style="width:32px"><input type="checkbox" id="sel-rows" aria-label="Select all rows"></th>
                  <th>Dataset</th><th>Key</th><th>Error</th><th>Detected</th><th class="text-end">Actions</th>
                </tr>
              </thead>
              <tbody id="rowRows"></tbody>
            </table>
          </div>
          <div class="card-footer d-flex justify-content-between align-items-center flex-wrap gap-2">
            <small class="text-body-secondary">Reprocessing moves items back to pipeline retry queues.</small>
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
    </div>
  `;
}

/* -------------------- Rendering -------------------- */
function renderAll(){
  renderFiles();
  renderRows();
  updateKpisSelected();
}

function filterFiles(){
  const q = STATE.filter.q;
  const reason = STATE.filter.reason;
  const all = (STATE.data.files||[]);
  return all.filter(f=>{
    const okQ = !q || JSON.stringify(f).toLowerCase().includes(q);
    const okR = !reason || f.reason === reason;
    return okQ && okR;
  });
}
function filterRows(){
  const q = STATE.filter.q;
  // rows don't have reason; filter only by q
  const all = (STATE.data.rows||[]);
  return all.filter(r=>!q || JSON.stringify(r).toLowerCase().includes(q));
}

function renderFiles(){
  const list = filterFiles();
  const pages = Math.max(1, Math.ceil(list.length / STATE.pageSize));
  STATE.page.files = Math.min(STATE.page.files, pages-1);

  const start = STATE.page.files * STATE.pageSize;
  const slice = list.slice(start, start + STATE.pageSize);

  $('#fileRows').innerHTML = slice.map((f, i) => {
    const id = `f-${start+i}`;
    const checked = STATE.selects.files.has(f.file) ? 'checked' : '';
    return `
      <tr>
        <td><input type="checkbox" class="sel-file" data-key="${escapeAttr(f.file)}" ${checked} aria-label="Select ${escapeAttr(f.file)}"></td>
        <td class="text-truncate" style="max-width:260px"><a href="#" class="act-file-detail" data-key="${escapeAttr(f.file)}">${escapeHtml(f.file)}</a></td>
        <td><span class="badge rounded-pill err-pill">${escapeHtml(f.reason)}</span></td>
        <td>${f.rows}</td>
        <td class="text-nowrap">${escapeHtml(f.detected)}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary act-download"  data-key="${escapeAttr(f.file)}">Download</button>
            <button class="btn btn-outline-secondary act-reprocess" data-key="${escapeAttr(f.file)}">Reprocess</button>
            <button class="btn btn-outline-danger act-delete"       data-key="${escapeAttr(f.file)}">Delete</button>
          </div>
        </td>
      </tr>`;
  }).join('') || `<tr><td class="p-3" colspan="6">No file quarantines.</td></tr>`;

  // pager controls
  $('#pgF-info').textContent = `Page ${STATE.page.files + 1} of ${pages}`;
  $('#pgF-first').disabled = $('#pgF-prev').disabled = STATE.page.files <= 0;
  $('#pgF-last').disabled  = $('#pgF-next').disabled = STATE.page.files >= pages - 1;
  $('#pgF-first').onclick = ()=>{ STATE.page.files = 0; renderFiles(); };
  $('#pgF-prev').onclick  = ()=>{ STATE.page.files = Math.max(0, STATE.page.files-1); renderFiles(); };
  $('#pgF-next').onclick  = ()=>{ STATE.page.files = Math.min(pages-1, STATE.page.files+1); renderFiles(); };
  $('#pgF-last').onclick  = ()=>{ STATE.page.files = pages-1; renderFiles(); };

  // select all + row selection
  const allSelected = slice.every(f => STATE.selects.files.has(f.file)) && slice.length>0;
  $('#sel-files').checked = allSelected;
  $('#sel-files').onchange = (e)=>{
    slice.forEach(f => e.target.checked ? STATE.selects.files.add(f.file) : STATE.selects.files.delete(f.file));
    renderFiles(); updateBulkButtons();
  };
  $$('.sel-file').forEach(cb => cb.addEventListener('change', (e)=>{
    const k = e.target.getAttribute('data-key');
    e.target.checked ? STATE.selects.files.add(k) : STATE.selects.files.delete(k);
    updateBulkButtons(); updateKpisSelected();
  }));

  // actions
  $$('.act-file-detail').forEach(a=> a.addEventListener('click', (e)=>{
    e.preventDefault();
    openFileModal(a.getAttribute('data-key'));
  }));
  $$('.act-download').forEach(b=> b.addEventListener('click', ()=> demoAction('DOWNLOAD', b.getAttribute('data-key'))));
  $$('.act-reprocess').forEach(b=> b.addEventListener('click', ()=> demoAction('REPROCESS', b.getAttribute('data-key'))));
  $$('.act-delete').forEach(b=> b.addEventListener('click', ()=> demoAction('DELETE', b.getAttribute('data-key'))));

  updateBulkButtons();
  updateKpisSelected();
}

function renderRows(){
  const list = filterRows();
  const pages = Math.max(1, Math.ceil(list.length / STATE.pageSize));
  STATE.page.rows = Math.min(STATE.page.rows, pages-1);

  const start = STATE.page.rows * STATE.pageSize;
  const slice = list.slice(start, start + STATE.pageSize);

  $('#rowRows').innerHTML = slice.map((r, i) => {
    const key = `${r.dataset}::${r.key}`;
    const checked = STATE.selects.rows.has(key) ? 'checked' : '';
    return `
      <tr>
        <td><input type="checkbox" class="sel-row" data-key="${escapeAttr(key)}" ${checked} aria-label="Select row"></td>
        <td class="text-nowrap">${escapeHtml(r.dataset)}</td>
        <td><a href="#" class="act-row-detail" data-key="${escapeAttr(key)}"><code>${escapeHtml(r.key)}</code></a></td>
        <td>${escapeHtml(r.error)}</td>
        <td class="text-nowrap">${escapeHtml(r.detected)}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary act-allow"    data-key="${escapeAttr(key)}">Allowlist</button>
            <button class="btn btn-outline-secondary act-reprocess" data-key="${escapeAttr(key)}">Reprocess</button>
            <button class="btn btn-outline-danger act-delete"       data-key="${escapeAttr(key)}">Delete</button>
          </div>
        </td>
      </tr>`;
  }).join('') || `<tr><td class="p-3" colspan="6">No row quarantines.</td></tr>`;

  // pager controls
  $('#pgR-info').textContent = `Page ${STATE.page.rows + 1} of ${pages}`;
  $('#pgR-first').disabled = $('#pgR-prev').disabled = STATE.page.rows <= 0;
  $('#pgR-last').disabled  = $('#pgR-next').disabled = STATE.page.rows >= pages - 1;
  $('#pgR-first').onclick = ()=>{ STATE.page.rows = 0; renderRows(); };
  $('#pgR-prev').onclick  = ()=>{ STATE.page.rows = Math.max(0, STATE.page.rows-1); renderRows(); };
  $('#pgR-next').onclick  = ()=>{ STATE.page.rows = Math.min(pages-1, STATE.page.rows+1); renderRows(); };
  $('#pgR-last').onclick  = ()=>{ STATE.page.rows = pages-1; renderRows(); };

  // select all + row selection
  const allSelected = slice.every(r => STATE.selects.rows.has(`${r.dataset}::${r.key}`)) && slice.length>0;
  $('#sel-rows').checked = allSelected;
  $('#sel-rows').onchange = (e)=>{
    slice.forEach(r => {
      const k = `${r.dataset}::${r.key}`;
      e.target.checked ? STATE.selects.rows.add(k) : STATE.selects.rows.delete(k);
    });
    renderRows(); updateBulkButtons();
  };
  $$('.sel-row').forEach(cb => cb.addEventListener('change', (e)=>{
    const k = e.target.getAttribute('data-key');
    e.target.checked ? STATE.selects.rows.add(k) : STATE.selects.rows.delete(k);
    updateBulkButtons(); updateKpisSelected();
  }));

  // actions
  $$('.act-row-detail').forEach(a=> a.addEventListener('click', (e)=>{
    e.preventDefault();
    openRowModal(a.getAttribute('data-key'));
  }));
  $$('#rowRows .act-allow').forEach(b=> b.addEventListener('click', ()=> demoAction('ALLOWLIST', b.getAttribute('data-key'))));
  $$('#rowRows .act-reprocess').forEach(b=> b.addEventListener('click', ()=> demoAction('REPROCESS', b.getAttribute('data-key'))));
  $$('#rowRows .act-delete').forEach(b=> b.addEventListener('click', ()=> demoAction('DELETE', b.getAttribute('data-key'))));

  updateBulkButtons();
  updateKpisSelected();
}

/* -------------------- Toolbar / Filters / Search -------------------- */
function bindToolbar(){
  $('#q').addEventListener('input', e => { STATE.filter.q = e.target.value.toLowerCase().trim(); STATE.page.files=0; STATE.page.rows=0; renderAll(); });
  $('#f-reason').addEventListener('change', e => { STATE.filter.reason = e.target.value; STATE.page.files=0; renderFiles(); });
  $('#btnRefresh').addEventListener('click', async ()=>{
    const d = await fetch(jsonUrl, { cache:'no-store' }).then(r=>r.json()).catch(()=>STATE.data);
    STATE.data = d || STATE.data;
    STATE.selects.files.clear(); STATE.selects.rows.clear();
    renderShell(); bindToolbar(); renderAll();
  });

  // Bulk buttons
  $('#bulk-reprocess').addEventListener('click', ()=> bulkAction('REPROCESS'));
  $('#bulk-allow').addEventListener('click',    ()=> bulkAction('ALLOWLIST'));
  $('#bulk-delete').addEventListener('click',   ()=> bulkAction('DELETE'));
}

function updateBulkButtons(){
  const any = STATE.selects.files.size + STATE.selects.rows.size > 0;
  $('#bulk-reprocess').disabled = !any;
  $('#bulk-allow').disabled     = !any;
  $('#bulk-delete').disabled    = !any;
}
function updateKpisSelected(){
  $('#k-selected').textContent = STATE.selects.files.size + STATE.selects.rows.size;
}

/* -------------------- Detail Modals -------------------- */
function openFileModal(key){
  const f = (STATE.data.files||[]).find(x => x.file === key);
  if (!f) return;
  $('#fileModalLabel').textContent = f.file;
  $('#fileModalBody').innerHTML = `
    <dl class="row mb-0">
      <dt class="col-4">Reason</dt><dd class="col-8"><span class="badge rounded-pill err-pill">${escapeHtml(f.reason)}</span></dd>
      <dt class="col-4">Rows</dt><dd class="col-8">${f.rows}</dd>
      <dt class="col-4">Detected</dt><dd class="col-8">${escapeHtml(f.detected)}</dd>
    </dl>
    <div class="small text-body-secondary mt-2">All actions are immutably audit-logged; reprocess feeds the pipeline retry mechanism.</div>
  `;
  STATE.active.file = f.file;
  const modal = new bootstrap.Modal($('#fileModal')); modal.show();
  $('#fileDownloadBtn').onclick = ()=> demoAction('DOWNLOAD', f.file, modal);
  $('#fileReprocessBtn').onclick = ()=> demoAction('REPROCESS', f.file, modal);
  $('#fileDeleteBtn').onclick = ()=> demoAction('DELETE', f.file, modal);
}

function openRowModal(key){
  const [dataset, rowKey] = key.split('::');
  const r = (STATE.data.rows||[]).find(x => `${x.dataset}::${x.key}` === key);
  if (!r) return;
  $('#rowModalLabel').textContent = `${dataset}`;
  $('#rowModalBody').innerHTML = `
    <dl class="row mb-0">
      <dt class="col-4">Key</dt><dd class="col-8"><code>${escapeHtml(r.key)}</code></dd>
      <dt class="col-4">Error</dt><dd class="col-8">${escapeHtml(r.error)}</dd>
      <dt class="col-4">Detected</dt><dd class="col-8">${escapeHtml(r.detected)}</dd>
    </dl>
    <div class="small text-body-secondary mt-2">Allowlisting must comply with governance; all decisions are audit-logged.</div>
  `;
  STATE.active.row = key;
  const modal = new bootstrap.Modal($('#rowModal')); modal.show();
  $('#rowAllowBtn').onclick   = ()=> demoAction('ALLOWLIST', key, modal);
  $('#rowReprocessBtn').onclick = ()=> demoAction('REPROCESS', key, modal);
  $('#rowDeleteBtn').onclick    = ()=> demoAction('DELETE', key, modal);
}

/* -------------------- Actions (demo/no backend) -------------------- */
function demoAction(kind, key, modal){
  alert(`${kind} requested for ${key}\n(demo only — action will be audit-logged in production).`);
  if (modal) modal.hide();
}
function bulkAction(kind){
  const files = Array.from(STATE.selects.files);
  const rows  = Array.from(STATE.selects.rows);
  if (!files.length && !rows.length) return;
  alert(`${kind} requested for:\nFiles (${files.length})\n- ${files.join('\n- ')}\nRows (${rows.length})\n- ${rows.join('\n- ')}\n(demo only — audit-logged in production).`);
}

/* -------------------- Utils -------------------- */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }
