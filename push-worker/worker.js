/* HamHam Keto – Erinnerungsdienst (Cloudflare Worker, ohne Abhängigkeiten)
   Speichert je Gerät die Erinnerungszeiten und schickt zur fälligen Minute eine Web-Push-Nachricht
   (RFC 8030/8291/8292: VAPID-Anmeldung und aes128gcm-Verschlüsselung mit WebCrypto).

   Bindungen (siehe ANLEITUNG.md):
     PUSH_KV  – KV-Namespace (Speicher)
     Cron     – „* * * * *“ (jede Minute)
   Optional: Variable ALLOWED_ORIGIN (z. B. https://salzmannomann.github.io), sonst „*“.

   Endpunkte (JSON):
     GET  /api/key                         → { publicKey }  (VAPID, wird beim ersten Aufruf erzeugt)
     POST /api/sync   { subscription, tz, items:[{ at:"HH:MM", title, body, tag }] }
     POST /api/remove { endpoint }
     POST /api/test   { subscription }     → schickt sofort eine Testnachricht

   Geräte-Abgleich (freiwillig, Ende-zu-Ende verschlüsselt – der Dienst speichert nur unlesbare Blöcke):
     POST /api/state/get    { id }                   → { rev, data } (rev 0 = noch nichts gespeichert)
     POST /api/state/put    { id, baseRev, data }    → { rev } oder 409 { conflict, rev, data }, wenn inzwischen neuer
     POST /api/state/delete { id }
     POST /api/pair/put     { id, blob }             → Kopplungs-Code für 15 Minuten
     POST /api/pair/get     { id }                   → { blob } (nur einmal abrufbar) oder 404 */

const SUBJECT = "https://salzmannomann.github.io/ketoplaner/";
const MAX_ITEMS = 40, MAX_TEXT = 240;
const MAX_STATE = 512 * 1024, PAIR_TTL = 900, HEX64 = /^[0-9a-f]{64}$/;

// ---------- Hilfsfunktionen ----------
const enc = new TextEncoder();
function b64u(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/"), pad = s.length % 4 ? "=".repeat(4 - s.length % 4) : "";
  const bin = atob(s + pad), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts) {
  const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function sha256hex(text) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return [...h].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

// ---------- VAPID (Server-Schlüssel, im KV abgelegt) ----------
async function vapidKeys(env) {
  let v = await env.PUSH_KV.get("vapid", "json");
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
    v = { jwk, publicKey: b64u(pub) };
    await env.PUSH_KV.put("vapid", JSON.stringify(v));
  }
  return v;
}
async function vapidAuth(env, endpoint) {
  const v = await vapidKeys(env);
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 3000, sub: SUBJECT })));
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(header + "." + claims)));
  return "vapid t=" + header + "." + claims + "." + b64u(sig) + ", k=" + v.publicKey;
}

// ---------- Verschlüsselung (RFC 8291, aes128gcm) ----------
async function encryptPayload(subscription, payloadText) {
  const uaPublic = unb64u(subscription.keys.p256dh), authSecret = unb64u(subscription.keys.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(payloadText), new Uint8Array([2]));          // 0x02 = letzter Datensatz
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain));
  const rs = new Uint8Array([0, 0, 0x10, 0]);                                   // Datensatzgröße 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}
async function sendPush(env, subscription, message) {
  const body = await encryptPayload(subscription, JSON.stringify(message));
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuth(env, subscription.endpoint),
      "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
      TTL: "600", Urgency: "high",
    },
    body,
  });
  return res.status;
}

