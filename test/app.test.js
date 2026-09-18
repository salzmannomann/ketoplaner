// Regressionstests für HamHam Keto – laufen mit `npm test` (node --test + jsdom).
// Sie prüfen die Rechenkern-Invarianten und die wichtigsten Bedienpfade gegen die
// gebaute App (index.html + foods.js + recipes.js + app.js) – kein Server nötig.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const CODE = ["foods.js", "recipes.js", "app.js"].map(read).join("\n;\n");
const HTML = read("index.html");

// Startet die App in jsdom mit optionalem gespeicherten Zustand (localStorage).
function boot(stored) {
  const dom = new JSDOM(HTML, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};
  window.confirm = () => true;
  window.alert = () => {};
  window.__asserts = [];
  window.console.assert = (ok, msg) => { if (!ok) window.__asserts.push(msg); };
  // Feste 700 kcal/Tag als Ausgangspunkt (der App-Standard ist „leer = Vorschlag nach Gewicht“); kcal: "" testet den Vorschlag.
  stored = stored || {}; stored.settings = Object.assign({ kcal: 700 }, stored.settings || {});
  window.localStorage.setItem("ketoplaner.v5", JSON.stringify(stored));
  window.eval(CODE);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  return window;
}
const fire = (w, el, type) => el.dispatchEvent(new w.Event(type || "click", { bubbles: true }));
const $ = (w, id) => w.document.getElementById(id);
const tiles = (w) => [...w.document.querySelectorAll("#recipe-list .tile")];
const tileNames = (w) => tiles(w).map(t => t.querySelector(".tile-name").textContent.trim());
function openRecipe(w, name) {
  const t = tiles(w).find(x => x.querySelector(".tile-name").textContent.trim().startsWith(name));
  assert.ok(t, "Rezept-Kachel fehlt: " + name);
  fire(w, t);
  return $(w, "detail-content");
}
const ratioOf = (c) => {
  const t = c.querySelector(".ratio-pill").textContent.replace(",", ".");
  return t.startsWith("1:") ? 1 / parseFloat(t.slice(2)) : parseFloat(t.replace(":1", ""));
};
const kcalOf = (c) => parseFloat([...c.querySelectorAll(".pane[data-pane=mahlzeit] .dstat .v, .pane[data-pane=abwiegen] .dstat .v, .pane[data-pane=anpassen] .dstat .v")][0].textContent.replace(".", ""));
function kitchenRows(c) {
  const out = {};
  [...c.querySelectorAll("table.kitchen tbody tr:not(.sum)")].forEach(r => {
    out[r.querySelector(".name").textContent.replace(/⟵.*/, "").trim()] = parseFloat(r.querySelector("input").value);
  });
  return out;
}
function clickChip(w, label) {
  const b = [...w.document.querySelectorAll("#filter-bar button.chip")].find(x => x.textContent.trim() === label);
  assert.ok(b, "Filter-Chip fehlt: " + label);
  fire(w, b);
}
// Blätter der Detailansicht: „rechnen“ (alt) = Mahlzeit + Anpassen + Abwiegen (mit Tages-Check) zusammen
const rechnenText = (c) => [...c.querySelectorAll(".pane[data-pane=mahlzeit], .pane[data-pane=abwiegen], .pane[data-pane=anpassen]")].map(p => p.textContent).join("\n");
// Tag: gleiches Layout wie Mahlzeit (Statuszeile, Kacheln, Tabelle) für die Zubereitungsmenge (Standard ein Tag)
const tagStatus = (c) => c.querySelector(".pane[data-pane=abwiegen] .portion-line");
const dayTiles = (c) => c.querySelector(".pane[data-pane=abwiegen] .detail-tiles");
const numDe = (t) => parseFloat(String(t).replace(/\./g, "").replace(",", "."));
function switchDetailTab(w, k) { fire(w, $(w, "detail-content").querySelector("#detail-tabs button[data-dtab=" + k + "]")); return $(w, "detail-content"); }

test("Daten: keine doppelten Namen, alle Rezept-Zutaten vorhanden", () => {
  const w = boot();
  const F = w.eval(read("foods.js") + ";FOODS_DEFAULT"), R = w.eval(read("recipes.js") + ";RECIPES_SONDE");
  const fn = F.map(f => f.name), rn = R.map(r => r.name);
  assert.equal(new Set(fn).size, fn.length, "doppelte Lebensmittel");
  assert.equal(new Set(rn).size, rn.length, "doppelte Rezepte");
  const idx = new Set(fn);
  R.forEach(r => r.items.forEach(it => assert.ok(idx.has(it.food), r.name + ": Zutat fehlt: " + it.food)));
});

test("Alle Rezepte (mit und ohne KetoCal) treffen das Zielverhältnis bei 1,8:1 und 1:1 (ohne MCT)", () => {
  for (const ratio of [1.8, 1.0]) {
    const w = boot({ settings: { ratio: ratio, mctShare: 0 } });
    assert.ok(tiles(w).length >= 40, "zu wenige Rezepte: " + tiles(w).length);
    for (const t of tiles(w)) {
      fire(w, t);
      const c = $(w, "detail-content");
      const r = ratioOf(c);
      assert.ok(Math.abs(r - ratio) / ratio <= 0.05, t.textContent.trim().slice(0, 30) + " @" + ratio + " -> " + r);
      assert.ok(!/NaN|undefined/.test(c.textContent), "NaN im Detail");
      fire(w, $(w, "detail-close"));
    }
  }
});

test("MCT: s = 0 reproduziert den Ist-Zustand; Modus Verhältnis hält R, Modus Kalorien hält kcal", () => {
  const base = boot({ settings: { mctShare: 0 } });
  let c0 = openRecipe(base, "Hendl & Brokkoli");
  { const pin0 = c0.querySelector("#portion-input"); pin0.value = "1"; fire(base, pin0, "change"); } c0 = $(base, "detail-content"); // Tag-Tabelle für eine Portion
  const rows0 = kitchenRows(c0);
  assert.equal(rows0["Rapsöl"], 12.3);
  assert.equal(rows0["MCT-Öl C8+C10"], undefined);
  assert.equal(ratioOf(c0), 1.8);

  let lastKcal = Infinity;
  for (const s of [0.1, 0.3, 0.5, 1]) {
    const w = boot({ settings: { mctShare: s, mctMode: "verhaeltnis" } });
    const c = openRecipe(w, "Hendl & Brokkoli");
    assert.ok(Math.abs(ratioOf(c) - 1.8) <= 0.02, "Verhältnis-Modus s=" + s + ": " + ratioOf(c));
    assert.equal(w.__asserts.length, 0, "Zusicherung verletzt: " + w.__asserts.join("; "));
    const kc = kcalOf(switchDetailTab(w, "mahlzeit"));
    assert.ok(kc <= lastKcal + 1, "kcal müssen mit s sinken");
    lastKcal = kc;
  }
  let lastR = 0;
  for (const s of [0.1, 0.5, 1]) {
    const w = boot({ settings: { mctShare: s, mctMode: "kalorien", kcal: 700 } });
    const c = openRecipe(w, "Hendl & Brokkoli");
    const kc = kcalOf(switchDetailTab(w, "mahlzeit"));
    assert.ok(Math.abs(kc - 140) <= 1, "Kalorien-Modus s=" + s + ": " + kc + " kcal");
    assert.ok(ratioOf(c) >= lastR - 0.005, "Verhältnis muss mit s steigen");
    assert.equal(w.__asserts.length, 0);
    lastR = ratioOf(c);
  }
});

