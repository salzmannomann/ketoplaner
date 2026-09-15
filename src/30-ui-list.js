  /* ---------- Rezepte rendern ---------- */
  function renderRezepte() {
    const s = state.settings;
    const $ = id => document.getElementById(id);
    $("set-kcal").value = s.kcal;
    $("set-mahlzeiten").value = s.mahlzeiten;
    if (document.activeElement !== $("set-ratio")) $("set-ratio").value = fmtTarget(num(s.ratio)); // nicht während des Tippens überschreiben
    $("set-weight").value = s.weight;
    $("set-mct-fett").value = s.mctFett100 || "";
    $("set-mct-kcal").value = s.mctKcal100 || "";
    $("set-verdunstung").value = (s.dampfVerdunstung === 0 || s.dampfVerdunstung) ? s.dampfVerdunstung : "";
    $("set-proteinmode").value = String(s.proteinPerKg || 0);

    const d = derived();
    $("set-eiweiss").value = d.autoProtein ? d.eiweiss : s.eiweiss;
    $("set-eiweiss").disabled = d.autoProtein;
    renderHeader(d);
    renderVorgaben(d);
    if (state.settings.view === "heute") renderHeute();

    // Schnellfilter-Chips: Gruppen (entweder/oder) + Schalter (KetoCal-Phase, Diätologie)
    const filter = FILTERS.some(f => f.id === s.filter) ? s.filter : "alle";
    const onlyQuelle = !!s.onlyQuelle;
    const phase = ketoPhase();
    const fb = $("filter-bar");
    fb.innerHTML = "";
    const catChips = el("div", { class: "chips cat" });
    FILTERS.forEach(f => {
      const chip = el("button", { class: "chip" + (f.id === filter ? " active" : "") }, f.label);
      chip.addEventListener("click", () => { state.settings.filter = f.id; save(); renderRezepte(); });
      catChips.appendChild(chip);
    });
    fb.appendChild(catChips);
    const switchChips = el("div", { class: "chips switches" });
    [["mit", "🥄 mit KetoCal"], ["ohne", "ohne KetoCal"]].forEach(([k, lab]) => {
      const c = el("button", { class: "chip switch" + (phase === k ? " active" : "") }, lab);
      c.addEventListener("click", () => setKetoPhase(k));
      switchChips.appendChild(c);
    });
    const qc = el("button", { class: "chip switch" + (onlyQuelle ? " active" : "") }, "👩‍⚕️ Diätologie");
    qc.addEventListener("click", () => { state.settings.onlyQuelle = !state.settings.onlyQuelle; save(); renderRezepte(); });
    switchChips.appendChild(qc);
    fb.appendChild(switchChips);

    // Ein Eintrag je Gericht; gezeigt wird die Variante laut Wahl/Phase (bei „Diätologie“ die Original-Variante).
    // Erreicht die gezeigte Variante das Verhältnis nicht, wird eine andere Variante des Gerichts versucht.
    const q = (($("recipe-search") || {}).value || "").trim().toLowerCase();
    const hitItems = (r) => r.items.some(it => (it.food || "").toLowerCase().indexOf(q) !== -1);
    const entries = [];
    allFamilies().forEach(fam => {
      let rec = chosenVariant(fam);
      if (onlyQuelle && !rec.quelle) rec = fam.variants.find(r => !!r.quelle) || null;
      if (!rec) return;
      if (!matchesFilter(rec, filter)) return;
      if (q && fam.name.toLowerCase().indexOf(q) === -1 && !fam.variants.some(hitItems)) return;
      let res = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
      if (!res.ok) {
        const alt = fam.variants.find(r => r !== rec && computeAdjustedRecipe(r, d.kcalMahl, d.ratio).ok);
        if (!alt) return;
        rec = alt; res = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
      }
      entries.push({ fam, rec, res });
    });

    $("recipe-count").textContent = entries.length + " Gericht" + (entries.length === 1 ? "" : "e") +
      (phase === "mit" ? " · mit KetoCal, wo es die Variante gibt" : " · ohne KetoCal, wo es die Variante gibt");

    const sort = s.sort || "kategorie";
    $("sort-select").value = sort;

    const list = $("recipe-list");
    list.innerHTML = "";
    if (entries.length === 0) {
      list.appendChild(el("div", { class: "card empty" }, "Keine Gerichte für diese Auswahl."));
      return;
    }

    function appendGroup(title, arr) {
      if (!arr.length) return;
      const sorted = arr.slice().sort((a, b) => a.fam.name.localeCompare(b.fam.name, "de"));
      list.appendChild(el("div", { class: "group-head" }, title + ' <span class="group-count">' + sorted.length + "</span>"));
      const grid = el("div", { class: "tiles" });
      sorted.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d, x.fam)));
      list.appendChild(grid);
    }

    if (sort === "kategorie") {
      const favs = entries.filter(x => isFav(x.rec));
      const rest = entries.filter(x => !isFav(x.rec));
      appendGroup("⭐ Favoriten", favs);
      FILTERS.filter(f => f.id !== "alle").forEach(f => appendGroup(f.label, rest.filter(x => recipeGroup(x.rec) === f.id)));
    } else {
      const keyFn = sort === "eiweiss"
        ? x => -sumMacros(x.res.items).eiweiss
        : sort === "volumen"
        ? x => volumeMl(x.res.items)
        : x => x.fam.name.toLowerCase();
      const sorted = entries.slice().sort((a, b) => {
        const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const ka = keyFn(a), kb = keyFn(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      const grid = el("div", { class: "tiles" });
      sorted.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d, x.fam)));
      list.appendChild(grid);
    }
  }
