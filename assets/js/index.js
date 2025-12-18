/* assets/js/index.js
 * EduData Exchange (EDX) – Core UI script
 * - Theme management (light/dark/system) with first-paint mitigation
 * - Accessible table pagination (WCAG 2.1 AA)
 * - Safe JSON table feeding (no innerHTML)
 * - Header behavior: brand home → role landing, search, sign-out, user hydrate
 */

const EDX = (() => {
  const ns = {};

  ns.store = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
    del(key) { try { localStorage.removeItem(key); } catch {} }
  };

  ns.setText = (el, text) => { if (el) el.textContent = String(text ?? ""); };

  ns.el = (tag, attrs = {}, text) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k === "dataset") Object.entries(v || {}).forEach(([dk, dv]) => e.dataset[dk] = dv);
      else if (k === "aria") Object.entries(v || {}).forEach(([ak, av]) => e.setAttribute(`aria-${ak}`, av));
      else e.setAttribute(k, v);
    }
    if (text != null) ns.setText(e, text);
    return e;
  };

  ns.media = (q) => window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener: () => {} };

  ns.route = {
    path() { return location.pathname.replace(/\/+$/, "") || "/"; },
    isActive(href) {
      if (!href) return false;
      try {
        const url = new URL(href, location.origin);
        const p = url.pathname.replace(/\/+$/, "") || "/";
        return p === ns.route.path();
      } catch { return false; }
    }
  };

  ns.user = {
    get() { return ns.store.get("edx:user", null); },
    set(u) { ns.store.set("edx:user", u); },
    clear() { ns.store.del("edx:user"); },
    roleHome(role) {
      const map = { admin: "/pages/admin/landing.html",
                    engineer: "/pages/engineer/landing.html",
                    steward: "/pages/steward/landing.html",
                    consumer: "/pages/consumer/landing.html" };
      return map[role] || "/";
    }
  };

  return ns;
})();

/* ---------- Theme ---------- */

const THEME_KEY = "edx:theme";
const THEME_ATTR = "data-bs-theme";

