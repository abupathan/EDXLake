// landing.js — Data Engineer landing (Bootstrap-enabled page, no boot file)
// Utilities
const $  = (s, r = document) => r.querySelector(s);
const fmtInt = n => Number(n).toLocaleString();
const fmtPct = n => `${Number(n).toFixed(1)}%`;
const fmtDur = ms => `${Math.round(ms/1000)}s`;
const fmtTs  = iso => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };

// State
const STATE = { data: null, pageSize: 10, pageIndex: 0 };

// Start once DOM is ready and partials loader has registered
function start() {
  try {
    if (window.EDXPartials && typeof window.EDXPartials.loadPartials === 'function') {
      window.EDXPartials.loadPartials({ sidebar: 'engineer' });
    }
  } catch (e) {
    console.error('Partials load failed', e);
  } finally {
    fetchDataAndRender();
  }
}

async function fetchDataAndRender() {
  try {
    const res = await fetch('landing.json', { cache: 'no-store' });
    STATE.data = await res.json();
  } catch (e) {
    console.error('Failed to load landing.json', e);
    STATE.data = { sections: [], metrics: null, alerts: [], quick_links: [], recent_runs: [] };
  }
  renderAll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

// Render
function renderAll() {
  const root = $('#app-main');
  if (!root) return;
  root.innerHTML = `
    <div class="page-head">
      <div class="page-titles">
        <h1 class="page-title">Data Engineer</h1>
        <p class="subtitle">Sources, pipelines, runs, mappings & versions, schedules, validation, monitoring, and logs.</p>
      </div>
      <div class="quick-links" role="group" aria-label="Quick actions">
        ${(STATE.data.quick_links || []).map(q => `<a class="btn btn-primary btn-sm" href="${q.href}">${escapeHtml(q.label)}</a>`).join('')}
      </div>
    </div>

    ${renderMetrics(STATE.data.metrics)}
    ${renderTiles(STATE.data.sections)}
    <div class="grid-2">
      ${renderRecentRuns(STATE.data.recent_runs)}
      ${renderAlerts(STATE.data.alerts)}
    </div>
  `;

  root.addEventListener('click', onPaginateClick);
}

function renderMetrics(m) {
  if (!m) {
    return `<section aria-labelledby="metrics-title" class="card">
      <div class="card-header"><h2 id="metrics-title" class="h6">Key Metrics</h2></div>
      <div class="card-body empty">No metrics available.</div>
    </section>`;
  }
  const healthyPct = m.pipelines_total ? (m.pipelines_healthy / m.pipelines_total) * 100 : 0;
  return `
  <section aria-labelledby="metrics-title" class="metrics">
    <h2 id="metrics-title" class="visually-hidden">Key Metrics</h2>
    <div class="metric-card">
      <div class="metric-label">Freshness SLO</div>
      <div class="metric-value">${fmtPct(m.freshness_slo_pct)}</div>
      <div class="metric-foot">Updated ${fmtTs(m.last_updated_ts)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Pipelines Healthy</div>
      <div class="metric-value">${fmtInt(m.pipelines_healthy)} / ${fmtInt(m.pipelines_total)}</div>
      <div class="metric-foot">${fmtPct(Number(healthyPct).toFixed(1))} healthy</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">DQ Failures (24h)</div>
      <div class="metric-value">${fmtInt(m.dq_failures_24h)}</div>
      <div class="metric-foot"><a href="monitoring.html#dq">View details</a></div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Exports Queued</div>
      <div class="metric-value">${fmtInt(m.exports_queued)}</div>
      <div class="metric-foot"><a href="../consumer/exports.html">Go to exports</a></div>
    </div>
  </section>`;
}

function renderTiles(sections = []) {
  return `
  <section aria-labelledby="tiles-title" class="card">
    <div class="card-header"><h2 id="tiles-title" class="h6">Work Areas</h2></div>
    <div class="card-body">
      <div class="tile-grid">
        ${sections.map(s => `
          <article class="tile card-link" data-area="${escapeAttr(s.area)}">
            <div class="tile-head">
              <h3 class="h6">${escapeHtml(s.title)}</h3>
              <span class="badge">${escapeHtml(s.area)}</span>
            </div>
            <p class="tile-desc">${escapeHtml(s.desc || '')}</p>
            <div class="tile-actions">
              <a class="btn btn-primary btn-sm" href="${escapeAttr(s.link)}">Open</a>
              ${s.alt ? `<a class="btn btn-secondary btn-sm" href="${escapeAttr(s.alt)}">Alt</a>` : ''}
            </div>
          </article>
        `).join('')}
      </div>
    </div>
  </section>`;
}

function renderAlerts(alerts = []) {
  return `
  <section aria-labelledby="alerts-title" class="card alerts-card">
    <div class="card-header">
      <h2 id="alerts-title" class="h6">Active Alerts</h2>
    </div>
    <div class="card-body">
      ${alerts.length === 0 ? `<div class="empty">No active alerts</div>` : `
      <ul class="alerts">
        ${alerts.map(a => `
          <li class="alert-item ${escapeAttr(a.severity)}">
            <span class="dot" aria-hidden="true"></span>
            <div class="alert-main">
              <div class="alert-title">${escapeHtml(a.title)}</div>
              <div class="alert-meta">${escapeHtml(a.severity.toUpperCase())} • since ${fmtTs(a.since)}</div>
            </div>
            <a class="btn btn-link btn-sm" href="${escapeAttr(a.href)}">Open</a>
          </li>
        `).join('')}
      </ul>`}
    </div>
  </section>`;
}

function renderRecentRuns(all = []) {
  const total = all.length;
  const pageCount = Math.max(1, Math.ceil(total / STATE.pageSize));
  const page = STATE.pageIndex;
  const start = page * STATE.pageSize;
  const rows = all.slice(start, start + STATE.pageSize);

  return `
  <section aria-labelledby="runs-title" class="card">
    <div class="card-header">
      <h2 id="runs-title" class="h6">Recent Runs</h2>
    </div>
    <div class="card-body">
      ${rows.length === 0 ? `<div class="empty">No recent runs.</div>` : `
      <div class="table-wrap">
        <table class="table" role="table" aria-describedby="runs-title">
          <thead>
            <tr>
              <th scope="col">Run ID</th>
              <th scope="col">Pipeline</th>
              <th scope="col">Status</th>
              <th scope="col">Duration</th>
              <th scope="col">Rows In</th>
              <th scope="col">Rows Out</th>
              <th scope="col">Start</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><a href="pipeline-detail.html?id=${encodeURIComponent(r.pipeline)}&run=${encodeURIComponent(r.id)}">${escapeHtml(r.id)}</a></td>
                <td class="mono">${escapeHtml(r.pipeline)}</td>
                <td><span class="status ${escapeAttr(r.status)}">${escapeHtml(r.status)}</span></td>
                <td>${fmtDur(r.duration_ms)}</td>
                <td>${fmtInt(r.rows_in)}</td>
                <td>${fmtInt(r.rows_out)}</td>
                <td>${fmtTs(r.start_ts)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${renderPager(page, pageCount)}
      `}
    </div>
  </section>`;
}

function renderPager(page, pageCount) {
  return `
  <nav class="pager" aria-label="Recent runs pagination">
    <button class="btn btn-sm" data-page="first" ${page <= 0 ? 'disabled' : ''}>&laquo; First</button>
    <button class="btn btn-sm" data-page="prev"  ${page <= 0 ? 'disabled' : ''}>&lsaquo; Prev</button>
    <span class="pager-info" aria-live="polite">Page ${page + 1} of ${pageCount}</span>
    <button class="btn btn-sm" data-page="next"  ${page >= pageCount - 1 ? 'disabled' : ''}>Next &rsaquo;</button>
    <button class="btn btn-sm" data-page="last"  ${page >= pageCount - 1 ? 'disabled' : ''}>Last &raquo;</button>
  </nav>`;
}

function onPaginateClick(e) {
  const btn = e.target.closest('.pager .btn[data-page]');
  if (!btn) return;
  e.preventDefault();
  const action = btn.getAttribute('data-page');
  const total = (STATE.data.recent_runs || []).length;
  const pageCount = Math.max(1, Math.ceil(total / STATE.pageSize));
  switch (action) {
    case 'first': STATE.pageIndex = 0; break;
    case 'prev':  STATE.pageIndex = Math.max(0, STATE.pageIndex - 1); break;
    case 'next':  STATE.pageIndex = Math.min(pageCount - 1, STATE.pageIndex + 1); break;
    case 'last':  STATE.pageIndex = pageCount - 1; break;
  }
  const mount = document.querySelector('#app-main .grid-2');
  if (mount) {
    mount.innerHTML = `${renderRecentRuns(STATE.data.recent_runs)}${renderAlerts(STATE.data.alerts)}`;
  }
}

/* -------- utils -------- */
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return String(s ?? '').replace(/"/g,'&quot;'); }
