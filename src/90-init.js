  /* ---------- Init ---------- */
  function init() {
    rebuildFoodIndex();
    applyTheme();
    bindSettingsBar();
    bindVgPages();
    bindPush();
    bindSync();
    bindBedarf();
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
  }

  document.addEventListener("DOMContentLoaded", init);
