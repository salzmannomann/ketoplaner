# Erinnerungen einrichten (Cloudflare, einmalig ca. 15 Minuten)

Die App schickt Push-Nachrichten über einen kleinen eigenen Dienst bei Cloudflare. Der Dienst ist
kostenlos (im Gratis-Tarif bleibt man weit unter den Grenzen) und braucht keine Wartung.

## 1. Konto anlegen
1. <https://dash.cloudflare.com/sign-up> öffnen, mit E-Mail und Passwort registrieren, E-Mail bestätigen.
   Eine eigene Domain ist **nicht** nötig.

## 2. Speicher (KV) anlegen
1. Im Dashboard links **Storage & Databases → KV** (früher „Workers KV“) öffnen.
2. **Create** (bzw. „Create a namespace“) → Name `hamham-push` → **Add/Create**.

## 3. Worker anlegen
1. Links **Compute (Workers) → Workers & Pages** → **Create** → **Create Worker**
   (Vorlage „Hello World“ / „Start with Hello World“).
2. Name: `hamham-push` → **Deploy**.
3. **Edit code** öffnen, den gesamten Inhalt löschen und den Inhalt von
   [`worker.js`](worker.js) aus diesem Ordner einfügen → **Deploy**.

## 4. Speicher und Zeitplan verbinden
Im Worker `hamham-push` unter **Settings**:
1. **Bindings → Add → KV namespace**: Variable name **`PUSH_KV`** (genau so), Namespace
   `hamham-push` → **Save/Deploy**.
2. **Trigger Events** (bzw. „Triggers“) **→ Add → Cron Triggers**: **`* * * * *`**
   (jede Minute) → **Add/Save**.
3. Optional unter **Variables and Secrets**: `ALLOWED_ORIGIN` = `https://salzmannomann.github.io`
   (erlaubt Anfragen nur von der App).

## 5. Prüfen
Die Adresse des Workers steht oben auf seiner Seite, etwa
`https://hamham-push.DEIN-NAME.workers.dev`. Im Browser öffnen – es erscheint
„HamHam Keto Erinnerungsdienst läuft.“ Unter `…/api/key` erscheint ein Schlüssel.

## 6. In der App einschalten (auf jedem Handy)
1. HamHam Keto **vom Home-Bildschirm** öffnen (nicht im Safari-Tab; ab iOS 16.4).
2. **Vorgaben → 🔔 Erinnerungen** – die Adresse `https://hamham-push.klemens-sailer.workers.dev`
   ist bereits eingebaut (`PUSH_URL_DEFAULT` in `src/55-push.js`; unter „ⓘ Wie funktioniert das?“ änderbar).
3. **🔔 Erinnerungen einschalten** → Mitteilungen **erlauben**.
4. **Testnachricht** – nach wenigen Sekunden erscheint „🔔 HamHam Keto“.

## Aktualisieren (z. B. für den Geräte-Abgleich)
Wenn die App eine neue Fassung des Dienstes braucht (der Geräte-Abgleich meldet dann „Der Dienst kennt den
Abgleich noch nicht“):
1. In Cloudflare **Workers & Pages** → den Worker **hamham-push** öffnen → **Code bearbeiten**.
2. Den gesamten Inhalt durch die aktuelle Datei `push-worker/worker.js` ersetzen → **Bereitstellen**.
3. Prüfen: Die Adresse des Workers im Browser öffnen – dort steht jetzt
   „HamHam Keto Dienst läuft (Erinnerungen und Geräte-Abgleich).“
Speicher (PUSH_KV) und Zeitplan bleiben dabei unverändert; Erinnerungen laufen einfach weiter.

## Alternative: Bereitstellung mit der Kommandozeile
```
cd push-worker
npx wrangler login
npx wrangler kv namespace create PUSH_KV   # id in wrangler.toml eintragen
npx wrangler deploy
```

## Was liegt beim Dienst?
Je Handy: die Push-Anmeldung (vom Browser erzeugt), die Zeitzone und die Erinnerungen des Tages
(Uhrzeit, z. B. „🍽️ Mahlzeit 2 · 10:30“, „Hendl & Brokkoli · ≈ 217 ml · 45 min“). Keine Namen,
kein Gewicht, keine Verordnung. Ausschalten in der App löscht den Eintrag.

Beim **Geräte-Abgleich** (freiwillig): ein verschlüsselter Block je Gerätegruppe unter einer Zufalls-Adresse –
ohne den Schlüssel, den nur eure Geräte kennen, nicht lesbar. Kopplungs-Codes verfallen nach 15 Minuten.

## Wenn keine Nachricht kommt
- Mitteilungen erlaubt? iPhone-Einstellungen → Mitteilungen → HamHam Keto.
- Fokus/„Nicht stören“ aktiv? Dann kommt die Nachricht stumm.
- Status in der Karte „🔔 Erinnerungen“ zeigt Fehler beim Abgleich an.
- Im Cloudflare-Dashboard beim Worker unter **Logs** nachsehen, ob die Cron-Runde läuft.