// ---------- Speicher ----------
async function readIndex(env) { return (await env.PUSH_KV.get("index", "json")) || []; }
async function writeIndex(env, ids) { await env.PUSH_KV.put("index", JSON.stringify([...new Set(ids)])); }
function cleanText(t) { return String(t == null ? "" : t).slice(0, MAX_TEXT); }
// Nur echte Push-Dienste der Browser als Ziel (sonst ließe sich der Dienst als Weiterleitung an beliebige Adressen nutzen)
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
function pushHostOk(endpoint) {
  try { const u = new URL(endpoint); return u.protocol === "https:" && !u.port && PUSH_HOSTS.some(re => re.test(u.hostname)); } catch (e) { return false; }
}
function validSub(s) {
  return s && typeof s.endpoint === "string" && pushHostOk(s.endpoint) && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";
}
// Ortszeit „HH:MM“ und Datum „JJJJ-MM-TT“ in der Zeitzone des Geräts
function localNow(tz, date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const g = (t) => (parts.find(p => p.type === t) || {}).value;
  return { day: g("year") + "-" + g("month") + "-" + g("day"), min: (+g("hour")) * 60 + (+g("minute")) };
}
// Gültige IANA-Zeitzone? Sonst Europe/Vienna (eine ungültige würde jede Minute einen Fehler werfen)
function validTz(tz) { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch (e) { return "Europe/Vienna"; } }
const toMin = (hm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hm || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; };

// ---------- Minütliche Runde: fällige Erinnerungen verschicken ----------
async function tick(env, now) {
  const ids = await readIndex(env); let changed = false; const keep = [];
  for (const id of ids) {
    // Jedes Gerät für sich: ein fehlerhafter Eintrag (kaputte Schlüssel, Netzfehler) darf die anderen nicht aufhalten
    try {
    const rec = await env.PUSH_KV.get("sub:" + id, "json");
    if (!rec) { changed = true; continue; }
    const { day, min } = localNow(rec.tz, now);
    const sent = (rec.sent && rec.sent.day === day) ? rec.sent.keys : [];
    let sentNew = false, gone = false;
    for (const it of rec.items || []) {
      const at = toMin(it.at); if (at == null) continue;
      // fällig in den letzten 3 Minuten (falls eine Runde ausfällt) und heute noch nicht verschickt
      if (min >= at && min - at < 3 && sent.indexOf(it.at + "|" + it.tag) === -1) {
        const st = await sendPush(env, rec.subscription, { title: it.title, body: it.body, tag: it.tag });
        if (st === 404 || st === 410) { gone = true; break; }
        sent.push(it.at + "|" + it.tag); sentNew = true;
      }
    }
    if (gone) { await env.PUSH_KV.delete("sub:" + id); changed = true; continue; }
    keep.push(id);
    if (sentNew) { rec.sent = { day, keys: sent }; await env.PUSH_KV.put("sub:" + id, JSON.stringify(rec)); }
    } catch (e) { keep.push(id); console.log("Erinnerung für " + id + " fehlgeschlagen: " + (e && e.message)); }
  }
  if (changed) await writeIndex(env, keep);
}

