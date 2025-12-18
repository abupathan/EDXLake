/* Steward Landing (production-ready)
 * - Injects KPIs, quick tiles, and a paginated "My Steward Tasks" table
 * - No inline JS; works with partials-loader auto-boot
 * - Accessible controls; cursor-style pagination on in-memory demo data
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

async function main(){
  // Ensure shared partials & auth are live; loader autoboosts, but double-safety:
  if (!window.EDXPartials) {
    console.warn("[EDX] partials loader not present yet; continuing (it defers and auto-boots).");
  }

  // Fetch page data (robust to errors)
  let data;
  try {
    const res = await fetch('landing.json', { cache: 'no-store' });
    data = await res.json();
  } catch {
    data = { kpis: [], sections: [], tasks: { items: [], pageSize: 10 } };
  }

  render(data);
  wirePagination(data.tasks);
}

function render(d){
  $('#app-main').innerHTML = [
    headerBlock(),
    kpiBlock(d.kpis||[]),
    tilesBlock(d.sections||[]),
    tasksBlock(d.tasks||{ items: [], pageSize: 10 })
  ].join('');
}

function headerBlock(){
  return `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-0">Data Steward</h1>
        <div class="small text-body-secondary">Approvals, quality, catalog, policies, shares & exports.</div>
      </div>
      <div class="text-body-secondary small">
        <i class="bi bi-shield-lock" aria-hidden="true"></i>
        Least-privilege enforced • All actions audit-logged
      </div>
    </div>`;
}

function kpiCard(k){ return `
  <div class="kpi">
    <div class="label">${k.label}</div>
    <div class="value h5 mb-0">${k.value}</div>
    ${k.hint ? `<div class="small text-body-secondary">${k.hint}</div>` : ``}
  </div>`; }

function kpiBlock(kpis){
  return `
  <section aria-labelledby="kpiHeading" class="mb-3">
    <h2 id="kpiHeading" class="visually-hidden">Key indicators</h2>
    <div class="kpi-grid">
      ${kpis.map(kpiCard).join('')}
    </div>
  </section>`;
}

function tile(s){
  return `
    <div class="col-12 col-sm-6 col-xl-4">
      <div class="card shadow-sm card-link h-100">
        <div class="card-body d-flex flex-column">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h3 class="h6 mb-0">${s.title}</h3>
            <span class="badge text-bg-light border">${s.area}</span>
          </div>
          <p class="small text-body-secondary flex-grow-1">${s.desc||''}</p>
          <div class="d-flex gap-2">
            <a class="btn btn-primary btn-sm" href="${s.link}">Open</a>
            ${s.alt ? `<a class="btn btn-outline-secondary btn-sm" href="${s.alt}">History</a>` : ''}
          </div>
        </div>
      </div>
    </div>`;
}

function tilesBlock(sections){
  return `
  <section aria-labelledby="quickNavHeading" class="mb-3">
    <h2 id="quickNavHeading" class="visually-hidden">Quick navigation</h2>
    <div class="card shadow-sm">
      <div class="card-body">
        <div class="row g-3">${sections.map(tile).join('')}</div>
      </div>
    </div>
  </section>`;
}

function tasksBlock(tasks){
  const total = (tasks.items||[]).length;
  const pageSize = tasks.pageSize || 10;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return `
  <section aria-labelledby="tasksHeading" class="mb-3">
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <h2 id="tasksHeading" class="h5 mb-0">My Steward Tasks</h2>
      <div class="d-flex align-items-center gap-2">
        <label for="pageSize" class="form-label m-0 small text-body-secondary">Rows per page</label>
        <select id="pageSize" class="form-select form-select-sm page-size" aria-label="Rows per page">
          ${[10,20,50].map(n => `<option value="${n}" ${n===pageSize?'selected':''}>${n}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" id="tasksTable">
          <thead class="table-light">
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Type</th>
              <th scope="col">Dataset</th>
              <th scope="col">Submitted by</th>
              <th scope="col">Submitted</th>
              <th scope="col">Status</th>
              <th scope="col" class="text-end">Action</th>
            </tr>
          </thead>
          <tbody id="tasksBody">
            <!-- rows injected -->
          </tbody>
        </table>
      </div>
      <div class="d-flex align-items-center justify-content-between p-2 border-top bg-body-tertiary">
        <div id="rangeLabel" class="small text-body-secondary">Rows 0–0 of 0</div>
        <nav aria-label="Pagination">
          <ul class="pagination pagination-sm mb-0" id="pager">
            <!-- pager injected -->
          </ul>
        </nav>
      </div>
    </div>
  </section>`;
}

function wirePagination(tasks){
  let items = tasks.items || [];
  let pageSize = tasks.pageSize || 10;
  let page = 1;

  const body  = $('#tasksBody');
  const label = $('#rangeLabel');
  const pager = $('#pager');
  const sel   = $('#pageSize');

  function fmtDate(iso){
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch { return iso; }
  }

  function draw(){
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (page > pages) page = pages;

    const startIdx = (page - 1) * pageSize;
    const endIdx   = Math.min(startIdx + pageSize, total);
    const slice    = items.slice(startIdx, endIdx);

    body.innerHTML = slice.map(r => `
      <tr>
        <td><code>${r.id}</code></td>
        <td>${r.type}</td>
        <td class="text-truncate" style="max-width:260px">${r.dataset}</td>
        <td>${r.submitted_by}</td>
        <td>${fmtDate(r.submitted_ts)}</td>
        <td>${r.status}</td>
        <td class="text-end">
          <a class="btn btn-outline-primary btn-sm" href="${actionLink(r)}">Open</a>
        </td>
      </tr>`).join('') || `<tr><td colspan="7"><div class="empty text-center">No tasks</div></td></tr>`;

    label.textContent = `Rows ${total ? (startIdx+1) : 0}–${endIdx} of ${total}`;

    // pager
    const btn = (p, txt, aria, disabled=false, active=false) =>
      `<li class="page-item ${disabled?'disabled':''} ${active?'active':''}">
         <button class="page-link" type="button" data-page="${p}" aria-label="${aria}">${txt}</button>
       </li>`;

    const pagesCount = Math.max(1, Math.ceil(total / pageSize));
    pager.innerHTML = [
      btn(page-1, '&laquo;', 'Previous', page<=1),
      ...Array.from({length: pagesCount}).map((_,i)=>btn(i+1, String(i+1), `Page ${i+1}`, false, i+1===page)),
      btn(page+1, '&raquo;', 'Next', page>=pagesCount)
    ].join('');

    // attach events
    $$('#pager .page-link').forEach(el => el.addEventListener('click', () => {
      const p = Number(el.getAttribute('data-page'));
      if (!Number.isNaN(p)) { page = p; draw(); }
    }));
  }

  function actionLink(r){
    switch(r.type){
      case 'Promotion':    return 'promotion-approvals.html';
      case 'DQ Violation': return 'data-validation.html';
      case 'Drift Alert':  return 'data-validation.html';
      case 'Export':       return 'export-requests.html';
      case 'Policy Change':return 'policy-simulator.html';
      default: return '#';
    }
  }

  sel.addEventListener('change', () => { pageSize = Number(sel.value)||10; page = 1; draw(); });
  draw();
}

// Boot once DOM + partials are ready (partials-loader uses DOMContentLoaded too)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
