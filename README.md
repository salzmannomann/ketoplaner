# Keto-Sondennahrung

Eine einfache Web-App für die **ketogene Sondennahrung**. Sie zeigt rund 20
fertige Standard-Rezepte, die automatisch auf das gewünschte Keto-Verhältnis und
die Kalorien pro Mahlzeit berechnet werden – wahlweise **mit oder ohne KetoCal**,
mit **Icon** zur schnellen Erkennung und mit Anleitung für die klassische
Zubereitung sowie den **Thermomix TM5**.

Die App läuft komplett im Browser, ohne Server und ohne Internetverbindung,
und funktioniert auch am **Smartphone**. Alle Eingaben (Einstellungen und das
zuletzt zusammengestellte eigene Rezept) werden **lokal im Browser gespeichert**
(localStorage) und beim nächsten Aufruf automatisch wieder vorausgefüllt.
Standardmäßig sind 700 kcal/Tag, 5 Mahlzeiten, 1,8:1 und 8 kg Körpergewicht
(Eiweiß automatisch nach Gewicht) eingestellt.

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

1. Oben einstellen: **Kalorien pro Tag** (Standard 700), **Anzahl Mahlzeiten
   pro Tag** (Standard 5), **Verhältnis** (Standard 1,8:1) und **Ohne / Mit
   KetoCal / Alle**. Beim **Eiweiß** kann man entweder einen Wert pro Tag
   eingeben oder **automatisch nach Körpergewicht** berechnen lassen
   (Körpergewicht × g/kg, z. B. 1,5 g/kg/Tag – Richtwert für Kinder, bitte mit
   dem Behandlungsteam abstimmen). Daraus werden **kcal pro Mahlzeit** und das
   **Eiweiß-Ziel pro Mahlzeit** angezeigt.
2. **Schnellfilter** per Buttons: Alle, mit Fleisch, mit Fisch, vegetarisch,
   mit Obst, ohne Obst.
3. Darunter erscheinen die passenden Rezepte als **Kacheln** mit **Icon**, kcal,
   Verhältnis, Menge (g/ml) und Eiweiß.
4. Klick auf eine Kachel öffnet das vollständige Rezept: Zutaten, Kennzahlen,
   **Thermomix-TM5-Anleitung**, klassische Zubereitung und **Rezept drucken**
   (für **A4-Hochformat** optimiert). Mit dem Umschalter **„1 Mahlzeit /
   Ganzer Tag"** werden die Mengen direkt für den ganzen Tag (× Anzahl
   Mahlzeiten) angezeigt – praktisch zum Vorkochen.

**Eigenes Rezept zusammenstellen:** Über den Button „🧪 Eigenes Rezept" kann man
z. B. ein saisonales Lebensmittel (etwa Erdbeeren) wählen und ein oder **mehrere
Fette zum Ausgleich** (Schlagobers, Butter, Streichgenuss, Öl …). Bei mehreren
Fetten gibt man je einen Anteil in % an, nach dem die berechnete Fettmenge
aufgeteilt wird. Die App berechnet automatisch die Menge des Fetts, damit das
eingestellte Verhältnis stimmt – wahlweise für eine fixe Zutatenmenge oder
automatisch hochgerechnet auf eine ganze Mahlzeit. Beliebig viele Zutaten
kombinierbar.

Alle Zutaten verwenden **österreichische Bezeichnungen** (Erdäpfel, Karotten,
Karfiol, Hendl, Faschiertes, Paradeiser, Marille, Schlagobers …).

Es werden nur Rezepte angezeigt, die das eingestellte Verhältnis sicher
erreichen. Bei Rezepten ohne KetoCal weist die App darauf hin, dass Vitamine
und Mineralstoffe separat ergänzt werden müssen.

## Rezepte (40 insgesamt: 20 mit / 20 ohne KetoCal)

Ausgewogen über die Kategorien – je Seite etwa 6 mit Fleisch, 4 mit Fisch,
10 vegetarisch (inkl. Ei-, Erdäpfel- und Gemüsegerichte) und 4 mit Obst
(etwas mehr Fleisch- als Fischgerichte). Enthalten sind u. a. mehrere
Erdäpfel-Rezepte und Obstbreie (Banane, Apfelmus, Marille, Heidelbeeren).

Alle Rezepte erreichen das Verhältnis 1,8:1 sicher.

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
