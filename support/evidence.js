/* EDX — Evidence Page
 * - CSP-safe (no inline scripts/styles)
 * - Mounts header/footer partials (sanitized to strip <script> blocks)
 * - Sticky TOC builder
 * - Search, filter, sort, and paginate Evidence Packs table
 * - Details modal & (demo) download handler
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const PARTIALS = {
  header: '../../partials/header.html',
  footer: '../../partials/footer.html'
};

/* ---------- Partials (sanitize to avoid CSP inline-script violations) ---------- */
function sanitizeNoScripts(html){
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}
async function mountShell(){
  try{
    const [h,f] = await Promise.all([ fetch(PARTIALS.header), fetch(PARTIALS.footer) ]);
    if (h.ok) $('#app-header').innerHTML = sanitizeNoScripts(await h.text());
    if (f.ok) $('#app-footer').innerHTML = sanitizeNoScripts(await f.text());
  }catch(e){
    console.warn('[EDX] Partials load warning', e);
  }
}

/* ---------- Table of Contents ---------- */
function buildTOC(){
  const toc = $('#toc-list');
  toc.innerHTML = '';
  const headings = $$('#evidence-main h2');
  headings.forEach((h2, i) => {
    if (!h2.id) h2.id = `sec-${i+1}`;
    const li = document.createElement('li');
    li.className = 'mb-2';
    li.innerHTML = `<a class="link-body-emphasis text-decoration-none" href="#${h2.id}">${h2.textContent}</a>`;
    toc.appendChild(li);
  });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const id = entry.target.id;
      const link = toc.querySelector(`a[href="#${id}"]`)?.parentElement;
      if (entry.isIntersecting) {
        toc.querySelectorAll('li').forEach(li => li.classList.remove('active'));
        link?.classList.add('active');
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px', threshold: 0.1 });
  headings.forEach(h2 => observer.observe(h2));
}

/* ---------- Evidence Packs: filter/sort/paginate ---------- */
const state = {
  q: '',
  type: '',
  status: '',
  from: '',
  to: '',
  sort: 'time:desc',
  page: 1,
  size: 5,
  rows: []
};

function readRows(){
  state.rows = $$('#packs-table tbody tr').map(tr => ({
    node: tr,
    id: tr.cells[0].textContent.trim(),
    type: tr.querySelector('[data-type]')?.dataset.type || tr.cells[1].textContent.trim(),
    scope: tr.cells[2].textContent.trim(),
    requester: tr.cells[3].textContent.trim(),
    timeISO: tr.querySelector('[data-time]')?.dataset.time || '',
    status: tr.cells[5].textContent.trim()
  }));
}

function normalize(v){ return String(v||'').toLowerCase(); }
function inRange(ts, from, to){
  if (!ts) return false;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return false;
  if (from && t < Date.parse(from)) return false;
  if (to && t > (Date.parse(to) + (24*60*60*1000) - 1)) return false; // inclusive end date
  return true;
}

function filterRows(){
  const q = normalize(state.q);
  return state.rows.filter(r => {
    const hit = !q ||
      normalize(r.id).includes(q) ||
      normalize(r.type).includes(q) ||
      normalize(r.scope).includes(q) ||
      normalize(r.requester).includes(q);
    const tOk = !state.type || r.type === state.type;
    const sOk = !state.status || r.status === state.status;
    const dOk = (!state.from && !state.to) || inRange(r.timeISO, state.from, state.to);
    return hit && tOk && sOk && dOk;
  });
}

function sortRows(list){
  const [key,dir] = state.sort.split(':');
  const m = dir==='asc'?1:-1;
  return list.slice().sort((a,b) => {
    let va, vb;
    if (key === 'time'){ va = Date.parse(a.timeISO)||0; vb = Date.parse(b.timeISO)||0; }
    else if (key === 'type'){ va = normalize(a.type); vb = normalize(b.type); }
    else if (key === 'status'){ va = normalize(a.status); vb = normalize(b.status); }
    else { va = normalize(a.id); vb = normalize(b.id); }
    return m * (va < vb ? -1 : va > vb ? 1 : 0);
  });
}

function paginate(list){
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total/state.size));
  const page  = Math.min(Math.max(1, state.page), pages);
  const start = (page-1)*state.size;
  const end   = Math.min(total, start + state.size);
  return { total, pages, page, start, end, slice: list.slice(start,end) };
}

