  const STORAGE_KEY = "ketoplaner.v5";

  /* ---------- State ---------- */
  function defaultState() {
    return {
      settings: { kcal: "", ratio: 1.8, mahlzeiten: 5, eiweiss: 20, weight: 8, proteinPerKg: 1.5, mctShare: 0.1, mctMode: "verhaeltnis", mctFett100: 100, mctKcal100: 830, dampfVerdunstung: 150, view: "rezepte", filter: "alle", onlyQuelle: false, sort: "kategorie" },
      compose: { items: [{ food: "", grams: 60 }], fats: [{ food: "Schlagobers NÖM", share: 100 }], scale: true },
      favorites: [],
      savedRecipes: [],
      scales: {},
      water: {},
      portion: {}, // Portion angepasst (Blatt Mahlzeit/Tag): Faktor je Gericht, 1 = wie berechnet
      dayPlan: [],
      basis: {}, // gemerkte Fettbasis-Variante je Gericht (Familien-Schlüssel → Rezept-Schlüssel)
    };
  }
  // Umbenannte Standard-Rezepte: alte Schlüssel in Favoriten, Mengen, Wasser und Tagesplan nachziehen.
  const RENAMES = {
    "Flasche: KetoCal & Pre Apta": "KetoCal & Pre Apta",
    "Flasche: KetoCal & Compleat": "Compleat & KetoCal",
    "KetoCal & Compleat": "Compleat & KetoCal",
    "Compleat (mit KetoCal)": "Compleat & KetoCal",
    "Compleat": "Compleat & KetoCal",
    "Erdäpfel & Zucchini (mit KetoCal) – Variante 1": "Erdäpfel & Zucchini (mit KetoCal)",
    "Erdäpfel & Zucchini (mit KetoCal) – Variante 2": "Erdäpfel & Zucchini (mit KetoCal)",
  };
  function renameKey(k) {
    if (typeof k !== "string" || k.indexOf("std:") !== 0) return k;
    const n = k.slice(4); return RENAMES[n] ? "std:" + RENAMES[n] : k;
  }
  // Familien-Schlüssel (Favoriten, Mengen, Wasser gelten je Gericht, nicht je Fettbasis-Variante).
  const stripVariant = (n) => n.replace(/ \(mit KetoCal\)|, mit KetoCal/g, "");
  function toFamilyKey(k) {
    if (typeof k !== "string") return k;
    if (k.indexOf("fam:") === 0) { const n = k.slice(4); return RENAMES[n] ? "fam:" + stripVariant(RENAMES[n]) : k; }
    k = renameKey(k);
    if (k.indexOf("std:") !== 0) return k;
    return "fam:" + stripVariant(k.slice(4));
  }
  function remapKeys(obj) {
    const o = {};
    Object.keys(obj || {}).forEach(k => { const nk = toFamilyKey(k); if (!(nk in o)) o[nk] = obj[k]; });
    return o;
  }
  let state = load();
  // rawOverride: Inhalt eines Backups direkt übernehmen (auch wenn der Speicher nicht beschreibbar ist).
  function load(rawOverride) {
    let raw = null;
    try {
      raw = rawOverride != null ? rawOverride : localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const p = JSON.parse(raw), d = defaultState();
      const settings = Object.assign(d.settings, p.settings || {});
      // Einstellungen früherer Versionen, die nichts mehr steuern (KetoCal-Schalter, feste Wassermengen, Spülen)
      ["withKeto", "showMitKeto", "showOhneKeto", "ketocal", "ketoFilter", "zwischenMl", "spuelMl", "maxMahlMl", "rundung"].forEach(k => { delete settings[k]; });
      // Alte Gruppen-Filter
      if (["fleisch", "vegetarisch", "unterwegs", "flasche"].indexOf(settings.filter) !== -1) settings.filter = "alle";
      // Favoriten gelten je Rezept: Schlüssel nur umbenennen (alte Namen), nicht mehr auf das Gericht zusammenfassen.
      // Ältere Familien-Favoriten („fam:…“) bleiben erhalten und zählen für beide Varianten.
      const favorites = [];
      (p.favorites || []).forEach(k => { const nk = (typeof k === "string" && k.indexOf("fam:") === 0) ? toFamilyKey(k) : renameKey(k); if (favorites.indexOf(nk) === -1) favorites.push(nk); });
      return {
        settings: settings,
        compose: Object.assign(d.compose, p.compose || {}),
        favorites: favorites,
        savedRecipes: p.savedRecipes || [],
        scales: remapKeys(p.scales),
        water: remapKeys(p.water),
        portion: remapKeys(p.portion),
        dayPlan: (Array.isArray(p.dayPlan) ? p.dayPlan : []).map(sl => ({ key: renameKey(sl && sl.key) || null })),
        basis: p.basis && typeof p.basis === "object" ? p.basis : {},
      };
    } catch (e) {
      // Unlesbare Daten nicht stillschweigend verwerfen: Rohtext zur Rettung unter eigenem Schlüssel ablegen.
      if (raw && rawOverride == null) { try { localStorage.setItem(STORAGE_KEY + ".corrupt", raw); } catch (e2) {} }
      return defaultState();
    }
  }
  // Speichert den Zustand; false, wenn der Speicher nicht beschreibbar ist (privates Fenster, voll).
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch (e) { return false; } }
