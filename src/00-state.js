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
      customFoods: [], // eigene Lebensmittel (Werte je 100 g vom Etikett), auf Wunsch auch als Fett zum Ausgleich
      hiddenRecipes: [], // ausgeblendete Standard-Rezepte (Rezept-Schlüssel)
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
  // Teile des Zustands prüfen (Backup-Import, Geräte-Abgleich, alte Daten): falsche Formen werden einzeln verworfen,
  // statt alles zurückzusetzen oder die App beim Start abstürzen zu lassen.
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  function cleanNumMap(m) { const o = {}; if (isObj(m)) Object.keys(m).forEach(k => { const v = Number(m[k]); if (isFinite(v)) o[k] = v; }); return o; }
  function cleanItems(arr, field) {
    return (Array.isArray(arr) ? arr : []).filter(isObj).map(it => {
      const o = { food: typeof it.food === "string" ? it.food : "" };
      o[field] = isFinite(Number(it[field])) ? Number(it[field]) : 0;
      return o;
    });
  }
  function cleanSavedRecipes(list) {
    return (Array.isArray(list) ? list : []).filter(r => isObj(r) && typeof r.key === "string" && typeof r.name === "string" && Array.isArray(r.items))
      .map(r => Object.assign({}, r, { items: cleanItems(r.items, "grams").filter(it => it.food) })).filter(r => r.items.length);
  }
  function cleanFavorites(list) { return (Array.isArray(list) ? list : []).filter(k => typeof k === "string"); }
  // Eigene Lebensmittel: Name Pflicht, Nährwerte je 100 g nicht negativ; kcal und Wasser nur, wenn angegeben
  function cleanCustomFoods(list) {
    const seen = {};
    return (Array.isArray(list) ? list : []).filter(f => isObj(f) && typeof f.name === "string" && f.name.trim()).map(f => {
      const n = (v) => Math.max(0, isFinite(Number(v)) ? Number(v) : 0);
      const o = { name: f.name.trim(), kategorie: typeof f.kategorie === "string" && f.kategorie ? f.kategorie : "Eigene", eiweiss: n(f.eiweiss), fett: n(f.fett), kh: n(f.kh), fat: !!f.fat };
      if (f.kcal100 != null && f.kcal100 !== "" && Number(f.kcal100) > 0) o.kcal100 = Number(f.kcal100);
      if (f.wasser != null && f.wasser !== "" && isFinite(Number(f.wasser))) o.wasser = n(f.wasser);
      return o;
    }).filter(f => { const k = f.name.toLowerCase(); if (seen[k]) return false; seen[k] = true; return true; });
  }
  function cleanDayPlan(list) { return (Array.isArray(list) ? list : []).map(sl => ({ key: isObj(sl) && typeof sl.key === "string" ? sl.key : null })); }
  let state = load();
  // rawOverride: Inhalt eines Backups direkt übernehmen (auch wenn der Speicher nicht beschreibbar ist).
  function load(rawOverride) {
    let raw = null;
    try {
      raw = rawOverride != null ? rawOverride : localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const p = JSON.parse(raw), d = defaultState();
      if (!isObj(p)) return defaultState();
      const defaults = defaultState().settings;
      const settings = Object.assign(d.settings, isObj(p.settings) ? p.settings : {});
      // Zahl-Einstellungen: unbrauchbare Werte (null, Text) → Standard; leer ("") bleibt erlaubt (= Vorschlag verwenden)
      Object.keys(defaults).forEach(k => {
        const dv = defaults[k], v = settings[k];
        if (typeof dv !== "number" || v === "" || (typeof v === "number" && isFinite(v))) return;
        const n = typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
        settings[k] = isFinite(n) ? n : dv;
      });
      // Einstellungen früherer Versionen, die nichts mehr steuern (KetoCal-Schalter, feste Wassermengen, Spülen)
      ["withKeto", "showMitKeto", "showOhneKeto", "ketocal", "ketoFilter", "zwischenMl", "spuelMl", "maxMahlMl", "rundung"].forEach(k => { delete settings[k]; });
      // Alte Gruppen-Filter
      if (["fleisch", "vegetarisch", "unterwegs", "flasche"].indexOf(settings.filter) !== -1) settings.filter = "alle";
      // Favoriten gelten je Rezept: Schlüssel nur umbenennen (alte Namen), nicht mehr auf das Gericht zusammenfassen.
      // Ältere Familien-Favoriten („fam:…“) bleiben erhalten und zählen für beide Varianten.
      const favorites = [];
      cleanFavorites(p.favorites).forEach(k => { const nk = (typeof k === "string" && k.indexOf("fam:") === 0) ? toFamilyKey(k) : renameKey(k); if (favorites.indexOf(nk) === -1) favorites.push(nk); });
      return {
        settings: settings,
        compose: isObj(p.compose) ? Object.assign(d.compose, p.compose, {
          items: Array.isArray(p.compose.items) ? cleanItems(p.compose.items, "grams") : d.compose.items,
          fats: Array.isArray(p.compose.fats) ? cleanItems(p.compose.fats, "share") : d.compose.fats }) : d.compose,
        favorites: favorites,
        savedRecipes: cleanSavedRecipes(p.savedRecipes),
        scales: remapKeys(cleanNumMap(p.scales)),
        water: remapKeys(cleanNumMap(p.water)),
        portion: remapKeys(cleanNumMap(p.portion)),
        dayPlan: cleanDayPlan(p.dayPlan).map(sl => ({ key: renameKey(sl.key) || null })),
        basis: isObj(p.basis) ? p.basis : {},
        customFoods: cleanCustomFoods(p.customFoods),
        hiddenRecipes: cleanFavorites(p.hiddenRecipes),
      };
    } catch (e) {
      // Unlesbare Daten nicht stillschweigend verwerfen: Rohtext zur Rettung unter eigenem Schlüssel ablegen.
      if (raw && rawOverride == null) { try { localStorage.setItem(STORAGE_KEY + ".corrupt", raw); } catch (e2) {} }
      return defaultState();
    }
  }
  // Speichert den Zustand; false, wenn der Speicher nicht beschreibbar ist (privates Fenster, voll).
  // Danach gleicht der (freiwillige) Geräte-Abgleich die Änderung ab – außer beim Übernehmen eines fremden Stands.
  function save(fromSync) {
    let ok = true;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { ok = false; }
    if (fromSync !== true && typeof syncAfterSave === "function") { try { syncAfterSave(); } catch (e) {} }
    return ok;
  }
