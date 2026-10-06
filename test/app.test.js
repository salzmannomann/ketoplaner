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
function boot(stored, pre) {
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
  if (pre) pre(window); // z. B. WebCrypto/fetch bereitstellen, bevor die App startet
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
  [...c.querySelectorAll(".ing-list.kitchen .ing-row:not(.sum)")].forEach(r => {
    out[r.querySelector(".name").textContent.replace(/⟵.*/, "").trim()] = parseFloat(r.querySelector("input").value.replace(",", "."));
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
  const win = [...c.querySelectorAll(".ing-list.kitchen .ing-row")].find(r => /Wasser/.test(r.textContent)).querySelector("input");
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
  const hin = [...c2.querySelectorAll(".ing-list.kitchen .ing-row")].find(r => /Hüh/.test(r.textContent)).querySelector("input");
  hin.value = String(before["Hühnerbrust ohne Haut"] * 2); fire(w2, hin, "change");
  c2 = $(w2, "detail-content");
  const r2 = kitchenRows(c2);
  assert.ok(Math.abs(r2["Broccoli, gekocht"] - before["Broccoli, gekocht"] * 2) < 0.6, "Portion angepasst (0,5-g-Rundung × 5)");
  assert.equal(r2["Wasser"], 100, "gemerktes Wasser bleibt");
  assert.match(tagStatus(c2).textContent, /Portion angepasst: 200 %.*wie berechnet · Wasser angepasst \(100 statt \d+ ml\) wie berechnet$/);
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
test("Liste: jedes Rezept ein Eintrag (mit oder ohne KetoCal), Name mit Zusatz statt Fettbasis-Schild, KetoCal ausblendbar, Gruppen, Suche", () => {
  const w = boot();
  const all = tileNames(w).length;
  assert.ok(all >= 45 && all <= 60, "Rezepte: " + all);
  assert.ok(!tileNames(w).some(n => /\(mit KetoCal\)|\(Obstbrei|Flasche|Variante/.test(n)), "keine Klammerzusätze im Namen");
  assert.equal(new Set(tileNames(w)).size, all, "kein Name steht zweimal gleich da");
  const kc = tileNames(w).filter(n => / · mit KetoCal$/.test(n)).length;
  assert.equal(kc, 19, "alle 22 KetoCal-Rezepte außer der Sondennahrung (3) zeigen „· mit KetoCal“");
  assert.ok(!tiles(w).some(t => /Rapsöl|KetoCal|Butter|nur mit|nur ohne/.test(badgeOf(t))), "graue Zeile nur noch Herkunft");
  // Doppel-Gericht: beide Einträge nebeneinander, ohne KetoCal zuerst
  const hz = tileNames(w).filter(n => /^Hendl & Zucchini( · mit KetoCal)?$/.test(n));
  assert.deepEqual(hz, ["Hendl & Zucchini", "Hendl & Zucchini · mit KetoCal"]);
  // Häkchen „ohne KetoCal“ blendet alle 22 KetoCal-Rezepte aus
  const hk = $(w, "hide-keto"); hk.checked = true; fire(w, hk, "change");
  assert.equal(tileNames(w).length, all - 22);
  assert.ok(!tileNames(w).some(n => /KetoCal/.test(n)));
  hk.checked = false; fire(w, hk, "change");
  assert.equal(tileNames(w).length, all);
  // „nur KetoCal“ zeigt genau die 22 KetoCal-Rezepte und schaltet „ohne KetoCal“ aus (und umgekehrt)
  $(w, "hide-keto").checked = true; fire(w, $(w, "hide-keto"), "change");
  const ok = $(w, "only-keto"); ok.checked = true; fire(w, ok, "change");
  assert.equal(tileNames(w).length, 22);
  assert.ok(tileNames(w).every(n => /KetoCal/.test(n)), "nur KetoCal-Rezepte");
  assert.equal($(w, "hide-keto").checked, false, "„ohne KetoCal“ ausgeschaltet");
  // auch in der Auswahl für den Tagesplan
  w.document.querySelector('.tabbar [data-view="heute"]').click();
  fire(w, $(w, "heute-content").querySelector("[data-pick]"));
  const picks = [...w.document.querySelectorAll("#picker-list .pick-name")].map(e => e.textContent);
  assert.ok(picks.length === 22 && picks.every(n => /KetoCal/.test(n)), "Auswahl nur mit KetoCal: " + picks.length);
  fire(w, $(w, "picker-close"));
  w.document.querySelector('.tabbar [data-view="rezepte"]').click();
  $(w, "hide-keto").checked = true; fire(w, $(w, "hide-keto"), "change");
  assert.equal($(w, "only-keto").checked, false, "„nur KetoCal“ ausgeschaltet");
  assert.equal(tileNames(w).length, all - 22);
  $(w, "hide-keto").checked = false; fire(w, $(w, "hide-keto"), "change");
  assert.equal(tileNames(w).length, all);
  clickChip(w, "Angerührt");
  assert.deepEqual(tileNames(w).sort(), ["Compleat & KetoCal", "Compleat & KetoCal & Pre Apta", "HiPP Hühnchen & Gemüse & Öl", "HiPP Hühnchen & Öl", "HiPP Rind & Gemüse & Öl", "HiPP Rind & Öl", "KetoCal & Pre Apta"]);
  clickChip(w, "Ei");
  assert.ok(tileNames(w).length >= 4 && tileNames(w).every(n => /^Ei /.test(n)));
  clickChip(w, "Geflügel");
  assert.ok(tileNames(w).length >= 8 && tileNames(w).every(n => /^(Hendl|Pute)/.test(n)));
  clickChip(w, "Obst & Brei");
  assert.ok(tileNames(w).some(n => /Grieß/.test(n)) && tileNames(w).some(n => /Banane/.test(n)));
  clickChip(w, "Alle");
  const s = $(w, "recipe-search"); s.value = "zucchini"; fire(w, s, "input");
  assert.ok(tileNames(w).length > 0 && tileNames(w).every(n => /zucchini/i.test(n)));
});

test("Rezeptnamen: einheitliche Anzeige mit „· mit KetoCal“, Suche nach vollem Namen, alte Favoriten und Tagesplan bleiben", () => {
  const w = boot({ favorites: ["std:Rind & Karotte (mit KetoCal)", "fam:Apfelmus (Obstbrei)"],
    dayPlan: [{ key: "std:Rind & Karotte (mit KetoCal)" }, { key: "std:Apfelmus (Obstbrei)" }, { key: null }, { key: null }, { key: null }] });
  const names = tileNames(w);
  ["Rind & Karotte", "Rind & Karotte · mit KetoCal", "Apfelmus", "Apfelmus · mit KetoCal", "Zucchini · mit KetoCal", "Compleat & KetoCal"]
    .forEach(n => assert.ok(names.indexOf(n) !== -1, "Name fehlt: " + n));
  // Zusatz als eigenes, kleines Element
  const t = tiles(w).find(x => x.querySelector(".tile-name").textContent.trim() === "Rind & Karotte · mit KetoCal");
  assert.equal(t.querySelector(".name-suffix").textContent, " · mit KetoCal");
  // alte Schlüssel (voller Datenname bzw. Familie) gelten weiter
  assert.ok(t.querySelector(".favbtn").classList.contains("on"), "Favorit über vollen Datennamen");
  assert.ok(tiles(w).filter(x => /^Apfelmus/.test(x.querySelector(".tile-name").textContent.trim())).every(x => x.querySelector(".favbtn").classList.contains("on")), "Familien-Favorit gilt für beide");
  // Suche findet auch „ketocal“ und „obstbrei“ (Datenname)
  const s = $(w, "recipe-search");
  s.value = "obstbrei"; fire(w, s, "input");
  assert.ok(tileNames(w).some(n => n === "Apfelmus") && tileNames(w).some(n => n === "Banane · mit KetoCal"), "Suche „obstbrei“: " + tileNames(w).join(", "));
  s.value = "ketocal"; fire(w, s, "input");
  assert.ok(tileNames(w).some(n => n === "Rind & Karotte · mit KetoCal"));
  s.value = ""; fire(w, s, "input");
  // Tagesplan: Mahlzeitzeilen mit Anzeigename, Plan bleibt erhalten
  fire(w, w.document.querySelector('.tabbar button[data-view="heute"]'));
  const zp = [...w.document.querySelectorAll(".zp-name")].map(e => e.textContent.trim());
  assert.deepEqual(zp.slice(0, 2), ["Rind & Karotte · mit KetoCal", "Apfelmus"]);
  // Auswahlfenster: kein Name doppelt
  fire(w, w.document.querySelector("[data-pick]"));
  const pk = [...w.document.querySelectorAll("#picker-list .pick-name")].map(e => e.textContent.replace(" ★", "").trim());
  assert.equal(new Set(pk).size, pk.length, "Auswahl ohne doppelte Namen");
  assert.ok(pk.indexOf("Rind & Karotte · mit KetoCal") !== -1);
});

test("Varianten: „Auch als“-Link öffnet das Geschwister-Rezept, Menge gilt je Gericht, Favorit je Rezept", () => {
  const w = boot({ settings: { mctShare: 0 } });
  let c = openRecipe(w, "Hendl & Zucchini"); // erster Eintrag = ohne KetoCal
  assert.ok(kitchenRows(c)["Rapsöl"] > 0 && kitchenRows(c)["Ketocal 3:1"] === undefined);
  const pin = c.querySelector("#portion-input"); pin.value = "4"; fire(w, pin, "change");
  c = $(w, "detail-content");
  const link = c.querySelector(".pane button[data-open-rec]");
  assert.ok(link && link.textContent === "Auch mit KetoCal", "Link zur KetoCal-Variante: " + (link && link.textContent));
  assert.equal(c.querySelector(".detail-head .dh-sib").textContent, "auch mit KetoCal ›", "Hinweis auch im Kopf");
  assert.ok(![...c.querySelectorAll(".dh-tags .dh-tag")].some(t => /Rapsöl|Butter|KetoCal/.test(t.textContent)), "kein Fett-Schild im Detailkopf");
  fire(w, link);
  c = $(w, "detail-content");
  assert.equal(c.querySelector(".pane button[data-open-rec]").textContent, "Auch ohne KetoCal");
  assert.equal(c.querySelector(".detail-head .dh-sib").textContent, "auch ohne KetoCal ›");
  assert.ok(![...c.querySelectorAll(".dh-tags .dh-tag")].some(t => /Rapsöl|Butter|KetoCal/.test(t.textContent)), "auch bei KetoCal kein Fett-Schild");
  const rows = kitchenRows(c);
  assert.ok(rows["Ketocal 3:1"] > 0 && rows["Rapsöl"] === undefined, "Geschwister-Rezept geöffnet");
  assert.equal(c.querySelector("#portion-input").value, "4", "Zubereitungsmenge bleibt beim Wechsel zum Geschwister-Rezept");
  assert.ok(Math.abs(ratioOf(c) - 1.8) <= 0.02);
  const favB = [...c.querySelectorAll(".btn")].find(b => /Favorit/.test(b.textContent));
  favB.click();
  // Stern sofort gefüllt, Ansicht bleibt (Menge nicht zurückgesetzt), Liste dahinter zeigt den Favoriten schon
  assert.ok(favB.classList.contains("on") && favB.getAttribute("aria-pressed") === "true", "Stern gefüllt");
  assert.equal($(w, "detail-content").querySelector("#portion-input").value, "4", "Stern setzt die Ansicht nicht zurück");
  assert.ok(tiles(w).find(t => t.querySelector(".tile-name").textContent.trim() === "Hendl & Zucchini · mit KetoCal").querySelector(".favbtn").classList.contains("on"), "Liste sofort aktualisiert");
  fire(w, $(w, "detail-close"));
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  assert.deepEqual(st.favorites, ["std:Hendl & Zucchini (mit KetoCal)"]);
  assert.equal(st.scales["fam:Hendl & Zucchini"], undefined, "Menge wird nicht gemerkt");
  // Neustart: nur der KetoCal-Eintrag ist Favorit
  const w2 = boot(st);
  const hzName = (n) => tiles(w2).find(x => x.querySelector(".tile-name").textContent.trim() === n);
  assert.ok(hzName("Hendl & Zucchini · mit KetoCal").querySelector(".favbtn").classList.contains("on"));
  assert.ok(!hzName("Hendl & Zucchini").querySelector(".favbtn").classList.contains("on"));
});

test("Compleat-Rezepte: Verhältnis und kcal exakt, Pre-Apta-Variante braucht weniger Compleat, Packungs-Hinweis und Packungsstand", () => {
  const w = boot({ settings: { mctShare: 0, ratio: 2 / 3, mahlzeiten: 4, kcal: 750, weight: 8.5 } });
  let c = openRecipe(w, "Compleat & KetoCal");
  const rK = kitchenRows(c); // Tag = 4 Portionen (alle Vergleiche relativ)
  assert.equal(rK["Aptamil Pre (Pulver)"], undefined); assert.ok(rK["Ketocal 3:1"] > 0);
  assert.match(c.querySelector(".ratio-pill").textContent, /^0,6[67] : 1$/); assert.ok(Math.abs(kcalOf(c) - 188) <= 1, "kcal " + kcalOf(c));
  const mlK = rK["Compleat Paediatric Nature Mix (Nestlé)"];
  const info = c.querySelector(".note.pack").textContent;
  assert.match(info, /reicht für \d+ Mahlzeiten/); assert.ok(!/aufteilen|aufbrauchen in/i.test(info), "keine Aufteilungs-Steuerung mehr");
  assert.ok(!c.querySelector("#pack-perday") && !c.querySelector("button[data-ptage]") && !c.querySelector("button[data-pfill]"));
  fire(w, $(w, "detail-close"));
  c = openRecipe(w, "Compleat & KetoCal & Pre Apta");
  const rP = kitchenRows(c);
  assert.ok(rP["Aptamil Pre (Pulver)"] > 0, "Pre Apta enthalten");
  assert.match(c.querySelector(".ratio-pill").textContent, /^0,6[67] : 1$/); assert.ok(Math.abs(kcalOf(c) - 188) <= 1);
  assert.ok(rP["Compleat Paediatric Nature Mix (Nestlé)"] < mlK, "mit Pre Apta weniger Compleat je Mahlzeit");
  fire(w, $(w, "detail-close"));
  // Tagesplan: 4 × Compleat & KetoCal → Packungsstand (heute verplant, Rest)
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  st.dayPlan = [0, 1, 2, 3].map(() => ({ key: "std:Compleat & KetoCal" }));
  const w2 = boot(st);
  fire(w2, $(w2, "tab-heute"));
  const hc = $(w2, "heute-content").textContent;
  assert.match(hc, /Compleat Paediatric heute/); assert.match(hc, new RegExp(fmtDe(mlK) + " ml") /* Tag = 4 Portionen */);
  assert.ok(!$(w2, "day-sums").querySelector(".dstat").classList.contains("warn"), "Minimum erreicht – keine Warnung");
});
// Kennzahl-Kachel unter Verordnung/Flüssigkeit: sichtbarer Text plus Herkunft aus dem title.
function fact(w, box, k) { const e = $(w, box).querySelector('[data-k="' + k + '"]'); return e ? e.textContent + " · " + e.title : ""; }
// Zutatentabelle einer Mahlzeit in Heute als Text: „Hühnerbrust 19 g · Broccoli 42,5 g · …“
function ingText(row) { return [...row.querySelectorAll(".zp-ing .n")].map(n => n.textContent + " " + n.nextElementSibling.textContent).join(" · ").replace(/\u00a0/g, " "); }
// Tagessumme: Feld mit „ml“ (Flüssigkeit)
const fluidStat = (w) => [...$(w, "day-sums").querySelectorAll(".dstat")].find(x => / ml$/.test(x.textContent.trim()));
function fmtDe(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }

test("Kalorien-Minimum: automatisch 70 kcal/kg, Korridor in der Zusammenfassung, Tagesplan warnt bei Unterschreitung", () => {
  const w = boot({ settings: { mctShare: 0, ratio: 2 / 3, mahlzeiten: 4, kcal: 750, weight: 8.5 } });
  assert.match(fact(w, "verordnung-summary", "min"), /^mindestens150 kcal.*600 kcal\/Tag \(70 kcal\/kg\)/);
  assert.match(fact(w, "verordnung-summary", "mahl"), /750 kcal\/Tag \(manuell\) ÷ 4/);
  assert.match(fact(w, "verordnung-summary", "bereich"), /^Korridor nach Gewicht600–770kcal\/Tag · 70–90 kcal\/kg/);
  assert.equal($(w, "set-kcalmin").value, "600"); assert.match($(w, "src-kcalmin").textContent, /Vorschlag · 70 kcal\/kg/);
  // Manuelles Minimum über dem Ziel → Tagesplan mit 4 × 188 kcal = 750 liegt darunter → Warnung
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  st.settings.kcalMin = 800;
  st.dayPlan = [0, 1, 2, 3].map(() => ({ key: "std:Compleat & KetoCal" }));
  const w2 = boot(st);
  assert.match(fact(w2, "verordnung-summary", "min"), /800 kcal\/Tag \(manuell\)/);
  fire(w2, $(w2, "tab-heute"));
  const t2 = $(w2, "heute-content").textContent;
  assert.ok($(w2, "day-sums").querySelector(".dstat").classList.contains("warn"), "kcal-Kachel warnt"); assert.match(t2, /unter dem Kalorien-Minimum/);
});

test("Migration: alte Schlüssel (Flasche, Variante 1, KetoCal-Zwilling) werden auf Gerichte umgezogen", () => {
  const w = boot({
    settings: { ketoFilter: "ohne", filter: "flasche" },
    favorites: ["std:Hendl & Zucchini (mit KetoCal)", "std:Flasche: KetoCal & Compleat"],
    scales: { "std:Erdäpfel & Zucchini (mit KetoCal) – Variante 1": 3 },
    dayPlan: [{ key: "std:Flasche: KetoCal & Pre Apta" }, { key: null }],
  });
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  assert.equal(st.settings.ketocal, undefined, "veraltete Einstellung entfernt"); assert.equal(st.settings.filter, "alle");
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
  assert.match($(w, "src-kcal").textContent, /Vorschlag · 80 kcal\/kg/);
  assert.ok($(w, "src-kcal").classList.contains("auto"));
  assert.ok($(w, "reset-kcal").hidden);
  assert.match(fact(w, "verordnung-summary", "mahl"), /^pro Mahlzeit170 kcal.*680 kcal\/Tag \(Vorschlag 80 kcal\/kg\) ÷ 4/);
  assert.match($(w, "rx-chip").getAttribute("aria-label"), /170 kcal × 4/);
  assert.equal($(w, "set-kcalmin").value, "600");
  assert.equal($(w, "set-fluid").value, "850"); assert.match($(w, "src-fluid").textContent, /Vorschlag · 100 ml\/kg/);
  // Eiweiß: Standard 1,5 g/kg erkennbar
  assert.match($(w, "src-protein").textContent, /Standard · \d+ g\/Tag/, "Standard steht in der Zeile unter der Auswahl");
  assert.ok($(w, "reset-protein").hidden, "kein Standard-Link, solange der Standard gilt");
  // Eigener Wert → Link erscheint → Zurücksetzen bringt den Vorschlag zurück
  const k = $(w, "set-kcal"); k.value = "750"; fire(w, k, "input");
  assert.ok(!$(w, "reset-kcal").hidden); assert.match($(w, "src-kcal").textContent, /eigener Wert/); assert.match($(w, "reset-kcal").textContent, /Vorschlag 680/);
  assert.match(fact(w, "verordnung-summary", "mahl"), /750 kcal\/Tag \(manuell\)/);
  fire(w, $(w, "reset-kcal"));
  assert.equal($(w, "set-kcal").value, "680");
  // Ein getippter Wert bleibt fest – auch wenn er dem Vorschlag entspricht; nur ein leeres Feld ist wieder automatisch
  k.value = "690"; fire(w, k, "input"); assert.ok(!$(w, "reset-kcal").hidden);
  k.value = "680"; fire(w, k, "input"); assert.ok(!$(w, "reset-kcal").hidden, "Vorschlag getippt → bleibt eigener Wert");
  assert.match(fact(w, "verordnung-summary", "mahl"), /680 kcal\/Tag \(manuell\)/);
  k.value = ""; fire(w, k, "input"); assert.ok($(w, "reset-kcal").hidden, "leeres Feld → automatisch");
  assert.match(fact(w, "verordnung-summary", "mahl"), /680 kcal\/Tag \(Vorschlag/);
  const fl = $(w, "set-fluid"); fl.value = "900"; fire(w, fl, "input");
  assert.ok(!$(w, "reset-fluid").hidden);
  fire(w, $(w, "reset-fluid"));
  assert.equal($(w, "set-fluid").value, "850"); assert.ok($(w, "reset-fluid").hidden);
  assert.match(fact(w, "fluid-summary", "gabe"), /850 ml\/Tag \(Vorschlag/);
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
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^Zum Abwiegen für 1 Tag = 5 Portionen$/);
  // Mehrere Tage vorkochen: 2 Tage = 10 Portionen, Waage-Tabelle ×10, Tages-Check bleibt je Tag
  const g1 = kitchenRows(c)["Broccoli, gekocht"] / 5, kcal1 = numDe(dayTiles(c).querySelector(".dstat .v").textContent);
  assert.match(dayTiles(c).textContent, /kcal\/Tag · Ziel 700/);
  assert.match(tagStatus(c).textContent, /^Wie berechnet · 700 kcal je Tag/);
  fire(w, c.querySelector('.seg-portion button[data-scale="tag:2"]'));
  c = $(w, "detail-content");
  assert.ok(c.querySelector('.seg-portion button[data-scale="tag:2"]').classList.contains("active"));
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^Zum Abwiegen für 2 Tage = 10 Portionen$/);
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
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^Zum Abwiegen für 1 Tag = 5 Portionen$/);
  // Neu öffnen: immer wieder „1 Tag“ (die Menge wird nicht gemerkt)
  c = openRecipe(w, "Hendl & Brokkoli");
  assert.ok(c.querySelector('.seg-portion button[data-scale="tag"]').classList.contains("active"), "öffnet mit 1 Tag");
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^Zum Abwiegen für 1 Tag = 5 Portionen$/);
  // Rechnen: Mahlzeit-Kacheln und Tabelle je Portion, obwohl 5 Portionen zubereitet werden
  const kcalTile = [...c.querySelectorAll(".pane[data-pane=mahlzeit] .dstat, .pane[data-pane=abwiegen] .dstat, .pane[data-pane=anpassen] .dstat")][0];
  assert.ok(Math.abs(parseFloat(kcalTile.querySelector(".v").textContent) - 140) <= 1, kcalTile.textContent);
  assert.match(rechnenText(c), /Zum Abwiegen · eine Portion/);
  assert.match(rechnenText(c), /Summe je Portion/);
  fire(w, $(w, "detail-close"));
  // Mahlzeiten auf 4 → Ganzer Tag ist jetzt ×4, nicht mehr 5
  fire(w, w.document.querySelector('#mahlzeiten-ctl button[data-mahl="4"]'));
  c = openRecipe(w, "Hendl & Brokkoli");
  assert.ok(c.querySelector('.seg-portion button[data-scale="tag"]').classList.contains("active"));
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^Zum Abwiegen für 1 Tag = 4 Portionen$/);
  const kcal4 = [...c.querySelectorAll(".pane[data-pane=mahlzeit] .dstat, .pane[data-pane=abwiegen] .dstat, .pane[data-pane=anpassen] .dstat")][0];
  assert.ok(Math.abs(parseFloat(kcal4.querySelector(".v").textContent) - 175) <= 1, kcal4.textContent);
  // Zurück auf 1 Portion
  assert.equal(c.querySelector('.seg-portion button[data-scale="1"]'), null, "kein Knopf „1 Portion“ – dafür gibt es das Blatt Mahlzeit");
  { const pin1 = c.querySelector("#portion-input"); pin1.value = "1"; fire(w, pin1, "change"); }
  c = $(w, "detail-content");
  assert.match(c.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^Zum Abwiegen für 1 Portion$/);
});

test("Rechnen: Gramm je Portion ändern skaliert alle Zutaten, wird gemerkt, wirkt im Tagesplan, lässt sich zurücksetzen", () => {
  const w = boot({ settings: { mctShare: 0, mahlzeiten: 5, weight: 8.5 } });
  let c = openRecipe(w, "Hendl & Brokkoli");
  const kochenBefore = kitchenRows(c);
  const row = [...c.querySelectorAll(".pane[data-pane=mahlzeit] .ing-row, .pane[data-pane=abwiegen] .ing-row, .pane[data-pane=anpassen] .ing-row")].find(r => /Hüh/.test(r.textContent));
  const inp = row.querySelector("input.g-edit");
  assert.ok(inp, "Gramm-Feld in Rechnen fehlt");
  const g0 = parseFloat(inp.value.replace(",", "."));
  inp.value = String(g0 / 2); fire(w, inp, "change");
  c = $(w, "detail-content");
  // Portion halbiert: kcal 70 statt 140, Verhältnis bleibt, Statuszeile + Zurücksetzen
  const kcalTile = [...c.querySelectorAll(".pane[data-pane=mahlzeit] .dstat, .pane[data-pane=abwiegen] .dstat, .pane[data-pane=anpassen] .dstat")][0];
  assert.ok(Math.abs(parseFloat(kcalTile.querySelector(".v").textContent) - 70) <= 1, kcalTile.textContent);
  assert.match(kcalTile.textContent, /Ziel 140/);
  assert.ok(Math.abs(ratioOf(c) - 1.8) <= 0.03, "halbe Portion: Fett auf 0,1 g gerundet → " + ratioOf(c));
  assert.match(c.querySelector(".portion-line").textContent, /Portion angepasst: 50 %/);
  const brok = [...c.querySelectorAll(".pane[data-pane=mahlzeit] .ing-row, .pane[data-pane=abwiegen] .ing-row, .pane[data-pane=anpassen] .ing-row")].find(r => /Broccoli/.test(r.textContent)).querySelector("input.g-edit");
  const kochenAfter = kitchenRows(c);
  assert.ok(Math.abs(kochenAfter["Broccoli, gekocht"] - kochenBefore["Broccoli, gekocht"] / 2) <= 1.5, "Abwiegen (5 ×) skaliert mit (0,5-g-Rundung)");
  assert.ok(Math.abs(parseFloat(brok.value.replace(",", ".")) - kochenBefore["Broccoli, gekocht"] / 5 / 2) <= 0.3, "Rechnen (je Portion) skaliert mit (0,5-g-Rundung)");
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
  const wrow = [...c.querySelectorAll(".pane[data-pane=mahlzeit] .ing-row, .pane[data-pane=abwiegen] .ing-row, .pane[data-pane=anpassen] .ing-row")].find(r => /Wasser/.test(r.textContent)).querySelector("input.g-edit");
  wrow.value = "80"; fire(w2, wrow, "change");
  c = $(w2, "detail-content");
  assert.equal(kitchenRows(c)["Wasser"], 80 * 5, "Abwiegen zeigt den Tag (5 ×)");
  // Statuszeile wie bei der Portion: „Wasser angepasst (80 statt … ml) · ↺ wie berechnet“; in der Zeile nur „⟵ eigener Wert“
  const line = c.querySelector(".pane[data-pane=mahlzeit] .portion-line");
  assert.match(line.textContent, /Wasser angepasst \(80 statt \d+ ml\) wie berechnet/);
  assert.doesNotMatch(line.textContent, /Wie berechnet/);
  const wrowTxt = [...c.querySelectorAll(".pane[data-pane=mahlzeit] .ing-row")].find(r => /Wasser/.test(r.textContent)).textContent;
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
  assert.match([...c.querySelectorAll(".ing-list.kitchen .ing-row")].find(r => /Rapsöl/.test(r.textContent)).querySelector("input").value, /^\d+,\d$/, "Fett immer mit einer Nachkommastelle (deutsches Komma)");
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
  assert.match($(w, "rx-chip").getAttribute("aria-label"), /850 ml\/Tag/);
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
  assert.equal(ri.parentElement.querySelector(".ratio-suffix").textContent, ": 1");
  assert.ok($(w, "eiweiss-manual").hidden, "Gramm-Feld nur bei manuell");
  assert.match($(w, "src-protein").textContent, /Standard · 12 g\/Tag/, "Eiweiß-Ergebnis in der Zeile unter der Auswahl");
  assert.match($(w, "rx-chip").getAttribute("aria-label"), /800 ml\/Tag · Wasser zwischen den Mahlzeiten: ≈ \d × \d+ ml/);
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
    const mealRows = c.querySelectorAll(".pane[data-pane=mahlzeit] .ing-row:not(.sum)");
    const dayRows = c.querySelectorAll(".pane[data-pane=abwiegen] .ing-list.kitchen .ing-row:not(.sum)");
    assert.equal(dayRows.length, mealRows.length);
    const gramsOf = (tr) => parseFloat(tr.querySelector("input").value.replace(",", "."));
    for (let i = 0; i < mealRows.length; i++) assert.ok(Math.abs(gramsOf(dayRows[i]) - 5 * gramsOf(mealRows[i])) <= 0.3, "Zeile " + i);
    const pin = c.querySelector("#portion-input"); pin.value = "3"; fire(w, pin, "change");
    const c2 = $(w, "detail-content");
    assert.match(tagStatus(c2).textContent, /^Wie berechnet · 420 kcal für 3 Portionen/);
    assert.match(c2.querySelector(".pane[data-pane=abwiegen] .ph").textContent, /^Zum Abwiegen für 3 Portionen$/);
    fire(w, $(w, "detail-close"));
  }
  ri.value = "1:"; fire(w, ri, "input");            // unvollständige Eingabe ändert nichts
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5") || "{}").settings.ratio, 1.8);
  ri.value = "1"; fire(w, ri, "input");
  assert.match($(w, "rx-chip").getAttribute("aria-label"), /^1:1 /);
  let c = openRecipe(w, "Hendl & Brokkoli");
  assert.ok(Math.abs(ratioOf(c) - 1.0) <= 0.05);
  fire(w, $(w, "detail-close"));
  ri.value = "0,67"; fire(w, ri, "input"); fire(w, ri, "change");
  assert.equal(ri.value, "0,67");
  assert.match($(w, "ratio-hint").textContent, /0,67:1 heißt nur 0,67 g Fett je 1 g Eiweiß\+KH – weniger Fett als Eiweiß\+KH/);
  assert.ok($(w, "verordnung-summary").querySelector(".note.warn"), "Warnung über den Kennzahlen");
  ri.value = "1,5"; fire(w, ri, "input");
  assert.equal($(w, "ratio-hint"), null, "kein Hinweis bei Werten ab 1:1");
  assert.equal($(w, "verordnung-summary").querySelector(".note.warn"), null);
  ri.value = "1:1,5"; fire(w, ri, "input"); // alte Schreibweise wird weiterhin verstanden
  assert.match($(w, "rx-chip").getAttribute("aria-label"), /^0,67:1 /);
  assert.ok(Math.abs(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.ratio - 2 / 3) < 1e-9);
  c = openRecipe(w, "Compleat");
  assert.match(c.querySelector(".ratio-pill").textContent, /^0,6[67] : 1$/);
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
  // Auswahl zeigt je Rezept kcal, Volumen der Mahlzeit und Eiweiß
  assert.ok([...w.document.querySelectorAll("#picker-list .pick-meta")].every(m => /kcal · (≈|▲) [\d.]+ ml · Eiweiß/.test(m.textContent)), "Volumen in der Auswahl");
  assert.ok(![...w.document.querySelectorAll("#picker-list .pick-meta")].some(m => /Rapsöl|Butter|KetoCal/.test(m.textContent)), "keine Fettbasis in der grauen Zeile der Auswahl");
  fire(w, [...w.document.querySelectorAll("#picker-list .pick-row")].find(b => /^Hendl & Brokkoli/.test(b.querySelector(".pick-name").textContent)));
  hc = $(w, "heute-content");
  assert.equal(hc.querySelectorAll(".slot:not(.empty-slot)").length, 1);
  const kcalTile = [...hc.querySelectorAll("#day-sums .dstat")][0].querySelector(".v").textContent;
  assert.ok(Math.abs(parseFloat(kcalTile) - 139) <= 2, "Tagessumme kcal: " + kcalTile);
  assert.match(ingText(hc.querySelector(".zp-row.slot")), / · Rapsöl [\d,]+ g · MCT-Öl 1,2 g$/, "Öl steht als normale Zutat am Ende der Zutatentabelle");
  assert.match(ingText(hc.querySelector(".zp-row.slot")), /^Hühnerbrust [\d,]+ g · Broccoli gekocht [\d,]+ g · Wasser [\d,]+ ml · /, "kurze Namen, roh/gekocht bleibt, Wasser in ml");
  // Eine Zeitleiste: Mahlzeiten mit Uhrzeit und „tauschen“; Werkzeugzeile mit Uhrzeiten, Drucken, Leeren; keine Emojis
  assert.ok(hc.querySelector(".zp-row.slot .zp-time") && hc.querySelector('.zp-row.slot [data-pick="0"]') && hc.querySelector("#zp-toggle") && hc.querySelector("#print-day") && hc.querySelector("#clear-day"));
  assert.equal(hc.querySelector(".zp-row.slot [data-pick]").textContent, "tauschen");
  assert.equal(hc.querySelector("[data-clear]"), null, "Leeren einer Mahlzeit steht im Auswahlfenster");
  assert.equal(hc.querySelectorAll(".tile.slot").length, 0, "keine doppelte Mahlzeitenliste mehr");
  // „tauschen“ → Auswahl „Rezept für 7:00“ mit „Leeren“ (rot) → Mahlzeit leer, Rückgängig stellt sie wieder her
  fire(w, hc.querySelector('.zp-row.slot [data-pick="0"]'));
  assert.equal($(w, "picker-title").textContent, "Rezept für 7:00");
  assert.equal($(w, "picker-clear").hidden, false);
  fire(w, $(w, "picker-clear"));
  assert.equal($(w, "picker-overlay").hidden, true);
  assert.equal($(w, "heute-content").querySelectorAll(".slot.empty-slot").length, 5, "Leeren leert die Zeile");
  assert.match($(w, "toast").textContent, /Mahlzeit 1 geleert/);
  fire(w, $(w, "toast").querySelector(".toast-btn"));
  assert.equal($(w, "heute-content").querySelectorAll(".slot:not(.empty-slot)").length, 1, "Rückgängig");
  fire(w, $(w, "heute-content").querySelector('[data-pick="0"]')); fire(w, $(w, "picker-clear"));
  hc = $(w, "heute-content");
  fire(w, hc.querySelector('.empty-slot[data-pick="0"]'));
  assert.equal($(w, "picker-clear").hidden, true, "bei offener Mahlzeit kein Leeren");
  fire(w, $(w, "picker-close"));
  // Plan leeren ohne Rückfrage, mit Rückgängig
  fire(w, hc.querySelector('[data-pick="1"]'));
  fire(w, [...w.document.querySelectorAll("#picker-list .pick-row")].find(b => /^Hendl & Brokkoli/.test(b.querySelector(".pick-name").textContent)));
  w.confirm = () => { throw new Error("keine Rückfrage mehr"); };
  fire(w, $(w, "clear-day"));
  assert.equal($(w, "heute-content").querySelectorAll(".slot.empty-slot").length, 5, "geleert");
  assert.match($(w, "toast").textContent, /Tagesplan geleert/);
  fire(w, $(w, "toast").querySelector(".toast-btn"));
  assert.equal($(w, "heute-content").querySelectorAll(".slot:not(.empty-slot)").length, 1, "Rückgängig stellt den Plan wieder her");
  // Mahlzeiten pro Tag: nur 3, 4 oder 5 wählbar
  assert.deepEqual([...w.document.querySelectorAll("#mahlzeiten-ctl button")].map(b => b.textContent), ["3", "4", "5"]);
  assert.equal($(w, "set-mahlzeiten"), null, "kein freies Zahlenfeld mehr");
  fire(w, w.document.querySelector('#mahlzeiten-ctl button[data-mahl="3"]'));
  assert.ok(w.document.querySelector('#mahlzeiten-ctl button[data-mahl="3"]').classList.contains("active"));
  assert.equal($(w, "heute-content").querySelectorAll(".slot").length, 3);
  assert.equal(w.document.querySelectorAll("#heute-content .zp-row.water").length, 3, "3 Mahlzeiten: zwei Pausen + Abendgabe");
  const vols = [...w.document.querySelectorAll("#heute-content .zp-row.meal:not(.empty-slot) .zp-vol")];
  vols.forEach(v => { const ml = numDe(v.firstChild.textContent.replace(/ ml.*/, "").replace(/[^\d,]/g, "")); assert.equal(v.classList.contains("big"), ml > 200 + 0.5, v.textContent); });
});

