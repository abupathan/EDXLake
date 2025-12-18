/* assets/js/partials-loader.js
 * GitHub Pages project-site safe loader:
 * - Loads partials from <base>/partials/...
 * - Rewrites injected links so they always stay under <base>
 *
 * Fixes:
 *  - "/support/docs.html"            -> "/EDXLake/support/docs.html"
 *  - "../../support/docs.html"       -> "/EDXLake/support/docs.html"   (works on home + nested pages)
 */

(function () {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function stripTrailingSlash(p) {
    return (p || "").replace(/\/+$/, "");
  }

  function join(base, rel) {
    const b = stripTrailingSlash(base || "");
    const r = String(rel || "").replace(/^\/+/, "");
    return b ? `${b}/${r}` : `/${r}`.replace(/^\/+/, "/");
  }

  // Compute repo base for:
  // - https://abupathan.github.io/EDXLake/...
  // - and still works if served at root (/)
  function computeBaseFromPathname() {
    const p = location.pathname || "/";

    // If you are on /<base>/pages/... => base is everything before /pages/
    const idxPages = p.indexOf("/pages/");
    if (idxPages !== -1) return stripTrailingSlash(p.slice(0, idxPages));

    // If you are on /<base>/auth/... => base is everything before /auth/
    const idxAuth = p.indexOf("/auth/");
    if (idxAuth !== -1) return stripTrailingSlash(p.slice(0, idxAuth));

    // Otherwise, treat first segment as base for GitHub Pages project sites:
    // /EDXLake/ or /EDXLake/index.html => base "/EDXLake"
    const parts = p.split("/").filter(Boolean);
    if (parts.length >= 1) return `/${parts[0]}`;

    // Root site
    return "";
  }

  const PARTIALS = {
    header: (base) => join(base, "partials/header.html"),
    footer: (base) => join(base, "partials/footer.html"),
    sidebar: (base, role) => join(base, `partials/sidebar-${role || "consumer"}.html`)
  };

  const PROTECTED_ROLE_SEGMENTS = [
    "/pages/consumer/",
    "/pages/steward/",
    "/pages/engineer/",
    "/pages/admin/"
  ];

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

  function readUser() {
    try { return JSON.parse(localStorage.getItem("edx:user") || "null") || null; }
    catch { return null; }
  }

  function isProtectedPath(pathname) {
    const p = pathname || "";
    return PROTECTED_ROLE_SEGMENTS.some((seg) => p.includes(seg));
  }

  function redirectToSignin(base) {
    const b = stripTrailingSlash(base);
    const candidates = [
      `${b}/auth/signin.html`,
      `${b}/signin.html`,
      "signin.html",
      "../signin.html",
      "../../signin.html"
    ];
    for (const c of candidates) { location.assign(c); return; }
  }

  function requireAuthIfProtected(base) {
    if (!isProtectedPath(location.pathname || "")) return;
    const u = readUser();
    const validRole = !!(u && typeof u.role === "string" && u.role.trim());
    if (!validRole) redirectToSignin(base);
  }

  // Robust rewrite:
  // - handles "/support/..." AND "../../support/..." consistently
  function rewriteInjectedLinks(base, scope) {
    const b = stripTrailingSlash(base || "");
    if (!scope || !b) return;

    $$("a[href]", scope).forEach((a) => {
      const raw = (a.getAttribute("href") || "").trim();
      if (!raw) return;

      // ignore anchors and external/schemes
      if (raw.startsWith("#")) return;
      if (/^(https?:)?\/\//i.test(raw)) return;
      if (/^(mailto:|tel:|javascript:)/i.test(raw)) return;

      // Resolve how the browser would interpret it from the current page
      let u;
      try {
        u = new URL(raw, location.href);
      } catch {
        return;
      }

      const path = u.pathname || "/";
      const search = u.search || "";
      const hash = u.hash || "";

      // If already under base, keep it.
      if (path === b || path.startsWith(b + "/")) return;

      // Only rewrite same-origin absolute paths
      if (path.startsWith("/")) {
        a.setAttribute("href", b + path + search + hash);
      }
    });
  }

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

  async function loadPartials({ base, role } = {}) {
    const resolvedBase = base ?? computeBaseFromPathname();

    requireAuthIfProtected(resolvedBase);

    const pageRoleAttr = document.body?.getAttribute("data-edx-sidebar");
    const resolvedRole = (role || pageRoleAttr || readUser()?.role || "consumer").toLowerCase();

    const headerHost = await inject("#app-header", PARTIALS.header(resolvedBase));
    if (headerHost) rewriteInjectedLinks(resolvedBase, headerHost);
    applyUserToHeader(document);

    const sidebarHost = await inject("#app-sidebar", PARTIALS.sidebar(resolvedBase, resolvedRole));
    if (sidebarHost) rewriteInjectedLinks(resolvedBase, sidebarHost);

    const footerHost = await inject("#app-footer", PARTIALS.footer(resolvedBase));
    if (footerHost) rewriteInjectedLinks(resolvedBase, footerHost);
  }

  window.EDXPartials = { loadPartials, applyUserToHeader };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => loadPartials().catch(console.error), { once: true });
  } else {
    loadPartials().catch(console.error);
  }
})();
