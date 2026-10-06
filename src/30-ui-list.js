  /* ---------- Wischen in der Rezeptliste: links = nächste Gruppe, rechts = vorige ----------
     Drücken und Ziehen im Bereich der Rezepte (Finger oder Maus) blättert zwischen den Gruppen wie zwischen
     den Blättern der Detailansicht: die Nachbargruppe wird beim Ziehen in eine zweite Fläche gerendert und
     rutscht neben der aktuellen Liste 1:1 mit dem Finger herein; die Chip-Zeile rollt mit, die Markierung springt
     ab halbem Weg auf die Nachbargruppe (wie die Reiter der Detailansicht, ohne Überblenden). Beim Loslassen läuft die Bewegung bis zur Ruhelage
     durch (oder weich zurück). Senkrechtes Wischen bleibt Scrollen; nach einem Zug löst der folgende Klick
     keine Kachel aus. */
  function chipScrollTarget(fb, chip) {
    // Lage des Chips innerhalb der Zeile (unabhängig davon, wo die Zeile auf der Seite steht – am Desktop rechts der linken Spalte)
    const left = chip.getBoundingClientRect().left - fb.getBoundingClientRect().left + fb.scrollLeft;
    return Math.max(0, Math.min(fb.scrollWidth - fb.clientWidth, left - (fb.clientWidth - chip.offsetWidth) / 2));
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
    const stage = list.parentElement;
    const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let x0 = 0, y0 = 0, t0 = 0, active = false, horiz = null, dragged = false, busy = false;
    let dir = 0, curChip = null, nextChip = null, s0 = 0, s1 = 0, scrollable = false, peek = null;
    const chips = () => [...fb.querySelectorAll(".chip")];
    const curIdx = () => Math.max(0, FILTERS.findIndex(f => f.id === state.settings.filter));
    // Markierung wie bei den Reitern der Detailansicht: kein Überblenden, sie springt ab halbem Weg auf die
    // Nachbargruppe (und zurück, wenn man wieder zurückzieht).
    let marked = false;
    const mark = (next) => {
      if (next === marked || !curChip || !nextChip) return;
      marked = next;
      curChip.classList.toggle("active", !next); nextChip.classList.toggle("active", next);
    };
    // Seitenbreite: eine Fläche plus Spalt; in Umgebungen ohne Layout (Tests) ein fester Wert
    const W = () => (stage.clientWidth || list.clientWidth || 320) + 24;
    const removePeek = () => { if (peek) { peek.remove(); peek = null; } };
    // Nachbargruppe in die zweite Fläche rendern; ihr Anfang liegt auf Höhe des sichtbaren Ausschnitts
    const buildPeek = (d) => {
      removePeek();
      const f = FILTERS[curIdx() + d]; if (!f) return;
      peek = el("div", { id: "recipe-peek", "aria-hidden": "true" });
      fillRecipeList(peek, f.id, listContext());
      // Ist die Chip-Zeile nach oben weggescrollt, beginnt die Fläche genau dort, wo die neue Liste nach dem
      // Wechsel stehen wird (stepFilter rollt dann zur Chip-Zeile) – so springt beim Übergang nichts.
      const bar = document.querySelector("#view-rezepte .listbar");
      const barTop = bar ? bar.getBoundingClientRect().top : stage.getBoundingClientRect().top;
      peek.style.top = Math.max(0, Math.round(8 - barTop)) + "px";
      stage.appendChild(peek);
    };
    const place = (dx) => {
      list.style.transform = "translateX(" + Math.round(dx) + "px)";
      if (peek) peek.style.transform = "translateX(" + Math.round(dir * W() + dx) + "px)";
    };
    const trans = (t) => { const v = t ? "transform " + t + "ms cubic-bezier(.2,.7,.3,1)" : "none"; list.style.transition = v; if (peek) peek.style.transition = v; };
    const pick = (d) => {
      const all = chips(), cur = curIdx();
      dir = d; marked = false; curChip = all[cur] || null; nextChip = all[cur + d] || null;
      scrollable = fb.clientWidth > 0 && fb.scrollWidth > fb.clientWidth;
      if (scrollable && curChip && nextChip) { s0 = fb.scrollLeft; s1 = chipScrollTarget(fb, nextChip); }
      buildPeek(d);
    };
    const start = (e) => {
      if (busy || (e.button != null && e.button !== 0)) return;
      x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); active = true; horiz = null; dragged = false; dir = 0;
      trans(0);
    };
    const move = (e) => {
      if (!active) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (horiz === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) horiz = Math.abs(dx) > Math.abs(dy) * 1.3;
      if (!horiz) { list.style.transform = ""; return; }
      dragged = true;
      const d = dx < 0 ? 1 : -1;
      if (d !== dir) { mark(false); pick(d); trans(0); }
      const blocked = !nextChip, p = blocked ? 0 : Math.min(1, Math.abs(dx) / W());
      // Beide Flächen ziehen 1:1 mit; am Rand (keine weitere Gruppe) nur ein kurzer Widerstand
      place(blocked ? dx * 0.1 : dx);
      // Chip-Zeile rollt proportional mit; die Markierung springt ab halbem Weg
      if (scrollable && nextChip) fb.scrollLeft = s0 + (s1 - s0) * p;
      mark(p > 0.5);
      if (e.cancelable && e.type === "touchmove") e.preventDefault();
    };
    const finish = (d, dx) => {
      const w = W(), rest = Math.max(0, w - Math.abs(dx));
      const t = reduced() ? 0 : Math.round(Math.min(280, Math.max(120, rest * 0.6)));
      busy = true;
      // Beide Flächen laufen bis zur Ruhelage weiter; Markierung sitzt auf der Nachbargruppe, Chip-Zeile rollt nach
      trans(t); place(-d * w);
      mark(true);
      if (scrollable && nextChip) { if (fb.scrollTo) fb.scrollTo({ left: s1, behavior: t ? "smooth" : "auto" }); else fb.scrollLeft = s1; }
      setTimeout(() => {
        // Dann wird die Nachbargruppe zur echten Liste (gleicher Inhalt, kein sichtbarer Sprung)
        trans(0); list.style.transform = "";
        stepFilter(d);
        removePeek();
        list.style.transition = ""; busy = false;
      }, t + 20);
    };
    const cancel = () => {
      const t = reduced() ? 0 : 200;
      busy = true;
      trans(t); place(0);
      mark(false);
      if (scrollable && nextChip) { if (fb.scrollTo) fb.scrollTo({ left: s0, behavior: t ? "smooth" : "auto" }); else fb.scrollLeft = s0; }
      setTimeout(() => { trans(0); list.style.transform = ""; removePeek(); list.style.transition = ""; busy = false; }, t + 20);
    };
    const end = (e) => {
      if (!active) return; active = false;
      const dx = e.clientX - x0, dy = e.clientY - y0, dt = Date.now() - t0;
      if (!horiz) { list.style.transition = ""; list.style.transform = ""; removePeek(); return; }
      const flick = dt < 300 && Math.abs(dx) > 30;
      const go = (Math.abs(dx) > W() * 0.3 || flick) && Math.abs(dx) > Math.abs(dy) * 1.3;
      if (go && nextChip) finish(dir, dx); else cancel();
    };
    list.addEventListener("pointerdown", start);
    list.addEventListener("pointermove", move);
    list.addEventListener("pointerup", end);
    list.addEventListener("pointercancel", end);
    list.addEventListener("pointerleave", (e) => { if (active && e.pointerType === "mouse") end(e); });
    // Nach einem Zug den Klick auf die Kachel schlucken (sonst öffnet sich beim Loslassen ein Rezept)
    list.addEventListener("click", (e) => { if (dragged) { dragged = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // Was die Liste außer der Gruppe noch bestimmt: Vorgaben, Suchtext, Schalter, Sortierung
  function listContext() {
    const s = state.settings, sq = document.getElementById("recipe-search");
    return { d: derived(), q: ((sq || {}).value || "").trim().toLowerCase(), onlyQuelle: !!s.onlyQuelle, hideKeto: !!s.hideKeto, onlyKeto: !!s.onlyKeto && !s.hideKeto, sort: s.sort || "kategorie" };
  }
  // Baut die Kacheln einer Gruppe in einen Behälter (echte Liste oder Nachbarfläche beim Wischen).
  // Jedes Rezept ist ein Eintrag – mit oder ohne KetoCal. Gerichte in beiden Fettbasen erscheinen zweimal
  // (gleicher Name, Schild zeigt die Fettbasis). Rezepte, die das Verhältnis nicht erreichen, entfallen.
  function fillRecipeList(list, filter, ctx) {
    const { d, q, onlyQuelle, hideKeto, onlyKeto, sort } = ctx;
    const hitItems = (r) => r.items.some(it => (it.food || "").toLowerCase().indexOf(q) !== -1);
    // Favoriten stehen immer oben – auch wenn eine Gruppe (Geflügel, Fisch …) gewählt ist. Suche und die Schalter
    // „nur Diätologie“ / „ohne KetoCal“ gelten für sie wie für alle anderen Rezepte.
    const entries = [];
    allRecipes().forEach(rec => {
      const name = familyOf(rec);
      if (onlyQuelle && !rec.quelle) return;
      if (hideKeto && rec.ketocal) return;
      if (onlyKeto && !rec.ketocal) return; // „nur KetoCal“ (schließt „ohne KetoCal“ aus)
      if (isHidden(rec)) return; // ausgeblendete Standard-Rezepte (Vorgaben › Lebensmittel und Rezepte)
      const fav = isFav(rec);
      if (!fav && !matchesFilter(rec, filter)) return;
      // Suche findet Anzeige- und vollen Datennamen (also auch „ketocal“, „obstbrei“) und Zutaten
      if (q && (rec.name + " " + name).toLowerCase().indexOf(q) === -1 && !hitItems(rec)) return;
      const res = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
      if (!res.ok) return;
      // Kachel zeigt die tatsächliche Mahlzeit (inkl. MCT-Mix, gemerktem Wasser) – wie Detail und Tagesplan.
      entries.push({ fam: { name: name }, rec, res: computeMealView(rec, d, null).res, fav });
    });
    // Innerhalb einer Gruppe: nach Name, gleiche Namen ohne KetoCal zuerst
    const byName = (a, b) => a.fam.name.localeCompare(b.fam.name, "de") || ((a.rec.ketocal ? 1 : 0) - (b.rec.ketocal ? 1 : 0));
    const favs = entries.filter(x => x.fav), rest = entries.filter(x => !x.fav);

    list.innerHTML = "";
    list.dataset.count = entries.length;
    // Keine Treffer (in der Gruppe): Hinweis mit Textlink „In allen Gruppen suchen“ bzw. „Filter zurücksetzen“
    const emptyLine = () => {
      const box = el("div", { class: "empty-line" }, q && filter !== "alle" ? "Keine Treffer in dieser Gruppe." : filter === "favoriten" && !q ? "Noch keine Favoriten – Stern bei einem Rezept setzen." : "Keine Treffer.");
      if (q && filter !== "alle") {
        const b = el("button", { type: "button", class: "tlink" }, "In allen Gruppen suchen");
        b.addEventListener("click", () => { state.settings.filter = "alle"; save(); renderRezepte(); });
        box.appendChild(b);
      } else if (onlyQuelle || hideKeto || onlyKeto || q) {
        const b = el("button", { type: "button", class: "tlink" }, "Filter zurücksetzen");
        b.addEventListener("click", () => { state.settings.onlyQuelle = false; state.settings.hideKeto = false; state.settings.onlyKeto = false; const sq = document.getElementById("recipe-search"); if (sq) sq.value = ""; save(); renderRezepte(); });
        box.appendChild(b);
      }
      return box;
    };
    if (entries.length === 0) { list.appendChild(emptyLine()); return; }

    function appendGroup(title, arr) {
      if (!arr.length) return;
      const sorted = arr.slice().sort(byName);
      // Hülle je Gruppe: am Desktop eine Spalte der Liste, am Handy ohne Wirkung (display: contents)
      const grp = el("div", { class: "group" });
      grp.appendChild(el("div", { class: "group-head" }, '<h2 class="group-title">' + title + '</h2><span class="group-count">' + sorted.length + "</span>"));
      const grid = el("div", { class: "tiles" });
      sorted.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d, x.fam)));
      grp.appendChild(grid);
      list.appendChild(grp);
    }

    if (sort === "kategorie") {
      // Favoriten oben als eigene Gruppe (bei jedem Gruppen-Chip), darunter die Gruppen ohne die Favoriten (nichts doppelt)
      appendGroup("Favoriten", favs);
      FILTERS.filter(f => f.id !== "alle" && f.id !== "favoriten").forEach(f => appendGroup(f.label, rest.filter(x => recipeGroup(x.rec) === f.id)));
      // Gruppe gewählt, aber außer den Favoriten nichts darin: Hinweis unter den Favoriten
      if (!rest.length && filter !== "alle" && filter !== "favoriten") list.appendChild(emptyLine());
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

  /* ---------- Rezepte rendern ---------- */
  function renderRezepte() {
    const s = state.settings;
    placeRecipeSearch();
    const $ = id => document.getElementById(id);
    // Felder nie überschreiben, während darin getippt wird – sonst verschwindet z. B. das Komma bei „8,5".
    const put = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
    // Felder, die leer bleiben dürfen: leer heißt „Vorschlag verwenden“, der gerade geltende Vorschlag steht grau als
    // Platzhalter darin (zieht mit, z. B. nach einer Gewichtsänderung); ein eigener Wert steht in Tinte.
    const hint = (id, v) => { const el = $(id); if (el) el.placeholder = v; };
    const isDef = (v, def) => v === "" || v == null || num(v) === def;
    document.querySelectorAll("#mahlzeiten-ctl button[data-mahl]").forEach(b => b.classList.toggle("active", num(b.dataset.mahl) === mahlCount(s)));
    put("set-ratio", fmtRatioNum(num(s.ratio)));
    put("set-weight", fmtNum(num(s.weight) > 0 ? num(s.weight) : ""));
    put("set-mct-fett", isDef(s.mctFett100, 100) || !(num(s.mctFett100) > 0) ? "" : s.mctFett100); hint("set-mct-fett", "100");
    put("set-mct-kcal", isDef(s.mctKcal100, 830) || !(num(s.mctKcal100) > 0) ? "" : s.mctKcal100); hint("set-mct-kcal", "830");
    put("set-verdunstung", isDef(s.dampfVerdunstung, DAMPF_STANDARD) ? "" : s.dampfVerdunstung); hint("set-verdunstung", String(DAMPF_STANDARD));
    $("set-proteinmode").value = String(s.proteinPerKg || 0);

    const d = derived();
    // Vorschläge stehen grau als Platzhalter im leeren Feld. Die Zeile darunter sagt, woher der Wert kommt:
    // „Vorschlag …“ oder „eigener Wert“ mit dem Link zurück zum Vorschlag.
    const src = (id, manual, autoText, resetLabel) => {
      const sp = $("src-" + id), bt = $("reset-" + id);
      if (sp) { sp.textContent = manual ? "eigener Wert" : autoText; sp.classList.toggle("auto", !manual); }
      if (bt) { bt.hidden = !manual; if (resetLabel) bt.textContent = resetLabel; }
    };
    put("set-kcal", d.kcalManual ? s.kcal : ""); hint("set-kcal", String(Math.round(d.kcalAuto)));
    src("kcal", d.kcalManual, d.kcalBasis === "krick" ? "Vorschlag · Krick" : d.weight > 0 ? "Vorschlag · 80 kcal/kg" : "Vorgabe ohne Gewicht", "Vorschlag " + fmt(d.kcalAuto, 0));
    put("set-kcalmin", d.kcalMinManual ? s.kcalMin : ""); hint("set-kcalmin", String(Math.round(d.kcalMinAuto)));
    src("kcalmin", d.kcalMinManual, d.kcalBereich ? "Vorschlag · ESPGHAN 60 %" : d.weight > 0 ? "Vorschlag · 70 kcal/kg" : "Vorschlag · 85 % des Ziels", "Vorschlag " + fmt(d.kcalMinAuto, 0));
    put("set-fluid", d.fluidManual ? s.fluidMl : ""); hint("set-fluid", d.fluidAuto > 0 ? String(Math.round(d.fluidAuto)) : "Gewicht eintragen");
    src("fluid", d.fluidManual, d.fluidAuto > 0 ? "Vorschlag · 100 ml/kg" : "kein Vorschlag ohne Gewicht", "Vorschlag " + fmt(d.fluidAuto, 0));
    // Energiedichte (nur Modus „zwischen“; im anderen Modus ausgegraut, das Feld bleibt an seinem Platz)
    {
      const on = d.wasserModus === "zwischen", el2 = $("set-dichte"), manual = !(s.maxDichte === "" || s.maxDichte == null) && num(s.maxDichte) !== 1.5;
      put("set-dichte", on && manual ? fmtNum(d.maxDichte) : "");
      if (el2) { el2.disabled = !on; el2.placeholder = on ? "1,5" : "–"; }
      src("dichte", on && manual, on ? "Vorgabe" : "nicht nötig", "auf 1,5");
    }
    // Eiweiß: das Ergebnis (g/Tag) steht in der Zeile unter der Auswahl; das Gramm-Feld erscheint nur bei „manuell“.
    put("set-eiweiss", d.autoProtein ? d.eiweiss : s.eiweiss);
    const em = $("eiweiss-manual"); if (em) em.hidden = d.autoProtein;
    {
      const sp = $("src-protein"), bt = $("reset-protein"), isStd = d.proteinPerKg === d.proteinStandard, hasW = num(s.weight) > 0;
      const txt = d.autoProtein ? (hasW ? (isStd ? "Standard · " : "") + fmt(d.eiweiss, 0) + " g/Tag" : "Gewicht eintragen") : "eigener Wert";
      if (sp) { sp.textContent = txt; sp.classList.toggle("auto", d.autoProtein && isStd && hasW); }
      if (bt) { bt.hidden = isStd; bt.textContent = "Standard " + fmt(d.proteinStandard, 1) + " g/kg"; }
    }
    renderHeader(d);
    renderVorgaben(d);
    if (state.settings.view === "heute") renderHeute();

    // Chips: Gruppen (entweder/oder, wischbar) und dahinter die Schalter „nur Diätologie“, „nur KetoCal“ und „ohne KetoCal“
    // (die beiden KetoCal-Schalter schließen sich gegenseitig aus).
    const filter = FILTERS.some(f => f.id === s.filter) ? s.filter : "alle";
    const q = (($("recipe-search") || {}).value || "").trim().toLowerCase();
    const onlyQuelle = !!s.onlyQuelle, hideKeto = !!s.hideKeto, onlyKeto = !!s.onlyKeto && !hideKeto;
    const fb = $("filter-bar");
    const prevScroll = fb.scrollLeft;
    fb.innerHTML = "";
    let activeChip = null;
    FILTERS.forEach(f => {
      const chip = el("button", { type: "button", class: "chip" + (f.id === filter ? " active" : ""), "aria-pressed": f.id === filter ? "true" : "false" }, f.label);
      chip.addEventListener("click", () => { state.settings.filter = f.id; save(); renderRezepte(); });
      fb.appendChild(chip);
      if (f.id === filter) activeChip = chip;
    });
    // Am Desktop stehen die Schalter als Häkchen im Kopf („Nur Diätologie“, „Ohne KetoCal“), am Handy als Chips.
    const dk = isDesktop(), tg = $("rz-toggles");
    if (tg) tg.innerHTML = "";
    [["only-quelle", "onlyQuelle", "nur Diätologie"], ["only-keto", "onlyKeto", "nur KetoCal"], ["hide-keto", "hideKeto", "ohne KetoCal"]].forEach(([id, key, label], k) => {
      const lab = dk && tg
        ? el("label", { class: "dk-check" }, '<input type="checkbox" id="' + id + '"' + (s[key] ? " checked" : "") + "> " + label.charAt(0).toUpperCase() + label.slice(1))
        : el("label", { class: "chip toggle" + (k === 0 ? " first" : "") + (s[key] ? " on" : "") }, '<input type="checkbox" id="' + id + '"' + (s[key] ? " checked" : "") + ">" + (s[key] ? "✓ " : "") + label);
      const cb = lab.querySelector("input");
      cb.addEventListener("change", () => {
        state.settings[key] = cb.checked;
        if (cb.checked && key === "onlyKeto") state.settings.hideKeto = false;
        if (cb.checked && key === "hideKeto") state.settings.onlyKeto = false;
        save(); renderRezepte();
      });
      (dk && tg ? tg : fb).appendChild(lab);
    });
    if (activeChip && fb.clientWidth > 0 && fb.scrollWidth > fb.clientWidth) {
      // Position behalten und weich zum aktiven Chip rollen (beim ersten Aufbau direkt hinsetzen)
      const target = chipScrollTarget(fb, activeChip);
      fb.scrollLeft = prevScroll;
      if (fb.dataset.ready && fb.scrollTo && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) fb.scrollTo({ left: target, behavior: "smooth" });
      else fb.scrollLeft = target;
    }
    fb.dataset.ready = "1";

    const sort = s.sort || "kategorie";
    $("sort-select").value = sort;
    fillRecipeList($("recipe-list"), filter, { d, q, onlyQuelle, hideKeto, onlyKeto, sort });
    // Zeile über der Suche: wie viele Rezepte passen (zur Verordnung bzw. zur Suche/Gruppe)
    const lc = $("list-count"), n = num($("recipe-list").dataset.count);
    const countTxt = n + (n === 1 ? " Rezept passt" : " Rezepte passen") + (q ? " zur Suche" : filter === "alle" && !onlyQuelle && !hideKeto && !onlyKeto ? " zur Verordnung" : " zur Auswahl");
    if (lc) lc.textContent = countTxt;
    const rc = $("rz-count"); if (rc) rc.textContent = countTxt;
    // Unter der Liste: ausgeblendete Standard-Rezepte und der Weg zurück
    const hid = (state.hiddenRecipes || []).filter(k => recipeByKey(k)).length;
    if (hid) {
      const p = el("p", { class: "cf-empty hidden-note" }, hid + (hid === 1 ? " Rezept ist" : " Rezepte sind") + ' ausgeblendet · <button type="button" class="tlink">anzeigen</button>');
      p.querySelector("button").addEventListener("click", () => { showView("vorgaben"); showVgPage("lebensmittel"); });
      $("recipe-list").appendChild(p);
    }
    if (typeof syncDetailPanel === "function") syncDetailPanel();
  }
  // Suchfeld: am Desktop im Kopf der Rezepte, am Handy in der Suchzeile neben „+“ (derselbe Knoten, Eingabe bleibt)
  function placeRecipeSearch() {
    const sq = document.getElementById("recipe-search"), slot = document.getElementById("rz-search-slot"), btn = document.getElementById("compose-btn");
    if (!sq || !slot || !btn) return;
    const want = isDesktop() ? slot : btn.parentElement;
    if (sq.parentElement === want) return;
    if (want === slot) slot.appendChild(sq); else want.insertBefore(sq, btn);
  }