test("Flüssigkeit: Vorschlag nach Gewicht; zwei Stellungen – zwischen den Mahlzeiten sondieren (Rezept-Wasser, Rest als Wassergaben) oder in den Mahlzeiten dabei", () => {
  const w = boot({ settings: { mctShare: 0, mahlzeiten: 4, weight: 8.5, wasserModus: "ausgewogen" } }); // alter Wert → „zwischen“
  assert.equal($(w, "set-fluid").value, "850");
  assert.equal(w.document.querySelectorAll("#wasser-modus-ctl button").length, 2, "nur zwei Stellungen");
  assert.ok(w.document.querySelector("#wasser-modus-ctl button[data-wmodus=zwischen]").classList.contains("active"));
  assert.equal($(w, "set-zwischen"), null, "kein festes Feld je Zwischenzeit mehr – die Menge rechnet der Zeitplan");
  assert.equal($(w, "set-maxmahl"), null, "kein Feld für die Höchstmenge");
  assert.ok(!$(w, "set-dichte").disabled); assert.equal($(w, "set-dichte").value, "1,5");
  assert.match(fact(w, "fluid-summary", "gabe"), /^Wassergaben≈ 4 × \d+ mlzwischen den Mahlzeiten · 850 ml\/Tag \(Vorschlag, Holliday-Segar\)/);
  assert.match($(w, "fluid-summary").textContent, /nur ihr Rezept-Wasser zum Pürieren bzw. Anrühren/);
  // „zwischen“: die Mahlzeit behält ihr Rezept-Wasser, der Tag nennt die Wassergaben
  let c = openRecipe(w, "Hendl & Brokkoli");
  const waterZ = kitchenRows(c)["Wasser"];
  assert.match(c.querySelector(".pane[data-pane=mahlzeit]").textContent, /Wasser nur zum Pürieren bzw. Anrühren, der Rest kommt als Wassergaben/);
  assert.match(rechnenText(c), /Mahlzeiten 4 × \d+ ml \+ 4 × \d+ ml Wasser ≈ \d+ ml am Tag/);
  assert.doesNotMatch(c.querySelector(".ing-list.kitchen").textContent, /Flüssigkeitsziel/);
  assert.match(rechnenText(c), /Flüssigkeit\/Tag in Mahlzeiten|Flüssigkeit\/Tag/);
  fire(w, $(w, "detail-close"));
  // „in den Mahlzeiten dabei“: Wasser steigt, Mahlzeit ≈ 850 ÷ 4 ≈ 213 ml; Dichte-Feld ausgegraut
  fire(w, w.document.querySelector("#wasser-modus-ctl button[data-wmodus=mahlzeit]"));
  assert.ok($(w, "set-dichte").disabled, "Dichte nur beim Sondieren, Feld bleibt an Ort und Stelle");
  assert.match(fact(w, "fluid-summary", "gabe"), /^in jeder Mahlzeit21[23] ml/);
  assert.match($(w, "rx-chip").getAttribute("aria-label"), /alles in den Mahlzeiten \(je 21[23] ml\)/);
  c = openRecipe(w, "Hendl & Brokkoli");
  assert.ok(kitchenRows(c)["Wasser"] > waterZ, "Wasser erhöht");
  assert.match(c.querySelector(".ing-list.kitchen").textContent, /Flüssigkeitsziel/);
  assert.match(c.querySelector(".pane[data-pane=mahlzeit]").textContent, /Flüssigkeit ≈ 21[234] ml/);
  const tile = [...c.querySelectorAll(".pane .dstat")].find(t => /Flüssigkeit\/Tag/.test(t.textContent));
  assert.ok(Math.abs(numDe(tile.querySelector(".v").textContent) - 850) <= 4, tile.textContent);
  assert.match(rechnenText(c), /in den Mahlzeiten dabei/);
  assert.equal(ratioOf(c), 1.8);
  // Gemerktes Wasser hat Vorrang
  const win = [...c.querySelectorAll(".ing-list.kitchen .ing-row")].find(r => /Wasser/.test(r.textContent)).querySelector("input");
  win.value = "40"; fire(w, win, "change"); // 4 Mahlzeiten → 10 ml je Portion
  c = $(w, "detail-content");
  assert.equal(kitchenRows(c)["Wasser"], 40);
  assert.match(c.querySelector(".pane[data-pane=mahlzeit]").textContent, /nicht erreicht/);
  fire(w, $(w, "detail-close"));
  // Tagesplan im Modus „zwischen“: Kachel zählt nur die Mahlzeiten, der Zeitplan ergänzt das Wasser bis zum Ziel
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  st.settings.wasserModus = "zwischen"; st.water = {};
  st.dayPlan = [0, 1, 2, 3].map(() => ({ key: "std:Hendl & Brokkoli" }));
  const w2 = boot(st);
  fire(w2, $(w2, "tab-heute"));
  const hc2 = $(w2, "heute-content");
  assert.match(fluidStat(w2).textContent, /\/ 850 ml$/);
  const tot2 = numDe(fluidStat(w2).querySelector(".v").textContent.replace(/[^\d.,]/g, ""));
  assert.ok(Math.abs(tot2 - 850) <= 12, "Zeitplan erreicht das Tagesziel: " + tot2);
  assert.match($(w2, "rx-chip").getAttribute("aria-label"), /Wasser zwischen den Mahlzeiten: \d × \d+ ml/);
  // Manuelle Vorgabe
  const fl = $(w2, "set-fluid"); fl.value = "900"; fire(w2, fl, "input");
  assert.match(fact(w2, "fluid-summary", "gabe"), /900 ml\/Tag \(manuell\)/);
  // Energiedichte: Compleat & KetoCal hätte mit Rezept-Wasser > 2 kcal/ml – die App füllt bis 1,5 kcal/ml auf
  const w3 = boot({ settings: { mctShare: 0, mahlzeiten: 4, weight: 8.5, kcal: 750, ratio: 1.5 } });
  const volOf = (cc) => numDe([...cc.querySelectorAll(".pane[data-pane=mahlzeit] .dstat")].find(t => /Volumen/.test(t.textContent)).querySelector(".v").textContent.replace(/[^\d,.]/g, ""));
  let c3 = openRecipe(w3, "Compleat & KetoCal");
  assert.ok(Math.abs(volOf(c3) - 188 / 1.5) <= 2, "Volumen ≈ 125 ml: " + volOf(c3));
  assert.match(c3.querySelector(".pane[data-pane=mahlzeit] .ing-list").textContent, /höchstens 1,5 kcal\/ml/);
  assert.match(c3.querySelector(".pane[data-pane=mahlzeit]").textContent, /Wasser so weit erhöht, dass die Mahlzeit höchstens 1,5 kcal\/ml hat/);
  fire(w3, $(w3, "detail-close"));
  const di = $(w3, "set-dichte"); di.value = "2"; fire(w3, di, "input");
  c3 = openRecipe(w3, "Compleat & KetoCal");
  assert.ok(volOf(c3) >= 90 && volOf(c3) <= 100, "bei 2 kcal/ml ≈ 94 ml: " + volOf(c3));
  assert.equal(c3.querySelector(".ratio-pill").textContent, "1,50 : 1");
  fire(w3, $(w3, "detail-close"));
  di.value = ""; fire(w3, di, "input");
  assert.equal($(w3, "set-dichte").value, "1,5");
});

