/* assets/js/auth.js
 * Robust demo auth + GitHub Pages (project site) safe redirects.
 * Fix: do NOT resolve redirects from location.origin; resolve within repo base (e.g., /EDXLake).
 */

(function () {
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  const DEMO = {
    admin:    { email: "admin@edx.demo",    password: "Admin#2025!" },
    engineer: { email: "engineer@edx.demo", password: "Engineer#2025!" },
    steward:  { email: "steward@edx.demo",  password: "Steward#2025!" },
    consumer: { email: "consumer@edx.demo", password: "Consumer#2025!" }
  };

  // Use root-style paths; we will safely prefix base (repo name) when needed.
  const ROLE_HOME_FALLBACK = {
    admin:    "/pages/admin/landing.html",
    engineer: "/pages/engineer/landing.html",
    steward:  "/pages/steward/landing.html",
    consumer: "/pages/consumer/landing.html"
  };

  function setUser(user) {
    try { localStorage.setItem("edx:user", JSON.stringify(user)); }
    catch (e) { console.warn("[EDX] localStorage unavailable:", e); }
  }

  function isValidEmail(v) { return /^\S+@\S+\.\S+$/.test(v); }

  function stripTrailingSlash(s) { return String(s || "").replace(/\/+$/, ""); }

  function isAbsoluteUrl(s) { return /^(https?:)?\/\//i.test(String(s || "").trim()); }

  /**
   * Compute the base path for:
   * - GitHub Project Pages: https://<user>.github.io/<repo>/...
   * - User/Org Pages:       https://<user>.github.io/...
   * - Custom domain:        https://example.com/...
   */
  function computeBasePath() {
    const p = String(location.pathname || "/");

    // Prefer known folder anchors if present
    const anchors = ["/pages/", "/support/", "/legal/", "/assets/", "/partials/", "/auth/"];
    for (const a of anchors) {
      const idx = p.indexOf(a);
      if (idx > -1) return stripTrailingSlash(p.slice(0, idx));
    }

    // GitHub Pages heuristic: if first segment is a repo name (no dot), treat it as base.
    // Example: /EDXLake/signin.html -> base = /EDXLake
    if (String(location.hostname || "").toLowerCase().endsWith("github.io")) {
      const parts = p.split("/").filter(Boolean);
      if (parts.length >= 2) { // "/<repo>/<file>"
        const first = parts[0];
        if (first && !first.includes(".")) return "/" + first;
      }
    }

    // Otherwise, assume site is served at root
    return "";
  }

  /**
   * Resolve a path/url into a full absolute URL, safely within basePath.
   * - External URLs pass through unchanged.
   * - "/x" becomes "<origin><base>/x"
   * - "pages/x" becomes "<origin><base>/pages/x"
   * - "../pages/x" will NOT escape "<base>" (we clamp to base).
   */
  function resolveAppUrl(input) {
    let raw = String(input || "").trim();
    if (!raw) raw = "/";

    if (isAbsoluteUrl(raw)) {
      // Keep same-origin protocol-relative too (//example.com)
      return new URL(raw, location.href).toString();
    }

    const origin = location.origin;
    const base = computeBasePath();      // "" or "/EDXLake"
    const baseSegs = base.split("/").filter(Boolean);
    const baseMin = baseSegs.length;

    // Split off query/hash so we normalize only the path
    let pathPart = raw;
    let suffix = "";
    const qh = raw.search(/[?#]/);
    if (qh >= 0) {
      pathPart = raw.slice(0, qh);
      suffix = raw.slice(qh);
    }

    // If it starts with "/", treat as root-relative (to the site), then prefix base.
    // If it does not start with "/", treat as relative-within-base.
    const rel = pathPart.startsWith("/") ? pathPart.slice(1) : pathPart;

    const segs = rel.split("/");

    const stack = baseSegs.slice(); // start inside base
    for (const s of segs) {
      if (!s || s === ".") continue;
      if (s === "..") {
        if (stack.length > baseMin) stack.pop(); // clamp: don't escape base
        continue;
      }
      stack.push(s);
    }

    const finalPath = "/" + stack.join("/");
    return origin + finalPath + suffix;
  }

  function getRoleHomeFromForm(form, role) {
    const attr = {
      admin: "data-role-home-admin",
      engineer: "data-role-home-engineer",
      steward: "data-role-home-steward",
      consumer: "data-role-home-consumer"
    }[role] || "data-role-home-consumer";

    const rawTarget = form.getAttribute(attr) || ROLE_HOME_FALLBACK[role] || "/";
    try { return resolveAppUrl(rawTarget); }
    catch { return resolveAppUrl("/"); }
  }

  function doRedirect(url) {
    const target = String(url || "").trim();
    if (!target) return;

    try { location.assign(target); } catch (e) { console.warn("[EDX] assign failed", e); }
    try { window.location.href = target; } catch (e) { console.warn("[EDX] href failed", e); }

    setTimeout(() => {
      try {
        if (location.href !== target) location.replace(target);
      } catch {}
    }, 150);
  }

  function show(el, on) { if (el) el.classList.toggle("d-none", !on); }
  function invalid(el, on) { if (el) el.classList.toggle("is-invalid", !!on); }

  function attachForm() {
    const form = document.getElementById("signinForm");
    if (!form) {
      console.error("[EDX] signinForm not found — ensure auth.js is loaded after the form.");
      return;
    }

    const emailEl = document.getElementById("siEmail");
    const roleEl  = document.getElementById("siRole");
    const passEl  = document.getElementById("siPassword");
    const errBox  = document.getElementById("authError");
    const okBox   = document.getElementById("authSuccess");

    emailEl?.addEventListener("input", () => invalid(emailEl, !isValidEmail(emailEl.value.trim())));
    roleEl?.addEventListener("change", () => invalid(roleEl, !(roleEl.value || "").trim()));
    passEl?.addEventListener("input", () => invalid(passEl, (passEl.value || "").length < 8));

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const email = (emailEl?.value || "").trim();
      const role  = (roleEl?.value || "").trim();
      const pass  = (passEl?.value || "");

      const vEmail = isValidEmail(email);
      const vRole  = !!role;
      const vPass  = pass.length >= 8;

      invalid(emailEl, !vEmail);
      invalid(roleEl, !vRole);
      invalid(passEl, !vPass);

      if (!(vEmail && vRole && vPass)) { show(errBox, false); return; }

      const expected = DEMO[role];
      const ok = expected && email.toLowerCase() === expected.email && pass === expected.password;
      if (!ok) { show(errBox, true); return; }

      show(errBox, false);
      show(okBox, true);

      setUser({ name: email.split("@")[0] || "user", email, role, provider: "password" });

      const target = getRoleHomeFromForm(form, role);
      doRedirect(target);
    });
  }

  function attachSSO() {
    const form   = document.getElementById("signinForm");
    const roleEl = document.getElementById("siRole");
    if (!form || !roleEl) return;

    document.querySelectorAll("[data-auth-provider]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const provider = btn.getAttribute("data-auth-provider") || "institution";
        const role = (roleEl.value || "consumer").trim();
        const email = `${provider}.${role}@edx.demo`;

        setUser({ name: `${provider}.${role}`, email, role, provider });

        const target = getRoleHomeFromForm(form, role);
        doRedirect(target);
      });
    });
  }

  function attachSignOutIfAny() {
    const hook = document.getElementById("signoutHook");
    if (!hook) return;

    hook.addEventListener("click", (e) => {
      e.preventDefault();
      const theme = localStorage.getItem("edx:theme");
      localStorage.clear();
      if (theme) localStorage.setItem("edx:theme", theme);

      // Prefer /signin.html; if you keep sign-in under /auth/, change this to "/auth/signin.html"
      doRedirect(resolveAppUrl("/signin.html"));
    });
  }

  ready(() => {
    attachForm();
    attachSSO();
    attachSignOutIfAny();
    console.info("[EDX] auth.js ready (base-aware redirects)");
  });
})();
