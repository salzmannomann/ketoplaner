  /* ---------- Lebensmittel und Rezepte (Vorgaben) ----------
     Eigene Lebensmittel: Name, Gruppe und Werte je 100 g vom Etikett (kcal und Wasser freiwillig), auf Wunsch auch als
     Fett zum Ausgleich im Editor. Löschen geht nur, solange kein eigenes Rezept (und nicht der Entwurf im Editor) das
     Lebensmittel verwendet – sonst rechnete ein Rezept plötzlich ohne die Zutat. Umbenennen zieht die Rezepte mit.
     Dazu die Austauschmengen für den Fleisch- und Fisch-Tausch (änderbar) und die Liste der
     ausgeblendeten Standard-Rezepte zum Zurückholen. */
  let cfEdit = null; // null = Formular zu, "" = neues Lebensmittel, sonst Name des bearbeiteten
  function foodCategories() {
    const cats = [];
    FOODS_DEFAULT.forEach(f => { if (cats.indexOf(f.kategorie) === -1) cats.push(f.kategorie); });
    return cats.sort((a, b) => a.localeCompare(b, "de")).concat(["Eigene"]);
  }
  function cfSummary(f) {
    return "E " + fmt(f.eiweiss) + " · F " + fmt(f.fett) + " · KH " + fmt(f.kh) + " g · " + fmt(kcal100Of(f), 0) + " kcal";
  }
  // Wo wird ein Lebensmittel verwendet? (eigene Rezepte und der Entwurf im Editor)
  function foodUses(name) {
    const uses = state.savedRecipes.filter(r => r.items.some(it => it.food === name)).map(r => "„" + r.name + "“");
    const c = state.compose || {};
    if ((c.items || []).some(it => it.food === name) || (c.fats || []).some(ft => ft.food === name)) uses.push("dem Entwurf im Editor");
    return uses;
  }
  function renderLebensmittel() {
    const cnt = (state.customFoods || []).length, hid = (state.hiddenRecipes || []).length;
    const sum = document.getElementById("vgs-lebensmittel");
    const chg = changedFoods().length;
    if (sum) sum.textContent = (cnt ? cnt + " eigene" + (cnt === 1 ? "s Lebensmittel" : " Lebensmittel") : "keine eigenen Lebensmittel") + (chg ? " · " + chg + (chg === 1 ? " Wert" : " Werte") + " geändert" : "") + (hid ? " · " + hid + " Rezept" + (hid === 1 ? "" : "e") + " ausgeblendet" : "");
    const list = document.getElementById("cf-list"); if (!list) return;
    list.innerHTML = cnt ? state.customFoods.slice().sort((a, b) => a.name.localeCompare(b.name, "de")).map(f =>
      '<button type="button" class="cf-row" data-cf="' + escapeHtml(f.name) + '"><span class="cf-txt"><span class="cf-n">' + escapeHtml(f.name) + '</span>' +
      '<span class="cf-v">' + cfSummary(f) + '</span></span><span class="cf-tag">' + escapeHtml(f.kategorie) + (f.fat ? " · Fett" : "") + (f.swap ? " · Tausch" : "") + '</span></button>').join("")
      : '<p class="cf-empty">Noch keine eigenen Lebensmittel.</p>';
    renderSwapTable();
    renderWerte();
    const hl = document.getElementById("hidden-list");
    if (hl) {
      const recs = (state.hiddenRecipes || []).map(k => ({ k, r: recipeByKey(k) })).filter(x => x.r);
      hl.innerHTML = recs.length ? recs.map(x => '<div class="cf-row" role="group"><span class="cf-txt"><span class="cf-n">' + displayHtml(x.r) + '</span><span class="cf-g">' + escapeHtml(groupLabel(x.r)) + '</span></span>' +
        '<button type="button" class="tlink" data-unhide="' + escapeHtml(x.k) + '">Einblenden</button></div>').join("")
        : '<p class="cf-empty">Keine. Ein Standard-Rezept blendest du in der Rezeptliste aus: Rezept lange drücken (am Computer: Rechtsklick) → „Ausblenden“.</p>';
    }
  }
  function cfMsg(text, warn) {
    const m = document.getElementById("cf-msg"); if (!m) return;
    m.hidden = !text; m.className = "note " + (warn ? "warn" : "info"); m.textContent = text || "";
  }
  function cfOpen(name) {
    cfEdit = name || "";
    const f = name ? state.customFoods.find(x => x.name === name) : null;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    const kat = document.getElementById("cf-kat");
    if (kat && !kat.options.length) foodCategories().forEach(c => kat.appendChild(el("option", { value: c }, c)));
    set("cf-name", f ? f.name : ""); set("cf-kat", f ? f.kategorie : "Eigene");
    set("cf-eiweiss", f ? fmtNum(f.eiweiss) : ""); set("cf-fett", f ? fmtNum(f.fett) : ""); set("cf-kh", f ? fmtNum(f.kh) : "");
    set("cf-kcal", f && f.kcal100 != null ? fmtNum(f.kcal100) : ""); set("cf-wasser", f && f.wasser != null ? fmtNum(f.wasser) : "");
    const fat = document.getElementById("cf-fat"); if (fat) fat.checked = !!(f && f.fat);
    set("cf-swap", f && f.swap ? f.swap : ""); set("cf-swapg", f && f.swapGrams ? fmtNum(f.swapGrams) : "");
    document.getElementById("cf-form").hidden = false; document.getElementById("cf-add").hidden = true;
    document.getElementById("cf-del").hidden = !f;
    cfMsg(""); cfKcalHint(); cfSwapHint();
    const n = document.getElementById("cf-name"); if (n && !f) try { n.focus({ preventScroll: true }); } catch (e) {}
    try { document.getElementById("cf-form").scrollIntoView({ block: "nearest" }); } catch (e) {}
  }
  function cfClose() {
    cfEdit = null;
    const fm = document.getElementById("cf-form"); if (fm) fm.hidden = true;
    const ad = document.getElementById("cf-add"); if (ad) ad.hidden = false;
  }
  // Platzhalter für kcal: was aus Eiweiß, Fett und KH herauskäme
  function cfKcalHint() {
    const g = (id) => num((document.getElementById(id) || {}).value);
    const k = document.getElementById("cf-kcal"); if (k) k.placeholder = fmt(4 * g("cf-eiweiss") + 9 * g("cf-fett") + 4 * g("cf-kh"), 0);
  }
  // Tausch-Feld nur bei „bei Fleisch/Fisch“; Bezug je Gruppe (20 g Huhn bzw. 20 g Seelachs),
  // Platzhalter = Menge mit gleich viel Eiweiß wie die Bezugsgröße
  function cfSwapHint() {
    const sw = document.getElementById("cf-swap"), row = document.getElementById("cf-swapg-row"), inp = document.getElementById("cf-swapg");
    if (!sw || !row || !inp) return;
    row.hidden = !sw.value;
    const r = swapRef(sw.value), lbl = document.getElementById("cf-swapg-lbl");
    if (r && lbl) lbl.textContent = "Entspricht " + r.grams + " g " + r.label;
    const e = num((document.getElementById("cf-eiweiss") || {}).value), ref = r && lookup(r.food);
    inp.placeholder = e > 0 && ref ? fmt(Math.round(r.grams * ref.eiweiss / e), 0) : "";
  }
  function cfSave() {
    const val = (id) => ((document.getElementById(id) || {}).value || "").trim();
    const name = val("cf-name").replace(/\s+/g, " ");
    const nums = { eiweiss: val("cf-eiweiss"), fett: val("cf-fett"), kh: val("cf-kh") };
    if (!name) { cfMsg("Bitte einen Namen eintragen.", true); return; }
    const clash = FOODS_DEFAULT.some(f => f.name.toLowerCase() === name.toLowerCase()) ||
      state.customFoods.some(f => f.name.toLowerCase() === name.toLowerCase() && f.name !== cfEdit);
    if (clash) { cfMsg("„" + name + "“ gibt es schon – bitte einen anderen Namen wählen.", true); return; }
    const bad = ["eiweiss", "fett", "kh"].filter(k => nums[k] !== "" && !/^\d+([.,]\d+)?$/.test(nums[k]));
    if (bad.length || [val("cf-kcal"), val("cf-wasser"), val("cf-swapg")].some(v => v !== "" && !/^\d+([.,]\d+)?$/.test(v))) { cfMsg("Bitte nur Zahlen eintragen (z. B. 2,5).", true); return; }
    const f = { name, kategorie: val("cf-kat") || "Eigene", eiweiss: num(nums.eiweiss), fett: num(nums.fett), kh: num(nums.kh), fat: !!(document.getElementById("cf-fat") || {}).checked };
    if (f.eiweiss + f.fett + f.kh > 100.05) { cfMsg("Eiweiß, Fett und Kohlenhydrate zusammen können nicht mehr als 100 g je 100 g sein.", true); return; }
    if (f.eiweiss + f.fett + f.kh === 0 && !val("cf-kcal")) { cfMsg("Bitte mindestens einen Nährwert eintragen.", true); return; }
    if (val("cf-kcal") !== "" && num(val("cf-kcal")) > 0) f.kcal100 = num(val("cf-kcal"));
    if (val("cf-wasser") !== "") f.wasser = Math.min(100, num(val("cf-wasser")));
    if (val("cf-swap") === "fleisch" || val("cf-swap") === "fisch") {
      const r = swapRef(val("cf-swap"));
      if (!(f.eiweiss > 0) && !(num(val("cf-swapg")) > 0)) { cfMsg("Für den Tausch braucht es Eiweiß oder eine Menge, die " + r.grams + " g " + r.label + " entspricht.", true); return; }
      f.swap = val("cf-swap"); if (num(val("cf-swapg")) > 0) f.swapGrams = num(val("cf-swapg"));
    }
    const old = cfEdit;
    if (old) {
      const i = state.customFoods.findIndex(x => x.name === old);
      if (i !== -1) state.customFoods[i] = f; else state.customFoods.push(f);
      // Umbenannt: eigene Rezepte und den Entwurf im Editor mitziehen
      if (old !== name) {
        state.savedRecipes.forEach(r => r.items.forEach(it => { if (it.food === old) it.food = name; }));
        const c = state.compose || {};
        (c.items || []).forEach(it => { if (it.food === old) it.food = name; });
        (c.fats || []).forEach(ft => { if (ft.food === old) ft.food = name; });
      }
    } else state.customFoods.push(f);
    cfClose(); save(); rebuildFoodIndex(); renderRezepte();
    showToast("„" + escapeHtml(name) + "“ gespeichert");
  }
  function cfDelete() {
    const name = cfEdit; if (!name) return;
    const uses = foodUses(name);
    if (uses.length) { cfMsg("Wird in " + uses.join(", ") + " verwendet – dort zuerst ersetzen oder das Rezept löschen, dann lässt es sich löschen.", false); return; }
    const i = state.customFoods.findIndex(x => x.name === name); if (i === -1) return;
    const f = state.customFoods.splice(i, 1)[0];
    cfClose(); save(); rebuildFoodIndex(); renderRezepte();
    showToast("„" + escapeHtml(name) + "“ gelöscht", [["Rückgängig", () => { state.customFoods.splice(Math.min(i, state.customFoods.length), 0, f); save(); rebuildFoodIndex(); renderRezepte(); }]]);
  }

  /* ---------- Austauschmengen (Fleisch- und Fisch-Tausch) ---------- */
  const SWAP_SRC_TXT = { diaet: "laut Diätologie", eiweiss: "nach Eiweiß berechnet", eigen: "eigener Wert" };
  function swapDefault(key) {
    const it = swapItem(key); if (!it) return null;
    if (key === SWAP_GROUPS[it.group].ref) return { grams: SWAP_GROUPS[it.group].refGrams, src: "ref" };
    if (!it.custom && it.grams) return { grams: it.grams, src: "diaet" };
    const g = swapProteinGrams(it.food, it.group); return g ? { grams: g, src: "eiweiss" } : null;
  }
  function renderSwapTable() {
    const box = document.getElementById("swap-table"); if (!box) return;
    if (box.contains(document.activeElement)) return; // nicht unter dem Finger neu aufbauen
    box.innerHTML = Object.keys(SWAP_GROUPS).map(g => {
      const its = swapItems(g), r = swapRef(g);
      // Kopf wie eine Tabelle: Gruppe links, über den Feldern die Bezugsgröße („≙ 20 g Huhn“ bzw. „≙ 20 g Seelachs“)
      return '<div class="swap-head"><span>' + SWAP_GROUPS[g].label + '</span><span>≙ ' + r.grams + " g " + escapeHtml(r.label) + "</span></div>" + Object.keys(its).map(k => {
        const eq = swapEquiv(k), def = swapDefault(k); if (!eq || !def) return "";
        // Bezugsgröße: feste Zeile ohne Eingabefeld
        if (k === r.key) return '<div class="swap-row ref"><span class="sw-l"><span class="sw-n">' + escapeHtml(its[k].label) + '</span><span class="sw-s">' + escapeHtml(its[k].food) + ' · Bezugsgröße</span></span>' +
          '<b class="sw-ref">' + r.grams + '</b><span class="unit">g</span></div>';
        return '<div class="swap-row"><span class="sw-l"><span class="sw-n">' + escapeHtml(its[k].label) + (its[k].custom ? " · eigenes" : "") + '</span>' +
          '<span class="sw-s">' + (its[k].custom || its[k].label === its[k].food ? "" : escapeHtml(its[k].food) + " · ") + SWAP_SRC_TXT[eq.src] + "</span></span>" +
          (eq.src === "eigen" ? '<button type="button" class="tlink" data-swreset="' + escapeHtml(k) + '" title="zurück auf ' + fmt(def.grams, 0) + ' g">↺</button>' : "") +
          '<input class="num-input" type="text" inputmode="decimal" data-swap="' + escapeHtml(k) + '" aria-label="' + escapeHtml(its[k].label) + ' in g, entspricht ' + r.grams + ' g ' + escapeHtml(r.label) + '" placeholder="' + fmt(def.grams, 0) + '" value="' + (eq.src === "eigen" ? fmtNum(eq.grams) : "") + '" />' +
          '<span class="unit">g</span></div>';
      }).join("");
    }).join("");
  }
  // Eigener Wert: bei festen Sorten in den Einstellungen (gleicht mit ab), bei eigenen Lebensmitteln am Lebensmittel
  function setSwapGrams(key, v) {
    const it = swapItem(key); if (!it) return;
    if (it.custom) {
      const cf = state.customFoods.find(f => "cf:" + f.name === key); if (!cf) return;
      if (v > 0) cf.swapGrams = v; else delete cf.swapGrams;
    } else {
      const m = Object.assign({}, state.settings.swapGrams || {});
      if (v > 0) m[key] = v; else delete m[key];
      if (Object.keys(m).length) state.settings.swapGrams = m; else delete state.settings.swapGrams;
    }
    save(); renderRezepte();
    const box = document.getElementById("swap-table"); if (box && box.contains(document.activeElement)) document.activeElement.blur();
    renderSwapTable();
  }
  /* ---------- Rezepte ausblenden (Standard) und löschen (eigene), jeweils mit Rückgängig ---------- */
  function isHidden(rec) { return !rec.custom && (state.hiddenRecipes || []).indexOf(recipeKey(rec)) !== -1; }
  function hideRecipe(rec) {
    const k = recipeKey(rec); if (!state.hiddenRecipes) state.hiddenRecipes = [];
    if (state.hiddenRecipes.indexOf(k) === -1) state.hiddenRecipes.push(k);
    save(); renderRezepte();
    showToast("„" + escapeHtml(displayText(rec)) + "“ ausgeblendet", [["Rückgängig", () => unhideRecipe(k)]]);
  }
  function unhideRecipe(k) { state.hiddenRecipes = (state.hiddenRecipes || []).filter(x => x !== k); save(); renderRezepte(); }
  function deleteCustomRecipe(rec) {
    // Alles, was am Rezept hängt, merken – „Rückgängig“ stellt es genau so wieder her
    const snap = JSON.stringify({ savedRecipes: state.savedRecipes, favorites: state.favorites, portion: state.portion, water: state.water, scales: state.scales, dayPlan: state.dayPlan, editKey: state.compose ? state.compose.editKey : null });
    state.savedRecipes = state.savedRecipes.filter(s => s.key !== rec.key);
    const fi = state.favorites.indexOf(rec.key); if (fi !== -1) state.favorites.splice(fi, 1);
    // Gemerkte Mengen, Plätze im Tagesplan und den Bezug im Editor mit aufräumen
    const fk = familyKey(rec);
    [state.portion, state.water, state.scales].forEach(m => { if (m) { delete m[fk]; delete m[rec.key]; } });
    state.dayPlan.forEach((sl, i) => { if (sl && sl.key === rec.key) state.dayPlan[i] = { key: null }; });
    if (state.compose && state.compose.editKey === rec.key) state.compose.editKey = null;
    save(); renderRezepte();
    showToast("„" + escapeHtml(displayText(rec)) + "“ gelöscht", [["Rückgängig", () => {
      const s = JSON.parse(snap);
      ["savedRecipes", "favorites", "portion", "water", "scales", "dayPlan"].forEach(k => { state[k] = s[k]; });
      if (state.compose) state.compose.editKey = s.editKey;
      save(); renderRezepte();
    }]]);
  }
  // Kurzmenü als Blatt von unten (am Desktop mittig): Titel, Aktionen, „Abbrechen“
  function openActionSheet(title, sub, actions) {
    let ov = document.getElementById("action-overlay");
    if (!ov) {
      ov = el("div", { id: "action-overlay", class: "overlay", role: "dialog", "aria-modal": "true", "aria-label": "Aktionen" });
      ov.hidden = true;
      document.body.appendChild(ov);
      // Tipp auf den Hintergrund schließt – aber nur, wenn die Berührung dort begann (das Loslassen nach dem langen
      // Drücken landet sonst als Klick auf dem gerade geöffneten Hintergrund)
      let downOnBg = false;
      ov.addEventListener("pointerdown", (e) => { downOnBg = e.target === ov; });
      ov.addEventListener("click", (e) => { if (e.target === ov && downOnBg) closeActionSheet(); downOnBg = false; });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !ov.hidden && topLayer() === "action-overlay") closeActionSheet(); });
    }
    ov.innerHTML = '<div class="overlay-card"><div class="sheet-grip" aria-hidden="true"></div><p class="act-title">' + title + '</p>' + (sub ? '<p class="act-sub">' + sub + '</p>' : "") +
      actions.map((a, i) => '<button type="button" class="act-btn' + (a.danger ? " danger" : "") + '" data-act="' + i + '">' + a.label + "</button>").join("") +
      '<button type="button" class="btn outline act-cancel">Abbrechen</button></div>';
    ov.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => { const a = actions[num(b.dataset.act)]; closeActionSheet(); a.run(); }));
    ov.querySelector(".act-cancel").addEventListener("click", closeActionSheet);
    ov.hidden = false; modalOpen("action");
  }
  function closeActionSheet() {
    const ov = document.getElementById("action-overlay"); if (!ov || ov.hidden) return;
    ov.hidden = true; modalClose("action");
  }
  function recipeActions(rec) {
    if (rec.custom) openActionSheet(displayHtml(rec), "Eigenes Rezept", [
      { label: "Rezept löschen", danger: true, run: () => deleteCustomRecipe(rec) },
    ]);
    else openActionSheet(displayHtml(rec), "Standard-Rezept – ausgeblendete Rezepte holst du unter Vorgaben › Lebensmittel und Rezepte zurück.", [
      { label: "Ausblenden", run: () => hideRecipe(rec) },
    ]);
  }
  // Rezeptliste: lange drücken (Finger, 0,5 s) oder Rechtsklick öffnet das Kurzmenü. Der Wisch für den Gruppenwechsel
  // bleibt: jede Bewegung vor Ablauf der Haltezeit bricht ab. Nach dem Halten öffnet sich das Rezept nicht.
  function bindRecipeLongPress() {
    const list = document.getElementById("recipe-list"); if (!list || list.dataset.lp) return;
    list.dataset.lp = "1";
    let lp = null, swallow = false;
    list.addEventListener("pointerdown", (e) => {
      swallow = false;
      if (e.pointerType === "mouse") return;
      const tile = e.target.closest(".tile"); if (!tile || !tile._rec || e.target.closest(".favbtn")) return;
      lp = { id: e.pointerId, x: e.clientX, y: e.clientY, tile };
      lp.timer = setTimeout(() => { const t = lp && lp.tile; lp = null; if (!t || !t.isConnected) return; swallow = true; try { if (navigator.vibrate) navigator.vibrate(10); } catch (e2) {} recipeActions(t._rec); }, 500);
    });
    const stop = (e) => { if (lp && (!e || e.pointerId === lp.id)) { clearTimeout(lp.timer); lp = null; } };
    list.addEventListener("pointermove", (e) => { if (lp && e.pointerId === lp.id && (Math.abs(e.clientX - lp.x) > 8 || Math.abs(e.clientY - lp.y) > 8)) stop(e); });
    list.addEventListener("pointerup", stop);
    list.addEventListener("pointercancel", stop);
    list.addEventListener("contextmenu", (e) => {
      const tile = e.target.closest(".tile"); if (!tile || !tile._rec) return;
      e.preventDefault();
      if (swallow) return; // Finger: Menü kam schon über das Halten
      recipeActions(tile._rec);
    });
    list.addEventListener("click", (e) => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }
  function bindLebensmittel() {
    const add = document.getElementById("cf-add"); if (!add) return;
    add.addEventListener("click", () => cfOpen(""));
    document.getElementById("cf-list").addEventListener("click", (e) => { const b = e.target.closest("[data-cf]"); if (b) cfOpen(b.dataset.cf); });
    document.getElementById("cf-save").addEventListener("click", cfSave);
    document.getElementById("cf-cancel").addEventListener("click", cfClose);
    document.getElementById("cf-del").addEventListener("click", cfDelete);
    ["cf-eiweiss", "cf-fett", "cf-kh"].forEach(id => document.getElementById(id).addEventListener("input", () => { cfKcalHint(); cfSwapHint(); }));
    document.getElementById("cf-swap").addEventListener("change", cfSwapHint);
    const st = document.getElementById("swap-table");
    st.addEventListener("change", (e) => {
      const i = e.target.closest("[data-swap]"); if (!i) return;
      const v = i.value.trim();
      if (v !== "" && !/^\d+([.,]\d+)?$/.test(v)) { i.value = ""; showToast("Bitte eine Zahl in Gramm eintragen."); return; }
      setSwapGrams(i.dataset.swap, v === "" ? 0 : num(v));
    });
    st.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest("[data-swap]")) e.target.blur(); });
    st.addEventListener("click", (e) => { const b = e.target.closest("[data-swreset]"); if (b) setSwapGrams(b.dataset.swreset, 0); });
    document.getElementById("cf-form").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") { e.preventDefault(); cfSave(); } });
    const hl = document.getElementById("hidden-list");
    if (hl) hl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-unhide]"); if (!b) return;
      const r = recipeByKey(b.dataset.unhide); unhideRecipe(b.dataset.unhide);
      if (r) showToast("„" + escapeHtml(displayText(r)) + "“ wieder sichtbar");
    });
    bindRecipeLongPress();
    bindWerte();
    renderLebensmittel();
  }

  /* ---------- Werte prüfen: Nährwerte je 100 g, direkt in der Tabelle änderbar ----------
     Tipp auf eine Zeile macht Eiweiß, Fett, KH und kcal zu Eingabefeldern in ihren Spalten; darunter die Standardwerte
     („leer = Standard“), Speichern · Abbrechen · ↺ Standard, die Zahl der betroffenen Rezepte und das Wasser. Weicht ein
     Wert um mehr als ein Drittel vom Standard ab, erscheint ein Hinweis. Geänderte Lebensmittel sind markiert und lassen
     sich einzeln oder alle zurücksetzen – jeweils mit Rückgängig. Eigene Lebensmittel öffnen ihr Formular, das MCT-Öl
     führt zu „Öl und MCT“ (Etikettwerte dort). */
  let werteEdit = null;
  const WERTE_KEYS = [["eiweiss", "Eiweiß"], ["fett", "Fett"], ["kh", "KH"], ["kcal100", "kcal"]];
  function changedFoods() { return Object.keys(state.foodOverrides || {}).filter(n => { const f = lookup(n); return f && f.changed; }); }
  function recipesWith(name) { return allRecipes().filter(r => r.items.some(it => it.food === name)).length; }
  function werteVal(f, k) { return k === "kcal100" ? fmt(kcal100Of(f), 0) : fmt(f[k]); }
  function renderWerte() {
    const box = document.getElementById("werte-list"); if (!box) return;
    if (werteEdit && box.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return; // nicht beim Tippen neu aufbauen
    const used = {};
    allRecipes().forEach(r => r.items.forEach(it => { used[it.food] = true; }));
    (state.customFoods || []).forEach(f => { used[f.name] = true; }); // eigene immer zeigen – zur Freigabe durch die Diätologie
    if (werteEdit && !lookup(werteEdit)) werteEdit = null;
    const kat = (f) => '<td class="wt-kat">' + escapeHtml(f.kategorie || "") + "</td>";
    const rows = Object.keys(used).sort((a, b) => a.localeCompare(b, "de")).map(name => {
      const f = lookup(name); if (!f) return "<tr><td>" + escapeHtml(name) + "</td><td colspan='5' class='ovr'>fehlt in der Liste</td></tr>";
      const mct = name === "MCT-Öl C8+C10", label = !f.custom && !f.changed && (f.kcal100 != null || mct);
      const tags = (f.custom ? " <span class='ovr'>eigen</span>" : f.changed ? " <span class='ovr chg'>geändert</span>" : label ? " <span class='ovr'>Etikett</span>" : "");
      const nm = "<td>" + escapeHtml(name) + tags + "</td>";
      if (werteEdit === name) {
        const o = (state.foodOverrides || {})[name] || {}, std = f.std || f;
        return '<tr class="editing" data-food="' + escapeHtml(name) + '">' + nm + WERTE_KEYS.map(([k, l]) =>
            '<td><input type="text" inputmode="decimal" data-k="' + k + '" aria-label="' + l + ' je 100 g" value="' + (o[k] != null ? fmtNum(o[k]) : "") + '" placeholder="' + werteVal(std, k) + '"></td>').join("") + kat(f) + "</tr>" +
          '<tr class="edit-std"><td>Standard<span class="wt-long"> · leer = Standard</span></td>' + WERTE_KEYS.map(([k]) => "<td>" + werteVal(std, k) + "</td>").join("") + '<td class="wt-kat"></td></tr>' +
          '<tr class="edit-row"><td colspan="6"><div class="edit-act"><button type="button" class="btn primary" data-wact="save">Speichern</button>' +
          '<button type="button" class="tlink" data-wact="cancel">Abbrechen</button>' + (f.changed ? '<button type="button" class="tlink" data-wact="std">↺ Standard</button>' : "") +
          '<span class="hint">Gilt für ' + recipesWith(name) + (recipesWith(name) === 1 ? " Rezept" : " Rezepte") + ' · Wasser je 100 g: <input type="text" inputmode="decimal" data-k="wasser" aria-label="Wasser je 100 g" value="' + (o.wasser != null ? fmtNum(o.wasser) : "") + '" placeholder="' + fmt(waterOf(std)) + '"> g (leer = Standard)</span>' +
          '<div class="note warn" id="wt-msg" hidden></div></div></td></tr>';
      }
      const attr = f.custom ? ' data-cf-open="' + escapeHtml(name) + '"' : mct ? ' data-mct="1" title="Etikettwerte unter Öl und MCT"' : ' data-food="' + escapeHtml(name) + '"';
      const std = f.changed ? f.std : null;
      return '<tr class="wt-row' + (std ? " has-std" : "") + '" tabindex="0" role="button"' + attr + ">" + nm +
        WERTE_KEYS.map(([k]) => "<td" + (std && werteVal(std, k) !== werteVal(f, k) ? ' class="chg"' : "") + ">" + werteVal(f, k) + "</td>").join("") + kat(f) + "</tr>" +
        (std ? '<tr class="std"><td>Standard · <button type="button" class="tlink" data-wreset="' + escapeHtml(name) + '" title="Auf Standard zurücksetzen">↺<span class="wt-long"> zurücksetzen</span></button></td>' +
          WERTE_KEYS.map(([k]) => "<td>" + werteVal(std, k) + "</td>").join("") + '<td class="wt-kat"></td></tr>' : "");
    }).join("");
    const n = changedFoods().length;
    box.innerHTML = '<div class="wt-bar"><span>' + (n ? n + (n === 1 ? " Wert" : " Werte") + " geändert · " : "") + "Zeile antippen zum Ändern</span>" +
      (n ? '<button type="button" class="tlink" data-wall="1">Alle auf Standard</button>' : "") + "</div>" +
      "<table class='werte-table'><thead><tr><th>Lebensmittel</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>kcal</th><th class='wt-kat'>Kategorie</th></tr></thead><tbody>" + rows + "</tbody></table>";
    if (werteEdit) werteCheck();
  }
  // Während der Eingabe: kcal-Vorschlag aus den Feldern und Hinweis bei großer Abweichung vom Standard
  function werteInputs() {
    const box = document.getElementById("werte-list"), o = {};
    if (box) box.querySelectorAll(".editing input[data-k], .edit-row input[data-k]").forEach(i => { o[i.dataset.k] = i.value.trim(); });
    return o;
  }
  function werteCheck() {
    const f = lookup(werteEdit); if (!f) return;
    const std = f.std || f, v = werteInputs(), cur = (k) => v[k] !== "" && v[k] != null ? num(v[k]) : std[k];
    const kc = document.querySelector('#werte-list .editing input[data-k="kcal100"]');
    if (kc) kc.placeholder = ["eiweiss", "fett", "kh"].some(k => v[k] !== "" && v[k] != null && num(v[k]) !== std[k])
      ? fmt(4 * cur("eiweiss") + 9 * cur("fett") + 4 * cur("kh"), 0) : fmt(kcal100Of(std), 0);
    const far = WERTE_KEYS.filter(([k]) => { if (v[k] === "" || v[k] == null) return false; const d = k === "kcal100" ? kcal100Of(std) : std[k]; return d >= 1 && Math.abs(num(v[k]) - d) / d > 1 / 3; }).map(([, l]) => l);
    werteMsg(far.length ? "▲ " + far.join(" und ") + (far.length === 1 ? " weicht" : " weichen") + " um mehr als ein Drittel vom Standard ab – bitte das Etikett prüfen." : "");
  }
  function werteMsg(t) { const m = document.getElementById("wt-msg"); if (m) { m.hidden = !t; m.textContent = t || ""; } }
  function werteSetOverride(name, ov, toastTxt) {
    const prev = (state.foodOverrides || {})[name];
    if (!state.foodOverrides) state.foodOverrides = {};
    if (ov && Object.keys(ov).length) state.foodOverrides[name] = ov; else delete state.foodOverrides[name];
    werteEdit = null; save(); rebuildFoodIndex(); renderRezepte(); renderWerte();
    showToast(toastTxt, [["Rückgängig", () => { if (prev) state.foodOverrides[name] = prev; else delete state.foodOverrides[name]; save(); rebuildFoodIndex(); renderRezepte(); renderWerte(); }]]);
  }
  function werteSave() {
    const name = werteEdit, f = lookup(name); if (!f) return;
    const std = f.std || f, v = werteInputs(), ov = {};
    for (const k of ["eiweiss", "fett", "kh", "kcal100", "wasser"]) {
      if (v[k] === "" || v[k] == null) continue;
      if (!/^\d+([.,]\d+)?$/.test(v[k])) { werteMsg("Bitte nur Zahlen eintragen (z. B. 2,5)."); return; }
      const n = num(v[k]), d = k === "kcal100" ? kcal100Of(std) : k === "wasser" ? waterOf(std) : std[k];
      if (Math.abs(n - d) > 1e-9) ov[k] = n; // gleicher Wert wie der Standard = nichts geändert
    }
    const cur = (k) => ov[k] != null ? ov[k] : std[k];
    if (cur("eiweiss") + cur("fett") + cur("kh") > 100.05) { werteMsg("Eiweiß, Fett und Kohlenhydrate zusammen können nicht mehr als 100 g je 100 g sein."); return; }
    if (ov.wasser != null && ov.wasser > 100) { werteMsg("Wasser kann nicht mehr als 100 g je 100 g sein."); return; }
    const nR = recipesWith(name);
    werteSetOverride(name, ov, Object.keys(ov).length ? "„" + escapeHtml(name) + "“ geändert – gilt für " + nR + (nR === 1 ? " Rezept" : " Rezepte") : "„" + escapeHtml(name) + "“ wieder mit Standardwerten");
  }
  function bindWerte() {
    const box = document.getElementById("werte-list"); if (!box || box.dataset.wb) return;
    box.dataset.wb = "1";
    const open = (tr) => {
      if (tr.dataset.cfOpen) { cfOpen(tr.dataset.cfOpen); return; }
      if (tr.dataset.mct) { showVgPage("oel"); return; }
      werteEdit = tr.dataset.food; renderWerte();
      const row = box.querySelector("tr.editing");
      if (row) try { row.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
    };
    box.addEventListener("click", (e) => {
      const r = e.target.closest("[data-wreset]");
      if (r) { const n = r.dataset.wreset; werteSetOverride(n, null, "„" + escapeHtml(n) + "“ wieder mit Standardwerten"); return; }
      if (e.target.closest("[data-wall]")) {
        const snap = JSON.stringify(state.foodOverrides || {}), n = changedFoods().length;
        state.foodOverrides = {}; werteEdit = null; save(); rebuildFoodIndex(); renderRezepte(); renderWerte();
        showToast(n + (n === 1 ? " Lebensmittel" : " Lebensmittel") + " wieder mit Standardwerten", [["Rückgängig", () => { state.foodOverrides = JSON.parse(snap); save(); rebuildFoodIndex(); renderRezepte(); renderWerte(); }]]);
        return;
      }
      const a = e.target.closest("[data-wact]");
      if (a) {
        if (a.dataset.wact === "save") werteSave();
        else if (a.dataset.wact === "cancel") { werteEdit = null; renderWerte(); }
        else if (a.dataset.wact === "std") { const n = werteEdit; werteSetOverride(n, null, "„" + escapeHtml(n) + "“ wieder mit Standardwerten"); }
        return;
      }
      const tr = e.target.closest("tr.wt-row"); if (tr) open(tr);
    });
    box.addEventListener("keydown", (e) => {
      if (e.target.matches && e.target.matches("tr.wt-row") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(e.target); return; }
      if (e.target.tagName === "INPUT" && werteEdit) {
        if (e.key === "Enter") { e.preventDefault(); werteSave(); }
        else if (e.key === "Escape") { e.stopPropagation(); werteEdit = null; renderWerte(); }
      }
    });
    box.addEventListener("input", (e) => { if (e.target.dataset && e.target.dataset.k) werteCheck(); });
  }