test("Heute → Zeitplan: Uhrzeiten aus erster und letzter Mahlzeit, Wasser in der Pausenmitte und vor dem Schlafen, Menge nach Tagesziel, Hinweise", () => {
  const plan = [0, 1, 2, 3].map(() => ({ key: "std:Compleat & KetoCal" }));
  const w = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, mctShare: 0 }, dayPlan: plan });
  fire(w, $(w, "tab-heute"));
  let hc = $(w, "heute-content");
  assert.ok(hc.firstElementChild.classList.contains("zeitplan"), "Zeitplan steht oben");
  const times = () => [...$(w, "heute-content").querySelectorAll(".zp-row .zp-time")].map(e => e.textContent);
  assert.deepEqual(times(), ["7:00", "8:45", "10:30", "12:15", "14:00", "15:45", "17:30", "18:45", "20:00"]);
  assert.deepEqual([...hc.querySelectorAll(".zp-row")].slice(-2).map(r => r.textContent), ["18:45" + [...hc.querySelectorAll(".zp-row.water .zp-txt")].pop().textContent + "10 min", "20:00Schlafen"]);
  assert.match(hc.querySelector(".zp-row.water:nth-last-child(2) .zp-txt").textContent, /^\d+ ml Wasser vor dem Schlafen · Schlafen 20:00$/, "Abendgabe vor dem Schlafen (Schlafen dort nur in der knappsten Stufe sichtbar), danach eigene Zeile Schlafen");
  assert.equal(hc.querySelector(".zp-row.water .zp-sleep").title, "Schlafen 20:00");
  assert.equal($(w, "zp-erste").value, "07:00"); assert.equal($(w, "zp-letzte").value, "17:30"); assert.equal($(w, "zp-schlaf").value, "20:00");
  assert.ok(hc.querySelector(".zp-set").hidden, "Uhrzeiten eingeklappt");
  // Abstand kurz und in eigenem .dt-int (wird bei knapper Zeile als Ganzes ausgeblendet)
  assert.equal(hc.querySelector(".day-tools .dt-span").textContent, "7:00–17:30");
  assert.equal(hc.querySelector(".day-tools .dt-int").textContent, "· alle 3:30 h");
  const w45 = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, zpErste: "07:00", zpLetzte: "09:15", view: "heute" } });
  assert.equal(w45.document.querySelector(".day-tools .dt-int").textContent, "· alle 45 min", "unter einer Stunde in Minuten");
  const w238 = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 5, weight: 8.5, zpErste: "07:00", zpLetzte: "17:30", view: "heute" } });
  assert.equal(w238.document.querySelector(".day-tools .dt-int").textContent, "· alle 2:38 h");
  assert.deepEqual([...hc.querySelectorAll(".day-tools .tlink")].map(b => b.textContent), ["Uhrzeiten", "Drucken", "Leeren"]);
  fire(w, $(w, "zp-toggle"));
  hc = $(w, "heute-content");
  assert.ok(!hc.querySelector(".zp-set").hidden, "⏰ klappt die Uhrzeiten auf");
  const waters = [...hc.querySelectorAll(".zp-row.water .zp-txt")].map(e => e.firstChild.textContent);
  assert.equal(waters.length, 4, "3 Pausen + 1 Abendgabe");
  assert.ok(waters.every(x => x === waters[0] && /^\d+ ml Wasser$/.test(x)), waters.join(" | "));
  assert.match(hc.querySelector(".zp-row.meal").textContent, /^7:00Compleat & KetoCal125 ml · ca\. 25 min/, "Menge und Sondierdauer (≈ 5 ml/min)");
  assert.equal(hc.querySelectorAll(".zp-row.water .zp-vol").length, 0, "beim Wasser keine Zeitangabe");
  assert.equal(hc.querySelector(".zp-row.meal .zp-warn"), null, "ohne Warnung keine Warnzeile");
  // kcal/Eiweiß je Mahlzeit nur, wenn Platz ist (Klasse „more“ von fitHeute; jsdom misst nicht → kompakt)
  assert.match(hc.querySelector(".zp-row.meal .zp-more").textContent, /^ · \d+ kcal · Eiweiß [\d,]+ g$/);
  const ingTxt = ingText(hc.querySelector(".zp-row.meal"));
  assert.match(ingTxt, /^Ketocal 3:1 [\d,]+ g · Compleat [\d,]+ g · Wasser [\d,]+ ml$/, ingTxt);
  assert.doesNotMatch(ingTxt, /,0 g/, "Gramm ohne „,0“");
  assert.ok(!/roomy|more|tight/.test(hc.querySelector(".zp-list").className), "ohne Messung bleibt es bei der Grundstufe");
  // Wassergaben einzeilig, Dauer rechts in der Spalte der Mahlzeiten-Dauer (etwa 15 ml pro Minute, mindestens 5 Minuten)
  assert.match(hc.querySelector(".zp-row.water .zp-txt").textContent, /^\d+ ml Wasser$/);
  assert.match(hc.querySelector(".zp-row.water .zp-time").textContent, /^\d+:\d\d$/);
  assert.match(hc.querySelector(".zp-row.water .zp-wmin").textContent, /^\d+ min$/);
  assert.equal(hc.querySelectorAll(".zp-row.water .zp-txt br, .zp-row.water div").length, 0, "Wassergaben einzeilig");
  const tot = numDe(fluidStat(w).querySelector(".v").textContent.replace(/[^\d.,]/g, ""));
  assert.ok(Math.abs(tot - 850) <= 10, "Tagessumme ≈ 850: " + tot);
  assert.equal(hc.querySelectorAll(".zeitplan .hint.warn").length, 0, "keine Warnung bei 3 h 30 min Abstand");
  // Letzte Mahlzeit früher → Abstand 2 h → Warnung
  let el = $(w, "zp-letzte"); el.value = "13:00"; fire(w, el, "change");
  assert.match($(w, "heute-content").querySelector(".zeitplan").textContent, /Nur 2 h Abstand/);
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.zpLetzte, "13:00");
  // Letzte Mahlzeit spät → zu knapp vor dem Schlafen
  el = $(w, "zp-letzte"); el.value = "19:00"; fire(w, el, "change");
  assert.match($(w, "heute-content").querySelector(".zeitplan").textContent, /nur 1 h vor dem Schlafen/);
  // Ohne Schlafenszeit: keine Abendgabe, kein Mond
  el = $(w, "zp-schlaf"); el.value = ""; fire(w, el, "change");
  hc = $(w, "heute-content");
  assert.equal(hc.querySelectorAll(".zp-row.water").length, 3);
  assert.equal(hc.querySelectorAll(".zp-row.sleep").length, 0);
  assert.equal($(w, "zp-spuel"), null, "kein Spülen – der Schlauch wird abgenommen und separat gespült");
  assert.doesNotMatch($(w, "heute-content").textContent, /spül/i);
  // Ohne gewählte Rezepte: geschätzte Mengen, Tipp auf eine Mahlzeit öffnet die Rezeptwahl
  const w2 = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, mctShare: 0 } });
  fire(w2, $(w2, "tab-heute"));
  const hz = $(w2, "heute-content");
  assert.match(hz.querySelector(".zp-row.meal").textContent, /^7:00Mahlzeit 1 · offenwählen$/);
  assert.match(hz.querySelector(".zp-row.meal").title, /Menge geschätzt: ≈ \d+ ml/, "geschätzte Menge im Tooltip");
  assert.match(fluidStat(w2).querySelector(".v").textContent, /^ca\. /, "offene Mahlzeiten geschätzt");
  fire(w2, hz.querySelector('.empty-slot[data-pick="1"]'));
  assert.equal($(w2, "picker-overlay").hidden, false);
});

