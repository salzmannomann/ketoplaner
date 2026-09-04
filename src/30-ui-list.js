  /* ---------- Rezepte rendern ---------- */
  function renderRezepte() {
    const s = state.settings;
    const $ = id => document.getElementById(id);
    $("set-kcal").value = s.kcal;
    $("set-mahlzeiten").value = s.mahlzeiten;
    $("set-ratio").value = s.ratio;
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

    // Schnellfilter-Chips
    const filter = s.filter || "alle";
    const onlyQuelle = !!s.onlyQuelle;
    const ketoFilter = s.ketoFilter === "mit" || s.ketoFilter === "ohne" ? s.ketoFilter : "alle";
    const fb = $("filter-bar");
    fb.innerHTML = "";
    // Gruppe 1: Kategorie (entweder/oder)
    const catChips = el("div", { class: "chips cat" });
    FILTERS.forEach(f => {
      const chip = el("button", { class: "chip" + (f.id === filter ? " active" : "") }, f.label);
      chip.addEventListener("click", () => { state.settings.filter = f.id; save(); renderRezepte(); });
      catChips.appendChild(chip);
    });
    fb.appendChild(catChips);
    // Gruppe 2: KetoCal als Dreistufe (alle / ohne / mit) + Diätologie-Schalter
    const switchChips = el("div", { class: "chips switches" });
    [["alle", "🥄 alle"], ["ohne", "ohne KetoCal"], ["mit", "mit KetoCal"]].forEach(([k, lab]) => {
      const c = el("button", { class: "chip switch" + (ketoFilter === k ? " active" : "") }, lab);
      c.addEventListener("click", () => { state.settings.ketoFilter = k; save(); renderRezepte(); });
      switchChips.appendChild(c);
    });
    const qc = el("button", { class: "chip switch" + (onlyQuelle ? " active" : "") }, "👩‍⚕️ Diätologie");
    qc.addEventListener("click", () => { state.settings.onlyQuelle = !state.settings.onlyQuelle; save(); renderRezepte(); });
    switchChips.appendChild(qc);
    fb.appendChild(switchChips);

    const q = (($("recipe-search") || {}).value || "").trim().toLowerCase();
    const recipes = allRecipes()
      // Flaschen enthalten immer KetoCal – der Filter "Flasche" ignoriert daher die KetoCal-Stufe.
      .filter(r => filter === "flasche" || ketoFilter === "alle" || !!r.ketocal === (ketoFilter === "mit"))
      .filter(r => matchesFilter(r, filter))
      .filter(r => !onlyQuelle || !!r.quelle)
      .filter(r => !q || r.name.toLowerCase().indexOf(q) !== -1 || r.items.some(it => (it.food || "").toLowerCase().indexOf(q) !== -1))
      .map(rec => ({ rec, res: computeAdjustedRecipe(rec, d.kcalMahl, d.ratio) }))
      .filter(x => x.res.ok);

    $("info-note").hidden = ketoFilter === "mit";
    $("recipe-count").textContent =
      recipes.length + " Rezept" + (recipes.length === 1 ? "" : "e") +
      (ketoFilter === "mit" ? " mit KetoCal" : ketoFilter === "ohne" ? " ohne KetoCal" : "");

    const sort = s.sort || "kategorie";
    $("sort-select").value = sort;

    const list = $("recipe-list");
    list.innerHTML = "";
    if (recipes.length === 0) {
      list.appendChild(el("div", { class: "card empty" }, "Keine Rezepte für diese Auswahl."));
      return;
    }

    function appendGroup(title, arr) {
      if (!arr.length) return;
      const sorted = arr.slice().sort((a, b) => {
        const ka = a.rec.name.toLowerCase(), kb = b.rec.name.toLowerCase();
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      list.appendChild(el("div", { class: "group-head" }, title + ' <span class="group-count">' + sorted.length + "</span>"));
      const grid = el("div", { class: "tiles" });
      sorted.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d)));
      list.appendChild(grid);
    }

    if (sort === "kategorie") {
      const favs = recipes.filter(x => isFav(x.rec));
      const rest = recipes.filter(x => !isFav(x.rec));
      appendGroup("⭐ Favoriten", favs);
      [["Fleisch", "🥩 Fleisch"], ["Fisch", "🐟 Fisch"], ["Vegetarisch", "🥦 Vegetarisch"], ["Obst", "🍓 Obst"]]
        .forEach(([key, label]) => appendGroup(label, rest.filter(x => recipeGroup(x.rec) === key)));
    } else {
      const keyFn = sort === "eiweiss"
        ? x => -sumMacros(x.res.items).eiweiss
        : sort === "volumen"
        ? x => volumeMl(x.res.items)
        : x => x.rec.name.toLowerCase();
      const sorted = recipes.slice().sort((a, b) => {
        const fa = isFav(a.rec) ? 0 : 1, fb = isFav(b.rec) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const ka = keyFn(a), kb = keyFn(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      const grid = el("div", { class: "tiles" });
      sorted.forEach(x => grid.appendChild(renderRecipeTile(x.rec, x.res, d)));
      list.appendChild(grid);
    }
  }

  // Primäre Anzeige-Gruppe eines Rezepts
  function recipeGroup(rec) {
    const t = recipeTags(rec);
    if (t.fleisch) return "Fleisch";
    if (t.fisch) return "Fisch";
    if (t.obst) return "Obst";
    return "Vegetarisch";
  }