test("Wasser wird unabhängig geändert und je Rezept gemerkt; andere Zutaten skalieren proportional", () => {
  const w = boot({ settings: { mctShare: 0 } });
  let c = openRecipe(w, "Hendl & Brokkoli");
  const before = kitchenRows(c);
  const win = [...c.querySelectorAll("table.kitchen tr")].find(r => /Wasser/.test(r.textContent)).querySelector("input");
  win.value = "100"; fire(w, win, "change");
  c = $(w, "detail-content");
  const after = kitchenRows(c);
  assert.equal(after["Wasser"], 100);
  assert.equal(after["Hühnerbrust ohne Haut"], before["Hühnerbrust ohne Haut"]);
  assert.equal(after["Rapsöl"], before["Rapsöl"]);
  assert.equal(ratioOf(c), 1.8);
  // Neustart: Wasser bleibt
  const w2 = boot(JSON.parse(w.localStorage.getItem("ketoplaner.v5")));
  assert.equal(kitchenRows(openRecipe(w2, "Hendl & Brokkoli"))["Wasser"], 100);
  // Andere Zutat: alles skaliert mit, Wasser folgt je Portion
  let c2 = $(w2, "detail-content");
  const hin = [...c2.querySelectorAll("table.kitchen tr")].find(r => /Hüh/.test(r.textContent)).querySelector("input");
  hin.value = String(before["Hühnerbrust ohne Haut"] * 2); fire(w2, hin, "change");
  c2 = $(w2, "detail-content");
  const r2 = kitchenRows(c2);
  assert.ok(Math.abs(r2["Broccoli, gekocht"] - before["Broccoli, gekocht"] * 2) < 0.6, "Portion angepasst (0,5-g-Rundung × 5)");
  assert.equal(r2["Wasser"], 100, "gemerktes Wasser bleibt");
  assert.match(tagStatus(c2).textContent, /Portion angepasst: 200 %.*↺ wie berechnet.*Wasser angepasst \(100 statt \d+ ml\) · ↺ wie berechnet/);
  fire(w2, tagStatus(c2).querySelector(".portion-reset")); c2 = $(w2, "detail-content");
  assert.ok(Math.abs(kitchenRows(c2)["Broccoli, gekocht"] - before["Broccoli, gekocht"]) < 0.2, "Portion zurückgesetzt");
  assert.match(tagStatus(c2).textContent, /^Wasser angepasst/);
});

test("Abfüllen: Menge je Portion ohne Öl × Portionen = ölfreie Gesamtmenge", () => {
  const w = boot({ settings: { mctShare: 0 } });
  let c = openRecipe(w, "Hendl & Brokkoli");
  const pin = c.querySelector("#portion-input"); pin.value = "10"; fire(w, pin, "change");
  c = switchDetailTab(w, "zubereitung");
  assert.equal(c.querySelector(".pane[data-pane=abfuellen]"), null, "Abfüllen ist Teil des Blatts Kochen");
  const per = parseFloat(c.querySelector(".pane[data-pane=zubereitung] .fill-big").textContent.replace(/[^\d]/g, ""));
  const note = c.querySelector(".pane[data-pane=zubereitung] .portion-line").textContent;
  const total = parseFloat((note.match(/gesamt ≈\s*([\d.]+)\s*g/) || [])[1].replace(".", ""));
  assert.ok(Math.abs(total - per * 10) <= 10, "gesamt " + total + " vs 10×" + per);
});

const badgeOf = (t) => t.querySelector(".tile-badge").textContent;
test("Liste: jedes Rezept ein Eintrag (mit oder ohne KetoCal), Fettbasis-Schild, KetoCal ausblendbar, Gruppen, Suche", () => {
  const w = boot();
  const all = tileNames(w).length;
  assert.ok(all >= 45 && all <= 56, "Rezepte: " + all);
  assert.ok(!tileNames(w).some(n => /mit KetoCal|Flasche|Variante/.test(n)), "Varianten-Zusätze dürfen nicht im Namen stehen");
  assert.ok(new Set(tileNames(w)).size < all, "Gerichte in beiden Fettbasen erscheinen zweimal (gleicher Name)");
  const kc = tiles(w).filter(t => /🥄/.test(badgeOf(t))).length;
  assert.ok(kc >= 20, "KetoCal-Rezepte mit 🥄-Schild: " + kc);
  assert.ok(!tiles(w).some(t => /nur mit|nur ohne/.test(badgeOf(t))), "keine „nur mit/ohne“-Schilder mehr");
  // Doppel-Gericht: beide Einträge nebeneinander, ohne KetoCal zuerst, beide mit Fettbasis-Schild
  const hz = tiles(w).filter(t => t.querySelector(".tile-name").textContent.trim() === "Hendl & Zucchini");
  assert.equal(hz.length, 2);
  assert.match(badgeOf(hz[0]), /Rapsöl/); assert.match(badgeOf(hz[1]), /🥄 KetoCal/);
  // Häkchen „Rezepte mit KetoCal ausblenden“
  const hk = $(w, "hide-keto"); hk.checked = true; fire(w, hk, "change");
  assert.equal(tileNames(w).length, all - kc);
  assert.ok(!tiles(w).some(t => /🥄/.test(badgeOf(t))));
  hk.checked = false; fire(w, hk, "change");
  assert.equal(tileNames(w).length, all);
  clickChip(w, "🥤 Angerührt");
  assert.deepEqual(tileNames(w).sort(), ["Compleat & KetoCal", "Compleat & KetoCal & Pre Apta", "HiPP Hühnchen & Öl", "KetoCal & Pre Apta"]);
  clickChip(w, "🥚 Ei");
  assert.ok(tileNames(w).length >= 4 && tileNames(w).every(n => /^Ei /.test(n)));
  clickChip(w, "🍗 Geflügel");
  assert.ok(tileNames(w).length >= 8 && tileNames(w).every(n => /^(Hendl|Pute)/.test(n)));
  clickChip(w, "🍓 Obst & Brei");
  assert.ok(tileNames(w).some(n => /Grieß/.test(n)) && tileNames(w).some(n => /Banane/.test(n)));
  clickChip(w, "Alle");
  const s = $(w, "recipe-search"); s.value = "zucchini"; fire(w, s, "input");
  assert.ok(tileNames(w).length > 0 && tileNames(w).every(n => /zucchini/i.test(n)));
});

test("Varianten: „Auch als“-Link öffnet das Geschwister-Rezept, Menge gilt je Gericht, Favorit je Rezept", () => {
  const w = boot({ settings: { mctShare: 0 } });
  let c = openRecipe(w, "Hendl & Zucchini"); // erster Eintrag = ohne KetoCal
  assert.ok(kitchenRows(c)["Rapsöl"] > 0 && kitchenRows(c)["Ketocal 3:1"] === undefined);
  const pin = c.querySelector("#portion-input"); pin.value = "4"; fire(w, pin, "change");
  c = $(w, "detail-content");
  const link = c.querySelector("button[data-open-rec]");
  assert.ok(link && /KetoCal/.test(link.textContent), "Auch-als-Link zur KetoCal-Variante fehlt"); fire(w, link);
  c = $(w, "detail-content");
  const rows = kitchenRows(c);
  assert.ok(rows["Ketocal 3:1"] > 0 && rows["Rapsöl"] === undefined, "Geschwister-Rezept geöffnet");
  assert.equal(c.querySelector("#portion-input").value, "4", "Zubereitungsmenge bleibt beim Wechsel zum Geschwister-Rezept");
  assert.ok(Math.abs(ratioOf(c) - 1.8) <= 0.02);
  [...c.querySelectorAll(".btn")].find(b => /Favorit/.test(b.textContent)).click();
  fire(w, $(w, "detail-close"));
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  assert.deepEqual(st.favorites, ["std:Hendl & Zucchini (mit KetoCal)"]);
  assert.equal(st.scales["fam:Hendl & Zucchini"], undefined, "Menge wird nicht gemerkt");
  // Neustart: nur der KetoCal-Eintrag ist Favorit
  const w2 = boot(st);
  const hz = tiles(w2).filter(x => x.querySelector(".tile-name").textContent.trim() === "Hendl & Zucchini");
  assert.equal(hz.length, 2);
  assert.ok(hz.find(t => /🥄/.test(badgeOf(t))).querySelector(".favbtn").classList.contains("on"));
  assert.ok(!hz.find(t => /Rapsöl/.test(badgeOf(t))).querySelector(".favbtn").classList.contains("on"));
});

