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
  // Küchenzettel: A4 quer, linke Hälfte = A5 hochkant (148,5 × 210 mm) mit Teilungslinie in der Mitte, unten 5 cm frei
  // zum Einstecken; gleiche Gliederung wie die Vorschau. Die Schrift beginnt bei 150 % und wird schrittweise kleiner,
  // bis alles hineinpasst.
  function kitchenCardPdf(doc, kz) {
    const X = 0, Y = 0, CW = 148.5, PX = 10, PY = 10, BOTTOM = 210 - 50, GAP = 1.5;
    const L = X + PX, R = X + CW - PX;
    const lineH = (size) => size * 0.3528 * 1.2;
    const font = (size, bold, color) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor.apply(doc, color || [31, 41, 51]); };
    const txt = (el, sel) => { const n = sel ? el.querySelector(sel) : el; return n ? pdfText(n.textContent) : ""; };
    const head = kz.querySelector(".kz-h");
    const rows = [...kz.querySelectorAll(".r")].map(r => ({
      kind: r.classList.contains("wa") ? "wa" : r.classList.contains("sl") ? "sl" : "me",
      t: txt(r, ".t"), w: txt(r, ".w"), m: txt(r, ".m"), x: txt(r, ".x:not(.d)"), d: txt(r, ".x.d"),
      z: [...r.querySelectorAll(".z .i")].map(i => ({ n: txt(i, "span"), g: txt(i, "b") })),
    }));
    // Zutaten in zwei Spalten: links der Name (darf umbrechen), rechts fett die Gramm
    const ZS = 10, ZGAP = 4;
    const ingRows = (z, width, s) => {
      const cw = (width - ZGAP) / 2, out = [];
      for (let k = 0; k < z.length; k += 2) {
        const cells = z.slice(k, k + 2).map(it => { font(ZS * s, true); const gw = doc.getTextWidth(it.g); font(ZS * s, false); return { it, lines: doc.splitTextToSize(it.n, cw - gw - 1.5) }; });
        out.push({ cells, n: Math.max.apply(null, cells.map(c => c.lines.length)), cw });
      }
      return out;
    };
    const layout = (s, draw) => {
      // Uhrzeit-Spalte wächst mit der Schrift
      const TW = 15.5 * s, IW = R - L - TW - GAP;
      let y = Y + PY;
      font(13 * s, true); const hh = lineH(13 * s);
      if (draw) doc.text(txt(head, "b"), L, y + hh * 0.8);
      y += hh + 1.2;
      if (draw) { doc.setDrawColor(47, 133, 90); doc.setLineWidth(0.5); doc.line(L, y, R, y); }
      y += 0.8;
      rows.forEach(r => {
        const big = r.kind === "me" ? 14.5 : r.kind === "wa" ? 12.5 : 10, mid = r.kind === "me" ? 13 : r.kind === "wa" ? 11 : 10;
        const h1 = lineH(big);
        // Rezeptname darf umbrechen (Platz bis zur Mengenangabe rechts)
        font(big * s, true); const mw = r.m ? doc.getTextWidth(r.m) + 2 : 0;
        font(mid * s, r.kind === "me"); const wl = doc.splitTextToSize(r.w, R - L - TW - GAP - mw);
        const wx = (wl.length - 1) * lineH(mid * s);
        font(8.5 * s, false); const xl = r.x ? doc.splitTextToSize(r.x, IW) : [];
        const zr = r.z.length ? ingRows(r.z, IW, s) : [], zlh = lineH(ZS * s) * 1.05;
        const zh = zr.reduce((a, q) => a + q.n * zlh + 0.3, 0);
        const h = 1.2 + h1 * s + wx + (xl.length ? 0.3 + xl.length * lineH(8.5 * s) : 0) + (zr.length ? 0.8 + zh : 0) + 1.2;
        if (draw) {
          if (r.kind === "wa") { doc.setFillColor(234, 243, 250); doc.rect(L - 1, y, R - L + 2, h, "F"); }
          const col = r.kind === "wa" ? [36, 85, 127] : r.kind === "sl" ? [122, 133, 139] : [31, 41, 51];
          let yy = y + 1.2 + h1 * s * 0.8;
          font(big * s, r.kind !== "sl", col); doc.text(r.t, L, yy);
          font(mid * s, r.kind === "me", col); wl.forEach((l, k) => doc.text(l, L + TW + GAP, yy + k * lineH(mid * s)));
          if (r.m) { font(big * s, true, col); doc.text(r.m, R, yy, { align: "right" }); }
          yy = y + 1.2 + h1 * s + wx;
          if (r.d) { font(8.5 * s, false, [85, 85, 85]); doc.text(r.d, L, yy + 1 + lineH(8.5 * s) * 0.78); }
          if (xl.length) { font(8.5 * s, false, [85, 85, 85]); yy += 0.3; xl.forEach(l => { yy += lineH(8.5 * s); doc.text(l, L + TW + GAP, yy - lineH(8.5 * s) * 0.22); }); }
          if (zr.length) {
            yy += 0.8;
            zr.forEach(q => {
              q.cells.forEach((c, ci) => {
                const x0 = L + TW + GAP + ci * (q.cw + ZGAP), x1 = x0 + q.cw;
                font(ZS * s, false, [31, 41, 51]); c.lines.forEach((l, li) => doc.text(l, x0, yy + (li + 0.78) * zlh));
                font(ZS * s, true, [31, 41, 51]); doc.text(c.it.g, x1, yy + (c.lines.length - 1 + 0.78) * zlh, { align: "right" });
                doc.setDrawColor(185, 194, 199); doc.setLineWidth(0.15); doc.setLineDashPattern([0.4, 0.6], 0);
                doc.line(x0, yy + q.n * zlh + 0.15, x1, yy + q.n * zlh + 0.15); doc.setLineDashPattern([], 0);
              });
              yy += q.n * zlh + 0.3;
            });
          }
          if (r.kind !== "sl") { doc.setDrawColor(213, 219, 216); doc.setLineWidth(0.2); doc.line(L - 1, y + h, R + 1, y + h); }
        }
        y += h;
      });
      return y;
    };
    let s = 1.5;
    while (layout(s, false) > BOTTOM && s > 0.6) s = Math.round((s - 0.04) * 100) / 100;
    // Teilungslinie in der Mitte der Seite
    doc.setDrawColor(138, 150, 156); doc.setLineWidth(0.3); doc.setLineDashPattern([1.6, 1.2], 0);
    doc.line(X + CW, 0, X + CW, 210); doc.setLineDashPattern([], 0);
    font(8, false, [138, 150, 156]); doc.text("hier teilen", X + CW + 2, 8);
    layout(s, true);
  }
  function buildPdfFromHtml(html) {
    const J = typeof window !== "undefined" && window.jspdf && window.jspdf.jsPDF;
    if (!J) return null;
    const dom = new DOMParser().parseFromString(html, "text/html");
    const kz = dom.body.querySelector(".kz");
    if (kz) { const kd = new J({ unit: "mm", format: "a4", orientation: "landscape", compress: true }); kitchenCardPdf(kd, kz); return kd; }
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
    if (!doc) { showToast(forPrint ? "📄 PDF konnte nicht erstellt werden – bitte die App in Safari öffnen und dort drucken." : "📄 PDF konnte nicht erstellt werden – bitte über „Drucken“ → Teilen als PDF sichern."); return; }
    const name = safeFileName(printCurrent.file) + ".pdf";
    const blob = doc.output("blob");
    let file = null;
    try { file = new File([blob], name, { type: "application/pdf" }); } catch (e) {}
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      if (forPrint) showToast("🖨️ Im Teilen-Menü auf „Drucken“ tippen.");
      try { await navigator.share({ files: [file], title: printCurrent.title }); } catch (e) { /* abgebrochen */ }
      return;
    }
    // Ohne Teilen-Menü (z. B. am Desktop): PDF herunterladen
    try {
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast("📄 PDF gespeichert: " + escapeHtml(name));
    } catch (e) { showToast("📄 PDF konnte nicht gespeichert werden."); }
  }
