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
    return { kcal, ratio, mahl, eiweiss, autoProtein, kcalMahl: kcal / mahl, eiweissMahl: eiweiss / mahl, mctShare, mctMode, dampfVerdunstung,
      kcalMin, kcalMinMahl: kcalMin / mahl, kcalMinAuto, kcalMinManual: num(s.kcalMin) > 0, kcalRichtwert, kcalMaxAuto, weight };
  }
