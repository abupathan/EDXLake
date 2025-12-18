/* EDX — Subscriptions (Data Consumer)
 * Adds:
 * - Event subscriptions: dataset.published, dq.failed
 * - Schedules for events (cadence window) + rate-limit guidance
 * - Purpose capture for auto-exports (required when enabled)
 * - Pause/Resume (kept) + Delivery channel test
 * Keeps:
 * - CSP-safe partials injection, filters, sort, pagination, modals, favorites, toasts
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const main = $('#app-main');

const DATA_URL = './subscriptions.json';
const PARTIALS = {
  header: '../../partials/header.html',
  sidebar: '../../partials/sidebar-consumer.html',
  footer: '../../partials/footer.html'
};

const state = {
  q: '',
  cadence: '',
  dest: '',
  status: '',
  type: '',
  evt: '',           // filter by event type (for Event subs)
  sort: { key: 'last_sent', dir: 'desc' }, // last_sent|name|type|cadence|status|delivery|event
  page: 1,
  size: 10,
  list: [],
  cadences: [],
  destinations: [],
  types: ['Report','Dashboard','Saved Query','Event'],
  events: ['dataset.published','dq.failed'],
  datasets: [],      // for event subscriptions + purpose capture
  favs: new Set()
};

function debounce(fn, ms=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function normalize(v){ return String(v||'').toLowerCase(); }
function cmp(a,b){ return a<b?-1:a>b?1:0; }
function toTimeKey(s){ const t = Date.parse(s); return isNaN(t)?0:t; }

/* ---------- Partials (explicit paths; CSP-safe + sanitize) ---------- */
function sanitizeNoScripts(html){
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}
async function mountShell(){
  try{
    const [h,s,f] = await Promise.all([
      fetch(PARTIALS.header), fetch(PARTIALS.sidebar), fetch(PARTIALS.footer)
    ]);
    if (h.ok) $('#app-header').innerHTML  = sanitizeNoScripts(await h.text());
    if (s.ok) $('#app-sidebar').innerHTML = sanitizeNoScripts(await s.text());
    if (f.ok) $('#app-footer').innerHTML  = sanitizeNoScripts(await f.text());
  }catch(e){
    console.warn('[EDX] Partials load warning', e);
  }
}

/* ---------- URL State ---------- */
function readURL(){
  const sp = new URLSearchParams(location.search);
  state.q = sp.get('q') || '';
  state.cadence = sp.get('cadence') || '';
  state.dest = sp.get('dest') || '';
  state.status = sp.get('status') || '';
  state.type = sp.get('type') || '';
  state.evt = sp.get('event') || '';
  const sort = sp.get('sort') || 'last_sent:desc';
  const [k,d] = sort.split(':'); state.sort = { key:k, dir:(d==='asc'?'asc':'desc') };
  state.page = Math.max(1, parseInt(sp.get('page')||'1',10));
  state.size = Math.min(100, Math.max(5, parseInt(sp.get('size')||'10',10)));
}
function writeURL(replace=true){
  const sp = new URLSearchParams();
  if (state.q) sp.set('q', state.q);
  if (state.cadence) sp.set('cadence', state.cadence);
  if (state.dest) sp.set('dest', state.dest);
  if (state.status) sp.set('status', state.status);
  if (state.type) sp.set('type', state.type);
  if (state.evt) sp.set('event', state.evt);
  const sort=`${state.sort.key}:${state.sort.dir}`; if (sort!=='last_sent:desc') sp.set('sort',sort);
  if (state.page>1) sp.set('page', String(state.page));
  if (state.size!==10) sp.set('size', String(state.size));
  const url = `${location.pathname}?${sp.toString()}`;
  replace ? history.replaceState(null,'',url) : history.pushState(null,'',url);
}

