  /* ---------- Geräte-Abgleich (freiwillig) ----------
     Gleicht Vorgaben, Tagesplan, eigene Rezepte, Favoriten und gemerkte Mengen zwischen den eigenen Geräten ab –
     über denselben Cloudflare-Dienst wie die Erinnerungen. Ende-zu-Ende verschlüsselt: Die Geräte teilen einen
     geheimen Schlüssel (AES-GCM); der Dienst kennt nur dessen SHA-256 als Adresse und speichert unlesbare Blöcke.
     Ein weiteres Gerät wird mit einem 8-stelligen Code gekoppelt (15 Minuten gültig, einmal verwendbar; der Schlüssel
     liegt dabei mit dem Code verschlüsselt beim Dienst).
     Zusammenführen: Jede Einheit (eine Einstellung, der Tagesplan, die Favoriten …) trägt den Zeitpunkt ihrer letzten
     Änderung; die jüngere gewinnt. Was nur für ein Gerät gilt (Ansicht, Filter, Erinnerungen, Editor-Entwurf), bleibt lokal. */
  const SYNC_KEY = "ketoplaner.sync";
  const SYNC_PARTS = ["favorites", "savedRecipes", "scales", "water", "portion", "dayPlan", "basis"];
  const SYNC_LOCAL_SETTINGS = ["view", "filter", "sort", "onlyQuelle", "hideKeto", "detailTab", "detailNutr", "theme", "pushOn", "pushUrl", "pushMeals", "pushWater", "pushLead"];
  const PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let syncMeta = null, syncBusy = false, syncAgain = false, syncTimer = null, syncError = "", syncLastJson = null;

  function syncLoadMeta() {
    if (syncMeta) return syncMeta;
    try { syncMeta = JSON.parse(localStorage.getItem(SYNC_KEY) || "null"); } catch (e) { syncMeta = null; }
    return syncMeta;
  }
  function syncSaveMeta() { try { if (syncMeta) localStorage.setItem(SYNC_KEY, JSON.stringify(syncMeta)); else localStorage.removeItem(SYNC_KEY); } catch (e) {} }
  const syncOn = () => !!(syncLoadMeta() && syncMeta.key);
  function syncSupport() { return !!(window.crypto && window.crypto.subtle && window.fetch && window.TextEncoder); }

  // ---- Einheiten des Zustands ----
  function syncUnits() {
    const u = {};
    SYNC_PARTS.forEach(k => { u[k] = state[k]; });
    Object.keys(state.settings).forEach(k => { if (SYNC_LOCAL_SETTINGS.indexOf(k) === -1 && state.settings[k] !== undefined) u["s:" + k] = state.settings[k]; });
    return u;
  }
  function syncApplyUnit(name, unit) {
    if (name.indexOf("s:") === 0) {
      const k = name.slice(2); if (SYNC_LOCAL_SETTINGS.indexOf(k) !== -1) return;
      if (unit.del) delete state.settings[k]; else state.settings[k] = unit.v;
    } else if (SYNC_PARTS.indexOf(name) !== -1 && !unit.del) state[name] = unit.v;
  }
  // Geänderte Einheiten mit Zeitstempel versehen (Vergleich mit dem zuletzt bekannten Stand)
  function syncMarkChanges(now) {
    const m = syncLoadMeta(); if (!m) return false;
    const u = syncUnits(), cur = {};
    Object.keys(u).forEach(k => { cur[k] = JSON.stringify(u[k]); });
    const prev = syncLastJson || m.last || {};
    m.ts = m.ts || {};
    let changed = false;
    Object.keys(cur).forEach(k => { if (prev[k] !== cur[k]) { m.ts[k] = now; changed = true; } });
    Object.keys(prev).forEach(k => { if (!(k in cur)) { m.ts[k] = -now; changed = true; } }); // gelöscht: negativer Zeitstempel
    syncLastJson = cur; m.last = cur;
    if (changed) m.dirty = true;
    syncSaveMeta();
    return changed;
  }

  // ---- Krypto ----
  const b64u = (bytes) => btoa(String.fromCharCode.apply(null, Array.from(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = (s) => { const p = String(s).replace(/-/g, "+").replace(/_/g, "/"), bin = atob(p + "===".slice((p.length + 3) % 4)); return Uint8Array.from(bin, c => c.charCodeAt(0)); };
  async function sha256hex(text) {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    return Array.from(h).map(x => x.toString(16).padStart(2, "0")).join("");
  }
  async function aesKey(raw) { return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]); }
  async function sealText(key, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
    return b64u(iv) + "." + b64u(ct);
  }
  async function openText(key, sealed) {
    const [iv, ct] = String(sealed).split(".");
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv) }, key, unb64u(ct)));
  }
  async function pairKey(code) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: new TextEncoder().encode("hamham-keto-pair"), iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  const syncId = (m) => sha256hex("hamham-sync:" + m.key);
  async function syncPost(path, data) {
    const r = await fetch(pushUrl() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (r.status === 404 && path.indexOf("/api/state/") === 0 && j && j.error === "not found") throw new Error("Der Dienst kennt den Abgleich noch nicht – bitte den Worker aktualisieren (ⓘ).");
    return { status: r.status, j: j || {} };
  }

  // ---- Abgleich ----
  // Holt den Stand vom Dienst, führt zusammen (jüngere Einheit gewinnt) und schickt den eigenen Stand, falls nötig.
  async function syncNow(opts) {
    opts = opts || {};
    if (!syncOn() || !syncSupport() || !pushUrl()) return;
    if (syncBusy) { syncAgain = true; return; }
    syncBusy = true;
    const m = syncMeta;
    try {
      syncMarkChanges(Date.now());
      const id = await syncId(m), key = await aesKey(unb64u(m.key));
      for (let attempt = 0; attempt < 4; attempt++) {
        const got = await syncPost("/api/state/get", { id });
        const remoteRev = got.j.rev || 0;
        let remote = null;
        if (remoteRev > 0 && got.j.data) remote = JSON.parse(await openText(key, got.j.data));
        let applied = false, needPush = !remote || m.dirty;
        if (remote && remoteRev !== m.rev) {
          // jüngere Einheit gewinnt; beim Koppeln (fresh) gewinnt immer der Stand der anderen Geräte
          const ru = remote.units || {};
          Object.keys(ru).forEach(name => {
            const rt = Math.abs(ru[name].ts || 0), lt = m.fresh ? -1 : Math.abs((m.ts || {})[name] || 0);
            if (rt > lt) { syncApplyUnit(name, ru[name]); m.ts[name] = ru[name].ts; applied = true; }
          });
          const lu = syncUnits();
          Object.keys(lu).forEach(name => { if (!m.fresh && (!ru[name] || Math.abs((m.ts || {})[name] || 0) > Math.abs(ru[name].ts || 0))) needPush = true; });
          m.fresh = false;
        }
        if (applied) {
          // übernommenen Stand speichern, ohne ihn als eigene Änderung zu werten
          save(true);
          syncLastJson = null; const u = syncUnits(); m.last = {}; Object.keys(u).forEach(k => { m.last[k] = JSON.stringify(u[k]); }); syncLastJson = m.last;
          if (typeof renderRezepte === "function") renderRezepte();
        }
        m.rev = remoteRev; m.fresh = false;
        if (!needPush) { m.dirty = false; break; }
        const units = {}, cur = syncUnits();
        Object.keys(cur).forEach(name => { units[name] = { ts: (m.ts || {})[name] || Date.now(), v: cur[name] }; });
        Object.keys(m.ts || {}).forEach(name => { if (!(name in cur) && m.ts[name] < 0) units[name] = { ts: m.ts[name], del: true }; });
        const put = await syncPost("/api/state/put", { id, baseRev: remoteRev, data: await sealText(key, JSON.stringify({ v: 1, units })) });
        if (put.status === 409) continue; // inzwischen neuer Stand – noch einmal holen und zusammenführen
        if (put.status !== 200) throw new Error("Dienst antwortet " + put.status);
        m.rev = put.j.rev; m.dirty = false;
        break;
      }
      m.at = Date.now(); syncError = "";
    } catch (e) {
      syncError = String(e && e.message || e);
    } finally {
      syncSaveMeta(); syncBusy = false;
      if (typeof renderSyncCard === "function") renderSyncCard();
      if (syncAgain) { syncAgain = false; syncNow(); }
    }
  }
  // nach jeder lokalen Änderung (save) kurz warten und abgleichen
  function syncAfterSave() {
    if (!syncOn()) return;
    syncMarkChanges(Date.now());
    if (!syncMeta.dirty) return;
    clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 2000);
  }

  // ---- Ein-/Ausschalten und Koppeln ----
  async function syncEnable() {
    if (!syncSupport()) { showToast("🔄 Dieses Gerät kann nicht verschlüsselt abgleichen."); return; }
    const raw = crypto.getRandomValues(new Uint8Array(32));
    syncMeta = { key: b64u(raw), rev: 0, ts: {}, dirty: true }; syncLastJson = null;
    syncMarkChanges(Date.now()); syncMeta.dirty = true; syncSaveMeta();
    await syncNow(); syncStartTimer();
    showToast(syncError ? "🔄 " + escapeHtml(syncError) : "🔄 Abgleich eingeschaltet – jetzt weitere Geräte verbinden.");
    renderSyncCard();
  }
  function randomCode() {
    const r = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(r, x => PAIR_ALPHABET[x % PAIR_ALPHABET.length]).join("");
  }
  const fmtCode = (c) => c.slice(0, 4) + "-" + c.slice(4);
  let pairShown = null; // { code, until }
  async function syncShowCode() {
    if (!syncOn()) return;
    try {
      const code = randomCode(), id = await sha256hex("hamham-pair:" + code);
      const blob = await sealText(await pairKey(code), syncMeta.key);
      const r = await syncPost("/api/pair/put", { id, blob });
      if (r.status !== 200) throw new Error(r.j.error || "Dienst antwortet " + r.status);
      pairShown = { code, until: Date.now() + 15 * 60000 };
      syncError = "";
    } catch (e) { syncError = String(e && e.message || e); }
    renderSyncCard();
  }
  async function syncJoin(input) {
    const code = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/0/g, "O").replace(/[1I]/g, "L");
    if (code.length !== 8) { showToast("🔄 Bitte den 8-stelligen Code eingeben (z. B. ABCD-EFGH)."); return; }
    if (!syncSupport()) { showToast("🔄 Dieses Gerät kann nicht verschlüsselt abgleichen."); return; }
    try {
      const id = await sha256hex("hamham-pair:" + code);
      const r = await syncPost("/api/pair/get", { id });
      if (r.status === 404) throw new Error("Code unbekannt oder abgelaufen – am anderen Gerät einen neuen Code erzeugen.");
      if (r.status !== 200) throw new Error("Dienst antwortet " + r.status);
      const keyB64 = await openText(await pairKey(code), r.j.blob);
      // Beim Koppeln übernimmt dieses Gerät den gemeinsamen Stand (eigene Daten werden ersetzt)
      syncMeta = { key: keyB64, rev: 0, ts: {}, fresh: true, dirty: false }; syncLastJson = null; syncSaveMeta();
      await syncNow(); syncStartTimer();
      showToast(syncError ? "🔄 " + escapeHtml(syncError) : "🔄 Verbunden – dieses Gerät ist jetzt abgeglichen.");
    } catch (e) { showToast("🔄 " + escapeHtml(String(e && e.message || e))); }
    renderSyncCard();
  }
  function syncDisable() {
    if (!confirm("Abgleich auf diesem Gerät ausschalten? Die Daten bleiben hier erhalten, werden aber nicht mehr mit den anderen Geräten abgeglichen.")) return;
    syncMeta = null; syncLastJson = null; pairShown = null; syncError = ""; syncSaveMeta();
    showToast("🔄 Abgleich auf diesem Gerät ausgeschaltet."); renderSyncCard();
  }

  // ---- Karte in den Vorgaben ----
  function renderSyncCard() {
    if (!window.document) return; // Fenster schon geschlossen (später eintreffende Antwort)
    const st = document.getElementById("sync-status"); if (!st) return;
    const on = syncOn(), m = syncMeta;
    st.className = "note " + (syncError ? "warn" : on ? "tip" : "info");
    st.innerHTML = !syncSupport() ? "Dieses Gerät bzw. dieser Browser kann nicht verschlüsselt abgleichen."
      : syncError ? escapeHtml(syncError)
      : on ? "<strong>Eingeschaltet</strong>" + (m.at ? " · zuletzt abgeglichen " + new Date(m.at).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) : "")
      : "Ausgeschaltet – alles bleibt nur auf diesem Gerät.";
    const show = (id, v) => { const el = document.getElementById(id); if (el) el.hidden = !v; };
    show("sync-enable", !on); show("sync-join-row", !on);
    show("sync-code-btn", on); show("sync-now", on); show("sync-off", on);
    const pc = document.getElementById("sync-code");
    if (pc) {
      const valid = on && pairShown && pairShown.until > Date.now();
      pc.hidden = !valid;
      if (valid) pc.innerHTML = "Code für das andere Gerät: <strong class=\"sync-code\">" + fmtCode(pairShown.code) + "</strong><br><small>Am anderen Gerät unter Vorgaben → 🔄 Geräte abgleichen → „Mit Code verbinden“ eingeben. Gültig bis " +
        new Date(pairShown.until).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) + ", nur einmal verwendbar.</small>";
    }
  }
  function bindSync() {
    const en = document.getElementById("sync-enable"); if (!en) return;
    en.addEventListener("click", syncEnable);
    document.getElementById("sync-join").addEventListener("click", () => syncJoin(document.getElementById("sync-join-code").value));
    document.getElementById("sync-code-btn").addEventListener("click", syncShowCode);
    document.getElementById("sync-now").addEventListener("click", () => syncNow());
    document.getElementById("sync-off").addEventListener("click", syncDisable);
    renderSyncCard();
    // Abgleich beim Start, beim Zurückkehren in die App, wenn wieder online und jede Minute (nur wenn eingeschaltet)
    document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNow(); });
    window.addEventListener("online", () => syncNow());
    if (syncOn()) { setTimeout(() => syncNow(), 600); syncStartTimer(); }
  }
  let syncInterval = null;
  function syncStartTimer() { if (!syncInterval) syncInterval = setInterval(() => { if (!syncOn()) { clearInterval(syncInterval); syncInterval = null; } else if (!document.hidden) syncNow(); }, 60000); }
