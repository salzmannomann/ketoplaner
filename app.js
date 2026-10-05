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
  // Danach gleicht der (freiwillige) Geräte-Abgleich die Änderung ab – außer beim Übernehmen eines fremden Stands.
  function save(fromSync) {
    let ok = true;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { ok = false; }
    if (fromSync !== true && typeof syncAfterSave === "function") { try { syncAfterSave(); } catch (e) {} }
    return ok;
  }

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
  // Kurze Meldung unten am Bildschirm (über Overlays), mit optionalen Knöpfen [Beschriftung, Aktion]; verschwindet nach 7 s.
  let toastTimer = null;
  function showToast(html, buttons) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.innerHTML = '<span class="toast-msg">' + html + '</span>' + (buttons || []).map((b, i) => '<button type="button" class="toast-btn" data-ti="' + i + '">' + b[0] + '</button>').join("");
    t.querySelectorAll(".toast-btn").forEach(b => b.addEventListener("click", () => { hideToast(); buttons[num(b.dataset.ti)][1](); }));
    t.hidden = false; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 7000);
  }
  function hideToast() { const t = document.getElementById("toast"); if (t) { t.classList.remove("show"); t.hidden = true; } clearTimeout(toastTimer); }
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
  // Eiweiß gegen das Ziel: „low“ unter 90 %, „high“ über dem Doppelten (viel Eiweiß kann die Ketose schwächen), sonst „ok“.
  function proteinState(e, target) { return !(target > 0) ? "ok" : e < target * 0.9 ? "low" : e > target * 2 ? "high" : "ok"; }
  // Mahlzeiten pro Tag: wählbar sind 3, 4 oder 5 (ältere gespeicherte Werte werden in diesen Bereich geholt).
  function mahlCount(s) { const n = Math.round(num(s.mahlzeiten)) || 5; return Math.min(5, Math.max(3, n)); }
  function derived() {
    const s = state.settings;
    const ratio = num(s.ratio);
    const mahl = mahlCount(s);
    const perKg = num(s.proteinPerKg), weight = num(s.weight);
    // Kalorien: leer = Vorschlag. Mit Geburtsdatum (Karte „Bedarf schätzen“) die Krick-Schätzung, sonst nach Gewicht
    // (80 kcal/kg, FAO/WHO/UNU 2004, 6–24 Monate); ohne Gewicht 700 kcal.
    const r10 = (v) => Math.round(v / 10) * 10;
    const bd = weight > 0 ? bedarfCalc({ weight }, s) : null;
    const kcalBasis = bd ? "krick" : weight > 0 ? "gewicht" : "ohne";
    const kcalManual = num(s.kcal) > 0;
    const kcalAuto = bd ? r10(bd.krick) : weight > 0 ? r10(weight * 80) : 700;
    const kcal = kcalManual ? num(s.kcal) : kcalAuto;
    const autoProtein = perKg > 0 && weight > 0;
    const eiweiss = autoProtein ? Math.round(weight * perKg) : num(s.eiweiss);
    const mctShare = Math.min(1, Math.max(0, num(s.mctShare)));
    const mctMode = s.mctMode === "kalorien" ? "kalorien" : "verhaeltnis";
    const dampfVerdunstung = num(s.dampfVerdunstung);
    // Rundung beim Abwiegen: alle Zutaten außer Fettträgern fest auf 0,5 g, Wasser auf 1 ml, Fettträger immer 0,1 g.
    const rundung = 0.5;
    // Kalorien-Korridor nach Gewicht: 70–90 kcal/kg (FAO/WHO/UNU 2004, 6–24 Monate). Mit Krick-Schätzung für Kinder,
    // die nicht gehen: Bereich von der ESPGHAN-Faustregel (60 % von gesunden Kindern) bis zum Bedarf gesunder Kinder
    // (FAO/WHO); die Obergrenze bleibt mindestens 10 % über dem Ziel. Das Minimum ist manuell übersteuerbar; ohne
    // Gewicht gilt 85 % des Ziels.
    const kcalBereich = bd && bd.mob !== BD_MOBIL.geht;
    const kcalRichtwert = weight > 0 ? (bd ? r10(bd.krick) : r10(weight * 80)) : null;
    const kcalMaxAuto = kcalBereich ? Math.max(r10(bd.ref), r10(kcal * 1.1)) : weight > 0 ? r10(weight * 90) : null;
    // Automatisches Minimum nie über der Verordnung (sonst wäre jeder Tag „unter dem Minimum“).
    const kcalMinAuto = Math.min(kcalBereich ? r10(bd.lo) : weight > 0 ? r10(weight * 70) : r10(kcal * 0.85), kcal);
    const kcalMin = num(s.kcalMin) > 0 ? num(s.kcalMin) : kcalMinAuto;
    // Flüssigkeit: Richtwert nach Holliday-Segar (100 ml/kg bis 10 kg, dann 50 bzw. 20 ml/kg je weiterem kg);
    // manuell übersteuerbar. Modus: Wasser zwischen den Mahlzeiten sondieren oder in den Mahlzeiten enthalten.
    const hs = (w) => w <= 0 ? 0 : w <= 10 ? 100 * w : w <= 20 ? 1000 + 50 * (w - 10) : 1500 + 20 * (w - 20);
    const fluidAuto = weight > 0 ? r10(hs(weight)) : 0;
    const fluidDay = num(s.fluidMl) > 0 ? num(s.fluidMl) : fluidAuto;
    // Zwei Stellungen: „zwischen“ (Standard; frühere Werte „ausgewogen“/„zwischen“ landen hier) oder „mahlzeit“.
    const wasserModus = s.wasserModus === "mahlzeit" ? "mahlzeit" : "zwischen";
    // Höchstmenge auf einmal (Mahlzeit oder Wassergabe): 25 ml/kg – darüber warnt die App.
    const maxMahlMl = weight > 0 ? r10(weight * 25) : 0;
    // Flüssigkeitsziel je Mahlzeit: nur im Modus „in den Mahlzeiten dabei“ (Tagesbedarf gleich verteilt).
    // Modus „zwischen“: die Mahlzeit behält ihr Rezept-Wasser zum Anrühren, der Rest kommt als Wassergaben (Zeitplan).
    const fluidMahlZiel = wasserModus === "mahlzeit" ? fluidDay / mahl : 0;
    // Energiedichte höchstens (kcal je ml Mahlzeit), nur im Modus „zwischen“: reicht das Rezept-Wasser nicht,
    // wird gerade so weit aufgefüllt. Vorgabe 1,5 kcal/ml (übliche KetoCal-Zubereitungen 1–1,5); 0 = keine Grenze.
    const maxDichte = (s.maxDichte === "" || s.maxDichte == null) ? 1.5 : Math.max(0, num(s.maxDichte));
    return { kcal, kcalAuto, kcalManual, ratio, mahl, eiweiss, autoProtein, proteinPerKg: perKg, proteinStandard: PROTEIN_STANDARD, kcalMahl: kcal / mahl, eiweissMahl: eiweiss / mahl, mctShare, mctMode, dampfVerdunstung, rundung,
      kcalMin, kcalMinMahl: kcalMin / mahl, kcalMinAuto, kcalMinManual: num(s.kcalMin) > 0, kcalRichtwert, kcalMaxAuto, weight,
      kcalBasis, kcalBereich, kcalLoBd: bd ? r10(bd.lo) : null, kcalRefBd: bd ? r10(bd.ref) : null,
      fluidDay, fluidMahl: fluidMahlZiel, fluidAuto, fluidManual: num(s.fluidMl) > 0, wasserModus, maxMahlMl, maxDichte };
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
    // Kleine Mengen nicht grob runden: ändert die Rundung eine Zutat um mehr als 3 % (z. B. 1,3 g → 1,5 g), bleibt
    // sie auf 0,1 g genau – sonst müsste das Fett stark nachgestellt werden und die kcal würden spürbar abweichen.
    const roundSafe = (g, st) => { const r = roundTo(g, st); return (g > 0 && Math.abs(r - g) > g * 0.03) ? roundTo(g, 0.1) : r; };
    const out = items.map((it, i) => {
      if (fatG(i)) return { food: it.food, grams: num(it.grams) };
      return { food: it.food, grams: roundSafe(num(it.grams), /wasser/i.test(it.food) ? 1 : step) };
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
  // Öl als Zutat (Rapsöl, MCT-Öl, Olivenöl …) – nicht Lebensmittel, die nur in Öl liegen („Thunfisch in Öl“)
  // oder entölt sind („Kakaopulver entölt“).
  function isOilName(name) {
    const n = String(name || "");
    return /öl|oil/i.test(n) && !/\bin (öl|oil)\b/i.test(n) && !/entölt/i.test(n);
  }
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
    if (pz < 40) return "zwischen modifizierter MCT-Diät (30 %) und Arbeitsbereich 40–50 %";
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
      // Öl kommt nicht in den Mixer (eigener letzter Schritt „in jede Portion einrühren“); Butter/Obers schon.
      thermomix: sr.thermomix || "Zutaten vorbereiten und mit dem Wasser gemeinsam fein pürieren; Butter, Obers oder Creme gleich mitpürieren (Öl nicht).",
      zubereitung: sr.zubereitung || "Eigenes Rezept – Zutaten vorbereiten und mit dem Wasser fein pürieren; Butter, Obers oder Creme gleich mitpürieren (Öl nicht).",
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

  /* ---------- Wischen in der Rezeptliste: links = nächste Gruppe, rechts = vorige ----------
     Drücken und Ziehen im Bereich der Rezepte (Finger oder Maus) blättert zwischen den Gruppen wie zwischen
     den Blättern der Detailansicht: die Nachbargruppe wird beim Ziehen in eine zweite Fläche gerendert und
     rutscht neben der aktuellen Liste 1:1 mit dem Finger herein; die Chip-Zeile rollt mit, die Markierung springt
     ab halbem Weg auf die Nachbargruppe (wie die Reiter der Detailansicht, ohne Überblenden). Beim Loslassen läuft die Bewegung bis zur Ruhelage
     durch (oder weich zurück). Senkrechtes Wischen bleibt Scrollen; nach einem Zug löst der folgende Klick
     keine Kachel aus. */
  function chipScrollTarget(fb, chip) {
    return Math.max(0, Math.min(fb.scrollWidth - fb.clientWidth, chip.offsetLeft - (fb.clientWidth - chip.offsetWidth) / 2));
  }
  function stepFilter(dir) {
    const cur = FILTERS.findIndex(f => f.id === state.settings.filter);
    const i = Math.min(FILTERS.length - 1, Math.max(0, (cur < 0 ? 0 : cur) + dir));
    if (i === (cur < 0 ? 0 : cur)) return false;
    state.settings.filter = FILTERS[i].id; save();
    const list = document.getElementById("recipe-list");
    renderRezepte();
    // Steht die Liste weiter unten, an den Anfang der neuen Gruppe springen (Chip-Zeile bleibt sichtbar).
    const bar = document.querySelector("#view-rezepte .listbar");
    const top = (bar ? bar.getBoundingClientRect().top : list.getBoundingClientRect().top) + window.scrollY - 8;
    if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
    return true;
  }
  function bindFilterSwipe() {
    const list = document.getElementById("recipe-list"), fb = document.getElementById("filter-bar");
    if (!list || !fb || list.dataset.swipe) return;
    list.dataset.swipe = "1";
    const stage = list.parentElement;
    const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let x0 = 0, y0 = 0, t0 = 0, active = false, horiz = null, dragged = false, busy = false;
    let dir = 0, curChip = null, nextChip = null, s0 = 0, s1 = 0, scrollable = false, peek = null;
    const chips = () => [...fb.querySelectorAll(".chip")];
    const curIdx = () => Math.max(0, FILTERS.findIndex(f => f.id === state.settings.filter));
    // Markierung wie bei den Reitern der Detailansicht: kein Überblenden, sie springt ab halbem Weg auf die
    // Nachbargruppe (und zurück, wenn man wieder zurückzieht).
    let marked = false;
    const mark = (next) => {
      if (next === marked || !curChip || !nextChip) return;
      marked = next;
      curChip.classList.toggle("active", !next); nextChip.classList.toggle("active", next);
    };
    // Seitenbreite: eine Fläche plus Spalt; in Umgebungen ohne Layout (Tests) ein fester Wert
    const W = () => (stage.clientWidth || list.clientWidth || 320) + 24;
    const removePeek = () => { if (peek) { peek.remove(); peek = null; } };
    // Nachbargruppe in die zweite Fläche rendern; ihr Anfang liegt auf Höhe des sichtbaren Ausschnitts
    const buildPeek = (d) => {
      removePeek();
      const f = FILTERS[curIdx() + d]; if (!f) return;
      peek = el("div", { id: "recipe-peek", "aria-hidden": "true" });
      fillRecipeList(peek, f.id, listContext());
      // Ist die Chip-Zeile nach oben weggescrollt, beginnt die Fläche genau dort, wo die neue Liste nach dem
      // Wechsel stehen wird (stepFilter rollt dann zur Chip-Zeile) – so springt beim Übergang nichts.
      const bar = document.querySelector("#view-rezepte .listbar");
      const barTop = bar ? bar.getBoundingClientRect().top : stage.getBoundingClientRect().top;
      peek.style.top = Math.max(0, Math.round(8 - barTop)) + "px";
      stage.appendChild(peek);
    };
    const place = (dx) => {
      list.style.transform = "translateX(" + Math.round(dx) + "px)";
      if (peek) peek.style.transform = "translateX(" + Math.round(dir * W() + dx) + "px)";
    };
    const trans = (t) => { const v = t ? "transform " + t + "ms cubic-bezier(.2,.7,.3,1)" : "none"; list.style.transition = v; if (peek) peek.style.transition = v; };
    const pick = (d) => {
      const all = chips(), cur = curIdx();
      dir = d; marked = false; curChip = all[cur] || null; nextChip = all[cur + d] || null;
      scrollable = fb.clientWidth > 0 && fb.scrollWidth > fb.clientWidth;
      if (scrollable && curChip && nextChip) { s0 = fb.scrollLeft; s1 = chipScrollTarget(fb, nextChip); }
      buildPeek(d);
    };
    const start = (e) => {
      if (busy || (e.button != null && e.button !== 0)) return;
      x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); active = true; horiz = null; dragged = false; dir = 0;
      trans(0);
    };
    const move = (e) => {
      if (!active) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (horiz === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) horiz = Math.abs(dx) > Math.abs(dy) * 1.3;
      if (!horiz) { list.style.transform = ""; return; }
      dragged = true;
      const d = dx < 0 ? 1 : -1;
      if (d !== dir) { mark(false); pick(d); trans(0); }
      const blocked = !nextChip, p = blocked ? 0 : Math.min(1, Math.abs(dx) / W());
      // Beide Flächen ziehen 1:1 mit; am Rand (keine weitere Gruppe) nur ein kurzer Widerstand
      place(blocked ? dx * 0.1 : dx);
      // Chip-Zeile rollt proportional mit; die Markierung springt ab halbem Weg
      if (scrollable && nextChip) fb.scrollLeft = s0 + (s1 - s0) * p;
      mark(p > 0.5);
      if (e.cancelable && e.type === "touchmove") e.preventDefault();
    };
    const finish = (d, dx) => {
      const w = W(), rest = Math.max(0, w - Math.abs(dx));
      const t = reduced() ? 0 : Math.round(Math.min(280, Math.max(120, rest * 0.6)));
      busy = true;
      // Beide Flächen laufen bis zur Ruhelage weiter; Markierung sitzt auf der Nachbargruppe, Chip-Zeile rollt nach
      trans(t); place(-d * w);
      mark(true);
      if (scrollable && nextChip) { if (fb.scrollTo) fb.scrollTo({ left: s1, behavior: t ? "smooth" : "auto" }); else fb.scrollLeft = s1; }
      setTimeout(() => {
        // Dann wird die Nachbargruppe zur echten Liste (gleicher Inhalt, kein sichtbarer Sprung)
        trans(0); list.style.transform = "";
        stepFilter(d);
        removePeek();
        list.style.transition = ""; busy = false;
      }, t + 20);
    };
    const cancel = () => {
      const t = reduced() ? 0 : 200;
      busy = true;
      trans(t); place(0);
      mark(false);
      if (scrollable && nextChip) { if (fb.scrollTo) fb.scrollTo({ left: s0, behavior: t ? "smooth" : "auto" }); else fb.scrollLeft = s0; }
      setTimeout(() => { trans(0); list.style.transform = ""; removePeek(); list.style.transition = ""; busy = false; }, t + 20);
    };
    const end = (e) => {
      if (!active) return; active = false;
      const dx = e.clientX - x0, dy = e.clientY - y0, dt = Date.now() - t0;
      if (!horiz) { list.style.transition = ""; list.style.transform = ""; removePeek(); return; }
      const flick = dt < 300 && Math.abs(dx) > 30;
      const go = (Math.abs(dx) > W() * 0.3 || flick) && Math.abs(dx) > Math.abs(dy) * 1.3;
      if (go && nextChip) finish(dir, dx); else cancel();
    };
    list.addEventListener("pointerdown", start);
    list.addEventListener("pointermove", move);
    list.addEventListener("pointerup", end);
    list.addEventListener("pointercancel", end);
    list.addEventListener("pointerleave", (e) => { if (active && e.pointerType === "mouse") end(e); });
    // Nach einem Zug den Klick auf die Kachel schlucken (sonst öffnet sich beim Loslassen ein Rezept)
    list.addEventListener("click", (e) => { if (dragged) { dragged = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // Was die Liste außer der Gruppe noch bestimmt: Vorgaben, Suchtext, Schalter, Sortierung
  function listContext() {
    const s = state.settings, sq = document.getElementById("recipe-search");
    return { d: derived(), q: ((sq || {}).value || "").trim().toLowerCase(), onlyQuelle: !!s.onlyQuelle, hideKeto: !!s.hideKeto, sort: s.sort || "kategorie" };
  }
  // Baut die Kacheln einer Gruppe in einen Behälter (echte Liste oder Nachbarfläche beim Wischen).
  // Jedes Rezept ist ein Eintrag – mit oder ohne KetoCal. Gerichte in beiden Fettbasen erscheinen zweimal
  // (gleicher Name, Schild zeigt die Fettbasis). Rezepte, die das Verhältnis nicht erreichen, entfallen.
  function fillRecipeList(list, filter, ctx) {
    const { d, q, onlyQuelle, hideKeto, sort } = ctx;
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

    list.innerHTML = "";
    if (entries.length === 0) {
      // Suche in einer Gruppe ohne Treffer: Hinweis mit Knopf „in allen Gruppen suchen“
      const box = el("div", { class: "card empty" }, q && filter !== "alle" ? "Keine Treffer in dieser Gruppe. " : "Keine Gerichte für diese Auswahl.");
      if (q && filter !== "alle") {
        const b = el("button", { type: "button", class: "linkbtn" }, "In allen Gruppen suchen");
        b.addEventListener("click", () => { state.settings.filter = "alle"; save(); renderRezepte(); });
        box.appendChild(b);
      }
      list.appendChild(box);
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

  /* ---------- Rezepte rendern ---------- */
  function renderRezepte() {
    const s = state.settings;
    const $ = id => document.getElementById(id);
    // Felder nie überschreiben, während darin getippt wird – sonst verschwindet z. B. das Komma bei „8,5".
    const put = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
    document.querySelectorAll("#mahlzeiten-ctl button[data-mahl]").forEach(b => b.classList.toggle("active", num(b.dataset.mahl) === mahlCount(s)));
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
    src("kcal", d.kcalManual, d.kcalBasis === "krick" ? "Vorschlag · Krick" : d.weight > 0 ? "Vorschlag · 80 kcal/kg" : "Vorgabe ohne Gewicht", "↺ Vorschlag " + fmt(d.kcalAuto, 0));
    put("set-kcalmin", d.kcalMinManual ? s.kcalMin : d.kcalMinAuto);
    src("kcalmin", d.kcalMinManual, d.kcalBereich ? "Vorschlag · ESPGHAN 60 %" : d.weight > 0 ? "Vorschlag · 70 kcal/kg" : "Vorschlag · 85 % des Ziels", "↺ Vorschlag " + fmt(d.kcalMinAuto, 0));
    put("set-fluid", d.fluidManual ? s.fluidMl : (d.fluidAuto > 0 ? d.fluidAuto : ""));
    $("set-fluid").placeholder = d.fluidAuto > 0 ? "" : "ml/Tag (Gewicht eintragen)";
    src("fluid", d.fluidManual, d.fluidAuto > 0 ? "Vorschlag · 100 ml/kg" : "kein Vorschlag ohne Gewicht", "↺ Vorschlag " + fmt(d.fluidAuto, 0));
    // Energiedichte (nur Modus „zwischen“; im anderen Modus ausgegraut, das Feld bleibt an seinem Platz)
    {
      const on = d.wasserModus === "zwischen", el2 = $("set-dichte"), manual = !(s.maxDichte === "" || s.maxDichte == null) && num(s.maxDichte) !== 1.5;
      put("set-dichte", on ? fmtNum(d.maxDichte) : "");
      if (el2) { el2.disabled = !on; el2.placeholder = on ? "1,5" : "– (alles in den Mahlzeiten)"; }
      src("dichte", on && manual, on ? "Vorgabe" : "nicht nötig", "↺ 1,5");
    }
    // Eiweiß: das Ergebnis (g/Tag) steht in der Zeile unter der Auswahl; das Gramm-Feld erscheint nur bei „manuell“.
    put("set-eiweiss", d.autoProtein ? d.eiweiss : s.eiweiss);
    const em = $("eiweiss-manual"); if (em) em.hidden = d.autoProtein;
    {
      const sp = $("src-protein"), bt = $("reset-protein"), isStd = d.proteinPerKg === d.proteinStandard, hasW = num(s.weight) > 0;
      const txt = d.autoProtein ? (hasW ? (isStd ? "✓ Standard · " : "") + fmt(d.eiweiss, 0) + " g/Tag" : "Gewicht eintragen") : "eigener Wert";
      if (sp) { sp.textContent = txt; sp.classList.toggle("auto", d.autoProtein && isStd && hasW); }
      if (bt) { bt.hidden = isStd; bt.textContent = "↺ Standard " + fmt(d.proteinStandard, 1) + " g/kg"; }
    }
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
    const prevScroll = fb.scrollLeft;
    fb.innerHTML = "";
    let activeChip = null;
    FILTERS.forEach(f => {
      const chip = el("button", { class: "chip" + (f.id === filter ? " active" : "") }, f.label);
      chip.addEventListener("click", () => { state.settings.filter = f.id; save(); renderRezepte(); });
      fb.appendChild(chip);
      if (f.id === filter) activeChip = chip;
    });
    if (activeChip && fb.clientWidth > 0 && fb.scrollWidth > fb.clientWidth) {
      // Position behalten und weich zum aktiven Chip rollen (beim ersten Aufbau direkt hinsetzen)
      const target = chipScrollTarget(fb, activeChip);
      fb.scrollLeft = prevScroll;
      if (fb.dataset.ready && fb.scrollTo && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) fb.scrollTo({ left: target, behavior: "smooth" });
      else fb.scrollLeft = target;
    }
    fb.dataset.ready = "1";
    const oq = $("only-quelle"); if (oq) oq.checked = onlyQuelle;
    const hk = $("hide-keto"); if (hk) hk.checked = hideKeto;
    const mt = $("more-toggle"); if (mt) mt.classList.toggle("open", onlyQuelle || hideKeto || (s.sort && s.sort !== "kategorie") || !$("more-row").hidden);
    const stg = $("search-toggle"); if (stg) stg.classList.toggle("open", !!q || !$("search-row").hidden);

    const sort = s.sort || "kategorie";
    $("sort-select").value = sort;
    fillRecipeList($("recipe-list"), filter, { d, q, onlyQuelle, hideKeto, sort });
  }

  /* ---------- Kopfzeile, Bereiche (Tabs), Vorgaben ---------- */
  const VIEWS = ["heute", "rezepte", "vorgaben"];
  function showView(name) {
    if (VIEWS.indexOf(name) === -1) name = "rezepte";
    state.settings.view = name; save();
    document.body.setAttribute("data-view", name);
    VIEWS.forEach(v => {
      const sec = document.getElementById("view-" + v); if (sec) sec.hidden = v !== name;
    });
    document.querySelectorAll(".tabbar button[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    if (name === "heute" && typeof renderHeute === "function") renderHeute();
    try { window.scrollTo(0, 0); } catch (e) {}
    if (typeof markChip === "function") markChip();
  }
  // Merkt sich, von wo die Pille in die Vorgaben geführt hat – ein zweiter Tipp führt zurück.
  let chipReturn = null;
  function markChip() {
    const chip = document.getElementById("rx-chip"); if (!chip) return;
    const back = (state.settings.view === "vorgaben") && !!chipReturn;
    chip.classList.toggle("back", back);
    chip.title = back ? "Zurück zu " + ({ heute: "Heute", rezepte: "Rezepte" }[chipReturn.view] || "vorher") : "Aktive Vorgaben – tippen zum Ändern";
  }
  // Verordnungs-Chip: zeigt immer, womit gerade gerechnet wird.
  function renderHeader(d) {
    if (typeof schedulePushSync === "function") schedulePushSync(); // Erinnerungen an geänderten Plan angleichen
    const chip = document.getElementById("rx-chip"); if (!chip) return;
    // Zeile 1: Verordnung. Zeile 2: Flüssigkeit – Ziel, Modus und (laut Tagesplan) die Menge zwischen den Mahlzeiten.
    const l1 = fmtTarget(d.ratio) + " · " + fmt(d.kcalMahl, 0) + " kcal × " + d.mahl +
      (d.mctShare > 0 ? " · MCT " + Math.round(d.mctShare * 100) + " % " + (d.mctMode === "kalorien" ? "🎯" : "⚖️") : "");
    let l2 = "";
    if (d.fluidDay > 0) {
      l2 = "💧 " + fmt(d.fluidDay, 0) + " ml/Tag · ";
      if (d.wasserModus === "mahlzeit") l2 += "alles in den Mahlzeiten (je " + fmt(d.fluidMahl, 0) + " ml)";
      else {
        // Wassergaben laut Zeitplan (offene Mahlzeiten geschätzt); ⚠️ wenn eine Gabe über der Höchstmenge liegt.
        const wg = waterGiftsText(d);
        l2 += "Wasser zwischen den Mahlzeiten: " + (wg.wp.per > 0 ? (wg.est ? "≈ " : "") + wg.text : "keines nötig");
        if (wg.wp.over) l2 += " · ⚠️ zu viel auf einmal";
      }
    }
    // Kurzfassung für die schmale Pille am Handy (eine Zeile Verordnung, eine Zeile Flüssigkeit).
    // Drei kurze Zeilen: Verordnung · MCT + Tagesziel · Wasser zwischen/in den Mahlzeiten (⚠️ = zu viel auf einmal).
    const s1 = fmtTarget(d.ratio) + " · " + fmt(d.kcalMahl, 0) + " kcal × " + d.mahl;
    let s2 = d.mctShare > 0 ? "MCT " + Math.round(d.mctShare * 100) + " %" : "", s3 = "";
    if (d.fluidDay > 0) {
      s2 += (s2 ? " · " : "") + "💧 " + fmt(d.fluidDay, 0) + " ml/Tag";
      if (d.wasserModus === "mahlzeit") s3 = "je " + fmt(d.fluidMahl, 0) + " ml in der Mahlzeit";
      else { const wg = waterGiftsText(d); s3 = wg.wp.per > 0 ? "Wasser " + (wg.est ? "≈ " : "") + wg.text : "kein Wasser extra"; }
      if (/⚠️/.test(l2)) s3 += " ⚠️";
    }
    chip.innerHTML = '<span class="rx-line rx-long">' + escapeHtml(l1) + "</span>" + (l2 ? '<span class="rx-line rx-sub rx-long">' + escapeHtml(l2) + "</span>" : "") +
      '<span class="rx-line rx-short">' + escapeHtml(s1) + "</span>" + [s2, s3].map((t, k) => t ? '<span class="rx-line rx-sub rx-short' + (k === 1 ? ' rx-s3' : '') + '">' + escapeHtml(t) + "</span>" : "").join("");
  }
  function regelLabel(d) { return d.mctMode === "kalorien" ? "🎯 Kalorien halten" : "⚖️ Verhältnis halten"; }
  function renderVorgaben(d) {
    const s = state.settings;
    if (typeof renderPushCard === "function") renderPushCard();
    if (typeof renderSyncCard === "function") renderSyncCard();
    if (typeof renderBedarf === "function") renderBedarf(d);
    // Richtung des Verhältnisses klarstellen: Fett zuerst. „1,5“ = 1,5:1 (mehr Fett), „1:1,5“ = 0,67 (weniger Fett).
    // Die Warnung steht in der Zusammenfassung, nicht im Feldraster – dort darf sich nichts verschieben.
    const ratioWarn = d.ratio < 1
      ? '<div id="ratio-hint" class="note warn">⚠️ ' + fmtTarget(d.ratio) + " heißt nur " + fmt(d.ratio, 2) + " g Fett je 1 g Eiweiß+KH – <strong>weniger Fett als Eiweiß+KH</strong>, also unterhalb von 1:1. Das ist beim Ausschleichen möglich, bitte prüfen, ob die Verordnung wirklich so lautet.</div>"
      : "";
    // Zusammenfassung als Kennzahl-Kacheln: Bezeichnung, Wert, kurze Herkunft (Details im title).
    const fact = (k, label, value, sub, title) => '<div class="vg-fact" data-k="' + k + '"' + (title ? ' title="' + escapeHtml(title) + '"' : "") +
      "><small>" + label + "</small><b>" + value + "</b><span>" + sub + "</span></div>";
    const sum = document.getElementById("verordnung-summary");
    if (sum) {
      const kcalSrc = d.kcalManual ? "manuell" : d.kcalBasis === "krick" ? "Vorschlag nach Krick" : d.weight > 0 ? "Vorschlag 80 kcal/kg" : "Vorgabe ohne Gewicht";
      const minSrc = d.kcalMinManual ? "manuell" : d.kcalBereich ? "ESPGHAN 60 %" : d.weight > 0 ? "70 kcal/kg" : "85 % des Ziels";
      const facts = [
        fact("mahl", "pro Mahlzeit", fmt(d.kcalMahl, 0) + " kcal", fmt(d.kcal, 0) + " kcal/Tag ÷ " + d.mahl, fmt(d.kcal, 0) + " kcal/Tag (" + kcalSrc + ") ÷ " + d.mahl + " Mahlzeiten"),
        fact("min", "mindestens", fmt(d.kcalMinMahl, 0) + " kcal", "je Mahlzeit · " + fmt(d.kcalMin, 0) + " kcal/Tag", fmt(d.kcalMin, 0) + " kcal/Tag (" + minSrc + ")"),
        fact("eiweiss", "Eiweiß", fmt(d.eiweissMahl) + " g", "je Mahlzeit · " + (d.autoProtein ? fmt(d.eiweiss, 0) + " g/Tag" : "manuell"),
          d.autoProtein ? fmt(d.eiweiss, 0) + " g/Tag, " + fmt(d.proteinPerKg, 1) + " g/kg" + (d.proteinPerKg === d.proteinStandard ? " = Standard" : "") : "manuell vorgegeben")
      ];
      if (d.kcalBereich) facts.push(fact("bereich", "Bereich laut Schätzungen", fmt(d.kcalLoBd, 0) + "–" + fmt(d.kcalRefBd, 0), "kcal/Tag · ESPGHAN–FAO/WHO", "von der ESPGHAN-Faustregel (60 %) bis zum Bedarf gesunder Kinder (FAO/WHO) – siehe Bedarf schätzen"));
      else if (d.kcalRichtwert) facts.push(fact("bereich", "Korridor nach Gewicht", fmt(d.kcalMinAuto, 0) + "–" + fmt(d.kcalMaxAuto, 0), "kcal/Tag · 70–90 kcal/kg", "Richtwert nach Körpergewicht: 70–90 kcal/kg"));
      sum.innerHTML = ratioWarn + '<div class="vg-facts">' + facts.join("") + "</div>";
    }
    // Flüssigkeit: Modus-Buttons und Zusammenfassung
    document.querySelectorAll("#wasser-modus-ctl button[data-wmodus]").forEach(b =>
      b.classList.toggle("active", b.dataset.wmodus === d.wasserModus));
    const fs = document.getElementById("fluid-summary");
    if (fs) {
      if (!(d.fluidDay > 0)) fs.innerHTML = '<div class="note info">Kein Flüssigkeitsziel – Körpergewicht eintragen oder ml/Tag vorgeben.</div>';
      else {
        const maxF = d.maxMahlMl > 0 ? fact("max", "höchstens auf einmal", fmt(d.maxMahlMl, 0) + " ml", "25 ml/kg", "mehr auf einmal verträgt der Magen oft schlecht") : "";
        if (d.wasserModus === "mahlzeit") {
          fs.innerHTML = '<div class="vg-facts">' + fact("gabe", "in jeder Mahlzeit", fmt(d.fluidMahl, 0) + " ml", fmt(d.fluidDay, 0) + " ml/Tag ÷ " + d.mahl,
            fmt(d.fluidDay, 0) + " ml/Tag" + (d.fluidManual ? " (manuell)" : " (Vorschlag, Holliday-Segar)") + " ÷ " + d.mahl + " Mahlzeiten") + maxF + "</div>" +
            '<p class="vg-more">Kein Wasser zwischen den Mahlzeiten nötig.</p>';
        } else {
          const wg = waterGiftsText(d);
          fs.innerHTML = '<div class="vg-facts">' + fact("gabe", "Wassergaben", wg.wp.per > 0 ? (wg.est ? "≈ " : "") + wg.text : "keine", wg.wp.per > 0 ? "zwischen den Mahlzeiten" : "derzeit nicht nötig",
              fmt(d.fluidDay, 0) + " ml/Tag" + (d.fluidManual ? " (manuell)" : " (Vorschlag, Holliday-Segar)") + " abzüglich des Wassers in den Mahlzeiten") + maxF + "</div>" +
            '<p class="vg-more">Die Mahlzeit bekommt nur ihr Rezept-Wasser zum Pürieren bzw. Anrühren. Uhrzeiten unter Heute → ⏰.</p>';
        }
      }
    }
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
    document.querySelectorAll("#theme-ctl button[data-theme]").forEach(b =>
      b.classList.toggle("active", b.dataset.theme === themeSetting()));
  }
  // Darstellung: „auto“ folgt dem Gerät (prefers-color-scheme), „light“/„dark“ erzwingen per data-theme am <html>.
  function themeSetting() { const t = state.settings.theme; return t === "light" || t === "dark" ? t : "auto"; }
  function applyTheme() {
    const t = themeSetting(), root = document.documentElement;
    if (t === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
    // Farbe der Statusleiste am Handy mitziehen (bei „auto“ entscheiden die media-Attribute der beiden Meta-Tags).
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
      if (t === "auto") { if (m.dataset.orig) m.setAttribute("content", m.dataset.orig); return; }
      if (!m.dataset.orig) m.dataset.orig = m.getAttribute("content");
      m.setAttribute("content", t === "dark" ? "#1a2320" : "#ffffff");
    });
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
    state = load(JSON.stringify(st)); const stored = save();
    rebuildFoodIndex(); renderRezepte(); showView(state.settings.view || "rezepte");
    alert(stored ? "Backup importiert." : "Backup übernommen – aber der Speicher dieses Browsers ist nicht beschreibbar (privates Fenster oder voll). Nach dem Schließen ist es wieder weg.");
  }

  function bindSettingsBar() {
    const map = { "set-kcal": "kcal", "set-kcalmin": "kcalMin", "set-fluid": "fluidMl", "set-eiweiss": "eiweiss", "set-weight": "weight", "set-mct-fett": "mctFett100", "set-mct-kcal": "mctKcal100", "set-verdunstung": "dampfVerdunstung" };
    Object.keys(map).forEach(id => {
      const elx = document.getElementById(id); if (!elx) return;
      elx.addEventListener("input", e => {
        let v = num(e.target.value);
        // Vorschlags-Felder: nur ein leeres Feld heißt wieder „automatisch“. Ein eingetippter Wert bleibt fest,
        // auch wenn er zufällig dem Vorschlag entspricht (sonst würde er sich beim Ändern des Gewichts still mitändern).
        const isAutoField = id === "set-kcal" || id === "set-kcalmin" || id === "set-fluid";
        if (isAutoField && e.target.value.trim() === "") v = "";
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
    document.querySelectorAll(".tabbar button[data-view]").forEach(b => b.addEventListener("click", () => { chipReturn = null; showView(b.dataset.view); }));
    // Pille: öffnet die Vorgaben; ein zweiter Tipp führt dorthin zurück, wo man war (inkl. Scrollposition).
    const chip = document.getElementById("rx-chip");
    if (chip) chip.addEventListener("click", () => {
      const cur = state.settings.view || "rezepte";
      if (cur === "vorgaben" && chipReturn) {
        const back = chipReturn; chipReturn = null;
        showView(back.view);
        try { window.scrollTo(0, back.y); } catch (e) {}
      } else if (cur !== "vorgaben") {
        chipReturn = { view: cur, y: window.pageYOffset || document.documentElement.scrollTop || 0 };
        showView("vorgaben");
      }
      markChip();
    });
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
    document.querySelectorAll("#theme-ctl button[data-theme]").forEach(b =>
      b.addEventListener("click", () => { state.settings.theme = b.dataset.theme; save(); applyTheme(); renderRezepte(); }));
    const di = document.getElementById("set-dichte");
    if (di) di.addEventListener("input", () => {
      const v = parseFloat(String(di.value).replace(",", "."));
      if (di.value.trim() === "") state.settings.maxDichte = "";
      else if (isFinite(v) && v >= 0) state.settings.maxDichte = v === 1.5 ? "" : v;
      else return;
      save(); renderRezepte();
    });
    document.querySelectorAll("#mahlzeiten-ctl button[data-mahl]").forEach(b =>
      b.addEventListener("click", () => { state.settings.mahlzeiten = num(b.dataset.mahl); save(); renderRezepte(); }));
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
    const pState = proteinState(sum.eiweiss, d.eiweissMahl);
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
        '<span class="prot-' + pState + '"' + (pState === "high" ? ' title="mehr als das Doppelte des Eiweiß-Ziels"' : "") + '>Eiweiß ' + fmt(sum.eiweiss) + " g" + (pState === "high" ? " ↑" : "") + "</span>" +
      "</div></div>" +
      '<button class="favbtn' + (fav ? " on" : "") + '" title="Favorit">' + (fav ? "★" : "☆") + "</button>" +
      '<span class="tile-chev" aria-hidden="true">›</span>';
    const open = () => openRecipeDetail(rec);
    tile.addEventListener("click", open);
    tile.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    tile.querySelector(".favbtn").addEventListener("click", e => { e.stopPropagation(); toggleFav(rec); renderRezepte(); });
    return tile;
  }

  /* ---------- Bedarf schätzen (Vorgaben) ----------
     Orientierung für das Gespräch mit dem Team – ändert die Verordnung nicht. Aus Geburtsdatum (Alter läuft
     automatisch mit), Geschlecht, Gewicht, Bewegung und Muskelspannung:
       · Grundumsatz nach Schofield 1985 (nur Gewicht)
       · Schätzung nach Krick 1992: Grundumsatz × Muskelspannung × Bewegung + 5 kcal je g gewünschter Zunahme
       · 60–70 % des Bedarfs gesund entwickelter Kinder (ESPGHAN 2017 für Kinder, die nicht gehen)
       · Bedarf gesund entwickelter Kinder nach FAO/WHO/UNU 2004 (kcal/kg je Lebensjahr) */
  const BD_MOBIL = { geht: [1.3, "geht", "geht"], krabbelt: [1.25, "krabbelt", "krabbelt"], getragen: [1.2, "getragen / Rollstuhl", "getragen wird oder im Rollstuhl sitzt"], liegt: [1.15, "liegt viel", "viel liegt"] };
  const BD_TONUS = { schlaff: [0.9, "schlaffer"], normal: [1.0, "normaler"], erhoeht: [1.1, "erhöhter"] };
  // FAO/WHO/UNU 2004, kcal/kg/Tag für das 2. bis 10. Lebensjahr (Index = volle Jahre 1…9); unter 1 Jahr 80 kcal/kg
  const BD_FAO = { m: [null, 82.4, 83.6, 79.7, 76.8, 74.5, 72.5, 70.5, 68.5, 66.6], w: [null, 80.1, 80.6, 76.5, 73.9, 71.5, 69.3, 66.7, 63.8, 60.8] };
  function bdAgeMonths(iso, now) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); if (!m) return null;
    const b = new Date(+m[1], +m[2] - 1, +m[3]), n = now || new Date();
    let mo = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
    if (n.getDate() < b.getDate()) mo--;
    return mo >= 0 && mo < 18 * 12 ? mo : null;
  }
  function bdAgeText(mo) { const y = Math.floor(mo / 12), r = mo % 12; return (y ? y + " J" : "") + (y && r ? " " : "") + (r || !y ? r + " M" : ""); }
  function schofield(sex, years, kg) {
    if (years < 3) return sex === "m" ? 59.512 * kg - 30.4 : 58.317 * kg - 31.1;
    if (years < 10) return sex === "m" ? 22.706 * kg + 504.3 : 20.315 * kg + 485.9;
    return sex === "m" ? 17.686 * kg + 658.2 : 13.384 * kg + 692.6;
  }
  function faoPerKg(sex, years) { if (years < 1) return 80; const t = BD_FAO[sex === "m" ? "m" : "w"]; return t[Math.min(9, Math.floor(years))]; }
  function proteinRef(years) { return years < 2 ? 1.1 : years < 4 ? 1.0 : 0.9; } // g/kg/Tag, Richtwert (EFSA)
  // Alle Kennzahlen; null, wenn Geburtsdatum oder Gewicht fehlen
  function bedarfCalc(d, s, now) {
    const mo = bdAgeMonths(s.bdBirth, now), kg = d.weight;
    if (mo == null || !(kg > 0)) return null;
    const years = mo / 12, sex = s.bdSex === "m" ? "m" : "w";
    const mob = BD_MOBIL[s.bdMobil] || BD_MOBIL.liegt, ton = BD_TONUS[s.bdTonus] || BD_TONUS.normal;
    const gain = s.bdGain == null ? 5 : num(s.bdGain);
    const bmr = schofield(sex, years, kg);
    const krick = bmr * ton[0] * mob[0] + 5 * gain;
    const ref = faoPerKg(sex, years) * kg;
    // Formelwechsel am 3. Geburtstag: Schätzung springt (gleiches Gewicht) – Hinweis im Vierteljahr davor/danach
    const jump = (mo >= 33 && mo < 39) ? Math.round((schofield(sex, 3.5, kg) / schofield(sex, 2.5, kg) - 1) * 100) : 0;
    return { mo, years, sex, kg, mob, ton, gain, bmr, krick, ref, lo: ref * 0.6, hi: ref * 0.7, jump, protRef: proteinRef(years) };
  }
  function renderBedarf(d) {
    const out = document.getElementById("bd-out"); if (!out) return;
    const s = state.settings;
    const put = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; };
    put("bd-birth", s.bdBirth || ""); put("bd-mobil", s.bdMobil || "liegt"); put("bd-tonus", s.bdTonus || "normal");
    put("bd-sex", s.bdSex === "m" ? "m" : "w");
    document.querySelectorAll("#bd-gain button").forEach(b => b.classList.toggle("active", num(b.dataset.gain) === (s.bdGain == null ? 5 : num(s.bdGain))));
    const r = bedarfCalc(d, s);
    const age = document.getElementById("bd-age"); if (age) age.textContent = r ? bdAgeText(r.mo) : "";
    if (!r) { out.innerHTML = '<div class="note info">' + (!(d.weight > 0) ? "Körpergewicht eintragen (oben bei der Verordnung)." : "Geburtsdatum eintragen – das Alter rechnet die App dann selbst mit.") + "</div>"; return; }
    // Skala mit drei Einordnungen, jede mit Herkunft in der Legende darunter: Krick (persönliche Schätzung),
    // Faustregel 60–70 % (ESPGHAN, nur für Kinder, die nicht gehen) und gesunde Gleichaltrige (FAO/WHO).
    const prot = d.weight > 0 ? d.eiweiss / d.weight : 0;
    const walks = r.mob === BD_MOBIL.geht;
    const lo = Math.min(walks ? r.ref : r.lo, r.krick) * 0.88, hi = Math.max(r.ref, r.krick) * 1.08;
    const p = (v) => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
    // Beschriftung am Rand nicht abschneiden: ganz links linksbündig, ganz rechts rechtsbündig
    const lab = (cls, v, html) => { const x = p(v); return '<span class="lab ' + cls + '" style="left:' + x.toFixed(1) + "%;transform:translateX(" + (x < 14 ? "0" : x > 86 ? "-100%" : "-50%") + ')">' + html + "</span>"; };
    const kg = (v) => fmt(v / r.kg, 0) + "/kg";
    out.innerHTML =
      '<div class="bd-main"><div class="bd-scale" aria-hidden="true"><span class="axis"></span>' +
        (walks ? "" : '<span class="band" style="left:' + p(r.lo).toFixed(1) + "%;width:" + (p(r.hi) - p(r.lo)).toFixed(1) + '%"></span>' +
          lab("below", (r.lo + r.hi) / 2, "<b>" + fmt(r.lo, 0) + "–" + fmt(r.hi, 0) + "</b>ESPGHAN")) +
        '<span class="mk ref" style="left:' + p(r.ref).toFixed(1) + '%"></span>' + lab("below", r.ref, "<b>" + fmt(r.ref, 0) + "</b>FAO/WHO") +
        '<span class="mk krick" style="left:' + p(r.krick).toFixed(1) + '%"></span>' + lab("above krick", r.krick, "Krick <b>" + fmt(r.krick, 0) + " kcal</b>") +
        "</div>" +
        '<ul class="bd-legend">' +
          '<li><i class="sw krick"></i><b>Krick-Formel (1992): ' + fmt(r.krick, 0) + " kcal</b> (" + kg(r.krick) + ") – Schätzung für euer Kind aus Gewicht, Alter und Geschlecht, bei „" + escapeHtml(r.mob[1]) + "“ und " + r.ton[1] + " Muskelspannung</li>" +
          (walks ? "" : '<li><i class="sw band"></i><b>ESPGHAN-Leitlinie (2017): ' + fmt(r.lo, 0) + "–" + fmt(r.hi, 0) + " kcal</b> – Faustregel für Kinder, die nicht gehen: 60–70 % von gesunden Kindern; rechnet nur mit dem Alter</li>") +
          '<li><i class="sw ref"></i><b>FAO/WHO (2004): ' + fmt(r.ref, 0) + " kcal</b> (" + kg(r.ref) + ") – Bedarf gesunder Kinder gleichen Alters, ohne Einschränkung</li>" +
        "</ul>" +
        '<div class="bd-s bd-m">Keine feste Empfehlung – solche Formeln liegen oft 20–40 % daneben. Wie viel euer Kind braucht, legt das Team nach dem Wachstum fest.</div></div>' +
      '<p class="bd-one">🥚 Eiweiß ' + fmt(prot, 1) + " g/kg " + (prot >= r.protRef - 0.005
        ? '<span class="ok">✓ ausreichend</span> <small>(Richtwert ≈ ' + fmt(r.protRef, 1) + ")</small>"
        : '<span class="warn-t">⚠️ unter dem Richtwert (≈ ' + fmt(r.protRef, 1) + ") – mit dem Team besprechen</span>") + "</p>" +
      (d.kcal < r.ref * 0.7 ? '<p class="bd-one">💊 Verordnung unter 70 % von Gleichaltrigen – Vitamine/Mineralstoffe mit dem Team abklären.</p>' : "") +
      (r.jump ? '<p class="bd-one">ℹ️ Am 3. Geburtstag wechselt die Formel – die Schätzung springt um etwa ' + r.jump + " %.</p>" : "");
  }
  function bindBedarf() {
    const birth = document.getElementById("bd-birth"); if (!birth) return;
    // Alles neu zeichnen: die Krick-Schätzung ist auch der Kalorien-Vorschlag in der Verordnung
    const set = (k, v) => { state.settings[k] = v; save(); renderRezepte(); };
    birth.addEventListener("change", () => set("bdBirth", birth.value));
    document.getElementById("bd-mobil").addEventListener("change", (e) => set("bdMobil", e.target.value));
    document.getElementById("bd-tonus").addEventListener("change", (e) => set("bdTonus", e.target.value));
    document.getElementById("bd-sex").addEventListener("change", (e) => set("bdSex", e.target.value));
    document.querySelectorAll("#bd-gain button").forEach(b => b.addEventListener("click", () => set("bdGain", num(b.dataset.gain))));
  }

  /* ---------- Detailansicht (Overlay) ---------- */
  // Blätter der Detailansicht in Reihenfolge: Mahlzeit (eine Portion), Tag (Zubereitungsmenge, intern „abwiegen“),
  // Anpassen, Kochen (intern „zubereitung“).
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
    // Portion angepasst (Blatt Mahlzeit): ein Wert wurde händisch geändert, alle Zutaten skalieren proportional mit
    // (je Rezept gemerkt). Das Verhältnis bleibt, kcal je Mahlzeit ändern sich – Tagesplan und Blatt Tag rechnen damit.
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
    // Modus „zwischen“ (fluidMahl = 0): die Mahlzeit behält ihr Rezept-Wasser, der Rest kommt als Wassergaben.
    let fluidAdjusted = false, waterCapped = false;
    if (d.fluidMahl > 0 && !hasWaterOverride) {
      const isW2 = (it) => /wasser/i.test(it.food);
      const foodFluid = fluidOf(res.items.filter(it => !isW2(it)));
      const stdWater = res.items.filter(isW2).reduce((a, it) => a + num(it.grams), 0);
      const need = d.fluidMahl - foodFluid;
      if (need > stdWater + 0.05) {
        const items3 = stdWater > 0
          ? res.items.map(it => isW2(it) ? { food: it.food, grams: round1(num(it.grams) * need / stdWater) } : it)
          : res.items.concat([{ food: "Wasser", grams: round1(need) }]);
        res = Object.assign({}, res, { items: items3 });
        fluidAdjusted = true;
      }
    }
    // Modus „zwischen“: Rezept-Wasser bleibt, außer die Mahlzeit wäre dichter als erlaubt (kcal je ml) – dann gerade so
    // viel Wasser dazu, dass die Grenze eingehalten ist. Gemerktes Wasser hat Vorrang.
    let densityAdjusted = false;
    if (d.wasserModus === "zwischen" && d.maxDichte > 0 && !hasWaterOverride) {
      const isW3 = (it) => /wasser/i.test(it.food);
      const kcalM = sumMacros(res.items).kcal, vol = volumeMl(res.items), minVol = kcalM / d.maxDichte;
      if (vol < minVol - 0.5) {
        const add = minVol - vol, stdW = res.items.filter(isW3).reduce((a, it) => a + num(it.grams), 0);
        const items4 = stdW > 0
          ? res.items.map(it => isW3(it) ? { food: it.food, grams: round1(num(it.grams) * (stdW + add) / stdW) } : it)
          : res.items.concat([{ food: "Wasser", grams: round1(add) }]);
        res = Object.assign({}, res, { items: items4 });
        densityAdjusted = true;
      }
    }
    // Zum Schluss: Rundung fürs Abwiegen (fest 0,5 g / Wasser 1 ml), Verhältnis über die Fettträger nachgestellt.
    {
      const itemsR = roundForScale(res.items, d.rundung);
      const smR = sumMacros(itemsR);
      res = Object.assign({}, res, { items: itemsR, ratio: ratioOf(smR), kcal: smR.kcal });
    }
    const fluid = fluidOf(res.items);
    return { res, adjIndex, adjLabel, baseOilIndex, waterKey, hasWaterOverride, fluidAdjusted, densityAdjusted, waterCapped, fluid,
      portionF: hasPortion ? portionF : 1, hasPortion, kcalBerechnet };
  }
  // Gekochte Rezepte: Öl wird nicht mitpüriert, sondern in die abgefüllte Portion eingerührt – als letzter Schritt
  // mit den Mengen einer Portion (Raps/MCT nach Öl-Mix). Angerührte Rezepte nennen das schon im eigenen Text.
  function oilFeedStep(rec, itemsPer) {
    if (rec.angeruehrt) return "";
    const oils = itemsPer.filter(it => isOilName(it.food) && num(it.grams) > 0);
    if (!oils.length) return "";
    return "Abfüllen und in jede Portion " +
      oils.map(o => String(o.food).replace(/\s*C8\+C10/, "") + " " + fmt(num(o.grams), 1) + " g").join(" + ") + " gründlich einrühren.";
  }
  // Kennzahlen einer Mahlzeit fürs Füttern/Tagesplan (eine Portion).
  function mealFacts(rec, d) {
    const mv = computeMealView(rec, d, null);
    const items = mv.res.items;
    const isOilN = isOilName;
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
  // Modus „zwischen“: Wassergaben für einen Tag aus Mahlzeiten mit dieser Flüssigkeit (Uhrzeiten unter Heute → Zeitplan).
  function zwischenText(d, mealFluidPer) {
    const wp = waterPlan(d, mealFluidPer * d.mahl, zeitTimes(d));
    const base = 'Mahlzeiten ' + d.mahl + ' × ' + fmt(mealFluidPer, 0) + ' ml';
    if (wp.per === 0) return '<div class="note tip">💧 ' + base + ' – das Tagesziel ist damit schon erreicht, keine Wassergaben nötig.</div>';
    return '<div class="note ' + (wp.over ? 'warn' : 'tip') + '">💧 ' + base + ' + <strong>' + wp.n + ' × ' + fmt(wp.per, 0) + ' ml Wasser</strong> ≈ ' + fmt(wp.total, 0) + ' ml am Tag' +
      (wp.over ? ' · ⚠️ über ' + fmt(d.maxMahlMl, 0) + ' ml je Gabe' : '') + '</div>';
  }
  function regelZeile(d) {
    return '<div class="hint" style="margin-top:8px">Rechenregel: <strong>' + regelLabel(d) + '</strong> · <button type="button" class="linkbtn" data-goto="vorgaben">unter Vorgaben ändern</button></div>';
  }
  /* ---------- Blätter (Reiter am Desktop, Wisch-Seiten mit Punkten am Handy) – für Detail und Editor ---------- */
  function pagerHead(PAGES, cur, tabsId, dotsId) {
    const tabBtn = (pg) => '<button type="button" data-dtab="' + pg[0] + '"' + (cur === pg[0] ? ' class="active"' : "") + ">" + pg[1] + "</button>";
    return '<div class="detail-tabs-wrap"><div class="segmented detail-tabs" id="' + tabsId + '">' + PAGES.map(tabBtn).join("") + "</div>" +
      '<div class="page-dots" id="' + dotsId + '">' + PAGES.map(pg => '<button type="button" class="dot' + (cur === pg[0] ? " active" : "") + '" data-dtab="' + pg[0] + '" aria-label="' + pg[1] + '"></button>').join("") +
      '<span class="page-no">Seite ' + (Math.max(0, PAGES.findIndex(pg => pg[0] === cur)) + 1) + " von " + PAGES.length + "</span></div></div>";
  }
  // onChange(k): gewähltes Blatt merken; rerender(): am Desktop wird nach einem Reiterklick neu gezeichnet.
  function setupPager(c, PAGES, cur, onChange, rerender) {
    const mobile = isMobileLayout();
    const pages = c.querySelector(".pages");
    const panes = pages ? [...pages.querySelectorAll(":scope > .pane")] : [];
    const pageIdx = (k) => Math.max(0, PAGES.findIndex(pg => pg[0] === k));
    const leftOf = (i) => panes[i] && panes[0] ? panes[i].offsetLeft - panes[0].offsetLeft : 0;
    const markTab = (k) => {
      c.querySelectorAll(".detail-tabs button[data-dtab], .page-dots button[data-dtab]").forEach(b => b.classList.toggle("active", b.dataset.dtab === k));
      const pn = c.querySelector(".page-dots .page-no"); if (pn) pn.textContent = "Seite " + (pageIdx(k) + 1) + " von " + PAGES.length;
      const ab = c.querySelector(".detail-tabs button.active");
      if (ab && typeof ab.scrollIntoView === "function") { try { ab.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {} }
    };
    const goTo = (k, smooth) => {
      const left = leftOf(pageIdx(k));
      if (smooth) { try { pages.scrollTo({ left: left, behavior: "smooth" }); return; } catch (e) {} }
      pages.scrollLeft = left;
    };
    let current = cur;
    if (mobile && pages) {
      goTo(cur, false);
      markTab(cur);
      let st = null;
      pages.addEventListener("scroll", () => {
        clearTimeout(st);
        st = setTimeout(() => {
          let best = 0, bd = Infinity;
          panes.forEach((p, i) => { const dd = Math.abs(leftOf(i) - pages.scrollLeft); if (dd < bd) { bd = dd; best = i; } });
          const k = PAGES[best][0];
          if (k !== current) { current = k; onChange(k); markTab(k); }
        }, 80);
      });
    }
    c.querySelectorAll(".detail-tabs button[data-dtab], .page-dots button[data-dtab]").forEach(b =>
      b.addEventListener("click", () => {
        current = b.dataset.dtab; onChange(current);
        if (mobile && pages) { markTab(current); goTo(current, true); }
        else rerender();
      }));
  }
  function renderDetail() {
    const rec = detailRec;
    const d = derived();
    const mv = computeMealView(rec, d, detailMeat);
    const res = mv.res, adjIndex = mv.adjIndex, adjLabel = mv.adjLabel;
    const baseOilIndex = mv.baseOilIndex, waterKey = mv.waterKey, hasWaterOverride = mv.hasWaterOverride;
    const mult = scaleMult(d); // gilt für die Blätter Tag und Kochen; das Blatt Mahlzeit zeigt immer eine Portion
    const items = res.items;
    const sumPer = sumMacros(items);
    const sum = { eiweiss: sumPer.eiweiss * mult, fett: sumPer.fett * mult, kh: sumPer.kh * mult, kcal: sumPer.kcal * mult };
    const r = ratioOf(sumPer);
    const totalG = items.reduce((a, it) => a + num(it.grams), 0) * mult;
    const ml = volumeMl(items) * mult;
    const proteinTarget = d.eiweissMahl * mult;
    const proteinOk = sum.eiweiss >= proteinTarget * 0.9;
    const pStateMeal = proteinState(sumPer.eiweiss, d.eiweissMahl), pStateQ = proteinState(sum.eiweiss, proteinTarget);
    const portionsTxt = (Math.abs(mult - Math.round(mult)) < 0.05 ? String(Math.round(mult)) : fmt(mult, 1));
    const days = scaleDays();
    const portionLabel = mult === 1 ? "1 Portion" : (days ? (days === 1 ? "1 Tag" : days + " Tage") + " = " : "") + portionsTxt + " Portionen";
    // Abfüllmenge je Portion OHNE Öl (das Öl wird danach in die abgefüllte Portion eingerührt).
    // Nur tatsächliche Öle abziehen (Name enthält "Öl") – Butter/Sahne/KetoCal bleiben in der Masse.
    const isOil = isOilName;
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
        .replace("Dämpfwasser abgießen. Die gedämpften Zutaten mit dem abgemessenen Wasser",
          "Das Dämpfwasser NICHT abgießen – davon " + Math.round(waterG) + " ml abmessen (ist weniger übrig, mit frischem Wasser auf " + Math.round(waterG) + " ml ergänzen; ist mehr übrig, den Rest nicht verwenden) und zusammen mit den gedämpften Zutaten");
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
        '</div><details class="collapsible mini"><summary>ⓘ Was ändert sich?</summary><p>Nur das Fleisch – Gemüse, Wasser und Öl/Fett bleiben gleich. Die Fleischmenge wird so berechnet, dass das Verhältnis genau stimmt (sie kann daher etwas von der Menge im Rezept abweichen; die Kalorien können leicht variieren).</p></details></div>';
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

    // Zwei Sichten auf dieselben Zutaten: Blatt Mahlzeit (eine Portion) und Blatt Tag (Zubereitungsmenge), beide editierbar.
    let kRows = "", nRows = "";
    items.forEach((it, i) => {
      const g = num(it.grams) * mult;
      const m = lineMacros({ food: it.food, grams: num(it.grams) }); // Blatt Mahlzeit: je Portion
      const isWaterRow = /wasser/i.test(it.food);
      const fatRow = isFatCarrier(items, i);
      const gR = fatRow ? roundTo(g, 0.1) : roundTo(g, isWaterRow ? 1 : d.rundung);
      const gTxt = (fatRow ? gR.toFixed(1) : String(gR)).replace(".", ","); // Fettträger immer mit einer Nachkommastelle („21,0“)
      // Wasserzeile: nur die Herkunft steht dabei („⟵ Flüssigkeitsziel“); Anpassungen und ihr Zurücksetzen
      // stehen – wie bei den Lebensmitteln – in der Statuszeile über den Kacheln.
      const waterTag = isWaterRow ? (hasWaterOverride ? '<small class="adj">⟵ eigener Wert</small>' : (mv.fluidAdjusted ? '<small class="adj">⟵ Flüssigkeitsziel</small>' : (mv.densityAdjusted ? '<small class="adj">⟵ höchstens ' + fmt(d.maxDichte, 1) + ' kcal/ml</small>' : ""))) : "";
      const mK = lineMacros({ food: it.food, grams: gR }); // Blatt Tag: für die Zubereitungsmenge
      kRows += "<tr" + (i === adjIndex ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) + (i === adjIndex ? adjLabel : "") + waterTag + "</td>" +
        '<td class="amt"><input class="amt-edit" type="text" autocomplete="off" inputmode="decimal" data-g="' + gR + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gTxt + '"></td>' +
        "<td>" + fmt(mK.eiweiss) + "</td><td>" + fmt(mK.fett) + "</td><td>" + fmt(mK.kh) + "</td><td>" + fmt(mK.kcal, 0) + "</td></tr>";
      const gP = Math.round(num(it.grams) * 10) / 10;
      const gPTxt = (fatRow ? gP.toFixed(1) : String(gP)).replace(".", ",");
      nRows += "<tr" + (i === adjIndex ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) + (i === adjIndex ? adjLabel : "") + waterTag + "</td>" +
        '<td class="amt"><input class="amt-edit g-edit" type="text" autocomplete="off" inputmode="decimal" data-g="' + gP + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gPTxt + '"></td>' +
        "<td>" + fmt(m.eiweiss) + "</td><td>" + fmt(m.fett) + "</td><td>" + fmt(m.kh) + "</td><td>" + fmt(m.kcal, 0) + "</td></tr>";
    });
    // Zubereitung als nummerierte Schritte (Varoma bevorzugt; Dämpfwasser-Rechnung ist darin enthalten).
    const prepText = rec.varoma
      ? adaptOil(adaptVaroma(adaptPrep(rec.varoma, rec, detailMeat)))
      : (rec.zubereitung ? adaptOil(adaptPrep(rec.zubereitung, rec, detailMeat)) : "");
    const steps = splitSteps(prepText);
    const oilStep = oilFeedStep(rec, items); if (oilStep && steps.length) steps.push(oilStep);
    const stepsHtml = steps.length ? "<ol class='steps'>" + steps.map(s => "<li>" + escapeHtml(s) + "</li>").join("") + "</ol>" : "";
    // Abfüllen: Öl-Zeilen je Portion (werden in die abgefüllte Portion eingerührt)
    const oilRowsPer = items.filter(it => isOil(it.food));
    // Vier Blätter: am Handy nebeneinander (seitlich wischen, jedes passt auf einen Bildschirm), am Desktop als Reiter.
    const TABMAP = { rechnen: "mahlzeit", kochen: "abwiegen", tag: "abwiegen", abfuellen: "zubereitung" }; // alte gespeicherte Werte
    const wanted = TABMAP[state.settings.detailTab] || state.settings.detailTab;
    const dtab = DETAIL_PAGES.some(pg => pg[0] === wanted) ? wanted : "mahlzeit";
    const mobile = isMobileLayout();
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
      ? '<div class="hint" style="margin:6px 0 10px">💧 Flüssigkeit ≈ <strong>' + fmt(fluidPer, 0) + ' ml</strong> (Zutaten ' + fmt(foodFluidPer, 0) + ' + Wasser ' + fmt(waterPer, 0) + ')' +
        (d.wasserModus === "mahlzeit"
          ? ' · Ziel ' + fmt(d.fluidMahl, 0) + ' ml je Mahlzeit' + (mv.fluidAdjusted ? ' – Wasser dafür erhöht' : (fluidPer >= d.fluidMahl - 0.5 ? ' ✓' : ' – <strong>nicht erreicht</strong> (gemerktes Wasser)'))
          : (mv.densityAdjusted ? ' · Wasser so weit erhöht, dass die Mahlzeit höchstens ' + fmt(d.maxDichte, 1) + ' kcal/ml hat' : ' · Wasser nur zum Pürieren bzw. Anrühren') + ', der Rest kommt als Wassergaben') +
        (d.maxMahlMl > 0 && volumeMl(items) > d.maxMahlMl + 0.5 ? ' · <strong>⚠️ ' + fmt(volumeMl(items), 0) + ' ml auf einmal, über ' + fmt(d.maxMahlMl, 0) + ' ml</strong>' : '') + '</div>'
      : "";
    const dayFluid = fluidPer * dayN, dayFluidZiel = d.fluidDay;
    const fluidDayNote = d.fluidDay > 0
      ? (d.wasserModus === "zwischen"
          ? zwischenText(d, fluidPer)
          : (dayFluid < dayFluidZiel - 3
              ? '<div class="note warn">💧 Der Tag liegt unter dem Flüssigkeitsziel – das gemerkte Wasser im Rezept ist kleiner als der rechnerische Anteil.</div>'
              : '<div class="note tip">💧 Flüssigkeit ist in den Mahlzeiten dabei – Wasser je Rezept entsprechend erhöht, kein Sondieren zwischen den Mahlzeiten nötig.</div>'))
      : "";

    // Blatt Tag: Kacheln für die Zubereitungsmenge – gleiches Layout wie „Mahlzeit“, nur mit den Mengen der Zubereitung
    // (Standard: ein Tag). Ziele skalieren mit; bei ganzen Tagen zählt das Flüssigkeitsziel je Tag.
    const qTag = days === 1 ? "/Tag" : "";
    const qFluid = fluidPer * mult, qFluidZiel = days ? dayFluidZiel * days : d.fluidMahl * mult, qZiel = d.wasserModus === "mahlzeit";
    const qTiles =
      '<div class="detail-tiles strip">' +
        '<div class="dstat' + ((days && dayLow) ? " warn" : "") + '"><div class="v">' + fmt(sum.kcal, 0) + '</div><div class="l">kcal' + qTag + ' · Ziel ' + fmt(d.kcalMahl * mult, 0) + '</div></div>' +
        '<div class="dstat' + (pStateQ === "ok" ? "" : " warn") + '"><div class="v">' + fmt(sum.eiweiss) + ' g' + (pStateQ === "high" ? ' ↑' : '') + '</div><div class="l">Eiweiß' + qTag + ' · Ziel ' + fmt(proteinTarget, 0) + ' g</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(totalG, 0) + ' g</div><div class="l">Menge' + qTag + '</div></div>' +
        (d.fluidDay > 0 ? '<div class="dstat' + (qZiel && qFluid < qFluidZiel - 3 * mult ? " warn" : "") + '"><div class="v">' + fmt(qFluid, 0) + ' ml</div><div class="l">Flüssigkeit' + qTag + (qZiel ? ' · Ziel ' + fmt(qFluidZiel, 0) + ' ml' : ' in Mahlzeiten') + '</div></div>' : '') +
      '</div>';
    // Tages-Check nur als Warnung (wie die Eiweiß-Warnung auf „Mahlzeit“): Minimum unterschritten oder über dem Korridor.
    const dayCheck = dayLow
      ? '<div class="note warn">⚠️ Ein Tag nur mit diesem Rezept (' + dayN + ' × ' + fmt(dayKcal / dayN, 0) + ' kcal = ' + fmt(dayKcal, 0) + ' kcal) läge unter dem Minimum von ' + fmt(d.kcalMin, 0) + ' kcal – im Tagesplan mit anderen Mahlzeiten kombinieren.</div>'
      : (dayHigh ? '<div class="note warn">⚠️ Ein Tag nur mit diesem Rezept (' + dayN + ' × ' + fmt(dayKcal / dayN, 0) + ' kcal = ' + fmt(dayKcal, 0) + ' kcal) läge über dem Korridor (bis ' + fmt(d.kcalMaxAuto, 0) + ' kcal).</div>' : "");
    // Zubereitungsmenge: 1 Portion, 1–3 ganze Tage (folgen der Mahlzeitenzahl) oder eine freie Portionenzahl.
    // Gilt nur hier (Blätter Tag und Kochen) und wird je Rezept gemerkt – die Vorgaben bleiben unberührt.
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
        : 'Wie berechnet · ' + fmt(d.kcalMahl * m, 0) + ' kcal ' + bezug + ' · Gramm ändern skaliert mit'; // eine Zeile am Handy
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
      pagerHead(DETAIL_PAGES, dtab, "detail-tabs", "page-dots") +
      '<div class="pages" id="detail-pages">' +

      /* ---------- 1 Mahlzeit ---------- */
      paneOpen("mahlzeit") +
      '<h4 class="ph">🍽️ Mahlzeit <span class="hint">eine Portion</span></h4>' +
      '<div class="portion-line">' + mealStatus + '</div>' +
      '<div class="detail-tiles strip">' +
        '<div class="dstat' + (mv.hasPortion ? " warn" : "") + '"><div class="v">' + fmt(sumPer.kcal, 0) + '</div><div class="l">kcal · Ziel ' + fmt(d.kcalMahl, 0) + '</div></div>' +
        '<div class="dstat ' + (pStateMeal === "ok" ? "" : "warn") + '"><div class="v">' + fmt(sumPer.eiweiss) + ' g' + (pStateMeal === "high" ? ' ↑' : '') + '</div><div class="l">Eiweiß · Ziel ' + fmt(d.eiweissMahl) + ' g</div></div>' +
        // Menge und Volumen der ganzen Mahlzeit (mit Öl) – wie im Zeitplan; „ohne Öl“ steht beim Abfüllen (Kochen).
        '<div class="dstat"><div class="v">≈ ' + fmt(totalG / mult, 0) + ' g</div><div class="l">Menge</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(ml / mult, 0) + ' ml</div><div class="l">Volumen</div></div>' +
      "</div>" +
      (pStateMeal === "low" ? '<div class="note warn">⚠️ Liegt unter dem Eiweiß-Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
      (pStateMeal === "high" ? '<div class="note warn" title="Viel Eiweiß kann die Ketose schwächen.">↑ Eiweiß ' + fmt(sumPer.eiweiss / d.eiweissMahl, 1) + '-mal so hoch wie das Ziel – mit dem Team abklären.</div>' : "") +
      '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>kcal</th></tr></thead><tbody>' +
        nRows +
        "<tr class='sum'><td class='name'>Summe je Portion</td><td>" + fmt(totalG / mult, 0) + "</td><td>" + fmt(sumPer.eiweiss) + "</td><td>" +
        fmt(sumPer.fett) + "</td><td>" + fmt(sumPer.kh) + "</td><td>" + fmt(sumPer.kcal, 0) + "</td></tr>" +
      "</tbody></table></div>" +
      fluidLine +
      "</div>" +

      /* ---------- 2 Tag (Zubereitungsmenge, Standard ein Tag) ---------- */
      paneOpen("abwiegen") +
      '<h4 class="ph">📅 Tag <span class="hint">' + (mult === 1 ? "eine Portion" : (days === 1 ? "= " : (days ? days + " Tage = " : "")) + portionsTxt + " Portionen") + '</span></h4>' +
      scaleSeg +
      '<div class="portion-line">' + tagStatus + '</div>' +
      qTiles +
      '<div class="tbl-wrap"><table class="kitchen"><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>kcal</th></tr></thead><tbody>' + kRows +
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
      '<div class="portion-line">💉 <strong>Abfüllen je Portion</strong>' + (hasOil ? ' – danach das Öl in die Portion einrühren' : '') +
        (mult !== 1 ? ' · gesamt ≈ ' + fmt((hasOil ? perGnoOil : totalG / mult) * mult, 0) + ' g = <strong>' + portionsTxt + ' × ' + fmt(perGnoOil, 0) + ' g</strong>' +
          (hasOil ? ' · Öl gesamt ' + oilRowsPer.map(it => String(it.food).replace(/^MCT.*$/, "MCT").replace(/öl$/i, "") + ' ' + fmt(num(it.grams) * mult, 0) + ' g').join(" + ") : '') : '') + '</div>' +
      '<div class="detail-tiles strip fill-tiles">' +
        '<div class="dstat"><div class="v fill-big">≈ ' + fmt(perGnoOil, 0) + ' g</div><div class="l">je Portion' + (hasOil ? ' ohne Öl' : '') + '</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(perMlNoOil, 0) + ' ml</div><div class="l">≈ ' + fmt(perMlNoOil / 60, 1) + ' Spritzen à 60 ml</div></div>' +
        (hasOil ? oilRowsPer.map(it => '<div class="dstat oil"><div class="v">' + fmt(num(it.grams), 1) + ' g</div><div class="l">' + escapeHtml(String(it.food).replace(/\s*C8\+C10/, "")) + ' · einrühren</div></div>').join("") : "") +
      "</div>" +
      // Hinweis zu Garzeiten nur bei gekochten Gerichten; Angerührtes (KetoCal, Compleat, HiPP) wird nur gemischt.
      ((res.mct || rec.varoma || (mult !== 1 && !rec.angeruehrt)) ? '<div class="note ' + (res.mct && res.mct.energiePz > 50 ? "warn" : "tip") + '">' +
        [rec.varoma ? '🫗 Vor dem Abfüllen durch ein feines Sieb streichen (sonst verstopft die Spritze).' : "",
         res.mct ? 'MCT <strong>' + fmt(res.mct.gMct, 1) + ' g</strong> je Portion (' + fmt(res.mct.energiePz, 0) + ' % der Energie) – klein beginnen, Verträglichkeit beobachten.' : "",
         (mult !== 1 && !rec.angeruehrt) ? 'Garzeiten gelten für <strong>eine</strong> Portion – länger garen, bis alles weich ist; im Kühlschrank lagern.' : ""].filter(Boolean).join(" ") + "</div>" : "") +
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
    // Blatt Mahlzeit: Gramm je Portion ändern → Portion-Faktor je Rezept (Wasser: gemerkter Wert je Portion)
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
    setupPager(c, DETAIL_PAGES, dtab, (k) => { state.settings.detailTab = k; save(); }, renderDetail);

    // Feste Aktionsleiste unten: Favorit · Drucken · Für heute · Editor (· Löschen bei eigenen Rezepten).
    // Am Handy zeigen Favorit und Drucken nur ihr Symbol (Beschriftung .lbl ausgeblendet).
    const actions = c.querySelector("#detail-actions");
    const fav = isFav(rec);
    const favBtn = el("button", { class: "btn secondary icon-lbl", title: "Favorit", "aria-label": "Favorit" }, (fav ? "★" : "☆") + ' <span class="lbl">Favorit</span>');
    // Nur den Stern umschalten (Blatt, Menge und Fleischwahl bleiben) und die Liste dahinter gleich mitziehen.
    favBtn.addEventListener("click", () => {
      toggleFav(rec);
      favBtn.innerHTML = (isFav(rec) ? "★" : "☆") + ' <span class="lbl">Favorit</span>';
      renderRezepte();
    });
    actions.appendChild(favBtn);
    const printBtn = el("button", { class: "btn secondary icon-lbl", title: "Drucken", "aria-label": "Drucken" }, '🖨️ <span class="lbl">Drucken</span>');
    printBtn.addEventListener("click", () => printRecipe(rec, res, d, mult));
    actions.appendChild(printBtn);
    const todayBtn = el("button", { class: "btn", id: "today-btn", "aria-haspopup": "true" }, "📅 Für heute");
    todayBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleTodaySheet(rec); });
    actions.appendChild(todayBtn);
    const editBtn = el("button", { class: "btn secondary", id: "edit-btn" }, "✏️ " + (rec.custom ? "Bearbeiten" : "Editor"));
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

  /* ---------- „Für heute“: Rezept in den Tagesplan übernehmen ----------
     Auswahl über der Aktionsleiste: alle Mahlzeiten, nur freie oder eine einzelne (mit Uhrzeit aus dem Zeitplan).
     Danach eine Meldung mit „Rückgängig“ (stellt den vorherigen Plan her) und „Ansehen“ (wechselt zu Heute). */
  function closeTodaySheet() { const sh = document.getElementById("today-sheet"); if (sh) sh.remove(); }
  function toggleTodaySheet(rec) {
    if (document.getElementById("today-sheet")) { closeTodaySheet(); return; }
    const d = derived(); ensureDayPlan(d);
    const key = recipeKey(rec), times = zeitTimes(d);
    const free = state.dayPlan.map((sl, i) => recipeByKey(sl && sl.key) ? -1 : i).filter(i => i >= 0);
    const filled = d.mahl - free.length;
    const opt = (val, main, sub, cls) => '<button type="button" class="today-opt' + (cls ? " " + cls : "") + '" data-today="' + val + '"><span>' + main + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
    let html = '<div class="today-title">In den Tagesplan übernehmen</div>' +
      opt("all", "Alle " + d.mahl + " Mahlzeiten", filled ? "ersetzt den bisherigen Plan" : "", "main");
    if (filled && free.length) html += opt("free", "Nur freie Mahlzeiten (" + free.length + ")", "gewählte Rezepte bleiben");
    html += '<div class="today-sep">oder eine Mahlzeit ersetzen</div>';
    state.dayPlan.forEach((sl, i) => {
      const cur = recipeByKey(sl && sl.key), same = sl && sl.key === key;
      html += opt(String(i), fmtHM(times.meals[i]) + " · Mahlzeit " + (i + 1) + (same ? " ✓" : ""), cur ? escapeHtml(cur.name) : "frei", same ? "same" : "");
    });
    const sh = el("div", { class: "today-sheet", id: "today-sheet", role: "menu" }, html);
    const actions = document.getElementById("detail-actions");
    actions.parentNode.insertBefore(sh, actions);
    sh.addEventListener("click", (e) => e.stopPropagation());
    sh.querySelectorAll("[data-today]").forEach(b => b.addEventListener("click", () => {
      const v = b.dataset.today, prev = state.dayPlan.map(sl => ({ key: sl ? sl.key : null }));
      const idx = v === "all" ? state.dayPlan.map((_, i) => i) : v === "free" ? free : [num(v)];
      idx.forEach(i => { state.dayPlan[i] = { key }; });
      save(); closeTodaySheet(); renderRezepte();
      const what = v === "all" ? "für alle " + d.mahl + " Mahlzeiten" : v === "free" ? "für " + idx.length + " freie Mahlzeit" + (idx.length === 1 ? "" : "en") : "für Mahlzeit " + (idx[0] + 1) + " (" + fmtHM(times.meals[idx[0]]) + ")";
      showToast("📅 " + escapeHtml(familyOf(rec)) + " " + what + " übernommen", [
        ["Rückgängig", () => { state.dayPlan = prev; save(); renderRezepte(); }],
        ["Ansehen", () => { closeDetail(); showView("heute"); }],
      ]);
    }));
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
    closeTodaySheet();
    document.getElementById("detail-overlay").hidden = true;
    modalClose("detail");
  }
  // Nach unten wischen schließt das Overlay – überall auf der Karte und auf jedem Blatt. Der Wisch zählt nur,
  // wenn der Inhalt unter dem Finger ganz oben steht (sonst scrollt er wie gewohnt nach oben) und die Bewegung
  // eher senkrecht als waagrecht ist (waagrecht blättert die Seiten). Im gerade bearbeiteten Eingabefeld und
  // in der „Für heute“-Auswahl wird nicht gezogen. Die Karte folgt dem Finger; ab 90 px oder bei schnellem Wisch
  // schließt sie, sonst springt sie zurück.
  function bindSwipeDown(overlay, onClose) {
    const card = overlay.querySelector(".overlay-card"); if (!card) return;
    let st = null; // { x0, y0, t0, mode: null | "pull" | "skip" }
    const pt = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    const scrolledDown = (el) => {
      // Steht irgendein scrollbarer Behälter zwischen Finger und Overlay nicht ganz oben?
      for (let n = el; n && n !== overlay.parentNode; n = n.parentElement) {
        if (n.scrollTop > 0) { const oy = getComputedStyle(n).overflowY; if (oy === "auto" || oy === "scroll") return true; }
        if (n === overlay) break;
      }
      return false;
    };
    overlay.addEventListener("touchstart", (e) => {
      st = null;
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.target;
      if (!t || !t.closest || !t.closest(".overlay-card")) return;
      // Gramm-Felder: Ziehen darüber zählt (ein Zug fokussiert nicht), nur nicht während darin getippt wird
      if (t.closest("textarea, select, [contenteditable], .today-sheet") || (t.closest("input") && t.closest("input") === document.activeElement)) return;
      const p = pt(e);
      st = { x0: p.clientX, y0: p.clientY, t0: Date.now(), mode: scrolledDown(t) ? "skip" : null };
    }, { passive: true });
    overlay.addEventListener("touchmove", (e) => {
      if (!st || st.mode === "skip") return;
      const p = pt(e), dy = p.clientY - st.y0, dx = p.clientX - st.x0;
      if (st.mode === null) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        st.mode = (dy > 0 && dy > Math.abs(dx)) ? "pull" : "skip";
        if (st.mode === "skip") return;
        card.style.transition = "none";
      }
      if (e.cancelable) e.preventDefault(); // kein Gummiband-Scrollen, solange die Karte gezogen wird
      card.style.transform = "translateY(" + Math.max(0, dy) + "px)";
    }, { passive: false });
    const end = (e) => {
      if (!st) return;
      const was = st; st = null;
      if (was.mode !== "pull") return;
      const p = pt(e), dy = p.clientY - was.y0, fast = (Date.now() - was.t0) < 300 && dy > 40;
      card.style.transition = "transform .18s ease-out";
      if (dy > 90 || fast) { card.style.transform = "translateY(100%)"; setTimeout(() => { card.style.transform = ""; card.style.transition = ""; onClose(); }, 160); }
      else { card.style.transform = ""; setTimeout(() => { card.style.transition = ""; }, 200); }
    };
    overlay.addEventListener("touchend", end, { passive: true });
    overlay.addEventListener("touchcancel", end, { passive: true });
  }
  function bindDetail() {
    const overlay = document.getElementById("detail-overlay");
    document.getElementById("detail-close").addEventListener("click", closeDetail);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeDetail(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !overlay.hidden) closeDetail(); });
    bindSwipeDown(overlay, closeDetail);
    // Auswahl „Für heute“ schließt bei Klick daneben oder Escape
    overlay.addEventListener("click", () => closeTodaySheet());
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeTodaySheet(); });
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
  // Heute: eine Zeitleiste für den ganzen Tag. Jede Mahlzeit steht mit Uhrzeit und Rezept darin (↻ tauschen,
  // ✕ leeren, Tipp öffnet das Rezept bzw. die Auswahl), dazwischen die Wassergaben und das Schlafen.
  // Darüber Kopf (⏰ Uhrzeiten, 🖨️, 🗑️), Statuszeile und Tagessummen; darunter Flüssigkeit am Tag und Hinweise.
  function renderHeute() {
    const box = document.getElementById("heute-content"); if (!box) return;
    const d = derived(); ensureDayPlan(d);
    renderHeader(d); // Kopf-Pille (Wassergaben) passt sich sofort an, z. B. nach ✕ oder neuem Rezept
    const times = zeitTimes(d), dm = dayMeals(d), wp = waterPlan(d, dm.sum, times);
    const tot = { kcal: 0, eiweiss: 0, fett: 0, kh: 0, mct: 0, raps: 0, fluid: 0, filled: 0 };
    const facts = [];
    const rows = [];
    state.dayPlan.forEach((slot, i) => {
      const t = times.meals[i], m = dm.meals[i], time = '<span class="zp-time">' + fmtHM(t) + '</span>';
      const rec = m.rec;
      if (m.bad) {
        facts.push(null);
        rows.push({ t, html: '<div class="zp-row meal slot empty-slot bad-slot" role="button" tabindex="0" data-pick="' + i + '" title="Dieses Rezept erreicht die Verordnung nicht – anderes Rezept wählen">' + time + '<span class="zp-ic">⚠️</span>' +
          '<span class="zp-txt"><span class="zp-name">' + escapeHtml(m.bad.name) + '</span><small class="prot-low">passt nicht zu ' + escapeHtml(fmtTarget(d.ratio)) + ' – <span class="zp-open">anderes Rezept wählen</span></small></span>' +
          '<button type="button" class="slot-act" data-clear="' + i + '" title="Entfernen" aria-label="Entfernen">✕</button></div>' });
        return;
      }
      if (!rec) {
        facts.push(null);
        rows.push({ t, html: '<div class="zp-row meal slot empty-slot" role="button" tabindex="0" data-pick="' + i + '" title="Menge geschätzt – Rezept wählen">' + time + '<span class="zp-ic add">＋</span>' +
          '<span class="zp-txt"><span class="zp-name">Mahlzeit ' + (i + 1) + ' · <span class="zp-open">Rezept wählen</span></span></span>' +
          '<span class="zp-vol est">≈ ' + fmt(m.vol, 0) + ' ml<small>' + sondierMin(m.vol) + ' min</small></span><span class="tile-chev" aria-hidden="true">›</span></div>' });
        return;
      }
      const f = m.f; facts.push(f);
      tot.kcal += f.sum.kcal; tot.eiweiss += f.sum.eiweiss; tot.fett += f.sum.fett; tot.kh += f.sum.kh;
      tot.mct += f.gMct; tot.raps += f.gRaps; tot.fluid += f.fluid || 0; tot.filled++;
      const proteinOk = f.sum.eiweiss >= d.eiweissMahl * 0.9;
      const oilTxt = f.hasOil ? f.oils.map(o => escapeHtml(String(o.food).replace(/\s*C8\+C10/, "")) + " " + fmt(num(o.grams), 1) + " g").join(" + ") : "";
      const pill = ratioClass(f.ratio, d.ratio) !== "ok" ? ' <span class="ratio-pill ' + ratioClass(f.ratio, d.ratio) + '">' + fmtRatio(f.ratio, 2) + '</span>' : "";
      // Erste Zeile: Uhrzeit · Rezept · Menge/Dauer · ↻ ✕. Darunter über die ganze Breite die Zutaten einer Portion
      // mit Gramm, das Öl als normale Zutat am Ende. Unter dem Namen nur, wenn das Eiweiß zu niedrig ist.
      const sub = proteinOk ? '' : '<span class="prot-low">Eiweiß nur ' + fmt(f.sum.eiweiss) + ' g</span>';
      rows.push({ t, html: '<div class="zp-row meal slot" role="button" tabindex="0" data-open="' + i + '" title="' + fmt(f.sum.kcal, 0) + ' kcal · Eiweiß ' + fmt(f.sum.eiweiss) + ' g' + (oilTxt ? ' · Öl: ' + oilTxt : '') + '">' + time + '<span class="zp-ic">' + (rec.icon || "🥑") + '</span>' +
        '<span class="zp-txt"><span class="zp-name">' + escapeHtml(rec.name) + pill + '</span>' + (sub ? '<small>' + sub + '</small>' : '') +
          '<small class="zp-more">' + fmt(f.sum.kcal, 0) + ' kcal · Eiweiß ' + fmt(f.sum.eiweiss) + ' g</small></span>' +
        (() => { const big = d.maxMahlMl > 0 && m.vol > d.maxMahlMl + 0.5; // über 25 ml/kg auf einmal → gelb markieren
          return '<span class="zp-vol' + (big ? ' big' : '') + '" title="' + (big ? 'mehr als ' + fmt(d.maxMahlMl, 0) + ' ml auf einmal (25 ml/kg) – mehr Mahlzeiten oder mit dem Team abklären · ' : '') + 'langsam sondieren, etwa ' + SONDIER_ML_MIN + ' ml pro Minute">' + (big ? '⚠️ ' : '≈ ') + fmt(m.vol, 0) + ' ml<small>' + sondierMin(m.vol) + ' min</small></span>'; })() +
        '<button type="button" class="slot-act" data-pick="' + i + '" title="Rezept ändern" aria-label="Rezept ändern">↻</button>' +
        '<button type="button" class="slot-act" data-clear="' + i + '" title="Entfernen" aria-label="Entfernen">✕</button>' +
        '<small class="zp-ing">' + ingLine(f) + '</small></div>' });
    });
    zeitplanExtraRows(times, wp).forEach(r => rows.push(r));
    rows.sort((a, b) => a.t - b.t);
    const ratioDay = (tot.eiweiss + tot.kh) > 0 ? tot.fett / (tot.eiweiss + tot.kh) : null;
    const share = tot.filled / d.mahl; // Anteil geplanter Mahlzeiten → Ziele anteilig
    const eiweissZiel = d.eiweiss * share, kcalZiel = d.kcal * share, kcalMinZiel = d.kcalMin * share, fluidZiel = d.fluidDay * share;
    const kcalLow = tot.kcal < kcalMinZiel - 0.5;
    // Kopf: Mahlzeiten × kcal und der Tagesrahmen; ⏰ klappt die Uhrzeiten auf, dazu Drucken und Leeren.
    // Mahlzeiten × kcal stehen schon in der Kopfzeile (Pille) – hier nur der Rahmen des Tages.
    // Rahmen in zwei kurzen Zeilen (Zeitraum · Abstand), damit am Handy nichts abgeschnitten wird („alle 3 h …“).
    const head = '<div class="group-head day-head"><span class="day-title">📅 Heute</span> <span class="group-count"><span class="dh-range">' + fmtHM(times.meals[0]) + '–' + fmtHM(times.meals[times.meals.length - 1]) + '</span>' +
        (times.interval != null ? '<span class="dh-sep"> · </span><span class="dh-int">alle ' + fmtDauer(times.interval) + '</span>' : '') + '</span>' +
      '<span class="head-actions"><button type="button" class="iconbtn round' + (zpEdit ? ' open' : '') + '" id="zp-toggle" title="Uhrzeiten einstellen" aria-label="Uhrzeiten einstellen" aria-expanded="' + (zpEdit ? "true" : "false") + '">⏰</button>' +
      '<button type="button" class="iconbtn round" id="print-day" title="Tagesplan drucken" aria-label="Tagesplan drucken">🖨️</button>' +
      '<button type="button" class="iconbtn round" id="clear-day" title="Plan leeren" aria-label="Plan leeren">🗑️</button></span></div>';
    // Tagessummen in einer niedrigen Kachelreihe (Ziele anteilig, wenn nicht alle Mahlzeiten geplant sind).
    // Flüssigkeit = ganzer Tag laut Zeitplan (Mahlzeiten + Wassergaben); „≈“, wenn offene Mahlzeiten geschätzt sind.
    const est = dm.known < d.mahl;
    const fluidTile = d.fluidDay > 0
      ? '<div class="dstat' + (wp.total < d.fluidDay - 15 ? " warn" : "") + '" title="Mahlzeiten ' + fmt(dm.sum, 0) + ' ml' + (wp.per > 0 ? ' + Wasser ' + wp.n + ' × ' + fmt(wp.per, 0) + ' ml' : '') + (est ? ' · offene Mahlzeiten geschätzt' : '') + '">' +
        '<div class="v">' + (est ? '≈ ' : '') + fmt(wp.total, 0) + ' ml</div><div class="l">💧 Ziel ' + fmt(d.fluidDay, 0) + ' ml</div></div>'
      : "";
    const sums = '<div class="detail-tiles strip day-strip" id="day-sums">' +
      (tot.filled
        ? '<div class="dstat' + (kcalLow ? " warn" : "") + '"><div class="v">' + fmt(tot.kcal, 0) + '</div><div class="l">kcal · Ziel ' + fmt(kcalZiel, 0) + '</div></div>' +
          (() => { const ps = proteinState(tot.eiweiss, eiweissZiel); return '<div class="dstat' + (ps === "ok" ? "" : " warn") + '"' + (ps === "high" ? ' title="mehr als das Doppelte des Eiweiß-Ziels"' : '') + '><div class="v">' + fmt(tot.eiweiss) + ' g' + (ps === "high" ? ' ↑' : '') + '</div><div class="l">Eiweiß · Ziel ' + fmt(eiweissZiel, 0) + '</div></div>'; })() +
          '<div class="dstat"><div class="v"><span class="ratio-pill ' + ratioClass(ratioDay, d.ratio) + '">' + fmtRatio(ratioDay, 2) + '</span></div><div class="l">Ziel ' + fmtTarget(d.ratio) + '</div></div>'
        : '<div class="dstat wide"><div class="v">' + d.mahl + ' × ' + fmt(d.kcalMahl, 0) + ' kcal</div><div class="l">Rezepte wählen: Tipp auf eine Mahlzeit</div></div>') +
      fluidTile + "</div>";
    const warns =
      (d.fluidDay > 0 && d.wasserModus === "mahlzeit" && tot.filled && tot.fluid < fluidZiel - 3 ? '<div class="note warn">💧 Unter dem Flüssigkeitsziel – bei einem Rezept ist weniger Wasser gemerkt als sein Anteil.</div>' : "") +
      (tot.filled && kcalLow ? '<div class="note warn">⚠️ Der Tag liegt unter dem Kalorien-Minimum (' + fmt(d.kcalMin, 0) + ' kcal) – eine Mahlzeit mit mehr Kalorien einplanen.</div>' : "");
    // Packungsstand (z. B. Compleat 500 ml, 3 Tage) als grüne Notiz wie in der Detailansicht.
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
      const nTage = x.ml * x.pk.tage;
      // Kurz: heute verplant und Rest für morgen; Einzelheiten zur Packung stehen im Rezept (Blatt „Tag“).
      const shortName = k.replace(/\s*\(.*?\)/g, "").replace(/\s+Nature Mix/, "");
      const more = (rest >= -0.5 && nTage > x.pk.ml + 0.5 ? 'In ' + x.pk.tage + ' Tagen ist eine 2. Packung nötig. ' : "") +
        (rest >= -0.5 && nTage < x.pk.ml - 0.5 ? 'Nach ' + x.pk.tage + ' Tagen bleiben ' + fmt(x.pk.ml - nTage, 0) + ' ml übrig. ' : "");
      return '<div class="note tip pack" title="Packung ' + x.pk.ml + ' ml, offen ' + x.pk.tage + ' Tage. Rest reicht für ' + restMeals + ' Mahlzeit' + (restMeals === 1 ? "" : "en") + '. ' + more + '">🧃 <strong>' + escapeHtml(shortName) + '</strong> heute ' + fmt(x.ml, 0) + ' ml · ' +
        (rest < -0.5 ? '<strong>fehlen ' + fmt(-rest, 0) + ' ml</strong>' : 'Rest ' + fmt(rest, 0) + ' ml') + (more && rest >= -0.5 && nTage > x.pk.ml + 0.5 ? ' · ⚠️ 2. Packung' : '') + '</div>';
    }).join("");
    box.innerHTML = '<div class="zeitplan">' + head + zeitplanSettings(times) + sums +
      '<div class="zp-list day-slots">' + rows.map(r => r.html).join("") + '</div>' +
      zeitplanNotes(d, times, dm, wp) + warns + packHtml + '</div>';
    bindZeitplan(box);
    box.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); openPicker(num(b.dataset.pick)); }));
    box.querySelectorAll("[data-open]").forEach(b => {
      const open = () => { const r = recipeByKey(state.dayPlan[num(b.dataset.open)].key); if (r) openRecipeDetail(r); };
      b.addEventListener("click", open);
      b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    box.querySelectorAll(".empty-slot[data-pick]").forEach(b => b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(num(b.dataset.pick)); } }));
    // ✕ leert eine Mahlzeit – mit „Rückgängig“ wie beim Leeren des ganzen Plans
    box.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const i = num(b.dataset.clear), prev = state.dayPlan[i] ? state.dayPlan[i].key : null;
      state.dayPlan[i] = { key: null }; save(); renderHeute();
      showToast("✕ Mahlzeit " + (i + 1) + " entfernt", [["Rückgängig", () => { state.dayPlan[i] = { key: prev }; save(); renderHeute(); }]]);
    }));
    const pd = box.querySelector("#print-day"); if (pd) pd.addEventListener("click", () => printDayPlan(d, facts));
    const cd = box.querySelector("#clear-day");
    if (cd) cd.addEventListener("click", () => {
      if (!state.dayPlan.some(sl => sl && sl.key)) return;
      const prev = state.dayPlan.map(sl => ({ key: sl ? sl.key : null }));
      state.dayPlan = state.dayPlan.map(() => ({ key: null })); save(); renderRezepte();
      showToast("🗑️ Tagesplan geleert", [["Rückgängig", () => { state.dayPlan = prev; save(); renderRezepte(); }]]);
    });
    fitHeute();
  }
  // Am Handy füllt der Tag den Bildschirm bis zur Tab-Leiste: Bleibt Platz (z. B. bei 4 statt 5 Mahlzeiten
  // oder als installierte App), zeigt jede Mahlzeit zusätzlich ihre Zutaten mit Gramm und kcal/Eiweiß,
  // lange Rezeptnamen dürfen zweizeilig werden, der Rest verteilt sich als Höhe (Mahlzeiten mehr als Wasser). Reicht der Platz nicht, bleibt die kompakte Darstellung.
  // Zutaten einer Portion für die Zeitleiste: kurze Namen (ohne Klammerzusatz, Marke, „ohne Haut“ …; roh/gekocht
  // bleibt, das ändert das Gewicht), Gramm ohne „,0“, das Öl als normale Zutat am Ende („Rapsöl 14,2 g · MCT-Öl 1,6 g“).
  function shortFood(n) {
    return String(n).replace(/\s*\(.*?\)/g, "").replace(/,/g, "")
      .replace(/\s+(Paediatric Nature Mix|Zubereitung|ohne Haut|ganz versprudelt|TK oder Frisch|NÖM)\b/g, "").replace(/\bBio-/g, "")
      .replace(/^HiPP\s+/, "").replace(/\s+/g, " ").trim();
  }
  const gramsShort = (g) => fmt(g, 1).replace(/,0$/, "") + "&nbsp;g";
  function ingLine(f) {
    const items = f.res.items.filter(it => num(it.grams) > 0);
    const ordered = items.filter(it => !isOilName(it.food)).concat(items.filter(it => isOilName(it.food)));
    return ordered.map(it => '<span class="nw">' + escapeHtml(shortFood(it.food).replace(/\s*C8\+C10/, "")) + "&nbsp;" + gramsShort(num(it.grams)) + "</span>").join(" · ");
  }

  function fitHeute() {
    const box = document.getElementById("heute-content"), list = box && box.querySelector(".zp-list");
    const zp = box && box.querySelector(".zeitplan"), tab = document.querySelector(".tabbar");
    if (!list || !zp || !tab) return;
    const LV = ["roomy", "more", "tight", "fill"];
    zp.classList.remove("tight"); document.body.classList.remove("heute-tight");
    list.classList.remove.apply(list.classList, LV); list.style.minHeight = "";
    if (!box.offsetParent) return;
    // Nach dem Festlegen der Stufe messen: Zutatenzeile über die ganze Breite, eingerückt bis zum Rezeptnamen;
    // Dauer der Wassergaben rechtsbündig in derselben Spalte wie die Dauer der Mahlzeiten.
    const indent = () => {
      const r0 = list.querySelector(".zp-row.meal .zp-txt");
      if (r0) {
        const row = r0.parentElement;
        list.style.setProperty("--ing-indent", Math.round(r0.getBoundingClientRect().left - row.getBoundingClientRect().left - (parseFloat(getComputedStyle(row).paddingLeft) || 0) - (row.clientLeft || 0)) + "px");
      }
      const vs = list.querySelector(".zp-row .zp-vol small"), wr = list.querySelector(".zp-row.water");
      if (vs && wr) list.style.setProperty("--wmin-r", Math.max(0, Math.round(wr.getBoundingClientRect().right - vs.getBoundingClientRect().right)) + "px");
    };
    // Desktop: Platz genug – kcal/Eiweiß immer zeigen
    if (window.innerWidth > 820 || getComputedStyle(tab).position !== "fixed") { list.classList.add("more"); indent(); return; }
    const spare = () => tab.getBoundingClientRect().top - (zp.getBoundingClientRect().bottom + (window.scrollY || 0)) - 12;
    // Stufen vom großzügigsten zum knappsten – die Zutaten stehen immer da. Die erste Stufe, die ohne Scrollen
    // bis zur Tab-Leiste passt, gilt; passt nicht einmal „tight“ (sehr kleiner Bildschirm), darf gescrollt werden.
    const steps = [["roomy", "more"], ["roomy"], [], ["tight"]];
    for (const st of steps) {
      if (st.length) list.classList.add.apply(list.classList, st);
      zp.classList.toggle("tight", st[0] === "tight");
      document.body.classList.toggle("heute-tight", st[0] === "tight"); // Kopf-Pille ohne die Wasserzeile (steht in der Zeitleiste)
      indent();
      if (spare() >= 0) break;
      if (st[0] === "tight") break;
      if (st.length) list.classList.remove.apply(list.classList, st);
    }
    const s = spare(), n = list.children.length;
    if (s > 4) { list.classList.add("fill"); list.style.minHeight = Math.round(list.offsetHeight + Math.min(s, n * 52)) + "px"; }
  }

  // Neu einpassen, sobald sich der verfügbare Platz ändert. Am iPhone (installierte App) stehen Statusleiste,
  // Home-Balken-Abstand (safe-area) und Fensterhöhe beim Start oft noch nicht fest und ändern sich ohne
  // „resize“ – daher zusätzlich: Größe von Tab-Leiste und Kopf beobachten, sichtbare Fensterhöhe, Rückkehr
  // in die App, geladene Schriften und zwei verzögerte Nachkontrollen.
  let fitQueued = false;
  function queueFitHeute() {
    if (fitQueued) return; fitQueued = true;
    const run = () => { fitQueued = false; fitHeute(); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run); else setTimeout(run, 16);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("resize", queueFitHeute);
    window.addEventListener("orientationchange", () => setTimeout(queueFitHeute, 300));
    window.addEventListener("pageshow", queueFitHeute);
    window.addEventListener("load", () => { queueFitHeute(); setTimeout(queueFitHeute, 400); setTimeout(queueFitHeute, 1500); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { queueFitHeute(); setTimeout(queueFitHeute, 400); } });
    if (window.visualViewport) window.visualViewport.addEventListener("resize", queueFitHeute);
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueFitHeute); } catch (e) {}
    document.addEventListener("DOMContentLoaded", () => {
      if (typeof ResizeObserver !== "function") return;
      const ro = new ResizeObserver(queueFitHeute);
      // unsichtbarer Platzhalter in Fenstergröße: meldet jede Änderung der Fensterhöhe
      const vp = document.createElement("div"); vp.className = "vp-probe"; vp.setAttribute("aria-hidden", "true"); document.body.appendChild(vp);
      [".tabbar", "header", ".vp-probe"].forEach(sel => { const el = document.querySelector(sel); if (el) { try { ro.observe(el, { box: "border-box" }); } catch (e) { ro.observe(el); } } });
    });
    // Letzte Sicherung: lässt sich Heute am Handy trotzdem scrollen, ist die gewählte Stufe zu groß – neu einpassen.
    window.addEventListener("scroll", () => {
      if (document.body.getAttribute("data-view") !== "heute" || window.innerWidth > 820) return;
      const zp = document.querySelector("#heute-content .zeitplan");
      if (zp && !zp.classList.contains("tight") && document.documentElement.scrollHeight > window.innerHeight + 2) queueFitHeute();
    }, { passive: true });
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
      .map(x => Object.assign(x, { res: computeMealView(x.rec, d, null).res }))
      .sort((a, b) => { const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1; if (fa !== fb) return fa - fb; return a.fam.name.localeCompare(b.fam.name, "de") || ((a.rec.ketocal ? 1 : 0) - (b.rec.ketocal ? 1 : 0)); });
    list.innerHTML = recs.map(x => {
      const s = sumMacros(x.res.items), vol = volumeMl(x.res.items);
      const big = d.maxMahlMl > 0 && vol > d.maxMahlMl + 0.5;
      return '<button type="button" class="pick-row" data-key="' + escapeHtml(recipeKey(x.rec)) + '"><span class="pick-icon">' + (x.rec.icon || "🥑") + '</span>' +
        '<span class="pick-name">' + escapeHtml(x.fam.name) + (isFav(x.rec) ? " ★" : "") + '</span>' +
        '<span class="pick-meta">' + fmt(s.kcal, 0) + ' kcal · <span class="pick-vol' + (big ? ' big' : '') + '">≈ ' + fmt(vol, 0) + ' ml' + (big ? ' ⚠️' : '') + '</span> · Eiweiß ' + fmt(s.eiweiss) + " g" + ((x.rec.ketocal || isMulti(x.rec)) ? " · " + (x.rec.ketocal ? "🥄 " : "") + escapeHtml(basisLabel(x.rec)) : "") + "</span></button>";
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
  // Tagesplan zum Aufhängen oder Weitergeben: Zeitplan (Uhrzeit, Was, Menge, Dauer), Hinweise zum
  // Sondieren, Tagessummen und die Mahlzeiten im Detail fürs Team.
  // Tagesplan-Ausdruck als Küchenzettel: A6 im linken oberen Viertel einer A4-Seite (zweimal falten), unten 2,5 cm frei
  // zum Einstecken, ohne Datum (der Plan gilt meist mehrere Tage). Oben der Zeitplan (Uhrzeit, Rezept bzw. Wasser, Dauer,
  // Menge – je eine Zeile), darunter jedes Rezept nur einmal mit seinen Zutaten je Portion zum Abwiegen (zwei Spalten,
  // Gramm fett) und den Uhrzeiten, zu denen es gegeben wird. Die Schrift passt sich an (fitKitchenCard).
  function printDayPlan(d, facts) {
    const times = zeitTimes(d), dm = dayMeals(d), wp = waterPlan(d, dm.sum, times);
    const rows = [], groups = [];
    times.meals.forEach((t, i) => {
      const m = dm.meals[i], f = facts[i];
      const w = m.rec ? "<span class='n'>" + escapeHtml(m.rec.name) + "</span> <i class='d'>" + sondierMin(m.vol) + " min</i>"
        : "<span class='n'>" + (m.bad ? escapeHtml(m.bad.name) : "Rezept offen") + "</span> <i class='d'>" + (m.bad ? "passt nicht – anderes Rezept wählen" : "noch kein Rezept gewählt") + "</i>";
      rows.push({ t, h: "<div class='r me'><span class='t'>" + fmtHM(t) + "</span><span class='w'>" + w + "</span><span class='m'>" + (m.est ? "ca. " : "") + fmt(m.vol, 0) + " ml</span></div>" });
      if (!f) return;
      // gleiches Rezept mit gleichen Mengen nur einmal, mit allen Uhrzeiten
      const items = f.res.items.filter(it => num(it.grams) > 0).sort((a, b) => isOilName(a.food) - isOilName(b.food));
      const sig = f.rec.name + "|" + items.map(it => it.food + ":" + fmt(num(it.grams), 1)).join(",");
      const g = groups.find(x => x.sig === sig);
      if (g) g.times.push(t); else groups.push({ sig, name: f.rec.name, items, times: [t] });
    });
    if (wp.per > 0) times.gifts.forEach(g => rows.push({ t: g.t, h: "<div class='r wa'><span class='t'>" + fmtHM(g.t) + "</span><span class='w'><span class='n'>Wasser</span> <i class='d'>" + (g.kind === "abend" ? "vor dem Schlafen · " : "") + wasserMin(wp.per) + " min</i></span><span class='m'>" + fmt(wp.per, 0) + " ml</span></div>" }));
    if (times.schlaf != null) rows.push({ t: times.schlaf, h: "<div class='r sl'><span class='t'>" + fmtHM(times.schlaf) + "</span><span class='w'><span class='n'>Schlafen</span></span><span class='m'></span></div>" });
    rows.sort((a, b) => a.t - b.t);
    const rez = groups.map(g => "<div class='rb'><div class='rn'><b>" + escapeHtml(g.name) + "</b> <i>" + g.times.map(fmtHM).join(" · ") + "</i></div><div class='z'>" +
      g.items.map(it => '<span class="i"><span>' + escapeHtml(shortFood(it.food).replace(/\s*C8\+C10/, "")) + "</span><b>" + gramsShort(num(it.grams)) + "</b></span>").join("") + "</div></div>").join("");
    const html = "<!DOCTYPE html><html lang='de'><head><meta charset='utf-8'><title>Tagesplan</title><style>" + KITCHEN_CSS + "</style></head><body>" +
      "<div class='kz-page'><div class='kz'><div class='kz-h'><div class='ti'><small>HamHam Keto</small><b>Tagesplan</b></div>" +
      "<div class='rx'><span class='pill'>Verhältnis " + fmtTarget(d.ratio) + "</span><small>" + fmt(d.kcal, 0) + " kcal" + (d.fluidDay > 0 ? " · " + fmt(d.fluidDay, 0) + " ml" : "") + " pro Tag</small></div></div>" +
      "<div class='lbl'>Zeitplan</div>" + rows.map(r => r.h).join("") +
      (rez ? "<div class='lbl'>Zutaten je Portion</div>" + rez : "") + "</div>" +
      "<div class='kz-fold v'></div><div class='kz-fold h'></div></div></body></html>";
    openPrintView(html, "Tagesplan " + fileDate());
  }

  /* ---------- Zeitplan: Uhrzeiten für Mahlzeiten und Wassergaben ----------
     Die Mahlzeiten liegen gleichmäßig zwischen erster und letzter Mahlzeit. Wasser kommt in die Mitte jeder Pause
     (dann ist der Magen weitgehend leer) und – wenn eine Schlafenszeit eingetragen ist – einmal zwischen letzter
     Mahlzeit und Schlafen. Die Menge je Wassergabe ergibt sich aus dem Tagesziel: Flüssigkeit am Tag minus
     Flüssigkeit der Mahlzeiten, gleichmäßig auf alle Wassergaben verteilt (auf 5 ml gerundet). */
  const ZP_DEFAULT = { erste: "07:00", letzte: "17:30", schlaf: "20:00" };
  function parseHM(v) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(v == null ? "" : v));
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    return (h < 24 && mi < 60) ? h * 60 + mi : null;
  }
  function fmtHM(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return Math.floor(min / 60) + ":" + String(min % 60).padStart(2, "0"); }
  function fmtDauer(min) { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? h + " h" + (m ? " " + m + " min" : "") : m + " min"; }
  const round5 = (m) => Math.round(m / 5) * 5;
  // Sondierdauer einer Mahlzeit: langsam, etwa 5 ml pro Minute (fettreiche Kost dehnt den Magen sonst auf einmal),
  // auf 5 Minuten gerundet, mindestens 10 Minuten. Wasser darf schneller gehen: etwa 15 ml pro Minute, mindestens 5 Minuten.
  const SONDIER_ML_MIN = 5, WASSER_ML_MIN = 15;
  function sondierMin(vol) { return Math.max(10, round5(vol / SONDIER_ML_MIN)); }
  function wasserMin(vol) { return Math.max(5, round5(vol / WASSER_ML_MIN)); }
  // Eingestellte Uhrzeiten (leer = Vorgabe; Schlafen darf leer sein = keine Abendgabe).
  function zeitSettings() {
    const s = state.settings;
    const erste = parseHM(s.zpErste) != null ? s.zpErste : ZP_DEFAULT.erste;
    const letzte = parseHM(s.zpLetzte) != null ? s.zpLetzte : ZP_DEFAULT.letzte;
    const schlaf = s.zpSchlaf == null ? ZP_DEFAULT.schlaf : (parseHM(s.zpSchlaf) != null ? s.zpSchlaf : "");
    return { erste, letzte, schlaf };
  }
  function zeitTimes(d) {
    const z = zeitSettings(), n = d.mahl;
    const erste = parseHM(z.erste);
    let letzte = parseHM(z.letzte), bad = false;
    if (n > 1 && letzte <= erste) { bad = true; letzte = erste + (n - 1) * 180; }
    const step = n > 1 ? (letzte - erste) / (n - 1) : 0;
    const meals = []; for (let i = 0; i < n; i++) meals.push(i === n - 1 && n > 1 ? letzte : round5(erste + i * step));
    const gifts = [];
    for (let i = 0; i < n - 1; i++) gifts.push({ t: round5((meals[i] + meals[i + 1]) / 2), kind: "pause", after: i });
    let schlaf = parseHM(z.schlaf); const last = meals[n - 1];
    if (schlaf != null && schlaf < erste) schlaf += 1440;          // Schlafen nach Mitternacht (z. B. 0:30)
    const schlafBad = schlaf != null && schlaf <= last;            // Schlafen vor/zur letzten Mahlzeit → Hinweis
    if (schlaf != null && schlaf - last >= 45) gifts.push({ t: round5(last + (schlaf - last) / 2), kind: "abend", after: n - 1 });
    return { meals, gifts, schlaf: schlaf != null && schlaf > last ? schlaf : null, schlafBad, interval: n > 1 ? step : null, bad, z };
  }
  // Wassergaben für eine Tagesmenge aus den Mahlzeiten (Summe der Flüssigkeit aller Mahlzeiten).
  function waterPlan(d, mealFluidSum, times) {
    const rest = d.fluidDay - mealFluidSum;
    const nG = times.gifts.length;
    const per = (d.fluidDay > 0 && rest > 10 && nG > 0) ? Math.max(10, Math.round(rest / nG / 5) * 5) : 0;
    return { rest, per, n: per > 0 ? nG : 0, total: mealFluidSum + per * (per > 0 ? nG : 0),
      over: d.maxMahlMl > 0 && per > d.maxMahlMl };
  }
  // Durchschnittliche Flüssigkeit einer Mahlzeit über alle Rezepte – Schätzung für noch offene Plätze im Tagesplan.
  let avgFluidMemo = { key: null, v: 0, vol: 0 };
  function avgMealFluid(d) {
    const key = JSON.stringify([state.settings, state.water, state.portion, (state.savedRecipes || []).length]);
    if (avgFluidMemo.key === key) return avgFluidMemo;
    let sum = 0, vol = 0, n = 0;
    allRecipes().forEach(rec => {
      if (state.settings.hideKeto && rec.ketocal) return;
      const mv = computeMealView(rec, d, null); if (!mv.res.ok) return;
      sum += mv.fluid; vol += volumeMl(mv.res.items); n++;
    });
    avgFluidMemo = { key, v: n ? sum / n : 0, vol: n ? vol / n : 0 };
    return avgFluidMemo;
  }
  // Mahlzeiten des Tages: gewähltes Rezept oder Schätzung, dazu Flüssigkeit und Volumen.
  function dayMeals(d) {
    ensureDayPlan(d);
    // Ein geplantes Rezept, das die Verordnung nicht (mehr) erreicht (z. B. nach Änderung des Verhältnisses),
    // zählt wie eine offene Mahlzeit und wird markiert – seine unangepassten Gramm dürfen nicht gefüttert werden.
    const bad = [];
    const list = state.dayPlan.map((sl, i) => {
      const rec = recipeByKey(sl && sl.key); if (!rec) return null;
      const f = mealFacts(rec, d); if (!f.res.ok) { bad[i] = rec; return null; }
      return { rec, f, fluid: f.fluid, vol: volumeMl(f.res.items) };
    });
    const known = list.filter(Boolean);
    const est = known.length ? { v: known.reduce((a, x) => a + x.fluid, 0) / known.length, vol: known.reduce((a, x) => a + x.vol, 0) / known.length } : avgMealFluid(d);
    const meals = list.map((x, i) => x || { rec: null, f: null, fluid: est.v, vol: est.vol, est: true, bad: bad[i] || null });
    return { meals, sum: meals.reduce((a, x) => a + x.fluid, 0), known: known.length };
  }
  // Kurzfassung der Wassergaben (Kopfzeile, Vorgaben): „4 × 130 ml“.
  function waterGiftsText(d) {
    const dm = dayMeals(d), wp = waterPlan(d, dm.sum, zeitTimes(d));
    return { wp, text: wp.per > 0 ? wp.n + " × " + fmt(wp.per, 0) + " ml" : "keine", est: dm.known < d.mahl };
  }
  // Uhrzeiten-Felder sind eingeklappt (⏰ im Kopf klappt sie auf); bei ungültigen Zeiten immer offen.
  let zpEdit = false;
  // Hinweise zum Zeitplan (Abstand, Schlafen, Wassermenge).
  function zeitplanNotes(d, times, dm, wp) {
    const notes = [];
    const lastMeal = times.meals[times.meals.length - 1];
    if (times.schlafBad) notes.push('<div class="note warn">⚠️ Schlafen liegt vor der letzten Mahlzeit – bitte die Uhrzeiten unter ⏰ prüfen.</div>');
    if (times.bad) notes.push('<div class="note warn">⚠️ Die letzte Mahlzeit muss nach der ersten liegen – bitte die Uhrzeiten prüfen.</div>');
    if (times.interval != null && times.interval < 180) notes.push('<div class="note warn" title="Steht beim Öffnen noch Nahrung an, 30–60 Minuten warten.">⚠️ Nur ' + fmtDauer(times.interval) + ' Abstand – Keto-Kost braucht oft 3–4 h.</div>');
    if (times.schlaf != null && times.schlaf - lastMeal < 120) notes.push('<div class="note warn" title="Sonst droht Rückfluss im Liegen.">⚠️ Letzte Mahlzeit nur ' + fmtDauer(times.schlaf - lastMeal) + ' vor dem Schlafen – 2 h einplanen.</div>');
    if (wp.over) notes.push('<div class="note warn">⚠️ ' + fmt(wp.per, 0) + ' ml je Wassergabe – über ' + fmt(d.maxMahlMl, 0) + ' ml auf einmal. Schlafenszeit eintragen oder Wasser auf mehr Gaben verteilen.</div>');
    if (d.fluidDay > 0 && wp.rest < -10) notes.push('<div class="note tip">💧 Die Mahlzeiten liefern schon ' + fmt(-wp.rest, 0) + ' ml mehr als das Tagesziel – keine Wassergaben nötig.</div>');
    return notes.join("");
  }
  function zeitplanSettings(times) {
    const field = (id, label, val) => '<label class="zp-f"><span>' + label + '</span><input id="' + id + '" type="time" value="' + escapeHtml(String(val)) + '"></label>';
    return '<div class="zp-set"' + (zpEdit || times.bad ? "" : " hidden") + '>' +
      field("zp-erste", "Erste Mahlzeit", times.z.erste) + field("zp-letzte", "Letzte Mahlzeit", times.z.letzte) + field("zp-schlaf", "Schlafen", times.z.schlaf) + '</div>';
  }
  // Wasser- und Schlafzeilen der Zeitleiste (die Mahlzeiten-Zeilen baut renderHeute).
  function zeitplanExtraRows(times, wp) {
    const rows = [];
    // Gibt es eine Abendgabe, steht das Schlafen ganz rechts in derselben Zeile (🌙 Uhrzeit, spart eine Zeile).
    const sleepInline = wp.per > 0 && times.schlaf != null && times.gifts.some(g => g.kind === "abend");
    if (wp.per > 0) times.gifts.forEach(g => rows.push({ t: g.t, html: '<div class="zp-row water"><span class="zp-time">' + fmtHM(g.t) + '</span><span class="zp-ic">💧</span>' +
      '<span class="zp-txt"><strong>' + fmt(wp.per, 0) + ' ml Wasser</strong></span>' +
      (g.kind === "abend" && sleepInline ? '<span class="zp-sleep" title="Schlafen ' + fmtHM(times.schlaf) + '">🌙 ' + fmtHM(times.schlaf) + '</span>' : '') +
      // Dauer in der Spalte, in der bei den Mahlzeiten die Dauer steht (fitHeute misst die Position, --wmin-r)
      '<span class="zp-wmin" title="etwa ' + WASSER_ML_MIN + ' ml pro Minute">' + wasserMin(wp.per) + ' min</span></div>' }));
    if (times.schlaf != null && !sleepInline) rows.push({ t: times.schlaf, html: '<div class="zp-row sleep"><span class="zp-time">' + fmtHM(times.schlaf) + '</span><span class="zp-ic">🌙</span><span class="zp-txt">Schlafen</span></div>' });
    return rows;
  }
  function bindZeitplan(box) {
    const set = (key, v) => { state.settings[key] = v; save(); renderRezepte(); };
    [["zp-erste", "zpErste"], ["zp-letzte", "zpLetzte"], ["zp-schlaf", "zpSchlaf"]].forEach(([id, key]) => {
      const el = box.querySelector("#" + id); if (!el) return;
      el.addEventListener("change", () => set(key, el.value || (key === "zpSchlaf" ? "" : null)));
    });
    const tg = box.querySelector("#zp-toggle");
    if (tg) tg.addEventListener("click", () => { zpEdit = !zpEdit; renderHeute(); });
  }

  /* ---------- Erinnerungen (Web-Push über den eigenen Cloudflare-Dienst, siehe push-worker/) ----------
     Die App meldet das Gerät beim Dienst an und schickt ihm die Erinnerungen des Tages (Uhrzeit, Titel, Text).
     Der Dienst verschickt sie täglich zur fälligen Minute, bis ein neuer Plan kommt. Abgeglichen wird
     automatisch, sobald sich Uhrzeiten, Rezepte oder Wassergaben ändern (und einmal am Tag beim Öffnen). */
  const PUSH_URL_DEFAULT = "https://hamham-push.klemens-sailer.workers.dev"; // eigener Worker (in den Vorgaben änderbar)
  function pushUrl() { return String(state.settings.pushUrl || PUSH_URL_DEFAULT || "").trim().replace(/\/+$/, ""); }
  function pushSupport() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return { ok: false, why: "Nur in der Online-Version (GitHub Pages), nicht in der Einzeldatei." };
    if (ios && !standalone) return { ok: false, why: "Am iPhone nur in der App vom Home-Bildschirm (Teilen → „Zum Home-Bildschirm“), nicht im Safari-Tab." };
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return { ok: false, why: "Dieses Gerät bzw. dieser Browser kann keine Push-Nachrichten empfangen." };
    return { ok: true };
  }
  const pushOpt = () => { const s = state.settings; return { meals: s.pushMeals !== false, water: s.pushWater !== false, lead: s.pushLead == null ? 5 : num(s.pushLead) }; };
  // Erinnerungen des Tages aus dem Zeitplan
  function pushItems(d) {
    const o = pushOpt(), times = zeitTimes(d), dm = dayMeals(d), wp = waterPlan(d, dm.sum, times), items = [];
    if (o.meals) times.meals.forEach((t, i) => {
      const m = dm.meals[i];
      items.push({ at: fmtHM(t - o.lead), tag: "m" + (i + 1), title: "🍽️ Mahlzeit " + (i + 1) + " · " + fmtHM(t),
        body: (m.rec ? m.rec.name + " · ≈ " : "Rezept noch offen · ≈ ") + fmt(m.vol, 0) + " ml · " + sondierMin(m.vol) + " min" });
    });
    if (o.water && wp.per > 0) times.gifts.forEach((g, k) => {
      items.push({ at: fmtHM(g.t - o.lead), tag: "w" + (k + 1), title: "💧 Wasser · " + fmtHM(g.t), body: fmt(wp.per, 0) + " ml Wasser" + (g.kind === "abend" ? " vor dem Schlafen" : "") + " · " + wasserMin(wp.per) + " min" });
    });
    return items;
  }
  function b64uToBytes(s) { const p = s.replace(/-/g, "+").replace(/_/g, "/"), bin = atob(p + "===".slice((p.length + 3) % 4)); return Uint8Array.from(bin, c => c.charCodeAt(0)); }
  async function pushPost(path, data) {
    const r = await fetch(pushUrl() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error("Dienst antwortet " + r.status);
    return r.json();
  }
  async function pushSubscription(create) {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub && create) {
      const k = await (await fetch(pushUrl() + "/api/key")).json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(k.publicKey) });
    }
    return sub;
  }
  const PUSH_SYNC_KEY = STORAGE_KEY + ".pushSync";
  async function pushSync(force) {
    if (!state.settings.pushOn || !pushUrl() || !pushSupport().ok) return;
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "Europe/Vienna";
    const items = pushItems(derived()), today = new Date().toDateString();
    const sig = JSON.stringify([tz, items]);
    let last = null; try { last = JSON.parse(localStorage.getItem(PUSH_SYNC_KEY) || "null"); } catch (e) {}
    if (!force && last && last.sig === sig && last.day === today) return;
    try {
      const sub = await pushSubscription(false);
      if (!sub) { state.settings.pushOn = false; save(); renderPushCard(); return; }
      await pushPost("/api/sync", { subscription: sub.toJSON(), tz, items });
      try { localStorage.setItem(PUSH_SYNC_KEY, JSON.stringify({ sig, day: today, at: Date.now(), n: items.length })); } catch (e) {}
      pushError = "";
    } catch (e) { pushError = "Abgleich fehlgeschlagen (" + (e && e.message || e) + ") – wird beim nächsten Öffnen wiederholt."; }
    renderPushCard();
  }
  let pushTimer = null, pushError = "";
  function schedulePushSync() { if (!state.settings.pushOn) return; clearTimeout(pushTimer); pushTimer = setTimeout(() => pushSync(false), 1500); }
  async function pushEnable() {
    const sup = pushSupport(); if (!sup.ok) { showToast("🔔 " + escapeHtml(sup.why)); return; }
    if (!pushUrl()) { showToast("🔔 Zuerst die Adresse des Dienstes eintragen (ⓘ Wie funktioniert das?)."); return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { showToast("🔔 Mitteilungen sind nicht erlaubt – in den iPhone-Einstellungen unter Mitteilungen → HamHam Keto erlauben."); return; }
      await pushSubscription(true);
      state.settings.pushOn = true; save();
      await pushSync(true);
      showToast(pushError ? "🔔 " + escapeHtml(pushError) : "🔔 Erinnerungen eingeschaltet");
    } catch (e) { showToast("🔔 Einschalten fehlgeschlagen: " + escapeHtml(String(e && e.message || e))); }
    renderPushCard();
  }
  async function pushDisable() {
    state.settings.pushOn = false; save();
    try {
      const sub = await pushSubscription(false);
      if (sub) { try { await pushPost("/api/remove", { endpoint: sub.endpoint }); } catch (e) {} await sub.unsubscribe(); }
    } catch (e) {}
    try { localStorage.removeItem(PUSH_SYNC_KEY); } catch (e) {}
    showToast("🔕 Erinnerungen ausgeschaltet"); renderPushCard();
  }
  async function pushTest() {
    try {
      const sub = await pushSubscription(false); if (!sub) { showToast("🔔 Erst die Erinnerungen einschalten."); return; }
      await pushPost("/api/test", { subscription: sub.toJSON() });
      showToast("🔔 Testnachricht verschickt – sie sollte gleich erscheinen.");
    } catch (e) { showToast("🔔 Test fehlgeschlagen: " + escapeHtml(String(e && e.message || e))); }
  }
  // Karte in den Vorgaben
  function renderPushCard() {
    const st = document.getElementById("push-status"); if (!st) return;
    const s = state.settings, o = pushOpt(), sup = pushSupport(), on = !!s.pushOn;
    let last = null; try { last = JSON.parse(localStorage.getItem(PUSH_SYNC_KEY) || "null"); } catch (e) {}
    st.className = "note " + (!sup.ok || pushError ? "warn" : on ? "tip" : "info");
    st.innerHTML = !sup.ok ? escapeHtml(sup.why)
      : !pushUrl() ? "Noch nicht eingerichtet: Adresse des Dienstes unter „ⓘ Wie funktioniert das?“ eintragen."
      : pushError ? escapeHtml(pushError)
      : on ? "<strong>Eingeschaltet</strong>" + (last ? " · " + last.n + " Erinnerungen am Tag, zuletzt abgeglichen " + new Date(last.at).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) : "")
      : "Ausgeschaltet.";
    const t = document.getElementById("push-toggle"); if (t) { t.textContent = on ? "🔕 Ausschalten" : "🔔 Erinnerungen einschalten"; t.classList.toggle("secondary", on); t.disabled = !sup.ok; }
    const te = document.getElementById("push-test"); if (te) te.hidden = !on;
    const pm = document.getElementById("push-meals"); if (pm) pm.checked = o.meals;
    const pw = document.getElementById("push-water"); if (pw) pw.checked = o.water;
    const pl = document.getElementById("push-lead"); if (pl) pl.value = String(o.lead);
    const pu = document.getElementById("push-url"); if (pu && document.activeElement !== pu) pu.value = s.pushUrl || PUSH_URL_DEFAULT;
  }
  function bindPush() {
    const t = document.getElementById("push-toggle"); if (!t) return;
    t.addEventListener("click", () => { state.settings.pushOn ? pushDisable() : pushEnable(); });
    document.getElementById("push-test").addEventListener("click", pushTest);
    const opt = (id, key, val) => document.getElementById(id).addEventListener("change", (e) => { state.settings[key] = val(e.target); save(); renderPushCard(); schedulePushSync(); });
    opt("push-meals", "pushMeals", (el) => el.checked);
    opt("push-water", "pushWater", (el) => el.checked);
    opt("push-lead", "pushLead", (el) => num(el.value));
    document.getElementById("push-url").addEventListener("change", (e) => { state.settings.pushUrl = e.target.value.trim(); save(); renderPushCard(); schedulePushSync(); });
    renderPushCard();
    if (state.settings.pushOn) setTimeout(() => pushSync(false), 800);
  }

  /* ---------- Geräte-Abgleich (freiwillig) ----------
     Gleicht Vorgaben, Tagesplan, eigene Rezepte, Favoriten und gemerkte Mengen zwischen den eigenen Geräten ab –
     über denselben Cloudflare-Dienst wie die Erinnerungen. Ende-zu-Ende verschlüsselt: Die Geräte teilen einen
     geheimen Schlüssel (AES-GCM); der Dienst kennt nur dessen SHA-256 als Adresse und speichert unlesbare Blöcke.
     Ein weiteres Gerät wird mit einem 8-stelligen Code gekoppelt (15 Minuten gültig, einmal verwendbar; der Schlüssel
     liegt dabei mit dem Code verschlüsselt beim Dienst).
     Zusammenführen: Jede Einheit (eine Einstellung, der Tagesplan, die Favoriten …) trägt den Zeitpunkt ihrer letzten
     Änderung; die jüngere gewinnt. Was nur für ein Gerät gilt (Ansicht, Filter, Erinnerungen, Editor-Entwurf), bleibt lokal. */
  const SYNC_KEY = "ketoplaner.sync";
  const SYNC_PARTS = ["favorites", "savedRecipes", "scales", "water", "portion", "dayPlan", "basis"];
  const SYNC_LOCAL_SETTINGS = ["view", "filter", "sort", "onlyQuelle", "hideKeto", "detailTab", "theme", "pushOn", "pushUrl", "pushMeals", "pushWater", "pushLead"];
  const PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let syncMeta = null, syncBusy = false, syncAgain = false, syncTimer = null, syncError = "", syncLastJson = null;

  function syncLoadMeta() {
    if (syncMeta) return syncMeta;
    try { syncMeta = JSON.parse(localStorage.getItem(SYNC_KEY) || "null"); } catch (e) { syncMeta = null; }
    return syncMeta;
  }
  function syncSaveMeta() { try { if (syncMeta) localStorage.setItem(SYNC_KEY, JSON.stringify(syncMeta)); else localStorage.removeItem(SYNC_KEY); } catch (e) {} }
  const syncOn = () => !!(syncLoadMeta() && syncMeta.key);
  function syncSupport() { return !!(window.crypto && window.crypto.subtle && window.fetch && window.TextEncoder); }

  // ---- Einheiten des Zustands ----
  function syncUnits() {
    const u = {};
    SYNC_PARTS.forEach(k => { u[k] = state[k]; });
    Object.keys(state.settings).forEach(k => { if (SYNC_LOCAL_SETTINGS.indexOf(k) === -1 && state.settings[k] !== undefined) u["s:" + k] = state.settings[k]; });
    return u;
  }
  function syncApplyUnit(name, unit) {
    if (name.indexOf("s:") === 0) {
      const k = name.slice(2); if (SYNC_LOCAL_SETTINGS.indexOf(k) !== -1) return;
      if (unit.del) delete state.settings[k]; else state.settings[k] = unit.v;
    } else if (SYNC_PARTS.indexOf(name) !== -1 && !unit.del) state[name] = unit.v;
  }
  // Geänderte Einheiten mit Zeitstempel versehen (Vergleich mit dem zuletzt bekannten Stand)
  function syncMarkChanges(now) {
    const m = syncLoadMeta(); if (!m) return false;
    const u = syncUnits(), cur = {};
    Object.keys(u).forEach(k => { cur[k] = JSON.stringify(u[k]); });
    const prev = syncLastJson || m.last || {};
    m.ts = m.ts || {};
    let changed = false;
    Object.keys(cur).forEach(k => { if (prev[k] !== cur[k]) { m.ts[k] = now; changed = true; } });
    Object.keys(prev).forEach(k => { if (!(k in cur)) { m.ts[k] = -now; changed = true; } }); // gelöscht: negativer Zeitstempel
    syncLastJson = cur; m.last = cur;
    if (changed) m.dirty = true;
    syncSaveMeta();
    return changed;
  }

  // ---- Krypto ----
  const b64u = (bytes) => btoa(String.fromCharCode.apply(null, Array.from(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = (s) => { const p = String(s).replace(/-/g, "+").replace(/_/g, "/"), bin = atob(p + "===".slice((p.length + 3) % 4)); return Uint8Array.from(bin, c => c.charCodeAt(0)); };
  async function sha256hex(text) {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    return Array.from(h).map(x => x.toString(16).padStart(2, "0")).join("");
  }
  async function aesKey(raw) { return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]); }
  async function sealText(key, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
    return b64u(iv) + "." + b64u(ct);
  }
  async function openText(key, sealed) {
    const [iv, ct] = String(sealed).split(".");
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv) }, key, unb64u(ct)));
  }
  async function pairKey(code) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: new TextEncoder().encode("hamham-keto-pair"), iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  const syncId = (m) => sha256hex("hamham-sync:" + m.key);
  async function syncPost(path, data) {
    const r = await fetch(pushUrl() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (r.status === 404 && path.indexOf("/api/state/") === 0 && j && j.error === "not found") throw new Error("Der Dienst kennt den Abgleich noch nicht – bitte den Worker aktualisieren (ⓘ).");
    return { status: r.status, j: j || {} };
  }

  // ---- Abgleich ----
  // Holt den Stand vom Dienst, führt zusammen (jüngere Einheit gewinnt) und schickt den eigenen Stand, falls nötig.
  async function syncNow(opts) {
    opts = opts || {};
    if (!syncOn() || !syncSupport() || !pushUrl()) return;
    if (syncBusy) { syncAgain = true; return; }
    syncBusy = true;
    const m = syncMeta;
    try {
      syncMarkChanges(Date.now());
      const id = await syncId(m), key = await aesKey(unb64u(m.key));
      for (let attempt = 0; attempt < 4; attempt++) {
        const got = await syncPost("/api/state/get", { id });
        const remoteRev = got.j.rev || 0;
        let remote = null;
        if (remoteRev > 0 && got.j.data) remote = JSON.parse(await openText(key, got.j.data));
        let applied = false, needPush = !remote || m.dirty;
        if (remote && remoteRev !== m.rev) {
          // jüngere Einheit gewinnt; beim Koppeln (fresh) gewinnt immer der Stand der anderen Geräte
          const ru = remote.units || {};
          Object.keys(ru).forEach(name => {
            const rt = Math.abs(ru[name].ts || 0), lt = m.fresh ? -1 : Math.abs((m.ts || {})[name] || 0);
            if (rt > lt) { syncApplyUnit(name, ru[name]); m.ts[name] = ru[name].ts; applied = true; }
          });
          const lu = syncUnits();
          Object.keys(lu).forEach(name => { if (!m.fresh && (!ru[name] || Math.abs((m.ts || {})[name] || 0) > Math.abs(ru[name].ts || 0))) needPush = true; });
          m.fresh = false;
        }
        if (applied) {
          // übernommenen Stand speichern, ohne ihn als eigene Änderung zu werten
          save(true);
          syncLastJson = null; const u = syncUnits(); m.last = {}; Object.keys(u).forEach(k => { m.last[k] = JSON.stringify(u[k]); }); syncLastJson = m.last;
          if (typeof renderRezepte === "function") renderRezepte();
        }
        m.rev = remoteRev; m.fresh = false;
        if (!needPush) { m.dirty = false; break; }
        const units = {}, cur = syncUnits();
        Object.keys(cur).forEach(name => { units[name] = { ts: (m.ts || {})[name] || Date.now(), v: cur[name] }; });
        Object.keys(m.ts || {}).forEach(name => { if (!(name in cur) && m.ts[name] < 0) units[name] = { ts: m.ts[name], del: true }; });
        const put = await syncPost("/api/state/put", { id, baseRev: remoteRev, data: await sealText(key, JSON.stringify({ v: 1, units })) });
        if (put.status === 409) continue; // inzwischen neuer Stand – noch einmal holen und zusammenführen
        if (put.status !== 200) throw new Error("Dienst antwortet " + put.status);
        m.rev = put.j.rev; m.dirty = false;
        break;
      }
      m.at = Date.now(); syncError = "";
    } catch (e) {
      syncError = String(e && e.message || e);
    } finally {
      syncSaveMeta(); syncBusy = false;
      if (typeof renderSyncCard === "function") renderSyncCard();
      if (syncAgain) { syncAgain = false; syncNow(); }
    }
  }
  // nach jeder lokalen Änderung (save) kurz warten und abgleichen
  function syncAfterSave() {
    if (!syncOn()) return;
    syncMarkChanges(Date.now());
    if (!syncMeta.dirty) return;
    clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 2000);
  }

  // ---- Ein-/Ausschalten und Koppeln ----
  async function syncEnable() {
    if (!syncSupport()) { showToast("🔄 Dieses Gerät kann nicht verschlüsselt abgleichen."); return; }
    const raw = crypto.getRandomValues(new Uint8Array(32));
    syncMeta = { key: b64u(raw), rev: 0, ts: {}, dirty: true }; syncLastJson = null;
    syncMarkChanges(Date.now()); syncMeta.dirty = true; syncSaveMeta();
    await syncNow(); syncStartTimer();
    showToast(syncError ? "🔄 " + escapeHtml(syncError) : "🔄 Abgleich eingeschaltet – jetzt weitere Geräte verbinden.");
    renderSyncCard();
  }
  function randomCode() {
    const r = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(r, x => PAIR_ALPHABET[x % PAIR_ALPHABET.length]).join("");
  }
  const fmtCode = (c) => c.slice(0, 4) + "-" + c.slice(4);
  let pairShown = null; // { code, until }
  async function syncShowCode() {
    if (!syncOn()) return;
    try {
      const code = randomCode(), id = await sha256hex("hamham-pair:" + code);
      const blob = await sealText(await pairKey(code), syncMeta.key);
      const r = await syncPost("/api/pair/put", { id, blob });
      if (r.status !== 200) throw new Error(r.j.error || "Dienst antwortet " + r.status);
      pairShown = { code, until: Date.now() + 15 * 60000 };
      syncError = "";
    } catch (e) { syncError = String(e && e.message || e); }
    renderSyncCard();
  }
  async function syncJoin(input) {
    const code = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/0/g, "O").replace(/[1I]/g, "L");
    if (code.length !== 8) { showToast("🔄 Bitte den 8-stelligen Code eingeben (z. B. ABCD-EFGH)."); return; }
    if (!syncSupport()) { showToast("🔄 Dieses Gerät kann nicht verschlüsselt abgleichen."); return; }
    try {
      const id = await sha256hex("hamham-pair:" + code);
      const r = await syncPost("/api/pair/get", { id });
      if (r.status === 404) throw new Error("Code unbekannt oder abgelaufen – am anderen Gerät einen neuen Code erzeugen.");
      if (r.status !== 200) throw new Error("Dienst antwortet " + r.status);
      const keyB64 = await openText(await pairKey(code), r.j.blob);
      // Beim Koppeln übernimmt dieses Gerät den gemeinsamen Stand (eigene Daten werden ersetzt)
      syncMeta = { key: keyB64, rev: 0, ts: {}, fresh: true, dirty: false }; syncLastJson = null; syncSaveMeta();
      await syncNow(); syncStartTimer();
      showToast(syncError ? "🔄 " + escapeHtml(syncError) : "🔄 Verbunden – dieses Gerät ist jetzt abgeglichen.");
    } catch (e) { showToast("🔄 " + escapeHtml(String(e && e.message || e))); }
    renderSyncCard();
  }
  function syncDisable() {
    if (!confirm("Abgleich auf diesem Gerät ausschalten? Die Daten bleiben hier erhalten, werden aber nicht mehr mit den anderen Geräten abgeglichen.")) return;
    syncMeta = null; syncLastJson = null; pairShown = null; syncError = ""; syncSaveMeta();
    showToast("🔄 Abgleich auf diesem Gerät ausgeschaltet."); renderSyncCard();
  }

  // ---- Karte in den Vorgaben ----
  function renderSyncCard() {
    if (!window.document) return; // Fenster schon geschlossen (später eintreffende Antwort)
    const st = document.getElementById("sync-status"); if (!st) return;
    const on = syncOn(), m = syncMeta;
    st.className = "note " + (syncError ? "warn" : on ? "tip" : "info");
    st.innerHTML = !syncSupport() ? "Dieses Gerät bzw. dieser Browser kann nicht verschlüsselt abgleichen."
      : syncError ? escapeHtml(syncError)
      : on ? "<strong>Eingeschaltet</strong>" + (m.at ? " · zuletzt abgeglichen " + new Date(m.at).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) : "")
      : "Ausgeschaltet – alles bleibt nur auf diesem Gerät.";
    const show = (id, v) => { const el = document.getElementById(id); if (el) el.hidden = !v; };
    show("sync-enable", !on); show("sync-join-row", !on);
    show("sync-code-btn", on); show("sync-now", on); show("sync-off", on);
    const pc = document.getElementById("sync-code");
    if (pc) {
      const valid = on && pairShown && pairShown.until > Date.now();
      pc.hidden = !valid;
      if (valid) pc.innerHTML = "Code für das andere Gerät: <strong class=\"sync-code\">" + fmtCode(pairShown.code) + "</strong><br><small>Am anderen Gerät unter Vorgaben → 🔄 Geräte abgleichen → „Mit Code verbinden“ eingeben. Gültig bis " +
        new Date(pairShown.until).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) + ", nur einmal verwendbar.</small>";
    }
  }
  function bindSync() {
    const en = document.getElementById("sync-enable"); if (!en) return;
    en.addEventListener("click", syncEnable);
    document.getElementById("sync-join").addEventListener("click", () => syncJoin(document.getElementById("sync-join-code").value));
    document.getElementById("sync-code-btn").addEventListener("click", syncShowCode);
    document.getElementById("sync-now").addEventListener("click", () => syncNow());
    document.getElementById("sync-off").addEventListener("click", syncDisable);
    renderSyncCard();
    // Abgleich beim Start, beim Zurückkehren in die App, wenn wieder online und jede Minute (nur wenn eingeschaltet)
    document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNow(); });
    window.addEventListener("online", () => syncNow());
    if (syncOn()) { setTimeout(() => syncNow(), 600); syncStartTimer(); }
  }
  let syncInterval = null;
  function syncStartTimer() { if (!syncInterval) syncInterval = setInterval(() => { if (!syncOn()) { clearInterval(syncInterval); syncInterval = null; } else if (!document.hidden) syncNow(); }, 60000); }

  /* ---------- Drucken und Teilen (A4 Hochformat) ----------
     Der Ausdruck öffnet sich als Vorschau in der App (kein neues Fenster – in der installierten iPhone-App gäbe es
     dort weder Zurück noch zuverlässig einen Druckdialog). Inhalt und Stil liegen in einem Shadow-DOM, damit die
     Druckformatierung die App nicht berührt; gedruckt wird nur die Vorschau (@media print in styles.css).
     „📤 Teilen“ erzeugt aus derselben Vorlage ein PDF (jsPDF, offline eingebettet) und öffnet das Teilen-Menü. */
  let printCurrent = null; // { html, title, file } der offenen Vorschau – Grundlage fürs PDF
  function openPrintView(html, file) {
    const rawCss = ((html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "");
    const pageRule = (rawCss.match(/@page\s*\{[^}]*\}/) || [""])[0];
    const css = rawCss.replace(/@page\s*\{[^}]*\}/g, "").replace(/(^|[}\s])body\s*\{/g, "$1:host{");
    // Seitenformat der Vorlage (z. B. A4 quer beim Tagesplan) gilt beim Drucken; die Vorschau zeigt die Seite so
    let ps = document.getElementById("print-page-style");
    if (!ps) { ps = document.createElement("style"); ps.id = "print-page-style"; document.head.appendChild(ps); }
    ps.textContent = pageRule ? "@media print{" + pageRule + "}" : "";
    const body = (html.match(/<body>([\s\S]*?)<\/body>/) || [])[1] || html;
    const title = ((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "Drucken").replace(/&amp;/g, "&");
    printCurrent = { html, title, file: file || title };
    let ov = document.getElementById("print-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "print-overlay"; ov.className = "print-overlay"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Druckvorschau");
      ov.innerHTML = '<div class="print-bar"><button type="button" class="btn secondary" id="print-back">‹ Zurück</button>' +
        '<span class="print-title"></span>' +
        '<button type="button" class="btn secondary" id="print-share">📤 Teilen</button>' +
        '<button type="button" class="btn" id="print-go">🖨️ Drucken</button></div>' +
        '<div class="print-scroll"><div class="print-sheet" id="print-sheet"></div></div>';
      document.body.appendChild(ov);
      ov.querySelector("#print-back").addEventListener("click", closePrintView);
      ov.querySelector("#print-go").addEventListener("click", () => {
        if (iosHomeScreenApp() || (isIOS() && ov.querySelector("#print-sheet").classList.contains("bleed"))) { sharePrintPdf(true); return; }
        try { window.print(); } catch (e) {}
      });
      ov.querySelector("#print-share").addEventListener("click", sharePrintPdf);
      document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden) closePrintView(); });
    }
    ov.querySelector(".print-title").textContent = title;
    const sheet = ov.querySelector("#print-sheet");
    sheet.classList.toggle("landscape", /size\s*:\s*A4\s+landscape/.test(pageRule));
    sheet.classList.toggle("bleed", /margin\s*:\s*0\s*[;}]/.test(pageRule)); // Vorlage setzt ihre Ränder selbst
    const root = sheet.shadowRoot || (sheet.attachShadow ? sheet.attachShadow({ mode: "open" }) : sheet);
    root.innerHTML = "<style>:host{display:block}" + css + "</style>" + body;
    ov.hidden = false; document.body.classList.add("printing"); modalOpen("print");
    const sc = ov.querySelector(".print-scroll"); if (sc) { sc.scrollTop = 0; sc.scrollLeft = 0; }
    // Küchenzettel in Originalgröße einpassen (ohne Vorschau-Verkleinerung), danach auf die Bildschirmbreite zoomen
    sheet.style.zoom = ""; fitKitchenCard(root);
    printZoom = 1; fitPrintSheet(); bindPrintZoom(sc);
  }
  // iPhone/iPad als Home-Bildschirm-App: dort ignoriert iOS window.print() (der Knopf täte nichts). „Drucken“ öffnet
  // stattdessen das PDF im Teilen-Menü – darin steht „Drucken“ (AirPrint). In Safari und am Computer: normaler Druck.
  // Randlose Vorlagen (Küchenzettel mit Falzlinien) gehen am iPhone auch in Safari über das PDF, weil Safari Seitenformat
  // und Ränder nicht sicher übernimmt.
  function isIOS() {
    const nav = window.navigator || {};
    return /iPhone|iPad|iPod/.test(nav.userAgent || "") || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  }
  function iosHomeScreenApp() {
    const nav = window.navigator || {};
    const ios = isIOS();
    const standalone = nav.standalone === true || !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    return ios && standalone;
  }
  // Vorschau als ganze A4-Seite: am Handy auf die Breite verkleinert (wie gedruckt bzw. als PDF geteilt).
  // Zoomen in der Vorschau: Die App sperrt sonst das Zoomen (versehentliches Vergrößern beim Tippen) – hier gibt es
  // ein eigenes Zoomen: zwei Finger auseinander/zusammen, Doppeltippen vergrößert bzw. zurück auf Seitenbreite.
  // printZoom ist der Faktor über der Seitenbreite (1 = ganze Seite sichtbar, bis 4).
  let printZoom = 1;
  const PRINT_ZOOM_MAX = 4;
  function printFitZoom() {
    const ov = document.getElementById("print-overlay"); if (!ov) return 1;
    const sc = ov.querySelector(".print-scroll");
    const land = ov.querySelector("#print-sheet").classList.contains("landscape");
    const avail = ((sc && sc.clientWidth) || window.innerWidth) - 20, full = land ? 1123 : 794; // 297 bzw. 210 mm bei 96 dpi
    return avail > 0 ? Math.min(1, avail / full) : 1;
  }
  function fitPrintSheet() {
    const ov = document.getElementById("print-overlay"); if (!ov || ov.hidden) return;
    const sheet = ov.querySelector("#print-sheet");
    const z = printFitZoom() * printZoom;
    sheet.style.zoom = Math.abs(z - 1) > 0.001 ? String(Math.round(z * 1000) / 1000) : "";
    ov.classList.toggle("zoomed", printZoom > 1.01);
  }
  // Zoom auf einen Punkt (Bildschirmkoordinaten) setzen: der Inhalt unter dem Punkt bleibt an seiner Stelle.
  function setPrintZoom(f, cx, cy) {
    const ov = document.getElementById("print-overlay"); if (!ov) return;
    const sc = ov.querySelector(".print-scroll");
    f = Math.max(1, Math.min(PRINT_ZOOM_MAX, f));
    const r = sc.getBoundingClientRect(), px = (cx == null ? r.width / 2 : cx - r.left), py = (cy == null ? r.height / 2 : cy - r.top);
    const k = f / printZoom, x = sc.scrollLeft + px, y = sc.scrollTop + py;
    printZoom = f; fitPrintSheet();
    sc.scrollLeft = Math.max(0, x * k - px); sc.scrollTop = Math.max(0, y * k - py);
  }
  function bindPrintZoom(sc) {
    if (!sc || sc.dataset.zoomBound) return;
    sc.dataset.zoomBound = "1";
    let d0 = 0, f0 = 1, lastTap = 0, moved = false;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    sc.addEventListener("touchstart", (e) => {
      if (e.touches && e.touches.length === 2) { d0 = dist(e.touches); f0 = printZoom; e.preventDefault(); }
      else moved = false;
    }, { passive: false });
    sc.addEventListener("touchmove", (e) => {
      if (e.touches && e.touches.length === 2 && d0 > 0) {
        e.preventDefault();
        const m = mid(e.touches);
        setPrintZoom(f0 * dist(e.touches) / d0, m.x, m.y);
      } else moved = true;
    }, { passive: false });
    sc.addEventListener("touchend", (e) => {
      if (d0 > 0) { if (!e.touches || e.touches.length < 2) d0 = 0; return; }
      if (moved || !e.changedTouches || !e.changedTouches[0]) return;
      const now = Date.now(), t = e.changedTouches[0];
      if (now - lastTap < 320) { lastTap = 0; setPrintZoom(printZoom > 1.01 ? 1 : 2.5, t.clientX, t.clientY); e.preventDefault(); }
      else lastTap = now;
    }, { passive: false });
    // Am Computer: Strg/Cmd + Mausrad zoomt die Vorschau
    sc.addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault(); setPrintZoom(printZoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    }, { passive: false });
  }
  if (typeof window !== "undefined") window.addEventListener("resize", fitPrintSheet);
  function closePrintView() {
    const ov = document.getElementById("print-overlay"); if (!ov || ov.hidden) return;
    ov.hidden = true; document.body.classList.remove("printing"); modalClose("print");
  }

  // Küchenzettel (Tagesplan): A6 = linkes oberes Viertel einer A4-Seite (zweimal falten, Falzlinien gestrichelt),
  // unten 2,5 cm frei zum Einstecken in eine Hülle. Alle Schriftgrößen in em, damit fitKitchenCard die ganze Karte über
  // --s anpassen kann.
  const KITCHEN_CSS =
    "*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    "body{font-family:Helvetica,Arial,sans-serif;color:#1f2933;margin:0}" +
    "@page{size:A4 portrait;margin:0}" +
    ".kz-page{position:relative;width:210mm;height:296mm;overflow:hidden}" +
    ".kz{position:absolute;left:0;top:0;width:105mm;height:123.5mm;padding:6mm 6mm 0;overflow:hidden;font-size:calc(10pt * var(--s, 1));line-height:1.2;font-variant-numeric:tabular-nums}" +
    ".kz-fold{position:absolute;border:0 dashed #b4bdc2}.kz-fold.v{left:105mm;top:0;bottom:0;border-left-width:.25mm}.kz-fold.h{top:148.5mm;left:0;right:0;border-top-width:.25mm}" +
    // Kopf: kleine Marke über „Tagesplan“, rechts Verhältnis als Pille, darunter kcal und Flüssigkeit
    ".kz-h{display:flex;justify-content:space-between;align-items:flex-start;gap:2mm}" +
    ".kz-h .ti small{display:block;font-size:.62em;letter-spacing:.14em;text-transform:uppercase;color:#2f855a;font-weight:bold;margin-bottom:.3em}" +
    ".kz-h .ti b{display:block;font-size:1.9em;line-height:1;letter-spacing:-.01em}" +
    ".kz-h .rx{text-align:right;white-space:nowrap}.kz-h .rx .pill{display:inline-block;background:#e6f4ec;color:#22694a;font-weight:bold;border-radius:99px;padding:.18em .7em;font-size:1.05em}" +
    ".kz-h .rx small{display:block;color:#7b8794;margin-top:.3em;font-size:.95em}" +
    ".lbl{font-size:.78em;letter-spacing:.12em;text-transform:uppercase;color:#7b8794;font-weight:bold;margin:1.1em 0 .4em}" +
    // Zeitplan: Mahlzeit mit folgender Wassergabe als Block, feine Linie nur zwischen den Blöcken
    ".r{display:grid;grid-template-columns:calc(13mm * var(--s, 1)) 1fr auto;column-gap:.6em;align-items:baseline;padding:.38em 0;break-inside:avoid}" +
    ".r.me,.r.sl{border-top:.2mm solid #e4e8eb}.lbl + .r{border-top:0}" +
    ".r .t{font-weight:bold;font-size:1.3em}.r .n{font-weight:bold;font-size:1.18em}.r i{font-style:normal}.r .d{color:#7b8794;font-size:.9em;margin-left:.4em}" +
    ".r .m{font-weight:bold;font-size:1.3em;text-align:right;white-space:nowrap}" +
    ".r.wa{padding:.1em 0 .32em;color:#2b6cb0}.r.wa .t,.r.wa .m{font-size:1em;font-weight:600}.r.wa .n{font-weight:normal;font-size:1em}.r.wa .d{color:#6b9bd1}" +
    // Wassertropfen vor „Wasser“ (SVG, druckt mit)
    ".r.wa .n:before{content:'';display:inline-block;width:.6em;height:.9em;margin-right:.4em;vertical-align:-.08em;background:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 12 18%22%3E%3Cpath d=%22M6 0L11.196 9A6 6 0 1 1 .804 9Z%22 fill=%22%2363a4e8%22/%3E%3C/svg%3E') no-repeat center/contain}" +
    ".r.sl{color:#9aa5b1;padding-top:.32em}.r.sl .t,.r.sl .n{font-weight:normal;font-size:1em}" +
    // Zutaten: jedes Rezept als hellgraue Karte, Uhrzeiten grün rechts, Gramm fett
    ".rb{background:#f5f7f6;border-radius:2mm;padding:.55em .8em .6em;margin-top:.55em;break-inside:avoid}" +
    ".rn{display:flex;justify-content:space-between;align-items:baseline;gap:2mm;margin-bottom:.35em}.rn b{font-size:1.25em}" +
    ".rn i{font-style:normal;font-size:.9em;font-weight:600;color:#2f855a;white-space:nowrap}" +
    ".rb .z{display:grid;grid-template-columns:1fr 1fr;column-gap:4.5mm;row-gap:.22em;font-size:1.18em;line-height:1.2}" +
    ".rb .z .i{display:flex;justify-content:space-between;align-items:baseline;gap:1.5mm}.rb .z .i b{white-space:nowrap}";
  // Schrift der Karte so groß wie möglich: von 150 % schrittweise kleiner, bis der Inhalt hineinpasst (mindestens 40 %).
  // Abstände sind in em angegeben und schrumpfen mit.
  const KITCHEN_SCALE_MAX = 1.5;
  function fitKitchenCard(root) {
    const kz = root && root.querySelector && root.querySelector(".kz"); if (!kz) return;
    let sc = KITCHEN_SCALE_MAX; kz.style.setProperty("--s", String(sc));
    while (kz.scrollHeight > kz.clientHeight + 1 && sc > 0.4) { sc = Math.round((sc - 0.04) * 100) / 100; kz.style.setProperty("--s", String(sc)); }
  }

  // Gemeinsamer Rahmen aller Ausdrucke: Kopf mit Titel und Datum, grüne Linie, Fußzeile.
  const PRINT_CSS =
    "@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    "body{font-family:Arial,Helvetica,sans-serif;color:#1f2933;margin:0;font-size:10.5pt;line-height:1.4}" +
    ".head{display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;border-bottom:1.2pt solid #2f855a;padding-bottom:2mm;margin-bottom:3mm}" +
    "h1{font-size:17pt;margin:0;line-height:1.15}.meta{color:#555;font-size:9pt;text-align:right;white-space:nowrap}" +
    ".rx{margin:0 0 3mm;color:#333;font-size:9.5pt}" +
    "h2{font-size:11.5pt;margin:5mm 0 1.5mm;color:#2f855a}" +
    "table{width:100%;border-collapse:collapse;margin:0}" +
    "th{background:#eef5f0;text-align:left;font-size:8.5pt;font-weight:bold;color:#33463b;padding:1.4mm 1.5mm;border-bottom:.6pt solid #9bb8a6}" +
    "td{border-bottom:.4pt solid #d5dbd8;padding:1.6mm 1.5mm;vertical-align:top}" +
    ".num{text-align:right;white-space:nowrap}" +
    "tr.sum td{font-weight:bold;border-top:1pt solid #777;border-bottom:none}" +
    ".box{background:#f3f6f4;border-left:2.5pt solid #2f855a;padding:2.2mm 3.2mm;margin:3mm 0;font-size:9.5pt}" +
    ".box.warn{background:#fdf6e3;border-left-color:#b7791f}" +
    "ol{margin:1mm 0 0;padding-left:6mm}li{margin:0 0 1.4mm}" +
    "tr,li,.box{break-inside:avoid}" +
    ".foot{margin-top:6mm;padding-top:2mm;border-top:.4pt solid #ccc;color:#777;font-size:8pt}";
  function printDoc(title, meta, bodyHtml) {
    return "<!DOCTYPE html><html lang='de'><head><meta charset='utf-8'><title>" + escapeHtml(title) + "</title><style>" + PRINT_CSS + "</style></head><body>" +
      "<div class='head'><h1>" + escapeHtml(title) + "</h1><div class='meta'>" + meta + "</div></div>" + bodyHtml +
      "<div class='foot'>Erstellt mit HamHam Keto am " + new Date().toLocaleDateString("de-AT") + ". Kein Ersatz für ärztliche oder diätologische Beratung – Mengen mit dem Behandlungsteam abstimmen.</div></body></html>";
  }
  function printDateLong() {
    try { return new Date().toLocaleDateString("de-AT", { weekday: "short", day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return new Date().toLocaleDateString("de-AT"); }
  }
  function fileDate() { const t = new Date(); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); }
  const oilName = (food) => String(food).replace(/\s*C8\+C10/, "");

  // Rezept: Zutaten je Portion (und für die gewählte Menge), Nährwerte, Abfüllen, nummerierte Zubereitung.
  function printRecipe(rec, res, d, mult) {
    mult = mult || 1;
    // Rezepte aus dem Editor bringen keine eigene Zutatenliste mit – die berechnete gilt dann auch für Texte und Fettbasis.
    if (!Array.isArray(rec.items)) rec = Object.assign({}, rec, { items: res.items });
    const hasMct = res.items.some(it => it.food === "MCT-Öl C8+C10");
    const oilWord = hasMct ? (res.items.some(it => it.food === "Rapsöl") ? "Rapsöl + MCT-Öl" : "MCT-Öl") : null;
    const adaptOil = (t) => oilWord ? String(t).replace(/Rapsöl/g, oilWord) : t;
    const pWaterG = res.items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0) * mult;
    const pBowl = Math.round(pWaterG + d.dampfVerdunstung);
    const adaptVaroma = (t) => (!t || pWaterG <= 0) ? t : t
      .replace("Ca. 500 ml Wasser in den Mixtopf geben (nur zum Dämpfen, wird nicht weiterverwendet).",
        "Ca. " + pBowl + " ml Wasser in den Mixtopf geben (das Dämpfwasser wird später mitverwendet).")
      .replace("Dämpfwasser abgießen. Die gedämpften Zutaten mit dem abgemessenen Wasser",
        "Das Dämpfwasser NICHT abgießen – davon " + Math.round(pWaterG) + " ml abmessen (bei Bedarf mit frischem Wasser auf " + Math.round(pWaterG) + " ml ergänzen) und zusammen mit den gedämpften Zutaten");
    const items = res.items;
    const sumPer = sumMacros(items);
    const r = ratioOf(sumPer);
    const daysP = d.mahl > 0 && Math.abs(mult / d.mahl - Math.round(mult / d.mahl)) < 1e-6 ? Math.round(mult / d.mahl) : 0;
    const multTxt = Math.abs(mult - Math.round(mult)) < 1e-6 ? String(Math.round(mult)) : fmt(mult, 1);
    const portionLabel = mult === 1 ? "1 Portion" : (daysP ? (daysP === 1 ? "1 Tag = " : daysP + " Tage = ") : "") + multTxt + " Portionen";
    const isOilP = isOilName;
    const noOilP = items.filter(it => !isOilP(it.food)), oilsP = items.filter(it => isOilP(it.food) && num(it.grams) > 0);
    const gNoOil = noOilP.reduce((a, it) => a + num(it.grams), 0);
    const fluidPer = fluidOf(items), volPer = volumeMl(items);
    const showMult = mult !== 1;
    const rows = items.map(it => {
      const g = num(it.grams), m = lineMacros({ food: it.food, grams: g });
      return "<tr><td>" + escapeHtml(it.food) + "</td><td class='num'>" + fmt(g, 1) + " g</td>" +
        (showMult ? "<td class='num'><b>" + fmt(g * mult, 1) + " g</b></td>" : "") +
        "<td class='num'>" + fmt(m.eiweiss) + "</td><td class='num'>" + fmt(m.fett) + "</td><td class='num'>" + fmt(m.kh) + "</td><td class='num'>" + fmt(m.kcal, 0) + "</td></tr>";
    }).join("");
    const totalG = items.reduce((a, it) => a + num(it.grams), 0);
    const table = "<table><thead><tr><th>Lebensmittel</th><th class='num'>je Portion</th>" + (showMult ? "<th class='num'>" + escapeHtml(portionLabel) + "</th>" : "") +
      "<th class='num'>Eiweiß</th><th class='num'>Fett</th><th class='num'>KH</th><th class='num'>kcal</th></tr></thead><tbody>" + rows +
      "<tr class='sum'><td>Summe je Portion</td><td class='num'>" + fmt(totalG, 0) + " g</td>" + (showMult ? "<td class='num'>" + fmt(totalG * mult, 0) + " g</td>" : "") +
      "<td class='num'>" + fmt(sumPer.eiweiss) + "</td><td class='num'>" + fmt(sumPer.fett) + "</td><td class='num'>" + fmt(sumPer.kh) + "</td><td class='num'>" + fmt(sumPer.kcal, 0) + "</td></tr></tbody></table>";
    const fill = rec.angeruehrt
      ? "<div class='box'><b>Je Portion:</b> alles zusammen anrühren, ≈ " + fmt(volPer, 0) + " ml" + (oilsP.length ? ", das Öl gründlich einrühren." : ".") + "</div>"
      : "<div class='box'><b>Je Portion:</b> ≈ " + fmt(gNoOil, 0) + " g abfüllen" +
        (oilsP.length ? " und " + oilsP.map(o => escapeHtml(oilName(o.food)) + " " + fmt(num(o.grams), 1) + " g").join(" + ") + " einrühren – zusammen ≈ " + fmt(volPer, 0) + " ml" : " (≈ " + fmt(volumeMl(noOilP), 0) + " ml)") +
        (showMult ? "<br>Zubereitet wird für " + escapeHtml(portionLabel) + (oilsP.length ? " (ohne Öl ≈ " + fmt(gNoOil * mult, 0) + " g)" : "") + "." : "") + "</div>";
    const prepSrc = rec.varoma ? adaptOil(adaptVaroma(adaptPrep(rec.varoma, rec, detailMeat))) : (rec.zubereitung ? adaptOil(adaptPrep(rec.zubereitung, rec, detailMeat)) : "");
    const steps = splitSteps(prepSrc);
    const oilStepP = oilFeedStep(rec, items); if (oilStepP && steps.length) steps.push(oilStepP);
    const prep = steps.length
      ? "<h2>" + (rec.varoma ? "Zubereitung mit Varoma (dämpfen)" : "Zubereitung") + "</h2><ol>" + steps.map(s => "<li>" + escapeHtml(s) + "</li>").join("") + "</ol>" +
        (!rec.angeruehrt ? "<div class='box'>Vor dem Abfüllen durch ein feines Sieb streichen, damit nichts die Spritze verstopft." + (showMult ? " Garzeiten gelten für eine Portion – bei der größeren Menge länger garen, bis alles weich ist." : "") + " Im Kühlschrank lagern.</div>" : "")
      : "";
    const pState = proteinState(sumPer.eiweiss, d.eiweissMahl);
    const rx = "<p class='rx'><b>" + escapeHtml(basisLabel(rec)) + "</b>" + (rec.quelle ? " · Rezept der Diätologie" : "") + " · Verhältnis " + fmtRatio(r, 2) +
      " · " + fmt(sumPer.kcal, 0) + " kcal je Portion · Eiweiß " + fmt(sumPer.eiweiss) + " g (Ziel " + fmt(d.eiweissMahl) + " g) · Flüssigkeit ≈ " + fmt(fluidPer, 0) + " ml · Volumen ≈ " + fmt(volPer, 0) + " ml</p>";
    const warn = pState === "high" ? "<div class='box warn'>Eiweiß " + fmt(sumPer.eiweiss / d.eiweissMahl, 1) + "-mal so hoch wie das Ziel – mit dem Team abklären.</div>" : "";
    const title = rec.name;
    const html = printDoc(title, escapeHtml(printDateLong()) + "<br>" + escapeHtml(portionLabel), rx + "<h2>Zutaten</h2>" + table + fill + warn + prep);
    openPrintView(html, title);
  }

  /* ---------- PDF zum Teilen (WhatsApp, Signal, Mail …) ----------
     Setzt dieselbe Druckvorlage wie die Vorschau in ein PDF um (jsPDF + AutoTable, in der App eingebettet, offline).
     Unterstützt werden die Bausteine der Vorlagen: Kopf, Absätze, Überschriften, Tabellen, Hinweis-Kästen,
     Kennzahlen, nummerierte Schritte und Fußzeile. Die PDF-Standardschrift kennt keine Emojis und Sonderzeichen
     wie ≈ – sie werden ersetzt („ca.“) oder weggelassen. */
  const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
  function pdfText(t) {
    return String(t == null ? "" : t)
      .replace(/≈\s*/g, "ca. ").replace(/→/g, "->").replace(/[✓✔]/g, "").replace(/↑/g, "")
      .replace(/[  ]/g, " ")
      .split("").filter(ch => ch.charCodeAt(0) <= 0xFF || CP1252_EXTRA.indexOf(ch) !== -1).join("")
      .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
  }
  function safeFileName(s) { return String(s || "HamHam Keto").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80); }
  function pdfAutoTable(doc, opts) {
    if (typeof doc.autoTable === "function") return doc.autoTable(opts);
    const at = (typeof window !== "undefined") && (window.autoTable || (window.jspdfAutoTable && window.jspdfAutoTable.autoTable));
    if (at) return at(doc, opts);
    throw new Error("AutoTable fehlt");
  }
  // Küchenzettel: A6 (105 × 148,5 mm) im linken oberen Viertel einer A4-Seite, Falzlinien gestrichelt, unten 2,5 cm
  // frei zum Einstecken. Gleiches Design wie die Vorschau: Kopf mit Marke und Verhältnis-Pille, Zeitplan als ruhige
  // Liste (Mahlzeit + folgende Wassergabe als Block), darunter jedes Rezept als hellgraue Karte mit den Zutaten in zwei
  // Spalten. Die Schrift beginnt bei 150 % und wird samt Abständen kleiner, bis alles hineinpasst (mindestens 40 %).
  function kitchenCardPdf(doc, kz) {
    const CW = 105, PX = 6, PY = 6, BOTTOM = 148.5 - 25;
    const L = PX, R = CW - PX;
    const INK = [31, 41, 51], MUTED = [123, 135, 148], GREEN = [47, 133, 90], PILL_BG = [230, 244, 236], PILL_INK = [34, 105, 74];
    const BLUE = [43, 108, 176], BLUE_SOFT = [107, 155, 209], DOT = [99, 164, 232], GREY = [154, 165, 177], LINE = [228, 232, 235], CARD = [245, 247, 246];
    const PT = 0.3528, lineH = (size) => size * PT * 1.2;
    const font = (size, bold, color) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK); };
    const txt = (el, sel) => { const n = sel ? el.querySelector(sel) : el; return n ? pdfText(n.textContent) : ""; };
    const spaced = (t, size, x, y, opts) => doc.text(t.toUpperCase(), x, y, Object.assign({ charSpace: size * PT * 0.13 }, opts || {}));
    const rows = [...kz.querySelectorAll(".r")].map(r => ({
      kind: r.classList.contains("wa") ? "wa" : r.classList.contains("sl") ? "sl" : "me",
      t: txt(r, ".t"), n: txt(r, ".n"), d: txt(r, ".d"), m: txt(r, ".m"),
    }));
    const recs = [...kz.querySelectorAll(".rb")].map(b => ({
      n: txt(b, ".rn b"), times: txt(b, ".rn i"),
      z: [...b.querySelectorAll(".z .i")].map(i => ({ n: txt(i, "span"), g: txt(i, "b") })),
    }));
    const labels = [...kz.querySelectorAll(".lbl")].map(l => pdfText(l.textContent));
    const layout = (s, draw) => {
      const em = 10 * s * PT; // 1 em in mm
      let y = PY;
      // Kopf
      const bs = 6.2 * s, ts = 19 * s, ps = 10.5 * s, ks = 9.5 * s;
      if (draw) {
        font(bs, true, GREEN); spaced(txt(kz, ".ti small"), bs, L, y + lineH(bs) * 0.8);
        font(ts, true); doc.text(txt(kz, ".ti b"), L, y + lineH(bs) + 0.3 * em + ts * PT * 0.85);
        font(ps, true, PILL_INK); const pt = txt(kz, ".rx .pill"), pw = doc.getTextWidth(pt) + 1.4 * ps * PT, ph = ps * PT * 1.45;
        doc.setFillColor.apply(doc, PILL_BG); doc.roundedRect(R - pw, y, pw, ph, ph / 2, ph / 2, "F");
        doc.text(pt, R - pw / 2, y + ph / 2, { align: "center", baseline: "middle" });
        font(ks, false, MUTED); doc.text(txt(kz, ".rx small"), R, y + ph + 0.3 * em + ks * PT * 0.85, { align: "right" });
      }
      y += Math.max(lineH(bs) + 0.3 * em + ts * PT, ps * PT * 1.45 + 0.3 * em + lineH(ks));
      const label = (t) => {
        const ls = 7.8 * s;
        y += 1.1 * 0.78 * em * 1.28;
        if (draw) { font(ls, true, MUTED); spaced(t, ls, L, y + lineH(ls) * 0.8); }
        y += lineH(ls) + 0.4 * 0.78 * em;
      };
      // Zeitplan
      label(labels[0] || "Zeitplan");
      const TW = 13 * s, GAP = 0.6 * em;
      rows.forEach((r, k) => {
        const big = (r.kind === "me" ? 13 : 10) * s, nm = (r.kind === "me" ? 11.8 : 10) * s, ds = 9 * s;
        const col = r.kind === "wa" ? BLUE : r.kind === "sl" ? GREY : INK;
        const padT = (r.kind === "wa" ? 0.1 : r.kind === "sl" ? 0.32 : 0.38) * em, padB = (r.kind === "wa" ? 0.32 : 0.38) * em;
        const dotW = r.kind === "wa" ? 0.6 * em + 0.4 * em : 0;
        font(big, r.kind !== "sl"); const mw = r.m ? doc.getTextWidth(r.m) + GAP : 0;
        const x0 = L + TW + GAP, avail = R - x0 - mw - dotW;
        font(nm, r.kind === "me"); const nl = doc.splitTextToSize(r.n, avail), nW = doc.getTextWidth(nl[nl.length - 1] || "");
        font(ds, false); const dW = r.d ? doc.getTextWidth(r.d) + 0.4 * em : 0;
        const dInline = !r.d || nW + dW <= avail;
        const h = padT + lineH(big) + (nl.length - 1) * lineH(nm) + (dInline ? 0 : lineH(ds)) + padB;
        if (draw) {
          if ((r.kind === "me" || r.kind === "sl") && k > 0) { doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.2); doc.line(L, y, R, y); }
          const base = y + padT + lineH(big) * 0.8;
          font(big, r.kind !== "sl", col); doc.text(r.t, L, base);
          if (r.kind === "wa") {
            // Wassertropfen: Kreis unten, Spitze oben (Tangenten bei 60°)
            const rr = 0.3 * em, cx = x0 + rr, cy = base - rr * 0.95;
            doc.setFillColor.apply(doc, DOT); doc.circle(cx, cy, rr, "F");
            doc.triangle(cx, cy - 2 * rr, cx - rr * 0.866, cy - rr * 0.5, cx + rr * 0.866, cy - rr * 0.5, "F");
          }
          font(nm, r.kind === "me", col); nl.forEach((l, i) => doc.text(l, x0 + dotW, base + i * lineH(nm)));
          if (r.d) {
            font(ds, false, r.kind === "wa" ? BLUE_SOFT : MUTED);
            const lastY = base + (nl.length - 1) * lineH(nm);
            if (dInline) doc.text(r.d, x0 + dotW + nW + 0.4 * em, lastY); else doc.text(r.d, x0 + dotW, lastY + lineH(ds));
          }
          if (r.m) { font(big, true, col); doc.text(r.m, R, base, { align: "right" }); }
        }
        y += h;
      });
      if (!recs.length) return y;
      // Zutaten je Portion: Karten
      label(labels[1] || "Zutaten je Portion");
      const ZS = 11.8 * s, zlh = lineH(ZS), padX = 0.8 * em, cw = (R - L - 2 * padX - 4.5) / 2, tn = 12.5 * s, ti = 9 * s;
      recs.forEach(rc => {
        y += 0.55 * em;
        const pairs = [];
        for (let i = 0; i < rc.z.length; i += 2) {
          const cells = rc.z.slice(i, i + 2).map(it => { font(ZS, true); const gw = doc.getTextWidth(it.g); font(ZS, false); return { it, lines: doc.splitTextToSize(it.n, cw - gw - 1.5) }; });
          pairs.push({ cells, n: Math.max.apply(null, cells.map(c => c.lines.length)) });
        }
        const h = 0.55 * em + lineH(tn) + 0.35 * em + pairs.reduce((a, q) => a + q.n * zlh + 0.22 * em, 0) - 0.22 * em + 0.6 * em;
        if (draw) {
          doc.setFillColor.apply(doc, CARD); doc.roundedRect(L, y, R - L, h, 2, 2, "F");
          let yy = y + 0.55 * em + lineH(tn) * 0.8;
          font(tn, true); doc.text(rc.n, L + padX, yy);
          font(ti, true, GREEN); doc.text(rc.times, R - padX, yy, { align: "right" });
          yy = y + 0.55 * em + lineH(tn) + 0.35 * em;
          pairs.forEach(q => {
            q.cells.forEach((c, ci) => {
              const x0 = L + padX + ci * (cw + 4.5), x1 = x0 + cw;
              font(ZS, false); c.lines.forEach((l, li) => doc.text(l, x0, yy + (li + 0.8) * zlh));
              font(ZS, true); doc.text(c.it.g, x1, yy + (c.lines.length - 1 + 0.8) * zlh, { align: "right" });
            });
            yy += q.n * zlh + 0.22 * em;
          });
        }
        y += h;
      });
      return y;
    };
    let s = 1.5;
    while (layout(s, false) > BOTTOM && s > 0.4) s = Math.round((s - 0.04) * 100) / 100;
    // Falzlinien: A4 zweimal falten → A6
    doc.setDrawColor(180, 189, 194); doc.setLineWidth(0.25); doc.setLineDashPattern([1.6, 1.2], 0);
    doc.line(105, 0, 105, 297); doc.line(0, 148.5, 210, 148.5); doc.setLineDashPattern([], 0);
    layout(s, true);
  }
  function buildPdfFromHtml(html) {
    const J = typeof window !== "undefined" && window.jspdf && window.jspdf.jsPDF;
    if (!J) return null;
    const dom = new DOMParser().parseFromString(html, "text/html");
    const kz = dom.body.querySelector(".kz");
    if (kz) { const kd = new J({ unit: "mm", format: "a4", compress: true }); kitchenCardPdf(kd, kz); return kd; }
    const doc = new J({ unit: "mm", format: "a4", compress: true });
    const PW = 210, PH = 297, M = 14, W = PW - 2 * M, BOTTOM = PH - M - 6;
    const INK = [31, 41, 51], MUTED = [102, 102, 102], GREEN = [47, 133, 90];
    let y = M;
    const lineH = (size) => size * 0.3528 * 1.32;
    const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
    const font = (size, bold, color) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK); };
    const para = (text, o) => {
      o = o || {}; const size = o.size || 10, indent = o.indent || 0, t = pdfText(text); if (!t) return;
      font(size, o.bold, o.color);
      const lh = lineH(size);
      doc.splitTextToSize(t, W - indent).forEach(l => { ensure(lh); doc.text(l, M + indent, y + lh * 0.78); y += lh; });
      y += o.gap == null ? 1.5 : o.gap;
    };
    const box = (el) => {
      const warn = el.classList.contains("warn"), size = 9.5, lh = lineH(size), pad = 2.2;
      // Zeilenumbrüche (<br>) im Kasten erhalten
      const txt = el.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      font(size, false); const lines = doc.splitTextToSize(pdfText(txt), W - 8);
      const h = lines.length * lh + 2 * pad; ensure(h + 2);
      doc.setFillColor.apply(doc, warn ? [253, 246, 227] : [243, 246, 244]); doc.rect(M, y, W, h, "F");
      doc.setFillColor.apply(doc, warn ? [183, 121, 31] : GREEN); doc.rect(M, y, 0.9, h, "F");
      font(size, false); let yy = y + pad;
      lines.forEach(l => { doc.text(l, M + 4, yy + lh * 0.78); yy += lh; });
      y += h + 2.5;
    };
    const table = (tbl) => {
      const rowClass = [];
      pdfAutoTable(doc, {
        html: tbl, startY: y, margin: { left: M, right: M, bottom: PH - BOTTOM }, theme: "plain", useCss: false,
        styles: { font: "helvetica", fontSize: 8.8, cellPadding: { top: 1.3, bottom: 1.3, left: 1.4, right: 1.4 }, textColor: INK, lineColor: [213, 219, 216], lineWidth: { bottom: 0.15 }, overflow: "linebreak" },
        headStyles: { fillColor: [238, 245, 240], textColor: [51, 70, 59], fontStyle: "bold", fontSize: 8.2, lineColor: [155, 184, 166], lineWidth: { bottom: 0.25 } },
        didParseCell: (data) => {
          const el = data.cell.raw && data.cell.raw.nodeType === 1 ? data.cell.raw : null;
          data.cell.text = (data.cell.text || []).map(pdfText);
          if (!el) return;
          const tr = el.parentElement, cls = tr ? tr.className : "";
          if (el.classList.contains("num")) data.cell.styles.halign = "right";
          if (data.section === "body") {
            if (/\bsum\b/.test(cls)) { data.cell.styles.fontStyle = "bold"; data.cell.styles.lineWidth = { top: 0.35 }; data.cell.styles.lineColor = [119, 119, 119]; }
            if (el.querySelector && el.querySelector("b") && !/\bsum\b/.test(cls) && el.textContent.trim() === el.querySelector("b").textContent.trim()) data.cell.styles.fontStyle = "bold";
          }
          rowClass[data.row.index] = cls;
        },
      });
      y = doc.lastAutoTable.finalY + 2.5;
    };
    [...dom.body.children].forEach(el => {
      const tag = el.tagName.toLowerCase(), cls = el.className || "";
      if (cls === "head") {
        const h1 = el.querySelector("h1"), meta = el.querySelector(".meta");
        const metaLines = meta ? meta.innerHTML.split(/<br\s*\/?>/i).map(s => pdfText(s.replace(/<[^>]+>/g, ""))) : [];
        font(17, true); const titleLines = doc.splitTextToSize(pdfText(h1 ? h1.textContent : ""), W - 55);
        const lh = lineH(17);
        titleLines.forEach((l, i) => doc.text(l, M, y + lh * 0.8 + i * lh));
        font(9, false, MUTED); metaLines.forEach((l, i) => doc.text(l, PW - M, y + 3.5 + i * 4, { align: "right" }));
        y += Math.max(titleLines.length * lh, metaLines.length * 4 + 1) + 1.5;
        doc.setDrawColor.apply(doc, GREEN); doc.setLineWidth(0.45); doc.line(M, y, PW - M, y); y += 3.5;
      } else if (tag === "h2") {
        ensure(12);
        const sm = el.querySelector("small"), main = el.cloneNode(true);
        [...main.querySelectorAll("small")].forEach(n => n.remove());
        if (!sm) para(el.textContent, { size: 11.5, bold: true, color: GREEN, gap: 1 });
        else {
          // Zusatz in der Überschrift klein und grau
          const lh = lineH(11.5), t = pdfText(main.textContent);
          font(11.5, true, GREEN); doc.text(t, M, y + lh * 0.78);
          const x = M + doc.getTextWidth(t) + 2;
          font(8.5, false, MUTED); doc.text(pdfText(sm.textContent), x, y + lh * 0.78);
          y += lh + 1;
        }
      }
      else if (tag === "table") table(el);
      else if (tag === "ol") {
        [...el.children].forEach((li, i) => {
          const size = 10, lh = lineH(size); font(size, false);
          const lines = doc.splitTextToSize(pdfText(li.textContent), W - 7);
          ensure(lh * Math.min(lines.length, 2));
          doc.text((i + 1) + ".", M + 0.5, y + lh * 0.78);
          lines.forEach(l => { ensure(lh); doc.text(l, M + 6, y + lh * 0.78); y += lh; });
          y += 1.2;
        });
        y += 1;
      } else if (/\bbox\b/.test(cls)) box(el);
      else if (/\bfoot\b/.test(cls)) { y += 3; para(el.textContent, { size: 8, color: MUTED }); }
      else if (/\brx\b/.test(cls)) para(el.textContent, { size: 9.5, color: [51, 51, 51], gap: 2 });
      else para(el.textContent, { size: 10 });
    });
    // Seitenzahlen
    const n = doc.getNumberOfPages();
    if (n > 1) for (let i = 1; i <= n; i++) { doc.setPage(i); font(8, false, MUTED); doc.text("Seite " + i + " von " + n, PW - M, PH - 8, { align: "right" }); }
    return doc;
  }
  // forPrint: vom „Drucken“-Knopf in der iPhone-App (dort gibt es keinen Druckdialog) – Hinweis auf „Drucken“ im Menü.
  async function sharePrintPdf(forPrint) {
    if (!printCurrent) return;
    forPrint = forPrint === true;
    let doc = null;
    try { doc = buildPdfFromHtml(printCurrent.html); } catch (e) { doc = null; }
    if (!doc) { showToast(forPrint ? "📄 PDF konnte nicht erstellt werden – bitte die App in Safari öffnen und dort drucken." : "📄 PDF konnte nicht erstellt werden – bitte über „Drucken“ → Teilen als PDF sichern."); return; }
    const name = safeFileName(printCurrent.file) + ".pdf";
    const blob = doc.output("blob");
    let file = null;
    try { file = new File([blob], name, { type: "application/pdf" }); } catch (e) {}
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      if (forPrint) showToast("🖨️ Im Teilen-Menü auf „Drucken“ tippen.");
      try { await navigator.share({ files: [file], title: printCurrent.title }); } catch (e) { /* abgebrochen */ }
      return;
    }
    // Ohne Teilen-Menü (z. B. am Desktop): PDF herunterladen
    try {
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast("📄 PDF gespeichert: " + escapeHtml(name));
    } catch (e) { showToast("📄 PDF konnte nicht gespeichert werden."); }
  }

  /* ---------- Eigenes Rezept (frei zusammenstellen) ---------- */
  const FAT_OPTIONS = ["Butter", "Streichgenuss (Schärdinger)", "Schlagobers NÖM", "Creme Fraîche NÖM", "Mascarpone Kärntnermilch", "Rapsöl", "Olivenöl", "MCT Nutricia (100%)", "Liquigen"];
  // Der Editor sieht aus wie die Detailansicht: fester Kopf, zwei Blätter (Zutaten · Mahlzeit), feste Aktionsleiste.
  const COMPOSE_PAGES = [["zutaten", "✏️ Zutaten"], ["mahlzeit", "🍽️ Mahlzeit"]];
  let composeTab = "zutaten";

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
    if (!compose.name && compose.fromRecipe) compose.name = compose.fromRecipe;
    const c = document.getElementById("compose-content");
    const d = derived();
    const mobile = isMobileLayout();
    const paneOpen = (k) => '<div class="pane" data-pane="' + k + '"' + (composeTab !== k && !mobile ? " hidden" : "") + ">";
    const badge = compose.editKey
      ? '<span class="badge quelle">📝 eigenes Rezept</span>'
      : (compose.fromRecipe ? '<span class="badge noketo">nach „' + escapeHtml(compose.fromRecipe) + '“</span>' : '<span class="badge noketo">neu</span>');

    c.innerHTML =
      '<div class="detail-head"><span class="detail-icon">📝</span>' +
        '<div class="detail-head-body"><input id="compose-name" class="title title-input" type="text" placeholder="Name für dein Rezept" value="' + escapeHtml(compose.name || "") + '">' +
        '<div class="meta" id="compose-meta"></div></div></div>' +
      pagerHead(COMPOSE_PAGES, composeTab, "compose-tabs", "compose-dots") +
      '<div class="pages" id="compose-pages">' +

      /* ---------- 1 Zutaten ---------- */
      paneOpen("zutaten") +
      '<h4 class="ph">✏️ Zutaten <span class="hint">für eine Mahlzeit</span></h4>' +
      '<div class="portion-line">Lebensmittel und Mengen frei wählen – das Fett wird für ' + fmtTarget(d.ratio) + ' berechnet' +
        (compose.scale ? ', alles auf ' + fmt(d.kcalMahl, 0) + ' kcal je Mahlzeit skaliert' : '') + '</div>' +
      '<div class="compose-rows" id="compose-rows"></div>' +
      '<button type="button" class="btn secondary" id="compose-add">+ Zutat hinzufügen</button>' +
      '<div class="compose-fat"><label>🧈 Fett(e) zum Ausgleich <span class="hint">stellt das Verhältnis ein</span></label>' +
        '<div class="compose-rows" id="compose-fats"></div>' +
        '<button type="button" class="btn secondary" id="compose-addfat">+ weiteres Fett</button></div>' +
      '<div class="checkrow"><input type="checkbox" id="compose-scale"' + (compose.scale ? " checked" : "") + '><label for="compose-scale" class="inline">Mengen automatisch auf eine Mahlzeit (≈ ' + fmt(d.kcalMahl, 0) + ' kcal) skalieren</label></div>' +
      "</div>" +

      /* ---------- 2 Mahlzeit (Ergebnis, Layout wie in der Detailansicht) ---------- */
      paneOpen("mahlzeit") +
      '<h4 class="ph">🍽️ Mahlzeit <span class="hint">eine Portion</span></h4>' +
      '<div id="compose-result"></div>' +
      "</div>" +

      "</div>" + /* pages */
      '<div class="detail-actions" id="compose-actions"></div>';

    const rowsWrap = c.querySelector("#compose-rows"), fatsWrap = c.querySelector("#compose-fats");
    c.querySelector("#compose-add").addEventListener("click", () => { compose.items.push({ food: "", grams: 30 }); renderRows(); recompute(); });
    c.querySelector("#compose-addfat").addEventListener("click", () => { compose.fats.push({ food: "Butter", share: 50 }); renderFats(); recompute(); });
    c.querySelector("#compose-scale").addEventListener("change", e => { compose.scale = e.target.checked; recompute(); });
    const nameInp = c.querySelector("#compose-name");
    nameInp.addEventListener("input", () => { compose.name = nameInp.value; save(); });

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
    function renderRows() {
      rowsWrap.innerHTML = "";
      compose.items.forEach((it, i) => {
        const row = el("div", { class: "compose-row" });
        row.appendChild(buildFoodSelect(it.food, v => { it.food = v; recompute(); }));
        const g = el("input", { type: "number", min: "0", step: "5", value: it.grams, class: "compose-grams", inputmode: "decimal" });
        g.addEventListener("input", e => { it.grams = e.target.value; recompute(); });
        row.appendChild(g);
        row.appendChild(el("span", { class: "unit" }, "g"));
        const del = el("button", { class: "btn ghost", title: "Entfernen" }, "✕");
        del.addEventListener("click", () => { compose.items.splice(i, 1); if (!compose.items.length) compose.items.push({ food: "", grams: 30 }); renderRows(); recompute(); });
        row.appendChild(del);
        rowsWrap.appendChild(row);
      });
    }

    // Ergebnis: Kopfzeile (Pille, kcal, Badge) und Blatt „Mahlzeit“ wie in der Detailansicht.
    let lastItems = [], lastOk = false;
    function recompute() {
      save();
      const d = derived();
      const res = computeFreeMeal(compose.items, compose.fats, d.ratio);
      const box = c.querySelector("#compose-result"), meta = c.querySelector("#compose-meta");
      if (!res.ok) {
        lastOk = false; lastItems = [];
        meta.innerHTML = '<span>noch unvollständig</span>' + badge;
        box.innerHTML = '<div class="portion-line">Noch nichts zu berechnen</div><div class="note warn">⚠️ ' + res.note + "</div>";
        return;
      }
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
      const proteinOk = sum.eiweiss >= d.eiweissMahl * 0.9, pStateC = proteinState(sum.eiweiss, d.eiweissMahl);
      meta.innerHTML = '<span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmtRatio(r, 2) + '</span><span>' + fmt(sum.kcal, 0) + ' kcal je Portion</span>' + badge;
      let rows = "";
      items.forEach(it => {
        const m = lineMacros(it);
        rows += "<tr" + (it.isFat ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) +
          (it.isFat ? '<small class="adj">⟵ stellt das Verhältnis ein</small>' : "") + "</td><td>" + fmt(it.grams, 1) +
          "</td><td>" + fmt(m.eiweiss) + "</td><td>" + fmt(m.fett) + "</td><td>" + fmt(m.kh) + "</td><td>" + fmt(m.kcal, 0) + "</td></tr>";
      });
      box.innerHTML =
        '<div class="portion-line">' + (compose.scale ? 'Wie berechnet · ' + fmt(d.kcalMahl, 0) + ' kcal je Mahlzeit' : 'Feste Zutatenmengen · ' + fmt(sum.kcal, 0) + ' kcal') + ' · Fett für ' + fmtTarget(d.ratio) + ' berechnet</div>' +
        '<div class="detail-tiles strip">' +
          '<div class="dstat"><div class="v">' + fmt(sum.kcal, 0) + '</div><div class="l">kcal · Ziel ' + fmt(d.kcalMahl, 0) + '</div></div>' +
          '<div class="dstat ' + (proteinOk ? "" : "warn") + '"><div class="v">' + fmt(sum.eiweiss) + ' g</div><div class="l">Eiweiß · Ziel ' + fmt(d.eiweissMahl) + ' g</div></div>' +
          '<div class="dstat"><div class="v">≈ ' + fmt(totalG, 0) + ' g</div><div class="l">Menge</div></div>' +
          '<div class="dstat"><div class="v">≈ ' + fmt(ml, 0) + ' ml</div><div class="l">Volumen</div></div>' +
        "</div>" +
        (!proteinOk ? '<div class="note warn">⚠️ Liegt unter dem Eiweiß-Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
        (pStateC === "high" ? '<div class="note warn">↑ Eiweiß mehr als doppelt so hoch wie das Ziel – viel Eiweiß kann die Ketose schwächen.</div>' : "") +
        '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>kcal</th></tr></thead><tbody>' +
        rows +
        "<tr class='sum'><td class='name'>Summe je Portion</td><td>" + fmt(totalG, 0) + "</td><td>" + fmt(sum.eiweiss) + "</td><td>" +
        fmt(sum.fett) + "</td><td>" + fmt(sum.kh) + "</td><td>" + fmt(sum.kcal, 0) + "</td></tr>" +
        "</tbody></table></div>";
    }

    // Feste Aktionsleiste unten: Speichern · Drucken · Leeren
    const actions = c.querySelector("#compose-actions");
    const saveBtn = el("button", { class: "btn", id: "compose-save" }, compose.editKey ? "💾 Speichern" : "💾 Als Rezept speichern");
    saveBtn.addEventListener("click", () => {
      const nm = (nameInp.value || "").trim();
      if (!nm) { alert("Bitte oben einen Namen für das Rezept eingeben."); nameInp.focus(); return; }
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
      compose.name = nm;
      save();
      saveBtn.textContent = "✓ Gespeichert"; setTimeout(() => { saveBtn.textContent = "💾 Speichern"; }, 1500);
    });
    actions.appendChild(saveBtn);
    const printBtn = el("button", { class: "btn secondary" }, "🖨️ Drucken");
    printBtn.addEventListener("click", () => {
      if (!lastOk) { alert("Bitte zuerst gültige Zutaten und ein Fett wählen."); return; }
      const recForPrint = { name: (nameInp.value || "").trim() || "Eigenes Rezept", icon: "📝", ketocal: false,
        zubereitung: "Zutaten vorbereiten und mit dem Wasser fein pürieren. Butter, Obers oder Creme gleich mit untermischen." };
      printRecipe(recForPrint, { items: lastItems }, derived(), 1);
    });
    actions.appendChild(printBtn);
    const clearBtn = el("button", { class: "btn ghost", title: "Leeren / neu beginnen" }, "🗑️");
    clearBtn.addEventListener("click", () => {
      state.compose = { items: [{ food: "", grams: 60 }], fats: [{ food: "Schlagobers NÖM", share: 100 }], scale: true };
      save(); composeTab = "zutaten"; openCompose();
    });
    actions.appendChild(clearBtn);

    renderRows(); renderFats(); recompute();
    setupPager(c, COMPOSE_PAGES, composeTab, (k) => { composeTab = k; }, openCompose);
    document.getElementById("compose-overlay").hidden = false;
    modalOpen("compose");
  }
  function closeCompose() {
    document.getElementById("compose-overlay").hidden = true;
    modalClose("compose");
    renderRezepte();
  }
  function bindCompose() {
    document.getElementById("compose-btn").addEventListener("click", () => { composeTab = "zutaten"; openCompose(); });
    document.getElementById("compose-close").addEventListener("click", closeCompose);
    const ov = document.getElementById("compose-overlay");
    ov.addEventListener("click", e => { if (e.target === ov) closeCompose(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden) closeCompose(); });
    bindSwipeDown(ov, closeCompose);
  }

  /* ---------- Init ---------- */
  function init() {
    rebuildFoodIndex();
    applyTheme();
    bindSettingsBar();
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
})();
