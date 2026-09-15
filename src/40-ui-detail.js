  /* ---------- Detailansicht (Overlay) ---------- */
  let detailRec = null, detailScale = 1, detailMeat = null; // detailScale: Portionen-Faktor, detailMeat: temporäre Fleischwahl
  // Merkt sich die zuletzt eingegebene Menge (Portionen-Faktor) je Rezept – bleibt auch nach dem Schließen erhalten.
  function persistScale() {
    if (!detailRec) return;
    const k = familyKey(detailRec);
    if (Math.abs(detailScale - 1) < 1e-6) delete state.scales[k];
    else state.scales[k] = detailScale;
    save();
  }
  function openRecipeDetail(rec) {
    detailRec = rec; detailScale = num(state.scales[familyKey(rec)]) || 1; detailMeat = null;
    state.settings.detailTab = "rechnen"; // jedes Rezept öffnet mit Rechnen; innerhalb der Ansicht bleibt der gewählte Reiter
    renderDetail();
    const overlay = document.getElementById("detail-overlay");
    overlay.hidden = false;
    document.body.classList.add("modal-open");
  }
  // Eine Mahlzeit vollständig berechnen – dieselbe Pipeline für Detailansicht und Tagesplan:
  // Basis (Verhältnis + kcal/Mahlzeit) → optionaler Fleisch-Tausch → Öl-Mix (MCT-Anteil)
  // → gemerktes Wasser. Ergebnis ist eine Portion (= eine Mahlzeit).
  function computeMealView(rec, d, meatChoice) {
    let base = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
    // Packungs-Modus (z. B. Compleat): feste Menge je Mahlzeit, KetoCal + Auffüller gelöst.
    let packSplit = null;
    if (rec.packung) {
      const ps = packSetting(familyKey(rec));
      if (ps.n > 0) { packSplit = computePackSplit(rec, d.kcalMahl, d.ratio, ps.n, ps.mode, d.kcalMinMahl, ps.fill); if (packSplit && packSplit.ok) base = packSplit; }
    }
    let res = base;
    let adjIndex = base.fatIndex, adjLabel = " ⟵ Fett angepasst";
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
        adjIndex = swapSlot.index; adjLabel = " ⟵ Menge angepasst";
      }
    }
    // Öl-Mix (Rapsöl/MCT): Anteil s + Modus aus den Vorgaben; s = 0 lässt alles unverändert.
    // kcal-Ziel für den Modus KALORIEN = Kalorien der Ansicht bei s = 0 (Basis bzw.
    // nach Fleisch-Tausch), damit "kcal konstant" sich auf den sichtbaren Ist-Zustand bezieht.
    const baseOilIndex = oilSlotIndex(res.items);
    const kcalZielOil = sumMacros(res.items).kcal;
    if (baseOilIndex >= 0 && d.mctShare > 0) res = applyOilMix(res, d, d.mctShare, d.mctMode, kcalZielOil);
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
    return { res, adjIndex, adjLabel, baseOilIndex, waterKey, hasWaterOverride, packSplit };
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
      rec, res: mv.res, sum, ratio: ratioOf(sum),
      gNoOil: noOil.reduce((a, it) => a + num(it.grams), 0), mlNoOil: volumeMl(noOil),
      oils, hasOil: oils.length > 0,
      gMct: oils.filter(it => it.food === "MCT-Öl C8+C10").reduce((a, it) => a + num(it.grams), 0),
      gRaps: oils.filter(it => it.food === "Rapsöl").reduce((a, it) => a + num(it.grams), 0),
    };
  }
  // Hinweis auf die globale Rechenregel (Vorgaben) – gilt für MCT und Packung gleichermaßen.
  function regelZeile(d) {
    return '<div class="hint" style="margin-top:8px">Rechenregel: <strong>' + regelLabel(d) + '</strong> · <button type="button" class="linkbtn" data-goto="vorgaben">unter Vorgaben ändern</button></div>';
  }
  function renderDetail() {
    const rec = detailRec;
    const d = derived();
    const mv = computeMealView(rec, d, detailMeat);
    const res = mv.res, adjIndex = mv.adjIndex, adjLabel = mv.adjLabel;
    const baseOilIndex = mv.baseOilIndex, waterKey = mv.waterKey, hasWaterOverride = mv.hasWaterOverride;
    const mult = detailScale > 0 ? detailScale : 1;
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
        '</div><div class="meat-note">Gleiches Gericht, andere Fettbasis – Mengen werden neu gerechnet. Die Wahl wird für dieses Gericht gemerkt; für alle anderen gilt die Vorgabe „' +
        (ketoPhase() === "mit" ? "mit" : "ohne") + ' KetoCal“.</div></div>';
    }

    // Packung aufteilen (z. B. Compleat 500 ml, 2 Tage haltbar): auf N Mahlzeiten – Auffüller ergänzt die Kalorien.
    let packSeg = "";
    const pset = rec.packung ? packSetting(fam.key) : { n: 0, mode: "verhaeltnis" };
    const packNSet = pset.n;
    if (rec.packung) {
      const pi = packInfo(rec, d), pk = pi.pk, ps = mv.packSplit;
      const active = packNSet > 0 && ps && ps.ok;
      const kcalMode = pset.mode === "kalorien" && pset.fill; // ohne Auffüller lässt sich „Kalorien halten“ nicht rechnen
      const kurz = pk.kurz || pk.auffuellen;
      const tage = (n) => fmt(n / d.mahl, 1) + " Tag" + (Math.abs(n / d.mahl - 1) < 0.05 ? "" : "e") + " bei " + d.mahl + " Mahlzeiten/Tag";
      const sgn = (v) => (v < -0.05 ? "−" : v > 0.05 ? "+" : "±") + fmt(Math.abs(v), 0);
      // Haltbarkeit: reicht die Packung ohne Aufteilung länger als sie offen haltbar ist, verfällt der Rest –
      // aufbrauchen ginge dann nur mit mehr Compleat je Mahlzeit, also mehr Kalorien (wird vorgerechnet).
      const maxInTage = d.mahl * pk.tage;
      let haltNote = "";
      if (pi.nAuto > maxInTage) {
        const alt = computePackSplit(rec, d.kcalMahl, d.ratio, maxInTage, "verhaeltnis", 0, false);
        const used = maxInTage * pi.mlStd;
        haltNote = '<div class="note warn">⚠️ Haltbarkeit: In ' + pk.tage + ' Tagen werden bei ' + d.mahl + ' Mahlzeiten/Tag nur ' + maxInTage + ' × ' + fmt(pi.mlStd, 0) + ' ml = ' + fmt(used, 0) + ' ml verbraucht, <strong>' + fmt(pk.ml - used, 0) + ' ml verfallen</strong>. ' +
          'Bei ' + fmtTarget(d.ratio) + ' lässt sich die Packung in ' + pk.tage + ' Tagen nur mit deutlich mehr Kalorien aufbrauchen' +
          (alt && alt.pack ? ' (auf ' + maxInTage + ' aufgeteilt: ' + fmt(alt.pack.fixedMl, 0) + ' ml + ' + fmt(alt.pack.k, 1) + ' g KetoCal = <strong>' + fmt(alt.kcal, 0) + ' kcal</strong> je Mahlzeit statt ' + fmt(d.kcalMahl, 0) + ')' : '') + '.</div>';
      }
      let txt;
      const rejected = packNSet > 0 && !active;
      if (rejected && ps && ps.pack && ps.pack.tooHigh) {
        // Abgelehnt: so viel Compleat je Mahlzeit ergäbe viel zu viele Kalorien – gilt unabhängig vom Auffüll-Schalter.
        const other = fam.variants.find(v => recipeKey(v) !== recipeKey(rec) && v.packung);
        let altTxt = "";
        if (other) {
          const alt = computePackSplit(other, d.kcalMahl, d.ratio, packNSet, pset.mode, d.kcalMinMahl, pset.fill);
          if (alt && alt.ok) altTxt = ' <strong>Ausweg:</strong> Fettbasis <strong>' + escapeHtml(basisLabel(other)) + '</strong> statt ' + escapeHtml(basisLabel(rec)) + ' – dann sind es <strong>' + fmt(alt.kcal, 0) + ' kcal</strong> je Mahlzeit und die Packung geht auf (Umschalter unter Kochen).';
        }
        txt = '<div class="note warn">⛔ <strong>Aufteilung auf ' + packNSet + ' Mahlzeiten (' + pset.tage + ' Tag' + (pset.tage > 1 ? 'e' : '') + ' × ' + pset.perDay + ' je Tag) nicht angewendet:</strong> ' + fmt(ps.pack.fixedMl, 0) + ' ml ' + escapeHtml(pk.food) + ' je Mahlzeit bräuchten bei ' + fmtTarget(d.ratio) + ' ' + fmt(ps.pack.k, 1) + ' g ' + escapeHtml(basisLabel(rec)) +
          (hasKetoCal(rec.items) ? ' (KetoCal bringt selbst Eiweiß und KH mit, die wieder Fett brauchen)' : '') + ' – das wären <strong>' + fmt(ps.kcal, 0) + ' kcal je Mahlzeit</strong> statt ' + fmt(d.kcalMahl, 0) + ' (' + fmt(ps.kcal * d.mahl, 0) + ' kcal am Tag). ' +
          'Auffüllen hilft hier nicht, die Mahlzeit ist ohnehin zu groß. Gerechnet wird deshalb <strong>ohne Aufteilung</strong>: ' + fmt(pi.mlStd, 0) + ' ml je Mahlzeit, die Packung reicht für ' + pi.nAuto + ' Mahlzeiten' +
          (pi.nAuto > maxInTage ? ', <strong>' + fmt(pk.ml - maxInTage * pi.mlStd, 0) + ' ml verfallen</strong> nach ' + pk.tage + ' Tagen' : '') + '.' + altTxt + '</div>';
      } else if (rejected) {
        txt = '<div class="note warn">⚠️ Auf ' + packNSet + ' Mahlzeiten geht die Packung bei ' + fmtTarget(d.ratio) + ' nicht auf (' + escapeHtml(basisLabel(rec)) + ' müsste negativ werden – ' + escapeHtml(pk.food) + ' allein liegt schon über dem Verhältnis). ' +
          'Gerechnet wird ohne Aufteilung: ' + fmt(pi.mlStd, 0) + ' ml je Mahlzeit, die Packung reicht für ' + pi.nAuto + ' Mahlzeiten.</div>';
      } else if (active && kcalMode && !ps.pack.fillSkipped) {
        txt = '<div class="meat-note"><strong>' + fmt(ps.pack.fixedMl, 0) + ' ml ' + escapeHtml(pk.food) + '</strong> je Mahlzeit; damit Verhältnis und ' + fmt(d.kcalMahl, 0) + ' kcal stimmen, kommen <strong>' +
          fmt(ps.pack.k, 1) + ' g ' + escapeHtml(basisLabel(rec)) + '</strong> (Fett fürs Verhältnis) und <strong>' + fmt(Math.max(0, ps.pack.p), 1) + ' g ' + escapeHtml(pk.auffuellen) + '</strong> (Kalorien) dazu. ' +
          packNSet + ' Mahlzeiten = ' + tage(packNSet) + '.</div>';
      } else if (active && ps.pack.filledToMin) {
        txt = '<div class="meat-note"><strong>' + fmt(ps.pack.fixedMl, 0) + ' ml ' + escapeHtml(pk.food) + '</strong> + <strong>' + fmt(ps.pack.k, 1) + ' g ' + escapeHtml(basisLabel(rec)) + '</strong> + <strong>' + fmt(ps.pack.p, 1) + ' g ' + escapeHtml(pk.auffuellen) + '</strong> je Mahlzeit. ' +
          'Ohne Auffüllen wären es nur ' + fmt(ps.pack.kcalFree, 0) + ' kcal – unter dem Minimum von ' + fmt(d.kcalMinMahl, 0) + ' kcal je Mahlzeit (' + fmt(d.kcalMin, 0) + ' kcal/Tag). ' +
          'Deshalb mit ' + escapeHtml(pk.auffuellen) + ' auf <strong>' + fmt(ps.kcal, 0) + ' kcal</strong> aufgefüllt (Ziel wäre ' + fmt(d.kcalMahl, 0) + '); Verhältnis exakt. ' +
          packNSet + ' Mahlzeiten = ' + tage(packNSet) + '.</div>';
      } else if (active && ps.pack.belowMin) {
        txt = '<div class="meat-note"><strong>' + fmt(ps.pack.fixedMl, 0) + ' ml ' + escapeHtml(pk.food) + '</strong> + <strong>' + fmt(ps.pack.k, 1) + ' g ' + escapeHtml(basisLabel(rec)) + '</strong> je Mahlzeit – Verhältnis exakt, <strong>' + fmt(ps.kcal, 0) + ' kcal</strong> statt ' + fmt(d.kcalMahl, 0) + '. ' +
          packNSet + ' Mahlzeiten = ' + tage(packNSet) + '.</div>' +
          '<div class="note warn">⚠️ Unter dem Minimum von ' + fmt(d.kcalMinMahl, 0) + ' kcal je Mahlzeit (' + fmt(d.kcalMin, 0) + ' kcal/Tag) – nicht aufgefüllt, weil „nicht auffüllen“ gewählt ist. Am Tag mit einer anderen Mahlzeit ausgleichen (der Tagesplan prüft das) oder Auffüllen mit ' + escapeHtml(kurz) + ' zulassen.</div>';
      } else if (active) {
        const devTag = ps.pack.dev * d.mahl;
        txt = '<div class="meat-note"><strong>' + fmt(ps.pack.fixedMl, 0) + ' ml ' + escapeHtml(pk.food) + '</strong> + <strong>' + fmt(ps.pack.k, 1) + ' g ' + escapeHtml(basisLabel(rec)) + '</strong> je Mahlzeit – Verhältnis exakt, ' +
          '<strong>' + fmt(ps.kcal, 0) + ' kcal</strong> statt ' + fmt(d.kcalMahl, 0) + ' (' + sgn(ps.pack.dev) + ' kcal je Mahlzeit, ' + sgn(devTag) + ' kcal je Tag; Minimum ' + fmt(d.kcalMin, 0) + ' kcal/Tag eingehalten). ' +
          packNSet + ' Mahlzeiten = ' + tage(packNSet) + '.' +
          (kcalMode && ps.pack.fillSkipped ? ' Auffüllen mit ' + escapeHtml(kurz) + ' ist hier nicht nötig – die Mahlzeit liegt schon über dem Ziel.' : '') + '</div>';
      } else {
        txt = '<div class="meat-note">Ohne Aufteilung: ' + fmt(pi.mlStd, 0) + ' ml je Mahlzeit → die Packung reicht für <strong>' + pi.nAuto + ' Mahlzeiten</strong> (' + tage(pi.nAuto) + '), Rest ' + fmt(pi.rest, 0) + ' ml. ' +
          'Zum Aufteilen oben wählen, in wie vielen Tagen die Packung aufgebraucht sein soll – die App rechnet die Menge je Mahlzeit.</div>' + haltNote;
      }
      const showFill = packNSet > 0 && !(ps && ps.pack && ps.pack.tooHigh);
      // Steuerung: „Packung aufbrauchen in T Tagen“ (bis zur Haltbarkeit) und „Mahlzeiten je Tag damit“ –
      // die Mahlzeiten je Packung ergeben sich daraus (T × P); ohne Aufteilung gilt die Standardrechnung.
      const prodWord = String(pk.food).split(" ")[0];
      const tageBtn = (t, lab) => '<button type="button" data-ptage="' + t + '"' + (pset.tage === t ? ' class="active"' : "") + '>' + lab + '</button>';
      let tageBtns = tageBtn(0, "ohne Aufteilung");
      for (let t = 1; t <= pk.tage; t++) tageBtns += tageBtn(t, "in " + t + " Tag" + (t > 1 ? "en" : "") + " aufbrauchen");
      packSeg = '<div class="meat-swap pack"><div class="seg-label">🧃 Packung ' + pk.ml + ' ml · offen ' + pk.tage + ' Tage haltbar</div>' +
        '<div class="segmented mini">' + tageBtns + '</div>' +
        (pset.tage > 0 ? '<div class="portion-step" style="margin-top:8px">Mahlzeiten je Tag mit ' + escapeHtml(prodWord) + ': ' +
          '<button type="button" class="stepbtn" data-pstep="-1">−</button>' +
          '<input id="pack-perday" type="number" min="1" max="' + d.mahl + '" step="1" inputmode="numeric" value="' + pset.perDay + '">' +
          '<button type="button" class="stepbtn" data-pstep="1">+</button> von ' + d.mahl + ' → <strong>' + packNSet + ' Mahlzeiten</strong> je Packung</div>' : "") +
        (showFill ? '<div class="segmented mini" style="margin-top:8px">' +
          '<button type="button" data-pfill="1"' + (pset.fill ? ' class="active"' : "") + '>Auffüllen mit ' + escapeHtml(kurz) + '</button>' +
          '<button type="button" data-pfill="0"' + (!pset.fill ? ' class="active"' : "") + '>nicht auffüllen</button>' +
        '</div>' : "") +
        (showFill && pset.mode === "kalorien" && !pset.fill ? '<div class="hint" style="margin-top:6px">„Kalorien halten“ braucht einen Auffüller – ohne ihn wird nur das Verhältnis gehalten.</div>' : "") +
        txt + regelZeile(d) + '</div>';
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
        '</div><div class="meat-note">Es ändert sich nur das Fleisch – Gemüse, Wasser und Öl/Fett bleiben gleich. Die Fleischmenge wird so berechnet, dass das Verhältnis genau stimmt (sie kann daher etwas von 30 g / 18 g abweichen; die Kalorien können leicht variieren).</div></div>';
    }

    let oilSeg = "";
    if (baseOilIndex >= 0) {
      const sOil = d.mctShare, mm = res.mct || null;
      const shareBtn = (v) => '<button type="button" data-mcts="' + v + '"' + (Math.abs(sOil - v / 100) < 0.005 ? ' class="active"' : "") + ">" + v + " %</button>";
      let note;
      if (!(sOil > 0)) {
        note = "Nur Rapsöl. Der MCT-Anteil bezieht sich auf die <strong>Öl-Fettmasse</strong>. Beim Tausch gegen ein Fett anderer Energiedichte lassen sich Fettmasse, Kalorien und Verhältnis nicht gleichzeitig halten – der Modus legt fest, welche Größe exakt bleibt.";
      } else {
        note = (d.mctMode === "kalorien"
          ? "🎯 <strong>Kalorien halten:</strong> Die Kalorien bleiben für jeden MCT-Anteil gleich; das Verhältnis steigt mit dem Anteil."
          : "⚖️ <strong>Verhältnis halten:</strong> Das Verhältnis bleibt für jeden MCT-Anteil exakt gleich; die Kalorien sinken mit dem Anteil (MCT liefert weniger kcal je Gramm). Ein Tausch bei gleicher Fettmasse lässt das Verhältnis unberührt – die Fettart kommt darin nicht vor.") +
          "<br>⚠️ MCT kann durch Capronsäure (C6) den Rachen reizen. Klein beginnen und die Verträglichkeit beobachten." +
          "<br><small>MCT ist je kcal ketogener als langkettiges Fett – ein Tausch senkt die Ketose nicht. Besser verträglich: weniger MCT je Mahlzeit, dafür in jeder Mahlzeit. Die Vorbelegung 8,3 kcal/g für MCT ist ein <strong>Praxiswert</strong>, kein belegter Etikettwert – echte Etikettwerte unter ⚙️ Einstellungen eintragen (auch Emulsionen mit geringerem Fettanteil).</small>";
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
        '<div class="meat-note">' + note + "</div>" + warn + (sOil > 0 ? regelZeile(d) : "") + "</div>";
    }

    // Zwei Sichten auf dieselben Zutaten: Küche (abwiegen, editierbar) und Rechnen (Nährwerte, nur lesen).
    let kRows = "", nRows = "";
    items.forEach((it, i) => {
      const g = num(it.grams) * mult;
      const m = lineMacros({ food: it.food, grams: g });
      const isWaterRow = /wasser/i.test(it.food);
      const gR = Math.round(g * 10) / 10;
      kRows += "<tr" + (i === adjIndex ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) +
        (isWaterRow && hasWaterOverride ? " <span class='muted'>⟵ angepasst</span>" : "") + "</td>" +
        '<td class="amt"><input class="amt-edit" type="number" min="0" step="1" inputmode="decimal" data-g="' + gR + '" data-water="' + (isWaterRow ? "1" : "0") + '" value="' + gR + '"> <span class="unit">g</span></td></tr>';
      nRows += "<tr" + (i === adjIndex ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) + (i === adjIndex ? adjLabel : "") + "</td>" +
        "<td>" + fmt(g, 1) + "</td><td>" + fmt(m.eiweiss) + "</td><td>" + fmt(m.fett) + "</td><td>" + fmt(m.kh) + "</td><td>" + fmt(m.kcal, 0) + "</td></tr>";
    });
    // Zubereitung als nummerierte Schritte (Varoma bevorzugt; Dämpfwasser-Rechnung ist darin enthalten).
    const prepText = rec.varoma
      ? adaptOil(adaptVaroma(adaptPrep(rec.varoma, rec, detailMeat)))
      : (rec.zubereitung ? adaptOil(adaptPrep(rec.zubereitung, rec, detailMeat)) : "");
    const steps = splitSteps(prepText);
    const stepsHtml = steps.length ? "<ol class='steps'>" + steps.map(s => "<li>" + escapeHtml(s) + "</li>").join("") + "</ol>" : "";
    // Abfüllen: Öl-Zeilen je Portion (kommen erst vor dem Füttern dazu)
    const oilRowsPer = items.filter(it => isOil(it.food));
    const dtab = ["rechnen", "kochen", "abfuellen"].indexOf(state.settings.detailTab) >= 0 ? state.settings.detailTab : "rechnen";
    const tabBtn = (k, lab) => '<button type="button" data-dtab="' + k + '"' + (dtab === k ? ' class="active"' : "") + ">" + lab + "</button>";
    const paneOpen = (k) => '<div class="pane" data-pane="' + k + '"' + (dtab !== k ? " hidden" : "") + ">";
    const sign = (v) => v < -0.05 ? "−" : (v > 0.05 ? "+" : "±");

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
    const daySeg =
      '<h4 class="ph">📅 Ein Tag <span class="hint">= ' + dayN + ' × diese Mahlzeit (nicht die Packung)</span></h4>' +
      '<div class="detail-tiles">' +
        '<div class="dstat' + (dayLow ? " warn" : "") + '"><div class="v">' + fmt(dayKcal, 0) + '</div><div class="l">kcal/Tag · Ziel ' + fmt(d.kcal, 0) + '<br><small>Minimum ' + fmt(d.kcalMin, 0) + (dayLow ? ' – unterschritten!' : ' ✓') + (dayHigh ? ' · über Korridor (' + fmt(d.kcalMaxAuto, 0) + ')' : '') + '</small></div></div>' +
        '<div class="dstat' + (dayP < d.eiweiss * 0.9 ? " warn" : "") + '"><div class="v">' + fmt(dayP) + ' g</div><div class="l">Eiweiß/Tag · Ziel ' + fmt(d.eiweiss, 0) + ' g</div></div>' +
        '<div class="dstat"><div class="v">' + fmt(dayF) + ' g</div><div class="l">Fett/Tag</div></div>' +
        '<div class="dstat"><div class="v">' + fmt(dayC) + ' g</div><div class="l">KH/Tag</div></div>' +
      '</div>' +
      dayTable +
      (dayLow ? '<div class="note warn">⚠️ Nur mit diesem Rezept läge der Tag unter dem Kalorien-Minimum – im Tagesplan mit anderen Mahlzeiten kombinieren.</div>' : "");

    const c = document.getElementById("detail-content");
    c.innerHTML =
      '<div class="detail-head"><span class="detail-icon">' + (rec.icon || "🥑") + "</span>" +
        '<div><div class="title">' + escapeHtml(familyOf(rec)) + " " + ketoBadge + "</div>" +
        '<div class="meta"><span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmtRatio(r, 2) + "</span> · " +
        fmt(sumPer.kcal, 0) + " kcal je Portion · zeigt: " + portionLabel + "</div></div></div>" +
      '<div class="segmented detail-tabs" id="detail-tabs">' + tabBtn("rechnen", "📊 Rechnen") + tabBtn("kochen", "🍳 Kochen") + tabBtn("abfuellen", "💉 Abfüllen") + "</div>" +

      /* ---------- Kochen ---------- */
      paneOpen("kochen") +
      basisSeg +
      '<div class="seg-portion batch">' +
        '<span class="seg-label">Menge zubereiten:</span>' +
        '<div class="segmented mini">' +
          '<button type="button" data-scale="1"' + (mult === 1 ? ' class="active"' : "") + ">1 Portion</button>" +
          '<button type="button" data-scale="' + d.mahl + '"' + (Math.abs(mult - d.mahl) < 0.01 ? ' class="active"' : "") + ">Ganzer Tag (×" + d.mahl + ")</button>" +
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
      '<details class="collapsible"><summary>ⓘ Menge direkt eingeben</summary><p>Eine Menge in der Liste ändern (z. B. „827 g Zucchini, weil so viel da ist") – die <strong>anderen Zutaten werden proportional mitskaliert</strong>, das Verhältnis bleibt. <strong>Ausnahme Wasser:</strong> wird nur für sich geändert. Beides wird je Rezept gemerkt.</p></details>' +
      (stepsHtml ? '<h4 class="ph">' + (rec.varoma ? "🫧 Zubereitung mit Varoma (dämpfen)" : "🥣 Zubereitung") + "</h4>" + stepsHtml : "") +
      (mult !== 1 ? '<div class="note info">Garzeiten gelten für <strong>eine</strong> Portion – bei größerer Menge länger garen, bis alles weich ist, ggf. portionsweise pürieren. Im Kühlschrank lagern.</div>' : "") +
      "</div>" +

      /* ---------- Abfüllen ---------- */
      paneOpen("abfuellen") +
      '<div class="fill-hero"><div class="fill-big">≈ ' + fmt(perGnoOil, 0) + ' g</div>' +
        '<div class="fill-sub">≈ ' + fmt(perMlNoOil, 0) + ' ml je Portion' + (hasOil ? " · <strong>ohne Öl</strong>" : "") + "</div></div>" +
      (mult !== 1 ? '<div class="note info">Gesamt' + (hasOil ? " ohne Öl" : "") + ' ≈ <strong>' + fmt((hasOil ? perGnoOil : totalG / mult) * mult, 0) + ' g</strong> für ' + portionLabel + ' → <strong>' + portionsTxt + ' × ' + fmt(perGnoOil, 0) + ' g</strong> abfüllen.</div>' : "") +
      (hasOil ? '<h4 class="ph">🧈 Erst vor dem Füttern einrühren <span class="hint">je Portion</span></h4><ul class="oil-list">' +
        oilRowsPer.map(it => "<li><span>" + escapeHtml(it.food) + "</span><strong>" + fmt(num(it.grams), 1) + " g</strong></li>").join("") + "</ul>" +
        (mult !== 1 ? '<div class="hint">Für alle ' + portionsTxt + ' Portionen zusammen: ' + oilRowsPer.map(it => escapeHtml(it.food) + " " + fmt(num(it.grams) * mult, 0) + " g").join(" · ") + "</div>" : "") : "") +
      (res.mct ? '<div class="note ' + (res.mct.energiePz > 50 ? "warn" : "tip") + '">MCT je Portion: <strong>' + fmt(res.mct.gMct, 1) + ' g</strong> (' + fmt(res.mct.energiePz, 0) + ' % der Energie) – klein beginnen, Verträglichkeit beobachten.</div>' : "") +
      (rec.varoma ? '<div class="note tip">🫗 Vor dem Abfüllen durch ein feines Sieb streichen, damit die Spritze nicht verstopft.</div>' : "") +
      "</div>" +

      /* ---------- Rechnen ---------- */
      paneOpen("rechnen") +
      packSeg +
      meatSeg +
      oilSeg +
      '<h4 class="ph">🍽️ Mahlzeit <span class="hint">' + (mult === 1 ? "je Portion" : "für " + portionLabel) + '</span></h4>' +
      '<div class="detail-tiles">' +
        '<div class="dstat"><div class="v">' + fmt(sum.kcal, 0) + '</div><div class="l">kcal</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(hasOil ? perGnoOil * mult : totalG, 0) + ' g</div><div class="l">Menge' + (hasOil ? ' ohne Öl<br><small>mit Öl ≈ ' + fmt(totalG, 0) + ' g</small>' : "") + '</div></div>' +
        '<div class="dstat"><div class="v">≈ ' + fmt(hasOil ? perMlNoOil * mult : ml, 0) + ' ml</div><div class="l">Volumen' + (hasOil ? ' ohne Öl<br><small>mit Öl ≈ ' + fmt(ml, 0) + ' ml</small>' : "") + '</div></div>' +
        '<div class="dstat ' + (proteinOk ? "" : "warn") + '"><div class="v">' + fmt(sum.eiweiss) + ' g</div><div class="l">Eiweiß (Ziel ' + fmt(proteinTarget) + ' g)</div></div>' +
      "</div>" +
      (res.mct ? '<div class="detail-tiles">' +
        '<div class="dstat"><div class="v">' + fmt(res.mct.energiePz, 1) + ' %</div><div class="l">MCT-Anteil der Energie<br><small>' + mctEinordnung(res.mct.energiePz) + '</small></div></div>' +
        '<div class="dstat"><div class="v">' + sign(res.mct.dev) + fmt(Math.abs(res.mct.dev), 1) + ' kcal</div><div class="l">Abweichung je Portion<br><small>je Tag ' + sign(res.mct.dev) + fmt(Math.abs(res.mct.dev * d.mahl), 0) + ' kcal (×' + d.mahl + ')</small></div></div>' +
        '<div class="dstat"><div class="v">' + fmt(res.mct.gMct, 1) + ' g</div><div class="l">MCT je Portion<br><small>maßgeblich für die Verträglichkeit</small></div></div>' +
      "</div>" : "") +
      (!proteinOk ? '<div class="note warn">⚠️ Liegt unter dem Eiweiß-Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
      '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' +
        nRows +
        "<tr class='sum'><td class='name'>Summe</td><td>" + fmt(totalG, 0) + "</td><td>" + fmt(sum.eiweiss) + "</td><td>" +
        fmt(sum.fett) + "</td><td>" + fmt(sum.kh) + "</td><td>" + fmt(sum.kcal, 0) + "</td></tr>" +
      "</tbody></table></div>" +
      daySeg +
      '<div class="btn-row"><button type="button" class="btn" id="edit-btn">✏️ ' + (rec.custom ? "Rezept bearbeiten" : "Zutaten ändern / tauschen (Editor)") + "</button></div>" +
      "</div>";

    c.querySelectorAll(".seg-portion button[data-scale]").forEach(b =>
      b.addEventListener("click", () => { detailScale = parseFloat(b.dataset.scale) || 1; persistScale(); renderDetail(); }));
    c.querySelectorAll(".seg-portion button[data-step]").forEach(b =>
      b.addEventListener("click", () => {
        detailScale = Math.max(0.5, Math.round((mult + parseFloat(b.dataset.step)) * 2) / 2);
        persistScale(); renderDetail();
      }));
    const pin = c.querySelector("#portion-input");
    if (pin) pin.addEventListener("change", () => {
      const v = parseFloat(String(pin.value).replace(",", ".")); if (v > 0) { detailScale = v; persistScale(); renderDetail(); }
    });
    c.querySelectorAll(".amt-edit").forEach(inp =>
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
    const setPack = (tage, perDay, fill) => {
      if (!state.pack || typeof state.pack !== "object") state.pack = {};
      if (tage > 0) state.pack[fam.key] = { tage: Math.round(tage), perDay: Math.max(1, Math.min(d.mahl, Math.round(perDay) || d.mahl)), fill: fill !== false };
      else delete state.pack[fam.key];
      save(); renderDetail(); renderRezepte(); // Kachel zeigt die aufgeteilte Mahlzeit mit
    };
    c.querySelectorAll(".pack button[data-ptage]").forEach(b =>
      b.addEventListener("click", () => setPack(parseInt(b.dataset.ptage, 10), pset.perDay, pset.fill)));
    const perIn = c.querySelector("#pack-perday");
    if (perIn) {
      perIn.addEventListener("change", () => setPack(pset.tage, parseInt(perIn.value, 10) || d.mahl, pset.fill));
      c.querySelectorAll(".pack button[data-pstep]").forEach(b =>
        b.addEventListener("click", () => setPack(pset.tage, (parseInt(perIn.value, 10) || d.mahl) + parseInt(b.dataset.pstep, 10), pset.fill)));
    }
    c.querySelectorAll(".pack button[data-pfill]").forEach(b =>
      b.addEventListener("click", () => setPack(pset.tage, pset.perDay, b.dataset.pfill === "1")));
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
    c.querySelectorAll("#detail-tabs button[data-dtab]").forEach(b =>
      b.addEventListener("click", () => { state.settings.detailTab = b.dataset.dtab; save(); renderDetail(); }));
    const editBtn = c.querySelector("#edit-btn");
    if (editBtn) editBtn.addEventListener("click", () => { const r = applyMeatChoice(rec, detailMeat); (rec.custom ? seedComposeFromSaved(r) : seedComposeFromRecipe(r)); closeDetail(); openCompose(); });

    const actions = el("div", { class: "btn-row actions" });
    const fav = isFav(rec);
    const favBtn = el("button", { class: "btn secondary" }, (fav ? "★ Favorit (aktiv)" : "☆ Als Favorit"));
    favBtn.addEventListener("click", () => { toggleFav(rec); openRecipeDetail(rec); });
    actions.appendChild(favBtn);
    const printBtn = el("button", { class: "btn secondary" }, "🖨️ Rezept drucken");
    printBtn.addEventListener("click", () => printRecipe(rec, res, d, mult));
    actions.appendChild(printBtn);
    if (rec.custom) {
      const delBtn = el("button", { class: "btn ghost" }, "🗑️ Löschen");
      delBtn.addEventListener("click", () => {
        if (confirm("Eigenes Rezept „" + rec.name + "“ wirklich löschen?")) {
          state.savedRecipes = state.savedRecipes.filter(s => s.key !== rec.key);
          const fi = state.favorites.indexOf(rec.key); if (fi !== -1) state.favorites.splice(fi, 1);
          save(); closeDetail(); renderRezepte();
        }
      });
      actions.appendChild(delBtn);
    }
    c.appendChild(actions);
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
