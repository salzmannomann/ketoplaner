  /* ---------- Schnellfilter ---------- */
  const FILTERS = [
    { id: "alle", label: "Alle" },
    { id: "fleisch", label: "🥩 Fleisch" },
    { id: "fisch", label: "🐟 Fisch" },
    { id: "vegetarisch", label: "🥦 Vegetarisch" },
    { id: "obst", label: "🍓 Obst" },
    { id: "unterwegs", label: "🥫 Unterwegs" },
    { id: "flasche", label: "🍼 Flasche" },
  ];
  function recipeTags(rec) {
    let fleisch = false, fisch = false, obst = false;
    rec.items.forEach(it => {
      const f = lookup(it.food); if (!f) return;
      const k = f.kategorie;
      if (k === "Fleisch" || k === "Wurst") fleisch = true;
      if (k === "Fisch") fisch = true;
      if (k === "Obst") obst = true;
    });
    const unterwegs = !!rec.unterwegs, flasche = !!rec.flasche;
    return { fleisch, fisch, obst, unterwegs, flasche, veg: !fleisch && !fisch && !unterwegs && !flasche };
  }
  function matchesFilter(rec, filter) {
    const t = recipeTags(rec);
    switch (filter) {
      case "fleisch": return t.fleisch;
      case "fisch": return t.fisch;
      case "vegetarisch": return t.veg;
      case "obst": return t.obst;
      case "unterwegs": return t.unterwegs;
      case "flasche": return t.flasche;
      default: return true;
    }
  }
