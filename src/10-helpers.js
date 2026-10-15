  /* ---------- Helpers ---------- */
  // Zahl aus Eingabe oder Wert; ein Komma als Dezimaltrenner („8,5") wird akzeptiert.
  // Desktop-Ansicht (> 820 px): eigene Anordnung von Tagesplan, Rezepten und Vorgaben (gleiche Bausteine).
  // Wechselt die Fensterbreite über die Grenze, baut die App neu auf (siehe init).
  const DESKTOP_MQ = "(min-width: 821px)";
  // Rezept als Panel neben der Liste erst ab 1100 px – darunter stünde es unter der langen Liste (Klick → ans Seitenende)
  const PANEL_MQ = "(min-width: 1100px)";
  function isPanelWidth() { try { return !!(window.matchMedia && window.matchMedia(PANEL_MQ).matches); } catch (e) { return false; } }
  function isDesktop() { try { return !!(window.matchMedia && window.matchMedia(DESKTOP_MQ).matches); } catch (e) { return false; } }
  // Escape schließt nur die oberste Ebene: Druckvorschau vor Auswahl „Für heute“ vor Rezept-Auswahl vor Editor vor Rezept
  const LAYERS = ["action-overlay", "print-overlay", "today-sheet", "picker-overlay", "compose-overlay", "detail-overlay"];
  function topLayer() {
    for (const id of LAYERS) { const el = document.getElementById(id); if (el && !el.hidden && (id !== "detail-overlay" || !el.closest(".rz-panel"))) return id; }
    return null;
  }
  // Fehlertext für Meldungen: Netzwerkfehler („Failed to fetch“, „Load failed“) verständlich auf Deutsch
  function errorText(e) {
    const m = String(e && e.message || e || "");
    if ((typeof navigator !== "undefined" && navigator.onLine === false) || /failed to fetch|load failed|networkerror|network request failed/i.test(m))
      return "keine Verbindung zum Dienst – bitte später noch einmal versuchen";
    return m || "unbekannter Fehler";
  }
  // Umschalter (Segment-Knöpfe): Zustand auch für Screenreader – aria-pressed folgt der Markierung „active“.
  // Ein Beobachter erledigt das für alle Leisten (Vorgaben, Rezept, Editor), auch nach jedem Neuzeichnen.
  function markPressed(root) {
    (root || document).querySelectorAll(".seg-ink button:not([role=tab])").forEach(b => {
      const v = b.classList.contains("active") ? "true" : "false"; if (b.getAttribute("aria-pressed") !== v) b.setAttribute("aria-pressed", v);
    });
  }
  if (typeof document !== "undefined" && typeof MutationObserver === "function") document.addEventListener("DOMContentLoaded", () => {
    markPressed();
    new MutationObserver(() => markPressed()).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  });
  function num(v) { const n = parseFloat(typeof v === "string" ? v.replace(",", ".") : v); return isFinite(n) ? n : 0; }
  // Zahl zur Anzeige in einem Textfeld: deutsches Komma, keine überflüssigen Nullen („8,5", „9").
  function fmtNum(v) { return (v === "" || v === null || v === undefined || !isFinite(v)) ? "" : String(v).replace(".", ","); }
  function round1(v) { return Math.round(v * 10) / 10; }
  // Auf einen Schritt runden (0,1 / 0,5 / 1 g) – Fließkomma-sauber auf 3 Nachkommastellen.
  function roundTo(v, step) { const st = step > 0 ? step : 0.1; return Math.round(Math.round(v / st) * st * 1000) / 1000; }
  function fmt(v, dec) {
    if (v === "" || v === null || v === undefined || !isFinite(v)) return "—";
    const d = dec === undefined ? 1 : dec;
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d))
      .toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  // Verhältnis-Notation (Fett : Eiweiß+KH): immer „x:1" – auch unter 1 (z. B. „0,67:1"), damit die Zahl
  // vorne immer die eingegebene ist.
  function fmtRatio(r, dec) {
    if (r === null || r === undefined || !isFinite(r) || r <= 0) return "—";
    return fmt(r, dec) + ":1";
  }
  // Ziel-Verhältnis: nur die vordere Zahl, so viele Nachkommastellen wie nötig (max. 2).
  function fmtRatioNum(r) {
    if (!(r > 0) || !isFinite(r)) return "";
    const dec = Math.abs(r - Math.round(r)) < 0.005 ? 0 : (Math.abs(r * 10 - Math.round(r * 10)) < 0.05 ? 1 : 2);
    return fmt(r, dec);
  }
  function fmtTarget(r) { return (r > 0 && isFinite(r)) ? fmtRatioNum(r) + ":1" : "—"; }
  // Anzeige in der Oberfläche (Küchenzettel): „1,8 : 1“ mit Abständen; Ausdruck/PDF bleiben bei „1,8:1“.
  function fmtRx(r) { return (r > 0 && isFinite(r)) ? fmtRatioNum(r) + " : 1" : "—"; }
  function fmtRxA(r, dec) { const t = fmtRatio(r, dec); return t === "—" ? t : t.replace(":1", " : 1"); }
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
  // Kurze Meldung unten am Bildschirm (über Overlays), mit optionalen Knöpfen [Beschriftung, Aktion]; verschwindet nach 7 s.
  let toastTimer = null;
  function showToast(html, buttons) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    // „Rückgängig“ als unterstrichener Text, weitere Aktionen (z. B. „Ansehen“) als helle Pille
    t.innerHTML = '<span class="toast-msg">' + html + '</span>' + (buttons || []).map((b, i) => '<button type="button" class="toast-btn' + (i > 0 ? " pill" : "") + '" data-ti="' + i + '">' + b[0] + '</button>').join("");
    t.querySelectorAll(".toast-btn").forEach(b => b.addEventListener("click", () => { hideToast(); buttons[num(b.dataset.ti)][1](); }));
    t.hidden = false; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 7000);
  }
  function hideToast() { const t = document.getElementById("toast"); if (t) { t.classList.remove("show"); t.hidden = true; } clearTimeout(toastTimer); }
  // Einfache Strich-Symbole (statt Emojis) für runde Knöpfe; erben die Textfarbe.
  const SVG_ATTR = 'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const ICON = {
    star: '<svg ' + SVG_ATTR + '><polygon class="star" points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    print: '<svg ' + SVG_ATTR + '><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><path d="M6 14h12v7H6z"/></svg>',
    edit: '<svg ' + SVG_ATTR + '><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>',
    share: '<svg ' + SVG_ATTR + '><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/></svg>',
    trash: '<svg ' + SVG_ATTR + '><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  };
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // Zubereitungstext in nummerierte Schritte zerlegen (Satzende + Großbuchstabe; kein Lookbehind wegen iOS-Safari).
  function splitSteps(text) {
    if (!text) return [];
    // Emojis aus den Rezeptdaten (z. B. „✏️ Editor“) in der Oberfläche weglassen – die Daten bleiben unverändert
    const guarded = String(text).replace(/\s?[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?/gu, "").replace(/z\. B\./g, "z. B.");
    return guarded.split(/\.\s+(?=[A-ZÄÖÜ])/).map(s => s.trim()).filter(Boolean)
      .map(s => (/[.!?]$/.test(s) ? s : s + ".").replace(/z\. B\./g, "z. B."));
  }
  /* ---------- Hintergrund einfrieren, solange ein Overlay offen ist ----------
     „overflow: hidden“ am body reicht auf iOS Safari nicht – die Seite dahinter scrollt beim Wischen mit.
     Deshalb wird der body fixiert (position: fixed) und die Scrollposition gemerkt und beim Schließen
     wiederhergestellt. Mehrere Overlays (Detail → Editor, Picker) werden gezählt. */
  const openModals = new Set();
  let lockedScrollY = 0;
  // Fenster (Rezept, Auswahl, Editor, Druckvorschau): Hintergrund für Tastatur und Screenreader sperren, Fokus ins
  // Fenster setzen und beim Schließen dorthin zurückgeben, wo er vorher war.
  const focusBack = {};
  const BACKDROP = ["main", ".topbar", ".tabbar", "#side", ".footnote"];
  function setBackdropInert(on) {
    BACKDROP.forEach(sel => document.querySelectorAll(sel).forEach(el => { if (on) el.setAttribute("inert", ""); else el.removeAttribute("inert"); }));
  }
  function modalOpen(id) {
    if (openModals.size === 0) {
      lockedScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      document.body.classList.add("modal-open");
      document.body.style.top = -lockedScrollY + "px";
    }
    if (!openModals.has(id)) focusBack[id] = document.activeElement;
    openModals.add(id);
    setBackdropInert(true);
    const ov = document.getElementById(id + "-overlay");
    if (ov) setTimeout(() => {
      if (ov.hidden || ov.contains(document.activeElement)) return; // z. B. Auswahl: Suchfeld hat den Fokus schon
      const card = ov.querySelector(".overlay-card") || ov.querySelector(".print-bar") || ov;
      if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "-1");
      try { card.focus({ preventScroll: true }); } catch (e) {}
    }, 0);
  }
  function modalClose(id) {
    openModals.delete(id);
    if (openModals.size === 0) {
      document.body.classList.remove("modal-open");
      document.body.style.top = "";
      setBackdropInert(false);
      try { window.scrollTo(0, lockedScrollY); } catch (e) {}
    }
    const back = focusBack[id]; delete focusBack[id];
    if (back && back.isConnected && typeof back.focus === "function") { try { back.focus({ preventScroll: true }); } catch (e) {} }
  }