test("Anpassen: Statuszeile mit Zurücksetzen – Fleisch nur in der Ansicht, MCT-Anteil gilt für alle Rezepte", () => {
  const w = boot({ settings: { mctShare: 0.1, mahlzeiten: 5 } });
  let c = openRecipe(w, "Hendl & Brokkoli");
  const st = () => c.querySelector(".pane[data-pane=anpassen] .portion-line").textContent;
  assert.match(st(), /^Wie im Rezept · Fleisch gilt nur in dieser Ansicht · der MCT-Anteil ist die Vorgabe für alle Rezepte$/);
  assert.deepEqual([...c.querySelectorAll(".pane[data-pane=anpassen] .overline")].map(o => o.textContent), ["Fleisch", "MCT-Anteil am Öl", "Standard-Rezept"]);
  assert.match(c.querySelector(".pane[data-pane=anpassen] .meat-swap .adj-text").textContent, /^Gilt nur für diese Ansicht/);
  assert.match(c.querySelector(".pane[data-pane=anpassen] .meat-swap.oil .adj-text").textContent, /^Gilt für alle Rezepte mit Öl, wie unter Vorgaben/);
  // Fleisch tauschen → Statuszeile + ↺ wie im Rezept
  fire(w, c.querySelector('.meat-swap button[data-meat="rind"]')); c = $(w, "detail-content");
  assert.match(st(), /^Fleisch getauscht: Rind \(nur in dieser Ansicht\) · wie im Rezept$/);
  assert.ok([...c.querySelectorAll(".pane[data-pane=mahlzeit] .ing-row")].some(r => /Rind/.test(r.textContent)), "Rind in der Tabelle");
  fire(w, c.querySelector(".meat-reset")); c = $(w, "detail-content");
  assert.match(st(), /^Wie im Rezept/);
  assert.ok([...c.querySelectorAll(".pane[data-pane=mahlzeit] .ing-row")].some(r => /Hüh/.test(r.textContent)), "wieder Huhn");
  // MCT-Anteil ändern → gilt global (Vorgaben), Statuszeile nennt den Wert beim Öffnen, ↺ stellt ihn wieder her
  fire(w, c.querySelector('.meat-swap button[data-mcts="30"]')); c = $(w, "detail-content");
  assert.match(st(), /^MCT-Anteil 30 % statt 10 % – gilt für alle Rezepte \(Vorgaben\) · zurück auf 10 %$/);
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
  assert.match(res.querySelector(".ing-row.fatrow").textContent, /Schlagobers.*stellt das Verhältnis ein/);
  assert.match(c.querySelector("#compose-meta").textContent, /1,80 : 1.*140 kcal je Portion/);
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
  assert.ok([...w.document.querySelectorAll('meta[name="theme-color"]')].every(m => m.getAttribute("content") === "#1c1a16"));
  // Neustart übernimmt die Wahl; „Wie das Gerät“ entfernt das Attribut wieder
  const w2 = boot(JSON.parse(w.localStorage.getItem("ketoplaner.v5")));
  assert.equal(w2.document.documentElement.getAttribute("data-theme"), "dark");
  fire(w2, w2.document.querySelector('#theme-ctl button[data-theme="auto"]'));
  assert.equal(w2.document.documentElement.getAttribute("data-theme"), null);
});

test("Detail: nach unten wischen schließt die Ansicht (nicht bei kurzem oder seitlichem Wisch)", async () => {
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
  // Wisch auf der Tabelle (nicht am Kopf) schließt ebenfalls – überall auf der Karte
  c = openRecipe(w, "Hendl & Brokkoli");
  const tbl = c.querySelector(".pane[data-pane=mahlzeit] .ing-list");
  touch(tbl, "touchstart", 100, 300); touch(tbl, "touchmove", 100, 500); touch(tbl, "touchend", 100, 500); await wait(220);
  assert.ok($(w, "detail-overlay").hidden, "Wisch auf dem Inhalt schließt auch");
});

test("Liste: seitliches Ziehen im Rezeptbereich wechselt die Gruppe (links = nächste, rechts = vorige), senkrecht nicht, kein Klick nach dem Zug", async () => {
  const w = boot({ settings: { mctShare: 0, filter: "favoriten" }, favorites: ["std:Hendl & Brokkoli"] }); // Favoriten ist die Gruppe nach „Alle“
  const list = $(w, "recipe-list");
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const ptr = (type, x, y, target) => (target || list).dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
  // Zug in drei Schritten; der Wechsel läuft nach dem Loslassen als Übergang durch (alte Liste hinaus, neue herein)
  const drag = async (x1, y1, x2, y2) => { ptr("pointerdown", x1, y1); ptr("pointermove", (x1 + x2) / 2, (y1 + y2) / 2); ptr("pointermove", x2, y2); ptr("pointerup", x2, y2); await wait(450); };
  const activeChip = () => w.document.querySelector("#filter-bar .chip.active").textContent.trim();
  const stored = () => JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.filter;
  assert.equal(activeChip(), "Favoriten");
  // Während des Ziehens: Markierung springt wie bei den Detail-Reitern ab halbem Weg um, kein Überblenden
  ptr("pointerdown", 300, 400); ptr("pointermove", 240, 402);
  // … und die Nachbargruppe steht schon als zweite Fläche neben der Liste, beide 1:1 mitgezogen
  const peek = $(w, "recipe-peek");
  assert.ok(peek, "Nachbargruppe wird beim Ziehen gerendert");
  const heads = [...peek.querySelectorAll(".group-head")].map(h => h.textContent);
  // Favoriten stehen bei jeder Gruppe oben; daneben nur die Nachbargruppe
  const groupHeads = heads.filter(h => !/Favoriten/.test(h));
  assert.ok(groupHeads.length >= 1 && groupHeads.every(h => /Geflügel/.test(h)), "zweite Fläche zeigt nur die Nachbargruppe (und die Favoriten): " + heads.join(", "));
  assert.ok(peek.querySelectorAll(".tile").length >= 5, "Kacheln in der zweiten Fläche");
  assert.equal(list.style.transform, "translateX(-60px)");
  assert.equal(peek.style.transform, "translateX(284px)", "Nachbarfläche eine Seitenbreite (320 + 24 Spalt) daneben");
  assert.equal(activeChip(), "Favoriten", "unter halbem Weg bleibt die Markierung");
  assert.ok(!w.document.querySelector("#filter-bar .chip.hl"), "kein Überblenden der Chips");
  ptr("pointermove", 100, 402);
  assert.equal(activeChip(), "Geflügel", "über halbem Weg springt die Markierung um");
  assert.equal(stored(), "favoriten", "gespeichert wird erst beim Loslassen");
  ptr("pointermove", 250, 402);
  assert.equal(activeChip(), "Favoriten", "zurückziehen nimmt die Markierung zurück");
  ptr("pointermove", 100, 402);
  ptr("pointerup", 100, 402); await wait(450);
  assert.equal(activeChip(), "Geflügel"); assert.equal(stored(), "gefluegel");
  assert.equal($(w, "recipe-peek"), null, "zweite Fläche nach dem Wechsel wieder weg");
  assert.equal(list.style.transform, "", "Liste steht wieder in Ruhelage");
  // weiter nach links → nächste Gruppe
  await drag(300, 400, 100, 400);
  assert.equal(activeChip(), "Rind & Schwein");
  // nach rechts ziehen → vorige Gruppe
  await drag(100, 400, 300, 395);
  assert.equal(activeChip(), "Geflügel");
  // senkrechtes Ziehen (Scrollen) wechselt nicht, kurzer Zug auch nicht
  await drag(200, 300, 210, 500);
  await drag(200, 300, 170, 300);
  assert.equal(activeChip(), "Geflügel");
  assert.equal($(w, "recipe-peek"), null, "zweite Fläche nach kurzem Zug wieder weg");
  // nach rechts: Favoriten, dann „Alle“ – am Anfang bleibt „Alle“ stehen
  await drag(100, 400, 300, 400);
  assert.equal(activeChip(), "Favoriten");
  await drag(100, 400, 300, 400);
  assert.equal(activeChip(), "Alle");
  await drag(100, 400, 300, 400);
  assert.equal(activeChip(), "Alle");
  // Nach einem Zug öffnet der folgende Klick auf eine Kachel kein Rezept; ein normaler Tipp danach schon
  const tile = () => tiles(w)[0];
  ptr("pointerdown", 300, 400, tile()); ptr("pointermove", 200, 400, tile()); ptr("pointerup", 100, 400, tile()); await wait(450);
  assert.equal(activeChip(), "Favoriten");
  fire(w, tile());
  assert.ok($(w, "detail-overlay").hidden, "Klick nach dem Zug wird geschluckt");
  fire(w, tile());
  assert.ok(!$(w, "detail-overlay").hidden, "normaler Tipp öffnet");
});

test("Detail → „Für heute“: Rezept für alle, nur freie oder eine Mahlzeit übernehmen, Meldung mit Rückgängig und Ansehen", () => {
  const w = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, mctShare: 0 }, dayPlan: [{ key: "std:KetoCal & Pre Apta" }, { key: null }, { key: null }, { key: null }] });
  const plan = () => JSON.parse(w.localStorage.getItem("ketoplaner.v5")).dayPlan.map(s => s.key);
  let c = openRecipe(w, "Compleat & KetoCal");
  // Fußleiste: „Für heute einplanen“ und runde Knöpfe Editor · Drucken · Favorit (Beschriftung für Screenreader)
  assert.ok($(w, "today-btn") && $(w, "edit-btn"));
  assert.equal($(w, "today-btn").textContent, "Für heute einplanen");
  assert.deepEqual([...c.querySelectorAll("#detail-actions .round-btn .vh")].map(e => e.textContent), ["Editor", "Drucken", "Favorit"]);
  fire(w, $(w, "today-btn"));
  let sh = $(w, "today-sheet");
  assert.ok(sh, "Auswahl klappt auf");
  const opts = [...sh.querySelectorAll("[data-today]")].map(b => b.dataset.today);
  assert.deepEqual(opts, ["all", "free", "0", "1", "2", "3"]);
  assert.match(sh.textContent, /Alle 4 Mahlzeiten.*ersetzt den bisherigen Plan.*Nur freie Mahlzeiten \(3\).*7:00 · Mahlzeit 1KetoCal & Pre Apta.*10:30 · Mahlzeit 2frei/);
  // Nur freie: Mahlzeit 1 bleibt
  fire(w, sh.querySelector('[data-today="free"]'));
  assert.equal($(w, "today-sheet"), null, "Auswahl schließt");
  assert.deepEqual(plan(), ["std:KetoCal & Pre Apta", "std:Compleat & KetoCal", "std:Compleat & KetoCal", "std:Compleat & KetoCal"]);
  assert.match($(w, "toast").textContent, /Compleat & KetoCal für 3 freie Mahlzeiten übernommen/);
  // Rückgängig stellt den vorherigen Plan her
  fire(w, [...$(w, "toast").querySelectorAll(".toast-btn")].find(b => b.textContent === "Rückgängig"));
  assert.deepEqual(plan(), ["std:KetoCal & Pre Apta", null, null, null]);
  // Alle Mahlzeiten
  fire(w, $(w, "today-btn")); fire(w, $(w, "today-sheet").querySelector('[data-today="all"]'));
  assert.deepEqual(plan(), [0, 1, 2, 3].map(() => "std:Compleat & KetoCal"));
  // Einzelne Mahlzeit ersetzen; schon gesetzte ist mit ✓ markiert, „nur freie“ fehlt, wenn nichts frei ist
  c = openRecipe(w, "KetoCal & Pre Apta");
  fire(w, $(w, "today-btn")); sh = $(w, "today-sheet");
  assert.equal(sh.querySelector('[data-today="free"]'), null);
  fire(w, sh.querySelector('[data-today="2"]'));
  assert.deepEqual(plan(), ["std:Compleat & KetoCal", "std:Compleat & KetoCal", "std:KetoCal & Pre Apta", "std:Compleat & KetoCal"]);
  assert.match($(w, "toast").textContent, /für Mahlzeit 3 \(14:00\) übernommen/);
  fire(w, $(w, "today-btn"));
  assert.match($(w, "today-sheet").querySelector('[data-today="2"]').textContent, /Mahlzeit 3 ✓/);
  // Klick daneben schließt die Auswahl
  fire(w, $(w, "detail-overlay")); assert.equal($(w, "today-sheet"), null);
  // Ansehen: Detail zu, Heute offen, Zeitleiste zeigt die Rezepte
  fire(w, $(w, "today-btn")); fire(w, $(w, "today-sheet").querySelector('[data-today="0"]'));
  fire(w, [...$(w, "toast").querySelectorAll(".toast-btn")].find(b => b.textContent === "Ansehen"));
  assert.ok($(w, "detail-overlay").hidden); assert.ok(!$(w, "view-heute").hidden);
  assert.match($(w, "heute-content").querySelector(".zp-row.meal").textContent, /^7:00.*KetoCal & Pre Apta/);
});

