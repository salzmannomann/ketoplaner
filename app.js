/* Keto-Sondennahrung — Logik
   Eine Seite: Einstellungen + Standard-Rezepte, die automatisch auf das
   Verhältnis und die Kalorien pro Mahlzeit umgerechnet werden.
   Einstellungen werden lokal im Browser gespeichert (localStorage). */

(function () {
  "use strict";

  const STORAGE_KEY = "ketoplaner.v3";

  /* ---------- State ---------- */
  function defaultState() {
    return { settings: { kcal: 1500, ratio: 1.8, mahlzeiten: 4, eiweiss: 20, ketocal: "ohne" } };
  }
  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const p = JSON.parse(raw);
      return { settings: Object.assign(defaultState().settings, p.settings || {}) };
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

  /* ---------- Abgeleitete Werte ---------- */
  function derived() {
    const s = state.settings;
    const kcal = num(s.kcal), ratio = num(s.ratio), eiweiss = num(s.eiweiss);
    const mahl = Math.max(1, num(s.mahlzeiten) || 1);
    return { kcal, ratio, mahl, eiweiss, kcalMahl: kcal / mahl, eiweissMahl: eiweiss / mahl };
  }

  /* ---------- Rezept-Anpassung ---------- */
  function fatItemIndex(items) {
    let idx = -1, best = -1;
    items.forEach((it, i) => {
      const f = lookup(it.food);
      if (f && f.fett >= 50 && (f.eiweiss + f.kh) < f.fett && f.fett > best) { best = f.fett; idx = i; }
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

  /* ---------- Rezepte rendern ---------- */
  function renderRezepte() {
    const s = state.settings;
    const $ = id => document.getElementById(id);
    $("set-kcal").value = s.kcal;
    $("set-mahlzeiten").value = s.mahlzeiten;
    $("set-ratio").value = s.ratio;
    $("set-eiweiss").value = s.eiweiss;
    document.querySelectorAll("#ketocal-seg button").forEach(b =>
      b.classList.toggle("active", b.dataset.val === (s.ketocal || "ohne")));

    const d = derived();
    $("permeal").innerHTML =
      '<div class="permeal-main">' + fmt(d.kcalMahl, 0) + ' <span class="u">kcal pro Mahlzeit</span></div>' +
      '<div class="permeal-sub">' + fmt(d.kcal, 0) + " kcal/Tag ÷ " + d.mahl + " Mahlzeiten · Verhältnis " +
      fmt(d.ratio, d.ratio % 1 ? 1 : 0) + ":1 · Eiweiß-Ziel ca. " + fmt(d.eiweissMahl) + " g/Mahlzeit</div>";

    const mode = s.ketocal || "ohne";
    const recipes = RECIPES_SONDE
      .filter(r => mode === "alle" ? true : (mode === "ohne" ? !r.ketocal : r.ketocal))
      .map(rec => ({ rec, res: computeAdjustedRecipe(rec, d.kcalMahl, d.ratio) }))
      .filter(x => x.res.ok);

    $("info-note").innerHTML = (mode === "mit") ? "" :
      '<div class="diet-note">⚠️ <strong>Wichtig:</strong> Rezepte ohne KetoCal liefern keine vollständigen Vitamine und Mineralstoffe. Diese müssen separat ergänzt werden — bitte mit dem Behandlungsteam abstimmen.</div>';

    $("recipe-count").textContent =
      recipes.length + " Rezept" + (recipes.length === 1 ? "" : "e") +
      (mode === "ohne" ? " ohne KetoCal" : mode === "mit" ? " mit KetoCal" : " gesamt");

    const list = $("recipe-list");
    list.innerHTML = "";
    if (recipes.length === 0) {
      list.appendChild(el("div", { class: "card empty" }, "Keine Rezepte für diese Auswahl."));
      return;
    }
    const grid = el("div", { class: "tiles" });
    recipes.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d)));
    list.appendChild(grid);
  }

  function bindSettingsBar() {
    const map = { "set-kcal": "kcal", "set-mahlzeiten": "mahlzeiten", "set-ratio": "ratio", "set-eiweiss": "eiweiss" };
    Object.keys(map).forEach(id => {
      document.getElementById(id).addEventListener("input", e => {
        state.settings[map[id]] = num(e.target.value); save(); renderRezepte();
      });
    });
    document.querySelectorAll("#ketocal-seg button").forEach(b => {
      b.addEventListener("click", () => { state.settings.ketocal = b.dataset.val; save(); renderRezepte(); });
    });
  }

  /* ---------- Kachel (Übersicht) ---------- */
  function renderRecipeTile(rec, res, d) {
    const sum = sumMacros(res.items);
    const r = ratioOf(sum);
    const totalG = res.items.reduce((a, it) => a + num(it.grams), 0);
    const ml = volumeMl(res.items);
    const proteinOk = sum.eiweiss >= d.eiweissMahl * 0.9;

    const tile = el("div", { class: "tile", tabindex: "0", role: "button" });
    tile.innerHTML =
      '<div class="tile-head">' +
        '<span class="tile-icon">' + (rec.icon || "🥄") + "</span>" +
        '<span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + (r === null ? "—" : fmt(r, 2)) + ":1</span>" +
      "</div>" +
      '<div class="tile-name">' + escapeHtml(rec.name) + "</div>" +
      '<div class="tile-badge">' +
        (rec.ketocal ? '<span class="badge keto">mit KetoCal</span>' : '<span class="badge noketo">ohne KetoCal</span>') +
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
    return tile;
  }

  /* ---------- Detailansicht (Overlay) ---------- */
  function openRecipeDetail(rec) {
    const d = derived();
    const res = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
    const items = res.items;
    const sum = sumMacros(items);
    const r = ratioOf(sum);
    const totalG = items.reduce((a, it) => a + num(it.grams), 0);
    const ml = volumeMl(items);
    const proteinOk = sum.eiweiss >= d.eiweissMahl * 0.9;

    const ketoBadge = rec.ketocal
      ? '<span class="badge keto">mit KetoCal</span>'
      : '<span class="badge noketo">ohne KetoCal</span>';

    let rows = "";
    items.forEach((it, i) => {
      const m = lineMacros(it);
      rows += "<tr" + (i === res.fatIndex ? ' class="fatrow"' : "") + "><td class='name'>" +
        escapeHtml(it.food) + (i === res.fatIndex ? " ⟵ Fett angepasst" : "") + "</td><td>" +
        fmt(it.grams, it.grams < 10 ? 1 : 0) + "</td><td>" + fmt(m.eiweiss) + "</td><td>" +
        fmt(m.fett) + "</td><td>" + fmt(m.kh) + "</td><td>" + fmt(m.kcal, 0) + "</td></tr>";
    });

    const c = document.getElementById("detail-content");
    c.innerHTML =
      '<div class="detail-head"><span class="detail-icon">' + (rec.icon || "🥄") + "</span>" +
        '<div><div class="title">' + escapeHtml(rec.name) + " " + ketoBadge + "</div>" +
        '<div class="meta">' + fmt(sum.kcal, 0) + " kcal · Eiweiß " + fmt(sum.eiweiss) + " g · Fett " +
        fmt(sum.fett) + " g · KH " + fmt(sum.kh) + ' g · <span class="ratio-pill ' + ratioClass(r, d.ratio) +
        '">Verhältnis ' + (r === null ? "—" : fmt(r, 2)) + ":1</span></div></div></div>" +
      '<div class="detail-tiles">' +
        '<div class="dstat"><div class="v">≈ ' + fmt(totalG, 0) + ' g</div><div class="l">Menge</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(ml, 0) + ' ml</div><div class="l">Volumen</div></div>' +
        '<div class="dstat"><div class="v">' + fmt(d.kcalMahl, 0) + '</div><div class="l">kcal/Mahlzeit</div></div>' +
        '<div class="dstat ' + (proteinOk ? "" : "warn") + '"><div class="v">' + fmt(sum.eiweiss) + ' g</div><div class="l">Eiweiß (Ziel ' + fmt(d.eiweissMahl) + ' g)</div></div>' +
      "</div>" +
      (!proteinOk ? '<div class="adjust-note">⚠️ Diese Mahlzeit liegt unter dem Eiweiß-Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
      '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' +
        rows +
        "<tr class='sum'><td class='name'>Summe</td><td></td><td>" + fmt(sum.eiweiss) + "</td><td>" +
        fmt(sum.fett) + "</td><td>" + fmt(sum.kh) + "</td><td>" + fmt(sum.kcal, 0) + "</td></tr>" +
      "</tbody></table></div>" +
      (rec.thermomix ? '<div class="prep thermomix"><strong>🤖 Zubereitung mit Thermomix TM5</strong><br>' + escapeHtml(rec.thermomix) + "</div>" : "") +
      (rec.zubereitung ? '<div class="prep"><strong>Zubereitung (klassisch)</strong><br>' + escapeHtml(rec.zubereitung) + "</div>" : "");

    const actions = el("div", { class: "btn-row" });
    const printBtn = el("button", { class: "btn secondary" }, "🖨️ Rezept drucken");
    printBtn.addEventListener("click", () => printRecipe(rec, res, d));
    actions.appendChild(printBtn);
    c.appendChild(actions);

    const overlay = document.getElementById("detail-overlay");
    overlay.hidden = false;
    document.body.classList.add("modal-open");
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

  /* ---------- Drucken ---------- */
  function printRecipe(rec, res, d) {
    const items = res.items;
    const sum = sumMacros(items);
    const r = ratioOf(sum);
    const totalG = items.reduce((a, it) => a + num(it.grams), 0);
    const ml = volumeMl(items);
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
      "<h1>" + (rec.icon || "") + " " + escapeHtml(rec.name) + (rec.ketocal ? " (mit KetoCal)" : " (ohne KetoCal)") + "</h1>" +
      "<p class='sub'>Pro Mahlzeit: " + fmt(sum.kcal, 0) + " kcal · Eiweiß " + fmt(sum.eiweiss) +
      " g · Fett " + fmt(sum.fett) + " g · KH " + fmt(sum.kh) + " g · Verhältnis " +
      (r === null ? "—" : fmt(r, 2)) + ":1<br>Menge ca. " + fmt(totalG, 0) + " g (≈ " + fmt(ml, 0) + " ml)</p>" +
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

  /* ---------- Init ---------- */
  function init() {
    rebuildFoodIndex();
    bindSettingsBar();
    bindDetail();
    renderRezepte();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