test("Compleat-Rezepte: Verhältnis und kcal exakt, Pre-Apta-Variante braucht weniger Compleat, Packungs-Hinweis und Packungsstand", () => {
  const w = boot({ settings: { mctShare: 0, ratio: 2 / 3, mahlzeiten: 4, kcal: 750, weight: 8.5 } });
  let c = openRecipe(w, "Compleat & KetoCal");
  const rK = kitchenRows(c); // Tag = 4 Portionen (alle Vergleiche relativ)
  assert.equal(rK["Aptamil Pre (Pulver)"], undefined); assert.ok(rK["Ketocal 3:1"] > 0);
  assert.match(c.querySelector(".ratio-pill").textContent, /^0,6[67]:1$/); assert.ok(Math.abs(kcalOf(c) - 188) <= 1, "kcal " + kcalOf(c));
  const mlK = rK["Compleat Paediatric Nature Mix (Nestlé)"];
  const info = c.querySelector(".note.pack").textContent;
  assert.match(info, /reicht für \d+ Mahlzeiten/); assert.ok(!/aufteilen|aufbrauchen in/i.test(info), "keine Aufteilungs-Steuerung mehr");
  assert.ok(!c.querySelector("#pack-perday") && !c.querySelector("button[data-ptage]") && !c.querySelector("button[data-pfill]"));
  fire(w, $(w, "detail-close"));
  c = openRecipe(w, "Compleat & KetoCal & Pre Apta");
  const rP = kitchenRows(c);
  assert.ok(rP["Aptamil Pre (Pulver)"] > 0, "Pre Apta enthalten");
  assert.match(c.querySelector(".ratio-pill").textContent, /^0,6[67]:1$/); assert.ok(Math.abs(kcalOf(c) - 188) <= 1);
  assert.ok(rP["Compleat Paediatric Nature Mix (Nestlé)"] < mlK, "mit Pre Apta weniger Compleat je Mahlzeit");
  fire(w, $(w, "detail-close"));
  // Tagesplan: 4 × Compleat & KetoCal → Packungsstand (heute verplant, Rest)
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  st.dayPlan = [0, 1, 2, 3].map(() => ({ key: "std:Compleat & KetoCal" }));
  const w2 = boot(st);
  fire(w2, $(w2, "tab-heute"));
  const hc = $(w2, "heute-content").textContent;
  assert.match(hc, /🧃 Compleat Paediatric/); assert.match(hc, new RegExp(fmtDe(mlK) + " ml") /* Tag = 4 Portionen */);
  assert.match(hc, /Minimum 600 ✓/);
});
function fmtDe(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }

test("Kalorien-Minimum: automatisch 70 kcal/kg, Korridor in der Zusammenfassung, Tagesplan warnt bei Unterschreitung", () => {
  const w = boot({ settings: { mctShare: 0, ratio: 2 / 3, mahlzeiten: 4, kcal: 750, weight: 8.5 } });
  assert.match($(w, "verordnung-summary").textContent, /mindestens 150 kcal \(600 kcal\/Tag, 70 kcal\/kg\)/);
  assert.match($(w, "verordnung-summary").textContent, /750 kcal\/Tag, manuell ÷ 4.*Korridor nach Gewicht 600–770 kcal\/Tag \(70–90 kcal\/kg\)/);
  assert.equal($(w, "set-kcalmin").value, "600"); assert.match($(w, "src-kcalmin").textContent, /✓ Vorschlag · 70 kcal\/kg/);
  // Manuelles Minimum über dem Ziel → Tagesplan mit 4 × 188 kcal = 750 liegt darunter → Warnung
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  st.settings.kcalMin = 800;
  st.dayPlan = [0, 1, 2, 3].map(() => ({ key: "std:Compleat & KetoCal" }));
  const w2 = boot(st);
  assert.match($(w2, "verordnung-summary").textContent, /800 kcal\/Tag, manuell/);
  fire(w2, $(w2, "tab-heute"));
  const t2 = $(w2, "heute-content").textContent;
  assert.match(t2, /Minimum 800 – unterschritten!/); assert.match(t2, /unter dem Kalorien-Minimum/);
});

test("Migration: alte Schlüssel (Flasche, Variante 1, KetoCal-Zwilling) werden auf Gerichte umgezogen", () => {
  const w = boot({
    settings: { ketoFilter: "ohne", filter: "flasche" },
    favorites: ["std:Hendl & Zucchini (mit KetoCal)", "std:Flasche: KetoCal & Compleat"],
    scales: { "std:Erdäpfel & Zucchini (mit KetoCal) – Variante 1": 3 },
    dayPlan: [{ key: "std:Flasche: KetoCal & Pre Apta" }, { key: null }],
  });
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  assert.equal(st.settings.ketocal, "ohne"); assert.equal(st.settings.filter, "alle");
  assert.deepEqual(st.favorites, ["std:Hendl & Zucchini (mit KetoCal)", "std:Compleat & KetoCal"]);
  assert.equal(st.scales["fam:Erdäpfel & Zucchini"], 3);
  assert.equal(st.dayPlan[0].key, "std:KetoCal & Pre Apta");
  fire(w, $(w, "tab-heute"));
  assert.match($(w, "heute-content").textContent, /KetoCal & Pre Apta/);
});

