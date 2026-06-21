# Keto-Sondennahrung

Eine Web-App für die **ketogene Sondennahrung**. Sie zeigt fertige Rezepte, die
automatisch auf das gewünschte Keto-Verhältnis und die Kalorien pro Mahlzeit
berechnet werden – wahlweise **mit oder ohne KetoCal** und mit Anleitung für die
klassische Zubereitung sowie den **Thermomix TM5**.

Die App läuft komplett im Browser, ohne Server und ohne Internetverbindung.
Alle Eingaben werden **lokal im Browser gespeichert** (localStorage) – es wird
nichts hochgeladen.

## Starten

Es gibt zwei Möglichkeiten:

1. **Einzeldatei (empfohlen, am einfachsten):** Lade nur die Datei
   **`keto-rechner.html`** herunter und öffne sie per Doppelklick. Sie enthält
   bereits alles (Design, Logik, Lebensmittel, Rezepte) – sonst wird nichts
   benötigt. Ideal zum Verschicken oder Kopieren auf mehrere Geräte.

2. **Mehrere Dateien:** Öffne **`index.html`**. Dafür müssen `index.html`,
   `styles.css`, `app.js`, `foods.js` und `recipes.js` im selben Ordner liegen.

Es ist keine Installation und kein Server nötig.

### Einzeldatei neu erzeugen

Die Datei `keto-rechner.html` wird aus den Einzeldateien gebaut. Nach
Änderungen an `index.html`, `styles.css`, `app.js`, `foods.js` oder
`recipes.js` einfach neu erzeugen mit:

```
python3 build-single.py
```

## Funktionen

| Bereich | Beschreibung |
| --- | --- |
| **Einstellungsleiste** | Direkt über den Rezepten: **Kalorien pro Tag**, **Anzahl Mahlzeiten pro Tag**, **Verhältnis** und die Auswahl **Ohne / Mit KetoCal / Alle**. Daraus werden die **Kalorien pro Mahlzeit** berechnet und angezeigt. |
| **Rezepte** | Fertige Sondennahrungs-Rezepte. Jedes Rezept wird **automatisch** auf das eingestellte Verhältnis und die Kalorien pro Mahlzeit umgerechnet (die Fett-Zutat Butter/Öl/Sahne wird passend angepasst und in der Tabelle hervorgehoben). Pro Rezept gibt es eine **Thermomix-TM5-Anleitung** und eine klassische Zubereitung. Über **Rezept drucken** lässt sich ein sauberes Rezeptblatt für die Küche ausgeben. |
| **Mit / ohne KetoCal** | Über die Auswahl lassen sich gezielt Rezepte **ohne KetoCal** anzeigen (Standard) – aktuell stehen mehrere KetoCal-freie Rezepte zur Verfügung. |
| **Lebensmittel** | Datenbank mit 117 Lebensmitteln (Werte je 100 g), inkl. der Spezial-Zutaten der Sondennahrung (z. B. KetoCal 3:1, Johannisbrotkernmehl, Himmeltau Grießbrei); eigene Lebensmittel können ergänzt werden. |
| **Daten & Sicherung** | Daten als Datei exportieren/importieren oder alles zurücksetzen. |

## Rezepte

Ohne KetoCal: Gemüse-Fleischbrei (Zucchini / Karotte), Avocado-Ei-Creme,
Fisch-Brokkoli-Püree, Hähnchen-Karotte-Creme, Rührei-Sahne-Creme,
Beeren-Sahne-Creme, Thunfisch-Zucchini-Püree, Kartoffel-Gemüse-Creme.

Mit KetoCal: Obstbrei (Banane / Apfelmus / Banane & Apfelmus),
Gemüse-Kartoffelbrei (2 Varianten), Milch-Grieß-Obstbrei, Karottensuppe.

## Berechnungsgrundlage

- Kalorien je Gramm: Eiweiß 4 kcal, Fett 9 kcal, Kohlenhydrate 4 kcal.
- Keto-Verhältnis = Fett ÷ (Eiweiß + Kohlenhydrate).
- Kalorien pro Mahlzeit = Kalorien pro Tag ÷ Anzahl Mahlzeiten.
- Zur Anpassung wird die Fett-Zutat so berechnet, dass das gewählte Verhältnis
  und die Ziel-Kalorien gleichzeitig getroffen werden; die übrigen Zutaten
  werden proportional skaliert.

## Dateien

- `index.html` – Oberfläche
- `styles.css` – Gestaltung
- `app.js` – Logik und Berechnungen
- `foods.js` – Lebensmittel-Datenbank
- `recipes.js` – Sondennahrungs-Rezepte
- `build-single.py` – erzeugt die Einzeldatei `keto-rechner.html`

> Hinweis: In der Mehrdatei-Variante müssen alle Dateien im selben Ordner
> liegen. Es genügt **nicht**, nur `index.html` zu öffnen. Alternativ die
> Einzeldatei `keto-rechner.html` verwenden.

## Hinweis

Dieses Werkzeug dient der Planung und ersetzt keine ärztliche oder
diätologische Beratung. Die ketogene Ernährung über Sonde sollte – besonders
bei Kindern – nur in Absprache mit dem Behandlungsteam durchgeführt werden.
Die berechneten Mengen vor der Zubereitung bitte fachlich prüfen lassen.
