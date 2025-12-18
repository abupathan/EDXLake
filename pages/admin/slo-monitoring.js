// EDX — Status & SLOs (production-grade)
// Features: KPIs, filters, search, sort, pagination for incidents; CSV preview & copy;
// Incident details modal; Uptime sparkline modal; demo persistence via localStorage;
// Bootstrap-first modals with safe fallback; no top-level await.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'slo-monitoring.json';
const LS_KEY  = 'edx_status_slos_v1';

let model = {
  meta:{},
  uptime_30d:"", pipelines_healthy:0, pipelines_total:0, mean_restore:"",
  incidents_30d:0, last_incident:"",
  uptime_history:[], // [{date:"2025-09-18", percent:99.98}, ...]
  slo: { uptime_target: 99.9, restore_target_minutes: 15 },
  incidents:[]
};

const ui = {
  q:'', impact:'All', status:'All',
  sortKey:'opened_at', sortDir:'desc',
  page:1, size:10
};

/* ---------- Bootstrap-first modal with safe fallback ---------- */
function hasBS(){ return !!(window.bootstrap && typeof window.bootstrap.Modal === 'function'); }
function ensureInBody(el){ if(el?.parentElement !== document.body) document.body.appendChild(el); return el; }
function openModal(id){
  const el = ensureInBody($(id));
  if (hasBS()){
    const prev = window.bootstrap.Modal.getInstance(el); if(prev) prev.dispose?.();
    const inst = new window.bootstrap.Modal(el, {backdrop:true, keyboard:true, focus:true});
    el._inst = inst; inst.show();
  } else {
    el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true');
    el.classList.add('show'); el.style.display='block'; document.body.classList.add('modal-open');
    const bd=document.createElement('div'); bd.className='modal-backdrop fade show'; bd.dataset.f='1'; document.body.appendChild(bd);
    el.querySelectorAll('[data-bs-dismiss="modal"],.btn-close').forEach(b=>{ b._h = ()=>closeModal(id); b.addEventListener('click', b._h); });
  }
}
function closeModal(id){
  const el = $(id);
  if (hasBS()){ const inst = window.bootstrap.Modal.getInstance(el) || el._inst; inst?.hide?.(); }
  else{
    el?.classList.remove('show'); if(el) el.style.display='none';
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.modal-backdrop[data-f="1"]').forEach(n=>n.remove());
    el?.querySelectorAll('[data-bs-dismiss="modal"],.btn-close').forEach(b=>{ if(b._h){ b.removeEventListener('click', b._h); delete b._h; } });
  }
}

/* --------------------- Init / Load ---------------------------- */
init().catch(console.error);

async function init(){
  try{
    const saved = localStorage.getItem(LS_KEY);
    if (saved) model = JSON.parse(saved);
    else model = await fetch(SRC_URL, { cache:'no-store' }).then(r=>r.json());
  } catch {
    // fall back to empty model
  }
  normalize();
  render();
}

function normalize(){
  model.uptime_history = Array.isArray(model.uptime_history) ? model.uptime_history : [];
  model.incidents = Array.isArray(model.incidents) ? model.incidents.map(n => ({
    id: String(n.id || genId()),
    opened: n.opened || "",
    opened_at: Date.parse(n.opened) || Date.now(),
    title: n.title || "",
    impact: n.impact || "",
    status: n.status || "",
    postmortem: !!n.postmortem,
    summary: n.summary || "",
    timeline: n.timeline || ""
  })) : [];
}

function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify(model)); alert('Saved (demo): status data stored in your browser.'); }
function resetLocal(){ localStorage.removeItem(LS_KEY); init(); }
function refresh(){ init(); } // re-pulls source JSON

