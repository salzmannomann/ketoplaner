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
  function renderHeute() {
    const box = document.getElementById("heute-content"); if (!box) return;
    const d = derived(); ensureDayPlan(d);
    const tot = { kcal: 0, eiweiss: 0, fett: 0, kh: 0, mct: 0, raps: 0, fluid: 0, filled: 0 };
    const facts = [];
    // Jede Mahlzeit ist eine Zeile wie in der Rezeptliste: Nummer · Icon · Name + Pille / Werte · Ändern · Entfernen.
    // Tipp auf die Zeile öffnet das Rezept; leere Zeilen öffnen die Auswahl.
    const slotsHtml = state.dayPlan.map((slot, i) => {
      const rec = recipeByKey(slot.key);
      if (!rec) {
        facts.push(null);
        return '<div class="tile slot empty-slot" role="button" tabindex="0" data-pick="' + i + '"><span class="slot-no">' + (i + 1) + '</span><span class="tile-icon">＋</span>' +
          '<div class="tile-body"><div class="tile-line1"><span class="tile-name">Rezept wählen</span></div><div class="tile-stats"><span>Mahlzeit ' + (i + 1) + ' · ' + fmt(d.kcalMahl, 0) + ' kcal</span></div></div><span class="tile-chev" aria-hidden="true">›</span></div>';
      }
      const f = mealFacts(rec, d); facts.push(f);
      tot.kcal += f.sum.kcal; tot.eiweiss += f.sum.eiweiss; tot.fett += f.sum.fett; tot.kh += f.sum.kh;
      tot.mct += f.gMct; tot.raps += f.gRaps; tot.fluid += f.fluid || 0; tot.filled++;
      const proteinOk = f.sum.eiweiss >= d.eiweissMahl * 0.9;
      const oilTxt = f.hasOil ? f.oils.map(o => escapeHtml(String(o.food).replace(/\s*C8\+C10/, "")) + " " + fmt(num(o.grams), 1) + " g").join(" + ") : "";
      return '<div class="tile slot" role="button" tabindex="0" data-open="' + i + '"><span class="slot-no">' + (i + 1) + '</span><span class="tile-icon">' + (rec.icon || "🥑") + '</span>' +
        '<div class="tile-body"><div class="tile-line1"><span class="tile-name">' + escapeHtml(rec.name) + '</span><span class="tile-badge">' +
          (ratioClass(f.ratio, d.ratio) !== "ok" ? '<span class="ratio-pill ' + ratioClass(f.ratio, d.ratio) + '">' + fmtRatio(f.ratio, 2) + '</span>' : "") + '</span></div>' +
        '<div class="tile-stats"><span>' + fmt(f.sum.kcal, 0) + ' kcal</span><span>💉 ≈ ' + fmt(f.gNoOil, 0) + ' g / ' + fmt(f.mlNoOil, 0) + ' ml' + (f.hasOil ? ' ohne Öl' : '') + '</span>' +
          (oilTxt ? '<span>🧈 ' + oilTxt + '</span>' : "") + '<span class="' + (proteinOk ? "prot-ok" : "prot-low") + '">Eiweiß ' + fmt(f.sum.eiweiss) + ' g</span></div></div>' +
        '<button type="button" class="slot-act" data-pick="' + i + '" title="Rezept ändern" aria-label="Rezept ändern">↻</button>' +
        '<button type="button" class="slot-act" data-clear="' + i + '" title="Entfernen" aria-label="Entfernen">✕</button></div>';
    }).join("");
    const ratioDay = (tot.eiweiss + tot.kh) > 0 ? tot.fett / (tot.eiweiss + tot.kh) : null;
    const share = tot.filled / d.mahl; // Anteil geplanter Mahlzeiten → Ziele anteilig
    const eiweissZiel = d.eiweiss * share, kcalZiel = d.kcal * share, kcalMinZiel = d.kcalMin * share, fluidZiel = d.fluidDay * share;
    const kcalLow = tot.kcal < kcalMinZiel - 0.5;
    // Kopf wie in der Rezeptliste: Gruppen-Überschrift mit Zähler, rechts Drucken und Leeren.
    const head = '<div class="group-head day-head">📅 Tagesplan <span class="group-count">' + d.mahl + ' × ' + fmt(d.kcalMahl, 0) + ' kcal</span>' +
      '<span class="head-actions"><button type="button" class="iconbtn round" id="print-day" title="Tagesplan drucken" aria-label="Tagesplan drucken">🖨️</button>' +
      '<button type="button" class="iconbtn round" id="clear-day" title="Plan leeren" aria-label="Plan leeren">🗑️</button></span></div>';
    // Statuszeile + Kacheln wie auf dem Blatt „Tag“ (kcal · Eiweiß · Verhältnis · Flüssigkeit); Öl in der Statuszeile.
    const oilDay = [tot.raps > 0 ? "Rapsöl " + fmt(tot.raps, 0) + " g" : "", tot.mct > 0 ? "MCT " + fmt(tot.mct, 1) + " g" : ""].filter(Boolean).join(" + ");
    const status = tot.filled
      ? '<div class="portion-line">' + tot.filled + ' von ' + d.mahl + ' Mahlzeiten geplant' + (tot.filled < d.mahl ? ' · Ziele anteilig' : '') + (oilDay ? ' · Öl je Tag: ' + oilDay : '') + '</div>'
      : '<div class="portion-line">Noch keine Mahlzeit geplant – je Mahlzeit ein Rezept wählen, die Tagessummen erscheinen automatisch.</div>';
    const sums = tot.filled
      ? '<div class="detail-tiles strip" id="day-sums">' +
        '<div class="dstat' + (kcalLow ? " warn" : "") + '"><div class="v">' + fmt(tot.kcal, 0) + '</div><div class="l">kcal · Ziel ' + fmt(kcalZiel, 0) + '<br><small>Minimum ' + fmt(kcalMinZiel, 0) + (kcalLow ? ' – unterschritten!' : ' ✓') + '</small></div></div>' +
        '<div class="dstat' + (tot.eiweiss < eiweissZiel * 0.9 ? " warn" : "") + '"><div class="v">' + fmt(tot.eiweiss) + ' g</div><div class="l">Eiweiß · Ziel ' + fmt(eiweissZiel, 0) + ' g</div></div>' +
        '<div class="dstat"><div class="v"><span class="ratio-pill ' + ratioClass(ratioDay, d.ratio) + '">' + fmtRatio(ratioDay, 2) + '</span></div><div class="l">Verhältnis · Ziel ' + fmtTarget(d.ratio) + '</div></div>' +
        (d.fluidDay > 0 ? '<div class="dstat' + (d.wasserModus === "mahlzeit" && tot.fluid < fluidZiel - 3 ? " warn" : "") + '"><div class="v">' + fmt(tot.fluid, 0) + ' ml</div><div class="l">Flüssigkeit · Ziel ' + fmt(fluidZiel, 0) + ' ml</div></div>' : "") +
        "</div>" +
        (d.fluidDay > 0 && d.wasserModus === "zwischen" ? zwischenText(d, fluidZiel - tot.fluid, tot.filled) : "") +
        (d.fluidDay > 0 && d.wasserModus === "mahlzeit" && tot.fluid < fluidZiel - 3 ? '<div class="note warn">💧 Der Tag liegt unter dem Flüssigkeitsziel (' + fmt(fluidZiel, 0) + ' ml) – bei einem Rezept ist das Wasser gemerkt und kleiner als der Anteil.</div>' : "") +
        (kcalLow ? '<div class="note warn">⚠️ Der Tag liegt unter dem Kalorien-Minimum (' + fmt(d.kcalMin, 0) + ' kcal). Eine Mahlzeit mit mehr Kalorien einplanen.</div>' : "")
      : "";
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
      return '<div class="note tip pack">🧃 <strong>' + escapeHtml(k) + '</strong> (Packung ' + x.pk.ml + ' ml, offen ' + x.pk.tage + ' Tage): heute <strong>' + fmt(x.ml, 0) + ' ml</strong> (' + x.meals + ' × ' + fmt(per, 0) + ' ml) · ' +
        (rest < -0.5 ? '<strong>fehlen ' + fmt(-rest, 0) + ' ml</strong> – der Plan braucht mehr als eine Packung' : 'bleiben ' + fmt(rest, 0) + ' ml für morgen (' + restMeals + ' Mahlzeit' + (restMeals === 1 ? "" : "en") + ')') +
        (rest >= -0.5 && nTage > x.pk.ml + 0.5 ? ' · in ' + x.pk.tage + ' Tagen fehlen ' + fmt(nTage - x.pk.ml, 0) + ' ml, zweite Packung nötig' : "") +
        (rest >= -0.5 && nTage < x.pk.ml - 0.5 ? ' · in ' + x.pk.tage + ' Tagen bleiben ' + fmt(x.pk.ml - nTage, 0) + ' ml übrig (entsorgen oder mehr Mahlzeiten damit planen)' : "") +
        (Math.abs(nTage - x.pk.ml) <= 0.5 ? ' · ✅ geht in ' + x.pk.tage + ' Tagen genau auf' : "") + '.</div>';
    }).join("");
    box.innerHTML = head + status + sums + '<div class="tiles day-slots">' + slotsHtml + "</div>" + packHtml;
    box.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); openPicker(num(b.dataset.pick)); }));
    box.querySelectorAll("[data-open]").forEach(b => {
      const open = () => { const r = recipeByKey(state.dayPlan[num(b.dataset.open)].key); if (r) openRecipeDetail(r); };
      b.addEventListener("click", open);
      b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    box.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); state.dayPlan[num(b.dataset.clear)] = { key: null }; save(); renderHeute(); }));
    const pd = box.querySelector("#print-day"); if (pd) pd.addEventListener("click", () => printDayPlan(d, facts, tot, ratioDay));
    const cd = box.querySelector("#clear-day");
    if (cd) cd.addEventListener("click", () => { if (confirm("Tagesplan leeren?")) { state.dayPlan = state.dayPlan.map(() => ({ key: null })); save(); renderHeute(); } });
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
      .sort((a, b) => { const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1; if (fa !== fb) return fa - fb; return a.fam.name.localeCompare(b.fam.name, "de") || ((a.rec.ketocal ? 1 : 0) - (b.rec.ketocal ? 1 : 0)); });
    list.innerHTML = recs.map(x => {
      const s = sumMacros(x.res.items);
      return '<button type="button" class="pick-row" data-key="' + escapeHtml(recipeKey(x.rec)) + '"><span class="pick-icon">' + (x.rec.icon || "🥑") + '</span>' +
        '<span class="pick-name">' + escapeHtml(x.fam.name) + (isFav(x.rec) ? " ★" : "") + '</span>' +
        '<span class="pick-meta">' + fmt(s.kcal, 0) + " kcal · Eiweiß " + fmt(s.eiweiss) + " g" + ((x.rec.ketocal || isMulti(x.rec)) ? " · " + (x.rec.ketocal ? "🥄 " : "") + escapeHtml(basisLabel(x.rec)) : "") + "</span></button>";
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
  function printDayPlan(d, facts, tot, ratioDay) {
    const rows = facts.map((f, i) => f
      ? "<tr><td>" + (i + 1) + "</td><td>" + escapeHtml(f.rec.name) + "</td><td>" + fmt(f.gNoOil, 0) + " g / " + fmt(f.mlNoOil, 0) + " ml</td><td>" +
        (f.hasOil ? f.oils.map(o => escapeHtml(o.food) + " " + fmt(num(o.grams), 1) + " g").join("<br>") : "–") + "</td><td>" + fmt(f.sum.kcal, 0) + "</td><td>" + fmt(f.sum.eiweiss) + " g</td></tr>"
      : "<tr><td>" + (i + 1) + "</td><td colspan='5' style='color:#888'>– nicht geplant –</td></tr>").join("");
    const html = "<!DOCTYPE html><html lang='de'><head><meta charset='utf-8'><title>Tagesplan</title><style>" +
      "@page{size:A4 portrait;margin:16mm}body{font-family:Arial,Helvetica,sans-serif;color:#1f2933;font-size:11pt;line-height:1.45;margin:0}" +
      "h1{font-size:18pt;margin:0 0 2mm}.sub{color:#444;margin:0 0 5mm;font-size:10pt}table{width:100%;border-collapse:collapse}" +
      "th,td{border-bottom:0.4pt solid #bbb;padding:1.8mm 1.5mm;text-align:left;vertical-align:top;font-size:10.5pt}th{background:#f2f4f6}" +
      ".tot td{font-weight:bold;border-top:1pt solid #777}.note{color:#666;font-size:8.5pt;margin-top:6mm}</style></head><body>" +
      "<h1>📅 Tagesplan</h1><p class='sub'>" + d.mahl + " Mahlzeiten · " + fmt(d.kcal, 0) + " kcal/Tag · Verhältnis " + fmtTarget(d.ratio) +
      (d.mctShare > 0 ? " · MCT-Anteil " + Math.round(d.mctShare * 100) + " %" : "") + " · " + new Date().toLocaleDateString("de-AT") + "</p>" +
      "<table><thead><tr><th>#</th><th>Mahlzeit</th><th>Abfüllen (ohne Öl)</th><th>Öl vor dem Füttern</th><th>kcal</th><th>Eiweiß</th></tr></thead><tbody>" + rows +
      "<tr class='tot'><td></td><td>Summe</td><td></td><td>" + (tot.raps > 0 ? "Rapsöl " + fmt(tot.raps, 0) + " g" : "") + (tot.mct > 0 ? "<br>MCT " + fmt(tot.mct, 1) + " g" : "") + "</td><td>" + fmt(tot.kcal, 0) + "</td><td>" + fmt(tot.eiweiss) + " g</td></tr>" +
      "</tbody></table><p class='sub'>Verhältnis über den Tag: " + fmtRatio(ratioDay, 2) + " · Eiweiß-Ziel " + fmt(d.eiweiss, 0) + " g/Tag</p>" +
      "<p class='note'>Erstellt mit HamHam Keto. Bitte Mengen mit dem Behandlungsteam abstimmen.</p></body></html>";
    let w = null;
    try { w = window.open("", "_blank"); } catch (e) {}
    if (!w) { alert("Bitte Pop-ups für diese Seite erlauben, um drucken zu können."); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 250);
  }
