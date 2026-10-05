  /* ---------- Detailansicht (Overlay) ---------- */
  // Blätter der Detailansicht in Reihenfolge: Mahlzeit (eine Portion), Tag (Zubereitungsmenge, intern „abwiegen“),
  // Anpassen, Kochen (intern „zubereitung“).
  const DETAIL_PAGES = [["mahlzeit", "Mahlzeit"], ["abwiegen", "Tag"], ["anpassen", "Anpassen"], ["zubereitung", "Kochen"]];
  function isMobileLayout() { try { return !!(window.matchMedia && window.matchMedia("(max-width: 820px)").matches); } catch (e) { return false; } }
  // detailScale: Zubereitungsmenge – Zahl (Portionen) oder "tag" / "tag:N" (= N ganze Tage, folgt der Mahlzeitenzahl).
  // detailMeat: temporäre Fleischwahl.
  let detailRec = null, detailScale = "tag", detailMeat = null;
  let detailMctOpen = null; // MCT-Anteil beim Öffnen – Bezug für „↺“ auf dem Blatt Anpassen
  const scaleDays = () => typeof detailScale === "string" && /^tag(:\d+)?$/.test(detailScale) ? Math.max(1, parseInt(detailScale.split(":")[1] || "1", 10)) : 0;
  const parseScale = (sv) => (typeof sv === "string" && /^tag(:\d+)?$/.test(sv)) ? sv : (num(sv) > 0 ? num(sv) : "tag");
  // Die Zubereitungsmenge gilt nur für die offene Ansicht: jedes Rezept öffnet mit „1 Tag“ (nichts wird gemerkt).
  function persistScale() {}
  // Portionenzahl → Zubereitungsmenge: ein Vielfaches der Mahlzeitenzahl ist wieder „N Tag(e)“ (Knopf leuchtet).
  function scaleFromPortions(v, mahl) {
    const days = mahl > 0 ? v / mahl : 0;
    if (days >= 1 && Math.abs(days - Math.round(days)) < 1e-6) return Math.round(days) === 1 ? "tag" : "tag:" + Math.round(days);
    return v;
  }
  function scaleMult(d) { const days = scaleDays(); return days ? days * d.mahl : (num(detailScale) > 0 ? num(detailScale) : 1); }
  function openRecipeDetail(rec, keepScale) {
    detailRec = rec; detailPicked = true; if (!keepScale) detailScale = "tag"; detailMeat = null;
    detailMctOpen = Math.min(1, Math.max(0, num(state.settings.mctShare)));
    state.settings.detailTab = "mahlzeit"; // jedes Rezept öffnet mit „Mahlzeit“; innerhalb der Ansicht bleibt das gewählte Blatt
    renderDetail();
    const overlay = document.getElementById("detail-overlay");
    overlay.hidden = false;
    if (panelMode()) { syncDetailPanel(true); revealPanel(); }
    else if (!detailModal) { modalOpen("detail"); detailModal = true; }
  }
  /* Desktop, Bereich Rezepte: das Rezept steht als festes Panel rechts neben der Liste (kein Overlay, kein Einfrieren).
     Dafür wandert #detail-overlay in #rz-panel und beim Verlassen zurück an seinen Platz. Ein Klick auf eine Zeile
     wechselt das Panel; ohne Auswahl zeigt es das erste Rezept der Liste. Aus dem Tagesplan und bei Fenstern unter
     1100 px öffnet ein Rezept als zentriertes Fenster. Wird das Fenster schmaler, während ein selbst gewähltes Rezept
     im Panel steht, bleibt es als Fenster offen (die automatische Vorauswahl nicht); wird es breiter, wandert ein offenes
     Fenster ins Panel. */
  let detailModal = false, detailHome = null, detailPicked = false;
  function panelMode() { return isDesktop() && isPanelWidth() && state.settings.view === "rezepte"; }
  function syncDetailPanel(opened) {
    const ov = document.getElementById("detail-overlay"), slot = document.getElementById("rz-panel");
    if (!ov || !slot) return;
    if (!detailHome) detailHome = { parent: ov.parentElement, next: ov.nextSibling };
    const list = document.getElementById("recipe-list");
    if (!panelMode()) {
      if (ov.parentElement === slot) {
        closeTodaySheet(); detailHome.parent.insertBefore(ov, detailHome.next);
        // nur die Breite hat sich geändert (Bereich Rezepte bleibt): das gewählte Rezept als Fenster weiterzeigen
        if (detailPicked && detailRec && !ov.hidden && state.settings.view === "rezepte") {
          renderDetail();
          if (!detailModal) { modalOpen("detail"); detailModal = true; }
        } else ov.hidden = true;
      }
      document.body.classList.remove("detail-panel");
      if (list) list.querySelectorAll(".tile.sel").forEach(t => t.classList.remove("sel"));
      return;
    }
    if (detailModal) { modalClose("detail"); detailModal = false; }
    if (ov.parentElement !== slot) slot.appendChild(ov);
    document.body.classList.add("detail-panel");
    // Auswahl: das offene Rezept, sonst das erste der Liste (ist es nicht mehr in der Liste, ebenfalls das erste)
    const tiles = list ? [...list.querySelectorAll(".tile")] : [];
    const key = detailRec ? recipeKey(detailRec) : null;
    let sel = key ? tiles.find(t => t.dataset.key === key) : null;
    if (!opened && !sel && tiles.length && tiles[0]._rec) {
      detailRec = tiles[0]._rec; detailPicked = false; detailScale = "tag"; detailMeat = null; state.settings.detailTab = "mahlzeit";
      detailMctOpen = Math.min(1, Math.max(0, num(state.settings.mctShare)));
      sel = tiles[0];
    }
    tiles.forEach(t => t.classList.toggle("sel", t === sel));
    if (!detailRec || (!sel && !opened)) { ov.hidden = true; return; }
    ov.hidden = false;
    // Inhalt auffrischen (z. B. nach geänderten Vorgaben oder Favorit in der Liste) – nicht während im Panel getippt wird
    if (!opened && !slot.contains(document.activeElement)) renderDetail();
  }
  // Liegt das Panel außer Sicht (z. B. weit gescrollt), nach der Auswahl dorthin rollen
  function revealPanel() {
    const slot = document.getElementById("rz-panel"); if (!slot) return;
    const r = slot.getBoundingClientRect();
    if (r.top > window.innerHeight - 80 || r.bottom < 0) { try { slot.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }
  }
  // Eine Mahlzeit vollständig berechnen – dieselbe Pipeline für Detailansicht und Tagesplan:
  // Basis (Verhältnis + kcal/Mahlzeit) → optionaler Fleisch-Tausch → Öl-Mix (MCT-Anteil)
  // → gemerktes Wasser. Ergebnis ist eine Portion (= eine Mahlzeit).
  function computeMealView(rec, d, meatChoice) {
    const base = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
    let res = base;
    let adjIndex = base.fatIndex, adjLabel = '<small class="adj">stellt das Verhältnis ein</small>';
    const swapSlot = recipeMeatSlot(rec);
    if (swapSlot && meatChoice && meatChoice !== swapSlot.baseKey) {
      // Fleisch nach den Mengen der Diätologin tauschen (20 g Huhn ≙ 30 g Rind ≙ 18 g Pute) und das Rezept danach wie
      // jedes andere auf Verhältnis UND kcal je Mahlzeit einstellen – Öl und Menge passen sich an.
      const sw = computeAdjustedRecipe(applyMeatChoice(rec, meatChoice), d.kcalMahl, d.ratio);
      if (sw.ok) { res = sw; adjIndex = sw.fatIndex; }
    }
    // Öl-Mix (Rapsöl/MCT): Anteil s + Modus aus den Vorgaben; s = 0 lässt alles unverändert.
    // kcal-Ziel für den Modus KALORIEN = Kalorien der Ansicht bei s = 0 (Basis bzw.
    // nach Fleisch-Tausch), damit "kcal konstant" sich auf den sichtbaren Ist-Zustand bezieht.
    const baseOilIndex = oilSlotIndex(res.items);
    const kcalZielOil = sumMacros(res.items).kcal;
    if (baseOilIndex >= 0 && d.mctShare > 0) res = applyOilMix(res, d, d.mctShare, d.mctMode, kcalZielOil);
    // Portion angepasst (Blatt Mahlzeit): ein Wert wurde händisch geändert, alle Zutaten skalieren proportional mit
    // (je Rezept gemerkt). Das Verhältnis bleibt, kcal je Mahlzeit ändern sich – Tagesplan und Blatt Tag rechnen damit.
    const portionKey = familyKey(rec);
    const portionF = num(state.portion && state.portion[portionKey]);
    const hasPortion = portionF > 0 && Math.abs(portionF - 1) > 1e-6;
    const kcalBerechnet = sumMacros(res.items).kcal;
    if (hasPortion) {
      const itemsP = res.items.map(it => ({ food: it.food, grams: round1(num(it.grams) * portionF) }));
      const smP = sumMacros(itemsP);
      res = Object.assign({}, res, { items: itemsP, ratio: ratioOf(smP), kcal: smP.kcal });
    }
    // Wasser darf für sich allein geändert werden (je Rezept gemerkt, Wert je Portion):
    // Wasser hat keine Nährwerte, beeinflusst also weder Verhältnis noch kcal – nur Volumen.
    const waterKey = familyKey(rec);
    const hasWaterOverride = Object.prototype.hasOwnProperty.call(state.water, waterKey);
    if (hasWaterOverride) {
      const target = Math.max(0, num(state.water[waterKey]));
      const isW = (it) => /wasser/i.test(it.food);
      const sumW = res.items.filter(isW).reduce((a, it) => a + num(it.grams), 0);
      let first = true;
      let items2 = res.items.map(it => {
        if (!isW(it)) return it;
        let g;
        if (sumW > 0) g = num(it.grams) * target / sumW; else { g = first ? target : 0; first = false; }
        return { food: it.food, grams: round1(g) };
      });
      // Rezept ohne eigene Wasser-Zutat (z. B. HiPP-Gläschen): gemerktes Wasser als eigene Zeile anhängen
      if (!res.items.some(isW) && target > 0) items2 = items2.concat([{ food: "Wasser", grams: round1(target) }]);
      const sm2 = sumMacros(items2);
      res = Object.assign({}, res, { items: items2, ratio: ratioOf(sm2), kcal: sm2.kcal });
    }
    // Flüssigkeit „in den Mahlzeiten“: Wasser so setzen, dass die Mahlzeit ihren Anteil am Tagesbedarf liefert
    // (Zutaten-Wasser + Wasser = Flüssigkeit je Mahlzeit). Nie weniger als das Rezept-Wasser; gemerktes Wasser hat Vorrang.
    // Modus „zwischen“ (fluidMahl = 0): die Mahlzeit behält ihr Rezept-Wasser, der Rest kommt als Wassergaben.
    let fluidAdjusted = false, waterCapped = false;
    if (d.fluidMahl > 0 && !hasWaterOverride) {
      const isW2 = (it) => /wasser/i.test(it.food);
      const foodFluid = fluidOf(res.items.filter(it => !isW2(it)));
      const stdWater = res.items.filter(isW2).reduce((a, it) => a + num(it.grams), 0);
      const need = d.fluidMahl - foodFluid;
      if (need > stdWater + 0.05) {
        const items3 = stdWater > 0
          ? res.items.map(it => isW2(it) ? { food: it.food, grams: round1(num(it.grams) * need / stdWater) } : it)
          : res.items.concat([{ food: "Wasser", grams: round1(need) }]);
        res = Object.assign({}, res, { items: items3 });
        fluidAdjusted = true;
      }
    }
    // Modus „zwischen“: Rezept-Wasser bleibt, außer die Mahlzeit wäre dichter als erlaubt (kcal je ml) – dann gerade so
    // viel Wasser dazu, dass die Grenze eingehalten ist. Gemerktes Wasser hat Vorrang.
    let densityAdjusted = false;
    if (d.wasserModus === "zwischen" && d.maxDichte > 0 && !hasWaterOverride) {
      const isW3 = (it) => /wasser/i.test(it.food);
      const kcalM = sumMacros(res.items).kcal, vol = volumeMl(res.items), minVol = kcalM / d.maxDichte;
      if (vol < minVol - 0.5) {
        const add = minVol - vol, stdW = res.items.filter(isW3).reduce((a, it) => a + num(it.grams), 0);
        const items4 = stdW > 0
          ? res.items.map(it => isW3(it) ? { food: it.food, grams: round1(num(it.grams) * (stdW + add) / stdW) } : it)
          : res.items.concat([{ food: "Wasser", grams: round1(add) }]);
        res = Object.assign({}, res, { items: items4 });
        densityAdjusted = true;
      }
    }
    // Zum Schluss: Rundung fürs Abwiegen (fest 0,5 g / Wasser 1 ml), Verhältnis über die Fettträger nachgestellt.
    {
      const itemsR = roundForScale(res.items, d.rundung);
      const smR = sumMacros(itemsR);
      res = Object.assign({}, res, { items: itemsR, ratio: ratioOf(smR), kcal: smR.kcal });
    }
    const fluid = fluidOf(res.items);
    return { res, adjIndex, adjLabel, baseOilIndex, waterKey, hasWaterOverride, fluidAdjusted, densityAdjusted, waterCapped, fluid,
      portionF: hasPortion ? portionF : 1, hasPortion, kcalBerechnet };
  }
  // Gekochte Rezepte: Öl wird nicht mitpüriert, sondern in die abgefüllte Portion eingerührt – als letzter Schritt
  // mit den Mengen einer Portion (Raps/MCT nach Öl-Mix). Angerührte Rezepte nennen das schon im eigenen Text.
  function oilFeedStep(rec, itemsPer) {
    if (rec.angeruehrt) return "";
    const oils = itemsPer.filter(it => isOilName(it.food) && num(it.grams) > 0);
    if (!oils.length) return "";
    return "Abfüllen und in jede Portion " +
      oils.map(o => String(o.food).replace(/\s*C8\+C10/, "") + " " + fmt(num(o.grams), 1) + " g").join(" + ") + " gründlich einrühren.";
  }
  // Kennzahlen einer Mahlzeit fürs Füttern/Tagesplan (eine Portion).
  function mealFacts(rec, d) {
    const mv = computeMealView(rec, d, null);
    const items = mv.res.items;
    const isOilN = isOilName;
    const noOil = items.filter(it => !isOilN(it.food));
    const oils = items.filter(it => isOilN(it.food));
    const sum = sumMacros(items);
    return {
      rec, res: mv.res, sum, ratio: ratioOf(sum), fluid: mv.fluid,
      gNoOil: noOil.reduce((a, it) => a + num(it.grams), 0), mlNoOil: volumeMl(noOil),
      oils, hasOil: oils.length > 0,
      gMct: oils.filter(it => it.food === "MCT-Öl C8+C10").reduce((a, it) => a + num(it.grams), 0),
      gRaps: oils.filter(it => it.food === "Rapsöl").reduce((a, it) => a + num(it.grams), 0),
    };
  }
  // Modus „zwischen“: Wassergaben für einen Tag aus Mahlzeiten mit dieser Flüssigkeit (Uhrzeiten unter Heute → Zeitplan).
  function zwischenText(d, mealFluidPer) {
    const wp = waterPlan(d, mealFluidPer * d.mahl, zeitTimes(d));
    const base = 'Mahlzeiten ' + d.mahl + ' × ' + fmt(mealFluidPer, 0) + ' ml';
    if (wp.per === 0) return '<div class="note tip">' + base + ' – das Tagesziel ist damit schon erreicht, keine Wassergaben nötig.</div>';
    return '<div class="note ' + (wp.over ? 'warn' : 'tip') + '">' + (wp.over ? '▲ ' : '') + base + ' + <strong>' + wp.n + ' × ' + fmt(wp.per, 0) + ' ml Wasser</strong> ≈ ' + fmt(wp.total, 0) + ' ml am Tag' +
      (wp.over ? ' · über ' + fmt(d.maxMahlMl, 0) + ' ml je Gabe' : '') + '</div>';
  }
  function regelZeile(d) {
    return '<div class="hint">Rechenregel: <strong>' + regelLabel(d) + '</strong> · <button type="button" class="tlink" data-goto="vorgaben">unter Vorgaben ändern</button></div>';
  }
  /* ---------- Blätter (Reiter am Desktop, Wisch-Seiten mit Punkten am Handy) – für Detail und Editor ---------- */
  function pagerHead(PAGES, cur, tabsId) {
    const tabBtn = (pg) => '<button type="button" data-dtab="' + pg[0] + '"' + (cur === pg[0] ? ' class="active" aria-selected="true"' : ' aria-selected="false"') + ' role="tab">' + pg[1] + "</button>";
    return '<div class="detail-tabs-wrap"><div class="seg-ink detail-tabs" role="tablist" id="' + tabsId + '">' + PAGES.map(tabBtn).join("") + "</div></div>";
  }
  // onChange(k): gewähltes Blatt merken; rerender(): am Desktop wird nach einem Reiterklick neu gezeichnet.
  function setupPager(c, PAGES, cur, onChange, rerender) {
    const mobile = isMobileLayout();
    const pages = c.querySelector(".pages");
    const panes = pages ? [...pages.querySelectorAll(":scope > .pane")] : [];
    const pageIdx = (k) => Math.max(0, PAGES.findIndex(pg => pg[0] === k));
    const leftOf = (i) => panes[i] && panes[0] ? panes[i].offsetLeft - panes[0].offsetLeft : 0;
    const markTab = (k) => {
      c.querySelectorAll(".detail-tabs button[data-dtab]").forEach(b => { b.classList.toggle("active", b.dataset.dtab === k); b.setAttribute("aria-selected", b.dataset.dtab === k ? "true" : "false"); });
    };
    const goTo = (k, smooth) => {
      const left = leftOf(pageIdx(k));
      if (smooth) { try { pages.scrollTo({ left: left, behavior: "smooth" }); return; } catch (e) {} }
      pages.scrollLeft = left;
    };
    let current = cur;
    if (mobile && pages) {
      goTo(cur, false);
      markTab(cur);
      let st = null;
      pages.addEventListener("scroll", () => {
        clearTimeout(st);
        st = setTimeout(() => {
          let best = 0, bd = Infinity;
          panes.forEach((p, i) => { const dd = Math.abs(leftOf(i) - pages.scrollLeft); if (dd < bd) { bd = dd; best = i; } });
          const k = PAGES[best][0];
          if (k !== current) { current = k; onChange(k); markTab(k); }
        }, 80);
      });
    }
    if (mobile && pages) bindMouseDrag(pages, panes);
    c.querySelectorAll(".detail-tabs button[data-dtab]").forEach(b =>
      b.addEventListener("click", () => {
        current = b.dataset.dtab; onChange(current);
        if (mobile && pages) { markTab(current); goTo(current, true); }
        else rerender();
      }));
  }
  // Blätter mit der Maus seitlich ziehen (Finger nutzen das native Scrollen mit Einrasten). An den Enden gibt
  // ein Gummiband von 25 % nach; beim Loslassen rastet das nächste Blatt ein.
  function bindMouseDrag(pages, panes) {
    let st = null;
    pages.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || (e.target.closest && e.target.closest("input, button, select, label, summary, a"))) return;
      st = { x0: e.clientX, left: pages.scrollLeft, moved: false };
    });
    pages.addEventListener("pointermove", (e) => {
      if (!st) return;
      const dx = e.clientX - st.x0; if (Math.abs(dx) > 4) st.moved = true;
      const max = pages.scrollWidth - pages.clientWidth, want = st.left - dx;
      pages.style.scrollSnapType = "none";
      if (want < 0) { pages.scrollLeft = 0; pages.style.transform = "translateX(" + Math.round(-want * 0.25) + "px)"; }
      else if (want > max) { pages.scrollLeft = max; pages.style.transform = "translateX(" + Math.round((max - want) * 0.25) + "px)"; }
      else { pages.scrollLeft = want; pages.style.transform = ""; }
    });
    const end = (e) => {
      if (!st) return;
      const dx = e.clientX - st.x0, w = pages.clientWidth || 1, moved = st.moved;
      const i0 = Math.round(st.left / w), i = Math.max(0, Math.min(panes.length - 1, i0 + (dx < -w * 0.2 ? 1 : dx > w * 0.2 ? -1 : 0)));
      st = null;
      pages.style.transition = "transform .2s ease-out"; pages.style.transform = "";
      setTimeout(() => { pages.style.transition = ""; pages.style.scrollSnapType = ""; }, 220);
      try { pages.scrollTo({ left: i * w, behavior: "smooth" }); } catch (err) { pages.scrollLeft = i * w; }
      if (moved) { const sw = (ev) => { ev.stopPropagation(); ev.preventDefault(); }; pages.addEventListener("click", sw, { capture: true, once: true }); setTimeout(() => pages.removeEventListener("click", sw, { capture: true }), 300); }
    };
    pages.addEventListener("pointerup", end);
    pages.addEventListener("pointerleave", end);
  }
  // Lässt sich das Rezept mit diesem Fleisch auf die Verordnung einstellen? (Bei sehr niedrigem Verhältnis bringt z. B. Rind
  // schon zu viel Fett mit – dann gibt es keine Lösung.)
  function meatSwapPossible(rec, d, k) {
    const slot = recipeMeatSlot(rec); if (!slot || !k || k === slot.baseKey) return true;
    return computeAdjustedRecipe(applyMeatChoice(rec, k), d.kcalMahl, d.ratio).ok;
  }
  // Mengen, Wasser oder MCT im Rezept geändert: auch Liste, Tagesplan, Kopf und Seitenleiste neu zeichnen
  // (sonst zeigen sie bis zum Neuladen die alten Werte, und der Tagesplan-Ausdruck mischt alt und neu)
  function detailChanged() { renderDetail(); if (typeof renderRezepte === "function") renderRezepte(); }
  function renderDetail() {
    const rec = detailRec;
    const d = derived();
    // Nicht mögliche Fleischwahl (z. B. nach geänderter Verordnung) zurücksetzen, statt still beim Original zu bleiben
    if (detailMeat && !meatSwapPossible(rec, d, detailMeat)) detailMeat = null;
    const mv = computeMealView(rec, d, detailMeat);
    // Lässt sich das Rezept nicht auf die Verordnung einstellen, sind seine Gramm unbrauchbar: keine Mengen, kein
    // Einplanen und kein Drucken – nur der Hinweis (z. B. nach geänderter Verordnung oder über einen alten Link).
    if (!mv.res.ok) {
      const cc = document.getElementById("detail-content");
      cc.innerHTML = '<div class="sheet-grip" aria-hidden="true"></div><div class="detail-head"><div class="dh-tags"><span class="ratio-pill bad">' +
        escapeHtml(fmtRxA(mv.res.ratio, 2)) + '</span></div><h2 class="title">' + displayHtml(rec) + '</h2></div>' +
        '<div class="pages"><section class="pane"><div class="pane-in"><div class="note warn">▲ Dieses Rezept lässt sich nicht auf die Verordnung (' +
        escapeHtml(fmtRx(d.ratio)) + ', ' + fmt(d.kcalMahl, 0) + ' kcal je Mahlzeit) einstellen. Bitte ein anderes Rezept wählen – die Mengen dieses Rezepts dürfen so nicht verwendet werden.</div></div></section></div>';
      return;
    }
    const res = mv.res, adjIndex = mv.adjIndex, adjLabel = mv.adjLabel;
    const baseOilIndex = mv.baseOilIndex, waterKey = mv.waterKey, hasWaterOverride = mv.hasWaterOverride;
    const mult = scaleMult(d); // gilt für die Blätter Tag und Kochen; das Blatt Mahlzeit zeigt immer eine Portion
    const items = res.items;
    const sumPer = sumMacros(items);
    const sum = { eiweiss: sumPer.eiweiss * mult, fett: sumPer.fett * mult, kh: sumPer.kh * mult, kcal: sumPer.kcal * mult };
    const r = ratioOf(sumPer);
    const totalG = items.reduce((a, it) => a + num(it.grams), 0) * mult;
    const ml = volumeMl(items) * mult;
    const proteinTarget = d.eiweissMahl * mult;
    const proteinOk = sum.eiweiss >= proteinTarget * 0.9;
    const pStateMeal = proteinState(sumPer.eiweiss, d.eiweissMahl), pStateQ = proteinState(sum.eiweiss, proteinTarget);
    const portionsTxt = (Math.abs(mult - Math.round(mult)) < 0.05 ? String(Math.round(mult)) : fmt(mult, 1));
    const days = scaleDays();
    const portionLabel = mult === 1 ? "1 Portion" : (days ? (days === 1 ? "1 Tag" : days + " Tage") + " = " : "") + portionsTxt + " Portionen";
    // Abfüllmenge je Portion OHNE Öl (das Öl wird danach in die abgefüllte Portion eingerührt).
    // Nur tatsächliche Öle abziehen (Name enthält "Öl") – Butter/Sahne/KetoCal bleiben in der Masse.
    const isOil = isOilName;
    const itemsNoOil = items.filter(it => !isOil(it.food));
    const hasOil = itemsNoOil.length !== items.length;
    const perGnoOil = itemsNoOil.reduce((a, it) => a + num(it.grams), 0);
    const perMlNoOil = volumeMl(itemsNoOil);
    // Öl-Bezeichnung im Zubereitungstext an den gewählten Öl-Mix anpassen.
    const oilWord = (baseOilIndex >= 0 && d.mctShare > 0)
      ? (d.mctShare >= 0.999 ? "MCT-Öl" : "Rapsöl + MCT-Öl") : null;
    const adaptOil = (t) => oilWord ? String(t).replace(/Rapsöl/g, oilWord) : t;
    // Varoma: Dämpfwasser mitverwenden. Topf-Wasser = Rezept-Wasser (skaliert)
    // + Verdunstungs-Reserve, sodass nach dem Dämpfen ≈ die Rezeptmenge übrig bleibt.
    const waterG = items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0) * mult;
    const bowlWater = Math.round(waterG + d.dampfVerdunstung);
    const adaptVaroma = (t) => {
      if (!t || waterG <= 0) return t;
      return t
        .replace("Ca. 500 ml Wasser in den Mixtopf geben (nur zum Dämpfen, wird nicht weiterverwendet).",
          "Ca. " + bowlWater + " ml Wasser in den Mixtopf geben (das Dämpfwasser wird später mitverwendet – es enthält wertvolle Stoffe" + (bowlWater < 300 ? "; mindestens ~300 ml, damit der Topf nicht trocken läuft" : "") + ").")
        .replace("Dämpfwasser abgießen. Die gedämpften Zutaten mit dem abgemessenen Wasser",
          "Das Dämpfwasser NICHT abgießen – davon " + Math.round(waterG) + " ml abmessen (ist weniger übrig, mit frischem Wasser auf " + Math.round(waterG) + " ml ergänzen; ist mehr übrig, den Rest nicht verwenden) und zusammen mit den gedämpften Zutaten");
    };

    // Gibt es das Gericht auch in der anderen Fettbasis, führt ein Link zum Geschwister-Rezept (Blatt Anpassen).
    // Nur Geschwister, die sich auf die Verordnung einstellen lassen (sonst wären ihre Mengen unbrauchbar)
    const sibs = siblingVariants(rec).filter(v => computeAdjustedRecipe(v, d.kcalMahl, d.ratio).ok);
    // Kopf: Verhältnis-Pille, grau Diätologie · Fettbasis · eigenes Rezept
    const headTags = [rec.quelle ? "Diätologie" : "", (rec.ketocal || sibs.length) ? escapeHtml(basisLabel(rec)) : "", rec.custom ? "eigenes Rezept" : ""].filter(Boolean);
    let basisSeg = "";
    if (sibs.length) {
      basisSeg = '<div class="adj-block basis"><div class="overline">Fettbasis</div><div class="adj-text">' + escapeHtml(basisLabel(rec)) + ' – dieses Gericht gibt es auch als eigenes Rezept mit eigenen Mengen:</div>' +
        sibs.map(v => '<button type="button" class="tlink" data-open-rec="' + escapeHtml(recipeKey(v)) + '">Auch als „' + escapeHtml(displayText(v)) + "“</button>").join("") + "</div>";
    }

    // Packungs-Hinweis (z. B. Compleat 500 ml, 3 Tage haltbar): reine Information, wie weit eine Packung reicht.
    let packInfoSeg = "";
    if (rec.packung) {
      const pk = rec.packung, mlMeal = items.filter(it => it.food === pk.food).reduce((a, it) => a + num(it.grams), 0);
      if (mlMeal > 0) {
        const nMeals = Math.floor(pk.ml / mlMeal + 1e-9), maxMeals = d.mahl * pk.tage;
        const usedInTage = Math.min(nMeals, maxMeals) * mlMeal;
        packInfoSeg = '<div class="note tip pack"><strong>Packung ' + pk.ml + ' ml</strong> (offen ' + pk.tage + ' Tage haltbar): ' +
          fmt(mlMeal, 0) + ' ml je Mahlzeit · reicht für <strong>' + nMeals + ' Mahlzeiten</strong>' +
          (nMeals > maxMeals ? ' · in ' + pk.tage + ' Tagen ' + maxMeals + ' verbraucht, <strong>' + fmt(pk.ml - usedInTage, 0) + ' ml verfallen</strong>'
            : nMeals < maxMeals ? ' · für ' + pk.tage + ' Tage (' + maxMeals + ' Mahlzeiten) reicht eine Packung nicht' : '') + '.</div>';
      }
    }
    const meatSlot = recipeMeatSlot(rec);
    let meatSeg = "";
    if (meatSlot) {
      const cur = detailMeat || meatSlot.baseKey;
      meatSeg = '<div class="adj-block meat-swap"><div class="overline">Fleisch</div><div class="seg-ink">' +
        ["huhn", "rind", "pute"].map(k => { const ok = meatSwapPossible(rec, d, k);
          return '<button type="button" data-meat="' + k + '"' + (k === cur ? ' class="active"' : "") + ' aria-pressed="' + (k === cur) + '"' +
            (ok ? "" : ' disabled title="Bei dieser Verordnung nicht möglich – mit ' + MEATS[k].label + ' lässt sich das Verhältnis nicht einstellen"') + ">" + MEATS[k].label + "</button>"; }).join("") +
        '</div><div class="adj-text">Gilt nur für diese Ansicht. Getauscht wird nach den Mengen der Diätologie (20 g Huhn ≙ 30 g Rind ≙ 18 g Pute); danach werden Verhältnis und Kalorien wie bei jedem Rezept neu eingestellt.</div></div>';
    }

    const sign = (v) => v < -0.05 ? "−" : (v > 0.05 ? "+" : "±");
    let oilSeg = "";
    if (baseOilIndex >= 0) {
      const sOil = d.mctShare, mm = res.mct || null;
      const shareBtn = (v) => '<button type="button" data-mcts="' + v + '"' + (Math.abs(sOil - v / 100) < 0.005 ? ' class="active"' : "") + ">" + v + " %</button>";
      const more = '<details class="more"><summary class="tlink">Mehr dazu</summary><p>Der Anteil bezieht sich auf die <strong>Öl-Fettmasse</strong>. Beim Tausch gegen ein Fett anderer Energiedichte lassen sich Fettmasse, Kalorien und Verhältnis nicht gleichzeitig halten – die Rechenregel (Vorgaben) legt fest, welche Größe exakt bleibt. ' +
        (sOil > 0 ? (d.mctMode === "kalorien"
          ? "<strong>Kalorien halten:</strong> Die Kalorien bleiben für jeden MCT-Anteil gleich; das Verhältnis steigt mit dem Anteil. "
          : "<strong>Verhältnis halten:</strong> Das Verhältnis bleibt für jeden MCT-Anteil exakt gleich; die Kalorien sinken mit dem Anteil (MCT liefert weniger kcal je Gramm). ") : "") +
        "MCT kann durch Capronsäure (C6) den Rachen reizen – klein beginnen, Verträglichkeit beobachten; besser verträglich ist weniger MCT je Mahlzeit, dafür in jeder Mahlzeit. MCT ist je kcal ketogener als langkettiges Fett, ein Tausch senkt die Ketose nicht. Die Vorbelegung 8,3 kcal/g ist ein <strong>Praxiswert</strong> – echte Etikettwerte unter Vorgaben eintragen.</p></details>";
      const note = !(sOil > 0) ? '<div class="adj-text">Gilt für alle Rezepte mit Öl, wie unter Vorgaben. Derzeit nur Rapsöl.</div>'
        : '<div class="adj-text">Gilt für alle Rezepte mit Öl, wie unter Vorgaben.</div>' +
          (mm ? '<div class="meat-note stat-line">MCT <strong>' + fmt(mm.gMct, 1) + ' g</strong> je Portion · <strong>' + fmt(mm.energiePz, 1) + ' %</strong> der Energie (' + mctEinordnung(mm.energiePz) + ') · ' + sign(mm.dev) + fmt(Math.abs(mm.dev), 1) + ' kcal je Portion, je Tag ' + sign(mm.dev) + fmt(Math.abs(mm.dev * d.mahl), 0) + ' kcal</div>' : "");
      // Warnhinweise aus der ungerundeten Rechnung (§5)
      let warn = "";
      if (mm) {
        if (mm.energiePz > 50) warn += '<div class="note warn">▲ Über dem gängigen Arbeitsbereich von 40–50 %. Die traditionelle MCT-Diät verwendet 60 % und kann Magen-Darm-Beschwerden verursachen.</div>';
        const devTag = mm.dev * d.mahl, kcalTag = mm.kcalNeu * d.mahl;
        if (d.mctMode !== "kalorien" && kcalTag < d.kcalMin - 0.5) warn += '<div class="note warn">▲ Mit diesem MCT-Anteil kämen nur ' + fmt(kcalTag, 0) + ' kcal/Tag zusammen – unter dem Minimum von ' + fmt(d.kcalMin, 0) + ' kcal. MCT-Anteil senken, Rechenregel „Kalorien halten“ wählen oder mit der Diätologie klären.</div>';
        else if (d.mctMode !== "kalorien" && devTag < -20) warn += '<div class="note info">Das Tagesziel wird um ' + fmt(-devTag, 0) + ' kcal unterschritten (Minimum ' + fmt(d.kcalMin, 0) + ' kcal/Tag ist eingehalten).</div>';
        if (d.mctMode === "kalorien" && (mm.ratioNeu - mm.ratioBasis) > 0.05) warn += '<div class="note warn">▲ Das Verhältnis steigt von ' + fmt(mm.ratioBasis, 2) + ' auf ' + fmt(mm.ratioNeu, 2) + '. Das ist eine Änderung der Verordnung, nicht der Fettart.</div>';
      }
      oilSeg = '<div class="adj-block meat-swap oil"><div class="overline">MCT-Anteil am Öl</div>' +
        '<div class="seg-ink">' + [0, 10, 20, 30, 50, 100].map(shareBtn).join("") + "</div>" +
        note + warn + (sOil > 0 ? regelZeile(d) : "") + more + "</div>";
    }

    // Zwei Sichten auf dieselben Zutaten: Blatt Mahlzeit (eine Portion) und Blatt Tag (Zubereitungsmenge), beide editierbar.
    // Zeile: Name (+ „stellt das Verhältnis ein“ / Herkunft des Wassers, Nährwerte als Mono-Zeile) · Grammfeld · Einheit.
    const nutrLine = (m) => '<small class="nutr">Eiweiß ' + fmt(m.eiweiss) + ' · Fett ' + fmt(m.fett) + ' · KH ' + fmt(m.kh) + ' · ' + fmt(m.kcal, 0) + ' kcal</small>';
    let kRows = "", nRows = "";
    items.forEach((it, i) => {
      const g = num(it.grams) * mult;
      const m = lineMacros({ food: it.food, grams: num(it.grams) }); // Blatt Mahlzeit: je Portion
      const isWaterRow = /wasser/i.test(it.food);
      const fatRow = isFatCarrier(items, i);
      const gR = fatRow ? roundTo(g, 0.1) : roundTo(g, isWaterRow ? 1 : d.rundung);
      const gTxt = (fatRow ? gR.toFixed(1) : String(gR)).replace(".", ","); // Fettträger immer mit einer Nachkommastelle („21,0“)
      // Wasserzeile: nur die Herkunft steht dabei; Anpassungen und ihr Zurücksetzen stehen in der Statuszeile.
      const waterTag = isWaterRow ? (hasWaterOverride ? '<small class="adj">eigener Wert</small>' : (mv.fluidAdjusted ? '<small class="adj">Flüssigkeitsziel</small>' : (mv.densityAdjusted ? '<small class="adj">höchstens ' + fmt(d.maxDichte, 1) + ' kcal/ml</small>' : ""))) : "";
      const mK = lineMacros({ food: it.food, grams: gR }); // Blatt Tag: für die Zubereitungsmenge
      const unit = '<span class="unit">' + (isWaterRow ? "ml" : "g") + "</span>";
      const label = (mm) => '<div class="ing-name"><span class="name">' + escapeHtml(it.food) + "</span>" + (i === adjIndex ? adjLabel : "") + waterTag + nutrLine(mm) + "</div>";
      kRows += '<div class="ing-row' + (i === adjIndex ? " fatrow" : "") + '">' + label(mK) +
        '<input class="amt-edit" type="text" autocomplete="off" inputmode="decimal" aria-label="' + escapeHtml(it.food) + '" data-g="' + gR + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gTxt + '">' + unit + "</div>";
      const gP = Math.round(num(it.grams) * 10) / 10;
      const gPTxt = (fatRow ? gP.toFixed(1) : String(gP)).replace(".", ",");
      nRows += '<div class="ing-row' + (i === adjIndex ? " fatrow" : "") + '">' + label(m) +
        '<input class="amt-edit g-edit" type="text" autocomplete="off" inputmode="decimal" aria-label="' + escapeHtml(it.food) + '" data-g="' + gP + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gPTxt + '">' + unit + "</div>";
    });
    const sumRow = (label, g, s) => '<div class="ing-row sum"><div class="ing-name"><span class="name">' + label + '</span>' + nutrLine(s) + '</div><span class="sum-g">' + fmt(g, 0) + '</span><span class="unit">g</span></div>';
    // Zubereitung als nummerierte Schritte (Varoma bevorzugt; Dämpfwasser-Rechnung ist darin enthalten).
    const prepText = rec.varoma
      ? adaptOil(adaptVaroma(adaptPrep(rec.varoma, rec, detailMeat)))
      : (rec.zubereitung ? adaptOil(adaptPrep(rec.zubereitung, rec, detailMeat)) : "");
    const steps = splitSteps(prepText);
    const oilStep = oilFeedStep(rec, items); if (oilStep && steps.length) steps.push(oilStep);
    const stepsHtml = steps.length ? "<ol class='steps" + (oilStep ? " oil-last" : "") + "'>" + steps.map(s => "<li>" + escapeHtml(s) + "</li>").join("") + "</ol>" : "";
    // Abfüllen: Öl-Zeilen je Portion (werden in die abgefüllte Portion eingerührt)
    const oilRowsPer = items.filter(it => isOil(it.food));
    // Vier Blätter: am Handy nebeneinander (seitlich wischen), am Desktop als Reiter.
    const TABMAP = { rechnen: "mahlzeit", kochen: "abwiegen", tag: "abwiegen", abfuellen: "zubereitung" }; // alte gespeicherte Werte
    const wanted = TABMAP[state.settings.detailTab] || state.settings.detailTab;
    const dtab = DETAIL_PAGES.some(pg => pg[0] === wanted) ? wanted : "mahlzeit";
    const mobile = isMobileLayout();
    const paneOpen = (k) => '<section class="pane" data-pane="' + k + '"' + (dtab !== k && !mobile ? " hidden" : "") + "><div class=\"pane-in\">";
    const paneClose = "</div></section>";

    // Ganzer Tag: eine Portion × Mahlzeiten pro Tag – unabhängig von der gewählten Portionenzahl.
    const dayN = d.mahl;
    const dayKcal = sumPer.kcal * dayN;
    const dayLow = dayKcal < d.kcalMin - 0.5, dayHigh = d.kcalMaxAuto && dayKcal > d.kcalMaxAuto + 0.5;
    // Flüssigkeit je Portion: Zutaten-Wasser + Rezept-Wasser, gegen den Anteil am Tagesbedarf.
    const waterPer = items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0);
    const fluidPer = mv.fluid, foodFluidPer = fluidPer - waterPer;
    const volPer = volumeMl(items), bigVol = d.maxMahlMl > 0 && volPer > d.maxMahlMl + 0.5;
    const fluidLine = d.fluidDay > 0
      ? '<div class="hint fluid-line">Flüssigkeit ≈ <strong>' + fmt(fluidPer, 0) + ' ml</strong> (Zutaten ' + fmt(foodFluidPer, 0) + ' + Wasser ' + fmt(waterPer, 0) + ')' +
        (d.wasserModus === "mahlzeit"
          ? ' · Ziel ' + fmt(d.fluidMahl, 0) + ' ml je Mahlzeit' + (mv.fluidAdjusted ? ' – Wasser dafür erhöht' : (fluidPer >= d.fluidMahl - 0.5 ? ' – erreicht' : ' – <strong>nicht erreicht</strong> (gemerktes Wasser)'))
          : (mv.densityAdjusted ? ' · Wasser so weit erhöht, dass die Mahlzeit höchstens ' + fmt(d.maxDichte, 1) + ' kcal/ml hat' : ' · Wasser nur zum Pürieren bzw. Anrühren') + ', der Rest kommt als Wassergaben') +
        (bigVol ? ' · <strong class="warn-txt">▲ ' + fmt(volPer, 0) + ' ml auf einmal, über ' + fmt(d.maxMahlMl, 0) + ' ml</strong>' : '') + '</div>'
      : "";
    const dayFluid = fluidPer * dayN, dayFluidZiel = d.fluidDay;
    const fluidDayNote = d.fluidDay > 0
      ? (d.wasserModus === "zwischen"
          ? zwischenText(d, fluidPer)
          : (dayFluid < dayFluidZiel - 3
              ? '<div class="note warn">▲ Der Tag liegt unter dem Flüssigkeitsziel – das gemerkte Wasser im Rezept ist kleiner als der rechnerische Anteil.</div>'
              : '<div class="note tip">Flüssigkeit ist in den Mahlzeiten dabei – Wasser je Rezept entsprechend erhöht, kein Sondieren zwischen den Mahlzeiten nötig.</div>'))
      : "";
    // Kennzahl (2 × 2 bzw. 3 nebeneinander): Wert Mono 600, darunter grau die Bezeichnung, gepunktet unten
    const fact = (cls, v, l, title) => '<div class="dstat' + (cls ? " " + cls : "") + '"' + (title ? ' title="' + title + '"' : "") + '><div class="v">' + v + '</div><div class="l">' + l + '</div></div>';

    // Blatt Tag: Kennzahlen für die Zubereitungsmenge (Standard: ein Tag); Ziele skalieren mit.
    const qTag = days === 1 ? "/Tag" : "";
    const qFluid = fluidPer * mult, qFluidZiel = days ? dayFluidZiel * days : d.fluidMahl * mult, qZiel = d.wasserModus === "mahlzeit";
    const qTiles = '<div class="detail-tiles facts">' +
        fact((days && dayLow) ? "warn" : "", fmt(sum.kcal, 0), "kcal" + qTag + " · Ziel " + fmt(d.kcalMahl * mult, 0)) +
        fact(pStateQ === "ok" ? "" : "warn", fmt(sum.eiweiss) + " g", "Eiweiß" + qTag + " · Ziel " + fmt(proteinTarget, 0) + " g", pStateQ === "high" ? "mehr als das Doppelte des Eiweiß-Ziels" : "") +
        fact("", fmt(ml, 0) + " ml", "Volumen" + qTag, "≈ " + fmt(totalG, 0) + " g") +
        (d.fluidDay > 0 ? fact(qZiel && qFluid < qFluidZiel - 3 * mult ? "warn" : "", fmt(qFluid, 0) + " ml", "Flüssigkeit" + qTag + (qZiel ? " · Ziel " + fmt(qFluidZiel, 0) + " ml" : " in Mahlzeiten"))
          : fact("", "≈ " + fmt(totalG, 0) + " g", "Menge" + qTag)) +
      "</div>";
    // Tages-Check nur als Warnung: Minimum unterschritten oder über dem Korridor.
    const dayCheck = dayLow
      ? '<div class="note warn">▲ Ein Tag nur mit diesem Rezept (' + dayN + ' × ' + fmt(dayKcal / dayN, 0) + ' kcal = ' + fmt(dayKcal, 0) + ' kcal) läge unter dem Minimum von ' + fmt(d.kcalMin, 0) + ' kcal – im Tagesplan mit anderen Mahlzeiten kombinieren.</div>'
      : (dayHigh ? '<div class="note warn">▲ Ein Tag nur mit diesem Rezept (' + dayN + ' × ' + fmt(dayKcal / dayN, 0) + ' kcal = ' + fmt(dayKcal, 0) + ' kcal) läge über dem Korridor (bis ' + fmt(d.kcalMaxAuto, 0) + ' kcal).</div>' : "");
    // Zubereitungsmenge: 1–3 ganze Tage (folgen der Mahlzeitenzahl) oder eine freie Portionenzahl (Stepper).
    const scaleBtn = (v, label) => '<button type="button" data-scale="' + v + '"' + ((v === "1" ? (!days && mult === 1) : detailScale === v) ? ' class="active"' : "") + ">" + label + "</button>";
    const scaleSeg =
      '<div class="seg-portion batch">' +
        '<div class="seg-ink">' + scaleBtn("tag", "1 Tag") + scaleBtn("tag:2", "2 Tage") + scaleBtn("tag:3", "3 Tage") + "</div>" +
        '<span class="portion-step" title="Portionen"><button type="button" class="stepbtn" data-step="-1" aria-label="eine Portion weniger">−</button>' +
        '<input id="portion-input" type="number" min="0.5" step="0.5" aria-label="Portionen" value="' + (Math.round(mult * 10) / 10) + '">' +
        '<button type="button" class="stepbtn" data-step="1" aria-label="eine Portion mehr">+</button></span>' +
      "</div>";
    // Statuszeile: alle temporären Änderungen (Portion, Wasser) samt Zurücksetzen an einer Stelle.
    let waterRef = null;
    if (hasWaterOverride) {
      const keep = state.water[waterKey]; delete state.water[waterKey];
      try { waterRef = computeMealView(rec, d, detailMeat).res.items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0); }
      finally { state.water[waterKey] = keep; }
    }
    const statusLine = (m, bezug) => {
      const parts = [];
      if (mv.hasPortion) parts.push('<strong>Portion angepasst: ' + fmt(mv.portionF * 100, 0) + ' %</strong> (' + fmt(sumPer.kcal * m, 0) + ' statt ' + fmt(mv.kcalBerechnet * m, 0) + ' kcal) <button type="button" class="tlink portion-reset">wie berechnet</button>');
      if (hasWaterOverride) parts.push('<strong>Wasser angepasst</strong> (' + fmt(waterPer * m, 0) + ' statt ' + fmt(waterRef * m, 0) + ' ml) <button type="button" class="tlink water-reset">wie berechnet</button>');
      return parts.length ? parts.join(" · ") : 'Wie berechnet · ' + fmt(d.kcalMahl * m, 0) + ' kcal ' + bezug;
    };
    const changed = mv.hasPortion || hasWaterOverride;
    const mealStatus = statusLine(1, "je Mahlzeit");
    // Anpassen: Fleisch (nur diese Ansicht) und MCT-Anteil (Vorgabe für alle Rezepte) samt Zurücksetzen.
    const mctOpen = detailMctOpen == null ? d.mctShare : detailMctOpen;
    const anpParts = [];
    if (meatSlot && detailMeat && detailMeat !== meatSlot.baseKey) anpParts.push('<strong>Fleisch getauscht: ' + MEATS[detailMeat].label + '</strong> (nur in dieser Ansicht) · <button type="button" class="tlink meat-reset">wie im Rezept</button>');
    if (baseOilIndex >= 0 && Math.abs(d.mctShare - mctOpen) > 0.001) anpParts.push('<strong>MCT-Anteil ' + fmt(d.mctShare * 100, 0) + ' %</strong> statt ' + fmt(mctOpen * 100, 0) + ' % – gilt für alle Rezepte (Vorgaben) · <button type="button" class="tlink mct-reset" data-mct="' + mctOpen + '">zurück auf ' + fmt(mctOpen * 100, 0) + ' %</button>');
    const anpassenStatus = anpParts.length ? anpParts.join(" · ")
      : 'Wie im Rezept' + (meatSlot ? ' · Fleisch gilt nur in dieser Ansicht' : '') + (baseOilIndex >= 0 ? ' · der MCT-Anteil ist die Vorgabe für alle Rezepte' : '');
    const tagStatus = statusLine(mult, days === 1 ? "je Tag" : (days ? "für " + days + " Tage" : "für " + portionsTxt + " Portionen"));
    const nutrOn = !!state.settings.detailNutr;
    const weighHead = (title) => '<div class="weigh-head"><h4 class="ph">' + title + '</h4><label class="nw-toggle"><input type="checkbox" class="nw-cb"' + (nutrOn ? " checked" : "") + '> Nährwerte</label></div>';
    const spritzen = Math.max(1, Math.ceil(volPer / 60 - 0.05));

    const c = document.getElementById("detail-content");
    c.classList.toggle("show-nutr", nutrOn);
    c.innerHTML =
      '<div class="sheet-grip" aria-hidden="true"></div>' +
      '<div class="detail-head"><div class="dh-tags"><span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmtRxA(r, 2) + "</span>" +
        headTags.map(t => '<span class="dh-tag">' + t + "</span>").join("") + "</div>" +
        '<h2 class="title">' + displayHtml(rec) + "</h2></div>" +
      pagerHead(DETAIL_PAGES, dtab, "detail-tabs") +
      '<div class="pages" id="detail-pages">' +

      /* ---------- 1 Mahlzeit (eine Portion) ---------- */
      paneOpen("mahlzeit") +
      '<div class="detail-tiles facts">' +
        fact(mv.hasPortion ? "warn" : "", fmt(sumPer.kcal, 0), "kcal · Ziel " + fmt(d.kcalMahl, 0)) +
        fact(pStateMeal === "ok" ? "" : "warn", fmt(sumPer.eiweiss) + " g", "Eiweiß · Ziel " + fmt(d.eiweissMahl)) +
        fact(bigVol ? "warn" : "", fmt(volPer, 0) + " ml", "Volumen", "≈ " + fmt(totalG / mult, 0) + " g") +
        (d.fluidDay > 0 ? fact("", fmt(fluidPer, 0) + " ml", "Flüssigkeit") : fact("", "≈ " + fmt(totalG / mult, 0) + " g", "Menge")) +
      "</div>" +
      (pStateMeal === "low" ? '<div class="note warn">▲ Eiweiß liegt unter dem Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
      (pStateMeal === "high" ? '<div class="note warn">▲ Eiweiß ' + fmt(sumPer.eiweiss / d.eiweissMahl, 1) + '-mal so hoch wie das Ziel. Viel Eiweiß kann die Ketose schwächen, bitte mit dem Team abklären.</div>' : "") +
      '<div class="portion-line' + (changed ? " changed" : "") + '">' + mealStatus + '</div>' +
      weighHead("Zum Abwiegen · eine Portion") +
      '<div class="ing-list">' + nRows + sumRow("Summe je Portion", totalG / mult, sumPer) + "</div>" +
      '<div class="hint foot-hint">Gramm ändern skaliert alle anderen Zutaten mit. Das Verhältnis bleibt.</div>' +
      fluidLine +
      paneClose +

      /* ---------- 2 Tag (Zubereitungsmenge, Standard ein Tag) ---------- */
      paneOpen("abwiegen") +
      scaleSeg +
      qTiles +
      '<div class="portion-line' + (changed ? " changed" : "") + '">' + tagStatus + '</div>' +
      weighHead("Zum Abwiegen für " + (mult === 1 ? "1 Portion" : (days === 1 ? "1 Tag = " : (days ? days + " Tage = " : "")) + portionsTxt + " Portionen")) +
      '<div class="ing-list kitchen">' + kRows + sumRow("Summe", totalG, sum) + "</div>" +
      dayCheck + fluidDayNote + packInfoSeg +
      paneClose +

      /* ---------- 3 Anpassen ---------- */
      paneOpen("anpassen") +
      ((basisSeg || meatSeg || oilSeg) ? '<div class="portion-line">' + anpassenStatus + '</div>' : "") +
      meatSeg + oilSeg + basisSeg +
      (!(basisSeg || meatSeg || oilSeg) ? '<div class="note info">Für dieses Gericht gibt es nichts umzuschalten.</div>' : "") +
      (rec.custom ? '<div class="adj-block"><div class="overline">Eigenes Rezept</div><button type="button" class="tlink danger" id="del-btn">Rezept löschen</button></div>' : "") +
      paneClose +

      /* ---------- 4 Kochen: Kennzahlen zum Abfüllen, darunter die Schritte ---------- */
      paneOpen("zubereitung") +
      '<div class="detail-tiles facts three fill-tiles">' +
        fact("", '<span class="fill-big">' + fmt(perGnoOil, 0) + ' g</span>', "je Portion" + (hasOil ? " ohne Öl" : "")) +
        fact("", fmt(volPer, 0) + " ml", "Volumen" + (hasOil ? " mit Öl" : "")) +
        fact("", spritzen + " × 60 ml", "Spritzen", "≈ " + fmt(volPer / 60, 1) + " Spritzen à 60 ml") +
      "</div>" +
      '<div class="portion-line">Abfüllen je Portion' + (hasOil ? ' – danach das Öl in die Portion einrühren' : '') +
        (mult !== 1 ? ' · gesamt ≈ ' + fmt((hasOil ? perGnoOil : totalG / mult) * mult, 0) + ' g = <strong>' + portionsTxt + ' × ' + fmt(perGnoOil, 0) + ' g</strong>' +
          (hasOil ? ' · Öl gesamt ' + oilRowsPer.map(it => escapeHtml(String(it.food).replace(/^MCT.*$/, "MCT").replace(/öl$/i, "")) + ' ' + fmt(num(it.grams) * mult, 0) + ' g').join(" + ") : '') : '') + '</div>' +
      // Hinweise: Sieb (Varoma), MCT-Menge, Garzeiten bei mehreren Portionen
      [rec.varoma ? 'Vor dem Abfüllen durch ein feines Sieb streichen (sonst verstopft die Spritze).' : "",
       res.mct ? 'MCT <strong>' + fmt(res.mct.gMct, 1) + ' g</strong> je Portion (' + fmt(res.mct.energiePz, 0) + ' % der Energie) – klein beginnen, Verträglichkeit beobachten.' : "",
       (mult !== 1 && !rec.angeruehrt) ? 'Garzeiten gelten für <strong>eine</strong> Portion – länger garen, bis alles weich ist; im Kühlschrank lagern.' : ""]
        .filter(Boolean).map(t => '<div class="note ' + (res.mct && res.mct.energiePz > 50 && /MCT/.test(t) ? "warn" : "tip") + '">' + t + '</div>').join("") +
      '<h4 class="ph steps-ph">' + (rec.varoma ? "Zubereitung mit Varoma (dämpfen)" : "Zubereitung") + "</h4>" +
      (stepsHtml || '<div class="note info">Keine Zubereitungsschritte hinterlegt.</div>') +
      paneClose +

      "</div>" + /* pages */
      '<div class="detail-actions" id="detail-actions"></div>';

    c.querySelectorAll(".seg-portion button[data-scale]").forEach(b =>
      b.addEventListener("click", () => { detailScale = parseScale(b.dataset.scale); persistScale(); renderDetail(); }));
    c.querySelectorAll(".seg-portion button[data-step]").forEach(b =>
      b.addEventListener("click", () => {
        detailScale = scaleFromPortions(Math.max(0.5, Math.round((mult + parseFloat(b.dataset.step)) * 2) / 2), d.mahl);
        persistScale(); renderDetail();
      }));
    const pin = c.querySelector("#portion-input");
    if (pin) pin.addEventListener("change", () => {
      const v = parseFloat(String(pin.value).replace(",", ".")); if (v > 0) { detailScale = scaleFromPortions(v, d.mahl); persistScale(); renderDetail(); }
    });
    // Blatt Mahlzeit: Gramm je Portion ändern → Portion-Faktor je Rezept (Wasser: gemerkter Wert je Portion)
    c.querySelectorAll(".g-edit").forEach(inp =>
      inp.addEventListener("change", () => {
        const oldG = parseFloat(inp.dataset.g); const nv = parseFloat(String(inp.value).replace(",", "."));
        if (inp.dataset.water === "1") { if (isFinite(nv) && nv >= 0) { state.water[waterKey] = nv; save(); detailChanged(); } return; }
        if (oldG > 0 && nv > 0) {
          const f = Math.round(mv.portionF * (nv / oldG) * 1000) / 1000;
          if (Math.abs(f - 1) < 1e-6) delete state.portion[waterKey]; else state.portion[waterKey] = f;
          save(); detailChanged();
        }
      }));
    c.querySelectorAll(".portion-reset").forEach(b =>
      b.addEventListener("click", () => { delete state.portion[waterKey]; save(); detailChanged(); }));
    c.querySelectorAll(".amt-edit:not(.g-edit)").forEach(inp =>
      inp.addEventListener("change", () => {
        const oldG = parseFloat(inp.dataset.g); const nv = parseFloat(String(inp.value).replace(",", "."));
        if (inp.dataset.water === "1") {
          // Nur das Wasser ändern – Rest bleibt; gemerkt wird der Wert je Portion.
          if (isFinite(nv) && nv >= 0) { state.water[waterKey] = nv / mult; save(); detailChanged(); }
          return;
        }
        if (oldG > 0 && nv > 0) {
          const f = Math.round(mv.portionF * (nv / oldG) * 1000) / 1000;
          if (Math.abs(f - 1) < 1e-6) delete state.portion[waterKey]; else state.portion[waterKey] = f;
          save(); detailChanged();
        }
      }));
    c.querySelectorAll(".meat-reset").forEach(b => b.addEventListener("click", () => { detailMeat = null; renderDetail(); }));
    c.querySelectorAll(".mct-reset").forEach(b => b.addEventListener("click", () => { state.settings.mctShare = num(b.dataset.mct); save(); detailChanged(); }));
    c.querySelectorAll(".water-reset").forEach(b =>
      b.addEventListener("click", () => { delete state.water[waterKey]; save(); detailChanged(); }));
    c.querySelectorAll("button[data-goto=vorgaben]").forEach(b =>
      b.addEventListener("click", () => { closeDetail(); showView("vorgaben"); }));
    c.querySelectorAll("button[data-open-rec]").forEach(b =>
      b.addEventListener("click", () => {
        const v = allRecipes().find(x => recipeKey(x) === b.dataset.openRec); if (!v) return;
        openRecipeDetail(v, true); // Geschwister-Rezept: gewählte Menge bleibt
      }));
    c.querySelectorAll(".meat-swap button[data-meat]").forEach(b =>
      b.addEventListener("click", () => {
        detailMeat = (meatSlot && b.dataset.meat === meatSlot.baseKey) ? null : b.dataset.meat;
        renderDetail();
      }));
    c.querySelectorAll(".meat-swap button[data-mcts]").forEach(b =>
      b.addEventListener("click", () => {
        state.settings.mctShare = num(b.dataset.mcts) / 100; save(); detailChanged();
      }));
    // Blätter: am Desktop Reiter (nur das aktive Blatt sichtbar), am Handy nebeneinander mit seitlichem Wischen.
    setupPager(c, DETAIL_PAGES, dtab, (k) => { state.settings.detailTab = k; save(); }, renderDetail);

    // Feste Fußleiste: „Für heute einplanen“ (Primär) · Editor · Drucken · Favorit als runde Knöpfe.
    // Eigene Rezepte löschen: Textlink auf dem Blatt Anpassen.
    const actions = c.querySelector("#detail-actions");
    const vh = (t) => '<span class="vh">' + t + '</span>';
    const todayBtn = el("button", { type: "button", class: "btn primary", id: "today-btn", "aria-haspopup": "true" }, "Für heute einplanen");
    todayBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleTodaySheet(rec); });
    actions.appendChild(todayBtn);
    const editBtn = el("button", { type: "button", class: "btn round-btn", id: "edit-btn", title: rec.custom ? "Bearbeiten" : "Im Editor öffnen" }, ICON.edit + vh(rec.custom ? "Bearbeiten" : "Editor"));
    editBtn.addEventListener("click", () => { const r = applyMeatChoice(rec, detailMeat); (rec.custom ? seedComposeFromSaved(r) : seedComposeFromRecipe(r)); closeDetail(); openCompose(); });
    actions.appendChild(editBtn);
    const printBtn = el("button", { type: "button", class: "btn round-btn", title: "Drucken" }, ICON.print + vh("Drucken"));
    printBtn.addEventListener("click", () => printRecipe(rec, res, d, mult));
    actions.appendChild(printBtn);
    const favBtn = el("button", { type: "button", class: "btn round-btn favbtn" + (isFav(rec) ? " on" : ""), title: "Favorit", "aria-pressed": isFav(rec) ? "true" : "false" }, ICON.star + vh("Favorit"));
    // Nur den Stern umschalten (Blatt, Menge und Fleischwahl bleiben) und die Liste dahinter gleich mitziehen.
    favBtn.addEventListener("click", () => {
      toggleFav(rec);
      favBtn.classList.toggle("on", isFav(rec)); favBtn.setAttribute("aria-pressed", isFav(rec) ? "true" : "false");
      renderRezepte();
    });
    actions.appendChild(favBtn);
    const del = c.querySelector("#del-btn");
    if (del) del.addEventListener("click", () => {
      if (confirm("Eigenes Rezept „" + displayText(rec) + "“ wirklich löschen?")) {
        state.savedRecipes = state.savedRecipes.filter(s => s.key !== rec.key);
        const fi = state.favorites.indexOf(rec.key); if (fi !== -1) state.favorites.splice(fi, 1);
        // Gemerkte Mengen, Plätze im Tagesplan und den Bezug im Editor mit aufräumen
        const fk = familyKey(rec);
        [state.portion, state.water, state.scales].forEach(m => { if (m) { delete m[fk]; delete m[rec.key]; } });
        state.dayPlan.forEach(sl => { if (sl && sl.key === rec.key) sl.key = null; });
        if (state.compose && state.compose.editKey === rec.key) state.compose.editKey = null;
        save(); closeDetail(); renderRezepte();
      }
    });
    // Nährwerte je Zutat ein-/ausblenden (gemerkt, gilt für beide Blätter)
    c.querySelectorAll(".nw-cb").forEach(cb => cb.addEventListener("change", () => {
      state.settings.detailNutr = cb.checked; save();
      c.classList.toggle("show-nutr", cb.checked);
      c.querySelectorAll(".nw-cb").forEach(o => { o.checked = cb.checked; });
    }));
  }

  /* ---------- „Für heute“: Rezept in den Tagesplan übernehmen ----------
     Auswahl über der Aktionsleiste: alle Mahlzeiten, nur freie oder eine einzelne (mit Uhrzeit aus dem Zeitplan).
     Danach eine Meldung mit „Rückgängig“ (stellt den vorherigen Plan her) und „Ansehen“ (wechselt zu Heute). */
  function closeTodaySheet() { const sh = document.getElementById("today-sheet"); if (sh) sh.remove(); }
  function toggleTodaySheet(rec) {
    if (document.getElementById("today-sheet")) { closeTodaySheet(); return; }
    const d = derived(); ensureDayPlan(d);
    const key = recipeKey(rec), times = zeitTimes(d);
    const free = state.dayPlan.map((sl, i) => recipeByKey(sl && sl.key) ? -1 : i).filter(i => i >= 0);
    const filled = d.mahl - free.length;
    const opt = (val, main, sub, cls) => '<button type="button" class="today-opt' + (cls ? " " + cls : "") + '" data-today="' + val + '"><span>' + main + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
    let html = '<div class="today-title">In den Tagesplan übernehmen</div>' +
      opt("all", "Alle " + d.mahl + " Mahlzeiten", filled ? "ersetzt den bisherigen Plan" : "", "main");
    if (filled && free.length) html += opt("free", "Nur freie Mahlzeiten (" + free.length + ")", "gewählte Rezepte bleiben");
    html += '<div class="today-sep">oder eine Mahlzeit ersetzen</div>';
    state.dayPlan.forEach((sl, i) => {
      const cur = recipeByKey(sl && sl.key), same = sl && sl.key === key;
      html += opt(String(i), fmtHM(times.meals[i]) + " · Mahlzeit " + (i + 1) + (same ? " ✓" : ""), cur ? escapeHtml(displayText(cur)) : "frei", same ? "same" : "");
    });
    const sh = el("div", { class: "today-sheet", id: "today-sheet", role: "menu" }, html);
    const actions = document.getElementById("detail-actions");
    actions.parentNode.insertBefore(sh, actions);
    sh.addEventListener("click", (e) => e.stopPropagation());
    sh.querySelectorAll("[data-today]").forEach(b => b.addEventListener("click", () => {
      const v = b.dataset.today, prev = state.dayPlan.map(sl => ({ key: sl ? sl.key : null }));
      const idx = v === "all" ? state.dayPlan.map((_, i) => i) : v === "free" ? free : [num(v)];
      idx.forEach(i => { state.dayPlan[i] = { key }; });
      save(); closeTodaySheet(); renderRezepte();
      const what = v === "all" ? "für alle " + d.mahl + " Mahlzeiten" : v === "free" ? "für " + idx.length + " freie Mahlzeit" + (idx.length === 1 ? "" : "en") : "für Mahlzeit " + (idx[0] + 1) + " (" + fmtHM(times.meals[idx[0]]) + ")";
      showToast(escapeHtml(displayText(rec)) + " " + what + " übernommen", [
        ["Rückgängig", () => { state.dayPlan = prev; save(); renderRezepte(); }],
        ["Ansehen", () => { closeDetail(); showView("heute"); }],
      ]);
    }));
  }

  function seedComposeFromSaved(sr) {
    const base = sr.items.map(it => ({ food: it.food, grams: num(it.grams) }));
    const fi = fatItemIndex(base);
    let fats, items;
    if (fi >= 0) { fats = [{ food: base[fi].food, share: 100 }]; items = base.filter((_, i) => i !== fi); }
    else { fats = [{ food: "Butter", share: 100 }]; items = base; }
    if (!items.length) items = [{ food: "", grams: 30 }];
    state.compose = { items: items.map(it => ({ food: it.food, grams: it.grams })), fats: fats, scale: true, fromRecipe: sr.name, editKey: sr.key };
    save();
  }

  // Übernimmt ein Rezept in den freien Rechner (Zutaten editierbar, Fett wird neu berechnet)
  function seedComposeFromRecipe(rec) {
    const base = rec.items.map(it => ({ food: it.food, grams: num(it.grams) }));
    const fi = fatItemIndex(base);
    let fats, items;
    if (fi >= 0) { fats = [{ food: base[fi].food, share: 100 }]; items = base.filter((_, i) => i !== fi); }
    else { fats = [{ food: "Butter", share: 100 }]; items = base; }
    if (!items.length) items = [{ food: "", grams: 30 }];
    state.compose = { items: items.map(it => ({ food: it.food, grams: it.grams })), fats: fats, scale: true, fromRecipe: rec.name };
    save();
  }
  function closeDetail() {
    closeTodaySheet();
    if (panelMode()) return; // Panel am Desktop bleibt stehen (es gibt dort kein Schließen)
    document.getElementById("detail-overlay").hidden = true; detailPicked = false;
    if (detailModal) { modalClose("detail"); detailModal = false; }
  }
  // Nach unten wischen schließt das Overlay – überall auf der Karte und auf jedem Blatt. Der Wisch zählt nur,
  // wenn der Inhalt unter dem Finger ganz oben steht (sonst scrollt er wie gewohnt nach oben) und die Bewegung
  // eher senkrecht als waagrecht ist (waagrecht blättert die Seiten). Im gerade bearbeiteten Eingabefeld und
  // in der „Für heute“-Auswahl wird nicht gezogen. Das Sheet folgt dem Finger (das Overlay wird dabei heller);
  // ab 140 px oder bei schnellem Wisch (> 0,6 px/ms und > 40 px) schließt es mit 220 ms, sonst federt es zurück.
  // Nach einem Zug löst das Loslassen keinen Klick aus.
  function bindSwipeDown(overlay, onClose) {
    const card = overlay.querySelector(".overlay-card"); if (!card) return;
    let st = null; // { x0, y0, t0, mode: null | "pull" | "skip" }
    const pt = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    const scrolledDown = (el) => {
      // Steht irgendein scrollbarer Behälter zwischen Finger und Overlay nicht ganz oben?
      for (let n = el; n && n !== overlay.parentNode; n = n.parentElement) {
        if (n.scrollTop > 0) { const oy = getComputedStyle(n).overflowY; if (oy === "auto" || oy === "scroll") return true; }
        if (n === overlay) break;
      }
      return false;
    };
    overlay.addEventListener("touchstart", (e) => {
      st = null;
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.target;
      if (!t || !t.closest || !t.closest(".overlay-card")) return;
      // Gramm-Felder: Ziehen darüber zählt (ein Zug fokussiert nicht), nur nicht während darin getippt wird
      if (t.closest("textarea, select, [contenteditable], .today-sheet") || (t.closest("input") && t.closest("input") === document.activeElement)) return;
      const p = pt(e);
      st = { x0: p.clientX, y0: p.clientY, t0: Date.now(), mode: scrolledDown(t) ? "skip" : null };
    }, { passive: true });
    overlay.addEventListener("touchmove", (e) => {
      if (!st || st.mode === "skip") return;
      const p = pt(e), dy = p.clientY - st.y0, dx = p.clientX - st.x0;
      if (st.mode === null) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        st.mode = (dy > 0 && dy > Math.abs(dx)) ? "pull" : "skip";
        if (st.mode === "skip") return;
        card.style.transition = "none";
      }
      if (e.cancelable) e.preventDefault(); // kein Gummiband-Scrollen, solange die Karte gezogen wird
      card.style.transform = "translateY(" + Math.max(0, dy) + "px)";
      overlay.style.backgroundColor = "rgba(42,38,33," + (0.4 * Math.max(0.15, 1 - Math.max(0, dy) / 400)).toFixed(3) + ")";
    }, { passive: false });
    const end = (e) => {
      if (!st) return;
      const was = st; st = null;
      if (was.mode !== "pull") return;
      const p = pt(e), dy = p.clientY - was.y0, dt = Math.max(1, Date.now() - was.t0), fast = dy / dt > 0.6 && dy > 40;
      card.style.transition = "transform .22s ease-out";
      overlay.style.transition = "background-color .22s ease-out";
      // Nach dem Zug den folgenden Klick schlucken (sonst öffnet z. B. ein Tipp auf eine Zeile etwas)
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      overlay.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => overlay.removeEventListener("click", swallow, { capture: true }), 350);
      if (dy > 140 || fast) { card.style.transform = "translateY(100%)"; setTimeout(() => { card.style.transform = ""; card.style.transition = ""; overlay.style.backgroundColor = ""; overlay.style.transition = ""; onClose(); }, 220); }
      else { card.style.transform = ""; overlay.style.backgroundColor = ""; setTimeout(() => { card.style.transition = ""; overlay.style.transition = ""; }, 240); }
    };
    overlay.addEventListener("touchend", end, { passive: true });
    overlay.addEventListener("touchcancel", end, { passive: true });
  }
  function bindDetail() {
    const overlay = document.getElementById("detail-overlay");
    document.getElementById("detail-close").addEventListener("click", closeDetail);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeDetail(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !overlay.hidden && topLayer() === "detail-overlay") closeDetail(); });
    bindSwipeDown(overlay, closeDetail);
    // Auswahl „Für heute“ schließt bei Klick daneben oder Escape
    overlay.addEventListener("click", () => closeTodaySheet());
    document.addEventListener("keydown", e => { if (e.key === "Escape" && topLayer() === "today-sheet") closeTodaySheet(); });
  }
