  /* ---------- Wachstum: Messungen, WHO-Perzentilen, Import ----------
     Messungen liegen nur im Zustand dieses Geräts (state.growth, beim Geräte-Abgleich verschlüsselt): je Eintrag ein
     Datum (JJJJ-MM-TT) und Gewicht (kg), Länge/Größe (cm), Kopfumfang (cm) – was nicht gemessen wurde, fehlt.
     Perzentilen nach WHO (0–5 Jahre) über die LMS-Methode; Geburtsdatum und Geschlecht kommen aus „Bedarf schätzen“. */
  const GROWTH_KINDS = {
    w: { name: "Gewicht", unit: "kg", dec: 2, tick: 1, min: 0.5, max: 80 },
    h: { name: "Länge", unit: "cm", dec: 1, tick: 5, min: 30, max: 200 },
    hc: { name: "Kopf", unit: "cm", dec: 1, tick: 2, min: 20, max: 70 },
  };
  const WHO_MAX_DAY = 1856; // 5 Jahre – weiter reichen die WHO-Standards nicht
  // Tage zwischen zwei Daten („JJJJ-MM-TT“), unabhängig von Zeitzone und Sommerzeit
  function dayNum(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; }
  function isoDay(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function fmtDay(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); return m ? (+m[3]) + "." + (+m[2]) + "." + m[1] : ""; }
  // Alter in ganzen Monaten (wie im Kalender: am Monatstag des Geburtstags kommt ein Monat dazu)
  function ageMonths(birthIso, iso) {
    const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthIso || ""), d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!b || !d) return null;
    let m = (+d[1] - +b[1]) * 12 + (+d[2] - +b[2]); if (+d[3] < +b[3]) m--;
    return m;
  }
  function growthSex() { return state.settings.bdSex === "m" ? "m" : "f"; }
  // L, M, S für ein Alter in Tagen (linear zwischen den Stützstellen); außerhalb 0–5 Jahre: null
  function whoLms(kind, sex, day) {
    const t = WHO_LMS[kind + "_" + sex]; if (!t || !(day >= 0) || day > WHO_MAX_DAY) return null;
    let lo = 0, hi = WHO_DAYS.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (WHO_DAYS[mid] <= day) lo = mid; else hi = mid; }
    const d0 = WHO_DAYS[lo], d1 = WHO_DAYS[hi], f = d1 > d0 ? Math.min(1, Math.max(0, (day - d0) / (d1 - d0))) : 0;
    return [0, 1, 2].map(j => t[lo * 3 + j] + (t[hi * 3 + j] - t[lo * 3 + j]) * f);
  }
  function lmsValue(lms, z) { const [L, M, S] = lms; return Math.abs(L) < 1e-9 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L); }
  // z-Wert; beim Gewicht jenseits von ±3 nach der „eingeschränkten“ Methode der WHO (Abstand SD2–SD3 als Maß)
  function whoZ(kind, sex, day, x) {
    const lms = whoLms(kind, sex, day); if (!lms || !(x > 0)) return null;
    const [L, M, S] = lms;
    let z = Math.abs(L) < 1e-9 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
    if (kind === "w" && z > 3) { const s3 = lmsValue(lms, 3), s2 = lmsValue(lms, 2); z = 3 + (x - s3) / (s3 - s2); }
    if (kind === "w" && z < -3) { const s3 = lmsValue(lms, -3), s2 = lmsValue(lms, -2); z = -3 + (x - s3) / (s2 - s3); }
    return z;
  }
  // Standardnormalverteilung (Abramowitz/Stegun 7.1.26, Fehler < 1,5e-7)
  function zToPct(z) {
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return 50 * (1 + (z >= 0 ? erf : -erf));
  }
  // Perzentile zum Anzeigen: an den Rändern mit einer Nachkommastelle („0,8“, „99,4“), sonst ganz
  function fmtPct(p) { return p < 1 || p > 99 ? fmt(p, 1) : fmt(Math.round(p), 0); }
  function growthFacts(kind, entry) {
    const birth = state.settings.bdBirth, day = dayNum(entry.d) - dayNum(birth);
    const z = birth ? whoZ(kind, growthSex(), day, num(entry[kind])) : null;
    return { day, months: ageMonths(birth, entry.d), z, p: z == null ? null : zToPct(z) };
  }
  // Messungen säubern (Laden, Backup, Abgleich): Datum Pflicht, Werte nur im sinnvollen Bereich.
  // Läuft schon beim Laden des Zustands – darum mit eigenen Grenzen statt GROWTH_KINDS (das ist dann noch nicht definiert).
  function cleanGrowth(list) {
    const seen = {}, LIM = { w: [0.5, 80], h: [30, 200], hc: [20, 70] };
    return (Array.isArray(list) ? list : []).filter(e => !!e && typeof e === "object" && !Array.isArray(e)).map(e => {
      const o = { id: typeof e.id === "string" && e.id ? e.id.slice(0, 40) : "", d: typeof e.d === "string" && !isNaN(dayNum(e.d)) ? e.d : "" };
      Object.keys(LIM).forEach(k => { const v = Number(e[k]); if (e[k] != null && e[k] !== "" && isFinite(v) && v >= LIM[k][0] && v <= LIM[k][1]) o[k] = v; });
      if (!o.id) o.id = "g" + o.d + Math.random().toString(36).slice(2, 7);
      return o;
    }).filter(e => e.d && (e.w != null || e.h != null || e.hc != null) && !seen[e.id] && (seen[e.id] = true))
      .sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  }
  function growthList() { return Array.isArray(state.growth) ? state.growth : (state.growth = []); }
  function growthSeries(kind) { return growthList().filter(e => e[kind] != null); }
  // Das zuletzt gemessene Gewicht gilt in der Verordnung (Richtwert, Eiweiß, Kalorien-Vorschlag rechnen damit)
  function latestWeight() { const s = growthSeries("w"); return s.length ? s[s.length - 1] : null; }
  function syncWeightFromGrowth() {
    const lw = latestWeight(); if (lw && Math.abs(num(state.settings.weight) - lw.w) > 1e-9) state.settings.weight = lw.w;
  }
  // Messungen übernehmen: gleiche Tage werden zusammengeführt (neue Werte gehen vor)
  function mergeGrowth(entries) {
    const byDay = {}; growthList().forEach(e => { byDay[e.d] = e; });
    entries.forEach(n => {
      const e = byDay[n.d] || (byDay[n.d] = { id: "g" + n.d.replace(/-/g, "") + Math.random().toString(36).slice(2, 6), d: n.d });
      Object.keys(GROWTH_KINDS).forEach(k => { if (n[k] != null) e[k] = n[k]; });
    });
    state.growth = cleanGrowth(Object.keys(byDay).map(k => byDay[k]));
  }
  /* Import aus der App „Growth“ (Datei *.growth): ein Protobuf-Datensatz. Feld 3 = Kind (4 Name, 5 Geschlecht – 1 ist
     ein Mädchen, 6 Geburt in Sekunden); Feld 6 = Messreihe (1 Art „w-kg“ / „h-cm“ / „hc-cm“, 2 Liste mit Einträgen:
     4 Datum in Sekunden, 5 Wert). Die Datei wird nur hier auf dem Gerät gelesen. */
  function parseGrowthFile(buf) {
    const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength), dec = new TextDecoder();
    const msg = (s, e) => {
      const out = []; let i = s;
      const varint = () => { let r = 0, mul = 1, c; do { if (i >= e) throw new Error("kaputt"); c = b[i++]; r += (c & 127) * mul; mul *= 128; } while (c >= 128); return r; };
      while (i < e) {
        const key = varint(), f = Math.floor(key / 8), wt = key % 8;
        if (wt === 0) out.push({ f, v: varint() });
        else if (wt === 1) { if (i + 8 > e) throw new Error("kaputt"); out.push({ f, v: dv.getFloat64(i, true) }); i += 8; }
        else if (wt === 5) { if (i + 4 > e) throw new Error("kaputt"); out.push({ f, v: dv.getFloat32(i, true) }); i += 4; }
        else if (wt === 2) { const n = varint(); if (i + n > e) throw new Error("kaputt"); out.push({ f, s: i, e: i + n }); i += n; }
        else throw new Error("kaputt");
      }
      return out;
    };
    const str = (x) => dec.decode(b.subarray(x.s, x.e));
    const dayOf = (sec) => isoDay(Math.round(sec / 86400));
    const top = msg(0, b.length), res = { name: "", sex: null, birth: "", entries: [] };
    const child = top.find(x => x.f === 3 && x.s != null);
    if (child) msg(child.s, child.e).forEach(x => {
      if (x.f === 4 && x.s != null) res.name = str(x);
      if (x.f === 5 && x.v === 1) res.sex = "w";
      if (x.f === 6 && x.v > 0) res.birth = dayOf(x.v);
    });
    const KIND = { "w-kg": "w", "h-cm": "h", "hc-cm": "hc" };
    top.filter(x => x.f === 6 && x.s != null).forEach(ser => {
      const parts = msg(ser.s, ser.e), nm = parts.find(x => x.f === 1 && x.s != null), list = parts.find(x => x.f === 2 && x.s != null);
      const kind = nm && KIND[str(nm)]; if (!kind || !list) return;
      msg(list.s, list.e).filter(x => x.f === 1 && x.s != null).forEach(it => {
        const m = {}; msg(it.s, it.e).forEach(x => { if (x.v != null) m[x.f] = x.v; });
        if (m[4] > 0 && m[5] > 0) { const o = { d: dayOf(m[4]) }; o[kind] = Math.round(m[5] * 1000) / 1000; res.entries.push(o); }
      });
    });
    if (!res.entries.length) throw new Error("keine Messungen");
    return res;
  }
