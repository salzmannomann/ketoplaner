  /* ---------- Init ---------- */
  function init() {
    rebuildFoodIndex();
    applyTheme();
    bindSettingsBar();
    bindVgPages();
    bindPush();
    bindSync();
    bindBedarf();
    bindLebensmittel();
    bindDetail();
    bindCompose();
    bindHeute();
    bindFilterSwipe();
    renderRezepte();
    showView(state.settings.view || "rezepte");
    // Breite wechselt zwischen Handy und Desktop (> 820 px): Bereiche in der passenden Anordnung neu aufbauen
    try {
      [DESKTOP_MQ, PANEL_MQ].forEach(q => {
        const mq = window.matchMedia && window.matchMedia(q);
        if (mq && mq.addEventListener) mq.addEventListener("change", () => { if (typeof onLayoutChange === "function") onLayoutChange(); renderRezepte(); });
      });
    } catch (e) {}
    revealApp();
  }
  // Erst zeigen, wenn alles steht: nach dem ersten Aufbau und den Schriften (sonst springt der Text beim Nachladen),
  // höchstens 600 ms warten. Im nächsten Bild, damit Layout und Einpassen (Tagesplan) schon gelaufen sind.
  function revealApp() {
    const root = document.documentElement; if (!root.classList.contains("booting")) return;
    let done = false;
    const go = () => { if (done) return; done = true; (window.requestAnimationFrame || setTimeout)(() => root.classList.remove("booting")); };
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (typeof queueFitHeute === "function") queueFitHeute(); go(); }); } catch (e) {}
    setTimeout(go, 600);
  }

  document.addEventListener("DOMContentLoaded", init);
