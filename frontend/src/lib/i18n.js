import React from "react";

function safeGetLang() {
  try {
    return (window.localStorage.getItem("pgpt_lang") || "en").trim().toLowerCase() || "en";
  } catch {
    return "en";
  }
}

// Small React bridge to the existing template i18n runtime (static/brand/i18n.js).
// This makes language changes (from /settings) rerender the SPA.
export function useI18n() {
  const [lang, setLang] = React.useState(() => safeGetLang());

  React.useEffect(() => {
    function sync() {
      setLang(safeGetLang());
    }

    // Fired by static/brand/i18n.js after it applies translations.
    function onApplied(ev) {
      const next = ev && ev.detail && ev.detail.lang ? String(ev.detail.lang) : safeGetLang();
      setLang(String(next || "en").trim().toLowerCase() || "en");
    }

    window.addEventListener("pgpt:i18n-applied", onApplied);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("pgpt:i18n-applied", onApplied);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function t(key) {
    const k = String(key || "");
    if (!k) return "";
    try {
      if (window.pgptI18n && typeof window.pgptI18n.t === "function") return window.pgptI18n.t(k);
    } catch {}
    return k;
  }

  return { lang, t };
}

