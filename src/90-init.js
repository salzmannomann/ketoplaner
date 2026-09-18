  /* ---------- Init ---------- */
  function init() {
    rebuildFoodIndex();
    applyTheme();
    bindSettingsBar();
    bindDetail();
    bindCompose();
    bindHeute();
    renderRezepte();
    showView(state.settings.view || "rezepte");
  }

  document.addEventListener("DOMContentLoaded", init);
