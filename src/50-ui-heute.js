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
          '<span class="zp-txt"><span class="zp-name">' + escapeHtml(m.bad.name) + '</span><span class="zp-warn">passt nicht zu ' + escapeHtml(fmtRx(d.ratio)) + ' – anderes Rezept wählen</span></span>' +
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
        '<div class="zp-main"><div class="zp-head"><span class="zp-txt"><span class="zp-name">' + escapeHtml(rec.name) + '</span>' +
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
    // Werkzeugzeile: Rahmen des Tages links, rechts Textlinks Uhrzeiten · Drucken · Leeren (rot)
    const tools = '<div class="day-tools"><span class="dt-range">' + fmtHM(times.meals[0]) + '–' + fmtHM(times.meals[times.meals.length - 1]) +
        (times.interval != null ? ' · alle ' + fmtDauer(times.interval) : '') + '</span>' +
      link("Uhrzeiten", 'id="zp-toggle" aria-expanded="' + (zpEdit ? "true" : "false") + '" title="Uhrzeiten einstellen"', zpEdit ? "open" : "") +
      link("Drucken", 'id="print-day" title="Tagesplan drucken"') +
      link("Leeren", 'id="clear-day" title="Tagesplan leeren"', "danger") + '</div>';
    // Tagessumme in einer Mono-Zeile: Wert fett, Ziel grau (Ziel = ganzer Tag); Warnzustand → Wert rot.
    // Flüssigkeit = ganzer Tag laut Zeitplan (Mahlzeiten + Wassergaben); „ca.“, wenn offene Mahlzeiten geschätzt sind.
    const est = dm.known < d.mahl;
    const pst = tot.filled ? proteinState(tot.eiweiss, eiweissZiel) : "ok";
    const stat = (cls, v, goal, title) => '<span class="dstat' + (cls ? " " + cls : "") + '"' + (title ? ' title="' + title + '"' : '') + '><b class="v">' + v + '</b> ' + goal + '</span>';
    const sums = '<div class="day-sum" id="day-sums">' +
      stat(kcalLow ? "warn" : "", fmt(tot.kcal, 0), "/ " + fmt(d.kcal, 0) + " kcal", "Ziel " + fmt(d.kcalMahl * Math.max(1, tot.filled), 0) + " kcal für " + tot.filled + " geplante Mahlzeit" + (tot.filled === 1 ? "" : "en") + " · mindestens " + fmt(kcalMinZiel, 0)) +
      stat(pst === "ok" ? "" : "warn", fmt(tot.eiweiss) + " g", "/ " + fmt(d.eiweiss, 0) + " g", pst === "high" ? "mehr als das Doppelte des Eiweiß-Ziels" : pst === "low" ? "unter dem Eiweiß-Ziel" : "Eiweiß") +
      (d.fluidDay > 0 ? stat(wp.total < d.fluidDay - 15 ? "warn" : "", (est ? "ca. " : "") + fmt(wp.total, 0), "/ " + fmt(d.fluidDay, 0) + " ml",
        "Mahlzeiten " + fmt(dm.sum, 0) + " ml" + (wp.per > 0 ? " + Wasser " + wp.n + " × " + fmt(wp.per, 0) + " ml" : "") + (est ? " · offene Mahlzeiten geschätzt" : "")) : "") +
      (tot.filled && ratioClass(ratioDay, d.ratio) !== "ok" ? stat("warn", fmtRxA(ratioDay, 2), "", "Verhältnis des Tages · Ziel " + fmtRx(d.ratio)) : "") +
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
    box.innerHTML = '<div class="zeitplan">' + sums + tools + zeitplanSettings(times) +
      '<div class="zp-list day-slots">' + rows.map(r => r.html).join("") + '</div>' +
      (notes ? '<div class="zp-hints">' + notes + '</div>' : "") + '</div>';
    bindZeitplan(box);
    box.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); openPicker(num(b.dataset.pick)); }));
    box.querySelectorAll("[data-open]").forEach(b => {
      const open = () => { const r = recipeByKey(state.dayPlan[num(b.dataset.open)].key); if (r) openRecipeDetail(r); };
      b.addEventListener("click", open);
      b.addEventListener("keydown", e => { if (e.target !== b) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    box.querySelectorAll(".empty-slot[data-pick]").forEach(b => b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(num(b.dataset.pick)); } }));
    const pd = box.querySelector("#print-day"); if (pd) pd.addEventListener("click", () => printDayPlan(d, facts));
    const cd = box.querySelector("#clear-day");
    if (cd) cd.addEventListener("click", () => {
      if (!state.dayPlan.some(sl => sl && sl.key)) return;
      const prev = state.dayPlan.map(sl => ({ key: sl ? sl.key : null }));
      state.dayPlan = state.dayPlan.map(() => ({ key: null })); save(); renderRezepte();
      showToast("Tagesplan geleert", [["Rückgängig", () => { state.dayPlan = prev; save(); renderRezepte(); }]]);
    });
    fitHeute();
  }
  // Eine Mahlzeit leeren – mit „Rückgängig“ (aus der Auswahl heraus, „Leeren“).
  function clearSlot(i) {
    const prev = state.dayPlan[i] ? state.dayPlan[i].key : null;
    state.dayPlan[i] = { key: null }; save(); renderHeute();
    showToast("Mahlzeit " + (i + 1) + " geleert", [["Rückgängig", () => { state.dayPlan[i] = { key: prev }; save(); renderHeute(); }]]);
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
      .filter(x => !q || x.fam.name.toLowerCase().indexOf(q) !== -1 || hitItems(x.rec))
      .map(x => Object.assign(x, { res: computeAdjustedRecipe(x.rec, d.kcalMahl, d.ratio) })).filter(x => x.res.ok)
      .map(x => Object.assign(x, { res: computeMealView(x.rec, d, null).res }))
      .sort((a, b) => { const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1; if (fa !== fb) return fa - fb; return a.fam.name.localeCompare(b.fam.name, "de") || ((a.rec.ketocal ? 1 : 0) - (b.rec.ketocal ? 1 : 0)); });
    // Zeile: Name (★ bei Favorit), darunter Mono „Gruppe · Basis · kcal · ml · Eiweiß“ (Eiweiß rot, wenn außerhalb).
    list.innerHTML = recs.map(x => {
      const s = sumMacros(x.res.items), vol = volumeMl(x.res.items);
      const big = d.maxMahlMl > 0 && vol > d.maxMahlMl + 0.5, ps = proteinState(s.eiweiss, d.eiweissMahl);
      return '<button type="button" class="pick-row" data-key="' + escapeHtml(recipeKey(x.rec)) + '">' +
        '<span class="pick-name">' + escapeHtml(x.fam.name) + (isFav(x.rec) ? " ★" : "") + '</span>' +
        '<span class="pick-meta">' + escapeHtml(groupLabel(x.rec)) + ((x.rec.ketocal || isMulti(x.rec)) ? " · " + escapeHtml(basisLabel(x.rec)) : "") + " · " + fmt(s.kcal, 0) + ' kcal · <span class="pick-vol' + (big ? ' big' : '') + '">' + (big ? '▲ ' : '≈ ') + fmt(vol, 0) + ' ml</span>' +
          ' · <b class="pick-prot' + (ps === "ok" ? "" : " warn") + '">Eiweiß ' + fmt(s.eiweiss) + " g" + (ps === "high" ? " · hoch" : ps === "low" ? " · niedrig" : "") + "</b></span></button>";
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
    const pc = document.getElementById("picker-clear");
    if (pc) pc.addEventListener("click", () => { const i = pickerSlot; closePicker(); if (i >= 0) clearSlot(i); });
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
      "<div class='kz-page'><div class='kz'><div class='kz-h'><div class='ti'><small>HamHam Keto</small><b>Tagesplan</b></div>" +
      "<div class='rx'><span class='pill'>Verhältnis " + fmtTarget(d.ratio) + "</span><small>" + fmt(d.kcal, 0) + " kcal" + (d.fluidDay > 0 ? " · " + fmt(d.fluidDay, 0) + " ml" : "") + " pro Tag</small></div></div>" +
      "<div class='lbl'>Zeitplan</div>" + rows.map(r => r.h).join("") +
      (rez ? "<div class='lbl'>Zutaten je Portion</div>" + rez : "") + "</div>" +
      "<div class='kz-fold v'></div><div class='kz-fold h'></div></div></body></html>";
    openPrintView(html, "Tagesplan " + fileDate());
  }
