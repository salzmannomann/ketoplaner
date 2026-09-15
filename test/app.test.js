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
  if (stored) window.localStorage.setItem("ketoplaner.v5", JSON.stringify(stored));
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
const kcalOf = (c) => parseFloat([...c.querySelectorAll(".pane[data-pane=rechnen] .dstat .v")][0].textContent.replace(".", ""));
function kitchenRows(c) {
  const out = {};
  [...c.querySelectorAll("table.kitchen tr")].forEach(r => {
    out[r.querySelector(".name").textContent.replace(/⟵.*/, "").trim()] = parseFloat(r.querySelector("input").value);
  });
  return out;
}
function clickChip(w, label) {
  const b = [...w.document.querySelectorAll("#filter-bar button.chip")].find(x => x.textContent.trim() === label);
  assert.ok(b, "Filter-Chip fehlt: " + label);
  fire(w, b);
}
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

test("Alle Rezepte (beide KetoCal-Phasen) treffen das Zielverhältnis bei 1,8:1 und 1:1 (ohne MCT)", () => {
  for (const ratio of [1.8, 1.0]) for (const phase of ["mit", "ohne"]) {
    const w = boot({ settings: { ratio: ratio, mctShare: 0, ketocal: phase } });
    assert.ok(tiles(w).length >= 30, "zu wenige Gerichte: " + tiles(w).length);
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
  const c0 = openRecipe(base, "Hendl & Brokkoli");
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
    const kc = kcalOf(switchDetailTab(w, "rechnen"));
    assert.ok(kc <= lastKcal + 1, "kcal müssen mit s sinken");
    lastKcal = kc;
  }
  let lastR = 0;
  for (const s of [0.1, 0.5, 1]) {
    const w = boot({ settings: { mctShare: s, mctMode: "kalorien" } });
    const c = openRecipe(w, "Hendl & Brokkoli");
    const kc = kcalOf(switchDetailTab(w, "rechnen"));
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
  assert.ok(Math.abs(r2["Broccoli, gekocht"] - before["Broccoli, gekocht"] * 2) < 0.2);
  assert.ok(Math.abs(r2["Wasser"] - 200) < 0.2);
});

test("Abfüllen: Menge je Portion ohne Öl × Portionen = ölfreie Gesamtmenge", () => {
  const w = boot({ settings: { mctShare: 0 } });
  let c = openRecipe(w, "Hendl & Brokkoli");
  const pin = c.querySelector("#portion-input"); pin.value = "10"; fire(w, pin, "change");
  c = switchDetailTab(w, "abfuellen");
  const per = parseFloat(c.querySelector(".fill-big").textContent.replace(/[^\d]/g, ""));
  const note = c.querySelector(".pane[data-pane=abfuellen] .note.info").textContent;
  const total = parseFloat((note.match(/≈\s*([\d.]+)\s*g/) || [])[1].replace(".", ""));
  assert.ok(Math.abs(total - per * 10) <= 10, "gesamt " + total + " vs 10×" + per);
});

const badgeOf = (t) => t.querySelector(".tile-badge").textContent;
test("Gruppen: ein Eintrag je Gericht, KetoCal-Phase wählt die Variante, Angerührt, Suche", () => {
  const w = boot();
  const all = tileNames(w).length;
  assert.ok(all >= 30 && all <= 40, "Gerichte: " + all);
  assert.equal(new Set(tileNames(w)).size, all, "doppelte Gerichte");
  assert.ok(!tileNames(w).some(n => /mit KetoCal|Flasche|Variante/.test(n)), "Varianten-Zusätze dürfen nicht im Namen stehen");
  const kcMit = tiles(w).filter(t => /KetoCal/.test(badgeOf(t))).length;
  clickChip(w, "ohne KetoCal");
  assert.equal(tileNames(w).length, all, "Phase ändert nicht die Anzahl der Gerichte");
  const kcOhne = tiles(w).filter(t => /KetoCal/.test(badgeOf(t))).length;
  assert.ok(kcOhne < kcMit, "ohne KetoCal: " + kcOhne + " < mit: " + kcMit);
  clickChip(w, "🥤 Angerührt");
  assert.deepEqual(tileNames(w).sort(), ["HiPP Hühnchen & Öl", "KetoCal & Compleat", "KetoCal & Pre Apta"]);
  clickChip(w, "🥚 Ei");
  assert.equal(tileNames(w).length, 4); assert.ok(tileNames(w).every(n => /^Ei /.test(n)));
  clickChip(w, "🍗 Geflügel");
  assert.ok(tileNames(w).length >= 8 && tileNames(w).every(n => /^(Hendl|Pute)/.test(n)));
  clickChip(w, "🍓 Obst & Brei");
  assert.ok(tileNames(w).some(n => /Grieß/.test(n)) && tileNames(w).some(n => /Banane/.test(n)));
  clickChip(w, "Alle");
  const s = $(w, "recipe-search"); s.value = "zucchini"; fire(w, s, "input");
  assert.ok(tileNames(w).length > 0 && tileNames(w).every(n => /zucchini/i.test(n)));
});

test("Fettbasis: Umschalter im Rezept, Wahl je Gericht gemerkt, Menge und Favorit gelten fürs Gericht", () => {
  const w = boot({ settings: { mctShare: 0 } });
  let c = openRecipe(w, "Hendl & Zucchini");
  assert.ok(kitchenRows(c)["Ketocal 3:1"] > 0, "Phase „mit“ zeigt die KetoCal-Variante");
  const pin = c.querySelector("#portion-input"); pin.value = "4"; fire(w, pin, "change");
  c = $(w, "detail-content");
  const btn = [...c.querySelectorAll("button[data-basis]")].find(b => /Rapsöl/.test(b.textContent) && !/KetoCal/.test(b.textContent));
  assert.ok(btn, "Fettbasis-Schalter fehlt"); fire(w, btn);
  c = $(w, "detail-content");
  const rows = kitchenRows(c);
  assert.equal(rows["Ketocal 3:1"], undefined); assert.ok(rows["Rapsöl"] > 0);
  assert.equal(c.querySelector("#portion-input").value, "4", "Portionen bleiben beim Umschalten");
  assert.ok(Math.abs(ratioOf(c) - 1.8) <= 0.02);
  [...c.querySelectorAll(".btn")].find(b => /Favorit/.test(b.textContent)).click();
  fire(w, $(w, "detail-close"));
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  assert.deepEqual(st.favorites, ["fam:Hendl & Zucchini"]);
  assert.equal(st.scales["fam:Hendl & Zucchini"], 4);
  // Neustart: Kachel zeigt die gemerkte Basis; Phase umschalten setzt die Einzelwahl zurück
  const w2 = boot(st);
  const tile = () => tiles(w2).find(x => x.querySelector(".tile-name").textContent.trim() === "Hendl & Zucchini");
  assert.match(badgeOf(tile()), /Rapsöl/); assert.ok(!/KetoCal/.test(badgeOf(tile())));
  assert.ok(tile().querySelector(".favbtn").classList.contains("on"));
  clickChip(w2, "ohne KetoCal"); clickChip(w2, "🥄 mit KetoCal");
  assert.match(badgeOf(tile()), /KetoCal/);
});

test("Packung: Compleat-Aufteilung mit Pre Apta hält Verhältnis und kcal; Packungsstand im Tagesplan", () => {
  // kcalMin 400 (80 je Mahlzeit) → das Minimum greift in diesem Teil nicht
  const w = boot({ settings: { mctShare: 0, ratio: 2 / 3, kcalMin: 400 } });
  assert.ok($(w, "mct-more").hidden && !$(w, "mct-zero-hint").hidden, "MCT-Karte bei 0 % eingeklappt");
  let c = openRecipe(w, "KetoCal & Compleat");
  const pack = () => $(w, "detail-content").querySelector(".meat-swap.pack");
  assert.match(pack().textContent, /Rechenregel: ⚖️ Verhältnis halten/);
  assert.match(pack().textContent, /reicht für 7 Mahlzeiten/);
  assert.equal(pack().querySelector("#pack-n").value, "7");
  // Standard-Modus „Verhältnis halten“: nur KetoCal als Hebel, Kalorien dürfen abweichen, Packung geht auf
  let n = pack().querySelector("#pack-n"); n.value = "10"; fire(w, n, "change");
  c = $(w, "detail-content");
  let rows = kitchenRows(c);
  assert.equal(rows["Compleat Paediatric Nature Mix (Nestlé)"], 50);
  assert.equal(rows["Aptamil Pre (Pulver)"], undefined);
  assert.ok(Math.abs(rows["Ketocal 3:1"] - 6.3) < 0.2, "KetoCal " + rows["Ketocal 3:1"]);
  assert.equal(c.querySelector(".ratio-pill").textContent, "1:1,50");
  assert.ok(Math.abs(kcalOf(c) - 103) <= 2, "kcal " + kcalOf(c));
  assert.match(pack().textContent, /103 kcal statt 140/); assert.match(pack().textContent, /2,0 Tage bei 5 Mahlzeiten\/Tag/);
  // Weniger Mahlzeiten je Packung → mehr Compleat und mehr kcal, Verhältnis bleibt
  n = pack().querySelector("#pack-n"); n.value = "5"; fire(w, n, "change");
  c = $(w, "detail-content");
  assert.equal(kitchenRows(c)["Compleat Paediatric Nature Mix (Nestlé)"], 100);
  assert.ok(kcalOf(c) > 160); assert.equal(c.querySelector(".ratio-pill").textContent, "1:1,50");
  // Rechenregel „Kalorien halten“ (global unter Vorgaben): Pre Apta füllt auf, 140 kcal exakt
  fire(w, $(w, "detail-close"));
  fire(w, w.document.querySelector("#mct-mode-ctl button[data-mctmode=kalorien]"));
  c = openRecipe(w, "KetoCal & Compleat");
  assert.match(pack().textContent, /Rechenregel: 🎯 Kalorien halten/);
  n = pack().querySelector("#pack-n"); n.value = "10"; fire(w, n, "change");
  c = $(w, "detail-content");
  rows = kitchenRows(c);
  assert.ok(Math.abs(rows["Aptamil Pre (Pulver)"] - 5.3) < 0.2, "Pre Apta " + rows["Aptamil Pre (Pulver)"]);
  assert.ok(Math.abs(rows["Ketocal 3:1"] - 8.0) < 0.2, "KetoCal " + rows["Ketocal 3:1"]);
  assert.ok(Math.abs(kcalOf(c) - 140) <= 1, "kcal " + kcalOf(c));
  // Kalorien-Modus, N ≤ 7: kein Auffüllen nötig → Hinweis statt Warnung, Standardrechnung
  for (const v of ["5", "7"]) {
    n = pack().querySelector("#pack-n"); n.value = v; fire(w, n, "change");
    c = $(w, "detail-content");
    assert.ok(!pack().querySelector(".note.warn"), "keine Warnung bei N=" + v);
    assert.match(pack().textContent, /greift erst ab 8 Mahlzeiten/);
    assert.ok(Math.abs(kitchenRows(c)["Compleat Paediatric Nature Mix (Nestlé)"] - 68) <= 1);
  }
  fire(w, pack().querySelector("#pack-reset"));
  assert.equal(pack().querySelector("#pack-n").value, "7");
  fire(w, $(w, "detail-close"));
  // Tagesplan: 5 × Compleat mit Aufteilung auf 10 → heute 250 ml, 250 ml bleiben, geht an 2 Tagen genau auf
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  st.pack = { "fam:KetoCal & Compleat": { n: 10, mode: "verhaeltnis" } };
  st.dayPlan = [0, 1, 2, 3, 4].map(() => ({ key: "std:KetoCal & Compleat" }));
  const w2 = boot(st);
  fire(w2, $(w2, "tab-heute"));
  const hc = $(w2, "heute-content").textContent;
  assert.match(hc, /250 ml/); assert.match(hc, /bleibt für morgen · reicht für 5 Mahlzeiten/); assert.match(hc, /geht die Packung genau auf/);
});

test("Kalorien-Minimum: automatisch 70 kcal/kg, Packung füllt nur bis zum Minimum auf, Tagesplan warnt", () => {
  // 8,5 kg, 1:1,5, 4 Mahlzeiten, Packung auf 8: ohne Auffüllen 129 kcal < Minimum 150 → Pre Apta bis 150
  const w = boot({ settings: { mctShare: 0, ratio: 2 / 3, mahlzeiten: 4, kcal: 750, weight: 8.5 }, pack: { "fam:KetoCal & Compleat": { n: 8 } } });
  assert.match($(w, "verordnung-summary").textContent, /mindestens 150 kcal \(600 kcal\/Tag, 70 kcal\/kg\)/);
  assert.match($(w, "verordnung-summary").textContent, /Richtwert nach Gewicht ≈ 680 kcal\/Tag \(80 kcal\/kg, Korridor 600–770\)/);
  assert.equal($(w, "set-kcalmin").placeholder, "auto: 600");
  let c = openRecipe(w, "KetoCal & Compleat");
  const rows = kitchenRows(c);
  assert.equal(rows["Compleat Paediatric Nature Mix (Nestlé)"], 62.5);
  assert.ok(Math.abs(rows["Ketocal 3:1"] - 8.8) < 0.2, "KetoCal " + rows["Ketocal 3:1"]);
  assert.ok(Math.abs(rows["Aptamil Pre (Pulver)"] - 3.0) < 0.2, "Pre Apta " + rows["Aptamil Pre (Pulver)"]);
  assert.ok(Math.abs(kcalOf(c) - 150) <= 1, "kcal " + kcalOf(c));
  assert.equal(c.querySelector(".ratio-pill").textContent, "1:1,50");
  assert.match(c.querySelector(".meat-swap.pack").textContent, /nur 129 kcal – unter dem Minimum von 150/);
  fire(w, $(w, "detail-close"));
  // Kachel zeigt dieselbe Mahlzeit wie das Detail: 150 kcal, Packung auf 8, + Pre Apta
  const tileC = () => tiles(w).find(x => x.querySelector(".tile-name").textContent.trim() === "KetoCal & Compleat");
  assert.match(tileC().querySelector(".tile-stats").textContent, /150 kcal/);
  assert.match(badgeOf(tileC()), /🧃 auf 8/); assert.match(badgeOf(tileC()), /\+ Pre Apta/);
  // „nicht auffüllen“: nur Compleat + KetoCal, 129 kcal, Warnung statt Auffüllen; Kachel ohne „+ Pre Apta“
  c = openRecipe(w, "KetoCal & Compleat");
  fire(w, c.querySelector("button[data-pfill='0']"));
  c = $(w, "detail-content");
  assert.equal(kitchenRows(c)["Aptamil Pre (Pulver)"], undefined);
  assert.ok(Math.abs(kcalOf(c) - 129) <= 1);
  assert.match(c.querySelector(".meat-swap.pack .note.warn").textContent, /nicht aufgefüllt/);
  fire(w, $(w, "detail-close"));
  assert.match(tileC().querySelector(".tile-stats").textContent, /129 kcal/);
  assert.ok(!/Pre Apta/.test(badgeOf(tileC())));
  c = openRecipe(w, "KetoCal & Compleat");
  fire(w, c.querySelector("button[data-pfill='1']"));
  fire(w, $(w, "detail-close"));
  // Manuelles Minimum 500 (125 je Mahlzeit): 129 reicht → kein Pre Apta
  const km = $(w, "set-kcalmin"); km.value = "500"; fire(w, km, "input");
  c = openRecipe(w, "KetoCal & Compleat");
  assert.equal(kitchenRows(c)["Aptamil Pre (Pulver)"], undefined);
  assert.ok(Math.abs(kcalOf(c) - 129) <= 1);
  fire(w, $(w, "detail-close"));
  // Tagesplan: 4 × 129 = 516 < Minimum 600 (manuell zurück auf auto) → Warnung
  km.value = ""; fire(w, km, "input");
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  st.settings.kcalMin = 500; // Minimum bewusst unter 129×4, damit die Mixe nicht auffüllen …
  st.dayPlan = [0, 1, 2, 3].map(() => ({ key: "std:KetoCal & Compleat" }));
  const w2 = boot(st);
  fire(w2, $(w2, "tab-heute"));
  assert.match($(w2, "heute-content").textContent, /Minimum 500 ✓/);
  // … und mit Minimum 550 (137,5 je Mahlzeit) füllt jede Mahlzeit auf 138 auf → Tag 550, Minimum erreicht
  st.settings.kcalMin = 550;
  const w3 = boot(st);
  fire(w3, $(w3, "tab-heute"));
  const t3 = $(w3, "heute-content").textContent;
  assert.match(t3, /Minimum 550 ✓/); assert.ok(!/unterschritten/.test(t3));
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
  assert.deepEqual(st.favorites, ["fam:Hendl & Zucchini", "fam:KetoCal & Compleat"]);
  assert.equal(st.scales["fam:Erdäpfel & Zucchini"], 3);
  assert.equal(st.dayPlan[0].key, "std:KetoCal & Pre Apta");
  fire(w, $(w, "tab-heute"));
  assert.match($(w, "heute-content").textContent, /KetoCal & Pre Apta/);
});

test("Vorgaben: Verhältnis händisch (1,8 / 1:1 / 1:1,5) wirkt global, Chip zeigt aktive Verordnung, Backup-Roundtrip", () => {
  const w = boot();
  const ri = $(w, "set-ratio");
  assert.equal(ri.value, "1,8:1");
  assert.ok($(w, "eiweiss-manual").hidden, "Gramm-Feld nur bei manuell");
  assert.match($(w, "eiweiss-auto").textContent, /= 12 g\/Tag/);
  assert.match($(w, "verordnung-summary").textContent, /mit KetoCal · MCT 10 % · Rechenregel ⚖️ Verhältnis halten/);
  assert.match($(w, "rx-chip").textContent, /🥄 KetoCal/);
  assert.ok(!$(w, "mct-more").hidden, "MCT-Karte bei 10 % offen");
  ri.value = "1:"; fire(w, ri, "input");            // unvollständige Eingabe ändert nichts
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5") || "{}").settings.ratio, 1.8);
  ri.value = "1:1"; fire(w, ri, "input");
  assert.match($(w, "rx-chip").textContent, /^1:1 /);
  let c = openRecipe(w, "Hendl & Brokkoli");
  assert.ok(Math.abs(ratioOf(c) - 1.0) <= 0.05);
  fire(w, $(w, "detail-close"));
  ri.value = "1:1,5"; fire(w, ri, "input"); fire(w, ri, "change");
  assert.equal(ri.value, "1:1,5");
  assert.match($(w, "rx-chip").textContent, /^1:1,5 /);
  assert.ok(Math.abs(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.ratio - 2 / 3) < 1e-9);
  c = openRecipe(w, "KetoCal & Compleat");
  assert.equal(c.querySelector(".ratio-pill").textContent, "1:1,50");
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
