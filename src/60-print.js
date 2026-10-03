  /* ---------- Drucken (A4 Hochformat) ----------
     Der Ausdruck öffnet sich als Vorschau in der App (kein neues Fenster – in der installierten iPhone-App gäbe es
     dort weder Zurück noch zuverlässig einen Druckdialog). Inhalt und Stil liegen in einem Shadow-DOM, damit die
     Druckformatierung die App nicht berührt; gedruckt wird nur die Vorschau (@media print in styles.css). */
  function openPrintView(html) {
    const css = ((html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "")
      .replace(/@page\s*\{[^}]*\}/g, "").replace(/(^|[}\s])body\s*\{/g, "$1:host{");
    const body = (html.match(/<body>([\s\S]*?)<\/body>/) || [])[1] || html;
    const title = ((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "Drucken");
    let ov = document.getElementById("print-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "print-overlay"; ov.className = "print-overlay"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Druckvorschau");
      ov.innerHTML = '<div class="print-bar"><button type="button" class="btn secondary" id="print-back">‹ Zurück</button>' +
        '<span class="print-title"></span><button type="button" class="btn" id="print-go">🖨️ Drucken</button></div>' +
        '<div class="print-scroll"><div class="print-sheet" id="print-sheet"></div></div>';
      document.body.appendChild(ov);
      ov.querySelector("#print-back").addEventListener("click", closePrintView);
      ov.querySelector("#print-go").addEventListener("click", () => { try { window.print(); } catch (e) {} });
      document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden) closePrintView(); });
    }
    ov.querySelector(".print-title").textContent = title.replace(/&amp;/g, "&");
    const sheet = ov.querySelector("#print-sheet");
    const root = sheet.shadowRoot || (sheet.attachShadow ? sheet.attachShadow({ mode: "open" }) : sheet);
    root.innerHTML = "<style>:host{display:block}" + css + "</style>" + body;
    ov.hidden = false; document.body.classList.add("printing"); modalOpen("print");
    const sc = ov.querySelector(".print-scroll"); if (sc) sc.scrollTop = 0;
  }
  function closePrintView() {
    const ov = document.getElementById("print-overlay"); if (!ov || ov.hidden) return;
    ov.hidden = true; document.body.classList.remove("printing"); modalClose("print");
  }
  function printRecipe(rec, res, d, mult) {
    mult = mult || 1;
    const hasMct = res.items.some(it => it.food === "MCT-Öl C8+C10");
    const oilWord = hasMct ? (res.items.some(it => it.food === "Rapsöl") ? "Rapsöl + MCT-Öl" : "MCT-Öl") : null;
    const adaptOil = (t) => oilWord ? String(t).replace(/Rapsöl/g, oilWord) : t;
    const pWaterG = res.items.filter(it => /wasser/i.test(it.food)).reduce((a, it) => a + num(it.grams), 0) * mult;
    const pBowl = Math.round(pWaterG + d.dampfVerdunstung);
    const adaptVaroma = (t) => (!t || pWaterG <= 0) ? t : t
      .replace("Ca. 500 ml Wasser in den Mixtopf geben (nur zum Dämpfen, wird nicht weiterverwendet).",
        "Ca. " + pBowl + " ml Wasser in den Mixtopf geben (das Dämpfwasser wird später mitverwendet).")
      .replace("Dämpfwasser abgießen. Die gedämpften Zutaten mit dem abgemessenen Wasser",
        "Das Dämpfwasser NICHT abgießen – davon " + Math.round(pWaterG) + " ml abmessen (bei Bedarf mit frischem Wasser auf " + Math.round(pWaterG) + " ml ergänzen) und zusammen mit den gedämpften Zutaten");
    const items = res.items;
    const sumPer = sumMacros(items);
    const sum = { eiweiss: sumPer.eiweiss * mult, fett: sumPer.fett * mult, kh: sumPer.kh * mult, kcal: sumPer.kcal * mult };
    const r = ratioOf(sumPer);
    const totalG = items.reduce((a, it) => a + num(it.grams), 0) * mult;
    const ml = volumeMl(items) * mult;
    const daysP = d.mahl > 0 && Math.abs(mult / d.mahl - Math.round(mult / d.mahl)) < 1e-6 ? Math.round(mult / d.mahl) : 0;
    const multTxt = Math.abs(mult - Math.round(mult)) < 1e-6 ? String(Math.round(mult)) : fmt(mult, 1);
    const portionLabel = mult === 1 ? "1 Mahlzeit" : (daysP ? (daysP === 1 ? "1 Tag = " : daysP + " Tage = ") : "") + multTxt + " Portionen";
    // Abfüllen je Portion (ohne Öl) und Öl je Portion vor dem Füttern – wie im Blatt „Kochen“.
    const isOilP = (n) => /öl|oil/i.test(n || "");
    const noOilP = items.filter(it => !isOilP(it.food)), oilsP = items.filter(it => isOilP(it.food) && num(it.grams) > 0);
    const fillLine = "<p class='fill'><strong>💉 Abfüllen je Portion:</strong> ≈ " + fmt(noOilP.reduce((a, it) => a + num(it.grams), 0), 0) + " g / " + fmt(volumeMl(noOilP), 0) + " ml" +
      (oilsP.length && !rec.angeruehrt ? " · <strong>🧈 vor dem Füttern einrühren:</strong> " + oilsP.map(o => escapeHtml(String(o.food).replace(/\s*C8\+C10/, "")) + " " + fmt(num(o.grams), 1) + " g").join(" + ") : "") + "</p>";
    const oilStepP = oilFeedStep(rec, items);
    const rows = items.map(it => {
      const g = num(it.grams) * mult;
      const m = lineMacros({ food: it.food, grams: g });
      return "<tr><td>" + escapeHtml(it.food) + "</td><td>" + fmt(g, 1) +
        " g</td><td>" + fmt(m.kcal, 0) + " kcal</td></tr>";
    }).join("");
    const html =
      "<!DOCTYPE html><html lang='de'><head><meta charset='utf-8'><title>" + escapeHtml(rec.name) + "</title>" +
      "<style>" +
      "@page{size:A4 portrait;margin:18mm}" +
      "*{box-sizing:border-box}" +
      "body{font-family:Arial,Helvetica,sans-serif;color:#1f2933;margin:0;font-size:11pt;line-height:1.45}" +
      "h1{font-size:18pt;margin:0 0 2mm}.sub{color:#444;margin:0 0 5mm;font-size:10pt}" +
      "table{width:100%;border-collapse:collapse;margin:4mm 0}" +
      "th,td{border-bottom:0.4pt solid #bbb;padding:1.6mm 1mm;text-align:left;font-size:10.5pt}" +
      "td:nth-child(2),td:nth-child(3){text-align:right;white-space:nowrap}" +
      "tr:last-child td{font-weight:bold;border-top:1pt solid #777}" +
      ".prep{background:#f2f4f6;border-radius:2mm;padding:3mm 4mm;margin:3mm 0;line-height:1.5;break-inside:avoid}" +
      ".prep strong{display:block;margin-bottom:1mm}" +
      "tr{break-inside:avoid}" +
      ".note{color:#666;font-size:8.5pt;margin-top:6mm}.fill{margin:2mm 0 4mm;font-size:10.5pt}" +
      "</style></head><body>" +
      "<h1>" + (rec.icon || "") + " " + escapeHtml(rec.name) + (rec.ketocal ? " (mit KetoCal)" : " (ohne KetoCal)") + "</h1>" +
      "<p class='sub'><strong>" + portionLabel + "</strong> · " + fmt(sum.kcal, 0) + " kcal · Eiweiß " + fmt(sum.eiweiss) +
      " g · Fett " + fmt(sum.fett) + " g · KH " + fmt(sum.kh) + " g · Verhältnis " +
      fmtRatio(r, 2) + "<br>Gesamtmenge ca. " + fmt(totalG, 0) + " g (≈ " + fmt(ml, 0) + " ml)</p>" +
      "<table><thead><tr><th>Lebensmittel</th><th>Menge</th><th>Energie</th></tr></thead><tbody>" + rows +
      "<tr><td>Summe</td><td>" + fmt(totalG, 0) + " g</td><td>" + fmt(sum.kcal, 0) + " kcal</td></tr></tbody></table>" + fillLine +
      (mult > 1 ? "<p class='sub'>Hinweis: Mengen für " + portionLabel + "." + (rec.angeruehrt ? "" : " Die Varoma-/Garzeiten gelten für eine Mahlzeit – bei der größeren Menge länger garen, bis alles weich ist.") + "</p>" : "") +
      (rec.varoma
        ? "<div class='prep'><strong>Zubereitung mit Varoma (dämpfen)</strong>" + escapeHtml(adaptOil(adaptVaroma(adaptPrep(rec.varoma, rec, detailMeat)))) + (oilStepP ? " " + escapeHtml(oilStepP) : "") + "</div>"
        : (rec.zubereitung ? "<div class='prep'><strong>Zubereitung</strong>" + escapeHtml(adaptOil(adaptPrep(rec.zubereitung, rec, detailMeat))) + (oilStepP ? " " + escapeHtml(oilStepP) : "") + "</div>" : "")) +
      "<p class='note'>Erstellt mit HamHam Keto. Bitte Mengen vor der Zubereitung mit dem Behandlungsteam abstimmen.</p>" +
      "</body></html>";
    openPrintView(html);
  }
