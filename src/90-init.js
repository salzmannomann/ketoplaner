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
  }

  document.addEventListener("DOMContentLoaded", init);
