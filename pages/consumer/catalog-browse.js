/* EDX — Catalog (Consumer)
 * Production-ready browsing with cursor-based pagination and filters.
 * - Honors global header search (?q=)
 * - Facets: Domain, Standard, Sensitivity, Freshness
 * - Result cards show Freshness, DQ score, Schema version, Sensitivity tags
 * - Cursor pagination (prev/next tokens)
 * - Robust empty/error states (network, 429/500)
 * - CSP-safe, accessible
 *
 * Demo/local mode reads ./catalog-browse.json and simulates cursors.
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

/* -------------------- Config -------------------- */
const LOCAL_DATA_URL = './catalog-browse.json'; // demo dataset
// If/when a backend is available, you can point API_BASE and use fetchPageFromAPI
const API_BASE = null; // e.g., '/v1/catalog'

/* -------------------- State -------------------- */
const state = {
  q: '', domain: '', standard: '', sensitivity: '', freshness: '',
  page_size: 9,
  next_token: null,
  prev_token: null,
  items: [],
  total_estimate: null,
  loading: false,
  error: null,
};

/* -------------------- URL helpers -------------------- */
function readURL(){
  const sp = new URLSearchParams(location.search);
  state.q          = sp.get('q') || '';
  state.domain     = sp.get('domain') || '';
  state.standard   = sp.get('standard') || '';
  state.sensitivity= sp.get('sensitivity') || '';
  state.freshness  = sp.get('freshness') || '';
}
function writeURL(replace=true){
  const sp = new URLSearchParams();
  if (state.q) sp.set('q', state.q);
  if (state.domain) sp.set('domain', state.domain);
  if (state.standard) sp.set('standard', state.standard);
  if (state.sensitivity) sp.set('sensitivity', state.sensitivity);
  if (state.freshness) sp.set('freshness', state.freshness);
  const url = `${location.pathname}?${sp.toString()}`;
  replace ? history.replaceState(null,'',url) : history.pushState(null,'',url);
}

