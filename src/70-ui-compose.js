  /* ---------- Eigenes Rezept (frei zusammenstellen) ---------- */
  const FAT_OPTIONS = ["Butter", "Streichgenuss (Schärdinger)", "Schlagobers NÖM", "Creme Fraîche NÖM", "Mascarpone Kärntnermilch", "Rapsöl", "Olivenöl", "MCT Nutricia (100%)", "Liquigen"];
  // Der Editor sieht aus wie die Detailansicht: fester Kopf, zwei Blätter (Zutaten · Mahlzeit), feste Aktionsleiste.
  const COMPOSE_PAGES = [["zutaten", "✏️ Zutaten"], ["mahlzeit", "🍽️ Mahlzeit"]];
  let composeTab = "zutaten";

  function buildFoodSelect(value, onChange) {
    const sel = el("select", { class: "food-select" });
    sel.appendChild(el("option", { value: "" }, "— Lebensmittel wählen —"));
    const byCat = {};
    FOODS_DEFAULT.forEach(f => { (byCat[f.kategorie] = byCat[f.kategorie] || []).push(f); });
    Object.keys(byCat).sort().forEach(cat => {
      const og = el("optgroup", { label: cat });
      byCat[cat].forEach(f => {
        const o = el("option", { value: f.name }, f.name);
        if (f.name === value) o.selected = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    sel.value = value || "";
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;
  }

  // Berechnet die Gesamtmenge der (ggf. mehreren) Ausgleichsfette, damit das
  // Verhältnis bei fixen Basismengen stimmt. Die Fette werden gemäß ihren
  // Anteilen (share) aufgeteilt.
  function computeFreeMeal(baseItems, fats, ratio) {
    let Pb = 0, Fb = 0, Cb = 0, hasBase = false;
    baseItems.forEach(it => {
      const f = lookup(it.food); const g = num(it.grams);
      if (!f || g <= 0) return; hasBase = true;
      Pb += f.eiweiss * g / 100; Fb += f.fett * g / 100; Cb += f.kh * g / 100;
    });
    if (!hasBase) return { ok: false, note: "Bitte mindestens ein Lebensmittel wählen." };

    // gültige Fette mit Anteil
    const valid = (fats || []).filter(x => lookup(x.food) && num(x.share) > 0);
    if (!valid.length) return { ok: false, note: "Bitte mindestens ein Fett zum Ausgleich wählen." };
    const totShare = valid.reduce((a, x) => a + num(x.share), 0);
    const w = valid.map(x => num(x.share) / totShare);
    // gemischte Nährwerte pro 100 g
    let bp = 0, bf = 0, bc = 0;
    valid.forEach((x, i) => { const f = lookup(x.food); bp += w[i] * f.eiweiss; bf += w[i] * f.fett; bc += w[i] * f.kh; });
    const denom = bf - ratio * (bp + bc);
    if (denom <= 0) return { ok: false, note: "Das gewählte Fett ist nicht fettreich genug für das Verhältnis. Bitte ein fettreicheres Fett wählen (z. B. Butter oder Öl)." };
    const xTot = 100 * (ratio * (Pb + Cb) - Fb) / denom;
    if (xTot < 0) return { ok: false, note: "Die gewählten Zutaten sind bereits zu fettreich für dieses Verhältnis. Bitte fettärmere Zutaten verwenden." };

    const items = baseItems.filter(it => lookup(it.food) && num(it.grams) > 0)
      .map(it => ({ food: it.food, grams: round1(num(it.grams)) }));
    valid.forEach((x, i) => items.push({ food: x.food, grams: round1(w[i] * xTot), isFat: true }));
    return { ok: true, items };
  }

  function openCompose() {
    const compose = state.compose;
    if (!compose.name && compose.fromRecipe) compose.name = compose.fromRecipe;
    const c = document.getElementById("compose-content");
    const d = derived();
    const mobile = isMobileLayout();
    const paneOpen = (k) => '<div class="pane" data-pane="' + k + '"' + (composeTab !== k && !mobile ? " hidden" : "") + ">";
    const badge = compose.editKey
      ? '<span class="badge quelle">📝 eigenes Rezept</span>'
      : (compose.fromRecipe ? '<span class="badge noketo">nach „' + escapeHtml(compose.fromRecipe) + '“</span>' : '<span class="badge noketo">neu</span>');

    c.innerHTML =
      '<div class="detail-head"><span class="detail-icon">📝</span>' +
        '<div class="detail-head-body"><input id="compose-name" class="title title-input" type="text" placeholder="Name für dein Rezept" value="' + escapeHtml(compose.name || "") + '">' +
        '<div class="meta" id="compose-meta"></div></div></div>' +
      pagerHead(COMPOSE_PAGES, composeTab, "compose-tabs", "compose-dots") +
      '<div class="pages" id="compose-pages">' +

      /* ---------- 1 Zutaten ---------- */
      paneOpen("zutaten") +
      '<h4 class="ph">✏️ Zutaten <span class="hint">für eine Mahlzeit</span></h4>' +
      '<div class="portion-line">Lebensmittel und Mengen frei wählen – das Fett wird für ' + fmtTarget(d.ratio) + ' berechnet' +
        (compose.scale ? ', alles auf ' + fmt(d.kcalMahl, 0) + ' kcal je Mahlzeit skaliert' : '') + '</div>' +
      '<div class="compose-rows" id="compose-rows"></div>' +
      '<button type="button" class="btn secondary" id="compose-add">+ Zutat hinzufügen</button>' +
      '<div class="compose-fat"><label>🧈 Fett(e) zum Ausgleich <span class="hint">stellt das Verhältnis ein</span></label>' +
        '<div class="compose-rows" id="compose-fats"></div>' +
        '<button type="button" class="btn secondary" id="compose-addfat">+ weiteres Fett</button></div>' +
      '<div class="checkrow"><input type="checkbox" id="compose-scale"' + (compose.scale ? " checked" : "") + '><label for="compose-scale" class="inline">Mengen automatisch auf eine Mahlzeit (≈ ' + fmt(d.kcalMahl, 0) + ' kcal) skalieren</label></div>' +
      "</div>" +

      /* ---------- 2 Mahlzeit (Ergebnis, Layout wie in der Detailansicht) ---------- */
      paneOpen("mahlzeit") +
      '<h4 class="ph">🍽️ Mahlzeit <span class="hint">eine Portion</span></h4>' +
      '<div id="compose-result"></div>' +
      "</div>" +

      "</div>" + /* pages */
      '<div class="detail-actions" id="compose-actions"></div>';

    const rowsWrap = c.querySelector("#compose-rows"), fatsWrap = c.querySelector("#compose-fats");
    c.querySelector("#compose-add").addEventListener("click", () => { compose.items.push({ food: "", grams: 30 }); renderRows(); recompute(); });
    c.querySelector("#compose-addfat").addEventListener("click", () => { compose.fats.push({ food: "Butter", share: 50 }); renderFats(); recompute(); });
    c.querySelector("#compose-scale").addEventListener("change", e => { compose.scale = e.target.checked; recompute(); });
    const nameInp = c.querySelector("#compose-name");
    nameInp.addEventListener("input", () => { compose.name = nameInp.value; save(); });

    function renderFats() {
      fatsWrap.innerHTML = "";
      const multi = compose.fats.length > 1;
      compose.fats.forEach((ft, i) => {
        const row = el("div", { class: "compose-row" });
        const sel = el("select", { class: "food-select" });
        FAT_OPTIONS.forEach(n => { const o = el("option", { value: n }, n); if (n === ft.food) o.selected = true; sel.appendChild(o); });
        sel.value = ft.food;
        sel.addEventListener("change", () => { ft.food = sel.value; recompute(); });
        row.appendChild(sel);
        if (multi) {
          const sh = el("input", { type: "number", min: "0", step: "5", value: ft.share, class: "compose-grams" });
          sh.addEventListener("input", e => { ft.share = e.target.value; recompute(); });
          row.appendChild(sh);
          row.appendChild(el("span", { class: "unit" }, "%"));
          const del = el("button", { class: "btn ghost", title: "Entfernen" }, "✕");
          del.addEventListener("click", () => { compose.fats.splice(i, 1); renderFats(); recompute(); });
          row.appendChild(del);
        }
        fatsWrap.appendChild(row);
      });
    }
    function renderRows() {
      rowsWrap.innerHTML = "";
      compose.items.forEach((it, i) => {
        const row = el("div", { class: "compose-row" });
        row.appendChild(buildFoodSelect(it.food, v => { it.food = v; recompute(); }));
        const g = el("input", { type: "number", min: "0", step: "5", value: it.grams, class: "compose-grams", inputmode: "decimal" });
        g.addEventListener("input", e => { it.grams = e.target.value; recompute(); });
        row.appendChild(g);
        row.appendChild(el("span", { class: "unit" }, "g"));
        const del = el("button", { class: "btn ghost", title: "Entfernen" }, "✕");
        del.addEventListener("click", () => { compose.items.splice(i, 1); if (!compose.items.length) compose.items.push({ food: "", grams: 30 }); renderRows(); recompute(); });
        row.appendChild(del);
        rowsWrap.appendChild(row);
      });
    }

    // Ergebnis: Kopfzeile (Pille, kcal, Badge) und Blatt „Mahlzeit“ wie in der Detailansicht.
    let lastItems = [], lastOk = false;
    function recompute() {
      save();
      const d = derived();
      const res = computeFreeMeal(compose.items, compose.fats, d.ratio);
      const box = c.querySelector("#compose-result"), meta = c.querySelector("#compose-meta");
      if (!res.ok) {
        lastOk = false; lastItems = [];
        meta.innerHTML = '<span>noch unvollständig</span>' + badge;
        box.innerHTML = '<div class="portion-line">Noch nichts zu berechnen</div><div class="note warn">⚠️ ' + res.note + "</div>";
        return;
      }
      let items = res.items;
      let sum = sumMacros(items);
      if (compose.scale && sum.kcal > 0) {
        const factor = d.kcalMahl / sum.kcal;
        items = items.map(it => ({ food: it.food, grams: round1(num(it.grams) * factor), isFat: it.isFat }));
        sum = sumMacros(items);
      }
      lastOk = true; lastItems = items;
      const r = ratioOf(sum);
      const totalG = items.reduce((a, it) => a + num(it.grams), 0);
      const ml = volumeMl(items);
      const proteinOk = sum.eiweiss >= d.eiweissMahl * 0.9;
      meta.innerHTML = '<span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmtRatio(r, 2) + '</span><span>' + fmt(sum.kcal, 0) + ' kcal je Portion</span>' + badge;
      let rows = "";
      items.forEach(it => {
        const m = lineMacros(it);
        rows += "<tr" + (it.isFat ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) +
          (it.isFat ? '<small class="adj">⟵ stellt das Verhältnis ein</small>' : "") + "</td><td>" + fmt(it.grams, 1) +
          "</td><td>" + fmt(m.eiweiss) + "</td><td>" + fmt(m.fett) + "</td><td>" + fmt(m.kh) + "</td><td>" + fmt(m.kcal, 0) + "</td></tr>";
      });
      box.innerHTML =
        '<div class="portion-line">' + (compose.scale ? 'Wie berechnet · ' + fmt(d.kcalMahl, 0) + ' kcal je Mahlzeit' : 'Feste Zutatenmengen · ' + fmt(sum.kcal, 0) + ' kcal') + ' · Fett für ' + fmtTarget(d.ratio) + ' berechnet</div>' +
        '<div class="detail-tiles strip">' +
          '<div class="dstat"><div class="v">' + fmt(sum.kcal, 0) + '</div><div class="l">kcal · Ziel ' + fmt(d.kcalMahl, 0) + '</div></div>' +
          '<div class="dstat ' + (proteinOk ? "" : "warn") + '"><div class="v">' + fmt(sum.eiweiss) + ' g</div><div class="l">Eiweiß · Ziel ' + fmt(d.eiweissMahl) + ' g</div></div>' +
          '<div class="dstat"><div class="v">≈ ' + fmt(totalG, 0) + ' g</div><div class="l">Menge</div></div>' +
          '<div class="dstat"><div class="v">≈ ' + fmt(ml, 0) + ' ml</div><div class="l">Volumen</div></div>' +
        "</div>" +
        (!proteinOk ? '<div class="note warn">⚠️ Liegt unter dem Eiweiß-Ziel. Ggf. mit dem Behandlungsteam abstimmen.</div>' : "") +
        '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' +
        rows +
        "<tr class='sum'><td class='name'>Summe je Portion</td><td>" + fmt(totalG, 0) + "</td><td>" + fmt(sum.eiweiss) + "</td><td>" +
        fmt(sum.fett) + "</td><td>" + fmt(sum.kh) + "</td><td>" + fmt(sum.kcal, 0) + "</td></tr>" +
        "</tbody></table></div>";
    }

    // Feste Aktionsleiste unten: Speichern · Drucken · Leeren
    const actions = c.querySelector("#compose-actions");
    const saveBtn = el("button", { class: "btn", id: "compose-save" }, compose.editKey ? "💾 Speichern" : "💾 Als Rezept speichern");
    saveBtn.addEventListener("click", () => {
      const nm = (nameInp.value || "").trim();
      if (!nm) { alert("Bitte oben einen Namen für das Rezept eingeben."); nameInp.focus(); return; }
      if (!lastOk || !lastItems.length) { alert("Bitte zuerst gültige Zutaten und ein Fett wählen."); return; }
      const items = lastItems.map(it => ({ food: it.food, grams: it.grams }));
      if (compose.editKey) {
        const sr = state.savedRecipes.find(s => s.key === compose.editKey);
        if (sr) { sr.name = nm; sr.items = items; }
      } else {
        const key = "custom:" + Date.now();
        state.savedRecipes.unshift({ key, name: nm, icon: "📝", items });
        compose.editKey = key; compose.fromRecipe = nm;
      }
      compose.name = nm;
      save();
      saveBtn.textContent = "✓ Gespeichert"; setTimeout(() => { saveBtn.textContent = "💾 Speichern"; }, 1500);
    });
    actions.appendChild(saveBtn);
    const printBtn = el("button", { class: "btn secondary" }, "🖨️ Drucken");
    printBtn.addEventListener("click", () => {
      if (!lastOk) { alert("Bitte zuerst gültige Zutaten und ein Fett wählen."); return; }
      const recForPrint = { name: (nameInp.value || "").trim() || "Eigenes Rezept", icon: "📝", ketocal: false,
        zubereitung: "Zutaten vorbereiten, fein pürieren und das berechnete Fett untermischen." };
      printRecipe(recForPrint, { items: lastItems }, derived(), 1);
    });
    actions.appendChild(printBtn);
    const clearBtn = el("button", { class: "btn ghost", title: "Leeren / neu beginnen" }, "🗑️");
    clearBtn.addEventListener("click", () => {
      state.compose = { items: [{ food: "", grams: 60 }], fats: [{ food: "Schlagobers NÖM", share: 100 }], scale: true };
      save(); composeTab = "zutaten"; openCompose();
    });
    actions.appendChild(clearBtn);

    renderRows(); renderFats(); recompute();
    setupPager(c, COMPOSE_PAGES, composeTab, (k) => { composeTab = k; }, openCompose);
    document.getElementById("compose-overlay").hidden = false;
    modalOpen("compose");
  }
  function closeCompose() {
    document.getElementById("compose-overlay").hidden = true;
    modalClose("compose");
    renderRezepte();
  }
  function bindCompose() {
    document.getElementById("compose-btn").addEventListener("click", () => { composeTab = "zutaten"; openCompose(); });
    document.getElementById("compose-close").addEventListener("click", closeCompose);
    const ov = document.getElementById("compose-overlay");
    ov.addEventListener("click", e => { if (e.target === ov) closeCompose(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden) closeCompose(); });
    bindSwipeDown(ov, ".detail-head, .detail-tabs-wrap", closeCompose);
  }
