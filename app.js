/* HamHam Keto — Logik
   Eine Seite: Einstellungen + Standard-Rezepte, die automatisch auf das
   Verhältnis und die Kalorien pro Mahlzeit umgerechnet werden.
   Einstellungen werden lokal im Browser gespeichert (localStorage). */

(function () {
  "use strict";

  const STORAGE_KEY = "ketoplaner.v5";

  /* ---------- State ---------- */
  function defaultState() {
    return {
      settings: { kcal: 700, ratio: 1.8, mahlzeiten: 5, eiweiss: 20, weight: 8, proteinPerKg: 1.5, mctShare: 0.1, mctMode: "verhaeltnis", mctFett100: 100, mctKcal100: 830, dampfVerdunstung: 150, withKeto: false, filter: "alle", onlyQuelle: false, sort: "kategorie" },
      compose: { items: [{ food: "", grams: 60 }], fats: [{ food: "Schlagobers NÖM", share: 100 }], scale: true },
      favorites: [],
      savedRecipes: [],
      scales: {},
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
      };
    } catch (e) { return defaultState(); }
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- Helpers ---------- */
  function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
  function round1(v) { return Math.round(v * 10) / 10; }
  function fmt(v, dec) {
    if (v === "" || v === null || v === undefined || !isFinite(v)) return "—";
    const d = dec === undefined ? 1 : dec;
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d))
      .toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
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

  /* ---------- Schnellfilter ---------- */
  const FILTERS = [
    { id: "alle", label: "Alle" },
    { id: "fleisch", label: "🥩 Fleisch" },
    { id: "fisch", label: "🐟 Fisch" },
    { id: "vegetarisch", label: "🥦 Vegetarisch" },
    { id: "obst", label: "🍓 Obst" },
    { id: "unterwegs", label: "🥫 Unterwegs" },
  ];
  function recipeTags(rec) {
    let fleisch = false, fisch = false, obst = false;
    rec.items.forEach(it => {
      const f = lookup(it.food); if (!f) return;
      const k = f.kategorie;
      if (k === "Fleisch" || k === "Wurst") fleisch = true;
      if (k === "Fisch") fisch = true;
      if (k === "Obst") obst = true;
    });
    const unterwegs = !!rec.unterwegs;
    return { fleisch, fisch, obst, unterwegs, veg: !fleisch && !fisch && !unterwegs };
  }
  function matchesFilter(rec, filter) {
    const t = recipeTags(rec);
    switch (filter) {
      case "fleisch": return t.fleisch;
      case "fisch": return t.fisch;
      case "vegetarisch": return t.veg;
      case "obst": return t.obst;
      case "unterwegs": return t.unterwegs;
      default: return true;
    }
  }

  /* ---------- Abgeleitete Werte ---------- */
  function derived() {
    const s = state.settings;
    const kcal = num(s.kcal), ratio = num(s.ratio);
    const mahl = Math.max(1, num(s.mahlzeiten) || 1);
    const perKg = num(s.proteinPerKg), weight = num(s.weight);
    const autoProtein = perKg > 0 && weight > 0;
    const eiweiss = autoProtein ? Math.round(weight * perKg) : num(s.eiweiss);
    const mctShare = Math.min(1, Math.max(0, num(s.mctShare)));
    const mctMode = s.mctMode === "kalorien" ? "kalorien" : "verhaeltnis";
    const dampfVerdunstung = num(s.dampfVerdunstung);
    return { kcal, ratio, mahl, eiweiss, autoProtein, kcalMahl: kcal / mahl, eiweissMahl: eiweiss / mahl, mctShare, mctMode, dampfVerdunstung };
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

  /* ---------- Favoriten & Rezeptquellen ---------- */
  function hasKetoCal(items) { return items.some(it => (it.food || "").toLowerCase().indexOf("ketocal") !== -1); }
  function recipeKey(rec) { return rec.custom ? rec.key : ("std:" + rec.name); }
  function isFav(rec) { return state.favorites.indexOf(recipeKey(rec)) !== -1; }
  function toggleFav(rec) {
    const k = recipeKey(rec), i = state.favorites.indexOf(k);
    if (i === -1) state.favorites.push(k); else state.favorites.splice(i, 1);
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

  /* ---------- Rezepte rendern ---------- */
  let infoOpen = false; // Warnhinweis (ohne KetoCal) ein-/ausgeklappt
  function renderRezepte() {
    const s = state.settings;
    const $ = id => document.getElementById(id);
    $("set-kcal").value = s.kcal;
    $("set-mahlzeiten").value = s.mahlzeiten;
    $("set-ratio").value = s.ratio;
    $("set-weight").value = s.weight;
    $("set-mct-fett").value = s.mctFett100 || "";
    $("set-mct-kcal").value = s.mctKcal100 || "";
    $("set-verdunstung").value = (s.dampfVerdunstung === 0 || s.dampfVerdunstung) ? s.dampfVerdunstung : "";
    $("set-proteinmode").value = String(s.proteinPerKg || 0);

    const d = derived();
    $("set-eiweiss").value = d.autoProtein ? d.eiweiss : s.eiweiss;
    $("set-eiweiss").disabled = d.autoProtein;
    // Ein einzelner KetoCal-Schalter: aus = ohne KetoCal, ein = mit KetoCal
    const withKeto = !!s.withKeto;
    const warn = !withKeto; // Hinweis nur bei Rezepten ohne KetoCal
    $("permeal").innerHTML =
      '<div class="permeal-main">' + fmt(d.kcalMahl, 0) + ' <span class="u">kcal pro Mahlzeit</span></div>' +
      '<div class="permeal-sub">' + fmt(d.kcal, 0) + " kcal/Tag ÷ " + d.mahl + " Mahlzeiten · Verhältnis " +
      fmt(d.ratio, d.ratio % 1 ? 1 : 0) + ":1 · Eiweiß-Ziel ca. " + fmt(d.eiweissMahl) + " g/Mahlzeit" +
      (d.autoProtein ? " (" + fmt(d.eiweiss, 0) + " g/Tag, automatisch nach Gewicht)" : "") +
      (warn ? ' <button class="info-toggle' + (infoOpen ? " on" : "") + '" id="permeal-info" title="Hinweis ohne KetoCal ein-/ausblenden">ⓘ</button>' : "") +
      "</div>";
    const ib = warn ? document.getElementById("permeal-info") : null;
    if (ib) ib.addEventListener("click", () => {
      infoOpen = !infoOpen;
      $("info-note").hidden = !infoOpen;
      ib.classList.toggle("on", infoOpen);
    });

    // Schnellfilter-Chips
    const filter = s.filter || "alle";
    const onlyQuelle = !!s.onlyQuelle;
    const fb = $("filter-bar");
    fb.innerHTML = "";
    // Gruppe 1: Kategorie (entweder/oder)
    const catChips = el("div", { class: "chips cat" });
    FILTERS.forEach(f => {
      const chip = el("button", { class: "chip" + (f.id === filter ? " active" : "") }, f.label);
      chip.addEventListener("click", () => { state.settings.filter = f.id; save(); renderRezepte(); });
      catChips.appendChild(chip);
    });
    fb.appendChild(catChips);
    // Gruppe 2: unabhängige Schalter (KetoCal + Diätologie), optisch abgesetzt
    const switchChips = el("div", { class: "chips switches" });
    [
      { key: "withKeto", label: "🥄 KetoCal", on: withKeto },
      { key: "onlyQuelle", label: "👩‍⚕️ Diätologie", on: onlyQuelle },
    ].forEach(t => {
      const c = el("button", { class: "chip switch" + (t.on ? " active" : "") }, t.label);
      c.addEventListener("click", () => { state.settings[t.key] = !state.settings[t.key]; save(); renderRezepte(); });
      switchChips.appendChild(c);
    });
    fb.appendChild(switchChips);

    const recipes = allRecipes()
      .filter(r => !!r.ketocal === withKeto)
      .filter(r => matchesFilter(r, filter))
      .filter(r => !onlyQuelle || !!r.quelle)
      .map(rec => ({ rec, res: computeAdjustedRecipe(rec, d.kcalMahl, d.ratio) }))
      .filter(x => x.res.ok);

    $("info-note").innerHTML = !warn ? "" :
      '<div class="diet-note">⚠️ <strong>Wichtig:</strong> Rezepte ohne KetoCal liefern keine vollständigen Vitamine und Mineralstoffe. Diese müssen separat ergänzt werden — bitte mit dem Behandlungsteam abstimmen.</div>';
    $("info-note").hidden = !(warn && infoOpen);

    $("recipe-count").textContent =
      recipes.length + " Rezept" + (recipes.length === 1 ? "" : "e") +
      (withKeto ? " mit KetoCal" : " ohne KetoCal");

    const sort = s.sort || "kategorie";
    $("sort-select").value = sort;

    const list = $("recipe-list");
    list.innerHTML = "";
    if (recipes.length === 0) {
      list.appendChild(el("div", { class: "card empty" }, "Keine Rezepte für diese Auswahl."));
      return;
    }

    function appendGroup(title, arr) {
      if (!arr.length) return;
      const sorted = arr.slice().sort((a, b) => {
        const ka = a.rec.name.toLowerCase(), kb = b.rec.name.toLowerCase();
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      list.appendChild(el("div", { class: "group-head" }, title + ' <span class="group-count">' + sorted.length + "</span>"));
      const grid = el("div", { class: "tiles" });
      sorted.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d)));
      list.appendChild(grid);
    }

    if (sort === "kategorie") {
      const favs = recipes.filter(x => isFav(x.rec));
      const rest = recipes.filter(x => !isFav(x.rec));
      appendGroup("⭐ Favoriten", favs);
      [["Fleisch", "🥩 Fleisch"], ["Fisch", "🐟 Fisch"], ["Vegetarisch", "🥦 Vegetarisch"], ["Obst", "🍓 Obst"]]
        .forEach(([key, label]) => appendGroup(label, rest.filter(x => recipeGroup(x.rec) === key)));
    } else {
      const keyFn = sort === "eiweiss"
        ? x => -sumMacros(x.res.items).eiweiss
        : sort === "volumen"
        ? x => volumeMl(x.res.items)
        : x => x.rec.name.toLowerCase();
      const sorted = recipes.slice().sort((a, b) => {
        const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const ka = keyFn(a), kb = keyFn(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      const grid = el("div", { class: "tiles" });
      sorted.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d)));
      list.appendChild(grid);
    }
  }

  // Primäre Anzeige-Gruppe eines Rezepts
  function recipeGroup(rec) {
    const t = recipeTags(rec);
    if (t.fleisch) return "Fleisch";
    if (t.fisch) return "Fisch";
    if (t.obst) return "Obst";
    return "Vegetarisch";
  }


  function bindSettingsBar() {
    const map = { "set-kcal": "kcal", "set-mahlzeiten": "mahlzeiten", "set-ratio": "ratio", "set-eiweiss": "eiweiss", "set-weight": "weight", "set-mct-fett": "mctFett100", "set-mct-kcal": "mctKcal100", "set-verdunstung": "dampfVerdunstung" };
    Object.keys(map).forEach(id => {
      document.getElementById(id).addEventListener("input", e => {
        state.settings[map[id]] = num(e.target.value); save();
        if (id.indexOf("set-mct") === 0) rebuildFoodIndex(); // Etikettwerte fürs MCT-Öl neu anwenden
        renderRezepte();
      });
    });
    document.getElementById("set-proteinmode").addEventListener("change", e => {
      state.settings.proteinPerKg = num(e.target.value); save(); renderRezepte();
    });
    document.getElementById("sort-select").addEventListener("change", e => {
      state.settings.sort = e.target.value; save(); renderRezepte();
    });
    const toggle = document.getElementById("settings-toggle");
    const grid = document.getElementById("settings-grid");
    toggle.addEventListener("click", () => {
      const willOpen = grid.hidden;
      grid.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
      toggle.classList.toggle("open", willOpen);
    });
  }

  /* ---------- Kachel (Übersicht) ---------- */
  function renderRecipeTile(rec, res, d) {
    const sum = sumMacros(res.items);
    const r = ratioOf(sum);
    const totalG = res.items.reduce((a, it) => a + num(it.grams), 0);
    const ml = volumeMl(res.items);
    const proteinOk = sum.eiweiss >= d.eiweissMahl * 0.9;

    const fav = isFav(rec);
    const tile = el("div", { class: "tile", tabindex: "0", role: "button" });
    tile.innerHTML =
      '<div class="tile-head">' +
        '<span class="tile-icon">' + (rec.icon || "🥑") + "</span>" +
        '<button class="favbtn' + (fav ? " on" : "") + '" title="Favorit">' + (fav ? "★" : "☆") + "</button>" +
      "</div>" +
      '<div class="tile-name">' + escapeHtml(rec.name) + "</div>" +
      '<div class="tile-badge">' +
        (rec.ketocal ? '<span class="badge keto">mit KetoCal</span>' : '<span class="badge noketo">ohne KetoCal</span>') +
        (rec.custom ? '<span class="badge custom">eigenes</span>' : "") +
        (rec.quelle ? '<span class="badge quelle">👩‍⚕️ Diätologie</span>' : "") +
        '<span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + (r === null ? "—" : fmt(r, 2)) + ":1</span>" +
      "</div>" +
      '<div class="tile-stats">' +
        "<span>" + fmt(sum.kcal, 0) + " kcal</span>" +
        "<span>≈ " + fmt(totalG, 0) + " g / " + fmt(ml, 0) + " ml</span>" +
        '<span class="' + (proteinOk ? "prot-ok" : "prot-low") + '">Eiweiß ' + fmt(sum.eiweiss) + " g</span>" +
      "</div>" +
      '<div class="tile-cta">Rezept ansehen →</div>';
    const open = () => openRecipeDetail(rec);
    tile.addEventListener("click", open);
    tile.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    tile.querySelector(".favbtn").addEventListener("click", e => { e.stopPropagation(); toggleFav(rec); renderRezepte(); });
    return tile;
  }

  /* ---------- Detailansicht (Overlay) ---------- */
  let detailRec = null, detailScale = 1, detailMeat = null; // detailScale: Portionen-Faktor, detailMeat: temporäre Fleischwahl
  // Merkt sich die zuletzt eingegebene Menge (Portionen-Faktor) je Rezept – bleibt auch nach dem Schließen erhalten.
  function persistScale() {
    if (!detailRec) return;
    const k = recipeKey(detailRec);
    if (Math.abs(detailScale - 1) < 1e-6) delete state.scales[k];
    else state.scales[k] = detailScale;
    save();
  }
  function openRecipeDetail(rec) {
    detailRec = rec; detailScale = num(state.scales[recipeKey(rec)]) || 1; detailMeat = null;
    renderDetail();
    const overlay = document.getElementById("detail-overlay");
    overlay.hidden = false;
    document.body.classList.add("modal-open");
  }
  function renderDetail() {
    const rec = detailRec;
    const d = derived();
    // Basis-Rezept auf Einstellungen (140 kcal/Mahlzeit + Verhältnis) anpassen.
    const base = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
    let res = base;
    let adjIndex = base.fatIndex, adjLabel = " ⟵ Fett angepasst";
    const swapSlot = recipeMeatSlot(rec);
    if (swapSlot && detailMeat && detailMeat !== swapSlot.baseKey) {
      // Nur das Fleisch wird getauscht; Gemüse, Wasser UND Öl/Fett bleiben gleich.
      // Die Fleischmenge wird so berechnet, dass das Verhältnis exakt stimmt.
      const swapped = base.items.map((it, i) => i === swapSlot.index
        ? { food: MEATS[detailMeat].food, grams: num(it.grams) }
        : { food: it.food, grams: num(it.grams) });
      const solved = solveMeatForRatio(swapped, swapSlot.index, d.ratio);
      if (solved) {
        const sm = sumMacros(solved);
        res = { items: solved, ratio: ratioOf(sm), kcal: sm.kcal, ok: true, fatIndex: base.fatIndex };
        adjIndex = swapSlot.index; adjLabel = " ⟵ Menge angepasst";
      }
    }
    // Öl-Mix (Rapsöl/MCT): Anteil s + Modus aus den Einstellungen; s = 0 lässt alles unverändert.
    // kcal-Ziel für den Modus KALORIEN = Kalorien der Ansicht bei s = 0 (Basis bzw.
    // nach Fleisch-Tausch), damit "kcal konstant" sich auf den sichtbaren Ist-Zustand bezieht.
    const baseOilIndex = oilSlotIndex(res.items);
    const kcalZielOil = sumMacros(res.items).kcal;
    if (baseOilIndex >= 0 && d.mctShare > 0) res = applyOilMix(res, d, d.mctShare, d.mctMode, kcalZielOil);
    const mult = detailScale > 0 ? detailScale : 1;
    const items = res.items;
    const sumPer = sumMacros(items);
    const sum = { eiweiss: sumPer.eiweiss * mult, fett: sumPer.fett * mult, kh: sumPer.kh * mult, kcal: sumPer.kcal * mult };
    const r = ratioOf(sumPer);
    const totalG = items.reduce((a, it) => a + num(it.grams), 0) * mult;
    const ml = volumeMl(items) * mult;
    const proteinTarget = d.eiweissMahl * mult;
    const proteinOk = sum.eiweiss >= proteinTarget * 0.9;
    const portionsTxt = (Math.abs(mult - Math.round(mult)) < 0.05 ? String(Math.round(mult)) : fmt(mult, 1));
    const portionLabel = mult === 1 ? "1 Portion" : portionsTxt + " Portionen";
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

    const meatSlot = recipeMeatSlot(rec);
    let meatSeg = "";
    if (meatSlot) {
      const cur = detailMeat || meatSlot.baseKey;
      meatSeg = '<div class="meat-swap"><div class="seg-label">🍖 Fleisch tauschen</div><div class="segmented mini">' +
        ["huhn", "rind", "pute"].map(k =>
          '<button type="button" data-meat="' + k + '"' + (k === cur ? ' class="active"' : "") + ">" +
          MEATS[k].icon + " " + MEATS[k].label + "</button>"
        ).join("") +
        '</div><div class="meat-note">Es ändert sich nur das Fleisch – Gemüse, Wasser und Öl/Fett bleiben gleich. Die Fleischmenge wird so berechnet, dass das Verhältnis genau stimmt (sie kann daher etwas von 30 g / 18 g abweichen; die Kalorien können leicht variieren).</div></div>';
    }

    let oilSeg = "";
    if (baseOilIndex >= 0) {
      const sOil = d.mctShare, mm = res.mct || null;
      const shareBtn = (v) => '<button type="button" data-mcts="' + v + '"' + (Math.abs(sOil - v / 100) < 0.005 ? ' class="active"' : "") + ">" + v + " %</button>";
      const modeBtn = (k, lab) => '<button type="button" data-mctmode="' + k + '"' + (d.mctMode === k ? ' class="active"' : "") + ">" + lab + "</button>";
      let note;
      if (!(sOil > 0)) {
        note = "Nur Rapsöl. Der MCT-Anteil bezieht sich auf die <strong>Öl-Fettmasse</strong>. Beim Tausch gegen ein Fett anderer Energiedichte lassen sich Fettmasse, Kalorien und Verhältnis nicht gleichzeitig halten – der Modus legt fest, welche Größe exakt bleibt.";
      } else {
        note = (d.mctMode === "kalorien"
          ? "🎯 <strong>Kalorien halten:</strong> Die Kalorien bleiben für jeden MCT-Anteil gleich; das Verhältnis steigt mit dem Anteil."
          : "⚖️ <strong>Verhältnis halten:</strong> Das Verhältnis bleibt für jeden MCT-Anteil exakt gleich; die Kalorien sinken mit dem Anteil (MCT liefert weniger kcal je Gramm). Ein Tausch bei gleicher Fettmasse lässt das Verhältnis unberührt – die Fettart kommt darin nicht vor.") +
          "<br>⚠️ MCT kann durch Capronsäure (C6) den Rachen reizen. Klein beginnen und die Verträglichkeit beobachten." +
          "<br><small>MCT ist je kcal ketogener als langkettiges Fett – ein Tausch senkt die Ketose nicht. Besser verträglich: weniger MCT je Mahlzeit, dafür in jeder Mahlzeit. Die Vorbelegung 8,3 kcal/g für MCT ist ein <strong>Praxiswert</strong>, kein belegter Etikettwert – echte Etikettwerte unter ⚙️ Einstellungen eintragen (auch Emulsionen mit geringerem Fettanteil).</small>";
      }
      // Warnhinweise aus der ungerundeten Rechnung (§5)
      let warn = "";
      if (mm) {
        if (mm.energiePz > 50) warn += '<div class="adjust-note">⚠️ Über dem gängigen Arbeitsbereich von 40–50 %. Die traditionelle MCT-Diät verwendet 60 % und kann Magen-Darm-Beschwerden verursachen.</div>';
        const devTag = mm.dev * d.mahl;
        if (d.mctMode !== "kalorien" && devTag < -20) warn += '<div class="adjust-note">⚠️ Das Tagesziel wird um ' + fmt(-devTag, 0) + ' kcal unterschritten. Ausgleich mit der Diätologie klären.</div>';
        if (d.mctMode === "kalorien" && (mm.ratioNeu - mm.ratioBasis) > 0.05) warn += '<div class="adjust-note">⚠️ Das Verhältnis steigt von ' + fmt(mm.ratioBasis, 2) + ' auf ' + fmt(mm.ratioNeu, 2) + '. Das ist eine Änderung der Verordnung, nicht der Fettart.</div>';
      }
      oilSeg = '<div class="meat-swap"><div class="seg-label">🧈 Öl: MCT-Anteil an der Öl-Fettmasse</div>' +
        '<div class="segmented mini">' + [0, 10, 20, 30, 50, 100].map(shareBtn).join("") + "</div>" +
        '<div class="segmented mini" style="margin-top:6px">' + modeBtn("verhaeltnis", "⚖️ Verhältnis halten") + modeBtn("kalorien", "🎯 Kalorien halten") + "</div>" +
        '<div class="meat-note">' + note + "</div>" + warn + "</div>";
    }

    let rows = "";
    items.forEach((it, i) => {
      const g = num(it.grams) * mult;
      const m = lineMacros({ food: it.food, grams: g });
      rows += "<tr" + (i === adjIndex ? ' class="fatrow"' : "") + "><td class='name'>" +
        escapeHtml(it.food) + (i === adjIndex ? adjLabel : "") + "</td>" +
        '<td><input class="amt-edit" type="number" min="0" step="1" inputmode="decimal" data-g="' + (Math.round(g * 10) / 10) + '" value="' + (Math.round(g * 10) / 10) + '"></td>' +
        "<td>" + fmt(m.eiweiss) + "</td><td>" +
        fmt(m.fett) + "</td><td>" + fmt(m.kh) + "</td><td>" + fmt(m.kcal, 0) + "</td></tr>";
    });

    const c = document.getElementById("detail-content");
    c.innerHTML =
      '<div class="detail-head"><span class="detail-icon">' + (rec.icon || "🥑") + "</span>" +
        '<div><div class="title">' + escapeHtml(rec.name) + " " + ketoBadge + "</div>" +
        '<div class="meta">Verhältnis <span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' +
        (r === null ? "—" : fmt(r, 2)) + ":1</span> · zeigt: " + portionLabel + "</div></div></div>" +
      '<div class="seg-portion batch">' +
        '<span class="seg-label">Menge zubereiten:</span>' +
        '<div class="segmented mini">' +
          '<button type="button" data-scale="1"' + (mult === 1 ? ' class="active"' : "") + ">1 Portion</button>" +
          '<button type="button" data-scale="' + d.mahl + '"' + (Math.abs(mult - d.mahl) < 0.01 ? ' class="active"' : "") + ">Ganzer Tag (×" + d.mahl + ")</button>" +
        "</div>" +
        '<span class="portion-step">Portionen <button type="button" class="stepbtn" data-step="-1">−</button>' +
        '<input id="portion-input" type="number" min="0.5" step="0.5" value="' + (Math.round(mult * 10) / 10) + '">' +
        '<button type="button" class="stepbtn" data-step="1">+</button></span>' +
      "</div>" +
      (mult !== 1 ? '<div class="adjust-note" style="text-align:right"><button type="button" id="scale-reset" style="background:none;border:none;color:var(--brand-dark);text-decoration:underline;cursor:pointer;font:inherit;padding:0">↺ auf 1 Portion zurücksetzen</button></div>' : "") +
      meatSeg +
      oilSeg +
      '<div class="detail-tiles">' +
        '<div class="dstat"><div class="v">' + fmt(sum.kcal, 0) + '</div><div class="l">kcal</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(hasOil ? perGnoOil * mult : totalG, 0) + ' g</div><div class="l">Menge' + (hasOil ? ' ohne Öl<br><small>' + (mult !== 1 ? 'je Portion ≈ ' + fmt(perGnoOil, 0) + ' g · ' : '') + 'mit Öl ≈ ' + fmt(totalG, 0) + ' g</small>' : "") + '</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(hasOil ? perMlNoOil * mult : ml, 0) + ' ml</div><div class="l">Volumen' + (hasOil ? ' ohne Öl<br><small>' + (mult !== 1 ? 'je Portion ≈ ' + fmt(perMlNoOil, 0) + ' ml · ' : '') + 'mit Öl ≈ ' + fmt(ml, 0) + ' ml</small>' : "") + '</div></div>' +
        '<div class="dstat ' + (proteinOk ? "" : "warn") + '"><div class="v">' + fmt(sum.eiweiss) + ' g</div><div class="l">Eiweiß (Ziel ' + fmt(proteinTarget) + ' g)</div></div>' +
      "</div>" +
      (res.mct ? '<div class="detail-tiles">' +
        '<div class="dstat"><div class="v">' + fmt(res.mct.energiePz, 1) + ' %</div><div class="l">MCT-Anteil der Energie<br><small>' + mctEinordnung(res.mct.energiePz) + '</small></div></div>' +
        '<div class="dstat"><div class="v">' + (res.mct.dev < -0.05 ? "−" : (res.mct.dev > 0.05 ? "+" : "±")) + fmt(Math.abs(res.mct.dev), 1) + ' kcal</div><div class="l">Abweichung je Portion<br><small>je Tag ' + (res.mct.dev < -0.05 ? "−" : (res.mct.dev > 0.05 ? "+" : "±")) + fmt(Math.abs(res.mct.dev * d.mahl), 0) + ' kcal (×' + d.mahl + ')</small></div></div>' +
        '<div class="dstat"><div class="v">' + fmt(res.mct.gMct, 1) + ' g</div><div class="l">MCT je Portion<br><small>maßgeblich für die Verträglichkeit</small></div></div>' +
      "</div>" : "") +
      (!proteinOk ? '<div class="adjust-note">⚠️ Liegt unter dem Eiweiß-Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
      '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' +
        rows +
        "<tr class='sum'><td class='name'>Summe</td><td>" + fmt(totalG, 0) + "</td><td>" + fmt(sum.eiweiss) + "</td><td>" +
        fmt(sum.fett) + "</td><td>" + fmt(sum.kh) + "</td><td>" + fmt(sum.kcal, 0) + "</td></tr>" +
      "</tbody></table></div>" +
      '<div class="adjust-note">ℹ️ Tipp: Eine Zutatenmenge in der Tabelle ändern – die <strong>anderen Zutaten werden proportional mitskaliert</strong> (z. B. mehr Hendl = größere Menge). Praktisch zum Vorkochen mehrerer Portionen und Einkühlen.</div>' +
      (mult !== 1 ? '<div class="adjust-note">ℹ️ Menge für <strong>' + portionLabel + '</strong>. Die Varoma-/Garzeiten unten gelten für <strong>eine</strong> Portion – bei größerer Menge entsprechend länger garen, bis alles weich ist, und ggf. portionsweise pürieren. Im Kühlschrank lagern.</div>' : "") +
      (rec.varoma
        ? '<div class="prep varoma"><strong>🫧 Zubereitung mit Varoma (dämpfen)</strong><br>' + escapeHtml(adaptOil(adaptVaroma(adaptPrep(rec.varoma, rec, detailMeat)))) + "</div>"
        : (rec.zubereitung ? '<div class="prep"><strong>Zubereitung</strong><br>' + escapeHtml(adaptOil(adaptPrep(rec.zubereitung, rec, detailMeat))) + "</div>" : ""));

    c.querySelectorAll(".seg-portion button[data-scale]").forEach(b =>
      b.addEventListener("click", () => { detailScale = parseFloat(b.dataset.scale) || 1; persistScale(); renderDetail(); }));
    c.querySelectorAll(".seg-portion button[data-step]").forEach(b =>
      b.addEventListener("click", () => {
        detailScale = Math.max(0.5, Math.round((mult + parseFloat(b.dataset.step)) * 2) / 2);
        persistScale(); renderDetail();
      }));
    const pin = c.querySelector("#portion-input");
    if (pin) pin.addEventListener("change", () => {
      const v = parseFloat(String(pin.value).replace(",", ".")); if (v > 0) { detailScale = v; persistScale(); renderDetail(); }
    });
    c.querySelectorAll(".amt-edit").forEach(inp =>
      inp.addEventListener("change", () => {
        const oldG = parseFloat(inp.dataset.g); const nv = parseFloat(String(inp.value).replace(",", "."));
        if (oldG > 0 && nv > 0) { detailScale = mult * (nv / oldG); persistScale(); renderDetail(); }
      }));
    const scaleReset = c.querySelector("#scale-reset");
    if (scaleReset) scaleReset.addEventListener("click", () => { detailScale = 1; persistScale(); renderDetail(); });
    c.querySelectorAll(".meat-swap button[data-meat]").forEach(b =>
      b.addEventListener("click", () => {
        detailMeat = (meatSlot && b.dataset.meat === meatSlot.baseKey) ? null : b.dataset.meat;
        renderDetail();
      }));
    c.querySelectorAll(".meat-swap button[data-mcts]").forEach(b =>
      b.addEventListener("click", () => {
        state.settings.mctShare = num(b.dataset.mcts) / 100; save(); renderDetail();
      }));
    c.querySelectorAll(".meat-swap button[data-mctmode]").forEach(b =>
      b.addEventListener("click", () => {
        state.settings.mctMode = b.dataset.mctmode; save(); renderDetail();
      }));

    const actions = el("div", { class: "btn-row" });
    const fav = isFav(rec);
    const favBtn = el("button", { class: "btn secondary" }, (fav ? "★ Favorit (aktiv)" : "☆ Als Favorit"));
    favBtn.addEventListener("click", () => { toggleFav(rec); openRecipeDetail(rec); });
    actions.appendChild(favBtn);
    const editBtn = el("button", { class: "btn" }, rec.custom ? "✏️ Bearbeiten" : "✏️ Zutaten anpassen / tauschen");
    editBtn.addEventListener("click", () => { const r = applyMeatChoice(rec, detailMeat); (rec.custom ? seedComposeFromSaved(r) : seedComposeFromRecipe(r)); closeDetail(); openCompose(); });
    actions.appendChild(editBtn);
    const printBtn = el("button", { class: "btn secondary" }, "🖨️ Rezept drucken");
    printBtn.addEventListener("click", () => printRecipe(rec, res, d, mult));
    actions.appendChild(printBtn);
    if (rec.custom) {
      const delBtn = el("button", { class: "btn ghost" }, "🗑️ Löschen");
      delBtn.addEventListener("click", () => {
        if (confirm("Eigenes Rezept „" + rec.name + "“ wirklich löschen?")) {
          state.savedRecipes = state.savedRecipes.filter(s => s.key !== rec.key);
          const fi = state.favorites.indexOf(rec.key); if (fi !== -1) state.favorites.splice(fi, 1);
          save(); closeDetail(); renderRezepte();
        }
      });
      actions.appendChild(delBtn);
    }
    c.appendChild(actions);
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
    document.body.classList.remove("modal-open");
  }
  function bindDetail() {
    const overlay = document.getElementById("detail-overlay");
    document.getElementById("detail-close").addEventListener("click", closeDetail);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeDetail(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !overlay.hidden) closeDetail(); });
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
    const portionLabel = mult > 1 ? ("Ganzer Tag – " + d.mahl + " Mahlzeiten") : "1 Mahlzeit";
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
      (r === null ? "—" : fmt(r, 2)) + ":1<br>Gesamtmenge ca. " + fmt(totalG, 0) + " g (≈ " + fmt(ml, 0) + " ml)</p>" +
      "<table><thead><tr><th>Lebensmittel</th><th>Menge</th><th>Energie</th></tr></thead><tbody>" + rows +
      "<tr><td>Summe</td><td>" + fmt(totalG, 0) + " g</td><td>" + fmt(sum.kcal, 0) + " kcal</td></tr></tbody></table>" +
      (mult > 1 ? "<p class='sub'>Hinweis: Mengen für den ganzen Tag (×" + d.mahl + "). Die Varoma-/Garzeiten gelten für eine Mahlzeit – bei der größeren Menge länger garen, bis alles weich ist.</p>" : "") +
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
      '<div class="title">🧪 Eigenes Rezept' + (compose.fromRecipe ? " (angepasst)" : " zusammenstellen") + "</div>" +
      '<div class="meta">' + (compose.fromRecipe ? "Basierend auf „" + escapeHtml(compose.fromRecipe) + "“. " : "") +
      "Zutaten und Fett(e) frei wählen – die App berechnet die Mengen für eine Mahlzeit (Verhältnis " +
      fmt(d.ratio, d.ratio % 1 ? 1 : 0) + ":1, Ziel " + fmt(d.kcalMahl, 0) + " kcal).</div>";
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
          '<div class="dstat"><div class="v"><span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + (r === null ? "—" : fmt(r, 2)) + ':1</span></div><div class="l">Verhältnis</div></div>' +
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
    document.body.classList.add("modal-open");
  }
  function closeCompose() {
    document.getElementById("compose-overlay").hidden = true;
    document.body.classList.remove("modal-open");
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
    renderRezepte();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
