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
| **Einstellungsleiste** | Direkt über den Rezepten: **Kalorien pro Tag**, **Anzahl Mahlzeiten pro Tag**, **Verhältnis**, **Eiweiß pro Tag** und die Auswahl **Ohne / Mit KetoCal / Alle**. Daraus werden **Kalorien pro Mahlzeit** und das **Eiweiß-Ziel pro Mahlzeit** berechnet. |
| **Rezepte (Übersicht + Detail)** | Kompakte Kacheln zum schnellen Durchschauen (Name, kcal, Verhältnis, Menge in g/ml, Eiweiß). Klick öffnet das vollständige Rezept mit Zutatentabelle, Kennzahlen, **Thermomix-TM5-Anleitung**, klassischer Zubereitung und **Rezept drucken**. |
| **Automatische Anpassung** | Jedes Rezept wird **automatisch** auf das eingestellte Verhältnis und die Kalorien pro Mahlzeit umgerechnet (die Fett-Zutat Butter/Öl/Sahne wird passend angepasst). Es werden nur Rezepte angezeigt, die das eingestellte Verhältnis sicher erreichen (Standard **1,8:1**). Alle Nährwerte stammen aus der Lebensmittel-Datenbank. |
| **Eiweiß-Kontrolle** | Pro Rezept wird das Eiweiß mit dem Ziel verglichen; liegt es darunter, erscheint ein Hinweis. |
| **Mit / ohne KetoCal** | Über die Auswahl lassen sich gezielt Rezepte **ohne KetoCal** anzeigen (Standard) – mehrere KetoCal-freie Rezepte stehen zur Verfügung. Bei Rezepten ohne KetoCal wird auf die nötige Ergänzung von Vitaminen/Mineralstoffen hingewiesen. |
| **Lebensmittel** | Datenbank mit 117 Lebensmitteln (Werte je 100 g), inkl. der Spezial-Zutaten der Sondennahrung (z. B. KetoCal 3:1, Johannisbrotkernmehl, Himmeltau Grießbrei); eigene Lebensmittel können ergänzt werden. |
| **Daten & Sicherung** | Daten als Datei exportieren/importieren oder alles zurücksetzen. |

## Rezepte

Ohne KetoCal: Gemüse-Fleischbrei (Zucchini / Karotte), Fisch-Brokkoli-Püree,
Hähnchen-Karotte-Creme, Hähnchen-Zucchini-Creme, Blumenkohl-Hähnchen-Creme,
Pute-Karotte-Creme, Rindfleisch-Gemüse-Püree, Forelle-Kartoffel-Püree,
Thunfisch-Zucchini-Püree, Kartoffel-Gemüse-Creme, Avocado-Ei-Creme,
Rührei-Sahne-Creme, Beeren-Sahne-Creme.

Mit KetoCal: Obstbrei (Banane / Apfelmus / Banane & Apfelmus),
Gemüse-Kartoffelbrei (2 Varianten), Milch-Grieß-Obstbrei, Karottensuppe.

Hinweis: Sehr fettreiche Rezepte (z. B. Avocado-Ei-, Rührei-Sahne-,
Beeren-Sahne-Creme) erscheinen erst ab einem höheren Verhältnis, da sie ein
Verhältnis von 1,8:1 nicht erreichen können.

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
