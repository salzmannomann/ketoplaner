  /* ---------- Abgeleitete Werte ---------- */
  function derived() {
    const s = state.settings;
    const kcal = num(s.kcal), ratio = num(s.ratio);
    const mahl = Math.max(1, num(s.mahlzeiten) || 1);
    const perKg = num(s.proteinPerKg), weight = num(s.weight);
    const autoProtein = perKg > 0 && weight > 0;
    const eiweiss = autoProtein ? Math.round(weight * perKg) : num(s.eiweiss);
    const mctShare = Math.min(1, Math.max(0, num(s.mctShare)));
    const mctMode = s.mctMode === "kalorien" ? "kalorien" : "verhaeltnis";
    const dampfVerdunstung = num(s.dampfVerdunstung);
    // Kalorien-Korridor: Richtwert ≈ 80 kcal/kg (FAO/WHO/UNU 2004, 6–24 Monate), Untergrenze 70 kcal/kg,
    // Obergrenze 90 kcal/kg. Das Minimum ist manuell übersteuerbar; ohne Gewicht gilt 85 % des Ziels.
    const r10 = (v) => Math.round(v / 10) * 10;
    const kcalRichtwert = weight > 0 ? r10(weight * 80) : null;
    const kcalMaxAuto = weight > 0 ? r10(weight * 90) : null;
    const kcalMinAuto = weight > 0 ? r10(weight * 70) : r10(kcal * 0.85);
    const kcalMin = num(s.kcalMin) > 0 ? num(s.kcalMin) : kcalMinAuto;
    // Flüssigkeit: Richtwert nach Holliday-Segar (100 ml/kg bis 10 kg, dann 50 bzw. 20 ml/kg je weiterem kg);
    // manuell übersteuerbar. Modus: Wasser zwischen den Mahlzeiten sondieren oder in den Mahlzeiten enthalten.
    const hs = (w) => w <= 0 ? 0 : w <= 10 ? 100 * w : w <= 20 ? 1000 + 50 * (w - 10) : 1500 + 20 * (w - 20);
    const fluidAuto = weight > 0 ? r10(hs(weight)) : 0;
    const fluidDay = num(s.fluidMl) > 0 ? num(s.fluidMl) : fluidAuto;
    const wasserModus = s.wasserModus === "mahlzeit" ? "mahlzeit" : s.wasserModus === "zwischen" ? "zwischen" : "ausgewogen";
    // Höchstmenge je Mahlzeit (Bolus): Richtwert 25 ml/kg, manuell übersteuerbar – im Modus „ausgewogen“ wird
    // Wasser nur bis zu dieser Größe in die Mahlzeit gerechnet, der Rest zwischen den Mahlzeiten.
    const maxMahlAuto = weight > 0 ? r10(weight * 25) : 0;
    const maxMahlMl = num(s.maxMahlMl) > 0 ? num(s.maxMahlMl) : maxMahlAuto;
    return { kcal, ratio, mahl, eiweiss, autoProtein, kcalMahl: kcal / mahl, eiweissMahl: eiweiss / mahl, mctShare, mctMode, dampfVerdunstung,
      kcalMin, kcalMinMahl: kcalMin / mahl, kcalMinAuto, kcalMinManual: num(s.kcalMin) > 0, kcalRichtwert, kcalMaxAuto, weight,
      fluidDay, fluidMahl: fluidDay / mahl, fluidAuto, fluidManual: num(s.fluidMl) > 0, wasserModus, maxMahlMl, maxMahlAuto, maxMahlManual: num(s.maxMahlMl) > 0 };
  }
