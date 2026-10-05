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
    renderHeader(d); // Kopf-Pille (Wassergaben) passt sich sofort an, z. B. nach ✕ oder neuem Rezept
    const times = zeitTimes(d), dm = dayMeals(d), wp = waterPlan(d, dm.sum, times);
    const tot = { kcal: 0, eiweiss: 0, fett: 0, kh: 0, mct: 0, raps: 0, fluid: 0, filled: 0 };
    const facts = [];
    const rows = [];
    state.dayPlan.forEach((slot, i) => {
      const t = times.meals[i], m = dm.meals[i], time = '<span class="zp-time">' + fmtHM(t) + '</span>';
      const rec = m.rec;
      if (m.bad) {
        facts.push(null);
        rows.push({ t, html: '<div class="zp-row meal slot empty-slot bad-slot" role="button" tabindex="0" data-pick="' + i + '" title="Dieses Rezept erreicht die Verordnung nicht – anderes Rezept wählen">' + time + '<span class="zp-ic">⚠️</span>' +
          '<span class="zp-txt"><span class="zp-name">' + escapeHtml(m.bad.name) + '</span><small class="prot-low">passt nicht zu ' + escapeHtml(fmtTarget(d.ratio)) + ' – <span class="zp-open">anderes Rezept wählen</span></small></span>' +
          '<button type="button" class="slot-act" data-clear="' + i + '" title="Entfernen" aria-label="Entfernen">✕</button></div>' });
        return;
      }
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
      // Erste Zeile: Uhrzeit · Rezept · Menge/Dauer · ↻ ✕. Darunter über die ganze Breite die Zutaten einer Portion
      // mit Gramm, das Öl als normale Zutat am Ende. Unter dem Namen nur, wenn das Eiweiß zu niedrig ist.
      const sub = proteinOk ? '' : '<span class="prot-low">Eiweiß nur ' + fmt(f.sum.eiweiss) + ' g</span>';
      rows.push({ t, html: '<div class="zp-row meal slot" role="button" tabindex="0" data-open="' + i + '" title="' + fmt(f.sum.kcal, 0) + ' kcal · Eiweiß ' + fmt(f.sum.eiweiss) + ' g' + (oilTxt ? ' · Öl: ' + oilTxt : '') + '">' + time + '<span class="zp-ic">' + (rec.icon || "🥑") + '</span>' +
        '<span class="zp-txt"><span class="zp-name">' + escapeHtml(rec.name) + pill + '</span>' + (sub ? '<small>' + sub + '</small>' : '') +
          '<small class="zp-more">' + fmt(f.sum.kcal, 0) + ' kcal · Eiweiß ' + fmt(f.sum.eiweiss) + ' g</small></span>' +
        (() => { const big = d.maxMahlMl > 0 && m.vol > d.maxMahlMl + 0.5; // über 25 ml/kg auf einmal → gelb markieren
          return '<span class="zp-vol' + (big ? ' big' : '') + '" title="' + (big ? 'mehr als ' + fmt(d.maxMahlMl, 0) + ' ml auf einmal (25 ml/kg) – mehr Mahlzeiten oder mit dem Team abklären · ' : '') + 'langsam sondieren, etwa ' + SONDIER_ML_MIN + ' ml pro Minute">' + (big ? '⚠️ ' : '≈ ') + fmt(m.vol, 0) + ' ml<small>' + sondierMin(m.vol) + ' min</small></span>'; })() +
        '<button type="button" class="slot-act" data-pick="' + i + '" title="Rezept ändern" aria-label="Rezept ändern">↻</button>' +
        '<button type="button" class="slot-act" data-clear="' + i + '" title="Entfernen" aria-label="Entfernen">✕</button>' +
        '<small class="zp-ing">' + ingLine(f) + '</small></div>' });
    });
    zeitplanExtraRows(times, wp).forEach(r => rows.push(r));
    rows.sort((a, b) => a.t - b.t);
    const ratioDay = (tot.eiweiss + tot.kh) > 0 ? tot.fett / (tot.eiweiss + tot.kh) : null;
    const share = tot.filled / d.mahl; // Anteil geplanter Mahlzeiten → Ziele anteilig
    const eiweissZiel = d.eiweiss * share, kcalZiel = d.kcal * share, kcalMinZiel = d.kcalMin * share, fluidZiel = d.fluidDay * share;
    const kcalLow = tot.kcal < kcalMinZiel - 0.5;
    // Kopf: Mahlzeiten × kcal und der Tagesrahmen; ⏰ klappt die Uhrzeiten auf, dazu Drucken und Leeren.
    // Mahlzeiten × kcal stehen schon in der Kopfzeile (Pille) – hier nur der Rahmen des Tages.
    // Rahmen in zwei kurzen Zeilen (Zeitraum · Abstand), damit am Handy nichts abgeschnitten wird („alle 3 h …“).
    const head = '<div class="group-head day-head"><span class="day-title">📅 Heute</span> <span class="group-count"><span class="dh-range">' + fmtHM(times.meals[0]) + '–' + fmtHM(times.meals[times.meals.length - 1]) + '</span>' +
        (times.interval != null ? '<span class="dh-sep"> · </span><span class="dh-int">alle ' + fmtDauer(times.interval) + '</span>' : '') + '</span>' +
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
    // ✕ leert eine Mahlzeit – mit „Rückgängig“ wie beim Leeren des ganzen Plans
    box.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const i = num(b.dataset.clear), prev = state.dayPlan[i] ? state.dayPlan[i].key : null;
      state.dayPlan[i] = { key: null }; save(); renderHeute();
      showToast("✕ Mahlzeit " + (i + 1) + " entfernt", [["Rückgängig", () => { state.dayPlan[i] = { key: prev }; save(); renderHeute(); }]]);
    }));
    const pd = box.querySelector("#print-day"); if (pd) pd.addEventListener("click", () => printDayPlan(d, facts));
    const cd = box.querySelector("#clear-day");
    if (cd) cd.addEventListener("click", () => {
      if (!state.dayPlan.some(sl => sl && sl.key)) return;
      const prev = state.dayPlan.map(sl => ({ key: sl ? sl.key : null }));
      state.dayPlan = state.dayPlan.map(() => ({ key: null })); save(); renderRezepte();
      showToast("🗑️ Tagesplan geleert", [["Rückgängig", () => { state.dayPlan = prev; save(); renderRezepte(); }]]);
    });
    fitHeute();
  }
  // Am Handy füllt der Tag den Bildschirm bis zur Tab-Leiste: Bleibt Platz (z. B. bei 4 statt 5 Mahlzeiten
  // oder als installierte App), zeigt jede Mahlzeit zusätzlich ihre Zutaten mit Gramm und kcal/Eiweiß,
  // lange Rezeptnamen dürfen zweizeilig werden, der Rest verteilt sich als Höhe (Mahlzeiten mehr als Wasser). Reicht der Platz nicht, bleibt die kompakte Darstellung.
  // Zutaten einer Portion für die Zeitleiste: kurze Namen (ohne Klammerzusatz, Marke, „ohne Haut“ …; roh/gekocht
  // bleibt, das ändert das Gewicht), Gramm ohne „,0“, das Öl als normale Zutat am Ende („Rapsöl 14,2 g · MCT-Öl 1,6 g“).
  function shortFood(n) {
    return String(n).replace(/\s*\(.*?\)/g, "").replace(/,/g, "")
      .replace(/\s+(Paediatric Nature Mix|Zubereitung|ohne Haut|ganz versprudelt|TK oder Frisch|NÖM)\b/g, "").replace(/\bBio-/g, "")
      .replace(/^HiPP\s+/, "").replace(/\s+/g, " ").trim();
  }
  const gramsShort = (g) => fmt(g, 1).replace(/,0$/, "") + "&nbsp;g";
  function ingLine(f) {
    const items = f.res.items.filter(it => num(it.grams) > 0);
    const ordered = items.filter(it => !isOilName(it.food)).concat(items.filter(it => isOilName(it.food)));
    return ordered.map(it => '<span class="nw">' + escapeHtml(shortFood(it.food).replace(/\s*C8\+C10/, "")) + "&nbsp;" + gramsShort(num(it.grams)) + "</span>").join(" · ");
  }

  function fitHeute() {
    const box = document.getElementById("heute-content"), list = box && box.querySelector(".zp-list");
    const zp = box && box.querySelector(".zeitplan"), tab = document.querySelector(".tabbar");
    if (!list || !zp || !tab) return;
    const LV = ["roomy", "more", "tight", "fill"];
    zp.classList.remove("tight"); document.body.classList.remove("heute-tight");
    list.classList.remove.apply(list.classList, LV); list.style.minHeight = "";
    if (!box.offsetParent) return;
    // Nach dem Festlegen der Stufe messen: Zutatenzeile über die ganze Breite, eingerückt bis zum Rezeptnamen;
    // Dauer der Wassergaben rechtsbündig in derselben Spalte wie die Dauer der Mahlzeiten.
    const indent = () => {
      const r0 = list.querySelector(".zp-row.meal .zp-txt");
      if (r0) {
        const row = r0.parentElement;
        list.style.setProperty("--ing-indent", Math.round(r0.getBoundingClientRect().left - row.getBoundingClientRect().left - (parseFloat(getComputedStyle(row).paddingLeft) || 0) - (row.clientLeft || 0)) + "px");
      }
      const vs = list.querySelector(".zp-row .zp-vol small"), wr = list.querySelector(".zp-row.water");
      if (vs && wr) list.style.setProperty("--wmin-r", Math.max(0, Math.round(wr.getBoundingClientRect().right - vs.getBoundingClientRect().right)) + "px");
    };
    // Desktop: Platz genug – kcal/Eiweiß immer zeigen
    if (window.innerWidth > 820 || getComputedStyle(tab).position !== "fixed") { list.classList.add("more"); indent(); return; }
    const spare = () => tab.getBoundingClientRect().top - (zp.getBoundingClientRect().bottom + (window.scrollY || 0)) - 12;
    // Stufen vom großzügigsten zum knappsten – die Zutaten stehen immer da. Die erste Stufe, die ohne Scrollen
    // bis zur Tab-Leiste passt, gilt; passt nicht einmal „tight“ (sehr kleiner Bildschirm), darf gescrollt werden.
    const steps = [["roomy", "more"], ["roomy"], [], ["tight"]];
    for (const st of steps) {
      if (st.length) list.classList.add.apply(list.classList, st);
      zp.classList.toggle("tight", st[0] === "tight");
      document.body.classList.toggle("heute-tight", st[0] === "tight"); // Kopf-Pille ohne die Wasserzeile (steht in der Zeitleiste)
      indent();
      if (spare() >= 0) break;
      if (st[0] === "tight") break;
      if (st.length) list.classList.remove.apply(list.classList, st);
    }
    const s = spare(), n = list.children.length;
    if (s > 4) { list.classList.add("fill"); list.style.minHeight = Math.round(list.offsetHeight + Math.min(s, n * 52)) + "px"; }
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
      const m = dm.meals[i], f = facts[i];
      const w = m.rec ? "<span class='n'>" + escapeHtml(m.rec.name) + "</span> <i class='d'>" + sondierMin(m.vol) + " min</i>"
        : "<span class='n'>" + (m.bad ? escapeHtml(m.bad.name) : "Rezept offen") + "</span> <i class='d'>" + (m.bad ? "passt nicht – anderes Rezept wählen" : "noch kein Rezept gewählt") + "</i>";
      rows.push({ t, h: "<div class='r me'><span class='t'>" + fmtHM(t) + "</span><span class='w'>" + w + "</span><span class='m'>" + (m.est ? "ca. " : "") + fmt(m.vol, 0) + " ml</span></div>" });
      if (!f) return;
      // gleiches Rezept mit gleichen Mengen nur einmal, mit allen Uhrzeiten
      const items = f.res.items.filter(it => num(it.grams) > 0).sort((a, b) => isOilName(a.food) - isOilName(b.food));
      const sig = f.rec.name + "|" + items.map(it => it.food + ":" + fmt(num(it.grams), 1)).join(",");
      const g = groups.find(x => x.sig === sig);
      if (g) g.times.push(t); else groups.push({ sig, name: f.rec.name, items, times: [t] });
    });
    if (wp.per > 0) times.gifts.forEach(g => rows.push({ t: g.t, h: "<div class='r wa'><span class='t'>" + fmtHM(g.t) + "</span><span class='w'><span class='n'>Wasser</span> <i class='d'>" + (g.kind === "abend" ? "vor dem Schlafen · " : "") + wasserMin(wp.per) + " min</i></span><span class='m'>" + fmt(wp.per, 0) + " ml</span></div>" }));
    if (times.schlaf != null) rows.push({ t: times.schlaf, h: "<div class='r sl'><span class='t'>" + fmtHM(times.schlaf) + "</span><span class='w'><span class='n'>Schlafen</span></span><span class='m'></span></div>" });
    rows.sort((a, b) => a.t - b.t);
    const rez = groups.map(g => "<div class='rb'><div class='rn'><b>" + escapeHtml(g.name) + "</b> <i>" + g.times.map(fmtHM).join(" · ") + "</i></div><div class='z'>" +
      g.items.map(it => '<span class="i"><span>' + escapeHtml(shortFood(it.food).replace(/\s*C8\+C10/, "")) + "</span><b>" + gramsShort(num(it.grams)) + "</b></span>").join("") + "</div></div>").join("");
    const html = "<!DOCTYPE html><html lang='de'><head><meta charset='utf-8'><title>Tagesplan</title><style>" + KITCHEN_CSS + "</style></head><body>" +
      "<div class='kz-page'><div class='kz'><div class='kz-h'><b>Tagesplan</b></div>" + rows.map(r => r.h).join("") +
      (rez ? "<div class='kz-s'>Zutaten je Portion</div>" + rez : "") + "</div>" +
      "<div class='kz-fold v'></div><div class='kz-fold h'></div></div></body></html>";
    openPrintView(html, "Tagesplan " + fileDate());
  }
