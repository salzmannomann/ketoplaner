  const STORAGE_KEY = "ketoplaner.v5";

  /* ---------- State ---------- */
  function defaultState() {
    return {
      settings: { kcal: 700, ratio: 1.8, mahlzeiten: 5, eiweiss: 20, weight: 8, proteinPerKg: 1.5, mctShare: 0.1, mctMode: "verhaeltnis", mctFett100: 100, mctKcal100: 830, dampfVerdunstung: 150, ketoFilter: "alle", view: "rezepte", filter: "alle", onlyQuelle: false, sort: "kategorie" },
      compose: { items: [{ food: "", grams: 60 }], fats: [{ food: "Schlagobers NÖM", share: 100 }], scale: true },
      favorites: [],
      savedRecipes: [],
      scales: {},
      water: {},
      dayPlan: [],
    };
  }
  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const p = JSON.parse(raw), d = defaultState();
      const settings = Object.assign(d.settings, p.settings || {});
      // Migration alter KetoCal-Felder auf einen einzelnen Schalter (withKeto)
      if (p.settings && typeof p.settings.withKeto !== "boolean") {
        if (typeof p.settings.showMitKeto === "boolean") settings.withKeto = p.settings.showMitKeto && !p.settings.showOhneKeto;
        else if (p.settings.ketocal) settings.withKeto = p.settings.ketocal === "mit";
      }
      return {
        settings: settings,
        compose: Object.assign(d.compose, p.compose || {}),
        favorites: p.favorites || [],
        savedRecipes: p.savedRecipes || [],
        scales: p.scales || {},
        water: p.water || {},
        dayPlan: Array.isArray(p.dayPlan) ? p.dayPlan : [],
      };
    } catch (e) { return defaultState(); }
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }
