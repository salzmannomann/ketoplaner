/* Keto-Rechner — Logik (Portierung aus Keto_Rechner_Final.xlsx)
   Speichert alles lokal im Browser (localStorage). */

(function () {
  "use strict";

  const STORAGE_KEY = "ketoplaner.v1";

  const MEALS = [
    { id: "fruehstueck", label: "Frühstück", icon: "🌅" },
    { id: "snack",       label: "Snack",     icon: "🥨" },
    { id: "mittag",      label: "Mittag",    icon: "🍽️" },
    { id: "nachmittag",  label: "Nachmittag",icon: "☕" },
    { id: "abend",       label: "Abend",     icon: "🌙" },
  ];

  const NAV = [
    { page: "start",         label: "Start",                 icon: "🏠" },
    { page: "einstellungen", label: "Einstellungen",         icon: "⚙️" },
    { sep: true },
    { page: "berechnen",     label: "Mahlzeit berechnen",    icon: "🧮" },
    { page: "korrigieren",   label: "Verhältnis korrigieren",icon: "🛠️" },
    { sep: true },
    ...MEALS.map(m => ({ page: "meal:" + m.id, label: m.label, icon: m.icon })),
    { page: "tag",           label: "Tagesübersicht",        icon: "📊" },
    { sep: true },
    { page: "gespeichert",   label: "Gespeicherte Mahlzeiten", icon: "⭐" },
    { page: "lebensmittel",  label: "Lebensmittel",          icon: "🥗" },
    { page: "daten",         label: "Daten & Sicherung",     icon: "💾" },
  ];

  /* ---------- State ---------- */
  function defaultState() {
    return {
      settings: { name: "", datum: todayISO(), kcal: 1500, ratio: 4, eiweiss: 20, mahlzeiten: 4 },
      meals: { fruehstueck: [], snack: [], mittag: [], nachmittag: [], abend: [] },
      saved: [],
      customFoods: [],
    };
  }

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const d = defaultState();
      return {
        settings: Object.assign(d.settings, parsed.settings || {}),
        meals: Object.assign(d.meals, parsed.meals || {}),
        saved: parsed.saved || [],
        customFoods: parsed.customFoods || [],
      };
    } catch (e) {
      return defaultState();
    }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------- Helpers ---------- */
  function todayISO() {
    const t = new Date();
    return t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate());
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
  function fmt(v, dec) {
    if (v === "" || v === null || v === undefined || !isFinite(v)) return "—";
    const d = dec === undefined ? 1 : dec;
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString("de-DE", {
      minimumFractionDigits: d, maximumFractionDigits: d,
    });
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

  /* ---------- Food database ---------- */
  function allFoods() {
    return FOODS_DEFAULT.concat(state.customFoods);
  }
  let foodIndex = {};
  function rebuildFoodIndex() {
    foodIndex = {};
    allFoods().forEach(f => { foodIndex[f.name] = f; });
  }
  function lookup(name) { return foodIndex[name] || null; }

  // macros for one ingredient line {food, grams}
  function lineMacros(item) {
    const f = lookup(item.food);
    if (!f || item.grams === "" || item.grams === null) {
      return { eiweiss: 0, fett: 0, kh: 0, kcal: 0, valid: false };
    }
    const g = num(item.grams);
    const eiweiss = f.eiweiss * g / 100;
    const fett = f.fett * g / 100;
    const kh = f.kh * g / 100;
    return { eiweiss, fett, kh, kcal: eiweiss * 4 + fett * 9 + kh * 4, valid: true };
  }
  function sumMacros(items) {
    return items.reduce((acc, it) => {
      const m = lineMacros(it);
      acc.eiweiss += m.eiweiss; acc.fett += m.fett; acc.kh += m.kh; acc.kcal += m.kcal;
      return acc;
    }, { eiweiss: 0, fett: 0, kh: 0, kcal: 0 });
  }
  function ratioOf(m) {
    const denom = m.eiweiss + m.kh;
    if (denom === 0) return null;
    return m.fett / denom;
  }

  /* ---------- Derived settings (Einstellungen-Tab Formeln) ---------- */
  function derived() {
    const s = state.settings;
    const kcal = num(s.kcal), ratio = num(s.ratio), eiweiss = num(s.eiweiss);
    const mahl = Math.max(1, num(s.mahlzeiten) || 1);
    const fettTag = ratio * kcal / (9 * ratio + 4);
    const eiweissTag = eiweiss;
    const khTag = kcal / (9 * ratio + 4) - eiweiss;
    return {
      kcal, ratio, eiweiss, mahl,
      fettTag, eiweissTag, khTag,
      fettMahl: fettTag / mahl,
      eiweissMahl: eiweissTag / mahl,
      khMahl: khTag / mahl,
      kcalMahl: kcal / mahl,
    };
  }

  // Ampel class against target ratio
  function ratioClass(actual, target) {
    if (actual === null || !isFinite(actual) || target === 0) return "idle";
    const dev = Math.abs(actual - target) / target;
    if (dev <= 0.05) return "ok";
    if (dev <= 0.15) return "warn";
    return "bad";
  }

  // Status message for a meal/day vs target ratio (mirrors Excel logic)
  function ratioStatus(m, target, ctxEmpty) {
    if (m.eiweiss === 0 && m.fett === 0 && m.kh === 0) {
      return { cls: "idle", text: ctxEmpty || "Noch keine Lebensmittel eingetragen" };
    }
    const denom = m.eiweiss + m.kh;
    const actual = denom === 0 ? null : m.fett / denom;
    const cls = ratioClass(actual, target);
    if (cls === "ok") return { cls: "ok", text: "✅ Alles passt" };
    const fettDiff = target * denom - m.fett; // >0: Fett fehlt
    if (fettDiff > 0) {
      return { cls: cls, text: "❌ Bitte anpassen → +" + Math.round(fettDiff) + " g Fett hinzufügen" };
    }
    return { cls: cls, text: "❌ Bitte anpassen → " + Math.round(-fettDiff) + " g Fett zu viel — etwas weglassen" };
  }

  /* ---------- Routing ---------- */
  function go(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    let target;
    if (page.startsWith("meal:")) {
      const mid = page.split(":")[1];
      target = document.querySelector('.page[data-page="meal"][data-meal="' + mid + '"]');
    } else {
      target = document.querySelector('.page[data-page="' + page + '"]');
    }
    if (!target) { page = "start"; target = document.querySelector('.page[data-page="start"]'); }
    target.classList.add("active");
    document.querySelectorAll(".nav button").forEach(b => {
      b.classList.toggle("active", b.dataset.page === page);
    });
    const mob = document.getElementById("mobileNav");
    if (mob.value !== page) mob.value = page;
    location.hash = page;
    window.scrollTo(0, 0);
    renderActive(page);
  }

  function renderActive(page) {
    if (page === "einstellungen") renderSettings();
    else if (page === "berechnen") renderCalc();
    else if (page === "korrigieren") renderKorr();
    else if (page === "tag") renderDay();
    else if (page.startsWith("meal:")) renderMeal(page.split(":")[1]);
    else if (page === "gespeichert") renderSaved();
    else if (page === "lebensmittel") renderFoods();
  }

  /* ---------- Build nav ---------- */
  function buildNav() {
    const nav = document.getElementById("nav");
    const mob = document.getElementById("mobileNav");
    nav.innerHTML = ""; mob.innerHTML = "";
    NAV.forEach(item => {
      if (item.sep) { nav.appendChild(el("div", { class: "sep" })); return; }
      const b = el("button", { html: '<span class="ico">' + item.icon + "</span><span>" + item.label + "</span>" });
      b.dataset.page = item.page;
      b.addEventListener("click", () => go(item.page));
      nav.appendChild(b);
      const o = el("option", {}, item.icon + " " + item.label);
      o.value = item.page;
      mob.appendChild(o);
    });
    mob.addEventListener("change", () => go(mob.value));
  }

  /* ---------- Food <select> ---------- */
  function foodSelect(value, onChange) {
    const sel = el("select");
    sel.appendChild(el("option", { value: "" }, "— wählen —"));
    const byCat = {};
    allFoods().forEach(f => { (byCat[f.kategorie] = byCat[f.kategorie] || []).push(f); });
    Object.keys(byCat).forEach(cat => {
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

  /* ---------- Einstellungen ---------- */
  function renderSettings() {
    const s = state.settings;
    const $ = id => document.getElementById(id);
    $("set-name").value = s.name || "";
    $("set-datum").value = s.datum || todayISO();
    $("set-kcal").value = s.kcal;
    $("set-ratio").value = s.ratio;
    $("set-eiweiss").value = s.eiweiss;
    $("set-mahlzeiten").value = s.mahlzeiten;

    const d = derived();
    const tag = document.getElementById("stats-tag");
    tag.innerHTML = "";
    stat(tag, "Fett pro Tag", d.fettTag, "g");
    stat(tag, "Eiweiß pro Tag", d.eiweissTag, "g");
    stat(tag, "Kohlenhydrate pro Tag", d.khTag, "g");
    stat(tag, "Kalorien pro Tag", d.kcal, "kcal", 0);

    const mz = document.getElementById("stats-mahlzeit");
    mz.innerHTML = "";
    stat(mz, "Fett pro Mahlzeit", d.fettMahl, "g");
    stat(mz, "Eiweiß pro Mahlzeit", d.eiweissMahl, "g");
    stat(mz, "KH pro Mahlzeit", d.khMahl, "g");
    stat(mz, "Kalorien pro Mahlzeit", d.kcalMahl, "kcal", 0);
  }
  function stat(parent, label, value, unit, dec) {
    const s = el("div", { class: "stat" });
    s.innerHTML = '<div class="v">' + fmt(value, dec === undefined ? 1 : dec) +
      ' <span class="u">' + unit + '</span></div><div class="l">' + label + "</div>";
    parent.appendChild(s);
  }

  function bindSettings() {
    const map = {
      "set-name": "name", "set-datum": "datum", "set-kcal": "kcal",
      "set-ratio": "ratio", "set-eiweiss": "eiweiss", "set-mahlzeiten": "mahlzeiten",
    };
    Object.keys(map).forEach(id => {
      document.getElementById(id).addEventListener("input", e => {
        const key = map[id];
        const v = e.target.value;
        state.settings[key] = (key === "name" || key === "datum") ? v : num(v);
        save();
        renderSettings();
      });
    });
  }

  /* ---------- Mahlzeit berechnen ---------- */
  let calcState = { foods: ["", "", ""], grams: 30 };
  function renderCalc() {
    document.getElementById("calc-grams").value = calcState.grams;
    const tb = document.querySelector("#calc-input tbody");
    tb.innerHTML = "";
    const roles = ["Zutat 1 (Hauptzutat)", "Zutat 2", "Zutat 3"];
    for (let i = 0; i < 3; i++) {
      const f = lookup(calcState.foods[i]);
      const tr = el("tr");
      tr.appendChild(el("td", { class: "name" }, roles[i]));
      const tdSel = el("td", { class: "name" });
      tdSel.appendChild(foodSelect(calcState.foods[i], v => { calcState.foods[i] = v; renderCalc(); }));
      tr.appendChild(tdSel);
      tr.appendChild(el("td", {}, f ? fmt(f.eiweiss) : "—"));
      tr.appendChild(el("td", {}, f ? fmt(f.fett) : "—"));
      tr.appendChild(el("td", {}, f ? fmt(f.kh) : "—"));
      tr.appendChild(el("td", {}, f ? fmt(f.eiweiss * 4 + f.fett * 9 + f.kh * 4, 0) : "—"));
      tb.appendChild(tr);
    }
    computeCalc();
  }

  function computeCalc() {
    const d = derived();
    const ratio = d.ratio, kcalMeal = d.kcalMahl;
    const grams1 = num(calcState.grams);
    const foods = calcState.foods.map(lookup);
    const tb = document.querySelector("#calc-result tbody");
    const statusBox = document.getElementById("calc-status");
    tb.innerHTML = "";

    if (foods.some(f => !f)) {
      tb.appendChild(emptyRow(6, "Wähle 3 Zutaten aus"));
      setStatus(statusBox, "idle", "Wähle 3 Zutaten aus");
      return;
    }

    const a = foods.map(f => f.eiweiss * 4 + f.fett * 9 + f.kh * 4);     // kcal/100g
    const b = foods.map(f => f.fett - ratio * (f.eiweiss + f.kh));        // ratio-residual/100g
    const det = a[1] * b[2] - a[2] * b[1];
    let g = [grams1, null, null];
    let ok = true, reason = "";

    if (Math.abs(det) < 1e-4) {
      ok = false; reason = "❌ Diese Kombination geht nicht — andere Zutat wählen";
    } else {
      const R1 = 100 * kcalMeal - grams1 * a[0];
      const R2 = -grams1 * b[0];
      g[1] = (R1 * b[2] - R2 * a[2]) / det;
      g[2] = (R2 * a[1] - R1 * b[1]) / det;
      if (g[1] < 0 || g[2] < 0) { ok = false; reason = "❌ Negative Mengen — Hauptzutat-Menge ändern"; }
    }

    const sum = { eiweiss: 0, fett: 0, kh: 0, kcal: 0 };
    for (let i = 0; i < 3; i++) {
      const gi = g[i];
      const valid = gi !== null && isFinite(gi);
      const m = valid ? {
        eiweiss: foods[i].eiweiss * gi / 100,
        fett: foods[i].fett * gi / 100,
        kh: foods[i].kh * gi / 100,
      } : { eiweiss: 0, fett: 0, kh: 0 };
      m.kcal = m.eiweiss * 4 + m.fett * 9 + m.kh * 4;
      if (valid && ok) { sum.eiweiss += m.eiweiss; sum.fett += m.fett; sum.kh += m.kh; sum.kcal += m.kcal; }
      const tr = el("tr");
      tr.appendChild(el("td", { class: "name" }, foods[i].name));
      tr.appendChild(el("td", {}, valid ? fmt(gi) : "—"));
      tr.appendChild(el("td", {}, valid ? fmt(m.eiweiss) : "—"));
      tr.appendChild(el("td", {}, valid ? fmt(m.fett) : "—"));
      tr.appendChild(el("td", {}, valid ? fmt(m.kh) : "—"));
      tr.appendChild(el("td", {}, valid ? fmt(m.kcal, 0) : "—"));
      tb.appendChild(tr);
    }
    const trS = el("tr", { class: "sum" });
    trS.appendChild(el("td", { class: "name" }, "Summe"));
    trS.appendChild(el("td", {}, ""));
    trS.appendChild(el("td", {}, ok ? fmt(sum.eiweiss) : "—"));
    trS.appendChild(el("td", {}, ok ? fmt(sum.fett) : "—"));
    trS.appendChild(el("td", {}, ok ? fmt(sum.kh) : "—"));
    trS.appendChild(el("td", {}, ok ? fmt(sum.kcal, 0) : "—"));
    tb.appendChild(trS);

    if (ok) setStatus(statusBox, "ok", "✅ Passt — diese Mengen ergeben dein Verhältnis (" + fmt(ratio, 0) + ":1)");
    else setStatus(statusBox, "bad", reason);
  }

  function bindCalc() {
    document.getElementById("calc-grams").addEventListener("input", e => {
      calcState.grams = num(e.target.value); computeCalc();
    });
  }

  /* ---------- Verhältnis korrigieren ---------- */
  let korrState = { eiweiss: 5, fett: 15, kh: 4 };
  function renderKorr() {
    document.getElementById("korr-eiweiss").value = korrState.eiweiss;
    document.getElementById("korr-fett").value = korrState.fett;
    document.getElementById("korr-kh").value = korrState.kh;
    computeKorr();
  }
  function computeKorr() {
    const d = derived();
    const ratio = d.ratio;
    const E = num(korrState.eiweiss), F = num(korrState.fett), C = num(korrState.kh);
    const denom = E + C;
    const box = document.getElementById("korr-status");
    const butterBox = document.getElementById("korr-butter");
    butterBox.textContent = "";
    if (denom === 0) { setStatus(box, "idle", "Trage Werte ein"); return; }
    const fettDiff = ratio * denom - F; // >0 Fett hinzufügen
    const dev = Math.abs(F / denom - ratio) / ratio;
    if (dev <= 0.05) { setStatus(box, "ok", "✅ Alles passt"); return; }
    if (fettDiff > 0) {
      setStatus(box, "bad", "❌ +" + Math.round(fettDiff) + " g Fett hinzufügen");
      const butter = lookup("Butter") || { fett: 83.2, eiweiss: 0.67, kh: 0.06 };
      const bd = butter.fett - ratio * (butter.eiweiss + butter.kh);
      if (bd > 0) butterBox.textContent = "Entspricht ca. " + fmt(100 * fettDiff / bd, 0) + " g Butter.";
    } else {
      setStatus(box, "bad", "❌ " + Math.round(-fettDiff) + " g Fett weglassen");
    }
  }
  function bindKorr() {
    [["korr-eiweiss", "eiweiss"], ["korr-fett", "fett"], ["korr-kh", "kh"]].forEach(([id, key]) => {
      document.getElementById(id).addEventListener("input", e => { korrState[key] = num(e.target.value); computeKorr(); });
    });
  }

  /* ---------- Mahlzeiten-Tabs ---------- */
  function renderMeal(mid) {
    const meal = MEALS.find(m => m.id === mid);
    const sec = document.querySelector('.page[data-page="meal"][data-meal="' + mid + '"]');
    sec.innerHTML = "";
    sec.appendChild(el("h1", {}, meal.icon + " " + meal.label));
    sec.appendChild(el("p", { class: "subtitle" }, "Trage ein, was zu dieser Mahlzeit gegessen wird."));

    const card = el("div", { class: "card" });
    const wrap = el("div", { class: "tbl-wrap" });
    const table = el("table");
    table.innerHTML = "<thead><tr><th>Lebensmittel</th><th class='col-num'>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th><th class='col-act'></th></tr></thead>";
    const tb = el("tbody");
    table.appendChild(tb);
    wrap.appendChild(table);
    card.appendChild(wrap);

    const items = state.meals[mid];
    function redraw() {
      tb.innerHTML = "";
      items.forEach((it, idx) => {
        const m = lineMacros(it);
        const tr = el("tr");
        const tdSel = el("td", { class: "name" });
        tdSel.appendChild(foodSelect(it.food, v => { it.food = v; save(); redraw(); }));
        tr.appendChild(tdSel);
        const tdG = el("td");
        const inp = el("input", { type: "number", min: "0", step: "1", value: it.grams });
        inp.addEventListener("input", e => { it.grams = e.target.value; save(); redraw(); });
        tdG.appendChild(inp);
        tr.appendChild(tdG);
        tr.appendChild(el("td", {}, m.valid ? fmt(m.eiweiss) : "—"));
        tr.appendChild(el("td", {}, m.valid ? fmt(m.fett) : "—"));
        tr.appendChild(el("td", {}, m.valid ? fmt(m.kh) : "—"));
        tr.appendChild(el("td", {}, m.valid ? fmt(m.kcal, 0) : "—"));
        const tdAct = el("td", { class: "col-act" });
        const del = el("button", { class: "btn ghost", title: "Zeile löschen" }, "✕");
        del.addEventListener("click", () => { items.splice(idx, 1); save(); redraw(); });
        tdAct.appendChild(del);
        tr.appendChild(tdAct);
        tb.appendChild(tr);
      });
      const sum = sumMacros(items);
      const trS = el("tr", { class: "sum" });
      trS.appendChild(el("td", { class: "name" }, "Summe"));
      trS.appendChild(el("td", {}, ""));
      trS.appendChild(el("td", {}, fmt(sum.eiweiss)));
      trS.appendChild(el("td", {}, fmt(sum.fett)));
      trS.appendChild(el("td", {}, fmt(sum.kh)));
      trS.appendChild(el("td", {}, fmt(sum.kcal, 0)));
      trS.appendChild(el("td", {}, ""));
      tb.appendChild(trS);

      const d = derived();
      const st = ratioStatus(sum, d.ratio, "Trage zuerst Lebensmittel und Gramm ein");
      statusEl.className = "";
      setStatus(statusEl, st.cls, st.text + (st.cls === "ok" || st.cls === "idle" ? "" : "  (Ziel " + fmt(d.ratio, 0) + ":1)"));
    }

    const btnRow = el("div", { class: "btn-row" });
    const addBtn = el("button", { class: "btn" }, "+ Zutat hinzufügen");
    addBtn.addEventListener("click", () => { items.push({ food: "", grams: "" }); save(); redraw(); });
    btnRow.appendChild(addBtn);
    const corrBtn = el("button", { class: "btn secondary" }, "Verhältnis korrigieren");
    corrBtn.addEventListener("click", () => go("korrigieren"));
    btnRow.appendChild(corrBtn);
    card.appendChild(btnRow);

    const statusEl = el("div");
    card.appendChild(statusEl);
    sec.appendChild(card);
    sec.appendChild(el("div", { class: "tip" }, "👉 Wenn etwas nicht passt: Tab „Verhältnis korrigieren“ öffnen."));

    if (items.length === 0) items.push({ food: "", grams: "" });
    redraw();
  }

  /* ---------- Tagesübersicht ---------- */
  function renderDay() {
    const d = derived();
    const tb = document.querySelector("#day-table tbody");
    tb.innerHTML = "";
    const total = { eiweiss: 0, fett: 0, kh: 0, kcal: 0 };
    MEALS.forEach(meal => {
      const sum = sumMacros(state.meals[meal.id]);
      total.eiweiss += sum.eiweiss; total.fett += sum.fett; total.kh += sum.kh; total.kcal += sum.kcal;
      const r = ratioOf(sum);
      const tr = el("tr");
      tr.appendChild(el("td", { class: "name" }, meal.icon + " " + meal.label));
      tr.appendChild(el("td", {}, fmt(sum.eiweiss)));
      tr.appendChild(el("td", {}, fmt(sum.fett)));
      tr.appendChild(el("td", {}, fmt(sum.kh)));
      tr.appendChild(el("td", {}, fmt(sum.kcal, 0)));
      const tdR = el("td");
      tdR.innerHTML = r === null ? "—" :
        '<span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmt(r, 2) + "</span>";
      tr.appendChild(tdR);
      tb.appendChild(tr);
    });
    const rTot = ratioOf(total);
    const trT = el("tr", { class: "sum" });
    trT.appendChild(el("td", { class: "name" }, "Gesamt"));
    trT.appendChild(el("td", {}, fmt(total.eiweiss)));
    trT.appendChild(el("td", {}, fmt(total.fett)));
    trT.appendChild(el("td", {}, fmt(total.kh)));
    trT.appendChild(el("td", {}, fmt(total.kcal, 0)));
    const tdRT = el("td");
    tdRT.innerHTML = rTot === null ? "—" :
      '<span class="ratio-pill ' + ratioClass(rTot, d.ratio) + '">' + fmt(rTot, 2) + "</span>";
    trT.appendChild(tdRT);
    tb.appendChild(trT);

    const trG = el("tr", { class: "target" });
    trG.appendChild(el("td", { class: "name" }, "Tagesziel"));
    trG.appendChild(el("td", {}, fmt(d.eiweissTag)));
    trG.appendChild(el("td", {}, fmt(d.fettTag)));
    trG.appendChild(el("td", {}, fmt(d.khTag)));
    trG.appendChild(el("td", {}, fmt(d.kcal, 0)));
    trG.appendChild(el("td", {}, fmt(d.ratio, 0) + ":1"));
    tb.appendChild(trG);

    const box = document.getElementById("day-status");
    if (total.kcal === 0) { setStatus(box, "idle", "Noch keine Mahlzeiten eingetragen"); return; }
    const st = ratioStatus(total, d.ratio);
    setStatus(box, st.cls, st.text);
  }

  /* ---------- Gespeicherte Mahlzeiten ---------- */
  let savedFilter = "all";
  let ketoFilter = "all";

  // Enthält die Zutatenliste KetoCal (egal welche Variante)?
  function hasKetoCal(items) {
    return items.some(it => (it.food || "").toLowerCase().includes("ketocal"));
  }
  // true, wenn die Mahlzeit nach dem KetoCal-Filter angezeigt werden soll
  function passesKeto(items) {
    if (ketoFilter === "ohne") return !hasKetoCal(items);
    if (ketoFilter === "mit") return hasKetoCal(items);
    return true;
  }

  function renderSaved() {
    const recipeList = document.getElementById("recipe-list");
    const list = document.getElementById("saved-list");
    recipeList.innerHTML = "";
    list.innerHTML = "";
    savedFilter = document.getElementById("saved-filter").value;
    ketoFilter = document.getElementById("keto-filter").value;

    // Built-in Sondennahrungs-Rezepte
    if (savedFilter !== "eigene") {
      recipeList.appendChild(el("h2", {}, "🥄 Sondennahrung – Rezepte aus dem Arbeitsblatt"));
      const recipes = RECIPES_SONDE.filter(rec => passesKeto(rec.items));
      if (recipes.length === 0) {
        recipeList.appendChild(el("div", { class: "card empty" },
          ketoFilter === "ohne" ? "Keine Rezepte ohne KetoCal vorhanden." : "Keine Rezepte mit KetoCal vorhanden."));
      } else {
        recipes.forEach(rec => recipeList.appendChild(renderRecipeCard(rec)));
      }
    }

    // Eigene Mahlzeiten
    const visible = state.saved.filter(s => (savedFilter !== "sonde" || s.sonde) && passesKeto(s.items));
    list.appendChild(el("h2", {}, "⭐ Eigene Mahlzeiten"));
    if (visible.length === 0) {
      let msg = "Noch keine eigenen Mahlzeiten. Lege oben eine neue an.";
      if (savedFilter === "sonde") msg = "Keine eigenen Mahlzeiten als Sondennahrung markiert.";
      if (ketoFilter !== "all") msg = "Keine passenden eigenen Mahlzeiten für diesen Filter.";
      list.appendChild(el("div", { class: "card empty" }, msg));
      return;
    }
    const d = derived();
    state.saved.forEach((sm, idx) => {
      if (savedFilter === "sonde" && !sm.sonde) return;
      if (!passesKeto(sm.items)) return;
      const card = el("div", { class: "card" });
      const head = el("div", { class: "saved-meal head" });
      const titleWrap = el("div");
      const sum = sumMacros(sm.items);
      const r = ratioOf(sum);
      titleWrap.innerHTML = '<div class="title"><span class="tname">' + escapeHtml(sm.name || "Ohne Namen") + '</span> <span class="kcbadge"></span></div>' +
        '<div class="meta">' + escapeHtml(sm.typ || "—") + " · " + fmt(sum.kcal, 0) + " kcal · Verhältnis " +
        (r === null ? "—" : fmt(r, 2)) + "</div>";
      head.appendChild(titleWrap);
      const actions = el("div", { class: "btn-row" });
      const loadBtn = el("button", { class: "btn secondary" }, "In Mahlzeit laden");
      loadBtn.addEventListener("click", () => loadSavedIntoMeal(sm));
      actions.appendChild(loadBtn);
      const delBtn = el("button", { class: "btn ghost" }, "Löschen");
      delBtn.addEventListener("click", () => { if (confirm("Mahlzeit wirklich löschen?")) { state.saved.splice(idx, 1); save(); renderSaved(); } });
      actions.appendChild(delBtn);
      head.appendChild(actions);
      card.appendChild(head);

      // editable fields
      const grid = el("div", { class: "grid cols-2" });
      const nameField = el("div");
      nameField.innerHTML = "<label>Name</label>";
      const nameInp = el("input", { type: "text", value: sm.name || "" });
      nameInp.addEventListener("input", e => { sm.name = e.target.value; save(); });
      nameField.appendChild(nameInp);
      grid.appendChild(nameField);
      const typField = el("div");
      typField.innerHTML = "<label>Mahlzeit-Typ</label>";
      const typSel = el("select");
      ["", ...MEALS.map(m => m.label)].forEach(opt => {
        const o = el("option", { value: opt }, opt || "— wählen —");
        if (opt === sm.typ) o.selected = true;
        typSel.appendChild(o);
      });
      typSel.addEventListener("change", e => { sm.typ = e.target.value; save(); });
      typField.appendChild(typSel);
      grid.appendChild(typField);
      card.appendChild(grid);

      const sondeWrap = el("div", { class: "checkrow" });
      const cb = el("input", { type: "checkbox", id: "sonde-" + idx });
      cb.checked = !!sm.sonde;
      cb.addEventListener("change", () => { sm.sonde = cb.checked; save(); if (savedFilter === "sonde") renderSaved(); });
      const lbl = el("label", { for: "sonde-" + idx, class: "inline" }, "Als Sondennahrung markieren");
      sondeWrap.appendChild(cb); sondeWrap.appendChild(lbl);
      card.appendChild(sondeWrap);

      const wrap = el("div", { class: "tbl-wrap" });
      wrap.style.marginTop = "12px";
      const table = el("table");
      table.innerHTML = "<thead><tr><th>Lebensmittel</th><th class='col-num'>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th><th class='col-act'></th></tr></thead>";
      const tb = el("tbody");
      table.appendChild(tb);
      function redraw() {
        tb.innerHTML = "";
        sm.items.forEach((it, i) => {
          const m = lineMacros(it);
          const tr = el("tr");
          const tdSel = el("td", { class: "name" });
          tdSel.appendChild(foodSelect(it.food, v => { it.food = v; save(); redraw(); }));
          tr.appendChild(tdSel);
          const tdG = el("td");
          const inp = el("input", { type: "number", min: "0", step: "1", value: it.grams });
          inp.addEventListener("input", e => { it.grams = e.target.value; save(); redraw(); });
          tdG.appendChild(inp);
          tr.appendChild(tdG);
          tr.appendChild(el("td", {}, m.valid ? fmt(m.eiweiss) : "—"));
          tr.appendChild(el("td", {}, m.valid ? fmt(m.fett) : "—"));
          tr.appendChild(el("td", {}, m.valid ? fmt(m.kh) : "—"));
          tr.appendChild(el("td", {}, m.valid ? fmt(m.kcal, 0) : "—"));
          const tdAct = el("td", { class: "col-act" });
          const del = el("button", { class: "btn ghost" }, "✕");
          del.addEventListener("click", () => { sm.items.splice(i, 1); save(); redraw(); });
          tdAct.appendChild(del);
          tr.appendChild(tdAct);
          tb.appendChild(tr);
        });
        const sum2 = sumMacros(sm.items);
        const r2 = ratioOf(sum2);
        const trS = el("tr", { class: "sum" });
        trS.appendChild(el("td", { class: "name" }, "Summe"));
        trS.appendChild(el("td", {}, ""));
        trS.appendChild(el("td", {}, fmt(sum2.eiweiss)));
        trS.appendChild(el("td", {}, fmt(sum2.fett)));
        trS.appendChild(el("td", {}, fmt(sum2.kh)));
        trS.appendChild(el("td", {}, fmt(sum2.kcal, 0)));
        const tdr = el("td");
        tdr.innerHTML = r2 === null ? "" : '<span class="ratio-pill ' + ratioClass(r2, d.ratio) + '">' + fmt(r2, 2) + "</span>";
        trS.appendChild(tdr);
        tb.appendChild(trS);
        titleWrap.querySelector(".meta").textContent =
          (sm.typ || "—") + " · " + fmt(sum2.kcal, 0) + " kcal · Verhältnis " + (r2 === null ? "—" : fmt(r2, 2));
        titleWrap.querySelector(".tname").textContent = sm.name || "Ohne Namen";
        titleWrap.querySelector(".kcbadge").innerHTML = sm.items.length && sm.items.some(it => it.food)
          ? (hasKetoCal(sm.items) ? '<span class="badge keto">mit KetoCal</span>' : '<span class="badge noketo">ohne KetoCal</span>')
          : "";
      }
      wrap.appendChild(table);
      card.appendChild(wrap);
      const addBtn = el("button", { class: "btn", html: "+ Zutat" });
      addBtn.style.marginTop = "10px";
      addBtn.addEventListener("click", () => { sm.items.push({ food: "", grams: "" }); save(); redraw(); });
      card.appendChild(addBtn);
      list.appendChild(card);
      redraw();
    });
  }

  /* Dynamische Rezept-Anpassung
     Jedes Rezept wird automatisch auf das in den Einstellungen gewählte
     Keto-Verhältnis umgerechnet (die Fett-Zutat Butter/Öl/Sahne wird
     angepasst). Die Portion (Kalorien) ist zusätzlich einstellbar.
     Diese Einstellung wird nicht gespeichert (rein zur Ansicht). */
  const recipeAdjust = {}; // name -> {kcal:""}
  function round1(v) { return Math.round(v * 10) / 10; }

  // Index der reinen Fett-Zutat (höchster Fettanteil, fettdominant)
  function fatItemIndex(items) {
    let idx = -1, best = -1;
    items.forEach((it, i) => {
      const f = lookup(it.food);
      if (f && f.fett >= 50 && (f.eiweiss + f.kh) < f.fett && f.fett > best) { best = f.fett; idx = i; }
    });
    return idx;
  }

  // Rechnet ein Rezept automatisch auf das eingestellte Verhältnis um.
  // targetKcal optional (sonst Original-Kalorien). Liefert {items, ratio, kcal, ok, fatIndex, note}
  function computeAdjustedRecipe(rec, targetKcal) {
    const base = rec.items.map(it => ({ food: it.food, grams: num(it.grams) }));
    const baseSum = sumMacros(base);
    const T = (targetKcal && targetKcal > 0) ? targetKcal : baseSum.kcal;

    const fi = fatItemIndex(base);
    if (fi < 0) {
      // Ohne reines Fett kann das Verhältnis nicht angepasst werden — nur skalieren
      const s = baseSum.kcal > 0 ? T / baseSum.kcal : 1;
      const items = base.map(it => ({ food: it.food, grams: round1(it.grams * s) }));
      const sum = sumMacros(items);
      return { items, ratio: ratioOf(sum), kcal: sum.kcal, ok: false, fatIndex: -1, note: "Kein reines Fett (Butter/Öl/Sahne) im Rezept — Verhältnis kann nicht automatisch angepasst werden." };
    }

    const fat = lookup(base[fi].food);
    let Pn = 0, Fn = 0, Cn = 0;
    base.forEach((it, i) => {
      if (i === fi) return;
      const f = lookup(it.food); if (!f) return;
      Pn += f.eiweiss * it.grams / 100; Fn += f.fett * it.grams / 100; Cn += f.kh * it.grams / 100;
    });
    const ratio = derived().ratio;
    const fp = fat.eiweiss, ff = fat.fett, fc = fat.kh;
    const A = Fn - ratio * (Pn + Cn);
    const B = (ff - ratio * (fp + fc)) / 100;
    const Kn = 4 * Pn + 9 * Fn + 4 * Cn;
    const kf = 4 * fp + 9 * ff + 4 * fc;

    let x, s;
    if (Math.abs(A) < 1e-9) { x = 0; s = Kn > 0 ? T / Kn : 1; }
    else {
      const denom = kf / 100 - B * Kn / A;
      if (Math.abs(denom) < 1e-9) return { items: base, ratio: ratioOf(baseSum), kcal: baseSum.kcal, ok: false, fatIndex: fi, note: "Verhältnis mit dieser Zutat nicht erreichbar." };
      x = T / denom;
      s = -x * B / A;
    }
    if (x < 0 || s <= 0) return { items: base, ratio: ratioOf(baseSum), kcal: baseSum.kcal, ok: false, fatIndex: fi, note: "Verhältnis " + fmt(ratio, 0) + ":1 mit diesem Rezept nicht erreichbar." };

    const items = base.map((it, i) => i === fi
      ? { food: it.food, grams: round1(x) }
      : { food: it.food, grams: round1(it.grams * s) });
    const sum = sumMacros(items);
    return { items, ratio: ratioOf(sum), kcal: sum.kcal, ok: true, fatIndex: fi };
  }

  // Karte für ein fest hinterlegtes Rezept (automatisch ans Verhältnis angepasst)
  function renderRecipeCard(rec) {
    const card = el("div", { class: "card" });
    if (!recipeAdjust[rec.name]) recipeAdjust[rec.name] = { kcal: "" };
    const opts = recipeAdjust[rec.name];
    const targetRatio = derived().ratio;

    const head = el("div", { class: "saved-meal head" });
    const titleWrap = el("div");
    head.appendChild(titleWrap);
    card.appendChild(head);

    // Original-Werte (laut Arbeitsblatt) als Referenz
    const baseItems = rec.items.map(it => ({ food: it.food, grams: num(it.grams) }));
    const baseSum = sumMacros(baseItems);
    const baseRatio = ratioOf(baseSum);
    const subInfo = el("div", { class: "meta-sub" },
      "Automatisch auf " + fmt(targetRatio, 0) + ":1 angepasst · Arbeitsblatt-Original: " +
      fmt(baseSum.kcal, 0) + " kcal / " + (baseRatio === null ? "—" : fmt(baseRatio, 2)) + ":1");

    const wrap = el("div", { class: "tbl-wrap" });
    const table = el("table");
    table.innerHTML = "<thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead>";
    const tb = el("tbody");
    table.appendChild(tb);
    wrap.appendChild(table);

    // Bedienfeld: nur Portionsgröße
    const panel = el("div", { class: "adjust" });
    const kcalField = el("div", { class: "adjust-field" });
    kcalField.innerHTML = "<label class='inline'>Portion (kcal)</label>";
    const kcalInp = el("input", { type: "number", min: "0", step: "10", placeholder: fmt(baseSum.kcal, 0) });
    kcalInp.value = opts.kcal;
    kcalField.appendChild(kcalInp);
    panel.appendChild(kcalField);
    const resetBtn = el("button", { class: "btn ghost" }, "Standard-Portion");
    panel.appendChild(resetBtn);

    const noteBox = el("div", { class: "adjust-note" });

    // actions
    const actions = el("div", { class: "btn-row" });
    const mealSel = el("select");
    mealSel.style.maxWidth = "180px";
    MEALS.forEach(m => mealSel.appendChild(el("option", { value: m.id }, m.icon + " " + m.label)));
    const loadBtn = el("button", { class: "btn" }, "In Mahlzeit laden");
    const copyBtn = el("button", { class: "btn secondary" }, "Als eigene Mahlzeit kopieren");
    actions.appendChild(mealSel); actions.appendChild(loadBtn); actions.appendChild(copyBtn);

    let current = { items: rec.items, fatIndex: -1 };

    function redraw() {
      const res = computeAdjustedRecipe(rec, opts.kcal);
      current = res;
      const items = res.items;
      tb.innerHTML = "";
      items.forEach((it, i) => {
        const m = lineMacros(it);
        const tr = el("tr");
        if (i === res.fatIndex) tr.className = "fatrow";
        tr.appendChild(el("td", { class: "name" }, it.food + (i === res.fatIndex ? " ⟵ Fett angepasst" : "")));
        tr.appendChild(el("td", {}, fmt(it.grams, it.grams < 10 ? 1 : 0)));
        tr.appendChild(el("td", {}, fmt(m.eiweiss)));
        tr.appendChild(el("td", {}, fmt(m.fett)));
        tr.appendChild(el("td", {}, fmt(m.kh)));
        tr.appendChild(el("td", {}, fmt(m.kcal, 0)));
        tb.appendChild(tr);
      });
      const sum = sumMacros(items);
      const r = ratioOf(sum);
      const trS = el("tr", { class: "sum" });
      trS.appendChild(el("td", { class: "name" }, "Summe"));
      trS.appendChild(el("td", {}, ""));
      trS.appendChild(el("td", {}, fmt(sum.eiweiss)));
      trS.appendChild(el("td", {}, fmt(sum.fett)));
      trS.appendChild(el("td", {}, fmt(sum.kh)));
      trS.appendChild(el("td", {}, fmt(sum.kcal, 0)));
      tb.appendChild(trS);

      const ketoBadge = hasKetoCal(items)
        ? '<span class="badge keto">mit KetoCal</span>'
        : '<span class="badge noketo">ohne KetoCal</span>';
      titleWrap.innerHTML =
        '<div class="title">' + escapeHtml(rec.name) +
        ' <span class="badge">Sondennahrung</span>' + ketoBadge + '</div>' +
        '<div class="meta">' + fmt(sum.kcal, 0) + " kcal · Eiweiß " + fmt(sum.eiweiss) +
        " g · Fett " + fmt(sum.fett) + " g · KH " + fmt(sum.kh) +
        " g · Verhältnis " + (r === null ? "—" : fmt(r, 2)) + ":1</div>";

      noteBox.textContent = (!res.ok && res.note) ? "⚠️ " + res.note : "";
      resetBtn.style.display = (opts.kcal && opts.kcal > 0) ? "" : "none";
    }

    kcalInp.addEventListener("input", () => { opts.kcal = num(kcalInp.value); redraw(); });
    resetBtn.addEventListener("click", () => { opts.kcal = ""; kcalInp.value = ""; redraw(); });
    loadBtn.addEventListener("click", () => loadItemsIntoMeal(current.items, mealSel.value));
    copyBtn.addEventListener("click", () => {
      state.saved.unshift({
        name: rec.name + " (" + fmt(targetRatio, 0) + ":1)",
        typ: "", sonde: true,
        items: current.items.map(it => ({ food: it.food, grams: it.grams })),
      });
      save(); renderSaved();
    });

    card.appendChild(subInfo);
    card.appendChild(wrap);
    card.appendChild(panel);
    card.appendChild(noteBox);
    if (rec.zubereitung) {
      const z = el("div", { class: "prep" });
      z.innerHTML = "<strong>Zubereitung</strong><br>" + escapeHtml(rec.zubereitung);
      card.appendChild(z);
    }
    card.appendChild(actions);
    redraw();
    return card;
  }

  function loadItemsIntoMeal(items, mealId) {
    state.meals[mealId] = items.map(it => ({ food: it.food, grams: it.grams }));
    save();
    go("meal:" + mealId);
  }

  function loadSavedIntoMeal(sm) {
    const mid = (MEALS.find(m => m.label === sm.typ) || MEALS[0]).id;
    loadItemsIntoMeal(sm.items, mid);
  }

  /* ---------- Lebensmittel ---------- */
  function renderFoods() {
    const filterSel = document.getElementById("lm-filter");
    if (!filterSel.dataset.built) {
      filterSel.innerHTML = "";
      const cats = Array.from(new Set(allFoods().map(f => f.kategorie)));
      filterSel.appendChild(el("option", { value: "" }, "Alle Kategorien"));
      cats.forEach(c => filterSel.appendChild(el("option", { value: c }, c)));
      filterSel.dataset.built = "1";
    }
    drawFoodTable();
  }
  function drawFoodTable() {
    const q = (document.getElementById("lm-search").value || "").toLowerCase();
    const cat = document.getElementById("lm-filter").value;
    const tb = document.querySelector("#lm-table tbody");
    tb.innerHTML = "";
    const customNames = new Set(state.customFoods.map(f => f.name));
    const rows = allFoods().filter(f =>
      (!cat || f.kategorie === cat) && (!q || f.name.toLowerCase().includes(q) || (f.kategorie || "").toLowerCase().includes(q))
    );
    rows.forEach(f => {
      const tr = el("tr");
      tr.appendChild(el("td", { class: "name" }, f.kategorie || ""));
      tr.appendChild(el("td", { class: "name" }, f.name + (customNames.has(f.name) ? " ✎" : "")));
      tr.appendChild(el("td", {}, fmt(f.eiweiss)));
      tr.appendChild(el("td", {}, fmt(f.fett)));
      tr.appendChild(el("td", {}, fmt(f.kh)));
      tr.appendChild(el("td", {}, fmt(f.eiweiss * 4 + f.fett * 9 + f.kh * 4, 0)));
      const tdAct = el("td", { class: "col-act" });
      if (customNames.has(f.name)) {
        const del = el("button", { class: "btn ghost", title: "Eigenes Lebensmittel löschen" }, "✕");
        del.addEventListener("click", () => {
          state.customFoods = state.customFoods.filter(c => c.name !== f.name);
          rebuildFoodIndex(); save(); drawFoodTable();
        });
        tdAct.appendChild(del);
      }
      tr.appendChild(tdAct);
      tb.appendChild(tr);
    });
    document.getElementById("lm-count").textContent = rows.length + " von " + allFoods().length + " Lebensmitteln";
  }
  function bindFoods() {
    document.getElementById("lm-search").addEventListener("input", drawFoodTable);
    document.getElementById("lm-filter").addEventListener("change", drawFoodTable);
    document.getElementById("lm-add").addEventListener("click", () => {
      const name = document.getElementById("lm-name").value.trim();
      if (!name) { alert("Bitte einen Namen eingeben."); return; }
      if (foodIndex[name]) { alert("Ein Lebensmittel mit diesem Namen existiert bereits."); return; }
      state.customFoods.push({
        kategorie: document.getElementById("lm-kat").value.trim() || "Eigene",
        name: name,
        pro: 100,
        eiweiss: num(document.getElementById("lm-eiweiss").value),
        fett: num(document.getElementById("lm-fett").value),
        kh: num(document.getElementById("lm-kh").value),
        cholesterin: num(document.getElementById("lm-chol").value),
        natrium: num(document.getElementById("lm-natrium").value),
        ballaststoffe: num(document.getElementById("lm-ballast").value),
      });
      rebuildFoodIndex(); save();
      ["lm-name", "lm-eiweiss", "lm-fett", "lm-kh", "lm-chol", "lm-natrium", "lm-ballast"].forEach(id => document.getElementById(id).value = "");
      document.getElementById("lm-filter").dataset.built = "";
      renderFoods();
    });
  }

  /* ---------- Daten ---------- */
  function bindData() {
    document.getElementById("data-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: "keto-rechner-daten.json" });
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });
    document.getElementById("data-import-btn").addEventListener("click", () => document.getElementById("data-import").click());
    document.getElementById("data-import").addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          state = Object.assign(defaultState(), obj);
          rebuildFoodIndex(); save();
          alert("Daten erfolgreich importiert.");
          go("start");
        } catch (err) { alert("Datei konnte nicht gelesen werden."); }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
    document.getElementById("data-reset").addEventListener("click", () => {
      if (confirm("Wirklich ALLE Daten zurücksetzen? Das kann nicht rückgängig gemacht werden.")) {
        state = defaultState(); rebuildFoodIndex(); save(); go("start");
      }
    });
  }

  /* ---------- Saved: add ---------- */
  function bindSaved() {
    document.getElementById("add-saved").addEventListener("click", () => {
      state.saved.unshift({ name: "Neue Mahlzeit", typ: "Frühstück", sonde: false, items: [{ food: "", grams: "" }] });
      if (document.getElementById("saved-filter").value === "sonde") document.getElementById("saved-filter").value = "all";
      save(); renderSaved();
    });
    document.getElementById("saved-filter").addEventListener("change", renderSaved);
    document.getElementById("keto-filter").addEventListener("change", renderSaved);
  }

  /* ---------- shared ---------- */
  function setStatus(box, cls, text) {
    box.innerHTML = '<div class="status ' + cls + '">' + escapeHtml(text) + "</div>";
  }
  function emptyRow(cols, text) {
    const tr = el("tr");
    const td = el("td", { class: "empty", colspan: cols }, text);
    td.style.textAlign = "left";
    tr.appendChild(td);
    return tr;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------- init ---------- */
  function init() {
    rebuildFoodIndex();
    buildNav();
    bindSettings();
    bindCalc();
    bindKorr();
    bindSaved();
    bindFoods();
    bindData();
    document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => go(b.dataset.goto)));
    const start = (location.hash || "#start").slice(1);
    go(start || "start");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
