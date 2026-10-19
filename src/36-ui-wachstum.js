  /* ---------- Vorgaben › Wachstum ----------
     Kurve (Gewicht, Länge, Kopf) mit WHO-Perzentilen, letzte Werte, Liste der Messungen, Formular für neue bzw. geänderte
     Messungen, Geburtsdatum und Geschlecht (gemeinsam mit „Bedarf schätzen“) und der Import aus der App „Growth“. */
  let grKind = "w", grShowAll = false, grEditId = null; // grEditId: null = Formular zu, "" = neue Messung, sonst Id
  let grSelId = null, grPts = [], grDim = { W: 360, H: 310 }, grSwipeAt = 0; // ausgewählte Messung (im Graphen markiert), Punkte zum Antippen
  // Am Desktop (breite Spalte) ist die Kurve im Querformat, am Handy fast quadratisch
  function grIsWide() { return !!(window.matchMedia && window.matchMedia("(min-width: 821px)").matches); }
  const GR_P = [1, 3, 15, 50, 85, 97, 99];
  const GR_Z = { 1: -2.326348, 3: -1.880794, 15: -1.036433, 50: 0, 85: 1.036433, 97: 1.880794, 99: 2.326348 };
  function todayIso() { const t = new Date(); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); }
  function grSexWord() { return growthSex() === "m" ? "Buben" : "Mädchen"; }
  // Wachstumskurve als SVG: Perzentilen-Linien (1 und 99 gestrichelt, 50 kräftiger, Band 3–97), Messpunkte in Tinte,
  // der letzte als Ring, die ausgewählte mit Linie und Schild. Die Zeitachse reicht etwa ein halbes Jahr über die letzte
  // Messung hinaus (höchstens 5 Jahre).
  function growthChartSvg(kind) {
    const K = GROWTH_KINDS[kind], sex = growthSex(), birth = dayNum(state.settings.bdBirth), wide = grIsWide();
    const W = wide ? 640 : 360, H = wide ? 330 : 310, ml = 34, mr = 26, mt = 20, mb = 34, PW = W - ml - mr, PH = H - mt - mb, MON = 30.4375;
    const pts = growthSeries(kind).map(e => [dayNum(e.d) - birth, e[kind], e]).filter(p => p[0] >= 0 && p[0] <= WHO_MAX_DAY);
    const lastDay = Math.max(pts.length ? pts[pts.length - 1][0] : 0, Math.min(WHO_MAX_DAY, dayNum(todayIso()) - birth));
    const maxM = Math.min(60, Math.max(12, Math.ceil((lastDay / MON + 2) / 6) * 6)), maxD = Math.min(WHO_MAX_DAY, Math.round(maxM * MON));
    const C = {};
    GR_P.forEach(p => { const a = []; for (let d = 0; d <= maxD; d += 7) a.push([d, lmsValue(whoLms(kind, sex, d), GR_Z[p])]); a.push([maxD, lmsValue(whoLms(kind, sex, maxD), GR_Z[p])]); C[p] = a; });
    const step = K.tick;
    const lo = Math.floor(Math.min(...C[1].map(x => x[1]), ...pts.map(p => p[1])) / step) * step;
    const hi = Math.ceil(Math.max(...C[99].map(x => x[1]), ...pts.map(p => p[1])) / step) * step;
    const X = d => ml + d / maxD * PW, Y = v => mt + PH - (v - lo) / (hi - lo) * PH;
    const path = a => a.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
    let s = '<svg class="gc" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + K.name + ' nach Alter mit WHO-Perzentilen">';
    for (let v = lo; v <= hi + 1e-9; v += step) s += '<line class="gc-grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="gc-ty" x="' + (ml - 6) + '" y="' + (Y(v) + 4) + '">' + fmtNum(Math.round(v * 10) / 10) + "</text>";
    const mStep = maxM > 36 ? 6 : 3, lStep = maxM > 36 ? (wide ? 6 : 12) : (wide ? 3 : 6);
    for (let m = 0; m <= maxM; m += mStep) { const x = X(Math.min(maxD, m * MON)); s += '<line class="gc-grid' + (m % lStep ? " minor" : "") + '" x1="' + x + '" x2="' + x + '" y1="' + mt + '" y2="' + (mt + PH) + '"/>' + (m % lStep ? "" : '<text class="gc-tx" x="' + x + '" y="' + (mt + PH + 14) + '">' + m + "</text>"); }
    s += '<path class="gc-band" d="' + path(C[3]) + " " + C[97].slice().reverse().map(p => "L" + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ") + ' Z"/>';
    GR_P.forEach(p => { s += '<path class="gc-p' + (p === 50 ? " mid" : p === 1 || p === 99 ? " out" : "") + '" d="' + path(C[p]) + '"/>'; });
    // Beschriftungen rechts, so verschoben, dass sie sich nicht überlappen
    const lab = GR_P.map(p => ({ p, y: Y(C[p][C[p].length - 1][1]) + 4 })).sort((a, b) => b.y - a.y);
    for (let i = 1; i < lab.length; i++) if (lab[i - 1].y - lab[i].y < 10) lab[i].y = lab[i - 1].y - 10;
    lab.forEach(l => { s += '<text class="gc-pl" x="' + (W - mr + 4) + '" y="' + l.y.toFixed(1) + '">' + l.p + "</text>"; });
    if (pts.length > 1) s += '<path class="gc-line" d="' + path(pts) + '"/>';
    pts.forEach((p, i) => { const last = i === pts.length - 1; s += '<circle class="gc-dot' + (last ? " last" : "") + '" cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="' + (last ? 4 : 2.2) + '"/>'; });
    grPts = pts.map(p => ({ id: p[2].id, x: X(p[0]), y: Y(p[1]) })); grDim = { W, H };
    const sel = pts.find(p => p[2].id === grSelId);
    if (sel) {
      const x = X(sel[0]), y = Y(sel[1]), f = growthFacts(kind, sel[2]);
      const txt = fmtDay(sel[2].d) + " · " + grValueText(kind, sel[1]) + (f.p != null ? " · P " + fmtPct(f.p) : ""), tw = txt.length * 6.4 + 16;
      const tx = Math.min(W - mr - tw / 2, Math.max(ml + tw / 2, x)), ty = y - 34 < mt ? y + 14 : y - 34;
      s += '<line class="gc-sel" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + mt + '" y2="' + (mt + PH) + '"/><circle class="gc-ring" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6"/>' +
        '<g class="gc-tip"><rect x="' + (tx - tw / 2).toFixed(1) + '" y="' + ty.toFixed(1) + '" width="' + tw.toFixed(1) + '" height="20" rx="4"/><text x="' + tx.toFixed(1) + '" y="' + (ty + 14).toFixed(1) + '">' + escapeHtml(txt) + "</text></g>";
    }
    s += '<text class="gc-unit" x="' + (ml - 6) + '" y="' + (mt - 8) + '">' + K.unit + '</text><text class="gc-xl" x="' + (ml + PW / 2) + '" y="' + (H - 2) + '">Alter in Monaten</text></svg>';
    return s;
  }
  function grValueText(kind, v) { return fmt(v, GROWTH_KINDS[kind].dec) + " " + GROWTH_KINDS[kind].unit; }
  // Kurzfassung für die Vorgaben-Liste: letzte Werte und Datum der letzten Messung
  function growthSummary() {
    const all = growthList(); if (!all.length) return "noch keine Messungen";
    const parts = Object.keys(GROWTH_KINDS).map(k => { const s = growthSeries(k); return s.length ? grValueText(k, s[s.length - 1][k]) : ""; }).filter(Boolean);
    return parts.join(" · ") + " · " + fmtDay(all[all.length - 1].d);
  }
  function renderWachstum() {
    const $ = id => document.getElementById(id), card = $("wachstum-card"); if (!card) return;
    const s = state.settings, birthOk = !isNaN(dayNum(s.bdBirth));
    const put = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
    card.querySelectorAll("#gr-kind button[data-gk]").forEach(b => b.classList.toggle("active", b.dataset.gk === grKind));
    // Geburtsdatum und Geschlecht (dieselben Werte wie unter „Bedarf schätzen“)
    put("gr-birth", s.bdBirth || ""); put("gr-sex", s.bdSex === "m" ? "m" : "w");
    const bw = $("gr-birth") && $("gr-birth").closest(".date-wrap"); if (bw) bw.classList.toggle("empty", !s.bdBirth);
    const mo = birthOk ? ageMonths(s.bdBirth, todayIso()) : null;
    if ($("gr-age")) $("gr-age").textContent = mo != null && mo >= 0 ? bdAgeText(mo) : "für die Perzentilen";
    // Formular
    const form = $("gr-form"), open = grEditId !== null, cur = open && grEditId ? growthList().find(e => e.id === grEditId) : null;
    if (form) form.hidden = !open;
    if ($("gr-form-title")) $("gr-form-title").textContent = cur ? "Messung vom " + fmtDay(cur.d) : "Neue Messung";
    if ($("gr-del")) $("gr-del").hidden = !cur;
    // Kurve, letzte Werte, Liste
    const K = GROWTH_KINDS[grKind], ser = growthSeries(grKind), last = ser[ser.length - 1];
    $("gr-chart").innerHTML = birthOk ? growthChartSvg(grKind)
      : '<div class="note info">Geburtsdatum unten eintragen – dann zeichnet die App die WHO-Kurven und nennt die Perzentilen.</div>';
    const fact = (label, value, sub) => '<div class="vg-fact"><small>' + label + "</small><b>" + value + "</b><span>" + sub + "</span></div>";
    if (last) {
      const f = growthFacts(grKind, last);
      $("gr-facts").innerHTML = fact("Zuletzt", grValueText(grKind, last[grKind]), fmtDay(last.d) + (f.months != null && f.months >= 0 ? " · " + bdAgeText(f.months) : "")) +
        fact("Perzentile", f.p != null ? fmtPct(f.p) : "–", f.p != null ? "WHO " + grSexWord() + " · z " + fmt(f.z, 1) : !birthOk ? "Geburtsdatum fehlt" : "nur bis 5 Jahre");
    } else $("gr-facts").innerHTML = "";
    const rows = ser.slice().reverse(), shown = grShowAll ? rows : rows.slice(0, 5);
    // Zeile antippen = im Graphen zeigen; Bearbeiten und Löschen kommen am Handy durch Wischen nach links, am Computer beim Darüberfahren
    $("gr-list").innerHTML = rows.length ? shown.map(e => {
      const f = growthFacts(grKind, e), id = escapeHtml(e.id);
      return '<div class="ms-wrap' + (e.id === grSelId ? " sel" : "") + '" data-gid="' + id + '"><button type="button" class="ms-row" data-gsel="' + id + '" aria-pressed="' + (e.id === grSelId) + '"><span><span class="d">' + fmtDay(e.d) + '</span><span class="a">' +
        (f.months != null && f.months >= 0 ? bdAgeText(f.months) : "&nbsp;") + '</span></span><span><span class="v">' + grValueText(grKind, e[grKind]) + '</span><span class="p">' +
        (f.p != null ? "Perzentile " + fmtPct(f.p) : "&nbsp;") + '</span></span></button><div class="ms-acts"><button type="button" class="ms-ed" data-ged="' + id + '">Bearbeiten</button>' +
        '<button type="button" class="ms-del" data-gdel="' + id + '">Löschen</button></div></div>';
    }).join("") : '<p class="hint">Noch keine ' + (grKind === "w" ? "Gewichte" : grKind === "h" ? "Längen" : "Kopfumfänge") + " – „+ Messung“ oder „Werte importieren“.</p>";
    const all = $("gr-all");
    if (all) { all.hidden = rows.length <= 5; all.textContent = grShowAll ? "weniger anzeigen" : "alle " + rows.length + " anzeigen"; }
  }
  // Alle Messungen als Tabelle (CSV für Excel/Numbers): eine Zeile je Tag, neueste zuerst, mit Perzentilen;
  // Strichpunkt und Dezimalkomma wie im deutschsprachigen Excel, BOM für die Umlaute
  function growthCsv() {
    const head = ["Datum", "Alter", "Gewicht (kg)", "Perzentile", "Länge (cm)", "Perzentile", "Kopfumfang (cm)", "Perzentile"];
    const rows = growthList().slice().reverse().map(e => {
      const mo = ageMonths(state.settings.bdBirth, e.d), out = [fmtDay(e.d), mo != null && mo >= 0 ? bdAgeText(mo) : ""];
      Object.keys(GROWTH_KINDS).forEach(k => {
        if (e[k] == null) { out.push("", ""); return; }
        const f = growthFacts(k, e); out.push(fmt(e[k], GROWTH_KINDS[k].dec), f.p != null ? fmtPct(f.p) : "");
      });
      return out;
    });
    return "\uFEFF" + [head].concat(rows).map(r => r.join(";")).join("\r\n") + "\r\n";
  }
  function grEdit(id) {
    const e = growthList().find(x => x.id === id); if (!e) return;
    grEditId = e.id; grFormFill(e); renderWachstum();
    try { document.getElementById("gr-form").scrollIntoView({ block: "start", behavior: "smooth" }); } catch (er) {}
  }
  function grSelect(id) {
    grSelId = grSelId === id ? null : id;
    if (grSelId && !grShowAll && growthSeries(grKind).slice().reverse().findIndex(e => e.id === grSelId) >= 5) grShowAll = true;
    renderWachstum();
  }
  function grCloseSwipe(except) { document.querySelectorAll("#gr-list .ms-wrap.open").forEach(w => { if (w !== except) w.classList.remove("open"); }); }
  function grFormFill(e) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set("gr-date", e ? e.d : todayIso());
    ["w", "h", "hc"].forEach(k => set("gr-" + k, e && e[k] != null ? fmtNum(e[k]) : ""));
    const m = document.getElementById("gr-msg"); if (m) m.hidden = true;
  }
  // Änderungen an den Messungen mit „Rückgängig“ (Messungen und das übernommene Gewicht)
  function grCommit(change, msg) {
    const snap = JSON.stringify({ growth: growthList(), weight: state.settings.weight });
    change(); syncWeightFromGrowth(); save(); renderRezepte();
    showToast(msg, [["Rückgängig", () => { const p = JSON.parse(snap); state.growth = p.growth; state.settings.weight = p.weight; save(); renderRezepte(); }]]);
  }
  function bindWachstum() {
    const $ = id => document.getElementById(id), card = $("wachstum-card"); if (!card) return;
    card.querySelectorAll("#gr-kind button[data-gk]").forEach(b => b.addEventListener("click", () => { grKind = b.dataset.gk; grShowAll = false; renderWachstum(); }));
    $("gr-add").addEventListener("click", () => { grEditId = ""; grFormFill(null); renderWachstum(); const f = $("gr-w"); try { if (f) f.focus(); } catch (e) {} });
    $("gr-cancel").addEventListener("click", () => { grEditId = null; renderWachstum(); });
    const list = $("gr-list");
    list.addEventListener("click", (ev) => {
      const t = ev.target.closest ? ev.target : null; if (!t) return;
      const ed = t.closest("[data-ged]"), del = t.closest("[data-gdel]"), row = t.closest("[data-gsel]");
      if (ed) { grCloseSwipe(); grEdit(ed.dataset.ged); return; }
      if (del) {
        const id = del.dataset.gdel, e = growthList().find(x => x.id === id); if (!e) return;
        grCommit(() => { state.growth = growthList().filter(x => x.id !== id); if (grSelId === id) grSelId = null; if (grEditId === id) grEditId = null; }, "Messung vom " + fmtDay(e.d) + " gelöscht");
        return;
      }
      if (!row || Date.now() - grSwipeAt < 400) return;
      if (list.querySelector(".ms-wrap.open")) { grCloseSwipe(); return; } // erst das aufgewischte Feld schließen
      grSelect(row.dataset.gsel);
      // Am Handy liegt der Graph über der Liste: beim Auswählen so weit nach oben scrollen, dass er ganz zu sehen ist
      const c = $("gr-chart"), top = c ? c.getBoundingClientRect().top : 0;
      if (grSelId && top < 0) { try { window.scrollBy({ top: top - 12, behavior: "smooth" }); } catch (er) {} }
    });
    // Wischen nach links öffnet Bearbeiten/Löschen (nur Touch; am Computer zeigt sie das Darüberfahren)
    let sw = null;
    list.addEventListener("touchstart", (ev) => {
      const w = ev.target.closest && ev.target.closest(".ms-wrap"); if (!w || ev.target.closest(".ms-acts") || ev.touches.length !== 1) { sw = null; return; }
      const acts = w.querySelector(".ms-acts");
      sw = { w, row: w.querySelector(".ms-row"), x: ev.touches[0].clientX, y: ev.touches[0].clientY, base: w.classList.contains("open") ? -(acts.offsetWidth || 160) : 0, max: acts.offsetWidth || 160, drag: false, dx: 0 };
    }, { passive: true });
    list.addEventListener("touchmove", (ev) => {
      if (!sw) return;
      const dx = ev.touches[0].clientX - sw.x, dy = ev.touches[0].clientY - sw.y;
      if (!sw.drag) { if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { sw.drag = true; grCloseSwipe(sw.w); } else if (Math.abs(dy) > 8) { sw = null; return; } else return; }
      ev.preventDefault(); sw.dx = dx;
      sw.row.style.transition = "none"; sw.row.style.transform = "translateX(" + Math.min(0, Math.max(-sw.max, sw.base + dx)) + "px)";
    }, { passive: false });
    list.addEventListener("touchend", () => {
      if (!sw) return;
      if (sw.drag) { sw.w.classList.toggle("open", sw.base + sw.dx < -sw.max / 2); sw.row.style.transition = ""; sw.row.style.transform = ""; grSwipeAt = Date.now(); }
      sw = null;
    });
    // Punkt im Graphen antippen = Messung auswählen (nächster Punkt in Reichweite)
    $("gr-chart").addEventListener("click", (ev) => {
      const svg = $("gr-chart").querySelector("svg"); if (!svg || !grPts.length) return;
      const r = svg.getBoundingClientRect(); if (!r.width || !r.height) return;
      const x = (ev.clientX - r.left) / r.width * grDim.W, y = (ev.clientY - r.top) / r.height * grDim.H;
      let best = null, bd = 18 * 18;
      grPts.forEach(p => { const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; best = p; } });
      if (best) grSelect(best.id);
    });
    if (window.matchMedia) { const mq = window.matchMedia("(min-width: 821px)"); const re = () => renderWachstum(); if (mq.addEventListener) mq.addEventListener("change", re); else if (mq.addListener) mq.addListener(re); }
    $("gr-csv").addEventListener("click", async () => {
      if (!growthList().length) { showToast("Noch keine Messungen."); return; }
      const name = "wachstum-" + todayIso() + ".csv", r = await saveFile(name, growthCsv(), "text/csv");
      if (r) showToast(r === "geteilt" ? "Tabelle gesichert" : "Tabelle gespeichert: " + escapeHtml(name));
    });
    $("gr-save").addEventListener("click", () => {
      const msg = (t) => { const m = $("gr-msg"); m.textContent = t; m.hidden = false; };
      const d = $("gr-date").value;
      if (isNaN(dayNum(d))) return msg("Bitte ein Datum eintragen.");
      if (d > todayIso()) return msg("Das Datum liegt in der Zukunft.");
      const vals = {};
      for (const k of ["w", "h", "hc"]) {
        const t = String($("gr-" + k).value).trim(); if (!t) continue;
        const v = parseFloat(t.replace(",", ".")), K = GROWTH_KINDS[k];
        if (!isFinite(v) || v < K.min || v > K.max) return msg(K.name + ": bitte einen Wert zwischen " + fmtNum(K.min) + " und " + fmtNum(K.max) + " " + K.unit + " eintragen.");
        vals[k] = v;
      }
      if (!Object.keys(vals).length) return msg("Bitte mindestens einen Wert eintragen.");
      const editId = grEditId;
      grCommit(() => {
        if (editId) {
          const e = growthList().find(x => x.id === editId);
          if (e) { e.d = d; ["w", "h", "hc"].forEach(k => { if (vals[k] != null) e[k] = vals[k]; else delete e[k]; }); }
          state.growth = cleanGrowth(growthList());
        } else mergeGrowth([Object.assign({ d }, vals)]);
        grEditId = null;
      }, "Messung gespeichert");
    });
    $("gr-del").addEventListener("click", () => {
      const id = grEditId; if (!id) return;
      grCommit(() => { state.growth = growthList().filter(e => e.id !== id); grEditId = null; if (grSelId === id) grSelId = null; }, "Messung gelöscht");
    });
    $("gr-all").addEventListener("click", () => { grShowAll = !grShowAll; renderWachstum(); });
    const birth = $("gr-birth");
    birth.addEventListener("input", () => { const w = birth.closest(".date-wrap"); if (w) w.classList.toggle("empty", !birth.value); });
    birth.addEventListener("change", () => { state.settings.bdBirth = birth.value; save(); renderRezepte(); });
    $("gr-sex").addEventListener("change", (e) => { state.settings.bdSex = e.target.value; save(); renderRezepte(); });
    // Import aus der App „Growth“: Datei wird nur hier gelesen; vorher bestätigen, danach Rückgängig möglich
    $("gr-import").addEventListener("click", () => $("gr-file").click());
    $("gr-file").addEventListener("change", () => {
      const fi = $("gr-file"), f = fi.files && fi.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        fi.value = "";
        let r; try { r = parseGrowthFile(rd.result); } catch (e) { alert("Diese Datei lässt sich nicht lesen – bitte eine *.growth-Datei aus der App „Growth“ wählen."); return; }
        const cnt = (k) => r.entries.filter(e => e[k] != null).length, days = r.entries.map(e => e.d).sort();
        const text = (r.name ? r.name + ": " : "") + cnt("w") + " Gewichte, " + cnt("h") + " Längen, " + cnt("hc") + " Kopfumfänge (" + fmtDay(days[0]) + " – " + fmtDay(days[days.length - 1]) + ")" +
          (r.birth && !state.settings.bdBirth ? ", geboren " + fmtDay(r.birth) : "") + ".\n\nÜbernehmen? Gleiche Tage werden zusammengeführt.";
        if (!confirm(text)) return;
        const prevS = { bdBirth: state.settings.bdBirth, bdSex: state.settings.bdSex };
        const snap = JSON.stringify({ growth: growthList(), weight: state.settings.weight });
        mergeGrowth(r.entries);
        if (r.birth && !state.settings.bdBirth) state.settings.bdBirth = r.birth;
        if (r.sex && !state.settings.bdSex) state.settings.bdSex = r.sex;
        syncWeightFromGrowth(); save(); renderRezepte();
        showToast(r.entries.length + " Werte übernommen", [["Rückgängig", () => {
          const p = JSON.parse(snap); state.growth = p.growth; state.settings.weight = p.weight;
          Object.keys(prevS).forEach(k => { if (prevS[k] === undefined) delete state.settings[k]; else state.settings[k] = prevS[k]; });
          save(); renderRezepte();
        }]]);
      };
      rd.readAsArrayBuffer(f);
    });
  }
