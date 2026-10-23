  /* ---------- Wasserkocher: Stufe für angerührte Mahlzeiten ----------
     Angerührte Mahlzeiten (KetoCal, Compleat …) sollen gleich körperwarm in die Sonde: heißes Wasser aus dem Wasserkocher
     (Stufen z. B. 45/65/85/100 °C), Pulver zimmerwarm, flüssige Zutaten (z. B. Compleat) kalt aus dem Kühlschrank.
     Wärmebilanz: Mischtemperatur = Σ(Menge × Wärmekapazität × Temperatur) / Σ(Menge × Wärmekapazität), abzüglich dem, was
     beim Zubereiten verloren geht (Spritze, Becher, Mischen). Gesucht ist eine Stufe, mit der die Mischung in der Spanne
     landet (Standard 30–38 °C: lieber etwas kühler als über Körpertemperatur – Sondennahrung darf
     zimmerwarm bis körperwarm sein) – zuerst ohne zusätzliches lauwarmes Wasser; geht das nicht, wird ein Teil des Wassers
     lauwarm genommen, ab 20 ml in 10-ml-Schritten (20, 30, 40 …). Werte sind Schätzungen; „Abkühlen“ unter Küche gleicht sie an. */
  // min: heißes Wasser mindestens – kälter verklumpt das Pulver beim Anrühren, solche Stufen (z. B. 45 °C) nie verwenden
  const KETTLE_STD = { steps: [45, 65, 85, 100], min: 60, lo: 30, hi: 38, fridge: 2, room: 21, luke: 30, loss: 3 };
  function kettleSettings() {
    const s = state.settings, n = (v, d) => (v === "" || v == null || !isFinite(num(v))) ? d : num(v);
    const steps = (Array.isArray(s.kettleSteps) ? s.kettleSteps : KETTLE_STD.steps).map(num).filter(t => t >= 30 && t <= 100).sort((a, b) => a - b);
    let lo = n(s.kettleLo, KETTLE_STD.lo), hi = n(s.kettleHi, KETTLE_STD.hi); if (hi < lo) { const t = lo; lo = hi; hi = t; }
    const all = steps.length ? steps : KETTLE_STD.steps, min = n(s.kettleMin, KETTLE_STD.min);
    const usable = all.filter(t => t >= min);
    return { steps: all, use: usable.length ? usable : [all[all.length - 1]], min, lo, hi, fridge: n(s.kettleFridge, KETTLE_STD.fridge), room: KETTLE_STD.room, luke: n(s.kettleLuke, KETTLE_STD.luke), loss: n(s.kettleLoss, KETTLE_STD.loss) };
  }
  // „45, 65, 85, 100“ → [45, 65, 85, 100]
  function parseKettleSteps(t) { return String(t || "").split(/[^\d]+/).map(Number).filter(v => v >= 30 && v <= 100).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b); }
  // Plan für Zutaten (eine Portion oder die Zubereitungsmenge): { t, hot, luke, ml, temp, inRange } oder null
  function kettlePlan(items) {
    const ks = kettleSettings(), isW = (it) => /^wasser$/i.test(it.food);
    const water = items.filter(isW).reduce((a, it) => a + num(it.grams), 0), rest = items.filter(it => !isW(it) && num(it.grams) > 0);
    // nur Sondennahrung zum Anrühren (KetoCal, Compleat, Pulver wie Pre Apta) – nicht z. B. HiPP-Gläschen
    if (!(water >= 5) || !rest.some(it => /ketocal|compleat|pulver/i.test(it.food))) return null;
    // Wärmekapazität aus dem Wasseranteil (Wasser 4,18, Trockenmasse ca. 1,5 J/(g·K)); flüssige Zutaten (≥ 50 % Wasser) kalt
    let C = water * 4.18, Q0 = 0;
    rest.forEach(it => {
      const f = lookup(it.food), wp = f && f.wasser != null ? Math.max(0, Math.min(100, num(f.wasser))) / 100 : 0.1, g = num(it.grams);
      const c = 4.18 * wp + 1.5 * (1 - wp), T = wp >= 0.5 ? ks.fridge : ks.room;
      C += g * c; Q0 += g * c * T;
    });
    const W = Math.round(water), mix = (t, L) => ((W - L) * 4.18 * t + L * 4.18 * ks.luke + Q0) / C - ks.loss;
    const mid = (ks.lo + ks.hi) / 2, Ls = [0];
    for (let L = 20; L <= W - 10; L += 10) Ls.push(L); // lauwarm erst ab 20 ml (10 ml dazugeben wäre zu mühsam); mind. 10 ml heiß
    const all = [];
    Ls.forEach(L => ks.use.forEach(t => { const temp = mix(t, L); all.push({ t, luke: L, hot: W - L, ml: W, temp, inRange: temp >= ks.lo - 0.5 && temp <= ks.hi + 0.5 }); }));
    // In der Spanne: so wenig lauwarmes Wasser wie möglich, dann am nächsten an der Mitte
    const fit = all.filter(x => x.inRange).sort((a, b) => a.luke - b.luke || Math.abs(a.temp - mid) - Math.abs(b.temp - mid));
    if (fit.length) return fit[0];
    // Nichts passt: die wärmste Variante, die nicht zu heiß ist (sonst die kühlste)
    const ok = all.filter(x => x.temp <= ks.hi + 0.5).sort((a, b) => b.temp - a.temp || a.luke - b.luke);
    return ok[0] || all.sort((a, b) => a.temp - b.temp)[0];
  }
  // Text für den ersten Schritt der Zubereitung bzw. den Ausdruck
  function kettleText(p, short) {
    if (!p) return "";
    const temp = "ca. " + Math.round(p.temp) + " °C" + (p.inRange ? "" : p.temp > kettleSettings().hi ? " – etwas zu warm, kurz abkühlen lassen" : " – etwas kühler als geplant");
    if (short) return "Wasserkocher " + p.t + " °C" + (p.luke ? ": " + p.hot + " ml heiß + " + p.luke + " ml lauwarm" : "") + " → " + temp;
    return "Wasser vorbereiten (je Mahlzeit): Wasserkocher auf " + p.t + " °C stellen und " + p.hot + " ml mit der Spritze abnehmen" +
      (p.luke ? ", dazu " + p.luke + " ml lauwarmes Wasser" : "") + ". Mit den übrigen Zutaten ergibt das " + temp + ".";
  }
  // Kurzform für den Küchenzettel: „Wasserkocher 65 °C · 40 ml heiß + 20 ml lauwarm → ca. 37 °C“
  function kettleHtml(p) {
    const t = kettleText(p, true), i = t.indexOf(" °C");
    return "Wasserkocher <b>" + p.t + " °C</b>" + escapeHtml(t.slice(i + 3));
  }
  // Vorgaben › Küche: Felder füllen (leer = Standard, grau als Platzhalter) und Änderungen übernehmen
  const KETTLE_FIELDS = { "set-kettle-lo": "kettleLo", "set-kettle-hi": "kettleHi", "set-kettle-fridge": "kettleFridge", "set-kettle-luke": "kettleLuke", "set-kettle-loss": "kettleLoss", "set-kettle-min": "kettleMin", "set-brei-wasser": "breiWasserMin" };
  function renderKettleSettings() {
    const s = state.settings, put = (id, v) => { const e = document.getElementById(id); if (e && document.activeElement !== e) e.value = v; };
    put("set-kettle-steps", Array.isArray(s.kettleSteps) && s.kettleSteps.length ? s.kettleSteps.join(", ") : "");
    Object.keys(KETTLE_FIELDS).forEach(id => { const v = s[KETTLE_FIELDS[id]]; put(id, v === "" || v == null ? "" : fmtNum(v)); });
    const own = kitchenOwn(), box = document.getElementById("kitchen-reset");
    if (box) { box.hidden = !own.length; document.getElementById("kitchen-own").textContent = own.length ? "Eigene Werte: " + own.join(", ") + "." : ""; }
  }
  // Küche: welche Werte weichen vom Standard ab? (für „Auf Standard zurücksetzen“)
  const KITCHEN_KEYS = ["dampfVerdunstung", "breiWasserMin", "kettleSteps", "kettleLo", "kettleHi", "kettleFridge", "kettleLuke", "kettleLoss", "kettleMin"];
  function kitchenOwn() {
    const s = state.settings, out = [], has = (k) => s[k] !== undefined && s[k] !== "" && s[k] !== null;
    if (has("dampfVerdunstung") && num(s.dampfVerdunstung) !== DAMPF_STANDARD) out.push("Verdunstung " + fmt(num(s.dampfVerdunstung), 0) + " ml");
    if (has("breiWasserMin") && num(s.breiWasserMin) !== BREI_WASSER_STD) out.push("Brei mindestens " + fmt(num(s.breiWasserMin), 0) + " ml Wasser");
    if (Array.isArray(s.kettleSteps) && s.kettleSteps.join() !== KETTLE_STD.steps.join()) out.push("Stufen " + s.kettleSteps.join("/") + " °C");
    if (has("kettleMin")) out.push("heiß mindestens " + fmtNum(num(s.kettleMin)) + " °C");
    if (has("kettleLo") || has("kettleHi")) { const ks = kettleSettings(); out.push("körperwarm " + fmtNum(ks.lo) + "–" + fmtNum(ks.hi) + " °C"); }
    if (has("kettleFridge")) out.push("Kühlschrank " + fmtNum(num(s.kettleFridge)) + " °C");
    if (has("kettleLuke")) out.push("lauwarmes Wasser " + fmtNum(num(s.kettleLuke)) + " °C");
    if (has("kettleLoss")) out.push("Abkühlen " + fmtNum(num(s.kettleLoss)) + " °C");
    return out;
  }
  function bindKettleSettings() {
    const st = document.getElementById("set-kettle-steps"); if (!st) return;
    const rb = document.getElementById("kitchen-reset-btn");
    if (rb) rb.addEventListener("click", () => {
      const snap = {}; KITCHEN_KEYS.forEach(k => { snap[k] = state.settings[k]; });
      KITCHEN_KEYS.forEach(k => { delete state.settings[k]; }); state.settings.dampfVerdunstung = "";
      save(); renderRezepte();
      showToast("Küche auf Standard zurückgesetzt", [["Rückgängig", () => {
        KITCHEN_KEYS.forEach(k => { if (snap[k] === undefined) delete state.settings[k]; else state.settings[k] = snap[k]; });
        save(); renderRezepte();
      }]]);
    });
    st.addEventListener("change", () => {
      const a = parseKettleSteps(st.value);
      if (a.length) state.settings.kettleSteps = a; else delete state.settings.kettleSteps;
      st.value = a.join(", "); save(); renderRezepte();
    });
    Object.keys(KETTLE_FIELDS).forEach(id => {
      const e = document.getElementById(id); if (!e) return;
      e.addEventListener("input", () => {
        const t = e.value.trim(), v = parseFloat(t.replace(",", "."));
        if (t === "") delete state.settings[KETTLE_FIELDS[id]];
        else if (isFinite(v) && v >= -5 && v <= 100) state.settings[KETTLE_FIELDS[id]] = v;
        else return;
        save(); renderRezepte();
      });
    });
  }
  /* Kurzanleitung für angerührte Mahlzeiten – so, wie ihr zubereitet: Messglas auf die Feinwaage, Tara; Pulver einwiegen;
     heißes Wasser aus dem Wasserkocher mit der Spritze darauf und das Pulver auflösen (in kühlem Wasser verklumpt es);
     erst dann lauwarmes Wasser (falls nötig) und kalte Zutaten (Compleat) dazu einwiegen; verschließen, schütteln,
     aufziehen, verabreichen. Die Mischtemperatur am Ende hängt nicht von der Reihenfolge ab.
     Ergebnis: [{ html }] mit den aktuellen Mengen je Mahlzeit, oder null, wenn das Rezept nicht angerührt wird. */
  function quickSteps(rec, items) {
    if (!rec || !rec.angeruehrt) return null;
    const p = kettlePlan(items); if (!p) return null;
    const isW = (it) => /^wasser$/i.test(it.food), pos = items.filter(it => !isW(it) && num(it.grams) > 0);
    const wp = (it) => { const f = lookup(it.food); return f && f.wasser != null ? num(f.wasser) : 10; };
    const powders = pos.filter(it => wp(it) < 50 && !isOilName(it.food)), cold = pos.filter(it => wp(it) >= 50), oils = pos.filter(it => isOilName(it.food));
    const amt = (it) => "<b>" + escapeHtml(shortFood(it.food).replace(/\s*C8\+C10/, "")) + " " + gramsShort(num(it.grams)) + "</b>";
    const out = ["Messglas auf die Feinwaage, Tara"];
    let tared = true;
    powders.forEach(it => { out.push((tared ? "" : "Tara, ") + amt(it) + " einwiegen"); tared = false; });
    out.push("Wasserkocher <b>" + p.t + " °C</b>: <b>" + p.hot + " ml</b> mit der Spritze abnehmen, ins Messglas, Pulver darin auflösen");
    if (p.luke) out.push("Tara, <b>" + p.luke + " ml lauwarmes Wasser</b> dazu einwiegen");
    cold.forEach(it => out.push("Tara, " + amt(it) + " kalt dazu einwiegen"));
    oils.forEach(it => out.push("Tara, " + amt(it) + " dazu einwiegen"));
    out.push("Verschließen, schütteln");
    const ks = kettleSettings();
    out.push("Aufziehen, verabreichen – ca. " + Math.round(p.temp) + " °C" + (p.inRange ? "" : p.temp > ks.hi ? ", etwas zu warm: kurz abkühlen lassen" : ", etwas kühler als geplant"));
    return out.map(html => ({ html }));
  }
  // Kurzfassung beliebiger Rezepttexte für den Küchenzettel: Erklärsätze zur App weglassen, höchstens 5 Schritte
  function shortSteps(text) {
    return splitSteps(text || "").filter(s => !/\bApp\b|lässt sich|dient nur/i.test(s)).slice(0, 5);
  }
