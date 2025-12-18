/* EDX — Help: Using EDX Data
 * Renders lightweight guidance from JSON:
 * - Masking rules
 * - Purpose limits
 * - Exports etiquette
 * - Who to contact
 * CSP-safe (no inline JS/CSS). Keyboard and screen-reader friendly.
 */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const main = $('#main');

const DATA_URL = './help-using-edx-data.json';

async function load(){
  try{
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    render(d);
  }catch(e){
    console.error('[EDX] help load failed', e);
    main.innerHTML = `<div class="alert alert-danger">Failed to load help content.</div>`;
  }
}

function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }

function render(d){
  const anchors = `
    <nav class="nav nav-pills flex-wrap nav-anchors" aria-label="On this page">
      ${d.sections.map((s,i)=>`
        <a class="nav-link ${i===0?'active':''}" href="#${esc(s.id)}">${esc(s.title)}</a>
      `).join('')}
    </nav>`;

  const blocks = d.sections.map(s => sectionCard(s)).join('');

  main.innerHTML = `
    <header class="page-header">
      <h1 class="h4 mb-1">${esc(d.title)}</h1>
      <p class="lead lead-muted">${esc(d.subtitle)}</p>
    </header>

    <div class="row g-3">
      <div class="col-xl-9">
        ${blocks}
        <div class="card card-help mt-3">
          <div class="card-body small smallprint">
            <i class="bi bi-shield-lock" aria-hidden="true"></i>
            <span class="ms-1">${esc(d.footer_note)}</span>
          </div>
        </div>
      </div>

      <aside class="col-xl-3">
        <div class="card card-help">
          <div class="card-header"><strong>On this page</strong></div>
          <div class="card-body">
            ${anchors}
          </div>
        </div>
        <div class="card card-help mt-3">
          <div class="card-header"><strong>Quick contacts</strong></div>
          <div class="card-body">
            ${contacts(d.contacts)}
          </div>
        </div>
      </aside>
    </div>`;

  wireAnchors();
}

function sectionCard(s){
  const body = Array.isArray(s.points)
    ? `<ul class="list-unstyled list-tight mb-0">${s.points.map(p=>`<li class="d-flex">
         <i class="bi bi-check2-circle me-2 text-success" aria-hidden="true"></i>
         <span>${esc(p)}</span>
       </li>`).join('')}</ul>`
    : `<p class="mb-0">${esc(s.text||'')}</p>`;

  const examples = (s.examples||[]).length
    ? `<div class="mt-2"><div class="small text-body-secondary mb-1">Examples</div>
         <ul class="small list-unstyled list-tight mb-0">
           ${s.examples.map(e=>`<li><code>${esc(e)}</code></li>`).join('')}
         </ul></div>`
    : '';

  return `
    <section id="${esc(s.id)}" class="card card-help">
      <div class="card-header d-flex align-items-center gap-2">
        <i class="bi ${esc(s.icon||'bi-info-circle')}" aria-hidden="true"></i>
        <strong>${esc(s.title)}</strong>
      </div>
      <div class="card-body">
        ${s.intro ? `<p class="mb-2">${esc(s.intro)}</p>` : ''}
        ${body}
        ${examples}
        ${s.note ? `<div class="callout mt-3 small"><strong>Note:</strong> ${esc(s.note)}</div>` : ''}
      </div>
    </section>`;
}

function contacts(list){
  if (!Array.isArray(list) || !list.length) return '<div class="text-body-secondary">No contacts configured.</div>';
  return `<dl class="kv mb-0">
    ${list.map(c=>`
      <dt>${esc(c.role)}</dt>
      <dd>
        ${esc(c.name)} — <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>
        ${c.sla ? `<div class="small text-body-secondary">${esc(c.sla)}</div>` : ''}
      </dd>`).join('')}
  </dl>`;
}

function wireAnchors(){
  // basic active state update
  const links = $$('.nav-anchors .nav-link');
  const sections = $$('.card-help[id]');
  const obs = new IntersectionObserver((entries)=>{
    entries.forEach(en=>{
      if (en.isIntersecting){
        links.forEach(a=>a.classList.toggle('active', a.getAttribute('href') === `#${en.target.id}`));
      }
    });
  }, { rootMargin: '0px 0px -70% 0px', threshold: 0.1 });
  sections.forEach(sec=>obs.observe(sec));
}

load();
