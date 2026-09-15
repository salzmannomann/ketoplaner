  /* ---------- Rezeptfamilien, Favoriten & Rezeptquellen ----------
     Ein „Gericht“ (Familie) fasst die Fettbasis-Varianten eines Rezepts zusammen,
     z. B. „Hendl & Zucchini“ (Rapsöl) und „Hendl & Zucchini (mit KetoCal)“.
     Favoriten, gemerkte Menge und Wasser gelten je Gericht; der Tagesplan merkt
     sich die konkrete Variante. */
  function hasKetoCal(items) { return items.some(it => (it.food || "").toLowerCase().indexOf("ketocal") !== -1); }
  function recipeKey(rec) { return rec.custom ? rec.key : ("std:" + rec.name); }
  const FAMILY_STRIP_RE = / \(mit KetoCal\)|, mit KetoCal/g;
  function familyOf(rec) { return rec.custom ? rec.name : (rec.familie || rec.name.replace(FAMILY_STRIP_RE, "")); }
  function familyKey(rec) { return rec.custom ? rec.key : ("fam:" + familyOf(rec)); }
  function isFav(rec) { return state.favorites.indexOf(familyKey(rec)) !== -1; }
  function toggleFav(rec) {
    const k = familyKey(rec), i = state.favorites.indexOf(k);
    if (i === -1) state.favorites.push(k); else state.favorites.splice(i, 1);
    save();
  }
  // Alle Rezepte: zuerst eigene, dann Standard; ketocal/Tags abgeleitet
  function allRecipes() {
    const saved = state.savedRecipes.map(sr => ({
      custom: true, key: sr.key, name: sr.name, icon: sr.icon || "📝",
      ketocal: hasKetoCal(sr.items), items: sr.items,
      thermomix: sr.thermomix || "Zutaten vorbereiten, gemeinsam fein pürieren und das Fett glatt unterrühren.",
      zubereitung: sr.zubereitung || "Eigenes Rezept – Zutaten vorbereiten, fein pürieren und das Fett untermischen.",
    }));
    return saved.concat(RECIPES_SONDE);
  }
  // Fettbasis einer Variante als Kurztext: „Rapsöl“, „Butter“, „KetoCal + Butter“ …
  function basisLabel(rec) {
    const fi = fatItemIndex(rec.items);
    const lever = fi >= 0 ? String(rec.items[fi].food).replace(/ NÖM$/, "") : "";
    if (hasKetoCal(rec.items)) return lever && !/ketocal/i.test(lever) ? "KetoCal + " + lever : "KetoCal";
    return lever || "ohne Fett";
  }
  // Alle Gerichte in Reihenfolge des ersten Auftretens: { key, name, icon, variants: [rec …] }
  function allFamilies() {
    const map = {}, order = [];
    allRecipes().forEach(r => {
      const k = familyKey(r);
      if (!map[k]) { map[k] = { key: k, name: familyOf(r), icon: r.icon, variants: [] }; order.push(k); }
      map[k].variants.push(r);
    });
    return order.map(k => map[k]);
  }
  function familyOfRecipe(rec) {
    const k = familyKey(rec);
    return allFamilies().find(f => f.key === k) || { key: k, name: familyOf(rec), icon: rec.icon, variants: [rec] };
  }
  // KetoCal-Phase (Vorgabe): entscheidet, welche Variante ein Gericht standardmäßig zeigt.
  function ketoPhase() { return state.settings.ketocal === "ohne" ? "ohne" : "mit"; }
  function setKetoPhase(k) {
    state.settings.ketocal = k === "ohne" ? "ohne" : "mit";
    state.basis = {}; // Einzelwahl je Gericht zurücksetzen – die Phase gilt wieder überall
    save(); renderRezepte();
  }
  // Gezeigte Variante eines Gerichts: gemerkte Wahl, sonst Phase, sonst erste.
  function chosenVariant(fam) {
    const pick = state.basis && state.basis[fam.key];
    if (pick) { const v = fam.variants.find(r => recipeKey(r) === pick); if (v) return v; }
    const wantKc = ketoPhase() === "mit";
    return fam.variants.find(r => !!r.ketocal === wantKc) || fam.variants[0];
  }
