  /* ---------- Gruppen & Schnellfilter ----------
     Die Rezepte sind nach der Hauptzutat gruppiert („Was habe ich da?“):
     Geflügel, Rind & Schwein, Fisch, Ei, Erdäpfel & Gemüse, Obst & Brei und
     „Angerührt“ (ohne Kochen: Fertigprodukte und Pulver-Mischungen). */
  const FILTERS = [
    { id: "alle", label: "Alle" },
    { id: "gefluegel", label: "🍗 Geflügel" },
    { id: "rind", label: "🥩 Rind & Schwein" },
    { id: "fisch", label: "🐟 Fisch" },
    { id: "ei", label: "🥚 Ei" },
    { id: "gemuese", label: "🥔 Erdäpfel & Gemüse" },
    { id: "obst", label: "🍓 Obst & Brei" },
    { id: "angeruehrt", label: "🥄 Angerührt" },
  ];
  // Primäre Gruppe eines Rezepts (aus den Zutaten abgeleitet; Fleisch/Fisch haben Vorrang).
  function recipeGroup(rec) {
    if (rec.angeruehrt) return "angeruehrt";
    let g = null, egg = false, fruit = false;
    rec.items.forEach(it => {
      const f = lookup(it.food); if (!f) return;
      const k = f.kategorie, n = it.food || "";
      if (k === "Fleisch" || k === "Wurst") g = g || (/hühner|puten|hendl|pute|huhn/i.test(n) ? "gefluegel" : "rind");
      else if (k === "Fisch") g = g || "fisch";
      if (k === "Eier") egg = true;
      if (k === "Obst") fruit = true;
    });
    return g || (egg ? "ei" : fruit ? "obst" : "gemuese");
  }
  function matchesFilter(rec, filter) {
    return !filter || filter === "alle" || recipeGroup(rec) === filter;
  }
