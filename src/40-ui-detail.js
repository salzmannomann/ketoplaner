  /* ---------- Detailansicht (Overlay) ---------- */
  // Blätter der Detailansicht in Reihenfolge; „Mahlzeit“ und „Ein Tag“ liegen nebeneinander.
  const DETAIL_PAGES = [["mahlzeit", "🍽️ Mahlzeit"], ["tag", "📅 Ein Tag"], ["anpassen", "🎛️ Anpassen"], ["abwiegen", "⚖️ Abwiegen"], ["zubereitung", "🍳 Zubereitung"], ["abfuellen", "💉 Abfüllen"]];
  function isMobileLayout() { try { return !!(window.matchMedia && window.matchMedia("(max-width: 820px)").matches); } catch (e) { return false; } }
  // detailScale: Zubereitungsmenge – Zahl (Portionen) oder "tag" (= ganzer Tag, folgt der Mahlzeitenzahl). detailMeat: temporäre Fleischwahl.
  let detailRec = null, detailScale = 1, detailMeat = null;
  // Merkt sich die Zubereitungsmenge je Rezept – bleibt auch nach dem Schließen erhalten. „Ganzer Tag“ wird als
  // Wahl gemerkt, nicht als Zahl: ändert sich die Mahlzeitenzahl in den Vorgaben, zieht die Menge mit.
  function persistScale() {
    if (!detailRec) return;
    const k = familyKey(detailRec);
    if (detailScale === "tag") state.scales[k] = "tag";
    else if (Math.abs(num(detailScale) - 1) < 1e-6) delete state.scales[k];
    else state.scales[k] = num(detailScale);
    save();
  }
  function scaleMult(d) { return detailScale === "tag" ? d.mahl : (num(detailScale) > 0 ? num(detailScale) : 1); }
  function openRecipeDetail(rec) {
    const sv = state.scales[familyKey(rec)];
    detailRec = rec; detailScale = sv === "tag" ? "tag" : (num(sv) || 1); detailMeat = null;
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
    let adjIndex = base.fatIndex, adjLabel = '<small class="adj">⟵ Fett angepasst</small>';
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
        adjIndex = swapSlot.index; adjLabel = '<small class="adj">⟵ Menge angepasst</small>';
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
    const g = gaps(n), plan = d.zwischenMl * g, diff = rest - plan;
    if (diff > 0.5) return '<div class="note warn">💧 Zwischen den Mahlzeiten: ' + g + ' × ' + fmt(d.zwischenMl, 0) + ' ml (Vorgabe). Damit fehlen am Tag noch <strong>' + fmt(diff, 0) + ' ml</strong>, weil die Mahlzeiten an der Höchstmenge (' + fmt(d.maxMahlMl, 0) + ' ml, 25 ml/kg) liegen – Wasser je Zwischenzeit auf ≈ ' + fmt(rest / g, 0) + ' ml erhöhen oder eine Wassergabe mehr einplanen.</div>';
    if (diff < -0.5) return '<div class="note tip">💧 Zwischen den Mahlzeiten reichen <strong>' + fmt(Math.max(0, rest), 0) + ' ml</strong> (' + g + ' × ≈ ' + fmt(Math.max(0, rest) / g, 0) + ' ml) – die Mahlzeiten liefern schon mehr als geplant.</div>';
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
    const portionLabel = mult === 1 ? "1 Portion" : portionsTxt + " Portionen";
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
    const fam = familyOfRecipe(rec);
    let basisSeg = "";
    if (fam.variants.length > 1) {
      basisSeg = '<div class="meat-swap basis"><div class="seg-label">🧈 Fettbasis</div><div class="segmented mini">' +
        fam.variants.map(v => '<button type="button" data-basis="' + escapeHtml(recipeKey(v)) + '"' + (recipeKey(v) === recipeKey(rec) ? ' class="active"' : "") + ">" +
          (v.ketocal ? "🥄 " : "") + escapeHtml(basisLabel(v)) + "</button>").join("") +
        '</div><details class="collapsible mini"><summary>ⓘ Was ändert sich?</summary><p>Gleiches Gericht, andere Fettbasis – Mengen werden neu gerechnet. Die Wahl wird für dieses Gericht gemerkt; für alle anderen gilt die Vorgabe „' +
        (ketoPhase() === "mit" ? "mit" : "ohne") + ' KetoCal“.</p></details></div>';
    }

    // Packungs-Hinweis (z. B. Compleat 500 ml, 2 Tage haltbar): reine Information, wie weit eine Packung reicht.
    let packInfoSeg = "";
    if (rec.packung) {
      const pk = rec.packung, mlMeal = items.filter(it => it.food === pk.food).reduce((a, it) => a + num(it.grams), 0);
      if (mlMeal > 0) {
        const nMeals = Math.floor(pk.ml / mlMeal + 1e-9), maxMeals = d.mahl * pk.tage;
        const usedInTage = Math.min(nMeals, maxMeals) * mlMeal;
        // Kurz und kompakt: Menge je Mahlzeit, Reichweite, Verfall.
        packInfoSeg = '<div class="meat-swap pack"><div class="seg-label">🧃 Packung ' + pk.ml + ' ml · offen ' + pk.tage + ' Tage haltbar</div>' +
          '<div class="meat-note">' + fmt(mlMeal, 0) + ' ml je Mahlzeit · reicht für <strong>' + nMeals + ' Mahlzeiten</strong>' +
          (nMeals > maxMeals ? ' · in ' + pk.tage + ' Tagen ' + maxMeals + ' verbraucht, <strong>' + fmt(pk.ml - usedInTage, 0) + ' ml verfallen</strong>'
            : nMeals < maxMeals ? ' · für ' + pk.tage + ' Tage (' + maxMeals + ' Mahlzeiten) reicht eine Packung nicht' : '') + '</div></div>';
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
      const gR = Math.round(g * 10) / 10;
      kRows += "<tr" + (i === adjIndex ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) +
        (isWaterRow && hasWaterOverride ? '<small class="adj">⟵ angepasst</small>' : (isWaterRow && mv.fluidAdjusted ? '<small class="adj">⟵ Flüssigkeitsziel</small>' : "")) + "</td>" +
        '<td class="amt"><input class="amt-edit" type="number" min="0" step="1" inputmode="decimal" data-g="' + gR + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gR + '"> <span class="unit">g</span></td></tr>';
      const gP = Math.round(num(it.grams) * 10) / 10;
      nRows += "<tr" + (i === adjIndex ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) + (i === adjIndex ? adjLabel : "") +
        (isWaterRow && hasWaterOverride ? '<small class="adj">⟵ angepasst</small>' : (isWaterRow && mv.fluidAdjusted ? '<small class="adj">⟵ Flüssigkeitsziel</small>' : "")) + "</td>" +
        '<td class="amt"><input class="amt-edit g-edit" type="number" min="0" step="1" inputmode="decimal" data-g="' + gP + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gP + '"></td>' +
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
    // Sechs Blätter: am Handy nebeneinander (seitlich wischen, jedes passt auf einen Bildschirm), am Desktop als Reiter.
    const TABMAP = { rechnen: "mahlzeit", kochen: "abwiegen" }; // alte gespeicherte Werte
    const wanted = TABMAP[state.settings.detailTab] || state.settings.detailTab;
    const dtab = DETAIL_PAGES.some(pg => pg[0] === wanted) ? wanted : "mahlzeit";
    const mobile = isMobileLayout();
    const tabBtn = (pg) => '<button type="button" data-dtab="' + pg[0] + '"' + (dtab === pg[0] ? ' class="active"' : "") + ">" + pg[1] + "</button>";
    const paneOpen = (k) => '<div class="pane" data-pane="' + k + '"' + (dtab !== k && !mobile ? " hidden" : "") + ">";

    // Ganzer Tag: eine Portion × Mahlzeiten pro Tag – unabhängig von der gewählten Portionenzahl.
    // Zeigt, was herauskäme, wenn jede Mahlzeit des Tages dieses Rezept wäre (Ziele und Minimum daneben).
    const dayN = d.mahl;
    const dayKcal = sumPer.kcal * dayN, dayP = sumPer.eiweiss * dayN, dayF = sumPer.fett * dayN, dayC = sumPer.kh * dayN;
    const dayLow = dayKcal < d.kcalMin - 0.5, dayHigh = d.kcalMaxAuto && dayKcal > d.kcalMaxAuto + 0.5;
    // Zutatentabelle je Tag: jede Zeile × Mahlzeiten (gleiche Spalten wie die Mahlzeit-Tabelle).
    const dayRows = items.map((it, i) => {
      const g = num(it.grams) * dayN, m = lineMacros({ food: it.food, grams: g });
      return "<tr" + (i === adjIndex ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) + "</td><td>" + fmt(g, 1) + "</td><td>" + fmt(m.eiweiss) + "</td><td>" + fmt(m.fett) + "</td><td>" + fmt(m.kh) + "</td><td>" + fmt(m.kcal, 0) + "</td></tr>";
    }).join("");
    const dayTotalG = items.reduce((a, it) => a + num(it.grams), 0) * dayN;
    const dayTable = '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel · je Tag</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' +
      dayRows + "<tr class='sum'><td class='name'>Summe je Tag</td><td>" + fmt(dayTotalG, 0) + "</td><td>" + fmt(dayP) + "</td><td>" + fmt(dayF) + "</td><td>" + fmt(dayC) + "</td><td>" + fmt(dayKcal, 0) + "</td></tr></tbody></table></div>";
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
      ? '<div class="dstat' + (d.wasserModus === "mahlzeit" && dayFluid < d.fluidDay - 0.5 ? " warn" : "") + '"><div class="v">' + fmt(dayFluid, 0) + ' ml</div><div class="l">Flüssigkeit/Tag · Ziel ' + fmt(d.fluidDay, 0) + ' ml</div></div>'
      : "";
    const fluidDayNote = d.fluidDay > 0
      ? (d.wasserModus === "zwischen"
          ? zwischenText(d, fluidRest, dayN)
          : (dayFluid < d.fluidDay - 0.5
              ? '<div class="note warn">💧 Der Tag liegt unter dem Flüssigkeitsziel – das gemerkte Wasser im Rezept ist kleiner als der rechnerische Anteil.</div>'
              : '<div class="note tip">💧 Flüssigkeit ist in den Mahlzeiten dabei – Wasser je Rezept entsprechend erhöht, kein Sondieren zwischen den Mahlzeiten nötig.</div>'))
      : "";

    const daySeg =
      '<h4 class="ph">📅 Ein Tag <span class="hint">= ' + dayN + ' × diese Mahlzeit</span></h4>' +
      '<div class="detail-tiles strip">' +
        '<div class="dstat' + (dayLow ? " warn" : "") + '"><div class="v">' + fmt(dayKcal, 0) + '</div><div class="l">kcal/Tag · Ziel ' + fmt(d.kcal, 0) + '<br><small>Minimum ' + fmt(d.kcalMin, 0) + (dayLow ? ' – unterschritten!' : ' ✓') + (dayHigh ? ' · über Korridor (' + fmt(d.kcalMaxAuto, 0) + ')' : '') + '</small></div></div>' +
        '<div class="dstat' + (dayP < d.eiweiss * 0.9 ? " warn" : "") + '"><div class="v">' + fmt(dayP) + ' g</div><div class="l">Eiweiß/Tag · Ziel ' + fmt(d.eiweiss, 0) + ' g</div></div>' +
        '<div class="dstat"><div class="v">' + fmt(dayF, 0) + ' / ' + fmt(dayC, 1) + ' g</div><div class="l">Fett / KH je Tag</div></div>' +
        fluidDayTile +
      '</div>' +
      dayTable +
      (dayLow ? '<div class="note warn">⚠️ Nur mit diesem Rezept läge der Tag unter dem Kalorien-Minimum – im Tagesplan mit anderen Mahlzeiten kombinieren.</div>' : "");

    const c = document.getElementById("detail-content");
    c.innerHTML =
      '<div class="detail-head"><span class="detail-icon">' + (rec.icon || "🥑") + "</span>" +
        '<div><div class="title">' + escapeHtml(familyOf(rec)) + "</div>" +
        '<div class="meta"><span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmtRatio(r, 2) + "</span><span>" +
        fmt(sumPer.kcal, 0) + " kcal je Portion" + (mult !== 1 ? " · Zubereitung: " + portionLabel + (detailScale === "tag" ? " (ganzer Tag)" : "") : "") + "</span>" + ketoBadge + "</div></div></div>" +
      '<div class="detail-tabs-wrap"><div class="segmented detail-tabs" id="detail-tabs">' + DETAIL_PAGES.map(tabBtn).join("") + "</div>" +
      '<div class="page-dots" id="page-dots">' + DETAIL_PAGES.map(pg => '<button type="button" class="dot' + (dtab === pg[0] ? " active" : "") + '" data-dtab="' + pg[0] + '" aria-label="' + pg[1] + '"></button>').join("") +
      '<span class="page-no">' + (DETAIL_PAGES.findIndex(pg => pg[0] === dtab) + 1) + "/" + DETAIL_PAGES.length + "</span></div></div>" +
      '<div class="pages" id="detail-pages">' +

      /* ---------- 1 Mahlzeit ---------- */
      paneOpen("mahlzeit") +
      '<h4 class="ph">🍽️ Mahlzeit <span class="hint">eine Portion</span></h4>' +
      '<div class="portion-line">' + (mv.hasPortion
        ? '<strong>Portion angepasst: ' + fmt(mv.portionF * 100, 0) + ' %</strong> der berechneten Mahlzeit (' + fmt(sumPer.kcal, 0) + ' statt ' + fmt(mv.kcalBerechnet, 0) + ' kcal) · <button type="button" id="portion-reset" class="linkbtn">↺ wie berechnet</button>'
        : 'Wie berechnet (' + fmt(d.kcalMahl, 0) + ' kcal je Mahlzeit) · Gramm ändern, die übrigen Zutaten skalieren mit') + '</div>' +
      '<div class="detail-tiles strip">' +
        '<div class="dstat' + (mv.hasPortion ? " warn" : "") + '"><div class="v">' + fmt(sumPer.kcal, 0) + '</div><div class="l">kcal · Ziel ' + fmt(d.kcalMahl, 0) + '</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(hasOil ? perGnoOil : totalG / mult, 0) + ' g</div><div class="l">Menge' + (hasOil ? ' ohne Öl<br><small>mit Öl ≈ ' + fmt(totalG / mult, 0) + ' g</small>' : "") + '</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(hasOil ? perMlNoOil : ml / mult, 0) + ' ml</div><div class="l">Volumen' + (hasOil ? ' ohne Öl<br><small>mit Öl ≈ ' + fmt(ml / mult, 0) + ' ml</small>' : "") + '</div></div>' +
        '<div class="dstat ' + (proteinOk ? "" : "warn") + '"><div class="v">' + fmt(sumPer.eiweiss) + ' g</div><div class="l">Eiweiß (Ziel ' + fmt(d.eiweissMahl) + ' g)</div></div>' +
      "</div>" +
      (!proteinOk ? '<div class="note warn">⚠️ Liegt unter dem Eiweiß-Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
      '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' +
        nRows +
        "<tr class='sum'><td class='name'>Summe je Portion</td><td>" + fmt(totalG / mult, 0) + "</td><td>" + fmt(sumPer.eiweiss) + "</td><td>" +
        fmt(sumPer.fett) + "</td><td>" + fmt(sumPer.kh) + "</td><td>" + fmt(sumPer.kcal, 0) + "</td></tr>" +
      "</tbody></table></div>" +
      "</div>" +

      /* ---------- 2 Ein Tag ---------- */
      paneOpen("tag") +
      daySeg +
      fluidDayNote +
      packInfoSeg +
      "</div>" +

      /* ---------- 3 Anpassen ---------- */
      paneOpen("anpassen") +
      '<h4 class="ph">🎛️ Anpassen <span class="hint">gilt für dieses Gericht</span></h4>' +
      basisSeg + meatSeg + oilSeg +
      (!(basisSeg || meatSeg || oilSeg) ? '<div class="note info">Für dieses Gericht gibt es nichts umzuschalten.</div>' : "") +
      "</div>" +

      /* ---------- 4 Abwiegen ---------- */
      paneOpen("abwiegen") +
      '<div class="seg-portion batch">' +
        '<span class="seg-label">Menge zubereiten:</span>' +
        '<div class="segmented mini">' +
          '<button type="button" data-scale="1"' + (detailScale !== "tag" && mult === 1 ? ' class="active"' : "") + ">1 Portion</button>" +
          '<button type="button" data-scale="tag"' + (detailScale === "tag" ? ' class="active"' : "") + ">Ganzer Tag (×" + d.mahl + ")</button>" +
        "</div>" +
        '<span class="portion-step">Portionen <button type="button" class="stepbtn" data-step="-1">−</button>' +
        '<input id="portion-input" type="number" min="0.5" step="0.5" value="' + (Math.round(mult * 10) / 10) + '">' +
        '<button type="button" class="stepbtn" data-step="1">+</button></span>' +
        ((mult !== 1 || hasWaterOverride) ? '<span class="reset-links">' +
          (mult !== 1 ? '<button type="button" id="scale-reset" class="linkbtn">↺ 1 Portion</button>' : "") +
          (hasWaterOverride ? '<button type="button" id="water-reset" class="linkbtn">↺ Wasser</button>' : "") + "</span>" : "") +
      "</div>" +
      '<h4 class="ph">⚖️ Abwiegen <span class="hint">für ' + portionLabel + '</span></h4>' +
      '<div class="tbl-wrap"><table class="kitchen"><tbody>' + kRows + "</tbody></table></div>" +
      fluidLine +
      '<div class="hint" style="margin-top:6px">Eine Menge ändern – die anderen Zutaten skalieren mit (Wasser ausgenommen). Wird je Rezept gemerkt.</div>' +
      "</div>" +

      /* ---------- 5 Zubereitung ---------- */
      paneOpen("zubereitung") +
      '<h4 class="ph">' + (rec.varoma ? "🫧 Zubereitung mit Varoma (dämpfen)" : "🥣 Zubereitung") + ' <span class="hint">für ' + portionLabel + '</span></h4>' +
      (stepsHtml || '<div class="note info">Keine Zubereitungsschritte hinterlegt.</div>') +
      (mult !== 1 ? '<div class="note info">Garzeiten gelten für <strong>eine</strong> Portion – bei größerer Menge länger garen, bis alles weich ist, ggf. portionsweise pürieren. Im Kühlschrank lagern.</div>' : "") +
      "</div>" +

      /* ---------- 6 Abfüllen ---------- */
      paneOpen("abfuellen") +
      '<h4 class="ph">💉 Abfüllen <span class="hint">je Portion</span></h4>' +
      '<div class="fill-hero"><div class="fill-big">≈ ' + fmt(perGnoOil, 0) + ' g</div>' +
        '<div class="fill-sub">≈ ' + fmt(perMlNoOil, 0) + ' ml je Portion' + (hasOil ? " · <strong>ohne Öl</strong>" : "") + ' · ≈ ' + fmt(perMlNoOil / 60, 1) + ' Spritzen à 60 ml</div></div>' +
      (mult !== 1 ? '<div class="note info">Gesamt' + (hasOil ? " ohne Öl" : "") + ' ≈ <strong>' + fmt((hasOil ? perGnoOil : totalG / mult) * mult, 0) + ' g</strong> für ' + portionLabel + ' → <strong>' + portionsTxt + ' × ' + fmt(perGnoOil, 0) + ' g</strong> abfüllen.</div>' : "") +
      (hasOil ? '<h4 class="ph">🧈 Erst vor dem Füttern einrühren <span class="hint">je Portion</span></h4><ul class="oil-list">' +
        oilRowsPer.map(it => "<li><span>" + escapeHtml(it.food) + "</span><strong>" + fmt(num(it.grams), 1) + " g</strong></li>").join("") + "</ul>" +
        (mult !== 1 ? '<div class="hint">Für alle ' + portionsTxt + ' Portionen zusammen: ' + oilRowsPer.map(it => escapeHtml(it.food) + " " + fmt(num(it.grams) * mult, 0) + " g").join(" · ") + "</div>" : "") : "") +
      (res.mct ? '<div class="note ' + (res.mct.energiePz > 50 ? "warn" : "tip") + '">MCT je Portion: <strong>' + fmt(res.mct.gMct, 1) + ' g</strong> (' + fmt(res.mct.energiePz, 0) + ' % der Energie) – klein beginnen, Verträglichkeit beobachten.</div>' : "") +
      (rec.varoma ? '<div class="note tip">🫗 Vor dem Abfüllen durch ein feines Sieb streichen, damit die Spritze nicht verstopft.</div>' : "") +
      "</div>" +

      "</div>" + /* pages */
      '<div class="detail-actions" id="detail-actions"></div>';

    c.querySelectorAll(".seg-portion button[data-scale]").forEach(b =>
      b.addEventListener("click", () => { detailScale = b.dataset.scale === "tag" ? "tag" : (parseFloat(b.dataset.scale) || 1); persistScale(); renderDetail(); }));
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
    const portionReset = c.querySelector("#portion-reset");
    if (portionReset) portionReset.addEventListener("click", () => { delete state.portion[waterKey]; save(); renderDetail(); });
    c.querySelectorAll(".amt-edit:not(.g-edit)").forEach(inp =>
      inp.addEventListener("change", () => {
        const oldG = parseFloat(inp.dataset.g); const nv = parseFloat(String(inp.value).replace(",", "."));
        if (inp.dataset.water === "1") {
          // Nur das Wasser ändern – Rest bleibt; gemerkt wird der Wert je Portion.
          if (isFinite(nv) && nv >= 0) { state.water[waterKey] = nv / mult; save(); renderDetail(); }
          return;
        }
        if (oldG > 0 && nv > 0) { detailScale = mult * (nv / oldG); persistScale(); renderDetail(); }
      }));
    const scaleReset = c.querySelector("#scale-reset");
    if (scaleReset) scaleReset.addEventListener("click", () => { detailScale = 1; persistScale(); renderDetail(); });
    const waterReset = c.querySelector("#water-reset");
    if (waterReset) waterReset.addEventListener("click", () => { delete state.water[waterKey]; save(); renderDetail(); });
    c.querySelectorAll("button[data-goto=vorgaben]").forEach(b =>
      b.addEventListener("click", () => { closeDetail(); showView("vorgaben"); }));
    c.querySelectorAll(".meat-swap button[data-basis]").forEach(b =>
      b.addEventListener("click", () => {
        const v = fam.variants.find(x => recipeKey(x) === b.dataset.basis); if (!v) return;
        if (!state.basis || typeof state.basis !== "object") state.basis = {};
        state.basis[fam.key] = recipeKey(v); save();
        detailRec = v; detailMeat = null;
        renderDetail(); renderRezepte();
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
      const pn = c.querySelector("#page-dots .page-no"); if (pn) pn.textContent = (pageIdx(k) + 1) + "/" + DETAIL_PAGES.length;
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
