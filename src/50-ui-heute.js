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
    const slotsHtml = state.dayPlan.map((slot, i) => {
      const rec = recipeByKey(slot.key);
      if (!rec) {
        facts.push(null);
        return '<div class="slot empty-slot"><div class="slot-head"><span class="slot-no">Mahlzeit ' + (i + 1) + '</span></div>' +
          '<button type="button" class="btn secondary" data-pick="' + i + '">＋ Rezept wählen</button></div>';
      }
      const f = mealFacts(rec, d); facts.push(f);
      tot.kcal += f.sum.kcal; tot.eiweiss += f.sum.eiweiss; tot.fett += f.sum.fett; tot.kh += f.sum.kh;
      tot.mct += f.gMct; tot.raps += f.gRaps; tot.fluid += f.fluid || 0; tot.filled++;
      return '<div class="slot"><div class="slot-head"><span class="slot-no">Mahlzeit ' + (i + 1) + '</span>' +
        '<span class="slot-name">' + (rec.icon || "🥑") + " " + escapeHtml(rec.name) + "</span></div>" +
        '<div class="slot-stats"><span>' + fmt(f.sum.kcal, 0) + ' kcal</span><span>Eiweiß ' + fmt(f.sum.eiweiss) + ' g</span>' +
        '<span class="ratio-pill ' + ratioClass(f.ratio, d.ratio) + '">' + fmtRatio(f.ratio, 2) + '</span></div>' +
        '<details class="collapsible feed"><summary>💉 Füttern – Menge</summary><div class="feed-body">' +
          '<div class="fill-hero small"><div class="fill-big">≈ ' + fmt(f.gNoOil, 0) + ' g</div><div class="fill-sub">≈ ' + fmt(f.mlNoOil, 0) + ' ml' + (f.hasOil ? " · <strong>ohne Öl</strong>" : "") + "</div></div>" +
          (f.hasOil ? '<ul class="oil-list">' + f.oils.map(o => "<li><span>" + escapeHtml(o.food) + "</span><strong>" + fmt(num(o.grams), 1) + " g</strong></li>").join("") + "</ul>" +
            '<div class="hint">Öl erst kurz vor dem Füttern einrühren' + (rec.varoma ? "; vorher durch ein feines Sieb streichen" : "") + ".</div>" : "") +
        "</div></details>" +
        '<div class="slot-actions"><button type="button" class="linkbtn" data-open="' + i + '">Rezept öffnen</button>' +
        '<button type="button" class="linkbtn" data-pick="' + i + '">Ändern</button>' +
        '<button type="button" class="linkbtn" data-clear="' + i + '">Entfernen</button></div></div>';
    }).join("");
    const ratioDay = (tot.eiweiss + tot.kh) > 0 ? tot.fett / (tot.eiweiss + tot.kh) : null;
    const share = tot.filled / d.mahl; // Anteil geplanter Mahlzeiten → Ziele anteilig
    const pct = (v, t) => t > 0 ? Math.round(v / t * 100) : 0;
    const eiweissZiel = d.eiweiss * share, kcalZiel = d.kcal * share, kcalMinZiel = d.kcalMin * share, fluidZiel = d.fluidDay * share;
    const kcalLow = tot.kcal < kcalMinZiel - 0.5;
    const sums = tot.filled
      ? '<div class="card"><h3>Σ Tagessummen <span class="hint">' + tot.filled + ' von ' + d.mahl + ' Mahlzeiten geplant</span></h3>' +
        '<div class="detail-tiles">' +
        '<div class="dstat' + (kcalLow ? " warn" : "") + '"><div class="v">' + fmt(tot.kcal, 0) + '</div><div class="l">kcal · Ziel ' + fmt(kcalZiel, 0) + ' (' + pct(tot.kcal, kcalZiel) + ' %)<br><small>Minimum ' + fmt(kcalMinZiel, 0) + (kcalLow ? ' – unterschritten!' : ' ✓') + '</small></div></div>' +
        '<div class="dstat' + (tot.eiweiss < eiweissZiel * 0.9 ? " warn" : "") + '"><div class="v">' + fmt(tot.eiweiss) + ' g</div><div class="l">Eiweiß · Ziel ' + fmt(eiweissZiel, 0) + ' g (' + pct(tot.eiweiss, eiweissZiel) + ' %)</div></div>' +
        '<div class="dstat"><div class="v"><span class="ratio-pill ' + ratioClass(ratioDay, d.ratio) + '">' + fmtRatio(ratioDay, 2) + '</span></div><div class="l">Verhältnis über den Tag · Ziel ' + fmtTarget(d.ratio) + '</div></div>' +
        '<div class="dstat"><div class="v">' + fmt(tot.mct, 1) + ' g</div><div class="l">MCT je Tag' + (tot.raps > 0 ? '<br><small>Rapsöl ' + fmt(tot.raps, 0) + ' g</small>' : "") + '</div></div>' +
        (d.fluidDay > 0 ? '<div class="dstat' + (d.wasserModus === "mahlzeit" && tot.fluid < fluidZiel - 3 ? " warn" : "") + '"><div class="v">' + fmt(tot.fluid, 0) + ' ml</div><div class="l">Flüssigkeit · Ziel ' + fmt(fluidZiel, 0) + ' ml</div></div>' : "") +
        "</div>" +
        (d.fluidDay > 0 && d.wasserModus === "zwischen" ? zwischenText(d, fluidZiel - tot.fluid, tot.filled) : "") +
        (d.fluidDay > 0 && d.wasserModus === "mahlzeit" && tot.fluid < fluidZiel - 3 ? '<div class="note warn">💧 Der Tag liegt unter dem Flüssigkeitsziel (' + fmt(fluidZiel, 0) + ' ml) – bei einem Rezept ist das Wasser gemerkt und kleiner als der Anteil.</div>' : "") +
        (kcalLow ? '<div class="note warn">⚠️ Der Tag liegt unter dem Kalorien-Minimum (' + fmt(d.kcalMin, 0) + ' kcal). Eine Mahlzeit mit mehr Kalorien einplanen.</div>' : "") +
        (tot.filled < d.mahl ? '<div class="note info">Ziele sind anteilig auf die ' + tot.filled + ' geplanten Mahlzeiten gerechnet.</div>' : "") +
        '<div class="btn-row"><button type="button" class="btn secondary" id="print-day">🖨️ Tagesplan drucken</button><button type="button" class="btn ghost" id="clear-day">Plan leeren</button></div></div>'
      : '<div class="card"><p class="hint">Noch keine Mahlzeit geplant. Wähle je Mahlzeit ein Rezept – die Tagessummen (kcal, Eiweiß, Verhältnis über den Tag, MCT je Tag) erscheinen automatisch.</p></div>';
    // Packungsstand (z. B. Compleat 500 ml, 2 Tage): heute verplant, Rest für morgen.
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
      const zweiTage = x.ml * x.pk.tage;
      return '<div class="card"><h3>🧃 ' + escapeHtml(k) + ' <span class="hint">Packung ' + x.pk.ml + ' ml · offen ' + x.pk.tage + ' Tage haltbar</span></h3><div class="detail-tiles">' +
        '<div class="dstat"><div class="v">' + fmt(x.ml, 0) + ' ml</div><div class="l">heute · ' + x.meals + ' Mahlzeit' + (x.meals === 1 ? "" : "en") + ' à ' + fmt(per, 0) + ' ml</div></div>' +
        '<div class="dstat' + (rest < -0.5 ? " warn" : "") + '"><div class="v">' + fmt(Math.max(0, rest), 0) + ' ml</div><div class="l">' +
          (rest < -0.5 ? 'fehlen ' + fmt(-rest, 0) + ' ml – der Plan braucht mehr als eine Packung' : 'bleibt für morgen · reicht für ' + restMeals + ' Mahlzeit' + (restMeals === 1 ? "" : "en")) + '</div></div></div>' +
        (rest >= -0.5 && zweiTage > x.pk.ml + 0.5 ? '<div class="note info">Bei gleichem Plan an ' + x.pk.tage + ' Tagen fehlen ' + fmt(zweiTage - x.pk.ml, 0) + ' ml – dafür braucht es eine zweite Packung.</div>' : "") +
        (rest >= -0.5 && zweiTage < x.pk.ml - 0.5 ? '<div class="note info">Bei gleichem Plan an ' + x.pk.tage + ' Tagen bleiben ' + fmt(x.pk.ml - zweiTage, 0) + ' ml übrig (danach entsorgen) – oder mehr Mahlzeiten damit planen bzw. das Rezept mit Pre Apta wählen, das je Mahlzeit weniger Compleat braucht.</div>' : "") +
        (Math.abs(zweiTage - x.pk.ml) <= 0.5 ? '<div class="note tip">✅ Bei gleichem Plan an ' + x.pk.tage + ' Tagen geht die Packung genau auf.</div>' : "") +
        '</div>';
    }).join("");
    box.innerHTML = '<div class="card"><h3>📅 Tagesplan <span class="hint">' + d.mahl + ' Mahlzeiten · ' + fmt(d.kcalMahl, 0) + ' kcal je Mahlzeit</span></h3><div class="slots">' + slotsHtml + "</div></div>" + sums + packHtml;
    box.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => openPicker(num(b.dataset.pick))));
    box.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => { const r = recipeByKey(state.dayPlan[num(b.dataset.open)].key); if (r) openRecipeDetail(r); }));
    box.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", () => { state.dayPlan[num(b.dataset.clear)] = { key: null }; save(); renderHeute(); }));
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
    ov.hidden = false; document.body.classList.add("modal-open");
    try { q.focus(); } catch (e) {}
  }
  function renderPicker() {
    const list = document.getElementById("picker-list"); if (!list) return;
    const q = ((document.getElementById("picker-search") || {}).value || "").trim().toLowerCase();
    const d = derived();
    // Ein Eintrag je Gericht (Variante laut Wahl/Phase); gespeichert wird die konkrete Variante.
    const hitItems = (r) => r.items.some(it => (it.food || "").toLowerCase().indexOf(q) !== -1);
    const recs = allFamilies()
      .map(fam => ({ fam, rec: chosenVariant(fam) }))
      .filter(x => !q || x.fam.name.toLowerCase().indexOf(q) !== -1 || x.fam.variants.some(hitItems))
      .map(x => Object.assign(x, { res: computeAdjustedRecipe(x.rec, d.kcalMahl, d.ratio) })).filter(x => x.res.ok)
      .sort((a, b) => { const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1; if (fa !== fb) return fa - fb; return a.fam.name.localeCompare(b.fam.name, "de"); });
    list.innerHTML = recs.map(x => {
      const s = sumMacros(x.res.items);
      return '<button type="button" class="pick-row" data-key="' + escapeHtml(recipeKey(x.rec)) + '"><span class="pick-icon">' + (x.rec.icon || "🥑") + '</span>' +
        '<span class="pick-name">' + escapeHtml(x.fam.name) + (isFav(x.rec) ? " ★" : "") + '</span>' +
        '<span class="pick-meta">' + fmt(s.kcal, 0) + " kcal · Eiweiß " + fmt(s.eiweiss) + " g" + (x.rec.ketocal ? " · " + escapeHtml(basisLabel(x.rec)) : "") + "</span></button>";
    }).join("") || '<div class="empty">Kein Gericht gefunden.</div>';
    list.querySelectorAll(".pick-row").forEach(b => b.addEventListener("click", () => {
      if (pickerSlot >= 0) { ensureDayPlan(derived()); state.dayPlan[pickerSlot] = { key: b.dataset.key }; save(); }
      closePicker(); renderHeute();
    }));
  }
  function closePicker() {
    const ov = document.getElementById("picker-overlay"); if (!ov) return;
    ov.hidden = true; document.body.classList.remove("modal-open");
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
