/* EDX Privacy Page
 * - CSP-safe: no inline scripts/styles
 * - Mounts header/footer partials (sanitizes to strip <script> blocks)
 * - Builds sticky TOC from h2 elements
 * - Paginates Sub-processors table (accessible controls)
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
  const headings = $$('#policy-main h2');
  headings.forEach((h2, i) => {
    if (!h2.id) h2.id = `sec-${i+1}`;
    const li = document.createElement('li');
    li.className = 'mb-2';
    li.innerHTML = `<a class="link-body-emphasis text-decoration-none" href="#${h2.id}">${h2.textContent}</a>`;
    toc.appendChild(li);
  });

  // Active section highlight on scroll
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

/* ---------- Sub-processors pagination ---------- */
function paginateSubp(){
  const tbody = $('#subp-table tbody');
  const rows  = Array.from(tbody.querySelectorAll('tr'));
  const sizeSel = $('#subp-size');
  const pageInput = $('#subp-page');
  const pagesLabel = $('#subp-pages-label');
  const count = $('#subp-count');
  let size = parseInt(sizeSel.value, 10) || 5;
  let page = parseInt(pageInput.value, 10) || 1;

  const render = () => {
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total/size));
    page = Math.min(Math.max(1, page), pages);
    rows.forEach((tr, idx) => {
      const start = (page-1)*size;
      const end   = start + size;
      tr.style.display = (idx >= start && idx < end) ? '' : 'none';
    });
    pageInput.value = String(page);
    pagesLabel.textContent = `of ${Math.max(1, Math.ceil(total/size))}`;
    count.textContent = total
      ? `Showing ${ (page-1)*size + 1 }–${ Math.min(page*size, total) } of ${ total }`
      : 'No entries';
    // Enable/disable buttons
    const host = document.querySelector('[data-paginate-subp]');
    host.querySelector('[data-first]').disabled = page === 1;
    host.querySelector('[data-prev]').disabled  = page === 1;
    host.querySelector('[data-next]').disabled  = page === Math.ceil(total/size);
    host.querySelector('[data-last]').disabled  = page === Math.ceil(total/size);
  };

  // Wire controls
  sizeSel.addEventListener('change', () => { size = parseInt(sizeSel.value, 10) || 5; page = 1; render(); });
  pageInput.addEventListener('change', () => { page = parseInt(pageInput.value, 10) || 1; render(); });

  const host = document.querySelector('[data-paginate-subp]');
  host.querySelector('[data-first]').addEventListener('click', () => { page = 1; render(); });
  host.querySelector('[data-prev]').addEventListener('click',  () => { page = Math.max(1, page-1); render(); });
  host.querySelector('[data-next]').addEventListener('click',  () => {
    const total = rows.length; const pages = Math.max(1, Math.ceil(total/size));
    page = Math.min(pages, page+1); render();
  });
  host.querySelector('[data-last]').addEventListener('click',  () => {
    const total = rows.length; page = Math.max(1, Math.ceil(total/size)); render();
  });

  render();
}

/* ---------- Boot ---------- */
await mountShell();
buildTOC();
paginateSubp();
