// Logs & Diagnostics — severity filter, regex search, secret redaction (Bootstrap UI + pagination)
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const main    = $('#app-main');
const jsonUrl = 'logs.json';

const STATE = {
  data: { logs:[], filters:{}, meta:{} },
  query: { pipeline:'', severity:'', task:'', regex:'', redact:true },
  page: 0,
  pageSize: 10,
  regexObj: null,
  regexError: ''
};

(async function init(){
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
    const d = await fetch(jsonUrl, { cache:'no-store' }).then(r=>r.json());
    STATE.data = d || STATE.data;
  } catch { /* keep defaults */ }
}

/* -------------------- Shell -------------------- */
function renderShell(){
  const pipes = STATE.data.filters?.pipelines || [];
  const severities = STATE.data.filters?.severities || [];
  const tasks = STATE.data.filters?.tasks || [];

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <div>
        <h1 class="h4 mb-1">Logs & Diagnostics</h1>
        <p class="text-muted mb-0">Read-only logs for runs and tasks. Secrets are redacted in UI; all access is audit-logged.</p>
      </div>
      <div class="d-flex toolbar align-items-center flex-wrap">
        <select id="f-pipeline" class="form-select form-select-sm">
          <option value="">Pipeline: All</option>
          ${pipes.map(p=>`<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`).join('')}
        </select>
        <select id="f-task" class="form-select form-select-sm">
          <option value="">Task: All</option>
          ${tasks.map(t=>`<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join('')}
        </select>
        <select id="f-severity" class="form-select form-select-sm">
          <option value="">Severity: All</option>
          ${severities.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('')}
        </select>
        <input id="f-regex" class="form-control form-control-sm" placeholder="Regex (message/detail)…" style="max-width:260px">
        <div class="form-check form-switch ms-1">
          <input class="form-check-input" type="checkbox" id="f-redact" checked>
          <label class="form-check-label small" for="f-redact">Redact secrets</label>
        </div>
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm ms-1">Refresh</button>
      </div>
    </div>

    <div class="alert alert-danger py-2 px-3 d-none" id="regexError" role="alert" aria-live="polite"></div>

    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Time (UTC)</th>
              <th>Pipeline</th>
              <th>Run</th>
              <th>Task</th>
              <th>Severity</th>
              <th class="wrap">Message</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
      <div class="card-footer d-flex justify-content-between align-items-center">
        <small class="text-body-secondary">Use regex to filter messages (e.g., <code>ERROR|WARN</code>, <code>token|password</code>). Secrets masked when redaction is ON.</small>
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
  $('#f-pipeline').addEventListener('change', e => { STATE.query.pipeline = e.target.value; STATE.page=0; renderTable(); });
  $('#f-task').addEventListener('change',     e => { STATE.query.task     = e.target.value; STATE.page=0; renderTable(); });
  $('#f-severity').addEventListener('change', e => { STATE.query.severity = e.target.value; STATE.page=0; renderTable(); });
  $('#f-redact').addEventListener('change',   e => { STATE.query.redact   = e.target.checked; renderTable(); });

  $('#f-regex').addEventListener('input', e => {
    STATE.query.regex = e.target.value;
    buildRegex();
    STATE.page=0;
    renderTable();
  });

  $('#btnRefresh').addEventListener('click', async ()=>{ await loadData(); renderShell(); bindToolbar(); renderTable(); });

  // pager
  $('#pg-first').addEventListener('click', ()=>{ STATE.page=0; renderTable(); });
  $('#pg-prev').addEventListener('click',  ()=>{ STATE.page=Math.max(0, STATE.page-1); renderTable(); });
  $('#pg-next').addEventListener('click',  ()=>{ STATE.page=Math.min(pages()-1, STATE.page+1); renderTable(); });
  $('#pg-last').addEventListener('click',  ()=>{ STATE.page=pages()-1; renderTable(); });
}

function buildRegex(){
  const s = (STATE.query.regex || '').trim();
  STATE.regexObj = null; STATE.regexError = '';
  $('#regexError').classList.add('d-none');
  if (!s) return;
  try {
    STATE.regexObj = new RegExp(s, 'i');
  } catch (e){
    STATE.regexError = String(e.message || 'Invalid regex');
    const alert = $('#regexError');
    alert.textContent = `Regex error: ${STATE.regexError}`;
    alert.classList.remove('d-none');
  }
}

/* -------------------- Filtering + Pagination -------------------- */
function filtered(){
  const { pipeline, severity, task } = STATE.query;
  const re = STATE.regexObj;

  return (STATE.data.logs||[]).filter(l=>{
    const okP = !pipeline || l.pipeline === pipeline;
    const okS = !severity || l.severity === severity;
    const okT = !task     || l.task     === task;
    const okR = !re || re.test(`${l.message}\n${l.detail||''}`);
    return okP && okS && okT && okR;
  }).sort((a,b)=> a.ts < b.ts ? 1 : -1); // newest first
}
function pages(){ return Math.max(1, Math.ceil(filtered().length / STATE.pageSize)); }

function renderTable(){
  const list = filtered();
  const count = pages();
  STATE.page = Math.min(STATE.page, count-1);
  const start = STATE.page * STATE.pageSize;
  const slice = list.slice(start, start + STATE.pageSize);

  $('#rows').innerHTML = slice.map(l => `
    <tr>
      <td class="text-nowrap">${escapeHtml(l.ts)}</td>
      <td>${escapeHtml(l.pipeline)}</td>
      <td><a href="pipeline-detail.html?pipeline=${encodeURIComponent(l.pipeline)}">${escapeHtml(l.run_id)}</a></td>
      <td>${escapeHtml(l.task)}</td>
      <td>${badgeSeverity(l.severity)}</td>
      <td class="wrap">
        <div class="log-snippet">${escapeHtml(displayText(`${l.message}${l.detail ? '\n' + l.detail : ''}`))}</div>
      </td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary act-view" data-idx="${escapeAttr(String(l.ts))}">View</button>
          <button class="btn btn-outline-secondary act-copy" data-msg="${escapeAttr(rawText(`${l.message}${l.detail ? '\n' + l.detail : ''}`))}">Copy</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td class="p-3" colspan="7">No logs found.</td></tr>`;

  // pager UI
  $('#pg-info').textContent = `Page ${STATE.page + 1} of ${count}`;
  $('#pg-first').disabled = $('#pg-prev').disabled = STATE.page <= 0;
  $('#pg-last').disabled  = $('#pg-next').disabled = STATE.page >= count - 1;

  // actions
  $$('.act-view').forEach(b => b.addEventListener('click', ()=>{
    const l = (STATE.data.logs||[]).find(x => String(x.ts) === b.dataset.idx);
    const txt = l ? `${l.ts} ${l.pipeline}/${l.run_id} [${l.task}] ${l.severity}\n${l.message}${l.detail?'\n'+l.detail:''}` : '(not found)';
    $('#logModalContent').textContent = STATE.query.redact ? redactSecrets(txt) : txt;
    new bootstrap.Modal($('#logModal')).show();
  }));
  $$('.act-copy').forEach(b => b.addEventListener('click', async ()=>{
    const txt = STATE.query.redact ? redactSecrets(b.dataset.msg) : b.dataset.msg;
    try { await navigator.clipboard.writeText(txt); alert('Copied to clipboard.'); } catch { alert('Copy failed.'); }
  }));
}

/* -------------------- Redaction -------------------- */
function displayText(s){ return STATE.query.redact ? redactSecrets(s) : s; }
function rawText(s){ return s; }

/* Redacts common secret patterns: bearer tokens, token=..., password=..., client_secret=..., apiKey=..., ssh private key blocks, and emails */
function redactSecrets(s){
  let t = String(s);

  // Authorization: Bearer <token>
  t = t.replace(/(Bearer\s+)[A-Za-z0-9\-\._~\+\/]+=*/gi, '$1•••REDACTED•••');

  // key=value secrets
  t = t.replace(/\b(token|password|pass|secret|client_secret|api[_-]?key)\s*=\s*([^\s;]+)/gi, (m, k)=> `${k}=•••REDACTED•••`);

  // JSON-like "token":"..."
  t = t.replace(/"?(token|password|pass|secret|client_secret|api[_-]?key)"?\s*:\s*"([^"]+)"/gi, (m,k)=> `"${k}":"•••REDACTED•••"`);

  // SSH private key blocks
  t = t.replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, '-----BEGIN PRIVATE KEY-----\n•••REDACTED KEY MATERIAL•••\n-----END PRIVATE KEY-----');

  // Email addresses
  t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 'user@redacted');

  return t;
}

/* -------------------- Badges & Utils -------------------- */
function badgeSeverity(s){
  const map = {
    'DEBUG':'badge-debug',
    'INFO':'badge-info',
    'WARN':'badge-warn',
    'ERROR':'badge-error'
  };
  const cls = map[s] || 'badge-secondary';
  return `<span class="badge ${cls}">${escapeHtml(s||'—')}</span>`;
}

function escapeHtml(str){ return String(str ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(str){ return String(str ?? '').replace(/"/g,'&quot;'); }
