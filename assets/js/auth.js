/* assets/js/auth.js
 * Robust demo auth with visible success and triple redirect fallback.
 * - Validates email/role/password with accessible errors
 * - Built-in demo credentials
 * - On success: success banner + spinner + redirect (assign → href → setTimeout)
 * - SSO buttons: instant sign-in using selected role (no extra pages)
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

  const ROLE_HOME_FALLBACK = {
    admin: "./pages/admin/landing.html",
    engineer: "./pages/engineer/landing.html",
    steward: "./pages/steward/landing.html",
    consumer: "./pages/consumer/landing.html"
  };

  function setUser(user) {
    try { localStorage.setItem("edx:user", JSON.stringify(user)); }
    catch (e) { console.warn("[EDX] localStorage unavailable:", e); }
  }

  function isValidEmail(v) { return /^\S+@\S+\.\S+$/.test(v); }

  function getRoleHomeFromForm(form, role) {
    const attr = {
      admin: "data-role-home-admin",
      engineer: "data-role-home-engineer",
      steward: "data-role-home-steward",
      consumer: "data-role-home-consumer"
    }[role] || "data-role-home-consumer";

    let target = form.getAttribute(attr) || ROLE_HOME_FALLBACK[role] || "/";
    try { target = new URL(target, location.origin).toString(); }
    catch { target = "/"; }
    return target;
  }

  function doRedirect(url) {
    try { location.assign(url); } catch (e) { console.warn("[EDX] assign failed", e); }
    // Fallback 1
    try { window.location.href = url; } catch (e) { console.warn("[EDX] href failed", e); }
    // Fallback 2
    setTimeout(() => {
      if (location.href !== url) location.replace(url);
    }, 150);
  }

  function show(el, on) { if (el) el.classList.toggle("d-none", !on); }
  function invalid(el, on) { if (el) el.classList.toggle("is-invalid", !!on); }

  function attachForm() {
    const form = document.getElementById("signinForm");
    if (!form) {
      console.error("[EDX] signinForm not found — ensure /assets/js/auth.js is loaded after the form.");
      return;
    }
    const emailEl = document.getElementById("siEmail");
    const roleEl  = document.getElementById("siRole");
    const passEl  = document.getElementById("siPassword");
    const errBox  = document.getElementById("authError");
    const okBox   = document.getElementById("authSuccess");

    emailEl?.addEventListener("input", () => invalid(emailEl, !isValidEmail(emailEl.value.trim())));
    roleEl?.addEventListener("change", () => invalid(roleEl, !(roleEl.value || "").trim()));
    passEl?.addEventListener("input", () => invalid(passEl, (passEl.value || "").trim().length < 8));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = (emailEl?.value || "").trim();
      const role  = (roleEl?.value || "consumer").trim();
      const pass  = (passEl?.value || "").trim();

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

      const user = { name: email.split("@")[0] || "user", email, role, provider: "password" };
      setUser(user);

      const target = getRoleHomeFromForm(form, role);
      if (!target || target === location.href) {
        console.warn("[EDX] Redirect target invalid or same as current; using fallback map.", { target, role });
      }
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
    const theme = localStorage.getItem("edx:theme");
    localStorage.clear();
    if (theme) localStorage.setItem("edx:theme", theme);
    doRedirect("/auth/signin.html");
  }

  ready(() => {
    attachForm();
    attachSSO();
    attachSignOutIfAny();
    console.info("[EDX] auth.js ready");
  });
})();
