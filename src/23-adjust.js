  /* ---------- Rezept-Anpassung ---------- */
  // Stell-Zutat zum Ausgleich = am stärksten fettdominante Zutat
  // (höchstes Fett/(Eiweiß+KH)). Erkennt Butter/Öl wie auch Sahne/Streichgenuss.
  function fatItemIndex(items) {
    let idx = -1, best = -1;
    items.forEach((it, i) => {
      const f = lookup(it.food); if (!f || f.fett <= 0) return;
      const denom = f.eiweiss + f.kh;
      const rr = denom > 0 ? f.fett / denom : Infinity;
      if (rr > best) { best = rr; idx = i; }
    });
    return idx;
  }
  // Rechnet Rezept auf Ziel-Verhältnis + Ziel-Kalorien um.
  function computeAdjustedRecipe(rec, targetKcal, ratio) {
    const base = rec.items.map(it => ({ food: it.food, grams: num(it.grams) }));
    const baseSum = sumMacros(base);
    const T = (targetKcal && targetKcal > 0) ? targetKcal : baseSum.kcal;
    const fi = fatItemIndex(base);
    if (fi < 0) {
      const s = baseSum.kcal > 0 ? T / baseSum.kcal : 1;
      const items = base.map(it => ({ food: it.food, grams: round1(it.grams * s) }));
      const sum = sumMacros(items);
      return { items, ratio: ratioOf(sum), kcal: sum.kcal, ok: false, fatIndex: -1 };
    }
    const fat = lookup(base[fi].food);
    let Pn = 0, Fn = 0, Cn = 0, Kn = 0;
    base.forEach((it, i) => {
      if (i === fi) return;
      const f = lookup(it.food); if (!f) return;
      Pn += f.eiweiss * it.grams / 100; Fn += f.fett * it.grams / 100; Cn += f.kh * it.grams / 100;
      Kn += kcal100Of(f) * it.grams / 100;
    });
    const fp = fat.eiweiss, ff = fat.fett, fc = fat.kh;
    const A = Fn - ratio * (Pn + Cn);
    const B = (ff - ratio * (fp + fc)) / 100;
    const kf = kcal100Of(fat);
    let x, s;
    if (Math.abs(A) < 1e-9) { x = 0; s = Kn > 0 ? T / Kn : 1; }
    else {
      const denom = kf / 100 - B * Kn / A;
      if (Math.abs(denom) < 1e-9) return { items: base, ratio: ratioOf(baseSum), kcal: baseSum.kcal, ok: false, fatIndex: fi };
      x = T / denom; s = -x * B / A;
    }
    if (x < 0 || s <= 0) return { items: base, ratio: ratioOf(baseSum), kcal: baseSum.kcal, ok: false, fatIndex: fi };
    const items = base.map((it, i) => i === fi
      ? { food: it.food, grams: round1(x) }
      : { food: it.food, grams: round1(it.grams * s) });
    const sum = sumMacros(items);
    return { items, ratio: ratioOf(sum), kcal: sum.kcal, ok: true, fatIndex: fi };
  }
  // Fleisch-Tausch: alle anderen Zutaten (Gemüse, Wasser, Öl/Fett) bleiben fix;
  // nur die Fleischmenge wird so berechnet, dass das Verhältnis exakt stimmt.
  // (Kalorien dürfen sich dabei leicht ändern.)
  function solveMeatForRatio(items, mi, ratio) {
    let F = 0, PC = 0;
    items.forEach((it, i) => {
      if (i === mi) return; const f = lookup(it.food); if (!f) return;
      const g = num(it.grams); F += f.fett * g / 100; PC += (f.eiweiss + f.kh) * g / 100;
    });
    const mf = lookup(items[mi].food); if (!mf) return null;
    const denom = mf.fett / 100 - ratio * (mf.eiweiss + mf.kh) / 100;
    if (Math.abs(denom) < 1e-9) return null;
    const m = (ratio * PC - F) / denom;
    if (!(m > 0)) return null;
    return items.map((it, i) => i === mi
      ? { food: it.food, grams: round1(m) }
      : { food: it.food, grams: round1(num(it.grams)) });
  }
  /* ---------- Packungs-Modus ----------
     Eine Zutat (z. B. Compleat) ist fest: Packung ÷ N Mahlzeiten. Zwei Hebel werden gleichzeitig
     gelöst – das Fett (KetoCal) fürs Verhältnis und ein KH-reicher Auffüller (Pre Apta) für die
     Kalorien – sodass Verhältnis UND kcal je Mahlzeit exakt stimmen (2×2 lineares System).
     Übrige Zutaten (Wasser) skalieren proportional zur festen Zutat. */
  // mode "verhaeltnis" (Standard): nur KetoCal als Hebel – Verhältnis exakt, Kalorien dürfen abweichen,
  //   aber nicht unter minKcal: dann wird mit dem Auffüller nur bis zum Minimum aufgefüllt.
  // mode "kalorien": zusätzlich der Auffüller – Verhältnis UND Kalorien exakt.
  // fill === false: kein Auffüller – dann wird in jedem Modus nur das Verhältnis gehalten (Minimum ggf. unterschritten).
  function computePackSplit(rec, targetKcal, ratio, n, mode, minKcal, fill) {
    const useFill = fill !== false;
    const pk = rec.packung; if (!pk || !(n > 0)) return null;
    const fixedMl = pk.ml / n;
    const base = rec.items.map(it => ({ food: it.food, grams: num(it.grams) }));
    const fixIdx = base.findIndex(it => it.food === pk.food);
    const fi = fatItemIndex(base);
    if (fixIdx < 0 || fi < 0 || fi === fixIdx) return null;
    const fat = lookup(base[fi].food), filler = lookup(pk.auffuellen);
    if (!fat || !filler) return null;
    const scale = base[fixIdx].grams > 0 ? fixedMl / base[fixIdx].grams : 1;
    let P = 0, F = 0, C = 0, Kc = 0;
    base.forEach((it, i) => {
      if (i === fi) return;
      const f = lookup(it.food); if (!f) return;
      const g = i === fixIdx ? fixedMl : it.grams * scale;
      P += f.eiweiss * g / 100; F += f.fett * g / 100; C += f.kh * g / 100; Kc += kcal100Of(f) * g / 100;
    });
    const a1 = (fat.fett - ratio * (fat.eiweiss + fat.kh)) / 100, b1 = (filler.fett - ratio * (filler.eiweiss + filler.kh)) / 100;
    const c1 = ratio * (P + C) - F;
    const a2 = kcal100Of(fat) / 100, b2 = kcal100Of(filler) / 100, c2 = targetKcal - Kc;
    let k, p, filledToMin = false, kcalFree = null;
    const solve2 = (cK) => { const det = a1 * b2 - a2 * b1; if (Math.abs(det) < 1e-9) return null; return { k: (c1 * b2 - cK * b1) / det, p: (a1 * cK - a2 * c1) / det }; };
    if (mode === "kalorien" && useFill) {
      const s2 = solve2(c2); if (!s2) return null; k = s2.k; p = s2.p;
    } else {
      if (Math.abs(a1) < 1e-9) return null;
      k = c1 / a1; p = 0;
      kcalFree = Kc + k * a2;
      if (useFill && minKcal > 0 && kcalFree < minKcal - 0.5) {
        const s2 = solve2(minKcal - Kc);
        if (s2 && s2.k >= 0 && s2.p > 0) { k = s2.k; p = s2.p; filledToMin = true; }
      }
    }
    const ok = k >= 0 && p >= -0.05;
    const items = [];
    base.forEach((it, i) => {
      if (i === fi) items.push({ food: it.food, grams: round1(Math.max(0, k)) });
      else if (i === fixIdx) items.push({ food: it.food, grams: round1(fixedMl) });
      else items.push({ food: it.food, grams: round1(it.grams * scale) });
    });
    if (p > 0.05) items.splice(items.findIndex(it => it.food === pk.food) + 1, 0, { food: pk.auffuellen, grams: round1(p) });
    const sum = sumMacros(items);
    return { items, ratio: ratioOf(sum), kcal: sum.kcal, ok, fatIndex: items.findIndex(it => it.food === base[fi].food),
      pack: { n, fixedMl, k, p, mode: mode === "kalorien" ? "kalorien" : "verhaeltnis", dev: sum.kcal - targetKcal, filledToMin, kcalFree, minKcal,
        fill: useFill, belowMin: minKcal > 0 && sum.kcal < minKcal - 0.5 } };
  }
  // Gemerkte Packungs-Aufteilung je Gericht (Zahl oder { n, fill }); der Modus ist die globale Rechenregel (Vorgaben).
  function packSetting(key) {
    const v = (state.pack || {})[key];
    const n = !v ? 0 : (typeof v === "number" ? v : num(v.n));
    const fill = !(v && typeof v === "object" && v.fill === false);
    return { n, fill, mode: state.settings.mctMode === "kalorien" ? "kalorien" : "verhaeltnis" };
  }
  // Packungs-Übersicht ohne Aufteilung: Menge je Mahlzeit laut Standardrechnung → Mahlzeiten je Packung.
  function packInfo(rec, d) {
    const pk = rec.packung; if (!pk) return null;
    const std = computeAdjustedRecipe(rec, d.kcalMahl, d.ratio);
    const mlStd = std.items.filter(it => it.food === pk.food).reduce((a, it) => a + num(it.grams), 0);
    const nAuto = mlStd > 0 ? Math.floor(pk.ml / mlStd + 1e-9) : 0;
    return { pk, mlStd, nAuto, rest: pk.ml - nAuto * mlStd };
  }
