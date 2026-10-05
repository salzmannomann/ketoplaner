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
  // Küchenzettel: A6 (105 × 148,5 mm) im linken oberen Viertel einer A4-Seite, Falzlinien gestrichelt, unten 2,5 cm
  // frei zum Einstecken. Gleiches Design wie die Vorschau: Kopf mit Marke und Verhältnis-Pille, Zeitplan als ruhige
  // Liste (Mahlzeit + folgende Wassergabe als Block), darunter jedes Rezept als hellgraue Karte mit den Zutaten in zwei
  // Spalten. Die Schrift beginnt bei 150 % und wird samt Abständen kleiner, bis alles hineinpasst (mindestens 40 %).
  function kitchenCardPdf(doc, kz) {
    const CW = 105, PX = 6, PY = 6, BOTTOM = 148.5 - 25;
    const L = PX, R = CW - PX;
    const INK = [31, 41, 51], MUTED = [123, 135, 148], GREEN = [47, 133, 90], PILL_BG = [230, 244, 236], PILL_INK = [34, 105, 74];
    const BLUE = [43, 108, 176], BLUE_SOFT = [107, 155, 209], DOT = [99, 164, 232], GREY = [154, 165, 177], LINE = [228, 232, 235], CARD = [245, 247, 246];
    const PT = 0.3528, lineH = (size) => size * PT * 1.2;
    const font = (size, bold, color) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK); };
    const txt = (el, sel) => { const n = sel ? el.querySelector(sel) : el; return n ? pdfText(n.textContent) : ""; };
    const spaced = (t, size, x, y, opts) => doc.text(t.toUpperCase(), x, y, Object.assign({ charSpace: size * PT * 0.13 }, opts || {}));
    const rows = [...kz.querySelectorAll(".r")].map(r => ({
      kind: r.classList.contains("wa") ? "wa" : r.classList.contains("sl") ? "sl" : "me",
      t: txt(r, ".t"), n: txt(r, ".n"), d: txt(r, ".d"), m: txt(r, ".m"),
    }));
    const recs = [...kz.querySelectorAll(".rb")].map(b => ({
      n: txt(b, ".rn b"), times: txt(b, ".rn i"),
      z: [...b.querySelectorAll(".z .i")].map(i => ({ n: txt(i, "span"), g: txt(i, "b") })),
    }));
    const labels = [...kz.querySelectorAll(".lbl")].map(l => pdfText(l.textContent));
    const layout = (s, draw) => {
      const em = 10 * s * PT; // 1 em in mm
      let y = PY;
      // Kopf
      const bs = 6.2 * s, ts = 19 * s, ps = 10.5 * s, ks = 9.5 * s;
      if (draw) {
        font(bs, true, GREEN); spaced(txt(kz, ".ti small"), bs, L, y + lineH(bs) * 0.8);
        font(ts, true); doc.text(txt(kz, ".ti b"), L, y + lineH(bs) + 0.3 * em + ts * PT * 0.85);
        font(ps, true, PILL_INK); const pt = txt(kz, ".rx .pill"), pw = doc.getTextWidth(pt) + 1.4 * ps * PT, ph = ps * PT * 1.45;
        doc.setFillColor.apply(doc, PILL_BG); doc.roundedRect(R - pw, y, pw, ph, ph / 2, ph / 2, "F");
        doc.text(pt, R - pw / 2, y + ph / 2, { align: "center", baseline: "middle" });
        font(ks, false, MUTED); doc.text(txt(kz, ".rx small"), R, y + ph + 0.3 * em + ks * PT * 0.85, { align: "right" });
      }
      y += Math.max(lineH(bs) + 0.3 * em + ts * PT, ps * PT * 1.45 + 0.3 * em + lineH(ks));
      const label = (t) => {
        const ls = 7.8 * s;
        y += 1.1 * 0.78 * em * 1.28;
        if (draw) { font(ls, true, MUTED); spaced(t, ls, L, y + lineH(ls) * 0.8); }
        y += lineH(ls) + 0.4 * 0.78 * em;
      };
      // Zeitplan
      label(labels[0] || "Zeitplan");
      const TW = 13 * s, GAP = 0.6 * em;
      rows.forEach((r, k) => {
        const big = (r.kind === "me" ? 13 : 10) * s, nm = (r.kind === "me" ? 11.8 : 10) * s, ds = 9 * s;
        const col = r.kind === "wa" ? BLUE : r.kind === "sl" ? GREY : INK;
        const padT = (r.kind === "wa" ? 0.1 : r.kind === "sl" ? 0.32 : 0.38) * em, padB = (r.kind === "wa" ? 0.32 : 0.38) * em;
        const dotW = r.kind === "wa" ? 0.6 * em + 0.4 * em : 0;
        font(big, r.kind !== "sl"); const mw = r.m ? doc.getTextWidth(r.m) + GAP : 0;
        const x0 = L + TW + GAP, avail = R - x0 - mw - dotW;
        font(nm, r.kind === "me"); const nl = doc.splitTextToSize(r.n, avail), nW = doc.getTextWidth(nl[nl.length - 1] || "");
        font(ds, false); const dW = r.d ? doc.getTextWidth(r.d) + 0.4 * em : 0;
        const dInline = !r.d || nW + dW <= avail;
        const h = padT + lineH(big) + (nl.length - 1) * lineH(nm) + (dInline ? 0 : lineH(ds)) + padB;
        if (draw) {
          if ((r.kind === "me" || r.kind === "sl") && k > 0) { doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.2); doc.line(L, y, R, y); }
          const base = y + padT + lineH(big) * 0.8;
          font(big, r.kind !== "sl", col); doc.text(r.t, L, base);
          if (r.kind === "wa") {
            // Wassertropfen: Kreis unten, Spitze oben (Tangenten bei 60°)
            const rr = 0.3 * em, cx = x0 + rr, cy = base - rr * 0.95;
            doc.setFillColor.apply(doc, DOT); doc.circle(cx, cy, rr, "F");
            doc.triangle(cx, cy - 2 * rr, cx - rr * 0.866, cy - rr * 0.5, cx + rr * 0.866, cy - rr * 0.5, "F");
          }
          font(nm, r.kind === "me", col); nl.forEach((l, i) => doc.text(l, x0 + dotW, base + i * lineH(nm)));
          if (r.d) {
            font(ds, false, r.kind === "wa" ? BLUE_SOFT : MUTED);
            const lastY = base + (nl.length - 1) * lineH(nm);
            if (dInline) doc.text(r.d, x0 + dotW + nW + 0.4 * em, lastY); else doc.text(r.d, x0 + dotW, lastY + lineH(ds));
          }
          if (r.m) { font(big, true, col); doc.text(r.m, R, base, { align: "right" }); }
        }
        y += h;
      });
      if (!recs.length) return y;
      // Zutaten je Portion: Karten
      label(labels[1] || "Zutaten je Portion");
      const ZS = 11.8 * s, zlh = lineH(ZS), padX = 0.8 * em, cw = (R - L - 2 * padX - 4.5) / 2, tn = 12.5 * s, ti = 9 * s;
      recs.forEach(rc => {
        y += 0.55 * em;
        const pairs = [];
        for (let i = 0; i < rc.z.length; i += 2) {
          const cells = rc.z.slice(i, i + 2).map(it => { font(ZS, true); const gw = doc.getTextWidth(it.g); font(ZS, false); return { it, lines: doc.splitTextToSize(it.n, cw - gw - 1.5) }; });
          pairs.push({ cells, n: Math.max.apply(null, cells.map(c => c.lines.length)) });
        }
        const h = 0.55 * em + lineH(tn) + 0.35 * em + pairs.reduce((a, q) => a + q.n * zlh + 0.22 * em, 0) - 0.22 * em + 0.6 * em;
        if (draw) {
          doc.setFillColor.apply(doc, CARD); doc.roundedRect(L, y, R - L, h, 2, 2, "F");
          let yy = y + 0.55 * em + lineH(tn) * 0.8;
          font(tn, true); doc.text(rc.n, L + padX, yy);
          font(ti, true, GREEN); doc.text(rc.times, R - padX, yy, { align: "right" });
          yy = y + 0.55 * em + lineH(tn) + 0.35 * em;
          pairs.forEach(q => {
            q.cells.forEach((c, ci) => {
              const x0 = L + padX + ci * (cw + 4.5), x1 = x0 + cw;
              font(ZS, false); c.lines.forEach((l, li) => doc.text(l, x0, yy + (li + 0.8) * zlh));
              font(ZS, true); doc.text(c.it.g, x1, yy + (c.lines.length - 1 + 0.8) * zlh, { align: "right" });
            });
            yy += q.n * zlh + 0.22 * em;
          });
        }
        y += h;
      });
      return y;
    };
    let s = 1.5;
    while (layout(s, false) > BOTTOM && s > 0.4) s = Math.round((s - 0.04) * 100) / 100;
    // Falzlinien: A4 zweimal falten → A6
    doc.setDrawColor(180, 189, 194); doc.setLineWidth(0.25); doc.setLineDashPattern([1.6, 1.2], 0);
    doc.line(105, 0, 105, 297); doc.line(0, 148.5, 210, 148.5); doc.setLineDashPattern([], 0);
    layout(s, true);
  }
  function buildPdfFromHtml(html) {
    const J = typeof window !== "undefined" && window.jspdf && window.jspdf.jsPDF;
    if (!J) return null;
    const dom = new DOMParser().parseFromString(html, "text/html");
    const kz = dom.body.querySelector(".kz");
    if (kz) { const kd = new J({ unit: "mm", format: "a4", compress: true }); kitchenCardPdf(kd, kz); return kd; }
    const doc = new J({ unit: "mm", format: "a4", compress: true });
    const PW = 210, PH = 297, M = 14, W = PW - 2 * M, BOTTOM = PH - M - 6;
    const INK = [31, 41, 51], MUTED = [102, 102, 102], GREEN = [47, 133, 90];
    let y = M;
    const lineH = (size) => size * 0.3528 * 1.32;
    const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
    const font = (size, bold, color) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK); };
    const para = (text, o) => {
      o = o || {}; const size = o.size || 10, indent = o.indent || 0, t = pdfText(text); if (!t) return;
      font(size, o.bold, o.color);
      const lh = lineH(size);
      doc.splitTextToSize(t, W - indent).forEach(l => { ensure(lh); doc.text(l, M + indent, y + lh * 0.78); y += lh; });
      y += o.gap == null ? 1.5 : o.gap;
    };
    const box = (el) => {
      const warn = el.classList.contains("warn"), size = 9.5, lh = lineH(size), pad = 2.2;
      // Zeilenumbrüche (<br>) im Kasten erhalten
      const txt = el.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      font(size, false); const lines = doc.splitTextToSize(pdfText(txt), W - 8);
      const h = lines.length * lh + 2 * pad; ensure(h + 2);
      doc.setFillColor.apply(doc, warn ? [253, 246, 227] : [243, 246, 244]); doc.rect(M, y, W, h, "F");
      doc.setFillColor.apply(doc, warn ? [183, 121, 31] : GREEN); doc.rect(M, y, 0.9, h, "F");
      font(size, false); let yy = y + pad;
      lines.forEach(l => { doc.text(l, M + 4, yy + lh * 0.78); yy += lh; });
      y += h + 2.5;
    };
    const table = (tbl) => {
      const rowClass = [];
      pdfAutoTable(doc, {
        html: tbl, startY: y, margin: { left: M, right: M, bottom: PH - BOTTOM }, theme: "plain", useCss: false,
        styles: { font: "helvetica", fontSize: 8.8, cellPadding: { top: 1.3, bottom: 1.3, left: 1.4, right: 1.4 }, textColor: INK, lineColor: [213, 219, 216], lineWidth: { bottom: 0.15 }, overflow: "linebreak" },
        headStyles: { fillColor: [238, 245, 240], textColor: [51, 70, 59], fontStyle: "bold", fontSize: 8.2, lineColor: [155, 184, 166], lineWidth: { bottom: 0.25 } },
        didParseCell: (data) => {
          const el = data.cell.raw && data.cell.raw.nodeType === 1 ? data.cell.raw : null;
          data.cell.text = (data.cell.text || []).map(pdfText);
          if (!el) return;
          const tr = el.parentElement, cls = tr ? tr.className : "";
          if (el.classList.contains("num")) data.cell.styles.halign = "right";
          if (data.section === "body") {
            if (/\bsum\b/.test(cls)) { data.cell.styles.fontStyle = "bold"; data.cell.styles.lineWidth = { top: 0.35 }; data.cell.styles.lineColor = [119, 119, 119]; }
            if (el.querySelector && el.querySelector("b") && !/\bsum\b/.test(cls) && el.textContent.trim() === el.querySelector("b").textContent.trim()) data.cell.styles.fontStyle = "bold";
          }
          rowClass[data.row.index] = cls;
        },
      });
      y = doc.lastAutoTable.finalY + 2.5;
    };
    [...dom.body.children].forEach(el => {
      const tag = el.tagName.toLowerCase(), cls = el.className || "";
      if (cls === "head") {
        const h1 = el.querySelector("h1"), meta = el.querySelector(".meta");
        const metaLines = meta ? meta.innerHTML.split(/<br\s*\/?>/i).map(s => pdfText(s.replace(/<[^>]+>/g, ""))) : [];
        font(17, true); const titleLines = doc.splitTextToSize(pdfText(h1 ? h1.textContent : ""), W - 55);
        const lh = lineH(17);
        titleLines.forEach((l, i) => doc.text(l, M, y + lh * 0.8 + i * lh));
        font(9, false, MUTED); metaLines.forEach((l, i) => doc.text(l, PW - M, y + 3.5 + i * 4, { align: "right" }));
        y += Math.max(titleLines.length * lh, metaLines.length * 4 + 1) + 1.5;
        doc.setDrawColor.apply(doc, GREEN); doc.setLineWidth(0.45); doc.line(M, y, PW - M, y); y += 3.5;
      } else if (tag === "h2") {
        ensure(12);
        const sm = el.querySelector("small"), main = el.cloneNode(true);
        [...main.querySelectorAll("small")].forEach(n => n.remove());
        if (!sm) para(el.textContent, { size: 11.5, bold: true, color: GREEN, gap: 1 });
        else {
          // Zusatz in der Überschrift klein und grau
          const lh = lineH(11.5), t = pdfText(main.textContent);
          font(11.5, true, GREEN); doc.text(t, M, y + lh * 0.78);
          const x = M + doc.getTextWidth(t) + 2;
          font(8.5, false, MUTED); doc.text(pdfText(sm.textContent), x, y + lh * 0.78);
          y += lh + 1;
        }
      }
      else if (tag === "table") table(el);
      else if (tag === "ol") {
        [...el.children].forEach((li, i) => {
          const size = 10, lh = lineH(size); font(size, false);
          const lines = doc.splitTextToSize(pdfText(li.textContent), W - 7);
          ensure(lh * Math.min(lines.length, 2));
          doc.text((i + 1) + ".", M + 0.5, y + lh * 0.78);
          lines.forEach(l => { ensure(lh); doc.text(l, M + 6, y + lh * 0.78); y += lh; });
          y += 1.2;
        });
        y += 1;
      } else if (/\bbox\b/.test(cls)) box(el);
      else if (/\bfoot\b/.test(cls)) { y += 3; para(el.textContent, { size: 8, color: MUTED }); }
      else if (/\brx\b/.test(cls)) para(el.textContent, { size: 9.5, color: [51, 51, 51], gap: 2 });
      else para(el.textContent, { size: 10 });
    });
    // Seitenzahlen
    const n = doc.getNumberOfPages();
    if (n > 1) for (let i = 1; i <= n; i++) { doc.setPage(i); font(8, false, MUTED); doc.text("Seite " + i + " von " + n, PW - M, PH - 8, { align: "right" }); }
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