test("Vorgaben: Kalorien, Minimum und Flüssigkeit kommen vom Gewicht; eigener Wert lässt sich zurücksetzen; Eiweiß-Standard sichtbar", () => {
  const w = boot({ settings: { weight: 8.5, mahlzeiten: 4, kcal: "" } });
  // Vorschlag: 80 kcal/kg → 680 kcal/Tag, Feld leer, kein Zurücksetzen-Link
  assert.equal($(w, "set-kcal").value, "680", "Vorschlag steht als Wert im Feld");
  assert.match($(w, "src-kcal").textContent, /✓ Vorschlag · 80 kcal\/kg/);
  assert.ok($(w, "src-kcal").classList.contains("auto"));
  assert.ok($(w, "reset-kcal").hidden);
  assert.match($(w, "verordnung-summary").textContent, /170 kcal pro Mahlzeit \(680 kcal\/Tag, Vorschlag 80 kcal\/kg ÷ 4\)/);
  assert.match($(w, "rx-chip").textContent, /170 kcal × 4/);
  assert.equal($(w, "set-kcalmin").value, "600");
  assert.equal($(w, "set-fluid").value, "850"); assert.match($(w, "src-fluid").textContent, /✓ Vorschlag · 100 ml\/kg/);
  // Eiweiß: Standard 1,5 g/kg erkennbar
  assert.match(w.document.querySelector("#set-proteinmode option[value='1.5']").textContent, /Standard/);
  assert.ok($(w, "reset-protein").hidden, "kein Standard-Link, solange der Standard gilt");
  // Eigener Wert → Link erscheint → Zurücksetzen bringt den Vorschlag zurück
  const k = $(w, "set-kcal"); k.value = "750"; fire(w, k, "input");
  assert.ok(!$(w, "reset-kcal").hidden); assert.match($(w, "src-kcal").textContent, /eigener Wert/); assert.match($(w, "reset-kcal").textContent, /↺ Vorschlag 680/);
  assert.match($(w, "verordnung-summary").textContent, /750 kcal\/Tag, manuell/);
  fire(w, $(w, "reset-kcal"));
  assert.equal($(w, "set-kcal").value, "680");
  // Genau den Vorschlag eintippen = wieder automatisch
  k.value = "690"; fire(w, k, "input"); assert.ok(!$(w, "reset-kcal").hidden);
  k.value = "680"; fire(w, k, "input"); assert.ok($(w, "reset-kcal").hidden, "Vorschlag getippt → automatisch");
  assert.match($(w, "verordnung-summary").textContent, /680 kcal\/Tag, Vorschlag/);
  const fl = $(w, "set-fluid"); fl.value = "900"; fire(w, fl, "input");
  assert.ok(!$(w, "reset-fluid").hidden);
  fire(w, $(w, "reset-fluid"));
  assert.equal($(w, "set-fluid").value, "850"); assert.ok($(w, "reset-fluid").hidden);
  assert.match($(w, "fluid-summary").textContent, /850 ml\/Tag \(Vorschlag/);
  // Eiweiß abweichend → Standard-Link
  const pm = $(w, "set-proteinmode"); pm.value = "2"; fire(w, pm, "change");
  assert.ok(!$(w, "reset-protein").hidden);
  fire(w, $(w, "reset-protein"));
  assert.equal($(w, "set-proteinmode").value, "1.5");
  // Gewicht ändern → Vorschläge ziehen mit
  const wi = $(w, "set-weight"); wi.value = "10"; fire(w, wi, "input");
  assert.equal($(w, "set-kcal").value, "800");
  assert.equal($(w, "set-fluid").value, "1000");
});

test("Zubereitungsmenge: „1 Tag“ / „2 Tage“ folgen der Mahlzeitenzahl; Rechnen zeigt immer eine Portion", () => {
  const w = boot({ settings: { mctShare: 0, mahlzeiten: 5 } });
  let c = openRecipe(w, "Hendl & Brokkoli");
  assert.equal(c.querySelectorAll("#detail-pages > .pane").length, 4, "vier Blätter: Mahlzeit · Anpassen · Abwiegen (mit Ein Tag) · Kochen (Zubereitung + Abfüllen)");
  assert.equal(c.querySelector(".pane[data-pane=tag]"), null);
  const tagBtn = c.querySelector('.seg-portion button[data-scale="tag"]');
  assert.match(tagBtn.textContent, /^1 Tag$/); fire(w, tagBtn);
  c = $(w, "detail-content");
  assert.ok(c.querySelector('.seg-portion button[data-scale="tag"]').classList.contains("active"));
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^📅 Tag = 5 Portionen$/);
  // Mehrere Tage vorkochen: 2 Tage = 10 Portionen, Waage-Tabelle ×10, Tages-Check bleibt je Tag
  const g1 = kitchenRows(c)["Broccoli, gekocht"] / 5, kcal1 = numDe(dayTiles(c).querySelector(".dstat .v").textContent);
  assert.match(dayTiles(c).textContent, /kcal\/Tag · Ziel 700/);
  assert.match(tagStatus(c).textContent, /^Wie berechnet · 700 kcal je Tag/);
  fire(w, c.querySelector('.seg-portion button[data-scale="tag:2"]'));
  c = $(w, "detail-content");
  assert.ok(c.querySelector('.seg-portion button[data-scale="tag:2"]').classList.contains("active"));
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^📅 Tag 2 Tage = 10 Portionen$/);
  assert.equal(c.querySelector("#portion-input").value, "10");
  assert.ok(Math.abs(kitchenRows(c)["Broccoli, gekocht"] - g1 * 10) <= 0.6, "Waage ×10");
  assert.ok(Math.abs(numDe(dayTiles(c).querySelector(".dstat .v").textContent) - 2 * kcal1) <= 2, "Kacheln für 2 Tage");
  assert.match(dayTiles(c).textContent, /kcal · Ziel 1\.?400/);
  assert.match(tagStatus(c).textContent, /^Wie berechnet · 1\.?400 kcal für 2 Tage/);
  fire(w, $(w, "detail-close"));
  // Stepper: 10 → 11 (freie Portionenzahl, kein Knopf aktiv) → zurück auf 10 = wieder „2 Tage“; 5 = wieder „1 Tag“
  fire(w, c.querySelector('.seg-portion .stepbtn[data-step="1"]')); c = $(w, "detail-content");
  assert.equal(c.querySelector("#portion-input").value, "11");
  assert.equal(c.querySelector(".seg-portion button.active"), null, "11 Portionen: kein Tage-Knopf aktiv");
  fire(w, c.querySelector('.seg-portion .stepbtn[data-step="-1"]')); c = $(w, "detail-content");
  assert.ok(c.querySelector('.seg-portion button[data-scale="tag:2"]').classList.contains("active"), "10 Portionen = 2 Tage");
  { const pin5 = c.querySelector("#portion-input"); pin5.value = "5"; fire(w, pin5, "change"); } c = $(w, "detail-content");
  assert.ok(c.querySelector('.seg-portion button[data-scale="tag"]').classList.contains("active"), "5 Portionen = 1 Tag");
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^📅 Tag = 5 Portionen$/);
  // Neu öffnen: immer wieder „1 Tag“ (die Menge wird nicht gemerkt)
  c = openRecipe(w, "Hendl & Brokkoli");
  assert.ok(c.querySelector('.seg-portion button[data-scale="tag"]').classList.contains("active"), "öffnet mit 1 Tag");
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^📅 Tag = 5 Portionen$/);
  // Rechnen: Mahlzeit-Kacheln und Tabelle je Portion, obwohl 5 Portionen zubereitet werden
  const kcalTile = [...c.querySelectorAll(".pane[data-pane=mahlzeit] .dstat, .pane[data-pane=abwiegen] .dstat, .pane[data-pane=anpassen] .dstat")][0];
  assert.ok(Math.abs(parseFloat(kcalTile.querySelector(".v").textContent) - 140) <= 1, kcalTile.textContent);
  assert.match(rechnenText(c), /Mahlzeit eine Portion/);
  assert.match(rechnenText(c), /Summe je Portion/);
  fire(w, $(w, "detail-close"));
  // Mahlzeiten auf 4 → Ganzer Tag ist jetzt ×4, nicht mehr 5
  const mi = $(w, "set-mahlzeiten"); mi.value = "4"; fire(w, mi, "input");
  c = openRecipe(w, "Hendl & Brokkoli");
  assert.ok(c.querySelector('.seg-portion button[data-scale="tag"]').classList.contains("active"));
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^📅 Tag = 4 Portionen$/);
  const kcal4 = [...c.querySelectorAll(".pane[data-pane=mahlzeit] .dstat, .pane[data-pane=abwiegen] .dstat, .pane[data-pane=anpassen] .dstat")][0];
  assert.ok(Math.abs(parseFloat(kcal4.querySelector(".v").textContent) - 175) <= 1, kcal4.textContent);
  // Zurück auf 1 Portion
  assert.equal(c.querySelector('.seg-portion button[data-scale="1"]'), null, "kein Knopf „1 Portion“ – dafür gibt es das Blatt Mahlzeit");
  { const pin1 = c.querySelector("#portion-input"); pin1.value = "1"; fire(w, pin1, "change"); }
  c = $(w, "detail-content");
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^📅 Tag eine Portion$/);
});

