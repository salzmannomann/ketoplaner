  /* ---------- Helpers ---------- */
  function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
  function round1(v) { return Math.round(v * 10) / 10; }
  function fmt(v, dec) {
    if (v === "" || v === null || v === undefined || !isFinite(v)) return "—";
    const d = dec === undefined ? 1 : dec;
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d))
      .toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  // Verhältnis-Notation (Fett : Eiweiß+KH): ≥ 1 als „1,8:1", < 1 als „1:1,5".
  function fmtRatio(r, dec) {
    if (r === null || r === undefined || !isFinite(r) || r <= 0) return "—";
    return r >= 1 ? fmt(r, dec) + ":1" : "1:" + fmt(1 / r, dec);
  }
  // Ziel-Verhältnis kompakt: so viele Nachkommastellen wie nötig (max. 2).
  function fmtTarget(r) {
    if (!(r > 0) || !isFinite(r)) return "—";
    const v = r >= 1 ? r : 1 / r;
    const dec = Math.abs(v - Math.round(v)) < 0.005 ? 0 : (Math.abs(v * 10 - Math.round(v * 10)) < 0.05 ? 1 : 2);
    return fmtRatio(r, dec);
  }
  // Eingabe „1,8", „1.8", „1,8:1" oder „1:1,5" → Zahl (g Fett je 1 g Eiweiß+KH); 0 wenn ungültig.
  function parseRatio(text) {
    const t = String(text || "").replace(/,/g, ".").replace(/\s+/g, "");
    const m = t.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (m) { const a = parseFloat(m[1]), b = parseFloat(m[2]); return a > 0 && b > 0 ? a / b : 0; }
    if (!/^\d+(?:\.\d+)?$/.test(t)) return 0;
    const n = parseFloat(t); return isFinite(n) && n > 0 ? n : 0;
  }
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // Zubereitungstext in nummerierte Schritte zerlegen (Satzende + Großbuchstabe; kein Lookbehind wegen iOS-Safari).
  function splitSteps(text) {
    if (!text) return [];
    const guarded = String(text).replace(/z\. B\./g, "z. B.");
    return guarded.split(/\.\s+(?=[A-ZÄÖÜ])/).map(s => s.trim()).filter(Boolean)
      .map(s => (/[.!?]$/.test(s) ? s : s + ".").replace(/z\. B\./g, "z. B."));
  }
