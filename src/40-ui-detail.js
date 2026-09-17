  /* ---------- Detailansicht (Overlay) ---------- */
  // Blätter der Detailansicht in Reihenfolge. „Abwiegen“ enthält auch den Tages-Check (früher eigenes Blatt „Ein Tag“).
  const DETAIL_PAGES = [["mahlzeit", "🍽️ Mahlzeit"], ["abwiegen", "📅 Tag"], ["anpassen", "🎛️ Anpassen"], ["zubereitung", "🍳 Kochen"]];
  function isMobileLayout() { try { return !!(window.matchMedia && window.matchMedia("(max-width: 820px)").matches); } catch (e) { return false; } }
  // detailScale: Zubereitungsmenge – Zahl (Portionen) oder "tag" / "tag:N" (= N ganze Tage, folgt der Mahlzeitenzahl).
  // detailMeat: temporäre Fleischwahl.
  let detailRec = null, detailScale = "tag", detailMeat = null;
  const scaleDays = () => typeof detailScale === "string" && /^tag(:\d+)?$/.test(detailScale) ? Math.max(1, parseInt(detailScale.split(":")[1] || "1", 10)) : 0;
  const parseScale = (sv) => (typeof sv === "string" && /^tag(:\d+)?$/.test(sv)) ? sv : (num(sv) > 0 ? num(sv) : "tag");
  // Die Zubereitungsmenge gilt nur für die offene Ansicht: jedes Rezept öffnet mit „1 Tag“ (nichts wird gemerkt).
  function persistScale() {}
  function scaleMult(d) { const days = scaleDays(); return days ? days * d.mahl : (num(detailScale) > 0 ? num(detailScale) : 1); }
  function openRecipeDetail(rec, keepScale) {
    detailRec = rec; if (!keepScale) detailScale = "tag"; detailMeat = null;
    state.settings.detailTab = "mahlzeit"; // jedes Rezept öffnet mit „Mahlzeit“; innerhalb der Ansicht bleibt das gewählte Blatt
    renderDetail();
    const overlay = document.getElementById("detail-overlay");
    overlay.hidden = false;
    document.body.classList.add("modal-open");
  }
  // Eine Mahlzeit vollständig berechnen – dieselbe Pipeline für Detailansicht und Tagesplan:
  // Basis (Verhältnis + kcal/Mahlzeit) → optionaler Fleisch-Tausch → Öl-Mix (MCT-Anteil)
  // → gemerktes Wasser. Ergebnis ist eine Portion (= eine Mahlzeit).
  function computeMealView(rec, d, meatChoice) {
    const base = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
    let res = base;
    let adjIndex = base.fatIndex, adjLabel = '<small class="adj">⟵ stellt das Verhältnis ein</small>';
    const swapSlot = recipeMeatSlot(rec);
    if (swapSlot && meatChoice && meatChoice !== swapSlot.baseKey) {
      // Nur das Fleisch wird getauscht; Gemüse, Wasser UND Öl/Fett bleiben gleich.
      // Die Fleischmenge wird so berechnet, dass das Verhältnis exakt stimmt.
      const swapped = base.items.map((it, i) => i === swapSlot.index
        ? { food: MEATS[meatChoice].food, grams: num(it.grams) }
        : { food: it.food, grams: num(it.grams) });
      const solved = solveMeatForRatio(swapped, swapSlot.index, d.ratio);
      if (solved) {
        const sm = sumMacros(solved);
        res = { items: solved, ratio: ratioOf(sm), kcal: sm.kcal, ok: true, fatIndex: base.fatIndex };
        adjIndex = swapSlot.index; adjLabel = '<small class="adj">⟵ stellt das Verhältnis ein</small>';
      }
    }
    // Öl-Mix (Rapsöl/MCT): Anteil s + Modus aus den Vorgaben; s = 0 lässt alles unverändert.
    // kcal-Ziel für den Modus KALORIEN = Kalorien der Ansicht bei s = 0 (Basis bzw.
    // nach Fleisch-Tausch), damit "kcal konstant" sich auf den sichtbaren Ist-Zustand bezieht.
    const baseOilIndex = oilSlotIndex(res.items);
    const kcalZielOil = sumMacros(res.items).kcal;
    if (baseOilIndex >= 0 && d.mctShare > 0) res = applyOilMix(res, d, d.mctShare, d.mctMode, kcalZielOil);
    // Portion angepasst (Rechnen): ein Wert wurde händisch geändert, alle Zutaten skalieren proportional mit
    // (je Rezept gemerkt). Das Verhältnis bleibt, kcal je Mahlzeit ändern sich – Tagesplan und „Ein Tag“ rechnen damit.
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
      const items2 = res.items.map(it => {
        if (!isW(it)) return it;
        let g;
        if (sumW > 0) g = num(it.grams) * target / sumW; else { g = first ? target : 0; first = false; }
        return { food: it.food, grams: round1(g) };
      });
      const sm2 = sumMacros(items2);
      res = Object.assign({}, res, { items: items2, ratio: ratioOf(sm2), kcal: sm2.kcal });
    }
    // Flüssigkeit „in den Mahlzeiten“: Wasser so setzen, dass die Mahlzeit ihren Anteil am Tagesbedarf liefert
    // (Zutaten-Wasser + Wasser = Flüssigkeit je Mahlzeit). Nie weniger als das Rezept-Wasser; gemerktes Wasser hat Vorrang.
    // Modus „zwischen“: dasselbe mit dem Rest nach den Zwischenzeiten, aber nur bis zur Höchstmenge je Mahlzeit (Bolus).
    let fluidAdjusted = false, waterCapped = false;
    if (d.fluidMahl > 0 && !hasWaterOverride) {
      const isW2 = (it) => /wasser/i.test(it.food);
      const foodFluid = fluidOf(res.items.filter(it => !isW2(it)));
      const stdWater = res.items.filter(isW2).reduce((a, it) => a + num(it.grams), 0);
      let need = d.fluidMahl - foodFluid;
      if (d.wasserModus === "zwischen" && d.maxMahlMl > 0) {
        const room = d.maxMahlMl - volumeMl(res.items.filter(it => !isW2(it)));
        if (room < need) { need = room; waterCapped = true; }
      }
      if (need > stdWater + 0.05) {
        const items3 = stdWater > 0
          ? res.items.map(it => isW2(it) ? { food: it.food, grams: round1(num(it.grams) * need / stdWater) } : it)
          : res.items.concat([{ food: "Wasser", grams: round1(need) }]);
        res = Object.assign({}, res, { items: items3 });
        fluidAdjusted = true;
      }
    }
    // Zum Schluss: Rundung fürs Abwiegen (Vorgabe „Rundung“), Verhältnis über die Fettträger nachgestellt.
    {
      const itemsR = roundForScale(res.items, d.rundung);
      const smR = sumMacros(itemsR);
      res = Object.assign({}, res, { items: itemsR, ratio: ratioOf(smR), kcal: smR.kcal });
    }
    const fluid = fluidOf(res.items);
    return { res, adjIndex, adjLabel, baseOilIndex, waterKey, hasWaterOverride, fluidAdjusted, waterCapped, fluid,
      portionF: hasPortion ? portionF : 1, hasPortion, kcalBerechnet };
  }
  // Kennzahlen einer Mahlzeit fürs Füttern/Tagesplan (eine Portion).
  function mealFacts(rec, d) {
    const mv = computeMealView(rec, d, null);
    const items = mv.res.items;
    const isOilN = (n) => /öl|oil/i.test(n || "");
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
  // Hinweis auf die globale Rechenregel (Vorgaben) – gilt für MCT und Packung gleichermaßen.
  // Wassergaben „zwischen den Mahlzeiten“: bei N Mahlzeiten N−1 Zwischenzeiten (mindestens 1).
  function gaps(n) { return Math.max(1, Math.round(n) - 1); }
  // Modus „zwischen“: feste Wassergabe je Zwischenzeit; fehlt danach noch etwas (Höchstmenge je Mahlzeit erreicht), wird es genannt.
  function zwischenText(d, rest, n) {
    const g = gaps(n), plan = d.zwischenMl * g, diff = rest - plan; // Toleranz 3 ml (Wasser wird je Mahlzeit auf 1 ml gerundet)
    if (diff > 3) return '<div class="note warn">💧 Zwischen den Mahlzeiten: ' + g + ' × ' + fmt(d.zwischenMl, 0) + ' ml (Vorgabe). Damit fehlen am Tag noch <strong>' + fmt(diff, 0) + ' ml</strong>, weil die Mahlzeiten an der Höchstmenge (' + fmt(d.maxMahlMl, 0) + ' ml, 25 ml/kg) liegen – Wasser je Zwischenzeit auf ≈ ' + fmt(rest / g, 0) + ' ml erhöhen oder eine Wassergabe mehr einplanen.</div>';
    if (diff < -3) return '<div class="note tip">💧 Zwischen den Mahlzeiten reichen <strong>' + fmt(Math.max(0, rest), 0) + ' ml</strong> (' + g + ' × ≈ ' + fmt(Math.max(0, rest) / g, 0) + ' ml) – die Mahlzeiten liefern schon mehr als geplant.</div>';
    return '<div class="note tip">💧 Zwischen den Mahlzeiten: <strong>' + g + ' × ' + fmt(d.zwischenMl, 0) + ' ml</strong> (je eine Spritze) – Tagesbedarf ' + fmt(d.fluidDay, 0) + ' ml erreicht.</div>';
  }
  function regelZeile(d) {
    return '<div class="hint" style="margin-top:8px">Rechenregel: <strong>' + regelLabel(d) + '</strong> · <button type="button" class="linkbtn" data-goto="vorgaben">unter Vorgaben ändern</button></div>';
  }
  function renderDetail() {
    const rec = detailRec;
    const d = derived();
    const mv = computeMealView(rec, d, detailMeat);
    const res = mv.res, adjIndex = mv.adjIndex, adjLabel = mv.adjLabel;
    const baseOilIndex = mv.baseOilIndex, waterKey = mv.waterKey, hasWaterOverride = mv.hasWaterOverride;
    const mult = scaleMult(d); // gilt für Kochen und Abfüllen; Rechnen zeigt immer eine Portion
    const items = res.items;
    const sumPer = sumMacros(items);
    const sum = { eiweiss: sumPer.eiweiss * mult, fett: sumPer.fett * mult, kh: sumPer.kh * mult, kcal: sumPer.kcal * mult };
    const r = ratioOf(sumPer);
    const totalG = items.reduce((a, it) => a + num(it.grams), 0) * mult;
    const ml = volumeMl(items) * mult;
    const proteinTarget = d.eiweissMahl * mult;
    const proteinOk = sum.eiweiss >= proteinTarget * 0.9;
    const portionsTxt = (Math.abs(mult - Math.round(mult)) < 0.05 ? String(Math.round(mult)) : fmt(mult, 1));
    const days = scaleDays();
    const portionLabel = mult === 1 ? "1 Portion" : (days ? (days === 1 ? "1 Tag" : days + " Tage") + " = " : "") + portionsTxt + " Portionen";
    // Abfüllmenge je Portion OHNE Öl (das Öl wird erst kurz vor dem Verabreichen zugegeben).
    // Nur tatsächliche Öle abziehen (Name enthält "Öl") – Butter/Sahne/KetoCal bleiben in der Masse.
    const isOil = (name) => /öl|oil/i.test(name || "");
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
        .replace("Dämpfwasser abgießen. Die gedämpften Zutaten mit dem abgemessenen Wasser und Rapsöl",
          "Das Dämpfwasser NICHT abgießen – davon " + Math.round(waterG) + " ml abmessen (ist weniger übrig, mit frischem Wasser auf " + Math.round(waterG) + " ml ergänzen; ist mehr übrig, den Rest nicht verwenden) und mit den gedämpften Zutaten und Rapsöl");
    };

    const ketoBadge = (rec.ketocal
      ? '<span class="badge keto">mit KetoCal</span>'
      : '<span class="badge noketo">ohne KetoCal</span>') +
      (rec.quelle ? ' <span class="badge quelle">👩‍⚕️ Diätologie</span>' : "");

    // Fettbasis-Umschalter: gleiches Gericht, andere Variante (z. B. Rapsöl ↔ KetoCal + Butter).
    // Gibt es das Gericht auch in der anderen Fettbasis, führt ein Link zum Geschwister-Rezept.
    const sibs = siblingVariants(rec);
    let basisSeg = "";
    if (sibs.length) {
      basisSeg = '<div class="meat-swap basis"><div class="seg-label">🧈 Fettbasis: ' + (rec.ketocal ? "🥄 " : "") + escapeHtml(basisLabel(rec)) + '</div>' +
        '<div class="hint">Dieses Gericht gibt es auch als ' + sibs.map(v => '<button type="button" class="linkbtn" data-open-rec="' + escapeHtml(recipeKey(v)) + '">' + (v.ketocal ? "🥄 " : "") + escapeHtml(basisLabel(v)) + "</button>").join(", ") + " – eigenes Rezept mit eigenen Mengen.</div></div>";
    }

    // Packungs-Hinweis (z. B. Compleat 500 ml, 2 Tage haltbar): reine Information, wie weit eine Packung reicht.
    let packInfoSeg = "";
    if (rec.packung) {
      const pk = rec.packung, mlMeal = items.filter(it => it.food === pk.food).reduce((a, it) => a + num(it.grams), 0);
      if (mlMeal > 0) {
        const nMeals = Math.floor(pk.ml / mlMeal + 1e-9), maxMeals = d.mahl * pk.tage;
        const usedInTage = Math.min(nMeals, maxMeals) * mlMeal;
        // Kurz und kompakt: Menge je Mahlzeit, Reichweite, Verfall.
        // Gleiche Darstellung wie der Wasser-Hinweis darüber (grüne Notiz).
        packInfoSeg = '<div class="note tip pack">🧃 <strong>Packung ' + pk.ml + ' ml</strong> (offen ' + pk.tage + ' Tage haltbar): ' +
          fmt(mlMeal, 0) + ' ml je Mahlzeit · reicht für <strong>' + nMeals + ' Mahlzeiten</strong>' +
          (nMeals > maxMeals ? ' · in ' + pk.tage + ' Tagen ' + maxMeals + ' verbraucht, <strong>' + fmt(pk.ml - usedInTage, 0) + ' ml verfallen</strong>'
            : nMeals < maxMeals ? ' · für ' + pk.tage + ' Tage (' + maxMeals + ' Mahlzeiten) reicht eine Packung nicht' : '') + '.</div>';
      }
    }
    const meatSlot = recipeMeatSlot(rec);
    let meatSeg = "";
    if (meatSlot) {
      const cur = detailMeat || meatSlot.baseKey;
      meatSeg = '<div class="meat-swap"><div class="seg-label">🍖 Fleisch tauschen</div><div class="segmented mini">' +
        ["huhn", "rind", "pute"].map(k =>
          '<button type="button" data-meat="' + k + '"' + (k === cur ? ' class="active"' : "") + ">" +
          MEATS[k].icon + " " + MEATS[k].label + "</button>"
        ).join("") +
        '</div><details class="collapsible mini"><summary>ⓘ Was ändert sich?</summary><p>Nur das Fleisch – Gemüse, Wasser und Öl/Fett bleiben gleich. Die Fleischmenge wird so berechnet, dass das Verhältnis genau stimmt (sie kann daher etwas von 30 g / 18 g abweichen; die Kalorien können leicht variieren).</p></details></div>';
    }

    const sign = (v) => v < -0.05 ? "−" : (v > 0.05 ? "+" : "±");
    let oilSeg = "";
    if (baseOilIndex >= 0) {
      const sOil = d.mctShare, mm = res.mct || null;
      const shareBtn = (v) => '<button type="button" data-mcts="' + v + '"' + (Math.abs(sOil - v / 100) < 0.005 ? ' class="active"' : "") + ">" + v + " %</button>";
      // Sichtbar bleibt eine Zeile (Kennzahlen bzw. „nur Rapsöl“), die Erklärung ist eingeklappt.
      let note;
      if (!(sOil > 0)) {
        note = '<div class="meat-note">Nur Rapsöl.</div>' +
          '<details class="collapsible mini"><summary>ⓘ Was bedeutet der MCT-Anteil?</summary><p>Der Anteil bezieht sich auf die <strong>Öl-Fettmasse</strong>. Beim Tausch gegen ein Fett anderer Energiedichte lassen sich Fettmasse, Kalorien und Verhältnis nicht gleichzeitig halten – die Rechenregel (Vorgaben) legt fest, welche Größe exakt bleibt. MCT kann durch Capronsäure (C6) den Rachen reizen: klein beginnen, lieber wenig je Mahlzeit, dafür in jeder Mahlzeit.</p></details>';
      } else {
        note = (mm ? '<div class="meat-note stat-line">MCT <strong>' + fmt(mm.gMct, 1) + ' g</strong> je Portion · <strong>' + fmt(mm.energiePz, 1) + ' %</strong> der Energie (' + mctEinordnung(mm.energiePz) + ') · ' + sign(mm.dev) + fmt(Math.abs(mm.dev), 1) + ' kcal je Portion, je Tag ' + sign(mm.dev) + fmt(Math.abs(mm.dev * d.mahl), 0) + ' kcal</div>' : "") +
          '<details class="collapsible mini"><summary>ⓘ Was bedeutet der MCT-Anteil?</summary><p>' +
          (d.mctMode === "kalorien"
            ? "🎯 <strong>Kalorien halten:</strong> Die Kalorien bleiben für jeden MCT-Anteil gleich; das Verhältnis steigt mit dem Anteil."
            : "⚖️ <strong>Verhältnis halten:</strong> Das Verhältnis bleibt für jeden MCT-Anteil exakt gleich; die Kalorien sinken mit dem Anteil (MCT liefert weniger kcal je Gramm).") +
          " ⚠️ MCT kann durch Capronsäure (C6) den Rachen reizen – klein beginnen, Verträglichkeit beobachten. MCT ist je kcal ketogener als langkettiges Fett, ein Tausch senkt die Ketose nicht; besser verträglich ist weniger MCT je Mahlzeit, dafür in jeder Mahlzeit. Die Vorbelegung 8,3 kcal/g ist ein <strong>Praxiswert</strong> – echte Etikettwerte unter Vorgaben eintragen.</p></details>";
      }
      // Warnhinweise aus der ungerundeten Rechnung (§5)
      let warn = "";
      if (mm) {
        if (mm.energiePz > 50) warn += '<div class="note warn">⚠️ Über dem gängigen Arbeitsbereich von 40–50 %. Die traditionelle MCT-Diät verwendet 60 % und kann Magen-Darm-Beschwerden verursachen.</div>';
        const devTag = mm.dev * d.mahl, kcalTag = mm.kcalNeu * d.mahl;
        if (d.mctMode !== "kalorien" && kcalTag < d.kcalMin - 0.5) warn += '<div class="note warn">⚠️ Mit diesem MCT-Anteil kämen nur ' + fmt(kcalTag, 0) + ' kcal/Tag zusammen – unter dem Minimum von ' + fmt(d.kcalMin, 0) + ' kcal. MCT-Anteil senken, Rechenregel „Kalorien halten“ wählen oder mit der Diätologie klären.</div>';
        else if (d.mctMode !== "kalorien" && devTag < -20) warn += '<div class="note info">Das Tagesziel wird um ' + fmt(-devTag, 0) + ' kcal unterschritten (Minimum ' + fmt(d.kcalMin, 0) + ' kcal/Tag ist eingehalten).</div>';
        if (d.mctMode === "kalorien" && (mm.ratioNeu - mm.ratioBasis) > 0.05) warn += '<div class="note warn">⚠️ Das Verhältnis steigt von ' + fmt(mm.ratioBasis, 2) + ' auf ' + fmt(mm.ratioNeu, 2) + '. Das ist eine Änderung der Verordnung, nicht der Fettart.</div>';
      }
      oilSeg = '<div class="meat-swap"><div class="seg-label">🧈 Öl: MCT-Anteil an der Öl-Fettmasse</div>' +
        '<div class="segmented mini">' + [0, 10, 20, 30, 50, 100].map(shareBtn).join("") + "</div>" +
        note + warn + (sOil > 0 ? regelZeile(d) : "") + "</div>";
    }

    // Zwei Sichten auf dieselben Zutaten: Küche (abwiegen, editierbar) und Rechnen (Nährwerte, nur lesen).
    let kRows = "", nRows = "";
    items.forEach((it, i) => {
      const g = num(it.grams) * mult;
      const m = lineMacros({ food: it.food, grams: num(it.grams) }); // Rechnen: je Portion
      const isWaterRow = /wasser/i.test(it.food);
      const fatRow = isFatCarrier(items, i);
      const gR = fatRow ? roundTo(g, 0.1) : roundTo(g, isWaterRow ? 1 : d.rundung);
      const gTxt = fatRow ? gR.toFixed(1) : String(gR); // Fettträger immer mit einer Nachkommastelle („21.0“)
      // Wasserzeile: nur die Herkunft steht dabei („⟵ Flüssigkeitsziel“); Anpassungen und ihr Zurücksetzen
      // stehen – wie bei den Lebensmitteln – in der Statuszeile über den Kacheln.
      const waterTag = isWaterRow ? (hasWaterOverride ? '<small class="adj">⟵ eigener Wert</small>' : (mv.fluidAdjusted ? '<small class="adj">⟵ Flüssigkeitsziel</small>' : "")) : "";
      const mK = lineMacros({ food: it.food, grams: gR }); // Abwiegen: für die Zubereitungsmenge
      kRows += "<tr" + (i === adjIndex ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) + (i === adjIndex ? adjLabel : "") + waterTag + "</td>" +
        '<td class="amt"><input class="amt-edit" type="number" min="0" step="' + (fatRow ? "0.1" : "1") + '" inputmode="decimal" data-g="' + gR + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gTxt + '"></td>' +
        "<td>" + fmt(mK.eiweiss) + "</td><td>" + fmt(mK.fett) + "</td><td>" + fmt(mK.kh) + "</td><td>" + fmt(mK.kcal, 0) + "</td></tr>";
      const gP = Math.round(num(it.grams) * 10) / 10;
      const gPTxt = fatRow ? gP.toFixed(1) : String(gP);
      nRows += "<tr" + (i === adjIndex ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) + (i === adjIndex ? adjLabel : "") + waterTag + "</td>" +
        '<td class="amt"><input class="amt-edit g-edit" type="number" min="0" step="' + (fatRow ? "0.1" : "1") + '" inputmode="decimal" data-g="' + gP + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gPTxt + '"></td>' +
        "<td>" + fmt(m.eiweiss) + "</td><td>" + fmt(m.fett) + "</td><td>" + fmt(m.kh) + "</td><td>" + fmt(m.kcal, 0) + "</td></tr>";
    });
    // Zubereitung als nummerierte Schritte (Varoma bevorzugt; Dämpfwasser-Rechnung ist darin enthalten).
    const prepText = rec.varoma
      ? adaptOil(adaptVaroma(adaptPrep(rec.varoma, rec, detailMeat)))
      : (rec.zubereitung ? adaptOil(adaptPrep(rec.zubereitung, rec, detailMeat)) : "");
    const steps = splitSteps(prepText);
    const stepsHtml = steps.length ? "<ol class='steps'>" + steps.map(s => "<li>" + escapeHtml(s) + "</li>").join("") + "</ol>" : "";
    // Abfüllen: Öl-Zeilen je Portion (kommen erst vor dem Füttern dazu)
    const oilRowsPer = items.filter(it => isOil(it.food));
    // Vier Blätter: am Handy nebeneinander (seitlich wischen, jedes passt auf einen Bildschirm), am Desktop als Reiter.
    const TABMAP = { rechnen: "mahlzeit", kochen: "abwiegen", tag: "abwiegen", abfuellen: "zubereitung" }; // alte gespeicherte Werte
    const wanted = TABMAP[state.settings.detailTab] || state.settings.detailTab;
    const dtab = DETAIL_PAGES.some(pg => pg[0] === wanted) ? wanted : "mahlzeit";
    const mobile = isMobileLayout();
    const tabBtn = (pg) => '<button type="button" data-dtab="' + pg[0] + '"' + (dtab === pg[0] ? ' class="active"' : "") + ">" + pg[1] + "</button>";
    const paneOpen = (k) => '<div class="pane" data-pane="' + k + '"' + (dtab !== k && !mobile ? " hidden" : "") + ">";

    // Ganzer Tag: eine Portion × Mahlzeiten pro Tag – unabhängig von der gewählten Portionenzahl.
    // Zeigt, was herauskäme, wenn jede Mahlzeit des Tages dieses Rezept wäre (Ziele und Minimum daneben).
    const dayN = d.mahl;
    const dayKcal = sumPer.kcal * dayN;
    const dayLow = dayKcal < d.kcalMin - 0.5, dayHigh = d.kcalMaxAuto && dayKcal > d.kcalMaxAuto + 0.5;
    // Flüssigkeit je Portion: Zutaten-Wasser + Rezept-Wasser, gegen den Anteil am Tagesbedarf.
    const waterPer = items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0);
    const fluidPer = mv.fluid, foodFluidPer = fluidPer - waterPer;
    const fluidLine = d.fluidDay > 0
      ? '<div class="hint" style="margin:6px 0 10px">💧 Flüssigkeit je Portion ≈ <strong>' + fmt(fluidPer, 0) + ' ml</strong> (Zutaten ' + fmt(foodFluidPer, 0) + ' + Wasser ' + fmt(waterPer, 0) + ') · Ziel ' + fmt(d.fluidMahl, 0) + ' ml je Mahlzeit' +
        (d.wasserModus === "mahlzeit"
          ? (mv.fluidAdjusted ? ' – Wasser dafür erhöht' : (fluidPer >= d.fluidMahl - 0.5 ? ' ✓' : ' – <strong>nicht erreicht</strong> (gemerktes Wasser)'))
          : (mv.fluidAdjusted ? (mv.waterCapped ? ' – Wasser bis zur Höchstmenge (' + fmt(d.maxMahlMl, 0) + ' ml) erhöht, Rest per Spritze' : ' – Wasser dafür erhöht') : (fluidPer >= d.fluidMahl - 0.5 ? ' ✓' : ' – Rest per Spritze'))) +
        (d.maxMahlMl > 0 && volumeMl(items) > d.maxMahlMl + 0.5 ? ' · <strong>⚠️ Mahlzeit ' + fmt(volumeMl(items), 0) + ' ml, über der Höchstmenge von ' + fmt(d.maxMahlMl, 0) + ' ml</strong>' : '') + '</div>'
      : "";
    const dayFluid = fluidPer * dayN, fluidRest = d.fluidDay - dayFluid;
    const fluidDayTile = d.fluidDay > 0
      ? '<div class="dstat' + (d.wasserModus === "mahlzeit" && dayFluid < d.fluidDay - 3 ? " warn" : "") + '"><div class="v">' + fmt(dayFluid, 0) + ' ml</div><div class="l">Flüssigkeit/Tag · Ziel ' + fmt(d.fluidDay, 0) + ' ml</div></div>'
      : "";
    const fluidDayNote = d.fluidDay > 0
      ? (d.wasserModus === "zwischen"
          ? zwischenText(d, fluidRest, dayN)
          : (dayFluid < d.fluidDay - 3
              ? '<div class="note warn">💧 Der Tag liegt unter dem Flüssigkeitsziel – das gemerkte Wasser im Rezept ist kleiner als der rechnerische Anteil.</div>'
              : '<div class="note tip">💧 Flüssigkeit ist in den Mahlzeiten dabei – Wasser je Rezept entsprechend erhöht, kein Sondieren zwischen den Mahlzeiten nötig.</div>'))
      : "";

    // Abwiegen: Kacheln für die Zubereitungsmenge – gleiches Layout wie „Mahlzeit“, nur mit den Mengen der Zubereitung
    // (Standard: ein Tag). Ziele skalieren mit; bei ganzen Tagen zählt das Flüssigkeitsziel je Tag.
    const qTag = days === 1 ? "/Tag" : "";
    const qFluid = fluidPer * mult, qFluidZiel = days ? d.fluidDay * days : d.fluidMahl * mult;
    const qTiles =
      '<div class="detail-tiles strip">' +
        '<div class="dstat' + ((days && dayLow) ? " warn" : "") + '"><div class="v">' + fmt(sum.kcal, 0) + '</div><div class="l">kcal' + qTag + ' · Ziel ' + fmt(d.kcalMahl * mult, 0) + '</div></div>' +
        '<div class="dstat' + (proteinOk ? "" : " warn") + '"><div class="v">' + fmt(sum.eiweiss) + ' g</div><div class="l">Eiweiß' + qTag + ' · Ziel ' + fmt(proteinTarget, 0) + ' g</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(totalG, 0) + ' g</div><div class="l">Menge' + qTag + '</div></div>' +
        (d.fluidDay > 0 ? '<div class="dstat' + (d.wasserModus === "mahlzeit" && qFluid < qFluidZiel - 3 * mult ? " warn" : "") + '"><div class="v">' + fmt(qFluid, 0) + ' ml</div><div class="l">Flüssigkeit' + qTag + ' · Ziel ' + fmt(qFluidZiel, 0) + ' ml</div></div>' : '') +
      '</div>';
    // Tages-Check nur als Warnung (wie die Eiweiß-Warnung auf „Mahlzeit“): Minimum unterschritten oder über dem Korridor.
    const dayCheck = dayLow
      ? '<div class="note warn">⚠️ Ein Tag nur mit diesem Rezept (' + dayN + ' × = ' + fmt(dayKcal, 0) + ' kcal) läge unter dem Minimum von ' + fmt(d.kcalMin, 0) + ' kcal – im Tagesplan mit anderen Mahlzeiten kombinieren.</div>'
      : (dayHigh ? '<div class="note warn">⚠️ Ein Tag nur mit diesem Rezept (' + dayN + ' × = ' + fmt(dayKcal, 0) + ' kcal) läge über dem Korridor (bis ' + fmt(d.kcalMaxAuto, 0) + ' kcal).</div>' : "");
    // Zubereitungsmenge: 1 Portion, 1–3 ganze Tage (folgen der Mahlzeitenzahl) oder eine freie Portionenzahl.
    // Gilt nur hier (Abwiegen, Zubereitung, Abfüllen) und wird je Rezept gemerkt – die Vorgaben bleiben unberührt.
    const scaleBtn = (v, label) => '<button type="button" data-scale="' + v + '"' + ((v === "1" ? (!days && mult === 1) : detailScale === v) ? ' class="active"' : "") + ">" + label + "</button>";
    // Eine Zeile: 1 · 2 · 3 Tage + Stepper für eine freie Portionenzahl (Überschrift nennt die gewählte Menge).
    const scaleSeg =
      '<div class="seg-portion batch">' +
        '<div class="segmented mini">' + scaleBtn("tag", "1 Tag") + scaleBtn("tag:2", "2 Tage") + scaleBtn("tag:3", "3 Tage") + "</div>" +
        '<span class="portion-step" title="Portionen"><button type="button" class="stepbtn" data-step="-1" aria-label="eine Portion weniger">−</button>' +
        '<input id="portion-input" type="number" min="0.5" step="0.5" aria-label="Portionen" value="' + (Math.round(mult * 10) / 10) + '">' +
        '<button type="button" class="stepbtn" data-step="1" aria-label="eine Portion mehr">+</button></span>' +
      "</div>";
    // Statuszeile der Mahlzeit: alle temporären Änderungen (Portion, Wasser) samt Zurücksetzen an einer Stelle.
    let waterRef = null;
    if (hasWaterOverride) {
      const keep = state.water[waterKey]; delete state.water[waterKey];
      try { waterRef = computeMealView(rec, d, detailMeat).res.items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0); }
      finally { state.water[waterKey] = keep; }
    }
    const statusLine = (m, bezug) => {
      const parts = [];
      if (mv.hasPortion) parts.push('<strong>Portion angepasst: ' + fmt(mv.portionF * 100, 0) + ' %</strong> (' + fmt(sumPer.kcal * m, 0) + ' statt ' + fmt(mv.kcalBerechnet * m, 0) + ' kcal) · <button type="button" class="linkbtn portion-reset">↺ wie berechnet</button>');
      if (hasWaterOverride) parts.push('<strong>Wasser angepasst</strong> (' + fmt(waterPer * m, 0) + ' statt ' + fmt(waterRef * m, 0) + ' ml) · <button type="button" class="linkbtn water-reset">↺ wie berechnet</button>');
      return parts.length ? parts.join(" · ")
        : 'Wie berechnet (' + fmt(d.kcalMahl * m, 0) + ' kcal ' + bezug + ')' + (hasOil ? ' · mit Öl ≈ ' + fmt(totalG / mult * m, 0) + ' g / ' + fmt(ml / mult * m, 0) + ' ml' : '') + ' · Gramm ändern, die übrigen Zutaten skalieren mit';
    };
    const mealStatus = statusLine(1, "je Mahlzeit");
    const tagStatus = statusLine(mult, days === 1 ? "je Tag" : (days ? "für " + days + " Tage" : "für " + portionsTxt + " Portionen"));

    const c = document.getElementById("detail-content");
    c.innerHTML =
      '<div class="detail-head"><span class="detail-icon">' + (rec.icon || "🥑") + "</span>" +
        '<div><div class="title">' + escapeHtml(familyOf(rec)) + "</div>" +
        '<div class="meta"><span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmtRatio(r, 2) + "</span><span>" +
        fmt(sumPer.kcal, 0) + " kcal je Portion</span>" + ketoBadge + "</div></div></div>" +
      '<div class="detail-tabs-wrap"><div class="segmented detail-tabs" id="detail-tabs">' + DETAIL_PAGES.map(tabBtn).join("") + "</div>" +
      '<div class="page-dots" id="page-dots">' + DETAIL_PAGES.map(pg => '<button type="button" class="dot' + (dtab === pg[0] ? " active" : "") + '" data-dtab="' + pg[0] + '" aria-label="' + pg[1] + '"></button>').join("") +
      '<span class="page-no">Seite ' + (DETAIL_PAGES.findIndex(pg => pg[0] === dtab) + 1) + " von " + DETAIL_PAGES.length + "</span></div></div>" +
      '<div class="pages" id="detail-pages">' +

      /* ---------- 1 Mahlzeit ---------- */
      paneOpen("mahlzeit") +
      '<h4 class="ph">🍽️ Mahlzeit <span class="hint">eine Portion</span></h4>' +
      '<div class="portion-line">' + mealStatus + '</div>' +
      '<div class="detail-tiles strip">' +
        '<div class="dstat' + (mv.hasPortion ? " warn" : "") + '"><div class="v">' + fmt(sumPer.kcal, 0) + '</div><div class="l">kcal · Ziel ' + fmt(d.kcalMahl, 0) + '</div></div>' +
        '<div class="dstat ' + (proteinOk ? "" : "warn") + '"><div class="v">' + fmt(sumPer.eiweiss) + ' g</div><div class="l">Eiweiß · Ziel ' + fmt(d.eiweissMahl) + ' g</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(hasOil ? perGnoOil : totalG / mult, 0) + ' g</div><div class="l">Menge' + (hasOil ? ' ohne Öl' : "") + '</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(hasOil ? perMlNoOil : ml / mult, 0) + ' ml</div><div class="l">Volumen' + (hasOil ? ' ohne Öl' : "") + '</div></div>' +
      "</div>" +
      (!proteinOk ? '<div class="note warn">⚠️ Liegt unter dem Eiweiß-Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
      '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' +
        nRows +
        "<tr class='sum'><td class='name'>Summe je Portion</td><td>" + fmt(totalG / mult, 0) + "</td><td>" + fmt(sumPer.eiweiss) + "</td><td>" +
        fmt(sumPer.fett) + "</td><td>" + fmt(sumPer.kh) + "</td><td>" + fmt(sumPer.kcal, 0) + "</td></tr>" +
      "</tbody></table></div>" +
      fluidLine +
      "</div>" +

      /* ---------- 2 Abwiegen (Zubereitungsmenge, Standard ein Tag) ---------- */
      paneOpen("abwiegen") +
      '<h4 class="ph">📅 Tag <span class="hint">' + (mult === 1 ? "eine Portion" : (days === 1 ? "= " : (days ? days + " Tage = " : "")) + portionsTxt + " Portionen") + '</span></h4>' +
      scaleSeg +
      '<div class="portion-line">' + tagStatus + '</div>' +
      qTiles +
      '<div class="tbl-wrap"><table class="kitchen"><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' + kRows +
        "<tr class='sum'><td class='name'>Summe</td><td class='amt'>" + fmt(totalG, 0) + "</td><td>" + fmt(sum.eiweiss) + "</td><td>" +
        fmt(sum.fett) + "</td><td>" + fmt(sum.kh) + "</td><td>" + fmt(sum.kcal, 0) + "</td></tr>" +
      "</tbody></table></div>" +
      dayCheck +
      ((fluidDayNote && packInfoSeg && /class="note tip"/.test(fluidDayNote))
        ? fluidDayNote.replace(/^<div class="note tip">/, '<div class="note tip pack">').replace(/<\/div>$/, "") + "<br>" + packInfoSeg.replace(/^<div class="note tip pack">/, "").replace(/<\/div>$/, "") + "</div>"
        : fluidDayNote + packInfoSeg) +
      "</div>" +

      /* ---------- 3 Anpassen ---------- */
      paneOpen("anpassen") +
      '<h4 class="ph">🎛️ Anpassen <span class="hint">gilt für dieses Gericht</span></h4>' +
      basisSeg + meatSeg + oilSeg +
      (!(basisSeg || meatSeg || oilSeg) ? '<div class="note info">Für dieses Gericht gibt es nichts umzuschalten.</div>' : "") +
      "</div>" +

      /* ---------- 4 Kochen: Abfüll-Kacheln oben (immer sichtbar), darunter die Schritte ---------- */
      paneOpen("zubereitung") +
      '<h4 class="ph">🍳 Kochen <span class="hint">für ' + portionLabel + '</span></h4>' +
      '<div class="portion-line">💉 <strong>Abfüllen je Portion</strong>' + (hasOil ? ' – ohne Öl, das kommt erst vor dem Füttern dazu' : '') +
        (mult !== 1 ? ' · gesamt ≈ ' + fmt((hasOil ? perGnoOil : totalG / mult) * mult, 0) + ' g = <strong>' + portionsTxt + ' × ' + fmt(perGnoOil, 0) + ' g</strong>' +
          (hasOil ? ' · Öl gesamt ' + oilRowsPer.map(it => fmt(num(it.grams) * mult, 0) + ' g').join(" + ") : '') : '') + '</div>' +
      '<div class="detail-tiles strip fill-tiles">' +
        '<div class="dstat"><div class="v fill-big">≈ ' + fmt(perGnoOil, 0) + ' g</div><div class="l">je Portion' + (hasOil ? ' ohne Öl' : '') + '</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(perMlNoOil, 0) + ' ml</div><div class="l">≈ ' + fmt(perMlNoOil / 60, 1) + ' Spritzen à 60 ml</div></div>' +
        (hasOil ? oilRowsPer.map(it => '<div class="dstat oil"><div class="v">' + fmt(num(it.grams), 1) + ' g</div><div class="l">' + escapeHtml(String(it.food).replace(/\s*C8\+C10/, "")) + ' · vor dem Füttern</div></div>').join("") : "") +
      "</div>" +
      ((res.mct || rec.varoma || mult !== 1) ? '<div class="note ' + (res.mct && res.mct.energiePz > 50 ? "warn" : "tip") + '">' +
        [rec.varoma ? '🫗 Vor dem Abfüllen durch ein feines Sieb streichen (sonst verstopft die Spritze).' : "",
         res.mct ? 'MCT <strong>' + fmt(res.mct.gMct, 1) + ' g</strong> je Portion (' + fmt(res.mct.energiePz, 0) + ' % der Energie) – klein beginnen, Verträglichkeit beobachten.' : "",
         mult !== 1 ? 'Garzeiten gelten für <strong>eine</strong> Portion – länger garen, bis alles weich ist; im Kühlschrank lagern.' : ""].filter(Boolean).join(" ") + "</div>" : "") +
      '<h4 class="ph steps-ph">' + (rec.varoma ? "🫧 Zubereitung mit Varoma (dämpfen)" : "🥣 Zubereitung") + '</h4>' +
      (stepsHtml || '<div class="note info">Keine Zubereitungsschritte hinterlegt.</div>') +
      "</div>" +

      "</div>" + /* pages */
      '<div class="detail-actions" id="detail-actions"></div>';

    c.querySelectorAll(".seg-portion button[data-scale]").forEach(b =>
      b.addEventListener("click", () => { detailScale = parseScale(b.dataset.scale); persistScale(); renderDetail(); }));
    c.querySelectorAll(".seg-portion button[data-step]").forEach(b =>
      b.addEventListener("click", () => {
        detailScale = Math.max(0.5, Math.round((mult + parseFloat(b.dataset.step)) * 2) / 2);
        persistScale(); renderDetail();
      }));
    const pin = c.querySelector("#portion-input");
    if (pin) pin.addEventListener("change", () => {
      const v = parseFloat(String(pin.value).replace(",", ".")); if (v > 0) { detailScale = v; persistScale(); renderDetail(); }
    });
    // Rechnen: Gramm je Portion ändern → Portion-Faktor je Rezept (Wasser: gemerkter Wert je Portion)
    c.querySelectorAll(".g-edit").forEach(inp =>
      inp.addEventListener("change", () => {
        const oldG = parseFloat(inp.dataset.g); const nv = parseFloat(String(inp.value).replace(",", "."));
        if (inp.dataset.water === "1") { if (isFinite(nv) && nv >= 0) { state.water[waterKey] = nv; save(); renderDetail(); } return; }
        if (oldG > 0 && nv > 0) {
          const f = Math.round(mv.portionF * (nv / oldG) * 1000) / 1000;
          if (Math.abs(f - 1) < 1e-6) delete state.portion[waterKey]; else state.portion[waterKey] = f;
          save(); renderDetail();
        }
      }));
    c.querySelectorAll(".portion-reset").forEach(b =>
      b.addEventListener("click", () => { delete state.portion[waterKey]; save(); renderDetail(); }));
    c.querySelectorAll(".amt-edit:not(.g-edit)").forEach(inp =>
      inp.addEventListener("change", () => {
        const oldG = parseFloat(inp.dataset.g); const nv = parseFloat(String(inp.value).replace(",", "."));
        if (inp.dataset.water === "1") {
          // Nur das Wasser ändern – Rest bleibt; gemerkt wird der Wert je Portion.
          if (isFinite(nv) && nv >= 0) { state.water[waterKey] = nv / mult; save(); renderDetail(); }
          return;
        }
        if (oldG > 0 && nv > 0) {
          const f = Math.round(mv.portionF * (nv / oldG) * 1000) / 1000;
          if (Math.abs(f - 1) < 1e-6) delete state.portion[waterKey]; else state.portion[waterKey] = f;
          save(); renderDetail();
        }
      }));
    c.querySelectorAll(".water-reset").forEach(b =>
      b.addEventListener("click", () => { delete state.water[waterKey]; save(); renderDetail(); }));
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
        state.settings.mctShare = num(b.dataset.mcts) / 100; save(); renderDetail();
      }));
    // Blätter: am Desktop Reiter (nur das aktive Blatt sichtbar), am Handy nebeneinander mit seitlichem Wischen.
    const pages = c.querySelector("#detail-pages");
    const panes = pages ? [...pages.querySelectorAll(":scope > .pane")] : [];
    const pageIdx = (k) => Math.max(0, DETAIL_PAGES.findIndex(pg => pg[0] === k));
    const leftOf = (i) => panes[i] && panes[0] ? panes[i].offsetLeft - panes[0].offsetLeft : 0;
    const markTab = (k) => {
      c.querySelectorAll("#detail-tabs button[data-dtab], #page-dots button[data-dtab]").forEach(b => b.classList.toggle("active", b.dataset.dtab === k));
      const pn = c.querySelector("#page-dots .page-no"); if (pn) pn.textContent = "Seite " + (pageIdx(k) + 1) + " von " + DETAIL_PAGES.length;
      const ab = c.querySelector("#detail-tabs button.active");
      if (ab && typeof ab.scrollIntoView === "function") { try { ab.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {} }
    };
    const goTo = (k, smooth) => {
      const left = leftOf(pageIdx(k));
      if (smooth) { try { pages.scrollTo({ left: left, behavior: "smooth" }); return; } catch (e) {} }
      pages.scrollLeft = left;
    };
    if (mobile && pages) {
      goTo(dtab, false);
      markTab(dtab);
      let st = null;
      pages.addEventListener("scroll", () => {
        clearTimeout(st);
        st = setTimeout(() => {
          let best = 0, bd = Infinity;
          panes.forEach((p, i) => { const dd = Math.abs(leftOf(i) - pages.scrollLeft); if (dd < bd) { bd = dd; best = i; } });
          const k = DETAIL_PAGES[best][0];
          if (k !== state.settings.detailTab) { state.settings.detailTab = k; save(); markTab(k); }
        }, 80);
      });
    }
    c.querySelectorAll("#detail-tabs button[data-dtab], #page-dots button[data-dtab]").forEach(b =>
      b.addEventListener("click", () => {
        state.settings.detailTab = b.dataset.dtab; save();
        if (mobile && pages) { markTab(b.dataset.dtab); goTo(b.dataset.dtab, true); }
        else renderDetail();
      }));

    // Feste Aktionsleiste unten: Favorit · Drucken · Editor (· Löschen bei eigenen Rezepten)
    const actions = c.querySelector("#detail-actions");
    const fav = isFav(rec);
    const favBtn = el("button", { class: "btn secondary" }, (fav ? "★ Favorit" : "☆ Favorit"));
    favBtn.addEventListener("click", () => { toggleFav(rec); openRecipeDetail(rec); });
    actions.appendChild(favBtn);
    const printBtn = el("button", { class: "btn secondary" }, "🖨️ Drucken");
    printBtn.addEventListener("click", () => printRecipe(rec, res, d, mult));
    actions.appendChild(printBtn);
    const editBtn = el("button", { class: "btn", id: "edit-btn" }, "✏️ " + (rec.custom ? "Bearbeiten" : "Editor"));
    editBtn.addEventListener("click", () => { const r = applyMeatChoice(rec, detailMeat); (rec.custom ? seedComposeFromSaved(r) : seedComposeFromRecipe(r)); closeDetail(); openCompose(); });
    actions.appendChild(editBtn);
    if (rec.custom) {
      const delBtn = el("button", { class: "btn ghost" }, "🗑️");
      delBtn.addEventListener("click", () => {
        if (confirm("Eigenes Rezept „" + rec.name + "“ wirklich löschen?")) {
          state.savedRecipes = state.savedRecipes.filter(s => s.key !== rec.key);
          const fi = state.favorites.indexOf(rec.key); if (fi !== -1) state.favorites.splice(fi, 1);
          save(); closeDetail(); renderRezepte();
        }
      });
      actions.appendChild(delBtn);
    }
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
    document.getElementById("detail-overlay").hidden = true;
    document.body.classList.remove("modal-open");
  }
  function bindDetail() {
    const overlay = document.getElementById("detail-overlay");
    document.getElementById("detail-close").addEventListener("click", closeDetail);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeDetail(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !overlay.hidden) closeDetail(); });
  }
