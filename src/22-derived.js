  /* ---------- Abgeleitete Werte ---------- */
  // Voreinstellung der App für den Eiweißbedarf (g je kg Körpergewicht und Tag); die Verordnung geht immer vor.
  const PROTEIN_STANDARD = 1.5;
  // Eiweiß gegen das Ziel: „low“ unter 90 %, „high“ über dem Doppelten (viel Eiweiß kann die Ketose schwächen), sonst „ok“.
  function proteinState(e, target) { return !(target > 0) ? "ok" : e < target * 0.9 ? "low" : e > target * 2 ? "high" : "ok"; }
  function derived() {
    const s = state.settings;
    const ratio = num(s.ratio);
    const mahl = Math.max(1, num(s.mahlzeiten) || 1);
    const perKg = num(s.proteinPerKg), weight = num(s.weight);
    // Kalorien: leer = Vorschlag nach Gewicht (80 kcal/kg, FAO/WHO/UNU 2004, 6–24 Monate); ohne Gewicht 700 kcal.
    const r10 = (v) => Math.round(v / 10) * 10;
    const kcalManual = num(s.kcal) > 0;
    const kcalAuto = weight > 0 ? r10(weight * 80) : 700;
    const kcal = kcalManual ? num(s.kcal) : kcalAuto;
    const autoProtein = perKg > 0 && weight > 0;
    const eiweiss = autoProtein ? Math.round(weight * perKg) : num(s.eiweiss);
    const mctShare = Math.min(1, Math.max(0, num(s.mctShare)));
    const mctMode = s.mctMode === "kalorien" ? "kalorien" : "verhaeltnis";
    const dampfVerdunstung = num(s.dampfVerdunstung);
    // Rundung beim Abwiegen: alle Zutaten außer Fettträgern fest auf 0,5 g, Wasser auf 1 ml, Fettträger immer 0,1 g.
    const rundung = 0.5;
    // Kalorien-Korridor: Richtwert ≈ 80 kcal/kg (FAO/WHO/UNU 2004, 6–24 Monate), Untergrenze 70 kcal/kg,
    // Obergrenze 90 kcal/kg. Das Minimum ist manuell übersteuerbar; ohne Gewicht gilt 85 % des Ziels.
    const kcalRichtwert = weight > 0 ? r10(weight * 80) : null;
    const kcalMaxAuto = weight > 0 ? r10(weight * 90) : null;
    const kcalMinAuto = weight > 0 ? r10(weight * 70) : r10(kcal * 0.85);
    const kcalMin = num(s.kcalMin) > 0 ? num(s.kcalMin) : kcalMinAuto;
    // Flüssigkeit: Richtwert nach Holliday-Segar (100 ml/kg bis 10 kg, dann 50 bzw. 20 ml/kg je weiterem kg);
    // manuell übersteuerbar. Modus: Wasser zwischen den Mahlzeiten sondieren oder in den Mahlzeiten enthalten.
    const hs = (w) => w <= 0 ? 0 : w <= 10 ? 100 * w : w <= 20 ? 1000 + 50 * (w - 10) : 1500 + 20 * (w - 20);
    const fluidAuto = weight > 0 ? r10(hs(weight)) : 0;
    const fluidDay = num(s.fluidMl) > 0 ? num(s.fluidMl) : fluidAuto;
    // Zwei Stellungen: „zwischen“ (Standard; frühere Werte „ausgewogen“/„zwischen“ landen hier) oder „mahlzeit“.
    const wasserModus = s.wasserModus === "mahlzeit" ? "mahlzeit" : "zwischen";
    // Höchstmenge auf einmal (Mahlzeit oder Wassergabe): 25 ml/kg – darüber warnt die App.
    const maxMahlMl = weight > 0 ? r10(weight * 25) : 0;
    // Flüssigkeitsziel je Mahlzeit: nur im Modus „in den Mahlzeiten dabei“ (Tagesbedarf gleich verteilt).
    // Modus „zwischen“: die Mahlzeit behält ihr Rezept-Wasser zum Anrühren, der Rest kommt als Wassergaben (Zeitplan).
    const fluidMahlZiel = wasserModus === "mahlzeit" ? fluidDay / mahl : 0;
    // Energiedichte höchstens (kcal je ml Mahlzeit), nur im Modus „zwischen“: reicht das Rezept-Wasser nicht,
    // wird gerade so weit aufgefüllt. Vorgabe 1,5 kcal/ml (übliche KetoCal-Zubereitungen 1–1,5); 0 = keine Grenze.
    const maxDichte = (s.maxDichte === "" || s.maxDichte == null) ? 1.5 : Math.max(0, num(s.maxDichte));
    return { kcal, kcalAuto, kcalManual, ratio, mahl, eiweiss, autoProtein, proteinPerKg: perKg, proteinStandard: PROTEIN_STANDARD, kcalMahl: kcal / mahl, eiweissMahl: eiweiss / mahl, mctShare, mctMode, dampfVerdunstung, rundung,
      kcalMin, kcalMinMahl: kcalMin / mahl, kcalMinAuto, kcalMinManual: num(s.kcalMin) > 0, kcalRichtwert, kcalMaxAuto, weight,
      fluidDay, fluidMahl: fluidMahlZiel, fluidAuto, fluidManual: num(s.fluidMl) > 0, wasserModus, maxMahlMl, maxDichte };
  }
