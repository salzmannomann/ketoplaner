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
    // Skala mit drei Einordnungen, jede mit Herkunft in der Legende darunter: Krick (persönliche Schätzung),
    // Faustregel 60–70 % (ESPGHAN, nur für Kinder, die nicht gehen) und gesunde Gleichaltrige (FAO/WHO).
    const prot = d.weight > 0 ? d.eiweiss / d.weight : 0;
    const walks = r.mob === BD_MOBIL.geht;
    const lo = Math.min(walks ? r.ref : r.lo, r.krick) * 0.88, hi = Math.max(r.ref, r.krick) * 1.08;
    const p = (v) => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
    // Beschriftung am Rand nicht abschneiden: ganz links linksbündig, ganz rechts rechtsbündig
    const lab = (cls, v, html) => { const x = p(v); return '<span class="lab ' + cls + '" style="left:' + x.toFixed(1) + "%;transform:translateX(" + (x < 14 ? "0" : x > 86 ? "-100%" : "-50%") + ')">' + html + "</span>"; };
    const kg = (v) => fmt(v / r.kg, 0) + "/kg";
    out.innerHTML =
      '<div class="bd-main"><div class="bd-scale" aria-hidden="true"><span class="axis"></span>' +
        (walks ? "" : '<span class="band" style="left:' + p(r.lo).toFixed(1) + "%;width:" + (p(r.hi) - p(r.lo)).toFixed(1) + '%"></span>' +
          lab("below", (r.lo + r.hi) / 2, "<b>" + fmt(r.lo, 0) + "–" + fmt(r.hi, 0) + "</b>ESPGHAN")) +
        '<span class="mk ref" style="left:' + p(r.ref).toFixed(1) + '%"></span>' + lab("below", r.ref, "<b>" + fmt(r.ref, 0) + "</b>FAO/WHO") +
        '<span class="mk krick" style="left:' + p(r.krick).toFixed(1) + '%"></span>' + lab("above krick", r.krick, "Krick <b>" + fmt(r.krick, 0) + " kcal</b>") +
        "</div>" +
        '<ul class="bd-legend">' +
          '<li><i class="sw krick"></i><span><b>Krick-Formel (1992): ' + fmt(r.krick, 0) + " kcal</b> (" + kg(r.krick) + ") – Schätzung für euer Kind aus Gewicht, Alter und Geschlecht, bei „" + escapeHtml(r.mob[1]) + "“ und " + r.ton[1] + " Muskelspannung</span></li>" +
          (walks ? "" : '<li><i class="sw band"></i><span><b>ESPGHAN-Leitlinie (2017): ' + fmt(r.lo, 0) + "–" + fmt(r.hi, 0) + " kcal</b> – Faustregel für Kinder, die nicht gehen: 60–70 % von gesunden Kindern; rechnet nur mit dem Alter</span></li>") +
          '<li><i class="sw ref"></i><span><b>FAO/WHO (2004): ' + fmt(r.ref, 0) + " kcal</b> (" + kg(r.ref) + ") – Bedarf gesunder Kinder gleichen Alters, ohne Einschränkung</span></li>" +
        "</ul>" +
        '<div class="bd-s bd-m">Keine feste Empfehlung – solche Formeln liegen oft 20–40 % daneben. Wie viel euer Kind braucht, legt das Team nach dem Wachstum fest.</div></div>' +
      '<p class="bd-one">Eiweiß ' + fmt(prot, 1) + " g/kg " + (prot >= r.protRef - 0.005
        ? '<span class="ok">ausreichend</span> <small>(Richtwert ≈ ' + fmt(r.protRef, 1) + ")</small>"
        : '<span class="warn-t">▲ unter dem Richtwert (≈ ' + fmt(r.protRef, 1) + ") – mit dem Team besprechen</span>") + "</p>" +
      (d.kcal < r.ref * 0.7 ? '<p class="bd-one">▲ Verordnung unter 70 % von Gleichaltrigen – Vitamine/Mineralstoffe mit dem Team abklären.</p>' : "") +
      (r.jump ? '<p class="bd-one">Am 3. Geburtstag wechselt die Formel – die Schätzung springt um etwa ' + r.jump + " %.</p>" : "") +
      // Bewusst übernehmen: die Schätzung ändert die Verordnung nur auf Knopfdruck (mit Rückgängig)
      (Math.round(r.krick / 10) * 10 !== Math.round(d.kcal) ? '<p class="bd-one"><button type="button" class="btn outline" id="bd-apply">Krick-Schätzung übernehmen: ' +
        fmt(Math.round(r.krick / 10) * 10, 0) + ' kcal am Tag</button></p>' : "");
  }
  function bindBedarf() {
    const birth = document.getElementById("bd-birth"); if (!birth) return;
    // Alles neu zeichnen (Skala, Hinweise); die Verordnung ändert sich dadurch nicht
    const set = (k, v) => { state.settings[k] = v; save(); renderRezepte(); };
    birth.addEventListener("change", () => set("bdBirth", birth.value));
    document.getElementById("bd-mobil").addEventListener("change", (e) => set("bdMobil", e.target.value));
    document.getElementById("bd-tonus").addEventListener("change", (e) => set("bdTonus", e.target.value));
    document.getElementById("bd-sex").addEventListener("change", (e) => set("bdSex", e.target.value));
    document.querySelectorAll("#bd-gain button").forEach(b => b.addEventListener("click", () => set("bdGain", num(b.dataset.gain))));
    // „Krick-Schätzung übernehmen“ setzt die Kalorien der Verordnung (eigener Wert), mit Rückgängig
    const out = document.getElementById("bd-out");
    if (out) out.addEventListener("click", (e) => {
      if (!e.target.closest("#bd-apply")) return;
      const r = bedarfCalc(derived(), state.settings); if (!r) return;
      const prev = state.settings.kcal, v = Math.round(r.krick / 10) * 10;
      state.settings.kcal = v; save(); renderRezepte();
      showToast("Verordnung: " + fmt(v, 0) + " kcal am Tag", [["Rückgängig", () => { state.settings.kcal = prev; save(); renderRezepte(); }]]);
    });
  }
