// mappings.js — Production-ready EDX Mappings (Bootstrap UI, filters, pagination, modals, governance copy)
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const main    = $('#app-main');
const jsonUrl = 'mappings.json';

const STATE = {
  data: { mappings:[], summary:{}, history:[], meta:{} },
  filters: { q:'', standard:'', version:'', status:'' },
  page: 0,
  pageSize: 10
};

(async function init(){
  // Load partials via global helper for header/sidebar/footer
  try {
    if (window.EDXPartials && typeof window.EDXPartials.loadPartials === 'function') {
      await window.EDXPartials.loadPartials({ sidebar: 'engineer' });
    }
  } catch(e){ console.error('Partials load failed', e); }

  await loadData();
  renderShell();
  bindToolbar();
  renderTable();
})();

async function loadData(){
  try {
    const d = await fetch(jsonUrl, { cache: 'no-store' }).then(r=>r.json());
    STATE.data = d || STATE.data;
  } catch { /* keep defaults */ }
}

/* -------------------- Shell -------------------- */
function renderShell(){
  const s = STATE.data.summary || {};
  const standards = Array.from(new Set((STATE.data.mappings||[]).map(m=>m.standard))).sort();
  const versions  = Array.from(new Set((STATE.data.mappings||[]).map(m=>m.version))).sort();
  const statuses  = Array.from(new Set((STATE.data.mappings||[]).map(m=>m.status))).sort();

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-1">Mappings (Ed-Fi / OneRoster / CEDS)</h1>
        <p class="text-muted mb-0">Mappings are versioned and **Steward-approved** before promotion. All changes are audit-logged.</p>
      </div>
      <div class="d-flex toolbar align-items-center flex-wrap">
        <input id="q" class="form-control form-control-sm" placeholder="Search mappings…" style="max-width:260px">
        <select id="f-standard" class="form-select form-select-sm">
          <option value="">Standard: All</option>
          ${standards.map(x=>`<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join('')}
        </select>
        <select id="f-version" class="form-select form-select-sm">
          <option value="">Version: All</option>
          ${versions.map(x=>`<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join('')}
        </select>
        <select id="f-status" class="form-select form-select-sm">
          <option value="">Status: All</option>
          ${statuses.map(x=>`<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join('')}
        </select>
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm ms-1">Refresh</button>
        <button id="btnNew" class="btn btn-primary btn-sm ms-1">New Mapping</button>
      </div>
    </div>

    <!-- KPIs -->
    <section class="row g-2 mb-2" aria-label="Mapping KPIs">
      <div class="col-6 col-lg-3"><div class="card shadow-sm"><div class="card-body py-2">
        <div class="small text-body-secondary">Total</div><div class="fw-bold" id="k-total">${s.count ?? (STATE.data.mappings||[]).length}</div>
      </div></div></div>
      <div class="col-6 col-lg-3"><div class="card shadow-sm"><div class="card-body py-2">
        <div class="small text-body-secondary">Approved</div><div class="fw-bold" id="k-approved">${s.statuses?.approved ?? '-'}</div>
      </div></div></div>
      <div class="col-6 col-lg-3"><div class="card shadow-sm"><div class="card-body py-2">
        <div class="small text-body-secondary">Draft</div><div class="fw-bold" id="k-draft">${s.statuses?.draft ?? '-'}</div>
      </div></div></div>
      <div class="col-6 col-lg-3"><div class="card shadow-sm"><div class="card-body py-2">
        <div class="small text-body-secondary">Deprecated</div><div class="fw-bold" id="k-depr">${s.statuses?.deprecated ?? '-'}</div>
      </div></div></div>
    </section>

    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th class="schema-col">Source Field</th>
              <th class="schema-col">Canonical Target</th>
              <th class="std-col">Standard</th>
              <th class="ver-col">Version</th>
              <th>Status</th>
              <th class="time-col">Last Updated</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
      <div class="card-footer d-flex justify-content-between align-items-center">
        <small class="text-body-secondary">Promotion to publish is **Steward-gated**; policy tags inform masking & ABAC.</small>
        <nav class="pager">
          <button class="btn btn-sm btn-outline-secondary" id="pg-first">&laquo;</button>
          <button class="btn btn-sm btn-outline-secondary" id="pg-prev">&lsaquo;</button>
          <span class="small" id="pg-info">Page 1 of 1</span>
          <button class="btn btn-sm btn-outline-secondary" id="pg-next">&rsaquo;</button>
          <button class="btn btn-sm btn-outline-secondary" id="pg-last">&raquo;</button>
        </nav>
      </div>
    </div>
  `;
}

function bindToolbar(){
  $('#q').addEventListener('input', e => { STATE.filters.q = e.target.value.toLowerCase().trim(); STATE.page = 0; renderTable(); });
  $('#f-standard').addEventListener('change', e => { STATE.filters.standard = e.target.value; STATE.page = 0; renderTable(); });
  $('#f-version').addEventListener('change', e => { STATE.filters.version  = e.target.value; STATE.page = 0; renderTable(); });
  $('#f-status').addEventListener('change', e => { STATE.filters.status   = e.target.value; STATE.page = 0; renderTable(); });
  $('#btnRefresh').addEventListener('click', async ()=>{ await loadData(); renderShell(); bindToolbar(); renderTable(); });
  $('#btnNew').addEventListener('click', ()=> openMappingModal());
}

/* -------------------- Table rendering w/ pagination -------------------- */
function filtered(){
  const { q, standard, version, status } = STATE.filters;
  return (STATE.data.mappings||[]).filter(m=>{
    const okQ = !q || JSON.stringify(m).toLowerCase().includes(q);
    const okS = !standard || m.standard === standard;
    const okV = !version  || m.version  === version;
    const okT = !status   || (m.status||'').toLowerCase() === status.toLowerCase();
    return okQ && okS && okV && okT;
  });
}

function pages(){ return Math.max(1, Math.ceil(filtered().length / STATE.pageSize)); }

function renderTable(){
  const list = filtered();
  const pageCount = pages();
  STATE.page = Math.min(STATE.page, pageCount - 1);

  const start = STATE.page * STATE.pageSize;
  const slice = list.slice(start, start + STATE.pageSize);

  $('#rows').innerHTML = slice.map(m => `
    <tr>
      <td class="schema-col"><code>${escapeHtml(m.source)}</code></td>
      <td class="schema-col"><code>${escapeHtml(m.target)}</code></td>
      <td>${escapeHtml(m.standard)}</td>
      <td>${escapeHtml(m.version)}</td>
      <td>
        ${badgeStatus(m.status)}
      </td>
      <td class="text-nowrap">${escapeHtml(m.updated || '—')}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary act-edit"    data-id="${escapeAttr(m.source+'->'+m.target)}">Edit</button>
          <button class="btn btn-outline-secondary act-history" data-id="${escapeAttr(m.source+'->'+m.target)}">History</button>
          <button class="btn btn-outline-danger act-delete"     data-id="${escapeAttr(m.source+'->'+m.target)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td class="p-3" colspan="7">No mappings found.</td></tr>`;

  // pager controls
  $('#pg-info').textContent = `Page ${STATE.page + 1} of ${pageCount}`;
  $('#pg-first').disabled = $('#pg-prev').disabled = STATE.page <= 0;
  $('#pg-last').disabled  = $('#pg-next').disabled = STATE.page >= pageCount - 1;
  $('#pg-first').onclick = ()=>{ STATE.page = 0; renderTable(); };
  $('#pg-prev').onclick  = ()=>{ STATE.page = Math.max(0, STATE.page-1); renderTable(); };
  $('#pg-next').onclick  = ()=>{ STATE.page = Math.min(pageCount-1, STATE.page+1); renderTable(); };
  $('#pg-last').onclick  = ()=>{ STATE.page = pageCount-1; renderTable(); };

  // actions
  $$('.act-edit').forEach(b => b.addEventListener('click', ()=> openMappingModal(b.dataset.id)));
  $$('.act-history').forEach(b => b.addEventListener('click', ()=> openHistoryModal(b.dataset.id)));
  $$('.act-delete').forEach(b => b.addEventListener('click', ()=> alert(`DELETE requested for ${b.dataset.id}\n(demo — audit-logged).`)));
}

/* -------------------- Modals (Demo-safe) -------------------- */
function openMappingModal(id){
  const [src, tgt] = (id||' -> ').split('->').map(s=>s.trim());
  const m = (STATE.data.mappings||[]).find(x => `${x.source}->${x.target}` === `${src}->${tgt}`) || {
    source:'', target:'', standard:'OneRoster', version:'1.2', status:'draft',
    steward:'', sample_transform:'value', policy_tags:[], change_note:''
  };

  $('#mapModalLabel').textContent = id ? `Edit Mapping — ${src}` : 'New Mapping';
  $('#mapModalBody').innerHTML = `
    <div class="row g-3">
      <div class="col-md-6"><label class="form-label">Source Field</label><input id="mSource" class="form-control" value="${escapeAttr(m.source)}" ${id?'disabled':''}></div>
      <div class="col-md-6"><label class="form-label">Canonical Target</label><input id="mTarget" class="form-control" value="${escapeAttr(m.target)}" ${id?'disabled':''}></div>

      <div class="col-md-3"><label class="form-label">Standard</label><select id="mStandard" class="form-select">
        ${['Ed-Fi','OneRoster','CEDS'].map(v=>`<option ${m.standard===v?'selected':''}>${v}</option>`).join('')}
      </select></div>
      <div class="col-md-3"><label class="form-label">Version</label><input id="mVersion" class="form-control" value="${escapeAttr(m.version||'')}"></div>
      <div class="col-md-3"><label class="form-label">Status</label><select id="mStatus" class="form-select">
        ${['draft','approved','deprecated'].map(v=>`<option ${m.status===v?'selected':''}>${v}</option>`).join('')}
      </select></div>
      <div class="col-md-3"><label class="form-label">Steward</label><input id="mSteward" class="form-control" value="${escapeAttr(m.steward||'')}"></div>

      <div class="col-md-12"><label class="form-label">Sample Transform</label><input id="mTransform" class="form-control" value="${escapeAttr(m.sample_transform||'value')}"></div>
      <div class="col-md-12"><label class="form-label">Policy Tags (comma-sep)</label><input id="mTags" class="form-control" value="${escapeAttr((m.policy_tags||[]).join(', '))}"></div>
      <div class="col-md-12"><label class="form-label">Change Note</label><textarea id="mNote" rows="2" class="form-control">${escapeHtml(m.change_note||'')}</textarea></div>

      <div class="col-12"><small class="text-body-secondary">Edits are **audit-logged**; promotion to publish requires **Steward approval**.</small></div>
    </div>
  `;
  const modal = new bootstrap.Modal($('#mapModal')); modal.show();
  $('#mapSaveBtn').onclick = ()=> {
    alert('SAVE mapping (demo). Audit log recorded.');
    modal.hide();
  };
}

function openHistoryModal(id){
  const entries = ((STATE.data.history||[]).find(h => h.mapping === id)?.entries) || [];
  $('#histModalLabel').textContent = `History — ${id}`;
  $('#histModalBody').innerHTML = entries.length
    ? `<ul class="list-group">${entries.map(e=>`
        <li class="list-group-item d-flex justify-content-between align-items-start">
          <div class="me-auto">
            <div class="fw-semibold">${escapeHtml(e.action)}</div>
            <div class="small text-body-secondary">${escapeHtml(e.note||'')}</div>
          </div>
          <span class="badge text-bg-secondary">${escapeHtml(e.ts)}</span>
          <span class="ms-2 small">${escapeHtml(e.actor)}</span>
        </li>`).join('')}</ul>`
    : `<div class="text-body-secondary">No history available for this mapping.</div>`;
  new bootstrap.Modal($('#histModal')).show();
}

/* -------------------- Helpers -------------------- */
function badgeStatus(s){
  const map = { approved:'success', draft:'warning', deprecated:'secondary' };
  const tone = map[(s||'').toLowerCase()] || 'secondary';
  return `<span class="badge text-bg-${tone}">${escapeHtml(s||'—')}</span>`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }
