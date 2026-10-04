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
     POST /api/test   { subscription }     → schickt sofort eine Testnachricht */

const SUBJECT = "https://salzmannomann.github.io/ketoplaner/";
const MAX_ITEMS = 40, MAX_TEXT = 240;

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
function validSub(s) {
  return s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";
}
// Ortszeit „HH:MM“ und Datum „JJJJ-MM-TT“ in der Zeitzone des Geräts
function localNow(tz, date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const g = (t) => (parts.find(p => p.type === t) || {}).value;
  return { day: g("year") + "-" + g("month") + "-" + g("day"), min: (+g("hour")) * 60 + (+g("minute")) };
}
const toMin = (hm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hm || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; };

// ---------- Minütliche Runde: fällige Erinnerungen verschicken ----------
async function tick(env, now) {
  const ids = await readIndex(env); let changed = false; const keep = [];
  for (const id of ids) {
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
  if (request.method === "GET" && url.pathname === "/") return new Response("HamHam Keto Erinnerungsdienst läuft.", { headers: cors(env) });
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
      tz: cleanText(data.tz || "Europe/Vienna").slice(0, 64), items, sent: old && old.sent ? old.sent : null, updated: Date.now() };
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
