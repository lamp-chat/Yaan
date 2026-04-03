(function () { 
  const KEY = "yaan_splash_seen"; 
  const splash = document.getElementById("yaanSplash"); 
  if (!splash) return; 
 
  const hide = () => splash.classList.add("yaan-splash--hidden"); 

  let reducedMotion = false;
  try {
    reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_) {}

  let seen = false;
  try {
    seen = sessionStorage.getItem(KEY) === "1";
  } catch (_) {}

  if (seen || reducedMotion) {
    hide();
    return;
  }

  try {
    sessionStorage.setItem(KEY, "1");
  } catch (_) {}

  const skipBtn = splash.querySelector("[data-splash-skip]");
  const onSkip = (ev) => {
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    hide();
  };

  // Click anywhere to skip; keep it simple and robust. 
  splash.addEventListener("click", onSkip, { once: true }); 
  if (skipBtn) skipBtn.addEventListener("click", onSkip, { once: true }); 
 
  // Fallback: ensure it's gone even if CSS animations are changed. 
  window.setTimeout(hide, 2400); 
})(); 