function renderTable(){
  const body = $('#packs-table tbody');
  // hide all
  state.rows.forEach(r => { r.node.style.display = 'none'; });
  // filter/sort/paginate
  const filtered = filterRows();
  const sorted   = sortRows(filtered);
  const page     = paginate(sorted);
  page.slice.forEach(r => { r.node.style.display = ''; });

  // counts + controls
  $('#packs-page').value = String(page.page);
  $('#packs-pages-label').textContent = `of ${page.pages}`;
  $('#packs-count').textContent = page.total
    ? `Showing ${page.start+1}–${page.end} of ${page.total}`
    : 'No evidence packs';
  const host = document.querySelector('[data-paginate-packs]');
  host.querySelector('[data-first]').disabled = page.page === 1;
  host.querySelector('[data-prev]').disabled  = page.page === 1;
  host.querySelector('[data-next]').disabled  = page.page === page.pages;
  host.querySelector('[data-last]').disabled  = page.page === page.pages;
}

/* ---------- Wire toolbar + pager + row actions ---------- */
function wireUI(){
  $('#q').addEventListener('input',  e => { state.q = e.target.value; state.page=1; renderTable(); });
  $('#type').addEventListener('change', e => { state.type = e.target.value; state.page=1; renderTable(); });
  $('#status').addEventListener('change', e => { state.status = e.target.value; state.page=1; renderTable(); });
  $('#dateFrom').addEventListener('change', e => { state.from = e.target.value; state.page=1; renderTable(); });
  $('#dateTo').addEventListener('change',   e => { state.to   = e.target.value; state.page=1; renderTable(); });
  $('#sort').addEventListener('change',     e => { state.sort = e.target.value; state.page=1; renderTable(); });

  $('#packs-size').addEventListener('change', e => { state.size = parseInt(e.target.value,10)||5; state.page=1; renderTable(); });
  $('#packs-page').addEventListener('change', e => {
    const pages = Math.max(1, Math.ceil(filterRows().length/state.size));
    const v = Math.min(pages, Math.max(1, parseInt(e.target.value||'1',10)));
    state.page = v; renderTable();
  });
  const host = document.querySelector('[data-paginate-packs]');
  host.querySelector('[data-first]').addEventListener('click', () => { state.page=1; renderTable(); });
  host.querySelector('[data-prev]').addEventListener('click',  () => { state.page=Math.max(1,state.page-1); renderTable(); });
  host.querySelector('[data-next]').addEventListener('click',  () => {
    const pages = Math.max(1, Math.ceil(filterRows().length/state.size));
    state.page=Math.min(pages,state.page+1); renderTable();
  });
  host.querySelector('[data-last]').addEventListener('click',  () => {
    const pages = Math.max(1, Math.ceil(filterRows().length/state.size));
    state.page=pages; renderTable();
  });

  // Row actions (demo)
  $('#packs-table tbody').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-open], a[data-dl]');
    if (!a) return;
    e.preventDefault();
    const id = a.dataset.open || a.dataset.dl;
    if (a.dataset.open){
      openDetails(id);
    } else if (a.dataset.dl){
      // demo only — in app, navigate to a signed download URL
      alert(`Downloading evidence pack: ${id}\n(Replace alert with navigation to signed URL)`);
    }
  });
}

/* ---------- Details modal (Bootstrap) ---------- */
function ensureModal(){
  if ($('#evidenceModal')) return;
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="modal fade" id="evidenceModal" tabindex="-1" aria-labelledby="evidenceLbl" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h1 class="modal-title fs-6" id="evidenceLbl">Evidence Pack</h1>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <dl class="row mb-0" id="evidenceBody"></dl>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div.firstElementChild);
}
function openDetails(id){
  ensureModal();
  const row = state.rows.find(r => r.id === id);
  if (!row) return;
  const dl = $('#evidenceBody');
  dl.innerHTML = `
    <dt class="col-sm-3">ID</dt><dd class="col-sm-9">${row.id}</dd>
    <dt class="col-sm-3">Action</dt><dd class="col-sm-9">${row.type}</dd>
    <dt class="col-sm-3">Scope</dt><dd class="col-sm-9">${row.scope}</dd>
    <dt class="col-sm-3">Requester</dt><dd class="col-sm-9">${row.requester}</dd>
    <dt class="col-sm-3">Time (UTC)</dt><dd class="col-sm-9">${new Date(row.timeISO||'').toISOString()}</dd>
    <dt class="col-sm-3">Status</dt><dd class="col-sm-9">${row.status}</dd>
    <dt class="col-sm-3">Artifacts</dt><dd class="col-sm-9">
      <ul class="mb-0">
        <li>manifest.json (signed)</li>
        <li>counts.csv (pre/post)</li>
        <li>lineage.json</li>
        <li>logs.ndjson</li>
      </ul>
    </dd>`;
  const m = new bootstrap.Modal($('#evidenceModal')); m.show();
}

/* ---------- Boot ---------- */
await mountShell();
buildTOC();
readRows();
wireUI();
renderTable();
