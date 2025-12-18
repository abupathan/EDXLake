// Catalog & Lineage (Read-only) — Production page logic
// Features: search, sort, pagination, refresh, CSV export, lineage & schema modals.

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const state = {
  datasets: [],
  page: 1,
  pageSize: 10,
  q: '',
  sortKey: 'name',        // name | schema_version | freshness_mins | dq_score
  sortDir: 'asc',
  dataUrl: 'catalog-lineage-ro.json'
};

init().catch(console.error);

async function init() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const tzEl = $('#tzLabel'); if (tzEl) tzEl.textContent = tz;  // guard for shared footer
  restorePrefs();
  bindToolbar();
  await loadData(true);
}

function restorePrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem('edx.catalog.prefs') || '{}');
    Object.assign(state, {
      pageSize: saved.pageSize || state.pageSize,
      q: saved.q || '',
      sortKey: saved.sortKey || state.sortKey,
      sortDir: saved.sortDir || state.sortDir
    });
  } catch {}
  const ps = $('#pageSize'); if (ps) ps.value = String(state.pageSize);
  const q = $('#q'); if (q) q.value = state.q;
}

function persistPrefs() {
  localStorage.setItem('edx.catalog.prefs', JSON.stringify({
    pageSize: state.pageSize, q: state.q, sortKey: state.sortKey, sortDir: state.sortDir
  }));
}

function bindToolbar() {
  $('#pageSize')?.addEventListener('change', e => {
    state.pageSize = Number(e.target.value) || 10;
    state.page = 1;
    persistPrefs();
    render();
  });

  // Debounced search
  let t;
  $('#q')?.addEventListener('input', e => {
    state.q = e.target.value || '';
    clearTimeout(t);
    t = setTimeout(() => { state.page = 1; persistPrefs(); render(); }, 180);
  });

  $('#btnRefresh')?.addEventListener('click', () => loadData(true));
  $('#btnExport')?.addEventListener('click', () => exportCSV(getFilteredSorted()));
}

async function loadData(bust=false) {
  setStatus('Loading datasets…');
  try {
    const url = bust ? `${state.dataUrl}?t=${Date.now()}` : state.dataUrl;
    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json();
    const list = Array.isArray(json?.datasets) ? json.datasets : [];
    state.datasets = list.map(normalize);
    setStatus(`${state.datasets.length} datasets loaded.`);
    render();
  } catch (e) {
    console.error(e);
    state.datasets = [];
    render();
    setStatus('Failed to load datasets.', true);
  }
}

function normalize(x) {
  const mins = Number.isFinite(x.freshness_mins) ? x.freshness_mins : (
    /(\d+)\s*min/i.test(x.freshness||'') ? Number(RegExp.$1) :
    /(\d+)\s*hr/i.test(x.freshness||'') ? Number(RegExp.$1)*60 :
    /today/i.test(x.freshness||'') ? 0 : 1e9
  );
  return {
    name: String(x.name||''),
    desc: String(x.desc||''),
    schema_version: String(x.schema_version||''),
    freshness: String(x.freshness||''),
    freshness_mins: mins,
    dq_score: Number(x.dq_score||0),
    tags: Array.isArray(x.tags) ? x.tags : [],
    owners: Array.isArray(x.owners) ? x.owners : [],
    schema: Array.isArray(x.schema) ? x.schema.map(c => ({
      name: String(c.name||''), type: String(c.type||''), pk: !!c.pk,
      tags: Array.isArray(c.tags) ? c.tags : []
    })) : [],
    lineage: x.lineage && typeof x.lineage==='object'
      ? { from: Array.isArray(x.lineage.from) ? x.lineage.from : [], to: String(x.lineage.to||'') }
      : { from: [], to: '' }
  };
}

function getFilteredSorted() {
  const q = state.q.trim().toLowerCase();
  let arr = q ? state.datasets.filter(d =>
    d.name.toLowerCase().includes(q) ||
    d.desc.toLowerCase().includes(q) ||
    d.tags.join(' ').toLowerCase().includes(q) ||
    d.owners.join(' ').toLowerCase().includes(q)
  ) : [...state.datasets];

  const { sortKey, sortDir } = state;
  arr.sort((a,b) => {
    let va = a[sortKey], vb = b[sortKey];
    const numeric = sortKey === 'dq_score' || sortKey === 'freshness_mins';
    if (numeric) { va = Number(va); vb = Number(vb); }
    else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return sortDir==='asc' ? -1 : 1;
    if (va > vb) return sortDir==='asc' ?  1 : -1;
    return 0;
  });
  return arr;
}

