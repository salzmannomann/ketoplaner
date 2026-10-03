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
  function buildPdfFromHtml(html) {
    const J = typeof window !== "undefined" && window.jspdf && window.jspdf.jsPDF;
    if (!J) return null;
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
          if (el.classList.contains("t")) { data.cell.styles.fontStyle = "bold"; data.cell.styles.cellWidth = 15; }
          if (data.section === "body") {
            if (/\bmeals\b/.test(tbl.className)) {
              data.cell.styles.lineWidth = 0;
              if (/\bgrp\b/.test(cls)) {
                // Kopfzeile je Rezept: Name fett, Nährwerte klein dahinter
                const b = el.querySelector("b"), s = el.querySelector("small");
                data.cell.text = [pdfText(b ? b.textContent : el.textContent)];
                data.cell.smallText = s ? pdfText(s.textContent) : "";
                data.cell.styles.fillColor = [238, 245, 240]; data.cell.styles.fontStyle = "bold";
                data.cell.styles.lineWidth = { bottom: 0.25 }; data.cell.styles.lineColor = [155, 184, 166];
                data.cell.styles.cellPadding = { top: 1.6, bottom: 1.4, left: 1.4, right: 1.4 };
              } else if (/\bft\b/.test(cls)) {
                data.cell.styles.fontSize = 8.4; data.cell.styles.textColor = [51, 51, 51];
                data.cell.styles.cellPadding = { top: 1.2, bottom: 3.2, left: 1.4, right: 1.4 };
              } else {
                data.cell.styles.cellPadding = { top: 0.8, bottom: 0.8, left: 1.4, right: el.classList.contains("g") ? 6 : 1.4 };
                data.cell.styles.cellWidth = el.classList.contains("g") ? W * 0.16 : W * 0.34;
              }
            }
            if (/\bwater\b/.test(cls)) { data.cell.styles.fillColor = [243, 248, 252]; data.cell.styles.textColor = [36, 85, 127]; }
            if (/\bsleep\b/.test(cls)) data.cell.styles.textColor = [119, 119, 119];
            if (/\bsum\b/.test(cls)) { data.cell.styles.fontStyle = "bold"; data.cell.styles.lineWidth = { top: 0.35 }; data.cell.styles.lineColor = [119, 119, 119]; }
            if (el.querySelector && el.querySelector("b") && !/\bsum\b/.test(cls) && el.textContent.trim() === el.querySelector("b").textContent.trim()) data.cell.styles.fontStyle = "bold";
          }
          rowClass[data.row.index] = cls;
        },
        didDrawCell: (data) => {
          // Nährwerte klein und normal hinter dem fetten Rezeptnamen
          if (!data.cell.smallText) return;
          const name = (data.cell.text || []).join(" ");
          font(data.cell.styles.fontSize, true);
          const x = data.cell.x + data.cell.padding("left") + doc.getTextWidth(name) + 2.5;
          font(7.8, false, MUTED);
          doc.text(data.cell.smallText, x, data.cell.y + data.cell.height / 2, { baseline: "middle" });
        },
      });
      y = doc.lastAutoTable.finalY + 2.5;
    };
    const sums = (el) => {
      const cells = [...el.children].map(c => { const b = c.querySelector("b"), s = c.querySelector("span"); return pdfText(b ? b.textContent : "") + "\n" + pdfText(s ? s.textContent : ""); });
      pdfAutoTable(doc, {
        body: [cells], startY: y, margin: { left: M, right: M }, theme: "grid",
        styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8, textColor: INK, lineColor: [207, 220, 211], lineWidth: 0.2, valign: "top" },
        didParseCell: (data) => { data.cell.styles.fontStyle = "normal"; },
        willDrawCell: (data) => { if (data.section === "body") { /* erste Zeile fett */ } },
        didDrawCell: () => {},
      });
      y = doc.lastAutoTable.finalY + 2.5;
    };
    const dom = new DOMParser().parseFromString(html, "text/html");
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
      else if (/\bsums\b/.test(cls)) sums(el);
      else if (/\bfoot\b/.test(cls)) { y += 3; para(el.textContent, { size: 8, color: MUTED }); }
      else if (/\bnote\b/.test(cls)) para(el.textContent, { size: 9.5, gap: 2 });
      else if (/\brx\b/.test(cls)) para(el.textContent, { size: 9.5, color: [51, 51, 51], gap: 2 });
      else para(el.textContent, { size: 10 });
    });
    // Seitenzahlen
    const n = doc.getNumberOfPages();
    if (n > 1) for (let i = 1; i <= n; i++) { doc.setPage(i); font(8, false, MUTED); doc.text("Seite " + i + " von " + n, PW - M, PH - 8, { align: "right" }); }
    return doc;
  }
  async function sharePrintPdf() {
    if (!printCurrent) return;
    let doc = null;
    try { doc = buildPdfFromHtml(printCurrent.html); } catch (e) { doc = null; }
    if (!doc) { showToast("📄 PDF konnte nicht erstellt werden – bitte über „Drucken“ → Teilen als PDF sichern."); return; }
    const name = safeFileName(printCurrent.file) + ".pdf";
    const blob = doc.output("blob");
    let file = null;
    try { file = new File([blob], name, { type: "application/pdf" }); } catch (e) {}
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
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
