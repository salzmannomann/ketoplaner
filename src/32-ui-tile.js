  /* ---------- Kachel (Übersicht) – eine je Gericht, zeigt die aktive Fettbasis-Variante ---------- */
  function renderRecipeTile(rec, res, d, fam) {
    const sum = sumMacros(res.items);
    const r = ratioOf(sum);
    const totalG = res.items.reduce((a, it) => a + num(it.grams), 0);
    const ml = volumeMl(res.items);
    const proteinOk = sum.eiweiss >= d.eiweissMahl * 0.9;
    const name = fam ? fam.name : familyOf(rec);
    const multi = !!fam && fam.variants.length > 1;

    // Packung: Aufteilung und Auffüller als Kennzeichen, damit die Liste zeigt, was gerechnet wird.
    let packBadges = "";
    if (rec.packung) {
      const ps = packSetting(familyKey(rec));
      if (ps.n > 0) packBadges += '<span class="badge basis">🧃 auf ' + ps.n + '</span>';
      if (res.items.some(it => it.food === rec.packung.auffuellen)) packBadges += '<span class="badge basis">+ ' + escapeHtml(rec.packung.kurz || rec.packung.auffuellen) + '</span>';
    }

    const fav = isFav(rec);
    const tile = el("div", { class: "tile", tabindex: "0", role: "button" });
    tile.innerHTML =
      '<div class="tile-head">' +
        '<span class="tile-icon">' + (rec.icon || "🥑") + "</span>" +
        '<button class="favbtn' + (fav ? " on" : "") + '" title="Favorit">' + (fav ? "★" : "☆") + "</button>" +
      "</div>" +
      '<div class="tile-name">' + escapeHtml(name) + "</div>" +
      '<div class="tile-badge">' +
        // Fettbasis: bei mehreren Varianten die aktive (⇄ = umschaltbar), sonst nur ein KetoCal-Kennzeichen.
        (multi ? '<span class="badge basis">⇄ ' + escapeHtml(basisLabel(rec)) + "</span>"
               : (rec.ketocal ? '<span class="badge keto-mini">🥄 KetoCal</span>' : "")) +
        packBadges +
        (rec.custom ? '<span class="badge custom">eigenes</span>' : "") +
        (rec.quelle ? '<span class="badge quelle">👩‍⚕️ Diätologie</span>' : "") +
        (ratioClass(r, d.ratio) !== "ok" ? '<span class="ratio-pill ' + ratioClass(r, d.ratio) + '">' + fmtRatio(r, 2) + "</span>" : "") +
      "</div>" +
      '<div class="tile-stats">' +
        "<span>" + fmt(sum.kcal, 0) + " kcal</span>" +
        "<span>≈ " + fmt(totalG, 0) + " g / " + fmt(ml, 0) + " ml</span>" +
        '<span class="' + (proteinOk ? "prot-ok" : "prot-low") + '">Eiweiß ' + fmt(sum.eiweiss) + " g</span>" +
      "</div>" +
      '<div class="tile-cta">Rezept ansehen →</div>';
    const open = () => openRecipeDetail(rec);
    tile.addEventListener("click", open);
    tile.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    tile.querySelector(".favbtn").addEventListener("click", e => { e.stopPropagation(); toggleFav(rec); renderRezepte(); });
    return tile;
  }
