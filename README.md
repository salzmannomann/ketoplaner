# Keto-Sondennahrung

Eine einfache Web-App für die **ketogene Sondennahrung**. Sie zeigt rund 20
fertige Standard-Rezepte, die automatisch auf das gewünschte Keto-Verhältnis und
die Kalorien pro Mahlzeit berechnet werden – wahlweise **mit oder ohne KetoCal**,
mit **Icon** zur schnellen Erkennung und mit Anleitung für die klassische
Zubereitung sowie den **Thermomix TM5**.

Die App läuft komplett im Browser, ohne Server und ohne Internetverbindung.
Einstellungen werden **lokal im Browser gespeichert** (localStorage).

## Starten

1. **Einzeldatei (empfohlen):** Lade nur die Datei **`keto-rechner.html`**
   herunter und öffne sie per Doppelklick. Sie enthält alles.
2. **Mehrere Dateien:** Öffne **`index.html`** (dann müssen `index.html`,
   `styles.css`, `app.js`, `foods.js` und `recipes.js` im selben Ordner liegen).

Keine Installation, kein Server nötig.

### Einzeldatei neu erzeugen

```
python3 build-single.py
```

## Bedienung

Die App besteht aus einer einzigen Seite:

1. Oben einstellen: **Kalorien pro Tag**, **Anzahl Mahlzeiten pro Tag**,
   **Verhältnis** (Standard 1,8:1), **Eiweiß pro Tag** und **Ohne / Mit
   KetoCal / Alle**. Daraus werden **kcal pro Mahlzeit** und das
   **Eiweiß-Ziel pro Mahlzeit** angezeigt.
2. Darunter erscheinen die passenden Rezepte als **Kacheln** mit Icon, kcal,
   Verhältnis, Menge (g/ml) und Eiweiß.
3. Klick auf eine Kachel öffnet das vollständige Rezept: Zutaten, Kennzahlen,
   **Thermomix-TM5-Anleitung**, klassische Zubereitung und **Rezept drucken**.

Es werden nur Rezepte angezeigt, die das eingestellte Verhältnis sicher
erreichen. Bei Rezepten ohne KetoCal weist die App darauf hin, dass Vitamine
und Mineralstoffe separat ergänzt werden müssen.

## Rezepte (ca. 20, vielfältig)

Ohne KetoCal: Gemüse-Fleischbrei (Zucchini / Karotte), Fisch-Brokkoli-Püree,
Hähnchen-Karotte-/Hähnchen-Zucchini-/Blumenkohl-Hähnchen-Creme,
Pute-Karotte-Creme, Rindfleisch-Gemüse-Püree, Forelle-Kartoffel-Püree,
Thunfisch-Zucchini-Püree, Kartoffel-Gemüse-Creme, **Avocado-Hähnchen-Creme**,
**Ei-Gemüse-Creme**.

Mit KetoCal: Obstbrei (Banane / Apfelmus / Banane & Apfelmus),
Gemüse-Kartoffelbrei (2 Varianten), Milch-Grieß-Obstbrei, Karottensuppe.

Enthalten sind also Obst-Rezepte (Banane/Apfel) und ein Avocado-Rezept.

## Berechnungsgrundlage

- Kalorien je Gramm: Eiweiß 4 kcal, Fett 9 kcal, Kohlenhydrate 4 kcal.
- Keto-Verhältnis = Fett ÷ (Eiweiß + Kohlenhydrate).
- Kalorien pro Mahlzeit = Kalorien pro Tag ÷ Anzahl Mahlzeiten.
- Zur Anpassung wird die Fett-Zutat so berechnet, dass Verhältnis und
  Ziel-Kalorien gleichzeitig getroffen werden; die übrigen Zutaten werden
  proportional skaliert. Alle Nährwerte stammen aus `foods.js`.

## Dateien

- `index.html` – Oberfläche
- `styles.css` – Gestaltung
- `app.js` – Logik und Berechnungen
- `foods.js` – Lebensmittel-Datenbank (intern für die Berechnung)
- `recipes.js` – Standard-Rezepte
- `build-single.py` – erzeugt die Einzeldatei `keto-rechner.html`

## Hinweis

Dieses Werkzeug dient der Planung und ersetzt keine ärztliche oder
diätologische Beratung. Die ketogene Ernährung über Sonde sollte – besonders
bei Kindern – nur in Absprache mit dem Behandlungsteam durchgeführt werden.
Die berechneten Mengen vor der Zubereitung bitte fachlich prüfen lassen.