function getSystemTheme() {
  return EDX.media("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function getSavedTheme() {
  const t = EDX.store.get(THEME_KEY, "system");
  return t === "light" || t === "dark" || t === "system" ? t : "system";
}
function computeActiveTheme(saved) { return saved === "system" ? getSystemTheme() : saved; }
function applyTheme(theme) {
  const active = computeActiveTheme(theme);
  document.documentElement.setAttribute(THEME_ATTR, active);
  document.body.classList.remove("theme-light", "theme-dark");
  document.body.classList.add(`theme-${active}`);
}
function initTheme() {
  const saved = getSavedTheme();
  applyTheme(saved);
  const mq = EDX.media("(prefers-color-scheme: dark)");
  if (mq && typeof mq.addEventListener === "function") {
    mq.addEventListener("change", () => { if (getSavedTheme() === "system") applyTheme("system"); });
  }
  const btn = document.getElementById("themeToggle");
  if (btn) {
    const syncAria = (savedMode) => {
      const active = computeActiveTheme(savedMode);
      btn.setAttribute("aria-pressed", active === "dark" ? "true" : "false");
      btn.dataset.theme = savedMode; btn.title = `Theme: ${savedMode} (active: ${active})`;
    };
    syncAria(saved);
    btn.addEventListener("click", () => {
      const order = ["light", "dark", "system"];
      const current = getSavedTheme();
      const next = order[(order.indexOf(current) + 1) % order.length];
      EDX.store.set(THEME_KEY, next); applyTheme(next); syncAria(next);
    });
  }
}
try { applyTheme(getSavedTheme()); } catch {}

/* ---------- Paginator ---------- */

class EdxPaginator {
  constructor(container) {
    this.container = container;
    this.pageKey = container.getAttribute("data-edx-pagekey") || location.pathname;
    this.table = container.querySelector("table");
    this.tbody = this.table ? this.table.querySelector("tbody") : null;
    this.defaultPageSize = parseInt(container.getAttribute("data-edx-pagesize") || "25", 10);
    this.state = { pageSize: this._loadPageSize(), pageIndex: 0 };
    this.rows = [];

    this.controlsRoot = container.querySelector("[data-edx-pagination-controls]") || this._autoCreateControls();
    this.live = container.querySelector("[data-edx-page-live]") || this._createLiveRegion();
    this._wireControls();

    const src = container.getAttribute("data-edx-datasource");
    if (src) { this.feedFromJSON(src).then(() => this.render()).catch(() => this.render()); }
    else { this.rows = this.tbody ? Array.from(this.tbody.rows) : []; this.render(); }
  }

  async feedFromJSON(url) {
    const tryFetch = async (attempt) => {
      const res = await fetch(attempt, { credentials: "same-origin" });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    };
    let data = null;
    for (let i = 0; i <= 3 && !data; i++) {
      const prefix = "../".repeat(i);
      try { data = await tryFetch(prefix + url); } catch {}
    }
    if (!Array.isArray(data) || !this.tbody) return;
    this.tbody.innerHTML = "";
    const td = (txt) => { const c = document.createElement("td"); EDX.setText(c, txt); return c; };
    data.forEach((r) => {
      const tr = document.createElement("tr");
      tr.append(td(r.when), td(r.area), td(r.action), td(r.actor));
      const res = td(r.result); if (r.resultClass) res.className = r.resultClass; tr.append(res);
      this.tbody.appendChild(tr);
    });
    this.rows = Array.from(this.tbody.rows);
  }

  _loadPageSize() {
    const key = `edx:pgsize:${this.pageKey}`;
    const saved = parseInt(EDX.store.get(key, this.defaultPageSize), 10);
    return Number.isFinite(saved) && saved > 0 ? saved : this.defaultPageSize;
  }
  _savePageSize(val) { const key = `edx:pgsize:${this.pageKey}`; EDX.store.set(key, parseInt(val, 10)); }
  _countPages() { return Math.max(1, Math.ceil((this.rows?.length || 0) / this.state.pageSize)); }
  _createLiveRegion() { const n = EDX.el("div", { class: "visually-hidden", aria: { live: "polite" } }); n.setAttribute("data-edx-page-live",""); this.container.appendChild(n); return n; }
  _btn(label, action) { const b = EDX.el("button", { type:"button", class:"btn btn-outline-secondary btn-sm" }, label); b.setAttribute("data-edx-pager", action); return b; }
  _autoCreateControls() {
    const footer = EDX.el("div", { class:"d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-2 mt-3", "data-edx-pagination-controls":"" });
    const summary = EDX.el("div", { class:"small text-body-secondary", "data-edx-page-summary":"" });
    const controls = EDX.el("div", { class:"d-flex align-items-center gap-2" });
    const label = EDX.el("label", { class:"form-label mb-0", for:`pgsize-${this._uid()}` }, "Rows per page");
    const select = EDX.el("select", { class:"form-select form-select-sm", id:label.getAttribute("for") });
    ["10","25","50","100"].forEach((sz)=>{ const o=EDX.el("option",{value:sz},sz); if(parseInt(sz,10)===this.state.pageSize) o.selected=true; select.appendChild(o); });
    const btnFirst=this._btn("« First","first"), btnPrev=this._btn("‹ Prev","prev"), btnNext=this._btn("Next ›","next"), btnLast=this._btn("Last »","last");
    controls.append(label,select,btnFirst,btnPrev,btnNext,btnLast); footer.append(summary,controls);
    (this.table?.parentNode || this.container).appendChild(footer); return footer;
  }
  _uid(){ return Math.random().toString(36).slice(2,8); }
  _wireControls(){
    const sizeSel = this.controlsRoot.querySelector("select");
    if (sizeSel) sizeSel.addEventListener("change", () => {
      const v = parseInt(sizeSel.value,10); if(Number.isFinite(v)&&v>0){ this.state.pageSize=v; this.state.pageIndex=0; this._savePageSize(v); this.render(true); }
    });
    const onClick = (delta) => {
      const pages = this._countPages(); let idx = this.state.pageIndex + delta;
      if (delta === "first") idx = 0; if (delta === "last") idx = pages - 1;
      if (typeof delta === "number") idx = Math.max(0, Math.min(pages - 1, idx));
      if (idx !== this.state.pageIndex) { this.state.pageIndex = idx; this.render(true); }
    };
    this.controlsRoot.querySelectorAll("[data-edx-pager]").forEach((b)=>{
      const a=b.getAttribute("data-edx-pager");
      if(a==="first") b.addEventListener("click",()=>onClick("first"));
      if(a==="prev")  b.addEventListener("click",()=>onClick(-1));
      if(a==="next")  b.addEventListener("click",()=>onClick(+1));
      if(a==="last")  b.addEventListener("click",()=>onClick("last"));
    });
  }
  render(announce=false){
    if(!this.tbody) return;
    const total = this.rows.length, pages=this._countPages();
    this.state.pageIndex = Math.max(0, Math.min(pages-1, this.state.pageIndex));
    const start=this.state.pageIndex*this.state.pageSize, end=Math.min(total,start+this.state.pageSize);
    this.rows.forEach((tr,i)=>{ tr.style.display = (i>=start && i<end) ? "" : "none"; });
    const summary=this.controlsRoot.querySelector("[data-edx-page-summary]")||this.controlsRoot;
    const pageLabel=`Page ${this.state.pageIndex+1} of ${pages}`, rowLabel= total ? `Showing ${start+1}–${end} of ${total}` : "No records";
    EDX.setText(summary, `${pageLabel} • ${rowLabel}`); if(announce&&this.live) EDX.setText(this.live, `${pageLabel}. ${rowLabel}.`);
    const atFirst=this.state.pageIndex===0, atLast=this.state.pageIndex>=pages-1;
    const setDis=(sel,dis)=>{ this.controlsRoot.querySelectorAll(sel).forEach((b)=>{ b.disabled=dis; b.setAttribute("aria-disabled", dis ? "true":"false"); }); };
    setDis('[data-edx-pager="first"],[data-edx-pager="prev"]', atFirst);
    setDis('[data-edx-pager="next"],[data-edx-pager="last"]', atLast);
    this.container.classList.toggle("is-empty", total===0);
  }
}

/* ---------- Header: active link, search, sign-out, brand home ---------- */

function initHeaderActiveLink() {
  document.querySelectorAll('#sidebarNav a.nav-link, header nav a.nav-link').forEach((a) => {
    if (EDX.route.isActive(a.getAttribute("href"))) { a.classList.add("active"); a.setAttribute("aria-current", "page"); }
  });
}

function initHeaderSearch() {
  const form = document.querySelector('form[role="search"]');
  const input = form ? form.querySelector('input[name="q"]') : null;
  if (!form || !input) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = (input.value || "").trim();
    // Route queries to Docs (static) to avoid dead links.
    const target = `/docs/index.html${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    location.assign(target);
  });
}

function hydrateUserMenu() {
  const u = EDX.user.get();
  const nameEl = document.getElementById("currentUserName");
  const roleEl = document.getElementById("currentUserRole");
  if (u) {
    if (nameEl) EDX.setText(nameEl, u.name || "User");
    if (roleEl) EDX.setText(roleEl, (u.role || "Unknown").toUpperCase());
  } else {
    if (nameEl) EDX.setText(nameEl, "Guest");
    if (roleEl) EDX.setText(roleEl, "VIEW");
    // Swap Sign out → Sign in for guests
    const menu = document.querySelector('ul.dropdown-menu');
    if (menu) {
      const last = menu.querySelector('a[href="/auth/signout.html"]');
      if (last) { last.setAttribute("href","/auth/signin.html"); last.textContent = "Sign in"; }
    }
  }
}

function initSignOut() {
  document.querySelectorAll('a[href="/auth/signout.html"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      // preserve theme, clear user + any demo state
      const theme = localStorage.getItem("edx:theme");
      localStorage.clear();
      if (theme) localStorage.setItem("edx:theme", theme);
      location.assign("/auth/signin.html");
    });
  });
}

function initBrandHomeRouting() {
  const brand = document.querySelector('a.navbar-brand');
  if (!brand) return;
  brand.addEventListener("click", (e) => {
    const u = EDX.user.get();
    if (u && u.role) {
      e.preventDefault();
      location.assign(EDX.user.roleHome(u.role));
    }
    // if no user, default link (/) proceeds
  });
}

/* ---------- Boot ---------- */

function initPagination() { document.querySelectorAll("[data-edx-paginate]").forEach((el) => { try { new EdxPaginator(el); } catch {} }); }

function ready(fn) { document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn, { once: true }) : fn(); }

ready(() => {
  initTheme();
  initHeaderActiveLink();
  initHeaderSearch();
  hydrateUserMenu();
  initSignOut();
  initBrandHomeRouting();
  initPagination();
});

// Expose
window.EDX = Object.assign(window.EDX || {}, { applyTheme, initTheme, initPagination, utils: EDX });