test("Rechnen: Gramm je Portion ändern skaliert alle Zutaten, wird gemerkt, wirkt im Tagesplan, lässt sich zurücksetzen", () => {
  const w = boot({ settings: { mctShare: 0, mahlzeiten: 5, weight: 8.5 } });
  let c = openRecipe(w, "Hendl & Brokkoli");
  const kochenBefore = kitchenRows(c);
  const row = [...c.querySelectorAll(".pane[data-pane=mahlzeit] table tr, .pane[data-pane=abwiegen] table tr, .pane[data-pane=anpassen] table tr")].find(r => /Hüh/.test(r.textContent));
  const inp = row.querySelector("input.g-edit");
  assert.ok(inp, "Gramm-Feld in Rechnen fehlt");
  const g0 = parseFloat(inp.value);
  inp.value = String(g0 / 2); fire(w, inp, "change");
  c = $(w, "detail-content");
  // Portion halbiert: kcal 70 statt 140, Verhältnis bleibt, Statuszeile + Zurücksetzen
  const kcalTile = [...c.querySelectorAll(".pane[data-pane=mahlzeit] .dstat, .pane[data-pane=abwiegen] .dstat, .pane[data-pane=anpassen] .dstat")][0];
  assert.ok(Math.abs(parseFloat(kcalTile.querySelector(".v").textContent) - 70) <= 1, kcalTile.textContent);
  assert.match(kcalTile.textContent, /Ziel 140/);
  assert.ok(Math.abs(ratioOf(c) - 1.8) <= 0.03, "halbe Portion: Fett auf 0,1 g gerundet → " + ratioOf(c));
  assert.match(c.querySelector(".portion-line").textContent, /Portion angepasst: 50 %/);
  const brok = [...c.querySelectorAll(".pane[data-pane=mahlzeit] table tr, .pane[data-pane=abwiegen] table tr, .pane[data-pane=anpassen] table tr")].find(r => /Broccoli/.test(r.textContent)).querySelector("input.g-edit");
  const kochenAfter = kitchenRows(c);
  assert.ok(Math.abs(kochenAfter["Broccoli, gekocht"] - kochenBefore["Broccoli, gekocht"] / 2) <= 1.5, "Abwiegen (5 ×) skaliert mit (0,5-g-Rundung)");
  assert.ok(Math.abs(parseFloat(brok.value) - kochenBefore["Broccoli, gekocht"] / 5 / 2) <= 0.3, "Rechnen (je Portion) skaliert mit (0,5-g-Rundung)");
  // Tages-Check (Abwiegen) rechnet mit der angepassten Portion (5 × 70 = 350 kcal, unter dem Minimum → Warnung)
  assert.match(tagStatus(c).textContent, /Portion angepasst: 50 %/);
  assert.match(dayTiles(c).textContent, /kcal\/Tag · Ziel 700/);
  assert.ok(Math.abs(parseFloat(dayTiles(c).querySelector(".dstat .v").textContent) - 350) <= 8, "halbe Portion × 5 (Rundung)");
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .note.warn").textContent, /unter dem Minimum von \d+ kcal/);
  fire(w, $(w, "detail-close"));
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  assert.ok(Math.abs(st.portion["fam:Hendl & Brokkoli"] - 0.5) < 0.01, "Faktor gemerkt: " + st.portion["fam:Hendl & Brokkoli"]);
  // Tagesplan nutzt dieselbe Mahlzeit
  st.dayPlan = [0, 1, 2, 3, 4].map(() => ({ key: "std:Hendl & Brokkoli" }));
  const w2 = boot(st);
  fire(w2, $(w2, "tab-heute"));
  const kcalDay = [...$(w2, "heute-content").querySelectorAll(".dstat")][0].querySelector(".v").textContent;
  assert.ok(Math.abs(parseFloat(kcalDay) - 350) <= 8, "Tagesplan: " + kcalDay);
  // Zurücksetzen
  c = openRecipe(w2, "Hendl & Brokkoli");
  fire(w2, c.querySelector(".pane[data-pane=mahlzeit] .portion-reset"));
  c = $(w2, "detail-content");
  assert.ok(Math.abs(parseFloat([...c.querySelectorAll(".pane[data-pane=mahlzeit] .dstat, .pane[data-pane=abwiegen] .dstat, .pane[data-pane=anpassen] .dstat")][0].querySelector(".v").textContent) - 140) <= 1);
  assert.match(c.querySelector(".portion-line").textContent, /Wie berechnet/);
  assert.equal(JSON.parse(w2.localStorage.getItem("ketoplaner.v5")).portion["fam:Hendl & Brokkoli"], undefined);
  // Wasser in Rechnen ändern → gemerktes Wasser, keine Skalierung
  const wrow = [...c.querySelectorAll(".pane[data-pane=mahlzeit] table tr, .pane[data-pane=abwiegen] table tr, .pane[data-pane=anpassen] table tr")].find(r => /Wasser/.test(r.textContent)).querySelector("input.g-edit");
  wrow.value = "80"; fire(w2, wrow, "change");
  c = $(w2, "detail-content");
  assert.equal(kitchenRows(c)["Wasser"], 80 * 5, "Abwiegen zeigt den Tag (5 ×)");
  // Statuszeile wie bei der Portion: „Wasser angepasst (80 statt … ml) · ↺ wie berechnet“; in der Zeile nur „⟵ eigener Wert“
  const line = c.querySelector(".pane[data-pane=mahlzeit] .portion-line");
  assert.match(line.textContent, /Wasser angepasst \(80 statt \d+ ml\) · ↺ wie berechnet/);
  assert.doesNotMatch(line.textContent, /Wie berechnet/);
  const wrowTxt = [...c.querySelectorAll(".pane[data-pane=mahlzeit] table tr")].find(r => /Wasser/.test(r.textContent)).textContent;
  assert.match(wrowTxt, /eigener Wert/); assert.doesNotMatch(wrowTxt, /↺/);
  // Zurücksetzen aus der Statuszeile (Seite Mahlzeit)
  const wr = line.querySelector(".water-reset");
  assert.ok(wr, "↺ wie berechnet in der Statuszeile"); fire(w2, wr);
  c = $(w2, "detail-content");
  assert.ok(kitchenRows(c)["Wasser"] !== 400 && !c.querySelector(".water-reset"), "Wasser wieder berechnet");
  assert.match(c.querySelector(".pane[data-pane=mahlzeit] .portion-line").textContent, /Wie berechnet/);
});

test("Rundung beim Abwiegen: Zutaten auf 0,5 g, Wasser auf 1 ml, Fettträger auf 0,1 g mit nachgestelltem Verhältnis (keine Einstellung)", () => {
  const w = boot({ settings: { mctShare: 0 } });
  assert.equal($(w, "rundung-ctl"), null, "kein Rundungs-Schalter mehr");
  let c = openRecipe(w, "Hendl & Brokkoli");
  const rows = kitchenRows(c);
  const on = (v, st) => Math.abs(v / st - Math.round(v / st)) < 1e-6;
  assert.ok(on(rows["Hühnerbrust ohne Haut"], 0.5) && on(rows["Broccoli, gekocht"], 0.5), "0,5-g-Raster: " + JSON.stringify(rows));
  assert.ok(on(rows["Wasser"], 1), "Wasser auf 1 ml: " + rows["Wasser"]);
  assert.ok(on(rows["Rapsöl"], 0.1), "Fett auf 0,1 g");
  assert.match([...c.querySelectorAll("table.kitchen tbody tr")].find(r => /Rapsöl/.test(r.textContent)).querySelector("input").value, /^\d+\.\d$/, "Fett immer mit einer Nachkommastelle");
  assert.ok(Math.abs(ratioOf(c) - 1.8) <= 0.015, "Verhältnis nach Rundung: " + ratioOf(c));
  // Ganzer Tag ×5: Vielfache bleiben im Raster
  fire(w, c.querySelector('.seg-portion button[data-scale="tag"]'));
  c = $(w, "detail-content");
  const rows3 = kitchenRows(c);
  assert.ok(on(rows3["Broccoli, gekocht"], 0.5) && on(rows3["Rapsöl"], 0.1), "Tagesmenge im Raster: " + JSON.stringify(rows3));
});

test("Vorgaben: Gewicht als Textfeld mit Komma – Zwischenstand „8,“ wird beim Tippen nicht überschrieben", () => {
  const w = boot({ settings: { weight: 8 } });
  const wi = $(w, "set-weight");
  assert.equal(wi.getAttribute("type"), "text");
  assert.equal(wi.getAttribute("inputmode"), "decimal");
  assert.equal(wi.value, "8");
  wi.focus();
  wi.value = "8,"; fire(w, wi, "input");
  assert.equal(wi.value, "8,", "Feld bleibt beim Tippen unangetastet");
  wi.value = "8,5"; fire(w, wi, "input");
  assert.equal(wi.value, "8,5");
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.weight, 8.5);
  assert.match($(w, "rx-chip").textContent, /850 ml\/Tag/);
  fire(w, wi, "change"); wi.blur();
  assert.equal(wi.value, "8,5");
  // Punkt geht ebenso
  wi.value = "9.5"; fire(w, wi, "input"); fire(w, wi, "change");
  assert.equal(wi.value, "9,5");
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.weight, 9.5);
});

