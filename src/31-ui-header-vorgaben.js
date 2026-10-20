  /* ---------- Kopfzeile, Bereiche (Tabs), Vorgaben ---------- */
  const VIEWS = ["heute", "rezepte", "vorgaben"];
  const PAGE_TITLES = { heute: "Tagesplan", rezepte: "Rezepte", vorgaben: "Vorgaben" };
  function showView(name) {
    if (VIEWS.indexOf(name) === -1) name = "rezepte";
    state.settings.view = name; save();
    document.body.setAttribute("data-view", name);
    if (name !== "heute") document.body.classList.remove("heute-tight"); // enge Stufe gilt nur für Heute (Kopf bleibt überall gleich)
    if (typeof showVgPage === "function") showVgPage(null, true);
    VIEWS.forEach(v => {
      const sec = document.getElementById("view-" + v); if (sec) sec.hidden = v !== name;
    });
    document.querySelectorAll(".tabbar button[data-view], .side-nav button[data-view]").forEach(b => { b.classList.toggle("active", b.dataset.view === name); b.setAttribute("aria-current", b.dataset.view === name ? "page" : "false"); });
    const pt = document.getElementById("page-title"); if (pt) pt.textContent = PAGE_TITLES[name];
    const sh = document.getElementById("side-heute"); if (sh && name !== "heute") sh.hidden = true;
    if (name === "heute" && typeof planPick !== "undefined") planPick = null; // Panel zeigt wieder die nächste Mahlzeit
    if (name === "heute" && typeof renderHeute === "function") renderHeute();
    if (typeof syncDetailPanel === "function") syncDetailPanel(); // Desktop: Rezept-Panel in Rezepte und Tagesplan
    try { window.scrollTo(0, 0); } catch (e) {}
    if (typeof markChip === "function") markChip();
  }
  // Merkt sich, von wo die Pille in die Vorgaben geführt hat – ein zweiter Tipp führt zurück.
  let chipReturn = null;
  function markChip() {
    const chip = document.getElementById("rx-chip"); if (!chip) return;
    const back = (state.settings.view === "vorgaben") && !!chipReturn;
    chip.classList.toggle("back", back);
    chip.title = back ? "Zurück zu " + ({ heute: "Heute", rezepte: "Rezepte" }[chipReturn.view] || "vorher") : (chip.dataset.full ? chip.dataset.full + "\n" : "") + "Tippen öffnet die Vorgaben";
  }
  // Verordnung im Kopf: Pille „1,8 : 1“ und darunter „640 kcal · 800 ml“ (Mono). Die ausführliche Fassung
  // (kcal je Mahlzeit, MCT, Wassergaben laut Tagesplan) steht im aria-label und als Tooltip.
  function renderHeader(d) {
    if (typeof schedulePushSync === "function") schedulePushSync(); // Erinnerungen an geänderten Plan angleichen
    const chip = document.getElementById("rx-chip"); if (!chip) return;
    const l1 = fmtTarget(d.ratio) + " · " + fmt(d.kcalMahl, 0) + " kcal × " + d.mahl +
      (d.mctShare > 0 ? " · MCT " + Math.round(d.mctShare * 100) + " %" + (d.mctMode === "kalorien" ? " (Kalorien halten)" : "") : "");
    let l2 = "";
    if (d.fluidDay > 0) {
      // Wassergaben laut Zeitplan (offene Mahlzeiten geschätzt); ▲ wenn eine Gabe über der Höchstmenge liegt.
      const wg = waterGiftsText(d);
      l2 = fmt(d.fluidDay, 0) + " ml/Tag · Wasser zwischen den Mahlzeiten: " + (wg.wp.per > 0 ? (wg.est ? "ca. " : "") + wg.text : "keines nötig");
      if (wg.wp.over) l2 += " · ▲ zu viel auf einmal";
    }
    chip.innerHTML = '<span class="rx-pill">' + escapeHtml(fmtRx(d.ratio)) + '</span><span class="rx-sub">' + fmt(d.kcal, 0) + " kcal" + (d.fluidDay > 0 ? " · " + fmt(d.fluidDay, 0) + " ml" : "") + "</span>";
    chip.setAttribute("aria-label", l1 + (l2 ? " · " + l2 : ""));
    chip.dataset.full = l1 + (l2 ? "\n" + l2 : "");
    markChip();
    renderSideRx(d);
  }
  // Desktop: Verordnung in der linken Spalte als Wertetabelle (Verhältnis groß in Mono, darunter die Tageswerte)
  function renderSideRx(d) {
    const box = document.getElementById("side-rx"); if (!box) return;
    const row = (l, v) => '<div class="side-row"><span>' + l + '</span><b>' + escapeHtml(v) + '</b></div>';
    box.innerHTML = '<div class="side-rx-head"><span class="overline">Verordnung</span>' +
      '<button type="button" class="tlink" id="side-rx-edit" title="Verordnung in den Vorgaben ändern">Ändern</button></div>' +
      '<div class="side-ratio"><b>' + escapeHtml(fmtRx(d.ratio)) + '</b><span>Fett : Eiweiß + KH</span></div>' +
      row("Kalorien am Tag", fmt(d.kcal, 0) + " kcal") + row("je Mahlzeit", d.mahl + " × " + fmt(d.kcalMahl, 0)) +
      row("Eiweiß am Tag", fmt(d.eiweiss, 0) + " g") + row("Flüssigkeit am Tag", d.fluidDay > 0 ? fmt(d.fluidDay, 0) + " ml" : "kein Ziel") +
      '<span class="side-foot">' + (d.mctShare > 0 ? "MCT " + fmtNum(Math.round(d.mctShare * 1000) / 10) + " % · " + regelLabel(d) : "nur Rapsöl") + (d.weight > 0 ? " · " + fmt(d.weight, 1) + " kg" : "") + "</span>";
  }
  // Herkunft des Gewichts: die letzte Messung unter Wachstum (das Gewicht wird von dort übernommen)
  function weightSrcText() { const lw = typeof latestWeight === "function" ? latestWeight() : null; return lw && Math.abs(num(state.settings.weight) - lw.w) < 1e-9 ? "zuletzt gewogen " + fmtDay(lw.d) : "zuletzt gewogen"; }
  function regelLabel(d) { return d.mctMode === "kalorien" ? "Kalorien halten" : "Verhältnis halten"; }
  // MCT-Anteil in Worten (Verordnung › Bearbeiten) und gelber Hinweis, wenn die Flüssigkeit unter dem Richtwert liegt
  function mctMixText(d) {
    if (!(d.mctShare > 0)) return "derzeit kein MCT – alles Rapsöl";
    const pct = Math.round(d.mctShare * 1000) / 10;
    return d.mctShare >= 1 ? "nur MCT-Öl, kein Rapsöl" : fmtNum(pct) + " % MCT, " + fmtNum(Math.round((100 - pct) * 10) / 10) + " % Rapsöl";
  }
  function fluidLowText(d) { return "Flüssigkeit liegt unter dem Richtwert nach Gewicht (" + fmt(d.fluidAuto, 0) + " ml). Bitte mit dem Team abklären, ob das so passt."; }
  /* ---------- Vorgaben: Liste mit Unterseiten ----------
     Die Liste zeigt je Bereich eine Zusammenfassung; jede Zeile öffnet eine Unterseite („‹ Vorgaben“ zurück).
     Die Verordnung ist gesperrt, bis man „Bearbeiten“ tippt: Felder wirken sofort (die Kennzahlen rechnen mit),
     „Abbrechen“ stellt den Stand von vorher wieder her, „Speichern“ schließt die Felder (Meldung mit Rückgängig). */
  let vgPage = null, voEdit = false, voSnap = null;
  let voFluidBefore = null; // Tagesmenge beim Öffnen von „Bearbeiten“ (grau „vorher … ml“, wenn sie sich ändert)
  const VO_KEYS = ["ratio", "mahlzeiten", "weight", "kcal", "kcalMin", "proteinPerKg", "eiweiss", "fluidRatio", "maxDichte", "mctShare", "mctMode"];
  function showVgPage(name, quiet) {
    if (voEdit && name !== "verordnung") voFinish(true);
    // Desktop: Menü links bleibt stehen, rechts immer eine Unterseite (ohne Auswahl die Verordnung)
    vgPage = name || (isDesktop() ? "verordnung" : null);
    const list = document.getElementById("vg-list"); if (!list) return;
    list.hidden = !!vgPage;
    const cur = vgPage === "bedarf" ? "verordnung" : vgPage;
    list.querySelectorAll(".vg-row[data-vg]").forEach(r => { r.classList.toggle("active", r.dataset.vg === cur); r.setAttribute("aria-current", r.dataset.vg === cur ? "page" : "false"); });
    document.querySelectorAll("#view-vorgaben .vg-page").forEach(p => { p.hidden = p.dataset.vgpage !== vgPage; });
    document.body.classList.toggle("vg-sub", !!vgPage && state.settings.view === "vorgaben");
    if (!quiet) { try { window.scrollTo(0, 0); } catch (e) {} }
  }
  // Breite wechselt (Handy ↔ Desktop): am Desktop braucht die rechte Seite der Vorgaben eine Unterseite
  // Offene Fenster (Rezept, Editor) neu aufbauen – am Handy blättert man, am Desktop schaltet man Reiter um.
  function onLayoutChange() {
    if (isDesktop() && !vgPage) showVgPage(null, true);
    const dv = document.getElementById("detail-overlay");
    if (dv && !dv.hidden && !dv.closest(".rz-panel") && typeof renderDetail === "function") renderDetail();
    const cv = document.getElementById("compose-overlay");
    if (cv && !cv.hidden && typeof openCompose === "function") openCompose();
  }
  function voSnapshot() { const o = {}; VO_KEYS.forEach(k => { o[k] = Object.prototype.hasOwnProperty.call(state.settings, k) ? state.settings[k] : undefined; }); return o; }
  function voRestore(snap) { VO_KEYS.forEach(k => { if (snap[k] === undefined) delete state.settings[k]; else state.settings[k] = snap[k]; }); save(); renderRezepte(); }
  function voFinish(keep) {
    const snap = voSnap, changed = snap && JSON.stringify(voSnapshot()) !== JSON.stringify(snap);
    voEdit = false; voSnap = null; voFluidBefore = null;
    if (!keep && snap) voRestore(snap); else renderRezepte();
    if (keep && changed) showToast("Verordnung gespeichert", [["Rückgängig", () => voRestore(snap)]]);
  }
  function renderVgList(d) {
    if (typeof renderLebensmittel === "function") renderLebensmittel();
    const s = state.settings, put = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
    put("vgs-verordnung", fmtRx(d.ratio) + " · " + fmt(d.kcal, 0) + " kcal" + (d.fluidDay > 0 ? " · " + fmt(d.fluidDay, 0) + " ml" : "") +
      (d.mctShare > 0 ? " · MCT " + fmtNum(Math.round(d.mctShare * 1000) / 10) + " %" : ""));
    put("vgs-wachstum", growthSummary());
    const ks = kettleSettings();
    put("vgs-kueche", "Verdunstung " + fmt(num(d.dampfVerdunstung), 0) + " ml · Wasserkocher " + ks.steps.join("/") + " °C");
    renderKettleSettings();
    let syncOn = false; try { syncOn = typeof syncLoadMeta === "function" && !!syncLoadMeta().key; } catch (e) {}
    const bd = backupDays();
    put("vgs-app", [s.pushOn ? "Erinnerungen an" : "", syncOn ? "Abgleich an" : "", bd == null ? "noch kein Backup" : "Backup " + backupAgeText(bd)].filter(Boolean).join(" · "));
    renderBackup();
    // Verordnung: Ansicht (gesperrt) mit Herkunft der Werte; die Felder liegen in #vo-editbox
    const src = (id) => { const e = document.getElementById(id); return e ? e.textContent : ""; };
    const rows = [
      ["Verhältnis (Fett : Eiweiß + KH)", "", fmtRx(d.ratio)], // ohne Untertitel – die Seite heißt schon „Verordnung“
      ["Mahlzeiten pro Tag", "", String(d.mahl)],
      ["Körpergewicht", weightSrcText(), d.weight > 0 ? fmt(d.weight, 1) + " kg" : "—"],
      ["Kalorien pro Tag", src("src-kcal"), fmt(d.kcal, 0) + " kcal"],
      // Flüssigkeit hängt an den Kalorien (das Verhältnis steht nur beim Bearbeiten); darunter ggf. der gelbe Hinweis
      ["Flüssigkeit pro Tag", d.fluidRatio > 0 ? "wächst mit den Kalorien" : d.fluidAuto > 0 ? "Richtwert nach Gewicht" : "", d.fluidDay > 0 ? fmt(d.fluidDay, 0) + " ml" : "—",
        d.fluidLow ? '<div class="note attn fluid-low">' + escapeHtml(fluidLowText(d)) + "</div>" : ""],
      ["Energie je ml Mahlzeit", src("src-kcalml"), fmt(d.maxDichte, 1) + " kcal/ml"],
      ["Kalorien mindestens", src("src-kcalmin"), fmt(d.kcalMin, 0) + " kcal"],
      ["Eiweiß pro Tag", d.autoProtein ? (d.proteinPerKg === d.proteinStandard ? "Standard · " : "") + fmt(d.proteinPerKg, 1) + " g/kg" : "manuell", fmt(d.eiweiss, 0) + " g"],
      ["MCT-Anteil am Öl", d.mctShare > 0 ? (d.mctShare >= 1 ? "kein Rapsöl" : "Rest Rapsöl") + " · " + (d.mctMode === "kalorien" ? "Kalorien werden gehalten" : "Verhältnis wird gehalten") : "derzeit kein MCT – alles Rapsöl",
        fmtNum(Math.round(d.mctShare * 1000) / 10) + " %"],
    ];
    const vv = document.getElementById("vo-view");
    if (vv) vv.innerHTML = rows.map(r => '<div class="vo-row"><div class="vo-lbl"><span>' + r[0] + '</span>' + (r[1] ? '<span class="src">' + escapeHtml(r[1]) +
      (r[0] === "Körpergewicht" ? ' · <button type="button" class="tlink src-link" data-vg-go="wachstum">Wachstum ›</button>' : "") + "</span>" : "") + '</div><div class="vo-val">' + escapeHtml(r[2]) + "</div></div>" + (r[3] || "")).join("");
    const eb = document.getElementById("vo-editbox"); if (eb) eb.hidden = !voEdit;
    if (vv) vv.hidden = voEdit;
    const ed = document.getElementById("vo-edit"); if (ed) ed.hidden = voEdit;
  }
  function bindVgPages() {
    document.querySelectorAll("#view-vorgaben [data-vg]").forEach(b => b.addEventListener("click", () => showVgPage(b.dataset.vg)));
    // Links in Texten, die zu einer anderen Unterseite führen („Wachstum ›“ beim Körpergewicht)
    document.addEventListener("click", (e) => { const g = e.target.closest && e.target.closest("[data-vg-go]"); if (g) showVgPage(g.dataset.vgGo); });
    document.querySelectorAll("#view-vorgaben [data-vgback]").forEach(b => b.addEventListener("click", () => showVgPage(b.dataset.vgback === "list" ? null : b.dataset.vgback)));
    const ed = document.getElementById("vo-edit"), ca = document.getElementById("vo-cancel"), sv = document.getElementById("vo-save");
    if (ed) ed.addEventListener("click", () => { voSnap = voSnapshot(); voFluidBefore = derived().fluidDay; voEdit = true; renderRezepte(); const f = document.getElementById("set-ratio"); try { if (f) f.focus(); } catch (e) {} });
    if (ca) ca.addEventListener("click", () => voFinish(false));
    if (sv) sv.addEventListener("click", () => voFinish(true));
  }
  function renderVorgaben(d) {
    const s = state.settings;
    renderVgList(d);
    if (typeof renderWachstum === "function") renderWachstum();
    if (typeof renderPushCard === "function") renderPushCard();
    if (typeof renderSyncCard === "function") renderSyncCard();
    if (typeof renderBedarf === "function") renderBedarf(d);
    // Richtung des Verhältnisses klarstellen: Fett zuerst. „1,5“ = 1,5:1 (mehr Fett), „1:1,5“ = 0,67 (weniger Fett).
    // Die Warnung steht in der Zusammenfassung, nicht im Feldraster – dort darf sich nichts verschieben.
    const ratioWarn = d.ratio < 1
      ? '<div id="ratio-hint" class="note warn">▲ ' + fmtTarget(d.ratio) + " heißt nur " + fmt(d.ratio, 2) + " g Fett je 1 g Eiweiß+KH – <strong>weniger Fett als Eiweiß+KH</strong>, also unterhalb von 1:1. Das ist beim Ausschleichen möglich, bitte prüfen, ob die Verordnung wirklich so lautet.</div>"
      : "";
    // Zusammenfassung als Kennzahl-Kacheln: Bezeichnung, Wert, kurze Herkunft (Details im title).
    const fact = (k, label, value, sub, title) => '<div class="vg-fact" data-k="' + k + '"' + (title ? ' title="' + escapeHtml(title) + '"' : "") +
      "><small>" + label + "</small><b>" + value + "</b><span>" + sub + "</span></div>";
    const sum = document.getElementById("verordnung-summary");
    if (sum) {
      const kcalSrc = d.kcalManual ? "manuell" : d.kcalBasis === "krick" ? "Vorschlag nach Krick" : d.weight > 0 ? "Vorschlag 80 kcal/kg" : "Vorgabe ohne Gewicht";
      const minSrc = d.kcalMinManual ? "manuell" : d.kcalBereich ? "ESPGHAN 60 %" : d.weight > 0 ? "70 kcal/kg" : "85 % des Ziels";
      const facts = [
        fact("mahl", "pro Mahlzeit", fmt(d.kcalMahl, 0) + " kcal", fmt(d.kcal, 0) + " kcal/Tag ÷ " + d.mahl, fmt(d.kcal, 0) + " kcal/Tag (" + kcalSrc + ") ÷ " + d.mahl + " Mahlzeiten"),
        fact("min", "mindestens", fmt(d.kcalMinMahl, 0) + " kcal", "je Mahlzeit · " + fmt(d.kcalMin, 0) + " kcal/Tag", fmt(d.kcalMin, 0) + " kcal/Tag (" + minSrc + ")"),
        fact("eiweiss", "Eiweiß", fmt(d.eiweissMahl) + " g", "je Mahlzeit · " + (d.autoProtein ? fmt(d.eiweiss, 0) + " g/Tag" : "manuell"),
          d.autoProtein ? fmt(d.eiweiss, 0) + " g/Tag, " + fmt(d.proteinPerKg, 1) + " g/kg" + (d.proteinPerKg === d.proteinStandard ? " = Standard" : "") : "manuell vorgegeben")
      ];
      if (d.kcalBereich) facts.push(fact("bereich", "Bereich laut Schätzungen", fmt(d.kcalLoBd, 0) + "–" + fmt(d.kcalRefBd, 0), "kcal/Tag · ESPGHAN–FAO/WHO", "von der ESPGHAN-Faustregel (60 %) bis zum Bedarf gesunder Kinder (FAO/WHO) – siehe Bedarf schätzen"));
      else if (d.kcalRichtwert) facts.push(fact("bereich", "Korridor nach Gewicht", fmt(d.kcalMinAuto, 0) + "–" + fmt(d.kcalMaxAuto, 0), "kcal/Tag · 70–90 kcal/kg", "Richtwert nach Körpergewicht: 70–90 kcal/kg"));
      // Flüssigkeit: Wassergaben laut Tagesplan (Rest bis zur Tagesmenge) und der Richtwert nach Gewicht zum Vergleich
      if (d.fluidDay > 0) {
        const wg = waterGiftsText(d);
        facts.push(fact("gabe", "Wassergaben", wg.wp.per > 0 ? (wg.est ? "ca. " : "") + wg.text : "keine", wg.wp.per > 0 ? "zwischen den Mahlzeiten" : "derzeit nicht nötig",
          fmt(d.fluidDay, 0) + " ml/Tag abzüglich der Flüssigkeit in den Mahlzeiten"));
      }
      if (d.fluidAuto > 0) facts.push(fact("richtwert", "Richtwert Flüssigkeit", fmt(d.fluidAuto, 0) + " ml", "nach Gewicht · 100 ml/kg", "Holliday-Segar: 100 ml je kg bis 10 kg, darüber 50 ml je weiterem kg"));
      sum.innerHTML = ratioWarn + '<div class="vg-facts">' + facts.join("") + "</div>";
    }
    document.querySelectorAll("#mct-mode-ctl button[data-mctmode]").forEach(b =>
      b.classList.toggle("active", b.dataset.mctmode === d.mctMode));
    document.querySelectorAll("#theme-ctl button[data-theme]").forEach(b =>
      b.classList.toggle("active", b.dataset.theme === themeSetting()));
  }
  // Darstellung: „auto“ folgt dem Gerät (prefers-color-scheme), „light“/„dark“ erzwingen per data-theme am <html>.
  function themeSetting() { const t = state.settings.theme; return t === "light" || t === "dark" ? t : "auto"; }
  function applyTheme() {
    const t = themeSetting(), root = document.documentElement;
    if (t === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
    // Farbe der Statusleiste am Handy mitziehen (bei „auto“ entscheiden die media-Attribute der beiden Meta-Tags).
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
      if (t === "auto") { if (m.dataset.orig) m.setAttribute("content", m.dataset.orig); return; }
      if (!m.dataset.orig) m.dataset.orig = m.getAttribute("content");
      m.setAttribute("content", t === "dark" ? PALETTE_DARK.paper : PALETTE.paper);
    });
  }
  // Backup: alles, was nur auf diesem Gerät liegt. Am Handy über das Teilen-Menü (z. B. Synology Drive, Google Drive),
  // sonst als Download. Der Zeitpunkt (backupAt) wird abgeglichen – ein Backup auf einem der Geräte zählt für alle.
  async function exportData() {
    const payload = { app: "hamham-keto", version: 1, exported: new Date().toISOString(), state: state };
    const json = JSON.stringify(payload, null, 1), name = "hamham-keto-backup-" + todayIso() + ".json";
    const r = await saveFile(name, json, "application/json");
    if (!r) return; // abgebrochen (Teilen-Menü geschlossen)
    state.settings.backupAt = Date.now(); save(); renderRezepte();
    showToast(r === "geteilt" ? "Backup gesichert" : "Backup gespeichert: " + escapeHtml(name));
  }
  // Erinnerung ans Backup: nach backupRemind Tagen (Standard 28, 0 = nie); ohne bisheriges Backup erst, wenn es eigene Daten gibt
  function backupDays() { const a = num(state.settings.backupAt); return a > 0 ? Math.max(0, Math.floor((Date.now() - a) / 864e5)) : null; }
  function backupAgeText(d) { return d === 0 ? "heute" : d === 1 ? "gestern" : "vor " + d + " Tagen"; }
  function backupDue() {
    const s = state.settings, every = s.backupRemind == null ? 28 : num(s.backupRemind), d = backupDays();
    if (!(every > 0)) return false;
    if (d == null) return growthList().length > 0 || state.savedRecipes.length > 0 || state.customFoods.length > 0;
    return d >= every;
  }
  function renderBackup() {
    const d = backupDays(), due = backupDue();
    const note = document.getElementById("vg-backup");
    if (note) {
      note.hidden = !due;
      if (due) note.innerHTML = (d == null ? "Noch kein Backup gesichert." : "Letztes Backup " + backupAgeText(d) + ".") +
        ' <button type="button" class="tlink" data-vg-go="app">Jetzt sichern ›</button>';
    }
    const st = document.getElementById("backup-status");
    if (st) {
      st.className = "note " + (due ? "attn" : "info");
      st.textContent = d == null ? "Noch kein Backup gesichert." : "Letztes Backup " + backupAgeText(d) + " (" + new Date(num(state.settings.backupAt)).toLocaleDateString("de-AT") + ").";
    }
    const sel = document.getElementById("backup-remind");
    if (sel) sel.value = String(state.settings.backupRemind == null ? 28 : num(state.settings.backupRemind));
  }
  function importData(text) {
    let p;
    try { p = JSON.parse(text); } catch (e) { alert("Das ist kein gültiges Backup (JSON)."); return; }
    const st = p && p.state && p.state.settings ? p.state : (p && p.settings ? p : null);
    if (!st) { alert("Das Backup enthält keine HamHam-Keto-Daten."); return; }
    if (!confirm("Backup importieren? Vorhandene Vorgaben, eigene Rezepte, Favoriten und gemerkte Mengen werden ersetzt.")) return;
    // Was nur zu diesem Gerät gehört (Erinnerungen und deren Dienst-Adresse), nicht aus dem Backup übernehmen
    const keep = {}; ["pushOn", "pushUrl", "pushMeals", "pushWater", "pushLead"].forEach(k => { keep[k] = state.settings[k]; });
    state = load(JSON.stringify(st));
    Object.keys(keep).forEach(k => { if (keep[k] === undefined) delete state.settings[k]; else state.settings[k] = keep[k]; });
    rebuildFoodIndex(); migrateWaterMl(); migrateFluid();
    const stored = save(); renderRezepte(); showView(state.settings.view || "rezepte");
    alert(stored ? "Backup importiert." : "Backup übernommen – aber der Speicher dieses Browsers ist nicht beschreibbar (privates Fenster oder voll). Nach dem Schließen ist es wieder weg.");
  }

  function bindSettingsBar() {
    const map = { "set-kcal": "kcal", "set-kcalmin": "kcalMin", "set-eiweiss": "eiweiss", "set-weight": "weight", "set-mct-fett": "mctFett100", "set-mct-kcal": "mctKcal100", "set-verdunstung": "dampfVerdunstung" };
    Object.keys(map).forEach(id => {
      const elx = document.getElementById(id); if (!elx) return;
      elx.addEventListener("input", e => {
        let v = num(e.target.value);
        // Vorschlags-Felder: nur ein leeres Feld heißt wieder „automatisch“. Ein eingetippter Wert bleibt fest,
        // auch wenn er zufällig dem Vorschlag entspricht (sonst würde er sich beim Ändern des Gewichts still mitändern).
        const isAutoField = id === "set-kcal" || id === "set-kcalmin" || id === "set-mct-fett" || id === "set-mct-kcal" || id === "set-verdunstung";
        if (isAutoField && e.target.value.trim() === "") v = "";
        state.settings[map[id]] = v; save();
        if (id.indexOf("set-mct") === 0) rebuildFoodIndex(); // Etikettwerte fürs MCT-Öl neu anwenden
        renderRezepte();
      });
    });
    // Zurücksetzen auf den Vorschlag: eigener Wert wird gelöscht (bzw. Eiweiß auf den Standard gestellt)
    document.addEventListener("click", e => {
      const b = e.target.closest && e.target.closest("button[data-reset]"); if (!b) return;
      const k = b.dataset.reset;
      state.settings[k] = k === "proteinPerKg" ? derived().proteinStandard : "";
      save(); renderRezepte();
    });
    // Gewicht ist ein Textfeld (Dezimaltastatur am Handy, Komma erlaubt): beim Verlassen sauber formatieren.
    const wi = document.getElementById("set-weight");
    if (wi) wi.addEventListener("change", () => { wi.value = fmtNum(num(wi.value) > 0 ? num(wi.value) : ""); });
    document.getElementById("set-proteinmode").addEventListener("change", e => {
      state.settings.proteinPerKg = num(e.target.value); save(); renderRezepte();
    });
    document.getElementById("sort-select").addEventListener("change", e => {
      state.settings.sort = e.target.value; save(); renderRezepte();
    });
    const search = document.getElementById("recipe-search");
    if (search) search.addEventListener("input", () => renderRezepte());
    // × im Suchfeld (bzw. Escape): Suchbegriff löschen, Fokus bleibt im Feld
    const clearSearch = () => { if (!search || !search.value) return; search.value = ""; renderRezepte(); try { search.focus(); } catch (e) {} };
    const sx = document.getElementById("search-clear");
    if (sx) sx.addEventListener("click", clearSearch);
    if (search) search.addEventListener("keydown", (e) => { if (e.key === "Escape" && search.value) { e.preventDefault(); clearSearch(); } });
    // „nur Diätologie“ und „ohne KetoCal“ sind Chips in der Gruppenzeile (renderRezepte bindet sie bei jedem Aufbau).
    document.querySelectorAll(".tabbar button[data-view], .side-nav button[data-view]").forEach(b => b.addEventListener("click", () => { chipReturn = null; showView(b.dataset.view); }));
    // Desktop: „Ändern“ in der Verordnung der linken Spalte öffnet Vorgaben → Verordnung
    const side = document.getElementById("side-rx");
    if (side) side.addEventListener("click", (e) => { if (!e.target.closest("#side-rx-edit")) return; chipReturn = null; showView("vorgaben"); showVgPage("verordnung"); });
    // Pille: öffnet die Vorgaben; ein zweiter Tipp führt dorthin zurück, wo man war (inkl. Scrollposition).
    const chip = document.getElementById("rx-chip");
    if (chip) chip.addEventListener("click", () => {
      const cur = state.settings.view || "rezepte";
      if (cur === "vorgaben" && chipReturn) {
        const back = chipReturn; chipReturn = null;
        showView(back.view);
        try { window.scrollTo(0, back.y); } catch (e) {}
      } else if (cur !== "vorgaben") {
        chipReturn = { view: cur, y: window.pageYOffset || document.documentElement.scrollTop || 0 };
        showView("vorgaben"); showVgPage("verordnung");
      }
      markChip();
    });
    // Verhältnis wird händisch eingegeben – „1,8", „1,8:1" oder „1:1,5"; ungültige Zwischenstände (z. B. „1:") bleiben folgenlos.
    const ri = document.getElementById("set-ratio");
    if (ri) {
      ri.addEventListener("input", () => {
        const r = parseRatio(ri.value);
        if (r > 0 && Math.abs(r - num(state.settings.ratio)) > 1e-9) { state.settings.ratio = r; save(); renderRezepte(); }
      });
      ri.addEventListener("change", () => { ri.value = fmtRatioNum(num(state.settings.ratio)); });
    }
    document.querySelectorAll("#mct-mode-ctl button[data-mctmode]").forEach(b =>
      b.addEventListener("click", () => { state.settings.mctMode = b.dataset.mctmode; save(); renderRezepte(); }));
    document.querySelectorAll("#theme-ctl button[data-theme]").forEach(b =>
      b.addEventListener("click", () => { state.settings.theme = b.dataset.theme; save(); applyTheme(); renderRezepte(); }));
    // Flüssigkeit: Verhältnis Kalorien : Flüssigkeit („1,25“ oder „1:1,25“) oder Tagesmenge in ml – gespeichert wird
    // immer das Verhältnis (ml je kcal), damit die Menge mit den Kalorien mitwächst.
    const fr = document.getElementById("set-fluidratio");
    if (fr) {
      fr.addEventListener("input", () => {
        const t = String(fr.value).replace(/\s/g, ""), part = t.indexOf(":") >= 0 ? t.slice(t.indexOf(":") + 1) : t;
        const v = parseFloat(part.replace(",", "."));
        if (isFinite(v) && v > 0 && v <= 5) { state.settings.fluidRatio = v; save(); renderRezepte(); }
      });
      fr.addEventListener("change", () => { fr.value = fmtNum(Math.round(num(state.settings.fluidRatio) * 100) / 100); });
    }
    // „Richtwert …“: Tagesmenge auf den Richtwert nach Gewicht setzen – als Verhältnis, wächst danach wieder mit
    const rf = document.getElementById("reset-fluidday");
    if (rf) rf.addEventListener("click", () => {
      const d = derived(); if (!(d.fluidAuto > 0 && d.kcal > 0)) return;
      state.settings.fluidRatio = d.fluidAuto / d.kcal; save(); renderRezepte();
    });
    const fd = document.getElementById("set-fluidday");
    if (fd) fd.addEventListener("input", () => {
      const v = num(fd.value), kc = derived().kcal;
      if (v > 0 && kc > 0) { state.settings.fluidRatio = v / kc; save(); renderRezepte(); }
    });
    // Energie je ml Mahlzeit (Komma erlaubt, 0,5–3); leer = Vorschlag
    const dm = document.getElementById("set-kcalml");
    if (dm) {
      dm.addEventListener("input", () => {
        const t = dm.value.trim(), v = parseFloat(t.replace(",", "."));
        if (t === "") state.settings.maxDichte = "";
        else if (isFinite(v) && v >= 0.5 && v <= 3) state.settings.maxDichte = v;
        else return;
        save(); renderRezepte();
      });
      dm.addEventListener("change", () => { const d = derived(); dm.value = d.dichteManual ? fmtNum(d.maxDichte) : ""; });
    }
    // MCT-Anteil in Prozent (0–100, Komma erlaubt)
    const mi = document.getElementById("set-mctshare");
    if (mi) {
      mi.addEventListener("input", () => {
        const v = parseFloat(String(mi.value).replace(",", "."));
        if (mi.value.trim() === "") state.settings.mctShare = 0;
        else if (isFinite(v) && v >= 0 && v <= 100) state.settings.mctShare = Math.round(v * 10) / 1000;
        else return;
        save(); renderRezepte();
      });
      mi.addEventListener("change", () => { mi.value = fmtNum(Math.round(num(state.settings.mctShare) * 1000) / 10); });
    }
    document.querySelectorAll("#mahlzeiten-ctl button[data-mahl]").forEach(b =>
      b.addEventListener("click", () => { state.settings.mahlzeiten = num(b.dataset.mahl); save(); renderRezepte(); }));
    const exp = document.getElementById("export-btn");
    if (exp) exp.addEventListener("click", exportData);
    const rem = document.getElementById("backup-remind");
    if (rem) rem.addEventListener("change", () => { state.settings.backupRemind = num(rem.value); save(); renderRezepte(); });
    const impF = document.getElementById("import-file");
    if (impF) impF.addEventListener("change", () => {
      const f = impF.files && impF.files[0]; if (!f) return;
      const rd = new FileReader(); rd.onload = () => importData(String(rd.result || "")); rd.readAsText(f); impF.value = "";
    });
  }
