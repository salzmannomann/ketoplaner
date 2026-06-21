/* Keto-Sondennahrung — Logik
   Ausschließlich auf ketogene Sondennahrung ausgelegt.
   Speichert alle Eingaben lokal im Browser (localStorage). */

(function () {
  "use strict";

  const STORAGE_KEY = "ketoplaner.v2";

  const NAV = [
    { page: "rezepte",      label: "Rezepte",          icon: "🥄" },
    { page: "lebensmittel", label: "Lebensmittel",     icon: "🥗" },
    { page: "daten",        label: "Daten & Sicherung", icon: "💾" },
  ];

  /* ---------- State ---------- */
  function defaultState() {
    return {
      settings: { kcal: 1500, ratio: 1.8, mahlzeiten: 4, ketocal: "ohne" },
      customFoods: [],
    };
  }
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const p = JSON.parse(raw);
      const d = defaultState();
      return {
        settings: Object.assign(d.settings, p.settings || {}),
        customFoods: p.customFoods || [],
      };
    } catch (e) { return defaultState(); }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

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

  /* ---------- Lebensmittel ---------- */
  function allFoods() { return FOODS_DEFAULT.concat(state.customFoods); }
  let foodIndex = {};
  function rebuildFoodIndex() { foodIndex = {}; allFoods().forEach(f => { foodIndex[f.name] = f; }); }
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

  /* ---------- Einstellungen / abgeleitete Werte ---------- */
  function derived() {
    const s = state.settings;
    const kcal = num(s.kcal), ratio = num(s.ratio);
    const mahl = Math.max(1, num(s.mahlzeiten) || 1);
    return { kcal, ratio, mahl, kcalMahl: kcal / mahl };
  }

  /* ---------- Rezept-Anpassung ---------- */
  // Index der reinen Fett-Zutat (höchster Fettanteil, fettdominant)
  function fatItemIndex(items) {
    let idx = -1, best = -1;
    items.forEach((it, i) => {
      const f = lookup(it.food);
      if (f && f.fett >= 50 && (f.eiweiss + f.kh) < f.fett && f.fett > best) { best = f.fett; idx = i; }
    });
    return idx;
  }
  // Rechnet Rezept auf Ziel-Verhältnis + Ziel-Kalorien (pro Mahlzeit) um.
  function computeAdjustedRecipe(rec, targetKcal, ratio) {
    const base = rec.items.map(it => ({ food: it.food, grams: num(it.grams) }));
    const baseSum = sumMacros(base);
    const T = (targetKcal && targetKcal > 0) ? targetKcal : baseSum.kcal;

    const fi = fatItemIndex(base);
    if (fi < 0) {
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
      x = T / denom; s = -x * B / A;
    }
    if (x < 0 || s <= 0) return { items: base, ratio: ratioOf(baseSum), kcal: baseSum.kcal, ok: false, fatIndex: fi, note: "Verhältnis " + fmt(ratio, 0) + ":1 mit diesem Rezept nicht erreichbar." };
    const items = base.map((it, i) => i === fi
      ? { food: it.food, grams: round1(x) }
      : { food: it.food, grams: round1(it.grams * s) });
    const sum = sumMacros(items);
    return { items, ratio: ratioOf(sum), kcal: sum.kcal, ok: true, fatIndex: fi };
  }

  /* ---------- Routing ---------- */
  function go(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    let target = document.querySelector('.page[data-page="' + page + '"]');
    if (!target) { page = "rezepte"; target = document.querySelector('.page[data-page="rezepte"]'); }
    target.classList.add("active");
    document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("active", b.dataset.page === page));
    const mob = document.getElementById("mobileNav");
    if (mob.value !== page) mob.value = page;
    location.hash = page;
    if (window.scrollTo) try { window.scrollTo(0, 0); } catch (e) {}
    if (page === "rezepte") renderRezepte();
    else if (page === "lebensmittel") renderFoods();
  }

  function buildNav() {
    const nav = document.getElementById("nav");
    const mob = document.getElementById("mobileNav");
    nav.innerHTML = ""; mob.innerHTML = "";
    NAV.forEach(item => {
      const b = el("button", { html: '<span class="ico">' + item.icon + "</span><span>" + item.label + "</span>" });
      b.dataset.page = item.page;
      b.addEventListener("click", () => go(item.page));
      nav.appendChild(b);
      const o = el("option", { value: item.page }, item.icon + " " + item.label);
      mob.appendChild(o);
    });
    mob.addEventListener("change", () => go(mob.value));
  }

  /* ---------- Rezepte-Seite ---------- */
  function renderRezepte() {
    const s = state.settings;
    const $ = id => document.getElementById(id);
    $("set-kcal").value = s.kcal;
    $("set-mahlzeiten").value = s.mahlzeiten;
    $("set-ratio").value = s.ratio;
    document.querySelectorAll("#ketocal-seg button").forEach(b =>
      b.classList.toggle("active", b.dataset.val === (s.ketocal || "ohne")));

    const d = derived();
    document.getElementById("permeal").innerHTML =
      '<div class="permeal-main">' + fmt(d.kcalMahl, 0) + ' <span class="u">kcal pro Mahlzeit</span></div>' +
      '<div class="permeal-sub">' + fmt(d.kcal, 0) + " kcal/Tag ÷ " + d.mahl + " Mahlzeiten · Verhältnis " + fmt(d.ratio, d.ratio % 1 ? 1 : 0) + ":1</div>";

    const mode = s.ketocal || "ohne";
    // Nur Rezepte, die das eingestellte Verhältnis bei der Ziel-Kalorienzahl
    // sicher erreichen (die Fett-Anpassung muss lösbar sein).
    const recipes = RECIPES_SONDE
      .filter(r => mode === "alle" ? true : (mode === "ohne" ? !r.ketocal : r.ketocal))
      .map(rec => ({ rec, res: computeAdjustedRecipe(rec, d.kcalMahl, d.ratio) }))
      .filter(x => x.res.ok);

    // Sicherheitshinweis (Mikronährstoffe) – relevant, sobald Rezepte ohne KetoCal genutzt werden
    const noteBox = document.getElementById("info-note");
    if (mode === "mit") {
      noteBox.innerHTML = "";
    } else {
      noteBox.innerHTML = '<div class="diet-note">⚠️ <strong>Wichtig:</strong> Rezepte ohne KetoCal liefern keine vollständigen Vitamine und Mineralstoffe. Diese müssen separat ergänzt werden — bitte mit dem Behandlungsteam abstimmen.</div>';
    }

    const list = document.getElementById("recipe-list");
    list.innerHTML = "";
    document.getElementById("recipe-count").textContent =
      recipes.length + " Rezept" + (recipes.length === 1 ? "" : "e") +
      (mode === "ohne" ? " ohne KetoCal" : mode === "mit" ? " mit KetoCal" : " gesamt") +
      ", die " + fmt(d.ratio, d.ratio % 1 ? 1 : 0) + ":1 erreichen";
    if (recipes.length === 0) {
      list.appendChild(el("div", { class: "card empty" }, "Keine Rezepte erreichen das eingestellte Verhältnis. Bitte Verhältnis oder Kalorien anpassen."));
      return;
    }
    recipes.forEach(x => list.appendChild(renderRecipeCard(x.rec, x.res)));
  }

  function bindSettingsBar() {
    const map = { "set-kcal": "kcal", "set-mahlzeiten": "mahlzeiten", "set-ratio": "ratio" };
    Object.keys(map).forEach(id => {
      document.getElementById(id).addEventListener("input", e => {
        state.settings[map[id]] = num(e.target.value); save(); renderRezepte();
      });
    });
    document.querySelectorAll("#ketocal-seg button").forEach(b => {
      b.addEventListener("click", () => { state.settings.ketocal = b.dataset.val; save(); renderRezepte(); });
    });
  }

  /* ---------- Rezept-Karte ---------- */
  function renderRecipeCard(rec, res) {
    const d = derived();
    if (!res) res = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
    const items = res.items;
    const sum = sumMacros(items);
    const r = ratioOf(sum);
    const totalG = items.reduce((a, it) => a + num(it.grams), 0);

    const card = el("div", { class: "card recipe" });

    // Kopf
    const ketoBadge = rec.ketocal
      ? '<span class="badge keto">mit KetoCal</span>'
      : '<span class="badge noketo">ohne KetoCal</span>';
    const head = el("div");
    head.innerHTML =
      '<div class="title">' + escapeHtml(rec.name) + " " + ketoBadge + '</div>' +
      '<div class="meta">' + fmt(sum.kcal, 0) + " kcal · Eiweiß " + fmt(sum.eiweiss) +
      " g · Fett " + fmt(sum.fett) + " g · KH " + fmt(sum.kh) +
      ' g · <span class="ratio-pill ' + ratioClass(r, d.ratio) + '">Verhältnis ' + (r === null ? "—" : fmt(r, 2)) + ":1</span></div>" +
      '<div class="meta-sub">Ergibt ca. <strong>' + fmt(totalG, 0) + " g</strong> pro Mahlzeit · berechnet für " + fmt(d.kcalMahl, 0) + " kcal und Verhältnis " + fmt(d.ratio, d.ratio % 1 ? 1 : 0) + ":1</div>";
    card.appendChild(head);

    // Zutaten
    const wrap = el("div", { class: "tbl-wrap" });
    const table = el("table");
    table.innerHTML = "<thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead>";
    const tb = el("tbody");
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
    const trS = el("tr", { class: "sum" });
    trS.appendChild(el("td", { class: "name" }, "Summe"));
    trS.appendChild(el("td", {}, ""));
    trS.appendChild(el("td", {}, fmt(sum.eiweiss)));
    trS.appendChild(el("td", {}, fmt(sum.fett)));
    trS.appendChild(el("td", {}, fmt(sum.kh)));
    trS.appendChild(el("td", {}, fmt(sum.kcal, 0)));
    tb.appendChild(trS);
    table.appendChild(tb);
    wrap.appendChild(table);
    card.appendChild(wrap);

    if (!res.ok && res.note) card.appendChild(el("div", { class: "adjust-note" }, "⚠️ " + res.note));

    // Zubereitung: Thermomix + klassisch
    if (rec.thermomix) {
      const t = el("div", { class: "prep thermomix" });
      t.innerHTML = "<strong>🤖 Zubereitung mit Thermomix TM5</strong><br>" + escapeHtml(rec.thermomix);
      card.appendChild(t);
    }
    if (rec.zubereitung) {
      const z = el("div", { class: "prep" });
      z.innerHTML = "<strong>Zubereitung (klassisch)</strong><br>" + escapeHtml(rec.zubereitung);
      card.appendChild(z);
    }

    // Aktionen
    const actions = el("div", { class: "btn-row" });
    const printBtn = el("button", { class: "btn secondary" }, "🖨️ Rezept drucken");
    printBtn.addEventListener("click", () => printRecipe(rec, res, d));
    actions.appendChild(printBtn);
    card.appendChild(actions);

    return card;
  }

  function printRecipe(rec, res, d) {
    const items = res.items;
    const sum = sumMacros(items);
    const r = ratioOf(sum);
    const rows = items.map(it => {
      const m = lineMacros(it);
      return "<tr><td>" + escapeHtml(it.food) + "</td><td>" + fmt(it.grams, it.grams < 10 ? 1 : 0) +
        " g</td><td>" + fmt(m.kcal, 0) + " kcal</td></tr>";
    }).join("");
    const html =
      "<!DOCTYPE html><html lang='de'><head><meta charset='utf-8'><title>" + escapeHtml(rec.name) + "</title>" +
      "<style>body{font-family:Arial,sans-serif;color:#1f2933;margin:32px;max-width:640px}" +
      "h1{font-size:22px;margin:0 0 4px}.sub{color:#555;margin:0 0 16px}" +
      "table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left}" +
      "td:nth-child(2),td:nth-child(3){text-align:right}tr:last-child td{font-weight:bold;border-top:2px solid #999}" +
      ".prep{background:#f4f6f8;border-radius:8px;padding:12px;margin:10px 0;line-height:1.5}" +
      ".note{color:#666;font-size:12px;margin-top:18px}</style></head><body>" +
      "<h1>" + escapeHtml(rec.name) + (rec.ketocal ? " (mit KetoCal)" : " (ohne KetoCal)") + "</h1>" +
      "<p class='sub'>Pro Mahlzeit: " + fmt(sum.kcal, 0) + " kcal · Eiweiß " + fmt(sum.eiweiss) +
      " g · Fett " + fmt(sum.fett) + " g · KH " + fmt(sum.kh) + " g · Verhältnis " +
      (r === null ? "—" : fmt(r, 2)) + ":1</p>" +
      "<table><thead><tr><th>Lebensmittel</th><th>Menge</th><th>Energie</th></tr></thead><tbody>" + rows +
      "<tr><td>Summe</td><td></td><td>" + fmt(sum.kcal, 0) + " kcal</td></tr></tbody></table>" +
      (rec.thermomix ? "<div class='prep'><strong>Zubereitung mit Thermomix TM5</strong><br>" + escapeHtml(rec.thermomix) + "</div>" : "") +
      (rec.zubereitung ? "<div class='prep'><strong>Zubereitung (klassisch)</strong><br>" + escapeHtml(rec.zubereitung) + "</div>" : "") +
      "<p class='note'>Erstellt mit Keto-Sondennahrung. Bitte Mengen vor der Zubereitung mit dem Behandlungsteam abstimmen.</p>" +
      "</body></html>";
    let w = null;
    try { w = window.open("", "_blank"); } catch (e) {}
    if (!w) { alert("Bitte Pop-ups für diese Seite erlauben, um drucken zu können."); return; }
    w.document.open(); w.document.write(html); w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 250);
  }

  /* ---------- Lebensmittel-Seite ---------- */
  function renderFoods() {
    const filterSel = document.getElementById("lm-filter");
    filterSel.innerHTML = "";
    const cats = Array.from(new Set(allFoods().map(f => f.kategorie)));
    filterSel.appendChild(el("option", { value: "" }, "Alle Kategorien"));
    cats.forEach(c => filterSel.appendChild(el("option", { value: c }, c)));
    drawFoodTable();
  }
  function drawFoodTable() {
    const q = (document.getElementById("lm-search").value || "").toLowerCase();
    const cat = document.getElementById("lm-filter").value;
    const tb = document.querySelector("#lm-table tbody");
    tb.innerHTML = "";
    const custom = new Set(state.customFoods.map(f => f.name));
    const rows = allFoods().filter(f =>
      (!cat || f.kategorie === cat) && (!q || f.name.toLowerCase().includes(q) || (f.kategorie || "").toLowerCase().includes(q)));
    rows.forEach(f => {
      const tr = el("tr");
      tr.appendChild(el("td", { class: "name" }, f.kategorie || ""));
      tr.appendChild(el("td", { class: "name" }, f.name + (custom.has(f.name) ? " ✎" : "")));
      tr.appendChild(el("td", {}, fmt(f.eiweiss)));
      tr.appendChild(el("td", {}, fmt(f.fett)));
      tr.appendChild(el("td", {}, fmt(f.kh)));
      tr.appendChild(el("td", {}, fmt(f.eiweiss * 4 + f.fett * 9 + f.kh * 4, 0)));
      const tdAct = el("td", { class: "col-act" });
      if (custom.has(f.name)) {
        const del = el("button", { class: "btn ghost", title: "Eigenes Lebensmittel löschen" }, "✕");
        del.addEventListener("click", () => {
          state.customFoods = state.customFoods.filter(c => c.name !== f.name);
          rebuildFoodIndex(); save(); renderFoods();
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
        name, pro: 100,
        eiweiss: num(document.getElementById("lm-eiweiss").value),
        fett: num(document.getElementById("lm-fett").value),
        kh: num(document.getElementById("lm-kh").value),
        cholesterin: num(document.getElementById("lm-chol").value),
        natrium: num(document.getElementById("lm-natrium").value),
        ballaststoffe: num(document.getElementById("lm-ballast").value),
      });
      rebuildFoodIndex(); save();
      ["lm-name", "lm-eiweiss", "lm-fett", "lm-kh", "lm-chol", "lm-natrium", "lm-ballast"].forEach(id => document.getElementById(id).value = "");
      renderFoods();
    });
  }

  /* ---------- Daten ---------- */
  function bindData() {
    document.getElementById("data-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: "keto-sondennahrung-daten.json" });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });
    document.getElementById("data-import-btn").addEventListener("click", () => document.getElementById("data-import").click());
    document.getElementById("data-import").addEventListener("change", e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          state = Object.assign(defaultState(), { settings: Object.assign(defaultState().settings, obj.settings || {}), customFoods: obj.customFoods || [] });
          rebuildFoodIndex(); save();
          alert("Daten erfolgreich importiert."); go("rezepte");
        } catch (err) { alert("Datei konnte nicht gelesen werden."); }
      };
      reader.readAsText(file); e.target.value = "";
    });
    document.getElementById("data-reset").addEventListener("click", () => {
      if (confirm("Wirklich ALLE Daten zurücksetzen? Das kann nicht rückgängig gemacht werden.")) {
        state = defaultState(); rebuildFoodIndex(); save(); go("rezepte");
      }
    });
  }

  /* ---------- Init ---------- */
  function init() {
    rebuildFoodIndex();
    buildNav();
    bindSettingsBar();
    bindFoods();
    bindData();
    document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => go(b.dataset.goto)));
    const start = (location.hash || "#rezepte").slice(1);
    go(start || "rezepte");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
