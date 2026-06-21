# Keto-Rechner

Eine Web-App zur Planung der ketogenen Ernährung – die digitale Umsetzung der
Excel-Datei *Keto_Rechner_Final.xlsx*.

Die App läuft komplett im Browser, ohne Server und ohne Internetverbindung.
Alle Eingaben werden **lokal im Browser gespeichert** (localStorage) – es wird
nichts hochgeladen.

## Starten

Einfach die Datei **`index.html`** im Browser öffnen (Doppelklick).
Es ist keine Installation und kein Server nötig.

## Funktionen

| Bereich | Beschreibung |
| --- | --- |
| **Einstellungen** | Kalorien/Tag, Verhältnis (z. B. 4:1), Eiweiß/Tag und Mahlzeiten/Tag eingeben. Daraus werden Fett, Eiweiß und Kohlenhydrate pro Tag und pro Mahlzeit berechnet. |
| **Mahlzeit berechnen** | 3 Zutaten wählen und die Gramm der Hauptzutat eingeben – die App berechnet automatisch die nötigen Mengen der anderen zwei Zutaten, damit Verhältnis **und** Kalorien stimmen. |
| **Verhältnis korrigieren** | Eiweiß/Fett/KH einer Mahlzeit eingeben und sofort sehen, wie viel Fett (Butter) zugegeben oder weggelassen werden muss. |
| **Mahlzeiten** (Frühstück, Snack, Mittag, Nachmittag, Abend) | Pro Mahlzeit Lebensmittel und Mengen eintragen, mit Ampel-Prüfung des Verhältnisses. |
| **Tagesübersicht** | Alle Mahlzeiten summiert, Vergleich mit dem Tagesziel. |
| **Gespeicherte Mahlzeiten** | Fest hinterlegte **Sondennahrungs-Rezepte** (aus dem Arbeitsblatt) inkl. Zutaten, Mengen, Verhältnis und Zubereitung, plus eigene Lieblings-Mahlzeiten. Mit **Filter** nach Sondennahrung / eigenen Mahlzeiten. Rezepte lassen sich mit einem Klick in eine Mahlzeit laden oder als eigene Mahlzeit kopieren. |
| **Lebensmittel** | Datenbank mit 117 Lebensmitteln (Werte je 100 g), inkl. der Spezial-Zutaten der Sondennahrung (z. B. KetoCal 3:1, Johannisbrotkernmehl, Himmeltau Grießbrei); eigene Lebensmittel können ergänzt werden. |
| **Daten & Sicherung** | Daten als Datei exportieren/importieren oder alles zurücksetzen. |

## Berechnungsgrundlage

- Kalorien je Gramm: Eiweiß 4 kcal, Fett 9 kcal, Kohlenhydrate 4 kcal.
- Keto-Verhältnis = Fett ÷ (Eiweiß + Kohlenhydrate).
- Fett pro Tag = Verhältnis × Kalorien ÷ (9 × Verhältnis + 4).
- Kohlenhydrate pro Tag = Kalorien ÷ (9 × Verhältnis + 4) − Eiweiß.

Die Logik entspricht 1:1 den Formeln der ursprünglichen Excel-Datei.

## Dateien

- `index.html` – Oberfläche
- `styles.css` – Gestaltung
- `app.js` – Logik und Berechnungen
- `foods.js` – Lebensmittel-Datenbank
- `recipes.js` – Sondennahrungs-Rezepte

> Hinweis: Alle Dateien müssen im selben Ordner liegen. Es genügt **nicht**,
> nur `index.html` zu öffnen.

## Hinweis

Dieses Werkzeug dient der Planung und ersetzt keine ärztliche oder
diätologische Beratung. Die ketogene Ernährung sollte – besonders bei Kindern –
nur in Absprache mit Fachpersonal durchgeführt werden.
