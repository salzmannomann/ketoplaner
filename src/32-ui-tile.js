  /* ---------- Kachel (Übersicht) – eine je Gericht, zeigt die aktive Fettbasis-Variante ---------- */
  // Rezeptzeile (Küchenzettel): Name (Serif), darunter Mono „128 kcal · 131 ml · Eiweiß 2,4 g“ (Eiweiß grün ok,
  // rot mit „hoch“/„niedrig“), darunter grau „Diätologie · KetoCal + Butter“ statt bunter Schilder; rechts der Stern.
  const STAR_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  function renderRecipeTile(rec, res, d, fam) {
    const sum = sumMacros(res.items);
    const r = ratioOf(sum);
    const ml = volumeMl(res.items);
    const pState = proteinState(sum.eiweiss, d.eiweissMahl);
    const name = fam ? fam.name : familyOf(rec);
    const multi = isMulti(rec);
    const fav = isFav(rec);
    const tags = [];
    if (rec.quelle) tags.push("Diätologie");
    if (multi || rec.ketocal) tags.push(escapeHtml(basisLabel(rec)));
    if (rec.custom) tags.push("eigenes Rezept");
    const tile = el("div", { class: "tile", tabindex: "0", role: "button", "data-key": recipeKey(rec) });
    tile._rec = rec; // Desktop: erstes Rezept der Liste ins Panel
    tile.innerHTML =
      '<div class="tile-body"><span class="tile-name">' + escapeHtml(name) + '</span>' +
      '<span class="tile-stats">' + fmt(sum.kcal, 0) + " kcal · " + fmt(ml, 0) + " ml · " +
        '<b class="prot-' + pState + '"' + (pState === "high" ? ' title="mehr als das Doppelte des Eiweiß-Ziels"' : "") + '>Eiweiß ' + fmt(sum.eiweiss) + " g" + (pState === "high" ? " · hoch" : pState === "low" ? " · niedrig" : "") + "</b>" +
        (ratioClass(r, d.ratio) !== "ok" ? ' · <b class="ratio-pill ' + ratioClass(r, d.ratio) + '">▲ ' + fmtRxA(r, 2) + "</b>" : "") + "</span>" +
      (tags.length ? '<span class="tile-badge">' + tags.join(" · ") + "</span>" : '<span class="tile-badge" hidden></span>') +
      "</div>" +
      '<button type="button" class="favbtn' + (fav ? " on" : "") + '" title="' + (fav ? "Favorit entfernen" : "Als Favorit merken") + '" aria-pressed="' + (fav ? "true" : "false") + '" aria-label="Favorit">' + STAR_SVG + "</button>";
    const open = () => openRecipeDetail(rec);
    tile.addEventListener("click", open);
    tile.addEventListener("keydown", e => { if (e.target !== tile) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    tile.querySelector(".favbtn").addEventListener("click", e => { e.stopPropagation(); toggleFav(rec); renderRezepte(); });
    return tile;
  }
