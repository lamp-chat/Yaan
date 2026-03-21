(function () {
  function isSameOrigin(url) {
    try {
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch (_) {
      return false;
    }
  }

  function shouldHandle(a) {
    if (!a) return false;
    if (a.target && a.target !== "_self") return false;
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
    if (!isSameOrigin(href)) return false;
    // Allow opt-in only, to avoid breaking existing JS flows.
    return a.hasAttribute("data-nav");
  }

  document.addEventListener("click", (ev) => {
    const a = ev.target && ev.target.closest ? ev.target.closest("a") : null;
    if (!shouldHandle(a)) return;
    ev.preventDefault();
    document.documentElement.classList.add("nav-leave");
    window.setTimeout(() => {
      window.location.href = a.href;
    }, 160);
  });
})();