test("Kochen: Öl wird nicht mitpüriert, letzter Schritt rührt das Öl in jede Portion; Eiweiß über dem Doppelten wird markiert", () => {
  const w = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, mctShare: 0.1 } });
  // In keinem gekochten Rezepttext steht Öl beim Pürieren
  const recs = new Function(read("recipes.js") + "; return RECIPES_SONDE;")().filter(r => !r.angeruehrt);
  recs.forEach(r => ["zubereitung", "thermomix", "varoma"].forEach(k => {
    if (r[k]) assert.doesNotMatch(r[k], /Rapsöl|Olivenöl/, r.name + " / " + k);
  }));
  let c = openRecipe(w, "Hendl & Brokkoli");
  c = switchDetailTab(w, "zubereitung");
  const steps = [...c.querySelectorAll(".pane[data-pane=zubereitung] .steps li")].map(li => li.textContent);
  assert.match(steps[steps.length - 1], /^Abfüllen und in jede Portion Rapsöl [\d,]+ g \+ MCT-Öl [\d,]+ g gründlich einrühren\.$/);
  assert.ok(steps.some(s => /Dämpfwasser NICHT abgießen.*zusammen mit den gedämpften Zutaten 30–40 Sek/.test(s)), steps.join(" | "));
  assert.match(c.querySelector(".pane[data-pane=zubereitung] .portion-line").textContent, /Öl gesamt Raps \d+ g \+ MCT \d+ g/);
  // Mahlzeit: Eiweiß ~3× Ziel → ▲ im Warnkasten; Volumen mit Öl wie im Zeitplan
  const mz = c.querySelector(".pane[data-pane=mahlzeit]");
  assert.match(mz.querySelector(".note.warn").textContent, /^▲ Eiweiß [\d,]+-mal so hoch wie das Ziel/);
  assert.doesNotMatch(mz.textContent, /ohne Öl/);
  fire(w, $(w, "detail-close"));
  // Rezeptliste: ↑ am Eiweiß
  assert.ok(tiles(w).some(t => /Eiweiß [\d,]+ g · hoch/.test(t.textContent) && t.querySelector(".prot-high")));
  // Angerührt: kein zusätzlicher Öl-Schritt (Text sagt es selbst)
  c = openRecipe(w, "HiPP Hühnchen & Öl"); c = switchDetailTab(w, "zubereitung");
  assert.doesNotMatch(c.querySelector(".pane[data-pane=zubereitung]").textContent, /in jede Portion/);
  assert.match(c.querySelector(".pane[data-pane=zubereitung]").textContent, /Rapsöl( \+ MCT-Öl)? gründlich einrühren/);
  assert.doesNotMatch(c.textContent, /vor dem Füttern/, "kein „vor dem Füttern“ mehr");
});

test("Drucken: Vorschau in der App statt neuem Fenster, mit Zurück und Drucken (iPhone-App)", () => {
  const w = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, mctShare: 0 }, dayPlan: [0, 1, 2, 3].map(() => ({ key: "std:Compleat & KetoCal" })) });
  let opened = 0, printed = 0; w.open = () => { opened++; return null; }; w.print = () => { printed++; };
  fire(w, $(w, "tab-heute"));
  fire(w, $(w, "print-day"));
  const ov = $(w, "print-overlay");
  assert.ok(ov && !ov.hidden, "Vorschau offen"); assert.equal(opened, 0, "kein neues Fenster");
  const root = $(w, "print-sheet").shadowRoot;
  // Küchenzettel: A6-Karte, groß Uhrzeit · Mahlzeit · ml, darunter Rezept, Dauer und Zutaten
  const kz = root.querySelector(".kz"); assert.ok(kz, "Küchenzettel");
  // A6 im linken oberen Viertel von A4 (zweimal falten), endet 2,5 cm über der Falzkante; ohne Datum
  assert.match(root.querySelector("style").textContent, /\.kz\{position:absolute;left:0;top:0;width:105mm;height:123\.5mm/);
  assert.ok($(w, "print-sheet").classList.contains("bleed") && !$(w, "print-sheet").classList.contains("landscape"), "Vorschau A4 hoch, randlos");
  assert.match(w.document.getElementById("print-page-style").textContent, /@page\{size:A4 portrait;margin:0\}/, "Druck randlos im Hochformat");
  assert.equal(kz.querySelector(".kz-h .ti b").textContent, "Tagesplan");
  assert.equal(kz.querySelector(".kz-h .rx .pill").textContent, "Verhältnis 1,5:1", "Verhältnis oben rechts, kein Datum");
  assert.equal(kz.querySelector(".kz-h .rx small").textContent, "750 kcal · 850 ml pro Tag");
  assert.ok(root.querySelector(".kz-fold.v") && root.querySelector(".kz-fold.h"), "Falzlinien");
  const first = kz.querySelector(".r.me");
  assert.equal(first.querySelector(".t").textContent, "7:00"); assert.equal(first.querySelector(".w .n").textContent, "Compleat & KetoCal", "Rezeptname statt „Mahlzeit 1“");
  assert.match(first.querySelector(".m").textContent, /^\d+ ml$/);
  assert.match(first.querySelector(".w .d").textContent, /^\d+ min$/, "Dauer beim Rezept");
  const wa = kz.querySelector(".r.wa"); assert.match(wa.querySelector(".d").textContent, /^\d+ min$/, "Dauer auch beim Wasser");
  // Zutaten: jedes Rezept einmal, mit allen Uhrzeiten
  const rbs = [...kz.querySelectorAll(".rb")];
  assert.equal(rbs.length, 1, "4 × Compleat & KetoCal → ein Rezeptblock");
  assert.match(rbs[0].querySelector(".rn").textContent, /^Compleat & KetoCal 7:00 · \d+:\d\d · \d+:\d\d · \d+:\d\d$/);
  const z1 = [...rbs[0].querySelectorAll(".z .i")].map(i => i.querySelector("span").textContent + " | " + i.querySelector("b").textContent.replace(/\s/g, " "));
  assert.ok(/^Ketocal 3:1 \| [\d,]+ g$/.test(z1[0]) && /^Compleat \| [\d,]+ g$/.test(z1[1]), z1.join(", "));
  assert.ok(kz.querySelectorAll(".r.wa").length >= 3, "Wassergaben"); assert.ok(kz.querySelector(".r.sl"), "Schlafen");
  assert.ok(!root.querySelector("table") && !/Tagessummen|Verordnung/.test(root.textContent), "keine A4-Tabellen und Summen mehr");
  assert.doesNotMatch(root.querySelector("style").textContent, /(^|[}\s])body\s*\{|@page/, "Druckstil berührt die App nicht");
  assert.ok(w.document.body.classList.contains("printing"));
  fire(w, $(w, "print-go")); assert.equal(printed, 1, "Drucken ruft den Druckdialog");
  fire(w, $(w, "print-back"));
  assert.ok(ov.hidden, "Zurück schließt die Vorschau"); assert.ok(!w.document.body.classList.contains("printing"));
  assert.ok(!w.document.body.classList.contains("modal-open"), "Seite wieder scrollbar");
  // Rezept-Ausdruck aus der Detailansicht: Vorschau liegt über dem Rezept, Zurück führt ins Rezept
  const c = openRecipe(w, "Compleat & KetoCal");
  fire(w, [...c.querySelectorAll("#detail-actions .btn")].find(b => /Drucken/.test(b.textContent)));
  assert.ok(!ov.hidden); assert.match($(w, "print-sheet").shadowRoot.textContent, /Compleat & KetoCal.*Verhältnis.*Zutaten/);
  assert.match($(w, "print-sheet").shadowRoot.querySelector(".rx").textContent, /^Verhältnis [\d,]+:1 · /, "Kennzeile ohne Fettbasis, beginnt mit dem Verhältnis");
  assert.equal($(w, "print-sheet").shadowRoot.querySelector("h1 .name-suffix"), null, "Sondennahrung ohne Zusatz");
  assert.ok(!$(w, "print-sheet").classList.contains("bleed"), "Rezept wieder mit Seitenrand");
  assert.match(w.document.getElementById("print-page-style").textContent, /size:A4 portrait/);
  fire(w, $(w, "print-back"));
  assert.ok(ov.hidden); assert.ok(!$(w, "detail-overlay").hidden, "Rezept bleibt offen");
  // Titel wie in der App: Name groß, „· mit KetoCal“ klein in .name-suffix
  fire(w, $(w, "detail-close"));
  const c2 = openRecipe(w, "Hendl & Karfiol · mit KetoCal");
  fire(w, [...c2.querySelectorAll("#detail-actions .btn")].find(b => /Drucken/.test(b.textContent)));
  const h1 = $(w, "print-sheet").shadowRoot.querySelector("h1");
  assert.equal(h1.firstChild.textContent, "Hendl & Karfiol");
  assert.equal(h1.querySelector(".name-suffix").textContent, " · mit KetoCal");
  fire(w, $(w, "print-back"));
});

test("Teilen: PDF aus der Druckvorschau wird erzeugt und ans Teilen-Menü übergeben (Fallback: Download)", async () => {
  const w = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, mctShare: 0.1 }, dayPlan: [0, 1, 2, 3].map(i => ({ key: i === 2 ? "std:Hendl & Brokkoli" : "std:Compleat & KetoCal" })) });
  // PDF-Bibliothek wie in der App laden
  if (!w.TextEncoder) { w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; } // im Browser vorhanden, jsdom liefert sie nicht
  w.eval(read("vendor/jspdf.umd.min.js")); w.eval(read("vendor/jspdf.plugin.autotable.min.js"));
  assert.ok(w.jspdf && w.jspdf.jsPDF, "jsPDF geladen");
  let shared = null;
  Object.defineProperty(w.navigator, "canShare", { value: (d) => !!(d && d.files && d.files.length), configurable: true });
  Object.defineProperty(w.navigator, "share", { value: async (d) => { shared = d; }, configurable: true });
  fire(w, $(w, "tab-heute")); fire(w, $(w, "print-day"));
  fire(w, $(w, "print-share"));
  await new Promise(r => setTimeout(r, 50));
  assert.ok(shared && shared.files && shared.files[0], "Teilen-Menü bekommt eine Datei");
  // Küchenzettel: gleiche Reihenfolge wie Heute, Öl als normale Zutat am Ende, kein „vor dem Füttern“
  const ps = w.document.getElementById("print-sheet").shadowRoot;
  const meals = [...ps.querySelectorAll(".r.me")];
  assert.equal(meals.length, 4);
  assert.equal(meals[2].querySelector(".w .n").textContent, "Hendl & Brokkoli");
  const blocks = [...ps.querySelectorAll(".rb")];
  assert.deepEqual(blocks.map(b => b.querySelector(".rn b").textContent), ["Compleat & KetoCal", "Hendl & Brokkoli"], "jedes Rezept nur einmal");
  assert.doesNotMatch(ps.textContent, /Mahlzeit \d/);
  const ing = [...blocks[1].querySelectorAll(".z .i span")].map(i => i.textContent);
  assert.ok(/Hühnerbrust/.test(ing[0]) && /Rapsöl/.test(ing[ing.length - 2]) && /MCT-Öl/.test(ing[ing.length - 1]), ing.join(", "));
  assert.doesNotMatch(ps.textContent, /vor dem Füttern/, "kein „Öl vor dem Füttern“ im Ausdruck");
  const f = shared.files[0];
  assert.match(f.name, /^Tagesplan \d{4}-\d{2}-\d{2}\.pdf$/); assert.equal(f.type, "application/pdf");
  const buf = Buffer.from(await new Promise(res => { const fr = new w.FileReader(); fr.onload = () => res(fr.result); fr.readAsArrayBuffer(f); }));
  assert.equal(buf.slice(0, 5).toString(), "%PDF-", "echtes PDF"); assert.ok(buf.length > 3000, "PDF-Größe " + buf.length);
  // Rezept-Ausdruck → Dateiname = Rezeptname
  fire(w, $(w, "print-back"));
  const c = openRecipe(w, "Hendl & Brokkoli");
  fire(w, [...c.querySelectorAll("#detail-actions .btn")].find(b => /Drucken/.test(b.textContent)));
  shared = null; fire(w, $(w, "print-share")); await new Promise(r => setTimeout(r, 50));
  assert.equal(shared.files[0].name, "Hendl & Brokkoli.pdf");
});

test("iPhone als Home-Bildschirm-App: „Drucken“ öffnet das PDF im Teilen-Menü (iOS ignoriert dort window.print)", async () => {
  const w = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, mctShare: 0 } });
  if (!w.TextEncoder) { w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; }
  w.eval(read("vendor/jspdf.umd.min.js")); w.eval(read("vendor/jspdf.plugin.autotable.min.js"));
  let printed = 0, shared = null; w.print = () => { printed++; };
  Object.defineProperty(w.navigator, "canShare", { value: () => true, configurable: true });
  Object.defineProperty(w.navigator, "share", { value: async (d) => { shared = d; }, configurable: true });
  Object.defineProperty(w.navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15", configurable: true });
  const c = openRecipe(w, "Hendl & Brokkoli");
  fire(w, [...c.querySelectorAll("#detail-actions .btn")].find(b => /Drucken/.test(b.textContent)));
  // In Safari (nicht installiert): normaler Druckdialog
  fire(w, $(w, "print-go")); await new Promise(r => setTimeout(r, 50));
  assert.equal(printed, 1); assert.equal(shared, null);
  // Als Home-Bildschirm-App: PDF ins Teilen-Menü, kein window.print, Hinweis auf „Drucken“
  Object.defineProperty(w.navigator, "standalone", { value: true, configurable: true });
  fire(w, $(w, "print-go")); await new Promise(r => setTimeout(r, 50));
  assert.equal(printed, 1, "window.print nicht aufgerufen");
  assert.equal(shared.files[0].name, "Hendl & Brokkoli.pdf");
  assert.match(w.document.body.textContent, /Im Teilen-Menü auf „Drucken“ tippen/);
});

test("Drucken aus dem Editor: Vorschau öffnet sich ohne Fehler, Öl als letzter Schritt", () => {
  const w = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, mctShare: 0 } });
  const c = openRecipe(w, "Hendl & Karotte");
  fire(w, c.querySelector("#edit-btn"));
  const pb = [...w.document.querySelectorAll("#compose-actions .btn")].find(b => /Drucken/.test(b.textContent));
  assert.ok(pb, "Drucken im Editor"); fire(w, pb);
  assert.ok(!$(w, "print-overlay").hidden, "Vorschau offen");
  assert.match($(w, "print-sheet").shadowRoot.textContent, /Zutaten.*Zubereitung/);
});

test("Druckvorschau zoomen: zwei Finger auseinander vergrößert, Doppeltippen wechselt zwischen 2,5-fach und Seitenbreite", async () => {
  const w = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, mctShare: 0 }, dayPlan: [0, 1, 2, 3].map(() => ({ key: "std:Compleat & KetoCal" })) });
  fire(w, $(w, "tab-heute")); fire(w, $(w, "print-day"));
  const ov = $(w, "print-overlay"), sc = ov.querySelector(".print-scroll"), sheet = $(w, "print-sheet");
  const touch = (type, pts, changed) => { const ev = new w.Event(type, { bubbles: true, cancelable: true }); ev.touches = pts; ev.changedTouches = changed || pts; sc.dispatchEvent(ev); return ev; };
  const zoomOf = () => parseFloat(sheet.style.zoom || "1");
  const z0 = zoomOf();
  // Pinch: Abstand 100 → 200 px
  const ev = touch("touchstart", [{ clientX: 100, clientY: 200 }, { clientX: 200, clientY: 200 }]);
  assert.ok(ev.defaultPrevented, "die App übernimmt das Zwei-Finger-Zoomen");
  touch("touchmove", [{ clientX: 50, clientY: 200 }, { clientX: 250, clientY: 200 }]);
  touch("touchend", [], [{ clientX: 250, clientY: 200 }]);
  assert.ok(Math.abs(zoomOf() / z0 - 2) < 0.02, "doppelt so groß: " + zoomOf() + " statt " + z0);
  assert.ok(ov.classList.contains("zoomed"));
  // Doppeltippen: zurück auf Seitenbreite
  const tap = () => { touch("touchstart", [{ clientX: 150, clientY: 300 }]); touch("touchend", [], [{ clientX: 150, clientY: 300 }]); };
  tap(); tap();
  assert.ok(Math.abs(zoomOf() - z0) < 0.002, "zurück auf Seitenbreite"); assert.ok(!ov.classList.contains("zoomed"));
  await new Promise(r => setTimeout(r, 400));
  tap(); tap();
  assert.ok(Math.abs(zoomOf() / z0 - 2.5) < 0.02, "Doppeltippen vergrößert 2,5-fach");
  // Nicht kleiner als Seitenbreite, nicht größer als 4-fach
  touch("touchstart", [{ clientX: 100, clientY: 200 }, { clientX: 300, clientY: 200 }]); touch("touchmove", [{ clientX: 195, clientY: 200 }, { clientX: 205, clientY: 200 }]); touch("touchend", [], []);
  assert.ok(Math.abs(zoomOf() - z0) < 0.002, "Untergrenze Seitenbreite");
  // Neues Öffnen beginnt wieder bei Seitenbreite
  fire(w, $(w, "print-back")); fire(w, $(w, "print-day"));
  assert.ok(Math.abs(zoomOf() - z0) < 0.002);
});

