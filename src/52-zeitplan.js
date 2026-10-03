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
  const round5 = (m) => Math.round(m / 5) * 5;
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
    const schlaf = parseHM(z.schlaf), last = meals[n - 1];
    if (schlaf != null && schlaf - last >= 45) gifts.push({ t: round5(last + (schlaf - last) / 2), kind: "abend", after: n - 1 });
    return { meals, gifts, schlaf: schlaf != null && schlaf > last ? schlaf : null, interval: n > 1 ? step : null, bad, z };
  }
  // Wassergaben für eine Tagesmenge aus den Mahlzeiten (Summe der Flüssigkeit aller Mahlzeiten).
  function waterPlan(d, mealFluidSum, times) {
    const rest = d.fluidDay - mealFluidSum;
    const nG = times.gifts.length;
    const per = (d.fluidDay > 0 && rest > 10 && nG > 0) ? Math.max(10, Math.round(rest / nG / 5) * 5) : 0;
    return { rest, per, n: per > 0 ? nG : 0, total: mealFluidSum + per * (per > 0 ? nG : 0),
      over: d.maxMahlMl > 0 && per > d.maxMahlMl, unplaced: d.fluidDay > 0 && rest > 10 && nG === 0 };
  }
  // Durchschnittliche Flüssigkeit einer Mahlzeit über alle Rezepte – Schätzung für noch offene Plätze im Tagesplan.
  let avgFluidMemo = { key: null, v: 0, vol: 0 };
  function avgMealFluid(d) {
    const key = JSON.stringify([state.settings, state.water, state.portion, (state.savedRecipes || []).length]);
    if (avgFluidMemo.key === key) return avgFluidMemo;
    let sum = 0, vol = 0, n = 0;
    allRecipes().forEach(rec => {
      if (state.settings.hideKeto && rec.ketocal) return;
      const mv = computeMealView(rec, d, null); if (!mv.res.ok) return;
      sum += mv.fluid; vol += volumeMl(mv.res.items); n++;
    });
    avgFluidMemo = { key, v: n ? sum / n : 0, vol: n ? vol / n : 0 };
    return avgFluidMemo;
  }
  // Mahlzeiten des Tages: gewähltes Rezept oder Schätzung, dazu Flüssigkeit und Volumen.
  function dayMeals(d) {
    ensureDayPlan(d);
    const list = state.dayPlan.map(sl => { const rec = recipeByKey(sl && sl.key); if (!rec) return null; const f = mealFacts(rec, d); return { rec, f, fluid: f.fluid, vol: volumeMl(f.res.items) }; });
    const known = list.filter(Boolean);
    const est = known.length ? { v: known.reduce((a, x) => a + x.fluid, 0) / known.length, vol: known.reduce((a, x) => a + x.vol, 0) / known.length } : avgMealFluid(d);
    const meals = list.map(x => x || { rec: null, f: null, fluid: est.v, vol: est.vol, est: true });
    return { meals, sum: meals.reduce((a, x) => a + x.fluid, 0), known: known.length };
  }
  // Kurzfassung der Wassergaben (Kopfzeile, Vorgaben): „4 × 130 ml“.
  function waterGiftsText(d) {
    const dm = dayMeals(d), wp = waterPlan(d, dm.sum, zeitTimes(d));
    return { wp, text: wp.per > 0 ? wp.n + " × " + fmt(wp.per, 0) + " ml" : "keine", est: dm.known < d.mahl };
  }
  function renderZeitplan(d) {
    const times = zeitTimes(d), dm = dayMeals(d), wp = waterPlan(d, dm.sum, times);
    const rows = [];
    times.meals.forEach((t, i) => {
      const m = dm.meals[i];
      const what = m.rec
        ? '<strong>Mahlzeit ' + (i + 1) + '</strong> · ' + escapeHtml(m.rec.name)
        : '<strong>Mahlzeit ' + (i + 1) + '</strong> · ' + fmt(d.kcalMahl, 0) + ' kcal · <span class="zp-open">Rezept wählen</span>';
      const sub = m.est ? "≈ " + fmt(m.vol, 0) + " ml (Schätzung)" : "≈ " + fmt(m.vol, 0) + " ml";
      rows.push({ t, html: '<div class="zp-row meal" role="button" tabindex="0" data-zp-meal="' + i + '"><span class="zp-time">' + fmtHM(t) + '</span><span class="zp-ic">🍽️</span>' +
        '<span class="zp-txt">' + what + '<small>' + sub + '</small></span><span class="tile-chev" aria-hidden="true">›</span></div>' });
    });
    if (wp.per > 0) times.gifts.forEach(g => rows.push({ t: g.t, html: '<div class="zp-row water"><span class="zp-time">' + fmtHM(g.t) + '</span><span class="zp-ic">💧</span>' +
      '<span class="zp-txt"><strong>' + fmt(wp.per, 0) + ' ml Wasser</strong><small>' + (g.kind === "abend" ? "vor dem Schlafen" : "Mitte der Pause") + '</small></span></div>' }));
    if (times.schlaf != null) rows.push({ t: times.schlaf, html: '<div class="zp-row sleep"><span class="zp-time">' + fmtHM(times.schlaf) + '</span><span class="zp-ic">🌙</span><span class="zp-txt">Schlafen</span></div>' });
    rows.sort((a, b) => a.t - b.t);
    const maxMeal = Math.max.apply(null, dm.meals.map(m => m.vol));
    const biggest = Math.max(maxMeal, wp.per);
    const notes = [];
    if (times.bad) notes.push('<div class="note warn">⚠️ Die letzte Mahlzeit muss nach der ersten liegen – bitte die Uhrzeiten prüfen.</div>');
    if (times.interval != null && times.interval < 180) notes.push('<div class="note warn">⚠️ Nur ' + fmtDauer(times.interval) + ' zwischen den Mahlzeiten. Fettreiche Keto-Kost braucht oft 3 bis 4 Stunden, bis der Magen leer ist – steht beim Öffnen noch Nahrung an, 30 bis 60 Minuten warten.</div>');
    if (times.schlaf != null && times.schlaf - times.meals[times.meals.length - 1] < 120) notes.push('<div class="note warn">⚠️ Die letzte Mahlzeit liegt nur ' + fmtDauer(times.schlaf - times.meals[times.meals.length - 1]) + ' vor dem Schlafen – mindestens 2 Stunden einplanen, sonst droht Rückfluss im Liegen.</div>');
    if (wp.over) notes.push('<div class="note warn">⚠️ Je Wassergabe ' + fmt(wp.per, 0) + ' ml – mehr als die Höchstmenge von ' + fmt(d.maxMahlMl, 0) + ' ml auf einmal. Eine Schlafenszeit eintragen (zusätzliche Abendgabe) oder Wasser auf mehr Gaben verteilen.</div>');
    if (wp.unplaced) notes.push('<div class="note warn">💧 Es fehlen ' + fmt(wp.rest, 0) + ' ml, aber es gibt keine Pause für eine Wassergabe – Schlafenszeit eintragen.</div>');
    if (d.fluidDay > 0 && wp.rest < -10) notes.push('<div class="note tip">💧 Die Mahlzeiten liefern schon ' + fmt(-wp.rest, 0) + ' ml mehr als das Tagesziel – keine Wassergaben nötig.</div>');
    if (d.fluidDay > 0 && d.wasserModus === "mahlzeit" && wp.per === 0 && wp.rest >= -10) notes.push('<div class="note tip">💧 Die Flüssigkeit ist in den Mahlzeiten dabei – Wasser zwischendurch nur bei Bedarf.</div>');
    const sumLine = d.fluidDay > 0
      ? '💧 Flüssigkeit am Tag ≈ <strong>' + fmt(wp.total, 0) + ' ml</strong> (Ziel ' + fmt(d.fluidDay, 0) + '): Mahlzeiten ' + fmt(dm.sum, 0) +
        (wp.per > 0 ? ' + Wasser ' + wp.n + ' × ' + fmt(wp.per, 0) : '') +
        ' · größte Menge auf einmal ≈ ' + fmt(biggest, 0) + ' ml' + (dm.known < d.mahl ? ' · offene Mahlzeiten geschätzt' : '')
      : 'Kein Flüssigkeitsziel – unter Vorgaben Körpergewicht oder ml/Tag eintragen.';
    const field = (id, label, val, type, extra) => '<label class="zp-f"><span>' + label + '</span><input id="' + id + '" type="' + type + '" value="' + escapeHtml(String(val)) + '"' + (extra || "") + '></label>';
    return '<div class="zeitplan">' +
      '<div class="group-head zp-head">⏰ Zeitplan <span class="group-count">' + d.mahl + ' Mahlzeiten' + (times.interval != null ? ' · alle ' + fmtDauer(times.interval) : '') + '</span></div>' +
      '<div class="zp-set">' +
        field("zp-erste", "Erste Mahlzeit", times.z.erste, "time") +
        field("zp-letzte", "Letzte Mahlzeit", times.z.letzte, "time") +
        field("zp-schlaf", "Schlafen", times.z.schlaf, "time") +
      '</div>' +
      '<div class="zp-list">' + rows.map(r => r.html).join("") + '</div>' +
      '<div class="portion-line zp-sum">' + sumLine + '</div>' + notes.join("") +
    '</div>';
  }
  function bindZeitplan(box) {
    const set = (key, v) => { state.settings[key] = v; save(); renderRezepte(); };
    [["zp-erste", "zpErste"], ["zp-letzte", "zpLetzte"], ["zp-schlaf", "zpSchlaf"]].forEach(([id, key]) => {
      const el = box.querySelector("#" + id); if (!el) return;
      el.addEventListener("change", () => set(key, el.value || (key === "zpSchlaf" ? "" : null)));
    });
    box.querySelectorAll("[data-zp-meal]").forEach(row => {
      const go = () => { const i = num(row.dataset.zpMeal), r = recipeByKey(state.dayPlan[i] && state.dayPlan[i].key); if (r) openRecipeDetail(r); else openPicker(i); };
      row.addEventListener("click", go);
      row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }
