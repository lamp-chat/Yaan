/* Shared motion helpers:
   - Adds html.fx-ready after first paint (enables subtle page-in animation).
   - Reveals elements marked with [data-reveal] when they enter the viewport.
*/
(function () {
  const root = document.documentElement;
  root.classList.add("fx");

  // Enable CSS that should only run after the first paint.
  try {
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("fx-ready")));
  } catch (_) {
    root.classList.add("fx-ready");
  }

  const els = Array.from(document.querySelectorAll("[data-reveal]"));
  if (!els.length) return;

  let reduced = false;
  try {
    reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_) {}

  const show = (el) => el && el.classList && el.classList.add("is-in");

  if (reduced || !("IntersectionObserver" in window)) {
    els.forEach(show);
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const ent of entries) {
        if (!ent.isIntersecting) continue;
        show(ent.target);
        try { io.unobserve(ent.target); } catch (_) {}
      }
    },
    { threshold: 0.12, rootMargin: "8% 0px" }
  );

  for (const el of els) {
    try { io.observe(el); } catch (_) { show(el); }
  }
})();
