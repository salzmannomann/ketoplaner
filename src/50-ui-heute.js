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
      // Erste Zeile: Uhrzeit · Rezept · Menge/Dauer · ↻ ✕. Darunter über die ganze Breite die Zutaten einer Portion
      // mit Gramm und am Ende das Öl vor dem Füttern (🧈). Unter dem Namen nur, wenn das Eiweiß zu niedrig ist.
      const sub = proteinOk ? '' : '<span class="prot-low">Eiweiß nur ' + fmt(f.sum.eiweiss) + ' g</span>';
      rows.push({ t, html: '<div class="zp-row meal slot" role="button" tabindex="0" data-open="' + i + '" title="' + fmt(f.sum.kcal, 0) + ' kcal · Eiweiß ' + fmt(f.sum.eiweiss) + ' g' + (oilTxt ? ' · Öl vor dem Füttern: ' + oilTxt : '') + '">' + time + '<span class="zp-ic">' + (rec.icon || "🥑") + '</span>' +
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
    fitHeute();
  }
  // Am Handy füllt der Tag den Bildschirm bis zur Tab-Leiste: Bleibt Platz (z. B. bei 4 statt 5 Mahlzeiten
  // oder als installierte App), zeigt jede Mahlzeit zusätzlich ihre Zutaten mit Gramm und kcal/Eiweiß,
  // lange Rezeptnamen dürfen zweizeilig werden, der Rest verteilt sich als Höhe (Mahlzeiten mehr als Wasser). Reicht der Platz nicht, bleibt die kompakte Darstellung.
  // Zutaten einer Portion für die Zeitleiste: kurze Namen (ohne Klammerzusatz, Marke, „ohne Haut“ …; roh/gekocht
  // bleibt, das ändert das Gewicht), Gramm ohne „,0“, danach das Öl vor dem Füttern („🧈 Raps 14,2 g + MCT 1,6 g“).
  function shortFood(n) {
    return String(n).replace(/\s*\(.*?\)/g, "").replace(/,/g, "")
      .replace(/\s+(Paediatric Nature Mix|Zubereitung|ohne Haut|ganz versprudelt|TK oder Frisch|NÖM)\b/g, "").replace(/\bBio-/g, "")
      .replace(/^HiPP\s+/, "").replace(/\s+/g, " ").trim();
  }
  const gramsShort = (g) => fmt(g, 1).replace(/,0$/, "") + "&nbsp;g";
  function ingLine(f) {
    const ing = f.res.items.filter(it => !isOilName(it.food) && num(it.grams) > 0)
      .map(it => '<span class="nw">' + escapeHtml(shortFood(it.food)) + "&nbsp;" + gramsShort(num(it.grams)) + "</span>").join(" · ");
    const oil = f.hasOil ? f.oils.map(o => escapeHtml(String(o.food).replace(/^MCT.*$/, "MCT").replace(/öl$/i, "")) + "&nbsp;" + gramsShort(num(o.grams))).join(" + ") : "";
    return ing + (oil ? ' · <span class="zp-oil nw" title="erst vor dem Füttern einrühren">🧈&nbsp;' + oil + "</span>" : "");
  }
  function fitHeute() {
    const box = document.getElementById("heute-content"), list = box && box.querySelector(".zp-list");
    const zp = box && box.querySelector(".zeitplan"), tab = document.querySelector(".tabbar");
    if (!list || !zp || !tab) return;
    const LV = ["roomy", "more", "tight", "fill"];
    zp.classList.remove("tight"); document.body.classList.remove("heute-tight");
    list.classList.remove.apply(list.classList, LV); list.style.minHeight = "";
    if (!box.offsetParent) return;
    // Zutatenzeile über die ganze Breite, eingerückt bis zum Rezeptnamen (nach dem Festlegen der Stufe messen)
    const indent = () => {
      const r0 = list.querySelector(".zp-row.meal .zp-txt"); if (!r0) return;
      const row = r0.parentElement;
      list.style.setProperty("--ing-indent", Math.round(r0.getBoundingClientRect().left - row.getBoundingClientRect().left - (parseFloat(getComputedStyle(row).paddingLeft) || 0) - (row.clientLeft || 0)) + "px");
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
    // Mahlzeiten im Detail: je Rezept ein Block mit den Zutaten einer Portion (zwei Spalten), gleiche
    // Mahlzeiten zusammengefasst („Mahlzeit 3 + 4“), darunter Abfüllen und Öl vor dem Füttern.
    const isOilD = isOilName;
    const groups = [];
    facts.forEach((f, i) => {
      if (!f) return;
      const sig = f.rec.name + "|" + f.res.items.map(it => it.food + ":" + fmt(num(it.grams), 1)).join(",");
      const g = groups.find(x => x.sig === sig);
      if (g) g.nums.push(i + 1); else groups.push({ sig, f, nums: [i + 1] });
    });
    const open = facts.map((f, i) => f ? 0 : i + 1).filter(Boolean);
    const blocks = groups.map(({ f, nums }) => {
      const ing = f.res.items.filter(it => !isOilD(it.food) && num(it.grams) > 0);
      const cell = (it) => it ? "<td class='ing'>" + escapeHtml(it.food) + "</td><td class='num g'>" + fmt(num(it.grams), 1) + " g</td>" : "<td class='ing'></td><td class='num g'></td>";
      let rows = "";
      for (let k = 0; k < ing.length; k += 2) rows += "<tr>" + cell(ing[k]) + cell(ing[k + 1]) + "</tr>";
      const hi = proteinState(f.sum.eiweiss, d.eiweissMahl) === "high";
      return "<tr class='grp'><td colspan='4'><b>Mahlzeit " + nums.join(" + ") + " · " + escapeHtml(f.rec.name) + "</b> " +
        "<small>" + fmt(f.sum.kcal, 0) + " kcal · Eiweiß " + fmt(f.sum.eiweiss) + " g" + (hi ? " (hoch)" : "") + " · Fett " + fmt(f.sum.fett) + " g · KH " + fmt(f.sum.kh) + " g · Verhältnis " + fmtRatio(f.ratio, 2) + "</small></td></tr>" +
        rows +
        "<tr class='ft'><td colspan='4'>" + (f.rec.angeruehrt ? "Alles zusammen anrühren: ca. " + fmt(f.mlNoOil, 0) + " ml" : "Abfüllen ohne Öl: ca. " + fmt(f.gNoOil, 0) + " g / " + fmt(f.mlNoOil, 0) + " ml") +
        (f.hasOil ? " · <b>vor dem Füttern einrühren:</b> " + oilTxtOf(f) : "") + "</td></tr>";
    }).join("");
    const oilDay = [tot.raps > 0 ? "Rapsöl " + fmt(tot.raps, 1) + " g" : "", tot.mct > 0 ? "MCT-Öl " + fmt(tot.mct, 1) + " g" : ""].filter(Boolean).join(" + ");
    const detail = tot.filled
      ? "<h2>Mahlzeiten im Detail <small>· Zutaten je Portion</small></h2><table class='meals'><tbody>" + blocks +
        (open.length ? "<tr class='grp'><td colspan='4'><b>Mahlzeit " + open.join(" + ") + "</b> <small>noch kein Rezept gewählt</small></td></tr>" : "") +
        "</tbody></table>" +
        (oilDay ? "<p class='note'><b>Öl für den ganzen Tag:</b> " + oilDay + "</p>" : "")
      : "";
    const rx = "<p class='rx'>Verordnung " + fmtTarget(d.ratio) + " · " + fmt(d.kcal, 0) + " kcal/Tag (" + d.mahl + " × " + fmt(d.kcalMahl, 0) + " kcal) · Eiweiß-Ziel " + fmt(d.eiweiss, 0) + " g/Tag" +
      (d.fluidDay > 0 ? " · Flüssigkeit " + fmt(d.fluidDay, 0) + " ml/Tag" : "") + (d.mctShare > 0 ? " · MCT-Anteil " + Math.round(d.mctShare * 100) + " %" : "") + "</p>";
    const html = printDoc("Tagesplan", escapeHtml(printDateLong()), rx + zeit + sums + detail);
    openPrintView(html, "Tagesplan " + fileDate());
  }