/* --------------------- Rendering ------------------------------ */
function render(){
  const uptimeOk = pctToNum(model.uptime_30d) >= (model.slo?.uptime_target ?? 99.9);
  const restoreOk = minsFromStr(model.mean_restore) <= (model.slo?.restore_target_minutes ?? 15);

  // counts
  const total = model.incidents.length;
  const openCount = model.incidents.filter(i=>/open|investigating|monitoring/i.test(i.status)).length;

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Status & SLOs</h1>
        <span class="kpi-chip"><span class="dot"></span> Incidents: ${total} (open: ${openCount})</span>
        <span class="kpi-chip"><span class="dot"></span> Pipelines: ${model.pipelines_healthy}/${model.pipelines_total}</span>
        <span class="badge ${uptimeOk?'text-bg-success':'text-bg-danger'} badge-chip">Uptime ${uptimeOk?'On Target':'Below Target'}</span>
        <span class="badge ${restoreOk?'text-bg-success':'text-bg-danger'} badge-chip">Restore ${restoreOk?'On Target':'Below Target'}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="btn-group btn-group-sm">
          <button id="btnCSV" class="btn btn-outline-secondary">Export CSV</button>
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>
        <button id="btnRefresh" class="btn btn-primary btn-sm" type="button">Refresh</button>
      </div>
    </div>

    <div class="row g-3">
      ${kpiCard('Uptime (30d)', model.uptime_30d, `target ≥ ${(model.slo?.uptime_target??99.9).toFixed(1)}%`, 'btnUptime')}
      ${kpiCard('Pipelines Healthy', `${model.pipelines_healthy}/${model.pipelines_total}`, 'failing retries excluded')}
      ${kpiCard('Mean Restore', model.mean_restore, `target ≤ ${(model.slo?.restore_target_minutes??15)} min`)}
      ${kpiCard('Incidents (30d)', String(model.incidents_30d), model.last_incident || '')}
    </div>

    <div class="card card-elevated mt-3">
      <div class="card-header bg-body">
        <div class="d-flex align-items-center justify-content-between">
          <strong>Recent Incidents</strong>
          <div class="d-flex flex-wrap gap-2">
            <div class="input-group input-group-sm search-wrap">
              <span class="input-group-text">Search</span>
              <input id="q" class="form-control" placeholder="title, impact, status…" value="${escAttr(ui.q)}">
            </div>
            <div class="input-group input-group-sm" style="width:auto;">
              <label class="input-group-text">Impact</label>
              <select id="fImpact" class="form-select form-select-sm">
                ${['All','Low','Moderate','High','Critical'].map(v=>`<option ${v===ui.impact?'selected':''}>${v}</option>`).join('')}
              </select>
            </div>
            <div class="input-group input-group-sm" style="width:auto;">
              <label class="input-group-text">Status</label>
              <select id="fStatus" class="form-select form-select-sm">
                ${['All','Investigating','Monitoring','Resolved'].map(v=>`<option ${v===ui.status?'selected':''}>${v}</option>`).join('')}
              </select>
            </div>
            <div class="input-group input-group-sm" style="width:auto;">
              <label class="input-group-text">Rows/page</label>
              <select id="pageSize" class="form-select form-select-sm">
                ${[10,25,50,100].map(n=>`<option value="${n}" ${n===ui.size?'selected':''}>${n}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="table-responsive">
        <table class="table align-middle mb-0" id="incTable">
          <thead class="table-light">
            <tr>
              ${th('opened_at','Opened')}
              ${th('title','Title')}
              ${th('impact','Impact')}
              ${th('status','Status')}
              <th>Postmortem</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody id="incBody"></tbody>
        </table>
      </div>

      <div class="card-footer d-flex align-items-center justify-content-between">
        <small class="text-body-secondary">All SLOs measured against immutable audit logs and metrics.</small>
        <nav><ul id="pager" class="pagination pagination-sm mb-0"></ul></nav>
      </div>
    </div>
  `;

  // wire KPI buttons
  $('#btnUptime')?.addEventListener('click', openUptimeModal);

  // wire top actions
  $('#btnCSV').addEventListener('click', exportCSV);
  $('#btnReset').addEventListener('click', resetLocal);
  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnRefresh').addEventListener('click', refresh);

  // filters
  $('#q').addEventListener('input', e=>{ ui.q=e.target.value; ui.page=1; mountIncidents(); });
  $('#fImpact').addEventListener('change', e=>{ ui.impact=e.target.value; ui.page=1; mountIncidents(); });
  $('#fStatus').addEventListener('change', e=>{ ui.status=e.target.value; ui.page=1; mountIncidents(); });
  $('#pageSize').addEventListener('change', e=>{ ui.size=Number(e.target.value)||10; ui.page=1; mountIncidents(); });

  // table sorting
  main.querySelectorAll('#incTable thead th[data-sort-key]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key=th.getAttribute('data-sort-key');
      if(ui.sortKey===key) ui.sortDir = (ui.sortDir==='asc'?'desc':'asc');
      else { ui.sortKey=key; ui.sortDir='asc'; }
      mountIncidents();
    });
  });

  // initial mount
  mountIncidents();
}