test("Öl-Erkennung: „Thunfisch in Öl“ ist eine Zutat, kein Öl zum Einrühren", () => {
  const w = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, mctShare: 0.1 }, dayPlan: [{ key: "std:Thunfisch & Zucchini" }, { key: null }, { key: null }, { key: null }] });
  fire(w, $(w, "tab-heute"));
  const ing = ingText($(w, "heute-content").querySelector(".zp-row.meal"));
  assert.match(ing, /^Thunfisch in Öl [\d,]+ g · /, ing);
  assert.match(ing, / · Rapsöl [\d,]+ g · MCT-Öl [\d,]+ g$/, "Öle am Ende");
  let c = openRecipe(w, "Thunfisch & Zucchini"); c = switchDetailTab(w, "zubereitung");
  assert.doesNotMatch(c.textContent, /Thunfisch in Öl \(Dose, abgetropft\) · einrühren/);
  assert.doesNotMatch(c.textContent, /in jede Portion[^.]*Thunfisch/);
});

test("Detailansicht: nach unten wischen schließt – auf jedem Blatt, nur wenn oben, nicht waagrecht und nicht im Eingabefeld", async () => {
  const w = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, mctShare: 0.1 } });
  const touch = (el, type, x, y) => {
    const ev = new w.Event(type, { bubbles: true, cancelable: true });
    const t = [{ clientX: x, clientY: y, target: el }];
    Object.defineProperty(ev, "touches", { value: type === "touchend" ? [] : t });
    Object.defineProperty(ev, "changedTouches", { value: t });
    el.dispatchEvent(ev);
  };
  const drag = (el, dx, dy) => { touch(el, "touchstart", 100, 100); touch(el, "touchmove", 100 + dx / 2, 100 + dy / 2); touch(el, "touchmove", 100 + dx, 100 + dy); touch(el, "touchend", 100 + dx, 100 + dy); };
  const wait = () => new Promise(r => setTimeout(r, 220));
  const ov = $(w, "detail-overlay");
  for (const pane of ["mahlzeit", "abwiegen", "anpassen", "zubereitung"]) {
    const c = openRecipe(w, "Hendl & Brokkoli");
    const target = c.querySelector(".pane[data-pane=" + pane + "]").firstElementChild;
    drag(target, 0, 150); await wait();
    assert.ok(ov.hidden, "Blatt " + pane + ": nach unten gewischt → geschlossen");
  }
  let c = openRecipe(w, "Hendl & Brokkoli");
  const pz = c.querySelector(".pane[data-pane=zubereitung]");
  drag(pz.firstElementChild, 150, 20); await wait();
  assert.ok(!ov.hidden, "waagrecht blättert nur");
  pz.scrollTop = 80; Object.defineProperty(pz, "scrollTop", { value: 80, configurable: true });
  pz.style.overflowY = "auto";
  drag(pz.firstElementChild, 0, 150); await wait();
  assert.ok(!ov.hidden, "Blatt nicht ganz oben → erst scrollen");
  const inp = c.querySelector(".pane[data-pane=mahlzeit] input");
  assert.ok(inp, "Gramm-Feld vorhanden");
  inp.focus(); drag(inp, 0, 150); await wait(); assert.ok(!ov.hidden, "im gerade bearbeiteten Feld wird nicht gezogen");
  inp.blur(); drag(inp, 0, 150); await wait(); assert.ok(ov.hidden, "über ein Gramm-Feld ziehen schließt (Feld nicht in Bearbeitung)");
  c = openRecipe(w, "Hendl & Brokkoli");
  drag(c.querySelector(".detail-head") || c.firstElementChild, 0, 40); await wait();
  assert.ok(!ov.hidden, "kurzer, langsamer Zug springt zurück");
});

test("Audit: Rundung verfälscht kcal nicht, unpassende Rezepte im Tagesplan markiert, Leeren mit Rückgängig, Pille sofort aktuell", () => {
  // Rundung: kleine Mengen (Compleat bei 3:1) werden nicht grob gerundet – kcal bleiben beim Ziel
  let w = boot({ settings: { kcal: 680, weight: 8.5, mctShare: 0, ratio: 3, mahlzeiten: 5 } });
  let c = openRecipe(w, "Compleat & KetoCal");
  const kcal = parseFloat(c.querySelector(".pane[data-pane=mahlzeit] .dstat .v").textContent);
  assert.ok(Math.abs(kcal - 136) <= 5, "kcal je Mahlzeit nahe 136: " + kcal);
  // Rezept, das die Verordnung nicht erreicht: markiert, nicht in den Summen
  w = boot({ settings: { kcal: 750, weight: 8.5, mctShare: 0, ratio: 1.5, mahlzeiten: 4 }, dayPlan: [{ key: "std:Marille (Obstbrei, mit KetoCal)" }, { key: "std:Compleat & KetoCal" }, { key: null }, { key: null }] });
  fire(w, $(w, "tab-heute"));
  const hc = $(w, "heute-content");
  const bad = hc.querySelector(".bad-slot");
  assert.ok(bad, "unpassendes Rezept markiert");
  {
    assert.match(bad.textContent, /passt nicht zu 1,5 : 1/);
    assert.match(bad.textContent, /wählen$/);
    assert.ok(!bad.querySelector(".zp-ing"), "keine (unangepassten) Gramm");
    assert.match($(w, "day-sums").querySelector(".dstat").textContent, /^188 \/ 750 kcal$/, "Summen nur für die passende Mahlzeit");
    assert.match($(w, "day-sums").querySelector(".dstat").title, /Ziel 188 kcal für 1 geplante Mahlzeit/);
  }
  // „Leeren“ (im Auswahlfenster) entfernt mit „Rückgängig“; die Kopf-Pille rechnet sofort neu
  w = boot({ settings: { kcal: 750, weight: 8.5, mctShare: 0, ratio: 1.5, mahlzeiten: 4 }, dayPlan: [0, 1, 2, 3].map(i => ({ key: i === 1 ? "std:Hendl & Brokkoli" : "std:Compleat & KetoCal" })) });
  fire(w, $(w, "tab-heute"));
  const pill0 = $(w, "rx-chip").getAttribute("aria-label");
  fire(w, $(w, "heute-content").querySelector('.zp-row.slot [data-pick="1"]')); fire(w, $(w, "picker-clear"));
  assert.equal($(w, "heute-content").querySelectorAll(".slot.empty-slot").length, 1);
  assert.notEqual($(w, "rx-chip").getAttribute("aria-label"), pill0, "Pille zeigt die neue Wassermenge");
  assert.match($(w, "rx-chip").getAttribute("aria-label"), /Wasser zwischen den Mahlzeiten: ≈ \d × \d+ ml/, "≈, solange eine Mahlzeit geschätzt ist");
  assert.match($(w, "toast").textContent, /Mahlzeit 2 geleert/);
  fire(w, $(w, "toast").querySelector(".toast-btn"));
  assert.equal($(w, "heute-content").querySelectorAll(".slot.empty-slot").length, 0, "Rückgängig");
  assert.equal($(w, "rx-chip").getAttribute("aria-label"), pill0);
});

test("Audit: Öl-Erkennung, Schlafen vor der letzten Mahlzeit, Suche in einer Gruppe, Service Worker lädt alles vor", () => {
  const w = boot({ settings: { kcal: 750, weight: 8.5, mctShare: 0, ratio: 1.5, mahlzeiten: 4, zpSchlaf: "17:00" } });
  fire(w, $(w, "tab-heute"));
  assert.match($(w, "heute-content").textContent, /Schlafen liegt vor der letzten Mahlzeit/);
  // Suche ohne Treffer in einer Gruppe → Knopf „In allen Gruppen suchen“
  fire(w, w.document.querySelector('.tabbar button[data-view="rezepte"]'));
  const chip = [...w.document.querySelectorAll("#filter-bar .chip")].find(b => /Rind/.test(b.textContent));
  if (chip) {
    fire(w, chip);
    const sb = $(w, "recipe-search"); sb.value = "hendl"; fire(w, sb, "input");
    const btn = [...$(w, "recipe-list").querySelectorAll("button")].find(b => /In allen Gruppen suchen/.test(b.textContent));
    assert.ok(btn, "Knopf vorhanden"); fire(w, btn); assert.ok($(w, "recipe-list").querySelectorAll(".tile").length > 0, "Treffer in allen Gruppen");
  }
  // Service Worker: alle versionierten Dateien in der Vorladeliste, Kopie vor dem asynchronen Cachen
  const sw = read("sw.js"), html = read("index.html");
  (html.match(/(?:href|src)="([^"]+\?v=[^"]+)"/g) || []).forEach(m => { const u = m.replace(/^(?:href|src)="/, "").replace(/"$/, ""); assert.ok(sw.indexOf('"./' + u + '"') !== -1, "vorgeladen: " + u); });
  assert.doesNotMatch(sw, /c\.put\(req, r\.clone\(\)\)/, "clone() nicht erst im then()");
});

test("Erinnerungsdienst (push-worker): Verschlüsselung nach RFC 8291, VAPID-Signatur, pünktlich genau einmal, abgelaufene Abos entfernt", async () => {
  const crypto = require("crypto");
  const W = await import("data:text/javascript;base64," + Buffer.from(read("push-worker/worker.js")).toString("base64"));
  const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const sub = { endpoint: "https://web.push.apple.com/test", keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } };
  // eigene Entschlüsselung (unabhängig vom Worker-Code)
  const decrypt = (body) => {
    const b = Buffer.from(body), salt = b.subarray(0, 16), idlen = b[20], asPub = b.subarray(21, 21 + idlen), ct = b.subarray(21 + idlen);
    const ecdh = ua.computeSecret(asPub);
    const ikm = Buffer.from(crypto.hkdfSync("sha256", ecdh, auth, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPub]), 32));
    const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
    const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
    const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    assert.equal(plain[plain.length - 1], 2, "Abschluss-Begrenzer"); return plain.subarray(0, plain.length - 1).toString();
  };
  const msg = JSON.stringify({ title: "🍽️ Mahlzeit 2 · 10:30", body: "Hendl & Brokkoli · ≈ 217 ml" });
  assert.equal(decrypt(await W.encryptPayload(sub, msg)), msg);
  const kv = new Map(), env = { PUSH_KV: { get: async (k, t) => kv.has(k) ? (t === "json" ? JSON.parse(kv.get(k)) : kv.get(k)) : null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
  const hdr = await W.vapidAuth(env, sub.endpoint), m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(hdr);
  assert.ok(m, hdr);
  const claims = JSON.parse(Buffer.from(m[2], "base64url"));
  assert.equal(claims.aud, "https://web.push.apple.com"); assert.match(claims.sub, /^https:\/\//);
  const pub = await crypto.webcrypto.subtle.importKey("raw", Buffer.from(m[4], "base64url"), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.ok(await crypto.webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, Buffer.from(m[3], "base64url"), Buffer.from(m[1] + "." + m[2])), "VAPID gültig signiert");
  // Ablauf: anmelden → zur fälligen Minute genau eine Nachricht (auch eine verpasste Runde wird nachgeholt)
  const sent = []; const origFetch = global.fetch;
  global.fetch = async (url, opt) => { sent.push(decrypt(opt.body)); return { status: 201 }; };
  try {
    const post = (path, data) => W.handle(new Request("https://w.dev" + path, { method: "POST", body: JSON.stringify(data) }), env);
    const r = await post("/api/sync", { subscription: sub, tz: "Europe/Vienna", items: [{ at: "10:25", title: "M2", body: "B", tag: "m2" }, { at: "12:10", title: "W2", body: "115 ml", tag: "w2" }] });
    assert.equal(r.status, 200);
    const wien = (h, mi) => new Date(Date.UTC(2026, 9, 5, h - 2, mi)); // Oktober: Wien = UTC+2
    await W.tick(env, wien(10, 24)); assert.equal(sent.length, 0, "noch nicht fällig");
    await W.tick(env, wien(10, 25)); assert.equal(sent.length, 1); assert.match(sent[0], /"title":"M2"/);
    await W.tick(env, wien(10, 26)); assert.equal(sent.length, 1, "nicht doppelt");
    await W.tick(env, wien(12, 11)); assert.equal(sent.length, 2, "verpasste Runde nachgeholt");
    await W.tick(env, wien(10, 25 + 1440)); assert.equal(sent.length, 3, "am nächsten Tag wieder");
    global.fetch = async () => ({ status: 410 });
    await W.tick(env, wien(12, 10 + 1440));
    assert.deepEqual(JSON.parse(kv.get("index")), [], "abgelaufenes Abo entfernt");
    const bad = await post("/api/sync", { subscription: { endpoint: "http://x" }, items: [] });
    assert.equal(bad.status, 400, "ungültige Anmeldung abgelehnt");
  } finally { global.fetch = origFetch; }
});

test("Erinnerungen in den Vorgaben: Karte mit Optionen, ohne Push-Fähigkeit ein klarer Hinweis statt Einschalten", () => {
  const w = boot({ settings: { kcal: 750, weight: 8.5, mahlzeiten: 4, view: "vorgaben" } });
  assert.ok($(w, "push-card"), "Karte vorhanden");
  assert.ok($(w, "push-meals").checked && $(w, "push-water").checked, "Mahlzeiten und Wasser standardmäßig an");
  // Segment „Mahlzeiten · Wasser · beides · keine“ setzt dieselben zwei Einstellungen wie früher die Häkchen
  const kind = () => [...w.document.querySelectorAll("#push-kind .active")].map(b => b.dataset.kind).join();
  assert.equal(kind(), "both");
  for (const [k, m, wa] of [["meals", true, false], ["water", false, true], ["none", false, false], ["both", true, true]]) {
    fire(w, w.document.querySelector('#push-kind [data-kind="' + k + '"]'));
    const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings;
    assert.deepEqual([st.pushMeals, st.pushWater, kind()], [m, wa, k], "Segment " + k);
  }
  const wOld = boot({ settings: { kcal: 750, weight: 8.5, mahlzeiten: 4, view: "vorgaben", pushMeals: false, pushWater: true } });
  assert.equal(wOld.document.querySelector("#push-kind .active").dataset.kind, "water", "alte Einstellung „nur Wasser“ bleibt");
  assert.equal($(w, "push-lead").value, "5", "5 min vorher");
  assert.match($(w, "push-status").textContent, /kann keine Push-Nachrichten|Home-Bildschirm|Online-Version/);
  assert.ok($(w, "push-toggle").disabled, "ohne Push-Fähigkeit nicht einschaltbar");
  assert.match(read("sw.js"), /addEventListener\("push"/, "Service Worker zeigt Push-Nachrichten an");
  assert.match(read("sw.js"), /notificationclick/, "Tipp öffnet die App");
});

test("Bedarf schätzen: Schofield × Krick-Faktoren, 60–70 % und Referenz gesunder Kinder; Alter aus dem Geburtsdatum, ändert die Verordnung nicht", () => {
  const iso = (monthsAgo) => { const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() - monthsAgo); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-01"; };
  const w = boot({ settings: { kcal: 750, weight: 8.5, ratio: 1.5, mahlzeiten: 4, view: "vorgaben" } });
  assert.match($(w, "bd-out").textContent, /Geburtsdatum eintragen/);
  const b = $(w, "bd-birth"); b.value = iso(26); fire(w, b, "change");
  assert.match($(w, "bd-age").textContent, /^2 J [12] M$/, "Alter läuft automatisch: " + $(w, "bd-age").textContent);
  let t = $(w, "bd-out").textContent;
  // Mädchen, 8,5 kg, < 3 J: Grundumsatz 58,317 × 8,5 − 31,1 = 464,6; liegt viel 1,15 · normal 1,0 · Zunahme 5 g/Tag → 559
  assert.match(t, /Krick-Formel \(1992\): 559 kcal \(66\/kg\) – Schätzung für euer Kind aus Gewicht, Alter und Geschlecht, bei „liegt viel“ und normaler Muskelspannung/, t);
  assert.match(t, /ESPGHAN-Leitlinie \(2017\): 411–480 kcal – Faustregel für Kinder, die nicht gehen: 60–70\s% von gesunden Kindern/);
  assert.match(t, /FAO\/WHO \(2004\): 685 kcal \(81\/kg\) – Bedarf gesunder Kinder gleichen Alters/);
  assert.match(t, /Keine feste Empfehlung/);
  assert.match(t, /Eiweiß 1,5 g\/kg ausreichend/);
  // Bewegung „geht“, Spannung „erhöht“ → 464,6 × 1,1 × 1,3 + 25 = 689
  const m = $(w, "bd-mobil"); m.value = "geht"; fire(w, m, "change");
  const to = $(w, "bd-tonus"); to.value = "erhoeht"; fire(w, to, "change");
  assert.match($(w, "bd-out").textContent, /Krick-Formel \(1992\): 689 kcal/);
  assert.match($(w, "bd-out").textContent, /FAO\/WHO \(2004\): 685 kcal/);
  assert.doesNotMatch($(w, "bd-out").textContent, /ESPGHAN/, "geht: keine Faustregel für Kinder, die nicht gehen");
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.kcal, 750, "Verordnung unverändert");
  // Eigener Wert 750 bleibt; der Vorschlag daneben bleibt nach Gewicht (8,5 × 80 = 680) – die Schätzung ändert ihn nicht
  assert.match($(w, "reset-kcal").textContent, /Vorschlag 680/);
  // kurz vor dem 3. Geburtstag: Hinweis auf den Formelwechsel
  b.value = iso(34); fire(w, b, "change");
  assert.match($(w, "bd-out").textContent, /Am 3\. Geburtstag wechselt die Formel/);
  // sehr niedrige Verordnung → Hinweis zu Vitaminen und Mineralstoffen
  const k = $(w, "set-kcal"); k.value = "400"; fire(w, k, "input");
  assert.match($(w, "bd-out").textContent, /Verordnung unter 70 % von Gleichaltrigen/);
});

test("Bedarf schätzen ändert die Verordnung nicht von selbst – „Krick-Schätzung übernehmen“ mit Rückgängig", () => {
  const iso = (mo) => { const n = new Date(); const b = new Date(n.getFullYear(), n.getMonth() - mo, Math.min(n.getDate(), 28)); return b.getFullYear() + "-" + String(b.getMonth() + 1).padStart(2, "0") + "-" + String(b.getDate()).padStart(2, "0"); };
  const w = boot({ settings: { kcal: "", kcalMin: "", weight: 8.5, ratio: 1.5, mahlzeiten: 4, view: "vorgaben" } });
  // ohne Geburtsdatum: 80 kcal/kg
  assert.equal($(w, "set-kcal").value, "680");
  assert.match($(w, "src-kcal").textContent, /Vorschlag · 80 kcal\/kg/);
  const b = $(w, "bd-birth"); b.value = iso(26); fire(w, b, "change");
  // mit Geburtsdatum: Vorschlag und Minimum bleiben nach Gewicht; der Bereich laut Schätzungen wird nur angezeigt
  assert.equal($(w, "set-kcal").value, "680");
  assert.match($(w, "src-kcal").textContent, /Vorschlag · 80 kcal\/kg/);
  assert.equal($(w, "set-kcalmin").value, "600");
  assert.match(fact(w, "verordnung-summary", "bereich"), /^Bereich laut Schätzungen410–690kcal\/Tag · ESPGHAN–FAO\/WHO/);
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.kcal || "", "", "kein eigener Wert gespeichert");
  // Übernehmen: Mädchen, liegt viel, normal → Krick 559 ≈ 560
  const ap = $(w, "bd-apply"); assert.ok(ap, "Knopf zum Übernehmen"); assert.match(ap.textContent, /560 kcal/);
  fire(w, ap);
  assert.equal($(w, "set-kcal").value, "560");
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.kcal, 560);
  assert.ok(!$(w, "bd-apply"), "übernommen – Knopf weg");
  const undo = [...w.document.querySelectorAll("#toast button")].find(x => /Rückgängig/.test(x.textContent));
  fire(w, undo);
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.kcal || "", "", "Rückgängig stellt den Vorschlag wieder her");
  assert.equal($(w, "set-kcal").value, "680");
});


