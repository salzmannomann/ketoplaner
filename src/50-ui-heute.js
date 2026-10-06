  /* ---------- Heute: Tagesplan ---------- */
  // Weniger Mahlzeiten: die hinteren Plätze werden für diese Sitzung gemerkt und kommen zurück, wenn die Zahl wieder
  // steigt (z. B. nach „Abbrechen“ oder „Rückgängig“ in der Verordnung).
  let dayPlanCut = {}; // Platz-Nummer → weggefallener Platz (Rezept und eigene Änderungen)
  function ensureDayPlan(d) {
    if (!Array.isArray(state.dayPlan)) state.dayPlan = [];
    let restored = false;
    while (state.dayPlan.length < d.mahl) {
      const i = state.dayPlan.length;
      if (dayPlanCut[i]) restored = true;
      state.dayPlan.push(dayPlanCut[i] || { key: null }); delete dayPlanCut[i];
    }
    if (restored) save(); // sonst ginge der zurückgeholte Plan beim Neuladen wieder verloren
    if (state.dayPlan.length > d.mahl) {
      state.dayPlan.slice(d.mahl).forEach((sl, j) => { if (sl && sl.key) dayPlanCut[d.mahl + j] = slotCopy(sl); });
      state.dayPlan.length = d.mahl;
    }
  }
  function recipeByKey(key) {
    if (!key) return null;
    const all = allRecipes();
    for (let i = 0; i < all.length; i++) if (recipeKey(all[i]) === key) return all[i];
    return null;
  }
  /* Desktop ab 1100 px: rechts neben dem Plan steht das Rezept einer Mahlzeit als festes Panel (wie unter Rezepte).
     Ohne Auswahl ist es die nächste Mahlzeit nach der Uhrzeit (bis 30 Minuten nach ihrer Zeit gilt sie noch als
     „jetzt“); nach der letzten des Tages die erste von morgen. Ein Tipp auf eine Mahlzeit zeigt diese – bis der
     Tagesplan neu geöffnet wird. Im Panel heißt der Hauptknopf „Mahlzeit tauschen“ (öffnet die Auswahl). */
  const PLAN_NOW_MIN = 30;
  let planPick = null;   // vom Nutzer gewählte Mahlzeit (Platz-Nummer) oder null = automatisch die nächste
  let planShown = null;  // zuletzt im Panel geladene Mahlzeit („Platz|Rezept“) – lädt nur bei einem Wechsel neu
  function planSlots() { return [...document.querySelectorAll("#heute-content .zp-row.slot[data-open]")].map(r => num(r.dataset.open)); }
  function planNext() {
    const filled = planSlots(); if (!filled.length) return null;
    const times = zeitTimes(derived()).meals, now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    const i = filled.find(k => times[k] + PLAN_NOW_MIN > m);
    return i != null ? { i, now: times[i] <= m, tomorrow: false } : { i: filled[0], now: false, tomorrow: true };
  }
  function planPanelIndex() {
    if (planPick != null && planSlots().indexOf(planPick) !== -1) return planPick;
    const n = planNext(); return n ? n.i : null;
  }
  // Rezept einer Mahlzeit aus dem Tagesplan (Panel oder – schmaler – Fenster): Kopfzeile mit Uhrzeit und Platz für
  // „Mahlzeit tauschen“. Nur wenn gerade das Rezept dieser Mahlzeit gezeigt wird (nicht z. B. „auch ohne KetoCal“).
  function planPanelCtx(rec) {
    if (state.settings.view !== "heute") return null;
    const panel = panelMode(), i = panel ? planPanelIndex() : planPick; if (i == null) return null;
    const sl = state.dayPlan[i]; if (!sl || !rec || sl.key !== recipeKey(rec)) return null;
    const t = fmtHM(zeitTimes(derived()).meals[i]), n = panel ? planNext() : null;
    const label = n && n.i === i ? (n.tomorrow ? "Morgen · " : n.now ? "Jetzt · " : "Nächste Mahlzeit · ") + t : "Mahlzeit um " + t;
    return { i, label, panel, t };
  }
  function markPlanSel(i) {
    document.querySelectorAll("#heute-content .zp-row.slot[data-open]").forEach(r => r.classList.toggle("sel", i != null && num(r.dataset.open) === i));
  }
  // Panel im Tagesplan abgleichen (aufgerufen aus syncDetailPanel, #detail-overlay steht schon in #hp-panel)
  // Läuft die Uhr weiter, rückt das Panel ohne eigene Auswahl zur nächsten Mahlzeit (einmal pro Minute prüfen;
  // der Takt startet erst, wenn das Panel zum ersten Mal gebraucht wird)
  let planTimer = null, planTick = null;
  function startPlanTimer() {
    if (planTimer) return;
    planTimer = setInterval(() => {
      if (state.settings.view !== "heute" || planPick != null || !panelMode()) { planTick = null; return; }
      const ctx = planPanelCtx(detailRec), t = planPanelIndex() + "|" + (ctx ? ctx.label : "");
      if (planTick != null && t !== planTick) syncDetailPanel();
      planTick = t;
    }, 60000);
  }
  function syncPlanPanel(ov, slot, opened) {
    startPlanTimer();
    const i = planPanelIndex();
    markPlanSel(i);
    if (i == null) { ov.hidden = true; planShown = null; return; }
    const key = state.dayPlan[i].key, id = i + "|" + key;
    if (opened) { planShown = id; ov.hidden = false; return; }
    if (planShown !== id || !detailRec) {
      planShown = id;
      detailRec = recipeByKey(key); detailPicked = planPick != null; detailScale = "tag"; detailMeat = null; state.settings.detailTab = "mahlzeit";
      detailMctOpen = Math.min(1, Math.max(0, num(state.settings.mctShare)));
    }
    ov.hidden = false;
    if (!slot.contains(document.activeElement)) renderDetail();
  }
  // Zusatz zum Namen einer Mahlzeit mit eigenen Änderungen: „mit Pute“ (Fleisch/Fisch getauscht) und/oder „eigene Menge“
  function slotNote(sl, f) {
    if (!sl || !f) return "";
    const out = [], ms = sl.meat ? recipeMeatSlot(f.rec) : null, it = ms && sl.meat !== ms.baseKey ? swapItem(sl.meat) : null;
    if (it && f.res.items.some(x => x.food === it.food)) out.push("mit " + it.label);
    if (sl.portion != null || sl.water != null) out.push("eigene Menge");
    return out.join(" · ");
  }
  // Heute (Küchenzettel): eine Zeitleiste für den ganzen Tag. Jede Mahlzeit mit Uhrzeit, Rezeptname, Menge und
  // Dauer, darunter die Zutaten einer Portion als kleine Grammtabelle; ganze Zeile tippbar → Rezept, „tauschen“ →
  // Auswahl (dort auch „Leeren“). Offene Mahlzeiten kursiv mit „wählen“. Dazwischen Wassergaben (blau, gepunktet)
  // und das Schlafen. Darüber Tagessumme (eine Mono-Zeile) und Werkzeugzeile mit Textlinks, darunter die Hinweise.
  function renderHeute() {
    const box = document.getElementById("heute-content"); if (!box) return;
    const d = derived(); ensureDayPlan(d);
    renderHeader(d); // Kopf-Pille (Wassergaben) passt sich sofort an, z. B. nach Leeren oder neuem Rezept
    const times = zeitTimes(d), dm = dayMeals(d), wp = waterPlan(d, dm.sum, times);
    const tot = { kcal: 0, eiweiss: 0, fett: 0, kh: 0, mct: 0, raps: 0, fluid: 0, filled: 0 };
    const facts = [];
    const rows = [];
    const link = (txt, attrs, cls) => '<button type="button" class="tlink' + (cls ? " " + cls : "") + '" ' + attrs + '>' + txt + '</button>';
    state.dayPlan.forEach((slot, i) => {
      const t = times.meals[i], m = dm.meals[i], time = '<span class="zp-time">' + fmtHM(t) + '</span>';
      const rec = m.rec;
      if (m.bad) {
        facts.push(null);
        rows.push({ t, html: '<div class="zp-row meal slot empty-slot bad-slot" role="button" tabindex="0" data-pick="' + i + '" title="Dieses Rezept erreicht die Verordnung nicht – anderes Rezept wählen">' + time +
          '<span class="zp-txt"><span class="zp-name">' + displayHtml(m.bad) + '</span><span class="zp-warn">passt nicht zu ' + escapeHtml(fmtRx(d.ratio)) + ' – anderes Rezept wählen</span></span>' +
          '<span class="tlink">wählen</span></div>' });
        return;
      }
      if (!rec) {
        facts.push(null);
        rows.push({ t, html: '<div class="zp-row meal slot empty-slot" role="button" tabindex="0" data-pick="' + i + '" title="Rezept wählen (Menge geschätzt: ≈ ' + fmt(m.vol, 0) + ' ml)">' + time +
          '<span class="zp-txt"><span class="zp-name">Mahlzeit ' + (i + 1) + ' · offen</span></span><span class="tlink">wählen</span></div>' });
        return;
      }
      const f = m.f; facts.push(f);
      const note = slotNote(slot, f);
      tot.kcal += f.sum.kcal; tot.eiweiss += f.sum.eiweiss; tot.fett += f.sum.fett; tot.kh += f.sum.kh;
      tot.mct += f.gMct; tot.raps += f.gRaps; tot.fluid += f.fluid || 0; tot.filled++;
      const ps = proteinState(f.sum.eiweiss, d.eiweissMahl);
      const warns = [];
      if (ps === "high") warns.push("Eiweiß " + fmt(f.sum.eiweiss / d.eiweissMahl, 1) + " × Ziel");
      if (ps === "low") warns.push("Eiweiß nur " + fmt(f.sum.eiweiss) + " g");
      if (ratioClass(f.ratio, d.ratio) !== "ok") warns.push("Verhältnis " + fmtRxA(f.ratio, 2));
      const big = d.maxMahlMl > 0 && m.vol > d.maxMahlMl + 0.5; // über 25 ml/kg auf einmal → gelb markieren
      const oilTxt = f.hasOil ? f.oils.map(o => escapeHtml(String(o.food).replace(/\s*C8\+C10/, "")) + " " + fmt(num(o.grams), 1) + " g").join(" + ") : "";
      rows.push({ t, html: '<div class="zp-row meal slot" role="button" tabindex="0" data-open="' + i + '" title="' + fmt(f.sum.kcal, 0) + ' kcal · Eiweiß ' + fmt(f.sum.eiweiss) + ' g' + (oilTxt ? ' · Öl: ' + oilTxt : '') + '">' + time +
        '<div class="zp-main"><div class="zp-head"><span class="zp-txt"><span class="zp-name">' + displayHtml(rec) + (note ? '<span class="name-suffix slot-note"> · ' + escapeHtml(note) + '</span>' : '') + '</span>' +
          '<span class="zp-vol' + (big ? ' big' : '') + '" title="' + (big ? 'mehr als ' + fmt(d.maxMahlMl, 0) + ' ml auf einmal (25 ml/kg) – mehr Mahlzeiten oder mit dem Team abklären · ' : '') + 'langsam sondieren, etwa ' + SONDIER_ML_MIN + ' ml pro Minute">' +
            (big ? '▲ ' : '') + fmt(m.vol, 0) + ' ml · <span class="ca">ca. </span>' + sondierMin(m.vol) + ' min<span class="zp-more"> · ' + fmt(f.sum.kcal, 0) + ' kcal · Eiweiß ' + fmt(f.sum.eiweiss) + ' g</span></span>' +
          warns.map(w => '<span class="zp-warn">▲ ' + w + '</span>').join("") + '</span>' +
          link("tauschen", 'data-pick="' + i + '" title="Rezept tauschen oder Mahlzeit leeren"', "slot-act") + '</div>' +
        '<div class="zp-ing">' + ingRows(f) + '</div></div></div>' });
    });
    zeitplanExtraRows(times, wp).forEach(r => rows.push(r));
    rows.sort((a, b) => a.t - b.t);
    const ratioDay = (tot.eiweiss + tot.kh) > 0 ? tot.fett / (tot.eiweiss + tot.kh) : null;
    const share = tot.filled / d.mahl; // Anteil geplanter Mahlzeiten → Warnungen an den anteiligen Zielen messen
    const eiweissZiel = d.eiweiss * share, kcalMinZiel = d.kcalMin * share, fluidZiel = d.fluidDay * share;
    const kcalLow = tot.filled > 0 && tot.kcal < kcalMinZiel - 0.5;
    // Werkzeugzeile: Rahmen des Tages links, rechts Textlinks Uhrzeiten · Drucken · Leeren (rot). Der Abstand („· alle 2:38 h“)
    // steht in .dt-int und entfällt als Ganzes, wenn die Zeile zu knapp ist (nie mitten im Wort gekürzt).
    const tools = '<div class="day-tools"><span class="dt-range"><span class="dt-span">' + fmtHM(times.meals[0]) + '–' + fmtHM(times.meals[times.meals.length - 1]) + '</span>' +
        (times.interval != null ? '<span class="dt-int">· alle ' + fmtAbstand(times.interval) + '</span>' : '') + '</span>' +
      link("Uhrzeiten", 'id="zp-toggle" aria-expanded="' + (zpEdit ? "true" : "false") + '" title="Uhrzeiten einstellen"', zpEdit ? "open" : "") +
      link("Drucken", 'id="print-day" title="Tagesplan drucken"') +
      link("Leeren", 'id="clear-day" title="Tagesplan leeren"', "danger") + '</div>';
    // Tagessumme in einer Mono-Zeile: Wert fett, Ziel grau (Ziel = ganzer Tag); Warnzustand → Wert rot.
    // Flüssigkeit = ganzer Tag laut Zeitplan (Mahlzeiten + Wassergaben); „ca.“, wenn offene Mahlzeiten geschätzt sind.
    const est = dm.known < d.mahl;
    const pst = tot.filled ? proteinState(tot.eiweiss, eiweissZiel) : "ok";
    const stat = (cls, v, goal, title) => '<span class="dstat' + (cls ? " " + cls : "") + '"' + (title ? ' title="' + title + '"' : '') + '><b class="v">' + v + '</b> ' + goal + '</span>';
    const kcalTitle = "Ziel " + fmt(d.kcalMahl * Math.max(1, tot.filled), 0) + " kcal für " + tot.filled + " geplante Mahlzeit" + (tot.filled === 1 ? "" : "en") + " · mindestens " + fmt(kcalMinZiel, 0);
    const protTitle = pst === "high" ? "mehr als das Doppelte des Eiweiß-Ziels" : pst === "low" ? "unter dem Eiweiß-Ziel" : "Eiweiß";
    const fluidLow = wp.total < d.fluidDay - 15;
    const fluidTitle = "Mahlzeiten " + fmt(dm.sum, 0) + " ml" + (wp.per > 0 ? " + Wasser " + wp.n + " × " + fmt(wp.per, 0) + " ml" : "") + (est ? " · offene Mahlzeiten geschätzt" : "");
    const ratioBad = tot.filled && ratioClass(ratioDay, d.ratio) !== "ok";
    const sums = '<div class="day-sum" id="day-sums">' +
      stat(kcalLow ? "warn" : "", fmt(tot.kcal, 0), "/ " + fmt(d.kcal, 0) + " kcal", kcalTitle) +
      stat(pst === "ok" ? "" : "warn", fmt(tot.eiweiss) + " g", "/ " + fmt(d.eiweiss, 0) + " g", protTitle) +
      (d.fluidDay > 0 ? stat(fluidLow ? "warn" : "", (est ? "ca. " : "") + fmt(wp.total, 0), "/ " + fmt(d.fluidDay, 0) + " ml", fluidTitle) : "") +
      (ratioBad ? stat("warn", fmtRxA(ratioDay, 2), "", "Verhältnis des Tages · Ziel " + fmtRx(d.ratio)) : "") +
      "</div>";
    const hints = [];
    if (d.fluidDay > 0 && d.wasserModus === "mahlzeit" && tot.filled && tot.fluid < fluidZiel - 3) hints.push(hintLine("warn", "Unter dem Flüssigkeitsziel – bei einem Rezept ist weniger Wasser gemerkt als sein Anteil."));
    if (kcalLow) hints.push(hintLine("warn", "Der Tag liegt unter dem Kalorien-Minimum (" + fmt(d.kcalMin, 0) + " kcal) – eine Mahlzeit mit mehr Kalorien einplanen."));
    // Packungsstand (z. B. Compleat 500 ml, 3 Tage) als graue Zeile.
    const packs = {};
    facts.forEach(f => {
      if (!f || !f.rec.packung) return;
      const pk = f.rec.packung, g = f.res.items.filter(it => it.food === pk.food).reduce((a, it) => a + num(it.grams), 0);
      if (!packs[pk.food]) packs[pk.food] = { pk, ml: 0, meals: 0 };
      packs[pk.food].ml += g; packs[pk.food].meals++;
    });
    Object.keys(packs).forEach(k => {
      const x = packs[k], rest = x.pk.ml - x.ml, per = x.meals ? x.ml / x.meals : 0;
      const restMeals = per > 0 ? Math.floor(Math.max(0, rest) / per + 1e-9) : 0;
      const nTage = x.ml * x.pk.tage;
      // Kurz: heute verplant und Rest für morgen; Einzelheiten zur Packung stehen im Rezept (Blatt „Tag“).
      const shortName = k.replace(/\s*\(.*?\)/g, "").replace(/\s+Nature Mix/, "");
      const second = rest >= -0.5 && nTage > x.pk.ml + 0.5;
      const more = (second ? 'In ' + x.pk.tage + ' Tagen ist eine 2. Packung nötig. ' : "") +
        (rest >= -0.5 && nTage < x.pk.ml - 0.5 ? 'Nach ' + x.pk.tage + ' Tagen bleiben ' + fmt(x.pk.ml - nTage, 0) + ' ml übrig. ' : "");
      hints.push('<div class="hint ' + (rest < -0.5 || second ? "warn" : "info") + ' pack" title="Packung ' + x.pk.ml + ' ml, offen ' + x.pk.tage + ' Tage. Rest reicht für ' + restMeals + ' Mahlzeit' + (restMeals === 1 ? "" : "en") + '. ' + more + '">' +
        (rest < -0.5 || second ? "▲ " : "") + escapeHtml(shortName) + ' heute ' + fmt(x.ml, 0) + ' ml · ' + (rest < -0.5 ? 'fehlen ' + fmt(-rest, 0) + ' ml' : 'Rest ' + fmt(rest, 0) + ' ml') + (second ? ' · 2. Packung' : '') + '</div>');
    });
    const notes = zeitplanNotes(d, times, dm, wp) + hints.join("");
    const slots = '<div class="zp-list day-slots">' + rows.map(r => r.html).join("") + '</div>';
    const side = document.getElementById("side-heute");
    if (isDesktop()) {
      // Desktop: Kopf (Überlinie „Heute“, Titel, Zeitraum, Textlinks), Uhrzeiten und Zeitleiste. Die Tagesbilanz steht
      // links in der Spalte unter der Verordnung – im selben Zeilenraster (Verhältnis, Kalorien, Eiweiß, Flüssigkeit),
      // ohne die Ziele zu wiederholen; darunter die Hinweise. Ab 1100 px steht rechts das Rezept einer Mahlzeit.
      box.innerHTML = '<div class="zeitplan dk">' +
        '<section class="dk-day"><header class="dk-head"><div class="dk-title"><span class="overline">Heute</span><h1>Tagesplan</h1></div>' + tools + '</header>' +
          zeitplanSettings(times) + slots + '</section></div>';
      if (side) {
        const row = (label, v, warn, title) => '<div class="side-row' + (warn ? " warn" : "") + '" title="' + title + '"><span>' + label + '</span><b>' + v + '</b></div>';
        side.innerHTML = '<div class="side-rx-head"><span class="overline">Heute</span><span class="side-plan">' + tot.filled + ' von ' + d.mahl + ' geplant</span></div>' +
          '<div class="day-sum" id="side-sums">' +
          row("Verhältnis", tot.filled ? fmtRxA(ratioDay, 2) : "—", ratioBad, "Verhältnis des Tages · Ziel " + fmtRx(d.ratio)) +
          row("Kalorien", fmt(tot.kcal, 0) + " kcal", kcalLow, kcalTitle) +
          row("Eiweiß", fmt(tot.eiweiss) + " g", pst !== "ok", protTitle) +
          (d.fluidDay > 0 ? row("Flüssigkeit", (est ? "ca. " : "") + fmt(wp.total, 0) + " ml", fluidLow, fluidTitle) : "") + '</div>' +
          (notes ? '<div class="zp-hints">' + notes + '</div>' : "");
        side.hidden = state.settings.view !== "heute";
      }
    } else {
      box.innerHTML = '<div class="zeitplan">' + sums + tools + zeitplanSettings(times) + slots +
        (notes ? '<div class="zp-hints">' + notes + '</div>' : "") + '</div>';
      if (side) side.hidden = true;
    }
    bindZeitplan(box);
    bindSlotSwipe(box);
    bindSlotDrag(box);
    box.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); openPicker(num(b.dataset.pick)); }));
    box.querySelectorAll("[data-open]").forEach(b => {
      const open = () => { const i = num(b.dataset.open), r = recipeByKey(state.dayPlan[i].key); if (r) { planPick = i; openRecipeDetail(r); } };
      b.addEventListener("click", open);
      b.addEventListener("keydown", e => { if (e.target !== b) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    box.querySelectorAll(".empty-slot[data-pick]").forEach(b => b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(num(b.dataset.pick)); } }));
    const pd = box.querySelector("#print-day"); if (pd) pd.addEventListener("click", () => printDayPlan(d, facts));
    const cd = box.querySelector("#clear-day");
    if (cd) cd.addEventListener("click", () => {
      if (!state.dayPlan.some(sl => sl && sl.key)) return;
      const prev = state.dayPlan.map(slotCopy);
      state.dayPlan = state.dayPlan.map(() => ({ key: null })); save(); renderRezepte();
      showToast("Tagesplan geleert", [["Rückgängig", () => { state.dayPlan = prev; save(); renderRezepte(); }]]);
    });
    fitHeute();
    // Direkte Aufrufe (Verschieben, Leeren, Auswahl): Panel und Markierung nachziehen
    if (state.settings.view === "heute" && typeof syncDetailPanel === "function") syncDetailPanel();
  }
  /* Mahlzeit per Wisch nach links leeren, wie in iOS-Listen: die Zeile folgt dem Finger, rechts erscheint rot „Leeren“.
     Loslassen nach etwa einer Knopfbreite lässt den Knopf stehen (Tipp darauf leert), ein langer Wisch über gut die halbe
     Breite leert sofort. Senkrecht scrollt die Seite wie gewohnt; ein Tipp neben den Knopf schließt ihn wieder; nach einem
     Zug löst das Loslassen keinen Klick aus. Nur mit dem Finger – mit der Maus gibt es „tauschen“ → „Leeren“. */
  const SWIPE_BTN = 88;
  let swipeOpen = null;
  function slotIndexOf(row) { return num(row.dataset.open != null ? row.dataset.open : row.dataset.pick); }
  function setSwipe(row, x, anim) {
    let del = row.querySelector(".zp-del");
    if (!del && x < 0) {
      del = document.createElement("button"); del.type = "button"; del.className = "zp-del"; del.textContent = "Leeren"; del.tabIndex = -1;
      del.addEventListener("click", (e) => { e.stopPropagation(); swipeOpen = null; clearSlot(slotIndexOf(row)); });
      row.appendChild(del);
    }
    row.classList.toggle("sw-anim", !!anim);
    row.classList.add("sw");
    row.style.setProperty("--sx", x + "px");
    clearTimeout(row._swT);
    if (x === 0) row._swT = setTimeout(() => { row.classList.remove("sw", "sw-anim"); const d = row.querySelector(".zp-del"); if (d) d.remove(); }, anim ? 230 : 0);
  }
  function closeSwipe(row) { row = row || swipeOpen; if (!row) return; setSwipe(row, 0, true); if (swipeOpen === row) swipeOpen = null; }
  function bindSlotSwipe(box) {
    if (box.dataset.swipe) return; // Delegation am bleibenden Behälter – nur einmal binden
    box.dataset.swipe = "1";
    let st = null, swallow = false;
    box.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      swallow = false; // neue Berührung (nach einem Zug feuert kein Klick, der die Sperre aufheben würde)
      const row = e.target.closest(".zp-row.slot");
      if (e.target.closest(".zp-del")) return;
      if (swipeOpen && swipeOpen !== row) { closeSwipe(); swallow = true; }
      const i = row ? slotIndexOf(row) : -1;
      if (!row || !(state.dayPlan[i] && state.dayPlan[i].key)) { st = null; return; }
      st = { row, id: e.pointerId, x0: e.clientX, y0: e.clientY, base: row === swipeOpen ? -SWIPE_BTN : 0, mode: null };
    });
    box.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (slotDrag) { st = null; return; } // langes Drücken hat das Verschieben gestartet
      const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
      if (!st.mode) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        st.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
      }
      if (st.mode !== "h") return;
      swallow = true;
      setSwipe(st.row, Math.min(0, st.base + dx), false);
    });
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const s = st; st = null;
      if (s.mode !== "h") {
        // Tipp auf die geöffnete Zeile schließt sie (statt das Rezept zu öffnen)
        if (!s.mode && s.base) { closeSwipe(s.row); swallow = true; }
        return;
      }
      const x = e.type === "pointercancel" ? 0 : Math.min(0, s.base + e.clientX - s.x0), W = s.row.offsetWidth;
      if (x < -W * 0.55) {
        setSwipe(s.row, -W, true); swipeOpen = null;
        const i = slotIndexOf(s.row); setTimeout(() => clearSlot(i), 180);
      } else if (x < -SWIPE_BTN * 0.6) { setSwipe(s.row, -SWIPE_BTN, true); swipeOpen = s.row; }
      else closeSwipe(s.row);
    };
    box.addEventListener("pointerup", end);
    box.addEventListener("pointercancel", end);
    box.addEventListener("click", (e) => { if (swallow) { swallow = false; if (!e.target.closest(".zp-del")) { e.stopPropagation(); e.preventDefault(); } } }, true);
  }
  /* Mahlzeiten anordnen: lange drücken (0,4 s, mit dem Finger) bzw. mit der Maus ziehen, dann nach oben oder unten
     schieben. Die Zeile hebt sich ab und folgt, eine Tintenlinie zeigt, wo sie landet; am Bildschirmrand rollt die Seite mit.
     Beim Loslassen rücken die anderen Mahlzeiten nach – die Uhrzeiten bleiben, sie gehören zu den Plätzen. Danach
     „Rückgängig“. Tastatur: Alt+↑/↓ auf einer Mahlzeit. Nur geplante Mahlzeiten lassen sich ziehen, Ziel kann jeder Platz sein. */
  const DRAG_HOLD = 400;
  let slotDrag = null;
  function moveSlot(from, to, focus) {
    ensureDayPlan(derived());
    const n = state.dayPlan.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
    // eigene Änderungen der Mahlzeit wandern mit
    const prev = state.dayPlan.map(slotCopy);
    const arr = prev.map(slotCopy), item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
    // Die im Panel gewählte Mahlzeit wandert mit
    if (planPick === from) planPick = to;
    else if (planPick != null && (planPick - from) * (planPick - to) <= 0) planPick += from < to ? -1 : 1;
    state.dayPlan = arr; save(); renderHeute();
    const t = zeitTimes(derived()).meals[to];
    showToast("Mahlzeit verschoben – jetzt um " + fmtHM(t), [["Rückgängig", () => { state.dayPlan = prev; save(); renderHeute(); }]]);
    // Tastatur: der Fokus wandert mit der Mahlzeit
    const row = focus && document.querySelector('#heute-content .zp-row.slot[data-open="' + to + '"], #heute-content .zp-row.slot[data-pick="' + to + '"]');
    if (row) row.focus();
  }
  function bindSlotDrag(box) {
    if (box.dataset.drag) return;
    box.dataset.drag = "1";
    let pend = null, swallow = false, line = null, raf = 0;
    const filled = (row) => { const i = slotIndexOf(row); return !!(state.dayPlan[i] && state.dayPlan[i].key); };
    const rowsOf = () => [...box.querySelectorAll(".zp-row.slot")];
    const bottomLimit = () => { const tb = document.querySelector(".tabbar"); const r = tb && tb.offsetParent ? tb.getBoundingClientRect() : null; return r ? r.top : window.innerHeight; };
    // Ziel: wie viele andere Plätze liegen mit ihrer Mitte über der Mitte der gezogenen Zeile
    const target = () => {
      const g = slotDrag, others = rowsOf().filter(r => r !== g.row);
      const r = g.row.getBoundingClientRect(), mid = r.top + r.height / 2;
      let t = 0; others.forEach(o => { const q = o.getBoundingClientRect(); if (q.top + q.height / 2 < mid) t++; });
      const ref = others[Math.min(t, others.length - 1)], q = ref ? ref.getBoundingClientRect() : r;
      const y = t < others.length ? q.top - 2 : q.bottom + 1, list = box.querySelector(".zp-list") || box, lr = list.getBoundingClientRect();
      return { t, y, left: lr.left, width: lr.width };
    };
    const paint = () => {
      const g = slotDrag; if (!g) return;
      const dy = g.y - g.y0 + (window.scrollY - g.s0);
      g.row.style.transform = "translateY(" + dy + "px)";
      const tg = target(); g.to = tg.t;
      if (!line) { line = document.createElement("div"); line.className = "zp-drop"; document.body.appendChild(line); }
      line.style.top = tg.y + "px"; line.style.left = tg.left + "px"; line.style.width = tg.width + "px";
      line.hidden = tg.t === g.from;
      // die Karte zeigt die Uhrzeit des Platzes, an dem sie landen würde
      if (g.timeEl) g.timeEl.textContent = fmtHM(g.times[tg.t] != null ? g.times[tg.t] : g.times[g.from]);
    };
    const tick = () => {
      raf = 0; const g = slotDrag; if (!g) return;
      // am oberen bzw. unteren Rand (über der Leiste) mitrollen
      const top = 70, bot = bottomLimit() - 70;
      const v = g.y < top ? -Math.ceil((top - g.y) / 6) : g.y > bot ? Math.ceil((g.y - bot) / 6) : 0;
      if (v) window.scrollBy(0, v);
      paint();
      if (v) raf = requestAnimationFrame(tick);
    };
    const begin = (p) => {
      pend = null; if (!p.row.isConnected) return;
      if (typeof closeSwipe === "function") closeSwipe();
      const timeEl = p.row.querySelector(".zp-time");
      slotDrag = { row: p.row, from: slotIndexOf(p.row), to: slotIndexOf(p.row), y0: p.y, y: p.y, s0: window.scrollY, id: p.id,
        timeEl, timeTxt: timeEl ? timeEl.textContent : "", times: zeitTimes(derived()).meals };
      p.row.classList.add("dragging"); document.body.classList.add("slot-dragging");
      try { p.row.setPointerCapture(p.id); } catch (e) {} // Loslassen kommt auch außerhalb der Liste an
      try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
      swallow = true; paint();
    };
    const finish = (cancel) => {
      const g = slotDrag; slotDrag = null;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (line) { line.remove(); line = null; }
      document.body.classList.remove("slot-dragging");
      if (!g) return;
      g.row.classList.remove("dragging"); g.row.style.transform = "";
      if (g.timeEl) g.timeEl.textContent = g.timeTxt;
      if (!cancel && g.row.isConnected && g.to !== g.from) moveSlot(g.from, g.to);
    };
    box.addEventListener("pointerdown", (e) => {
      swallow = false;
      if (slotDrag || (e.pointerType === "mouse" && e.button !== 0)) return;
      const row = e.target.closest(".zp-row.slot");
      if (!row || !filled(row) || row === swipeOpen || e.target.closest("button, a, input, select, textarea, .tlink, .zp-del")) return;
      pend = { row, id: e.pointerId, x: e.clientX, y: e.clientY, mouse: e.pointerType === "mouse" };
      if (!pend.mouse) { const p = pend; pend.timer = setTimeout(() => { if (pend === p) begin(p); }, DRAG_HOLD); }
    });
    box.addEventListener("pointermove", (e) => {
      if (pend && e.pointerId === pend.id) {
        const dx = e.clientX - pend.x, dy = e.clientY - pend.y;
        if (pend.mouse) { if (Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx)) begin(pend); else if (Math.abs(dx) > 6) pend = null; }
        else if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { clearTimeout(pend.timer); pend = null; } // Scrollen oder Wisch statt Halten
      }
      if (slotDrag && e.pointerId === slotDrag.id) { slotDrag.y = e.clientY; paint(); if (!raf) raf = requestAnimationFrame(tick); }
    });
    const up = (e) => {
      if (pend && e.pointerId === pend.id) { clearTimeout(pend.timer); pend = null; }
      if (slotDrag && e.pointerId === slotDrag.id) finish(e.type === "pointercancel");
    };
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
    box.addEventListener("lostpointercapture", (e) => { if (slotDrag && e.pointerId === slotDrag.id) finish(false); });
    // Während des Ziehens nicht scrollen (Finger) und kein Kontextmenü; danach keinen Klick auslösen
    box.addEventListener("touchmove", (e) => { if (slotDrag) e.preventDefault(); }, { passive: false });
    box.addEventListener("contextmenu", (e) => { if (slotDrag || pend) e.preventDefault(); });
    box.addEventListener("click", (e) => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && slotDrag) finish(true); });
    box.addEventListener("keydown", (e) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const row = e.target.closest && e.target.closest(".zp-row.slot"); if (!row || !filled(row)) return;
      e.preventDefault();
      const i = slotIndexOf(row), to = i + (e.key === "ArrowUp" ? -1 : 1);
      if (to >= 0 && to < state.dayPlan.length) moveSlot(i, to, true);
    });
  }
  // Eine Mahlzeit leeren – mit „Rückgängig“ (aus der Auswahl heraus, „Leeren“, oder per Wisch).
  function clearSlot(i) {
    const prev = slotCopy(state.dayPlan[i]);
    if (planPick === i) planPick = null;
    state.dayPlan[i] = { key: null }; save(); renderHeute();
    showToast("Mahlzeit " + (i + 1) + " geleert", [["Rückgängig", () => { state.dayPlan[i] = prev; save(); renderHeute(); }]]);
  }
  // Hinweiszeile unter der Zeitleiste: „▲ …“, Warnung rot, Info grau.
  function hintLine(kind, html, title) { return '<div class="hint ' + kind + '"' + (title ? ' title="' + escapeHtml(title) + '"' : '') + '>▲ ' + html + '</div>'; }
  // Zutaten einer Portion für die Zeitleiste: kurze Namen (ohne Klammerzusatz, Marke, „ohne Haut“ …; roh/gekocht
  // bleibt, das ändert das Gewicht), Gramm ohne „,0“, Wasser in ml, das Öl als normale Zutat am Ende.
  function shortFood(n) {
    return String(n).replace(/\s*\(.*?\)/g, "").replace(/,/g, "")
      .replace(/\s+(Paediatric Nature Mix|Zubereitung|ohne Haut|ganz versprudelt|TK oder Frisch|NÖM)\b/g, "").replace(/\bBio-/g, "")
      .replace(/^HiPP\s+/, "").replace(/\s+/g, " ").trim();
  }
  const gramsShort = (g) => fmt(g, 1).replace(/,0$/, "") + "&nbsp;g";
  function ingItems(f) {
    const items = f.res.items.filter(it => num(it.grams) > 0);
    return items.filter(it => !isOilName(it.food)).concat(items.filter(it => isOilName(it.food)));
  }
  function ingRows(f) {
    return ingItems(f).map(it => {
      const water = it.food === "Wasser";
      return '<span class="it"><span class="n">' + escapeHtml(shortFood(it.food).replace(/\s*C8\+C10/, "")) + '</span><span class="g">' + (water ? fmt(num(it.grams), 0) + "&nbsp;ml" : gramsShort(num(it.grams))) + "</span></span>";
    }).join(" ");
  }

  // Am Handy soll der ganze Tag ohne Scrollen bis zur Navigation passen. Stufen vom großzügigsten zum knappsten:
  // „roomy“ = Zutaten als Tabelle (eine je Zeile, wie im Entwurf) · Grundstufe = Zutaten in zwei Spalten ·
  // „tight“ = Zutaten fortlaufend in einer Zeile, alles etwas enger. Die erste Stufe, die passt, gilt; passt nicht
  // einmal „tight“ (sehr kleiner Bildschirm), darf gescrollt werden. Am Desktop immer „roomy more“.
  function fitHeute() {
    const box = document.getElementById("heute-content"), list = box && box.querySelector(".zp-list");
    const zp = box && box.querySelector(".zeitplan"), tab = document.querySelector(".tabbar");
    if (!list || !zp || !tab) return;
    const LV = ["roomy", "more", "tight"];
    zp.classList.remove("tight"); document.body.classList.remove("heute-tight");
    list.classList.remove.apply(list.classList, LV);
    if (!box.offsetParent) return;
    if (window.innerWidth > 820 || getComputedStyle(tab).position !== "fixed") { list.classList.add("roomy", "more"); return; }
    const spare = () => tab.getBoundingClientRect().top - (zp.getBoundingClientRect().bottom + (window.scrollY || 0)) - 8;
    const steps = [["roomy"], [], ["tight"]];
    for (const st of steps) {
      if (st.length) list.classList.add.apply(list.classList, st);
      zp.classList.toggle("tight", st[0] === "tight");
      document.body.classList.toggle("heute-tight", st[0] === "tight");
      if (spare() >= 0) break;
      if (st[0] === "tight") break;
      if (st.length) list.classList.remove.apply(list.classList, st);
    }
  }

  // Neu einpassen, sobald sich der verfügbare Platz ändert. Am iPhone (installierte App) stehen Statusleiste,
  // Home-Balken-Abstand (safe-area) und Fensterhöhe beim Start oft noch nicht fest und ändern sich ohne
  // „resize“ – daher zusätzlich: Größe von Tab-Leiste und Kopf beobachten, sichtbare Fensterhöhe, Rückkehr
  // in die App, geladene Schriften und zwei verzögerte Nachkontrollen.
  let fitQueued = false;
  function queueFitHeute() {
    if (fitQueued) return; fitQueued = true;
    const run = () => { fitQueued = false; fitHeute(); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run); else setTimeout(run, 16);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("resize", queueFitHeute);
    window.addEventListener("orientationchange", () => setTimeout(queueFitHeute, 300));
    window.addEventListener("pageshow", queueFitHeute);
    window.addEventListener("load", () => { queueFitHeute(); setTimeout(queueFitHeute, 400); setTimeout(queueFitHeute, 1500); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { queueFitHeute(); setTimeout(queueFitHeute, 400); } });
    if (window.visualViewport) window.visualViewport.addEventListener("resize", queueFitHeute);
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueFitHeute); } catch (e) {}
    document.addEventListener("DOMContentLoaded", () => {
      if (typeof ResizeObserver !== "function") return;
      const ro = new ResizeObserver(queueFitHeute);
      // unsichtbarer Platzhalter in Fenstergröße: meldet jede Änderung der Fensterhöhe
      const vp = document.createElement("div"); vp.className = "vp-probe"; vp.setAttribute("aria-hidden", "true"); document.body.appendChild(vp);
      [".tabbar", "header", ".vp-probe"].forEach(sel => { const el = document.querySelector(sel); if (el) { try { ro.observe(el, { box: "border-box" }); } catch (e) { ro.observe(el); } } });
    });
    // Letzte Sicherung: lässt sich Heute am Handy trotzdem scrollen, ist die gewählte Stufe zu groß – neu einpassen.
    window.addEventListener("scroll", () => {
      if (document.body.getAttribute("data-view") !== "heute" || window.innerWidth > 820) return;
      const zp = document.querySelector("#heute-content .zeitplan");
      if (zp && !zp.classList.contains("tight") && document.documentElement.scrollHeight > window.innerHeight + 2) queueFitHeute();
    }, { passive: true });
  }
  // Rezept-Auswahl für einen Slot (Overlay mit Suche)
  let pickerSlot = -1;
  function openPicker(i) {
    pickerSlot = i;
    const ov = document.getElementById("picker-overlay"), q = document.getElementById("picker-search");
    if (!ov) return;
    q.value = ""; renderPicker();
    // Kopf: „Rezept für 12:15“, rechts „Leeren“ (nur wenn die Mahlzeit belegt ist)
    const d = derived(), times = zeitTimes(d), ti = document.getElementById("picker-title"), cl = document.getElementById("picker-clear");
    if (ti) ti.textContent = times.meals[i] != null ? "Rezept für " + fmtHM(times.meals[i]) : "Rezept wählen";
    if (cl) cl.hidden = !(state.dayPlan[i] && state.dayPlan[i].key);
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
      .filter(x => !state.settings.onlyKeto || state.settings.hideKeto || x.rec.ketocal)
      .filter(x => !isHidden(x.rec))
      .filter(x => !q || (x.rec.name + " " + x.fam.name).toLowerCase().indexOf(q) !== -1 || hitItems(x.rec))
      .map(x => Object.assign(x, { res: computeAdjustedRecipe(x.rec, d.kcalMahl, d.ratio) })).filter(x => x.res.ok)
      .map(x => Object.assign(x, { res: computeMealView(x.rec, d, null).res }))
      .sort((a, b) => { const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1; if (fa !== fb) return fa - fb; return a.fam.name.localeCompare(b.fam.name, "de") || ((a.rec.ketocal ? 1 : 0) - (b.rec.ketocal ? 1 : 0)); });
    // Zeile: Name (★ bei Favorit), darunter Mono „Gruppe · Basis · kcal · ml · Eiweiß“ (Eiweiß rot, wenn außerhalb).
    list.innerHTML = recs.map(x => {
      const s = sumMacros(x.res.items), vol = volumeMl(x.res.items);
      const big = d.maxMahlMl > 0 && vol > d.maxMahlMl + 0.5, ps = proteinState(s.eiweiss, d.eiweissMahl);
      return '<button type="button" class="pick-row" data-key="' + escapeHtml(recipeKey(x.rec)) + '">' +
        '<span class="pick-name">' + displayHtml(x.rec) + (isFav(x.rec) ? " ★" : "") + '</span>' +
        '<span class="pick-meta">' + escapeHtml(groupLabel(x.rec)) + " · " + fmt(s.kcal, 0) + ' kcal · <span class="pick-vol' + (big ? ' big' : '') + '">' + (big ? '▲ ' : '≈ ') + fmt(vol, 0) + ' ml</span>' +
          ' · <b class="pick-prot' + (ps === "ok" ? "" : " warn") + '">Eiweiß ' + fmt(s.eiweiss) + " g" + (ps === "high" ? " · hoch" : ps === "low" ? " · niedrig" : "") + "</b></span></button>";
    }).join("") || '<div class="empty">Kein Gericht gefunden.</div>';
    list.querySelectorAll(".pick-row").forEach(b => b.addEventListener("click", () => {
      // Anderes Rezept: die eigenen Änderungen der Mahlzeit fallen weg (dasselbe Rezept behält sie)
      if (pickerSlot >= 0) { ensureDayPlan(derived()); const old = state.dayPlan[pickerSlot]; state.dayPlan[pickerSlot] = old && old.key === b.dataset.key ? old : { key: b.dataset.key }; save(); }
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
    const pc = document.getElementById("picker-clear");
    if (pc) pc.addEventListener("click", () => { const i = pickerSlot; closePicker(); if (i >= 0) clearSlot(i); });
    ov.addEventListener("click", e => { if (e.target === ov) closePicker(); });
    document.getElementById("picker-search").addEventListener("input", renderPicker);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden && topLayer() === "picker-overlay") closePicker(); });
  }
  // Tagesplan zum Aufhängen oder Weitergeben: Zeitplan (Uhrzeit, Was, Menge, Dauer), Hinweise zum
  // Sondieren, Tagessummen und die Mahlzeiten im Detail fürs Team.
  // Tagesplan-Ausdruck als Küchenzettel: A6 im linken oberen Viertel einer A4-Seite (zweimal falten), unten 2,5 cm frei
  // zum Einstecken, ohne Datum (der Plan gilt meist mehrere Tage). Oben der Zeitplan (Uhrzeit, Rezept bzw. Wasser, Dauer,
  // Menge – je eine Zeile), darunter jedes Rezept nur einmal mit seinen Zutaten je Portion zum Abwiegen (zwei Spalten,
  // Gramm fett) und den Uhrzeiten, zu denen es gegeben wird. Die Schrift passt sich an (fitKitchenCard).
  function printDayPlan(d, facts) {
    const times = zeitTimes(d), dm = dayMeals(d), wp = waterPlan(d, dm.sum, times);
    const rows = [], groups = [];
    times.meals.forEach((t, i) => {
      const m = dm.meals[i], f = facts[i], note = slotNote(state.dayPlan[i], f);
      const w = m.rec ? "<span class='n'>" + escapeHtml(displayText(m.rec) + (note ? " · " + note : "")) + "</span> <i class='d'>" + sondierMin(m.vol) + " min</i>"
        : "<span class='n'>" + (m.bad ? escapeHtml(displayText(m.bad)) : "Rezept offen") + "</span> <i class='d'>" + (m.bad ? "passt nicht – anderes Rezept wählen" : "noch kein Rezept gewählt") + "</i>";
      rows.push({ t, h: "<div class='r me'><span class='t'>" + fmtHM(t) + "</span><span class='w'>" + w + "</span><span class='m'>" + (m.est ? "ca. " : "") + fmt(m.vol, 0) + " ml</span></div>" });
      if (!f) return;
      // gleiches Rezept mit gleichen Mengen nur einmal, mit allen Uhrzeiten
      const items = f.res.items.filter(it => num(it.grams) > 0).sort((a, b) => isOilName(a.food) - isOilName(b.food));
      const sig = f.rec.name + "|" + items.map(it => it.food + ":" + fmt(num(it.grams), 1)).join(",");
      const g = groups.find(x => x.sig === sig);
      const dn = displayName(f.rec);
      if (note) dn.suffix = (dn.suffix ? dn.suffix + " · " : "") + note;
      if (g) g.times.push(t); else groups.push({ sig, dn, items, times: [t] });
    });
    if (wp.per > 0) times.gifts.forEach(g => rows.push({ t: g.t, h: "<div class='r wa'><span class='t'>" + fmtHM(g.t) + "</span><span class='w'><span class='n'>Wasser</span> <i class='d'>" + (g.kind === "abend" ? "vor dem Schlafen · " : "") + wasserMin(wp.per) + " min</i></span><span class='m'>" + fmt(wp.per, 0) + " ml</span></div>" }));
    if (times.schlaf != null) rows.push({ t: times.schlaf, h: "<div class='r sl'><span class='t'>" + fmtHM(times.schlaf) + "</span><span class='w'><span class='n'>Schlafen</span></span><span class='m'></span></div>" });
    rows.sort((a, b) => a.t - b.t);
    // Rezeptname groß, Zusatz „· mit KetoCal“ klein und grau daneben (.rt hält beides links zusammen)
    const rez = groups.map(g => "<div class='rb'><div class='rn'><span class='rt'><b>" + escapeHtml(g.dn.name) + "</b>" + (g.dn.suffix ? "<span class='name-suffix'> · " + escapeHtml(g.dn.suffix) + "</span>" : "") + "</span> <i>" + g.times.map(fmtHM).join(" · ") + "</i></div><div class='z'>" +
      g.items.map(it => '<span class="i"><span>' + escapeHtml(shortFood(it.food).replace(/\s*C8\+C10/, "")) + "</span><b>" + (it.food === "Wasser" ? fmt(num(it.grams), 0) + " ml" : gramsShort(num(it.grams))) + "</b></span>").join("") + "</div></div>").join("");
    const html = "<!DOCTYPE html><html lang='de'><head><meta charset='utf-8'><title>Tagesplan</title><style>" + KITCHEN_CSS + "</style></head><body>" +
      "<div class='kz-page'><div class='kz'><div class='kz-h'><div class='ti'><small>HamHam Keto</small><b>Tagesplan</b></div>" +
      "<div class='rx'><span class='pill'>Verhältnis " + fmtTarget(d.ratio) + "</span><small>" + fmt(d.kcal, 0) + " kcal" + (d.fluidDay > 0 ? " · " + fmt(d.fluidDay, 0) + " ml" : "") + " pro Tag</small></div></div>" +
      "<div class='lbl'>Zeitplan</div>" + rows.map(r => r.h).join("") +
      (rez ? "<div class='lbl'>Zutaten je Portion</div>" + rez : "") + "</div>" +
      "<div class='kz-fold v'></div><div class='kz-fold h'></div></div></body></html>";
    openPrintView(html, "Tagesplan " + fileDate());
  }
