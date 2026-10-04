  /* ---------- Bedarf schätzen (Vorgaben) ----------
     Orientierung für das Gespräch mit dem Team – ändert die Verordnung nicht. Aus Geburtsdatum (Alter läuft
     automatisch mit), Geschlecht, Gewicht, Bewegung und Muskelspannung:
       · Grundumsatz nach Schofield 1985 (nur Gewicht)
       · Schätzung nach Krick 1992: Grundumsatz × Muskelspannung × Bewegung + 5 kcal je g gewünschter Zunahme
       · 60–70 % des Bedarfs gesund entwickelter Kinder (ESPGHAN 2017 für Kinder, die nicht gehen)
       · Bedarf gesund entwickelter Kinder nach FAO/WHO/UNU 2004 (kcal/kg je Lebensjahr) */
  const BD_MOBIL = { geht: [1.3, "geht", "geht"], krabbelt: [1.25, "krabbelt", "krabbelt"], getragen: [1.2, "getragen / Rollstuhl", "getragen wird oder im Rollstuhl sitzt"], liegt: [1.15, "liegt viel", "viel liegt"] };
  const BD_TONUS = { schlaff: [0.9, "schlaffer"], normal: [1.0, "normaler"], erhoeht: [1.1, "erhöhter"] };
  // FAO/WHO/UNU 2004, kcal/kg/Tag für das 2. bis 10. Lebensjahr (Index = volle Jahre 1…9); unter 1 Jahr 80 kcal/kg
  const BD_FAO = { m: [null, 82.4, 83.6, 79.7, 76.8, 74.5, 72.5, 70.5, 68.5, 66.6], w: [null, 80.1, 80.6, 76.5, 73.9, 71.5, 69.3, 66.7, 63.8, 60.8] };
  function bdAgeMonths(iso, now) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); if (!m) return null;
    const b = new Date(+m[1], +m[2] - 1, +m[3]), n = now || new Date();
    let mo = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
    if (n.getDate() < b.getDate()) mo--;
    return mo >= 0 && mo < 18 * 12 ? mo : null;
  }
  function bdAgeText(mo) { const y = Math.floor(mo / 12), r = mo % 12; return (y ? y + " J" : "") + (y && r ? " " : "") + (r || !y ? r + " M" : ""); }
  function schofield(sex, years, kg) {
    if (years < 3) return sex === "m" ? 59.512 * kg - 30.4 : 58.317 * kg - 31.1;
    if (years < 10) return sex === "m" ? 22.706 * kg + 504.3 : 20.315 * kg + 485.9;
    return sex === "m" ? 17.686 * kg + 658.2 : 13.384 * kg + 692.6;
  }
  function faoPerKg(sex, years) { if (years < 1) return 80; const t = BD_FAO[sex === "m" ? "m" : "w"]; return t[Math.min(9, Math.floor(years))]; }
  function proteinRef(years) { return years < 2 ? 1.1 : years < 4 ? 1.0 : 0.9; } // g/kg/Tag, Richtwert (EFSA)
  // Alle Kennzahlen; null, wenn Geburtsdatum oder Gewicht fehlen
  function bedarfCalc(d, s, now) {
    const mo = bdAgeMonths(s.bdBirth, now), kg = d.weight;
    if (mo == null || !(kg > 0)) return null;
    const years = mo / 12, sex = s.bdSex === "m" ? "m" : "w";
    const mob = BD_MOBIL[s.bdMobil] || BD_MOBIL.liegt, ton = BD_TONUS[s.bdTonus] || BD_TONUS.normal;
    const gain = s.bdGain == null ? 5 : num(s.bdGain);
    const bmr = schofield(sex, years, kg);
    const krick = bmr * ton[0] * mob[0] + 5 * gain;
    const ref = faoPerKg(sex, years) * kg;
    // Formelwechsel am 3. Geburtstag: Schätzung springt (gleiches Gewicht) – Hinweis im Vierteljahr davor/danach
    const jump = (mo >= 33 && mo < 39) ? Math.round((schofield(sex, 3.5, kg) / schofield(sex, 2.5, kg) - 1) * 100) : 0;
    return { mo, years, sex, kg, mob, ton, gain, bmr, krick, ref, lo: ref * 0.6, hi: ref * 0.7, jump, protRef: proteinRef(years) };
  }
  function renderBedarf(d) {
    const out = document.getElementById("bd-out"); if (!out) return;
    const s = state.settings;
    const put = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; };
    put("bd-birth", s.bdBirth || ""); put("bd-mobil", s.bdMobil || "liegt"); put("bd-tonus", s.bdTonus || "normal");
    put("bd-sex", s.bdSex === "m" ? "m" : "w");
    document.querySelectorAll("#bd-gain button").forEach(b => b.classList.toggle("active", num(b.dataset.gain) === (s.bdGain == null ? 5 : num(s.bdGain))));
    const r = bedarfCalc(d, s);
    const age = document.getElementById("bd-age"); if (age) age.textContent = r ? bdAgeText(r.mo) : "";
    if (!r) { out.innerHTML = '<div class="note info">' + (!(d.weight > 0) ? "Körpergewicht eintragen (oben bei der Verordnung)." : "Geburtsdatum eintragen – das Alter rechnet die App dann selbst mit.") + "</div>"; return; }
    // Kurz und klar: Schätzung für das Kind (Formel nach Krick), zwei Vergleichswerte, keine feste Empfehlung.
    const prot = d.weight > 0 ? d.eiweiss / d.weight : 0;
    out.innerHTML =
      '<div class="bd-main"><div class="bd-v"><span class="bd-k">Geschätzter Bedarf</span> ca. ' + fmt(r.krick, 0) + ' kcal/Tag <small>(' + fmt(r.krick / r.kg, 0) + " kcal/kg)</small></div>" +
        '<div class="bd-s">Zum Vergleich: Kinder, die nicht gehen <b>' + fmt(r.lo, 0) + "–" + fmt(r.hi, 0) + "</b> · Gleichaltrige ohne Einschränkung <b>" + fmt(r.ref, 0) + "</b> kcal</div>" +
        '<div class="bd-s bd-m">Keine feste Empfehlung – Formeln liegen oft 20–40 % daneben. Wie viel es braucht, legt das Team nach dem Wachstum fest.</div></div>' +
      '<p class="bd-one">🥚 Eiweiß ' + fmt(prot, 1) + " g/kg " + (prot >= r.protRef - 0.005
        ? '<span class="ok">✓ ausreichend</span> <small>(Richtwert ≈ ' + fmt(r.protRef, 1) + ")</small>"
        : '<span class="warn-t">⚠️ unter dem Richtwert (≈ ' + fmt(r.protRef, 1) + ") – mit dem Team besprechen</span>") + "</p>" +
      (d.kcal < r.ref * 0.7 ? '<p class="bd-one">💊 Verordnung unter 70 % von Gleichaltrigen – Vitamine/Mineralstoffe mit dem Team abklären.</p>' : "") +
      (r.jump ? '<p class="bd-one">ℹ️ Am 3. Geburtstag wechselt die Formel – die Schätzung springt um etwa ' + r.jump + " %.</p>" : "");
  }
  function bindBedarf() {
    const birth = document.getElementById("bd-birth"); if (!birth) return;
    const set = (k, v) => { state.settings[k] = v; save(); renderBedarf(derived()); };
    birth.addEventListener("change", () => set("bdBirth", birth.value));
    document.getElementById("bd-mobil").addEventListener("change", (e) => set("bdMobil", e.target.value));
    document.getElementById("bd-tonus").addEventListener("change", (e) => set("bdTonus", e.target.value));
    document.getElementById("bd-sex").addEventListener("change", (e) => set("bdSex", e.target.value));
    document.querySelectorAll("#bd-gain button").forEach(b => b.addEventListener("click", () => set("bdGain", num(b.dataset.gain))));
  }
