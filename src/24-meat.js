  /* ---------- Fleisch- und Fisch-Tausch ----------
     Jede Gruppe hat eine Bezugsgröße (Fleisch: 20 g Huhn, Fisch: 20 g Seelachs); jede Sorte hat eine Austauschmenge:
     so viel Gramm entsprechen der Bezugsgröße. Quelle (in dieser Reihenfolge): ein eigener Wert (Vorgaben › Lebensmittel
     und Rezepte, gilt als abgestimmt), die Menge der Diätologin (20 g Huhn ≙ 30 g Rind ≙ 18 g Pute) oder – für alle
     übrigen Sorten – ein Vorschlag nach Eiweiß (gleich viel Eiweiß wie die Bezugsgröße). Eigene Lebensmittel können mit
     eigener Menge dazukommen. Getauscht wird innerhalb der Gruppe (Fleisch für Fleisch, Fisch für Fisch); danach wird
     das Rezept wie jedes andere auf Verhältnis und Kalorien eingestellt. */
  const SWAP_GROUPS = {
    fleisch: { label: "Fleisch", ref: "huhn", refGrams: 20, items: {
      huhn: { food: "Hühnerbrust ohne Haut", label: "Huhn", word: "Hendl", grams: 20 },
      pute: { food: "Putenbrust ohne Haut", label: "Pute", word: "Putenfleisch", grams: 18 },
      rind: { food: "Rinderfaschiertes", label: "Rind", word: "Rinderfaschiertes", grams: 30 },
      schwein: { food: "Schweinefilet", label: "Schwein", word: "Schweinefilet" },
      kalb: { food: "Kalbsschnitzelfleisch", label: "Kalb", word: "Kalbfleisch" },
    }, words: /Rinderfaschiertes|Rinder-Faschiertes|Hühnerfleisch|Hühnerbrust|Putenfleisch|Putenbrust|Schweinefilet|Schweinefleisch|Kalbsschnitzelfleisch|Kalbfleisch|Faschiertes|Rindfleisch|Hendl|Hühnchen|Pute|Huhn|Rind/g },
    fisch: { label: "Fisch", ref: "seelachs", refGrams: 20, items: {
      seelachs: { food: "Seelachsfilet (Alaska-Seelachs, TK)", label: "Seelachs", word: "Seelachs" },
      kabeljau: { food: "Kabeljaufilet (TK oder frisch)", label: "Kabeljau", word: "Kabeljau" },
      forelle: { food: "Forelle TK oder Frisch", label: "Forelle", word: "Forelle" },
      lachs: { food: "Lachsfilet (TK oder frisch)", label: "Lachs", word: "Lachs" },
      scholle: { food: "Scholle TK oder Frisch", label: "Scholle", word: "Scholle" },
    }, words: /Seelachsfilet|Seelachs|Kabeljaufilet|Kabeljau|Forellenfilet|Forelle|Lachsfilet|Lachs|Schollenfilet|Scholle/g },
  };
  // Alle Sorten einer Gruppe – die festen und eigene Lebensmittel, die für diesen Tausch freigegeben sind („cf:Name“)
  function swapItems(group) {
    const g = SWAP_GROUPS[group]; if (!g) return {};
    const out = Object.assign({}, g.items);
    ((typeof state !== "undefined" && state && state.customFoods) || []).forEach(f => {
      if (f.swap === group && lookup(f.name)) out["cf:" + f.name] = { food: f.name, label: f.name, word: f.name, custom: true };
    });
    return out;
  }
  function swapItem(key) {
    for (const g in SWAP_GROUPS) { const it = swapItems(g)[key]; if (it) return Object.assign({ group: g }, it); }
    return null;
  }
  // Bezugsgröße einer Gruppe: { key, food, label, grams }
  function swapRef(group) {
    const g = SWAP_GROUPS[group]; if (!g) return null;
    const it = g.items[g.ref]; return { key: g.ref, food: it.food, label: it.label, grams: g.refGrams };
  }
  // Menge mit gleich viel Eiweiß wie die Bezugsgröße der Gruppe
  function swapProteinGrams(food, group) {
    const r = swapRef(group), f = lookup(food), ref = r && lookup(r.food);
    return f && ref && f.eiweiss > 0 ? Math.round(r.grams * ref.eiweiss / f.eiweiss) : null;
  }
  // Menge, die der Bezugsgröße entspricht, und woher sie stammt: "ref" | "eigen" | "diaet" | "eiweiss"
  function swapEquiv(key) {
    const it = swapItem(key); if (!it) return null;
    if (key === SWAP_GROUPS[it.group].ref) return { grams: SWAP_GROUPS[it.group].refGrams, src: "ref" };
    if (it.custom) {
      const cf = (state.customFoods || []).find(f => "cf:" + f.name === key);
      if (cf && num(cf.swapGrams) > 0) return { grams: num(cf.swapGrams), src: "eigen" };
    } else {
      const ov = state.settings.swapGrams && num(state.settings.swapGrams[key]);
      if (ov > 0) return { grams: ov, src: "eigen" };
      if (it.grams) return { grams: it.grams, src: "diaet" };
    }
    const g = swapProteinGrams(it.food, it.group);
    return g ? { grams: g, src: "eiweiss" } : null;
  }
  function meatKeyOfFood(name) {
    for (const g in SWAP_GROUPS) { const its = swapItems(g); for (const k in its) if (its[k].food === name) return k; }
    return null;
  }
  // Tauschbare Zutat eines Rezepts (die erste Fleisch- bzw. Fischsorte)
  function recipeMeatSlot(rec) {
    for (let i = 0; i < rec.items.length; i++) {
      const k = meatKeyOfFood(rec.items[i].food);
      if (k && swapEquiv(k)) return { index: i, baseKey: k, group: swapItem(k).group, baseGrams: num(rec.items[i].grams) };
    }
    return null;
  }
  function meatGramsFor(slot, key) {
    const a = swapEquiv(slot.baseKey), b = swapEquiv(key);
    return a && b ? round1(slot.baseGrams / a.grams * b.grams) : slot.baseGrams;
  }
  // Tausch ist nur temporär (gilt für das gerade geöffnete Rezept, nichts wird gespeichert).
  function applyMeatChoice(rec, choice) {
    const slot = recipeMeatSlot(rec); if (!slot) return rec;
    if (!choice || choice === slot.baseKey) return rec;
    const it = swapItem(choice); if (!it || it.group !== slot.group) return rec;
    const grams = meatGramsFor(slot, choice);
    const items = rec.items.map((x, i) => i === slot.index ? { food: it.food, grams: grams } : x);
    return Object.assign({}, rec, { items: items });
  }
  // Zubereitungstext: Sortenwörter der Gruppe durch die gewählte Sorte ersetzen
  function adaptPrep(text, rec, choice) {
    if (!text) return text;
    const slot = recipeMeatSlot(rec); if (!slot) return text;
    let it = swapItem(choice || slot.baseKey); if (!it || it.group !== slot.group) it = swapItem(slot.baseKey);
    return text.replace(SWAP_GROUPS[slot.group].words, it.word);
  }
