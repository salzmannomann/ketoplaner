  /* ---------- Wischen in der Rezeptliste: links = nächste Gruppe, rechts = vorige ----------
     Drücken und Ziehen im Bereich der Rezepte (Finger oder Maus) wechselt den Gruppen-Chip, so wie die
     Reiter in der Detailansicht. Beim Ziehen wandert die Markierung schon in der Chip-Zeile mit (der alte
     Chip blasst aus, der nächste färbt sich ein, die Zeile rollt nach), die Liste zieht mit und blendet ab.
     Beim Loslassen läuft die Bewegung durch: die alte Liste gleitet hinaus, die neue von der anderen Seite
     herein. Senkrechtes Wischen bleibt Scrollen; nach einem Zug löst der folgende Klick keine Kachel aus. */
  function chipScrollTarget(fb, chip) {
    return Math.max(0, Math.min(fb.scrollWidth - fb.clientWidth, chip.offsetLeft - (fb.clientWidth - chip.offsetWidth) / 2));
  }
  function stepFilter(dir) {
    const cur = FILTERS.findIndex(f => f.id === state.settings.filter);
    const i = Math.min(FILTERS.length - 1, Math.max(0, (cur < 0 ? 0 : cur) + dir));
    if (i === (cur < 0 ? 0 : cur)) return false;
    state.settings.filter = FILTERS[i].id; save();
    const list = document.getElementById("recipe-list");
    renderRezepte();
    // Steht die Liste weiter unten, an den Anfang der neuen Gruppe springen (Chip-Zeile bleibt sichtbar).
    const bar = document.querySelector("#view-rezepte .listbar");
    const top = (bar ? bar.getBoundingClientRect().top : list.getBoundingClientRect().top) + window.scrollY - 8;
    if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
    return true;
  }
  function bindFilterSwipe() {
    const list = document.getElementById("recipe-list"), fb = document.getElementById("filter-bar");
    if (!list || !fb || list.dataset.swipe) return;
    list.dataset.swipe = "1";
    const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let x0 = 0, y0 = 0, t0 = 0, active = false, horiz = null, dragged = false, busy = false;
    let dir = 0, curChip = null, nextChip = null, s0 = 0, s1 = 0, scrollable = false;
    const chips = () => [...fb.querySelectorAll(".chip")];
    const setHl = (chip, v) => { if (chip) { chip.classList.add("hl"); chip.style.setProperty("--hl", String(Math.max(0, Math.min(1, v)))); } };
    const settle = (chip, v) => { if (chip) { chip.classList.add("settle"); setHl(chip, v); } };
    const clearHl = () => chips().forEach(c => { c.classList.remove("hl", "settle"); c.style.removeProperty("--hl"); });
    // Fortschritt 0..1: nach gut einem Drittel der Breite ist der Wechsel „voll“
    const prog = (dx) => Math.min(1, Math.abs(dx) / Math.max(120, Math.min(240, list.clientWidth * 0.4)));
    const shift = () => Math.round(Math.max(120, list.clientWidth * 0.3));
    const pick = (d) => {
      const cur = FILTERS.findIndex(f => f.id === state.settings.filter);
      const all = chips();
      dir = d; curChip = all[cur < 0 ? 0 : cur] || null; nextChip = all[(cur < 0 ? 0 : cur) + d] || null;
      scrollable = fb.clientWidth > 0 && fb.scrollWidth > fb.clientWidth;
      if (scrollable && curChip && nextChip) { s0 = fb.scrollLeft; s1 = chipScrollTarget(fb, nextChip); }
    };
    const start = (e) => {
      if (busy || (e.button != null && e.button !== 0)) return;
      x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); active = true; horiz = null; dragged = false; dir = 0;
      list.style.transition = "none";
    };
    const move = (e) => {
      if (!active) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (horiz === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) horiz = Math.abs(dx) > Math.abs(dy) * 1.3;
      if (!horiz) { list.style.transform = ""; return; }
      dragged = true;
      const d = dx < 0 ? 1 : -1;
      if (d !== dir) { if (dir) { setHl(curChip, 1); setHl(nextChip, 0); } pick(d); }
      const blocked = !nextChip, p = blocked ? 0 : prog(dx);
      // Liste zieht mit und blendet ab; am Rand (keine weitere Gruppe) nur ein kurzer Widerstand
      list.style.transform = "translateX(" + Math.round(dx * (blocked ? 0.1 : 0.5)) + "px)";
      list.style.opacity = blocked ? "" : String(1 - 0.5 * p);
      // Markierung und Chip-Zeile wandern proportional mit
      setHl(curChip, 1 - p); setHl(nextChip, p);
      if (scrollable && nextChip) fb.scrollLeft = s0 + (s1 - s0) * p;
      if (e.cancelable && e.type === "touchmove") e.preventDefault();
    };
    const finish = (d) => {
      const w = shift(), tOut = reduced() ? 0 : 150, tIn = reduced() ? 0 : 220;
      busy = true;
      // 1) alte Liste gleitet aus dem Bild, Markierung wandert fertig, Chip-Zeile rollt nach
      list.style.transition = tOut ? "transform " + tOut + "ms ease-in, opacity " + tOut + "ms ease-in" : "none";
      list.style.transform = "translateX(" + (-d * w) + "px)"; list.style.opacity = "0.15";
      settle(curChip, 0); settle(nextChip, 1);
      if (scrollable && nextChip) { if (fb.scrollTo) fb.scrollTo({ left: s1, behavior: tOut ? "smooth" : "auto" }); else fb.scrollLeft = s1; }
      setTimeout(() => {
        // 2) neue Gruppe rendern und von der anderen Seite hereingleiten lassen
        stepFilter(d);
        list.style.transition = "none";
        list.style.transform = "translateX(" + (d * w) + "px)"; list.style.opacity = "0.15";
        void list.offsetWidth;
        list.style.transition = tIn ? "transform " + tIn + "ms cubic-bezier(.2,.7,.3,1), opacity " + tIn + "ms ease-out" : "none";
        list.style.transform = ""; list.style.opacity = "";
        setTimeout(() => { list.style.transition = ""; busy = false; }, tIn + 20);
      }, tOut);
    };
    const cancel = () => {
      list.style.transition = ""; list.style.transform = ""; list.style.opacity = "";
      settle(curChip, 1); settle(nextChip, 0);
      setTimeout(clearHl, 220);
    };
    const end = (e) => {
      if (!active) return; active = false;
      const dx = e.clientX - x0, dy = e.clientY - y0, dt = Date.now() - t0;
      if (!horiz) { list.style.transition = ""; list.style.transform = ""; list.style.opacity = ""; return; }
      const flick = dt < 300 && Math.abs(dx) > 30;
      const go = (Math.abs(dx) > 60 || flick) && Math.abs(dx) > Math.abs(dy) * 1.3;
      if (go && nextChip) finish(dir); else cancel();
    };
    list.addEventListener("pointerdown", start);
    list.addEventListener("pointermove", move);
    list.addEventListener("pointerup", end);
    list.addEventListener("pointercancel", end);
    list.addEventListener("pointerleave", (e) => { if (active && e.pointerType === "mouse") end(e); });
    // Nach einem Zug den Klick auf die Kachel schlucken (sonst öffnet sich beim Loslassen ein Rezept)
    list.addEventListener("click", (e) => { if (dragged) { dragged = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }

  /* ---------- Rezepte rendern ---------- */
  function renderRezepte() {
    const s = state.settings;
    const $ = id => document.getElementById(id);
    // Felder nie überschreiben, während darin getippt wird – sonst verschwindet z. B. das Komma bei „8,5".
    const put = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
    put("set-mahlzeiten", s.mahlzeiten);
    put("set-ratio", fmtRatioNum(num(s.ratio)));
    put("set-weight", fmtNum(num(s.weight) > 0 ? num(s.weight) : ""));
    put("set-mct-fett", s.mctFett100 || "");
    put("set-mct-kcal", s.mctKcal100 || "");
    put("set-verdunstung", (s.dampfVerdunstung === 0 || s.dampfVerdunstung) ? s.dampfVerdunstung : "");
    $("set-proteinmode").value = String(s.proteinPerKg || 0);

    const d = derived();
    // Vorschläge stehen als echte Werte im Feld (nicht als grauer Platzhalter). Die Zeile darunter sagt, woher der
    // Wert kommt: „✓ Vorschlag …“ (grün) oder „eigener Wert“ mit dem Link zurück zum Vorschlag.
    const src = (id, manual, autoText, resetLabel) => {
      const sp = $("src-" + id), bt = $("reset-" + id);
      if (sp) { sp.textContent = manual ? "eigener Wert" : "✓ " + autoText; sp.classList.toggle("auto", !manual); }
      if (bt) { bt.hidden = !manual; if (resetLabel) bt.textContent = resetLabel; }
    };
    put("set-kcal", d.kcalManual ? s.kcal : d.kcalAuto);
    src("kcal", d.kcalManual, d.weight > 0 ? "Vorschlag · 80 kcal/kg" : "Vorgabe ohne Gewicht", "↺ Vorschlag " + fmt(d.kcalAuto, 0));
    put("set-kcalmin", d.kcalMinManual ? s.kcalMin : d.kcalMinAuto);
    src("kcalmin", d.kcalMinManual, d.weight > 0 ? "Vorschlag · 70 kcal/kg" : "Vorschlag · 85 % des Ziels", "↺ Vorschlag " + fmt(d.kcalMinAuto, 0));
    put("set-fluid", d.fluidManual ? s.fluidMl : (d.fluidAuto > 0 ? d.fluidAuto : ""));
    $("set-fluid").placeholder = d.fluidAuto > 0 ? "" : "ml/Tag (Gewicht eintragen)";
    src("fluid", d.fluidManual, d.fluidAuto > 0 ? "Vorschlag · 100 ml/kg" : "kein Vorschlag ohne Gewicht", "↺ Vorschlag " + fmt(d.fluidAuto, 0));
    src("protein", d.proteinPerKg !== d.proteinStandard, "Standard " + fmt(d.proteinStandard, 1) + " g/kg/Tag", "↺ Standard");
    // Menge je Zwischenzeit: im Modus „in den Mahlzeiten“ bleibt das Feld an seinem Platz, ist aber ausgegraut (nichts springt).
    const zwOn = d.wasserModus === "zwischen", zwEl = $("set-zwischen");
    const zwManual = zwOn && !(s.zwischenMl === "" || s.zwischenMl == null) && num(s.zwischenMl) !== 60;
    put("set-zwischen", zwOn ? d.zwischenMl : "");
    if (zwEl) { zwEl.disabled = !zwOn; zwEl.placeholder = zwOn ? "" : "– (alles in den Mahlzeiten)"; }
    src("zwischen", zwManual, zwOn ? "Vorgabe · eine Spritze" : "nicht nötig", "↺ 60 ml");
    // Eiweiß: bei Bedarf je kg steht das Ergebnis neben der Auswahl, das Gramm-Feld erscheint nur bei „manuell“.
    put("set-eiweiss", d.autoProtein ? d.eiweiss : s.eiweiss);
    const em = $("eiweiss-manual"); if (em) em.hidden = d.autoProtein;
    const ea = $("eiweiss-auto"); if (ea) ea.textContent = d.autoProtein ? "= " + fmt(d.eiweiss, 0) + " g/Tag" : (num(s.weight) > 0 ? "" : "(Gewicht eintragen)");
    renderHeader(d);
    renderVorgaben(d);
    if (state.settings.view === "heute") renderHeute();

    // Schnellfilter-Chips: Gruppen (entweder/oder) + Schalter (KetoCal-Phase, Diätologie)
    const filter = FILTERS.some(f => f.id === s.filter) ? s.filter : "alle";
    const q = (($("recipe-search") || {}).value || "").trim().toLowerCase();
    const onlyQuelle = !!s.onlyQuelle, hideKeto = !!s.hideKeto;
    // Eine wischbare Zeile mit den Gruppen; der aktive Chip wird ins Bild gerückt. KetoCal-Phase steht in
    // Kopfzeile und Vorgaben, der Diätologie-Filter und die Sortierung im „⋯“-Aufklapper.
    const fb = $("filter-bar");
    const prevScroll = fb.scrollLeft;
    fb.innerHTML = "";
    let activeChip = null;
    FILTERS.forEach(f => {
      const chip = el("button", { class: "chip" + (f.id === filter ? " active" : "") }, f.label);
      chip.addEventListener("click", () => { state.settings.filter = f.id; save(); renderRezepte(); });
      fb.appendChild(chip);
      if (f.id === filter) activeChip = chip;
    });
    if (activeChip && fb.clientWidth > 0 && fb.scrollWidth > fb.clientWidth) {
      // Position behalten und weich zum aktiven Chip rollen (beim ersten Aufbau direkt hinsetzen)
      const target = chipScrollTarget(fb, activeChip);
      fb.scrollLeft = prevScroll;
      if (fb.dataset.ready && fb.scrollTo && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) fb.scrollTo({ left: target, behavior: "smooth" });
      else fb.scrollLeft = target;
    }
    fb.dataset.ready = "1";
    const oq = $("only-quelle"); if (oq) oq.checked = onlyQuelle;
    const hk = $("hide-keto"); if (hk) hk.checked = hideKeto;
    const mt = $("more-toggle"); if (mt) mt.classList.toggle("open", onlyQuelle || hideKeto || (s.sort && s.sort !== "kategorie") || !$("more-row").hidden);
    const stg = $("search-toggle"); if (stg) stg.classList.toggle("open", !!q || !$("search-row").hidden);

    // Jedes Rezept ist ein Eintrag – mit oder ohne KetoCal. Gerichte in beiden Fettbasen erscheinen zweimal
    // (gleicher Name, Schild zeigt die Fettbasis). Rezepte, die das Verhältnis nicht erreichen, entfallen.
    const hitItems = (r) => r.items.some(it => (it.food || "").toLowerCase().indexOf(q) !== -1);
    const entries = [];
    allRecipes().forEach(rec => {
      const name = familyOf(rec);
      if (onlyQuelle && !rec.quelle) return;
      if (hideKeto && rec.ketocal) return;
      if (!matchesFilter(rec, filter)) return;
      if (q && name.toLowerCase().indexOf(q) === -1 && !hitItems(rec)) return;
      const res = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
      if (!res.ok) return;
      // Kachel zeigt die tatsächliche Mahlzeit (inkl. MCT-Mix, gemerktem Wasser) – wie Detail und Tagesplan.
      entries.push({ fam: { name: name }, rec, res: computeMealView(rec, d, null).res });
    });
    // Innerhalb einer Gruppe: nach Name, gleiche Namen ohne KetoCal zuerst
    const byName = (a, b) => a.fam.name.localeCompare(b.fam.name, "de") || ((a.rec.ketocal ? 1 : 0) - (b.rec.ketocal ? 1 : 0));

    const sort = s.sort || "kategorie";
    $("sort-select").value = sort;

    const list = $("recipe-list");
    list.innerHTML = "";
    if (entries.length === 0) {
      list.appendChild(el("div", { class: "card empty" }, "Keine Gerichte für diese Auswahl."));
      return;
    }

    function appendGroup(title, arr) {
      if (!arr.length) return;
      const sorted = arr.slice().sort(byName);
      list.appendChild(el("div", { class: "group-head" }, title + ' <span class="group-count">' + sorted.length + "</span>"));
      const grid = el("div", { class: "tiles" });
      sorted.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d, x.fam)));
      list.appendChild(grid);
    }

    if (sort === "kategorie") {
      const favs = entries.filter(x => isFav(x.rec));
      const rest = entries.filter(x => !isFav(x.rec));
      appendGroup("⭐ Favoriten", favs);
      FILTERS.filter(f => f.id !== "alle").forEach(f => appendGroup(f.label, rest.filter(x => recipeGroup(x.rec) === f.id)));
    } else {
      const keyFn = sort === "eiweiss"
        ? x => -sumMacros(x.res.items).eiweiss
        : sort === "volumen"
        ? x => volumeMl(x.res.items)
        : x => x.fam.name.toLowerCase();
      const sorted = entries.slice().sort((a, b) => {
        const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const ka = keyFn(a), kb = keyFn(b);
        return ka < kb ? -1 : ka > kb ? 1 : byName(a, b);
      });
      const grid = el("div", { class: "tiles" });
      sorted.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d, x.fam)));
      list.appendChild(grid);
    }
  }
