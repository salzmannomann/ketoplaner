  /* ---------- Wasserkocher: Stufe für angerührte Mahlzeiten ----------
     Angerührte Mahlzeiten (KetoCal, Compleat …) sollen gleich körperwarm in die Sonde: heißes Wasser aus dem Wasserkocher
     (Stufen z. B. 45/65/85/100 °C), Pulver zimmerwarm, flüssige Zutaten (z. B. Compleat) kalt aus dem Kühlschrank.
     Wärmebilanz: Mischtemperatur = Σ(Menge × Wärmekapazität × Temperatur) / Σ(Menge × Wärmekapazität), abzüglich dem, was
     beim Zubereiten verloren geht (Spritze, Becher, Mischen). Gesucht ist eine Stufe, mit der die Mischung in der Spanne
     landet (Standard 34–39 °C) – zuerst ohne zusätzliches lauwarmes Wasser; geht das nicht, wird ein Teil des Wassers in
     10-ml-Schritten (10, 20, 30 …) lauwarm genommen. Werte sind Schätzungen; „Abkühlen“ unter Küche gleicht sie an. */
  const KETTLE_STD = { steps: [45, 65, 85, 100], lo: 34, hi: 39, fridge: 2, room: 21, luke: 30, loss: 3 };
  function kettleSettings() {
    const s = state.settings, n = (v, d) => (v === "" || v == null || !isFinite(num(v))) ? d : num(v);
    const steps = (Array.isArray(s.kettleSteps) ? s.kettleSteps : KETTLE_STD.steps).map(num).filter(t => t >= 30 && t <= 100).sort((a, b) => a - b);
    let lo = n(s.kettleLo, KETTLE_STD.lo), hi = n(s.kettleHi, KETTLE_STD.hi); if (hi < lo) { const t = lo; lo = hi; hi = t; }
    return { steps: steps.length ? steps : KETTLE_STD.steps, lo, hi, fridge: n(s.kettleFridge, KETTLE_STD.fridge), room: KETTLE_STD.room, luke: n(s.kettleLuke, KETTLE_STD.luke), loss: n(s.kettleLoss, KETTLE_STD.loss) };
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
    for (let L = 10; L <= W - 10; L += 10) Ls.push(L); // mindestens 10 ml bleiben heiß (zum Anrühren)
    const all = [];
    Ls.forEach(L => ks.steps.forEach(t => { const temp = mix(t, L); all.push({ t, luke: L, hot: W - L, ml: W, temp, inRange: temp >= ks.lo - 0.5 && temp <= ks.hi + 0.5 }); }));
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
  const KETTLE_FIELDS = { "set-kettle-lo": "kettleLo", "set-kettle-hi": "kettleHi", "set-kettle-fridge": "kettleFridge", "set-kettle-luke": "kettleLuke", "set-kettle-loss": "kettleLoss" };
  function renderKettleSettings() {
    const s = state.settings, put = (id, v) => { const e = document.getElementById(id); if (e && document.activeElement !== e) e.value = v; };
    put("set-kettle-steps", Array.isArray(s.kettleSteps) && s.kettleSteps.length ? s.kettleSteps.join(", ") : "");
    Object.keys(KETTLE_FIELDS).forEach(id => { const v = s[KETTLE_FIELDS[id]]; put(id, v === "" || v == null ? "" : fmtNum(v)); });
  }
  function bindKettleSettings() {
    const st = document.getElementById("set-kettle-steps"); if (!st) return;
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
