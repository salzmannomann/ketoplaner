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
      settings: { kcal: 700, ratio: 1.8, mahlzeiten: 5, eiweiss: 20, weight: 8, proteinPerKg: 1.5, ketocal: "ohne", filter: "alle", sort: "kategorie" },
      compose: { items: [{ food: "", grams: 60 }], fats: [{ food: "Schlagobers NÖM", share: 100 }], scale: true },
      favorites: [],
      savedRecipes: [],
    };
  }
  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const p = JSON.parse(raw), d = defaultState();
      return {
        settings: Object.assign(d.settings, p.settings || {}),
        compose: Object.assign(d.compose, p.compose || {}),
        favorites: p.favorites || [],
        savedRecipes: p.savedRecipes || [],
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
  function rebuildFoodIndex() { foodIndex = {}; FOODS_DEFAULT.forEach(f => { foodIndex[f.name] = f; }); }
  function lookup(name) { return foodIndex[name] || null; }

  function lineMacros(item) {
    const f = lookup(item.food);
    if (!f || item.grams === "" || item.grams === null) return { eiweiss: 0, fett: 0, kh: 0, kcal: 0, valid: false };
    const g = num(item.grams);
    const eiweiss = f.eiweiss * g / 100, fett = f.fett * g / 100, kh = f.kh * g / 100;
    return { eiweiss, fett, kh, kcal: eiweiss * 4 + fett * 9 + kh * 4, valid: true };
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
    return { fleisch, fisch, obst, veg: !fleisch && !fisch };
  }
  function matchesFilter(rec, filter) {
    const t = recipeTags(rec);
    switch (filter) {
      case "fleisch": return t.fleisch;
      case "fisch": return t.fisch;
      case "vegetarisch": return t.veg;
      case "obst": return t.obst;
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
    return { kcal, ratio, mahl, eiweiss, autoProtein, kcalMahl: kcal / mahl, eiweissMahl: eiweiss / mahl };
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
    let Pn = 0, Fn = 0, Cn = 0;
    base.forEach((it, i) => {
      if (i === fi) return;
      const f = lookup(it.food); if (!f) return;
      Pn += f.eiweiss * it.grams / 100; Fn += f.fett * it.grams / 100; Cn += f.kh * it.grams / 100;
    });
    const fp = fat.eiweiss, ff = fat.fett, fc = fat.kh;
    const A = Fn - ratio * (Pn + Cn);
    const B = (ff - ratio * (fp + fc)) / 100;
    const Kn = 4 * Pn + 9 * Fn + 4 * Cn;
    const kf = 4 * fp + 9 * ff + 4 * fc;
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

  /* ---------- Fleisch-Tausch ----------
     Diätologin: 20 g Huhn ≙ 30 g Rind(erhack/Faschiertes) ≙ 18 g Pute.
     Faktoren relativ zu Huhn. Die Fleischmenge eines Rezepts wird in
     „Huhn-Äquivalent" umgerechnet und auf das gewählte Fleisch angepasst.
     Der Rest des Rezepts (v. a. das Fett) wird wie immer automatisch nachgerechnet. */
  const MEATS = {
    huhn: { food: "Hühnerbrust ohne Haut", factor: 1.0, label: "Huhn", icon: "🍗", word: "Hendl" },
    rind: { food: "Rindfleisch (mager)", factor: 1.5, label: "Rind", icon: "🥩", word: "Rindfleisch" },
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
    $("set-proteinmode").value = String(s.proteinPerKg || 0);
    document.querySelectorAll("#ketocal-seg button").forEach(b =>
      b.classList.toggle("active", b.dataset.val === (s.ketocal || "ohne")));

    const d = derived();
    $("set-eiweiss").value = d.autoProtein ? d.eiweiss : s.eiweiss;
    $("set-eiweiss").disabled = d.autoProtein;
    const warn = (s.ketocal || "ohne") !== "mit";
    $("permeal").innerHTML =
      '<div class="permeal-main">' + fmt(d.kcalMahl, 0) + ' <span class="u">kcal pro Mahlzeit</span></div>' +
      '<div class="permeal-sub">' + fmt(d.kcal, 0) + " kcal/Tag ÷ " + d.mahl + " Mahlzeiten · Verhältnis " +
      fmt(d.ratio, d.ratio % 1 ? 1 : 0) + ":1 · Eiweiß-Ziel ca. " + fmt(d.eiweissMahl) + " g/Mahlzeit" +
      (d.autoProtein ? " (" + fmt(d.eiweiss, 0) + " g/Tag, automatisch nach Gewicht)" : "") + "</div>";
    if (warn) {
      const ib = el("button", { class: "info-toggle" + (infoOpen ? " on" : ""), title: "Hinweis ohne KetoCal ein-/ausblenden" }, "ⓘ");
      ib.addEventListener("click", () => {
        infoOpen = !infoOpen;
        $("info-note").hidden = !infoOpen;
        ib.classList.toggle("on", infoOpen);
      });
      $("permeal").appendChild(ib);
    }

    // Schnellfilter-Chips
    const filter = s.filter || "alle";
    const fb = $("filter-bar");
    fb.innerHTML = "";
    const chips = el("div", { class: "chips" });
    FILTERS.forEach(f => {
      const chip = el("button", { class: "chip" + (f.id === filter ? " active" : "") }, f.label);
      chip.addEventListener("click", () => { state.settings.filter = f.id; save(); renderRezepte(); });
      chips.appendChild(chip);
    });
    fb.appendChild(chips);

    const mode = s.ketocal || "ohne";
    const recipes = allRecipes()
      .filter(r => mode === "alle" ? true : (mode === "ohne" ? !r.ketocal : r.ketocal))
      .filter(r => matchesFilter(r, filter))
      .map(rec => ({ rec, res: computeAdjustedRecipe(rec, d.kcalMahl, d.ratio) }))
      .filter(x => x.res.ok);

    $("info-note").innerHTML = (mode === "mit") ? "" :
      '<div class="diet-note">⚠️ <strong>Wichtig:</strong> Rezepte ohne KetoCal liefern keine vollständigen Vitamine und Mineralstoffe. Diese müssen separat ergänzt werden — bitte mit dem Behandlungsteam abstimmen.</div>';
    $("info-note").hidden = !(warn && infoOpen);

    $("recipe-count").textContent =
      recipes.length + " Rezept" + (recipes.length === 1 ? "" : "e") +
      (mode === "ohne" ? " ohne KetoCal" : mode === "mit" ? " mit KetoCal" : "");

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
    const map = { "set-kcal": "kcal", "set-mahlzeiten": "mahlzeiten", "set-ratio": "ratio", "set-eiweiss": "eiweiss", "set-weight": "weight" };
    Object.keys(map).forEach(id => {
      document.getElementById(id).addEventListener("input", e => {
        state.settings[map[id]] = num(e.target.value); save(); renderRezepte();
      });
    });
    document.getElementById("set-proteinmode").addEventListener("change", e => {
      state.settings.proteinPerKg = num(e.target.value); save(); renderRezepte();
    });
    document.querySelectorAll("#ketocal-seg button").forEach(b => {
      b.addEventListener("click", () => { state.settings.ketocal = b.dataset.val; save(); renderRezepte(); });
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
  let detailRec = null, detailPortion = "meal", detailMeat = null; // detailMeat: temporäre Fleischwahl
  function openRecipeDetail(rec) {
    detailRec = rec; detailPortion = "meal"; detailMeat = null;
    renderDetail();
    const overlay = document.getElementById("detail-overlay");
    overlay.hidden = false;
    document.body.classList.add("modal-open");
  }
  function renderDetail() {
    const rec = detailRec;
    const d = derived();
    const res = computeAdjustedRecipe(applyMeatChoice(rec, detailMeat), d.kcalMahl, d.ratio);
    const mult = detailPortion === "day" ? d.mahl : 1;
    const items = res.items;
    const sumPer = sumMacros(items);
    const sum = { eiweiss: sumPer.eiweiss * mult, fett: sumPer.fett * mult, kh: sumPer.kh * mult, kcal: sumPer.kcal * mult };
    const r = ratioOf(sumPer);
    const totalG = items.reduce((a, it) => a + num(it.grams), 0) * mult;
    const ml = volumeMl(items) * mult;
    const proteinTarget = mult > 1 ? d.eiweiss : d.eiweissMahl;
    const proteinOk = sum.eiweiss >= proteinTarget * 0.9;

    const ketoBadge = rec.ketocal
      ? '<span class="badge keto">mit KetoCal</span>'
      : '<span class="badge noketo">ohne KetoCal</span>';

    const meatSlot = recipeMeatSlot(rec);
    let meatSeg = "";
    if (meatSlot) {
      const cur = detailMeat || meatSlot.baseKey;
      meatSeg = '<div class="meat-swap"><div class="seg-label">🍖 Fleisch tauschen</div><div class="segmented mini">' +
        ["huhn", "rind", "pute"].map(k =>
          '<button type="button" data-meat="' + k + '"' + (k === cur ? ' class="active"' : "") + ">" +
          MEATS[k].icon + " " + MEATS[k].label + "</button>"
        ).join("") +
        '</div><div class="meat-note">20 g Huhn ≙ 30 g Rind ≙ 18 g Pute – die Menge wird automatisch umgerechnet, das Fett neu berechnet.</div></div>';
    }

    let rows = "";
    items.forEach((it, i) => {
      const g = num(it.grams) * mult;
      const m = lineMacros({ food: it.food, grams: g });
      rows += "<tr" + (i === res.fatIndex ? ' class="fatrow"' : "") + "><td class='name'>" +
        escapeHtml(it.food) + (i === res.fatIndex ? " ⟵ Fett angepasst" : "") + "</td><td>" +
        fmt(g, g < 10 ? 1 : 0) + "</td><td>" + fmt(m.eiweiss) + "</td><td>" +
        fmt(m.fett) + "</td><td>" + fmt(m.kh) + "</td><td>" + fmt(m.kcal, 0) + "</td></tr>";
    });

    const portionLabel = mult > 1 ? ("Ganzer Tag (" + d.mahl + " Mahlzeiten)") : "1 Mahlzeit";
    const c = document.getElementById("detail-content");
    c.innerHTML =
      '<div class="detail-head"><span class="detail-icon">' + (rec.icon || "🥑") + "</span>" +
        '<div><div class="title">' + escapeHtml(rec.name) + " " + ketoBadge + "</div>" +
        '<div class="meta">Verhältnis <span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' +
        (r === null ? "—" : fmt(r, 2)) + ":1</span> · zeigt: " + portionLabel + "</div></div></div>" +
      '<div class="seg-portion"><div class="segmented mini">' +
        '<button type="button" data-p="meal"' + (mult === 1 ? ' class="active"' : "") + ">1 Mahlzeit</button>" +
        '<button type="button" data-p="day"' + (mult > 1 ? ' class="active"' : "") + ">Ganzer Tag (×" + d.mahl + ")</button>" +
      "</div></div>" +
      meatSeg +
      '<div class="detail-tiles">' +
        '<div class="dstat"><div class="v">' + fmt(sum.kcal, 0) + '</div><div class="l">kcal</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(totalG, 0) + ' g</div><div class="l">Menge</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(ml, 0) + ' ml</div><div class="l">Volumen</div></div>' +
        '<div class="dstat ' + (proteinOk ? "" : "warn") + '"><div class="v">' + fmt(sum.eiweiss) + ' g</div><div class="l">Eiweiß (Ziel ' + fmt(proteinTarget) + ' g)</div></div>' +
      "</div>" +
      (!proteinOk ? '<div class="adjust-note">⚠️ Liegt unter dem Eiweiß-Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
      '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' +
        rows +
        "<tr class='sum'><td class='name'>Summe</td><td>" + fmt(totalG, 0) + "</td><td>" + fmt(sum.eiweiss) + "</td><td>" +
        fmt(sum.fett) + "</td><td>" + fmt(sum.kh) + "</td><td>" + fmt(sum.kcal, 0) + "</td></tr>" +
      "</tbody></table></div>" +
      (mult > 1 ? '<div class="adjust-note">ℹ️ Mengen für den ganzen Tag (×' + d.mahl + '). Die Thermomix-Zeiten unten gelten für <strong>eine</strong> Mahlzeit – bei der größeren Menge entsprechend länger garen, bis alles weich ist, und ggf. in mehreren Portionen pürieren.</div>' : "") +
      (rec.thermomix ? '<div class="prep thermomix"><strong>🤖 Zubereitung mit Thermomix TM5</strong><br>' + escapeHtml(adaptPrep(rec.thermomix, rec, detailMeat)) + "</div>" : "") +
      (rec.zubereitung ? '<div class="prep"><strong>Zubereitung (klassisch)</strong><br>' + escapeHtml(adaptPrep(rec.zubereitung, rec, detailMeat)) + "</div>" : "");

    c.querySelectorAll(".seg-portion button").forEach(b =>
      b.addEventListener("click", () => { detailPortion = b.dataset.p; renderDetail(); }));
    c.querySelectorAll(".meat-swap button[data-meat]").forEach(b =>
      b.addEventListener("click", () => {
        detailMeat = (meatSlot && b.dataset.meat === meatSlot.baseKey) ? null : b.dataset.meat;
        renderDetail();
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
      return "<tr><td>" + escapeHtml(it.food) + "</td><td>" + fmt(g, g < 10 ? 1 : 0) +
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
      (mult > 1 ? "<p class='sub'>Hinweis: Mengen für den ganzen Tag (×" + d.mahl + "). Die Thermomix-Zeiten gelten für eine Mahlzeit – bei der größeren Menge länger garen, bis alles weich ist.</p>" : "") +
      (rec.thermomix ? "<div class='prep'><strong>Zubereitung mit Thermomix TM5</strong>" + escapeHtml(adaptPrep(rec.thermomix, rec, detailMeat)) + "</div>" : "") +
      (rec.zubereitung ? "<div class='prep'><strong>Zubereitung (klassisch)</strong>" + escapeHtml(adaptPrep(rec.zubereitung, rec, detailMeat)) + "</div>" : "") +
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
          (it.isFat ? " ⟵ Fett (berechnet)" : "") + "</td><td>" + fmt(it.grams, it.grams < 10 ? 1 : 0) +
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