test("Vorgaben: Verhältnis händisch (nur die vordere Zahl, „:1“ fix) wirkt global, Chip zeigt aktive Verordnung, Backup-Roundtrip", () => {
  const w = boot({ settings: { kcal: 700 } });
  const ri = $(w, "set-ratio");
  assert.equal(ri.value, "1,8");
  assert.equal(ri.parentElement.querySelector(".ratio-suffix").textContent, ":1");
  assert.ok($(w, "eiweiss-manual").hidden, "Gramm-Feld nur bei manuell");
  assert.match($(w, "eiweiss-auto").textContent, /= 12 g\/Tag/);
  assert.match($(w, "rx-chip").textContent, /💧 800 ml\/Tag · zwischen den Mahlzeiten: 4 × 60 ml · Rest in den Mahlzeiten/);
  assert.ok(!$(w, "mct-more").hidden, "MCT-Karte bei 10 % offen");
  // Abwiegen: Tages-Check = Portion × Mahlzeiten, unabhängig von der Zubereitungsmenge; Waage-Tabelle folgt der Menge
  {
    let c = openRecipe(w, "Hendl & Brokkoli");
    const dayKcal = numDe(dayTiles(c).querySelector(".dstat .v").textContent);
    assert.ok(Math.abs(dayKcal - 5 * kcalOf(c)) <= 3, "Tag = 5 × Portion: " + dayKcal);
    assert.match(dayTiles(c).textContent, /kcal\/Tag · Ziel 700/);
    // „1 Tag“: jede Zeile der Waage-Tabelle = 5 × Mahlzeit
    fire(w, c.querySelector('.seg-portion button[data-scale="tag"]'));
    c = $(w, "detail-content");
    const mealRows = c.querySelector(".pane[data-pane=mahlzeit] table").querySelectorAll("tbody tr:not(.sum)");
    const dayRows = c.querySelector(".pane[data-pane=abwiegen] table.kitchen").querySelectorAll("tbody tr:not(.sum)");
    assert.equal(dayRows.length, mealRows.length);
    const gramsOf = (tr) => parseFloat(tr.children[1].querySelector("input").value);
    for (let i = 0; i < mealRows.length; i++) assert.ok(Math.abs(gramsOf(dayRows[i]) - 5 * gramsOf(mealRows[i])) <= 0.3, "Zeile " + i);
    const pin = c.querySelector("#portion-input"); pin.value = "3"; fire(w, pin, "change");
    const c2 = $(w, "detail-content");
    assert.match(tagStatus(c2).textContent, /^Wie berechnet · 420 kcal für 3 Portionen/);
    assert.match(c2.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^📅 Tag 3 Portionen$/);
    fire(w, $(w, "detail-close"));
  }
  ri.value = "1:"; fire(w, ri, "input");            // unvollständige Eingabe ändert nichts
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5") || "{}").settings.ratio, 1.8);
  ri.value = "1"; fire(w, ri, "input");
  assert.match($(w, "rx-chip").textContent, /^1:1 /);
  let c = openRecipe(w, "Hendl & Brokkoli");
  assert.ok(Math.abs(ratioOf(c) - 1.0) <= 0.05);
  fire(w, $(w, "detail-close"));
  ri.value = "0,67"; fire(w, ri, "input"); fire(w, ri, "change");
  assert.equal(ri.value, "0,67");
  assert.match($(w, "ratio-hint").textContent, /0,67:1 heißt nur 0,67 g Fett je 1 g Eiweiß\+KH – weniger Fett als Eiweiß\+KH/);
  assert.ok($(w, "verordnung-summary").classList.contains("warn"), "Zusammenfassung als Warnung");
  ri.value = "1,5"; fire(w, ri, "input");
  assert.equal($(w, "ratio-hint"), null, "kein Hinweis bei Werten ab 1:1");
  assert.ok($(w, "verordnung-summary").classList.contains("tip"));
  ri.value = "1:1,5"; fire(w, ri, "input"); // alte Schreibweise wird weiterhin verstanden
  assert.match($(w, "rx-chip").textContent, /^0,67:1 /);
  assert.ok(Math.abs(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.ratio - 2 / 3) < 1e-9);
  c = openRecipe(w, "Compleat");
  assert.match(c.querySelector(".ratio-pill").textContent, /^0,6[67]:1$/);
  fire(w, $(w, "detail-close"));
  ri.value = "1"; fire(w, ri, "input");
  fire(w, $(w, "export-btn"));
  const json = $(w, "export-text").value;
  const w2 = boot();
  $(w2, "export-text").value = json; fire(w2, $(w2, "import-text-btn"));
  assert.equal(JSON.parse(w2.localStorage.getItem("ketoplaner.v5")).settings.ratio, 1);
});

test("Tagesplan: Slots folgen der Mahlzeitenzahl, Picker setzt Rezept, Summen stimmen", () => {
  const w = boot({ settings: { mctShare: 0.1 } });
  fire(w, $(w, "tab-heute"));
  let hc = $(w, "heute-content");
  assert.equal(hc.querySelectorAll(".slot.empty-slot").length, 5);
  fire(w, hc.querySelector("[data-pick=\"0\"]"));
  assert.equal($(w, "picker-overlay").hidden, false);
  fire(w, [...w.document.querySelectorAll("#picker-list .pick-row")].find(b => /^Hendl & Brokkoli/.test(b.querySelector(".pick-name").textContent)));
  hc = $(w, "heute-content");
  assert.equal(hc.querySelectorAll(".slot:not(.empty-slot)").length, 1);
  const kcalTile = [...hc.querySelectorAll(".card:last-child .dstat")][0].querySelector(".v").textContent;
  assert.ok(Math.abs(parseFloat(kcalTile) - 139) <= 2, "Tagessumme kcal: " + kcalTile);
  const mctTile = [...hc.querySelectorAll(".card:last-child .dstat")][3].querySelector(".v").textContent;
  assert.match(mctTile, /1,2/);
  $(w, "set-mahlzeiten").value = "3"; fire(w, $(w, "set-mahlzeiten"), "input");
  assert.equal($(w, "heute-content").querySelectorAll(".slot").length, 3);
});