/* --------------------- KPI / Sparkline ------------------------ */
function kpiCard(label, value, sub='', btnId){
  return `
    <div class="col-sm-6 col-xl-3">
      <div class="card shadow-sm h-100 kpi-card">
        <div class="card-body kpi">
          <div class="text-body-secondary small">${label}</div>
          <div class="value">${value}</div>
          <div class="sub">${esc(sub)}</div>
          ${btnId? `<div class="mt-2"><button id="${btnId}" class="btn btn-outline-secondary btn-sm" type="button">View history</button></div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function openUptimeModal(){
  const target = Number(model.slo?.uptime_target ?? 99.9);
  const data = model.uptime_history || [];

  // simple SVG sparkline bars
  const W = 800, H = 140, pad = 24;
  const n = data.length || 1;
  const bw = (W - pad*2) / n;
  const bars = data.map((d, i) => {
    const pct = Math.max(0, Math.min(100, Number(d.percent)));
    const h = (pct/100) * (H - pad*2);
    const x = pad + i*bw;
    const y = H - pad - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(2,bw-2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" ry="2" />`;
  }).join('');

  const goalY = H - pad - (target/100)*(H - pad*2);

  $('#uptimeSparkline').innerHTML = `
    <div class="sparkline">
      <svg viewBox="0 0 ${W} ${H}">
        <g fill="currentColor" fill-opacity="0.65">${bars}</g>
        <line x1="${pad}" x2="${W-pad}" y1="${goalY}" y2="${goalY}" class="goal" stroke="currentColor" stroke-opacity="0.5"/>
        <text x="${W-pad}" y="${goalY-6}" text-anchor="end" font-size="12" fill="currentColor">${target.toFixed(1)}% target</text>
      </svg>
    </div>
  `;
  openModal('#uptimeModal');
}

/* --------------------- Incidents table ------------------------ */
function mountIncidents(){
  // filter
  const q = ui.q.trim().toLowerCase();
  let rows = model.incidents.filter(i=>{
    const hay = `${i.title} ${i.impact} ${i.status} ${i.summary}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okI = ui.impact==='All' || new RegExp(`^${ui.impact}`, 'i').test(i.impact);
    const okS = ui.status==='All' || new RegExp(`^${ui.status}`, 'i').test(i.status);
    return okQ && okI && okS;
  });

  // sort
  rows.sort((a,b)=>{
    const dir = ui.sortDir==='asc'?1:-1;
    const key = ui.sortKey;
    const va = key==='opened_at' ? a.opened_at : String(a[key]||'').toLowerCase();
    const vb = key==='opened_at' ? b.opened_at : String(b[key]||'').toLowerCase();
    return (va<vb?-1:va>vb?1:0) * dir;
  });

  // pagination
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / ui.size));
  ui.page = Math.min(Math.max(1, ui.page), pages);
  const start = (ui.page-1)*ui.size;
  const pageRows = rows.slice(start, start+ui.size);

  // render body
  $('#incBody').innerHTML = pageRows.map(r=>`
    <tr>
      <td class="text-nowrap">${esc(r.opened)}</td>
      <td>${esc(r.title)}</td>
      <td>${impactBadge(r.impact)}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="text-nowrap">${r.postmortem ? '<span class="badge text-bg-secondary">Available</span>' : '—'}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-act="view" data-id="${escAttr(r.id)}" type="button">Details</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="text-center text-body-secondary py-4">No matching incidents</td></tr>`;

  // pager
  $('#pager').innerHTML = pagesHtml(ui.page, pages);
  $('#pager').querySelectorAll('.page-link[data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.page = Number(btn.getAttribute('data-page')); mountIncidents(); });
  });

  // details action
  $('#incBody').addEventListener('click', onRowAction);
}

function onRowAction(e){
  const btn = e.target.closest('button[data-act]'); if(!btn) return;
  const id = btn.getAttribute('data-id');
  const row = model.incidents.find(x=>x.id===id); if(!row) return;
  if (btn.getAttribute('data-act')==='view') openIncident(row);
}

function openIncident(r){
  $('#incidentModalLabel').textContent = r.title;
  $('#incTitle').textContent = r.title;
  $('#incOpened').textContent = r.opened;
  $('#incImpact').textContent = r.impact;
  $('#incStatus').textContent = r.status;
  $('#incSummary').textContent = r.summary || '(No summary)';
  $('#incTimeline').textContent = r.timeline || '(No timeline)';
  openModal('#incidentModal');
}

/* --------------------- Export CSV ----------------------------- */
function exportCSV(){
  const hdr = ['Opened','Title','Impact','Status','Postmortem','Summary'];
  const rows = getAllFiltered().map(r=>[
    r.opened, r.title, r.impact, r.status, r.postmortem?'Yes':'No', (r.summary||'').replace(/\r?\n/g,' ')
  ]);
  const csv = toCSV([hdr, ...rows]);
  $('#csvModalLabel').textContent = `CSV Preview — incidents_${ts()}.csv`;
  $('#csvPreview').textContent = csv;
  $('#btnCopyCsv').onclick = async ()=>{ try{ await navigator.clipboard.writeText(csv); alert('Copied!'); } catch{ alert('Copy failed'); } };
  openModal('#csvModal');
}

function getAllFiltered(){
  const q = ui.q.trim().toLowerCase();
  return model.incidents.filter(i=>{
    const hay = `${i.title} ${i.impact} ${i.status} ${i.summary}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okI = ui.impact==='All' || new RegExp(`^${ui.impact}`, 'i').test(i.impact);
    const okS = ui.status==='All' || new RegExp(`^${ui.status}`, 'i').test(i.status);
    return okQ && okI && okS;
  }).sort((a,b)=>{
    const dir = ui.sortDir==='asc'?1:-1;
    const key = ui.sortKey;
    const va = key==='opened_at' ? a.opened_at : String(a[key]||'').toLowerCase();
    const vb = key==='opened_at' ? b.opened_at : String(b[key]||'').toLowerCase();
    return (va<vb?-1:va>vb?1:0) * dir;
  });
}

/* --------------------- Utilities ------------------------------ */
function th(key,label){
  const active = ui.sortKey===key;
  const arrow = active ? (ui.sortDir==='asc'?'▲':'▼') : '';
  return `<th data-sort-key="${key}" role="button">${label} <span class="sort">${arrow}</span></th>`;
}
function impactBadge(v){
  const m = (v||'').toLowerCase();
  const cls = /critical/.test(m) ? 'text-bg-danger' : /high/.test(m) ? 'text-bg-warning' : /moderate/.test(m) ? 'text-bg-info' : 'text-bg-secondary';
  return `<span class="badge ${cls}">${esc(v)}</span>`;
}
function statusBadge(v){
  const m = (v||'').toLowerCase();
  const cls = /resolved/.test(m) ? 'text-bg-success' : /investigating/.test(m) ? 'text-bg-warning' : /monitoring/.test(m) ? 'text-bg-info' : 'text-bg-secondary';
  return `<span class="badge ${cls}">${esc(v)}</span>`;
}
function pagesHtml(page,total){
  const out=[]; const add=(n,l=n,dis=false)=> out.push(`<li class="page-item ${n===page?'active':''} ${dis?'disabled':''}">
    <button class="page-link" data-page="${n}" type="button">${l}</button></li>`);
  add(Math.max(1,page-1),'«',page===1);
  if(total<=7){ for(let i=1;i<=total;i++) add(i); }
  else{
    add(1);
    if(page>3) out.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
    for(let i=Math.max(2,page-1); i<=Math.min(total-1,page+1); i++) add(i);
    if(page<total-2) out.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
    add(total);
  }
  add(Math.min(total,page+1),'»',page===total);
  return out.join('');
}
function toCSV(rows){ const BOM='\uFEFF'; return BOM + rows.map(r=>r.map(c=>csvCell(c)).join(',')).join('\r\n'); }
function csvCell(v){ const s=String(v??''); return /[",\r\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
function genId(){ return 'i_' + Math.random().toString(36).slice(2,10) + '_' + Date.now().toString(36); }
function pctToNum(s){ const m=/([\d.]+)/.exec(String(s||'')); return m? Number(m[1]) : 0; }
function minsFromStr(s){ const m=/(\d+)m\s*(\d+)?s?/.exec(String(s||'')); if(!m) return 0; return Number(m[1]) + (Number(m[2]||0)/60); }