function render() {
  const list = getFilteredSorted();
  $('#badgeCount').textContent = `Datasets: ${list.length}`;

  const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;

  // header sort arrows
  document.querySelectorAll('thead th[data-sort-key]').forEach(th => {
    const key = th.getAttribute('data-sort-key');
    const s = th.querySelector('.sort');
    if (s) s.textContent = (key === state.sortKey) ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
    th.onclick = () => {
      if (state.sortKey === key) state.sortDir = (state.sortDir === 'asc' ? 'desc' : 'asc');
      else { state.sortKey = key; state.sortDir = 'asc'; }
      persistPrefs();
      render();
    };
  });

  const start = (state.page-1) * state.pageSize;
  const rows = list.slice(start, start + state.pageSize);
  renderTable(rows);
  renderPager(state.page, totalPages);
}

function renderTable(rows) {
  const tbody = $('#tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-body-secondary py-4">No matching datasets</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(d => `
    <tr>
      <td class="text-nowrap">
        <div class="fw-semibold">${esc(d.name)}</div>
        <div class="small text-body-secondary">${esc(d.desc)}</div>
      </td>
      <td>${esc(d.schema_version)}</td>
      <td class="text-nowrap"><span class="badge rounded-pill text-bg-light badge-fresh">${esc(d.freshness||'n/a')}</span></td>
      <td class="text-end"><span class="badge rounded-pill text-bg-${dqColor(d.dq_score)} badge-dq">${esc(d.dq_score)}%</span></td>
      <td class="schema-col">
        ${d.schema.slice(0,3).map(c => `<span class="badge bg-body-secondary text-body me-1">${esc(c.name)}:${esc(c.type)}</span>`).join('')}
        ${d.schema.length>3 ? `<span class="text-body-secondary">+${d.schema.length-3} more</span>` : ''}
        <div class="mt-1">
          <button class="btn btn-sm btn-outline-secondary" data-action="schema" data-ds="${escAttr(d.name)}">View schema</button>
        </div>
      </td>
      <td class="text-nowrap">${d.tags.map(t => `<span class="badge badge-tag me-1">${esc(t)}</span>`).join('')}</td>
      <td class="text-nowrap small">${esc(d.owners.join(', '))}</td>
      <td class="text-nowrap">
        ${esc(d.lineage.from.join(' + '))} &rarr; <span class="fw-semibold">${esc(d.lineage.to || d.name)}</span>
        <div class="mt-1">
          <button class="btn btn-sm btn-outline-primary" data-action="lineage" data-ds="${escAttr(d.name)}">View lineage</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('button[data-action="schema"]').forEach(b => b.addEventListener('click', () => openSchema(b.getAttribute('data-ds'))));
  document.querySelectorAll('button[data-action="lineage"]').forEach(b => b.addEventListener('click', () => openLineage(b.getAttribute('data-ds'))));
}

function renderPager(page, total) {
  const ul = $('#pager');
  const li = (p, label = p, disabled = false, active = false, aria='') =>
    `<li class="page-item ${disabled?'disabled':''} ${active?'active':''}">
       <button class="page-link" data-page="${p}" ${aria}>${label}</button>
     </li>`;
  const dots = `<li class="page-item disabled"><span class="page-link">…</span></li>`;

  let html = '';
  html += li(page-1, '«', page<=1, false, 'aria-label="Previous"');
  if (total <= 7) {
    for (let n=1; n<=total; n++) html += li(n, n, false, n===page);
  } else {
    html += li(1, 1, false, page===1);
    html += (page > 3) ? dots : '';
    for (let n=Math.max(2,page-1); n<=Math.min(total-1,page+1); n++) html += li(n, n, false, n===page);
    html += (page < total-2) ? dots : '';
    html += li(total, total, false, page===total);
  }
  html += li(page+1, '»', page>=total, false, 'aria-label="Next"');
  ul.innerHTML = html;

  document.querySelectorAll('#pager .page-link[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = Number(btn.getAttribute('data-page'));
      if (!Number.isNaN(p)) {
        const max = Math.max(1, Math.ceil(getFilteredSorted().length / state.pageSize));
        state.page = Math.min(Math.max(1, p), max);
        render();
      }
    });
  });
}

