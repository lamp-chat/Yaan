(() => {
  "use strict";

  const cfg = window.__Lamp_BILLING__ || {};

  const elMonthlyBtn = document.getElementById("monthlyBtn");
  const elYearlyBtn = document.getElementById("yearlyBtn");
  const elStripeNotice = document.getElementById("stripeNotice");
  const elManageBtn = document.getElementById("manageBtn");
  const elToast = document.getElementById("toast");
  const elFreeLimit = document.getElementById("freeLimit");

  let interval = "month";

  function toast(text, ms = 2400) {
    if (!elToast) return;
    elToast.textContent = text || "";
    elToast.hidden = false;
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => (elToast.hidden = true), ms);
  }

  async function api(path, bodyObj) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(bodyObj || {}),
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      throw new Error((data && (data.error || data.message)) || `Request failed (${res.status})`);
    }
    return data;
  }

  function setIntervalUI(next) {
    interval = next === "year" ? "year" : "month";
    if (elMonthlyBtn) elMonthlyBtn.classList.toggle("active", interval === "month");
    if (elYearlyBtn) elYearlyBtn.classList.toggle("active", interval === "year");

    // Swap the "/ mo" label and optionally tweak shown prices (template uses static $ values).
    document.querySelectorAll("[data-per]").forEach((el) => {
      el.textContent = interval === "year" ? "/ yr" : "/ mo";
    });
  }

  function stripeConfiguredFor(plan, intv) {
    const prices = cfg.prices || {};
    const p = prices[plan] || {};
    const pid = p[intv] || "";
    return Boolean(cfg.stripeEnabled && pid);
  }

  function updateStripeNotice() {
    if (!elStripeNotice) return;
    const ok = stripeConfiguredFor("pro", interval) || stripeConfiguredFor("ultimate", interval);
    elStripeNotice.hidden = Boolean(ok);
  }

  async function startCheckout(plan) {
    if (!cfg.stripeEnabled) {
      toast("Stripe billing is not configured yet.");
      return;
    }
    if (!stripeConfiguredFor(plan, interval)) {
      toast("This plan/interval isn't configured yet (missing Stripe price ID).");
      return;
    }
    try {
      const data = await api("/api/billing/checkout", { plan, interval });
      if (!data || !data.url) throw new Error("Missing checkout URL.");
      window.location.href = data.url;
    } catch (e) {
      toast(e && e.message ? e.message : "Checkout failed");
    }
  }

  async function openPortal() {
    if (!cfg.stripeEnabled) {
      toast("Stripe billing is not configured yet.");
      return;
    }
    try {
      const data = await api("/api/billing/portal", {});
      if (!data || !data.url) throw new Error("Missing portal URL.");
      window.location.href = data.url;
    } catch (e) {
      toast(e && e.message ? e.message : "Billing portal failed");
    }
  }

  function markCurrentPlan() {
    const plan = String(cfg.currentPlan || "free").toLowerCase();
    const freeBtn = document.getElementById("freeBtn");
    if (freeBtn) freeBtn.disabled = plan === "free";

    document.querySelectorAll("[data-checkout]").forEach((btn) => {
      const p = String(btn.getAttribute("data-checkout") || "").toLowerCase();
      if (p && p === plan) {
        try { btn.textContent = "Current Plan"; } catch (e) {}
        btn.disabled = true;
      }
    });
  }

  function boot() {
    if (elFreeLimit) elFreeLimit.textContent = String(cfg.freeDailyLimit || 15);
    markCurrentPlan();
    setIntervalUI("month");
    updateStripeNotice();

    if (elMonthlyBtn) elMonthlyBtn.addEventListener("click", () => { setIntervalUI("month"); updateStripeNotice(); });
    if (elYearlyBtn) elYearlyBtn.addEventListener("click", () => { setIntervalUI("year"); updateStripeNotice(); });
    if (elManageBtn) elManageBtn.addEventListener("click", openPortal);

    document.querySelectorAll("[data-checkout]").forEach((btn) => {
      btn.addEventListener("click", () => startCheckout(btn.getAttribute("data-checkout") || "pro"));
    });
  }

  boot();
})();