/* ---------- Data Load ---------- */
async function load(){
  renderSkeleton();
  try{
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    state.list = (d.subscriptions||[]).map(x=>({ id: cssId(x.name), ...x }));
    state.cadences = d.cadences || [];
    state.destinations = d.destinations || [];
    state.datasets = d.datasets || [];     // NEW: allow-listed datasets for event auto-exports
    state.events = d.events || state.events;
  }catch(e){
    console.error('[EDX] subscriptions load failed', e);
    main.innerHTML = `<div class="alert alert-danger">Failed to load subscriptions.</div>`;
    return;
  }
  try { state.favs = new Set(JSON.parse(localStorage.getItem('edx:fav-subs')||'[]')); } catch {}
  render();
}

/* ---------- Render ---------- */
function renderSkeleton(){
  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 toolbar">
      <h1 class="h4 mb-0">Subscriptions</h1>
      <div class="d-flex gap-2">
        <div class="skeleton w-260 h-38"></div>
        <div class="skeleton w-200 h-38"></div>
        <div class="skeleton w-200 h-38"></div>
        <div class="skeleton w-200 h-38"></div>
        <div class="skeleton w-200 h-38"></div>
      </div>
    </div>
    <div class="card shadow-sm"><div class="card-body">
      ${Array.from({length:8}).map(()=>`<div class="skeleton mb-2"></div>`).join('')}
    </div></div>`;
}

function render(){
  const toolbar = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 toolbar">
      <h1 class="h4 mb-0">Subscriptions</h1>
      <div class="d-flex gap-2 flex-wrap" role="search" aria-label="Filter subscriptions">
        <input id="q" class="form-control form-control-sm" placeholder="Search name/type/cadence/event…" value="${escapeAttr(state.q)}">
        <select id="cadence" class="form-select form-select-sm narrow">
          <option value="">All cadences</option>
          ${state.cadences.map(c=>`<option value="${escapeAttr(c)}" ${state.cadence===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}
        </select>
        <select id="dest" class="form-select form-select-sm narrow">
          <option value="">All delivery</option>
          ${state.destinations.map(d=>`<option value="${escapeAttr(d)}" ${state.dest===d?'selected':''}>${escapeHtml(d)}</option>`).join('')}
        </select>
        <select id="status" class="form-select form-select-sm narrow">
          ${['','Active','Paused'].map(s=>`<option value="${s}">${s||'All status'}</option>`).join('').replace(`value="${state.status}"`, `value="${state.status}" selected`)}
        </select>
        <select id="type" class="form-select form-select-sm narrow">
          <option value="">All types</option>
          ${state.types.map(t=>`<option value="${escapeAttr(t)}" ${state.type===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}
        </select>
        <select id="evt" class="form-select form-select-sm narrow" title="Event type filter">
          <option value="">All events</option>
          ${state.events.map(e=>`<option value="${escapeAttr(e)}" ${state.evt===e?'selected':''}>${escapeHtml(e)}</option>`).join('')}
        </select>
        <select id="sort" class="form-select form-select-sm narrow" title="Sort">
          ${[
            ['last_sent:desc','Last Sent (new→old)'],
            ['last_sent:asc','Last Sent (old→new)'],
            ['name:asc','Name (A→Z)'],
            ['name:desc','Name (Z→A)'],
            ['type:asc','Type (A→Z)'],
            ['type:desc','Type (Z→A)'],
            ['cadence:asc','Cadence (A→Z)'],
            ['cadence:desc','Cadence (Z→A)'],
            ['status:asc','Status (A→Z)'],
            ['status:desc','Status (Z→A)'],
            ['event:asc','Event (A→Z)'],
            ['event:desc','Event (Z→A)']
          ].map(([v,l])=>`<option value="${v}" ${v===`${state.sort.key}:${state.sort.dir}`?'selected':''}>${l}</option>`).join('')}
        </select>
        <button id="btnNew" class="btn btn-primary btn-sm">
          <i class="bi bi-plus-lg" aria-hidden="true"></i> New Subscription
        </button>
      </div>
    </div>`;

  const filtered = filterList();
  const sorted   = sortList(filtered);
  const page     = paginate(sorted, state.page, state.size);

  const table = `
    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              ${th('name','Name')}
              ${th('type','Type')}
              ${th('event','Event')}
              ${th('dataset','Dataset')}
              ${th('purpose','Purpose')}
              ${th('cadence','Cadence')}
              ${th('delivery','Delivery')}
              ${th('status','Status')}
              ${th('last_sent','Last Sent')}
              <th class="text-end" scope="col" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody id="rows">
            ${rowsHtml(page.slice) || `<tr><td colspan="10" class="text-center text-body-secondary py-4">No subscriptions found.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${pager(page)}
    </div>`;

  main.innerHTML = `${toolbar}${table}${modals()}${toasts()}`;

  wireToolbar();
  wireSort();
  wirePager(page.pages);
  wireRowActions();
}

function th(key, label){
  const aria = state.sort.key===key ? (state.sort.dir==='asc'?'ascending':'descending') : 'none';
  const ind  = `<i class="bi bi-caret-down-fill sort-ind" aria-hidden="true"></i>`;
  return `<th scope="col" class="sortable" data-key="${key}" aria-sort="${aria}" title="Sort by ${escapeAttr(label)}">${escapeHtml(label)} ${ind}</th>`;
}

function badgeDest(x){ return `<span class="badge rounded-pill badge-dest me-1">${escapeHtml(x)}</span>`; }
function badgeEvt(x){ return x ? `<span class="badge rounded-pill badge-evt me-1">${escapeHtml(x)}</span>` : ''; }

function rowsHtml(list){
  return list.map(s=>{
    const fav = state.favs.has(s.id);
    const paused = s.status === 'Paused';
    return `
      <tr data-id="${s.id}">
        <td class="fw-semibold">
          <button class="btn btn-link btn-sm p-0" data-action="open" title="Open details">${escapeHtml(s.name)}</button>
        </td>
        <td>${escapeHtml(s.type)}</td>
        <td>${badgeEvt(s.event||'')}</td>
        <td>${escapeHtml(s.dataset||'—')}</td>
        <td>${escapeHtml(s.purpose||'—')}</td>
        <td class="text-nowrap">${escapeHtml(s.cadence||'—')}</td>
        <td class="text-nowrap">${(s.delivery||[]).map(badgeDest).join('')}</td>
        <td class="text-nowrap">${escapeHtml(s.status)}</td>
        <td class="text-nowrap" data-sort="${toTimeKey(s.last_sent)}">${escapeHtml(s.last_sent||'—')}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm" role="group" aria-label="Actions for ${escapeAttr(s.name)}">
            <button class="btn btn-outline-secondary" data-action="test">Send Test</button>
            <button class="btn btn-outline-secondary" data-action="${paused?'resume':'pause'}">${paused?'Resume':'Pause'}</button>
            <button class="btn btn-outline-secondary" data-action="edit">Edit</button>
            <button class="btn btn-outline-secondary" data-action="share">Share</button>
            <button class="btn btn-outline-danger" data-action="del">Delete</button>
            <button class="btn btn-outline-warning btn-fav" data-action="fav" aria-pressed="${fav}" title="Favorite">
              <i class="bi ${fav?'bi-star-fill':'bi-star'}" aria-hidden="true"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

/* ---------- Pager ---------- */
function pager(pg){
  return `
    <div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div class="small text-body-secondary" aria-live="polite">
        Showing <strong>${pg.total ? (pg.start+1) : 0}</strong>–<strong>${pg.end}</strong> of <strong>${pg.total}</strong>
      </div>
      <div class="pagination-wrap" data-paginate>
        <div class="d-flex align-items-center gap-2">
          <label class="small me-1" for="pageSize">Rows</label>
          <select id="pageSize" class="form-select form-select-sm" aria-label="Rows per page">
            ${[10,20,50,100].map(n=>`<option value="${n}" ${n===state.size?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-outline-secondary btn-sm" data-first ${pg.page===1?'disabled':''} aria-label="First page">«</button>
        <button class="btn btn-outline-secondary btn-sm" data-prev  ${pg.page===1?'disabled':''} aria-label="Previous page">‹</button>
        <span class="small">Page</span>
        <input class="form-control form-control-sm page-input" type="number" min="1" max="${pg.pages}" value="${pg.page}" aria-label="Current page">
        <span class="small">of ${pg.pages}</span>
        <button class="btn btn-outline-secondary btn-sm" data-next ${pg.page===pg.pages?'disabled':''} aria-label="Next page">›</button>
        <button class="btn btn-outline-secondary btn-sm" data-last ${pg.page===pg.pages?'disabled':''} aria-label="Last page">»</button>
      </div>
    </div>`;
}

/* ---------- Filters / Sort / Paging ---------- */
function filterList(){
  const term = normalize(state.q);
  return state.list.filter(s=>{
    const hit = !term || normalize(s.name).includes(term) || normalize(s.type).includes(term) ||
                normalize(s.cadence||'').includes(term) || normalize((s.delivery||[]).join(' ')).includes(term) ||
                normalize(s.event||'').includes(term) || normalize(s.dataset||'').includes(term) ||
                normalize(s.purpose||'').includes(term);
    const cadOk  = !state.cadence || s.cadence===state.cadence;
    const dstOk  = !state.dest || (s.delivery||[]).includes(state.dest);
    const stOk   = !state.status || s.status===state.status;
    const typOk  = !state.type || s.type===state.type;
    const evtOk  = !state.evt || (s.event||'')===state.evt;
    return hit && cadOk && dstOk && stOk && typOk && evtOk;
  });
}
function sortList(list){
  const { key, dir } = state.sort; const m = dir==='asc'?1:-1;
  return list.slice().sort((a,b)=>{
    let va, vb;
    if (key==='last_sent'){ va=toTimeKey(a.last_sent||''); vb=toTimeKey(b.last_sent||''); }
    else if (key==='name'){ va=normalize(a.name); vb=normalize(b.name); }
    else if (key==='type'){ va=normalize(a.type); vb=normalize(b.type); }
    else if (key==='cadence'){ va=normalize(a.cadence||''); vb=normalize(b.cadence||''); }
    else if (key==='status'){ va=normalize(a.status); vb=normalize(b.status); }
    else if (key==='delivery'){ va=(a.delivery||[]).join(' '); vb=(b.delivery||[]).join(' '); }
    else if (key==='event'){ va=normalize(a.event||''); vb=normalize(b.event||''); }
    return m * cmp(va,vb);
  });
}
function paginate(arr, page, size){
  const total = arr.length;
  const pages = Math.max(1, Math.ceil(total/size));
  const p = Math.min(Math.max(1,page), pages);
  const start = (p-1)*size, end = Math.min(total, start+size);
  return { total, pages, page:p, start, end, slice: arr.slice(start,end) };
}

/* ---------- Interactions ---------- */
function wireToolbar(){
  $('#q')?.addEventListener('input', debounce(()=>{ state.q=$('#q').value; state.page=1; writeURL(); render(); }));
  $('#cadence')?.addEventListener('change', ()=>{ state.cadence=$('#cadence').value; state.page=1; writeURL(); render(); });
  $('#dest')?.addEventListener('change', ()=>{ state.dest=$('#dest').value; state.page=1; writeURL(); render(); });
  $('#status')?.addEventListener('change', ()=>{ state.status=$('#status').value; state.page=1; writeURL(); render(); });
  $('#type')?.addEventListener('change', ()=>{ state.type=$('#type').value; state.page=1; writeURL(); render(); });
  $('#evt')?.addEventListener('change', ()=>{ state.evt=$('#evt').value; state.page=1; writeURL(); render(); });
  $('#sort')?.addEventListener('change', ()=>{ const [k,d] = $('#sort').value.split(':'); state.sort={key:k,dir:d}; state.page=1; writeURL(); render(); });
  $('#btnNew')?.addEventListener('click', ()=> openEditor({
    id: '', name: 'New Subscription', type: state.types[0], cadence: state.cadences[0]||'Daily 07:00',
    delivery: [state.destinations[0]||'Email'], status:'Active', last_sent: '', event:'', dataset:'', purpose:'', auto_export:false
  }));
}
function wireSort(){
  $$('.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.key;
      if (state.sort.key===key) state.sort.dir = state.sort.dir==='asc'?'desc':'asc';
      else state.sort = { key, dir: key==='name'?'asc':'desc' };
      state.page=1; writeURL(); render();
    });
  });
}
function wirePager(pages){
  const host = $('[data-paginate]');
  host?.querySelector('[data-first]')?.addEventListener('click', ()=>{ state.page=1; writeURL(); render(); });
  host?.querySelector('[data-prev]') ?.addEventListener('click', ()=>{ state.page=Math.max(1,state.page-1); writeURL(); render(); });
  host?.querySelector('[data-next]') ?.addEventListener('click', ()=>{ state.page=Math.min(pages,state.page+1); writeURL(); render(); });
  host?.querySelector('[data-last]') ?.addEventListener('click', ()=>{ state.page=pages; writeURL(); render(); });
  host?.querySelector('input[type="number"]')?.addEventListener('change', (e)=>{ const v=Math.min(pages,Math.max(1,parseInt(e.target.value||'1',10))); state.page=v; writeURL(); render(); });
  $('#pageSize')?.addEventListener('change', (e)=>{ state.size=parseInt(e.target.value,10)||10; state.page=1; writeURL(); render(); });
}
function wireRowActions(){
  $('#rows')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const tr = e.target.closest('tr[data-id]'); const id = tr?.dataset.id;
    const s  = state.list.find(x=>x.id===id); if(!s) return;

    const act = btn.dataset.action;
    if (act==='test'){ simulateDeliveryTest(s); return; }
    if (act==='pause'){ s.status='Paused'; render(); showToast('Subscription paused.'); return; }
    if (act==='resume'){ s.status='Active'; render(); showToast('Subscription resumed.'); return; }
    if (act==='edit'){ openEditor(s); return; }
    if (act==='share'){ openShare(s); return; }
    if (act==='del'){ if(confirm(`Delete "${s.name}"?`)){ state.list = state.list.filter(x=>x.id!==id); render(); showToast('Subscription deleted.'); } return; }
    if (act==='fav'){ toggleFav(s, btn); return; }
    if (act==='open'){ openEditor(s); return; }
  });
}

/* ---------- Editor Modal (supports Event type + auto-export) ---------- */
function openEditor(s){
  $('#editName').value = s.name||'';
  $('#editType').innerHTML = state.types.map(t=>`<option value="${escapeAttr(t)}" ${s.type===t?'selected':''}>${escapeHtml(t)}</option>`).join('');
  $('#editCadence').innerHTML = state.cadences.map(c=>`<option value="${escapeAttr(c)}" ${s.cadence===c?'selected':''}>${escapeHtml(c)}</option>`).join('');
  $('#editStatus').value = s.status||'Active';

  // destinations
  $('#editDest').innerHTML = state.destinations.map(d=>{
    const sel = (s.delivery||[]).includes(d) ? 'checked' : '';
    return `<div class="form-check form-check-inline">
      <input class="form-check-input" type="checkbox" id="dest_${cssId(d)}" value="${escapeAttr(d)}" ${sel}>
      <label class="form-check-label" for="dest_${cssId(d)}">${escapeHtml(d)}</label>
    </div>`;
  }).join('');

  // event section
  $('#editEvent').innerHTML = state.events.map(ev=>`<option value="${escapeAttr(ev)}" ${s.event===ev?'selected':''}>${escapeHtml(ev)}</option>`).join('');
  $('#editDataset').innerHTML = state.datasets.map(ds=>`<option value="${escapeAttr(ds.key)}" ${s.dataset===ds.key?'selected':''}>${escapeHtml(ds.display_name||ds.key)}</option>`).join('');
  $('#editPurpose').innerHTML = (s.purposes || ['Operational','Research','Compliance','Accountability / Reporting'])
    .map(p=>`<option value="${escapeAttr(p)}" ${s.purpose===p?'selected':''}>${escapeHtml(p)}</option>`).join('');

  // auto-export toggle
  $('#autoExport').checked = !!s.auto_export;

  // conditional visibility
  function reflectType(){
    const isEvent = $('#editType').value === 'Event';
    $('[data-type-event]').classList.toggle('d-none', !isEvent);
    // purpose required only if auto-export checked
    $('#editPurpose').toggleAttribute('required', isEvent && $('#autoExport').checked);
    computeRateHint();
  }
  $('#editType').addEventListener('change', reflectType);
  $('#autoExport').addEventListener('change', ()=>{ $('#editPurpose').toggleAttribute('required', $('#autoExport').checked); computeRateHint(); });
  $('#editCadence').addEventListener('change', computeRateHint);
  $$('#editDest input[type="checkbox"]').forEach(cb => cb.addEventListener('change', computeRateHint));
  reflectType();

  const m = new bootstrap.Modal($('#editModal'));
  $('#saveEdit').onclick = ()=>{
    const name = $('#editName').value.trim();
    const type = $('#editType').value;
    const cadence = $('#editCadence').value;
    const delivery = Array.from($$('#editDest input[type="checkbox"]:checked')).map(i=>i.value);
    const status = $('#editStatus').value;
    const eventType = $('#editEvent').value || '';
    const dataset = $('#editDataset').value || '';
    const auto_export = $('#autoExport').checked;
    const purpose = $('#editPurpose').value || '';

    if (!name){ showToast('Name is required.'); return; }
    if (!delivery.length){ showToast('Select at least one destination.'); return; }
    if (type==='Event' && !eventType){ showToast('Select an event type.'); return; }
    if (type==='Event' && !dataset){ showToast('Select a dataset.'); return; }
    if (type==='Event' && auto_export && !purpose){ showToast('Purpose is required for auto-exports.'); return; }

    const payload = { ...s, id: s.id || cssId(name), name, type, cadence, delivery, status,
      event: type==='Event' ? eventType : '', dataset: type==='Event' ? dataset : '',
      auto_export: type==='Event' ? auto_export : false, purpose: type==='Event' && auto_export ? purpose : (s.purpose||'')
    };
    const idx = state.list.findIndex(x=>x.id===s.id);
    if (idx>=0) state.list[idx] = payload; else state.list.unshift(payload);
    m.hide(); render(); showToast('Saved.');
  };
  m.show();
}

/* ---------- Rate-limit guidance & delivery test ---------- */
function computeRateHint(){
  const cadence = $('#editCadence').value;
  const dests = Array.from($$('#editDest input[type="checkbox"]:checked')).map(i=>i.value);
  const autoExport = $('#autoExport').checked;
  let msg = '';
  if (cadence==='Hourly' && dests.includes('Email')) {
    msg = 'Hourly email may be rate-limited by your mail provider. Consider In-App or Webhook.';
  } else if (cadence==='Hourly' && dests.includes('Webhook')) {
    msg = 'Ensure your endpoint can handle bursts and implements 429 backoff.';
  } else if (autoExport && dests.includes('Email') && cadence.startsWith('Weekly')) {
    msg = 'Large auto-exports via email can exceed attachment limits; prefer Webhook or In-App.';
  }
  $('#rateHint').textContent = msg || ' ';
}

function simulateDeliveryTest(s){
  // Simulate a success/failure based on delivery type mix
  const ok = (s.delivery||[]).includes('In-App') || (s.delivery||[]).includes('Email');
  showToast(ok ? 'Test sent successfully.' : 'Test queued. Check webhook endpoint.');
}

/* ---------- Share / Favorites / Toast ---------- */
function openShare(s){
  const m = new bootstrap.Modal($('#shareModal'));
  $('#shareLbl').textContent = `Share: ${s.name}`;
  $('#shareLink').value = `${location.origin}/subscriptions/${encodeURIComponent(s.id)}`;
  $('#copyShare').onclick = async ()=>{
    try{ await navigator.clipboard.writeText($('#shareLink').value); showToast('Link copied.'); m.hide(); }
    catch{ showToast('Copy failed.'); }
  };
  m.show();
}
function toggleFav(s, btn){
  const pressed = btn.getAttribute('aria-pressed')==='true';
  btn.setAttribute('aria-pressed', String(!pressed));
  btn.querySelector('.bi').className = 'bi ' + (!pressed ? 'bi-star-fill' : 'bi-star');
  if (!pressed) state.favs.add(s.id); else state.favs.delete(s.id);
  try { localStorage.setItem('edx:fav-subs', JSON.stringify(Array.from(state.favs))); } catch {}
}
function toasts(){
  return `
    <div class="toast-container position-fixed bottom-0 end-0 p-3">
      <div id="toast" class="toast text-bg-success border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div id="toastMsg" class="toast-body">Done</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>
    </div>`;
}
function showToast(msg){
  $('#toastMsg').textContent = msg;
  new bootstrap.Toast($('#toast'), { delay: 1500 }).show();
}

/* ---------- Modals Markup ---------- */
function modals(){
  return `
  <div class="modal fade" id="editModal" tabindex="-1" aria-labelledby="editLbl" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header">
        <h1 class="modal-title fs-6" id="editLbl">Subscription</h1>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label for="editName" class="form-label">Name</label>
          <input id="editName" class="form-control" required>
        </div>
        <div class="row g-3">
          <div class="col-md-3">
            <label for="editType" class="form-label">Type</label>
            <select id="editType" class="form-select"></select>
          </div>
          <div class="col-md-3">
            <label for="editCadence" class="form-label">Cadence / Schedule</label>
            <select id="editCadence" class="form-select"></select>
            <div id="rateHint" class="form-text rate-hint help-muted mt-1"> </div>
          </div>
          <div class="col-md-3">
            <label for="editStatus" class="form-label">Status</label>
            <select id="editStatus" class="form-select">
              <option>Active</option>
              <option>Paused</option>
            </select>
          </div>
          <div class="col-md-3">
            <div class="form-label">Delivery</div>
            <div id="editDest" class="d-flex flex-wrap gap-2"></div>
          </div>
        </div>

        <div class="mt-3 d-none" data-type-event>
          <div class="row g-3">
            <div class="col-md-4">
              <label for="editEvent" class="form-label">Event</label>
              <select id="editEvent" class="form-select"></select>
              <div class="form-text">Supported: dataset.published, dq.failed</div>
            </div>
            <div class="col-md-4">
              <label for="editDataset" class="form-label">Dataset</label>
              <select id="editDataset" class="form-select"></select>
            </div>
            <div class="col-md-4">
              <div class="form-check mt-4">
                <input id="autoExport" class="form-check-input" type="checkbox">
                <label class="form-check-label" for="autoExport">Auto-export on event</label>
              </div>
              <label for="editPurpose" class="form-label mt-2">Purpose (required when auto-export)</label>
              <select id="editPurpose" class="form-select"></select>
            </div>
          </div>
        </div>

        <div class="mt-3">
          <div id="testResult" class="small help-muted" aria-live="polite"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
        <button id="saveEdit" class="btn btn-primary">Save</button>
      </div>
    </div></div>
  </div>

  <div class="modal fade" id="shareModal" tabindex="-1" aria-labelledby="shareLbl" aria-hidden="true">
    <div class="modal-dialog"><div class="modal-content">
      <div class="modal-header">
        <h1 class="modal-title fs-6" id="shareLbl">Share subscription</h1>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <label for="shareLink" class="form-label">Link</label>
        <input id="shareLink" class="form-control" readonly>
        <div class="form-text">Copy this link to share with users who have access.</div>
      </div>
      <div class="modal-footer">
        <button id="copyShare" class="btn btn-primary">Copy link</button>
      </div>
    </div></div>
  </div>`;
}

/* ---------- Helpers ---------- */
function cssId(v){ return String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-'); }
function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }
function escapeAttr(v){ return escapeHtml(v).replace(/"/g,'&quot;'); }

/* ---------- Boot ---------- */
readURL();
await mountShell();
await load();