// ---------- HTTP ----------
function cors(env) {
  return { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" };
}
function json(env, data, status) { return new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json" }, cors(env)) }); }

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
  if (request.method === "GET" && url.pathname === "/api/key") return json(env, { publicKey: (await vapidKeys(env)).publicKey });
  if (request.method === "GET" && url.pathname === "/") return new Response("HamHam Keto Dienst läuft (Erinnerungen und Geräte-Abgleich).", { headers: cors(env) });
  if (request.method !== "POST") return json(env, { error: "not found" }, 404);
  let data; try { data = await request.json(); } catch (e) { return json(env, { error: "bad json" }, 400); }
  if (url.pathname === "/api/sync") {
    if (!validSub(data.subscription)) return json(env, { error: "bad subscription" }, 400);
    const items = (Array.isArray(data.items) ? data.items : []).slice(0, MAX_ITEMS)
      .filter(it => toMin(it && it.at) != null)
      .map(it => ({ at: it.at, title: cleanText(it.title), body: cleanText(it.body), tag: cleanText(it.tag || it.at).slice(0, 40) }));
    const id = await sha256hex(data.subscription.endpoint);
    const old = await env.PUSH_KV.get("sub:" + id, "json");
    const rec = { subscription: { endpoint: data.subscription.endpoint, keys: { p256dh: data.subscription.keys.p256dh, auth: data.subscription.keys.auth } },
      tz: validTz(cleanText(data.tz || "Europe/Vienna").slice(0, 64)), items, sent: old && old.sent ? old.sent : null, updated: Date.now() };
    await env.PUSH_KV.put("sub:" + id, JSON.stringify(rec));
    const ids = await readIndex(env); if (ids.indexOf(id) === -1) { ids.push(id); await writeIndex(env, ids); }
    return json(env, { ok: true, items: items.length });
  }
  if (url.pathname === "/api/remove") {
    if (typeof data.endpoint !== "string") return json(env, { error: "bad endpoint" }, 400);
    const id = await sha256hex(data.endpoint);
    await env.PUSH_KV.delete("sub:" + id);
    const ids = await readIndex(env); if (ids.indexOf(id) !== -1) await writeIndex(env, ids.filter(x => x !== id));
    return json(env, { ok: true });
  }
  // Geräte-Abgleich: id = SHA-256 eines geheimen Schlüssels der Geräte, data = AES-GCM-verschlüsselter Text
  if (url.pathname.indexOf("/api/state/") === 0 || url.pathname.indexOf("/api/pair/") === 0) {
    if (typeof data.id !== "string" || !HEX64.test(data.id)) return json(env, { error: "bad id" }, 400);
    if (url.pathname === "/api/state/get") {
      const rec = await env.PUSH_KV.get("st:" + data.id, "json");
      return json(env, rec ? { rev: rec.rev, data: rec.data } : { rev: 0 });
    }
    if (url.pathname === "/api/state/put") {
      if (typeof data.data !== "string" || data.data.length > MAX_STATE || !Number.isInteger(data.baseRev)) return json(env, { error: "bad data" }, 400);
      const rec = await env.PUSH_KV.get("st:" + data.id, "json"), cur = rec ? rec.rev : 0;
      if (data.baseRev !== cur) return json(env, { conflict: true, rev: cur, data: rec ? rec.data : null }, 409);
      await env.PUSH_KV.put("st:" + data.id, JSON.stringify({ rev: cur + 1, data: data.data, updated: Date.now() }));
      return json(env, { ok: true, rev: cur + 1 });
    }
    if (url.pathname === "/api/state/delete") { await env.PUSH_KV.delete("st:" + data.id); return json(env, { ok: true }); }
    if (url.pathname === "/api/pair/put") {
      if (typeof data.blob !== "string" || data.blob.length > 2000) return json(env, { error: "bad blob" }, 400);
      await env.PUSH_KV.put("pr:" + data.id, data.blob, { expirationTtl: PAIR_TTL });
      return json(env, { ok: true });
    }
    if (url.pathname === "/api/pair/get") {
      const blob = await env.PUSH_KV.get("pr:" + data.id);
      if (!blob) return json(env, { error: "unknown code" }, 404);
      await env.PUSH_KV.delete("pr:" + data.id);
      return json(env, { blob });
    }
    return json(env, { error: "not found" }, 404);
  }
  if (url.pathname === "/api/test") {
    if (!validSub(data.subscription)) return json(env, { error: "bad subscription" }, 400);
    const st = await sendPush(env, data.subscription, { title: "🔔 HamHam Keto", body: "Erinnerungen sind eingeschaltet – so sieht eine Nachricht aus.", tag: "test" });
    return json(env, { ok: st >= 200 && st < 300, status: st }, st >= 200 && st < 300 ? 200 : 502);
  }
  return json(env, { error: "not found" }, 404);
}

export default {
  fetch: (request, env) => handle(request, env).catch(e => json(env, { error: String(e && e.message || e) }, 500)),
  scheduled: (event, env, ctx) => { ctx.waitUntil(tick(env, new Date(event.scheduledTime || Date.now()))); },
};
// Für Tests
export { encryptPayload, vapidAuth, localNow, tick, handle };
