/* EDX Partials Loader — GitHub Pages + root deploy safe (CSP-safe, auto-boot)
 *
 * FIXES vs your current file:
 * 1) Correct “base” for GitHub Pages *project* sites:
 *    - https://<user>.github.io/EDX/  => base "/EDX" (not "")
 *    - so partials load from /EDX/partials/... (not /partials/...)
 * 2) All navigation/search URLs are base-aware (won’t break on /EDX/).
 * 3) Sign-in redirect is base-aware.
 *
 * Partials expected:
 *   <base>/partials/header.html
 *   <base>/partials/footer.html
 *   <base>/partials/sidebar-<role>.html
 *
 * Optional:
 *   <body data-edx-sidebar="consumer|steward|engineer|admin">
 */

(function () {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- path helpers ---------- */
  function stripTrailingSlash(p) {
    return (p || "").replace(/\/+$/, "");
  }

  function ensureLeadingSlash(p) {
    const s = String(p || "");
    return s.startsWith("/") ? s : `/${s}`;
  }

  function join(base, rel) {
    const b = stripTrailingSlash(base || "");
    const r = String(rel || "").replace(/^\/+/, "");
    if (!b) return `/${r}`.replace(/^\/+/, "/");
    return `${b}/${r}`;
  }

  // Applies computed base to an app-relative path (e.g., "/pages/...").
  function withBase(base, appPath) {
    const p = String(appPath || "");
    if (/^https?:\/\//i.test(p)) return p;
    const normalized = ensureLeadingSlash(p);
    const b = stripTrailingSlash(base || "");
    return b ? `${b}${normalized}` : normalized;
  }

  /* ---------- compute base (supports GitHub Pages project sites) ---------- */
  function computeBaseFromPathname() {
    const p = location.pathname || "/";

    // Case 1: any path containing "/pages/" → base is everything before it
    const idxPages = p.indexOf("/pages/");
    if (idxPages !== -1) return stripTrailingSlash(p.slice(0, idxPages));

    // Case 2: any path containing "/auth/" → base is everything before it
    const idxAuth = p.indexOf("/auth/");
    if (idxAuth !== -1) return stripTrailingSlash(p.slice(0, idxAuth));

    // Case 3: GitHub Pages project site home like "/EDX/" or "/EDX/index.html"
    // Heuristic: if there is a first segment, treat it as base "/<segment>"
    const parts = p.split("/").filter(Boolean);
    if (parts.length >= 1) return `/${parts[0]}`;

    // Case 4: user/org pages root "/"
    return "";
  }

  const PARTIALS = {
    header: (base)        => join(base, "partials/header.html"),
    footer: (base)        => join(base, "partials/footer.html"),
    sidebar: (base, role) => join(base, `partials/sidebar-${role || "consumer"}.html`)
  };

  const PROTECTED_ROLE_SEGMENTS = [
    "/pages/consumer/",
    "/pages/steward/",
    "/pages/engineer/",
    "/pages/admin/"
  ];

  /* ---------- fetch + inject ---------- */
  function sanitizeNoScripts(html) {
    return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return sanitizeNoScripts(await res.text());
  }

  async function inject(sel, url) {
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
  function readUser() {
    try {
      return JSON.parse(localStorage.getItem("edx:user") || "null") || null;
    } catch {
      return null;
    }
  }

  function isProtectedPath(pathname) {
    const p = pathname || "";
    return PROTECTED_ROLE_SEGMENTS.some((seg) => p.includes(seg));
  }

  function redirectToSignin(base) {
    // Prefer auth/signin under the same base if present in your repo
    const candidates = [
      withBase(base, "/auth/signin.html"),
      withBase(base, "/signin.html"),
      // relative fallbacks (useful in nested folders)
      "signin.html",
      "../signin.html",
      "../../signin.html",
      "../auth/signin.html",
      "../../auth/signin.html"
    ];

    for (const c of candidates) {
      try {
        location.assign(c);
        return;
      } catch {}
    }
  }

  function requireAuthIfProtected(base) {
    const path = location.pathname || "";
    if (!isProtectedPath(path)) return;

    const u = readUser();
    const validRole = !!(u && typeof u.role === "string" && u.role.trim().length > 0);
    if (!validRole) redirectToSignin(base);
  }

  /* ---------- header hydration ---------- */
  function applyUserToHeader(scope = document) {
    const u = readUser();
    const name  = u?.name || (u?.email ? u.email.split("@")[0] : "user");
    const email = u?.email || "user@example.edu";
    const role  = (u?.role || "consumer").replace(/_/g, " ");

    $("#currentUserName", scope)?.replaceChildren(document.createTextNode(name));
    $("#currentUserRole", scope)?.replaceChildren(document.createTextNode(role));
    $("#menuUserName", scope)?.replaceChildren(document.createTextNode(name));
    $("#menuUserEmail", scope)?.replaceChildren(document.createTextNode(email));
  }

  /* ---------- dark mode ---------- */
  const THEME_KEY = "edx:theme";

  function getTheme() {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
    return document.documentElement.getAttribute("data-bs-theme") || "light";
  }

  function setTheme(t) {
    document.documentElement.setAttribute("data-bs-theme", t);
    localStorage.setItem(THEME_KEY, t);
  }

  function wireThemeToggle(scope = document) {
    const btn = $("#themeToggle", scope);
    if (!btn) return;

    btn.classList.remove("d-none");
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
  function wireGlobalSearch(base, scope = document) {
    const form  = $("#globalSearchForm", scope);
    const input = $("#globalSearchInput", scope);
    if (!form || !input) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value.trim();
      const target = q.length
        ? withBase(base, `/pages/consumer/catalog-browse.html?q=${encodeURIComponent(q)}`)
        : withBase(base, "/pages/consumer/catalog-browse.html");
      location.href = target;
    });
  }

  /* ---------- sidebar helpers ---------- */
  function markActiveLinks(scope = document) {
    const here = stripTrailingSlash(location.pathname || "/") || "/";
    $$("a[href]", scope).forEach((a) => {
      const href = a.getAttribute("href") || "";
      try {
        const target = stripTrailingSlash(new URL(href, location.origin).pathname) || "/";
        if (target === here) a.classList.add("active");
      } catch {}
    });
  }

  function syncRoleInStorage(role) {
    if (!role) return;
    const u = readUser() || {};
    if (u.role !== role) {
      try {
        localStorage.setItem("edx:user", JSON.stringify({ ...u, role }));
      } catch {}
    }
  }

  /* ---------- public API ---------- */
  async function loadPartials({ base, role } = {}) {
    const resolvedBase = base ?? computeBaseFromPathname();

    // auth check (needs base-aware redirect on GitHub Pages)
    requireAuthIfProtected(resolvedBase);

    const pageRoleAttr = document.body?.getAttribute("data-edx-sidebar");
    const resolvedRole = (role || pageRoleAttr || readUser()?.role || "consumer").toLowerCase();

    // header
    await inject("#app-header", PARTIALS.header(resolvedBase));
    applyUserToHeader(document);
    wireThemeToggle(document);
    wireGlobalSearch(resolvedBase, document);

    // sidebar
    syncRoleInStorage(resolvedRole);
    const s = await inject("#app-sidebar", PARTIALS.sidebar(resolvedBase, resolvedRole));
    if (s) markActiveLinks(s);

    // footer
    await inject("#app-footer", PARTIALS.footer(resolvedBase));

    // live updates (multi-tab)
    window.addEventListener("storage", (e) => {
      if (e.key === "edx:user") applyUserToHeader();
      if (e.key === THEME_KEY) setTheme(getTheme());
    });
  }

  // expose + AUTO-BOOT
  window.EDXPartials = { loadPartials, applyUserToHeader };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => loadPartials().catch(console.error),
      { once: true }
    );
  } else {
    loadPartials().catch(console.error);
  }
})();
