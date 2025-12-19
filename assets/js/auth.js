/* assets/js/auth.js
 * Base-aware redirects for:
 * - Local subfolder dev:   http://127.0.0.1:5500/EDX/...
 * - GitHub project pages:  https://abupathan.github.io/EDXLake/...
 * - Root deploy:           https://example.com/...
 *
 * Key fix:
 * - Determine app base from this script's own URL (…/<base>/assets/js/auth.js),
 *   so redirects stay under <base>.
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

  // App-root style (we will prefix <base> automatically when needed)
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
   * Deterministically infer base from script src:
   *   https://host/<base>/assets/js/auth.js  -> base "/<base>"
   *   https://host/assets/js/auth.js         -> base ""
   */
  function baseFromThisScript() {
    const candidates = [];

    // 1) currentScript is best when available
    if (document.currentScript && document.currentScript.src) candidates.push(document.currentScript.src);

    // 2) fallback: search script tags
    document.querySelectorAll("script[src]").forEach((s) => candidates.push(s.src));

    for (const src of candidates) {
      try {
        const u = new URL(src, location.href);
        const p = u.pathname || "";
        // Look for "/assets/" anchor in the script path
        const idx = p.indexOf("/assets/");
        if (idx > -1) return stripTrailingSlash(p.slice(0, idx)); // "/EDX" or "/EDXLake" or ""
      } catch {
        // ignore
      }
    }
    return "";
  }

  /**
   * Fallback base detection from current URL path (kept as backup).
   * Your previous computeBasePath relied on this and failed on /EDX/signin.html :contentReference[oaicite:2]{index=2}
   */
  function baseFromLocationPath() {
    const p = String(location.pathname || "/");

    const anchors = ["/pages/", "/support/", "/legal/", "/assets/", "/partials/", "/auth/"];
    for (const a of anchors) {
      const idx = p.indexOf(a);
      if (idx > -1) return stripTrailingSlash(p.slice(0, idx));
    }

    // GitHub pages heuristic (backup)
    if (String(location.hostname || "").toLowerCase().endsWith("github.io")) {
      const parts = p.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const first = parts[0];
        if (first && !first.includes(".")) return "/" + first;
      }
    }

    return "";
  }

  function computeBasePath() {
    // Prefer script-derived base (works for /EDX/ local + /EDXLake/ GitHub)
    const byScript = baseFromThisScript();
    if (byScript !== "") return byScript;

    // If script is at root /assets/... then base is root ""
    // (still safe to return "")
    return baseFromLocationPath();
  }

  /**
   * Resolve a path/url into an absolute URL under the app base.
   * - External URLs pass through.
   * - "/pages/x" becomes "<origin><base>/pages/x"
   * - "pages/x" becomes "<origin><base>/pages/x"
   * - "../pages/x" is clamped and cannot escape <base>.
   */
  function resolveAppUrl(input) {
    let raw = String(input || "").trim();
    if (!raw) raw = "/";

    if (isAbsoluteUrl(raw)) return new URL(raw, location.href).toString();

    const origin = location.origin;
    const base = computeBasePath(); // "", "/EDX", "/EDXLake"
    const baseSegs = base.split("/").filter(Boolean);
    const baseMin = baseSegs.length;

    // Split query/hash (keep them)
    let pathPart = raw;
    let suffix = "";
    const qh = raw.search(/[?#]/);
    if (qh >= 0) {
      pathPart = raw.slice(0, qh);
      suffix = raw.slice(qh);
    }

    // Root-ish paths: "/x" should be treated as app-root-relative, not domain-root-relative
    // So we remove leading slash and rebuild under base.
    const rel = pathPart.startsWith("/") ? pathPart.slice(1) : pathPart;
    const segs = rel.split("/");

    const stack = baseSegs.slice();
    for (const s of segs) {
      if (!s || s === ".") continue;
      if (s === "..") {
        if (stack.length > baseMin) stack.pop();
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

      doRedirect(resolveAppUrl("/signin.html"));
    });
  }

  ready(() => {
    attachForm();
    attachSSO();
    attachSignOutIfAny();
    console.info("[EDX] auth.js ready — base:", computeBasePath());
  });
})();
