  /* ---------- Eigenes Rezept (frei zusammenstellen) ---------- */
  const FAT_OPTIONS = ["Butter", "Streichgenuss (Schärdinger)", "Schlagobers NÖM", "Creme Fraîche NÖM", "Mascarpone Kärntnermilch", "Rapsöl", "Olivenöl", "MCT Nutricia (100%)", "Liquigen"];

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
    const c = document.getElementById("compose-content");
    const d = derived();
    c.innerHTML =
      '<div class="title">🧪 Eigenes Rezept' + (compose.fromRecipe ? " (angepasst)" : " zusammenstellen") + "</div>" +
      '<div class="meta">' + (compose.fromRecipe ? "Basierend auf „" + escapeHtml(compose.fromRecipe) + "“. " : "") +
      "Zutaten und Fett(e) frei wählen – die App berechnet die Mengen für eine Mahlzeit (Verhältnis " +
      fmt(d.ratio, d.ratio % 1 ? 1 : 0) + ":1, Ziel " + fmt(d.kcalMahl, 0) + " kcal).</div>";
    const clearBtn = el("button", { class: "btn ghost" }, "🗑️ Leeren / neu beginnen");
    clearBtn.addEventListener("click", () => {
      state.compose = { items: [{ food: "", grams: 60 }], fats: [{ food: "Schlagobers NÖM", share: 100 }], scale: true };
      save(); closeCompose(); openCompose();
    });
    c.appendChild(clearBtn);
    const rowsWrap = el("div", { class: "compose-rows" });
    c.appendChild(rowsWrap);
    const addBtn = el("button", { class: "btn secondary", html: "+ Zutat hinzufügen" });
    addBtn.style.marginTop = "4px";
    addBtn.addEventListener("click", () => { compose.items.push({ food: "", grams: 30 }); renderRows(); recompute(); });
    c.appendChild(addBtn);

    const fatField = el("div", { class: "compose-fat" });
    fatField.innerHTML = "<label>Fett(e) zum Ausgleich</label>";
    const fatsWrap = el("div", { class: "compose-rows" });
    fatField.appendChild(fatsWrap);
    const addFatBtn = el("button", { class: "btn secondary", html: "+ weiteres Fett" });
    addFatBtn.addEventListener("click", () => { compose.fats.push({ food: "Butter", share: 50 }); renderFats(); recompute(); });
    fatField.appendChild(addFatBtn);
    c.appendChild(fatField);

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

    const scaleRow = el("div", { class: "checkrow" });
    const cb = el("input", { type: "checkbox", id: "compose-scale" }); cb.checked = compose.scale;
    cb.addEventListener("change", () => { compose.scale = cb.checked; recompute(); });
    const lbl = el("label", { for: "compose-scale", class: "inline" }, "Mengen automatisch für eine Mahlzeit (≈" + fmt(d.kcalMahl, 0) + " kcal) berechnen");
    scaleRow.appendChild(cb); scaleRow.appendChild(lbl);
    c.appendChild(scaleRow);

    const result = el("div", { id: "compose-result" });
    c.appendChild(result);

    // Speichern als eigenes Rezept
    let lastItems = [], lastOk = false;
    const saveBox = el("div", { class: "compose-save" });
    const nameInp = el("input", { type: "text", placeholder: "Name für dein Rezept", value: compose.fromRecipe || "" });
    const saveBtn = el("button", { class: "btn" }, compose.editKey ? "Änderungen speichern" : "💾 Als eigenes Rezept speichern");
    saveBtn.addEventListener("click", () => {
      const nm = nameInp.value.trim();
      if (!nm) { alert("Bitte einen Namen für das Rezept eingeben."); return; }
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
      save();
      saveBtn.textContent = "✓ Gespeichert"; setTimeout(() => { saveBtn.textContent = "Änderungen speichern"; }, 1500);
    });
    saveBox.appendChild(nameInp); saveBox.appendChild(saveBtn);
    c.appendChild(saveBox);

    function renderRows() {
      rowsWrap.innerHTML = "";
      compose.items.forEach((it, i) => {
        const row = el("div", { class: "compose-row" });
        row.appendChild(buildFoodSelect(it.food, v => { it.food = v; recompute(); }));
        const g = el("input", { type: "number", min: "0", step: "5", value: it.grams, class: "compose-grams" });
        g.addEventListener("input", e => { it.grams = e.target.value; recompute(); });
        row.appendChild(g);
        row.appendChild(el("span", { class: "unit" }, "g"));
        const del = el("button", { class: "btn ghost", title: "Entfernen" }, "✕");
        del.addEventListener("click", () => { compose.items.splice(i, 1); if (!compose.items.length) compose.items.push({ food: "", grams: 30 }); renderRows(); recompute(); });
        row.appendChild(del);
        rowsWrap.appendChild(row);
      });
    }
    function recompute() {
      save();
      const d = derived();
      const res = computeFreeMeal(compose.items, compose.fats, d.ratio);
      const box = document.getElementById("compose-result");
      if (!res.ok) { lastOk = false; lastItems = []; box.innerHTML = '<div class="adjust-note">⚠️ ' + res.note + "</div>"; return; }
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
      let rows = "";
      items.forEach(it => {
        const m = lineMacros(it);
        rows += "<tr" + (it.isFat ? ' class="fatrow"' : "") + "><td class='name'>" + escapeHtml(it.food) +
          (it.isFat ? " ⟵ Fett (berechnet)" : "") + "</td><td>" + fmt(it.grams, 1) +
          "</td><td>" + fmt(m.eiweiss) + "</td><td>" + fmt(m.fett) + "</td><td>" + fmt(m.kh) + "</td><td>" + fmt(m.kcal, 0) + "</td></tr>";
      });
      box.innerHTML =
        '<div class="detail-tiles">' +
          '<div class="dstat"><div class="v">' + fmt(sum.kcal, 0) + '</div><div class="l">kcal</div></div>' +
          '<div class="dstat"><div class="v"><span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + (r === null ? "—" : fmt(r, 2)) + ':1</span></div><div class="l">Verhältnis</div></div>' +
          '<div class="dstat"><div class="v">≈ ' + fmt(totalG, 0) + ' g</div><div class="l">Menge (' + fmt(ml, 0) + ' ml)</div></div>' +
          '<div class="dstat ' + (proteinOk ? "" : "warn") + '"><div class="v">' + fmt(sum.eiweiss) + ' g</div><div class="l">Eiweiß (Ziel ' + fmt(d.eiweissMahl) + ' g)</div></div>' +
        "</div>" +
        '<div class="tbl-wrap"><table><thead><tr><th>Lebensmittel</th><th>Gramm</th><th>Eiweiß</th><th>Fett</th><th>KH</th><th>Kcal</th></tr></thead><tbody>' +
        rows +
        "<tr class='sum'><td class='name'>Summe</td><td>" + fmt(totalG, 0) + "</td><td>" + fmt(sum.eiweiss) + "</td><td>" +
        fmt(sum.fett) + "</td><td>" + fmt(sum.kh) + "</td><td>" + fmt(sum.kcal, 0) + "</td></tr>" +
        "</tbody></table></div>";
      const pr = el("div", { class: "btn-row" });
      const pb = el("button", { class: "btn secondary" }, "🖨️ Drucken");
      const recForPrint = { name: "Eigenes Rezept", icon: "🧪", ketocal: false,
        thermomix: "Zutaten garen bzw. vorbereiten, gemeinsam fein pürieren und das Fett glatt unterrühren.",
        zubereitung: "Zutaten vorbereiten, fein pürieren und das berechnete Fett untermischen." };
      pb.addEventListener("click", () => printRecipe(recForPrint, { items }, d, 1));
      pr.appendChild(pb); box.appendChild(pr);
    }

    renderRows(); renderFats(); recompute();
    document.getElementById("compose-overlay").hidden = false;
    document.body.classList.add("modal-open");
  }
  function closeCompose() {
    document.getElementById("compose-overlay").hidden = true;
    document.body.classList.remove("modal-open");
    renderRezepte();
  }
  function bindCompose() {
    document.getElementById("compose-btn").addEventListener("click", openCompose);
    document.getElementById("compose-close").addEventListener("click", closeCompose);
    const ov = document.getElementById("compose-overlay");
    ov.addEventListener("click", e => { if (e.target === ov) closeCompose(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden) closeCompose(); });
  }