/* ==== Modals ==== */

function openSchema(name) {
  const ds = state.datasets.find(d => d.name === name);
  if (!ds) return;
  $('#schemaModalLabel').textContent = `Schema — ${ds.name} (v${ds.schema_version})`;
  $('#schemaBody').innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead class="table-light"><tr><th>Column</th><th>Type</th><th>PK</th><th>Tags</th></tr></thead>
        <tbody>
          ${ds.schema.map(c => `
            <tr>
              <td>${esc(c.name)}</td>
              <td>${esc(c.type)}</td>
              <td>${c.pk ? '<span class="badge text-bg-primary">PK</span>' : ''}</td>
              <td>${(c.tags||[]).map(t=>`<span class="badge badge-tag me-1">${esc(t)}</span>`).join('')}</td>
            </tr>
          `).join('')}
          ${ds.schema.length ? '' : `<tr><td colspan="4" class="text-center text-body-secondary">No columns</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $('#btnExportSchema').onclick = () => {
    const header = ['Dataset','Schema Version','Column','Type','PK','Tags'];
    const rows = ds.schema.map(c => [ds.name, ds.schema_version, c.name, c.type, c.pk?'true':'false', (c.tags||[]).join('|')]);
    exportCSV([header, ...rows], `edx_schema_${safe(ds.name)}_${ts()}.csv`);
  };
  new bootstrap.Modal($('#schemaModal')).show();
}

function openLineage(name) {
  const ds = state.datasets.find(d => d.name === name);
  if (!ds) return;

  $('#lineageModalLabel').textContent = `Lineage — ${ds.name}`;
  $('#lineageBody').innerHTML = `
    ${lineageSVG(ds)}
    <div class="row g-3 mt-2">
      <div class="col-lg-6">
        <h6>Upstream</h6>
        <ul class="list-group list-group-flush">
          ${ds.lineage.from.map(s => `<li class="list-group-item">${esc(s)}</li>`).join('') || '<li class="list-group-item text-body-secondary">None</li>'}
        </ul>
      </div>
      <div class="col-lg-6">
        <h6>Downstream</h6>
        <ul class="list-group list-group-flush">
          <li class="list-group-item">${esc(ds.lineage.to || ds.name)}</li>
        </ul>
      </div>
    </div>
  `;
  new bootstrap.Modal($('#lineageModal')).show();
}

function lineageSVG(ds) {
  const nodes = [...ds.lineage.from, ds.lineage.to || ds.name];
  const width = 720, height = 200, y = 100;
  const step = Math.max(160, Math.floor((width-100)/(nodes.length||1)));
  const startX = 40;

  const nodeRect = (idx, label) => {
    const x = startX + idx*step;
    return `
      <g class="node">
        <rect x="${x-60}" y="${y-22}" width="120" height="44" rx="8" fill="white" stroke="#adb5bd"></rect>
        <text x="${x}" y="${y+4}" text-anchor="middle">${esc(label)}</text>
      </g>`;
  };

  const links = ds.lineage.from.map((_, i) => {
    const x1 = startX + i*step + 60, x2 = startX + (nodes.length-1)*step - 60;
    return `<line class="link" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"></line>`;
  }).join('');

  return `
    <svg class="lineage-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="Lineage graph">
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#6c757d"></polygon>
        </marker>
      </defs>
      ${links}
      ${nodes.map((n,i) => nodeRect(i, n)).join('')}
    </svg>`;
}

/* ==== Utilities ==== */

function dqColor(score){ if (score>=98) return 'success'; if (score>=95) return 'info'; if (score>=90) return 'warning'; return 'danger'; }
function esc(v){ return String(v??'').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function safe(v){ return String(v).replace(/[^\w.-]+/g,'_'); }
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
function csvEsc(v){ const s=String(v??''); return /[",\r\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function exportCSV(rows, name=`edx_catalog_${ts()}.csv`){
  const BOM = '\uFEFF';
  const lines = rows.map(cols => cols.map(csvEsc).join(',')).join('\r\n');
  const blob = new Blob([BOM+lines], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function setStatus(text, isError=false) {
  const s = $('#status'); if (!s) return;
  s.textContent = text || '';
  s.classList.toggle('text-danger', !!isError);
}