/* -------------------- Fetch layer -------------------- */
// Backend-style fetch (when API is available)
async function fetchPageFromAPI({ q, domain, standard, sensitivity, freshness, page_size, cursor }){
  const sp = new URLSearchParams();
  if (q) sp.set('q', q);
  if (domain) sp.set('domain', domain);
  if (standard) sp.set('standard', standard);
  if (sensitivity) sp.set('sensitivity', sensitivity);
  if (freshness) sp.set('freshness', freshness);
  if (page_size) sp.set('page_size', page_size);
  if (cursor) sp.set('cursor', cursor);
  const url = `${API_BASE}/datasets?${sp.toString()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Local/demo fetch (simulates cursors from static JSON)
async function fetchPageLocal({ q, domain, standard, sensitivity, freshness, page_size, cursor }){
  const res = await fetch(LOCAL_DATA_URL, { cache: 'no-store' });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json(); // { items: [...], total_estimate }
  const all = Array.isArray(data.items) ? data.items.slice() : [];
  const filtered = all.filter(it=>{
    const matchesQ = !q || [
      it.name, it.description, it.domain, it.standard,
      ...(it.sensitivity_tags||[]), (it.schema_version||'')
    ].some(v => String(v||'').toLowerCase().includes(q.toLowerCase()));
    const matchesDomain   = !domain || it.domain === domain;
    const matchesStandard = !standard || it.standard === standard;
    const matchesSens     = !sensitivity || (it.sensitivity_tags||[]).includes(sensitivity);
    const matchesFresh    = !freshness || isFreshEnough(it.freshness_ts, freshness);
    return matchesQ && matchesDomain && matchesStandard && matchesSens && matchesFresh;
  });

  // Simple opaque cursor scheme: use index encoded as base36 token.
  const size = Math.max(3, Math.min(24, page_size||9));
  const start = cursor ? parseInt(cursor, 36) : 0;
  const slice = filtered.slice(start, start + size);
  const nextIdx = start + size;
  const prevIdx = Math.max(0, start - size);

  return {
    items: slice,
    next_token: nextIdx < filtered.length ? nextIdx.toString(36) : null,
    prev_token: start > 0 ? prevIdx.toString(36) : null,
    total_estimate: filtered.length
  };
}

function isFreshEnough(iso, window){
  if (!iso || !window) return true;
  const dt = new Date(iso).getTime();
  const now = Date.now();
  const ms = window === '24h' ? 24*3600e3 : window === '7d' ? 7*24*3600e3 : window === '30d' ? 30*24*3600e3 : Infinity;
  return (now - dt) <= ms;
}

/* -------------------- Render -------------------- */
function setLoading(loading){ state.loading = loading; render(); }
function setError(err){ state.error = err; render(); }

function render(){
  // Sync controls with state
  $('#q').value = state.q;
  $('#domain').value = state.domain;
  $('#standard').value = state.standard;
  $('#sensitivity').value = state.sensitivity;
  $('#freshness').value = state.freshness;

  const host = $('#results');
  if (!host) return;

  // Loading skeleton
  if (state.loading) {
    host.innerHTML = `
      <div class="card shadow-sm">
        <div class="card-body">
          <div class="row g-3">
            ${Array.from({length: state.page_size}).map(()=>`
              <div class="col-12 col-sm-6 col-xl-4">
                <div class="skeleton" style="height:140px"></div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
    return;
  }

  // Error states
  if (state.error) {
    const status = state.error.status || 0;
    const icon   = status===429 ? 'bi-hourglass-split' : status>=500 ? 'bi-x-octagon' : 'bi-wifi-off';
    const title  = status===429 ? 'Too many requests' : status>=500 ? 'Server error' : 'Network error';
    const help   = status===429 ? 'Please wait and try again.' : status>=500 ? 'Please try again later.' : 'Check your connection and retry.';
    host.innerHTML = `
      <div class="alert alert-danger d-flex align-items-start gap-2" role="alert">
        <i class="bi ${icon}" aria-hidden="true"></i>
        <div>
          <div class="fw-semibold">${title}${status ? ` (HTTP ${status})` : ''}</div>
          <div>${help}</div>
          <div class="mt-2">
            <button class="btn btn-sm btn-outline-light" id="retryBtn">Retry</button>
          </div>
        </div>
      </div>`;
    $('#retryBtn')?.addEventListener('click', ()=>refresh(true));
    return;
  }

  // Empty state
  if (!state.items || state.items.length === 0) {
    host.innerHTML = `
      <div class="card shadow-sm">
        <div class="card-body text-center text-body-secondary py-5">
          <i class="bi bi-search" aria-hidden="true"></i>
          <div class="mt-2">No datasets match your filters.</div>
          <div class="small">Try clearing filters or using a broader search.</div>
          <div class="mt-3">
            <button class="btn btn-sm btn-outline-secondary" id="clearFiltersBtn">Clear filters</button>
          </div>
        </div>
      </div>`;
    $('#clearFiltersBtn')?.addEventListener('click', ()=>{ state.domain=''; state.standard=''; state.sensitivity=''; state.freshness=''; state.q=''; writeURL(false); refresh(true); });
    return;
  }

  // Grid
  const cards = state.items.map(datasetCard).join('');
  const pager = paginationBar();
  host.innerHTML = `
    <div class="card shadow-sm">
      <div class="card-body">
        <div class="row g-3" id="cardGrid">
          ${cards}
        </div>
      </div>
      ${pager}
    </div>`;

  wirePager();
}

function datasetCard(it){
  const dq = Number(it.dq_score||0);
  const dqClass = dq>=90 ? 'good' : dq>=75 ? 'warning' : 'poor';
  const fresh = it.freshness_ts ? new Date(it.freshness_ts).toLocaleString() : '—';
  const sensChips = (it.sensitivity_tags||[]).map(tag=>`<span class="badge text-bg-light border">${escapeHtml(tag)}</span>`).join(' ') || '<span class="text-body-secondary">—</span>';
  const standard = it.standard || '—';
  const domain = it.domain || '—';
  const schema = it.schema_version || '—';

  return `
    <div class="col-12 col-sm-6 col-xl-4">
      <div class="card dataset-card h-100 shadow-sm">
        <div class="card-body d-flex flex-column">
          <div class="d-flex justify-content-between align-items-start">
            <h2 class="h6 mb-1">${escapeHtml(it.name)}</h2>
            <span class="badge badge-dq ${dqClass}" title="DQ score">${dq}</span>
          </div>
          <p class="small text-body-secondary mb-2">${escapeHtml(it.description||'')}</p>

          <div class="meta-kv">
            <div><span class="key">Freshness:</span> <span class="value">${escapeHtml(fresh)}</span></div>
            <div><span class="key">Standard:</span>  <span class="value">${escapeHtml(standard)}</span></div>
            <div><span class="key">Domain:</span>    <span class="value">${escapeHtml(domain)}</span></div>
            <div><span class="key">Schema:</span>    <span class="value">${escapeHtml(schema)}</span></div>
            <div class="d-flex align-items-center gap-1 flex-wrap mt-1">
              <span class="key">Sensitivity:</span> ${sensChips}
            </div>
          </div>

          <div class="mt-auto d-flex gap-2 pt-2">
            <a class="btn btn-primary btn-sm" href="./dataset-detail.html?dataset=${encodeURIComponent(it.dataset_key||it.name)}">Open</a>
            <a class="btn btn-outline-secondary btn-sm" href="./query-workbench.html?dataset=${encodeURIComponent(it.dataset_key||it.name)}">Query</a>
          </div>
        </div>
      </div>
    </div>`;
}

function paginationBar(){
  const prevDisabled = state.prev_token ? '' : 'disabled';
  const nextDisabled = state.next_token ? '' : 'disabled';
  const total = state.total_estimate!=null ? state.total_estimate : '—';
  return `
    <div class="card-footer pager">
      <div class="small text-body-secondary" aria-live="polite">Total (estimate): <strong>${escapeHtml(String(total))}</strong></div>
      <div class="d-flex align-items-center gap-2">
        <span class="page-token text-body-secondary">Prev: ${escapeHtml(state.prev_token || '—')}</span>
        <button class="btn btn-outline-secondary btn-sm" id="prevBtn" ${prevDisabled} aria-label="Previous page">‹ Prev</button>
        <button class="btn btn-outline-secondary btn-sm" id="nextBtn" ${nextDisabled} aria-label="Next page">Next ›</button>
        <span class="page-token text-body-secondary">Next: ${escapeHtml(state.next_token || '—')}</span>
      </div>
    </div>`;
}

function wirePager(){
  $('#prevBtn')?.addEventListener('click', ()=>{
    if (!state.prev_token) return;
    refresh(true, state.prev_token);
  });
  $('#nextBtn')?.addEventListener('click', ()=>{
    if (!state.next_token) return;
    refresh(true, state.next_token);
  });
}

/* -------------------- Utils -------------------- */
function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }

/* -------------------- Event wiring -------------------- */
function wireControls(){
  $('#q').addEventListener('input', debounce(ev=>{
    state.q = ev.target.value.trim();
    writeURL(false);
    refresh(true, null); // reset cursor on new search
  }, 250));

  $('#domain').addEventListener('change', ev=>{
    state.domain = ev.target.value;
    writeURL(false);
    refresh(true, null);
  });
  $('#standard').addEventListener('change', ev=>{
    state.standard = ev.target.value;
    writeURL(false);
    refresh(true, null);
  });
  $('#sensitivity').addEventListener('change', ev=>{
    state.sensitivity = ev.target.value;
    writeURL(false);
    refresh(true, null);
  });
  $('#freshness').addEventListener('change', ev=>{
    state.freshness = ev.target.value;
    writeURL(false);
    refresh(true, null);
  });
}

function debounce(fn, ms=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

/* -------------------- Refresh -------------------- */
async function refresh(showLoading=false, cursor=null){
  state.error = null;
  if (showLoading) setLoading(true);
  try {
    const payload = { 
      q:state.q, domain:state.domain, standard:state.standard,
      sensitivity:state.sensitivity, freshness:state.freshness,
      page_size: state.page_size, cursor
    };
    const data = API_BASE ? await fetchPageFromAPI(payload) : await fetchPageLocal(payload);
    state.items = data.items || [];
    state.next_token = data.next_token || null;
    state.prev_token = data.prev_token || null;
    state.total_estimate = data.total_estimate ?? null;
  } catch (err){
    setError(err);
    return;
  } finally {
    setLoading(false);
  }
}

/* -------------------- Boot -------------------- */
readURL();
document.addEventListener('DOMContentLoaded', ()=>{
  // Read global search from header (?q= already handled in readURL)
  // Sync inputs to state then wire
  wireControls();
  refresh(true);
});
