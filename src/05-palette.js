  /* ---------- Farben: eine Quelle für Druck, PDF und Browserleiste ----------
     Dieselben Werte wie die Farbvariablen in styles.css (:root bzw. Dunkelmodus); ein Test hält beides gleich.
     Farbrollen: ink/grey/dot/rule alles Normale · red Problem · yellow Achtung (kein Fehler) · blue nur Wasser · green nur „passt“. */
  const PALETTE = { paper: "#f5f0e5", paper2: "#ebe3d3", ink: "#2a2621", ink2: "#4a443c", grey: "#645d53", dot: "#a99f8f", rule: "#d6ccba",
    red: "#ad3326", redBg: "#f5e0d8", blue: "#2c5c9a", green: "#3c6a3e", yellow: "#8a5a00", yellowBg: "#f5e9cc" };
  const PALETTE_DARK = { paper: "#1c1a16", paper2: "#24211c", ink: "#ece5d8", ink2: "#cfc7b8", grey: "#a89f90", dot: "#6b6458", rule: "#3d382f",
    red: "#f0a090", redBg: "#3e231d", blue: "#8fb3e6", green: "#9cc69a", yellow: "#e4bc68", yellowBg: "#3a3018" };
  // „#2a2621“ → [42, 38, 33] (für jsPDF)
  function rgb(hex) { const h = String(hex).replace("#", ""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
