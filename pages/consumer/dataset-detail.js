/* Dataset Details (Data Consumer)
 * Adds:
 *  - Readiness panel: freshness_ts, DQ%, schema_version, canonical_pack_version, policy_snapshot_id
 *  - Lineage path (source → canonical → publish)
 *  - Field-level sensitivity chips (kept from baseline)
 *  - Contract viewer modal (JSON schema) with copy/download
 *  - Breaking-changes pill (compares last_used_schema vs current schema_version)
 *  - Purpose banner + effective policy badge using session + dataset meta
 * Keeps:
 *  - Schema + Preview tabs with pagination (accessibility + CSP-safe)
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const DEMO_URL = './dataset-detail.json'; // adjacent to the page

const state = {
  key: null,       // dataset key
  meta: null,
  schema: [],
  preview: [],
  contract: null,  // JSON schema object (for inline viewing)
  schemaPage: 1,
  previewPage: 1,
  size: 10
};

function getParam(k){ return new URLSearchParams(location.search).get(k); }
function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }

function badge(label){ return `<span class="badge rounded-pill badge-mini">${escapeHtml(label)}</span>`; }

function readUser(){
  try { return JSON.parse(localStorage.getItem("edx:user") || "null"); } catch { return null; }
}

/* ---------- Pagination helpers ---------- */
function paginate(arr, page, size){
  const total = arr.length;
  const pages = Math.max(1, Math.ceil(total/size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p-1)*size;
  const end = Math.min(total, start+size);
  return { total, pages, page: p, start, end, rows: arr.slice(start, end) };
}

function pagination(kind, pg){
  return `
    <div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div class="small text-body-secondary" aria-live="polite">
        Showing <strong>${pg.total ? (pg.start+1) : 0}</strong>–<strong>${pg.end}</strong> of <strong>${pg.total}</strong>
      </div>
      <div class="pagination-wrap d-flex align-items-center gap-2 flex-wrap" data-paginate="${kind}">
        <button class="btn btn-outline-secondary btn-sm" data-first ${pg.page===1?'disabled':''} aria-label="First page">«</button>
        <button class="btn btn-outline-secondary btn-sm" data-prev  ${pg.page===1?'disabled':''} aria-label="Previous page">‹</button>
        <span class="small">Page</span>
        <input class="form-control form-control-sm page-input" type="number" min="1" max="${pg.pages}" value="${pg.page}" aria-label="Current page for ${kind}">
        <span class="small">of ${pg.pages}</span>
        <button class="btn btn-outline-secondary btn-sm" data-next ${pg.page===pg.pages?'disabled':''} aria-label="Next page">›</button>
        <button class="btn btn-outline-secondary btn-sm" data-last ${pg.page===pg.pages?'disabled':''} aria-label="Last page">»</button>
        <span class="vr mx-1"></span>
        <label class="small me-1" for="pageSize-${kind}">Rows</label>
        <select id="pageSize-${kind}" class="form-select form-select-sm" aria-label="Rows per page">
          ${[10,20,50,100].map(n=>`<option value="${n}" ${n===state.size?'selected':''}>${n}</option>`).join('')}
        </select>
      </div>
    </div>`;
}

function wirePagination(kind, pg){
  const host = document.querySelector(`[data-paginate="${kind}"]`);
  const setPage = (p) => {
    if (kind==='schema') state.schemaPage = p; else state.previewPage = p;
    if (kind==='schema') renderSchema(); else renderPreview();
    $('#main')?.focus();
  };
  host.querySelector('[data-first]')?.addEventListener('click', ()=> setPage(1));
  host.querySelector('[data-prev]') ?.addEventListener('click', ()=> setPage(Math.max(1, (kind==='schema'?state.schemaPage:state.previewPage)-1)));
  host.querySelector('[data-next]') ?.addEventListener('click', ()=> setPage(Math.min(pg.pages, (kind==='schema'?state.schemaPage:state.previewPage)+1)));
  host.querySelector('[data-last]') ?.addEventListener('click', ()=> setPage(pg.pages));
  host.querySelector('input[type="number"]')?.addEventListener('change', (e)=>{
    const v = Math.min(pg.pages, Math.max(1, parseInt(e.target.value||'1',10)));
    setPage(v);
  });
  host.querySelector('select')?.addEventListener('change', (e)=>{
    state.size = parseInt(e.target.value,10)||10;
    state.schemaPage = 1; state.previewPage = 1;
    renderSchema(); renderPreview();
  });
}

/* ---------- Summary & readiness ---------- */
function paintSummary(){
  const m = state.meta || {};
  const name = m.display_name || m.name || state.key || 'Dataset';
  $('#crumbName').textContent = name;
  $('#dsName').textContent = name;
  $('#dsDesc').textContent = m.desc || '—';

  // badges: standard, domain, purposes
  const badges = [
    m.standard ? `Standard ${m.standard}` : null,
    m.domain   ? `Domain ${m.domain}`     : null,
    ...(Array.isArray(m.purposes) ? m.purposes : [])
  ].filter(Boolean).map(badge).join(' ');
  $('#dsBadges').innerHTML = badges;

  // readiness
  const dq = Number(m.dq || 0);
  const dqClass = dq>=90 ? 'bg-success-subtle text-success-emphasis border'
                : dq>=75 ? 'bg-warning-subtle text-warning-emphasis border'
                         : 'bg-danger-subtle  text-danger-emphasis  border';
  const dqBadge = $('#dqBadge');
  dqBadge.className = `badge rounded-pill ${dqClass}`;
  dqBadge.textContent = `DQ — ${isFinite(dq)?dq:'—'}%`;

  $('#freshnessTs').textContent = m.freshness_ts ? new Date(m.freshness_ts).toLocaleString() : (m.freshness || '—');
  $('#schemaVersion').textContent = m.schema_version || m.schema || '—';
  $('#canonicalPack').textContent = m.canonical_pack_version || '—';

  // breaking changes pill
  const breaking = isBreaking(m.last_used_schema, m.schema_version || m.schema);
  $('#breakingPill').classList.toggle('d-none', !breaking);

  // link workbench with dataset
  const workbench = new URL('./query-workbench.html', location.href);
  workbench.searchParams.set('dataset', state.key || name);
  $('#openWorkbenchBtn')?.setAttribute('href', workbench.toString());
}

function isBreaking(prev, cur){
  if (!prev || !cur) return false;
  const P = String(prev).split('.').map(n=>parseInt(n,10)||0);
  const C = String(cur).split('.').map(n=>parseInt(n,10)||0);
  return (C[0]||0) > (P[0]||0); // major bump
}

/* ---------- Policy banner ---------- */
function paintPolicy(){
  const m = state.meta || {};
  const u = readUser() || {};
  const role = (u.role || 'consumer').replace(/_/g,' ');
  const org  = u.org || u.orgId || 'Org=District-12';
  const term = u.term || 'Term=2024-25';
  const masking = (m?.effective_masking || 'PII masked');

  $('#effectivePolicyText').textContent = `${masking} · ${org} · ${term} · Role=${role}`;
  $('#policySnapshot').textContent = `policy_snapshot_id=${m.policy_snapshot_id || '—'}`;
}

/* ---------- Lineage ---------- */
function paintLineage(){
  const host = $('#lineagePath');
  const L = state.meta?.lineage || {};
  const src = L.source || { label:'Source' };
  const can = L.canonical || { label:'Canonical' };
  const pub = L.publish || { label:'Publish' };
  const step = (obj)=>`<span class="step"><i class="bi ${escapeHtml(obj.icon||'bi-box')}" aria-hidden="true"></i><span>${escapeHtml(obj.label||'—')}</span></span>`;
  host.innerHTML = `${step(src)} <span class="sep"><i class="bi bi-arrow-right" aria-hidden="true"></i></span> ${step(can)} <span class="sep"><i class="bi bi-arrow-right" aria-hidden="true"></i></span> ${step(pub)}`;
}

/* ---------- Schema & preview ---------- */
function renderSchema(){
  const host = $('#schemaTableWrap');
  const pg = paginate(state.schema, state.schemaPage, state.size);
  const thead = `
    <thead class="table-light">
      <tr><th>Name</th><th>Type</th><th>Nullable</th><th>Description</th><th>Classifications</th></tr>
    </thead>`;
  const rows = pg.rows.map(c=>{
    const cl = (c.classifications||[]).map(badge).join(' ');
    return `<tr>
      <td class="text-nowrap">${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.type)}</td>
      <td>${c.nullable ? 'Yes' : 'No'}</td>
      <td>${escapeHtml(c.desc || '')}</td>
      <td>${cl || '—'}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="5" class="text-center text-body-secondary py-4">No columns.</td></tr>`;

  host.innerHTML = `
    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">${thead}<tbody>${rows}</tbody></table>
      </div>
      ${pagination('schema', pg)}
    </div>`;
  wirePagination('schema', pg);
}

function renderPreview(){
  const host = $('#previewTableWrap');
  const pg = paginate(state.preview, state.previewPage, state.size);
  if (!pg.total){
    host.innerHTML = `<div class="alert alert-info mb-0">No sample rows available.</div>`;
    return;
  }
  const cols = Object.keys(pg.rows[0]);
  const thead = `<thead class="table-light"><tr>${cols.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
  const body = pg.rows.map(r=>`<tr>${cols.map(c=>`<td>${escapeHtml(r[c])}</td>`).join('')}</tr>`).join('');

  host.innerHTML = `
    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">${thead}<tbody>${body}</tbody></table>
      </div>
      ${pagination('preview', pg)}
    </div>`;
  wirePagination('preview', pg);
}

/* ---------- Contract viewer ---------- */
function bindContract(){
  const btn = $('#viewContractBtn');
  const copyBtn = $('#copyContractBtn');
  const dl = $('#downloadContractBtn');
  const pre = $('#contractJson');

  btn?.addEventListener('click', ()=>{
    const json = state.contract || {};
    const pretty = JSON.stringify(json, null, 2);
    pre.textContent = pretty;

    // prepare a downloadable blob (optional; inline view is primary)
    try{
      const blob = new Blob([pretty], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      dl.classList.remove('d-none');
      dl.href = url;
      dl.download = `${state.key || 'dataset'}.schema.json`;
    }catch{
      dl.classList.add('d-none');
    }

    const modal = new bootstrap.Modal('#contractModal', { backdrop: 'static' });
    modal.show();
    setTimeout(()=>pre.focus(), 200);
  });

  copyBtn?.addEventListener('click', async ()=>{
    try {
      await navigator.clipboard.writeText($('#contractJson').textContent || '');
      copyBtn.innerHTML = `<i class="bi bi-clipboard-check" aria-hidden="true"></i> Copied`;
      setTimeout(()=>copyBtn.innerHTML = `<i class="bi bi-clipboard" aria-hidden="true"></i> Copy`, 1200);
    } catch {}
  });
}

/* ---------- Boot ---------- */
async function init(){
  // dataset key from URL (?dataset= or ?name=), fallback to first dataset in JSON
  const fromUrl = getParam('dataset') || getParam('name');
  try{
    const res = await fetch(DEMO_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();

    // pick dataset
    const key = fromUrl && d.datasets[fromUrl] ? fromUrl : Object.keys(d.datasets)[0];
    state.key = key;

    const ds = d.datasets[key];
    state.meta = ds.meta || {};
    state.schema = ds.schema || [];
    state.preview = ds.preview || [];
    state.contract = ds.contract || null;
  }catch(e){
    console.error('[EDX] dataset-detail load failed', e);
    state.key = fromUrl || 'dataset';
    state.meta = { name: state.key, desc: 'Dataset metadata unavailable' };
    state.schema = [];
    state.preview = [];
    state.contract = {};
  }

  paintSummary();
  paintPolicy();
  paintLineage();
  renderSchema();
  renderPreview();
  bindContract();

  // focus main for keyboard users
  $('#main')?.focus();
}

init();