test("Geräte-Abgleich: verschlüsselt über den Dienst, Koppeln per Code, jüngere Einstellung gewinnt, Lokales bleibt lokal", async () => {
  const W = await import("data:text/javascript;base64," + Buffer.from(read("push-worker/worker.js")).toString("base64"));
  const kv = new Map(), env = { PUSH_KV: { get: async (k, t) => kv.has(k) ? (t === "json" ? JSON.parse(kv.get(k)) : kv.get(k)) : null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
  // Dienst direkt: Konflikt bei veralteter Revision, Kopplungs-Code nur einmal abrufbar
  const call = async (p, body) => { const r = await W.handle(new Request("https://dienst.test" + p, { method: "POST", body: JSON.stringify(body) }), env); return { status: r.status, j: await r.json() }; };
  const hid = "a".repeat(64);
  assert.deepEqual((await call("/api/state/get", { id: hid })).j, { rev: 0 });
  assert.equal((await call("/api/state/put", { id: hid, baseRev: 0, data: "x" })).j.rev, 1);
  const cf = await call("/api/state/put", { id: hid, baseRev: 0, data: "y" });
  assert.equal(cf.status, 409); assert.equal(cf.j.rev, 1); assert.equal(cf.j.data, "x");
  assert.equal((await call("/api/state/get", { id: "kurz" })).status, 400, "ungültige Adresse");
  await call("/api/pair/put", { id: hid, blob: "b" });
  assert.equal((await call("/api/pair/get", { id: hid })).j.blob, "b");
  assert.equal((await call("/api/pair/get", { id: hid })).status, 404, "Code nur einmal verwendbar");
  kv.clear();

  // Zwei Geräte, beide reden über fetch mit demselben Dienst
  const device = (stored) => boot(stored, (w) => {
    Object.defineProperty(w, "crypto", { value: require("crypto").webcrypto, configurable: true });
    w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
    w.fetch = (url, opts) => W.handle(new Request(url, opts), env);
  });
  const settle = async (w, pred, what) => { for (let i = 0; i < 100; i++) { if (pred()) return; await new Promise(r => setTimeout(r, 20)); } assert.fail("Zeitüberschreitung: " + what + " · " + $(w, "sync-status").textContent); };
  const A = device({ settings: { weight: 8.5, ratio: 1.5, mahlzeiten: 4, view: "vorgaben", pushUrl: "https://dienst.test" }, favorites: ["std:Hendl & Brokkoli"] });
  const B = device({ settings: { weight: 12, ratio: 2, mahlzeiten: 5, view: "heute", pushUrl: "https://dienst.test" } });
  try {
    assert.match($(A, "sync-status").textContent, /Ausgeschaltet/);
    assert.ok($(A, "sync-code-btn").hidden && !$(A, "sync-enable").hidden);
    const rev = () => { const e = [...kv.entries()].find(([k]) => k.indexOf("st:") === 0); return e ? JSON.parse(e[1]).rev : 0; };
    const meta = (w) => JSON.parse(w.localStorage.getItem("ketoplaner.sync") || "null");
    fire(A, $(A, "sync-enable"));
    await settle(A, () => rev() === 1 && meta(A) && meta(A).at, "A eingeschaltet");
    assert.match($(A, "sync-status").textContent, /Eingeschaltet/);
    const stored = [...kv.entries()].find(([k]) => k.indexOf("st:") === 0);
    assert.ok(stored, "Stand beim Dienst gespeichert");
    assert.doesNotMatch(stored[1], /Hendl|weight|8\.5/, "beim Dienst nur verschlüsselt");
    // Code erzeugen und auf B eingeben
    fire(A, $(A, "sync-code-btn"));
    await settle(A, () => !$(A, "sync-code").hidden, "Code angezeigt");
    const code = $(A, "sync-code").querySelector(".sync-code").textContent;
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    $(B, "sync-join-code").value = code.toLowerCase();
    fire(B, $(B, "sync-join"));
    await settle(B, () => meta(B) && meta(B).at, "B verbunden");
    assert.match($(B, "sync-status").textContent, /Eingeschaltet/);
    const sB = () => JSON.parse(B.localStorage.getItem("ketoplaner.v5"));
    const sA = () => JSON.parse(A.localStorage.getItem("ketoplaner.v5"));
    assert.equal(sB().settings.weight, 8.5, "B übernimmt den gemeinsamen Stand");
    assert.equal(sB().settings.ratio, 1.5); assert.equal(sB().settings.mahlzeiten, 4);
    assert.deepEqual(sB().favorites, ["std:Hendl & Brokkoli"]);
    assert.equal(sB().settings.view, "heute", "Ansicht bleibt je Gerät");
    // B ändert das Gewicht, A ändert gleichzeitig die Mahlzeiten → beides bleibt erhalten
    const wB = $(B, "set-weight"); wB.value = "9"; fire(B, wB, "input");
    const r0 = rev();
    fire(B, $(B, "sync-now"));
    await settle(B, () => rev() > r0 && !meta(B).dirty, "B hochgeladen");
    fire(A, A.document.querySelector('#mahlzeiten-ctl button[data-mahl="3"]'));
    fire(A, $(A, "sync-now"));
    await settle(A, () => sA().settings.weight === 9, "A bekommt das Gewicht von B");
    assert.equal(sA().settings.mahlzeiten, 3, "eigene Änderung von A bleibt");
    fire(B, $(B, "sync-now"));
    await settle(B, () => sB().settings.mahlzeiten === 3, "B bekommt die Mahlzeiten von A");
    assert.equal(sB().settings.weight, 9);
    assert.equal($(B, "set-weight").value, "9", "Anzeige auf B aktualisiert");
    // Code ist verbraucht
    const C = device({ settings: { pushUrl: "https://dienst.test" } });
    try {
      $(C, "sync-join-code").value = code; fire(C, $(C, "sync-join"));
      await settle(C, () => /Code unbekannt/.test(C.document.body.textContent), "Hinweis bei verbrauchtem Code");
      assert.match($(C, "sync-status").textContent, /Ausgeschaltet/);
    } finally { await new Promise(r => setTimeout(r, 100)); C.close(); }
    // Ausschalten wirkt nur lokal
    fire(B, $(B, "sync-off"));
    assert.match($(B, "sync-status").textContent, /Ausgeschaltet/);
    assert.equal(sB().settings.weight, 9, "Daten bleiben auf dem Gerät");
    assert.equal(meta(B), null);
  } finally { await new Promise(r => setTimeout(r, 300)); A.close(); B.close(); }
});

test("Vorgaben: Liste mit Unterseiten; Verordnung gesperrt bis „Bearbeiten“, Abbrechen stellt her, Speichern mit Rückgängig", () => {
  const w = boot({ settings: { view: "vorgaben", weight: 8, ratio: 1.8, mahlzeiten: 5, mctShare: 0.1, kcal: "", kcalMin: "" } });
  const d = w.document;
  assert.equal($(w, "vg-list").hidden, false);
  assert.deepEqual([...d.querySelectorAll("#vg-list .vg-name")].map(e => e.textContent), ["Verordnung", "Flüssigkeit", "Öl und MCT", "Lebensmittel und Rezepte", "Küche", "Erinnerungen und Daten"]);
  assert.equal($(w, "vgs-verordnung").textContent, "1,8 : 1 · 640 kcal");
  assert.equal($(w, "vgs-oel").textContent, "MCT 10 %");
  // Unterseite öffnen und zurück
  fire(w, d.querySelector('[data-vg="fluessigkeit"]'));
  assert.equal($(w, "vg-list").hidden, true);
  assert.equal(d.querySelector('[data-vgpage="fluessigkeit"]').hidden, false);
  fire(w, d.querySelector('[data-vgpage="fluessigkeit"] [data-vgback]'));
  assert.equal($(w, "vg-list").hidden, false);
  // Verordnung: Ansicht gesperrt, Werte mit Herkunft
  fire(w, d.querySelector('[data-vg="verordnung"]'));
  assert.equal($(w, "vo-editbox").hidden, true, "Felder erst nach „Bearbeiten“");
  assert.match($(w, "vo-view").textContent, /Verhältnis \(Fett : Eiweiß \+ KH\)Verordnung1,8 : 1/);
  assert.match($(w, "vo-view").textContent, /Kalorien pro TagVorschlag · 80 kcal\/kg640 kcal/);
  // Bearbeiten → Feld ändern → Abbrechen stellt den alten Stand her
  fire(w, $(w, "vo-edit"));
  assert.equal($(w, "vo-editbox").hidden, false); assert.equal($(w, "vo-view").hidden, true);
  const k = $(w, "set-kcal"); k.value = "700"; fire(w, k, "input");
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.kcal, 700, "wirkt sofort (Kennzahlen rechnen mit)");
  fire(w, $(w, "vo-cancel"));
  assert.equal($(w, "vo-editbox").hidden, true);
  assert.notEqual(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.kcal, 700, "Abbrechen: alter Stand");
  assert.match($(w, "vo-view").textContent, /640 kcal/);
  // Bearbeiten → ändern → Speichern → Meldung mit Rückgängig
  fire(w, $(w, "vo-edit"));
  const k2 = $(w, "set-kcal"); k2.value = "720"; fire(w, k2, "input");
  fire(w, $(w, "vo-save"));
  assert.match($(w, "vo-view").textContent, /720 kcal/);
  assert.match($(w, "toast").textContent, /Verordnung gespeichert/);
  fire(w, $(w, "toast").querySelector(".toast-btn"));
  assert.match($(w, "vo-view").textContent, /640 kcal/, "Rückgängig");
  // Bedarf schätzen ist eine Unterseite der Verordnung
  fire(w, d.querySelector('[data-vgpage="verordnung"] [data-vg="bedarf"]'));
  assert.equal($(w, "bedarf-card").hidden, false);
  // Pille im Kopf öffnet Vorgaben › Verordnung
  fire(w, d.querySelector('.tabbar button[data-view="rezepte"]'));
  fire(w, $(w, "rx-chip"));
  assert.equal(d.querySelector('[data-vgpage="verordnung"]').hidden, false);
});

test("Tagesplan: Mahlzeiten anordnen (Alt+↑/↓ wie Ziehen) – andere rücken nach, Uhrzeiten bleiben, Rückgängig", () => {
  const plan = [{ key: "std:Hendl & Zucchini" }, { key: "std:Ei & Spinat" }, { key: null }, { key: "std:Lachs & Brokkoli" }];
  const w = boot({ settings: { kcal: 750, ratio: 1.5, mahlzeiten: 4, weight: 8.5, view: "heute" }, dayPlan: plan });
  const keys = () => JSON.parse(w.localStorage.getItem("ketoplaner.v5")).dayPlan.map(s => s.key);
  const row = (i) => w.document.querySelector('#heute-content .zp-row.slot[data-open="' + i + '"]');
  const times = () => [...w.document.querySelectorAll("#heute-content .zp-row.slot .zp-time")].map(e => e.textContent);
  const t0 = times();
  const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, altKey: true, bubbles: true }));
  key(row(0), "ArrowDown");
  assert.deepEqual(keys(), ["std:Ei & Spinat", "std:Hendl & Zucchini", null, "std:Lachs & Brokkoli"], "Mahlzeit 1 eine nach unten");
  assert.deepEqual(times(), t0, "Uhrzeiten gehören zu den Plätzen");
  assert.match(w.document.querySelector(".toast").textContent, /Mahlzeit verschoben – jetzt um /);
  [...w.document.querySelectorAll(".toast button")].find(b => /Rückgängig/.test(b.textContent)).click();
  assert.deepEqual(keys(), plan.map(s => s.key), "Rückgängig stellt die Reihenfolge wieder her");
  key(row(3), "ArrowUp");
  assert.deepEqual(keys(), ["std:Hendl & Zucchini", "std:Ei & Spinat", "std:Lachs & Brokkoli", null], "auch auf einen leeren Platz");
  key(row(0), "ArrowUp");
  assert.equal(keys()[0], "std:Hendl & Zucchini", "über den ersten Platz hinaus passiert nichts");
});

