  /* ---------- Rezeptfamilien, Favoriten & Rezeptquellen ----------
     Ein „Gericht“ (Familie) fasst die Fettbasis-Varianten eines Rezepts zusammen,
     z. B. „Hendl & Zucchini“ (Rapsöl) und „Hendl & Zucchini (mit KetoCal)“.
     Favoriten, gemerkte Menge und Wasser gelten je Gericht; der Tagesplan merkt
     sich die konkrete Variante. */
  function hasKetoCal(items) { return items.some(it => (it.food || "").toLowerCase().indexOf("ketocal") !== -1); }
  function recipeKey(rec) { return rec.custom ? rec.key : ("std:" + rec.name); }
  const FAMILY_STRIP_RE = / \(mit KetoCal\)|, mit KetoCal/g;
  function familyOf(rec) { return rec.custom ? rec.name : (rec.familie || rec.name.replace(FAMILY_STRIP_RE, "")); }
  /* Anzeigename (nur Anzeige – Schlüssel bleiben die vollen Datennamen): Klammerzusätze „(mit KetoCal)“, „(Obstbrei)“ und
     „(Obstbrei, mit KetoCal)“ fallen weg; enthält das Rezept KetoCal und steht „KetoCal“ nicht schon im Namen, folgt der
     Zusatz „mit KetoCal“ – unabhängig davon, ob es ein Geschwisterrezept gibt. Sondennahrung wie „Compleat & KetoCal“
     bleibt ohne Zusatz. */
  function displayName(rec) {
    const name = String(rec && rec.name || "").replace(/ \((?:Obstbrei, mit KetoCal|mit KetoCal|Obstbrei)\)/g, "").replace(/, mit KetoCal/g, "").trim();
    return { name, suffix: rec && rec.ketocal && !/ketocal/i.test(name) ? "mit KetoCal" : "" };
  }
  // als Text („Rind & Karotte · mit KetoCal“) und als HTML (Zusatz klein und grau in .name-suffix)
  function displayText(rec) { const dn = displayName(rec); return dn.name + (dn.suffix ? " · " + dn.suffix : ""); }
  function displayHtml(rec) { const dn = displayName(rec); return escapeHtml(dn.name) + (dn.suffix ? '<span class="name-suffix"> · ' + escapeHtml(dn.suffix) + "</span>" : ""); }
  function familyKey(rec) { return rec.custom ? rec.key : ("fam:" + familyOf(rec)); }
  // Favoriten gelten je Rezept (Variante); ältere Favoriten je Gericht („fam:…“) zählen weiter.
  function isFav(rec) { return state.favorites.indexOf(recipeKey(rec)) !== -1 || state.favorites.indexOf(familyKey(rec)) !== -1; }
  function toggleFav(rec) {
    const k = recipeKey(rec), fk = familyKey(rec);
    if (isFav(rec)) state.favorites = state.favorites.filter(x => x !== k && x !== fk);
    else state.favorites.push(k);
    save();
  }
  // Alle Rezepte: zuerst eigene, dann Standard; ketocal/Tags abgeleitet
  function allRecipes() {
    const saved = state.savedRecipes.map(sr => ({
      custom: true, key: sr.key, name: sr.name, icon: sr.icon || "📝",
      ketocal: hasKetoCal(sr.items), items: sr.items,
      // Öl kommt nicht in den Mixer (eigener letzter Schritt „in jede Portion einrühren“); Butter/Obers schon.
      thermomix: sr.thermomix || "Zutaten vorbereiten und mit dem Wasser gemeinsam fein pürieren; Butter, Obers oder Creme gleich mitpürieren (Öl nicht).",
      zubereitung: sr.zubereitung || "Eigenes Rezept – Zutaten vorbereiten und mit dem Wasser fein pürieren; Butter, Obers oder Creme gleich mitpürieren (Öl nicht).",
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
  // Jedes Rezept steht für sich (mit oder ohne KetoCal). Gibt es ein Gericht in beiden Fettbasen, sind das
  // zwei Einträge; „Geschwister“ ist die jeweils andere Variante (für den „Auch als“-Link im Rezept).
  function siblingVariants(rec) { return familyOfRecipe(rec).variants.filter(v => recipeKey(v) !== recipeKey(rec)); }
  function isMulti(rec) { return familyOfRecipe(rec).variants.length > 1; }
