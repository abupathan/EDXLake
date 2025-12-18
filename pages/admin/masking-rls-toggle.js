// EDX — Masking & Row-level Controls (production-grade)
// Features: robust toggles w/ confirmation, search/filter/sort/pagination for ABAC rules,
// CRUD via modal, CSV preview/copy, Bootstrap-first modal fallback, localStorage demo persistence.

const $ = (s, r=document) => r.querySelector(s);
const main = $('#app-main');

const SRC_URL = 'masking-rls-toggle.json';
const LS_KEY  = 'edx_masking_rls_v1';

let model = { meta:{}, masking:{enabled:true, default_strategy:'FULL_MASK', strategies:[]}, rls:{enabled:true, active:[], notes:{}} };

const ui = {
  q: '',
  dim: 'All',       // dimension filter
  sortKey: 'dim',   // 'dim' | 'value'
  sortDir: 'asc',
  page: 1,
  size: 10
};

let editingIndex = -1;

// ---------- Bootstrap-first modal with safe fallback ----------
function hasBS(){ return !!(window.bootstrap && typeof window.bootstrap.Modal === 'function'); }
function ensureInBody(el){ if(el?.parentElement !== document.body) document.body.appendChild(el); return el; }
function openModal(id){
  const el = ensureInBody($(id));
  if (hasBS()){
    const prev = window.bootstrap.Modal.getInstance(el); if(prev) prev.dispose?.();
    const inst = new window.bootstrap.Modal(el, { backdrop:true, keyboard:true, focus:true });
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

// --------------------- Init / Load ----------------------------
init().catch(console.error);

async function init(){
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    try { model = JSON.parse(saved); }
    catch { model = await fetchSource(); }
  } else {
    model = await fetchSource();
  }
  render();
}
async function fetchSource(){
  try { return await fetch(SRC_URL, { cache:'no-store' }).then(r=>r.json()); }
  catch { return { meta:{}, masking:{enabled:false, default_strategy:'FULL_MASK', strategies:[]}, rls:{enabled:false, active:[]} }; }
}
function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify(model)); alert('Saved (demo): Settings stored in your browser.'); }
function resetLocal(){ localStorage.removeItem(LS_KEY); init(); }

