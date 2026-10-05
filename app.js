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
  // Desktop-Ansicht (> 820 px): eigene Anordnung von Tagesplan, Rezepten und Vorgaben (gleiche Bausteine).
  // Wechselt die Fensterbreite über die Grenze, baut die App neu auf (siehe init).
  const DESKTOP_MQ = "(min-width: 821px)";
  // Rezept als Panel neben der Liste erst ab 1100 px – darunter stünde es unter der langen Liste (Klick → ans Seitenende)
  const PANEL_MQ = "(min-width: 1100px)";
  function isPanelWidth() { try { return !!(window.matchMedia && window.matchMedia(PANEL_MQ).matches); } catch (e) { return false; } }
  function isDesktop() { try { return !!(window.matchMedia && window.matchMedia(DESKTOP_MQ).matches); } catch (e) { return false; } }
  // Escape schließt nur die oberste Ebene: Druckvorschau vor Auswahl „Für heute“ vor Rezept-Auswahl vor Editor vor Rezept
  const LAYERS = ["print-overlay", "today-sheet", "picker-overlay", "compose-overlay", "detail-overlay"];
  function topLayer() {
    for (const id of LAYERS) { const el = document.getElementById(id); if (el && !el.hidden && (id !== "detail-overlay" || !el.closest("#rz-panel"))) return id; }
    return null;
  }
  // Fehlertext für Meldungen: Netzwerkfehler („Failed to fetch“, „Load failed“) verständlich auf Deutsch
  function errorText(e) {
    const m = String(e && e.message || e || "");
    if ((typeof navigator !== "undefined" && navigator.onLine === false) || /failed to fetch|load failed|networkerror|network request failed/i.test(m))
      return "keine Verbindung zum Dienst – bitte später noch einmal versuchen";
    return m || "unbekannter Fehler";
  }
  // Umschalter (Segment-Knöpfe): Zustand auch für Screenreader – aria-pressed folgt der Markierung „active“.
  // Ein Beobachter erledigt das für alle Leisten (Vorgaben, Rezept, Editor), auch nach jedem Neuzeichnen.
  function markPressed(root) {
    (root || document).querySelectorAll(".seg-ink button:not([role=tab])").forEach(b => {
      const v = b.classList.contains("active") ? "true" : "false"; if (b.getAttribute("aria-pressed") !== v) b.setAttribute("aria-pressed", v);
    });
  }
  if (typeof document !== "undefined" && typeof MutationObserver === "function") document.addEventListener("DOMContentLoaded", () => {
    markPressed();
    new MutationObserver(() => markPressed()).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  });
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
  // Anzeige in der Oberfläche (Küchenzettel): „1,8 : 1“ mit Abständen; Ausdruck/PDF bleiben bei „1,8:1“.
  function fmtRx(r) { return (r > 0 && isFinite(r)) ? fmtRatioNum(r) + " : 1" : "—"; }
  function fmtRxA(r, dec) { const t = fmtRatio(r, dec); return t === "—" ? t : t.replace(":1", " : 1"); }
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
    // „Rückgängig“ als unterstrichener Text, weitere Aktionen (z. B. „Ansehen“) als helle Pille
    t.innerHTML = '<span class="toast-msg">' + html + '</span>' + (buttons || []).map((b, i) => '<button type="button" class="toast-btn' + (i > 0 ? " pill" : "") + '" data-ti="' + i + '">' + b[0] + '</button>').join("");
    t.querySelectorAll(".toast-btn").forEach(b => b.addEventListener("click", () => { hideToast(); buttons[num(b.dataset.ti)][1](); }));
    t.hidden = false; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 7000);
  }
  function hideToast() { const t = document.getElementById("toast"); if (t) { t.classList.remove("show"); t.hidden = true; } clearTimeout(toastTimer); }
  // Einfache Strich-Symbole (statt Emojis) für runde Knöpfe; erben die Textfarbe.
  const SVG_ATTR = 'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const ICON = {
    star: '<svg ' + SVG_ATTR + '><polygon class="star" points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    print: '<svg ' + SVG_ATTR + '><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><path d="M6 14h12v7H6z"/></svg>',
    edit: '<svg ' + SVG_ATTR + '><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>',
    share: '<svg ' + SVG_ATTR + '><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/></svg>',
    trash: '<svg ' + SVG_ATTR + '><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  };
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // Zubereitungstext in nummerierte Schritte zerlegen (Satzende + Großbuchstabe; kein Lookbehind wegen iOS-Safari).
  function splitSteps(text) {
    if (!text) return [];
    // Emojis aus den Rezeptdaten (z. B. „✏️ Editor“) in der Oberfläche weglassen – die Daten bleiben unverändert
    const guarded = String(text).replace(/\s?[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?/gu, "").replace(/z\. B\./g, "z. B.");
    return guarded.split(/\.\s+(?=[A-ZÄÖÜ])/).map(s => s.trim()).filter(Boolean)
      .map(s => (/[.!?]$/.test(s) ? s : s + ".").replace(/z\. B\./g, "z. B."));
  }
  /* ---------- Hintergrund einfrieren, solange ein Overlay offen ist ----------
     „overflow: hidden“ am body reicht auf iOS Safari nicht – die Seite dahinter scrollt beim Wischen mit.
     Deshalb wird der body fixiert (position: fixed) und die Scrollposition gemerkt und beim Schließen
     wiederhergestellt. Mehrere Overlays (Detail → Editor, Picker) werden gezählt. */
  const openModals = new Set();
  let lockedScrollY = 0;
  // Fenster (Rezept, Auswahl, Editor, Druckvorschau): Hintergrund für Tastatur und Screenreader sperren, Fokus ins
  // Fenster setzen und beim Schließen dorthin zurückgeben, wo er vorher war.
  const focusBack = {};
  const BACKDROP = ["main", ".topbar", ".tabbar", "#side", ".footnote"];
  function setBackdropInert(on) {
    BACKDROP.forEach(sel => document.querySelectorAll(sel).forEach(el => { if (on) el.setAttribute("inert", ""); else el.removeAttribute("inert"); }));
  }
  function modalOpen(id) {
    if (openModals.size === 0) {
      lockedScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      document.body.classList.add("modal-open");
      document.body.style.top = -lockedScrollY + "px";
    }
    if (!openModals.has(id)) focusBack[id] = document.activeElement;
    openModals.add(id);
    setBackdropInert(true);
    const ov = document.getElementById(id + "-overlay");
    if (ov) setTimeout(() => {
      if (ov.hidden || ov.contains(document.activeElement)) return; // z. B. Auswahl: Suchfeld hat den Fokus schon
      const card = ov.querySelector(".overlay-card") || ov.querySelector(".print-bar") || ov;
      if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "-1");
      try { card.focus({ preventScroll: true }); } catch (e) {}
    }, 0);
  }
  function modalClose(id) {
    openModals.delete(id);
    if (openModals.size === 0) {
      document.body.classList.remove("modal-open");
      document.body.style.top = "";
      setBackdropInert(false);
      try { window.scrollTo(0, lockedScrollY); } catch (e) {}
    }
    const back = focusBack[id]; delete focusBack[id];
    if (back && back.isConnected && typeof back.focus === "function") { try { back.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ---------- Lebensmittel (nur intern für die Berechnung) ---------- */
  let foodIndex = {};
  function rebuildFoodIndex() {
    foodIndex = {};
    FOODS_DEFAULT.forEach(f => { foodIndex[f.name] = f; });
    // MCT-Öl: Fett- und kcal-Wert vom Etikett übersteuerbar (Vorgaben › Öl und MCT).
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
     „Angerührt“ (ohne Kochen: Fertigprodukte und Pulver-Mischungen); dazu „Favoriten“ als eigener Chip. */
  const FILTERS = [
    { id: "alle", label: "Alle" },
    { id: "favoriten", label: "Favoriten" },
    { id: "gefluegel", label: "Geflügel" },
    { id: "rind", label: "Rind & Schwein" },
    { id: "fisch", label: "Fisch" },
    { id: "ei", label: "Ei" },
    { id: "gemuese", label: "Erdäpfel & Gemüse" },
    { id: "obst", label: "Obst & Brei" },
    { id: "angeruehrt", label: "Angerührt" },
  ];
  function groupLabel(rec) { const g = recipeGroup(rec), f = FILTERS.find(x => x.id === g); return f ? f.label : ""; }
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
    if (filter === "favoriten") return isFav(rec);
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
    // Kalorien: leer = Vorschlag nach Gewicht (80 kcal/kg, FAO/WHO/UNU 2004, 6–24 Monate); ohne Gewicht 700 kcal.
    // „Bedarf schätzen“ (Krick) ändert die Verordnung NICHT von selbst – dort lässt sich die Schätzung bewusst übernehmen.
    const r10 = (v) => Math.round(v / 10) * 10;
    const bd = weight > 0 ? bedarfCalc({ weight }, s) : null;
    const kcalBasis = weight > 0 ? "gewicht" : "ohne";
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
    // Kalorien-Korridor nach Gewicht: 70–90 kcal/kg (FAO/WHO/UNU 2004, 6–24 Monate). Mit Krick-Schätzung für Kinder,
    // die nicht gehen: Bereich von der ESPGHAN-Faustregel (60 % von gesunden Kindern) bis zum Bedarf gesunder Kinder
    // (FAO/WHO); die Obergrenze bleibt mindestens 10 % über dem Ziel. Das Minimum ist manuell übersteuerbar; ohne
    // Gewicht gilt 85 % des Ziels.
    const kcalBereich = bd && bd.mob !== BD_MOBIL.geht;
    const kcalRichtwert = weight > 0 ? r10(weight * 80) : null;
    const kcalMaxAuto = kcalBereich ? Math.max(r10(bd.ref), r10(kcal * 1.1)) : weight > 0 ? r10(weight * 90) : null;
    // Automatisches Minimum nach Gewicht (70 kcal/kg), nie über der Verordnung (sonst wäre jeder Tag „unter dem Minimum“).
    // Der Bereich laut Schätzungen (ESPGHAN–FAO/WHO) wird nur angezeigt, er setzt das Minimum nicht.
    const kcalMinAuto = Math.min(weight > 0 ? r10(weight * 70) : r10(kcal * 0.85), kcal);
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
  /* Anzeigename (nur Anzeige – Schlüssel bleiben die vollen Datennamen): Klammerzusätze „(mit KetoCal)“, „(Obstbrei)“ und
     „(Obstbrei, mit KetoCal)“ fallen weg; enthält das Rezept KetoCal und steht „KetoCal“ nicht schon im Namen, folgt der
     Zusatz „mit KetoCal“ – unabhängig davon, ob es ein Geschwisterrezept gibt. Sondennahrung wie „Compleat & KetoCal“
     bleibt ohne Zusatz. */
  function displayName(rec) {
    const name = String(rec && rec.name || "").replace(/ \((?:Obstbrei, mit KetoCal|mit KetoCal|Obstbrei)\)/g, "").replace(/, mit KetoCal/g, "").trim();
    return { name, suffix: rec && rec.ketocal && !/ketocal/i.test(name) ? "mit KetoCal" : "" };
  }
  // als Text („Rind & Karotte · mit KetoCal“) und als HTML (Zusatz klein und grau in .name-suffix)
  function displayText(rec) { const dn = displayName(rec); return dn.name + (dn.suffix ? " · " + dn.suffix : ""); }
  function displayHtml(rec) { const dn = displayName(rec); return escapeHtml(dn.name) + (dn.suffix ? '<span class="name-suffix"> · ' + escapeHtml(dn.suffix) + "</span>" : ""); }
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
  // Fettbasis einer Variante als Kurztext für den Ausdruck: „Rapsöl“, „Butter“, „KetoCal + Butter“ …
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

  /* ---------- Wischen in der Rezeptliste: links = nächste Gruppe, rechts = vorige ----------
     Drücken und Ziehen im Bereich der Rezepte (Finger oder Maus) blättert zwischen den Gruppen wie zwischen
     den Blättern der Detailansicht: die Nachbargruppe wird beim Ziehen in eine zweite Fläche gerendert und
     rutscht neben der aktuellen Liste 1:1 mit dem Finger herein; die Chip-Zeile rollt mit, die Markierung springt
     ab halbem Weg auf die Nachbargruppe (wie die Reiter der Detailansicht, ohne Überblenden). Beim Loslassen läuft die Bewegung bis zur Ruhelage
     durch (oder weich zurück). Senkrechtes Wischen bleibt Scrollen; nach einem Zug löst der folgende Klick
     keine Kachel aus. */
  function chipScrollTarget(fb, chip) {
    // Lage des Chips innerhalb der Zeile (unabhängig davon, wo die Zeile auf der Seite steht – am Desktop rechts der linken Spalte)
    const left = chip.getBoundingClientRect().left - fb.getBoundingClientRect().left + fb.scrollLeft;
    return Math.max(0, Math.min(fb.scrollWidth - fb.clientWidth, left - (fb.clientWidth - chip.offsetWidth) / 2));
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
    // Favoriten stehen immer oben – auch wenn eine Gruppe (Geflügel, Fisch …) gewählt ist. Suche und die Schalter
    // „nur Diätologie“ / „ohne KetoCal“ gelten für sie wie für alle anderen Rezepte.
    const entries = [];
    allRecipes().forEach(rec => {
      const name = familyOf(rec);
      if (onlyQuelle && !rec.quelle) return;
      if (hideKeto && rec.ketocal) return;
      const fav = isFav(rec);
      if (!fav && !matchesFilter(rec, filter)) return;
      // Suche findet Anzeige- und vollen Datennamen (also auch „ketocal“, „obstbrei“) und Zutaten
      if (q && (rec.name + " " + name).toLowerCase().indexOf(q) === -1 && !hitItems(rec)) return;
      const res = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
      if (!res.ok) return;
      // Kachel zeigt die tatsächliche Mahlzeit (inkl. MCT-Mix, gemerktem Wasser) – wie Detail und Tagesplan.
      entries.push({ fam: { name: name }, rec, res: computeMealView(rec, d, null).res, fav });
    });
    // Innerhalb einer Gruppe: nach Name, gleiche Namen ohne KetoCal zuerst
    const byName = (a, b) => a.fam.name.localeCompare(b.fam.name, "de") || ((a.rec.ketocal ? 1 : 0) - (b.rec.ketocal ? 1 : 0));
    const favs = entries.filter(x => x.fav), rest = entries.filter(x => !x.fav);

    list.innerHTML = "";
    list.dataset.count = entries.length;
    // Keine Treffer (in der Gruppe): Hinweis mit Textlink „In allen Gruppen suchen“ bzw. „Filter zurücksetzen“
    const emptyLine = () => {
      const box = el("div", { class: "empty-line" }, q && filter !== "alle" ? "Keine Treffer in dieser Gruppe." : filter === "favoriten" && !q ? "Noch keine Favoriten – Stern bei einem Rezept setzen." : "Keine Treffer.");
      if (q && filter !== "alle") {
        const b = el("button", { type: "button", class: "tlink" }, "In allen Gruppen suchen");
        b.addEventListener("click", () => { state.settings.filter = "alle"; save(); renderRezepte(); });
        box.appendChild(b);
      } else if (onlyQuelle || hideKeto || q) {
        const b = el("button", { type: "button", class: "tlink" }, "Filter zurücksetzen");
        b.addEventListener("click", () => { state.settings.onlyQuelle = false; state.settings.hideKeto = false; const sq = document.getElementById("recipe-search"); if (sq) sq.value = ""; save(); renderRezepte(); });
        box.appendChild(b);
      }
      return box;
    };
    if (entries.length === 0) { list.appendChild(emptyLine()); return; }

    function appendGroup(title, arr) {
      if (!arr.length) return;
      const sorted = arr.slice().sort(byName);
      // Hülle je Gruppe: am Desktop eine Spalte der Liste, am Handy ohne Wirkung (display: contents)
      const grp = el("div", { class: "group" });
      grp.appendChild(el("div", { class: "group-head" }, '<h2 class="group-title">' + title + '</h2><span class="group-count">' + sorted.length + "</span>"));
      const grid = el("div", { class: "tiles" });
      sorted.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d, x.fam)));
      grp.appendChild(grid);
      list.appendChild(grp);
    }

    if (sort === "kategorie") {
      // Favoriten oben als eigene Gruppe (bei jedem Gruppen-Chip), darunter die Gruppen ohne die Favoriten (nichts doppelt)
      appendGroup("Favoriten", favs);
      FILTERS.filter(f => f.id !== "alle" && f.id !== "favoriten").forEach(f => appendGroup(f.label, rest.filter(x => recipeGroup(x.rec) === f.id)));
      // Gruppe gewählt, aber außer den Favoriten nichts darin: Hinweis unter den Favoriten
      if (!rest.length && filter !== "alle" && filter !== "favoriten") list.appendChild(emptyLine());
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
    placeRecipeSearch();
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
    // Wert kommt: „Vorschlag …“ (grün) oder „eigener Wert“ mit dem Link zurück zum Vorschlag.
    const src = (id, manual, autoText, resetLabel) => {
      const sp = $("src-" + id), bt = $("reset-" + id);
      if (sp) { sp.textContent = manual ? "eigener Wert" : autoText; sp.classList.toggle("auto", !manual); }
      if (bt) { bt.hidden = !manual; if (resetLabel) bt.textContent = resetLabel; }
    };
    put("set-kcal", d.kcalManual ? s.kcal : d.kcalAuto);
    src("kcal", d.kcalManual, d.kcalBasis === "krick" ? "Vorschlag · Krick" : d.weight > 0 ? "Vorschlag · 80 kcal/kg" : "Vorgabe ohne Gewicht", "Vorschlag " + fmt(d.kcalAuto, 0));
    put("set-kcalmin", d.kcalMinManual ? s.kcalMin : d.kcalMinAuto);
    src("kcalmin", d.kcalMinManual, d.kcalBereich ? "Vorschlag · ESPGHAN 60 %" : d.weight > 0 ? "Vorschlag · 70 kcal/kg" : "Vorschlag · 85 % des Ziels", "Vorschlag " + fmt(d.kcalMinAuto, 0));
    put("set-fluid", d.fluidManual ? s.fluidMl : (d.fluidAuto > 0 ? d.fluidAuto : ""));
    $("set-fluid").placeholder = d.fluidAuto > 0 ? "" : "ml/Tag (Gewicht eintragen)";
    src("fluid", d.fluidManual, d.fluidAuto > 0 ? "Vorschlag · 100 ml/kg" : "kein Vorschlag ohne Gewicht", "Vorschlag " + fmt(d.fluidAuto, 0));
    // Energiedichte (nur Modus „zwischen“; im anderen Modus ausgegraut, das Feld bleibt an seinem Platz)
    {
      const on = d.wasserModus === "zwischen", el2 = $("set-dichte"), manual = !(s.maxDichte === "" || s.maxDichte == null) && num(s.maxDichte) !== 1.5;
      put("set-dichte", on ? fmtNum(d.maxDichte) : "");
      if (el2) { el2.disabled = !on; el2.placeholder = on ? "1,5" : "– (alles in den Mahlzeiten)"; }
      src("dichte", on && manual, on ? "Vorgabe" : "nicht nötig", "auf 1,5");
    }
    // Eiweiß: das Ergebnis (g/Tag) steht in der Zeile unter der Auswahl; das Gramm-Feld erscheint nur bei „manuell“.
    put("set-eiweiss", d.autoProtein ? d.eiweiss : s.eiweiss);
    const em = $("eiweiss-manual"); if (em) em.hidden = d.autoProtein;
    {
      const sp = $("src-protein"), bt = $("reset-protein"), isStd = d.proteinPerKg === d.proteinStandard, hasW = num(s.weight) > 0;
      const txt = d.autoProtein ? (hasW ? (isStd ? "Standard · " : "") + fmt(d.eiweiss, 0) + " g/Tag" : "Gewicht eintragen") : "eigener Wert";
      if (sp) { sp.textContent = txt; sp.classList.toggle("auto", d.autoProtein && isStd && hasW); }
      if (bt) { bt.hidden = isStd; bt.textContent = "Standard " + fmt(d.proteinStandard, 1) + " g/kg"; }
    }
    renderHeader(d);
    renderVorgaben(d);
    if (state.settings.view === "heute") renderHeute();

    // Chips: Gruppen (entweder/oder, wischbar) und dahinter die Schalter „nur Diätologie“ und „ohne KetoCal“.
    const filter = FILTERS.some(f => f.id === s.filter) ? s.filter : "alle";
    const q = (($("recipe-search") || {}).value || "").trim().toLowerCase();
    const onlyQuelle = !!s.onlyQuelle, hideKeto = !!s.hideKeto;
    const fb = $("filter-bar");
    const prevScroll = fb.scrollLeft;
    fb.innerHTML = "";
    let activeChip = null;
    FILTERS.forEach(f => {
      const chip = el("button", { type: "button", class: "chip" + (f.id === filter ? " active" : ""), "aria-pressed": f.id === filter ? "true" : "false" }, f.label);
      chip.addEventListener("click", () => { state.settings.filter = f.id; save(); renderRezepte(); });
      fb.appendChild(chip);
      if (f.id === filter) activeChip = chip;
    });
    // Am Desktop stehen die Schalter als Häkchen im Kopf („Nur Diätologie“, „Ohne KetoCal“), am Handy als Chips.
    const dk = isDesktop(), tg = $("rz-toggles");
    if (tg) tg.innerHTML = "";
    [["only-quelle", "onlyQuelle", "nur Diätologie"], ["hide-keto", "hideKeto", "ohne KetoCal"]].forEach(([id, key, label]) => {
      const lab = dk && tg
        ? el("label", { class: "dk-check" }, '<input type="checkbox" id="' + id + '"' + (s[key] ? " checked" : "") + "> " + label.charAt(0).toUpperCase() + label.slice(1))
        : el("label", { class: "chip toggle" + (s[key] ? " on" : "") }, '<input type="checkbox" id="' + id + '"' + (s[key] ? " checked" : "") + "> " + label);
      const cb = lab.querySelector("input");
      cb.addEventListener("change", () => { state.settings[key] = cb.checked; save(); renderRezepte(); });
      (dk && tg ? tg : fb).appendChild(lab);
    });
    if (activeChip && fb.clientWidth > 0 && fb.scrollWidth > fb.clientWidth) {
      // Position behalten und weich zum aktiven Chip rollen (beim ersten Aufbau direkt hinsetzen)
      const target = chipScrollTarget(fb, activeChip);
      fb.scrollLeft = prevScroll;
      if (fb.dataset.ready && fb.scrollTo && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) fb.scrollTo({ left: target, behavior: "smooth" });
      else fb.scrollLeft = target;
    }
    fb.dataset.ready = "1";

    const sort = s.sort || "kategorie";
    $("sort-select").value = sort;
    fillRecipeList($("recipe-list"), filter, { d, q, onlyQuelle, hideKeto, sort });
    // Zeile über der Suche: wie viele Rezepte passen (zur Verordnung bzw. zur Suche/Gruppe)
    const lc = $("list-count"), n = num($("recipe-list").dataset.count);
    const countTxt = n + (n === 1 ? " Rezept passt" : " Rezepte passen") + (q ? " zur Suche" : filter === "alle" && !onlyQuelle && !hideKeto ? " zur Verordnung" : " zur Auswahl");
    if (lc) lc.textContent = countTxt;
    const rc = $("rz-count"); if (rc) rc.textContent = countTxt;
    if (typeof syncDetailPanel === "function") syncDetailPanel();
  }
  // Suchfeld: am Desktop im Kopf der Rezepte, am Handy in der Suchzeile neben „+“ (derselbe Knoten, Eingabe bleibt)
  function placeRecipeSearch() {
    const sq = document.getElementById("recipe-search"), slot = document.getElementById("rz-search-slot"), btn = document.getElementById("compose-btn");
    if (!sq || !slot || !btn) return;
    const want = isDesktop() ? slot : btn.parentElement;
    if (sq.parentElement === want) return;
    if (want === slot) slot.appendChild(sq); else want.insertBefore(sq, btn);
  }

  /* ---------- Kopfzeile, Bereiche (Tabs), Vorgaben ---------- */
  const VIEWS = ["heute", "rezepte", "vorgaben"];
  const PAGE_TITLES = { heute: "Tagesplan", rezepte: "Rezepte", vorgaben: "Vorgaben" };
  function showView(name) {
    if (VIEWS.indexOf(name) === -1) name = "rezepte";
    state.settings.view = name; save();
    document.body.setAttribute("data-view", name);
    if (name !== "heute") document.body.classList.remove("heute-tight"); // kleiner Kopf gilt nur für Heute
    if (typeof showVgPage === "function") showVgPage(null, true);
    VIEWS.forEach(v => {
      const sec = document.getElementById("view-" + v); if (sec) sec.hidden = v !== name;
    });
    document.querySelectorAll(".tabbar button[data-view], .side-nav button[data-view]").forEach(b => { b.classList.toggle("active", b.dataset.view === name); b.setAttribute("aria-current", b.dataset.view === name ? "page" : "false"); });
    const pt = document.getElementById("page-title"); if (pt) pt.textContent = PAGE_TITLES[name];
    if (name === "heute" && typeof renderHeute === "function") renderHeute();
    if (typeof syncDetailPanel === "function") syncDetailPanel(); // Desktop: Rezept-Panel nur im Bereich Rezepte
    try { window.scrollTo(0, 0); } catch (e) {}
    if (typeof markChip === "function") markChip();
  }
  // Merkt sich, von wo die Pille in die Vorgaben geführt hat – ein zweiter Tipp führt zurück.
  let chipReturn = null;
  function markChip() {
    const chip = document.getElementById("rx-chip"); if (!chip) return;
    const back = (state.settings.view === "vorgaben") && !!chipReturn;
    chip.classList.toggle("back", back);
    chip.title = back ? "Zurück zu " + ({ heute: "Heute", rezepte: "Rezepte" }[chipReturn.view] || "vorher") : (chip.dataset.full ? chip.dataset.full + "\n" : "") + "Tippen öffnet die Vorgaben";
  }
  // Verordnung im Kopf: Pille „1,8 : 1“ und darunter „640 kcal · 800 ml“ (Mono). Die ausführliche Fassung
  // (kcal je Mahlzeit, MCT, Wassergaben laut Tagesplan) steht im aria-label und als Tooltip.
  function renderHeader(d) {
    if (typeof schedulePushSync === "function") schedulePushSync(); // Erinnerungen an geänderten Plan angleichen
    const chip = document.getElementById("rx-chip"); if (!chip) return;
    const l1 = fmtTarget(d.ratio) + " · " + fmt(d.kcalMahl, 0) + " kcal × " + d.mahl +
      (d.mctShare > 0 ? " · MCT " + Math.round(d.mctShare * 100) + " %" + (d.mctMode === "kalorien" ? " (Kalorien halten)" : "") : "");
    let l2 = "";
    if (d.fluidDay > 0) {
      l2 = fmt(d.fluidDay, 0) + " ml/Tag · ";
      if (d.wasserModus === "mahlzeit") l2 += "alles in den Mahlzeiten (je " + fmt(d.fluidMahl, 0) + " ml)";
      else {
        // Wassergaben laut Zeitplan (offene Mahlzeiten geschätzt); ▲ wenn eine Gabe über der Höchstmenge liegt.
        const wg = waterGiftsText(d);
        l2 += "Wasser zwischen den Mahlzeiten: " + (wg.wp.per > 0 ? (wg.est ? "≈ " : "") + wg.text : "keines nötig");
        if (wg.wp.over) l2 += " · ▲ zu viel auf einmal";
      }
    }
    chip.innerHTML = '<span class="rx-pill">' + escapeHtml(fmtRx(d.ratio)) + '</span><span class="rx-sub">' + fmt(d.kcal, 0) + " kcal" + (d.fluidDay > 0 ? " · " + fmt(d.fluidDay, 0) + " ml" : "") + "</span>";
    chip.setAttribute("aria-label", l1 + (l2 ? " · " + l2 : ""));
    chip.dataset.full = l1 + (l2 ? "\n" + l2 : "");
    markChip();
    renderSideRx(d);
  }
  // Desktop: Verordnung in der linken Spalte als Wertetabelle (Verhältnis groß in Mono, darunter die Tageswerte)
  function renderSideRx(d) {
    const box = document.getElementById("side-rx"); if (!box) return;
    const row = (l, v) => '<div class="side-row"><span>' + l + '</span><b>' + escapeHtml(v) + '</b></div>';
    box.innerHTML = '<div class="side-rx-head"><span class="overline">Verordnung</span>' +
      '<button type="button" class="tlink" id="side-rx-edit" title="Verordnung in den Vorgaben ändern">Ändern</button></div>' +
      '<div class="side-ratio"><b>' + escapeHtml(fmtRx(d.ratio)) + '</b><span>Fett : Eiweiß + KH</span></div>' +
      row("Kalorien am Tag", fmt(d.kcal, 0) + " kcal") + row("je Mahlzeit", d.mahl + " × " + fmt(d.kcalMahl, 0)) +
      row("Eiweiß am Tag", fmt(d.eiweiss, 0) + " g") + row("Flüssigkeit", d.fluidDay > 0 ? fmt(d.fluidDay, 0) + " ml" : "kein Ziel") +
      '<span class="side-foot">' + (d.mctShare > 0 ? "MCT " + Math.round(d.mctShare * 100) + " %" : "nur Rapsöl") + (d.weight > 0 ? " · " + fmt(d.weight, 1) + " kg" : "") + "</span>";
  }
  function regelLabel(d) { return d.mctMode === "kalorien" ? "Kalorien halten" : "Verhältnis halten"; }
  /* ---------- Vorgaben: Liste mit Unterseiten ----------
     Die Liste zeigt je Bereich eine Zusammenfassung; jede Zeile öffnet eine Unterseite („‹ Vorgaben“ zurück).
     Die Verordnung ist gesperrt, bis man „Bearbeiten“ tippt: Felder wirken sofort (die Kennzahlen rechnen mit),
     „Abbrechen“ stellt den Stand von vorher wieder her, „Speichern“ schließt die Felder (Meldung mit Rückgängig). */
  let vgPage = null, voEdit = false, voSnap = null;
  const VO_KEYS = ["ratio", "mahlzeiten", "weight", "kcal", "kcalMin", "proteinPerKg", "eiweiss"];
  function showVgPage(name, quiet) {
    if (voEdit && name !== "verordnung") voFinish(true);
    // Desktop: Menü links bleibt stehen, rechts immer eine Unterseite (ohne Auswahl die Verordnung)
    vgPage = name || (isDesktop() ? "verordnung" : null);
    const list = document.getElementById("vg-list"); if (!list) return;
    list.hidden = !!vgPage;
    const cur = vgPage === "bedarf" ? "verordnung" : vgPage;
    list.querySelectorAll(".vg-row[data-vg]").forEach(r => { r.classList.toggle("active", r.dataset.vg === cur); r.setAttribute("aria-current", r.dataset.vg === cur ? "page" : "false"); });
    document.querySelectorAll("#view-vorgaben .vg-page").forEach(p => { p.hidden = p.dataset.vgpage !== vgPage; });
    document.body.classList.toggle("vg-sub", !!vgPage && state.settings.view === "vorgaben");
    if (!quiet) { try { window.scrollTo(0, 0); } catch (e) {} }
  }
  // Breite wechselt (Handy ↔ Desktop): am Desktop braucht die rechte Seite der Vorgaben eine Unterseite
  // Offene Fenster (Rezept, Editor) neu aufbauen – am Handy blättert man, am Desktop schaltet man Reiter um.
  function onLayoutChange() {
    if (isDesktop() && !vgPage) showVgPage(null, true);
    const dv = document.getElementById("detail-overlay");
    if (dv && !dv.hidden && !dv.closest("#rz-panel") && typeof renderDetail === "function") renderDetail();
    const cv = document.getElementById("compose-overlay");
    if (cv && !cv.hidden && typeof openCompose === "function") openCompose();
  }
  function voSnapshot() { const o = {}; VO_KEYS.forEach(k => { o[k] = Object.prototype.hasOwnProperty.call(state.settings, k) ? state.settings[k] : undefined; }); return o; }
  function voRestore(snap) { VO_KEYS.forEach(k => { if (snap[k] === undefined) delete state.settings[k]; else state.settings[k] = snap[k]; }); save(); renderRezepte(); }
  function voFinish(keep) {
    const snap = voSnap, changed = snap && JSON.stringify(voSnapshot()) !== JSON.stringify(snap);
    voEdit = false; voSnap = null;
    if (!keep && snap) voRestore(snap); else renderRezepte();
    if (keep && changed) showToast("Verordnung gespeichert", [["Rückgängig", () => voRestore(snap)]]);
  }
  function renderVgList(d) {
    const s = state.settings, put = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
    put("vgs-verordnung", fmtRx(d.ratio) + " · " + fmt(d.kcal, 0) + " kcal");
    put("vgs-fluessigkeit", d.fluidDay > 0 ? fmt(d.fluidDay, 0) + " ml am Tag" + (d.wasserModus === "mahlzeit" ? " · in den Mahlzeiten" : "") : "kein Ziel");
    put("vgs-oel", d.mctShare > 0 ? "MCT " + Math.round(d.mctShare * 100) + " %" + (d.mctMode === "kalorien" ? " · Kalorien halten" : "") : "nur Rapsöl");
    put("vgs-kueche", "Verdunstung " + fmt(num(d.dampfVerdunstung), 0) + " ml");
    let syncOn = false; try { syncOn = typeof syncLoadMeta === "function" && !!syncLoadMeta().key; } catch (e) {}
    const app = [s.pushOn ? "Erinnerungen an" : "", syncOn ? "Abgleich an" : ""].filter(Boolean);
    put("vgs-app", app.length ? app.join(" · ") : "nur auf diesem Gerät");
    // Verordnung: Ansicht (gesperrt) mit Herkunft der Werte; die Felder liegen in #vo-editbox
    const src = (id) => { const e = document.getElementById(id); return e ? e.textContent : ""; };
    const rows = [
      ["Verhältnis (Fett : Eiweiß + KH)", "Verordnung", fmtRx(d.ratio)],
      ["Mahlzeiten pro Tag", "", String(d.mahl)],
      ["Körpergewicht", "zuletzt gewogen", d.weight > 0 ? fmt(d.weight, 1) + " kg" : "—"],
      ["Kalorien pro Tag", src("src-kcal"), fmt(d.kcal, 0) + " kcal"],
      ["Kalorien mindestens", src("src-kcalmin"), fmt(d.kcalMin, 0) + " kcal"],
      ["Eiweiß pro Tag", d.autoProtein ? (d.proteinPerKg === d.proteinStandard ? "Standard · " : "") + fmt(d.proteinPerKg, 1) + " g/kg" : "manuell", fmt(d.eiweiss, 0) + " g"],
    ];
    const vv = document.getElementById("vo-view");
    if (vv) vv.innerHTML = rows.map(r => '<div class="vo-row"><div class="vo-lbl"><span>' + r[0] + '</span>' + (r[1] ? '<span class="src">' + escapeHtml(r[1]) + "</span>" : "") + '</div><div class="vo-val">' + escapeHtml(r[2]) + "</div></div>").join("");
    const eb = document.getElementById("vo-editbox"); if (eb) eb.hidden = !voEdit;
    if (vv) vv.hidden = voEdit;
    const ed = document.getElementById("vo-edit"); if (ed) ed.hidden = voEdit;
    const mt = document.getElementById("mct-mode-text");
    if (mt) mt.textContent = d.mctMode === "kalorien"
      ? "Die Kalorien bleiben exakt, dafür steigt das Verhältnis – das ist eine Änderung der Verordnung."
      : "Das Verhältnis bleibt exakt. Die Kalorien sinken etwas, weil MCT weniger kcal je Gramm liefert.";
  }
  function bindVgPages() {
    document.querySelectorAll("#view-vorgaben [data-vg]").forEach(b => b.addEventListener("click", () => showVgPage(b.dataset.vg)));
    document.querySelectorAll("#view-vorgaben [data-vgback]").forEach(b => b.addEventListener("click", () => showVgPage(b.dataset.vgback === "list" ? null : b.dataset.vgback)));
    const ed = document.getElementById("vo-edit"), ca = document.getElementById("vo-cancel"), sv = document.getElementById("vo-save");
    if (ed) ed.addEventListener("click", () => { voSnap = voSnapshot(); voEdit = true; renderRezepte(); const f = document.getElementById("set-ratio"); try { if (f) f.focus(); } catch (e) {} });
    if (ca) ca.addEventListener("click", () => voFinish(false));
    if (sv) sv.addEventListener("click", () => voFinish(true));
  }
  function renderVorgaben(d) {
    const s = state.settings;
    renderVgList(d);
    if (typeof renderPushCard === "function") renderPushCard();
    if (typeof renderSyncCard === "function") renderSyncCard();
    if (typeof renderBedarf === "function") renderBedarf(d);
    // Richtung des Verhältnisses klarstellen: Fett zuerst. „1,5“ = 1,5:1 (mehr Fett), „1:1,5“ = 0,67 (weniger Fett).
    // Die Warnung steht in der Zusammenfassung, nicht im Feldraster – dort darf sich nichts verschieben.
    const ratioWarn = d.ratio < 1
      ? '<div id="ratio-hint" class="note warn">▲ ' + fmtTarget(d.ratio) + " heißt nur " + fmt(d.ratio, 2) + " g Fett je 1 g Eiweiß+KH – <strong>weniger Fett als Eiweiß+KH</strong>, also unterhalb von 1:1. Das ist beim Ausschleichen möglich, bitte prüfen, ob die Verordnung wirklich so lautet.</div>"
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
            '<p class="vg-more">Die Mahlzeit bekommt nur ihr Rezept-Wasser zum Pürieren bzw. Anrühren. Uhrzeiten stehen im Tagesplan.</p>';
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
      m.setAttribute("content", t === "dark" ? "#1c1a16" : "#f5f0e5");
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
    // Was nur zu diesem Gerät gehört (Erinnerungen und deren Dienst-Adresse), nicht aus dem Backup übernehmen
    const keep = {}; ["pushOn", "pushUrl", "pushMeals", "pushWater", "pushLead"].forEach(k => { keep[k] = state.settings[k]; });
    state = load(JSON.stringify(st));
    Object.keys(keep).forEach(k => { if (keep[k] === undefined) delete state.settings[k]; else state.settings[k] = keep[k]; });
    const stored = save();
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
    // „nur Diätologie“ und „ohne KetoCal“ sind Chips in der Gruppenzeile (renderRezepte bindet sie bei jedem Aufbau).
    document.querySelectorAll(".tabbar button[data-view], .side-nav button[data-view]").forEach(b => b.addEventListener("click", () => { chipReturn = null; showView(b.dataset.view); }));
    // Desktop: „Ändern“ in der Verordnung der linken Spalte öffnet Vorgaben → Verordnung
    const side = document.getElementById("side-rx");
    if (side) side.addEventListener("click", (e) => { if (!e.target.closest("#side-rx-edit")) return; chipReturn = null; showView("vorgaben"); showVgPage("verordnung"); });
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
        showView("vorgaben"); showVgPage("verordnung");
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
  // Rezeptzeile (Küchenzettel): Name (Serif, ggf. „· mit KetoCal“ klein und grau), darunter Mono „128 kcal · 131 ml ·
  // Eiweiß 2,4 g“ (Eiweiß grün ok, rot mit „hoch“/„niedrig“), darunter grau die Herkunft („Diätologie“); rechts der Stern.
  const STAR_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  function renderRecipeTile(rec, res, d, fam) {
    const sum = sumMacros(res.items);
    const r = ratioOf(sum);
    const ml = volumeMl(res.items);
    const pState = proteinState(sum.eiweiss, d.eiweissMahl);
    const fav = isFav(rec);
    const tags = [];
    if (rec.quelle) tags.push("Diätologie");
    // Fettbasis steht nicht mehr hier (der Name zeigt „mit KetoCal“, die Zutatenliste den Rest) – nur die Herkunft
    if (rec.custom) tags.push("eigenes Rezept");
    const tile = el("div", { class: "tile", tabindex: "0", role: "button", "data-key": recipeKey(rec) });
    tile._rec = rec; // Desktop: erstes Rezept der Liste ins Panel
    tile.innerHTML =
      '<div class="tile-body"><span class="tile-name">' + displayHtml(rec) + '</span>' +
      '<span class="tile-stats">' + fmt(sum.kcal, 0) + " kcal · " + fmt(ml, 0) + " ml · " +
        '<b class="prot-' + pState + '"' + (pState === "high" ? ' title="mehr als das Doppelte des Eiweiß-Ziels"' : "") + '>Eiweiß ' + fmt(sum.eiweiss) + " g" + (pState === "high" ? " · hoch" : pState === "low" ? " · niedrig" : "") + "</b>" +
        (ratioClass(r, d.ratio) !== "ok" ? ' · <b class="ratio-pill ' + ratioClass(r, d.ratio) + '">▲ ' + fmtRxA(r, 2) + "</b>" : "") + "</span>" +
      (tags.length ? '<span class="tile-badge">' + tags.join(" · ") + "</span>" : '<span class="tile-badge" hidden></span>') +
      "</div>" +
      '<button type="button" class="favbtn' + (fav ? " on" : "") + '" title="' + (fav ? "Favorit entfernen" : "Als Favorit merken") + '" aria-pressed="' + (fav ? "true" : "false") + '" aria-label="Favorit">' + STAR_SVG + "</button>";
    const open = () => openRecipeDetail(rec);
    tile.addEventListener("click", open);
    tile.addEventListener("keydown", e => { if (e.target !== tile) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
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
    put("bd-birth", s.bdBirth || ""); markDateEmpty(); put("bd-mobil", s.bdMobil || "liegt"); put("bd-tonus", s.bdTonus || "normal");
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
          '<li><i class="sw krick"></i><span><b>Krick-Formel (1992): ' + fmt(r.krick, 0) + " kcal</b> (" + kg(r.krick) + ") – Schätzung für euer Kind aus Gewicht, Alter und Geschlecht, bei „" + escapeHtml(r.mob[1]) + "“ und " + r.ton[1] + " Muskelspannung</span></li>" +
          (walks ? "" : '<li><i class="sw band"></i><span><b>ESPGHAN-Leitlinie (2017): ' + fmt(r.lo, 0) + "–" + fmt(r.hi, 0) + " kcal</b> – Faustregel für Kinder, die nicht gehen: 60–70 % von gesunden Kindern; rechnet nur mit dem Alter</span></li>") +
          '<li><i class="sw ref"></i><span><b>FAO/WHO (2004): ' + fmt(r.ref, 0) + " kcal</b> (" + kg(r.ref) + ") – Bedarf gesunder Kinder gleichen Alters, ohne Einschränkung</span></li>" +
        "</ul>" +
        '<div class="bd-s bd-m">Keine feste Empfehlung – solche Formeln liegen oft 20–40 % daneben. Wie viel euer Kind braucht, legt das Team nach dem Wachstum fest.</div></div>' +
      '<p class="bd-one">Eiweiß ' + fmt(prot, 1) + " g/kg " + (prot >= r.protRef - 0.005
        ? '<span class="ok">ausreichend</span> <small>(Richtwert ≈ ' + fmt(r.protRef, 1) + ")</small>"
        : '<span class="warn-t">▲ unter dem Richtwert (≈ ' + fmt(r.protRef, 1) + ") – mit dem Team besprechen</span>") + "</p>" +
      (d.kcal < r.ref * 0.7 ? '<p class="bd-one">▲ Verordnung unter 70 % von Gleichaltrigen – Vitamine/Mineralstoffe mit dem Team abklären.</p>' : "") +
      (r.jump ? '<p class="bd-one">Am 3. Geburtstag wechselt die Formel – die Schätzung springt um etwa ' + r.jump + " %.</p>" : "") +
      // Bewusst übernehmen: die Schätzung ändert die Verordnung nur auf Knopfdruck (mit Rückgängig)
      (Math.round(r.krick / 10) * 10 !== Math.round(d.kcal) ? '<p class="bd-one"><button type="button" class="btn outline" id="bd-apply">Krick-Schätzung übernehmen: ' +
        fmt(Math.round(r.krick / 10) * 10, 0) + ' kcal am Tag</button></p>' : "");
  }
  // Leeres Datumsfeld: grauer Platzhalter „TT.MM.JJJJ“ (.date-wrap.empty), auch dort, wo der Browser keinen zeigt
  function markDateEmpty() {
    const el = document.getElementById("bd-birth"), w = el && el.closest(".date-wrap");
    if (w) w.classList.toggle("empty", !el.value);
  }
  function bindBedarf() {
    const birth = document.getElementById("bd-birth"); if (!birth) return;
    birth.addEventListener("input", markDateEmpty);
    // Alles neu zeichnen (Skala, Hinweise); die Verordnung ändert sich dadurch nicht
    const set = (k, v) => { state.settings[k] = v; save(); renderRezepte(); };
    birth.addEventListener("change", () => { markDateEmpty(); set("bdBirth", birth.value); });
    document.getElementById("bd-mobil").addEventListener("change", (e) => set("bdMobil", e.target.value));
    document.getElementById("bd-tonus").addEventListener("change", (e) => set("bdTonus", e.target.value));
    document.getElementById("bd-sex").addEventListener("change", (e) => set("bdSex", e.target.value));
    document.querySelectorAll("#bd-gain button").forEach(b => b.addEventListener("click", () => set("bdGain", num(b.dataset.gain))));
    // „Krick-Schätzung übernehmen“ setzt die Kalorien der Verordnung (eigener Wert), mit Rückgängig
    const out = document.getElementById("bd-out");
    if (out) out.addEventListener("click", (e) => {
      if (!e.target.closest("#bd-apply")) return;
      const r = bedarfCalc(derived(), state.settings); if (!r) return;
      const prev = state.settings.kcal, v = Math.round(r.krick / 10) * 10;
      state.settings.kcal = v; save(); renderRezepte();
      showToast("Verordnung: " + fmt(v, 0) + " kcal am Tag", [["Rückgängig", () => { state.settings.kcal = prev; save(); renderRezepte(); }]]);
    });
  }

  /* ---------- Detailansicht (Overlay) ---------- */
  // Blätter der Detailansicht in Reihenfolge: Mahlzeit (eine Portion), Tag (Zubereitungsmenge, intern „abwiegen“),
  // Anpassen, Kochen (intern „zubereitung“).
  const DETAIL_PAGES = [["mahlzeit", "Mahlzeit"], ["abwiegen", "Tag"], ["anpassen", "Anpassen"], ["zubereitung", "Kochen"]];
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
    detailRec = rec; detailPicked = true; if (!keepScale) detailScale = "tag"; detailMeat = null;
    detailMctOpen = Math.min(1, Math.max(0, num(state.settings.mctShare)));
    state.settings.detailTab = "mahlzeit"; // jedes Rezept öffnet mit „Mahlzeit“; innerhalb der Ansicht bleibt das gewählte Blatt
    renderDetail();
    const overlay = document.getElementById("detail-overlay");
    overlay.hidden = false;
    if (panelMode()) { syncDetailPanel(true); revealPanel(); }
    else if (!detailModal) { modalOpen("detail"); detailModal = true; }
  }
  /* Desktop, Bereich Rezepte: das Rezept steht als festes Panel rechts neben der Liste (kein Overlay, kein Einfrieren).
     Dafür wandert #detail-overlay in #rz-panel und beim Verlassen zurück an seinen Platz. Ein Klick auf eine Zeile
     wechselt das Panel; ohne Auswahl zeigt es das erste Rezept der Liste. Aus dem Tagesplan und bei Fenstern unter
     1100 px öffnet ein Rezept als zentriertes Fenster. Wird das Fenster schmaler, während ein selbst gewähltes Rezept
     im Panel steht, bleibt es als Fenster offen (die automatische Vorauswahl nicht); wird es breiter, wandert ein offenes
     Fenster ins Panel. */
  let detailModal = false, detailHome = null, detailPicked = false;
  function panelMode() { return isDesktop() && isPanelWidth() && state.settings.view === "rezepte"; }
  function syncDetailPanel(opened) {
    const ov = document.getElementById("detail-overlay"), slot = document.getElementById("rz-panel");
    if (!ov || !slot) return;
    if (!detailHome) detailHome = { parent: ov.parentElement, next: ov.nextSibling };
    const list = document.getElementById("recipe-list");
    if (!panelMode()) {
      if (ov.parentElement === slot) {
        closeTodaySheet(); detailHome.parent.insertBefore(ov, detailHome.next);
        // nur die Breite hat sich geändert (Bereich Rezepte bleibt): das gewählte Rezept als Fenster weiterzeigen
        if (detailPicked && detailRec && !ov.hidden && state.settings.view === "rezepte") {
          renderDetail();
          if (!detailModal) { modalOpen("detail"); detailModal = true; }
        } else ov.hidden = true;
      }
      document.body.classList.remove("detail-panel");
      if (list) list.querySelectorAll(".tile.sel").forEach(t => t.classList.remove("sel"));
      return;
    }
    if (detailModal) { modalClose("detail"); detailModal = false; }
    if (ov.parentElement !== slot) slot.appendChild(ov);
    document.body.classList.add("detail-panel");
    // Auswahl: das offene Rezept, sonst das erste der Liste (ist es nicht mehr in der Liste, ebenfalls das erste)
    const tiles = list ? [...list.querySelectorAll(".tile")] : [];
    const key = detailRec ? recipeKey(detailRec) : null;
    let sel = key ? tiles.find(t => t.dataset.key === key) : null;
    if (!opened && !sel && tiles.length && tiles[0]._rec) {
      detailRec = tiles[0]._rec; detailPicked = false; detailScale = "tag"; detailMeat = null; state.settings.detailTab = "mahlzeit";
      detailMctOpen = Math.min(1, Math.max(0, num(state.settings.mctShare)));
      sel = tiles[0];
    }
    tiles.forEach(t => t.classList.toggle("sel", t === sel));
    if (!detailRec || (!sel && !opened)) { ov.hidden = true; return; }
    ov.hidden = false;
    // Inhalt auffrischen (z. B. nach geänderten Vorgaben oder Favorit in der Liste) – nicht während im Panel getippt wird
    if (!opened && !slot.contains(document.activeElement)) renderDetail();
  }
  // Liegt das Panel außer Sicht (z. B. weit gescrollt), nach der Auswahl dorthin rollen
  function revealPanel() {
    const slot = document.getElementById("rz-panel"); if (!slot) return;
    const r = slot.getBoundingClientRect();
    if (r.top > window.innerHeight - 80 || r.bottom < 0) { try { slot.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }
  }
  // Eine Mahlzeit vollständig berechnen – dieselbe Pipeline für Detailansicht und Tagesplan:
  // Basis (Verhältnis + kcal/Mahlzeit) → optionaler Fleisch-Tausch → Öl-Mix (MCT-Anteil)
  // → gemerktes Wasser. Ergebnis ist eine Portion (= eine Mahlzeit).
  function computeMealView(rec, d, meatChoice) {
    const base = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
    let res = base;
    let adjIndex = base.fatIndex, adjLabel = '<small class="adj">stellt das Verhältnis ein</small>';
    const swapSlot = recipeMeatSlot(rec);
    if (swapSlot && meatChoice && meatChoice !== swapSlot.baseKey) {
      // Fleisch nach den Mengen der Diätologin tauschen (20 g Huhn ≙ 30 g Rind ≙ 18 g Pute) und das Rezept danach wie
      // jedes andere auf Verhältnis UND kcal je Mahlzeit einstellen – Öl und Menge passen sich an.
      const sw = computeAdjustedRecipe(applyMeatChoice(rec, meatChoice), d.kcalMahl, d.ratio);
      if (sw.ok) { res = sw; adjIndex = sw.fatIndex; }
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
      let items2 = res.items.map(it => {
        if (!isW(it)) return it;
        let g;
        if (sumW > 0) g = num(it.grams) * target / sumW; else { g = first ? target : 0; first = false; }
        return { food: it.food, grams: round1(g) };
      });
      // Rezept ohne eigene Wasser-Zutat (z. B. HiPP-Gläschen): gemerktes Wasser als eigene Zeile anhängen
      if (!res.items.some(isW) && target > 0) items2 = items2.concat([{ food: "Wasser", grams: round1(target) }]);
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
    if (wp.per === 0) return '<div class="note tip">' + base + ' – das Tagesziel ist damit schon erreicht, keine Wassergaben nötig.</div>';
    return '<div class="note ' + (wp.over ? 'warn' : 'tip') + '">' + (wp.over ? '▲ ' : '') + base + ' + <strong>' + wp.n + ' × ' + fmt(wp.per, 0) + ' ml Wasser</strong> ≈ ' + fmt(wp.total, 0) + ' ml am Tag' +
      (wp.over ? ' · über ' + fmt(d.maxMahlMl, 0) + ' ml je Gabe' : '') + '</div>';
  }
  function regelZeile(d) {
    return '<div class="hint">Rechenregel: <strong>' + regelLabel(d) + '</strong> · <button type="button" class="tlink" data-goto="vorgaben">unter Vorgaben ändern</button></div>';
  }
  /* ---------- Blätter (Reiter am Desktop, Wisch-Seiten mit Punkten am Handy) – für Detail und Editor ---------- */
  function pagerHead(PAGES, cur, tabsId) {
    const tabBtn = (pg) => '<button type="button" data-dtab="' + pg[0] + '"' + (cur === pg[0] ? ' class="active" aria-selected="true"' : ' aria-selected="false"') + ' role="tab">' + pg[1] + "</button>";
    return '<div class="detail-tabs-wrap"><div class="seg-ink detail-tabs" role="tablist" id="' + tabsId + '">' + PAGES.map(tabBtn).join("") + "</div></div>";
  }
  // onChange(k): gewähltes Blatt merken; rerender(): am Desktop wird nach einem Reiterklick neu gezeichnet.
  function setupPager(c, PAGES, cur, onChange, rerender) {
    const mobile = isMobileLayout();
    const pages = c.querySelector(".pages");
    const panes = pages ? [...pages.querySelectorAll(":scope > .pane")] : [];
    const pageIdx = (k) => Math.max(0, PAGES.findIndex(pg => pg[0] === k));
    const leftOf = (i) => panes[i] && panes[0] ? panes[i].offsetLeft - panes[0].offsetLeft : 0;
    const markTab = (k) => {
      c.querySelectorAll(".detail-tabs button[data-dtab]").forEach(b => { b.classList.toggle("active", b.dataset.dtab === k); b.setAttribute("aria-selected", b.dataset.dtab === k ? "true" : "false"); });
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
    if (mobile && pages) bindMouseDrag(pages, panes);
    c.querySelectorAll(".detail-tabs button[data-dtab]").forEach(b =>
      b.addEventListener("click", () => {
        current = b.dataset.dtab; onChange(current);
        if (mobile && pages) { markTab(current); goTo(current, true); }
        else rerender();
      }));
  }
  // Blätter mit der Maus seitlich ziehen (Finger nutzen das native Scrollen mit Einrasten). An den Enden gibt
  // ein Gummiband von 25 % nach; beim Loslassen rastet das nächste Blatt ein.
  function bindMouseDrag(pages, panes) {
    let st = null;
    pages.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || (e.target.closest && e.target.closest("input, button, select, label, summary, a"))) return;
      st = { x0: e.clientX, left: pages.scrollLeft, moved: false };
    });
    pages.addEventListener("pointermove", (e) => {
      if (!st) return;
      const dx = e.clientX - st.x0; if (Math.abs(dx) > 4) st.moved = true;
      const max = pages.scrollWidth - pages.clientWidth, want = st.left - dx;
      pages.style.scrollSnapType = "none";
      if (want < 0) { pages.scrollLeft = 0; pages.style.transform = "translateX(" + Math.round(-want * 0.25) + "px)"; }
      else if (want > max) { pages.scrollLeft = max; pages.style.transform = "translateX(" + Math.round((max - want) * 0.25) + "px)"; }
      else { pages.scrollLeft = want; pages.style.transform = ""; }
    });
    const end = (e) => {
      if (!st) return;
      const dx = e.clientX - st.x0, w = pages.clientWidth || 1, moved = st.moved;
      const i0 = Math.round(st.left / w), i = Math.max(0, Math.min(panes.length - 1, i0 + (dx < -w * 0.2 ? 1 : dx > w * 0.2 ? -1 : 0)));
      st = null;
      pages.style.transition = "transform .2s ease-out"; pages.style.transform = "";
      setTimeout(() => { pages.style.transition = ""; pages.style.scrollSnapType = ""; }, 220);
      try { pages.scrollTo({ left: i * w, behavior: "smooth" }); } catch (err) { pages.scrollLeft = i * w; }
      if (moved) { const sw = (ev) => { ev.stopPropagation(); ev.preventDefault(); }; pages.addEventListener("click", sw, { capture: true, once: true }); setTimeout(() => pages.removeEventListener("click", sw, { capture: true }), 300); }
    };
    pages.addEventListener("pointerup", end);
    pages.addEventListener("pointerleave", end);
  }
  // Lässt sich das Rezept mit diesem Fleisch auf die Verordnung einstellen? (Bei sehr niedrigem Verhältnis bringt z. B. Rind
  // schon zu viel Fett mit – dann gibt es keine Lösung.)
  function meatSwapPossible(rec, d, k) {
    const slot = recipeMeatSlot(rec); if (!slot || !k || k === slot.baseKey) return true;
    return computeAdjustedRecipe(applyMeatChoice(rec, k), d.kcalMahl, d.ratio).ok;
  }
  // Mengen, Wasser oder MCT im Rezept geändert: auch Liste, Tagesplan, Kopf und Seitenleiste neu zeichnen
  // (sonst zeigen sie bis zum Neuladen die alten Werte, und der Tagesplan-Ausdruck mischt alt und neu)
  function detailChanged() { renderDetail(); if (typeof renderRezepte === "function") renderRezepte(); }
  function renderDetail() {
    const rec = detailRec;
    const d = derived();
    // Nicht mögliche Fleischwahl (z. B. nach geänderter Verordnung) zurücksetzen, statt still beim Original zu bleiben
    if (detailMeat && !meatSwapPossible(rec, d, detailMeat)) detailMeat = null;
    const mv = computeMealView(rec, d, detailMeat);
    // Lässt sich das Rezept nicht auf die Verordnung einstellen, sind seine Gramm unbrauchbar: keine Mengen, kein
    // Einplanen und kein Drucken – nur der Hinweis (z. B. nach geänderter Verordnung oder über einen alten Link).
    if (!mv.res.ok) {
      const cc = document.getElementById("detail-content");
      cc.innerHTML = '<div class="sheet-grip" aria-hidden="true"></div><div class="detail-head"><div class="dh-tags"><span class="ratio-pill bad">' +
        escapeHtml(fmtRxA(mv.res.ratio, 2)) + '</span></div><h2 class="title">' + displayHtml(rec) + '</h2></div>' +
        '<div class="pages"><section class="pane"><div class="pane-in"><div class="note warn">▲ Dieses Rezept lässt sich nicht auf die Verordnung (' +
        escapeHtml(fmtRx(d.ratio)) + ', ' + fmt(d.kcalMahl, 0) + ' kcal je Mahlzeit) einstellen. Bitte ein anderes Rezept wählen – die Mengen dieses Rezepts dürfen so nicht verwendet werden.</div></div></section></div>';
      return;
    }
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

    // Gibt es das Gericht auch in der anderen Fettbasis, führt ein Link zum Geschwister-Rezept (Blatt Anpassen).
    // Nur Geschwister, die sich auf die Verordnung einstellen lassen (sonst wären ihre Mengen unbrauchbar)
    const sibs = siblingVariants(rec).filter(v => computeAdjustedRecipe(v, d.kcalMahl, d.ratio).ok);
    // Kopf: Verhältnis-Pille, grau Diätologie · eigenes Rezept. Die Fettbasis steht nicht als Schild da – sie zeigt sich
    // am Namenszusatz „· mit KetoCal“ und in der Zutatenliste.
    const headTags = [rec.quelle ? "Diätologie" : "", rec.custom ? "eigenes Rezept" : ""].filter(Boolean);
    let basisSeg = "";
    if (sibs.length) {
      // Link „Auch mit KetoCal“ / „Auch ohne KetoCal“ (ohne Butter/Rapsöl im Text)
      const sibText = (v) => !!v.ketocal !== !!rec.ketocal ? (v.ketocal ? "Auch mit KetoCal" : "Auch ohne KetoCal") : "Auch als „" + escapeHtml(displayText(v)) + "“";
      basisSeg = '<div class="adj-block basis"><div class="overline">Fettbasis</div><div class="adj-text">Dieses Gericht gibt es auch als eigenes Rezept mit eigenen Mengen:</div>' +
        sibs.map(v => '<button type="button" class="tlink" data-open-rec="' + escapeHtml(recipeKey(v)) + '">' + sibText(v) + "</button>").join("") + "</div>";
    }

    // Packungs-Hinweis (z. B. Compleat 500 ml, 3 Tage haltbar): reine Information, wie weit eine Packung reicht.
    let packInfoSeg = "";
    if (rec.packung) {
      const pk = rec.packung, mlMeal = items.filter(it => it.food === pk.food).reduce((a, it) => a + num(it.grams), 0);
      if (mlMeal > 0) {
        const nMeals = Math.floor(pk.ml / mlMeal + 1e-9), maxMeals = d.mahl * pk.tage;
        const usedInTage = Math.min(nMeals, maxMeals) * mlMeal;
        packInfoSeg = '<div class="note tip pack"><strong>Packung ' + pk.ml + ' ml</strong> (offen ' + pk.tage + ' Tage haltbar): ' +
          fmt(mlMeal, 0) + ' ml je Mahlzeit · reicht für <strong>' + nMeals + ' Mahlzeiten</strong>' +
          (nMeals > maxMeals ? ' · in ' + pk.tage + ' Tagen ' + maxMeals + ' verbraucht, <strong>' + fmt(pk.ml - usedInTage, 0) + ' ml verfallen</strong>'
            : nMeals < maxMeals ? ' · für ' + pk.tage + ' Tage (' + maxMeals + ' Mahlzeiten) reicht eine Packung nicht' : '') + '.</div>';
      }
    }
    const meatSlot = recipeMeatSlot(rec);
    let meatSeg = "";
    if (meatSlot) {
      const cur = detailMeat || meatSlot.baseKey;
      meatSeg = '<div class="adj-block meat-swap"><div class="overline">Fleisch</div><div class="seg-ink">' +
        ["huhn", "rind", "pute"].map(k => { const ok = meatSwapPossible(rec, d, k);
          return '<button type="button" data-meat="' + k + '"' + (k === cur ? ' class="active"' : "") + ' aria-pressed="' + (k === cur) + '"' +
            (ok ? "" : ' disabled title="Bei dieser Verordnung nicht möglich – mit ' + MEATS[k].label + ' lässt sich das Verhältnis nicht einstellen"') + ">" + MEATS[k].label + "</button>"; }).join("") +
        '</div><div class="adj-text">Gilt nur für diese Ansicht. Getauscht wird nach den Mengen der Diätologie (20 g Huhn ≙ 30 g Rind ≙ 18 g Pute); danach werden Verhältnis und Kalorien wie bei jedem Rezept neu eingestellt.</div></div>';
    }

    const sign = (v) => v < -0.05 ? "−" : (v > 0.05 ? "+" : "±");
    let oilSeg = "";
    if (baseOilIndex >= 0) {
      const sOil = d.mctShare, mm = res.mct || null;
      const shareBtn = (v) => '<button type="button" data-mcts="' + v + '"' + (Math.abs(sOil - v / 100) < 0.005 ? ' class="active"' : "") + ">" + v + " %</button>";
      const more = '<details class="more"><summary class="tlink">Mehr dazu</summary><p>Der Anteil bezieht sich auf die <strong>Öl-Fettmasse</strong>. Beim Tausch gegen ein Fett anderer Energiedichte lassen sich Fettmasse, Kalorien und Verhältnis nicht gleichzeitig halten – die Rechenregel (Vorgaben) legt fest, welche Größe exakt bleibt. ' +
        (sOil > 0 ? (d.mctMode === "kalorien"
          ? "<strong>Kalorien halten:</strong> Die Kalorien bleiben für jeden MCT-Anteil gleich; das Verhältnis steigt mit dem Anteil. "
          : "<strong>Verhältnis halten:</strong> Das Verhältnis bleibt für jeden MCT-Anteil exakt gleich; die Kalorien sinken mit dem Anteil (MCT liefert weniger kcal je Gramm). ") : "") +
        "MCT kann durch Capronsäure (C6) den Rachen reizen – klein beginnen, Verträglichkeit beobachten; besser verträglich ist weniger MCT je Mahlzeit, dafür in jeder Mahlzeit. MCT ist je kcal ketogener als langkettiges Fett, ein Tausch senkt die Ketose nicht. Die Vorbelegung 8,3 kcal/g ist ein <strong>Praxiswert</strong> – echte Etikettwerte unter Vorgaben eintragen.</p></details>";
      const note = !(sOil > 0) ? '<div class="adj-text">Gilt für alle Rezepte mit Öl, wie unter Vorgaben. Derzeit nur Rapsöl.</div>'
        : '<div class="adj-text">Gilt für alle Rezepte mit Öl, wie unter Vorgaben.</div>' +
          (mm ? '<div class="meat-note stat-line">MCT <strong>' + fmt(mm.gMct, 1) + ' g</strong> je Portion · <strong>' + fmt(mm.energiePz, 1) + ' %</strong> der Energie (' + mctEinordnung(mm.energiePz) + ') · ' + sign(mm.dev) + fmt(Math.abs(mm.dev), 1) + ' kcal je Portion, je Tag ' + sign(mm.dev) + fmt(Math.abs(mm.dev * d.mahl), 0) + ' kcal</div>' : "");
      // Warnhinweise aus der ungerundeten Rechnung (§5)
      let warn = "";
      if (mm) {
        if (mm.energiePz > 50) warn += '<div class="note warn">▲ Über dem gängigen Arbeitsbereich von 40–50 %. Die traditionelle MCT-Diät verwendet 60 % und kann Magen-Darm-Beschwerden verursachen.</div>';
        const devTag = mm.dev * d.mahl, kcalTag = mm.kcalNeu * d.mahl;
        if (d.mctMode !== "kalorien" && kcalTag < d.kcalMin - 0.5) warn += '<div class="note warn">▲ Mit diesem MCT-Anteil kämen nur ' + fmt(kcalTag, 0) + ' kcal/Tag zusammen – unter dem Minimum von ' + fmt(d.kcalMin, 0) + ' kcal. MCT-Anteil senken, Rechenregel „Kalorien halten“ wählen oder mit der Diätologie klären.</div>';
        else if (d.mctMode !== "kalorien" && devTag < -20) warn += '<div class="note info">Das Tagesziel wird um ' + fmt(-devTag, 0) + ' kcal unterschritten (Minimum ' + fmt(d.kcalMin, 0) + ' kcal/Tag ist eingehalten).</div>';
        if (d.mctMode === "kalorien" && (mm.ratioNeu - mm.ratioBasis) > 0.05) warn += '<div class="note warn">▲ Das Verhältnis steigt von ' + fmt(mm.ratioBasis, 2) + ' auf ' + fmt(mm.ratioNeu, 2) + '. Das ist eine Änderung der Verordnung, nicht der Fettart.</div>';
      }
      oilSeg = '<div class="adj-block meat-swap oil"><div class="overline">MCT-Anteil am Öl</div>' +
        '<div class="seg-ink">' + [0, 10, 20, 30, 50, 100].map(shareBtn).join("") + "</div>" +
        note + warn + (sOil > 0 ? regelZeile(d) : "") + more + "</div>";
    }

    // Zwei Sichten auf dieselben Zutaten: Blatt Mahlzeit (eine Portion) und Blatt Tag (Zubereitungsmenge), beide editierbar.
    // Zeile: Name (+ „stellt das Verhältnis ein“ / Herkunft des Wassers, Nährwerte als Mono-Zeile) · Grammfeld · Einheit.
    const nutrLine = (m) => '<small class="nutr">Eiweiß ' + fmt(m.eiweiss) + ' · Fett ' + fmt(m.fett) + ' · KH ' + fmt(m.kh) + ' · ' + fmt(m.kcal, 0) + ' kcal</small>';
    let kRows = "", nRows = "";
    items.forEach((it, i) => {
      const g = num(it.grams) * mult;
      const m = lineMacros({ food: it.food, grams: num(it.grams) }); // Blatt Mahlzeit: je Portion
      const isWaterRow = /wasser/i.test(it.food);
      const fatRow = isFatCarrier(items, i);
      const gR = fatRow ? roundTo(g, 0.1) : roundTo(g, isWaterRow ? 1 : d.rundung);
      const gTxt = (fatRow ? gR.toFixed(1) : String(gR)).replace(".", ","); // Fettträger immer mit einer Nachkommastelle („21,0“)
      // Wasserzeile: nur die Herkunft steht dabei; Anpassungen und ihr Zurücksetzen stehen in der Statuszeile.
      const waterTag = isWaterRow ? (hasWaterOverride ? '<small class="adj">eigener Wert</small>' : (mv.fluidAdjusted ? '<small class="adj">Flüssigkeitsziel</small>' : (mv.densityAdjusted ? '<small class="adj">höchstens ' + fmt(d.maxDichte, 1) + ' kcal/ml</small>' : ""))) : "";
      const mK = lineMacros({ food: it.food, grams: gR }); // Blatt Tag: für die Zubereitungsmenge
      const unit = '<span class="unit">' + (isWaterRow ? "ml" : "g") + "</span>";
      const label = (mm) => '<div class="ing-name"><span class="name">' + escapeHtml(it.food) + "</span>" + (i === adjIndex ? adjLabel : "") + waterTag + nutrLine(mm) + "</div>";
      kRows += '<div class="ing-row' + (i === adjIndex ? " fatrow" : "") + '">' + label(mK) +
        '<input class="amt-edit" type="text" autocomplete="off" inputmode="decimal" aria-label="' + escapeHtml(it.food) + '" data-g="' + gR + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gTxt + '">' + unit + "</div>";
      const gP = Math.round(num(it.grams) * 10) / 10;
      const gPTxt = (fatRow ? gP.toFixed(1) : String(gP)).replace(".", ",");
      nRows += '<div class="ing-row' + (i === adjIndex ? " fatrow" : "") + '">' + label(m) +
        '<input class="amt-edit g-edit" type="text" autocomplete="off" inputmode="decimal" aria-label="' + escapeHtml(it.food) + '" data-g="' + gP + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gPTxt + '">' + unit + "</div>";
    });
    const sumRow = (label, g, s) => '<div class="ing-row sum"><div class="ing-name"><span class="name">' + label + '</span>' + nutrLine(s) + '</div><span class="sum-g">' + fmt(g, 0) + '</span><span class="unit">g</span></div>';
    // Zubereitung als nummerierte Schritte (Varoma bevorzugt; Dämpfwasser-Rechnung ist darin enthalten).
    const prepText = rec.varoma
      ? adaptOil(adaptVaroma(adaptPrep(rec.varoma, rec, detailMeat)))
      : (rec.zubereitung ? adaptOil(adaptPrep(rec.zubereitung, rec, detailMeat)) : "");
    const steps = splitSteps(prepText);
    const oilStep = oilFeedStep(rec, items); if (oilStep && steps.length) steps.push(oilStep);
    const stepsHtml = steps.length ? "<ol class='steps" + (oilStep ? " oil-last" : "") + "'>" + steps.map(s => "<li>" + escapeHtml(s) + "</li>").join("") + "</ol>" : "";
    // Abfüllen: Öl-Zeilen je Portion (werden in die abgefüllte Portion eingerührt)
    const oilRowsPer = items.filter(it => isOil(it.food));
    // Vier Blätter: am Handy nebeneinander (seitlich wischen), am Desktop als Reiter.
    const TABMAP = { rechnen: "mahlzeit", kochen: "abwiegen", tag: "abwiegen", abfuellen: "zubereitung" }; // alte gespeicherte Werte
    const wanted = TABMAP[state.settings.detailTab] || state.settings.detailTab;
    const dtab = DETAIL_PAGES.some(pg => pg[0] === wanted) ? wanted : "mahlzeit";
    const mobile = isMobileLayout();
    const paneOpen = (k) => '<section class="pane" data-pane="' + k + '"' + (dtab !== k && !mobile ? " hidden" : "") + "><div class=\"pane-in\">";
    const paneClose = "</div></section>";

    // Ganzer Tag: eine Portion × Mahlzeiten pro Tag – unabhängig von der gewählten Portionenzahl.
    const dayN = d.mahl;
    const dayKcal = sumPer.kcal * dayN;
    const dayLow = dayKcal < d.kcalMin - 0.5, dayHigh = d.kcalMaxAuto && dayKcal > d.kcalMaxAuto + 0.5;
    // Flüssigkeit je Portion: Zutaten-Wasser + Rezept-Wasser, gegen den Anteil am Tagesbedarf.
    const waterPer = items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0);
    const fluidPer = mv.fluid, foodFluidPer = fluidPer - waterPer;
    const volPer = volumeMl(items), bigVol = d.maxMahlMl > 0 && volPer > d.maxMahlMl + 0.5;
    const fluidLine = d.fluidDay > 0
      ? '<div class="hint fluid-line">Flüssigkeit ≈ <strong>' + fmt(fluidPer, 0) + ' ml</strong> (Zutaten ' + fmt(foodFluidPer, 0) + ' + Wasser ' + fmt(waterPer, 0) + ')' +
        (d.wasserModus === "mahlzeit"
          ? ' · Ziel ' + fmt(d.fluidMahl, 0) + ' ml je Mahlzeit' + (mv.fluidAdjusted ? ' – Wasser dafür erhöht' : (fluidPer >= d.fluidMahl - 0.5 ? ' – erreicht' : ' – <strong>nicht erreicht</strong> (gemerktes Wasser)'))
          : (mv.densityAdjusted ? ' · Wasser so weit erhöht, dass die Mahlzeit höchstens ' + fmt(d.maxDichte, 1) + ' kcal/ml hat' : ' · Wasser nur zum Pürieren bzw. Anrühren') + ', der Rest kommt als Wassergaben') +
        (bigVol ? ' · <strong class="warn-txt">▲ ' + fmt(volPer, 0) + ' ml auf einmal, über ' + fmt(d.maxMahlMl, 0) + ' ml</strong>' : '') + '</div>'
      : "";
    const dayFluid = fluidPer * dayN, dayFluidZiel = d.fluidDay;
    const fluidDayNote = d.fluidDay > 0
      ? (d.wasserModus === "zwischen"
          ? zwischenText(d, fluidPer)
          : (dayFluid < dayFluidZiel - 3
              ? '<div class="note warn">▲ Der Tag liegt unter dem Flüssigkeitsziel – das gemerkte Wasser im Rezept ist kleiner als der rechnerische Anteil.</div>'
              : '<div class="note tip">Flüssigkeit ist in den Mahlzeiten dabei – Wasser je Rezept entsprechend erhöht, kein Sondieren zwischen den Mahlzeiten nötig.</div>'))
      : "";
    // Kennzahl (2 × 2 bzw. 3 nebeneinander): Wert Mono 600, darunter grau die Bezeichnung, gepunktet unten
    const fact = (cls, v, l, title) => '<div class="dstat' + (cls ? " " + cls : "") + '"' + (title ? ' title="' + title + '"' : "") + '><div class="v">' + v + '</div><div class="l">' + l + '</div></div>';

    // Blatt Tag: Kennzahlen für die Zubereitungsmenge (Standard: ein Tag); Ziele skalieren mit.
    const qTag = days === 1 ? "/Tag" : "";
    const qFluid = fluidPer * mult, qFluidZiel = days ? dayFluidZiel * days : d.fluidMahl * mult, qZiel = d.wasserModus === "mahlzeit";
    const qTiles = '<div class="detail-tiles facts">' +
        fact((days && dayLow) ? "warn" : "", fmt(sum.kcal, 0), "kcal" + qTag + " · Ziel " + fmt(d.kcalMahl * mult, 0)) +
        fact(pStateQ === "ok" ? "" : "warn", fmt(sum.eiweiss) + " g", "Eiweiß" + qTag + " · Ziel " + fmt(proteinTarget, 0) + " g", pStateQ === "high" ? "mehr als das Doppelte des Eiweiß-Ziels" : "") +
        fact("", fmt(ml, 0) + " ml", "Volumen" + qTag, "≈ " + fmt(totalG, 0) + " g") +
        (d.fluidDay > 0 ? fact(qZiel && qFluid < qFluidZiel - 3 * mult ? "warn" : "", fmt(qFluid, 0) + " ml", "Flüssigkeit" + qTag + (qZiel ? " · Ziel " + fmt(qFluidZiel, 0) + " ml" : " in Mahlzeiten"))
          : fact("", "≈ " + fmt(totalG, 0) + " g", "Menge" + qTag)) +
      "</div>";
    // Tages-Check nur als Warnung: Minimum unterschritten oder über dem Korridor.
    const dayCheck = dayLow
      ? '<div class="note warn">▲ Ein Tag nur mit diesem Rezept (' + dayN + ' × ' + fmt(dayKcal / dayN, 0) + ' kcal = ' + fmt(dayKcal, 0) + ' kcal) läge unter dem Minimum von ' + fmt(d.kcalMin, 0) + ' kcal – im Tagesplan mit anderen Mahlzeiten kombinieren.</div>'
      : (dayHigh ? '<div class="note warn">▲ Ein Tag nur mit diesem Rezept (' + dayN + ' × ' + fmt(dayKcal / dayN, 0) + ' kcal = ' + fmt(dayKcal, 0) + ' kcal) läge über dem Korridor (bis ' + fmt(d.kcalMaxAuto, 0) + ' kcal).</div>' : "");
    // Zubereitungsmenge: 1–3 ganze Tage (folgen der Mahlzeitenzahl) oder eine freie Portionenzahl (Stepper).
    const scaleBtn = (v, label) => '<button type="button" data-scale="' + v + '"' + ((v === "1" ? (!days && mult === 1) : detailScale === v) ? ' class="active"' : "") + ">" + label + "</button>";
    const scaleSeg =
      '<div class="seg-portion batch">' +
        '<div class="seg-ink">' + scaleBtn("tag", "1 Tag") + scaleBtn("tag:2", "2 Tage") + scaleBtn("tag:3", "3 Tage") + "</div>" +
        '<span class="portion-step" title="Portionen"><button type="button" class="stepbtn" data-step="-1" aria-label="eine Portion weniger">−</button>' +
        '<input id="portion-input" type="number" min="0.5" step="0.5" aria-label="Portionen" value="' + (Math.round(mult * 10) / 10) + '">' +
        '<button type="button" class="stepbtn" data-step="1" aria-label="eine Portion mehr">+</button></span>' +
      "</div>";
    // Statuszeile: alle temporären Änderungen (Portion, Wasser) samt Zurücksetzen an einer Stelle.
    let waterRef = null;
    if (hasWaterOverride) {
      const keep = state.water[waterKey]; delete state.water[waterKey];
      try { waterRef = computeMealView(rec, d, detailMeat).res.items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0); }
      finally { state.water[waterKey] = keep; }
    }
    const statusLine = (m, bezug) => {
      const parts = [];
      if (mv.hasPortion) parts.push('<strong>Portion angepasst: ' + fmt(mv.portionF * 100, 0) + ' %</strong> (' + fmt(sumPer.kcal * m, 0) + ' statt ' + fmt(mv.kcalBerechnet * m, 0) + ' kcal) <button type="button" class="tlink portion-reset">wie berechnet</button>');
      if (hasWaterOverride) parts.push('<strong>Wasser angepasst</strong> (' + fmt(waterPer * m, 0) + ' statt ' + fmt(waterRef * m, 0) + ' ml) <button type="button" class="tlink water-reset">wie berechnet</button>');
      return parts.length ? parts.join(" · ") : 'Wie berechnet · ' + fmt(d.kcalMahl * m, 0) + ' kcal ' + bezug;
    };
    const changed = mv.hasPortion || hasWaterOverride;
    const mealStatus = statusLine(1, "je Mahlzeit");
    // Anpassen: Fleisch (nur diese Ansicht) und MCT-Anteil (Vorgabe für alle Rezepte) samt Zurücksetzen.
    const mctOpen = detailMctOpen == null ? d.mctShare : detailMctOpen;
    const anpParts = [];
    if (meatSlot && detailMeat && detailMeat !== meatSlot.baseKey) anpParts.push('<strong>Fleisch getauscht: ' + MEATS[detailMeat].label + '</strong> (nur in dieser Ansicht) · <button type="button" class="tlink meat-reset">wie im Rezept</button>');
    if (baseOilIndex >= 0 && Math.abs(d.mctShare - mctOpen) > 0.001) anpParts.push('<strong>MCT-Anteil ' + fmt(d.mctShare * 100, 0) + ' %</strong> statt ' + fmt(mctOpen * 100, 0) + ' % – gilt für alle Rezepte (Vorgaben) · <button type="button" class="tlink mct-reset" data-mct="' + mctOpen + '">zurück auf ' + fmt(mctOpen * 100, 0) + ' %</button>');
    const anpassenStatus = anpParts.length ? anpParts.join(" · ")
      : 'Wie im Rezept' + (meatSlot ? ' · Fleisch gilt nur in dieser Ansicht' : '') + (baseOilIndex >= 0 ? ' · der MCT-Anteil ist die Vorgabe für alle Rezepte' : '');
    const tagStatus = statusLine(mult, days === 1 ? "je Tag" : (days ? "für " + days + " Tage" : "für " + portionsTxt + " Portionen"));
    const nutrOn = !!state.settings.detailNutr;
    const weighHead = (title) => '<div class="weigh-head"><h4 class="ph">' + title + '</h4><label class="nw-toggle"><input type="checkbox" class="nw-cb"' + (nutrOn ? " checked" : "") + '> Nährwerte</label></div>';
    const spritzen = Math.max(1, Math.ceil(volPer / 60 - 0.05));

    const c = document.getElementById("detail-content");
    c.classList.toggle("show-nutr", nutrOn);
    c.innerHTML =
      '<div class="sheet-grip" aria-hidden="true"></div>' +
      '<div class="detail-head"><div class="dh-tags"><span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmtRxA(r, 2) + "</span>" +
        headTags.map(t => '<span class="dh-tag">' + t + "</span>").join("") + "</div>" +
        '<h2 class="title">' + displayHtml(rec) + "</h2></div>" +
      pagerHead(DETAIL_PAGES, dtab, "detail-tabs") +
      '<div class="pages" id="detail-pages">' +

      /* ---------- 1 Mahlzeit (eine Portion) ---------- */
      paneOpen("mahlzeit") +
      '<div class="detail-tiles facts">' +
        fact(mv.hasPortion ? "warn" : "", fmt(sumPer.kcal, 0), "kcal · Ziel " + fmt(d.kcalMahl, 0)) +
        fact(pStateMeal === "ok" ? "" : "warn", fmt(sumPer.eiweiss) + " g", "Eiweiß · Ziel " + fmt(d.eiweissMahl)) +
        fact(bigVol ? "warn" : "", fmt(volPer, 0) + " ml", "Volumen", "≈ " + fmt(totalG / mult, 0) + " g") +
        (d.fluidDay > 0 ? fact("", fmt(fluidPer, 0) + " ml", "Flüssigkeit") : fact("", "≈ " + fmt(totalG / mult, 0) + " g", "Menge")) +
      "</div>" +
      (pStateMeal === "low" ? '<div class="note warn">▲ Eiweiß liegt unter dem Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
      (pStateMeal === "high" ? '<div class="note warn">▲ Eiweiß ' + fmt(sumPer.eiweiss / d.eiweissMahl, 1) + '-mal so hoch wie das Ziel. Viel Eiweiß kann die Ketose schwächen, bitte mit dem Team abklären.</div>' : "") +
      '<div class="portion-line' + (changed ? " changed" : "") + '">' + mealStatus + '</div>' +
      weighHead("Zum Abwiegen · eine Portion") +
      '<div class="ing-list">' + nRows + sumRow("Summe je Portion", totalG / mult, sumPer) + "</div>" +
      '<div class="hint foot-hint">Gramm ändern skaliert alle anderen Zutaten mit. Das Verhältnis bleibt.</div>' +
      fluidLine +
      paneClose +

      /* ---------- 2 Tag (Zubereitungsmenge, Standard ein Tag) ---------- */
      paneOpen("abwiegen") +
      scaleSeg +
      qTiles +
      '<div class="portion-line' + (changed ? " changed" : "") + '">' + tagStatus + '</div>' +
      weighHead("Zum Abwiegen für " + (mult === 1 ? "1 Portion" : (days === 1 ? "1 Tag = " : (days ? days + " Tage = " : "")) + portionsTxt + " Portionen")) +
      '<div class="ing-list kitchen">' + kRows + sumRow("Summe", totalG, sum) + "</div>" +
      dayCheck + fluidDayNote + packInfoSeg +
      paneClose +

      /* ---------- 3 Anpassen ---------- */
      paneOpen("anpassen") +
      ((basisSeg || meatSeg || oilSeg) ? '<div class="portion-line">' + anpassenStatus + '</div>' : "") +
      meatSeg + oilSeg + basisSeg +
      (!(basisSeg || meatSeg || oilSeg) ? '<div class="note info">Für dieses Gericht gibt es nichts umzuschalten.</div>' : "") +
      (rec.custom ? '<div class="adj-block"><div class="overline">Eigenes Rezept</div><button type="button" class="tlink danger" id="del-btn">Rezept löschen</button></div>' : "") +
      paneClose +

      /* ---------- 4 Kochen: Kennzahlen zum Abfüllen, darunter die Schritte ---------- */
      paneOpen("zubereitung") +
      '<div class="detail-tiles facts three fill-tiles">' +
        fact("", '<span class="fill-big">' + fmt(perGnoOil, 0) + ' g</span>', "je Portion" + (hasOil ? " ohne Öl" : "")) +
        fact("", fmt(volPer, 0) + " ml", "Volumen" + (hasOil ? " mit Öl" : "")) +
        fact("", spritzen + " × 60 ml", "Spritzen", "≈ " + fmt(volPer / 60, 1) + " Spritzen à 60 ml") +
      "</div>" +
      '<div class="portion-line">Abfüllen je Portion' + (hasOil ? ' – danach das Öl in die Portion einrühren' : '') +
        (mult !== 1 ? ' · gesamt ≈ ' + fmt((hasOil ? perGnoOil : totalG / mult) * mult, 0) + ' g = <strong>' + portionsTxt + ' × ' + fmt(perGnoOil, 0) + ' g</strong>' +
          (hasOil ? ' · Öl gesamt ' + oilRowsPer.map(it => escapeHtml(String(it.food).replace(/^MCT.*$/, "MCT").replace(/öl$/i, "")) + ' ' + fmt(num(it.grams) * mult, 0) + ' g').join(" + ") : '') : '') + '</div>' +
      // Hinweise: Sieb (Varoma), MCT-Menge, Garzeiten bei mehreren Portionen
      [rec.varoma ? 'Vor dem Abfüllen durch ein feines Sieb streichen (sonst verstopft die Spritze).' : "",
       res.mct ? 'MCT <strong>' + fmt(res.mct.gMct, 1) + ' g</strong> je Portion (' + fmt(res.mct.energiePz, 0) + ' % der Energie) – klein beginnen, Verträglichkeit beobachten.' : "",
       (mult !== 1 && !rec.angeruehrt) ? 'Garzeiten gelten für <strong>eine</strong> Portion – länger garen, bis alles weich ist; im Kühlschrank lagern.' : ""]
        .filter(Boolean).map(t => '<div class="note ' + (res.mct && res.mct.energiePz > 50 && /MCT/.test(t) ? "warn" : "tip") + '">' + t + '</div>').join("") +
      '<h4 class="ph steps-ph">' + (rec.varoma ? "Zubereitung mit Varoma (dämpfen)" : "Zubereitung") + "</h4>" +
      (stepsHtml || '<div class="note info">Keine Zubereitungsschritte hinterlegt.</div>') +
      paneClose +

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
        if (inp.dataset.water === "1") { if (isFinite(nv) && nv >= 0) { state.water[waterKey] = nv; save(); detailChanged(); } return; }
        if (oldG > 0 && nv > 0) {
          const f = Math.round(mv.portionF * (nv / oldG) * 1000) / 1000;
          if (Math.abs(f - 1) < 1e-6) delete state.portion[waterKey]; else state.portion[waterKey] = f;
          save(); detailChanged();
        }
      }));
    c.querySelectorAll(".portion-reset").forEach(b =>
      b.addEventListener("click", () => { delete state.portion[waterKey]; save(); detailChanged(); }));
    c.querySelectorAll(".amt-edit:not(.g-edit)").forEach(inp =>
      inp.addEventListener("change", () => {
        const oldG = parseFloat(inp.dataset.g); const nv = parseFloat(String(inp.value).replace(",", "."));
        if (inp.dataset.water === "1") {
          // Nur das Wasser ändern – Rest bleibt; gemerkt wird der Wert je Portion.
          if (isFinite(nv) && nv >= 0) { state.water[waterKey] = nv / mult; save(); detailChanged(); }
          return;
        }
        if (oldG > 0 && nv > 0) {
          const f = Math.round(mv.portionF * (nv / oldG) * 1000) / 1000;
          if (Math.abs(f - 1) < 1e-6) delete state.portion[waterKey]; else state.portion[waterKey] = f;
          save(); detailChanged();
        }
      }));
    c.querySelectorAll(".meat-reset").forEach(b => b.addEventListener("click", () => { detailMeat = null; renderDetail(); }));
    c.querySelectorAll(".mct-reset").forEach(b => b.addEventListener("click", () => { state.settings.mctShare = num(b.dataset.mct); save(); detailChanged(); }));
    c.querySelectorAll(".water-reset").forEach(b =>
      b.addEventListener("click", () => { delete state.water[waterKey]; save(); detailChanged(); }));
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
        state.settings.mctShare = num(b.dataset.mcts) / 100; save(); detailChanged();
      }));
    // Blätter: am Desktop Reiter (nur das aktive Blatt sichtbar), am Handy nebeneinander mit seitlichem Wischen.
    setupPager(c, DETAIL_PAGES, dtab, (k) => { state.settings.detailTab = k; save(); }, renderDetail);

    // Feste Fußleiste: „Für heute einplanen“ (Primär) · Editor · Drucken · Favorit als runde Knöpfe.
    // Eigene Rezepte löschen: Textlink auf dem Blatt Anpassen.
    const actions = c.querySelector("#detail-actions");
    const vh = (t) => '<span class="vh">' + t + '</span>';
    const todayBtn = el("button", { type: "button", class: "btn primary", id: "today-btn", "aria-haspopup": "true" }, "Für heute einplanen");
    todayBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleTodaySheet(rec); });
    actions.appendChild(todayBtn);
    const editBtn = el("button", { type: "button", class: "btn round-btn", id: "edit-btn", title: rec.custom ? "Bearbeiten" : "Im Editor öffnen" }, ICON.edit + vh(rec.custom ? "Bearbeiten" : "Editor"));
    editBtn.addEventListener("click", () => { const r = applyMeatChoice(rec, detailMeat); (rec.custom ? seedComposeFromSaved(r) : seedComposeFromRecipe(r)); closeDetail(); openCompose(); });
    actions.appendChild(editBtn);
    const printBtn = el("button", { type: "button", class: "btn round-btn", title: "Drucken" }, ICON.print + vh("Drucken"));
    printBtn.addEventListener("click", () => printRecipe(rec, res, d, mult));
    actions.appendChild(printBtn);
    const favBtn = el("button", { type: "button", class: "btn round-btn favbtn" + (isFav(rec) ? " on" : ""), title: "Favorit", "aria-pressed": isFav(rec) ? "true" : "false" }, ICON.star + vh("Favorit"));
    // Nur den Stern umschalten (Blatt, Menge und Fleischwahl bleiben) und die Liste dahinter gleich mitziehen.
    favBtn.addEventListener("click", () => {
      toggleFav(rec);
      favBtn.classList.toggle("on", isFav(rec)); favBtn.setAttribute("aria-pressed", isFav(rec) ? "true" : "false");
      renderRezepte();
    });
    actions.appendChild(favBtn);
    const del = c.querySelector("#del-btn");
    if (del) del.addEventListener("click", () => {
      if (confirm("Eigenes Rezept „" + displayText(rec) + "“ wirklich löschen?")) {
        state.savedRecipes = state.savedRecipes.filter(s => s.key !== rec.key);
        const fi = state.favorites.indexOf(rec.key); if (fi !== -1) state.favorites.splice(fi, 1);
        // Gemerkte Mengen, Plätze im Tagesplan und den Bezug im Editor mit aufräumen
        const fk = familyKey(rec);
        [state.portion, state.water, state.scales].forEach(m => { if (m) { delete m[fk]; delete m[rec.key]; } });
        state.dayPlan.forEach(sl => { if (sl && sl.key === rec.key) sl.key = null; });
        if (state.compose && state.compose.editKey === rec.key) state.compose.editKey = null;
        save(); closeDetail(); renderRezepte();
      }
    });
    // Nährwerte je Zutat ein-/ausblenden (gemerkt, gilt für beide Blätter)
    c.querySelectorAll(".nw-cb").forEach(cb => cb.addEventListener("change", () => {
      state.settings.detailNutr = cb.checked; save();
      c.classList.toggle("show-nutr", cb.checked);
      c.querySelectorAll(".nw-cb").forEach(o => { o.checked = cb.checked; });
    }));
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
      html += opt(String(i), fmtHM(times.meals[i]) + " · Mahlzeit " + (i + 1) + (same ? " ✓" : ""), cur ? escapeHtml(displayText(cur)) : "frei", same ? "same" : "");
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
      showToast(escapeHtml(displayText(rec)) + " " + what + " übernommen", [
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
    if (panelMode()) return; // Panel am Desktop bleibt stehen (es gibt dort kein Schließen)
    document.getElementById("detail-overlay").hidden = true; detailPicked = false;
    if (detailModal) { modalClose("detail"); detailModal = false; }
  }
  // Nach unten wischen schließt das Overlay – überall auf der Karte und auf jedem Blatt. Der Wisch zählt nur,
  // wenn der Inhalt unter dem Finger ganz oben steht (sonst scrollt er wie gewohnt nach oben) und die Bewegung
  // eher senkrecht als waagrecht ist (waagrecht blättert die Seiten). Im gerade bearbeiteten Eingabefeld und
  // in der „Für heute“-Auswahl wird nicht gezogen. Das Sheet folgt dem Finger (das Overlay wird dabei heller);
  // ab 140 px oder bei schnellem Wisch (> 0,6 px/ms und > 40 px) schließt es mit 220 ms, sonst federt es zurück.
  // Nach einem Zug löst das Loslassen keinen Klick aus.
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
      overlay.style.backgroundColor = "rgba(42,38,33," + (0.4 * Math.max(0.15, 1 - Math.max(0, dy) / 400)).toFixed(3) + ")";
    }, { passive: false });
    const end = (e) => {
      if (!st) return;
      const was = st; st = null;
      if (was.mode !== "pull") return;
      const p = pt(e), dy = p.clientY - was.y0, dt = Math.max(1, Date.now() - was.t0), fast = dy / dt > 0.6 && dy > 40;
      card.style.transition = "transform .22s ease-out";
      overlay.style.transition = "background-color .22s ease-out";
      // Nach dem Zug den folgenden Klick schlucken (sonst öffnet z. B. ein Tipp auf eine Zeile etwas)
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      overlay.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => overlay.removeEventListener("click", swallow, { capture: true }), 350);
      if (dy > 140 || fast) { card.style.transform = "translateY(100%)"; setTimeout(() => { card.style.transform = ""; card.style.transition = ""; overlay.style.backgroundColor = ""; overlay.style.transition = ""; onClose(); }, 220); }
      else { card.style.transform = ""; overlay.style.backgroundColor = ""; setTimeout(() => { card.style.transition = ""; overlay.style.transition = ""; }, 240); }
    };
    overlay.addEventListener("touchend", end, { passive: true });
    overlay.addEventListener("touchcancel", end, { passive: true });
  }
  function bindDetail() {
    const overlay = document.getElementById("detail-overlay");
    document.getElementById("detail-close").addEventListener("click", closeDetail);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeDetail(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !overlay.hidden && topLayer() === "detail-overlay") closeDetail(); });
    bindSwipeDown(overlay, closeDetail);
    // Auswahl „Für heute“ schließt bei Klick daneben oder Escape
    overlay.addEventListener("click", () => closeTodaySheet());
    document.addEventListener("keydown", e => { if (e.key === "Escape" && topLayer() === "today-sheet") closeTodaySheet(); });
  }

  /* ---------- Heute: Tagesplan ---------- */
  // Weniger Mahlzeiten: die hinteren Plätze werden für diese Sitzung gemerkt und kommen zurück, wenn die Zahl wieder
  // steigt (z. B. nach „Abbrechen“ oder „Rückgängig“ in der Verordnung).
  let dayPlanCut = {}; // Platz-Nummer → Rezept-Schlüssel der weggefallenen Plätze
  function ensureDayPlan(d) {
    if (!Array.isArray(state.dayPlan)) state.dayPlan = [];
    let restored = false;
    while (state.dayPlan.length < d.mahl) {
      const i = state.dayPlan.length;
      if (dayPlanCut[i]) restored = true;
      state.dayPlan.push({ key: dayPlanCut[i] || null }); delete dayPlanCut[i];
    }
    if (restored) save(); // sonst ginge der zurückgeholte Plan beim Neuladen wieder verloren
    if (state.dayPlan.length > d.mahl) {
      state.dayPlan.slice(d.mahl).forEach((sl, j) => { if (sl && sl.key) dayPlanCut[d.mahl + j] = sl.key; });
      state.dayPlan.length = d.mahl;
    }
  }
  function recipeByKey(key) {
    if (!key) return null;
    const all = allRecipes();
    for (let i = 0; i < all.length; i++) if (recipeKey(all[i]) === key) return all[i];
    return null;
  }
  // Heute (Küchenzettel): eine Zeitleiste für den ganzen Tag. Jede Mahlzeit mit Uhrzeit, Rezeptname, Menge und
  // Dauer, darunter die Zutaten einer Portion als kleine Grammtabelle; ganze Zeile tippbar → Rezept, „tauschen“ →
  // Auswahl (dort auch „Leeren“). Offene Mahlzeiten kursiv mit „wählen“. Dazwischen Wassergaben (blau, gepunktet)
  // und das Schlafen. Darüber Tagessumme (eine Mono-Zeile) und Werkzeugzeile mit Textlinks, darunter die Hinweise.
  function renderHeute() {
    const box = document.getElementById("heute-content"); if (!box) return;
    const d = derived(); ensureDayPlan(d);
    renderHeader(d); // Kopf-Pille (Wassergaben) passt sich sofort an, z. B. nach Leeren oder neuem Rezept
    const times = zeitTimes(d), dm = dayMeals(d), wp = waterPlan(d, dm.sum, times);
    const tot = { kcal: 0, eiweiss: 0, fett: 0, kh: 0, mct: 0, raps: 0, fluid: 0, filled: 0 };
    const facts = [];
    const rows = [];
    const link = (txt, attrs, cls) => '<button type="button" class="tlink' + (cls ? " " + cls : "") + '" ' + attrs + '>' + txt + '</button>';
    state.dayPlan.forEach((slot, i) => {
      const t = times.meals[i], m = dm.meals[i], time = '<span class="zp-time">' + fmtHM(t) + '</span>';
      const rec = m.rec;
      if (m.bad) {
        facts.push(null);
        rows.push({ t, html: '<div class="zp-row meal slot empty-slot bad-slot" role="button" tabindex="0" data-pick="' + i + '" title="Dieses Rezept erreicht die Verordnung nicht – anderes Rezept wählen">' + time +
          '<span class="zp-txt"><span class="zp-name">' + displayHtml(m.bad) + '</span><span class="zp-warn">passt nicht zu ' + escapeHtml(fmtRx(d.ratio)) + ' – anderes Rezept wählen</span></span>' +
          '<span class="tlink">wählen</span></div>' });
        return;
      }
      if (!rec) {
        facts.push(null);
        rows.push({ t, html: '<div class="zp-row meal slot empty-slot" role="button" tabindex="0" data-pick="' + i + '" title="Rezept wählen (Menge geschätzt: ≈ ' + fmt(m.vol, 0) + ' ml)">' + time +
          '<span class="zp-txt"><span class="zp-name">Mahlzeit ' + (i + 1) + ' · offen</span></span><span class="tlink">wählen</span></div>' });
        return;
      }
      const f = m.f; facts.push(f);
      tot.kcal += f.sum.kcal; tot.eiweiss += f.sum.eiweiss; tot.fett += f.sum.fett; tot.kh += f.sum.kh;
      tot.mct += f.gMct; tot.raps += f.gRaps; tot.fluid += f.fluid || 0; tot.filled++;
      const ps = proteinState(f.sum.eiweiss, d.eiweissMahl);
      const warns = [];
      if (ps === "high") warns.push("Eiweiß " + fmt(f.sum.eiweiss / d.eiweissMahl, 1) + " × Ziel");
      if (ps === "low") warns.push("Eiweiß nur " + fmt(f.sum.eiweiss) + " g");
      if (ratioClass(f.ratio, d.ratio) !== "ok") warns.push("Verhältnis " + fmtRxA(f.ratio, 2));
      const big = d.maxMahlMl > 0 && m.vol > d.maxMahlMl + 0.5; // über 25 ml/kg auf einmal → gelb markieren
      const oilTxt = f.hasOil ? f.oils.map(o => escapeHtml(String(o.food).replace(/\s*C8\+C10/, "")) + " " + fmt(num(o.grams), 1) + " g").join(" + ") : "";
      rows.push({ t, html: '<div class="zp-row meal slot" role="button" tabindex="0" data-open="' + i + '" title="' + fmt(f.sum.kcal, 0) + ' kcal · Eiweiß ' + fmt(f.sum.eiweiss) + ' g' + (oilTxt ? ' · Öl: ' + oilTxt : '') + '">' + time +
        '<div class="zp-main"><div class="zp-head"><span class="zp-txt"><span class="zp-name">' + displayHtml(rec) + '</span>' +
          '<span class="zp-vol' + (big ? ' big' : '') + '" title="' + (big ? 'mehr als ' + fmt(d.maxMahlMl, 0) + ' ml auf einmal (25 ml/kg) – mehr Mahlzeiten oder mit dem Team abklären · ' : '') + 'langsam sondieren, etwa ' + SONDIER_ML_MIN + ' ml pro Minute">' +
            (big ? '▲ ' : '') + fmt(m.vol, 0) + ' ml · <span class="ca">ca. </span>' + sondierMin(m.vol) + ' min<span class="zp-more"> · ' + fmt(f.sum.kcal, 0) + ' kcal · Eiweiß ' + fmt(f.sum.eiweiss) + ' g</span></span>' +
          warns.map(w => '<span class="zp-warn">▲ ' + w + '</span>').join("") + '</span>' +
          link("tauschen", 'data-pick="' + i + '" title="Rezept tauschen oder Mahlzeit leeren"', "slot-act") + '</div>' +
        '<div class="zp-ing">' + ingRows(f) + '</div></div></div>' });
    });
    zeitplanExtraRows(times, wp).forEach(r => rows.push(r));
    rows.sort((a, b) => a.t - b.t);
    const ratioDay = (tot.eiweiss + tot.kh) > 0 ? tot.fett / (tot.eiweiss + tot.kh) : null;
    const share = tot.filled / d.mahl; // Anteil geplanter Mahlzeiten → Warnungen an den anteiligen Zielen messen
    const eiweissZiel = d.eiweiss * share, kcalMinZiel = d.kcalMin * share, fluidZiel = d.fluidDay * share;
    const kcalLow = tot.filled > 0 && tot.kcal < kcalMinZiel - 0.5;
    // Werkzeugzeile: Rahmen des Tages links, rechts Textlinks Uhrzeiten · Drucken · Leeren (rot). Der Abstand („· alle 2:38 h“)
    // steht in .dt-int und entfällt als Ganzes, wenn die Zeile zu knapp ist (nie mitten im Wort gekürzt).
    const tools = '<div class="day-tools"><span class="dt-range"><span class="dt-span">' + fmtHM(times.meals[0]) + '–' + fmtHM(times.meals[times.meals.length - 1]) + '</span>' +
        (times.interval != null ? '<span class="dt-int">· alle ' + fmtAbstand(times.interval) + '</span>' : '') + '</span>' +
      link("Uhrzeiten", 'id="zp-toggle" aria-expanded="' + (zpEdit ? "true" : "false") + '" title="Uhrzeiten einstellen"', zpEdit ? "open" : "") +
      link("Drucken", 'id="print-day" title="Tagesplan drucken"') +
      link("Leeren", 'id="clear-day" title="Tagesplan leeren"', "danger") + '</div>';
    // Tagessumme in einer Mono-Zeile: Wert fett, Ziel grau (Ziel = ganzer Tag); Warnzustand → Wert rot.
    // Flüssigkeit = ganzer Tag laut Zeitplan (Mahlzeiten + Wassergaben); „ca.“, wenn offene Mahlzeiten geschätzt sind.
    const est = dm.known < d.mahl;
    const pst = tot.filled ? proteinState(tot.eiweiss, eiweissZiel) : "ok";
    const stat = (cls, v, goal, title) => '<span class="dstat' + (cls ? " " + cls : "") + '"' + (title ? ' title="' + title + '"' : '') + '><b class="v">' + v + '</b> ' + goal + '</span>';
    const kcalTitle = "Ziel " + fmt(d.kcalMahl * Math.max(1, tot.filled), 0) + " kcal für " + tot.filled + " geplante Mahlzeit" + (tot.filled === 1 ? "" : "en") + " · mindestens " + fmt(kcalMinZiel, 0);
    const protTitle = pst === "high" ? "mehr als das Doppelte des Eiweiß-Ziels" : pst === "low" ? "unter dem Eiweiß-Ziel" : "Eiweiß";
    const fluidLow = wp.total < d.fluidDay - 15;
    const fluidTitle = "Mahlzeiten " + fmt(dm.sum, 0) + " ml" + (wp.per > 0 ? " + Wasser " + wp.n + " × " + fmt(wp.per, 0) + " ml" : "") + (est ? " · offene Mahlzeiten geschätzt" : "");
    const ratioBad = tot.filled && ratioClass(ratioDay, d.ratio) !== "ok";
    const sums = '<div class="day-sum" id="day-sums">' +
      stat(kcalLow ? "warn" : "", fmt(tot.kcal, 0), "/ " + fmt(d.kcal, 0) + " kcal", kcalTitle) +
      stat(pst === "ok" ? "" : "warn", fmt(tot.eiweiss) + " g", "/ " + fmt(d.eiweiss, 0) + " g", protTitle) +
      (d.fluidDay > 0 ? stat(fluidLow ? "warn" : "", (est ? "ca. " : "") + fmt(wp.total, 0), "/ " + fmt(d.fluidDay, 0) + " ml", fluidTitle) : "") +
      (ratioBad ? stat("warn", fmtRxA(ratioDay, 2), "", "Verhältnis des Tages · Ziel " + fmtRx(d.ratio)) : "") +
      "</div>";
    const hints = [];
    if (d.fluidDay > 0 && d.wasserModus === "mahlzeit" && tot.filled && tot.fluid < fluidZiel - 3) hints.push(hintLine("warn", "Unter dem Flüssigkeitsziel – bei einem Rezept ist weniger Wasser gemerkt als sein Anteil."));
    if (kcalLow) hints.push(hintLine("warn", "Der Tag liegt unter dem Kalorien-Minimum (" + fmt(d.kcalMin, 0) + " kcal) – eine Mahlzeit mit mehr Kalorien einplanen."));
    // Packungsstand (z. B. Compleat 500 ml, 3 Tage) als graue Zeile.
    const packs = {};
    facts.forEach(f => {
      if (!f || !f.rec.packung) return;
      const pk = f.rec.packung, g = f.res.items.filter(it => it.food === pk.food).reduce((a, it) => a + num(it.grams), 0);
      if (!packs[pk.food]) packs[pk.food] = { pk, ml: 0, meals: 0 };
      packs[pk.food].ml += g; packs[pk.food].meals++;
    });
    Object.keys(packs).forEach(k => {
      const x = packs[k], rest = x.pk.ml - x.ml, per = x.meals ? x.ml / x.meals : 0;
      const restMeals = per > 0 ? Math.floor(Math.max(0, rest) / per + 1e-9) : 0;
      const nTage = x.ml * x.pk.tage;
      // Kurz: heute verplant und Rest für morgen; Einzelheiten zur Packung stehen im Rezept (Blatt „Tag“).
      const shortName = k.replace(/\s*\(.*?\)/g, "").replace(/\s+Nature Mix/, "");
      const second = rest >= -0.5 && nTage > x.pk.ml + 0.5;
      const more = (second ? 'In ' + x.pk.tage + ' Tagen ist eine 2. Packung nötig. ' : "") +
        (rest >= -0.5 && nTage < x.pk.ml - 0.5 ? 'Nach ' + x.pk.tage + ' Tagen bleiben ' + fmt(x.pk.ml - nTage, 0) + ' ml übrig. ' : "");
      hints.push('<div class="hint ' + (rest < -0.5 || second ? "warn" : "info") + ' pack" title="Packung ' + x.pk.ml + ' ml, offen ' + x.pk.tage + ' Tage. Rest reicht für ' + restMeals + ' Mahlzeit' + (restMeals === 1 ? "" : "en") + '. ' + more + '">' +
        (rest < -0.5 || second ? "▲ " : "") + escapeHtml(shortName) + ' heute ' + fmt(x.ml, 0) + ' ml · ' + (rest < -0.5 ? 'fehlen ' + fmt(-rest, 0) + ' ml' : 'Rest ' + fmt(rest, 0) + ' ml') + (second ? ' · 2. Packung' : '') + '</div>');
    });
    const notes = zeitplanNotes(d, times, dm, wp) + hints.join("");
    const slots = '<div class="zp-list day-slots">' + rows.map(r => r.html).join("") + '</div>';
    if (isDesktop()) {
      // Desktop: links Kopf (Überlinie „Heute“, Titel, Zeitraum, Textlinks), Uhrzeiten und Zeitleiste; rechts mitlaufend die
      // Tagesbilanz – Werte in Mono mit dünnem Balken, darunter Verhältnis und Hinweise. Bei wenig Platz rutscht sie darunter.
      const bar = (label, v, goal, part, warn, title) => '<div class="bil-row' + (warn ? " warn" : "") + '" title="' + title + '">' +
        '<div class="bil-line"><span class="bil-l">' + label + '</span><b class="v">' + v + '</b><span class="bil-goal">' + goal + '</span></div>' +
        '<div class="bil-bar"><i style="width:' + Math.round(Math.max(0, Math.min(1, part)) * 100) + '%"></i></div></div>';
      const bars = '<div class="day-sum" id="day-sums">' +
        bar("Kalorien", fmt(tot.kcal, 0), "/ " + fmt(d.kcal, 0) + " kcal", d.kcal > 0 ? tot.kcal / d.kcal : 0, kcalLow, kcalTitle) +
        bar("Eiweiß", fmt(tot.eiweiss) + " g", "/ " + fmt(d.eiweiss, 0) + " g", d.eiweiss > 0 ? tot.eiweiss / d.eiweiss : 0, pst !== "ok", protTitle) +
        (d.fluidDay > 0 ? bar("Flüssigkeit", (est ? "ca. " : "") + fmt(wp.total, 0) + " ml", "/ " + fmt(d.fluidDay, 0) + " ml", wp.total / d.fluidDay, fluidLow, fluidTitle) : "") + '</div>';
      box.innerHTML = '<div class="zeitplan dk">' +
        '<section class="dk-day"><header class="dk-head"><div class="dk-title"><span class="overline">Heute</span><h1>Tagesplan</h1></div>' + tools + '</header>' +
          zeitplanSettings(times) + slots + '</section>' +
        '<aside class="dk-bilanz"><div class="bil-box"><div class="bil-head"><span class="bil-title">Tagesbilanz</span><span class="bil-planned">' +
          tot.filled + ' von ' + d.mahl + ' Mahlzeiten geplant</span></div>' + bars +
          '<div class="bil-line bil-ratio' + (ratioBad ? " warn" : "") + '"><span class="bil-l">Verhältnis</span><b class="v">' + (tot.filled ? fmtRxA(ratioDay, 2) : "—") + '</b>' +
          '<span class="bil-goal">Ziel ' + fmtRx(d.ratio) + '</span></div></div>' +
          (notes ? '<div class="zp-hints">' + notes + '</div>' : "") + '</aside></div>';
    } else box.innerHTML = '<div class="zeitplan">' + sums + tools + zeitplanSettings(times) + slots +
      (notes ? '<div class="zp-hints">' + notes + '</div>' : "") + '</div>';
    bindZeitplan(box);
    box.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); openPicker(num(b.dataset.pick)); }));
    box.querySelectorAll("[data-open]").forEach(b => {
      const open = () => { const r = recipeByKey(state.dayPlan[num(b.dataset.open)].key); if (r) openRecipeDetail(r); };
      b.addEventListener("click", open);
      b.addEventListener("keydown", e => { if (e.target !== b) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    box.querySelectorAll(".empty-slot[data-pick]").forEach(b => b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(num(b.dataset.pick)); } }));
    const pd = box.querySelector("#print-day"); if (pd) pd.addEventListener("click", () => printDayPlan(d, facts));
    const cd = box.querySelector("#clear-day");
    if (cd) cd.addEventListener("click", () => {
      if (!state.dayPlan.some(sl => sl && sl.key)) return;
      const prev = state.dayPlan.map(sl => ({ key: sl ? sl.key : null }));
      state.dayPlan = state.dayPlan.map(() => ({ key: null })); save(); renderRezepte();
      showToast("Tagesplan geleert", [["Rückgängig", () => { state.dayPlan = prev; save(); renderRezepte(); }]]);
    });
    fitHeute();
  }
  // Eine Mahlzeit leeren – mit „Rückgängig“ (aus der Auswahl heraus, „Leeren“).
  function clearSlot(i) {
    const prev = state.dayPlan[i] ? state.dayPlan[i].key : null;
    state.dayPlan[i] = { key: null }; save(); renderHeute();
    showToast("Mahlzeit " + (i + 1) + " geleert", [["Rückgängig", () => { state.dayPlan[i] = { key: prev }; save(); renderHeute(); }]]);
  }
  // Hinweiszeile unter der Zeitleiste: „▲ …“, Warnung rot, Info grau.
  function hintLine(kind, html, title) { return '<div class="hint ' + kind + '"' + (title ? ' title="' + escapeHtml(title) + '"' : '') + '>▲ ' + html + '</div>'; }
  // Zutaten einer Portion für die Zeitleiste: kurze Namen (ohne Klammerzusatz, Marke, „ohne Haut“ …; roh/gekocht
  // bleibt, das ändert das Gewicht), Gramm ohne „,0“, Wasser in ml, das Öl als normale Zutat am Ende.
  function shortFood(n) {
    return String(n).replace(/\s*\(.*?\)/g, "").replace(/,/g, "")
      .replace(/\s+(Paediatric Nature Mix|Zubereitung|ohne Haut|ganz versprudelt|TK oder Frisch|NÖM)\b/g, "").replace(/\bBio-/g, "")
      .replace(/^HiPP\s+/, "").replace(/\s+/g, " ").trim();
  }
  const gramsShort = (g) => fmt(g, 1).replace(/,0$/, "") + "&nbsp;g";
  function ingItems(f) {
    const items = f.res.items.filter(it => num(it.grams) > 0);
    return items.filter(it => !isOilName(it.food)).concat(items.filter(it => isOilName(it.food)));
  }
  function ingRows(f) {
    return ingItems(f).map(it => {
      const water = it.food === "Wasser";
      return '<span class="it"><span class="n">' + escapeHtml(shortFood(it.food).replace(/\s*C8\+C10/, "")) + '</span><span class="g">' + (water ? fmt(num(it.grams), 0) + "&nbsp;ml" : gramsShort(num(it.grams))) + "</span></span>";
    }).join(" ");
  }

  // Am Handy soll der ganze Tag ohne Scrollen bis zur Navigation passen. Stufen vom großzügigsten zum knappsten:
  // „roomy“ = Zutaten als Tabelle (eine je Zeile, wie im Entwurf) · Grundstufe = Zutaten in zwei Spalten ·
  // „tight“ = Zutaten fortlaufend in einer Zeile, alles etwas enger. Die erste Stufe, die passt, gilt; passt nicht
  // einmal „tight“ (sehr kleiner Bildschirm), darf gescrollt werden. Am Desktop immer „roomy more“.
  function fitHeute() {
    const box = document.getElementById("heute-content"), list = box && box.querySelector(".zp-list");
    const zp = box && box.querySelector(".zeitplan"), tab = document.querySelector(".tabbar");
    if (!list || !zp || !tab) return;
    const LV = ["roomy", "more", "tight"];
    zp.classList.remove("tight"); document.body.classList.remove("heute-tight");
    list.classList.remove.apply(list.classList, LV);
    if (!box.offsetParent) return;
    if (window.innerWidth > 820 || getComputedStyle(tab).position !== "fixed") { list.classList.add("roomy", "more"); return; }
    const spare = () => tab.getBoundingClientRect().top - (zp.getBoundingClientRect().bottom + (window.scrollY || 0)) - 8;
    const steps = [["roomy"], [], ["tight"]];
    for (const st of steps) {
      if (st.length) list.classList.add.apply(list.classList, st);
      zp.classList.toggle("tight", st[0] === "tight");
      document.body.classList.toggle("heute-tight", st[0] === "tight");
      if (spare() >= 0) break;
      if (st[0] === "tight") break;
      if (st.length) list.classList.remove.apply(list.classList, st);
    }
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
    // Kopf: „Rezept für 12:15“, rechts „Leeren“ (nur wenn die Mahlzeit belegt ist)
    const d = derived(), times = zeitTimes(d), ti = document.getElementById("picker-title"), cl = document.getElementById("picker-clear");
    if (ti) ti.textContent = times.meals[i] != null ? "Rezept für " + fmtHM(times.meals[i]) : "Rezept wählen";
    if (cl) cl.hidden = !(state.dayPlan[i] && state.dayPlan[i].key);
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
      .filter(x => !q || (x.rec.name + " " + x.fam.name).toLowerCase().indexOf(q) !== -1 || hitItems(x.rec))
      .map(x => Object.assign(x, { res: computeAdjustedRecipe(x.rec, d.kcalMahl, d.ratio) })).filter(x => x.res.ok)
      .map(x => Object.assign(x, { res: computeMealView(x.rec, d, null).res }))
      .sort((a, b) => { const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1; if (fa !== fb) return fa - fb; return a.fam.name.localeCompare(b.fam.name, "de") || ((a.rec.ketocal ? 1 : 0) - (b.rec.ketocal ? 1 : 0)); });
    // Zeile: Name (★ bei Favorit), darunter Mono „Gruppe · Basis · kcal · ml · Eiweiß“ (Eiweiß rot, wenn außerhalb).
    list.innerHTML = recs.map(x => {
      const s = sumMacros(x.res.items), vol = volumeMl(x.res.items);
      const big = d.maxMahlMl > 0 && vol > d.maxMahlMl + 0.5, ps = proteinState(s.eiweiss, d.eiweissMahl);
      return '<button type="button" class="pick-row" data-key="' + escapeHtml(recipeKey(x.rec)) + '">' +
        '<span class="pick-name">' + displayHtml(x.rec) + (isFav(x.rec) ? " ★" : "") + '</span>' +
        '<span class="pick-meta">' + escapeHtml(groupLabel(x.rec)) + " · " + fmt(s.kcal, 0) + ' kcal · <span class="pick-vol' + (big ? ' big' : '') + '">' + (big ? '▲ ' : '≈ ') + fmt(vol, 0) + ' ml</span>' +
          ' · <b class="pick-prot' + (ps === "ok" ? "" : " warn") + '">Eiweiß ' + fmt(s.eiweiss) + " g" + (ps === "high" ? " · hoch" : ps === "low" ? " · niedrig" : "") + "</b></span></button>";
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
    const pc = document.getElementById("picker-clear");
    if (pc) pc.addEventListener("click", () => { const i = pickerSlot; closePicker(); if (i >= 0) clearSlot(i); });
    ov.addEventListener("click", e => { if (e.target === ov) closePicker(); });
    document.getElementById("picker-search").addEventListener("input", renderPicker);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden && topLayer() === "picker-overlay") closePicker(); });
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
      const w = m.rec ? "<span class='n'>" + escapeHtml(displayText(m.rec)) + "</span> <i class='d'>" + sondierMin(m.vol) + " min</i>"
        : "<span class='n'>" + (m.bad ? escapeHtml(displayText(m.bad)) : "Rezept offen") + "</span> <i class='d'>" + (m.bad ? "passt nicht – anderes Rezept wählen" : "noch kein Rezept gewählt") + "</i>";
      rows.push({ t, h: "<div class='r me'><span class='t'>" + fmtHM(t) + "</span><span class='w'>" + w + "</span><span class='m'>" + (m.est ? "ca. " : "") + fmt(m.vol, 0) + " ml</span></div>" });
      if (!f) return;
      // gleiches Rezept mit gleichen Mengen nur einmal, mit allen Uhrzeiten
      const items = f.res.items.filter(it => num(it.grams) > 0).sort((a, b) => isOilName(a.food) - isOilName(b.food));
      const sig = f.rec.name + "|" + items.map(it => it.food + ":" + fmt(num(it.grams), 1)).join(",");
      const g = groups.find(x => x.sig === sig);
      if (g) g.times.push(t); else groups.push({ sig, name: displayText(f.rec), items, times: [t] });
    });
    if (wp.per > 0) times.gifts.forEach(g => rows.push({ t: g.t, h: "<div class='r wa'><span class='t'>" + fmtHM(g.t) + "</span><span class='w'><span class='n'>Wasser</span> <i class='d'>" + (g.kind === "abend" ? "vor dem Schlafen · " : "") + wasserMin(wp.per) + " min</i></span><span class='m'>" + fmt(wp.per, 0) + " ml</span></div>" }));
    if (times.schlaf != null) rows.push({ t: times.schlaf, h: "<div class='r sl'><span class='t'>" + fmtHM(times.schlaf) + "</span><span class='w'><span class='n'>Schlafen</span></span><span class='m'></span></div>" });
    rows.sort((a, b) => a.t - b.t);
    const rez = groups.map(g => "<div class='rb'><div class='rn'><b>" + escapeHtml(g.name) + "</b> <i>" + g.times.map(fmtHM).join(" · ") + "</i></div><div class='z'>" +
      g.items.map(it => '<span class="i"><span>' + escapeHtml(shortFood(it.food).replace(/\s*C8\+C10/, "")) + "</span><b>" + (it.food === "Wasser" ? fmt(num(it.grams), 0) + " ml" : gramsShort(num(it.grams))) + "</b></span>").join("") + "</div></div>").join("");
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
  // Kurzform für knappe Zeilen: „2:38 h“, volle Stunden „3 h“, unter einer Stunde „45 min“
  function fmtAbstand(min) { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? h + (m ? ":" + String(m).padStart(2, "0") : "") + " h" : m + " min"; }
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
  // Uhrzeiten-Felder sind eingeklappt („Uhrzeiten“ in der Werkzeugzeile klappt sie auf); bei ungültigen Zeiten immer offen.
  let zpEdit = false;
  // Hinweise zum Zeitplan (Abstand, Schlafen, Wassermenge) – je eine Zeile „▲ …“ unter der Zeitleiste.
  function zeitplanNotes(d, times, dm, wp) {
    const notes = [];
    const lastMeal = times.meals[times.meals.length - 1];
    if (times.schlafBad) notes.push(hintLine("warn", "Schlafen liegt vor der letzten Mahlzeit – bitte die Uhrzeiten prüfen."));
    if (times.bad) notes.push(hintLine("warn", "Die letzte Mahlzeit muss nach der ersten liegen – bitte die Uhrzeiten prüfen."));
    if (times.interval != null && times.interval < 180) notes.push(hintLine("warn", "Nur " + fmtDauer(times.interval) + " Abstand – Keto-Kost braucht oft 3–4 h.", "Steht beim Öffnen noch Nahrung an, 30–60 Minuten warten."));
    if (times.schlaf != null && times.schlaf - lastMeal < 120) notes.push(hintLine("warn", "Letzte Mahlzeit nur " + fmtDauer(times.schlaf - lastMeal) + " vor dem Schlafen – 2 h einplanen.", "Sonst droht Rückfluss im Liegen."));
    if (wp.over) notes.push(hintLine("warn", fmt(wp.per, 0) + " ml je Wassergabe – über " + fmt(d.maxMahlMl, 0) + " ml auf einmal. Schlafenszeit eintragen oder Wasser auf mehr Gaben verteilen."));
    if (d.fluidDay > 0 && wp.rest < -10) notes.push(hintLine("info", "Die Mahlzeiten liefern schon " + fmt(-wp.rest, 0) + " ml mehr als das Tagesziel – keine Wassergaben nötig."));
    return notes.join("");
  }
  function zeitplanSettings(times) {
    const field = (id, label, val) => '<label class="zp-f"><span>' + label + '</span><input id="' + id + '" type="time" value="' + escapeHtml(String(val)) + '"></label>';
    return '<div class="zp-set"' + (zpEdit || times.bad ? "" : " hidden") + '>' +
      field("zp-erste", "Erste", times.z.erste) + field("zp-letzte", "Letzte", times.z.letzte) + field("zp-schlaf", "Schlafen", times.z.schlaf) + '</div>';
  }
  // Wasser- und Schlafzeilen der Zeitleiste (die Mahlzeiten-Zeilen baut renderHeute): Uhrzeit · Menge · Dauer.
  function zeitplanExtraRows(times, wp) {
    const rows = [];
    if (wp.per > 0) times.gifts.forEach(g => rows.push({ t: g.t, html: '<div class="zp-row water"><span class="zp-time">' + fmtHM(g.t) + '</span>' +
      '<span class="zp-txt">' + fmt(wp.per, 0) + ' ml Wasser' + (g.kind === "abend" ? '<span class="zp-sub"> vor dem Schlafen</span>' +
        (times.schlaf != null ? '<span class="zp-sleep" title="Schlafen ' + fmtHM(times.schlaf) + '"> · Schlafen ' + fmtHM(times.schlaf) + '</span>' : '') : '') + '</span>' +
      '<span class="zp-wmin" title="etwa ' + WASSER_ML_MIN + ' ml pro Minute">' + wasserMin(wp.per) + ' min</span></div>' }));
    if (times.schlaf != null) rows.push({ t: times.schlaf, html: '<div class="zp-row sleep"><span class="zp-time">' + fmtHM(times.schlaf) + '</span><span class="zp-txt">Schlafen</span></div>' });
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
    // hint: nur eine Erklärung, wo Erinnerungen gehen (grau) – kein Fehler
    if (location.protocol !== "https:" && location.hostname !== "localhost") return { ok: false, hint: true, why: "Nur in der Online-Version (GitHub Pages), nicht in der Einzeldatei." };
    if (ios && !standalone) return { ok: false, hint: true, why: "Am iPhone nur in der App vom Home-Bildschirm (Teilen → „Zum Home-Bildschirm“), nicht im Safari-Tab." };
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return { ok: false, why: "Dieses Gerät bzw. dieser Browser kann keine Push-Nachrichten empfangen." };
    return { ok: true };
  }
  const pushOpt = () => { const s = state.settings; return { meals: s.pushMeals !== false, water: s.pushWater !== false, lead: s.pushLead == null ? 5 : num(s.pushLead) }; };
  // Erinnerungen des Tages aus dem Zeitplan
  function pushItems(d) {
    const o = pushOpt(), times = zeitTimes(d), dm = dayMeals(d), wp = waterPlan(d, dm.sum, times), items = [];
    if (o.meals) times.meals.forEach((t, i) => {
      const m = dm.meals[i];
      items.push({ at: fmtHM(t - o.lead), tag: "m" + (i + 1), title: "Mahlzeit " + (i + 1) + " · " + fmtHM(t),
        body: (m.rec ? displayText(m.rec) + " · ≈ " : "Rezept noch offen · ≈ ") + fmt(m.vol, 0) + " ml · " + sondierMin(m.vol) + " min" });
    });
    if (o.water && wp.per > 0) times.gifts.forEach((g, k) => {
      items.push({ at: fmtHM(g.t - o.lead), tag: "w" + (k + 1), title: "Wasser · " + fmtHM(g.t), body: fmt(wp.per, 0) + " ml Wasser" + (g.kind === "abend" ? " vor dem Schlafen" : "") + " · " + wasserMin(wp.per) + " min" });
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
    } catch (e) { pushError = "Abgleich fehlgeschlagen (" + errorText(e) + ") – wird beim nächsten Öffnen wiederholt."; }
    renderPushCard();
  }
  let pushTimer = null, pushError = "";
  function schedulePushSync() { if (!state.settings.pushOn) return; clearTimeout(pushTimer); pushTimer = setTimeout(() => pushSync(false), 1500); }
  async function pushEnable() {
    const sup = pushSupport(); if (!sup.ok) { showToast(escapeHtml(sup.why)); return; }
    if (!pushUrl()) { showToast("Zuerst die Adresse des Dienstes eintragen („Wie funktioniert das?“)."); return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { showToast(isIOS() ? "Mitteilungen sind nicht erlaubt – in den iPhone-Einstellungen unter Mitteilungen → HamHam Keto erlauben." : "Mitteilungen sind nicht erlaubt – in den Browser-Einstellungen für diese Seite Mitteilungen erlauben."); return; }
      await pushSubscription(true);
      state.settings.pushOn = true; save();
      await pushSync(true);
      showToast(pushError ? "" + escapeHtml(pushError) : "Erinnerungen eingeschaltet");
    } catch (e) { showToast("Einschalten fehlgeschlagen: " + escapeHtml(errorText(e))); }
    renderPushCard();
  }
  async function pushDisable() {
    state.settings.pushOn = false; save();
    try {
      const sub = await pushSubscription(false);
      if (sub) { try { await pushPost("/api/remove", { endpoint: sub.endpoint }); } catch (e) {} await sub.unsubscribe(); }
    } catch (e) {}
    try { localStorage.removeItem(PUSH_SYNC_KEY); } catch (e) {}
    showToast("Erinnerungen ausgeschaltet"); renderPushCard();
  }
  async function pushTest() {
    try {
      const sub = await pushSubscription(false); if (!sub) { showToast("Erst die Erinnerungen einschalten."); return; }
      await pushPost("/api/test", { subscription: sub.toJSON() });
      showToast("Testnachricht verschickt – sie sollte gleich erscheinen.");
    } catch (e) { showToast("Test fehlgeschlagen: " + escapeHtml(errorText(e))); }
  }
  // Karte in den Vorgaben
  function renderPushCard() {
    const st = document.getElementById("push-status"); if (!st) return;
    const s = state.settings, o = pushOpt(), sup = pushSupport(), on = !!s.pushOn;
    let last = null; try { last = JSON.parse(localStorage.getItem(PUSH_SYNC_KEY) || "null"); } catch (e) {}
    // Rot nur, wenn Erinnerungen wirklich nicht gehen: Gerät kann kein Push, Mitteilungen blockiert, Fehler beim Abgleich
    let denied = false; try { denied = sup.ok && window.Notification && Notification.permission === "denied"; } catch (e) {}
    st.className = "note " + ((!sup.ok && !sup.hint) || denied || pushError ? "warn" : on ? "tip" : "info");
    st.innerHTML = !sup.ok ? escapeHtml(sup.why)
      : denied ? (isIOS() ? "Mitteilungen sind nicht erlaubt – in den iPhone-Einstellungen unter Mitteilungen → HamHam Keto erlauben." : "Mitteilungen sind für diese Seite blockiert – in den Browser-Einstellungen erlauben.")
      : !pushUrl() ? "Noch nicht eingerichtet: Adresse des Dienstes unter „Wie funktioniert das?“ eintragen."
      : pushError ? escapeHtml(pushError)
      : on ? "<strong>Eingeschaltet</strong>" + (last ? " · " + last.n + " Erinnerungen am Tag, zuletzt abgeglichen " + new Date(last.at).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) : "")
      : "Ausgeschaltet.";
    const t = document.getElementById("push-toggle"); if (t) { t.textContent = on ? "Ausschalten" : "Erinnerungen einschalten"; t.classList.toggle("outline", on); t.classList.toggle("primary", !on); t.disabled = !sup.ok; }
    const te = document.getElementById("push-test"); if (te) te.hidden = !on;
    const pm = document.getElementById("push-meals"); if (pm) pm.checked = o.meals;
    const pw = document.getElementById("push-water"); if (pw) pw.checked = o.water;
    const kind = o.meals && o.water ? "both" : o.meals ? "meals" : o.water ? "water" : "none";
    document.querySelectorAll("#push-kind [data-kind]").forEach(b => b.classList.toggle("active", b.dataset.kind === kind));
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
    // Segment „Mahlzeiten · Wasser · beides · keine“ → pushMeals / pushWater (Speicherschlüssel wie bisher)
    document.querySelectorAll("#push-kind [data-kind]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.kind;
      state.settings.pushMeals = k === "meals" || k === "both";
      state.settings.pushWater = k === "water" || k === "both";
      save(); renderPushCard(); schedulePushSync();
    }));
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
  const SYNC_LOCAL_SETTINGS = ["view", "filter", "sort", "onlyQuelle", "hideKeto", "detailTab", "detailNutr", "theme", "pushOn", "pushUrl", "pushMeals", "pushWater", "pushLead"];
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
    } else if (SYNC_PARTS.indexOf(name) !== -1 && !unit.del) {
      // Stand eines anderen Geräts prüfen wie ein Backup: falsche Formen verwerfen statt übernehmen
      const v = unit.v, clean = { favorites: cleanFavorites, savedRecipes: cleanSavedRecipes, dayPlan: cleanDayPlan,
        scales: cleanNumMap, water: cleanNumMap, portion: cleanNumMap, basis: (b) => isObj(b) ? b : {} }[name];
      state[name] = clean ? clean(v) : v;
    }
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
    if (r.status === 404 && path.indexOf("/api/state/") === 0 && j && j.error === "not found") throw new Error("Der Dienst kennt den Abgleich noch nicht – bitte den Worker aktualisieren („Wie funktioniert das?“).");
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
          if (typeof rebuildFoodIndex === "function") rebuildFoodIndex(); // z. B. übernommene MCT-Etikettwerte sofort verwenden
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
      syncError = errorText(e);
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
    if (!syncSupport()) { showToast("Dieses Gerät kann nicht verschlüsselt abgleichen."); return; }
    const raw = crypto.getRandomValues(new Uint8Array(32));
    syncMeta = { key: b64u(raw), rev: 0, ts: {}, dirty: true }; syncLastJson = null;
    syncMarkChanges(Date.now()); syncMeta.dirty = true; syncSaveMeta();
    await syncNow(); syncStartTimer();
    showToast(syncError ? escapeHtml(syncError) : "Abgleich eingeschaltet – jetzt weitere Geräte verbinden.");
    renderSyncCard();
  }
  function randomCode() {
    // gleichverteilt: Bytes ab 248 (= 8 × 31) verwerfen, sonst kämen die ersten Zeichen etwas häufiger vor
    const out = [];
    while (out.length < 8) crypto.getRandomValues(new Uint8Array(16)).forEach(x => { if (x < 248 && out.length < 8) out.push(PAIR_ALPHABET[x % 31]); });
    return out.join("");
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
    } catch (e) { syncError = errorText(e); }
    renderSyncCard();
  }
  async function syncJoin(input) {
    const code = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "").split("").filter(ch => PAIR_ALPHABET.indexOf(ch) !== -1).join(""); // Code enthält kein O, L, I, 0, 1
    if (code.length !== 8) { showToast("Bitte den 8-stelligen Code eingeben (z. B. ABCD-EFGH)."); return; }
    if (!syncSupport()) { showToast("Dieses Gerät kann nicht verschlüsselt abgleichen."); return; }
    try {
      const id = await sha256hex("hamham-pair:" + code);
      const r = await syncPost("/api/pair/get", { id });
      if (r.status === 404) throw new Error("Code unbekannt oder abgelaufen – am anderen Gerät einen neuen Code erzeugen.");
      if (r.status !== 200) throw new Error("Dienst antwortet " + r.status);
      const keyB64 = await openText(await pairKey(code), r.j.blob);
      // Beim Koppeln übernimmt dieses Gerät den gemeinsamen Stand (eigene Daten werden ersetzt)
      syncMeta = { key: keyB64, rev: 0, ts: {}, fresh: true, dirty: false }; syncLastJson = null; syncSaveMeta();
      await syncNow(); syncStartTimer();
      showToast(syncError ? escapeHtml(syncError) : "Verbunden – dieses Gerät ist jetzt abgeglichen.");
    } catch (e) { showToast(escapeHtml(errorText(e))); }
    renderSyncCard();
  }
  function syncDisable() {
    if (!confirm("Abgleich auf diesem Gerät ausschalten? Die Daten bleiben hier erhalten, werden aber nicht mehr mit den anderen Geräten abgeglichen.")) return;
    syncMeta = null; syncLastJson = null; pairShown = null; syncError = ""; syncSaveMeta();
    showToast("Abgleich auf diesem Gerät ausgeschaltet."); renderSyncCard();
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
      if (valid) pc.innerHTML = "Code für das andere Gerät: <strong class=\"sync-code\">" + fmtCode(pairShown.code) + "</strong><br><small>Am anderen Gerät unter Vorgaben → Erinnerungen und Daten → Geräte abgleichen → „Mit Code verbinden“ eingeben. Gültig bis " +
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
     „Teilen“ erzeugt aus derselben Vorlage ein PDF (jsPDF, offline eingebettet) und öffnet das Teilen-Menü. */
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
      ov.id = "print-overlay"; ov.className = "print-overlay"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Druckvorschau");
      ov.innerHTML = '<div class="print-bar"><button type="button" class="tlink" id="print-back">‹ Zurück</button>' +
        '<span class="print-title"></span>' +
        '<button type="button" class="btn outline" id="print-share">Teilen</button>' +
        '<button type="button" class="btn" id="print-go">Drucken</button></div>' +
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
    // Am Bildschirm darf der Küchenzettel über seine Kante laufen: die verkleinerte Vorschau rundet Schriften auf und wird
    // dadurch etwas höher als der Druck – abgeschnitten wären sonst die letzten Zeilen. Druck und PDF bleiben exakt.
    root.innerHTML = "<style>:host{display:block}" + css + "@media screen{.kz{overflow:visible}}</style>" + body;
    ov.hidden = false; document.body.classList.add("printing"); modalOpen("print");
    const sc = ov.querySelector(".print-scroll"); if (sc) { sc.scrollTop = 0; sc.scrollLeft = 0; }
    // Küchenzettel in Originalgröße einpassen (ohne Vorschau-Verkleinerung), danach auf die Bildschirmbreite zoomen
    sheet.style.zoom = ""; fitKitchenCard(root);
    printZoom = 1; fitPrintSheet(); bindPrintZoom(sc);
    // Die Größe hängt an den Schriften: nach dem Laden (Newsreader, IBM Plex) noch einmal einpassen
    try {
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
        if (ov.hidden || !sheet.shadowRoot || sheet.shadowRoot !== root) return;
        const z = sheet.style.zoom; sheet.style.zoom = ""; fitKitchenCard(root); sheet.style.zoom = z;
      });
    } catch (e) {}
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
  // --s anpassen kann. Küchenzettel-Stil: Tinte auf Papier, Linien statt Karten, Zahlen in Mono, Wasser blau gepunktet.
  // Die Schriften (Newsreader, IBM Plex) lädt index.html; @font-face gilt auch im Shadow-DOM der Vorschau.
  const KITCHEN_CSS =
    "*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;color:#2a2621;margin:0}@page{size:A4 portrait;margin:0}.kz-page{position:relative;width:210mm;height:296mm;overflow:hidden}.kz{position:absolute;left:0;top:0;width:105mm;height:123.5mm;padding:6mm 6mm 0;overflow:hidden;font-size:calc(10pt * var(--s, 1));line-height:1.2;font-variant-numeric:tabular-nums}.kz-fold{position:absolute;border:0 dashed #c9c0b0}.kz-fold.v{left:105mm;top:0;bottom:0;border-left-width:.25mm}.kz-fold.h{top:148.5mm;left:0;right:0;border-top-width:.25mm}.kz-h{display:flex;justify-content:space-between;align-items:flex-end;gap:2mm;padding-bottom:.45em;border-bottom:.5mm solid #2a2621}.kz-h .ti small{display:block;font-size:.62em;letter-spacing:.14em;text-transform:uppercase;color:#645d53;font-weight:600;margin-bottom:.25em}.kz-h .ti b{display:block;font-family:Newsreader,Georgia,'Times New Roman',serif;font-weight:600;font-size:2.1em;line-height:1}.kz-h .rx{text-align:right;white-space:nowrap;font-family:'IBM Plex Mono',Menlo,'Courier New',monospace}.kz-h .rx .pill{display:inline-block;border:.3mm solid #2a2621;color:#2a2621;font-weight:600;border-radius:99px;padding:.1em .65em;font-size:1em}.kz-h .rx small{display:block;color:#645d53;margin-top:.3em;font-size:.88em}.lbl{font-size:.72em;letter-spacing:.12em;text-transform:uppercase;color:#645d53;font-weight:600;margin:1.1em 0 .3em}.r{display:grid;grid-template-columns:calc(12mm * var(--s, 1)) 1fr auto;column-gap:.6em;align-items:baseline;padding:.4em 0;break-inside:avoid}.r.me{border-top:.25mm solid #2a2621}.r.sl,.r.wa{border-top:.2mm dotted #a99f8f}.lbl + .r{border-top:0}.r .t{font-family:'IBM Plex Mono',Menlo,'Courier New',monospace;font-weight:600;font-size:1.1em}.r .n{font-family:Newsreader,Georgia,'Times New Roman',serif;font-weight:600;font-size:1.3em;line-height:1.1}.r i{font-style:normal}.r .d{font-family:'IBM Plex Mono',Menlo,'Courier New',monospace;color:#645d53;font-size:.82em;margin-left:.4em}.r .m{font-family:'IBM Plex Mono',Menlo,'Courier New',monospace;font-weight:600;font-size:1.1em;text-align:right;white-space:nowrap}.r.wa{padding:.22em 0;color:#2c5c9a}.r.wa .t,.r.wa .m{font-size:.95em;font-weight:500}.r.wa .n{font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;font-weight:500;font-size:.95em}.r.wa .d{color:#2c5c9a}.r.sl{color:#645d53;padding:.22em 0}.r.sl .t,.r.sl .m{font-size:.95em;font-weight:500}.r.sl .n{font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;font-weight:500;font-size:.95em}.rb{border-top:.25mm solid #2a2621;padding:.45em 0 .5em;break-inside:avoid}.rn{display:flex;justify-content:space-between;align-items:baseline;gap:2mm;margin-bottom:.3em}.rn b{font-family:Newsreader,Georgia,'Times New Roman',serif;font-weight:600;font-size:1.3em;line-height:1.1}.rn i{font-style:normal;font-family:'IBM Plex Mono',Menlo,'Courier New',monospace;font-size:.82em;color:#645d53;white-space:nowrap}.rb .z{display:grid;grid-template-columns:1fr 1fr;column-gap:4.5mm;font-size:1.08em;line-height:1.25}.rb .z .i{display:flex;justify-content:space-between;align-items:baseline;gap:1.5mm;padding:.12em 0;border-bottom:.2mm dotted #a99f8f}.rb .z .i span{color:#3d3832}.rb .z .i b{font-family:'IBM Plex Mono',Menlo,'Courier New',monospace;font-weight:600;white-space:nowrap}";
  // Schrift der Karte so groß wie möglich: von 150 % schrittweise kleiner, bis der Inhalt hineinpasst (mindestens 40 %).
  // Abstände sind in em angegeben und schrumpfen mit.
  const KITCHEN_SCALE_MAX = 1.5;
  function fitKitchenCard(root) {
    const kz = root && root.querySelector && root.querySelector(".kz"); if (!kz) return;
    let sc = KITCHEN_SCALE_MAX; kz.style.setProperty("--s", String(sc));
    while (kz.scrollHeight > kz.clientHeight + 1 && sc > 0.4) { sc = Math.round((sc - 0.04) * 100) / 100; kz.style.setProperty("--s", String(sc)); }
  }

  // Gemeinsamer Rahmen aller Ausdrucke: Kopf mit Titel und Datum, Tintenlinie, Tabellen mit Punktlinien, Fußzeile.
  const PRINT_CSS =
    "@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;color:#2a2621;margin:0;font-size:10.5pt;line-height:1.4;font-variant-numeric:tabular-nums}.head{display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;border-bottom:1.2pt solid #2a2621;padding-bottom:2.5mm;margin-bottom:3mm}h1{font-family:Newsreader,Georgia,'Times New Roman',serif;font-weight:600;font-size:24pt;margin:0;line-height:1.05}.meta{font-family:'IBM Plex Mono',Menlo,'Courier New',monospace;color:#645d53;font-size:8.5pt;text-align:right;white-space:nowrap}.rx{margin:0 0 4mm;color:#645d53;font-size:9pt}.rx b{color:#2a2621}h2{font-family:Newsreader,Georgia,'Times New Roman',serif;font-weight:600;font-size:14pt;margin:6mm 0 1.5mm;color:#2a2621}table{width:100%;border-collapse:collapse;margin:0}th{text-align:left;font-size:7.5pt;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#645d53;padding:1.2mm 1.5mm;border-bottom:1pt solid #2a2621}td{border-bottom:.5pt dotted #a99f8f;padding:1.5mm 1.5mm;vertical-align:top}.num{text-align:right;white-space:nowrap;font-family:'IBM Plex Mono',Menlo,'Courier New',monospace}td.num b{font-weight:600}tr.sum td{font-weight:600;border-top:1pt solid #2a2621;border-bottom:none}.box{border-top:.5pt dotted #a99f8f;border-bottom:.5pt dotted #a99f8f;padding:2.2mm 0;margin:3mm 0;font-size:9.5pt}.box.warn{background:#f5e0d8;color:#ad3326;border:0;border-radius:1.5mm;padding:2.2mm 3.2mm}.box.warn:before{content:\"▲ \"}ol{margin:1mm 0 0;padding:0;list-style:none;counter-reset:s}li{counter-increment:s;display:grid;grid-template-columns:8mm 1fr;padding:1.5mm 0;border-bottom:.5pt dotted #a99f8f}li:before{content:counter(s) \".\";font-family:'IBM Plex Mono',Menlo,'Courier New',monospace;font-weight:600}li:last-child:before{color:#ad3326}tr,li,.box{break-inside:avoid}.foot{margin-top:6mm;padding-top:2mm;border-top:.5pt solid #2a2621;color:#645d53;font-size:8pt}";
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
    const title = displayText(rec);
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
  // Farben des Küchenzettel-Stils (RGB) – dieselben Werte wie in der Druckvorschau
  const PDF_INK = [42, 38, 33], PDF_GREY = [100, 93, 83], PDF_DOT = [169, 159, 143], PDF_BLUE = [44, 92, 154],
    PDF_RED = [173, 51, 38], PDF_RED_BG = [245, 224, 216], PDF_FOLD = [201, 192, 176];
  // Gepunktete Linie (Trennlinien wie in der Vorschau)
  function pdfDotted(doc, x1, y1, x2, y2, w) {
    doc.setDrawColor.apply(doc, PDF_DOT); doc.setLineWidth(w || 0.2); doc.setLineDashPattern([0.3, 0.9], 0);
    doc.line(x1, y1, x2, y2); doc.setLineDashPattern([], 0);
  }
  function pdfRule(doc, x1, y1, x2, y2, w) { doc.setDrawColor.apply(doc, PDF_INK); doc.setLineWidth(w); doc.line(x1, y1, x2, y2); }
  // Küchenzettel: A6 (105 × 148,5 mm) im linken oberen Viertel einer A4-Seite, Falzlinien gestrichelt, unten 2,5 cm
  // frei zum Einstecken. Gleiches Design wie die Vorschau: Kopf mit Marke, Titel (Times) und Verhältnis-Pille mit
  // Tintenrahmen, Tintenlinie darunter; Zeitplan mit Tintenlinie vor jeder Mahlzeit, Wasser und Schlafen gepunktet;
  // darunter jedes Rezept mit Tintenlinie oben und den Zutaten in zwei Spalten (gepunktet getrennt, Gramm in Courier).
  // Die Schrift beginnt bei 150 % und wird samt Abständen kleiner, bis alles hineinpasst (mindestens 40 %).
  function kitchenCardPdf(doc, kz) {
    const CW = 105, PX = 6, PY = 6, BOTTOM = 148.5 - 25;
    const L = PX, R = CW - PX;
    const INK = PDF_INK, GREY = PDF_GREY, BLUE = PDF_BLUE, ZUT = [61, 56, 50];
    const PT = 0.3528, lineH = (size) => size * PT * 1.2;
    // fam: "sans" (Helvetica), "serif" (Times, Titel und Rezeptnamen), "mono" (Courier, alle Zahlen)
    const FAM = { sans: "helvetica", serif: "times", mono: "courier" };
    const font = (fam, size, bold, color) => { doc.setFont(FAM[fam], bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK); };
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
      // Kopf: Marke grau, „Tagesplan“ in Times, rechts Pille (nur Rahmen) und kcal/ml in Courier, Tintenlinie 0,5 mm
      const bs = 6.2 * s, ts = 21 * s, ps = 10 * s, ks = 8.8 * s, ph = ps * PT * 1.4;
      const leftH = lineH(bs) + 0.25 * em + ts * PT, rightH = ph + 0.3 * em + lineH(ks), headH = Math.max(leftH, rightH);
      if (draw) {
        const yl = y + headH - leftH, yr = y + headH - rightH; // unten bündig (align-items: flex-end)
        font("sans", bs, true, GREY); spaced(txt(kz, ".ti small"), bs, L, yl + lineH(bs) * 0.8);
        font("serif", ts, true); doc.text(txt(kz, ".ti b"), L, yl + lineH(bs) + 0.25 * em + ts * PT * 0.8);
        font("mono", ps, true); const pt = txt(kz, ".rx .pill"), pw = doc.getTextWidth(pt) + 1.3 * ps * PT;
        doc.setDrawColor.apply(doc, INK); doc.setLineWidth(0.3); doc.roundedRect(R - pw, yr, pw, ph, ph / 2, ph / 2, "S");
        doc.text(pt, R - pw / 2, yr + ph / 2, { align: "center", baseline: "middle" });
        font("mono", ks, false, GREY); doc.text(txt(kz, ".rx small"), R, yr + ph + 0.3 * em + ks * PT * 0.85, { align: "right" });
      }
      y += headH + 0.45 * em;
      if (draw) pdfRule(doc, L, y, R, y, 0.5);
      const label = (t) => {
        const ls = 7.2 * s;
        y += 1.1 * 0.72 * em;
        if (draw) { font("sans", ls, true, GREY); spaced(t, ls, L, y + lineH(ls) * 0.8); }
        y += lineH(ls) + 0.3 * 0.72 * em;
      };
      // Zeitplan
      label(labels[0] || "Zeitplan");
      const TW = 12 * s, GAP = 0.6 * em;
      rows.forEach((r, k) => {
        const me = r.kind === "me";
        const big = (me ? 11 : 9.5) * s, nm = (me ? 13 : 9.5) * s, ds = 8.2 * s;
        const col = r.kind === "wa" ? BLUE : r.kind === "sl" ? GREY : INK;
        const pad = (me ? 0.4 : 0.22) * em;
        font("mono", big, me); const mw = r.m ? doc.getTextWidth(r.m) + GAP : 0;
        const x0 = L + TW + GAP, avail = R - x0 - mw;
        font(me ? "serif" : "sans", nm, me); const nl = doc.splitTextToSize(r.n, avail), nW = doc.getTextWidth(nl[nl.length - 1] || "");
        font("mono", ds, false); const dW = r.d ? doc.getTextWidth(r.d) + 0.4 * em : 0;
        const dInline = !r.d || nW + dW <= avail;
        const first = Math.max(lineH(big), lineH(nm));
        const h = pad + first + (nl.length - 1) * lineH(nm) + (dInline ? 0 : lineH(ds)) + pad;
        if (draw) {
          if (k > 0) { if (me) pdfRule(doc, L, y, R, y, 0.25); else pdfDotted(doc, L, y, R, y, 0.2); }
          const base = y + pad + first * 0.8;
          font("mono", big, me, col); doc.text(r.t, L, base);
          font(me ? "serif" : "sans", nm, me, col); nl.forEach((l, i) => doc.text(l, x0, base + i * lineH(nm)));
          if (r.d) {
            font("mono", ds, false, r.kind === "wa" ? BLUE : GREY);
            const lastY = base + (nl.length - 1) * lineH(nm);
            if (dInline) doc.text(r.d, x0 + nW + 0.4 * em, lastY); else doc.text(r.d, x0, lastY + lineH(ds));
          }
          if (r.m) { font("mono", big, me, col); doc.text(r.m, R, base, { align: "right" }); }
        }
        y += h;
      });
      if (!recs.length) return y;
      // Zutaten je Portion: Tintenlinie oben, Name in Times, Uhrzeiten grau in Courier, Zutaten zweispaltig
      label(labels[1] || "Zutaten je Portion");
      const ZS = 10.8 * s, zlh = ZS * PT * 1.25, ip = 0.12 * em, colGap = 4.5, cw = (R - L - colGap) / 2, tn = 13 * s, ti = 8.2 * s;
      recs.forEach(rc => {
        const pairs = [];
        for (let i = 0; i < rc.z.length; i += 2) {
          const cells = rc.z.slice(i, i + 2).map(it => { font("mono", ZS, true); const gw = doc.getTextWidth(it.g); font("sans", ZS, false); return { it, lines: doc.splitTextToSize(it.n, cw - gw - 1.5) }; });
          pairs.push({ cells, n: Math.max.apply(null, cells.map(c => c.lines.length)) });
        }
        const head = 0.45 * em + lineH(tn) + 0.3 * em;
        const h = head + pairs.reduce((a, q) => a + q.n * zlh + 2 * ip, 0) + 0.5 * em;
        if (draw) {
          pdfRule(doc, L, y, R, y, 0.25);
          let yy = y + 0.45 * em + lineH(tn) * 0.8;
          font("serif", tn, true); doc.text(rc.n, L, yy);
          font("mono", ti, false, GREY); doc.text(rc.times, R, yy, { align: "right" });
          yy = y + head;
          pairs.forEach(q => {
            const rowH = q.n * zlh + 2 * ip;
            q.cells.forEach((c, ci) => {
              const x0 = L + ci * (cw + colGap), x1 = x0 + cw;
              font("sans", ZS, false, ZUT); c.lines.forEach((l, li) => doc.text(l, x0, yy + ip + (li + 0.8) * zlh));
              font("mono", ZS, true); doc.text(c.it.g, x1, yy + ip + (c.lines.length - 1 + 0.8) * zlh, { align: "right" });
              pdfDotted(doc, x0, yy + rowH, x1, yy + rowH, 0.2);
            });
            yy += rowH;
          });
        }
        y += h;
      });
      return y;
    };
    let s = 1.5;
    while (layout(s, false) > BOTTOM && s > 0.4) s = Math.round((s - 0.04) * 100) / 100;
    // Falzlinien: A4 zweimal falten → A6
    doc.setDrawColor.apply(doc, PDF_FOLD); doc.setLineWidth(0.25); doc.setLineDashPattern([1.6, 1.2], 0);
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
    const INK = PDF_INK, GREY = PDF_GREY, RED = PDF_RED;
    let y = M;
    const lineH = (size) => size * 0.3528 * 1.32;
    const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
    // Titel und h2 in Times, Zahlen in Courier, Text in Helvetica
    const font = (size, bold, color, fam) => { doc.setFont(fam || "helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK); };
    const para = (text, o) => {
      o = o || {}; const size = o.size || 10, indent = o.indent || 0, t = pdfText(text); if (!t) return;
      font(size, o.bold, o.color, o.fam);
      const lh = lineH(size);
      doc.splitTextToSize(t, W - indent).forEach(l => { ensure(lh); doc.text(l, M + indent, y + lh * 0.78); y += lh; });
      y += o.gap == null ? 1.5 : o.gap;
    };
    // Kennzeile unter dem Kopf: Fettbasis fett in Tinte, der Rest grau
    const rxLine = (el) => {
      const size = 9, lh = lineH(size), b = el.querySelector("b");
      const all = pdfText(el.textContent), lead = b ? pdfText(b.textContent) : "";
      font(size, false, GREY); const lines = doc.splitTextToSize(all, W - 4);
      lines.forEach((l, i) => {
        ensure(lh);
        if (i === 0 && lead && l.indexOf(lead) === 0) {
          font(size, true, INK); doc.text(lead, M, y + lh * 0.78); const x = M + doc.getTextWidth(lead);
          font(size, false, GREY); doc.text(l.slice(lead.length), x, y + lh * 0.78);
        } else { font(size, false, GREY); doc.text(l, M, y + lh * 0.78); }
        y += lh;
      });
      y += 3;
    };
    // Warnzeichen ▲ (Helvetica/Courier kennen es nicht): kleines gefülltes Dreieck
    const warnMark = (x, base, size) => {
      const hgt = size * 0.3528 * 0.62, w = hgt * 1.15;
      doc.setFillColor.apply(doc, RED); doc.triangle(x, base, x + w, base, x + w / 2, base - hgt, "F");
      return w + 1.2;
    };
    const box = (el) => {
      const warn = el.classList.contains("warn"), size = 9.5, lh = lineH(size), pad = 2.2;
      // Zeilenumbrüche (<br>) im Kasten erhalten
      const txt = el.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const padX = warn ? 3.2 : 0, mark = warn ? 3.6 : 0;
      font(size, false); const lines = doc.splitTextToSize(pdfText(txt), W - 2 * padX - mark);
      const h = lines.length * lh + 2 * pad; ensure(h + 6);
      y += 3;
      if (warn) { doc.setFillColor.apply(doc, PDF_RED_BG); doc.roundedRect(M, y, W, h, 1.5, 1.5, "F"); }
      else { pdfDotted(doc, M, y, M + W, y, 0.18); pdfDotted(doc, M, y + h, M + W, y + h, 0.18); }
      font(size, false, warn ? RED : INK); let yy = y + pad;
      if (warn) warnMark(M + padX, yy + lh * 0.78, size);
      lines.forEach(l => { doc.text(l, M + padX + mark, yy + lh * 0.78); yy += lh; });
      y += h + 3;
    };
    const table = (tbl) => {
      const isSum = (data) => { const el = data.cell.raw && data.cell.raw.nodeType === 1 ? data.cell.raw : null; return !!(el && el.parentElement && /\bsum\b/.test(el.parentElement.className)); };
      pdfAutoTable(doc, {
        html: tbl, startY: y, margin: { left: M, right: M, bottom: PH - BOTTOM }, theme: "plain", useCss: false,
        styles: { font: "helvetica", fontSize: 8.8, cellPadding: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 }, textColor: INK, lineWidth: 0, overflow: "linebreak" },
        headStyles: { fillColor: false, textColor: GREY, fontStyle: "bold", fontSize: 7.5, lineColor: INK, lineWidth: { bottom: 0.35 }, cellPadding: { top: 1.2, bottom: 1.2, left: 1.5, right: 1.5 } },
        didParseCell: (data) => {
          const el = data.cell.raw && data.cell.raw.nodeType === 1 ? data.cell.raw : null;
          data.cell.text = (data.cell.text || []).map(pdfText);
          if (data.section === "head") data.cell.text = data.cell.text.map(t => t.toUpperCase());
          if (!el) return;
          if (el.classList.contains("num")) { data.cell.styles.halign = "right"; if (data.section === "body") data.cell.styles.font = "courier"; }
          if (data.section === "body") {
            if (isSum(data)) { data.cell.styles.fontStyle = "bold"; data.cell.styles.lineWidth = { top: 0.35 }; data.cell.styles.lineColor = INK; }
            else if (el.querySelector && el.querySelector("b") && el.textContent.trim() === el.querySelector("b").textContent.trim()) data.cell.styles.fontStyle = "bold";
          }
        },
        // Körperzeilen unten gepunktet getrennt (die Summenzeile hat oben eine Tintenlinie)
        didDrawCell: (data) => {
          if (data.section !== "body" || isSum(data)) return;
          const c = data.cell, yb = c.y + c.height;
          pdfDotted(doc, c.x, yb, c.x + c.width, yb, 0.15);
        },
      });
      y = doc.lastAutoTable.finalY + 2.5;
    };
    [...dom.body.children].forEach(el => {
      const tag = el.tagName.toLowerCase(), cls = el.className || "";
      if (cls === "head") {
        const h1 = el.querySelector("h1"), meta = el.querySelector(".meta");
        const metaLines = meta ? meta.innerHTML.split(/<br\s*\/?>/i).map(s => pdfText(s.replace(/<[^>]+>/g, ""))) : [];
        font(22, true, INK, "times"); const titleLines = doc.splitTextToSize(pdfText(h1 ? h1.textContent : ""), W - 60);
        const lh = 22 * 0.3528 * 1.08, mlh = 3.6;
        const th = titleLines.length * lh, mh = metaLines.length * mlh, hh = Math.max(th, mh);
        titleLines.forEach((l, i) => doc.text(l, M, y + hh - th + lh * 0.8 + i * lh));
        font(8.5, false, GREY, "courier"); metaLines.forEach((l, i) => doc.text(l, PW - M, y + hh - mh + mlh * 0.8 + i * mlh, { align: "right" }));
        y += hh + 2.5;
        pdfRule(doc, M, y, PW - M, y, 0.45); y += 3.5;
      } else if (tag === "h2") {
        ensure(12); y += 3;
        const sm = el.querySelector("small"), main = el.cloneNode(true);
        [...main.querySelectorAll("small")].forEach(n => n.remove());
        if (!sm) para(el.textContent, { size: 13, bold: true, fam: "times", gap: 1 });
        else {
          // Zusatz in der Überschrift klein und grau
          const lh = lineH(13), t = pdfText(main.textContent);
          font(13, true, INK, "times"); doc.text(t, M, y + lh * 0.78);
          const x = M + doc.getTextWidth(t) + 2;
          font(8.5, false, GREY); doc.text(pdfText(sm.textContent), x, y + lh * 0.78);
          y += lh + 1;
        }
      }
      else if (tag === "table") table(el);
      else if (tag === "ol") {
        const items = [...el.children];
        items.forEach((li, i) => {
          const size = 10, lh = lineH(size), pad = 1.5; font(size, false);
          const lines = doc.splitTextToSize(pdfText(li.textContent), W - 8);
          ensure(pad + lh * Math.min(lines.length, 2));
          y += pad;
          font(size, true, i === items.length - 1 ? RED : INK, "courier"); doc.text((i + 1) + ".", M, y + lh * 0.78);
          font(size, false);
          lines.forEach(l => { ensure(lh); doc.text(l, M + 8, y + lh * 0.78); y += lh; });
          y += pad; pdfDotted(doc, M, y, M + W, y, 0.18);
        });
        y += 1;
      } else if (/\bbox\b/.test(cls)) box(el);
      else if (/\bfoot\b/.test(cls)) { y += 6; ensure(8); pdfRule(doc, M, y, PW - M, y, 0.18); y += 2; para(el.textContent, { size: 8, color: GREY }); }
      else if (/\brx\b/.test(cls)) rxLine(el);
      else para(el.textContent, { size: 10 });
    });
    // Seitenzahlen
    const n = doc.getNumberOfPages();
    if (n > 1) for (let i = 1; i <= n; i++) { doc.setPage(i); font(8, false, GREY, "courier"); doc.text("Seite " + i + " von " + n, PW - M, PH - 8, { align: "right" }); }
    return doc;
  }
  // forPrint: vom „Drucken“-Knopf in der iPhone-App (dort gibt es keinen Druckdialog) – Hinweis auf „Drucken“ im Menü.
  async function sharePrintPdf(forPrint) {
    if (!printCurrent) return;
    forPrint = forPrint === true;
    let doc = null;
    try { doc = buildPdfFromHtml(printCurrent.html); } catch (e) { doc = null; }
    if (!doc) { showToast(forPrint ? "PDF konnte nicht erstellt werden – bitte die App in Safari öffnen und dort drucken." : "PDF konnte nicht erstellt werden – bitte über „Drucken“ → Teilen als PDF sichern."); return; }
    const name = safeFileName(printCurrent.file) + ".pdf";
    const blob = doc.output("blob");
    let file = null;
    try { file = new File([blob], name, { type: "application/pdf" }); } catch (e) {}
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      if (forPrint) showToast("Im Teilen-Menü auf „Drucken“ tippen.");
      try { await navigator.share({ files: [file], title: printCurrent.title }); } catch (e) { /* abgebrochen */ }
      return;
    }
    // Ohne Teilen-Menü (z. B. am Desktop): PDF herunterladen
    try {
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast("PDF gespeichert: " + escapeHtml(name));
    } catch (e) { showToast("PDF konnte nicht gespeichert werden."); }
  }

  /* ---------- Eigenes Rezept (frei zusammenstellen) ---------- */
  const FAT_OPTIONS = ["Butter", "Streichgenuss (Schärdinger)", "Schlagobers NÖM", "Creme Fraîche NÖM", "Mascarpone Kärntnermilch", "Rapsöl", "Olivenöl", "MCT Nutricia (100%)", "Liquigen"];
  // Der Editor sieht aus wie die Detailansicht: fester Kopf, zwei Blätter (Zutaten · Mahlzeit), feste Aktionsleiste.
  const COMPOSE_PAGES = [["zutaten", "Zutaten"], ["mahlzeit", "Mahlzeit"]];
  let composeTab = "zutaten";

  function buildFoodSelect(value, onChange) {
    const sel = el("select", { class: "food-select", "aria-label": "Lebensmittel" });
    sel.appendChild(el("option", { value: "" }, "Lebensmittel wählen"));
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
    if (!hasBase) return { ok: false, hint: true, note: "Bitte mindestens ein Lebensmittel wählen." };

    // gültige Fette mit Anteil
    const valid = (fats || []).filter(x => lookup(x.food) && num(x.share) > 0);
    if (!valid.length) return { ok: false, hint: true, note: "Bitte mindestens ein Fett zum Ausgleich wählen." };
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
    const paneOpen = (k) => '<section class="pane" data-pane="' + k + '"' + (composeTab !== k && !mobile ? " hidden" : "") + '><div class="pane-in">';
    const paneClose = "</div></section>";
    const badge = '<span class="dh-tag">' + (compose.editKey ? "eigenes Rezept" : (compose.fromRecipe ? "nach „" + escapeHtml(compose.fromRecipe) + "“" : "neu")) + "</span>";
    const nutrOn = !!state.settings.detailNutr;
    c.classList.toggle("show-nutr", nutrOn);

    c.innerHTML =
      '<div class="sheet-grip" aria-hidden="true"></div>' +
      '<div class="detail-head"><div class="dh-tags" id="compose-meta"></div>' +
        '<input id="compose-name" class="title title-input" type="text" placeholder="Name für dein Rezept" aria-label="Name des Rezepts" value="' + escapeHtml(compose.name || "") + '"></div>' +
      pagerHead(COMPOSE_PAGES, composeTab, "compose-tabs") +
      '<div class="pages" id="compose-pages">' +

      /* ---------- 1 Zutaten ---------- */
      paneOpen("zutaten") +
      '<div class="portion-line">Lebensmittel und Mengen frei wählen – das Fett wird für ' + fmtTarget(d.ratio) + ' berechnet' +
        (compose.scale ? ', alles auf ' + fmt(d.kcalMahl, 0) + ' kcal je Mahlzeit skaliert' : '') + '</div>' +
      '<div class="weigh-head"><h4 class="ph">Zutaten für eine Mahlzeit</h4></div>' +
      '<div class="compose-rows" id="compose-rows"></div>' +
      '<button type="button" class="tlink add-link" id="compose-add">+ Zutat hinzufügen</button>' +
      '<div class="weigh-head"><h4 class="ph">Fett zum Ausgleich</h4><span class="wh-hint">stellt das Verhältnis ein</span></div>' +
      '<div class="compose-rows" id="compose-fats"></div>' +
      '<button type="button" class="tlink add-link" id="compose-addfat">+ weiteres Fett</button>' +
      '<label class="checkrow"><input type="checkbox" id="compose-scale"' + (compose.scale ? " checked" : "") + '> Mengen automatisch auf eine Mahlzeit (≈ ' + fmt(d.kcalMahl, 0) + ' kcal) skalieren</label>' +
      paneClose +

      /* ---------- 2 Mahlzeit (Ergebnis, Layout wie in der Detailansicht) ---------- */
      paneOpen("mahlzeit") +
      '<div id="compose-result" class="compose-result"></div>' +
      paneClose +

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
        const sel = el("select", { class: "food-select", "aria-label": "Fett zum Ausgleich" });
        FAT_OPTIONS.forEach(n => { const o = el("option", { value: n }, n); if (n === ft.food) o.selected = true; sel.appendChild(o); });
        sel.value = ft.food;
        sel.addEventListener("change", () => { ft.food = sel.value; recompute(); });
        row.appendChild(sel);
        if (multi) {
          const sh = el("input", { type: "number", min: "0", step: "5", value: ft.share, class: "compose-grams", "aria-label": "Anteil in Prozent" });
          sh.addEventListener("input", e => { ft.share = e.target.value; recompute(); });
          row.appendChild(sh);
          row.appendChild(el("span", { class: "unit" }, "%"));
          const del = el("button", { type: "button", class: "row-del", title: "Fett entfernen", "aria-label": "Fett entfernen" }, "×");
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
        const g = el("input", { type: "number", min: "0", step: "5", value: it.grams, class: "compose-grams", inputmode: "decimal", "aria-label": "Menge in Gramm" });
        g.addEventListener("input", e => { it.grams = e.target.value; recompute(); });
        row.appendChild(g);
        row.appendChild(el("span", { class: "unit" }, "g"));
        const del = el("button", { type: "button", class: "row-del", title: "Zutat entfernen", "aria-label": "Zutat entfernen" }, "×");
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
        meta.innerHTML = '<span class="dh-tag">noch unvollständig</span>' + badge;
        box.innerHTML = '<div class="portion-line">Noch nichts zu berechnen</div>' + (res.hint ? '<div class="note info">' : '<div class="note warn">▲ ') + res.note + "</div>"; // leer = Anleitung (grau), Rechenproblem = rot
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
      meta.innerHTML = '<span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmtRxA(r, 2) + '</span><span class="dh-tag">' + fmt(sum.kcal, 0) + ' kcal je Portion</span>' + badge;
      const nutr = (m) => '<small class="nutr">Eiweiß ' + fmt(m.eiweiss) + ' · Fett ' + fmt(m.fett) + ' · KH ' + fmt(m.kh) + ' · ' + fmt(m.kcal, 0) + ' kcal</small>';
      const rows = items.map(it => '<div class="ing-row ro' + (it.isFat ? " fatrow" : "") + '"><div class="ing-name"><span class="name">' + escapeHtml(it.food) + "</span>" +
          (it.isFat ? '<small class="adj">stellt das Verhältnis ein</small>' : "") + nutr(lineMacros(it)) + '</div><span class="sum-g">' + fmt(it.grams, 1) + '</span><span class="unit">' + (/wasser/i.test(it.food) ? "ml" : "g") + "</span></div>").join("");
      const fact = (cls, v, l) => '<div class="dstat' + (cls ? " " + cls : "") + '"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>';
      box.innerHTML =
        '<div class="detail-tiles facts">' +
          fact("", fmt(sum.kcal, 0), "kcal · Ziel " + fmt(d.kcalMahl, 0)) +
          fact(proteinOk && pStateC !== "high" ? "" : "warn", fmt(sum.eiweiss) + " g", "Eiweiß · Ziel " + fmt(d.eiweissMahl) + " g") +
          fact("", "≈ " + fmt(totalG, 0) + " g", "Menge") +
          fact("", "≈ " + fmt(ml, 0) + " ml", "Volumen") +
        "</div>" +
        (!proteinOk ? '<div class="note warn">▲ Eiweiß liegt unter dem Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
        (pStateC === "high" ? '<div class="note warn">▲ Eiweiß mehr als doppelt so hoch wie das Ziel – viel Eiweiß kann die Ketose schwächen.</div>' : "") +
        '<div class="portion-line">' + (compose.scale ? 'Wie berechnet · ' + fmt(d.kcalMahl, 0) + ' kcal je Mahlzeit' : 'Feste Zutatenmengen · ' + fmt(sum.kcal, 0) + ' kcal') + ' · Fett für ' + fmtTarget(d.ratio) + ' berechnet</div>' +
        '<div class="weigh-head"><h4 class="ph">Zum Abwiegen · eine Portion</h4><label class="nw-toggle"><input type="checkbox" class="nw-cb"' + (state.settings.detailNutr ? " checked" : "") + '> Nährwerte</label></div>' +
        '<div class="ing-list">' + rows +
          '<div class="ing-row sum"><div class="ing-name"><span class="name">Summe je Portion</span>' + nutr(sum) + '</div><span class="sum-g">' + fmt(totalG, 0) + '</span><span class="unit">g</span></div></div>';
      box.querySelectorAll(".nw-cb").forEach(cb => cb.addEventListener("change", () => { state.settings.detailNutr = cb.checked; save(); c.classList.toggle("show-nutr", cb.checked); }));
    }

    // Feste Fußleiste: Speichern (Primär) · Drucken · Neu beginnen
    const actions = c.querySelector("#compose-actions");
    const saveLabel = () => compose.editKey ? "Speichern" : "Als Rezept speichern";
    const saveBtn = el("button", { type: "button", class: "btn primary", id: "compose-save" }, saveLabel());
    saveBtn.addEventListener("click", () => {
      const nm = (nameInp.value || "").trim();
      if (!nm) { alert("Bitte oben einen Namen für das Rezept eingeben."); nameInp.focus(); return; }
      if (!lastOk || !lastItems.length) { alert("Bitte zuerst gültige Zutaten und ein Fett wählen."); return; }
      const items = lastItems.map(it => ({ food: it.food, grams: it.grams }));
      // Bearbeitetes Rezept überschreiben – gibt es es nicht mehr (inzwischen gelöscht), als neues Rezept anlegen
      const sr = compose.editKey ? state.savedRecipes.find(s => s.key === compose.editKey) : null;
      if (sr) { sr.name = nm; sr.items = items; }
      else {
        const key = "custom:" + Date.now();
        state.savedRecipes.unshift({ key, name: nm, icon: "📝", items });
        compose.editKey = key; compose.fromRecipe = nm;
      }
      compose.name = nm;
      save();
      saveBtn.textContent = "Gespeichert"; setTimeout(() => { saveBtn.textContent = saveLabel(); }, 1500);
    });
    actions.appendChild(saveBtn);
    const printBtn = el("button", { type: "button", class: "btn round-btn", title: "Drucken" }, ICON.print + '<span class="vh">Drucken</span>');
    printBtn.addEventListener("click", () => {
      if (!lastOk) { alert("Bitte zuerst gültige Zutaten und ein Fett wählen."); return; }
      const recForPrint = { name: (nameInp.value || "").trim() || "Eigenes Rezept", icon: "📝", ketocal: false,
        zubereitung: "Zutaten vorbereiten und mit dem Wasser fein pürieren. Butter, Obers oder Creme gleich mit untermischen." };
      printRecipe(recForPrint, { items: lastItems }, derived(), 1);
    });
    actions.appendChild(printBtn);
    const clearBtn = el("button", { type: "button", class: "btn round-btn danger", title: "Leeren / neu beginnen" }, ICON.trash + '<span class="vh">Neu beginnen</span>');
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
    // „+“ beginnt ein neues Rezept, wenn der Entwurf ein bereits gespeichertes Rezept ist (sonst würde Speichern unter
    // neuem Namen das alte überschreiben). Ein noch nicht gespeicherter Entwurf bleibt erhalten.
    const startNew = () => {
      if (state.compose && state.compose.editKey) { state.compose = { items: [{ food: "", grams: 60 }], fats: [{ food: "Schlagobers NÖM", share: 100 }], scale: true }; save(); }
      composeTab = "zutaten"; openCompose();
    };
    document.getElementById("compose-btn").addEventListener("click", startNew);
    const cl = document.getElementById("compose-link"); // Desktop: Textlink „+ Eigenes Rezept“ im Kopf der Rezepte
    if (cl) cl.addEventListener("click", startNew);
    document.getElementById("compose-close").addEventListener("click", closeCompose);
    const ov = document.getElementById("compose-overlay");
    ov.addEventListener("click", e => { if (e.target === ov) closeCompose(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden && topLayer() === "compose-overlay") closeCompose(); });
    bindSwipeDown(ov, closeCompose);
  }

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
})();
