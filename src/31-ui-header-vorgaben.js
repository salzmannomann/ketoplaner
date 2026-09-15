  /* ---------- Kopfzeile, Bereiche (Tabs), Vorgaben ---------- */
  const VIEWS = ["heute", "rezepte", "vorgaben"];
  function showView(name) {
    if (VIEWS.indexOf(name) === -1) name = "rezepte";
    state.settings.view = name; save();
    VIEWS.forEach(v => {
      const sec = document.getElementById("view-" + v); if (sec) sec.hidden = v !== name;
    });
    document.querySelectorAll(".tabbar button[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    if (name === "heute" && typeof renderHeute === "function") renderHeute();
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  // Verordnungs-Chip: zeigt immer, womit gerade gerechnet wird.
  function renderHeader(d) {
    const chip = document.getElementById("rx-chip"); if (!chip) return;
    // Zeile 1: Verordnung. Zeile 2: Flüssigkeit – Ziel, Modus und (laut Tagesplan) die Menge zwischen den Mahlzeiten.
    const l1 = fmtTarget(d.ratio) + " · " + fmt(d.kcalMahl, 0) + " kcal × " + d.mahl + " · " + (ketoPhase() === "mit" ? "🥄 KetoCal" : "ohne KetoCal") +
      (d.mctShare > 0 ? " · MCT " + Math.round(d.mctShare * 100) + " % " + (d.mctMode === "kalorien" ? "🎯" : "⚖️") : "");
    let l2 = "";
    if (d.fluidDay > 0) {
      l2 = "💧 " + fmt(d.fluidDay, 0) + " ml/Tag · " +
        (d.wasserModus === "mahlzeit" ? "alles in den Mahlzeiten"
          : d.wasserModus === "zwischen" ? "Rezepte unverändert"
          : "max. " + fmt(d.maxMahlMl, 0) + " ml je Mahlzeit");
      if (d.wasserModus !== "mahlzeit") {
        let planFluid = 0, n = 0;
        (state.dayPlan || []).forEach(sl => { const r = recipeByKey(sl && sl.key); if (r) { planFluid += mealFacts(r, d).fluid; n++; } });
        if (n > 0) {
          const rest = Math.max(0, d.fluidDay * (n / d.mahl) - planFluid);
          l2 += " · zwischen den Mahlzeiten: " + (rest > 0.5 ? fmt(rest, 0) + " ml (" + gaps(n) + " × " + fmt(rest / gaps(n), 0) + " ml)" : "nichts nötig");
        } else l2 += " · zwischen den Mahlzeiten: laut Tagesplan";
      }
    }
    chip.innerHTML = '<span class="rx-line">' + escapeHtml(l1) + "</span>" + (l2 ? '<span class="rx-line rx-sub">' + escapeHtml(l2) + "</span>" : "");
  }
  function regelLabel(d) { return d.mctMode === "kalorien" ? "🎯 Kalorien halten" : "⚖️ Verhältnis halten"; }
  function renderVorgaben(d) {
    const s = state.settings;
    const sum = document.getElementById("verordnung-summary");
    if (sum) sum.innerHTML = "<strong>" + fmt(d.kcalMahl, 0) + " kcal pro Mahlzeit</strong> (" + fmt(d.kcal, 0) + " kcal/Tag ÷ " + d.mahl +
      ") · mindestens " + fmt(d.kcalMinMahl, 0) + " kcal (" + fmt(d.kcalMin, 0) + " kcal/Tag" + (d.kcalMinManual ? ", manuell" : ", 70 kcal/kg") + ")" +
      (d.kcalRichtwert ? " · Richtwert nach Gewicht ≈ " + fmt(d.kcalRichtwert, 0) + " kcal/Tag (80 kcal/kg, Korridor " + fmt(d.kcalMinAuto, 0) + "–" + fmt(d.kcalMaxAuto, 0) + ")" : "") +
      " · Verhältnis " + fmtTarget(d.ratio) + (d.ratio < 1 ? " (" + fmt(d.ratio, 2) + " g Fett je 1 g Eiweiß+KH)" : "") +
      " · Eiweiß-Ziel ca. " + fmt(d.eiweissMahl) + " g/Mahlzeit" +
      (d.autoProtein ? " (" + fmt(d.eiweiss, 0) + " g/Tag nach Gewicht)" : "") +
      " · " + (ketoPhase() === "mit" ? "KetoCal bevorzugt" : "ohne KetoCal bevorzugt") +
      " · MCT " + Math.round(d.mctShare * 100) + " %" +
      " · Rechenregel " + regelLabel(d);
    // Richtung des Verhältnisses klarstellen: Fett zuerst. „1,5“ = 1,5:1 (mehr Fett), „1:1,5“ = 0,67 (weniger Fett).
    const rh = document.getElementById("ratio-hint");
    if (rh) {
      if (d.ratio >= 1) rh.innerHTML = "";
      else rh.innerHTML = "⚠️ " + fmtTarget(d.ratio) + " = nur " + fmt(d.ratio, 2) + " g Fett je 1 g Eiweiß+KH – <strong>weniger Fett als Eiweiß+KH</strong>, also unterhalb von 1:1. Lautet die Verordnung „" + fmt(1 / d.ratio, 1) + ":1“, bitte „" + fmt(1 / d.ratio, 1) + "“ eingeben.";
      rh.classList.toggle("warnish", d.ratio < 1); rh.hidden = d.ratio >= 1;
    }
    document.querySelectorAll("#ketocal-ctl button[data-ketocal]").forEach(b =>
      b.classList.toggle("active", b.dataset.ketocal === ketoPhase()));
    // Flüssigkeit: Modus-Buttons und Zusammenfassung
    document.querySelectorAll("#wasser-modus-ctl button[data-wmodus]").forEach(b =>
      b.classList.toggle("active", b.dataset.wmodus === d.wasserModus));
    const fs = document.getElementById("fluid-summary");
    if (fs) fs.innerHTML = d.fluidDay > 0
      ? "<strong>" + fmt(d.fluidDay, 0) + " ml/Tag</strong>" + (d.fluidManual ? " (manuell)" : " (Richtwert nach Holliday-Segar: 100 ml/kg bis 10 kg)") +
        " · " + fmt(d.fluidMahl, 0) + " ml je Mahlzeit · " +
        (d.wasserModus === "mahlzeit" ? "in den Mahlzeiten enthalten – Rezepte bekommen entsprechend mehr Wasser"
          : d.wasserModus === "zwischen" ? "Rezepte bleiben wie sie sind, der Rest wird zwischen den Mahlzeiten sondiert"
          : "ausgewogen: Wasser in die Mahlzeit bis höchstens " + fmt(d.maxMahlMl, 0) + " ml je Mahlzeit" + (d.maxMahlManual ? " (manuell)" : " (25 ml/kg)") + ", der Rest zwischen den Mahlzeiten")
      : "Kein Flüssigkeitsziel – Körpergewicht eintragen oder ml/Tag vorgeben.";
    // MCT-Karte: bei 0 % nur die Prozent-Buttons, Erklärung und Etikettwerte erst ab 10 %.
    const more = document.getElementById("mct-more"), zh = document.getElementById("mct-zero-hint");
    if (more) more.hidden = !(d.mctShare > 0);
    if (zh) zh.hidden = d.mctShare > 0;
    const sc = document.getElementById("mct-share-ctl");
    if (sc) {
      sc.innerHTML = [0, 10, 20, 30, 50, 100].map(v =>
        '<button type="button" data-mcts="' + v + '"' + (Math.abs(d.mctShare - v / 100) < 0.005 ? ' class="active"' : "") + ">" + v + " %</button>").join("");
      sc.querySelectorAll("button[data-mcts]").forEach(b =>
        b.addEventListener("click", () => { state.settings.mctShare = num(b.dataset.mcts) / 100; save(); renderRezepte(); }));
    }
    document.querySelectorAll("#mct-mode-ctl button[data-mctmode]").forEach(b =>
      b.classList.toggle("active", b.dataset.mctmode === d.mctMode));
  }
  // Werte prüfen: alle in Rezepten verwendeten Lebensmittel mit Nährwerten je 100 g.
  function renderWerte() {
    const box = document.getElementById("werte-list"); if (!box) return;
    const used = {};
    allRecipes().forEach(r => r.items.forEach(it => { used[it.food] = true; }));
    const rows = Object.keys(used).sort((a, b) => a.localeCompare(b, "de")).map(name => {
      const f = lookup(name); if (!f) return "<tr><td>" + escapeHtml(name) + "</td><td colspan='5' class='ovr'>fehlt in der Liste</td></tr>";
      const ovr = f.kcal100 != null || name === "MCT-Öl C8+C10";
      return "<tr><td>" + escapeHtml(name) + (ovr ? " <span class='ovr'>Etikett</span>" : "") + "</td><td>" + fmt(f.eiweiss) + "</td><td>" + fmt(f.fett) + "</td><td>" + fmt(f.kh) + "</td><td>" + fmt(kcal100Of(f), 0) + "</td><td>" + escapeHtml(f.kategorie || "") + "</td></tr>";
    }).join("");
    box.innerHTML = "<table class='werte-table'><thead><tr><th>Lebensmittel</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>kcal</th><th>Kategorie</th></tr></thead><tbody>" + rows + "</tbody></table>";
  }
  // Backup: alles, was nur auf diesem Gerät liegt.
  function exportData() {
    const payload = { app: "hamham-keto", version: 1, exported: new Date().toISOString(), state: state };
    const json = JSON.stringify(payload, null, 1);
    const ta = document.getElementById("export-text"), det = document.getElementById("export-details");
    if (ta) ta.value = json;
    if (det) { det.hidden = false; det.open = true; }
    try {
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "hamham-keto-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {}
  }
  function importData(text) {
    let p;
    try { p = JSON.parse(text); } catch (e) { alert("Das ist kein gültiges Backup (JSON)."); return; }
    const st = p && p.state && p.state.settings ? p.state : (p && p.settings ? p : null);
    if (!st) { alert("Das Backup enthält keine HamHam-Keto-Daten."); return; }
    if (!confirm("Backup importieren? Vorhandene Vorgaben, eigene Rezepte, Favoriten und gemerkte Mengen werden ersetzt.")) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(st)); } catch (e) {}
    state = load(); rebuildFoodIndex(); renderRezepte(); showView(state.settings.view || "rezepte");
    alert("Backup importiert.");
  }

  function bindSettingsBar() {
    const map = { "set-kcal": "kcal", "set-kcalmin": "kcalMin", "set-fluid": "fluidMl", "set-maxmahl": "maxMahlMl", "set-mahlzeiten": "mahlzeiten", "set-eiweiss": "eiweiss", "set-weight": "weight", "set-mct-fett": "mctFett100", "set-mct-kcal": "mctKcal100", "set-verdunstung": "dampfVerdunstung" };
    Object.keys(map).forEach(id => {
      const elx = document.getElementById(id); if (!elx) return;
      elx.addEventListener("input", e => {
        state.settings[map[id]] = num(e.target.value); save();
        if (id.indexOf("set-mct") === 0) rebuildFoodIndex(); // Etikettwerte fürs MCT-Öl neu anwenden
        renderRezepte();
      });
    });
    document.getElementById("set-proteinmode").addEventListener("change", e => {
      state.settings.proteinPerKg = num(e.target.value); save(); renderRezepte();
    });
    document.getElementById("sort-select").addEventListener("change", e => {
      state.settings.sort = e.target.value; save(); renderRezepte();
    });
    const search = document.getElementById("recipe-search");
    if (search) search.addEventListener("input", () => renderRezepte());
    document.querySelectorAll(".tabbar button[data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
    const chip = document.getElementById("rx-chip");
    if (chip) chip.addEventListener("click", () => showView("vorgaben"));
    // Verhältnis wird händisch eingegeben – „1,8", „1,8:1" oder „1:1,5"; ungültige Zwischenstände (z. B. „1:") bleiben folgenlos.
    const ri = document.getElementById("set-ratio");
    if (ri) {
      ri.addEventListener("input", () => {
        const r = parseRatio(ri.value);
        if (r > 0 && Math.abs(r - num(state.settings.ratio)) > 1e-9) { state.settings.ratio = r; save(); renderRezepte(); }
      });
      ri.addEventListener("change", () => { ri.value = fmtTarget(num(state.settings.ratio)); });
    }
    document.querySelectorAll("#mct-mode-ctl button[data-mctmode]").forEach(b =>
      b.addEventListener("click", () => { state.settings.mctMode = b.dataset.mctmode; save(); renderRezepte(); }));
    document.querySelectorAll("#ketocal-ctl button[data-ketocal]").forEach(b =>
      b.addEventListener("click", () => setKetoPhase(b.dataset.ketocal)));
    document.querySelectorAll("#wasser-modus-ctl button[data-wmodus]").forEach(b =>
      b.addEventListener("click", () => { state.settings.wasserModus = b.dataset.wmodus; save(); renderRezepte(); }));
    const exp = document.getElementById("export-btn");
    if (exp) exp.addEventListener("click", exportData);
    const impF = document.getElementById("import-file");
    if (impF) impF.addEventListener("change", () => {
      const f = impF.files && impF.files[0]; if (!f) return;
      const rd = new FileReader(); rd.onload = () => importData(String(rd.result || "")); rd.readAsText(f); impF.value = "";
    });
    const impT = document.getElementById("import-text-btn");
    if (impT) impT.addEventListener("click", () => importData((document.getElementById("export-text") || {}).value || ""));
    const wd = document.querySelector("#werte-list");
    if (wd) wd.closest("details").addEventListener("toggle", function () { if (this.open) renderWerte(); });
  }
