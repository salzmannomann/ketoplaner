  /* ---------- PDF zum Teilen (WhatsApp, Signal, Mail …) ----------
     Setzt dieselbe Druckvorlage wie die Vorschau in ein PDF um (jsPDF + AutoTable, in der App eingebettet, offline).
     Unterstützt werden die Bausteine der Vorlagen: Kopf, Absätze, Überschriften, Tabellen, Hinweis-Kästen,
     Kennzahlen, nummerierte Schritte und Fußzeile. Die PDF-Standardschrift kennt keine Emojis und Sonderzeichen
     wie ≈ – sie werden ersetzt („ca.“) oder weggelassen. */
  const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
  function pdfText(t) {
    return String(t == null ? "" : t)
      .replace(/≈\s*/g, "ca. ").replace(/→/g, "->").replace(/[✓✔]/g, "").replace(/↑/g, "")
      .replace(/[  ]/g, " ")
      .split("").filter(ch => ch.charCodeAt(0) <= 0xFF || CP1252_EXTRA.indexOf(ch) !== -1).join("")
      .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
  }
  function safeFileName(s) { return String(s || "HamHam Keto").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80); }
  function pdfAutoTable(doc, opts) {
    if (typeof doc.autoTable === "function") return doc.autoTable(opts);
    const at = (typeof window !== "undefined") && (window.autoTable || (window.jspdfAutoTable && window.jspdfAutoTable.autoTable));
    if (at) return at(doc, opts);
    throw new Error("AutoTable fehlt");
  }
  // Farben des Küchenzettel-Stils (RGB) – aus PALETTE (src/05-palette.js), wie in der Druckvorschau
  const PDF_INK = rgb(PALETTE.ink), PDF_GREY = rgb(PALETTE.grey), PDF_DOT = rgb(PALETTE.dot), PDF_BLUE = rgb(PALETTE.blue),
    PDF_RED = rgb(PALETTE.red), PDF_RED_BG = rgb(PALETTE.redBg), PDF_FOLD = rgb(PALETTE.rule);
  // Gepunktete Linie (Trennlinien wie in der Vorschau)
  function pdfDotted(doc, x1, y1, x2, y2, w) {
    doc.setDrawColor.apply(doc, PDF_DOT); doc.setLineWidth(w || 0.2); doc.setLineDashPattern([0.3, 0.9], 0);
    doc.line(x1, y1, x2, y2); doc.setLineDashPattern([], 0);
  }
  function pdfRule(doc, x1, y1, x2, y2, w) { doc.setDrawColor.apply(doc, PDF_INK); doc.setLineWidth(w); doc.line(x1, y1, x2, y2); }
  // Küchenzettel: A6 (105 × 148,5 mm) im linken oberen Viertel einer A4-Seite, Falzlinien gestrichelt, unten 2,5 cm
  // frei zum Einstecken. Gleiches Design wie die Vorschau: Kopf mit Marke, Titel (Times) und Verhältnis-Pille mit
  // Tintenrahmen, Tintenlinie darunter; Zeitplan mit Tintenlinie vor jeder Mahlzeit, Wasser und Schlafen gepunktet;
  // darunter jedes Rezept mit Tintenlinie oben und den Zutaten in zwei Spalten (gepunktet getrennt, Gramm in Courier).
  // Die Schrift beginnt bei 150 % und wird samt Abständen kleiner, bis alles hineinpasst (mindestens 40 %).
  // opt.measure: nur die passende Schriftgröße ermitteln (Rückgabe), opt.s: mit dieser Größe zeichnen
  function kitchenCardPdf(doc, kz, opt) {
    const CW = 105, PX = 6, PY = 6, BOTTOM = 148.5 - 25;
    const L = PX, R = CW - PX;
    const INK = PDF_INK, GREY = PDF_GREY, BLUE = PDF_BLUE, ZUT = PDF_INK;
    const PT = 0.3528, lineH = (size) => size * PT * 1.2;
    // fam: "sans" (Helvetica), "serif" (Times, Titel und Rezeptnamen), "mono" (Courier, alle Zahlen)
    const FAM = { sans: "helvetica", serif: "times", mono: "courier" };
    const font = (fam, size, bold, color) => { doc.setFont(FAM[fam], bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK); };
    const txt = (el, sel) => { const n = sel ? el.querySelector(sel) : el; return n ? pdfText(n.textContent) : ""; };
    const spaced = (t, size, x, y, opts) => doc.text(t.toUpperCase(), x, y, Object.assign({ charSpace: size * PT * 0.13 }, opts || {}));
    const rows = [...kz.querySelectorAll(".r")].map(r => ({
      kind: r.classList.contains("wa") ? "wa" : r.classList.contains("sl") ? "sl" : "me",
      t: txt(r, ".t"), n: txt(r, ".n"), d: txt(r, ".d"), m: txt(r, ".m"),
    }));
    const recs = [...kz.querySelectorAll(".rb")].map(b => ({
      n: txt(b, ".rn b"), sx: txt(b, ".rn .name-suffix").trim(), times: txt(b, ".rn i"),
      z: [...b.querySelectorAll(".z .i")].map(i => ({ n: txt(i, "span"), g: txt(i, "b") })),
      wk: txt(b, ".wk"), // Wasserkocher-Stufe (angerührte Mahlzeiten)
    }));
    const labels = [...kz.querySelectorAll(".lbl")].map(l => pdfText(l.textContent));
    const layout = (s, draw) => {
      const em = 10 * s * PT; // 1 em in mm
      let y = PY;
      // Kopf: Marke grau, „Tagesplan“ in Times, rechts Pille (nur Rahmen) und kcal/ml in Courier, Tintenlinie 0,5 mm
      const bs = 6.2 * s, ts = 21 * s, ps = 10 * s, ks = 8.8 * s, ph = ps * PT * 1.4;
      const leftH = lineH(bs) + 0.25 * em + ts * PT, rightH = ph + 0.3 * em + lineH(ks), headH = Math.max(leftH, rightH);
      if (draw) {
        const yl = y + headH - leftH, yr = y + headH - rightH; // unten bündig (align-items: flex-end)
        font("sans", bs, true, GREY); spaced(txt(kz, ".ti small"), bs, L, yl + lineH(bs) * 0.8);
        font("serif", ts, true); doc.text(txt(kz, ".ti b"), L, yl + lineH(bs) + 0.25 * em + ts * PT * 0.8);
        font("mono", ps, true); const pt = txt(kz, ".rx .pill"), pw = doc.getTextWidth(pt) + 1.3 * ps * PT;
        doc.setDrawColor.apply(doc, INK); doc.setLineWidth(0.3); doc.roundedRect(R - pw, yr, pw, ph, ph / 2, ph / 2, "S");
        doc.text(pt, R - pw / 2, yr + ph / 2, { align: "center", baseline: "middle" });
        font("mono", ks, false, GREY); doc.text(txt(kz, ".rx small"), R, yr + ph + 0.3 * em + ks * PT * 0.85, { align: "right" });
      }
      y += headH + 0.45 * em;
      if (draw) pdfRule(doc, L, y, R, y, 0.5);
      const label = (t) => {
        const ls = 7.2 * s;
        y += 1.1 * 0.72 * em;
        if (draw) { font("sans", ls, true, GREY); spaced(t, ls, L, y + lineH(ls) * 0.8); }
        y += lineH(ls) + 0.3 * 0.72 * em;
      };
      // Zeitplan
      label(labels[0] || "Zeitplan");
      const TW = 12 * s, GAP = 0.6 * em;
      rows.forEach((r, k) => {
        const me = r.kind === "me";
        const big = (me ? 11 : 9.5) * s, nm = (me ? 13 : 9.5) * s, ds = 8.2 * s;
        const col = r.kind === "wa" ? BLUE : r.kind === "sl" ? GREY : INK;
        const pad = (me ? 0.4 : 0.22) * em;
        font("mono", big, me); const mw = r.m ? doc.getTextWidth(r.m) + GAP : 0;
        const x0 = L + TW + GAP, avail = R - x0 - mw;
        font(me ? "serif" : "sans", nm, me); const nl = doc.splitTextToSize(r.n, avail), nW = doc.getTextWidth(nl[nl.length - 1] || "");
        font("mono", ds, false); const dW = r.d ? doc.getTextWidth(r.d) + 0.4 * em : 0;
        const dInline = !r.d || nW + dW <= avail;
        const first = Math.max(lineH(big), lineH(nm));
        const h = pad + first + (nl.length - 1) * lineH(nm) + (dInline ? 0 : lineH(ds)) + pad;
        if (draw) {
          if (k > 0) { if (me) pdfRule(doc, L, y, R, y, 0.25); else pdfDotted(doc, L, y, R, y, 0.2); }
          const base = y + pad + first * 0.8;
          font("mono", big, me, col); doc.text(r.t, L, base);
          font(me ? "serif" : "sans", nm, me, col); nl.forEach((l, i) => doc.text(l, x0, base + i * lineH(nm)));
          if (r.d) {
            font("mono", ds, false, r.kind === "wa" ? BLUE : GREY);
            const lastY = base + (nl.length - 1) * lineH(nm);
            if (dInline) doc.text(r.d, x0 + nW + 0.4 * em, lastY); else doc.text(r.d, x0, lastY + lineH(ds));
          }
          if (r.m) { font("mono", big, me, col); doc.text(r.m, R, base, { align: "right" }); }
        }
        y += h;
      });
      if (!recs.length) return y;
      // Zutaten je Portion: Tintenlinie oben, Name in Times, Uhrzeiten grau in Courier, Zutaten zweispaltig
      label(labels[1] || "Zutaten je Portion");
      const ZS = 10.8 * s, zlh = ZS * PT * 1.25, ip = 0.12 * em, colGap = 4.5, cw = (R - L - colGap) / 2, tn = 13 * s, ti = 8.2 * s;
      recs.forEach(rc => {
        const pairs = [];
        for (let i = 0; i < rc.z.length; i += 2) {
          const cells = rc.z.slice(i, i + 2).map(it => { font("mono", ZS, true); const gw = doc.getTextWidth(it.g); font("sans", ZS, false); return { it, lines: doc.splitTextToSize(it.n, cw - gw - 1.5) }; });
          pairs.push({ cells, n: Math.max.apply(null, cells.map(c => c.lines.length)) });
        }
        // Zusatz „· mit KetoCal“ klein und grau hinter dem Namen, rechts die Uhrzeiten. Was nicht nebeneinander passt,
        // rutscht in die nächste Zeile: erst der Zusatz, dann die Uhrzeiten (z. B. ein Rezept zu vier Zeiten) – nie überlappend.
        const sxs = tn * 0.62, W = R - L;
        font("serif", tn, true); const nW = doc.getTextWidth(rc.n);
        font("mono", ti, false); const tW = doc.getTextWidth(rc.times) + 2;
        font("sans", sxs, false); const sW = rc.sx ? doc.getTextWidth(rc.sx) : 0;
        const sxInline = !rc.sx || nW + 1 + sW <= W - tW;
        const line1W = nW + (rc.sx && sxInline ? 1 + sW : 0);
        const timesInline = !rc.times || line1W + tW <= W;
        // Zu breit für eine Zeile: Uhrzeiten rechts neben dem Namen auf zwei (oder mehr) Zeilen verteilen, z. B.
        // „7:00 · 10:30“ / „14:00 · 17:30“ – nur wenn der Zusatz in der Namenszeile steht und jede Zeile daneben passt.
        let tLines = null;
        if (!timesInline && sxInline && rc.times) {
          font("mono", ti, false); const room = W - line1W - 2, parts = rc.times.split(" · "), out = [];
          parts.forEach(t => { const cur = out.length ? out[out.length - 1] + " · " + t : null; if (cur && doc.getTextWidth(cur) <= room) out[out.length - 1] = cur; else out.push(t); });
          // gleichmäßig verteilen (2 + 2 statt 3 + 1), sofern das ebenso passt
          const per = Math.ceil(parts.length / out.length), even = [];
          for (let i = 0; i < parts.length; i += per) even.push(parts.slice(i, i + per).join(" · "));
          const best = even.length === out.length && even.every(l => doc.getTextWidth(l) <= room) ? even : out;
          if (best.length > 1 && best.every(l => doc.getTextWidth(l) <= room)) tLines = best;
        }
        // zweite Zeile: Zusatz (falls umgebrochen) links und/oder Uhrzeiten rechts – beide nur, wenn sie zusammen passen
        const below = !timesInline && !tLines; // Uhrzeiten unter dem Namen (Notlösung, wenn auch zweizeilig nichts passt)
        const line2Sx = rc.sx && !sxInline, line2Times = below && (!line2Sx || sW + tW <= W);
        const extra = tLines ? Math.max(0, (tLines.length - 1) * lineH(ti) - 0.2 * (lineH(tn) - lineH(ti)))
          : (line2Sx || below ? lineH(Math.max(line2Sx ? sxs : 0, below ? ti : 0)) : 0) + (below && !line2Times ? lineH(ti) : 0);
        const head = 0.45 * em + lineH(tn) + extra + 0.3 * em;
        const WS = ZS * 0.92; font("sans", WS, false); const wkLines = rc.wk ? doc.splitTextToSize(rc.wk, R - L) : [];
        const wkH = wkLines.length ? 0.35 * em + wkLines.length * lineH(WS) : 0;
        const h = head + pairs.reduce((a, q) => a + q.n * zlh + 2 * ip, 0) + wkH + 0.5 * em;
        if (draw) {
          pdfRule(doc, L, y, R, y, 0.25);
          let yy = y + 0.45 * em + lineH(tn) * 0.8;
          font("serif", tn, true); doc.text(rc.n, L, yy);
          const y2 = yy + lineH(Math.max(line2Sx ? sxs : 0, below ? ti : 0)); // zweite Zeile
          if (rc.sx) { font("sans", sxs, false, GREY); if (sxInline) doc.text(rc.sx, L + nW + 1, yy); else doc.text(rc.sx.replace(/^·\s*/, ""), L, y2); }
          if (rc.times) {
            font("mono", ti, false, GREY);
            if (tLines) tLines.forEach((l, i) => doc.text(l, R, yy + i * lineH(ti), { align: "right" }));
            else doc.text(rc.times, R, timesInline ? yy : line2Times ? y2 : y2 + lineH(ti), { align: "right" });
          }
          yy = y + head;
          pairs.forEach(q => {
            const rowH = q.n * zlh + 2 * ip;
            q.cells.forEach((c, ci) => {
              const x0 = L + ci * (cw + colGap), x1 = x0 + cw;
              font("sans", ZS, false, ZUT); c.lines.forEach((l, li) => doc.text(l, x0, yy + ip + (li + 0.8) * zlh));
              font("mono", ZS, true); doc.text(c.it.g, x1, yy + ip + (c.lines.length - 1 + 0.8) * zlh, { align: "right" });
              pdfDotted(doc, x0, yy + rowH, x1, yy + rowH, 0.2);
            });
            yy += rowH;
          });
          if (wkLines.length) { font("sans", WS, false, INK); wkLines.forEach((l, i) => doc.text(l, L, yy + 0.35 * em + (i + 0.8) * lineH(WS))); }
        }
        y += h;
      });
      return y;
    };
    let s = 1.5;
    while (layout(s, false) > BOTTOM && s > 0.4) s = Math.round((s - 0.04) * 100) / 100;
    if (opt && opt.measure) return s;
    if (opt && opt.s) s = Math.min(s, opt.s);
    // Falzlinien: A4 zweimal falten → A6
    doc.setDrawColor.apply(doc, PDF_FOLD); doc.setLineWidth(0.25); doc.setLineDashPattern([1.6, 1.2], 0);
    doc.line(105, 0, 105, 297); doc.line(0, 148.5, 210, 148.5); doc.setLineDashPattern([], 0);
    layout(s, true);
    return s;
  }
  // Rückseite des Küchenzettels (rechtes oberes Viertel, ox = 105) bzw. allein links (ox = 0): Kurzanleitung je Rezept –
  // Name in Times, nummerierte Schritte (Nummer in Courier), gepunktet getrennt; Schrift passt sich an wie vorne.
  function kitchenHowPdf(doc, kz, ox, opt) {
    const PX = 6, PY = 6, BOTTOM = 148.5 - 25, L = ox + PX, R = ox + 105 - PX, INK = PDF_INK, GREY = PDF_GREY;
    const PT = 0.3528, lineH = (size) => size * PT * 1.2, FAM = { sans: "helvetica", serif: "times", mono: "courier" };
    const font = (fam, size, bold, color) => { doc.setFont(FAM[fam], bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK); };
    const txt = (el, sel) => { const n = sel ? el.querySelector(sel) : el; return n ? pdfText(n.textContent) : ""; };
    const blocks = [...kz.querySelectorAll(".st")].map(b => ({ n: txt(b, ".rn b"), sx: txt(b, ".rn .name-suffix").replace(/^·\s*/, ""), steps: [...b.querySelectorAll("li")].map(li => pdfText(li.textContent)) }));
    const layout = (s, draw) => {
      const em = 10 * s * PT, bs = 6.2 * s, ts = 21 * s, ks = 8.8 * s;
      let y = PY;
      const headH = lineH(bs) + 0.25 * em + ts * PT;
      if (draw) {
        font("sans", bs, true, GREY); doc.text(txt(kz, ".ti small").toUpperCase(), L, y + lineH(bs) * 0.8, { charSpace: bs * PT * 0.13 });
        font("serif", ts, true); doc.text(txt(kz, ".ti b"), L, y + lineH(bs) + 0.25 * em + ts * PT * 0.8);
        font("mono", ks, false, GREY); doc.text(txt(kz, ".rx small"), R, y + headH - 0.1 * em, { align: "right" });
      }
      y += headH + 0.45 * em; if (draw) pdfRule(doc, L, y, R, y, 0.5);
      const ls = 7.2 * s; y += 1.1 * 0.72 * em;
      if (draw) { font("sans", ls, true, GREY); doc.text(txt(kz, ".lbl").toUpperCase(), L, y + lineH(ls) * 0.8, { charSpace: ls * PT * 0.13 }); }
      y += lineH(ls) + 0.3 * 0.72 * em;
      const tn = 13 * s, ZS = 10.2 * s, nw = 1.6 * em;
      blocks.forEach(b => {
        if (draw) pdfRule(doc, L, y, R, y, 0.25);
        y += 0.45 * em;
        if (draw) { font("serif", tn, true); doc.text(b.n, L, y + lineH(tn) * 0.8); if (b.sx) { const w = doc.getTextWidth(b.n); font("sans", tn * 0.62, false, GREY); doc.text("· " + b.sx, L + w + 1, y + lineH(tn) * 0.8); } }
        y += lineH(tn) + 0.3 * em;
        b.steps.forEach((st, i) => {
          font("sans", ZS, false); const lines = doc.splitTextToSize(st, R - L - nw), h = lines.length * lineH(ZS) + 0.28 * em;
          if (draw) {
            font("mono", ZS, true); doc.text((i + 1) + ".", L, y + 0.14 * em + lineH(ZS) * 0.8);
            font("sans", ZS, false); lines.forEach((l, k) => doc.text(l, L + nw, y + 0.14 * em + (k + 0.8) * lineH(ZS)));
            pdfDotted(doc, L, y + h, R, y + h, 0.2);
          }
          y += h;
        });
        y += 0.5 * em;
      });
      return y;
    };
    let s = 1.5;
    while (layout(s, false) > BOTTOM && s > 0.4) s = Math.round((s - 0.04) * 100) / 100;
    if (opt && opt.measure) return s;
    if (opt && opt.s) s = Math.min(s, opt.s);
    if (!ox) { doc.setDrawColor.apply(doc, PDF_FOLD); doc.setLineWidth(0.25); doc.setLineDashPattern([1.6, 1.2], 0); doc.line(105, 0, 105, 297); doc.line(0, 148.5, 210, 148.5); doc.setLineDashPattern([], 0); }
    layout(s, true);
  }
  function buildPdfFromHtml(html) {
    const J = typeof window !== "undefined" && window.jspdf && window.jspdf.jsPDF;
    if (!J) return null;
    const dom = new DOMParser().parseFromString(html, "text/html");
    const cards = [...dom.body.querySelectorAll(".kz")];
    if (cards.length) {
      const kd = new J({ unit: "mm", format: "a4", compress: true });
      const front = cards.find(c => !c.classList.contains("kz-how")), how = cards.find(c => c.classList.contains("kz-how"));
      // beide Karten in derselben (der kleineren) Schriftgröße – auch wenn eine abgewählt ist (class off, nicht gezeichnet)
      const sc = Math.min(front ? kitchenCardPdf(kd, front, { measure: true }) : 9, how ? kitchenHowPdf(kd, how, 105, { measure: true }) : 9);
      const on = c => c && !c.classList.contains("off");
      if (on(front)) kitchenCardPdf(kd, front, { s: sc });
      if (on(how)) kitchenHowPdf(kd, how, on(front) ? 105 : 0, { s: sc });
      return kd;
    }
    const doc = new J({ unit: "mm", format: "a4", compress: true });
    const PW = 210, PH = 297, M = 14, W = PW - 2 * M, BOTTOM = PH - M - 6;
    const INK = PDF_INK, GREY = PDF_GREY, RED = PDF_RED;
    let y = M;
    const lineH = (size) => size * 0.3528 * 1.32;
    const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
    // Titel und h2 in Times, Zahlen in Courier, Text in Helvetica
    const font = (size, bold, color, fam) => { doc.setFont(fam || "helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK); };
    const para = (text, o) => {
      o = o || {}; const size = o.size || 10, indent = o.indent || 0, t = pdfText(text); if (!t) return;
      font(size, o.bold, o.color, o.fam);
      const lh = lineH(size);
      doc.splitTextToSize(t, W - indent).forEach(l => { ensure(lh); doc.text(l, M + indent, y + lh * 0.78); y += lh; });
      y += o.gap == null ? 1.5 : o.gap;
    };
    // Kennzeile unter dem Kopf: grau (ein fetter Anfang in <b> stünde in Tinte)
    const rxLine = (el) => {
      const size = 9, lh = lineH(size), b = el.querySelector("b");
      const all = pdfText(el.textContent), lead = b ? pdfText(b.textContent) : "";
      font(size, false, GREY); const lines = doc.splitTextToSize(all, W - 4);
      lines.forEach((l, i) => {
        ensure(lh);
        if (i === 0 && lead && l.indexOf(lead) === 0) {
          font(size, true, INK); doc.text(lead, M, y + lh * 0.78); const x = M + doc.getTextWidth(lead);
          font(size, false, GREY); doc.text(l.slice(lead.length), x, y + lh * 0.78);
        } else { font(size, false, GREY); doc.text(l, M, y + lh * 0.78); }
        y += lh;
      });
      y += 3;
    };
    // Warnzeichen ▲ (Helvetica/Courier kennen es nicht): kleines gefülltes Dreieck
    const warnMark = (x, base, size) => {
      const hgt = size * 0.3528 * 0.62, w = hgt * 1.15;
      doc.setFillColor.apply(doc, RED); doc.triangle(x, base, x + w, base, x + w / 2, base - hgt, "F");
      return w + 1.2;
    };
    const box = (el) => {
      const warn = el.classList.contains("warn"), size = 9.5, lh = lineH(size), pad = 2.2;
      // Zeilenumbrüche (<br>) im Kasten erhalten
      const txt = el.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const padX = warn ? 3.2 : 0, mark = warn ? 3.6 : 0;
      font(size, false); const lines = doc.splitTextToSize(pdfText(txt), W - 2 * padX - mark);
      const h = lines.length * lh + 2 * pad; ensure(h + 6);
      y += 3;
      if (warn) { doc.setFillColor.apply(doc, PDF_RED_BG); doc.roundedRect(M, y, W, h, 1.5, 1.5, "F"); }
      else { pdfDotted(doc, M, y, M + W, y, 0.18); pdfDotted(doc, M, y + h, M + W, y + h, 0.18); }
      font(size, false, warn ? RED : INK); let yy = y + pad;
      if (warn) warnMark(M + padX, yy + lh * 0.78, size);
      lines.forEach(l => { doc.text(l, M + padX + mark, yy + lh * 0.78); yy += lh; });
      y += h + 3;
    };
    const table = (tbl) => {
      const isSum = (data) => { const el = data.cell.raw && data.cell.raw.nodeType === 1 ? data.cell.raw : null; return !!(el && el.parentElement && /\bsum\b/.test(el.parentElement.className)); };
      pdfAutoTable(doc, {
        html: tbl, startY: y, margin: { left: M, right: M, bottom: PH - BOTTOM }, theme: "plain", useCss: false,
        styles: { font: "helvetica", fontSize: 8.8, cellPadding: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 }, textColor: INK, lineWidth: 0, overflow: "linebreak" },
        headStyles: { fillColor: false, textColor: GREY, fontStyle: "bold", fontSize: 7.5, lineColor: INK, lineWidth: { bottom: 0.35 }, cellPadding: { top: 1.2, bottom: 1.2, left: 1.5, right: 1.5 } },
        didParseCell: (data) => {
          const el = data.cell.raw && data.cell.raw.nodeType === 1 ? data.cell.raw : null;
          data.cell.text = (data.cell.text || []).map(pdfText);
          if (data.section === "head") data.cell.text = data.cell.text.map(t => t.toUpperCase());
          if (!el) return;
          if (el.classList.contains("num")) { data.cell.styles.halign = "right"; if (data.section === "body") data.cell.styles.font = "courier"; }
          if (data.section === "body") {
            if (isSum(data)) { data.cell.styles.fontStyle = "bold"; data.cell.styles.lineWidth = { top: 0.35 }; data.cell.styles.lineColor = INK; }
            else if (el.querySelector && el.querySelector("b") && el.textContent.trim() === el.querySelector("b").textContent.trim()) data.cell.styles.fontStyle = "bold";
          }
        },
        // Körperzeilen unten gepunktet getrennt (die Summenzeile hat oben eine Tintenlinie)
        didDrawCell: (data) => {
          if (data.section !== "body" || isSum(data)) return;
          const c = data.cell, yb = c.y + c.height;
          pdfDotted(doc, c.x, yb, c.x + c.width, yb, 0.15);
        },
      });
      y = doc.lastAutoTable.finalY + 2.5;
    };
    [...dom.body.children].forEach(el => {
      const tag = el.tagName.toLowerCase(), cls = el.className || "";
      if (cls === "head") {
        const h1 = el.querySelector("h1"), meta = el.querySelector(".meta");
        const metaLines = meta ? meta.innerHTML.split(/<br\s*\/?>/i).map(s => pdfText(s.replace(/<[^>]+>/g, ""))) : [];
        // Titel: Name in Times fett 22 pt, Zusatz („· mit KetoCal“) in Helvetica 12 pt grau auf derselben Grundlinie –
        // passt er nicht mehr in die Zeile, steht er darunter. Rechts bleiben 60 mm für Datum und Menge frei.
        const sxEl = h1 && h1.querySelector(".name-suffix"), nameEl = h1 ? h1.cloneNode(true) : null;
        if (nameEl) [...nameEl.querySelectorAll(".name-suffix")].forEach(n => n.remove());
        const suffix = sxEl ? pdfText(sxEl.textContent).trim() : "", TW = W - 60;
        font(22, true, INK, "times"); const titleLines = doc.splitTextToSize(pdfText(nameEl ? nameEl.textContent : "").trim(), TW);
        const lastW = doc.getTextWidth(titleLines[titleLines.length - 1] || "");
        font(12, false, GREY); const sxW = suffix ? doc.getTextWidth(suffix) : 0, gap = 1.6;
        const sxInline = !suffix || lastW + gap + sxW <= TW;
        const lh = 22 * 0.3528 * 1.08, slh = 12 * 0.3528 * 1.3, mlh = 3.6;
        const th = titleLines.length * lh + (sxInline ? 0 : slh), mh = metaLines.length * mlh, hh = Math.max(th, mh);
        const ty = y + hh - th + lh * 0.8;
        font(22, true, INK, "times"); titleLines.forEach((l, i) => doc.text(l, M, ty + i * lh));
        if (suffix) {
          font(12, false, GREY);
          if (sxInline) doc.text(suffix, M + lastW + gap, ty + (titleLines.length - 1) * lh);
          else doc.text(suffix.replace(/^·\s*/, ""), M, ty + (titleLines.length - 1) * lh + slh); // allein in der Zeile ohne „·“
        }
        font(8.5, false, GREY, "courier"); metaLines.forEach((l, i) => doc.text(l, PW - M, y + hh - mh + mlh * 0.8 + i * mlh, { align: "right" }));
        y += hh + 2.5;
        pdfRule(doc, M, y, PW - M, y, 0.45); y += 3.5;
      } else if (tag === "h2") {
        ensure(12); y += 3;
        const sm = el.querySelector("small"), main = el.cloneNode(true);
        [...main.querySelectorAll("small")].forEach(n => n.remove());
        if (!sm) para(el.textContent, { size: 13, bold: true, fam: "times", gap: 1 });
        else {
          // Zusatz in der Überschrift klein und grau
          const lh = lineH(13), t = pdfText(main.textContent);
          font(13, true, INK, "times"); doc.text(t, M, y + lh * 0.78);
          const x = M + doc.getTextWidth(t) + 2;
          font(8.5, false, GREY); doc.text(pdfText(sm.textContent), x, y + lh * 0.78);
          y += lh + 1;
        }
      }
      else if (tag === "table") table(el);
      else if (tag === "ol") {
        const items = [...el.children];
        items.forEach((li, i) => {
          const size = 10, lh = lineH(size), pad = 1.5; font(size, false);
          const lines = doc.splitTextToSize(pdfText(li.textContent), W - 8);
          ensure(pad + lh * Math.min(lines.length, 2));
          y += pad;
          font(size, true, i === items.length - 1 ? RED : INK, "courier"); doc.text((i + 1) + ".", M, y + lh * 0.78);
          font(size, false);
          lines.forEach(l => { ensure(lh); doc.text(l, M + 8, y + lh * 0.78); y += lh; });
          y += pad; pdfDotted(doc, M, y, M + W, y, 0.18);
        });
        y += 1;
      } else if (/\bbox\b/.test(cls)) box(el);
      else if (/\bfoot\b/.test(cls)) { y += 6; ensure(8); pdfRule(doc, M, y, PW - M, y, 0.18); y += 2; para(el.textContent, { size: 8, color: GREY }); }
      else if (/\brx\b/.test(cls)) rxLine(el);
      else para(el.textContent, { size: 10 });
    });
    // Seitenzahlen
    const n = doc.getNumberOfPages();
    if (n > 1) for (let i = 1; i <= n; i++) { doc.setPage(i); font(8, false, GREY, "courier"); doc.text("Seite " + i + " von " + n, PW - M, PH - 8, { align: "right" }); }
    return doc;
  }
  // forPrint: vom „Drucken“-Knopf in der iPhone-App (dort gibt es keinen Druckdialog) – Hinweis auf „Drucken“ im Menü.
  async function sharePrintPdf(forPrint) {
    if (!printCurrent) return;
    forPrint = forPrint === true;
    let doc = null;
    try { doc = buildPdfFromHtml(printCurrent.html); } catch (e) { doc = null; }
    if (!doc) { showToast(forPrint ? "PDF konnte nicht erstellt werden – bitte die App in Safari öffnen und dort drucken." : "PDF konnte nicht erstellt werden – bitte über „Drucken“ → Teilen als PDF sichern."); return; }
    const name = safeFileName(printCurrent.file) + ".pdf";
    const blob = doc.output("blob");
    let file = null;
    try { file = new File([blob], name, { type: "application/pdf" }); } catch (e) {}
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      if (forPrint) showToast("Im Teilen-Menü auf „Drucken“ tippen.");
      try { await navigator.share({ files: [file], title: printCurrent.title }); } catch (e) { /* abgebrochen */ }
      return;
    }
    // Ohne Teilen-Menü (z. B. am Desktop): PDF herunterladen
    try {
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast("PDF gespeichert: " + escapeHtml(name));
    } catch (e) { showToast("PDF konnte nicht gespeichert werden."); }
  }
