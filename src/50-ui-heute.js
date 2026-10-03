  /* ---------- Heute: Tagesplan ---------- */
  function ensureDayPlan(d) {
    if (!Array.isArray(state.dayPlan)) state.dayPlan = [];
    while (state.dayPlan.length < d.mahl) state.dayPlan.push({ key: null });
    if (state.dayPlan.length > d.mahl) state.dayPlan.length = d.mahl;
  }
  function recipeByKey(key) {
    if (!key) return null;
    const all = allRecipes();
    for (let i = 0; i < all.length; i++) if (recipeKey(all[i]) === key) return all[i];
    return null;
  }
  // Heute: eine Zeitleiste für den ganzen Tag. Jede Mahlzeit steht mit Uhrzeit und Rezept darin (↻ tauschen,
  // ✕ leeren, Tipp öffnet das Rezept bzw. die Auswahl), dazwischen die Wassergaben und das Schlafen.
  // Darüber Kopf (⏰ Uhrzeiten, 🖨️, 🗑️), Statuszeile und Tagessummen; darunter Flüssigkeit am Tag und Hinweise.
  function renderHeute() {
    const box = document.getElementById("heute-content"); if (!box) return;
    const d = derived(); ensureDayPlan(d);
    const times = zeitTimes(d), dm = dayMeals(d), wp = waterPlan(d, dm.sum, times);
    const tot = { kcal: 0, eiweiss: 0, fett: 0, kh: 0, mct: 0, raps: 0, fluid: 0, filled: 0 };
    const facts = [];
    const rows = [];
    state.dayPlan.forEach((slot, i) => {
      const t = times.meals[i], m = dm.meals[i], time = '<span class="zp-time">' + fmtHM(t) + '</span>';
      const rec = m.rec;
      if (!rec) {
        facts.push(null);
        rows.push({ t, html: '<div class="zp-row meal slot empty-slot" role="button" tabindex="0" data-pick="' + i + '" title="Menge geschätzt – Rezept wählen">' + time + '<span class="zp-ic add">＋</span>' +
          '<span class="zp-txt"><span class="zp-name">Mahlzeit ' + (i + 1) + ' · <span class="zp-open">Rezept wählen</span></span></span>' +
          '<span class="zp-vol est">≈ ' + fmt(m.vol, 0) + ' ml<small>' + sondierMin(m.vol) + ' min</small></span><span class="tile-chev" aria-hidden="true">›</span></div>' });
        return;
      }
      const f = m.f; facts.push(f);
      tot.kcal += f.sum.kcal; tot.eiweiss += f.sum.eiweiss; tot.fett += f.sum.fett; tot.kh += f.sum.kh;
      tot.mct += f.gMct; tot.raps += f.gRaps; tot.fluid += f.fluid || 0; tot.filled++;
      const proteinOk = f.sum.eiweiss >= d.eiweissMahl * 0.9;
      const oilTxt = f.hasOil ? f.oils.map(o => escapeHtml(String(o.food).replace(/\s*C8\+C10/, "")) + " " + fmt(num(o.grams), 1) + " g").join(" + ") : "";
      const pill = ratioClass(f.ratio, d.ratio) !== "ok" ? ' <span class="ratio-pill ' + ratioClass(f.ratio, d.ratio) + '">' + fmtRatio(f.ratio, 2) + '</span>' : "";
      // Eine Zeile: Uhrzeit · Rezept · Menge. Zweite Zeile nur, wenn sie etwas zu tun gibt: Öl vor dem Füttern
      // zugeben oder zu wenig Eiweiß. kcal je Mahlzeit sind gleich (Vorgabe), Eiweiß gesamt steht in der Kachel.
      // Öl kurz benannt („Raps 11,4 g + MCT 1,2 g“), damit beide Mengen auch am Handy ganz zu sehen sind.
      const oilShort = f.hasOil ? f.oils.map(o => escapeHtml(String(o.food).replace(/^MCT.*$/, "MCT").replace(/öl$/i, "")) + " " + fmt(num(o.grams), 1) + " g").join(" + ") : "";
      const sub = [oilShort ? '🧈 ' + oilShort : '', proteinOk ? '' : '<span class="prot-low">Eiweiß nur ' + fmt(f.sum.eiweiss) + ' g</span>'].filter(Boolean).join(' · ');
      rows.push({ t, html: '<div class="zp-row meal slot" role="button" tabindex="0" data-open="' + i + '" title="' + fmt(f.sum.kcal, 0) + ' kcal · Eiweiß ' + fmt(f.sum.eiweiss) + ' g' + (oilTxt ? ' · Öl vor dem Füttern: ' + oilTxt : '') + '">' + time + '<span class="zp-ic">' + (rec.icon || "🥑") + '</span>' +
        '<span class="zp-txt"><span class="zp-name">' + escapeHtml(rec.name) + pill + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</span>' +
        '<span class="zp-vol" title="langsam sondieren, etwa ' + SONDIER_ML_MIN + ' ml pro Minute">≈ ' + fmt(m.vol, 0) + ' ml<small>' + sondierMin(m.vol) + ' min</small></span>' +
        '<button type="button" class="slot-act" data-pick="' + i + '" title="Rezept ändern" aria-label="Rezept ändern">↻</button>' +
        '<button type="button" class="slot-act" data-clear="' + i + '" title="Entfernen" aria-label="Entfernen">✕</button></div>' });
    });
    zeitplanExtraRows(times, wp).forEach(r => rows.push(r));
    rows.sort((a, b) => a.t - b.t);
    const ratioDay = (tot.eiweiss + tot.kh) > 0 ? tot.fett / (tot.eiweiss + tot.kh) : null;
    const share = tot.filled / d.mahl; // Anteil geplanter Mahlzeiten → Ziele anteilig
    const eiweissZiel = d.eiweiss * share, kcalZiel = d.kcal * share, kcalMinZiel = d.kcalMin * share, fluidZiel = d.fluidDay * share;
    const kcalLow = tot.kcal < kcalMinZiel - 0.5;
    // Kopf: Mahlzeiten × kcal und der Tagesrahmen; ⏰ klappt die Uhrzeiten auf, dazu Drucken und Leeren.
    // Mahlzeiten × kcal stehen schon in der Kopfzeile (Pille) – hier nur der Rahmen des Tages.
    const head = '<div class="group-head day-head"><span class="day-title">📅 Heute</span> <span class="group-count">' + fmtHM(times.meals[0]) + '–' + fmtHM(times.meals[times.meals.length - 1]) +
        (times.interval != null ? ' · alle ' + fmtDauer(times.interval) : '') + '</span>' +
      '<span class="head-actions"><button type="button" class="iconbtn round' + (zpEdit ? ' open' : '') + '" id="zp-toggle" title="Uhrzeiten einstellen" aria-label="Uhrzeiten einstellen" aria-expanded="' + (zpEdit ? "true" : "false") + '">⏰</button>' +
      '<button type="button" class="iconbtn round" id="print-day" title="Tagesplan drucken" aria-label="Tagesplan drucken">🖨️</button>' +
      '<button type="button" class="iconbtn round" id="clear-day" title="Plan leeren" aria-label="Plan leeren">🗑️</button></span></div>';
    // Tagessummen in einer niedrigen Kachelreihe (Ziele anteilig, wenn nicht alle Mahlzeiten geplant sind).
    // Flüssigkeit = ganzer Tag laut Zeitplan (Mahlzeiten + Wassergaben); „≈“, wenn offene Mahlzeiten geschätzt sind.
    const est = dm.known < d.mahl;
    const fluidTile = d.fluidDay > 0
      ? '<div class="dstat' + (wp.total < d.fluidDay - 15 ? " warn" : "") + '" title="Mahlzeiten ' + fmt(dm.sum, 0) + ' ml' + (wp.per > 0 ? ' + Wasser ' + wp.n + ' × ' + fmt(wp.per, 0) + ' ml' : '') + (est ? ' · offene Mahlzeiten geschätzt' : '') + '">' +
        '<div class="v">' + (est ? '≈ ' : '') + fmt(wp.total, 0) + ' ml</div><div class="l">💧 Ziel ' + fmt(d.fluidDay, 0) + ' ml</div></div>'
      : "";
    const sums = '<div class="detail-tiles strip day-strip" id="day-sums">' +
      (tot.filled
        ? '<div class="dstat' + (kcalLow ? " warn" : "") + '"><div class="v">' + fmt(tot.kcal, 0) + '</div><div class="l">kcal · Ziel ' + fmt(kcalZiel, 0) + '</div></div>' +
          (() => { const ps = proteinState(tot.eiweiss, eiweissZiel); return '<div class="dstat' + (ps === "ok" ? "" : " warn") + '"' + (ps === "high" ? ' title="mehr als das Doppelte des Eiweiß-Ziels"' : '') + '><div class="v">' + fmt(tot.eiweiss) + ' g' + (ps === "high" ? ' ↑' : '') + '</div><div class="l">Eiweiß · Ziel ' + fmt(eiweissZiel, 0) + '</div></div>'; })() +
          '<div class="dstat"><div class="v"><span class="ratio-pill ' + ratioClass(ratioDay, d.ratio) + '">' + fmtRatio(ratioDay, 2) + '</span></div><div class="l">Ziel ' + fmtTarget(d.ratio) + '</div></div>'
        : '<div class="dstat wide"><div class="v">' + d.mahl + ' × ' + fmt(d.kcalMahl, 0) + ' kcal</div><div class="l">Rezepte wählen: Tipp auf eine Mahlzeit</div></div>') +
      fluidTile + "</div>";
    const warns =
      (d.fluidDay > 0 && d.wasserModus === "mahlzeit" && tot.filled && tot.fluid < fluidZiel - 3 ? '<div class="note warn">💧 Unter dem Flüssigkeitsziel – bei einem Rezept ist weniger Wasser gemerkt als sein Anteil.</div>' : "") +
      (tot.filled && kcalLow ? '<div class="note warn">⚠️ Der Tag liegt unter dem Kalorien-Minimum (' + fmt(d.kcalMin, 0) + ' kcal) – eine Mahlzeit mit mehr Kalorien einplanen.</div>' : "");
    // Packungsstand (z. B. Compleat 500 ml, 3 Tage) als grüne Notiz wie in der Detailansicht.
    const packs = {};
    facts.forEach(f => {
      if (!f || !f.rec.packung) return;
      const pk = f.rec.packung, g = f.res.items.filter(it => it.food === pk.food).reduce((a, it) => a + num(it.grams), 0);
      if (!packs[pk.food]) packs[pk.food] = { pk, ml: 0, meals: 0 };
      packs[pk.food].ml += g; packs[pk.food].meals++;
    });
    const packHtml = Object.keys(packs).map(k => {
      const x = packs[k], rest = x.pk.ml - x.ml, per = x.meals ? x.ml / x.meals : 0;
      const restMeals = per > 0 ? Math.floor(Math.max(0, rest) / per + 1e-9) : 0;
      const nTage = x.ml * x.pk.tage;
      // Kurz: heute verplant und Rest für morgen; Einzelheiten zur Packung stehen im Rezept (Blatt „Tag“).
      const shortName = k.replace(/\s*\(.*?\)/g, "").replace(/\s+Nature Mix/, "");
      const more = (rest >= -0.5 && nTage > x.pk.ml + 0.5 ? 'In ' + x.pk.tage + ' Tagen ist eine 2. Packung nötig. ' : "") +
        (rest >= -0.5 && nTage < x.pk.ml - 0.5 ? 'Nach ' + x.pk.tage + ' Tagen bleiben ' + fmt(x.pk.ml - nTage, 0) + ' ml übrig. ' : "");
      return '<div class="note tip pack" title="Packung ' + x.pk.ml + ' ml, offen ' + x.pk.tage + ' Tage. Rest reicht für ' + restMeals + ' Mahlzeit' + (restMeals === 1 ? "" : "en") + '. ' + more + '">🧃 <strong>' + escapeHtml(shortName) + '</strong> heute ' + fmt(x.ml, 0) + ' ml · ' +
        (rest < -0.5 ? '<strong>fehlen ' + fmt(-rest, 0) + ' ml</strong>' : 'Rest ' + fmt(rest, 0) + ' ml') + (more && rest >= -0.5 && nTage > x.pk.ml + 0.5 ? ' · ⚠️ 2. Packung' : '') + '</div>';
    }).join("");
    box.innerHTML = '<div class="zeitplan">' + head + zeitplanSettings(times) + sums +
      '<div class="zp-list day-slots">' + rows.map(r => r.html).join("") + '</div>' +
      zeitplanNotes(d, times, dm, wp) + warns + packHtml + '</div>';
    bindZeitplan(box);
    box.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); openPicker(num(b.dataset.pick)); }));
    box.querySelectorAll("[data-open]").forEach(b => {
      const open = () => { const r = recipeByKey(state.dayPlan[num(b.dataset.open)].key); if (r) openRecipeDetail(r); };
      b.addEventListener("click", open);
      b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    box.querySelectorAll(".empty-slot[data-pick]").forEach(b => b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(num(b.dataset.pick)); } }));
    box.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); state.dayPlan[num(b.dataset.clear)] = { key: null }; save(); renderHeute(); }));
    const pd = box.querySelector("#print-day"); if (pd) pd.addEventListener("click", () => printDayPlan(d, facts, tot, ratioDay));
    const cd = box.querySelector("#clear-day");
    if (cd) cd.addEventListener("click", () => {
      if (!state.dayPlan.some(sl => sl && sl.key)) return;
      const prev = state.dayPlan.map(sl => ({ key: sl ? sl.key : null }));
      state.dayPlan = state.dayPlan.map(() => ({ key: null })); save(); renderRezepte();
      showToast("🗑️ Tagesplan geleert", [["Rückgängig", () => { state.dayPlan = prev; save(); renderRezepte(); }]]);
    });
  }
  // Rezept-Auswahl für einen Slot (Overlay mit Suche)
  let pickerSlot = -1;
  function openPicker(i) {
    pickerSlot = i;
    const ov = document.getElementById("picker-overlay"), q = document.getElementById("picker-search");
    if (!ov) return;
    q.value = ""; renderPicker();
    ov.hidden = false; modalOpen("picker");
    try { q.focus(); } catch (e) {}
  }
  function renderPicker() {
    const list = document.getElementById("picker-list"); if (!list) return;
    const q = ((document.getElementById("picker-search") || {}).value || "").trim().toLowerCase();
    const d = derived();
    // Jedes Rezept ein Eintrag (mit oder ohne KetoCal); gespeichert wird das konkrete Rezept.
    const hitItems = (r) => r.items.some(it => (it.food || "").toLowerCase().indexOf(q) !== -1);
    const recs = allRecipes()
      .map(rec => ({ fam: { name: familyOf(rec) }, rec }))
      .filter(x => !state.settings.hideKeto || !x.rec.ketocal)
      .filter(x => !q || x.fam.name.toLowerCase().indexOf(q) !== -1 || hitItems(x.rec))
      .map(x => Object.assign(x, { res: computeAdjustedRecipe(x.rec, d.kcalMahl, d.ratio) })).filter(x => x.res.ok)
      .map(x => Object.assign(x, { res: computeMealView(x.rec, d, null).res }))
      .sort((a, b) => { const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1; if (fa !== fb) return fa - fb; return a.fam.name.localeCompare(b.fam.name, "de") || ((a.rec.ketocal ? 1 : 0) - (b.rec.ketocal ? 1 : 0)); });
    list.innerHTML = recs.map(x => {
      const s = sumMacros(x.res.items), vol = volumeMl(x.res.items);
      const big = d.maxMahlMl > 0 && vol > d.maxMahlMl + 0.5;
      return '<button type="button" class="pick-row" data-key="' + escapeHtml(recipeKey(x.rec)) + '"><span class="pick-icon">' + (x.rec.icon || "🥑") + '</span>' +
        '<span class="pick-name">' + escapeHtml(x.fam.name) + (isFav(x.rec) ? " ★" : "") + '</span>' +
        '<span class="pick-meta">' + fmt(s.kcal, 0) + ' kcal · <span class="pick-vol' + (big ? ' big' : '') + '">≈ ' + fmt(vol, 0) + ' ml' + (big ? ' ⚠️' : '') + '</span> · Eiweiß ' + fmt(s.eiweiss) + " g" + ((x.rec.ketocal || isMulti(x.rec)) ? " · " + (x.rec.ketocal ? "🥄 " : "") + escapeHtml(basisLabel(x.rec)) : "") + "</span></button>";
    }).join("") || '<div class="empty">Kein Gericht gefunden.</div>';
    list.querySelectorAll(".pick-row").forEach(b => b.addEventListener("click", () => {
      if (pickerSlot >= 0) { ensureDayPlan(derived()); state.dayPlan[pickerSlot] = { key: b.dataset.key }; save(); }
      closePicker(); renderHeute();
    }));
  }
  function closePicker() {
    const ov = document.getElementById("picker-overlay"); if (!ov) return;
    ov.hidden = true; modalClose("picker");
  }
  function bindHeute() {
    const th = document.getElementById("tab-heute"); if (th) th.hidden = false;
    const ov = document.getElementById("picker-overlay"); if (!ov) return;
    document.getElementById("picker-close").addEventListener("click", closePicker);
    ov.addEventListener("click", e => { if (e.target === ov) closePicker(); });
    document.getElementById("picker-search").addEventListener("input", renderPicker);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden) closePicker(); });
  }
  // Tagesplan zum Aufhängen oder Weitergeben: Zeitplan (Uhrzeit, Menge, Öl, Dauer), Hinweise zum
  // Sondieren, Tagessummen und die Mahlzeiten im Detail fürs Team.
  function printDayPlan(d, facts, tot, ratioDay) {
    const times = zeitTimes(d), dm = dayMeals(d), wp = waterPlan(d, dm.sum, times);
    const oilTxtOf = (f) => (f && f.hasOil) ? f.oils.map(o => escapeHtml(oilName(o.food)) + " " + fmt(num(o.grams), 1) + " g").join(" + ") : "";
    const zr = [];
    times.meals.forEach((t, i) => {
      const m = dm.meals[i], f = facts[i];
      zr.push({ t, h: "<tr><td class='t'>" + fmtHM(t) + "</td><td><b>Mahlzeit " + (i + 1) + "</b>" + (m.rec ? " · " + escapeHtml(m.rec.name) : " · <small>Rezept offen</small>") + "</td>" +
        "<td class='num'>" + (m.est ? "ca. " : "") + fmt(m.vol, 0) + " ml</td><td>" + (oilTxtOf(f) || "–") + "</td><td class='num'>" + sondierMin(m.vol) + " min</td></tr>" });
    });
    if (wp.per > 0) times.gifts.forEach(g => zr.push({ t: g.t, h: "<tr class='water'><td class='t'>" + fmtHM(g.t) + "</td><td>Wasser" + (g.kind === "abend" ? " <small>vor dem Schlafen</small>" : "") + "</td><td class='num'>" + fmt(wp.per, 0) + " ml</td><td></td><td></td></tr>" }));
    if (times.schlaf != null) zr.push({ t: times.schlaf, h: "<tr class='sleep'><td class='t'>" + fmtHM(times.schlaf) + "</td><td>Schlafen</td><td></td><td></td><td></td></tr>" });
    zr.sort((a, b) => a.t - b.t);
    const zeit = "<h2>Zeitplan</h2><table><thead><tr><th>Uhrzeit</th><th>Was</th><th class='num'>Menge</th><th>Öl vor dem Füttern</th><th class='num'>Dauer</th></tr></thead><tbody>" +
      zr.map(r => r.h).join("") + "</tbody></table>" +
      "<div class='box'><b>So sondieren:</b> Mahlzeit langsam über die angegebene Zeit geben (etwa " + SONDIER_ML_MIN + " ml pro Minute), Wasser darf schneller gehen. " +
      "Öl erst unmittelbar vor dem Füttern in die Portion einrühren. Oberkörper hoch – während der Gabe und 30 Minuten danach. Steht beim Öffnen noch Nahrung an: 30–60 Minuten warten.</div>";
    const share = tot.filled / d.mahl;
    const kcalZiel = d.kcal * share, eiweissZiel = d.eiweiss * share;
    const sums = tot.filled
      ? "<h2>Tagessummen" + (tot.filled < d.mahl ? " <small>(" + tot.filled + " von " + d.mahl + " Mahlzeiten geplant, Ziele anteilig)</small>" : "") + "</h2><div class='sums'>" +
        "<div><b>" + fmt(tot.kcal, 0) + " kcal</b><span>Ziel " + fmt(kcalZiel, 0) + "</span></div>" +
        "<div><b>" + fmt(tot.eiweiss) + " g Eiweiß</b><span>Ziel " + fmt(eiweissZiel, 0) + " g" + (proteinState(tot.eiweiss, eiweissZiel) === "high" ? " – deutlich darüber" : "") + "</span></div>" +
        "<div><b>" + fmtRatio(ratioDay, 2) + "</b><span>Verhältnis · Ziel " + fmtTarget(d.ratio) + "</span></div>" +
        (d.fluidDay > 0 ? "<div><b>" + (dm.known < d.mahl ? "ca. " : "") + fmt(wp.total, 0) + " ml</b><span>Flüssigkeit · Ziel " + fmt(d.fluidDay, 0) + "</span></div>" : "") + "</div>"
      : "";
    const rows = facts.map((f, i) => f
      ? "<tr><td class='nw'>" + (i + 1) + "</td><td>" + escapeHtml(f.rec.name) + "</td><td class='num'>" + fmt(f.gNoOil, 0) + " g / " + fmt(f.mlNoOil, 0) + " ml</td><td>" + (oilTxtOf(f) || "–") + "</td>" +
        "<td class='num'>" + fmt(f.sum.kcal, 0) + "</td><td class='num'>" + fmt(f.sum.eiweiss) + " g</td><td class='num'>" + fmtRatio(f.ratio, 2) + "</td></tr>"
      : "<tr><td>" + (i + 1) + "</td><td colspan='6'><small>nicht geplant</small></td></tr>").join("");
    const detail = tot.filled
      ? "<h2>Mahlzeiten im Detail</h2><table><thead><tr><th>#</th><th>Rezept</th><th class='num'>Abfüllen ohne Öl</th><th>Öl vor dem Füttern</th><th class='num'>kcal</th><th class='num'>Eiweiß</th><th class='num'>Verhältnis</th></tr></thead><tbody>" + rows +
        "<tr class='sum'><td></td><td>Summe</td><td></td><td>" + [tot.raps > 0 ? "Rapsöl " + fmt(tot.raps, 1) + " g" : "", tot.mct > 0 ? "MCT-Öl " + fmt(tot.mct, 1) + " g" : ""].filter(Boolean).join(" + ") + "</td><td class='num'>" + fmt(tot.kcal, 0) + "</td><td class='num'>" + fmt(tot.eiweiss) + " g</td><td class='num'>" + fmtRatio(ratioDay, 2) + "</td></tr></tbody></table>"
      : "";
    const rx = "<p class='rx'>Verordnung " + fmtTarget(d.ratio) + " · " + fmt(d.kcal, 0) + " kcal/Tag (" + d.mahl + " × " + fmt(d.kcalMahl, 0) + " kcal) · Eiweiß-Ziel " + fmt(d.eiweiss, 0) + " g/Tag" +
      (d.fluidDay > 0 ? " · Flüssigkeit " + fmt(d.fluidDay, 0) + " ml/Tag" : "") + (d.mctShare > 0 ? " · MCT-Anteil " + Math.round(d.mctShare * 100) + " %" : "") + "</p>";
    const html = printDoc("Tagesplan", escapeHtml(printDateLong()), rx + zeit + sums + detail);
    openPrintView(html, "Tagesplan " + fileDate());
  }
