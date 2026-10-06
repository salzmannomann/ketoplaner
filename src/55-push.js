  /* ---------- Erinnerungen (Web-Push über den eigenen Cloudflare-Dienst, siehe push-worker/) ----------
     Die App meldet das Gerät beim Dienst an und schickt ihm die Erinnerungen des Tages (Uhrzeit, Titel, Text).
     Der Dienst verschickt sie täglich zur fälligen Minute, bis ein neuer Plan kommt. Abgeglichen wird
     automatisch, sobald sich Uhrzeiten, Rezepte oder Wassergaben ändern (und einmal am Tag beim Öffnen). */
  const PUSH_URL_DEFAULT = "https://hamham-push.klemens-sailer.workers.dev"; // eigener Worker (in den Vorgaben änderbar)
  function pushUrl() { return String(state.settings.pushUrl || PUSH_URL_DEFAULT || "").trim().replace(/\/+$/, ""); }
  function pushSupport() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    // hint: nur eine Erklärung, wo Erinnerungen gehen (grau) – kein Fehler
    if (location.protocol !== "https:" && location.hostname !== "localhost") return { ok: false, hint: true, why: "Nur in der Online-Version (GitHub Pages), nicht in der Einzeldatei." };
    if (ios && !standalone) return { ok: false, hint: true, why: "Am iPhone nur in der App vom Home-Bildschirm (Teilen → „Zum Home-Bildschirm“), nicht im Safari-Tab." };
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return { ok: false, why: "Dieses Gerät bzw. dieser Browser kann keine Push-Nachrichten empfangen." };
    return { ok: true };
  }
  const pushOpt = () => { const s = state.settings; return { meals: s.pushMeals !== false, water: s.pushWater !== false, lead: s.pushLead == null ? 5 : num(s.pushLead) }; };
  // Erinnerungen des Tages aus dem Zeitplan
  function pushItems(d) {
    const o = pushOpt(), times = zeitTimes(d), dm = dayMeals(d), wp = waterPlan(d, dm.sum, times), items = [];
    if (o.meals) times.meals.forEach((t, i) => {
      const m = dm.meals[i];
      items.push({ at: fmtHM(t - o.lead), tag: "m" + (i + 1), title: "Mahlzeit " + (i + 1) + " · " + fmtHM(t),
        body: (m.rec ? displayText(m.rec) + (slotNote(state.dayPlan[i], m.f) ? " · " + slotNote(state.dayPlan[i], m.f) : "") + " · ≈ " : "Rezept noch offen · ≈ ") + fmt(m.vol, 0) + " ml · " + sondierMin(m.vol) + " min" });
    });
    if (o.water && wp.per > 0) times.gifts.forEach((g, k) => {
      items.push({ at: fmtHM(g.t - o.lead), tag: "w" + (k + 1), title: "Wasser · " + fmtHM(g.t), body: fmt(wp.per, 0) + " ml Wasser" + (g.kind === "abend" ? " vor dem Schlafen" : "") + " · " + wasserMin(wp.per) + " min" });
    });
    return items;
  }
  function b64uToBytes(s) { const p = s.replace(/-/g, "+").replace(/_/g, "/"), bin = atob(p + "===".slice((p.length + 3) % 4)); return Uint8Array.from(bin, c => c.charCodeAt(0)); }
  async function pushPost(path, data) {
    const r = await fetch(pushUrl() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error("Dienst antwortet " + r.status);
    return r.json();
  }
  async function pushSubscription(create) {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub && create) {
      const k = await (await fetch(pushUrl() + "/api/key")).json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(k.publicKey) });
    }
    return sub;
  }
  const PUSH_SYNC_KEY = STORAGE_KEY + ".pushSync";
  async function pushSync(force) {
    if (!state.settings.pushOn || !pushUrl() || !pushSupport().ok) return;
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "Europe/Vienna";
    const items = pushItems(derived()), today = new Date().toDateString();
    const sig = JSON.stringify([tz, items]);
    let last = null; try { last = JSON.parse(localStorage.getItem(PUSH_SYNC_KEY) || "null"); } catch (e) {}
    if (!force && last && last.sig === sig && last.day === today) return;
    try {
      const sub = await pushSubscription(false);
      if (!sub) { state.settings.pushOn = false; save(); renderPushCard(); return; }
      await pushPost("/api/sync", { subscription: sub.toJSON(), tz, items });
      try { localStorage.setItem(PUSH_SYNC_KEY, JSON.stringify({ sig, day: today, at: Date.now(), n: items.length })); } catch (e) {}
      pushError = "";
    } catch (e) { pushError = "Abgleich fehlgeschlagen (" + errorText(e) + ") – wird beim nächsten Öffnen wiederholt."; }
    renderPushCard();
  }
  let pushTimer = null, pushError = "";
  function schedulePushSync() { if (!state.settings.pushOn) return; clearTimeout(pushTimer); pushTimer = setTimeout(() => pushSync(false), 1500); }
  async function pushEnable() {
    const sup = pushSupport(); if (!sup.ok) { showToast(escapeHtml(sup.why)); return; }
    if (!pushUrl()) { showToast("Zuerst die Adresse des Dienstes eintragen („Wie funktioniert das?“)."); return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { showToast(isIOS() ? "Mitteilungen sind nicht erlaubt – in den iPhone-Einstellungen unter Mitteilungen → HamHam Keto erlauben." : "Mitteilungen sind nicht erlaubt – in den Browser-Einstellungen für diese Seite Mitteilungen erlauben."); return; }
      await pushSubscription(true);
      state.settings.pushOn = true; save();
      await pushSync(true);
      showToast(pushError ? "" + escapeHtml(pushError) : "Erinnerungen eingeschaltet");
    } catch (e) { showToast("Einschalten fehlgeschlagen: " + escapeHtml(errorText(e))); }
    renderPushCard();
  }
  async function pushDisable() {
    state.settings.pushOn = false; save();
    try {
      const sub = await pushSubscription(false);
      if (sub) { try { await pushPost("/api/remove", { endpoint: sub.endpoint }); } catch (e) {} await sub.unsubscribe(); }
    } catch (e) {}
    try { localStorage.removeItem(PUSH_SYNC_KEY); } catch (e) {}
    showToast("Erinnerungen ausgeschaltet"); renderPushCard();
  }
  async function pushTest() {
    try {
      const sub = await pushSubscription(false); if (!sub) { showToast("Erst die Erinnerungen einschalten."); return; }
      await pushPost("/api/test", { subscription: sub.toJSON() });
      showToast("Testnachricht verschickt – sie sollte gleich erscheinen.");
    } catch (e) { showToast("Test fehlgeschlagen: " + escapeHtml(errorText(e))); }
  }
  // Karte in den Vorgaben
  function renderPushCard() {
    const st = document.getElementById("push-status"); if (!st) return;
    const s = state.settings, o = pushOpt(), sup = pushSupport(), on = !!s.pushOn;
    let last = null; try { last = JSON.parse(localStorage.getItem(PUSH_SYNC_KEY) || "null"); } catch (e) {}
    // Rot nur, wenn Erinnerungen wirklich nicht gehen: Gerät kann kein Push, Mitteilungen blockiert, Fehler beim Abgleich
    let denied = false; try { denied = sup.ok && window.Notification && Notification.permission === "denied"; } catch (e) {}
    st.className = "note " + ((!sup.ok && !sup.hint) || denied || pushError ? "warn" : on ? "tip" : "info");
    st.innerHTML = !sup.ok ? escapeHtml(sup.why)
      : denied ? (isIOS() ? "Mitteilungen sind nicht erlaubt – in den iPhone-Einstellungen unter Mitteilungen → HamHam Keto erlauben." : "Mitteilungen sind für diese Seite blockiert – in den Browser-Einstellungen erlauben.")
      : !pushUrl() ? "Noch nicht eingerichtet: Adresse des Dienstes unter „Wie funktioniert das?“ eintragen."
      : pushError ? escapeHtml(pushError)
      : on ? "<strong>Eingeschaltet</strong>" + (last ? " · " + last.n + " Erinnerungen am Tag, zuletzt abgeglichen " + new Date(last.at).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) : "")
      : "Ausgeschaltet.";
    const t = document.getElementById("push-toggle"); if (t) { t.textContent = on ? "Ausschalten" : "Erinnerungen einschalten"; t.className = on ? "tlink push-off" : "btn primary"; t.disabled = !sup.ok; }
    const te = document.getElementById("push-test"); if (te) te.hidden = !on;
    const pm = document.getElementById("push-meals"); if (pm) pm.checked = o.meals;
    const pw = document.getElementById("push-water"); if (pw) pw.checked = o.water;
    const kind = o.meals && o.water ? "both" : o.meals ? "meals" : o.water ? "water" : "none";
    document.querySelectorAll("#push-kind [data-kind]").forEach(b => b.classList.toggle("active", b.dataset.kind === kind));
    const pl = document.getElementById("push-lead"); if (pl) pl.value = String(o.lead);
    const pu = document.getElementById("push-url"); if (pu && document.activeElement !== pu) pu.value = s.pushUrl || PUSH_URL_DEFAULT;
  }
  function bindPush() {
    const t = document.getElementById("push-toggle"); if (!t) return;
    t.addEventListener("click", () => { state.settings.pushOn ? pushDisable() : pushEnable(); });
    document.getElementById("push-test").addEventListener("click", pushTest);
    const opt = (id, key, val) => document.getElementById(id).addEventListener("change", (e) => { state.settings[key] = val(e.target); save(); renderPushCard(); schedulePushSync(); });
    opt("push-meals", "pushMeals", (el) => el.checked);
    opt("push-water", "pushWater", (el) => el.checked);
    opt("push-lead", "pushLead", (el) => num(el.value));
    // Segment „Mahlzeiten · Wasser · beides · keine“ → pushMeals / pushWater (Speicherschlüssel wie bisher)
    document.querySelectorAll("#push-kind [data-kind]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.kind;
      state.settings.pushMeals = k === "meals" || k === "both";
      state.settings.pushWater = k === "water" || k === "both";
      save(); renderPushCard(); schedulePushSync();
    }));
    document.getElementById("push-url").addEventListener("change", (e) => { state.settings.pushUrl = e.target.value.trim(); save(); renderPushCard(); schedulePushSync(); });
    renderPushCard();
    if (state.settings.pushOn) setTimeout(() => pushSync(false), 800);
  }