// --------------------- Rendering ------------------------------
function render(){
  // Build derived rows for rules
  const rules = (model.rls?.active||[]).map((s,i)=>parseRule(s,i));
  const dims = ['All', ...Array.from(new Set(rules.map(r=>r.dim))).sort()];

  // filter/search/sort
  const q = ui.q.trim().toLowerCase();
  let rows = rules.filter(r=>{
    const hay = `${r.dim}:${r.value} ${r.notes||''}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okD = ui.dim==='All' || r.dim===ui.dim;
    return okQ && okD;
  });
  rows.sort((a,b)=>{
    const dir = ui.sortDir==='asc'?1:-1;
    const ka = String(a[ui.sortKey]||'').toLowerCase();
    const kb = String(b[ui.sortKey]||'').toLowerCase();
    return (ka<kb?-1:ka>kb?1:0) * dir;
  });

  // pagination
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/ui.size));
  ui.page = Math.min(Math.max(1, ui.page), pages);
  const start = (ui.page-1)*ui.size;
  const pageRows = rows.slice(start, start+ui.size);

  main.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 sticky-toolbar">
      <div class="d-flex align-items-center gap-2">
        <h1 class="h4 mb-0">Masking & Row-level Controls</h1>
        <span class="kpi"><span class="dot"></span> Strategies: ${(model.masking?.strategies||[]).length}</span>
        <span class="kpi"><span class="dot"></span> Rules: ${rules.length}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="btn-group btn-group-sm" role="group" aria-label="Save/Reset">
          <button id="btnExport" class="btn btn-outline-secondary">Export CSV</button>
          <button id="btnReset" class="btn btn-outline-danger">Reset to Source</button>
          <button id="btnSave" class="btn btn-success">Save</button>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <!-- Masking -->
      <div class="col-12 col-xxl-6">
        <div class="card card-elevated h-100">
          <div class="card-header bg-body d-flex align-items-center justify-content-between">
            <strong>Masking Enforcement</strong>
            <span class="badge ${model.masking?.enabled?'text-bg-success':'text-bg-secondary'}">${model.masking?.enabled?'Enabled':'Disabled'}</span>
          </div>
          <div class="card-body">
            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" id="maskToggle" ${model.masking?.enabled?'checked':''}>
              <label class="form-check-label" for="maskToggle">Enforce masking across SQL / APIs / Exports / Shares</label>
            </div>
            <div class="row g-3">
              <div class="col-md-7">
                <label class="form-label">Default Strategy for <code>PII_STRICT</code></label>
                <select id="maskStrategy" class="form-select form-select-sm">
                  ${(model.masking?.strategies||[]).map(s=>`<option ${s===model.masking?.default_strategy?'selected':''}>${s}</option>`).join('')}
                </select>
              </div>
              <div class="col-md-5">
                <label class="form-label">Quick Info</label>
                <div class="inline-json small">Active: ${esc(model.masking?.default_strategy||'')}</div>
              </div>
            </div>
          </div>
          <div class="card-footer small text-body-secondary">
            Changes are logged in Audit Logs. Use the <strong>Policy Simulator</strong> to verify effects before enabling.
          </div>
        </div>
      </div>

      <!-- RLS -->
      <div class="col-12 col-xxl-6">
        <div class="card card-elevated h-100">
          <div class="card-header bg-body d-flex align-items-center justify-content-between">
            <strong>Row-level Security (RLS)</strong>
            <span class="badge ${model.rls?.enabled?'text-bg-success':'text-bg-secondary'}">${model.rls?.enabled?'Enabled':'Disabled'}</span>
          </div>
          <div class="card-body">
            <div class="form-check form-switch mb-3">
              <input class="form-check-input" type="checkbox" id="rlsToggle" ${model.rls?.enabled?'checked':''}>
              <label class="form-check-label" for="rlsToggle">Enable RLS enforcement</label>
            </div>

            <div class="d-flex flex-wrap gap-2 mb-2">
              <div class="input-group input-group-sm search-wrap">
                <span class="input-group-text">Search</span>
                <input id="q" class="form-control" placeholder="dim:value, notes…" value="${escAttr(ui.q)}">
              </div>
              <div class="input-group input-group-sm" style="width:auto;">
                <label class="input-group-text">Dimension</label>
                <select id="fDim" class="form-select form-select-sm">
                  ${dims.map(d=>`<option ${d===ui.dim?'selected':''}>${d}</option>`).join('')}
                </select>
              </div>
              <div class="input-group input-group-sm" style="width:auto;">
                <label class="input-group-text">Rows/page</label>
                <select id="pageSize" class="form-select form-select-sm">
                  ${[10,25,50,100].map(n=>`<option value="${n}" ${n===ui.size?'selected':''}>${n}</option>`).join('')}
                </select>
              </div>
              <button id="btnNewRule" class="btn btn-primary btn-sm">New Rule</button>
            </div>

            <div class="table-responsive">
              <table class="table align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    ${th('dim','Dimension')}
                    ${th('value','Value')}
                    <th>Notes</th>
                    <th class="text-end" style="width:140px">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${pageRows.map((r,i)=>trRule(r, start+i)).join('')}
                  ${pageRows.length? '' : `<tr><td colspan="4" class="text-center text-body-secondary py-4">No rules</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
          <div class="card-footer d-flex align-items-center justify-content-between">
            <small class="text-body-secondary">ABAC rules scope access by org/campus/department/program/term/purpose.</small>
            <nav><ul class="pagination pagination-sm mb-0">${pagesHtml(ui.page, pages)}</ul></nav>
          </div>
        </div>
      </div>
    </div>
  `;

  // wire: global actions
  $('#btnSave').addEventListener('click', saveLocal);
  $('#btnReset').addEventListener('click', resetLocal);
  $('#btnExport').addEventListener('click', ()=>exportCSV(rules));

  // wire: masking controls
  $('#maskToggle').addEventListener('change', (e)=> confirmToggle('masking', e.target.checked));
  $('#maskStrategy').addEventListener('change', (e)=> { model.masking.default_strategy = e.target.value; });

  // wire: rls controls
  $('#rlsToggle').addEventListener('change', (e)=> confirmToggle('rls', e.target.checked));
  $('#q').addEventListener('input', e=>{ ui.q=e.target.value; ui.page=1; render(); });
  $('#fDim').addEventListener('change', e=>{ ui.dim=e.target.value; ui.page=1; render(); });
  $('#pageSize').addEventListener('change', e=>{ ui.size=Number(e.target.value)||10; ui.page=1; render(); });
  $('#btnNewRule').addEventListener('click', ()=>openRuleEditor(null));

  // sorting + pagination + row actions
  main.querySelectorAll('th[data-sort-key]').forEach(thEl=>{
    thEl.addEventListener('click', ()=>{
      const key = thEl.getAttribute('data-sort-key');
      if (ui.sortKey === key) ui.sortDir = (ui.sortDir==='asc'?'desc':'asc');
      else { ui.sortKey = key; ui.sortDir = 'asc'; }
      render();
    });
  });
  main.querySelectorAll('.pagination [data-page]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ui.page = Number(btn.getAttribute('data-page')); render(); });
  });
  main.addEventListener('click', onRuleAction);
}

// --------------------- Helpers -------------------------------
function parseRule(s, i){
  // supported formats: "scope:org", "purpose:operational", "campus=north_hs"
  const m = String(s).match(/^([^:=\s]+)\s*[:=]\s*(.+)$/);
  const dim = m ? m[1].trim() : 'unknown';
  const value = m ? m[2].trim() : s;
  const notes = model.rls?.notes?.[s] || '';
  return { raw:s, dim, value, notes, index: i };
}
function th(key,label){
  const active = ui.sortKey===key;
  const arrow = active ? (ui.sortDir==='asc'?'▲':'▼') : '';
  return `<th data-sort-key="${key}" role="button">${label} <span class="sort">${arrow}</span></th>`;
}
function trRule(r, idx){
  return `
    <tr>
      <td>${esc(r.dim)}</td>
      <td><span class="badge rounded-pill policy-chip">${esc(r.value)}</span></td>
      <td class="small">${esc(r.notes||'')}</td>
      <td class="text-end tbl-tools">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-act="edit" data-idx="${idx}" type="button">Edit</button>
          <button class="btn btn-outline-danger" data-act="del" data-idx="${idx}" type="button">Delete</button>
        </div>
      </td>
    </tr>
  `;
}
function pagesHtml(page,total){
  const out=[];
  const add=(n,l=n,dis=false)=> out.push(`<li class="page-item ${n===page?'active':''} ${dis?'disabled':''}">
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

// --------------------- Actions: toggles -----------------------
function confirmToggle(kind, nextVal){
  const prevVal = (kind==='masking' ? !!model.masking.enabled : !!model.rls.enabled);
  // if no change, nothing to do
  if (prevVal === nextVal) return;

  $('#confirmToggleLabel').textContent = `Confirm ${kind === 'masking' ? 'Masking' : 'RLS'} ${nextVal ? 'Enable' : 'Disable'}`;
  $('#confirmToggleMsg').textContent = nextVal
    ? `Turning ON ${kind==='masking'?'Masking':'RLS'} enforces rules on all access paths. Proceed?`
    : `Turning OFF ${kind==='masking'?'Masking':'RLS'} removes enforcement. This is logged. Proceed?`;

  // set handler
  $('#btnConfirmToggle').onclick = ()=>{
    if (kind==='masking') model.masking.enabled = nextVal;
    else model.rls.enabled = nextVal;
    closeModal('#confirmToggleModal');
    render();
  };
  openModal('#confirmToggleModal');
}

// --------------------- Actions: rules CRUD --------------------
function onRuleAction(e){
  const btn = e.target.closest('button[data-act]'); if(!btn) return;
  const idx = Number(btn.getAttribute('data-idx'));
  const act = btn.getAttribute('data-act');
  if (act==='edit') return openRuleEditor(idx);
  if (act==='del')  return deleteRule(idx);
}
function openRuleEditor(index){
  editingIndex = (index ?? -1);
  const rules = (model.rls?.active||[]).map((s,i)=>parseRule(s,i));
  const row = editingIndex>=0 ? rules[editingIndex] : { dim:'', value:'', notes:'' };

  $('#ruleModalLabel').textContent = editingIndex>=0 ? `Edit Rule — ${row.dim}:${row.value}` : 'New ABAC Rule';
  $('#rDim').value = row.dim || '';
  $('#rVal').value = row.value || '';
  $('#rNotes').value = row.notes || '';
  ['rDim','rVal'].forEach(id=>$('#'+id).classList.remove('is-invalid'));
  $('#btnSaveRule').onclick = saveRuleFromModal;
  openModal('#ruleModal');
}
function saveRuleFromModal(){
  const dim = $('#rDim').value.trim();
  const val = $('#rVal').value.trim();
  const notes = $('#rNotes').value.trim();
  let ok = true;
  if(!dim){ $('#rDim').classList.add('is-invalid'); ok=false; } else $('#rDim').classList.remove('is-invalid');
  if(!val){ $('#rVal').classList.add('is-invalid'); ok=false; } else $('#rVal').classList.remove('is-invalid');
  if(!ok) return;

  const raw = `${dim}:${val}`;
  const list = model.rls.active || (model.rls.active = []);
  if (editingIndex>=0){
    const oldRaw = list[editingIndex];
    list[editingIndex] = raw;
    // notes map
    model.rls.notes = model.rls.notes || {};
    delete model.rls.notes[oldRaw];
    if (notes) model.rls.notes[raw] = notes;
  } else {
    // avoid duplicates
    if (list.some(s => s.toLowerCase() === raw.toLowerCase())) { alert('Duplicate rule.'); return; }
    list.push(raw);
    model.rls.notes = model.rls.notes || {};
    if (notes) model.rls.notes[raw] = notes;
  }
  closeModal('#ruleModal');
  render();
}
function deleteRule(index){
  const list = model.rls.active || [];
  const raw = list[index]; if(!raw) return;
  if (confirm(`Delete rule "${raw}"?`)){
    list.splice(index,1);
    if (model.rls.notes) delete model.rls.notes[raw];
    render();
  }
}

// --------------------- Export CSV -----------------------------
function exportCSV(rules){
  const hdr1 = ['Masking Enabled','Default Strategy','Strategies'];
  const row1 = [ !!model.masking.enabled ? 'Yes' : 'No', model.masking.default_strategy || '', (model.masking.strategies||[]).join('|') ];
  const hdr2 = ['RLS Enabled','Total Rules'];
  const row2 = [ !!model.rls.enabled ? 'Yes' : 'No', rules.length ];
  const hdr3 = ['Dim','Value','Notes'];
  const body3 = rules.map(r=>[r.dim,r.value,r.notes||'']);

  const csv = toCSV([hdr1, row1, [], hdr2, row2, [], hdr3, ...body3]);

  $('#csvModalLabel').textContent = `CSV Preview — masking_rls_${ts()}.csv`;
  $('#csvPreview').textContent = csv;
  $('#btnCopyCsv').onclick = async ()=>{ try{ await navigator.clipboard.writeText(csv); alert('Copied!'); } catch{ alert('Copy failed'); } };
  openModal('#csvModal');
}

// --------------------- Utils ---------------------------------
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escAttr(v){ return esc(v).replace(/"/g,'&quot;'); }
function toCSV(rows){ const BOM='\uFEFF'; return BOM + rows.map(r=>r.map(c=>csvCell(c)).join(',')).join('\r\n'); }
function csvCell(v){ const s=String(v??''); return /[",\r\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
