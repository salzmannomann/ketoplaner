  /* ---------- Drucken und Teilen (A4 Hochformat) ----------
     Der Ausdruck öffnet sich als Vorschau in der App (kein neues Fenster – in der installierten iPhone-App gäbe es
     dort weder Zurück noch zuverlässig einen Druckdialog). Inhalt und Stil liegen in einem Shadow-DOM, damit die
     Druckformatierung die App nicht berührt; gedruckt wird nur die Vorschau (@media print in styles.css).
     „📤 Teilen“ erzeugt aus derselben Vorlage ein PDF (jsPDF, offline eingebettet) und öffnet das Teilen-Menü. */
  let printCurrent = null; // { html, title, file } der offenen Vorschau – Grundlage fürs PDF
  function openPrintView(html, file) {
    const rawCss = ((html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "");
    const pageRule = (rawCss.match(/@page\s*\{[^}]*\}/) || [""])[0];
    const css = rawCss.replace(/@page\s*\{[^}]*\}/g, "").replace(/(^|[}\s])body\s*\{/g, "$1:host{");
    // Seitenformat der Vorlage (z. B. A4 quer beim Tagesplan) gilt beim Drucken; die Vorschau zeigt die Seite so
    let ps = document.getElementById("print-page-style");
    if (!ps) { ps = document.createElement("style"); ps.id = "print-page-style"; document.head.appendChild(ps); }
    ps.textContent = pageRule ? "@media print{" + pageRule + "}" : "";
    const body = (html.match(/<body>([\s\S]*?)<\/body>/) || [])[1] || html;
    const title = ((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "Drucken").replace(/&amp;/g, "&");
    printCurrent = { html, title, file: file || title };
    let ov = document.getElementById("print-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "print-overlay"; ov.className = "print-overlay"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Druckvorschau");
      ov.innerHTML = '<div class="print-bar"><button type="button" class="btn secondary" id="print-back">‹ Zurück</button>' +
        '<span class="print-title"></span>' +
        '<button type="button" class="btn secondary" id="print-share">📤 Teilen</button>' +
        '<button type="button" class="btn" id="print-go">🖨️ Drucken</button></div>' +
        '<div class="print-scroll"><div class="print-sheet" id="print-sheet"></div></div>';
      document.body.appendChild(ov);
      ov.querySelector("#print-back").addEventListener("click", closePrintView);
      ov.querySelector("#print-go").addEventListener("click", () => {
        if (iosHomeScreenApp() || (isIOS() && ov.querySelector("#print-sheet").classList.contains("landscape"))) { sharePrintPdf(true); return; }
        try { window.print(); } catch (e) {}
      });
      ov.querySelector("#print-share").addEventListener("click", sharePrintPdf);
      document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden) closePrintView(); });
    }
    ov.querySelector(".print-title").textContent = title;
    const sheet = ov.querySelector("#print-sheet");
    sheet.classList.toggle("landscape", /size\s*:\s*A4\s+landscape/.test(pageRule));
    const root = sheet.shadowRoot || (sheet.attachShadow ? sheet.attachShadow({ mode: "open" }) : sheet);
    root.innerHTML = "<style>:host{display:block}" + css + "</style>" + body;
    ov.hidden = false; document.body.classList.add("printing"); modalOpen("print");
    const sc = ov.querySelector(".print-scroll"); if (sc) { sc.scrollTop = 0; sc.scrollLeft = 0; }
    // Küchenzettel in Originalgröße einpassen (ohne Vorschau-Verkleinerung), danach auf die Bildschirmbreite zoomen
    sheet.style.zoom = ""; fitKitchenCard(root);
    printZoom = 1; fitPrintSheet(); bindPrintZoom(sc);
  }
  // iPhone/iPad als Home-Bildschirm-App: dort ignoriert iOS window.print() (der Knopf täte nichts). „Drucken“ öffnet
  // stattdessen das PDF im Teilen-Menü – darin steht „Drucken“ (AirPrint). In Safari und am Computer: normaler Druck.
  // Querformat (Tagesplan) geht am iPhone auch in Safari über das PDF, weil Safari das Seitenformat nicht sicher übernimmt.
  function isIOS() {
    const nav = window.navigator || {};
    return /iPhone|iPad|iPod/.test(nav.userAgent || "") || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  }
  function iosHomeScreenApp() {
    const nav = window.navigator || {};
    const ios = isIOS();
    const standalone = nav.standalone === true || !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    return ios && standalone;
  }
  // Vorschau als ganze A4-Seite: am Handy auf die Breite verkleinert (wie gedruckt bzw. als PDF geteilt).
  // Zoomen in der Vorschau: Die App sperrt sonst das Zoomen (versehentliches Vergrößern beim Tippen) – hier gibt es
  // ein eigenes Zoomen: zwei Finger auseinander/zusammen, Doppeltippen vergrößert bzw. zurück auf Seitenbreite.
  // printZoom ist der Faktor über der Seitenbreite (1 = ganze Seite sichtbar, bis 4).
  let printZoom = 1;
  const PRINT_ZOOM_MAX = 4;
  function printFitZoom() {
    const ov = document.getElementById("print-overlay"); if (!ov) return 1;
    const sc = ov.querySelector(".print-scroll");
    const land = ov.querySelector("#print-sheet").classList.contains("landscape");
    const avail = ((sc && sc.clientWidth) || window.innerWidth) - 20, full = land ? 1123 : 794; // 297 bzw. 210 mm bei 96 dpi
    return avail > 0 ? Math.min(1, avail / full) : 1;
  }
  function fitPrintSheet() {
    const ov = document.getElementById("print-overlay"); if (!ov || ov.hidden) return;
    const sheet = ov.querySelector("#print-sheet");
    const z = printFitZoom() * printZoom;
    sheet.style.zoom = Math.abs(z - 1) > 0.001 ? String(Math.round(z * 1000) / 1000) : "";
    ov.classList.toggle("zoomed", printZoom > 1.01);
  }
  // Zoom auf einen Punkt (Bildschirmkoordinaten) setzen: der Inhalt unter dem Punkt bleibt an seiner Stelle.
  function setPrintZoom(f, cx, cy) {
    const ov = document.getElementById("print-overlay"); if (!ov) return;
    const sc = ov.querySelector(".print-scroll");
    f = Math.max(1, Math.min(PRINT_ZOOM_MAX, f));
    const r = sc.getBoundingClientRect(), px = (cx == null ? r.width / 2 : cx - r.left), py = (cy == null ? r.height / 2 : cy - r.top);
    const k = f / printZoom, x = sc.scrollLeft + px, y = sc.scrollTop + py;
    printZoom = f; fitPrintSheet();
    sc.scrollLeft = Math.max(0, x * k - px); sc.scrollTop = Math.max(0, y * k - py);
  }
  function bindPrintZoom(sc) {
    if (!sc || sc.dataset.zoomBound) return;
    sc.dataset.zoomBound = "1";
    let d0 = 0, f0 = 1, lastTap = 0, moved = false;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    sc.addEventListener("touchstart", (e) => {
      if (e.touches && e.touches.length === 2) { d0 = dist(e.touches); f0 = printZoom; e.preventDefault(); }
      else moved = false;
    }, { passive: false });
    sc.addEventListener("touchmove", (e) => {
      if (e.touches && e.touches.length === 2 && d0 > 0) {
        e.preventDefault();
        const m = mid(e.touches);
        setPrintZoom(f0 * dist(e.touches) / d0, m.x, m.y);
      } else moved = true;
    }, { passive: false });
    sc.addEventListener("touchend", (e) => {
      if (d0 > 0) { if (!e.touches || e.touches.length < 2) d0 = 0; return; }
      if (moved || !e.changedTouches || !e.changedTouches[0]) return;
      const now = Date.now(), t = e.changedTouches[0];
      if (now - lastTap < 320) { lastTap = 0; setPrintZoom(printZoom > 1.01 ? 1 : 2.5, t.clientX, t.clientY); e.preventDefault(); }
      else lastTap = now;
    }, { passive: false });
    // Am Computer: Strg/Cmd + Mausrad zoomt die Vorschau
    sc.addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault(); setPrintZoom(printZoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    }, { passive: false });
  }
  if (typeof window !== "undefined") window.addEventListener("resize", fitPrintSheet);
  function closePrintView() {
    const ov = document.getElementById("print-overlay"); if (!ov || ov.hidden) return;
    ov.hidden = true; document.body.classList.remove("printing"); modalClose("print");
  }

  // Küchenzettel (Tagesplan): A5 hochkant = linke Hälfte einer quer gedruckten A4-Seite (Teilungslinie in der Mitte),
  // unten 5 cm frei zum Einstecken in eine Hülle. Alle Schriftgrößen in em, damit fitKitchenCard die ganze Karte über
  // --s anpassen kann.
  const KITCHEN_CSS =
    "*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    "body{font-family:Arial,Helvetica,sans-serif;color:#1f2933;margin:0}" +
    "@page{size:A4 landscape;margin:0}" +
    ".kz-page{position:relative;width:297mm;height:209mm;overflow:hidden}" +
    ".kz{position:absolute;left:0;top:0;width:148.5mm;height:160mm;padding:10mm 10mm 0;overflow:hidden;font-size:calc(10pt * var(--s, 1));line-height:1.2}" +
    ".kz-cut{position:absolute;left:148.5mm;top:0;bottom:0;border-left:.3mm dashed #8a969c}" +
    ".kz-cut span{position:absolute;top:5mm;left:2mm;font-size:8pt;color:#8a969c;white-space:nowrap}" +
    ".kz-h{border-bottom:.5mm solid #2f855a;padding-bottom:1.2mm;margin-bottom:.8mm}.kz-h b{font-size:1.3em}" +
    ".r{display:grid;grid-template-columns:calc(15.5mm * var(--s, 1)) 1fr auto;column-gap:1.5mm;align-items:baseline;padding:1mm 1mm;border-bottom:.2mm solid #d5dbd8;break-inside:avoid}" +
    ".r .t{font-weight:bold;font-size:1.25em}.r .w .n{font-weight:bold;font-size:1.12em}.r i{font-style:normal;color:#555;font-weight:normal}.r .d{font-size:.85em}" +
    ".r .m{font-weight:bold;font-size:1.25em;text-align:right;white-space:nowrap}" +
    ".kz-s{margin:3.5mm 0 .5mm;padding-bottom:.8mm;border-bottom:.4mm solid #2f855a;color:#2f855a;font-weight:bold;font-size:1.05em}" +
    ".rb{padding:1.2mm 1mm 1.4mm;border-bottom:.2mm solid #d5dbd8;break-inside:avoid}.rn b{font-size:1.15em}.rn i{font-style:normal;color:#555;font-size:.85em}" +
    ".rb .z{display:grid;grid-template-columns:1fr 1fr;column-gap:5mm;row-gap:.3mm;font-size:1.12em;line-height:1.25;margin-top:.6mm}" +
    ".rb .z .i{display:flex;justify-content:space-between;align-items:baseline;gap:1.5mm;border-bottom:.15mm dotted #b9c2c7}.rb .z .i b{white-space:nowrap}" +
    ".r.wa{background:#eaf3fa;color:#24557f}.r.wa .t,.r.wa .m{font-size:1.12em}.r.wa .w .n{font-size:1.02em;font-weight:normal}.r.wa i{color:#24557f}" +
    ".r.sl{color:#7a858b;border-bottom:none}.r.sl .t,.r.sl .w .n{font-size:1em;font-weight:normal}";
  // Schrift der Karte so groß wie möglich: von 150 % schrittweise kleiner, bis der Inhalt hineinpasst (mindestens 60 %).
  const KITCHEN_SCALE_MAX = 1.5;
  function fitKitchenCard(root) {
    const kz = root && root.querySelector && root.querySelector(".kz"); if (!kz) return;
    let sc = KITCHEN_SCALE_MAX; kz.style.setProperty("--s", String(sc));
    while (kz.scrollHeight > kz.clientHeight + 1 && sc > 0.6) { sc = Math.round((sc - 0.04) * 100) / 100; kz.style.setProperty("--s", String(sc)); }
  }

  // Gemeinsamer Rahmen aller Ausdrucke: Kopf mit Titel und Datum, grüne Linie, Fußzeile.
  const PRINT_CSS =
    "@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    "body{font-family:Arial,Helvetica,sans-serif;color:#1f2933;margin:0;font-size:10.5pt;line-height:1.4}" +
    ".head{display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;border-bottom:1.2pt solid #2f855a;padding-bottom:2mm;margin-bottom:3mm}" +
    "h1{font-size:17pt;margin:0;line-height:1.15}.meta{color:#555;font-size:9pt;text-align:right;white-space:nowrap}" +
    ".rx{margin:0 0 3mm;color:#333;font-size:9.5pt}" +
    "h2{font-size:11.5pt;margin:5mm 0 1.5mm;color:#2f855a}" +
    "table{width:100%;border-collapse:collapse;margin:0}" +
    "th{background:#eef5f0;text-align:left;font-size:8.5pt;font-weight:bold;color:#33463b;padding:1.4mm 1.5mm;border-bottom:.6pt solid #9bb8a6}" +
    "td{border-bottom:.4pt solid #d5dbd8;padding:1.6mm 1.5mm;vertical-align:top}" +
    ".num{text-align:right;white-space:nowrap}" +
    "tr.sum td{font-weight:bold;border-top:1pt solid #777;border-bottom:none}" +
    ".box{background:#f3f6f4;border-left:2.5pt solid #2f855a;padding:2.2mm 3.2mm;margin:3mm 0;font-size:9.5pt}" +
    ".box.warn{background:#fdf6e3;border-left-color:#b7791f}" +
    "ol{margin:1mm 0 0;padding-left:6mm}li{margin:0 0 1.4mm}" +
    "tr,li,.box{break-inside:avoid}" +
    ".foot{margin-top:6mm;padding-top:2mm;border-top:.4pt solid #ccc;color:#777;font-size:8pt}";
  function printDoc(title, meta, bodyHtml) {
    return "<!DOCTYPE html><html lang='de'><head><meta charset='utf-8'><title>" + escapeHtml(title) + "</title><style>" + PRINT_CSS + "</style></head><body>" +
      "<div class='head'><h1>" + escapeHtml(title) + "</h1><div class='meta'>" + meta + "</div></div>" + bodyHtml +
      "<div class='foot'>Erstellt mit HamHam Keto am " + new Date().toLocaleDateString("de-AT") + ". Kein Ersatz für ärztliche oder diätologische Beratung – Mengen mit dem Behandlungsteam abstimmen.</div></body></html>";
  }
  function printDateLong() {
    try { return new Date().toLocaleDateString("de-AT", { weekday: "short", day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return new Date().toLocaleDateString("de-AT"); }
  }
  function fileDate() { const t = new Date(); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); }
  const oilName = (food) => String(food).replace(/\s*C8\+C10/, "");

  // Rezept: Zutaten je Portion (und für die gewählte Menge), Nährwerte, Abfüllen, nummerierte Zubereitung.
  function printRecipe(rec, res, d, mult) {
    mult = mult || 1;
    // Rezepte aus dem Editor bringen keine eigene Zutatenliste mit – die berechnete gilt dann auch für Texte und Fettbasis.
    if (!Array.isArray(rec.items)) rec = Object.assign({}, rec, { items: res.items });
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
    const r = ratioOf(sumPer);
    const daysP = d.mahl > 0 && Math.abs(mult / d.mahl - Math.round(mult / d.mahl)) < 1e-6 ? Math.round(mult / d.mahl) : 0;
    const multTxt = Math.abs(mult - Math.round(mult)) < 1e-6 ? String(Math.round(mult)) : fmt(mult, 1);
    const portionLabel = mult === 1 ? "1 Portion" : (daysP ? (daysP === 1 ? "1 Tag = " : daysP + " Tage = ") : "") + multTxt + " Portionen";
    const isOilP = isOilName;
    const noOilP = items.filter(it => !isOilP(it.food)), oilsP = items.filter(it => isOilP(it.food) && num(it.grams) > 0);
    const gNoOil = noOilP.reduce((a, it) => a + num(it.grams), 0);
    const fluidPer = fluidOf(items), volPer = volumeMl(items);
    const showMult = mult !== 1;
    const rows = items.map(it => {
      const g = num(it.grams), m = lineMacros({ food: it.food, grams: g });
      return "<tr><td>" + escapeHtml(it.food) + "</td><td class='num'>" + fmt(g, 1) + " g</td>" +
        (showMult ? "<td class='num'><b>" + fmt(g * mult, 1) + " g</b></td>" : "") +
        "<td class='num'>" + fmt(m.eiweiss) + "</td><td class='num'>" + fmt(m.fett) + "</td><td class='num'>" + fmt(m.kh) + "</td><td class='num'>" + fmt(m.kcal, 0) + "</td></tr>";
    }).join("");
    const totalG = items.reduce((a, it) => a + num(it.grams), 0);
    const table = "<table><thead><tr><th>Lebensmittel</th><th class='num'>je Portion</th>" + (showMult ? "<th class='num'>" + escapeHtml(portionLabel) + "</th>" : "") +
      "<th class='num'>Eiweiß</th><th class='num'>Fett</th><th class='num'>KH</th><th class='num'>kcal</th></tr></thead><tbody>" + rows +
      "<tr class='sum'><td>Summe je Portion</td><td class='num'>" + fmt(totalG, 0) + " g</td>" + (showMult ? "<td class='num'>" + fmt(totalG * mult, 0) + " g</td>" : "") +
      "<td class='num'>" + fmt(sumPer.eiweiss) + "</td><td class='num'>" + fmt(sumPer.fett) + "</td><td class='num'>" + fmt(sumPer.kh) + "</td><td class='num'>" + fmt(sumPer.kcal, 0) + "</td></tr></tbody></table>";
    const fill = rec.angeruehrt
      ? "<div class='box'><b>Je Portion:</b> alles zusammen anrühren, ≈ " + fmt(volPer, 0) + " ml" + (oilsP.length ? ", das Öl gründlich einrühren." : ".") + "</div>"
      : "<div class='box'><b>Je Portion:</b> ≈ " + fmt(gNoOil, 0) + " g abfüllen" +
        (oilsP.length ? " und " + oilsP.map(o => escapeHtml(oilName(o.food)) + " " + fmt(num(o.grams), 1) + " g").join(" + ") + " einrühren – zusammen ≈ " + fmt(volPer, 0) + " ml" : " (≈ " + fmt(volumeMl(noOilP), 0) + " ml)") +
        (showMult ? "<br>Zubereitet wird für " + escapeHtml(portionLabel) + (oilsP.length ? " (ohne Öl ≈ " + fmt(gNoOil * mult, 0) + " g)" : "") + "." : "") + "</div>";
    const prepSrc = rec.varoma ? adaptOil(adaptVaroma(adaptPrep(rec.varoma, rec, detailMeat))) : (rec.zubereitung ? adaptOil(adaptPrep(rec.zubereitung, rec, detailMeat)) : "");
    const steps = splitSteps(prepSrc);
    const oilStepP = oilFeedStep(rec, items); if (oilStepP && steps.length) steps.push(oilStepP);
    const prep = steps.length
      ? "<h2>" + (rec.varoma ? "Zubereitung mit Varoma (dämpfen)" : "Zubereitung") + "</h2><ol>" + steps.map(s => "<li>" + escapeHtml(s) + "</li>").join("") + "</ol>" +
        (!rec.angeruehrt ? "<div class='box'>Vor dem Abfüllen durch ein feines Sieb streichen, damit nichts die Spritze verstopft." + (showMult ? " Garzeiten gelten für eine Portion – bei der größeren Menge länger garen, bis alles weich ist." : "") + " Im Kühlschrank lagern.</div>" : "")
      : "";
    const pState = proteinState(sumPer.eiweiss, d.eiweissMahl);
    const rx = "<p class='rx'><b>" + escapeHtml(basisLabel(rec)) + "</b>" + (rec.quelle ? " · Rezept der Diätologie" : "") + " · Verhältnis " + fmtRatio(r, 2) +
      " · " + fmt(sumPer.kcal, 0) + " kcal je Portion · Eiweiß " + fmt(sumPer.eiweiss) + " g (Ziel " + fmt(d.eiweissMahl) + " g) · Flüssigkeit ≈ " + fmt(fluidPer, 0) + " ml · Volumen ≈ " + fmt(volPer, 0) + " ml</p>";
    const warn = pState === "high" ? "<div class='box warn'>Eiweiß " + fmt(sumPer.eiweiss / d.eiweissMahl, 1) + "-mal so hoch wie das Ziel – mit dem Team abklären.</div>" : "";
    const title = rec.name;
    const html = printDoc(title, escapeHtml(printDateLong()) + "<br>" + escapeHtml(portionLabel), rx + "<h2>Zutaten</h2>" + table + fill + warn + prep);
    openPrintView(html, title);
  }
