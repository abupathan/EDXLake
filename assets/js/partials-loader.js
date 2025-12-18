/* EDX Partials Loader — Production build (CSP-safe, auto-boot)
 * Responsibilities:
 *  - Inject header/footer/sidebar fragments on every page (no inline JS)
 *  - Hydrate header user chip from localStorage.edx:user (set by signin)
 *  - Restore Dark Mode toggle + persist theme
 *  - Restore Global Catalog Search (if #globalSearchForm/#globalSearchInput exist)
 *  - Enforce auth on protected pages (redirect to signin.html if role/session missing)
 *  - Auto-boot on load (works for all roles/pages under /pages/*) — no page code changes required
 *
 * Partials expected:
 *   <base>/partials/header.html
 *   <base>/partials/footer.html
 *   <base>/partials/sidebar-<role>.html
 *
 * Notes:
 *  - “base” is computed from location.pathname by stripping the /pages/... tail.
 *    Example: /EDX/pages/consumer/catalog-browse.html  -> base = /EDX
 *  - Role is sourced from <body data-edx-sidebar="..."> or localStorage.edx:user.role (fallback "consumer")
 */

(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  /* ---------- compute base (prefix before /pages/) ---------- */
  function computeBaseFromPathname() {
    const p = location.pathname;
    const idx = p.indexOf('/pages/');
    if (idx === -1) return ''; // served at root; partials live at /partials/*
    const base = p.slice(0, idx) || '';
    return base.endsWith('/') ? base.slice(0, -1) : base;
  }

  const PARTIALS = {
    header: (base)         => `${base}/partials/header.html`,
    footer: (base)         => `${base}/partials/footer.html`,
    sidebar: (base, role)  => `${base}/partials/sidebar-${role||'consumer'}.html`,
  };

  const PROTECTED_ROLE_SEGMENTS = ["/pages/consumer/", "/pages/steward/", "/pages/engineer/", "/pages/admin/"];

  /* ---------- utils ---------- */
  function sanitizeNoScripts(html){
    return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  }
  async function fetchText(url){
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return sanitizeNoScripts(await res.text());
  }
  async function inject(sel, url){
    const host = $(sel);
    if (!host) return null;
    try {
      host.innerHTML = await fetchText(url);
      return host;
    } catch (e) {
      console.warn("[EDX] Failed to load partial", { sel, url, e });
      host.innerHTML = `<div class="alert alert-warning small mb-0">Failed to load: ${url}</div>`;
      return null;
    }
  }

  /* ---------- session / auth ---------- */
  function readUser(){
    try { return JSON.parse(localStorage.getItem("edx:user") || "null") || null; }
    catch { return null; }
  }
  function requireAuthIfProtected(){
    const path = location.pathname;
    const isProtected = PROTECTED_ROLE_SEGMENTS.some(seg => path.includes(seg));
    if (!isProtected) return;

    const u = readUser();
    const validRole = !!(u && typeof u.role === "string" && u.role.trim().length > 0);
    if (!validRole) {
      // robust relative redirect to signin.html without changing any of your paths
      const candidates = ["signin.html", "../signin.html", "../../signin.html", "/signin.html"];
      for (const c of candidates) { location.href = c; return; }
    }
  }

  /* ---------- header hydration ---------- */
  function applyUserToHeader(scope=document){
    const u = readUser();
    const name  = u?.name || (u?.email ? u.email.split("@")[0] : "user");
    const email = u?.email || "user@example.edu";
    const role  = (u?.role || "consumer").replace(/_/g," ");
    $("#currentUserName", scope)?.replaceChildren(document.createTextNode(name));
    $("#currentUserRole", scope)?.replaceChildren(document.createTextNode(role));
    $("#menuUserName", scope)?.replaceChildren(document.createTextNode(name));
    $("#menuUserEmail", scope)?.replaceChildren(document.createTextNode(email));
  }

  /* ---------- dark mode ---------- */
  const THEME_KEY = "edx:theme";
  function getTheme(){
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
    return document.documentElement.getAttribute("data-bs-theme") || "light";
  }
  function setTheme(t){
    document.documentElement.setAttribute("data-bs-theme", t);
    localStorage.setItem(THEME_KEY, t);
  }
  function wireThemeToggle(scope=document){
    const btn = $("#themeToggle", scope);
    if (!btn) return;
    btn.classList.remove("d-none");                              /* header has the control (CSP-safe) */
    const icon = btn.querySelector("i");
    const refreshIcon = () => {
      if (!icon) return;
      const cur = getTheme();
      icon.classList.remove("bi-moon", "bi-sun");
      icon.classList.add(cur === "dark" ? "bi-sun" : "bi-moon");
      btn.setAttribute("aria-label", cur === "dark" ? "Switch to light mode" : "Switch to dark mode");
    };
    setTheme(getTheme());
    refreshIcon();
    btn.addEventListener("click", () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      setTheme(next);
      refreshIcon();
    });
  }

  /* ---------- global catalog search (header) ---------- */
  function wireGlobalSearch(scope=document){
    const form  = $("#globalSearchForm", scope);
    const input = $("#globalSearchInput", scope);
    if (!form || !input) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q.length) {
        location.href = `/pages/consumer/catalog-browse.html?q=${encodeURIComponent(q)}`; // stays within consumer browse page
      } else {
        location.href = `/pages/consumer/catalog-browse.html`;
      }
    });
  }

  /* ---------- sidebar helpers ---------- */
  function markActiveLinks(scope=document){
    const here = location.pathname.replace(/\/+$/, "");
    $$("a[href]", scope).forEach(a => {
      const href = a.getAttribute("href") || "";
      const target = new URL(href, location.origin).pathname.replace(/\/+$/, "");
      if (target === here) a.classList.add("active");
    });
  }
  function syncRoleInStorage(role){
    if (!role) return;
    const u = readUser() || {};
    if (u.role !== role) localStorage.setItem("edx:user", JSON.stringify({ ...u, role }));
  }

  /* ---------- public API ---------- */
  async function loadPartials({ base, role } = {}){
    // auth check
    requireAuthIfProtected();

    // compute defaults
    const resolvedBase = base ?? computeBaseFromPathname();
    const pageRoleAttr = document.body?.getAttribute("data-edx-sidebar");
    const resolvedRole = (role || pageRoleAttr || readUser()?.role || "consumer").toLowerCase();

    // header
    await inject("#app-header", PARTIALS.header(resolvedBase));
    applyUserToHeader();
    wireThemeToggle(document);
    wireGlobalSearch(document);

    // sidebar
    syncRoleInStorage(resolvedRole);
    const s = await inject("#app-sidebar", PARTIALS.sidebar(resolvedBase, resolvedRole));
    if (s) markActiveLinks(s);

    // footer
    await inject("#app-footer", PARTIALS.footer(resolvedBase));

    // live updates (multi-tab)
    window.addEventListener("storage", (e) => {
      if (e.key === "edx:user") applyUserToHeader();
      if (e.key === THEME_KEY)  setTheme(getTheme());
    });
  }

  // expose + AUTO-BOOT
  window.EDXPartials = { loadPartials, applyUserToHeader };
  // Auto-run after DOM is ready; no page-specific edits required
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => loadPartials().catch(console.error));
  } else {
    loadPartials().catch(console.error);
  }
})();
