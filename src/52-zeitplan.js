  /* ---------- Zeitplan: Uhrzeiten für Mahlzeiten und Wassergaben ----------
     Die Mahlzeiten liegen gleichmäßig zwischen erster und letzter Mahlzeit. Wasser kommt in die Mitte jeder Pause
     (dann ist der Magen weitgehend leer) und – wenn eine Schlafenszeit eingetragen ist – einmal zwischen letzter
     Mahlzeit und Schlafen. Die Menge je Wassergabe ergibt sich aus dem Tagesziel: Flüssigkeit am Tag minus
     Flüssigkeit der Mahlzeiten, gleichmäßig auf alle Wassergaben verteilt (auf 5 ml gerundet). */
  const ZP_DEFAULT = { erste: "07:00", letzte: "17:30", schlaf: "20:00" };
  function parseHM(v) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(v == null ? "" : v));
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    return (h < 24 && mi < 60) ? h * 60 + mi : null;
  }
  function fmtHM(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return Math.floor(min / 60) + ":" + String(min % 60).padStart(2, "0"); }
  function fmtDauer(min) { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? h + " h" + (m ? " " + m + " min" : "") : m + " min"; }
  // Kurzform für knappe Zeilen: „2:38 h“, volle Stunden „3 h“, unter einer Stunde „45 min“
  function fmtAbstand(min) { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? h + (m ? ":" + String(m).padStart(2, "0") : "") + " h" : m + " min"; }
  const round5 = (m) => Math.round(m / 5) * 5;
  // Sondierdauer einer Mahlzeit: langsam, etwa 5 ml pro Minute (fettreiche Kost dehnt den Magen sonst auf einmal),
  // auf 5 Minuten gerundet, mindestens 10 Minuten. Wasser darf schneller gehen: etwa 15 ml pro Minute, mindestens 5 Minuten.
  const SONDIER_ML_MIN = 5, WASSER_ML_MIN = 15;
  function sondierMin(vol) { return Math.max(10, round5(vol / SONDIER_ML_MIN)); }
  function wasserMin(vol) { return Math.max(5, round5(vol / WASSER_ML_MIN)); }
  // Eingestellte Uhrzeiten (leer = Vorgabe; Schlafen darf leer sein = keine Abendgabe).
  function zeitSettings() {
    const s = state.settings;
    const erste = parseHM(s.zpErste) != null ? s.zpErste : ZP_DEFAULT.erste;
    const letzte = parseHM(s.zpLetzte) != null ? s.zpLetzte : ZP_DEFAULT.letzte;
    const schlaf = s.zpSchlaf == null ? ZP_DEFAULT.schlaf : (parseHM(s.zpSchlaf) != null ? s.zpSchlaf : "");
    return { erste, letzte, schlaf };
  }
  function zeitTimes(d) {
    const z = zeitSettings(), n = d.mahl;
    const erste = parseHM(z.erste);
    let letzte = parseHM(z.letzte), bad = false;
    if (n > 1 && letzte <= erste) { bad = true; letzte = erste + (n - 1) * 180; }
    const step = n > 1 ? (letzte - erste) / (n - 1) : 0;
    const meals = []; for (let i = 0; i < n; i++) meals.push(i === n - 1 && n > 1 ? letzte : round5(erste + i * step));
    const gifts = [];
    for (let i = 0; i < n - 1; i++) gifts.push({ t: round5((meals[i] + meals[i + 1]) / 2), kind: "pause", after: i });
    let schlaf = parseHM(z.schlaf); const last = meals[n - 1];
    if (schlaf != null && schlaf < erste) schlaf += 1440;          // Schlafen nach Mitternacht (z. B. 0:30)
    const schlafBad = schlaf != null && schlaf <= last;            // Schlafen vor/zur letzten Mahlzeit → Hinweis
    if (schlaf != null && schlaf - last >= 45) gifts.push({ t: round5(last + (schlaf - last) / 2), kind: "abend", after: n - 1 });
    return { meals, gifts, schlaf: schlaf != null && schlaf > last ? schlaf : null, schlafBad, interval: n > 1 ? step : null, bad, z };
  }
  // Wassergaben für eine Tagesmenge aus den Mahlzeiten (Summe der Flüssigkeit aller Mahlzeiten).
  function waterPlan(d, mealFluidSum, times) {
    const rest = d.fluidDay - mealFluidSum;
    const nG = times.gifts.length;
    const per = (d.fluidDay > 0 && rest > 10 && nG > 0) ? Math.max(10, Math.round(rest / nG / 5) * 5) : 0;
    return { rest, per, n: per > 0 ? nG : 0, total: mealFluidSum + per * (per > 0 ? nG : 0),
      over: d.maxMahlMl > 0 && per > d.maxMahlMl };
  }
  // Durchschnittliche Flüssigkeit einer Mahlzeit über alle Rezepte – Schätzung für noch offene Plätze im Tagesplan.
  let avgFluidMemo = { key: null, v: 0, vol: 0 };
  function avgMealFluid(d) {
    const key = JSON.stringify([state.settings, state.water, state.portion, (state.savedRecipes || []).length]);
    if (avgFluidMemo.key === key) return avgFluidMemo;
    let sum = 0, vol = 0, n = 0;
    allRecipes().forEach(rec => {
      if (state.settings.hideKeto && rec.ketocal) return;
      if (state.settings.onlyKeto && !state.settings.hideKeto && !rec.ketocal) return;
      const mv = computeMealView(rec, d, null); if (!mv.res.ok) return;
      sum += mv.fluid; vol += volumeMl(mv.res.items); n++;
    });
    avgFluidMemo = { key, v: n ? sum / n : 0, vol: n ? vol / n : 0 };
    return avgFluidMemo;
  }
  // Mahlzeiten des Tages: gewähltes Rezept oder Schätzung, dazu Flüssigkeit und Volumen.
  function dayMeals(d) {
    ensureDayPlan(d);
    // Ein geplantes Rezept, das die Verordnung nicht (mehr) erreicht (z. B. nach Änderung des Verhältnisses),
    // zählt wie eine offene Mahlzeit und wird markiert – seine unangepassten Gramm dürfen nicht gefüttert werden.
    const bad = [];
    const list = state.dayPlan.map((sl, i) => {
      const rec = recipeByKey(sl && sl.key); if (!rec) return null;
      const f = mealFacts(rec, d, sl); if (!f.res.ok) { bad[i] = rec; return null; }
      return { rec, f, fluid: f.fluid, vol: volumeMl(f.res.items) };
    });
    const known = list.filter(Boolean);
    const est = known.length ? { v: known.reduce((a, x) => a + x.fluid, 0) / known.length, vol: known.reduce((a, x) => a + x.vol, 0) / known.length } : avgMealFluid(d);
    const meals = list.map((x, i) => x || { rec: null, f: null, fluid: est.v, vol: est.vol, est: true, bad: bad[i] || null });
    return { meals, sum: meals.reduce((a, x) => a + x.fluid, 0), known: known.length };
  }
  // Kurzfassung der Wassergaben (Kopfzeile, Vorgaben): „4 × 130 ml“.
  function waterGiftsText(d) {
    const dm = dayMeals(d), wp = waterPlan(d, dm.sum, zeitTimes(d));
    return { wp, text: wp.per > 0 ? wp.n + " × " + fmt(wp.per, 0) + " ml" : "keine", est: dm.known < d.mahl };
  }
  // Uhrzeiten-Felder sind eingeklappt („Uhrzeiten“ in der Werkzeugzeile klappt sie auf); bei ungültigen Zeiten immer offen.
  let zpEdit = false;
  // Hinweise zum Zeitplan (Abstand, Schlafen, Wassermenge) – je eine Zeile „▲ …“ unter der Zeitleiste.
  function zeitplanNotes(d, times, dm, wp) {
    const notes = [];
    const lastMeal = times.meals[times.meals.length - 1];
    if (times.schlafBad) notes.push(hintLine("warn", "Schlafen liegt vor der letzten Mahlzeit – bitte die Uhrzeiten prüfen."));
    if (times.bad) notes.push(hintLine("warn", "Die letzte Mahlzeit muss nach der ersten liegen – bitte die Uhrzeiten prüfen."));
    if (times.interval != null && times.interval < 180) notes.push(hintLine("warn", "Nur " + fmtDauer(times.interval) + " Abstand – Keto-Kost braucht oft 3–4 h.", "Steht beim Öffnen noch Nahrung an, 30–60 Minuten warten."));
    if (times.schlaf != null && times.schlaf - lastMeal < 120) notes.push(hintLine("warn", "Letzte Mahlzeit nur " + fmtDauer(times.schlaf - lastMeal) + " vor dem Schlafen – 2 h einplanen.", "Sonst droht Rückfluss im Liegen."));
    if (wp.over) notes.push(hintLine("warn", fmt(wp.per, 0) + " ml je Wassergabe – über " + fmt(d.maxMahlMl, 0) + " ml auf einmal. Schlafenszeit eintragen oder Wasser auf mehr Gaben verteilen."));
    if (d.fluidDay > 0 && wp.rest < -10) notes.push(hintLine("info", "Die Mahlzeiten liefern schon " + fmt(-wp.rest, 0) + " ml mehr als das Tagesziel – keine Wassergaben nötig."));
    return notes.join("");
  }
  function zeitplanSettings(times) {
    const field = (id, label, val) => '<label class="zp-f"><span>' + label + '</span><input id="' + id + '" type="time" value="' + escapeHtml(String(val)) + '"></label>';
    return '<div class="zp-set"' + (zpEdit || times.bad ? "" : " hidden") + '>' +
      field("zp-erste", "Erste", times.z.erste) + field("zp-letzte", "Letzte", times.z.letzte) + field("zp-schlaf", "Schlafen", times.z.schlaf) + '</div>';
  }
  // Wasser- und Schlafzeilen der Zeitleiste (die Mahlzeiten-Zeilen baut renderHeute): Uhrzeit · Menge · Dauer.
  function zeitplanExtraRows(times, wp) {
    const rows = [];
    if (wp.per > 0) times.gifts.forEach(g => rows.push({ t: g.t, html: '<div class="zp-row water"><span class="zp-time">' + fmtHM(g.t) + '</span>' +
      '<span class="zp-txt">' + fmt(wp.per, 0) + ' ml Wasser' + (g.kind === "abend" ? '<span class="zp-sub"> vor dem Schlafen</span>' +
        (times.schlaf != null ? '<span class="zp-sleep" title="Schlafen ' + fmtHM(times.schlaf) + '"> · Schlafen ' + fmtHM(times.schlaf) + '</span>' : '') : '') + '</span>' +
      '<span class="zp-wmin" title="etwa ' + WASSER_ML_MIN + ' ml pro Minute">' + wasserMin(wp.per) + ' min</span></div>' }));
    if (times.schlaf != null) rows.push({ t: times.schlaf, html: '<div class="zp-row sleep"><span class="zp-time">' + fmtHM(times.schlaf) + '</span><span class="zp-txt">Schlafen</span></div>' });
    return rows;
  }
  function bindZeitplan(box) {
    const set = (key, v) => { state.settings[key] = v; save(); renderRezepte(); };
    [["zp-erste", "zpErste"], ["zp-letzte", "zpLetzte"], ["zp-schlaf", "zpSchlaf"]].forEach(([id, key]) => {
      const el = box.querySelector("#" + id); if (!el) return;
      el.addEventListener("change", () => set(key, el.value || (key === "zpSchlaf" ? "" : null)));
    });
    const tg = box.querySelector("#zp-toggle");
    if (tg) tg.addEventListener("click", () => { zpEdit = !zpEdit; renderHeute(); });
  }