test("Eigene Lebensmittel: anlegen, im Editor und als Fett wählbar, umbenennen zieht Rezepte mit, Löschen gesperrt solange verwendet", () => {
  const w = boot({ settings: { mctShare: 0, kcal: 700, mahlzeiten: 5, view: "vorgaben" } });
  const st = () => JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  const put = (id, v) => { const e = $(w, id); e.value = v; fire(w, e, "input"); };
  assert.match($(w, "vgs-lebensmittel").textContent, /keine eigenen Lebensmittel/);
  // anlegen: Mandelmus als Fett
  fire(w, $(w, "cf-add")); assert.ok(!$(w, "cf-form").hidden);
  put("cf-name", "Mandelmus"); put("cf-eiweiss", "21"); put("cf-fett", "55,5"); put("cf-kh", "7");
  assert.equal($(w, "cf-kcal").placeholder, "612", "kcal-Vorschlag aus 4/9/4");
  $(w, "cf-fat").checked = true;
  fire(w, $(w, "cf-save"));
  assert.deepEqual(st().customFoods, [{ name: "Mandelmus", kategorie: "Eigene", eiweiss: 21, fett: 55.5, kh: 7, fat: true }]);
  assert.match($(w, "cf-list").textContent, /Mandelmus.*E 21,0 · F 55,5 · KH 7,0 g · 612 kcal/);
  // doppelter Name und unsinnige Werte werden abgelehnt
  fire(w, $(w, "cf-add")); put("cf-name", "butter"); put("cf-fett", "80"); fire(w, $(w, "cf-save"));
  assert.match($(w, "cf-msg").textContent, /gibt es schon/); assert.ok($(w, "cf-msg").classList.contains("warn"));
  put("cf-name", "Nussmischung"); put("cf-eiweiss", "50"); put("cf-fett", "60"); fire(w, $(w, "cf-save"));
  assert.match($(w, "cf-msg").textContent, /nicht mehr als 100 g/);
  fire(w, $(w, "cf-cancel")); assert.ok($(w, "cf-form").hidden);
  // im Editor: als Zutat (eigene Gruppe) und als Fett zum Ausgleich
  fire(w, $(w, "compose-btn"));
  const c = $(w, "compose-content");
  const sel = c.querySelector("#compose-rows .food-select");
  assert.equal(sel.querySelector("optgroup").label, "Eigene Lebensmittel");
  assert.ok([...c.querySelectorAll("#compose-fats .food-select option")].some(o => o.value === "Mandelmus"), "als Fett wählbar");
  sel.value = "Hühnerbrust ohne Haut"; fire(w, sel, "change");
  const fs = c.querySelector("#compose-fats .food-select"); fs.value = "Mandelmus"; fire(w, fs, "change");
  assert.match(c.querySelector(".ing-row.fatrow").textContent, /Mandelmus.*stellt das Verhältnis ein/);
  const nm = c.querySelector("#compose-name"); nm.value = "Hendl mit Mandel"; fire(w, nm, "input");
  fire(w, c.querySelector("#compose-save")); fire(w, $(w, "compose-close"));
  assert.ok(st().savedRecipes[0].items.some(it => it.food === "Mandelmus"));
  // umbenennen: das eigene Rezept rechnet mit dem neuen Namen weiter
  fire(w, $(w, "cf-list").querySelector('[data-cf="Mandelmus"]'));
  put("cf-name", "Mandelmus weiß"); fire(w, $(w, "cf-save"));
  assert.ok(st().savedRecipes[0].items.some(it => it.food === "Mandelmus weiß") && !st().savedRecipes[0].items.some(it => it.food === "Mandelmus"));
  // löschen gesperrt, solange das Rezept (bzw. der Entwurf) es verwendet
  fire(w, $(w, "cf-list").querySelector("[data-cf]")); fire(w, $(w, "cf-del"));
  assert.match($(w, "cf-msg").textContent, /Wird in „Hendl mit Mandel“.*verwendet/);
  assert.equal(st().customFoods.length, 1, "nicht gelöscht");
});

test("Rezepte ausblenden (Standard) und löschen (eigene): ohne Rückfrage, mit Rückgängig, Liste zum Einblenden", () => {
  const w = boot({ settings: { mctShare: 0, kcal: 700, mahlzeiten: 5, view: "rezepte" }, favorites: ["std:Hendl & Brokkoli"],
    savedRecipes: [{ key: "cus:1", name: "Mein Brei", items: [{ food: "Hühnerbrust ohne Haut", grams: 20 }, { food: "Karfiol gekocht", grams: 40 }, { food: "Butter", grams: 8 }] }],
    dayPlan: [{ key: "cus:1" }, { key: "std:Hendl & Brokkoli" }, { key: null }, { key: null }, { key: null }] });
  w.confirm = () => { throw new Error("keine Rückfrage"); };
  const st = () => JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  const names = () => tiles(w).map(t => t.querySelector(".tile-name").textContent);
  // Standard-Rezept ausblenden (Blatt Anpassen)
  let c = openRecipe(w, "Hendl & Brokkoli");
  fire(w, c.querySelector("#hide-btn"));
  assert.ok(!names().includes("Hendl & Brokkoli"), "nicht mehr in der Liste");
  assert.deepEqual(st().hiddenRecipes, ["std:Hendl & Brokkoli"]);
  assert.match($(w, "recipe-list").textContent, /1 Rezept ist ausgeblendet/);
  assert.match($(w, "hidden-list").textContent, /Hendl & Brokkoli/);
  assert.equal(st().dayPlan[1].key, "std:Hendl & Brokkoli", "Tagesplan bleibt");
  fire(w, $(w, "hidden-list").querySelector("[data-unhide]"));
  assert.ok(names().includes("Hendl & Brokkoli") && st().hiddenRecipes.length === 0, "wieder eingeblendet");
  // eigenes Rezept löschen und zurückholen
  c = openRecipe(w, "Mein Brei");
  fire(w, c.querySelector("#del-btn"));
  assert.ok(!names().includes("Mein Brei")); assert.equal(st().savedRecipes.length, 0); assert.equal(st().dayPlan[0].key, null);
  assert.match($(w, "toast").textContent, /„Mein Brei“ gelöscht/);
  fire(w, $(w, "toast").querySelector(".toast-btn"));
  assert.ok(names().includes("Mein Brei")); assert.equal(st().dayPlan[0].key, "cus:1", "Rückgängig stellt auch den Tagesplan her");
  // Kurzmenü per Rechtsklick (Finger: langes Drücken)
  const t = tiles(w).find(x => x.querySelector(".tile-name").textContent === "Hendl & Erbsen");
  t.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  assert.ok(!$(w, "action-overlay").hidden); assert.match($(w, "action-overlay").textContent, /Hendl & Erbsen.*Ausblenden/);
  fire(w, $(w, "action-overlay").querySelector("[data-act]"));
  assert.ok($(w, "action-overlay").hidden && !names().includes("Hendl & Erbsen"));
});

test("Backup und Abgleich: eigene Lebensmittel und ausgeblendete Rezepte werden geprüft übernommen", () => {
  const w = boot({ customFoods: [{ name: " Leinöl ", fett: 99.9, eiweiss: -1, fat: 1 }, { name: "" }, "kaputt", { name: "leinöl", fett: 5 }], hiddenRecipes: ["std:Hendl & Erbsen", 7] });
  const st = JSON.parse(w.localStorage.getItem("ketoplaner.v5") || "{}");
  assert.ok(!tiles(w).some(t => t.querySelector(".tile-name").textContent === "Hendl & Erbsen"), "ausgeblendet");
  w.document.querySelector('[data-vg="lebensmittel"]').click();
  assert.match($(w, "cf-list").textContent, /Leinöl.*E 0,0 · F 99,9/);
  assert.equal($(w, "cf-list").querySelectorAll("[data-cf]").length, 1, "doppelte und kaputte Einträge verworfen");
});

test("Tausch: Fleisch (Huhn, Pute, Rind, Schwein, Kalb) und Fisch, Mengen laut Diätologie / nach Eiweiß / eigene, eigene Lebensmittel", () => {
  const w = boot({ settings: { mctShare: 0, kcal: 700, mahlzeiten: 5, ratio: 1.8 },
    customFoods: [{ name: "Hirschfilet", kategorie: "Fleisch", eiweiss: 22.8, fett: 2, kh: 0, swap: "fleisch", swapGrams: 25 }] });
  let c = openRecipe(w, "Hendl & Brokkoli");
  const seg = () => [...c.querySelectorAll('.pane[data-pane=anpassen] .meat-swap:not(.oil) button[data-meat]')].map(b => b.textContent);
  assert.deepEqual(seg(), ["Huhn", "Pute", "Rind", "Schwein", "Kalb", "Hirschfilet"]);
  const txt = c.querySelector(".pane[data-pane=anpassen] .meat-swap .adj-text").textContent;
  assert.match(txt, /so viel entspricht 20 g Huhn\): Pute 18 g · Rind 30 g laut Diätologie/);
  assert.match(txt, /Hirschfilet 25 g eigene Werte/);
  assert.match(txt, /Schwein 21 g · Kalb 22 g nach Eiweiß berechnet\./);
  // Kalb wählen: Kalbfleisch in Tabelle und Zubereitung, Verhältnis bleibt
  fire(w, c.querySelector('.meat-swap button[data-meat="kalb"]')); c = $(w, "detail-content");
  assert.match(c.querySelector(".pane[data-pane=anpassen] .portion-line").textContent, /^Fleisch getauscht: Kalb/);
  assert.ok([...c.querySelectorAll(".pane[data-pane=mahlzeit] .ing-row")].some(r => /Kalbsschnitzelfleisch/.test(r.textContent)));
  assert.match(c.querySelector(".pane[data-pane=zubereitung]").textContent, /Kalbfleisch/);
  assert.ok(Math.abs(ratioOf(c) - 1.8) <= 0.02);
  // Fisch-Rezept: eigene Gruppe Fisch, kein Fleisch
  fire(w, $(w, "detail-close"));
  c = openRecipe(w, "Seelachs & Karotte");
  assert.equal(c.querySelector(".pane[data-pane=anpassen] .meat-swap .overline").textContent, "Fisch");
  assert.deepEqual(seg(), ["Seelachs", "Kabeljau", "Forelle", "Lachs", "Scholle"]);
  // Fisch wird gegen Fisch getauscht: Bezugsgröße 20 g Seelachs, nicht Huhn
  assert.match(c.querySelector(".pane[data-pane=anpassen] .meat-swap .adj-text").textContent, /so viel entspricht 20 g Seelachs\): Kabeljau \d+ g/);
  fire(w, c.querySelector('.meat-swap button[data-meat="lachs"]')); c = $(w, "detail-content");
  assert.ok([...c.querySelectorAll(".pane[data-pane=mahlzeit] .ing-row")].some(r => /Lachsfilet/.test(r.textContent)));
  assert.match(c.querySelector(".pane[data-pane=zubereitung]").textContent, /Lachs und Karotten klein schneiden/);
  fire(w, $(w, "detail-close"));
  // Vorgaben: Tabelle mit Herkunft; eigener Wert gilt sofort, ↺ zurück
  w.document.querySelector('.tabbar [data-view="vorgaben"]').click();
  w.document.querySelector('[data-vg="lebensmittel"]').click();
  const row = (k) => $(w, "swap-table").querySelector('[data-swap="' + k + '"]');
  assert.equal(row("rind").placeholder, "30"); assert.equal(row("schwein").placeholder, "21"); assert.equal(row("seelachs"), null, "Seelachs ist Bezugsgröße");
  const heads = [...$(w, "swap-table").querySelectorAll(".swap-head")].map(h => h.textContent);
  assert.deepEqual(heads, ["Fleisch≙ 20 g Huhn", "Fisch≙ 20 g Seelachs"]);
  assert.match(row("schwein").closest(".swap-row").textContent, /nach Eiweiß berechnet/);
  row("schwein").value = "24"; fire(w, row("schwein"), "change");
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.swapGrams.schwein, 24);
  assert.match(row("schwein").closest(".swap-row").textContent, /eigener Wert/);
  fire(w, $(w, "swap-table").querySelector('[data-swreset="schwein"]'));
  assert.equal(JSON.parse(w.localStorage.getItem("ketoplaner.v5")).settings.swapGrams, undefined);
});

test("Werte prüfen: Lebensmittelwerte in der Tabelle ändern, Rezepte rechnen damit, Standard / Alle auf Standard mit Rückgängig", () => {
  const w = boot({ settings: { mctShare: 0, kcal: 700, mahlzeiten: 5, view: "vorgaben" } });
  const st = () => JSON.parse(w.localStorage.getItem("ketoplaner.v5"));
  w.document.querySelector('[data-vg="lebensmittel"]').click();
  assert.equal($(w, "werte-list").closest("details"), null, "Liste dauerhaft sichtbar");
  const box = $(w, "werte-list");
  const row = (n) => [...box.querySelectorAll("tr")].find(r => r.firstElementChild && r.firstElementChild.textContent.trim().startsWith(n));
  // Rezept vorher: Butter-Menge in „Hendl & Zucchini · mit KetoCal“
  const butterG = () => { w.document.querySelector('.tabbar [data-view="rezepte"]').click(); const c = openRecipe(w, "Hendl & Zucchini · mit KetoCal"); const g = kitchenRows(c)["Butter"]; fire(w, $(w, "detail-close")); w.document.querySelector('.tabbar [data-view="vorgaben"]').click(); return g; };
  const g0 = butterG();
  // Zeile antippen → Felder in der Tabelle, Standard als Platzhalter
  fire(w, row("Butter"));
  const ed = box.querySelector("tr.editing");
  assert.ok(ed && /Butter/.test(ed.textContent));
  const inp = (k) => box.querySelector('input[data-k="' + k + '"]');
  assert.equal(inp("fett").placeholder, "82,0"); assert.equal(inp("kcal100").placeholder, "743");
  assert.match(box.querySelector("tr.edit-row").textContent, /Gilt für \d+ Rezepte/);
  // Fett ändern: kcal-Vorschlag folgt, große Abweichung → Hinweis
  inp("fett").value = "50"; fire(w, inp("fett"), "input");
  assert.equal(inp("kcal100").placeholder, "455");
  assert.match($(w, "wt-msg").textContent, /Fett weicht um mehr als ein Drittel vom Standard ab/);
  inp("fett").value = "83"; fire(w, inp("fett"), "input");
  assert.ok($(w, "wt-msg").hidden, "kleine Abweichung ohne Hinweis");
  fire(w, box.querySelector('[data-wact="save"]'));
  assert.deepEqual(st().foodOverrides, { "Butter": { fett: 83 } });
  assert.match($(w, "toast").textContent, /„Butter“ geändert – gilt für \d+ Rezepte/);
  assert.match(row("Butter").textContent, /geändert/); assert.ok(row("Butter").querySelector("td.chg"));
  assert.match($(w, "vgs-lebensmittel").textContent, /1 Wert geändert/);
  assert.ok(butterG() < g0, "mehr Fett je 100 g → weniger Butter im Rezept");
  // Standardwert eintippen = nichts geändert; ungültige Eingabe abgelehnt
  fire(w, row("Rapsöl")); inp("eiweiss").value = "abc"; fire(w, box.querySelector('[data-wact="save"]'));
  assert.match($(w, "wt-msg").textContent, /nur Zahlen/);
  inp("eiweiss").value = "0"; fire(w, box.querySelector('[data-wact="save"]'));
  assert.deepEqual(Object.keys(st().foodOverrides), ["Butter"]);
  // einzeln zurücksetzen, Rückgängig, alle zurücksetzen
  fire(w, box.querySelector('[data-wreset="Butter"]'));
  assert.deepEqual(st().foodOverrides, {});
  fire(w, $(w, "toast").querySelector(".toast-btn"));
  assert.deepEqual(st().foodOverrides, { "Butter": { fett: 83 } });
  fire(w, box.querySelector("[data-wall]"));
  assert.deepEqual(st().foodOverrides, {});
  assert.equal(butterG(), g0, "wieder wie vorher");
  // Backup-Prüfung verwirft Unsinn
  const w2 = boot({ foodOverrides: { "Butter": { fett: "x", eiweiss: 1 }, "Gibt es nicht": { fett: 5 }, "Rapsöl": "kaputt" } });
  w2.document.querySelector('[data-vg="lebensmittel"]').click();
  const b2 = [...$(w2, "werte-list").querySelectorAll("tr")].find(r => r.firstElementChild && /^Butter/.test(r.firstElementChild.textContent));
  assert.match(b2.textContent, /geändert/); assert.equal(b2.children[1].textContent, "1,0", "gültiger Wert übernommen");
  assert.equal(b2.children[2].textContent, "82,0", "ungültiger Wert verworfen → Standard");
  assert.match($(w2, "vgs-lebensmittel").textContent, /1 Wert geändert/, "unbekannte Namen und kaputte Einträge zählen nicht");
});