test("Flüssigkeit: Vorschlag nach Gewicht; zwei Stellungen – zwischen den Mahlzeiten sondieren oder in den Mahlzeiten dabei; Tagesplan", () => {
  const w = boot({ settings: { mctShare: 0, mahlzeiten: 4, weight: 8.5, wasserModus: "ausgewogen" } }); // alter Wert → „zwischen“
  assert.equal($(w, "set-fluid").value, "850");
  assert.equal(w.document.querySelectorAll("#wasser-modus-ctl button").length, 2, "nur zwei Stellungen");
  assert.ok(w.document.querySelector("#wasser-modus-ctl button[data-wmodus=zwischen]").classList.contains("active"));
  assert.ok(!$(w, "set-zwischen").disabled, "Menge je Zwischenzeit aktiv");
  assert.equal($(w, "set-maxmahl"), null, "kein Feld für die Höchstmenge mehr");
  assert.match($(w, "fluid-summary").textContent, /850 ml\/Tag .*Holliday-Segar.*3 × 60 ml zwischen den Mahlzeiten sondieren \(180 ml\), Rest 670 ml in den Mahlzeiten: je 168 ml/);
  // „zwischen“: Mahlzeit wird auf 168 ml aufgefüllt, Rest per Spritze
  let c = openRecipe(w, "Hendl & Brokkoli");
  const waterZ = kitchenRows(c)["Wasser"];
  const paneZ = rechnenText(c);
  assert.match(paneZ, /Flüssigkeit\/Tag · Ziel 850 ml/); assert.match(paneZ, /Zwischen den Mahlzeiten: 3 × 60 ml \(je eine Spritze\)/);
  assert.match(c.querySelector(".pane[data-pane=mahlzeit]").textContent, /Ziel 168 ml je Mahlzeit/);
  fire(w, $(w, "detail-close"));
  // „in den Mahlzeiten dabei“: Wasser steigt, Mahlzeit erreicht ≈ 213 ml, Tag ≈ 850 ml; Feld je Zwischenzeit verschwindet
  fire(w, w.document.querySelector("#wasser-modus-ctl button[data-wmodus=mahlzeit]"));
  assert.ok($(w, "set-zwischen").disabled, "Menge je Zwischenzeit ausgegraut, Feld bleibt an Ort und Stelle");
  assert.ok(!$(w, "zwischen-field").hidden);
  assert.match($(w, "fluid-summary").textContent, /alles in den Mahlzeiten: je 213 ml/);
  assert.match($(w, "rx-chip").textContent, /alles in den Mahlzeiten \(je 213 ml\)/);
  c = openRecipe(w, "Hendl & Brokkoli");
  assert.ok(kitchenRows(c)["Wasser"] > waterZ, "Wasser erhöht");
  assert.match(c.querySelector("table.kitchen").textContent, /Flüssigkeitsziel/);
  assert.match(c.querySelector(".pane[data-pane=mahlzeit]").textContent, /Flüssigkeit je Portion ≈ 21[23] ml/);
  const tile = [...c.querySelectorAll(".pane[data-pane=mahlzeit] .dstat, .pane[data-pane=abwiegen] .dstat, .pane[data-pane=anpassen] .dstat")].find(t => /Flüssigkeit\/Tag/.test(t.textContent));
  assert.ok(Math.abs(parseFloat(tile.querySelector(".v").textContent) - 850) <= 3, tile.textContent);
  assert.match(rechnenText(c), /in den Mahlzeiten dabei/);
  assert.equal(ratioOf(c), 1.8);
  // Gemerktes Wasser hat Vorrang
  const win = [...c.querySelectorAll("table.kitchen tr")].find(r => /Wasser/.test(r.textContent)).querySelector("input");
  win.value = "40"; fire(w, win, "change"); // 4 Mahlzeiten → 10 ml je Portion
  c = $(w, "detail-content");
  assert.equal(kitchenRows(c)["Wasser"], 40);
  assert.match(c.querySelector(".pane[data-pane=mahlzeit]").textContent, /nicht erreicht/);
  fire(w, $(w, "detail-close"));
  // Tagesplan im Modus „zwischen“: Flüssigkeits-Kachel und Sondier-Hinweis
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  st.settings.wasserModus = "zwischen"; st.water = {};
  st.dayPlan = [0, 1, 2, 3].map(() => ({ key: "std:Hendl & Brokkoli" }));
  const w2 = boot(st);
  fire(w2, $(w2, "tab-heute"));
  const t2 = $(w2, "heute-content").textContent;
  assert.match(t2, /Flüssigkeit · Ziel 850 ml/); assert.match(t2, /Zwischen den Mahlzeiten: 3 × 60 ml \(je eine Spritze\) – Tagesbedarf 850 ml erreicht/);
  assert.match($(w2, "rx-chip").textContent, /zwischen den Mahlzeiten: 3 × 60 ml · Rest in den Mahlzeiten/);
  assert.doesNotMatch($(w2, "rx-chip").textContent, /fehlen/);
  // Manuelle Vorgabe
  const fl = $(w2, "set-fluid"); fl.value = "900"; fire(w2, fl, "input");
  assert.match($(w2, "fluid-summary").textContent, /900 ml\/Tag .*manuell/);
  // Standard (ohne gespeicherten Modus) = „zwischen“: Wasser bis zur Höchstmenge (210 ml, 25 ml/kg) in die Mahlzeit
  const w3 = boot({ settings: { mctShare: 0, mahlzeiten: 4, weight: 8.5, kcal: 750, ratio: 1.5 } });
  assert.match($(w3, "fluid-summary").textContent, /3 × 60 ml zwischen den Mahlzeiten sondieren .* \(höchstens 210 ml je Mahlzeit, 25 ml\/kg\)/);
  let c3 = openRecipe(w3, "Compleat & KetoCal");
  const kochen = c3.querySelector(".pane[data-pane=abwiegen]").textContent;
  assert.match(kochen, /Flüssigkeitsziel/); assert.match(c3.querySelector(".pane[data-pane=mahlzeit]").textContent, /Ziel 168 ml je Mahlzeit/);
  const vol = parseFloat([...c3.querySelectorAll(".pane[data-pane=mahlzeit] .dstat, .pane[data-pane=abwiegen] .dstat, .pane[data-pane=anpassen] .dstat")].find(t => /Volumen/.test(t.textContent)).querySelector(".v").textContent.replace(/[^\d]/g, ""));
  assert.ok(vol <= 212 && vol >= 180, "Mahlzeit unter Höchstmenge: " + vol);
  const fluidTile = [...c3.querySelectorAll(".pane[data-pane=mahlzeit] .dstat, .pane[data-pane=abwiegen] .dstat, .pane[data-pane=anpassen] .dstat")].find(t => /Flüssigkeit\/Tag/.test(t.textContent));
  assert.ok(Math.abs(parseFloat(fluidTile.querySelector(".v").textContent) - 670) <= 3, "Mahlzeiten liefern 850 − 180: " + fluidTile.textContent);
  const paneA = rechnenText(c3);
  assert.match(paneA, /Zwischen den Mahlzeiten: 3 × 60 ml \(je eine Spritze\) – Tagesbedarf 850 ml erreicht/);
  assert.match($(w3, "rx-chip").textContent, /zwischen den Mahlzeiten: 3 × 60 ml/);
  // Zwischenzeit auf 0 ml: Mahlzeiten müssten 213 ml Flüssigkeit liefern – über der Höchstmenge → Hinweis auf Fehlmenge
  fire(w3, $(w3, "detail-close"));
  const zw = $(w3, "set-zwischen"); zw.value = "0"; fire(w3, zw, "input");
  c3 = openRecipe(w3, "Compleat & KetoCal");
  assert.match(rechnenText(c3), /am Tag fehlen noch \d+ ml/);
  zw.value = ""; fire(w3, zw, "input");
  assert.equal(c3.querySelector(".ratio-pill").textContent, "1,50:1");
  fire(w3, $(w3, "detail-close"));
  // Gericht, das von selbst groß ist: kein Wasser über die Höchstmenge hinaus
  c3 = openRecipe(w3, "Hendl & Brokkoli");
  const vol2 = parseFloat([...c3.querySelectorAll(".pane[data-pane=mahlzeit] .dstat, .pane[data-pane=abwiegen] .dstat, .pane[data-pane=anpassen] .dstat")].find(t => /Volumen/.test(t.textContent)).querySelector(".v").textContent.replace(/[^\d]/g, ""));
  assert.ok(vol2 <= 212, "nicht über Höchstmenge: " + vol2);
});

test("Anpassen: Statuszeile mit Zurücksetzen – Fleisch nur in der Ansicht, MCT-Anteil gilt für alle Rezepte", () => {
  const w = boot({ settings: { mctShare: 0.1, mahlzeiten: 5 } });
  let c = openRecipe(w, "Hendl & Brokkoli");
  const st = () => c.querySelector(".pane[data-pane=anpassen] .portion-line").textContent;
  assert.match(st(), /^Wie im Rezept · Fleisch gilt nur in dieser Ansicht · der MCT-Anteil ist die Vorgabe für alle Rezepte$/);
  assert.match(c.querySelector(".pane[data-pane=anpassen] .ph").textContent, /Fleisch nur hier · Öl für alle Rezepte/);
  // Fleisch tauschen → Statuszeile + ↺ wie im Rezept
  fire(w, c.querySelector('.meat-swap button[data-meat="rind"]')); c = $(w, "detail-content");
  assert.match(st(), /^Fleisch getauscht: 🥩 Rind \(nur in dieser Ansicht\) · ↺ wie im Rezept$/);
  assert.ok([...c.querySelectorAll(".pane[data-pane=mahlzeit] table tr")].some(r => /Rind/.test(r.textContent)), "Rind in der Tabelle");
  fire(w, c.querySelector(".meat-reset")); c = $(w, "detail-content");
  assert.match(st(), /^Wie im Rezept/);
  assert.ok([...c.querySelectorAll(".pane[data-pane=mahlzeit] table tr")].some(r => /Hüh/.test(r.textContent)), "wieder Huhn");
  // MCT-Anteil ändern → gilt global (Vorgaben), Statuszeile nennt den Wert beim Öffnen, ↺ stellt ihn wieder her
  fire(w, c.querySelector('.meat-swap button[data-mcts="30"]')); c = $(w, "detail-content");
  assert.match(st(), /^MCT-Anteil 30 % statt 10 % – gilt für alle Rezepte \(Vorgaben\) · ↺ 10 %$/);
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.mctShare, 0.3);
  fire(w, c.querySelector(".mct-reset")); c = $(w, "detail-content");
  assert.match(st(), /^Wie im Rezept/);
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.mctShare, 0.1);
  // Neu öffnen mit 30 %: dann ist 30 % der Bezug (nichts zum Zurücksetzen)
  fire(w, c.querySelector('.meat-swap button[data-mcts="30"]'));
  fire(w, $(w, "detail-close"));
  c = openRecipe(w, "Hendl & Brokkoli");
  assert.match(st(), /^Wie im Rezept/);
});

