/* HamHam Keto — Logik (GENERIERT aus src/*.js durch build-single.py – nicht direkt bearbeiten)
   Eine Seite: Vorgaben + Standard-Rezepte, die automatisch auf das
   Verhältnis und die Kalorien pro Mahlzeit umgerechnet werden.
   Einstellungen werden lokal im Browser gespeichert (localStorage). */

(function () {
  "use strict";

  const STORAGE_KEY = "ketoplaner.v5";

  /* ---------- State ---------- */
  function defaultState() {
    return {
      settings: { kcal: "", ratio: 1.8, mahlzeiten: 5, eiweiss: 20, weight: 8, proteinPerKg: 1.5, mctShare: 0.1, mctMode: "verhaeltnis", mctFett100: 100, mctKcal100: 830, dampfVerdunstung: 150, ketocal: "mit", view: "rezepte", filter: "alle", onlyQuelle: false, sort: "kategorie" },
      compose: { items: [{ food: "", grams: 60 }], fats: [{ food: "Schlagobers NÖM", share: 100 }], scale: true },
      favorites: [],
      savedRecipes: [],
      scales: {},
      water: {},
      portion: {}, // Portion angepasst (Rechnen): Faktor je Gericht, 1 = wie berechnet
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
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const p = JSON.parse(raw), d = defaultState();
      const settings = Object.assign(d.settings, p.settings || {});
      // Migration alter KetoCal-Felder auf einen einzelnen Schalter (withKeto)
      if (p.settings && typeof p.settings.withKeto !== "boolean") {
        if (typeof p.settings.showMitKeto === "boolean") settings.withKeto = p.settings.showMitKeto && !p.settings.showOhneKeto;
        else if (p.settings.ketocal && p.settings.ketocal !== "mit" && p.settings.ketocal !== "ohne") settings.withKeto = false;
      }
      // KetoCal-Phase (früher Dreistufen-Filter „alle/ohne/mit“) und alte Gruppen-Filter
      const ps = p.settings || {};
      if (ps.ketocal !== "mit" && ps.ketocal !== "ohne") settings.ketocal = ps.ketoFilter === "ohne" ? "ohne" : "mit";
      delete settings.ketoFilter;
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
    } catch (e) { return defaultState(); }
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- Helpers ---------- */
  // Zahl aus Eingabe oder Wert; ein Komma als Dezimaltrenner („8,5") wird akzeptiert.
  function num(v) { const n = parseFloat(typeof v === "string" ? v.replace(",", ".") : v); return isFinite(n) ? n : 0; }
  // Zahl zur Anzeige in einem Textfeld: deutsches Komma, keine überflüssigen Nullen („8,5", „9").
  function fmtNum(v) { return (v === "" || v === null || v === undefined || !isFinite(v)) ? "" : String(v).replace(".", ","); }
  function round1(v) { return Math.round(v * 10) / 10; }
  // Auf einen Schritt runden (0,1 / 0,5 / 1 g) – Fließkomma-sauber auf 3 Nachkommastellen.
  function roundTo(v, step) { const st = step > 0 ? step : 0.1; return Math.round(Math.round(v / st) * st * 1000) / 1000; }
  function fmt(v, dec) {
    if (v === "" || v === null || v === undefined || !isFinite(v)) return "—";
    const d = dec === undefined ? 1 : dec;
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d))
      .toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  // Verhältnis-Notation (Fett : Eiweiß+KH): immer „x:1" – auch unter 1 (z. B. „0,67:1"), damit die Zahl
  // vorne immer die eingegebene ist.
  function fmtRatio(r, dec) {
    if (r === null || r === undefined || !isFinite(r) || r <= 0) return "—";
    return fmt(r, dec) + ":1";
  }
  // Ziel-Verhältnis: nur die vordere Zahl, so viele Nachkommastellen wie nötig (max. 2).
  function fmtRatioNum(r) {
    if (!(r > 0) || !isFinite(r)) return "";
    const dec = Math.abs(r - Math.round(r)) < 0.005 ? 0 : (Math.abs(r * 10 - Math.round(r * 10)) < 0.05 ? 1 : 2);
    return fmt(r, dec);
  }
  function fmtTarget(r) { return (r > 0 && isFinite(r)) ? fmtRatioNum(r) + ":1" : "—"; }
  // Eingabe „1,8", „1.8", „1,8:1" oder „1:1,5" → Zahl (g Fett je 1 g Eiweiß+KH); 0 wenn ungültig.
  function parseRatio(text) {
    const t = String(text || "").replace(/,/g, ".").replace(/\s+/g, "");
    const m = t.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (m) { const a = parseFloat(m[1]), b = parseFloat(m[2]); return a > 0 && b > 0 ? a / b : 0; }
    if (!/^\d+(?:\.\d+)?$/.test(t)) return 0;
    const n = parseFloat(t); return isFinite(n) && n > 0 ? n : 0;
  }
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // Zubereitungstext in nummerierte Schritte zerlegen (Satzende + Großbuchstabe; kein Lookbehind wegen iOS-Safari).
  function splitSteps(text) {
    if (!text) return [];
    const guarded = String(text).replace(/z\. B\./g, "z. B.");
    return guarded.split(/\.\s+(?=[A-ZÄÖÜ])/).map(s => s.trim()).filter(Boolean)
      .map(s => (/[.!?]$/.test(s) ? s : s + ".").replace(/z\. B\./g, "z. B."));
  }
  /* ---------- Hintergrund einfrieren, solange ein Overlay offen ist ----------
     „overflow: hidden“ am body reicht auf iOS Safari nicht – die Seite dahinter scrollt beim Wischen mit.
     Deshalb wird der body fixiert (position: fixed) und die Scrollposition gemerkt und beim Schließen
     wiederhergestellt. Mehrere Overlays (Detail → Editor, Picker) werden gezählt. */
  const openModals = new Set();
  let lockedScrollY = 0;
  function modalOpen(id) {
    if (openModals.size === 0) {
      lockedScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      document.body.classList.add("modal-open");
      document.body.style.top = -lockedScrollY + "px";
    }
    openModals.add(id);
  }
  function modalClose(id) {
    openModals.delete(id);
    if (openModals.size === 0) {
      document.body.classList.remove("modal-open");
      document.body.style.top = "";
      try { window.scrollTo(0, lockedScrollY); } catch (e) {}
    }
  }

  /* ---------- Lebensmittel (nur intern für die Berechnung) ---------- */
  let foodIndex = {};
  function rebuildFoodIndex() {
    foodIndex = {};
    FOODS_DEFAULT.forEach(f => { foodIndex[f.name] = f; });
    // MCT-Öl: Fett- und kcal-Wert vom Etikett übersteuerbar (⚙️ Einstellungen).
    // Vorbelegung: Fett 100 g/100 g; 8,3 kcal/g ist ein PRAXISWERT, keine belegte
    // Konstante. Emulsionen (z. B. 50 % Fett) sind damit ebenfalls abbildbar –
    // "Öl = 100 % Fett" ist bewusst NICHT hart verdrahtet.
    const m = foodIndex["MCT-Öl C8+C10"];
    if (m) {
      const s = (typeof state !== "undefined" && state && state.settings) ? state.settings : {};
      foodIndex["MCT-Öl C8+C10"] = Object.assign({}, m, {
        fett: num(s.mctFett100) > 0 ? num(s.mctFett100) : 100,
        kcal100: num(s.mctKcal100) > 0 ? num(s.mctKcal100) : 830,
      });
    }
  }
  function lookup(name) { return foodIndex[name] || null; }
  // kcal je 100 g: explizite Etikett-Angabe (kcal100) geht vor der 4/9/4-Formel.
  function kcal100Of(f) { return f.kcal100 != null ? f.kcal100 : 4 * f.eiweiss + 9 * f.fett + 4 * f.kh; }

  function lineMacros(item) {
    const f = lookup(item.food);
    if (!f || item.grams === "" || item.grams === null) return { eiweiss: 0, fett: 0, kh: 0, kcal: 0, valid: false };
    const g = num(item.grams);
    const eiweiss = f.eiweiss * g / 100, fett = f.fett * g / 100, kh = f.kh * g / 100;
    return { eiweiss, fett, kh, kcal: kcal100Of(f) * g / 100, valid: true };
  }
  function sumMacros(items) {
    return items.reduce((a, it) => {
      const m = lineMacros(it);
      a.eiweiss += m.eiweiss; a.fett += m.fett; a.kh += m.kh; a.kcal += m.kcal; return a;
    }, { eiweiss: 0, fett: 0, kh: 0, kcal: 0 });
  }
  function ratioOf(m) { const d = m.eiweiss + m.kh; return d ? m.fett / d : null; }
  function ratioClass(actual, target) {
    if (actual === null || !isFinite(actual) || target === 0) return "idle";
    const dev = Math.abs(actual - target) / target;
    if (dev <= 0.05) return "ok"; if (dev <= 0.15) return "warn"; return "bad";
  }
  // Ungefähres Volumen in ml (Fett ~0,92 g/ml, sonst ~1,0 g/ml)
  function volumeMl(items) {
    return items.reduce((a, it) => {
      const f = lookup(it.food); const g = num(it.grams);
      return a + g / ((f && f.fett >= 50) ? 0.92 : 1.0);
    }, 0);
  }
  // Wasseranteil je 100 g: Etikett/Override („wasser“), sonst Rest ohne Eiweiß, Fett, KH und Ballaststoffe (Näherung
  // für frische Zutaten; Öle 0, Wasser 100). Damit lässt sich die Flüssigkeit einer Mahlzeit abschätzen.
  function waterOf(f) {
    if (!f) return 0;
    if (f.wasser != null) return num(f.wasser);
    return Math.max(0, 100 - (num(f.eiweiss) + num(f.fett) + num(f.kh) + num(f.ballaststoffe)));
  }
  function fluidOf(items) {
    return items.reduce((a, it) => { const f = lookup(it.food); return a + (f ? waterOf(f) * num(it.grams) / 100 : 0); }, 0);
  }

  /* ---------- Gruppen & Schnellfilter ----------
     Die Rezepte sind nach der Hauptzutat gruppiert („Was habe ich da?“):
     Geflügel, Rind & Schwein, Fisch, Ei, Erdäpfel & Gemüse, Obst & Brei und
     „Angerührt“ (ohne Kochen: Fertigprodukte und Pulver-Mischungen). */
  const FILTERS = [
    { id: "alle", label: "Alle" },
    { id: "gefluegel", label: "🍗 Geflügel" },
    { id: "rind", label: "🥩 Rind & Schwein" },
    { id: "fisch", label: "🐟 Fisch" },
    { id: "ei", label: "🥚 Ei" },
    { id: "gemuese", label: "🥔 Erdäpfel & Gemüse" },
    { id: "obst", label: "🍓 Obst & Brei" },
    { id: "angeruehrt", label: "🥤 Angerührt" },
  ];
  // Primäre Gruppe eines Rezepts (aus den Zutaten abgeleitet; Fleisch/Fisch haben Vorrang).
  function recipeGroup(rec) {
    if (rec.angeruehrt) return "angeruehrt";
    let g = null, egg = false, fruit = false;
    rec.items.forEach(it => {
      const f = lookup(it.food); if (!f) return;
      const k = f.kategorie, n = it.food || "";
      if (k === "Fleisch" || k === "Wurst") g = g || (/hühner|puten|hendl|pute|huhn/i.test(n) ? "gefluegel" : "rind");
      else if (k === "Fisch") g = g || "fisch";
      if (k === "Eier") egg = true;
      if (k === "Obst") fruit = true;
    });
    return g || (egg ? "ei" : fruit ? "obst" : "gemuese");
  }
  function matchesFilter(rec, filter) {
    return !filter || filter === "alle" || recipeGroup(rec) === filter;
  }

  /* ---------- Abgeleitete Werte ---------- */
  // Voreinstellung der App für den Eiweißbedarf (g je kg Körpergewicht und Tag); die Verordnung geht immer vor.
  const PROTEIN_STANDARD = 1.5;
  function derived() {
    const s = state.settings;
    const ratio = num(s.ratio);
    const mahl = Math.max(1, num(s.mahlzeiten) || 1);
    const perKg = num(s.proteinPerKg), weight = num(s.weight);
    // Kalorien: leer = Vorschlag nach Gewicht (80 kcal/kg, FAO/WHO/UNU 2004, 6–24 Monate); ohne Gewicht 700 kcal.
    const r10 = (v) => Math.round(v / 10) * 10;
    const kcalManual = num(s.kcal) > 0;
    const kcalAuto = weight > 0 ? r10(weight * 80) : 700;
    const kcal = kcalManual ? num(s.kcal) : kcalAuto;
    const autoProtein = perKg > 0 && weight > 0;
    const eiweiss = autoProtein ? Math.round(weight * perKg) : num(s.eiweiss);
    const mctShare = Math.min(1, Math.max(0, num(s.mctShare)));
    const mctMode = s.mctMode === "kalorien" ? "kalorien" : "verhaeltnis";
    const dampfVerdunstung = num(s.dampfVerdunstung);
    // Rundung beim Abwiegen: alle Zutaten außer Fettträgern fest auf 0,5 g, Wasser auf 1 ml, Fettträger immer 0,1 g.
    const rundung = 0.5;
    // Kalorien-Korridor: Richtwert ≈ 80 kcal/kg (FAO/WHO/UNU 2004, 6–24 Monate), Untergrenze 70 kcal/kg,
    // Obergrenze 90 kcal/kg. Das Minimum ist manuell übersteuerbar; ohne Gewicht gilt 85 % des Ziels.
    const kcalRichtwert = weight > 0 ? r10(weight * 80) : null;
    const kcalMaxAuto = weight > 0 ? r10(weight * 90) : null;
    const kcalMinAuto = weight > 0 ? r10(weight * 70) : r10(kcal * 0.85);
    const kcalMin = num(s.kcalMin) > 0 ? num(s.kcalMin) : kcalMinAuto;
    // Flüssigkeit: Richtwert nach Holliday-Segar (100 ml/kg bis 10 kg, dann 50 bzw. 20 ml/kg je weiterem kg);
    // manuell übersteuerbar. Modus: Wasser zwischen den Mahlzeiten sondieren oder in den Mahlzeiten enthalten.
    const hs = (w) => w <= 0 ? 0 : w <= 10 ? 100 * w : w <= 20 ? 1000 + 50 * (w - 10) : 1500 + 20 * (w - 20);
    const fluidAuto = weight > 0 ? r10(hs(weight)) : 0;
    const fluidDay = num(s.fluidMl) > 0 ? num(s.fluidMl) : fluidAuto;
    // Zwei Stellungen: „zwischen“ (Standard; frühere Werte „ausgewogen“/„zwischen“ landen hier) oder „mahlzeit“.
    const wasserModus = s.wasserModus === "mahlzeit" ? "mahlzeit" : "zwischen";
    // Höchstmenge je Mahlzeit (Bolus): 25 ml/kg – im Modus „zwischen“ wird Wasser nur bis zu dieser Größe in die
    // Mahlzeit gerechnet; was darüber hinaus fehlt, meldet die App als Fehlmenge.
    const maxMahlMl = weight > 0 ? r10(weight * 25) : 0;
    // Wasser je Zwischenzeit (eine Spritze ≈ 60 ml): feste Vorgabe; die Mahlzeiten bekommen den Rest des Tagesbedarfs.
    const zwischenMl = (s.zwischenMl === "" || s.zwischenMl == null) ? 60 : Math.max(0, num(s.zwischenMl));
    const gapsDay = Math.max(1, mahl - 1);
    const zwischenTag = wasserModus === "zwischen" ? zwischenMl * gapsDay : 0;
    // Flüssigkeitsziel je Mahlzeit: nach Abzug der Zwischenzeiten (im Modus „mahlzeit“ der volle Anteil).
    const fluidMahlZiel = Math.max(0, fluidDay - zwischenTag) / mahl;
    return { kcal, kcalAuto, kcalManual, ratio, mahl, eiweiss, autoProtein, proteinPerKg: perKg, proteinStandard: PROTEIN_STANDARD, kcalMahl: kcal / mahl, eiweissMahl: eiweiss / mahl, mctShare, mctMode, dampfVerdunstung, rundung,
      kcalMin, kcalMinMahl: kcalMin / mahl, kcalMinAuto, kcalMinManual: num(s.kcalMin) > 0, kcalRichtwert, kcalMaxAuto, weight,
      fluidDay, fluidMahl: fluidMahlZiel, fluidAuto, fluidManual: num(s.fluidMl) > 0, wasserModus, maxMahlMl,
      zwischenMl, zwischenTag, gapsDay };
  }

  /* ---------- Rezept-Anpassung ---------- */
  // Stell-Zutat zum Ausgleich = am stärksten fettdominante Zutat
  // (höchstes Fett/(Eiweiß+KH)). Erkennt Butter/Öl wie auch Sahne/Streichgenuss.
  function fatItemIndex(items) {
    let idx = -1, best = -1;
    items.forEach((it, i) => {
      const f = lookup(it.food); if (!f || f.fett <= 0) return;
      const denom = f.eiweiss + f.kh;
      const rr = denom > 0 ? f.fett / denom : Infinity;
      if (rr > best) { best = rr; idx = i; }
    });
    return idx;
  }
  // Fettträger einer Zutatenliste: die Stell-Zutat (fettdominanteste) plus alle Öle.
  function isFatCarrier(items, i) { return i === fatItemIndex(items) || isOilName(items[i].food); }
  // Rundung fürs Abwiegen: alle Zutaten außer den Fettträgern auf `step` (Wasser auf 1 ml). Danach werden die
  // Fettträger gemeinsam so nachjustiert, dass das Verhältnis wieder dem Ausgangswert entspricht. Sie folgen NICHT der
  // gewählten Rundung, sondern bleiben immer auf 0,1 g genau (Anzeige stets mit einer Nachkommastelle).
  function roundForScale(items, step) {
    const target = ratioOf(sumMacros(items));
    const fi = fatItemIndex(items);
    const fatG = (i) => i === fi || isOilName(items[i].food);
    const out = items.map((it, i) => {
      if (fatG(i)) return { food: it.food, grams: num(it.grams) };
      return { food: it.food, grams: roundTo(num(it.grams), /wasser/i.test(it.food) ? 1 : step) };
    });
    if (target > 0 && fi >= 0) {
      let fO = 0, pcO = 0, fF = 0, pcF = 0;
      out.forEach((it, i) => { const m = lineMacros(it); if (fatG(i)) { fF += m.fett; pcF += m.eiweiss + m.kh; } else { fO += m.fett; pcO += m.eiweiss + m.kh; } });
      const denom = fF - target * pcF;
      if (denom > 1e-9) { const k = (target * pcO - fO) / denom; if (k > 0 && isFinite(k)) out.forEach((it, i) => { if (fatG(i)) it.grams = num(it.grams) * k; }); }
    }
    out.forEach((it, i) => { if (fatG(i)) it.grams = roundTo(num(it.grams), 0.1); });
    return out;
  }
  // Rechnet Rezept auf Ziel-Verhältnis + Ziel-Kalorien um.
  function computeAdjustedRecipe(rec, targetKcal, ratio) {
    const base = rec.items.map(it => ({ food: it.food, grams: num(it.grams) }));
    const baseSum = sumMacros(base);
    const T = (targetKcal && targetKcal > 0) ? targetKcal : baseSum.kcal;
    const fi = fatItemIndex(base);
    if (fi < 0) {
      const s = baseSum.kcal > 0 ? T / baseSum.kcal : 1;
      const items = base.map(it => ({ food: it.food, grams: round1(it.grams * s) }));
      const sum = sumMacros(items);
      return { items, ratio: ratioOf(sum), kcal: sum.kcal, ok: false, fatIndex: -1 };
    }
    const fat = lookup(base[fi].food);
    let Pn = 0, Fn = 0, Cn = 0, Kn = 0;
    base.forEach((it, i) => {
      if (i === fi) return;
      const f = lookup(it.food); if (!f) return;
      Pn += f.eiweiss * it.grams / 100; Fn += f.fett * it.grams / 100; Cn += f.kh * it.grams / 100;
      Kn += kcal100Of(f) * it.grams / 100;
    });
    const fp = fat.eiweiss, ff = fat.fett, fc = fat.kh;
    const A = Fn - ratio * (Pn + Cn);
    const B = (ff - ratio * (fp + fc)) / 100;
    const kf = kcal100Of(fat);
    let x, s;
    if (Math.abs(A) < 1e-9) { x = 0; s = Kn > 0 ? T / Kn : 1; }
    else {
      const denom = kf / 100 - B * Kn / A;
      if (Math.abs(denom) < 1e-9) return { items: base, ratio: ratioOf(baseSum), kcal: baseSum.kcal, ok: false, fatIndex: fi };
      x = T / denom; s = -x * B / A;
    }
    if (x < 0 || s <= 0) return { items: base, ratio: ratioOf(baseSum), kcal: baseSum.kcal, ok: false, fatIndex: fi };
    const items = base.map((it, i) => i === fi
      ? { food: it.food, grams: round1(x) }
      : { food: it.food, grams: round1(it.grams * s) });
    const sum = sumMacros(items);
    return { items, ratio: ratioOf(sum), kcal: sum.kcal, ok: true, fatIndex: fi };
  }
  // Fleisch-Tausch: alle anderen Zutaten (Gemüse, Wasser, Öl/Fett) bleiben fix;
  // nur die Fleischmenge wird so berechnet, dass das Verhältnis exakt stimmt.
  // (Kalorien dürfen sich dabei leicht ändern.)
  function solveMeatForRatio(items, mi, ratio) {
    let F = 0, PC = 0;
    items.forEach((it, i) => {
      if (i === mi) return; const f = lookup(it.food); if (!f) return;
      const g = num(it.grams); F += f.fett * g / 100; PC += (f.eiweiss + f.kh) * g / 100;
    });
    const mf = lookup(items[mi].food); if (!mf) return null;
    const denom = mf.fett / 100 - ratio * (mf.eiweiss + mf.kh) / 100;
    if (Math.abs(denom) < 1e-9) return null;
    const m = (ratio * PC - F) / denom;
    if (!(m > 0)) return null;
    return items.map((it, i) => i === mi
      ? { food: it.food, grams: round1(m) }
      : { food: it.food, grams: round1(num(it.grams)) });
  }

  /* ---------- Fleisch-Tausch ----------
     Diätologin: 20 g Huhn ≙ 30 g Rind(erhack/Faschiertes) ≙ 18 g Pute.
     Faktoren relativ zu Huhn. Die Fleischmenge eines Rezepts wird in
     „Huhn-Äquivalent" umgerechnet und auf das gewählte Fleisch angepasst.
     Der Rest des Rezepts (v. a. das Fett) wird wie immer automatisch nachgerechnet. */
  const MEATS = {
    huhn: { food: "Hühnerbrust ohne Haut", factor: 1.0, label: "Huhn", icon: "🍗", word: "Hendl" },
    rind: { food: "Rinderfaschiertes", factor: 1.5, label: "Rind", icon: "🥩", word: "Rinderfaschiertes" },
    pute: { food: "Putenbrust ohne Haut", factor: 0.9, label: "Pute", icon: "🦃", word: "Putenfleisch" },
  };
  // Fleisch-Wörter in den Zubereitungstexten, die beim Tausch angepasst werden.
  const MEAT_WORDS_RE = /Rinderfaschiertes|Rinder-Faschiertes|Hühnerfleisch|Hühnerbrust|Putenfleisch|Putenbrust|Faschiertes|Rindfleisch|Hendl|Hühnchen|Pute|Huhn|Rind/g;
  function meatKeyOfFood(name) { for (const k in MEATS) if (MEATS[k].food === name) return k; return null; }
  function recipeMeatSlot(rec) {
    for (let i = 0; i < rec.items.length; i++) {
      const k = meatKeyOfFood(rec.items[i].food);
      if (k) return { index: i, baseKey: k, baseGrams: num(rec.items[i].grams) };
    }
    return null;
  }
  function meatGramsFor(slot, key) {
    const chickenEquiv = slot.baseGrams / MEATS[slot.baseKey].factor;
    return round1(chickenEquiv * MEATS[key].factor);
  }
  // Tausch ist nur temporär (gilt für das gerade geöffnete Rezept, nichts wird gespeichert).
  function applyMeatChoice(rec, choice) {
    const slot = recipeMeatSlot(rec); if (!slot) return rec;
    if (!choice || choice === slot.baseKey) return rec;
    const grams = meatGramsFor(slot, choice);
    const items = rec.items.map((it, i) => i === slot.index ? { food: MEATS[choice].food, grams: grams } : it);
    return Object.assign({}, rec, { items: items });
  }
  function adaptPrep(text, rec, choice) {
    if (!text) return text;
    const slot = recipeMeatSlot(rec); if (!slot) return text;
    return text.replace(MEAT_WORDS_RE, MEATS[choice || slot.baseKey].word);
  }

  /* ---------- Öl-Rechnung (Rapsöl / MCT) ----------
     s = Anteil der Öl-FETTMASSE, die aus MCT kommt (0…1) – in beiden Modi gleich.
     Beim Tausch eines Fettes gegen ein Fett anderer Energiedichte lassen sich
     Fettmasse, Kalorien und Verhältnis NICHT gleichzeitig halten – nur zwei.
     Welche zwei, entscheidet die Anwenderin über den Modus; die App legt es
     nicht still fest:
       VERHAELTNIS: Öl-Fett F = R·NF − fett_rest  → Verhältnis für jedes s
                    identisch, kcal sinken mit s.
       KALORIEN:    Öl-Fett F = (kcal_ziel − kcal_rest) / c(s)  → kcal für jedes
                    s identisch, Verhältnis steigt mit s.
     Öle sind Tabellenwerte (Fett/100 g und kcal/100 g, vom Etikett übersteuerbar,
     siehe rebuildFoodIndex) – "Öl = 100 % Fett" ist nicht hart verdrahtet;
     Emulsionen (Fettanteil « 1) widerlegen das. */
  function isOilName(name) { return /öl|oil/i.test(name || ""); }
  // Index des Öls (fettdominante Zutat, sofern es ein Öl ist) im Zutatensatz.
  function oilSlotIndex(items) {
    const fi = fatItemIndex(items);
    return (fi >= 0 && isOilName(items[fi].food)) ? fi : -1;
  }
  function oilProfile(name) {
    const f = lookup(name); if (!f || f.fett <= 0) return null;
    const ff = f.fett / 100;                 // g Fett je g Produkt (fat_fraction)
    const e = kcal100Of(f) / 100;            // kcal je g Produkt
    return { ff: ff, e: e, epf: e / ff };    // epf = kcal je g Öl-FETT
  }
  function applyOilMix(res, d, s, mode, kcalZiel) {
    if (!(s > 0)) return res;
    const items = res.items;
    const oi = oilSlotIndex(items); if (oi < 0) return res;
    const mct = oilProfile("MCT-Öl C8+C10"), lct = oilProfile("Rapsöl");
    if (!mct || !lct) return res;
    // Rezept ohne Öl: fett_rest, NF = Eiweiß + KH, kcal_rest
    let fettRest = 0, nf = 0, kcalRest = 0;
    items.forEach((it, i) => {
      if (i === oi) return;
      const m = lineMacros(it);
      fettRest += m.fett; nf += m.eiweiss + m.kh; kcalRest += m.kcal;
    });
    if (nf <= 0) return res;
    const c = s * mct.epf + (1 - s) * lct.epf; // kcal je Gramm Öl-Fett
    const F = mode === "kalorien" ? (kcalZiel - kcalRest) / c : d.ratio * nf - fettRest;
    if (!(F > 0)) return res;
    const gMct = s * F / mct.ff, gLct = (1 - s) * F / lct.ff;
    const kcalNeu = kcalRest + gMct * mct.e + gLct * lct.e;
    const ratioNeu = (fettRest + F) / nf;
    // Zusicherungen (ungerundet): je Modus bleibt genau eine Größe für jedes s exakt.
    if (mode === "kalorien") console.assert(Math.abs(kcalNeu - kcalZiel) < 1e-6, "Öl-Rechnung: kcal-Invariante verletzt");
    else console.assert(Math.abs(ratioNeu - d.ratio) < 1e-6, "Öl-Rechnung: Verhältnis-Invariante verletzt");
    const oilRows = [];
    if (gLct > 0.049) oilRows.push({ food: "Rapsöl", grams: round1(gLct) });
    if (gMct > 0.049) oilRows.push({ food: "MCT-Öl C8+C10", grams: round1(gMct) });
    if (!oilRows.length) return res;
    const newItems = [];
    items.forEach((it, i) => { if (i === oi) { oilRows.forEach(rw => newItems.push(rw)); } else newItems.push(it); });
    const sm = sumMacros(newItems);
    return {
      items: newItems, ratio: ratioOf(sm), kcal: sm.kcal, ok: res.ok, fatIndex: oi,
      // Ungerundete Kenngrößen für Anzeige und Warnhinweise:
      mct: {
        gMct: gMct, gLct: gLct, kcalNeu: kcalNeu, kcalZiel: kcalZiel,
        dev: kcalNeu - kcalZiel, ratioNeu: ratioNeu, ratioBasis: d.ratio,
        energiePz: kcalNeu > 0 ? gMct * mct.e / kcalNeu * 100 : 0,
      },
    };
  }
  // Einordnung des MCT-Energieanteils nach der Konsensusempfehlung
  // (Kossoff 2018): modifizierte MCT-Diät 30 %, Arbeitsbereich 40–50 %,
  // traditionelle MCT-Diät 60 %.
  function mctEinordnung(pz) {
    if (pz < 30) return "unter der modifizierten MCT-Diät (30 %)";
    if (pz <= 50) return "im Arbeitsbereich 40–50 %";
    if (pz <= 60) return "über dem Arbeitsbereich 40–50 %";
    return "über der traditionellen MCT-Diät (60 %)";
  }

  /* ---------- Rezeptfamilien, Favoriten & Rezeptquellen ----------
     Ein „Gericht“ (Familie) fasst die Fettbasis-Varianten eines Rezepts zusammen,
     z. B. „Hendl & Zucchini“ (Rapsöl) und „Hendl & Zucchini (mit KetoCal)“.
     Favoriten, gemerkte Menge und Wasser gelten je Gericht; der Tagesplan merkt
     sich die konkrete Variante. */
  function hasKetoCal(items) { return items.some(it => (it.food || "").toLowerCase().indexOf("ketocal") !== -1); }
  function recipeKey(rec) { return rec.custom ? rec.key : ("std:" + rec.name); }
  const FAMILY_STRIP_RE = / \(mit KetoCal\)|, mit KetoCal/g;
  function familyOf(rec) { return rec.custom ? rec.name : (rec.familie || rec.name.replace(FAMILY_STRIP_RE, "")); }
  function familyKey(rec) { return rec.custom ? rec.key : ("fam:" + familyOf(rec)); }
  // Favoriten gelten je Rezept (Variante); ältere Favoriten je Gericht („fam:…“) zählen weiter.
  function isFav(rec) { return state.favorites.indexOf(recipeKey(rec)) !== -1 || state.favorites.indexOf(familyKey(rec)) !== -1; }
  function toggleFav(rec) {
    const k = recipeKey(rec), fk = familyKey(rec);
    if (isFav(rec)) state.favorites = state.favorites.filter(x => x !== k && x !== fk);
    else state.favorites.push(k);
    save();
  }
  // Alle Rezepte: zuerst eigene, dann Standard; ketocal/Tags abgeleitet
  function allRecipes() {
    const saved = state.savedRecipes.map(sr => ({
      custom: true, key: sr.key, name: sr.name, icon: sr.icon || "📝",
      ketocal: hasKetoCal(sr.items), items: sr.items,
      thermomix: sr.thermomix || "Zutaten vorbereiten, gemeinsam fein pürieren und das Fett glatt unterrühren.",
      zubereitung: sr.zubereitung || "Eigenes Rezept – Zutaten vorbereiten, fein pürieren und das Fett untermischen.",
    }));
    return saved.concat(RECIPES_SONDE);
  }
  // Fettbasis einer Variante als Kurztext: „Rapsöl“, „Butter“, „KetoCal + Butter“ …
  function basisLabel(rec) {
    const fi = fatItemIndex(rec.items);
    const lever = fi >= 0 ? String(rec.items[fi].food).replace(/ NÖM$/, "") : "";
    if (hasKetoCal(rec.items)) return lever && !/ketocal/i.test(lever) ? "KetoCal + " + lever : "KetoCal";
    return lever || "ohne Fett";
  }
  // Alle Gerichte in Reihenfolge des ersten Auftretens: { key, name, icon, variants: [rec …] }
  function allFamilies() {
    const map = {}, order = [];
    allRecipes().forEach(r => {
      const k = familyKey(r);
      if (!map[k]) { map[k] = { key: k, name: familyOf(r), icon: r.icon, variants: [] }; order.push(k); }
      map[k].variants.push(r);
    });
    return order.map(k => map[k]);
  }
  function familyOfRecipe(rec) {
    const k = familyKey(rec);
    return allFamilies().find(f => f.key === k) || { key: k, name: familyOf(rec), icon: rec.icon, variants: [rec] };
  }
  // Jedes Rezept steht für sich (mit oder ohne KetoCal). Gibt es ein Gericht in beiden Fettbasen, sind das
  // zwei Einträge; „Geschwister“ ist die jeweils andere Variante (für den „Auch als“-Link im Rezept).
  function siblingVariants(rec) { return familyOfRecipe(rec).variants.filter(v => recipeKey(v) !== recipeKey(rec)); }
  function isMulti(rec) { return familyOfRecipe(rec).variants.length > 1; }

  /* ---------- Rezepte rendern ---------- */
  function renderRezepte() {
    const s = state.settings;
    const $ = id => document.getElementById(id);
    // Felder nie überschreiben, während darin getippt wird – sonst verschwindet z. B. das Komma bei „8,5".
    const put = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
    put("set-mahlzeiten", s.mahlzeiten);
    put("set-ratio", fmtRatioNum(num(s.ratio)));
    put("set-weight", fmtNum(num(s.weight) > 0 ? num(s.weight) : ""));
    put("set-mct-fett", s.mctFett100 || "");
    put("set-mct-kcal", s.mctKcal100 || "");
    put("set-verdunstung", (s.dampfVerdunstung === 0 || s.dampfVerdunstung) ? s.dampfVerdunstung : "");
    $("set-proteinmode").value = String(s.proteinPerKg || 0);

    const d = derived();
    // Vorschläge stehen als echte Werte im Feld (nicht als grauer Platzhalter). Die Zeile darunter sagt, woher der
    // Wert kommt: „✓ Vorschlag …“ (grün) oder „eigener Wert“ mit dem Link zurück zum Vorschlag.
    const src = (id, manual, autoText, resetLabel) => {
      const sp = $("src-" + id), bt = $("reset-" + id);
      if (sp) { sp.textContent = manual ? "eigener Wert" : "✓ " + autoText; sp.classList.toggle("auto", !manual); }
      if (bt) { bt.hidden = !manual; if (resetLabel) bt.textContent = resetLabel; }
    };
    put("set-kcal", d.kcalManual ? s.kcal : d.kcalAuto);
    src("kcal", d.kcalManual, d.weight > 0 ? "Vorschlag · 80 kcal/kg" : "Vorgabe ohne Gewicht", "↺ Vorschlag " + fmt(d.kcalAuto, 0));
    put("set-kcalmin", d.kcalMinManual ? s.kcalMin : d.kcalMinAuto);
    src("kcalmin", d.kcalMinManual, d.weight > 0 ? "Vorschlag · 70 kcal/kg" : "Vorschlag · 85 % des Ziels", "↺ Vorschlag " + fmt(d.kcalMinAuto, 0));
    put("set-fluid", d.fluidManual ? s.fluidMl : (d.fluidAuto > 0 ? d.fluidAuto : ""));
    $("set-fluid").placeholder = d.fluidAuto > 0 ? "" : "ml/Tag (Gewicht eintragen)";
    src("fluid", d.fluidManual, d.fluidAuto > 0 ? "Vorschlag · 100 ml/kg" : "kein Vorschlag ohne Gewicht", "↺ Vorschlag " + fmt(d.fluidAuto, 0));
    src("protein", d.proteinPerKg !== d.proteinStandard, "Standard " + fmt(d.proteinStandard, 1) + " g/kg/Tag", "↺ Standard");
    // Menge je Zwischenzeit: im Modus „in den Mahlzeiten“ bleibt das Feld an seinem Platz, ist aber ausgegraut (nichts springt).
    const zwOn = d.wasserModus === "zwischen", zwEl = $("set-zwischen");
    const zwManual = zwOn && !(s.zwischenMl === "" || s.zwischenMl == null) && num(s.zwischenMl) !== 60;
    put("set-zwischen", zwOn ? d.zwischenMl : "");
    if (zwEl) { zwEl.disabled = !zwOn; zwEl.placeholder = zwOn ? "" : "– (alles in den Mahlzeiten)"; }
    src("zwischen", zwManual, zwOn ? "Vorgabe · eine Spritze" : "nicht nötig", "↺ 60 ml");
    // Eiweiß: bei Bedarf je kg steht das Ergebnis neben der Auswahl, das Gramm-Feld erscheint nur bei „manuell“.
    put("set-eiweiss", d.autoProtein ? d.eiweiss : s.eiweiss);
    const em = $("eiweiss-manual"); if (em) em.hidden = d.autoProtein;
    const ea = $("eiweiss-auto"); if (ea) ea.textContent = d.autoProtein ? "= " + fmt(d.eiweiss, 0) + " g/Tag" : (num(s.weight) > 0 ? "" : "(Gewicht eintragen)");
    renderHeader(d);
    renderVorgaben(d);
    if (state.settings.view === "heute") renderHeute();

    // Schnellfilter-Chips: Gruppen (entweder/oder) + Schalter (KetoCal-Phase, Diätologie)
    const filter = FILTERS.some(f => f.id === s.filter) ? s.filter : "alle";
    const q = (($("recipe-search") || {}).value || "").trim().toLowerCase();
    const onlyQuelle = !!s.onlyQuelle, hideKeto = !!s.hideKeto;
    // Eine wischbare Zeile mit den Gruppen; der aktive Chip wird ins Bild gerückt. KetoCal-Phase steht in
    // Kopfzeile und Vorgaben, der Diätologie-Filter und die Sortierung im „⋯“-Aufklapper.
    const fb = $("filter-bar");
    fb.innerHTML = "";
    let activeChip = null;
    FILTERS.forEach(f => {
      const chip = el("button", { class: "chip" + (f.id === filter ? " active" : "") }, f.label);
      chip.addEventListener("click", () => { state.settings.filter = f.id; save(); renderRezepte(); });
      fb.appendChild(chip);
      if (f.id === filter) activeChip = chip;
    });
    if (activeChip && fb.clientWidth > 0 && fb.scrollWidth > fb.clientWidth) {
      fb.scrollLeft = Math.max(0, activeChip.offsetLeft - (fb.clientWidth - activeChip.offsetWidth) / 2);
    }
    const oq = $("only-quelle"); if (oq) oq.checked = onlyQuelle;
    const hk = $("hide-keto"); if (hk) hk.checked = hideKeto;
    const mt = $("more-toggle"); if (mt) mt.classList.toggle("open", onlyQuelle || hideKeto || (s.sort && s.sort !== "kategorie") || !$("more-row").hidden);
    const stg = $("search-toggle"); if (stg) stg.classList.toggle("open", !!q || !$("search-row").hidden);

    // Jedes Rezept ist ein Eintrag – mit oder ohne KetoCal. Gerichte in beiden Fettbasen erscheinen zweimal
    // (gleicher Name, Schild zeigt die Fettbasis). Rezepte, die das Verhältnis nicht erreichen, entfallen.
    const hitItems = (r) => r.items.some(it => (it.food || "").toLowerCase().indexOf(q) !== -1);
    const entries = [];
    allRecipes().forEach(rec => {
      const name = familyOf(rec);
      if (onlyQuelle && !rec.quelle) return;
      if (hideKeto && rec.ketocal) return;
      if (!matchesFilter(rec, filter)) return;
      if (q && name.toLowerCase().indexOf(q) === -1 && !hitItems(rec)) return;
      const res = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
      if (!res.ok) return;
      // Kachel zeigt die tatsächliche Mahlzeit (inkl. MCT-Mix, gemerktem Wasser) – wie Detail und Tagesplan.
      entries.push({ fam: { name: name }, rec, res: computeMealView(rec, d, null).res });
    });
    // Innerhalb einer Gruppe: nach Name, gleiche Namen ohne KetoCal zuerst
    const byName = (a, b) => a.fam.name.localeCompare(b.fam.name, "de") || ((a.rec.ketocal ? 1 : 0) - (b.rec.ketocal ? 1 : 0));

    const sort = s.sort || "kategorie";
    $("sort-select").value = sort;

    const list = $("recipe-list");
    list.innerHTML = "";
    if (entries.length === 0) {
      list.appendChild(el("div", { class: "card empty" }, "Keine Gerichte für diese Auswahl."));
      return;
    }

    function appendGroup(title, arr) {
      if (!arr.length) return;
      const sorted = arr.slice().sort(byName);
      list.appendChild(el("div", { class: "group-head" }, title + ' <span class="group-count">' + sorted.length + "</span>"));
      const grid = el("div", { class: "tiles" });
      sorted.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d, x.fam)));
      list.appendChild(grid);
    }

    if (sort === "kategorie") {
      const favs = entries.filter(x => isFav(x.rec));
      const rest = entries.filter(x => !isFav(x.rec));
      appendGroup("⭐ Favoriten", favs);
      FILTERS.filter(f => f.id !== "alle").forEach(f => appendGroup(f.label, rest.filter(x => recipeGroup(x.rec) === f.id)));
    } else {
      const keyFn = sort === "eiweiss"
        ? x => -sumMacros(x.res.items).eiweiss
        : sort === "volumen"
        ? x => volumeMl(x.res.items)
        : x => x.fam.name.toLowerCase();
      const sorted = entries.slice().sort((a, b) => {
        const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const ka = keyFn(a), kb = keyFn(b);
        return ka < kb ? -1 : ka > kb ? 1 : byName(a, b);
      });
      const grid = el("div", { class: "tiles" });
      sorted.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d, x.fam)));
      list.appendChild(grid);
    }
  }

  /* ---------- Kopfzeile, Bereiche (Tabs), Vorgaben ---------- */
  const VIEWS = ["heute", "rezepte", "vorgaben"];
  function showView(name) {
    if (VIEWS.indexOf(name) === -1) name = "rezepte";
    state.settings.view = name; save();
    VIEWS.forEach(v => {
      const sec = document.getElementById("view-" + v); if (sec) sec.hidden = v !== name;
    });
    document.querySelectorAll(".tabbar button[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    if (name === "heute" && typeof renderHeute === "function") renderHeute();
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  // Verordnungs-Chip: zeigt immer, womit gerade gerechnet wird.
  function renderHeader(d) {
    const chip = document.getElementById("rx-chip"); if (!chip) return;
    // Zeile 1: Verordnung. Zeile 2: Flüssigkeit – Ziel, Modus und (laut Tagesplan) die Menge zwischen den Mahlzeiten.
    const l1 = fmtTarget(d.ratio) + " · " + fmt(d.kcalMahl, 0) + " kcal × " + d.mahl +
      (d.mctShare > 0 ? " · MCT " + Math.round(d.mctShare * 100) + " % " + (d.mctMode === "kalorien" ? "🎯" : "⚖️") : "");
    let l2 = "";
    if (d.fluidDay > 0) {
      l2 = "💧 " + fmt(d.fluidDay, 0) + " ml/Tag · ";
      if (d.wasserModus === "mahlzeit") l2 += "alles in den Mahlzeiten (je " + fmt(d.fluidMahl, 0) + " ml)";
      else {
        l2 += "zwischen den Mahlzeiten: " + d.gapsDay + " × " + fmt(d.zwischenMl, 0) + " ml · Rest in den Mahlzeiten";
        let planFluid = 0, n = 0;
        (state.dayPlan || []).forEach(sl => { const r = recipeByKey(sl && sl.key); if (r) { planFluid += mealFacts(r, d).fluid; n++; } });
        if (n > 0) { const diff = d.fluidDay * (n / d.mahl) - planFluid - d.zwischenMl * gaps(n); if (diff > 5) l2 += " · ⚠️ fehlen " + fmt(diff, 0) + " ml"; }
      }
    }
    chip.innerHTML = '<span class="rx-line">' + escapeHtml(l1) + "</span>" + (l2 ? '<span class="rx-line rx-sub">' + escapeHtml(l2) + "</span>" : "");
  }
  function regelLabel(d) { return d.mctMode === "kalorien" ? "🎯 Kalorien halten" : "⚖️ Verhältnis halten"; }
  function renderVorgaben(d) {
    const s = state.settings;
    // Richtung des Verhältnisses klarstellen: Fett zuerst. „1,5“ = 1,5:1 (mehr Fett), „1:1,5“ = 0,67 (weniger Fett).
    // Die Warnung steht in der Zusammenfassung, nicht im Feldraster – dort darf sich nichts verschieben.
    const ratioWarn = d.ratio < 1
      ? '<div id="ratio-hint">⚠️ ' + fmtTarget(d.ratio) + " heißt nur " + fmt(d.ratio, 2) + " g Fett je 1 g Eiweiß+KH – <strong>weniger Fett als Eiweiß+KH</strong>, also unterhalb von 1:1. Das ist beim Ausschleichen möglich, bitte prüfen, ob die Verordnung wirklich so lautet.</div>"
      : "";
    const sum = document.getElementById("verordnung-summary");
    if (sum) sum.className = "note " + (d.ratio < 1 ? "warn" : "tip");
    if (sum) sum.innerHTML = ratioWarn + "<strong>" + fmt(d.kcalMahl, 0) + " kcal pro Mahlzeit</strong> (" + fmt(d.kcal, 0) + " kcal/Tag" + (d.kcalManual ? ", manuell" : (d.weight > 0 ? ", Vorschlag 80 kcal/kg" : ", Vorgabe ohne Gewicht")) + " ÷ " + d.mahl +
      ") · mindestens " + fmt(d.kcalMinMahl, 0) + " kcal (" + fmt(d.kcalMin, 0) + " kcal/Tag" + (d.kcalMinManual ? ", manuell" : ", 70 kcal/kg") + ")" +
      (d.kcalRichtwert ? " · Korridor nach Gewicht " + fmt(d.kcalMinAuto, 0) + "–" + fmt(d.kcalMaxAuto, 0) + " kcal/Tag (70–90 kcal/kg)" : "") +
      " · Eiweiß-Ziel ca. " + fmt(d.eiweissMahl) + " g/Mahlzeit" +
      (d.autoProtein ? " (" + fmt(d.eiweiss, 0) + " g/Tag, " + fmt(d.proteinPerKg, 1) + " g/kg" + (d.proteinPerKg === d.proteinStandard ? " = Standard" : "") + ")" : " (manuell)");
    // Flüssigkeit: Modus-Buttons und Zusammenfassung
    document.querySelectorAll("#wasser-modus-ctl button[data-wmodus]").forEach(b =>
      b.classList.toggle("active", b.dataset.wmodus === d.wasserModus));
    const fs = document.getElementById("fluid-summary");
    if (fs) fs.innerHTML = d.fluidDay > 0
      ? "<strong>" + fmt(d.fluidDay, 0) + " ml/Tag</strong>" + (d.fluidManual ? " (manuell)" : " (Vorschlag, Holliday-Segar)") + " · " +
        (d.wasserModus === "mahlzeit"
          ? "alles in den Mahlzeiten: je " + fmt(d.fluidMahl, 0) + " ml"
          : d.gapsDay + " × " + fmt(d.zwischenMl, 0) + " ml zwischen den Mahlzeiten sondieren (" + fmt(d.zwischenTag, 0) + " ml), Rest " + fmt(d.fluidDay - d.zwischenTag, 0) + " ml in den Mahlzeiten: je " + fmt(d.fluidMahl, 0) + " ml" + (d.maxMahlMl > 0 ? " (höchstens " + fmt(d.maxMahlMl, 0) + " ml je Mahlzeit, 25 ml/kg)" : ""))
      : "Kein Flüssigkeitsziel – Körpergewicht eintragen oder ml/Tag vorgeben.";
    // MCT-Karte: bei 0 % nur die Prozent-Buttons, Erklärung und Etikettwerte erst ab 10 %.
    const more = document.getElementById("mct-more"), zh = document.getElementById("mct-zero-hint");
    if (more) more.hidden = !(d.mctShare > 0);
    if (zh) zh.hidden = d.mctShare > 0;
    const sc = document.getElementById("mct-share-ctl");
    if (sc) {
      sc.innerHTML = [0, 10, 20, 30, 50, 100].map(v =>
        '<button type="button" data-mcts="' + v + '"' + (Math.abs(d.mctShare - v / 100) < 0.005 ? ' class="active"' : "") + ">" + v + " %</button>").join("");
      sc.querySelectorAll("button[data-mcts]").forEach(b =>
        b.addEventListener("click", () => { state.settings.mctShare = num(b.dataset.mcts) / 100; save(); renderRezepte(); }));
    }
    document.querySelectorAll("#mct-mode-ctl button[data-mctmode]").forEach(b =>
      b.classList.toggle("active", b.dataset.mctmode === d.mctMode));
  }
  // Werte prüfen: alle in Rezepten verwendeten Lebensmittel mit Nährwerten je 100 g.
  function renderWerte() {
    const box = document.getElementById("werte-list"); if (!box) return;
    const used = {};
    allRecipes().forEach(r => r.items.forEach(it => { used[it.food] = true; }));
    const rows = Object.keys(used).sort((a, b) => a.localeCompare(b, "de")).map(name => {
      const f = lookup(name); if (!f) return "<tr><td>" + escapeHtml(name) + "</td><td colspan='5' class='ovr'>fehlt in der Liste</td></tr>";
      const ovr = f.kcal100 != null || name === "MCT-Öl C8+C10";
      return "<tr><td>" + escapeHtml(name) + (ovr ? " <span class='ovr'>Etikett</span>" : "") + "</td><td>" + fmt(f.eiweiss) + "</td><td>" + fmt(f.fett) + "</td><td>" + fmt(f.kh) + "</td><td>" + fmt(kcal100Of(f), 0) + "</td><td>" + escapeHtml(f.kategorie || "") + "</td></tr>";
    }).join("");
    box.innerHTML = "<table class='werte-table'><thead><tr><th>Lebensmittel</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>kcal</th><th>Kategorie</th></tr></thead><tbody>" + rows + "</tbody></table>";
  }
  // Backup: alles, was nur auf diesem Gerät liegt.
  function exportData() {
    const payload = { app: "hamham-keto", version: 1, exported: new Date().toISOString(), state: state };
    const json = JSON.stringify(payload, null, 1);
    const ta = document.getElementById("export-text"), det = document.getElementById("export-details");
    if (ta) ta.value = json;
    if (det) { det.hidden = false; det.open = true; }
    try {
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "hamham-keto-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {}
  }
  function importData(text) {
    let p;
    try { p = JSON.parse(text); } catch (e) { alert("Das ist kein gültiges Backup (JSON)."); return; }
    const st = p && p.state && p.state.settings ? p.state : (p && p.settings ? p : null);
    if (!st) { alert("Das Backup enthält keine HamHam-Keto-Daten."); return; }
    if (!confirm("Backup importieren? Vorhandene Vorgaben, eigene Rezepte, Favoriten und gemerkte Mengen werden ersetzt.")) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(st)); } catch (e) {}
    state = load(); rebuildFoodIndex(); renderRezepte(); showView(state.settings.view || "rezepte");
    alert("Backup importiert.");
  }

  function bindSettingsBar() {
    const map = { "set-kcal": "kcal", "set-kcalmin": "kcalMin", "set-fluid": "fluidMl", "set-mahlzeiten": "mahlzeiten", "set-eiweiss": "eiweiss", "set-weight": "weight", "set-mct-fett": "mctFett100", "set-mct-kcal": "mctKcal100", "set-verdunstung": "dampfVerdunstung" };
    Object.keys(map).forEach(id => {
      const elx = document.getElementById(id); if (!elx) return;
      elx.addEventListener("input", e => {
        let v = num(e.target.value);
        // Vorschlags-Felder: leer oder genau der Vorschlag = wieder automatisch
        const d0 = derived();
        const autoOf = { "set-kcal": d0.kcalAuto, "set-kcalmin": d0.kcalMinAuto, "set-fluid": d0.fluidAuto }[id];
        if (autoOf !== undefined && (e.target.value === "" || Math.abs(v - autoOf) < 1e-9)) v = "";
        state.settings[map[id]] = v; save();
        if (id.indexOf("set-mct") === 0) rebuildFoodIndex(); // Etikettwerte fürs MCT-Öl neu anwenden
        renderRezepte();
      });
    });
    // Zurücksetzen auf den Vorschlag: eigener Wert wird gelöscht (bzw. Eiweiß auf den Standard gestellt)
    document.addEventListener("click", e => {
      const b = e.target.closest && e.target.closest("button[data-reset]"); if (!b) return;
      const k = b.dataset.reset;
      state.settings[k] = k === "proteinPerKg" ? derived().proteinStandard : "";
      save(); renderRezepte();
    });
    // Gewicht ist ein Textfeld (Dezimaltastatur am Handy, Komma erlaubt): beim Verlassen sauber formatieren.
    const wi = document.getElementById("set-weight");
    if (wi) wi.addEventListener("change", () => { wi.value = fmtNum(num(wi.value) > 0 ? num(wi.value) : ""); });
    document.getElementById("set-proteinmode").addEventListener("change", e => {
      state.settings.proteinPerKg = num(e.target.value); save(); renderRezepte();
    });
    document.getElementById("sort-select").addEventListener("change", e => {
      state.settings.sort = e.target.value; save(); renderRezepte();
    });
    const search = document.getElementById("recipe-search");
    if (search) search.addEventListener("input", () => renderRezepte());
    const sRow = document.getElementById("search-row"), sTog = document.getElementById("search-toggle"), sClose = document.getElementById("search-close");
    if (sTog) sTog.addEventListener("click", () => {
      sRow.hidden = !sRow.hidden;
      if (!sRow.hidden) { try { search.focus(); } catch (e) {} } else if (search.value) { search.value = ""; }
      renderRezepte();
    });
    if (sClose) sClose.addEventListener("click", () => { search.value = ""; sRow.hidden = true; renderRezepte(); });
    const mRow = document.getElementById("more-row"), mTog = document.getElementById("more-toggle");
    if (mTog) mTog.addEventListener("click", () => { mRow.hidden = !mRow.hidden; renderRezepte(); });
    const oq = document.getElementById("only-quelle");
    if (oq) oq.addEventListener("change", () => { state.settings.onlyQuelle = oq.checked; save(); renderRezepte(); });
    const hk = document.getElementById("hide-keto");
    if (hk) hk.addEventListener("change", () => { state.settings.hideKeto = hk.checked; save(); renderRezepte(); });
    document.querySelectorAll(".tabbar button[data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
    const chip = document.getElementById("rx-chip");
    if (chip) chip.addEventListener("click", () => showView("vorgaben"));
    // Verhältnis wird händisch eingegeben – „1,8", „1,8:1" oder „1:1,5"; ungültige Zwischenstände (z. B. „1:") bleiben folgenlos.
    const ri = document.getElementById("set-ratio");
    if (ri) {
      ri.addEventListener("input", () => {
        const r = parseRatio(ri.value);
        if (r > 0 && Math.abs(r - num(state.settings.ratio)) > 1e-9) { state.settings.ratio = r; save(); renderRezepte(); }
      });
      ri.addEventListener("change", () => { ri.value = fmtRatioNum(num(state.settings.ratio)); });
    }
    document.querySelectorAll("#mct-mode-ctl button[data-mctmode]").forEach(b =>
      b.addEventListener("click", () => { state.settings.mctMode = b.dataset.mctmode; save(); renderRezepte(); }));
    const zw = document.getElementById("set-zwischen");
    if (zw) zw.addEventListener("input", () => { const v = Math.max(0, num(zw.value)); state.settings.zwischenMl = (zw.value === "" || v === 60) ? "" : v; save(); renderRezepte(); });
    document.querySelectorAll("#wasser-modus-ctl button[data-wmodus]").forEach(b =>
      b.addEventListener("click", () => { state.settings.wasserModus = b.dataset.wmodus; save(); renderRezepte(); }));
    const exp = document.getElementById("export-btn");
    if (exp) exp.addEventListener("click", exportData);
    const impF = document.getElementById("import-file");
    if (impF) impF.addEventListener("change", () => {
      const f = impF.files && impF.files[0]; if (!f) return;
      const rd = new FileReader(); rd.onload = () => importData(String(rd.result || "")); rd.readAsText(f); impF.value = "";
    });
    const impT = document.getElementById("import-text-btn");
    if (impT) impT.addEventListener("click", () => importData((document.getElementById("export-text") || {}).value || ""));
    const wd = document.querySelector("#werte-list");
    if (wd) wd.closest("details").addEventListener("toggle", function () { if (this.open) renderWerte(); });
  }

  /* ---------- Kachel (Übersicht) – eine je Gericht, zeigt die aktive Fettbasis-Variante ---------- */
  function renderRecipeTile(rec, res, d, fam) {
    const sum = sumMacros(res.items);
    const r = ratioOf(sum);
    const totalG = res.items.reduce((a, it) => a + num(it.grams), 0);
    const ml = volumeMl(res.items);
    const proteinOk = sum.eiweiss >= d.eiweissMahl * 0.9;
    const name = fam ? fam.name : familyOf(rec);
    const multi = isMulti(rec);

    const fav = isFav(rec);
    const tile = el("div", { class: "tile", tabindex: "0", role: "button" });
    // Eine Zeile je Gericht: Icon · Name + Badges / Werte · Stern · Chevron. Die ganze Zeile öffnet das Rezept.
    tile.innerHTML =
      '<span class="tile-icon">' + (rec.icon || "🥑") + "</span>" +
      '<div class="tile-body">' +
      '<div class="tile-line1"><span class="tile-name">' + escapeHtml(name) + "</span>" +
      '<span class="tile-badge">' +
        // Fettbasis: bei Gerichten in beiden Varianten steht sie an beiden Einträgen, sonst nur ein KetoCal-Schild.
        (multi ? '<span class="badge ' + (rec.ketocal ? "keto-mini" : "basis") + '">' + (rec.ketocal ? "🥄 " : "") + escapeHtml(basisLabel(rec)) + "</span>"
               : (rec.ketocal ? '<span class="badge keto-mini">🥄 KetoCal</span>' : "")) +
        (rec.custom ? '<span class="badge custom">eigenes</span>' : "") +
        (rec.quelle ? '<span class="badge quelle">👩‍⚕️ Diätologie</span>' : "") +
        (ratioClass(r, d.ratio) !== "ok" ? '<span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmtRatio(r, 2) + "</span>" : "") +
      "</span></div>" +
      '<div class="tile-stats">' +
        "<span>" + fmt(sum.kcal, 0) + " kcal</span>" +
        "<span>≈ " + fmt(totalG, 0) + " g / " + fmt(ml, 0) + " ml</span>" +
        '<span class="' + (proteinOk ? "prot-ok" : "prot-low") + '">Eiweiß ' + fmt(sum.eiweiss) + " g</span>" +
      "</div></div>" +
      '<button class="favbtn' + (fav ? " on" : "") + '" title="Favorit">' + (fav ? "★" : "☆") + "</button>" +
      '<span class="tile-chev" aria-hidden="true">›</span>';
    const open = () => openRecipeDetail(rec);
    tile.addEventListener("click", open);
    tile.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    tile.querySelector(".favbtn").addEventListener("click", e => { e.stopPropagation(); toggleFav(rec); renderRezepte(); });
    return tile;
  }

  /* ---------- Detailansicht (Overlay) ---------- */
  // Blätter der Detailansicht in Reihenfolge. „Abwiegen“ enthält auch den Tages-Check (früher eigenes Blatt „Ein Tag“).
  const DETAIL_PAGES = [["mahlzeit", "🍽️ Mahlzeit"], ["abwiegen", "📅 Tag"], ["anpassen", "🎛️ Anpassen"], ["zubereitung", "🍳 Kochen"]];
  function isMobileLayout() { try { return !!(window.matchMedia && window.matchMedia("(max-width: 820px)").matches); } catch (e) { return false; } }
  // detailScale: Zubereitungsmenge – Zahl (Portionen) oder "tag" / "tag:N" (= N ganze Tage, folgt der Mahlzeitenzahl).
  // detailMeat: temporäre Fleischwahl.
  let detailRec = null, detailScale = "tag", detailMeat = null;
  let detailMctOpen = null; // MCT-Anteil beim Öffnen – Bezug für „↺“ auf dem Blatt Anpassen
  const scaleDays = () => typeof detailScale === "string" && /^tag(:\d+)?$/.test(detailScale) ? Math.max(1, parseInt(detailScale.split(":")[1] || "1", 10)) : 0;
  const parseScale = (sv) => (typeof sv === "string" && /^tag(:\d+)?$/.test(sv)) ? sv : (num(sv) > 0 ? num(sv) : "tag");
  // Die Zubereitungsmenge gilt nur für die offene Ansicht: jedes Rezept öffnet mit „1 Tag“ (nichts wird gemerkt).
  function persistScale() {}
  // Portionenzahl → Zubereitungsmenge: ein Vielfaches der Mahlzeitenzahl ist wieder „N Tag(e)“ (Knopf leuchtet).
  function scaleFromPortions(v, mahl) {
    const days = mahl > 0 ? v / mahl : 0;
    if (days >= 1 && Math.abs(days - Math.round(days)) < 1e-6) return Math.round(days) === 1 ? "tag" : "tag:" + Math.round(days);
    return v;
  }
  function scaleMult(d) { const days = scaleDays(); return days ? days * d.mahl : (num(detailScale) > 0 ? num(detailScale) : 1); }
  function openRecipeDetail(rec, keepScale) {
    detailRec = rec; if (!keepScale) detailScale = "tag"; detailMeat = null;
    detailMctOpen = Math.min(1, Math.max(0, num(state.settings.mctShare)));
    state.settings.detailTab = "mahlzeit"; // jedes Rezept öffnet mit „Mahlzeit“; innerhalb der Ansicht bleibt das gewählte Blatt
    renderDetail();
    const overlay = document.getElementById("detail-overlay");
    overlay.hidden = false;
    modalOpen("detail");
  }
  // Eine Mahlzeit vollständig berechnen – dieselbe Pipeline für Detailansicht und Tagesplan:
  // Basis (Verhältnis + kcal/Mahlzeit) → optionaler Fleisch-Tausch → Öl-Mix (MCT-Anteil)
  // → gemerktes Wasser. Ergebnis ist eine Portion (= eine Mahlzeit).
  function computeMealView(rec, d, meatChoice) {
    const base = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
    let res = base;
    let adjIndex = base.fatIndex, adjLabel = '<small class="adj">⟵ stellt das Verhältnis ein</small>';
    const swapSlot = recipeMeatSlot(rec);
    if (swapSlot && meatChoice && meatChoice !== swapSlot.baseKey) {
      // Nur das Fleisch wird getauscht; Gemüse, Wasser UND Öl/Fett bleiben gleich.
      // Die Fleischmenge wird so berechnet, dass das Verhältnis exakt stimmt.
      const swapped = base.items.map((it, i) => i === swapSlot.index
        ? { food: MEATS[meatChoice].food, grams: num(it.grams) }
        : { food: it.food, grams: num(it.grams) });
      const solved = solveMeatForRatio(swapped, swapSlot.index, d.ratio);
      if (solved) {
        const sm = sumMacros(solved);
        res = { items: solved, ratio: ratioOf(sm), kcal: sm.kcal, ok: true, fatIndex: base.fatIndex };
        adjIndex = swapSlot.index; adjLabel = '<small class="adj">⟵ stellt das Verhältnis ein</small>';
      }
    }
    // Öl-Mix (Rapsöl/MCT): Anteil s + Modus aus den Vorgaben; s = 0 lässt alles unverändert.
    // kcal-Ziel für den Modus KALORIEN = Kalorien der Ansicht bei s = 0 (Basis bzw.
    // nach Fleisch-Tausch), damit "kcal konstant" sich auf den sichtbaren Ist-Zustand bezieht.
    const baseOilIndex = oilSlotIndex(res.items);
    const kcalZielOil = sumMacros(res.items).kcal;
    if (baseOilIndex >= 0 && d.mctShare > 0) res = applyOilMix(res, d, d.mctShare, d.mctMode, kcalZielOil);
    // Portion angepasst (Rechnen): ein Wert wurde händisch geändert, alle Zutaten skalieren proportional mit
    // (je Rezept gemerkt). Das Verhältnis bleibt, kcal je Mahlzeit ändern sich – Tagesplan und „Ein Tag“ rechnen damit.
    const portionKey = familyKey(rec);
    const portionF = num(state.portion && state.portion[portionKey]);
    const hasPortion = portionF > 0 && Math.abs(portionF - 1) > 1e-6;
    const kcalBerechnet = sumMacros(res.items).kcal;
    if (hasPortion) {
      const itemsP = res.items.map(it => ({ food: it.food, grams: round1(num(it.grams) * portionF) }));
      const smP = sumMacros(itemsP);
      res = Object.assign({}, res, { items: itemsP, ratio: ratioOf(smP), kcal: smP.kcal });
    }
    // Wasser darf für sich allein geändert werden (je Rezept gemerkt, Wert je Portion):
    // Wasser hat keine Nährwerte, beeinflusst also weder Verhältnis noch kcal – nur Volumen.
    const waterKey = familyKey(rec);
    const hasWaterOverride = Object.prototype.hasOwnProperty.call(state.water, waterKey);
    if (hasWaterOverride) {
      const target = Math.max(0, num(state.water[waterKey]));
      const isW = (it) => /wasser/i.test(it.food);
      const sumW = res.items.filter(isW).reduce((a, it) => a + num(it.grams), 0);
      let first = true;
      const items2 = res.items.map(it => {
        if (!isW(it)) return it;
        let g;
        if (sumW > 0) g = num(it.grams) * target / sumW; else { g = first ? target : 0; first = false; }
        return { food: it.food, grams: round1(g) };
      });
      const sm2 = sumMacros(items2);
      res = Object.assign({}, res, { items: items2, ratio: ratioOf(sm2), kcal: sm2.kcal });
    }
    // Flüssigkeit „in den Mahlzeiten“: Wasser so setzen, dass die Mahlzeit ihren Anteil am Tagesbedarf liefert
    // (Zutaten-Wasser + Wasser = Flüssigkeit je Mahlzeit). Nie weniger als das Rezept-Wasser; gemerktes Wasser hat Vorrang.
    // Modus „zwischen“: dasselbe mit dem Rest nach den Zwischenzeiten, aber nur bis zur Höchstmenge je Mahlzeit (Bolus).
    let fluidAdjusted = false, waterCapped = false;
    if (d.fluidMahl > 0 && !hasWaterOverride) {
      const isW2 = (it) => /wasser/i.test(it.food);
      const foodFluid = fluidOf(res.items.filter(it => !isW2(it)));
      const stdWater = res.items.filter(isW2).reduce((a, it) => a + num(it.grams), 0);
      let need = d.fluidMahl - foodFluid;
      if (d.wasserModus === "zwischen" && d.maxMahlMl > 0) {
        const room = d.maxMahlMl - volumeMl(res.items.filter(it => !isW2(it)));
        if (room < need) { need = room; waterCapped = true; }
      }
      if (need > stdWater + 0.05) {
        const items3 = stdWater > 0
          ? res.items.map(it => isW2(it) ? { food: it.food, grams: round1(num(it.grams) * need / stdWater) } : it)
          : res.items.concat([{ food: "Wasser", grams: round1(need) }]);
        res = Object.assign({}, res, { items: items3 });
        fluidAdjusted = true;
      }
    }
    // Zum Schluss: Rundung fürs Abwiegen (Vorgabe „Rundung“), Verhältnis über die Fettträger nachgestellt.
    {
      const itemsR = roundForScale(res.items, d.rundung);
      const smR = sumMacros(itemsR);
      res = Object.assign({}, res, { items: itemsR, ratio: ratioOf(smR), kcal: smR.kcal });
    }
    const fluid = fluidOf(res.items);
    return { res, adjIndex, adjLabel, baseOilIndex, waterKey, hasWaterOverride, fluidAdjusted, waterCapped, fluid,
      portionF: hasPortion ? portionF : 1, hasPortion, kcalBerechnet };
  }
  // Kennzahlen einer Mahlzeit fürs Füttern/Tagesplan (eine Portion).
  function mealFacts(rec, d) {
    const mv = computeMealView(rec, d, null);
    const items = mv.res.items;
    const isOilN = (n) => /öl|oil/i.test(n || "");
    const noOil = items.filter(it => !isOilN(it.food));
    const oils = items.filter(it => isOilN(it.food));
    const sum = sumMacros(items);
    return {
      rec, res: mv.res, sum, ratio: ratioOf(sum), fluid: mv.fluid,
      gNoOil: noOil.reduce((a, it) => a + num(it.grams), 0), mlNoOil: volumeMl(noOil),
      oils, hasOil: oils.length > 0,
      gMct: oils.filter(it => it.food === "MCT-Öl C8+C10").reduce((a, it) => a + num(it.grams), 0),
      gRaps: oils.filter(it => it.food === "Rapsöl").reduce((a, it) => a + num(it.grams), 0),
    };
  }
  // Hinweis auf die globale Rechenregel (Vorgaben) – gilt für MCT und Packung gleichermaßen.
  // Wassergaben „zwischen den Mahlzeiten“: bei N Mahlzeiten N−1 Zwischenzeiten (mindestens 1).
  function gaps(n) { return Math.max(1, Math.round(n) - 1); }
  // Modus „zwischen“: feste Wassergabe je Zwischenzeit; fehlt danach noch etwas (Höchstmenge je Mahlzeit erreicht), wird es genannt.
  function zwischenText(d, rest, n) {
    const g = gaps(n), plan = d.zwischenMl * g, diff = rest - plan; // Toleranz 5 ml (Wasser wird je Mahlzeit auf 1 ml gerundet)
    if (diff > 5) return '<div class="note warn">💧 Zwischen den Mahlzeiten: ' + g + ' × ' + fmt(d.zwischenMl, 0) + ' ml (Vorgabe) – am Tag fehlen noch <strong>' + fmt(diff, 0) + ' ml</strong> (Mahlzeiten an der Höchstmenge ' + fmt(d.maxMahlMl, 0) + ' ml): je Zwischenzeit ≈ ' + fmt(rest / g, 0) + ' ml geben oder eine Wassergabe mehr.</div>';
    if (diff < -5) return '<div class="note tip">💧 Zwischen den Mahlzeiten reichen <strong>' + fmt(Math.max(0, rest), 0) + ' ml</strong> (' + g + ' × ≈ ' + fmt(Math.max(0, rest) / g, 0) + ' ml) – die Mahlzeiten liefern schon mehr als geplant.</div>';
    return '<div class="note tip">💧 Zwischen den Mahlzeiten: <strong>' + g + ' × ' + fmt(d.zwischenMl, 0) + ' ml</strong> (je eine Spritze) – Tagesbedarf ' + fmt(d.fluidDay, 0) + ' ml erreicht.</div>';
  }
  function regelZeile(d) {
    return '<div class="hint" style="margin-top:8px">Rechenregel: <strong>' + regelLabel(d) + '</strong> · <button type="button" class="linkbtn" data-goto="vorgaben">unter Vorgaben ändern</button></div>';
  }
  function renderDetail() {
    const rec = detailRec;
    const d = derived();
    const mv = computeMealView(rec, d, detailMeat);
    const res = mv.res, adjIndex = mv.adjIndex, adjLabel = mv.adjLabel;
    const baseOilIndex = mv.baseOilIndex, waterKey = mv.waterKey, hasWaterOverride = mv.hasWaterOverride;
    const mult = scaleMult(d); // gilt für Kochen und Abfüllen; Rechnen zeigt immer eine Portion
    const items = res.items;
    const sumPer = sumMacros(items);
    const sum = { eiweiss: sumPer.eiweiss * mult, fett: sumPer.fett * mult, kh: sumPer.kh * mult, kcal: sumPer.kcal * mult };
    const r = ratioOf(sumPer);
    const totalG = items.reduce((a, it) => a + num(it.grams), 0) * mult;
    const ml = volumeMl(items) * mult;
    const proteinTarget = d.eiweissMahl * mult;
    const proteinOk = sum.eiweiss >= proteinTarget * 0.9;
    const portionsTxt = (Math.abs(mult - Math.round(mult)) < 0.05 ? String(Math.round(mult)) : fmt(mult, 1));
    const days = scaleDays();
    const portionLabel = mult === 1 ? "1 Portion" : (days ? (days === 1 ? "1 Tag" : days + " Tage") + " = " : "") + portionsTxt + " Portionen";
    // Abfüllmenge je Portion OHNE Öl (das Öl wird erst kurz vor dem Verabreichen zugegeben).
    // Nur tatsächliche Öle abziehen (Name enthält "Öl") – Butter/Sahne/KetoCal bleiben in der Masse.
    const isOil = (name) => /öl|oil/i.test(name || "");
    const itemsNoOil = items.filter(it => !isOil(it.food));
    const hasOil = itemsNoOil.length !== items.length;
    const perGnoOil = itemsNoOil.reduce((a, it) => a + num(it.grams), 0);
    const perMlNoOil = volumeMl(itemsNoOil);
    // Öl-Bezeichnung im Zubereitungstext an den gewählten Öl-Mix anpassen.
    const oilWord = (baseOilIndex >= 0 && d.mctShare > 0)
      ? (d.mctShare >= 0.999 ? "MCT-Öl" : "Rapsöl + MCT-Öl") : null;
    const adaptOil = (t) => oilWord ? String(t).replace(/Rapsöl/g, oilWord) : t;
    // Varoma: Dämpfwasser mitverwenden. Topf-Wasser = Rezept-Wasser (skaliert)
    // + Verdunstungs-Reserve, sodass nach dem Dämpfen ≈ die Rezeptmenge übrig bleibt.
    const waterG = items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0) * mult;
    const bowlWater = Math.round(waterG + d.dampfVerdunstung);
    const adaptVaroma = (t) => {
      if (!t || waterG <= 0) return t;
      return t
        .replace("Ca. 500 ml Wasser in den Mixtopf geben (nur zum Dämpfen, wird nicht weiterverwendet).",
          "Ca. " + bowlWater + " ml Wasser in den Mixtopf geben (das Dämpfwasser wird später mitverwendet – es enthält wertvolle Stoffe" + (bowlWater < 300 ? "; mindestens ~300 ml, damit der Topf nicht trocken läuft" : "") + ").")
        .replace("Dämpfwasser abgießen. Die gedämpften Zutaten mit dem abgemessenen Wasser und Rapsöl",
          "Das Dämpfwasser NICHT abgießen – davon " + Math.round(waterG) + " ml abmessen (ist weniger übrig, mit frischem Wasser auf " + Math.round(waterG) + " ml ergänzen; ist mehr übrig, den Rest nicht verwenden) und mit den gedämpften Zutaten und Rapsöl");
    };

    const ketoBadge = (rec.ketocal
      ? '<span class="badge keto">mit KetoCal</span>'
      : '<span class="badge noketo">ohne KetoCal</span>') +
      (rec.quelle ? ' <span class="badge quelle">👩‍⚕️ Diätologie</span>' : "");

    // Fettbasis-Umschalter: gleiches Gericht, andere Variante (z. B. Rapsöl ↔ KetoCal + Butter).
    // Gibt es das Gericht auch in der anderen Fettbasis, führt ein Link zum Geschwister-Rezept.
    const sibs = siblingVariants(rec);
    let basisSeg = "";
    if (sibs.length) {
      basisSeg = '<div class="meat-swap basis"><div class="seg-label">🧈 Fettbasis: ' + (rec.ketocal ? "🥄 " : "") + escapeHtml(basisLabel(rec)) + '</div>' +
        '<div class="hint">Dieses Gericht gibt es auch als ' + sibs.map(v => '<button type="button" class="linkbtn" data-open-rec="' + escapeHtml(recipeKey(v)) + '">' + (v.ketocal ? "🥄 " : "") + escapeHtml(basisLabel(v)) + "</button>").join(", ") + " – eigenes Rezept mit eigenen Mengen.</div></div>";
    }

    // Packungs-Hinweis (z. B. Compleat 500 ml, 3 Tage haltbar): reine Information, wie weit eine Packung reicht.
    let packInfoSeg = "";
    if (rec.packung) {
      const pk = rec.packung, mlMeal = items.filter(it => it.food === pk.food).reduce((a, it) => a + num(it.grams), 0);
      if (mlMeal > 0) {
        const nMeals = Math.floor(pk.ml / mlMeal + 1e-9), maxMeals = d.mahl * pk.tage;
        const usedInTage = Math.min(nMeals, maxMeals) * mlMeal;
        // Kurz und kompakt: Menge je Mahlzeit, Reichweite, Verfall.
        // Gleiche Darstellung wie der Wasser-Hinweis darüber (grüne Notiz).
        packInfoSeg = '<div class="note tip pack">🧃 <strong>Packung ' + pk.ml + ' ml</strong> (offen ' + pk.tage + ' Tage haltbar): ' +
          fmt(mlMeal, 0) + ' ml je Mahlzeit · reicht für <strong>' + nMeals + ' Mahlzeiten</strong>' +
          (nMeals > maxMeals ? ' · in ' + pk.tage + ' Tagen ' + maxMeals + ' verbraucht, <strong>' + fmt(pk.ml - usedInTage, 0) + ' ml verfallen</strong>'
            : nMeals < maxMeals ? ' · für ' + pk.tage + ' Tage (' + maxMeals + ' Mahlzeiten) reicht eine Packung nicht' : '') + '.</div>';
      }
    }
    const meatSlot = recipeMeatSlot(rec);
    let meatSeg = "";
    if (meatSlot) {
      const cur = detailMeat || meatSlot.baseKey;
      meatSeg = '<div class="meat-swap"><div class="seg-label">🍖 Fleisch tauschen</div><div class="segmented mini">' +
        ["huhn", "rind", "pute"].map(k =>
          '<button type="button" data-meat="' + k + '"' + (k === cur ? ' class="active"' : "") + ">" +
          MEATS[k].icon + " " + MEATS[k].label + "</button>"
        ).join("") +
        '</div><details class="collapsible mini"><summary>ⓘ Was ändert sich?</summary><p>Nur das Fleisch – Gemüse, Wasser und Öl/Fett bleiben gleich. Die Fleischmenge wird so berechnet, dass das Verhältnis genau stimmt (sie kann daher etwas von 30 g / 18 g abweichen; die Kalorien können leicht variieren).</p></details></div>';
    }

    const sign = (v) => v < -0.05 ? "−" : (v > 0.05 ? "+" : "±");
    let oilSeg = "";
    if (baseOilIndex >= 0) {
      const sOil = d.mctShare, mm = res.mct || null;
      const shareBtn = (v) => '<button type="button" data-mcts="' + v + '"' + (Math.abs(sOil - v / 100) < 0.005 ? ' class="active"' : "") + ">" + v + " %</button>";
      // Sichtbar bleibt eine Zeile (Kennzahlen bzw. „nur Rapsöl“), die Erklärung ist eingeklappt.
      let note;
      if (!(sOil > 0)) {
        note = '<div class="meat-note">Nur Rapsöl.</div>' +
          '<details class="collapsible mini"><summary>ⓘ Was bedeutet der MCT-Anteil?</summary><p>Der Anteil bezieht sich auf die <strong>Öl-Fettmasse</strong>. Beim Tausch gegen ein Fett anderer Energiedichte lassen sich Fettmasse, Kalorien und Verhältnis nicht gleichzeitig halten – die Rechenregel (Vorgaben) legt fest, welche Größe exakt bleibt. MCT kann durch Capronsäure (C6) den Rachen reizen: klein beginnen, lieber wenig je Mahlzeit, dafür in jeder Mahlzeit.</p></details>';
      } else {
        note = (mm ? '<div class="meat-note stat-line">MCT <strong>' + fmt(mm.gMct, 1) + ' g</strong> je Portion · <strong>' + fmt(mm.energiePz, 1) + ' %</strong> der Energie (' + mctEinordnung(mm.energiePz) + ') · ' + sign(mm.dev) + fmt(Math.abs(mm.dev), 1) + ' kcal je Portion, je Tag ' + sign(mm.dev) + fmt(Math.abs(mm.dev * d.mahl), 0) + ' kcal</div>' : "") +
          '<details class="collapsible mini"><summary>ⓘ Was bedeutet der MCT-Anteil?</summary><p>' +
          (d.mctMode === "kalorien"
            ? "🎯 <strong>Kalorien halten:</strong> Die Kalorien bleiben für jeden MCT-Anteil gleich; das Verhältnis steigt mit dem Anteil."
            : "⚖️ <strong>Verhältnis halten:</strong> Das Verhältnis bleibt für jeden MCT-Anteil exakt gleich; die Kalorien sinken mit dem Anteil (MCT liefert weniger kcal je Gramm).") +
          " ⚠️ MCT kann durch Capronsäure (C6) den Rachen reizen – klein beginnen, Verträglichkeit beobachten. MCT ist je kcal ketogener als langkettiges Fett, ein Tausch senkt die Ketose nicht; besser verträglich ist weniger MCT je Mahlzeit, dafür in jeder Mahlzeit. Die Vorbelegung 8,3 kcal/g ist ein <strong>Praxiswert</strong> – echte Etikettwerte unter Vorgaben eintragen.</p></details>";
      }
      // Warnhinweise aus der ungerundeten Rechnung (§5)
      let warn = "";
      if (mm) {
        if (mm.energiePz > 50) warn += '<div class="note warn">⚠️ Über dem gängigen Arbeitsbereich von 40–50 %. Die traditionelle MCT-Diät verwendet 60 % und kann Magen-Darm-Beschwerden verursachen.</div>';
        const devTag = mm.dev * d.mahl, kcalTag = mm.kcalNeu * d.mahl;
        if (d.mctMode !== "kalorien" && kcalTag < d.kcalMin - 0.5) warn += '<div class="note warn">⚠️ Mit diesem MCT-Anteil kämen nur ' + fmt(kcalTag, 0) + ' kcal/Tag zusammen – unter dem Minimum von ' + fmt(d.kcalMin, 0) + ' kcal. MCT-Anteil senken, Rechenregel „Kalorien halten“ wählen oder mit der Diätologie klären.</div>';
        else if (d.mctMode !== "kalorien" && devTag < -20) warn += '<div class="note info">Das Tagesziel wird um ' + fmt(-devTag, 0) + ' kcal unterschritten (Minimum ' + fmt(d.kcalMin, 0) + ' kcal/Tag ist eingehalten).</div>';
        if (d.mctMode === "kalorien" && (mm.ratioNeu - mm.ratioBasis) > 0.05) warn += '<div class="note warn">⚠️ Das Verhältnis steigt von ' + fmt(mm.ratioBasis, 2) + ' auf ' + fmt(mm.ratioNeu, 2) + '. Das ist eine Änderung der Verordnung, nicht der Fettart.</div>';
      }
      oilSeg = '<div class="meat-swap"><div class="seg-label">🧈 Öl: MCT-Anteil an der Öl-Fettmasse</div>' +
        '<div class="segmented mini">' + [0, 10, 20, 30, 50, 100].map(shareBtn).join("") + "</div>" +
        note + warn + (sOil > 0 ? regelZeile(d) : "") + "</div>";
    }

    // Zwei Sichten auf dieselben Zutaten: Küche (abwiegen, editierbar) und Rechnen (Nährwerte, nur lesen).
    let kRows = "", nRows = "";
    items.forEach((it, i) => {
      const g = num(it.grams) * mult;
      const m = lineMacros({ food: it.food, grams: num(it.grams) }); // Rechnen: je Portion
      const isWaterRow = /wasser/i.test(it.food);
      const fatRow = isFatCarrier(items, i);
      const gR = fatRow ? roundTo(g, 0.1) : roundTo(g, isWaterRow ? 1 : d.rundung);
      const gTxt = fatRow ? gR.toFixed(1) : String(gR); // Fettträger immer mit einer Nachkommastelle („21.0“)
      // Wasserzeile: nur die Herkunft steht dabei („⟵ Flüssigkeitsziel“); Anpassungen und ihr Zurücksetzen
      // stehen – wie bei den Lebensmitteln – in der Statuszeile über den Kacheln.
      const waterTag = isWaterRow ? (hasWaterOverride ? '<small class="adj">⟵ eigener Wert</small>' : (mv.fluidAdjusted ? '<small class="adj">⟵ Flüssigkeitsziel</small>' : "")) : "";
      const mK = lineMacros({ food: it.food, grams: gR }); // Abwiegen: für die Zubereitungsmenge
      kRows += "<tr" + (i === adjIndex ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) + (i === adjIndex ? adjLabel : "") + waterTag + "</td>" +
        '<td class="amt"><input class="amt-edit" type="number" min="0" step="' + (fatRow ? "0.1" : "1") + '" inputmode="decimal" data-g="' + gR + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gTxt + '"></td>' +
        "<td>" + fmt(mK.eiweiss) + "</td><td>" + fmt(mK.fett) + "</td><td>" + fmt(mK.kh) + "</td><td>" + fmt(mK.kcal, 0) + "</td></tr>";
      const gP = Math.round(num(it.grams) * 10) / 10;
      const gPTxt = fatRow ? gP.toFixed(1) : String(gP);
      nRows += "<tr" + (i === adjIndex ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) + (i === adjIndex ? adjLabel : "") + waterTag + "</td>" +
        '<td class="amt"><input class="amt-edit g-edit" type="number" min="0" step="' + (fatRow ? "0.1" : "1") + '" inputmode="decimal" data-g="' + gP + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gPTxt + '"></td>' +
        "<td>" + fmt(m.eiweiss) + "</td><td>" + fmt(m.fett) + "</td><td>" + fmt(m.kh) + "</td><td>" + fmt(m.kcal, 0) + "</td></tr>";
    });
    // Zubereitung als nummerierte Schritte (Varoma bevorzugt; Dämpfwasser-Rechnung ist darin enthalten).
    const prepText = rec.varoma
      ? adaptOil(adaptVaroma(adaptPrep(rec.varoma, rec, detailMeat)))
      : (rec.zubereitung ? adaptOil(adaptPrep(rec.zubereitung, rec, detailMeat)) : "");
    const steps = splitSteps(prepText);
    const stepsHtml = steps.length ? "<ol class='steps'>" + steps.map(s => "<li>" + escapeHtml(s) + "</li>").join("") + "</ol>" : "";
    // Abfüllen: Öl-Zeilen je Portion (kommen erst vor dem Füttern dazu)
    const oilRowsPer = items.filter(it => isOil(it.food));
    // Vier Blätter: am Handy nebeneinander (seitlich wischen, jedes passt auf einen Bildschirm), am Desktop als Reiter.
    const TABMAP = { rechnen: "mahlzeit", kochen: "abwiegen", tag: "abwiegen", abfuellen: "zubereitung" }; // alte gespeicherte Werte
    const wanted = TABMAP[state.settings.detailTab] || state.settings.detailTab;
    const dtab = DETAIL_PAGES.some(pg => pg[0] === wanted) ? wanted : "mahlzeit";
    const mobile = isMobileLayout();
    const tabBtn = (pg) => '<button type="button" data-dtab="' + pg[0] + '"' + (dtab === pg[0] ? ' class="active"' : "") + ">" + pg[1] + "</button>";
    const paneOpen = (k) => '<div class="pane" data-pane="' + k + '"' + (dtab !== k && !mobile ? " hidden" : "") + ">";

    // Ganzer Tag: eine Portion × Mahlzeiten pro Tag – unabhängig von der gewählten Portionenzahl.
    // Zeigt, was herauskäme, wenn jede Mahlzeit des Tages dieses Rezept wäre (Ziele und Minimum daneben).
    const dayN = d.mahl;
    const dayKcal = sumPer.kcal * dayN;
    const dayLow = dayKcal < d.kcalMin - 0.5, dayHigh = d.kcalMaxAuto && dayKcal > d.kcalMaxAuto + 0.5;
    // Flüssigkeit je Portion: Zutaten-Wasser + Rezept-Wasser, gegen den Anteil am Tagesbedarf.
    const waterPer = items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0);
    const fluidPer = mv.fluid, foodFluidPer = fluidPer - waterPer;
    const fluidLine = d.fluidDay > 0
      ? '<div class="hint" style="margin:6px 0 10px">💧 Flüssigkeit je Portion ≈ <strong>' + fmt(fluidPer, 0) + ' ml</strong> (Zutaten ' + fmt(foodFluidPer, 0) + ' + Wasser ' + fmt(waterPer, 0) + ') · Ziel ' + fmt(d.fluidMahl, 0) + ' ml je Mahlzeit' +
        (d.wasserModus === "mahlzeit"
          ? (mv.fluidAdjusted ? ' – Wasser dafür erhöht' : (fluidPer >= d.fluidMahl - 0.5 ? ' ✓' : ' – <strong>nicht erreicht</strong> (gemerktes Wasser)'))
          : (mv.fluidAdjusted ? (mv.waterCapped ? ' – Wasser bis zur Höchstmenge (' + fmt(d.maxMahlMl, 0) + ' ml) erhöht, Rest per Spritze' : ' – Wasser dafür erhöht') : (fluidPer >= d.fluidMahl - 0.5 ? ' ✓' : ' – Rest per Spritze'))) +
        (d.maxMahlMl > 0 && volumeMl(items) > d.maxMahlMl + 0.5 ? ' · <strong>⚠️ Mahlzeit ' + fmt(volumeMl(items), 0) + ' ml, über der Höchstmenge von ' + fmt(d.maxMahlMl, 0) + ' ml</strong>' : '') + '</div>'
      : "";
    const dayFluid = fluidPer * dayN, fluidRest = d.fluidDay - dayFluid;
    const fluidDayTile = d.fluidDay > 0
      ? '<div class="dstat' + (d.wasserModus === "mahlzeit" && dayFluid < d.fluidDay - 3 ? " warn" : "") + '"><div class="v">' + fmt(dayFluid, 0) + ' ml</div><div class="l">Flüssigkeit/Tag · Ziel ' + fmt(d.fluidDay, 0) + ' ml</div></div>'
      : "";
    const fluidDayNote = d.fluidDay > 0
      ? (d.wasserModus === "zwischen"
          ? zwischenText(d, fluidRest, dayN)
          : (dayFluid < d.fluidDay - 3
              ? '<div class="note warn">💧 Der Tag liegt unter dem Flüssigkeitsziel – das gemerkte Wasser im Rezept ist kleiner als der rechnerische Anteil.</div>'
              : '<div class="note tip">💧 Flüssigkeit ist in den Mahlzeiten dabei – Wasser je Rezept entsprechend erhöht, kein Sondieren zwischen den Mahlzeiten nötig.</div>'))
      : "";

    // Abwiegen: Kacheln für die Zubereitungsmenge – gleiches Layout wie „Mahlzeit“, nur mit den Mengen der Zubereitung
    // (Standard: ein Tag). Ziele skalieren mit; bei ganzen Tagen zählt das Flüssigkeitsziel je Tag.
    const qTag = days === 1 ? "/Tag" : "";
    const qFluid = fluidPer * mult, qFluidZiel = days ? d.fluidDay * days : d.fluidMahl * mult;
    const qTiles =
      '<div class="detail-tiles strip">' +
        '<div class="dstat' + ((days && dayLow) ? " warn" : "") + '"><div class="v">' + fmt(sum.kcal, 0) + '</div><div class="l">kcal' + qTag + ' · Ziel ' + fmt(d.kcalMahl * mult, 0) + '</div></div>' +
        '<div class="dstat' + (proteinOk ? "" : " warn") + '"><div class="v">' + fmt(sum.eiweiss) + ' g</div><div class="l">Eiweiß' + qTag + ' · Ziel ' + fmt(proteinTarget, 0) + ' g</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(totalG, 0) + ' g</div><div class="l">Menge' + qTag + '</div></div>' +
        (d.fluidDay > 0 ? '<div class="dstat' + (d.wasserModus === "mahlzeit" && qFluid < qFluidZiel - 3 * mult ? " warn" : "") + '"><div class="v">' + fmt(qFluid, 0) + ' ml</div><div class="l">Flüssigkeit' + qTag + ' · Ziel ' + fmt(qFluidZiel, 0) + ' ml</div></div>' : '') +
      '</div>';
    // Tages-Check nur als Warnung (wie die Eiweiß-Warnung auf „Mahlzeit“): Minimum unterschritten oder über dem Korridor.
    const dayCheck = dayLow
      ? '<div class="note warn">⚠️ Ein Tag nur mit diesem Rezept (' + dayN + ' × = ' + fmt(dayKcal, 0) + ' kcal) läge unter dem Minimum von ' + fmt(d.kcalMin, 0) + ' kcal – im Tagesplan mit anderen Mahlzeiten kombinieren.</div>'
      : (dayHigh ? '<div class="note warn">⚠️ Ein Tag nur mit diesem Rezept (' + dayN + ' × = ' + fmt(dayKcal, 0) + ' kcal) läge über dem Korridor (bis ' + fmt(d.kcalMaxAuto, 0) + ' kcal).</div>' : "");
    // Zubereitungsmenge: 1 Portion, 1–3 ganze Tage (folgen der Mahlzeitenzahl) oder eine freie Portionenzahl.
    // Gilt nur hier (Abwiegen, Zubereitung, Abfüllen) und wird je Rezept gemerkt – die Vorgaben bleiben unberührt.
    const scaleBtn = (v, label) => '<button type="button" data-scale="' + v + '"' + ((v === "1" ? (!days && mult === 1) : detailScale === v) ? ' class="active"' : "") + ">" + label + "</button>";
    // Eine Zeile: 1 · 2 · 3 Tage + Stepper für eine freie Portionenzahl (Überschrift nennt die gewählte Menge).
    const scaleSeg =
      '<div class="seg-portion batch">' +
        '<div class="segmented mini">' + scaleBtn("tag", "1 Tag") + scaleBtn("tag:2", "2 Tage") + scaleBtn("tag:3", "3 Tage") + "</div>" +
        '<span class="portion-step" title="Portionen"><button type="button" class="stepbtn" data-step="-1" aria-label="eine Portion weniger">−</button>' +
        '<input id="portion-input" type="number" min="0.5" step="0.5" aria-label="Portionen" value="' + (Math.round(mult * 10) / 10) + '">' +
        '<button type="button" class="stepbtn" data-step="1" aria-label="eine Portion mehr">+</button></span>' +
      "</div>";
    // Statuszeile der Mahlzeit: alle temporären Änderungen (Portion, Wasser) samt Zurücksetzen an einer Stelle.
    let waterRef = null;
    if (hasWaterOverride) {
      const keep = state.water[waterKey]; delete state.water[waterKey];
      try { waterRef = computeMealView(rec, d, detailMeat).res.items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0); }
      finally { state.water[waterKey] = keep; }
    }
    const statusLine = (m, bezug) => {
      const parts = [];
      if (mv.hasPortion) parts.push('<strong>Portion angepasst: ' + fmt(mv.portionF * 100, 0) + ' %</strong> (' + fmt(sumPer.kcal * m, 0) + ' statt ' + fmt(mv.kcalBerechnet * m, 0) + ' kcal) · <button type="button" class="linkbtn portion-reset">↺ wie berechnet</button>');
      if (hasWaterOverride) parts.push('<strong>Wasser angepasst</strong> (' + fmt(waterPer * m, 0) + ' statt ' + fmt(waterRef * m, 0) + ' ml) · <button type="button" class="linkbtn water-reset">↺ wie berechnet</button>');
      return parts.length ? parts.join(" · ")
        : 'Wie berechnet · ' + fmt(d.kcalMahl * m, 0) + ' kcal ' + bezug + ' · Gramm ändern skaliert alles mit'; // eine Zeile am Handy
    };
    const mealStatus = statusLine(1, "je Mahlzeit");
    // Anpassen: Fleisch (nur diese Ansicht) und MCT-Anteil (Vorgabe für alle Rezepte) samt Zurücksetzen.
    const mctOpen = detailMctOpen == null ? d.mctShare : detailMctOpen;
    const anpParts = [];
    if (meatSlot && detailMeat && detailMeat !== meatSlot.baseKey) anpParts.push('<strong>Fleisch getauscht: ' + MEATS[detailMeat].icon + ' ' + MEATS[detailMeat].label + '</strong> (nur in dieser Ansicht) · <button type="button" class="linkbtn meat-reset">↺ wie im Rezept</button>');
    if (baseOilIndex >= 0 && Math.abs(d.mctShare - mctOpen) > 0.001) anpParts.push('<strong>MCT-Anteil ' + fmt(d.mctShare * 100, 0) + ' %</strong> statt ' + fmt(mctOpen * 100, 0) + ' % – gilt für alle Rezepte (Vorgaben) · <button type="button" class="linkbtn mct-reset" data-mct="' + mctOpen + '">↺ ' + fmt(mctOpen * 100, 0) + ' %</button>');
    const anpassenStatus = anpParts.length ? anpParts.join(" · ")
      : 'Wie im Rezept' + (meatSlot ? ' · Fleisch gilt nur in dieser Ansicht' : '') + (baseOilIndex >= 0 ? ' · der MCT-Anteil ist die Vorgabe für alle Rezepte' : '');
    const tagStatus = statusLine(mult, days === 1 ? "je Tag" : (days ? "für " + days + " Tage" : "für " + portionsTxt + " Portionen"));

    const c = document.getElementById("detail-content");
    c.innerHTML =
      '<div class="detail-head"><span class="detail-icon">' + (rec.icon || "🥑") + "</span>" +
        '<div><div class="title">' + escapeHtml(familyOf(rec)) + "</div>" +
        '<div class="meta"><span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmtRatio(r, 2) + "</span><span>" +
        fmt(sumPer.kcal, 0) + " kcal je Portion</span>" + ketoBadge + "</div></div></div>" +
      '<div class="detail-tabs-wrap"><div class="segmented detail-tabs" id="detail-tabs">' + DETAIL_PAGES.map(tabBtn).join("") + "</div>" +
      '<div class="page-dots" id="page-dots">' + DETAIL_PAGES.map(pg => '<button type="button" class="dot' + (dtab === pg[0] ? " active" : "") + '" data-dtab="' + pg[0] + '" aria-label="' + pg[1] + '"></button>').join("") +
      '<span class="page-no">Seite ' + (DETAIL_PAGES.findIndex(pg => pg[0] === dtab) + 1) + " von " + DETAIL_PAGES.length + "</span></div></div>" +
      '<div class="pages" id="detail-pages">' +

      /* ---------- 1 Mahlzeit ---------- */
      paneOpen("mahlzeit") +
      '<h4 class="ph">🍽️ Mahlzeit <span class="hint">eine Portion</span></h4>' +
      '<div class="portion-line">' + mealStatus + '</div>' +
      '<div class="detail-tiles strip">' +
        '<div class="dstat' + (mv.hasPortion ? " warn" : "") + '"><div class="v">' + fmt(sumPer.kcal, 0) + '</div><div class="l">kcal · Ziel ' + fmt(d.kcalMahl, 0) + '</div></div>' +
        '<div class="dstat ' + (proteinOk ? "" : "warn") + '"><div class="v">' + fmt(sumPer.eiweiss) + ' g</div><div class="l">Eiweiß · Ziel ' + fmt(d.eiweissMahl) + ' g</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(hasOil ? perGnoOil : totalG / mult, 0) + ' g</div><div class="l">Menge' + (hasOil ? ' ohne Öl' : "") + '</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(hasOil ? perMlNoOil : ml / mult, 0) + ' ml</div><div class="l">Volumen' + (hasOil ? ' ohne Öl' : "") + '</div></div>' +
      "</div>" +
      (!proteinOk ? '<div class="note warn">⚠️ Liegt unter dem Eiweiß-Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
      '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' +
        nRows +
        "<tr class='sum'><td class='name'>Summe je Portion</td><td>" + fmt(totalG / mult, 0) + "</td><td>" + fmt(sumPer.eiweiss) + "</td><td>" +
        fmt(sumPer.fett) + "</td><td>" + fmt(sumPer.kh) + "</td><td>" + fmt(sumPer.kcal, 0) + "</td></tr>" +
      "</tbody></table></div>" +
      fluidLine +
      "</div>" +

      /* ---------- 2 Abwiegen (Zubereitungsmenge, Standard ein Tag) ---------- */
      paneOpen("abwiegen") +
      '<h4 class="ph">📅 Tag <span class="hint">' + (mult === 1 ? "eine Portion" : (days === 1 ? "= " : (days ? days + " Tage = " : "")) + portionsTxt + " Portionen") + '</span></h4>' +
      scaleSeg +
      '<div class="portion-line">' + tagStatus + '</div>' +
      qTiles +
      '<div class="tbl-wrap"><table class="kitchen"><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' + kRows +
        "<tr class='sum'><td class='name'>Summe</td><td class='amt'>" + fmt(totalG, 0) + "</td><td>" + fmt(sum.eiweiss) + "</td><td>" +
        fmt(sum.fett) + "</td><td>" + fmt(sum.kh) + "</td><td>" + fmt(sum.kcal, 0) + "</td></tr>" +
      "</tbody></table></div>" +
      dayCheck +
      ((fluidDayNote && packInfoSeg && /class="note tip"/.test(fluidDayNote))
        ? fluidDayNote.replace(/^<div class="note tip">/, '<div class="note tip pack">').replace(/<\/div>$/, "") + "<br>" + packInfoSeg.replace(/^<div class="note tip pack">/, "").replace(/<\/div>$/, "") + "</div>"
        : fluidDayNote + packInfoSeg) +
      "</div>" +

      /* ---------- 3 Anpassen ---------- */
      paneOpen("anpassen") +
      '<h4 class="ph">🎛️ Anpassen <span class="hint">' + (meatSeg && oilSeg ? "Fleisch nur hier · Öl für alle Rezepte" : (oilSeg ? "Öl gilt für alle Rezepte" : (meatSeg ? "nur in dieser Ansicht" : ""))) + '</span></h4>' +
      ((basisSeg || meatSeg || oilSeg) ? '<div class="portion-line">' + anpassenStatus + '</div>' : "") +
      basisSeg + meatSeg + oilSeg +
      (!(basisSeg || meatSeg || oilSeg) ? '<div class="note info">Für dieses Gericht gibt es nichts umzuschalten.</div>' : "") +
      "</div>" +

      /* ---------- 4 Kochen: Abfüll-Kacheln oben (immer sichtbar), darunter die Schritte ---------- */
      paneOpen("zubereitung") +
      '<h4 class="ph">🍳 Kochen <span class="hint">für ' + portionLabel + '</span></h4>' +
      '<div class="portion-line">💉 <strong>Abfüllen je Portion</strong>' + (hasOil ? ' – ohne Öl, das kommt erst vor dem Füttern dazu' : '') +
        (mult !== 1 ? ' · gesamt ≈ ' + fmt((hasOil ? perGnoOil : totalG / mult) * mult, 0) + ' g = <strong>' + portionsTxt + ' × ' + fmt(perGnoOil, 0) + ' g</strong>' +
          (hasOil ? ' · Öl gesamt ' + oilRowsPer.map(it => fmt(num(it.grams) * mult, 0) + ' g').join(" + ") : '') : '') + '</div>' +
      '<div class="detail-tiles strip fill-tiles">' +
        '<div class="dstat"><div class="v fill-big">≈ ' + fmt(perGnoOil, 0) + ' g</div><div class="l">je Portion' + (hasOil ? ' ohne Öl' : '') + '</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(perMlNoOil, 0) + ' ml</div><div class="l">≈ ' + fmt(perMlNoOil / 60, 1) + ' Spritzen à 60 ml</div></div>' +
        (hasOil ? oilRowsPer.map(it => '<div class="dstat oil"><div class="v">' + fmt(num(it.grams), 1) + ' g</div><div class="l">' + escapeHtml(String(it.food).replace(/\s*C8\+C10/, "")) + ' · vor dem Füttern</div></div>').join("") : "") +
      "</div>" +
      ((res.mct || rec.varoma || mult !== 1) ? '<div class="note ' + (res.mct && res.mct.energiePz > 50 ? "warn" : "tip") + '">' +
        [rec.varoma ? '🫗 Vor dem Abfüllen durch ein feines Sieb streichen (sonst verstopft die Spritze).' : "",
         res.mct ? 'MCT <strong>' + fmt(res.mct.gMct, 1) + ' g</strong> je Portion (' + fmt(res.mct.energiePz, 0) + ' % der Energie) – klein beginnen, Verträglichkeit beobachten.' : "",
         mult !== 1 ? 'Garzeiten gelten für <strong>eine</strong> Portion – länger garen, bis alles weich ist; im Kühlschrank lagern.' : ""].filter(Boolean).join(" ") + "</div>" : "") +
      '<h4 class="ph steps-ph">' + (rec.varoma ? "🫧 Zubereitung mit Varoma (dämpfen)" : "🥣 Zubereitung") + '</h4>' +
      (stepsHtml || '<div class="note info">Keine Zubereitungsschritte hinterlegt.</div>') +
      "</div>" +

      "</div>" + /* pages */
      '<div class="detail-actions" id="detail-actions"></div>';

    c.querySelectorAll(".seg-portion button[data-scale]").forEach(b =>
      b.addEventListener("click", () => { detailScale = parseScale(b.dataset.scale); persistScale(); renderDetail(); }));
    c.querySelectorAll(".seg-portion button[data-step]").forEach(b =>
      b.addEventListener("click", () => {
        detailScale = scaleFromPortions(Math.max(0.5, Math.round((mult + parseFloat(b.dataset.step)) * 2) / 2), d.mahl);
        persistScale(); renderDetail();
      }));
    const pin = c.querySelector("#portion-input");
    if (pin) pin.addEventListener("change", () => {
      const v = parseFloat(String(pin.value).replace(",", ".")); if (v > 0) { detailScale = scaleFromPortions(v, d.mahl); persistScale(); renderDetail(); }
    });
    // Rechnen: Gramm je Portion ändern → Portion-Faktor je Rezept (Wasser: gemerkter Wert je Portion)
    c.querySelectorAll(".g-edit").forEach(inp =>
      inp.addEventListener("change", () => {
        const oldG = parseFloat(inp.dataset.g); const nv = parseFloat(String(inp.value).replace(",", "."));
        if (inp.dataset.water === "1") { if (isFinite(nv) && nv >= 0) { state.water[waterKey] = nv; save(); renderDetail(); } return; }
        if (oldG > 0 && nv > 0) {
          const f = Math.round(mv.portionF * (nv / oldG) * 1000) / 1000;
          if (Math.abs(f - 1) < 1e-6) delete state.portion[waterKey]; else state.portion[waterKey] = f;
          save(); renderDetail();
        }
      }));
    c.querySelectorAll(".portion-reset").forEach(b =>
      b.addEventListener("click", () => { delete state.portion[waterKey]; save(); renderDetail(); }));
    c.querySelectorAll(".amt-edit:not(.g-edit)").forEach(inp =>
      inp.addEventListener("change", () => {
        const oldG = parseFloat(inp.dataset.g); const nv = parseFloat(String(inp.value).replace(",", "."));
        if (inp.dataset.water === "1") {
          // Nur das Wasser ändern – Rest bleibt; gemerkt wird der Wert je Portion.
          if (isFinite(nv) && nv >= 0) { state.water[waterKey] = nv / mult; save(); renderDetail(); }
          return;
        }
        if (oldG > 0 && nv > 0) {
          const f = Math.round(mv.portionF * (nv / oldG) * 1000) / 1000;
          if (Math.abs(f - 1) < 1e-6) delete state.portion[waterKey]; else state.portion[waterKey] = f;
          save(); renderDetail();
        }
      }));
    c.querySelectorAll(".meat-reset").forEach(b => b.addEventListener("click", () => { detailMeat = null; renderDetail(); }));
    c.querySelectorAll(".mct-reset").forEach(b => b.addEventListener("click", () => { state.settings.mctShare = num(b.dataset.mct); save(); renderDetail(); }));
    c.querySelectorAll(".water-reset").forEach(b =>
      b.addEventListener("click", () => { delete state.water[waterKey]; save(); renderDetail(); }));
    c.querySelectorAll("button[data-goto=vorgaben]").forEach(b =>
      b.addEventListener("click", () => { closeDetail(); showView("vorgaben"); }));
    c.querySelectorAll("button[data-open-rec]").forEach(b =>
      b.addEventListener("click", () => {
        const v = allRecipes().find(x => recipeKey(x) === b.dataset.openRec); if (!v) return;
        openRecipeDetail(v, true); // Geschwister-Rezept: gewählte Menge bleibt
      }));
    c.querySelectorAll(".meat-swap button[data-meat]").forEach(b =>
      b.addEventListener("click", () => {
        detailMeat = (meatSlot && b.dataset.meat === meatSlot.baseKey) ? null : b.dataset.meat;
        renderDetail();
      }));
    c.querySelectorAll(".meat-swap button[data-mcts]").forEach(b =>
      b.addEventListener("click", () => {
        state.settings.mctShare = num(b.dataset.mcts) / 100; save(); renderDetail();
      }));
    // Blätter: am Desktop Reiter (nur das aktive Blatt sichtbar), am Handy nebeneinander mit seitlichem Wischen.
    const pages = c.querySelector("#detail-pages");
    const panes = pages ? [...pages.querySelectorAll(":scope > .pane")] : [];
    const pageIdx = (k) => Math.max(0, DETAIL_PAGES.findIndex(pg => pg[0] === k));
    const leftOf = (i) => panes[i] && panes[0] ? panes[i].offsetLeft - panes[0].offsetLeft : 0;
    const markTab = (k) => {
      c.querySelectorAll("#detail-tabs button[data-dtab], #page-dots button[data-dtab]").forEach(b => b.classList.toggle("active", b.dataset.dtab === k));
      const pn = c.querySelector("#page-dots .page-no"); if (pn) pn.textContent = "Seite " + (pageIdx(k) + 1) + " von " + DETAIL_PAGES.length;
      const ab = c.querySelector("#detail-tabs button.active");
      if (ab && typeof ab.scrollIntoView === "function") { try { ab.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {} }
    };
    const goTo = (k, smooth) => {
      const left = leftOf(pageIdx(k));
      if (smooth) { try { pages.scrollTo({ left: left, behavior: "smooth" }); return; } catch (e) {} }
      pages.scrollLeft = left;
    };
    if (mobile && pages) {
      goTo(dtab, false);
      markTab(dtab);
      let st = null;
      pages.addEventListener("scroll", () => {
        clearTimeout(st);
        st = setTimeout(() => {
          let best = 0, bd = Infinity;
          panes.forEach((p, i) => { const dd = Math.abs(leftOf(i) - pages.scrollLeft); if (dd < bd) { bd = dd; best = i; } });
          const k = DETAIL_PAGES[best][0];
          if (k !== state.settings.detailTab) { state.settings.detailTab = k; save(); markTab(k); }
        }, 80);
      });
    }
    c.querySelectorAll("#detail-tabs button[data-dtab], #page-dots button[data-dtab]").forEach(b =>
      b.addEventListener("click", () => {
        state.settings.detailTab = b.dataset.dtab; save();
        if (mobile && pages) { markTab(b.dataset.dtab); goTo(b.dataset.dtab, true); }
        else renderDetail();
      }));

    // Feste Aktionsleiste unten: Favorit · Drucken · Editor (· Löschen bei eigenen Rezepten)
    const actions = c.querySelector("#detail-actions");
    const fav = isFav(rec);
    const favBtn = el("button", { class: "btn secondary" }, (fav ? "★ Favorit" : "☆ Favorit"));
    favBtn.addEventListener("click", () => { toggleFav(rec); openRecipeDetail(rec); });
    actions.appendChild(favBtn);
    const printBtn = el("button", { class: "btn secondary" }, "🖨️ Drucken");
    printBtn.addEventListener("click", () => printRecipe(rec, res, d, mult));
    actions.appendChild(printBtn);
    const editBtn = el("button", { class: "btn", id: "edit-btn" }, "✏️ " + (rec.custom ? "Bearbeiten" : "Editor"));
    editBtn.addEventListener("click", () => { const r = applyMeatChoice(rec, detailMeat); (rec.custom ? seedComposeFromSaved(r) : seedComposeFromRecipe(r)); closeDetail(); openCompose(); });
    actions.appendChild(editBtn);
    if (rec.custom) {
      const delBtn = el("button", { class: "btn ghost" }, "🗑️");
      delBtn.addEventListener("click", () => {
        if (confirm("Eigenes Rezept „" + rec.name + "“ wirklich löschen?")) {
          state.savedRecipes = state.savedRecipes.filter(s => s.key !== rec.key);
          const fi = state.favorites.indexOf(rec.key); if (fi !== -1) state.favorites.splice(fi, 1);
          save(); closeDetail(); renderRezepte();
        }
      });
      actions.appendChild(delBtn);
    }
  }

  function seedComposeFromSaved(sr) {
    const base = sr.items.map(it => ({ food: it.food, grams: num(it.grams) }));
    const fi = fatItemIndex(base);
    let fats, items;
    if (fi >= 0) { fats = [{ food: base[fi].food, share: 100 }]; items = base.filter((_, i) => i !== fi); }
    else { fats = [{ food: "Butter", share: 100 }]; items = base; }
    if (!items.length) items = [{ food: "", grams: 30 }];
    state.compose = { items: items.map(it => ({ food: it.food, grams: it.grams })), fats: fats, scale: true, fromRecipe: sr.name, editKey: sr.key };
    save();
  }

  // Übernimmt ein Rezept in den freien Rechner (Zutaten editierbar, Fett wird neu berechnet)
  function seedComposeFromRecipe(rec) {
    const base = rec.items.map(it => ({ food: it.food, grams: num(it.grams) }));
    const fi = fatItemIndex(base);
    let fats, items;
    if (fi >= 0) { fats = [{ food: base[fi].food, share: 100 }]; items = base.filter((_, i) => i !== fi); }
    else { fats = [{ food: "Butter", share: 100 }]; items = base; }
    if (!items.length) items = [{ food: "", grams: 30 }];
    state.compose = { items: items.map(it => ({ food: it.food, grams: it.grams })), fats: fats, scale: true, fromRecipe: rec.name };
    save();
  }
  function closeDetail() {
    document.getElementById("detail-overlay").hidden = true;
    modalClose("detail");
  }
  function bindDetail() {
    const overlay = document.getElementById("detail-overlay");
    document.getElementById("detail-close").addEventListener("click", closeDetail);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeDetail(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !overlay.hidden) closeDetail(); });
  }

  /* ---------- Heute: Tagesplan ---------- */
  function ensureDayPlan(d) {
    if (!Array.isArray(state.dayPlan)) state.dayPlan = [];
    while (state.dayPlan.length < d.mahl) state.dayPlan.push({ key: null });
    if (state.dayPlan.length > d.mahl) state.dayPlan.length = d.mahl;
  }
  function recipeByKey(key) {
    if (!key) return null;
    const all = allRecipes();
    for (let i = 0; i < all.length; i++) if (recipeKey(all[i]) === key) return all[i];
    return null;
  }
  function renderHeute() {
    const box = document.getElementById("heute-content"); if (!box) return;
    const d = derived(); ensureDayPlan(d);
    const tot = { kcal: 0, eiweiss: 0, fett: 0, kh: 0, mct: 0, raps: 0, fluid: 0, filled: 0 };
    const facts = [];
    const slotsHtml = state.dayPlan.map((slot, i) => {
      const rec = recipeByKey(slot.key);
      if (!rec) {
        facts.push(null);
        return '<div class="slot empty-slot"><div class="slot-head"><span class="slot-no">Mahlzeit ' + (i + 1) + '</span></div>' +
          '<button type="button" class="btn secondary" data-pick="' + i + '">＋ Rezept wählen</button></div>';
      }
      const f = mealFacts(rec, d); facts.push(f);
      tot.kcal += f.sum.kcal; tot.eiweiss += f.sum.eiweiss; tot.fett += f.sum.fett; tot.kh += f.sum.kh;
      tot.mct += f.gMct; tot.raps += f.gRaps; tot.fluid += f.fluid || 0; tot.filled++;
      return '<div class="slot"><div class="slot-head"><span class="slot-no">Mahlzeit ' + (i + 1) + '</span>' +
        '<span class="slot-name">' + (rec.icon || "🥑") + " " + escapeHtml(rec.name) + "</span></div>" +
        '<div class="slot-stats"><span>' + fmt(f.sum.kcal, 0) + ' kcal</span><span>Eiweiß ' + fmt(f.sum.eiweiss) + ' g</span>' +
        '<span class="ratio-pill ' + ratioClass(f.ratio, d.ratio) + '">' + fmtRatio(f.ratio, 2) + '</span></div>' +
        '<details class="collapsible feed"><summary>💉 Füttern – Menge</summary><div class="feed-body">' +
          '<div class="fill-hero small"><div class="fill-big">≈ ' + fmt(f.gNoOil, 0) + ' g</div><div class="fill-sub">≈ ' + fmt(f.mlNoOil, 0) + ' ml' + (f.hasOil ? " · <strong>ohne Öl</strong>" : "") + "</div></div>" +
          (f.hasOil ? '<ul class="oil-list">' + f.oils.map(o => "<li><span>" + escapeHtml(o.food) + "</span><strong>" + fmt(num(o.grams), 1) + " g</strong></li>").join("") + "</ul>" +
            '<div class="hint">Öl erst kurz vor dem Füttern einrühren' + (rec.varoma ? "; vorher durch ein feines Sieb streichen" : "") + ".</div>" : "") +
        "</div></details>" +
        '<div class="slot-actions"><button type="button" class="linkbtn" data-open="' + i + '">Rezept öffnen</button>' +
        '<button type="button" class="linkbtn" data-pick="' + i + '">Ändern</button>' +
        '<button type="button" class="linkbtn" data-clear="' + i + '">Entfernen</button></div></div>';
    }).join("");
    const ratioDay = (tot.eiweiss + tot.kh) > 0 ? tot.fett / (tot.eiweiss + tot.kh) : null;
    const share = tot.filled / d.mahl; // Anteil geplanter Mahlzeiten → Ziele anteilig
    const pct = (v, t) => t > 0 ? Math.round(v / t * 100) : 0;
    const eiweissZiel = d.eiweiss * share, kcalZiel = d.kcal * share, kcalMinZiel = d.kcalMin * share, fluidZiel = d.fluidDay * share;
    const kcalLow = tot.kcal < kcalMinZiel - 0.5;
    const sums = tot.filled
      ? '<div class="card"><h3>Σ Tagessummen <span class="hint">' + tot.filled + ' von ' + d.mahl + ' Mahlzeiten geplant</span></h3>' +
        '<div class="detail-tiles">' +
        '<div class="dstat' + (kcalLow ? " warn" : "") + '"><div class="v">' + fmt(tot.kcal, 0) + '</div><div class="l">kcal · Ziel ' + fmt(kcalZiel, 0) + ' (' + pct(tot.kcal, kcalZiel) + ' %)<br><small>Minimum ' + fmt(kcalMinZiel, 0) + (kcalLow ? ' – unterschritten!' : ' ✓') + '</small></div></div>' +
        '<div class="dstat' + (tot.eiweiss < eiweissZiel * 0.9 ? " warn" : "") + '"><div class="v">' + fmt(tot.eiweiss) + ' g</div><div class="l">Eiweiß · Ziel ' + fmt(eiweissZiel, 0) + ' g (' + pct(tot.eiweiss, eiweissZiel) + ' %)</div></div>' +
        '<div class="dstat"><div class="v"><span class="ratio-pill ' + ratioClass(ratioDay, d.ratio) + '">' + fmtRatio(ratioDay, 2) + '</span></div><div class="l">Verhältnis über den Tag · Ziel ' + fmtTarget(d.ratio) + '</div></div>' +
        '<div class="dstat"><div class="v">' + fmt(tot.mct, 1) + ' g</div><div class="l">MCT je Tag' + (tot.raps > 0 ? '<br><small>Rapsöl ' + fmt(tot.raps, 0) + ' g</small>' : "") + '</div></div>' +
        (d.fluidDay > 0 ? '<div class="dstat' + (d.wasserModus === "mahlzeit" && tot.fluid < fluidZiel - 3 ? " warn" : "") + '"><div class="v">' + fmt(tot.fluid, 0) + ' ml</div><div class="l">Flüssigkeit · Ziel ' + fmt(fluidZiel, 0) + ' ml</div></div>' : "") +
        "</div>" +
        (d.fluidDay > 0 && d.wasserModus === "zwischen" ? zwischenText(d, fluidZiel - tot.fluid, tot.filled) : "") +
        (d.fluidDay > 0 && d.wasserModus === "mahlzeit" && tot.fluid < fluidZiel - 3 ? '<div class="note warn">💧 Der Tag liegt unter dem Flüssigkeitsziel (' + fmt(fluidZiel, 0) + ' ml) – bei einem Rezept ist das Wasser gemerkt und kleiner als der Anteil.</div>' : "") +
        (kcalLow ? '<div class="note warn">⚠️ Der Tag liegt unter dem Kalorien-Minimum (' + fmt(d.kcalMin, 0) + ' kcal). Eine Mahlzeit mit mehr Kalorien einplanen.</div>' : "") +
        (tot.filled < d.mahl ? '<div class="note info">Ziele sind anteilig auf die ' + tot.filled + ' geplanten Mahlzeiten gerechnet.</div>' : "") +
        '<div class="btn-row"><button type="button" class="btn secondary" id="print-day">🖨️ Tagesplan drucken</button><button type="button" class="btn ghost" id="clear-day">Plan leeren</button></div></div>'
      : '<div class="card"><p class="hint">Noch keine Mahlzeit geplant. Wähle je Mahlzeit ein Rezept – die Tagessummen (kcal, Eiweiß, Verhältnis über den Tag, MCT je Tag) erscheinen automatisch.</p></div>';
    // Packungsstand (z. B. Compleat 500 ml, 3 Tage): heute verplant, Rest für morgen.
    const packs = {};
    facts.forEach(f => {
      if (!f || !f.rec.packung) return;
      const pk = f.rec.packung, g = f.res.items.filter(it => it.food === pk.food).reduce((a, it) => a + num(it.grams), 0);
      if (!packs[pk.food]) packs[pk.food] = { pk, ml: 0, meals: 0 };
      packs[pk.food].ml += g; packs[pk.food].meals++;
    });
    const packHtml = Object.keys(packs).map(k => {
      const x = packs[k], rest = x.pk.ml - x.ml, per = x.meals ? x.ml / x.meals : 0;
      const restMeals = per > 0 ? Math.floor(Math.max(0, rest) / per + 1e-9) : 0;
      const zweiTage = x.ml * x.pk.tage;
      return '<div class="card"><h3>🧃 ' + escapeHtml(k) + ' <span class="hint">Packung ' + x.pk.ml + ' ml · offen ' + x.pk.tage + ' Tage haltbar</span></h3><div class="detail-tiles">' +
        '<div class="dstat"><div class="v">' + fmt(x.ml, 0) + ' ml</div><div class="l">heute · ' + x.meals + ' Mahlzeit' + (x.meals === 1 ? "" : "en") + ' à ' + fmt(per, 0) + ' ml</div></div>' +
        '<div class="dstat' + (rest < -0.5 ? " warn" : "") + '"><div class="v">' + fmt(Math.max(0, rest), 0) + ' ml</div><div class="l">' +
          (rest < -0.5 ? 'fehlen ' + fmt(-rest, 0) + ' ml – der Plan braucht mehr als eine Packung' : 'bleibt für morgen · reicht für ' + restMeals + ' Mahlzeit' + (restMeals === 1 ? "" : "en")) + '</div></div></div>' +
        (rest >= -0.5 && zweiTage > x.pk.ml + 0.5 ? '<div class="note info">Bei gleichem Plan an ' + x.pk.tage + ' Tagen fehlen ' + fmt(zweiTage - x.pk.ml, 0) + ' ml – dafür braucht es eine zweite Packung.</div>' : "") +
        (rest >= -0.5 && zweiTage < x.pk.ml - 0.5 ? '<div class="note info">Bei gleichem Plan an ' + x.pk.tage + ' Tagen bleiben ' + fmt(x.pk.ml - zweiTage, 0) + ' ml übrig (danach entsorgen) – oder mehr Mahlzeiten damit planen bzw. das Rezept mit Pre Apta wählen, das je Mahlzeit weniger Compleat braucht.</div>' : "") +
        (Math.abs(zweiTage - x.pk.ml) <= 0.5 ? '<div class="note tip">✅ Bei gleichem Plan an ' + x.pk.tage + ' Tagen geht die Packung genau auf.</div>' : "") +
        '</div>';
    }).join("");
    box.innerHTML = '<div class="card"><h3>📅 Tagesplan <span class="hint">' + d.mahl + ' Mahlzeiten · ' + fmt(d.kcalMahl, 0) + ' kcal je Mahlzeit</span></h3><div class="slots">' + slotsHtml + "</div></div>" + sums + packHtml;
    box.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => openPicker(num(b.dataset.pick))));
    box.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => { const r = recipeByKey(state.dayPlan[num(b.dataset.open)].key); if (r) openRecipeDetail(r); }));
    box.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", () => { state.dayPlan[num(b.dataset.clear)] = { key: null }; save(); renderHeute(); }));
    const pd = box.querySelector("#print-day"); if (pd) pd.addEventListener("click", () => printDayPlan(d, facts, tot, ratioDay));
    const cd = box.querySelector("#clear-day");
    if (cd) cd.addEventListener("click", () => { if (confirm("Tagesplan leeren?")) { state.dayPlan = state.dayPlan.map(() => ({ key: null })); save(); renderHeute(); } });
  }
  // Rezept-Auswahl für einen Slot (Overlay mit Suche)
  let pickerSlot = -1;
  function openPicker(i) {
    pickerSlot = i;
    const ov = document.getElementById("picker-overlay"), q = document.getElementById("picker-search");
    if (!ov) return;
    q.value = ""; renderPicker();
    ov.hidden = false; modalOpen("picker");
    try { q.focus(); } catch (e) {}
  }
  function renderPicker() {
    const list = document.getElementById("picker-list"); if (!list) return;
    const q = ((document.getElementById("picker-search") || {}).value || "").trim().toLowerCase();
    const d = derived();
    // Jedes Rezept ein Eintrag (mit oder ohne KetoCal); gespeichert wird das konkrete Rezept.
    const hitItems = (r) => r.items.some(it => (it.food || "").toLowerCase().indexOf(q) !== -1);
    const recs = allRecipes()
      .map(rec => ({ fam: { name: familyOf(rec) }, rec }))
      .filter(x => !state.settings.hideKeto || !x.rec.ketocal)
      .filter(x => !q || x.fam.name.toLowerCase().indexOf(q) !== -1 || hitItems(x.rec))
      .map(x => Object.assign(x, { res: computeAdjustedRecipe(x.rec, d.kcalMahl, d.ratio) })).filter(x => x.res.ok)
      .sort((a, b) => { const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1; if (fa !== fb) return fa - fb; return a.fam.name.localeCompare(b.fam.name, "de") || ((a.rec.ketocal ? 1 : 0) - (b.rec.ketocal ? 1 : 0)); });
    list.innerHTML = recs.map(x => {
      const s = sumMacros(x.res.items);
      return '<button type="button" class="pick-row" data-key="' + escapeHtml(recipeKey(x.rec)) + '"><span class="pick-icon">' + (x.rec.icon || "🥑") + '</span>' +
        '<span class="pick-name">' + escapeHtml(x.fam.name) + (isFav(x.rec) ? " ★" : "") + '</span>' +
        '<span class="pick-meta">' + fmt(s.kcal, 0) + " kcal · Eiweiß " + fmt(s.eiweiss) + " g" + ((x.rec.ketocal || isMulti(x.rec)) ? " · " + (x.rec.ketocal ? "🥄 " : "") + escapeHtml(basisLabel(x.rec)) : "") + "</span></button>";
    }).join("") || '<div class="empty">Kein Gericht gefunden.</div>';
    list.querySelectorAll(".pick-row").forEach(b => b.addEventListener("click", () => {
      if (pickerSlot >= 0) { ensureDayPlan(derived()); state.dayPlan[pickerSlot] = { key: b.dataset.key }; save(); }
      closePicker(); renderHeute();
    }));
  }
  function closePicker() {
    const ov = document.getElementById("picker-overlay"); if (!ov) return;
    ov.hidden = true; modalClose("picker");
  }
  function bindHeute() {
    const th = document.getElementById("tab-heute"); if (th) th.hidden = false;
    const ov = document.getElementById("picker-overlay"); if (!ov) return;
    document.getElementById("picker-close").addEventListener("click", closePicker);
    ov.addEventListener("click", e => { if (e.target === ov) closePicker(); });
    document.getElementById("picker-search").addEventListener("input", renderPicker);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden) closePicker(); });
  }
  function printDayPlan(d, facts, tot, ratioDay) {
    const rows = facts.map((f, i) => f
      ? "<tr><td>" + (i + 1) + "</td><td>" + escapeHtml(f.rec.name) + "</td><td>" + fmt(f.gNoOil, 0) + " g / " + fmt(f.mlNoOil, 0) + " ml</td><td>" +
        (f.hasOil ? f.oils.map(o => escapeHtml(o.food) + " " + fmt(num(o.grams), 1) + " g").join("<br>") : "–") + "</td><td>" + fmt(f.sum.kcal, 0) + "</td><td>" + fmt(f.sum.eiweiss) + " g</td></tr>"
      : "<tr><td>" + (i + 1) + "</td><td colspan='5' style='color:#888'>– nicht geplant –</td></tr>").join("");
    const html = "<!DOCTYPE html><html lang='de'><head><meta charset='utf-8'><title>Tagesplan</title><style>" +
      "@page{size:A4 portrait;margin:16mm}body{font-family:Arial,Helvetica,sans-serif;color:#1f2933;font-size:11pt;line-height:1.45;margin:0}" +
      "h1{font-size:18pt;margin:0 0 2mm}.sub{color:#444;margin:0 0 5mm;font-size:10pt}table{width:100%;border-collapse:collapse}" +
      "th,td{border-bottom:0.4pt solid #bbb;padding:1.8mm 1.5mm;text-align:left;vertical-align:top;font-size:10.5pt}th{background:#f2f4f6}" +
      ".tot td{font-weight:bold;border-top:1pt solid #777}.note{color:#666;font-size:8.5pt;margin-top:6mm}</style></head><body>" +
      "<h1>📅 Tagesplan</h1><p class='sub'>" + d.mahl + " Mahlzeiten · " + fmt(d.kcal, 0) + " kcal/Tag · Verhältnis " + fmtTarget(d.ratio) +
      (d.mctShare > 0 ? " · MCT-Anteil " + Math.round(d.mctShare * 100) + " %" : "") + " · " + new Date().toLocaleDateString("de-AT") + "</p>" +
      "<table><thead><tr><th>#</th><th>Mahlzeit</th><th>Abfüllen (ohne Öl)</th><th>Öl vor dem Füttern</th><th>kcal</th><th>Eiweiß</th></tr></thead><tbody>" + rows +
      "<tr class='tot'><td></td><td>Summe</td><td></td><td>" + (tot.raps > 0 ? "Rapsöl " + fmt(tot.raps, 0) + " g" : "") + (tot.mct > 0 ? "<br>MCT " + fmt(tot.mct, 1) + " g" : "") + "</td><td>" + fmt(tot.kcal, 0) + "</td><td>" + fmt(tot.eiweiss) + " g</td></tr>" +
      "</tbody></table><p class='sub'>Verhältnis über den Tag: " + fmtRatio(ratioDay, 2) + " · Eiweiß-Ziel " + fmt(d.eiweiss, 0) + " g/Tag</p>" +
      "<p class='note'>Erstellt mit HamHam Keto. Bitte Mengen mit dem Behandlungsteam abstimmen.</p></body></html>";
    let w = null;
    try { w = window.open("", "_blank"); } catch (e) {}
    if (!w) { alert("Bitte Pop-ups für diese Seite erlauben, um drucken zu können."); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 250);
  }

  /* ---------- Drucken (A4 Hochformat) ---------- */
  function printRecipe(rec, res, d, mult) {
    mult = mult || 1;
    const hasMct = res.items.some(it => it.food === "MCT-Öl C8+C10");
    const oilWord = hasMct ? (res.items.some(it => it.food === "Rapsöl") ? "Rapsöl + MCT-Öl" : "MCT-Öl") : null;
    const adaptOil = (t) => oilWord ? String(t).replace(/Rapsöl/g, oilWord) : t;
    const pWaterG = res.items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0) * mult;
    const pBowl = Math.round(pWaterG + d.dampfVerdunstung);
    const adaptVaroma = (t) => (!t || pWaterG <= 0) ? t : t
      .replace("Ca. 500 ml Wasser in den Mixtopf geben (nur zum Dämpfen, wird nicht weiterverwendet).",
        "Ca. " + pBowl + " ml Wasser in den Mixtopf geben (das Dämpfwasser wird später mitverwendet).")
      .replace("Dämpfwasser abgießen. Die gedämpften Zutaten mit dem abgemessenen Wasser und Rapsöl",
        "Das Dämpfwasser NICHT abgießen – davon " + Math.round(pWaterG) + " ml abmessen (bei Bedarf mit frischem Wasser auf " + Math.round(pWaterG) + " ml ergänzen) und mit den gedämpften Zutaten und Rapsöl");
    const items = res.items;
    const sumPer = sumMacros(items);
    const sum = { eiweiss: sumPer.eiweiss * mult, fett: sumPer.fett * mult, kh: sumPer.kh * mult, kcal: sumPer.kcal * mult };
    const r = ratioOf(sumPer);
    const totalG = items.reduce((a, it) => a + num(it.grams), 0) * mult;
    const ml = volumeMl(items) * mult;
    const daysP = d.mahl > 0 && Math.abs(mult / d.mahl - Math.round(mult / d.mahl)) < 1e-6 ? Math.round(mult / d.mahl) : 0;
    const portionLabel = mult === 1 ? "1 Mahlzeit" : (daysP ? (daysP === 1 ? "Ganzer Tag – " : daysP + " Tage – ") : "") + fmt(mult, 1) + " Mahlzeiten";
    const rows = items.map(it => {
      const g = num(it.grams) * mult;
      const m = lineMacros({ food: it.food, grams: g });
      return "<tr><td>" + escapeHtml(it.food) + "</td><td>" + fmt(g, 1) +
        " g</td><td>" + fmt(m.kcal, 0) + " kcal</td></tr>";
    }).join("");
    const html =
      "<!DOCTYPE html><html lang='de'><head><meta charset='utf-8'><title>" + escapeHtml(rec.name) + "</title>" +
      "<style>" +
      "@page{size:A4 portrait;margin:18mm}" +
      "*{box-sizing:border-box}" +
      "body{font-family:Arial,Helvetica,sans-serif;color:#1f2933;margin:0;font-size:11pt;line-height:1.45}" +
      "h1{font-size:18pt;margin:0 0 2mm}.sub{color:#444;margin:0 0 5mm;font-size:10pt}" +
      "table{width:100%;border-collapse:collapse;margin:4mm 0}" +
      "th,td{border-bottom:0.4pt solid #bbb;padding:1.6mm 1mm;text-align:left;font-size:10.5pt}" +
      "td:nth-child(2),td:nth-child(3){text-align:right;white-space:nowrap}" +
      "tr:last-child td{font-weight:bold;border-top:1pt solid #777}" +
      ".prep{background:#f2f4f6;border-radius:2mm;padding:3mm 4mm;margin:3mm 0;line-height:1.5;break-inside:avoid}" +
      ".prep strong{display:block;margin-bottom:1mm}" +
      "tr{break-inside:avoid}" +
      ".note{color:#666;font-size:8.5pt;margin-top:6mm}" +
      "</style></head><body>" +
      "<h1>" + (rec.icon || "") + " " + escapeHtml(rec.name) + (rec.ketocal ? " (mit KetoCal)" : " (ohne KetoCal)") + "</h1>" +
      "<p class='sub'><strong>" + portionLabel + "</strong> · " + fmt(sum.kcal, 0) + " kcal · Eiweiß " + fmt(sum.eiweiss) +
      " g · Fett " + fmt(sum.fett) + " g · KH " + fmt(sum.kh) + " g · Verhältnis " +
      fmtRatio(r, 2) + "<br>Gesamtmenge ca. " + fmt(totalG, 0) + " g (≈ " + fmt(ml, 0) + " ml)</p>" +
      "<table><thead><tr><th>Lebensmittel</th><th>Menge</th><th>Energie</th></tr></thead><tbody>" + rows +
      "<tr><td>Summe</td><td>" + fmt(totalG, 0) + " g</td><td>" + fmt(sum.kcal, 0) + " kcal</td></tr></tbody></table>" +
      (mult > 1 ? "<p class='sub'>Hinweis: Mengen für " + portionLabel + ". Die Varoma-/Garzeiten gelten für eine Mahlzeit – bei der größeren Menge länger garen, bis alles weich ist.</p>" : "") +
      (rec.varoma
        ? "<div class='prep'><strong>Zubereitung mit Varoma (dämpfen)</strong>" + escapeHtml(adaptOil(adaptVaroma(adaptPrep(rec.varoma, rec, detailMeat)))) + "</div>"
        : (rec.zubereitung ? "<div class='prep'><strong>Zubereitung</strong>" + escapeHtml(adaptOil(adaptPrep(rec.zubereitung, rec, detailMeat))) + "</div>" : "")) +
      "<p class='note'>Erstellt mit HamHam Keto. Bitte Mengen vor der Zubereitung mit dem Behandlungsteam abstimmen.</p>" +
      "</body></html>";
    let w = null;
    try { w = window.open("", "_blank"); } catch (e) {}
    if (!w) { alert("Bitte Pop-ups für diese Seite erlauben, um drucken zu können."); return; }
    w.document.open(); w.document.write(html); w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 250);
  }

  /* ---------- Eigenes Rezept (frei zusammenstellen) ---------- */
  const FAT_OPTIONS = ["Butter", "Streichgenuss (Schärdinger)", "Schlagobers NÖM", "Creme Fraîche NÖM", "Mascarpone Kärntnermilch", "Rapsöl", "Olivenöl", "MCT Nutricia (100%)", "Liquigen"];

  function buildFoodSelect(value, onChange) {
    const sel = el("select", { class: "food-select" });
    sel.appendChild(el("option", { value: "" }, "— Lebensmittel wählen —"));
    const byCat = {};
    FOODS_DEFAULT.forEach(f => { (byCat[f.kategorie] = byCat[f.kategorie] || []).push(f); });
    Object.keys(byCat).sort().forEach(cat => {
      const og = el("optgroup", { label: cat });
      byCat[cat].forEach(f => {
        const o = el("option", { value: f.name }, f.name);
        if (f.name === value) o.selected = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    sel.value = value || "";
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;
  }

  // Berechnet die Gesamtmenge der (ggf. mehreren) Ausgleichsfette, damit das
  // Verhältnis bei fixen Basismengen stimmt. Die Fette werden gemäß ihren
  // Anteilen (share) aufgeteilt.
  function computeFreeMeal(baseItems, fats, ratio) {
    let Pb = 0, Fb = 0, Cb = 0, hasBase = false;
    baseItems.forEach(it => {
      const f = lookup(it.food); const g = num(it.grams);
      if (!f || g <= 0) return; hasBase = true;
      Pb += f.eiweiss * g / 100; Fb += f.fett * g / 100; Cb += f.kh * g / 100;
    });
    if (!hasBase) return { ok: false, note: "Bitte mindestens ein Lebensmittel wählen." };

    // gültige Fette mit Anteil
    const valid = (fats || []).filter(x => lookup(x.food) && num(x.share) > 0);
    if (!valid.length) return { ok: false, note: "Bitte mindestens ein Fett zum Ausgleich wählen." };
    const totShare = valid.reduce((a, x) => a + num(x.share), 0);
    const w = valid.map(x => num(x.share) / totShare);
    // gemischte Nährwerte pro 100 g
    let bp = 0, bf = 0, bc = 0;
    valid.forEach((x, i) => { const f = lookup(x.food); bp += w[i] * f.eiweiss; bf += w[i] * f.fett; bc += w[i] * f.kh; });
    const denom = bf - ratio * (bp + bc);
    if (denom <= 0) return { ok: false, note: "Das gewählte Fett ist nicht fettreich genug für das Verhältnis. Bitte ein fettreicheres Fett wählen (z. B. Butter oder Öl)." };
    const xTot = 100 * (ratio * (Pb + Cb) - Fb) / denom;
    if (xTot < 0) return { ok: false, note: "Die gewählten Zutaten sind bereits zu fettreich für dieses Verhältnis. Bitte fettärmere Zutaten verwenden." };

    const items = baseItems.filter(it => lookup(it.food) && num(it.grams) > 0)
      .map(it => ({ food: it.food, grams: round1(num(it.grams)) }));
    valid.forEach((x, i) => items.push({ food: x.food, grams: round1(w[i] * xTot), isFat: true }));
    return { ok: true, items };
  }

  function openCompose() {
    const compose = state.compose;
    const c = document.getElementById("compose-content");
    const d = derived();
    c.innerHTML =
      '<div class="title">➕ Eigenes Rezept' + (compose.fromRecipe ? " (angepasst)" : " zusammenstellen") + "</div>" +
      '<div class="meta">' + (compose.fromRecipe ? "Basierend auf „" + escapeHtml(compose.fromRecipe) + "“. " : "") +
      "Zutaten und Fett(e) frei wählen – die App berechnet die Mengen für eine Mahlzeit (Verhältnis " +
      fmtTarget(d.ratio) + ", Ziel " + fmt(d.kcalMahl, 0) + " kcal).</div>";
    const clearBtn = el("button", { class: "btn ghost" }, "🗑️ Leeren / neu beginnen");
    clearBtn.addEventListener("click", () => {
      state.compose = { items: [{ food: "", grams: 60 }], fats: [{ food: "Schlagobers NÖM", share: 100 }], scale: true };
      save(); closeCompose(); openCompose();
    });
    c.appendChild(clearBtn);
    const rowsWrap = el("div", { class: "compose-rows" });
    c.appendChild(rowsWrap);
    const addBtn = el("button", { class: "btn secondary", html: "+ Zutat hinzufügen" });
    addBtn.style.marginTop = "4px";
    addBtn.addEventListener("click", () => { compose.items.push({ food: "", grams: 30 }); renderRows(); recompute(); });
    c.appendChild(addBtn);

    const fatField = el("div", { class: "compose-fat" });
    fatField.innerHTML = "<label>Fett(e) zum Ausgleich</label>";
    const fatsWrap = el("div", { class: "compose-rows" });
    fatField.appendChild(fatsWrap);
    const addFatBtn = el("button", { class: "btn secondary", html: "+ weiteres Fett" });
    addFatBtn.addEventListener("click", () => { compose.fats.push({ food: "Butter", share: 50 }); renderFats(); recompute(); });
    fatField.appendChild(addFatBtn);
    c.appendChild(fatField);

    function renderFats() {
      fatsWrap.innerHTML = "";
      const multi = compose.fats.length > 1;
      compose.fats.forEach((ft, i) => {
        const row = el("div", { class: "compose-row" });
        const sel = el("select", { class: "food-select" });
        FAT_OPTIONS.forEach(n => { const o = el("option", { value: n }, n); if (n === ft.food) o.selected = true; sel.appendChild(o); });
        sel.value = ft.food;
        sel.addEventListener("change", () => { ft.food = sel.value; recompute(); });
        row.appendChild(sel);
        if (multi) {
          const sh = el("input", { type: "number", min: "0", step: "5", value: ft.share, class: "compose-grams" });
          sh.addEventListener("input", e => { ft.share = e.target.value; recompute(); });
          row.appendChild(sh);
          row.appendChild(el("span", { class: "unit" }, "%"));
          const del = el("button", { class: "btn ghost", title: "Entfernen" }, "✕");
          del.addEventListener("click", () => { compose.fats.splice(i, 1); renderFats(); recompute(); });
          row.appendChild(del);
        }
        fatsWrap.appendChild(row);
      });
    }

    const scaleRow = el("div", { class: "checkrow" });
    const cb = el("input", { type: "checkbox", id: "compose-scale" }); cb.checked = compose.scale;
    cb.addEventListener("change", () => { compose.scale = cb.checked; recompute(); });
    const lbl = el("label", { for: "compose-scale", class: "inline" }, "Mengen automatisch für eine Mahlzeit (≈" + fmt(d.kcalMahl, 0) + " kcal) berechnen");
    scaleRow.appendChild(cb); scaleRow.appendChild(lbl);
    c.appendChild(scaleRow);

    const result = el("div", { id: "compose-result" });
    c.appendChild(result);

    // Speichern als eigenes Rezept
    let lastItems = [], lastOk = false;
    const saveBox = el("div", { class: "compose-save" });
    const nameInp = el("input", { type: "text", placeholder: "Name für dein Rezept", value: compose.fromRecipe || "" });
    const saveBtn = el("button", { class: "btn" }, compose.editKey ? "Änderungen speichern" : "💾 Als eigenes Rezept speichern");
    saveBtn.addEventListener("click", () => {
      const nm = nameInp.value.trim();
      if (!nm) { alert("Bitte einen Namen für das Rezept eingeben."); return; }
      if (!lastOk || !lastItems.length) { alert("Bitte zuerst gültige Zutaten und ein Fett wählen."); return; }
      const items = lastItems.map(it => ({ food: it.food, grams: it.grams }));
      if (compose.editKey) {
        const sr = state.savedRecipes.find(s => s.key === compose.editKey);
        if (sr) { sr.name = nm; sr.items = items; }
      } else {
        const key = "custom:" + Date.now();
        state.savedRecipes.unshift({ key, name: nm, icon: "📝", items });
        compose.editKey = key; compose.fromRecipe = nm;
      }
      save();
      saveBtn.textContent = "✓ Gespeichert"; setTimeout(() => { saveBtn.textContent = "Änderungen speichern"; }, 1500);
    });
    saveBox.appendChild(nameInp); saveBox.appendChild(saveBtn);
    c.appendChild(saveBox);

    function renderRows() {
      rowsWrap.innerHTML = "";
      compose.items.forEach((it, i) => {
        const row = el("div", { class: "compose-row" });
        row.appendChild(buildFoodSelect(it.food, v => { it.food = v; recompute(); }));
        const g = el("input", { type: "number", min: "0", step: "5", value: it.grams, class: "compose-grams" });
        g.addEventListener("input", e => { it.grams = e.target.value; recompute(); });
        row.appendChild(g);
        row.appendChild(el("span", { class: "unit" }, "g"));
        const del = el("button", { class: "btn ghost", title: "Entfernen" }, "✕");
        del.addEventListener("click", () => { compose.items.splice(i, 1); if (!compose.items.length) compose.items.push({ food: "", grams: 30 }); renderRows(); recompute(); });
        row.appendChild(del);
        rowsWrap.appendChild(row);
      });
    }
    function recompute() {
      save();
      const d = derived();
      const res = computeFreeMeal(compose.items, compose.fats, d.ratio);
      const box = document.getElementById("compose-result");
      if (!res.ok) { lastOk = false; lastItems = []; box.innerHTML = '<div class="adjust-note">⚠️ ' + res.note + "</div>"; return; }
      let items = res.items;
      let sum = sumMacros(items);
      if (compose.scale && sum.kcal > 0) {
        const factor = d.kcalMahl / sum.kcal;
        items = items.map(it => ({ food: it.food, grams: round1(num(it.grams) * factor), isFat: it.isFat }));
        sum = sumMacros(items);
      }
      lastOk = true; lastItems = items;
      const r = ratioOf(sum);
      const totalG = items.reduce((a, it) => a + num(it.grams), 0);
      const ml = volumeMl(items);
      const proteinOk = sum.eiweiss >= d.eiweissMahl * 0.9;
      let rows = "";
      items.forEach(it => {
        const m = lineMacros(it);
        rows += "<tr" + (it.isFat ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) +
          (it.isFat ? " ⟵ Fett (berechnet)" : "") + "</td><td>" + fmt(it.grams, 1) +
          "</td><td>" + fmt(m.eiweiss) + "</td><td>" + fmt(m.fett) + "</td><td>" + fmt(m.kh) + "</td><td>" + fmt(m.kcal, 0) + "</td></tr>";
      });
      box.innerHTML =
        '<div class="detail-tiles">' +
          '<div class="dstat"><div class="v">' + fmt(sum.kcal, 0) + '</div><div class="l">kcal</div></div>' +
          '<div class="dstat"><div class="v"><span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmtRatio(r, 2) + '</span></div><div class="l">Verhältnis</div></div>' +
          '<div class="dstat"><div class="v">≈ ' + fmt(totalG, 0) + ' g</div><div class="l">Menge (' + fmt(ml, 0) + ' ml)</div></div>' +
          '<div class="dstat ' + (proteinOk ? "" : "warn") + '"><div class="v">' + fmt(sum.eiweiss) + ' g</div><div class="l">Eiweiß (Ziel ' + fmt(d.eiweissMahl) + ' g)</div></div>' +
        "</div>" +
        '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' +
        rows +
        "<tr class='sum'><td class='name'>Summe</td><td>" + fmt(totalG, 0) + "</td><td>" + fmt(sum.eiweiss) + "</td><td>" +
        fmt(sum.fett) + "</td><td>" + fmt(sum.kh) + "</td><td>" + fmt(sum.kcal, 0) + "</td></tr>" +
        "</tbody></table></div>";
      const pr = el("div", { class: "btn-row" });
      const pb = el("button", { class: "btn secondary" }, "🖨️ Drucken");
      const recForPrint = { name: "Eigenes Rezept", icon: "🧪", ketocal: false,
        thermomix: "Zutaten garen bzw. vorbereiten, gemeinsam fein pürieren und das Fett glatt unterrühren.",
        zubereitung: "Zutaten vorbereiten, fein pürieren und das berechnete Fett untermischen." };
      pb.addEventListener("click", () => printRecipe(recForPrint, { items }, d, 1));
      pr.appendChild(pb); box.appendChild(pr);
    }

    renderRows(); renderFats(); recompute();
    document.getElementById("compose-overlay").hidden = false;
    modalOpen("compose");
  }
  function closeCompose() {
    document.getElementById("compose-overlay").hidden = true;
    modalClose("compose");
    renderRezepte();
  }
  function bindCompose() {
    document.getElementById("compose-btn").addEventListener("click", openCompose);
    document.getElementById("compose-close").addEventListener("click", closeCompose);
    const ov = document.getElementById("compose-overlay");
    ov.addEventListener("click", e => { if (e.target === ov) closeCompose(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden) closeCompose(); });
  }

  /* ---------- Init ---------- */
  function init() {
    rebuildFoodIndex();
    bindSettingsBar();
    bindDetail();
    bindCompose();
    bindHeute();
    renderRezepte();
    showView(state.settings.view || "rezepte");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
