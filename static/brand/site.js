(() => {
  "use strict";

  const THEME_KEY = "yaan_theme";

  function getSystemTheme() {
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    } catch (e) {}
    return "light";
  }

  function applyTheme(val) {
    // Default to dark unless the user explicitly picked a theme.
    const t = (val === "dark" || val === "light") ? val : "dark";
    try { document.documentElement.dataset.theme = t; } catch (e) {}
  }

  function loadTheme() {
    let t = "";
    try { t = window.localStorage.getItem(THEME_KEY) || ""; } catch (e) { t = ""; }
    applyTheme(t);
  }

  function toggleTheme() {
    const cur = String(document.documentElement.dataset.theme || getSystemTheme()).toLowerCase();
    const next = cur === "dark" ? "light" : "dark";
    try { window.localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next);
  }

  loadTheme();

  if (window.matchMedia) {
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        // If user explicitly picked a theme, don't override it.
        let t = "";
        try { t = window.localStorage.getItem(THEME_KEY) || ""; } catch (e) { t = ""; }
        if (!t) applyTheme("");
      });
    } catch (e) {}
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target;
    const btn = t && t.closest ? t.closest("[data-theme-toggle]") : null;
    if (!btn) return;
    ev.preventDefault();
    toggleTheme();
  });
})();