test("Overlays frieren den Hintergrund ein (body.modal-open) und geben ihn beim Schließen wieder frei", () => {
  const w = boot({ settings: { mctShare: 0 } });
  const body = w.document.body;
  let c = openRecipe(w, "Hendl & Zucchini");
  assert.ok(body.classList.contains("modal-open"));
  fire(w, c.querySelector("button[data-open-rec]")); // Geschwister-Rezept öffnet die Ansicht erneut – bleibt gesperrt
  assert.ok(body.classList.contains("modal-open"));
  fire(w, $(w, "detail-close"));
  assert.ok(!body.classList.contains("modal-open"), "nach dem Schließen frei");
  assert.equal(body.style.top, "");
  // Detail → Editor: Detail schließt, Editor hält die Sperre; Editor schließen gibt frei
  c = openRecipe(w, "Hendl & Zucchini");
  fire(w, c.querySelector("#edit-btn"));
  assert.ok($(w, "detail-overlay").hidden && !$(w, "compose-overlay").hidden);
  assert.ok(body.classList.contains("modal-open"), "Editor hält die Sperre");
  fire(w, $(w, "compose-close"));
  assert.ok(!body.classList.contains("modal-open"));
});

test("Kochen: Garzeiten-Hinweis nur bei gekochten Gerichten, nicht bei Angerührtem", () => {
  const w = boot({ settings: { mctShare: 0, mahlzeiten: 4 } });
  let c = openRecipe(w, "Compleat & KetoCal"); // öffnet mit 1 Tag = 4 Portionen
  assert.doesNotMatch(c.querySelector(".pane[data-pane=zubereitung]").textContent, /Garzeiten/);
  fire(w, $(w, "detail-close"));
  c = openRecipe(w, "Hendl & Brokkoli");
  assert.match(c.querySelector(".pane[data-pane=zubereitung]").textContent, /Garzeiten gelten für eine Portion/);
});

test("Editor (eigenes Rezept) im Detail-Layout: Kopf mit Name, zwei Blätter, Kacheln/Tabelle wie Mahlzeit, Speichern aus der Aktionsleiste", () => {
  const w = boot({ settings: { mctShare: 0, kcal: 700, mahlzeiten: 5 } });
  fire(w, $(w, "compose-btn"));
  const c = $(w, "compose-content");
  assert.ok(!$(w, "compose-overlay").hidden);
  assert.equal(c.querySelectorAll("#compose-pages > .pane").length, 2);
  assert.ok(c.querySelector(".detail-head #compose-name"), "Name im Kopf");
  assert.ok(c.querySelector("#compose-actions #compose-save"), "Speichern in der Aktionsleiste");
  // Zutat wählen → Ergebnisblatt wie Mahlzeit: Statuszeile, vier Kacheln, Tabelle mit Fettzeile
  const sel = c.querySelector("#compose-rows .food-select"); sel.value = "Hühnerbrust ohne Haut"; fire(w, sel, "change");
  const res = c.querySelector(".pane[data-pane=mahlzeit]");
  assert.match(res.querySelector(".portion-line").textContent, /^Wie berechnet · 140 kcal je Mahlzeit · Fett für 1,8:1 berechnet$/);
  assert.equal(res.querySelectorAll(".detail-tiles .dstat").length, 4);
  assert.match(res.querySelectorAll(".detail-tiles .dstat")[0].textContent, /140.*kcal · Ziel 140/);
  assert.match(res.querySelector("table tr.fatrow").textContent, /Schlagobers.*stellt das Verhältnis ein/);
  assert.match(c.querySelector("#compose-meta").textContent, /1,80:1.*140 kcal je Portion/);
  // Speichern braucht einen Namen (Kopf)
  const nm = c.querySelector("#compose-name"); nm.value = "Mein Hendl"; fire(w, nm, "input");
  fire(w, c.querySelector("#compose-save"));
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  assert.equal(st.savedRecipes.length, 1); assert.equal(st.savedRecipes[0].name, "Mein Hendl");
  assert.ok(st.savedRecipes[0].items.some(it => /Schlagobers/.test(it.food)));
  fire(w, $(w, "compose-close"));
  assert.ok(tileNames(w).includes("Mein Hendl"), "eigenes Rezept in der Liste");
});

test("Pille: Tipp öffnet die Vorgaben, zweiter Tipp führt zurück zur vorigen Ansicht", () => {
  const w = boot({ settings: { view: "rezepte" } });
  const chip = $(w, "rx-chip");
  fire(w, chip);
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.view, "vorgaben");
  assert.ok(!$(w, "view-vorgaben").hidden && $(w, "view-rezepte").hidden);
  assert.ok(chip.classList.contains("back"), "Pille zeigt den Zurück-Zustand");
  assert.match(chip.title, /Zurück zu Rezepte/);
  fire(w, chip);
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.view, "rezepte");
  assert.ok(!$(w, "view-rezepte").hidden && $(w, "view-vorgaben").hidden);
  assert.ok(!chip.classList.contains("back"));
  // Von Heute aus: zurück nach Heute; über die Leiste gewechselt → Pille öffnet nur, kein Zurück
  fire(w, $(w, "tab-heute")); fire(w, chip); fire(w, chip);
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.view, "heute");
  fire(w, w.document.querySelector('.tabbar button[data-view="vorgaben"]'));
  assert.ok(!chip.classList.contains("back"), "über die Leiste geöffnet: kein Zurück");
  fire(w, chip);
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.view, "vorgaben", "bleibt in den Vorgaben");
});

test("Darstellung: Hell/Dunkel-Schalter unter Vorgaben – auto folgt dem Gerät, hell/dunkel erzwingen per data-theme", () => {
  const w = boot({ settings: { view: "vorgaben" } });
  const root = w.document.documentElement;
  assert.equal(root.getAttribute("data-theme"), null, "auto: kein Attribut");
  assert.ok(w.document.querySelector('#theme-ctl button[data-theme="auto"]').classList.contains("active"));
  fire(w, w.document.querySelector('#theme-ctl button[data-theme="dark"]'));
  assert.equal(root.getAttribute("data-theme"), "dark");
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.theme, "dark");
  assert.ok(w.document.querySelector('#theme-ctl button[data-theme="dark"]').classList.contains("active"));
  assert.ok([...w.document.querySelectorAll('meta[name="theme-color"]')].every(m => m.getAttribute("content") === "#1a2320"));
  // Neustart übernimmt die Wahl; „Wie das Gerät“ entfernt das Attribut wieder
  const w2 = boot(JSON.parse(w.localStorage.getItem("ketoplaner.v5")));
  assert.equal(w2.document.documentElement.getAttribute("data-theme"), "dark");
  fire(w2, w2.document.querySelector('#theme-ctl button[data-theme="auto"]'));
  assert.equal(w2.document.documentElement.getAttribute("data-theme"), null);
});

test("Detail: Kopf antippen und nach unten wischen schließt die Ansicht (nicht bei kurzem oder seitlichem Wisch)", async () => {
  const w = boot({ settings: { mctShare: 0 } });
  const touch = (el, type, x, y) => { const ev = new w.Event(type, { bubbles: true }); ev.touches = [{ clientX: x, clientY: y }]; ev.changedTouches = ev.touches; el.dispatchEvent(ev); };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  let c = openRecipe(w, "Hendl & Brokkoli");
  const head = c.querySelector(".detail-head");
  // kurzer Wisch: bleibt offen
  touch(head, "touchstart", 100, 50); await wait(320); touch(head, "touchmove", 100, 90); touch(head, "touchend", 100, 90); await wait(220);
  assert.ok(!$(w, "detail-overlay").hidden, "kurzer Wisch schließt nicht");
  // seitlicher Wisch (Blätterwechsel): bleibt offen
  touch(head, "touchstart", 100, 50); await wait(320); touch(head, "touchmove", 260, 80); touch(head, "touchend", 260, 80); await wait(220);
  assert.ok(!$(w, "detail-overlay").hidden, "seitlicher Wisch schließt nicht");
  // langer Wisch nach unten: schließt
  touch(head, "touchstart", 100, 50); await wait(320); touch(head, "touchmove", 105, 200); touch(head, "touchend", 105, 200); await wait(220);
  assert.ok($(w, "detail-overlay").hidden, "langer Wisch nach unten schließt");
  // Wisch auf der Tabelle (nicht am Kopf) tut nichts
  c = openRecipe(w, "Hendl & Brokkoli");
  const tbl = c.querySelector(".pane[data-pane=mahlzeit] table");
  touch(tbl, "touchstart", 100, 300); touch(tbl, "touchmove", 100, 500); touch(tbl, "touchend", 100, 500); await wait(220);
  assert.ok(!$(w, "detail-overlay").hidden, "Wisch auf dem Inhalt schließt nicht");
});
