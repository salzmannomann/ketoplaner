# Keto-Sondennahrung

Eine einfache Web-App für die **ketogene Sondennahrung**. Sie zeigt rund 20
fertige Standard-Rezepte, die automatisch auf das gewünschte Keto-Verhältnis und
die Kalorien pro Mahlzeit berechnet werden – wahlweise **mit oder ohne KetoCal**,
mit **Icon** zur schnellen Erkennung und mit Anleitung für die klassische
Zubereitung sowie den **Thermomix TM5**.

Die App läuft komplett im Browser, ohne Server und ohne Internetverbindung,
und funktioniert auch am **Smartphone**. Über GitHub Pages ist sie zudem
**offline-fähig** (Service Worker `sw.js`): Nach dem ersten Laden funktioniert
sie auch ohne Internet, startet schneller und aktualisiert sich zuverlässig
(die Service-Worker-Version wird beim Build automatisch erhöht). Alle Eingaben (Einstellungen und das
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

1. Der Kopfbereich ist bewusst schlank, damit sofort die Rezepte sichtbar
   sind: In der oberen Leiste gibt es die Buttons **⚙️ Einstellungen** und
   **🧪 Eigenes Rezept**; darunter steht eine schmale Zusammenfassungs-Zeile
   (kcal/Mahlzeit, Verhältnis, Eiweiß-Ziel) mit einem **ⓘ** für den
   KetoCal-Hinweis. Über **⚙️ Einstellungen** klappen die Felder auf:
   **Kalorien pro Tag** (Standard 700), **Anzahl Mahlzeiten
   pro Tag** (Standard 5) und **Verhältnis** (Standard 1,8:1). Beim **Eiweiß**
   kann man entweder einen Wert pro Tag
   eingeben oder **automatisch nach Körpergewicht** berechnen lassen
   (Körpergewicht × g/kg, z. B. 1,5 g/kg/Tag – Richtwert für Kinder, bitte mit
   dem Behandlungsteam abstimmen). Daraus werden **kcal pro Mahlzeit** und das
   **Eiweiß-Ziel pro Mahlzeit** angezeigt.
2. **Schnellfilter** per Buttons – direkt über den Rezepten: zwei
   unabhängige KetoCal-Schalter **Ohne KetoCal** / **Mit KetoCal** (keiner
   aktiv = alle), **Kategorie** (Alle, Fleisch, Fisch, Vegetarisch, Obst) und
   der unabhängige Schalter **👩‍⚕️ Diätologie** (nur die Original-Rezepte aus
   den Vorlagen). Alle Schalter sind frei kombinierbar.
   Zusätzlich **Sortierung/Gruppierung**: nach Kategorie
   (mit Überschriften, Favoriten oben), Name (A–Z) oder Eiweiß.
3. Darunter erscheinen die passenden Rezepte als **Kacheln** mit **Icon**, kcal,
   Verhältnis, Menge (g/ml) und Eiweiß.
4. Klick auf eine Kachel öffnet das vollständige Rezept: Zutaten, Kennzahlen,
   **Thermomix-TM5-Anleitung**, bei geeigneten Rezepten (Fleisch-, Fisch- und
   Gemüsegerichten) zusätzlich eine **Varoma-Zubereitung (Dämpfen)**,
   klassische Zubereitung, **Rezept drucken** und
   **„Zutaten anpassen / tauschen"** (öffnet das Rezept im freien Rechner – dort
   kann man Zutaten oder Fette entfernen, tauschen oder ergänzen, z. B. Rapsöl
   durch Butter ersetzen; die Mengen werden automatisch neu berechnet)
   (für **A4-Hochformat** optimiert). **Menge/Portionen skalieren:** Mit den
   Buttons **„1 Portion"** / **„Ganzer Tag (×N)"**, dem **Portionen-Stepper**
   (− / +) oder indem man in der Zutatentabelle **eine Menge direkt ändert**
   (z. B. „150 g Hendl") werden **alle anderen Zutaten proportional
   mitskaliert** – das Verhältnis bleibt gleich. So kann man rasch eine
   größere Menge für mehrere Mahlzeiten vorkochen und einkühlen.

**Eigenes Rezept zusammenstellen:** Über den Button „🧪 Eigenes Rezept" kann man
z. B. ein saisonales Lebensmittel (etwa Erdbeeren) wählen und ein oder **mehrere
Fette zum Ausgleich** (Schlagobers, Butter, Streichgenuss, Öl …). Bei mehreren
Fetten gibt man je einen Anteil in % an, nach dem die berechnete Fettmenge
aufgeteilt wird. Die App berechnet automatisch die Menge des Fetts, damit das
eingestellte Verhältnis stimmt – wahlweise für eine fixe Zutatenmenge oder
automatisch hochgerechnet auf eine ganze Mahlzeit. Beliebig viele Zutaten
kombinierbar.

Alle Zutaten verwenden **österreichische Bezeichnungen** (Erdäpfel, Karotten,
Karfiol, Hendl, Paradeiser, Marille, Schlagobers …). Beim Fleisch wird
einheitlich **stückiges, mageres Fleisch** verwendet (Geflügel ohne Haut:
Hühnerbrust und Putenbrust; dazu mageres Rindfleisch – kein Faschiertes).

**Fleisch schnell tauschen:** Bei jedem Rezept mit Huhn, Rind oder Pute
(jeweils stückiges Fleisch ohne Haut) gibt es in der Detailansicht einen
Umschalter **🍗 Huhn / 🥩 Rind /
🦃 Pute**. Beim Umstellen ändert sich **nur das Fleisch** – Gemüse, Wasser
**und Öl/Fett bleiben gleich**. Die Fleischmenge wird so berechnet, dass das
**Verhältnis 1,8:1** exakt erhalten bleibt (sie weicht daher etwas von den
Richtwerten 20/30/18 g der Diätologin ab; beim mageren Rindfleisch z. B.
~23–25 g statt 30 g). Die Kalorien können dabei leicht variieren (wird
angezeigt). So kann man rasch umstellen, wenn eine Sorte gerade nicht zu
Hause ist. Der Tausch ist **temporär**: Beim Schließen des Rezepts steht wieder
das Standard-Fleisch; die Kachel bleibt unverändert.

**Herkunft:** Rezepte, die direkt von der Diätologie stammen (aus den
hochgeladenen PDF-/Excel-Vorlagen), sind mit dem Schild **„👩‍⚕️ Diätologie"**
gekennzeichnet – auf der Kachel und in der Detailansicht. Alle übrigen Rezepte
sind ergänzte Varianten.

**Favoriten:** Jede Kachel hat einen Stern (☆/★). Als Favorit markierte Rezepte
erscheinen immer ganz oben.

**Eigene Rezepte:** Eine im freien Rechner zusammengestellte Mahlzeit kann mit
Namen **gespeichert** werden. Sie erscheint dann mit dem Hinweis „eigenes" in der
Liste und kann jederzeit **bearbeitet** (Zutaten/Fette ändern, Menge wird neu
berechnet), als Favorit markiert oder **gelöscht** werden.

Es werden nur Rezepte angezeigt, die das eingestellte Verhältnis sicher
erreichen. Bei Rezepten ohne KetoCal weist die App darauf hin, dass Vitamine
und Mineralstoffe separat ergänzt werden müssen.

## Rezepte (47 insgesamt: 20 mit / 27 ohne KetoCal)

Ausgewogen über die Kategorien (Fleisch, Fisch, vegetarisch inkl. Ei-,
Erdäpfel- und Gemüsegerichte sowie Obst). Die Namen folgen einem einheitlichen
Kurzschema **„Hauptzutat & Beilage"** (z. B. „Hendl & Karotte", „Ei & Spinat",
„Banane (Obstbrei)"); KetoCal-Varianten tragen den Zusatz „(mit KetoCal)".
Enthalten sind u. a. mehrere Erdäpfel-Rezepte und Obstbreie (Banane, Apfelmus,
Marille, Heidelbeere).

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
- `foods.js` – Lebensmittel-Datenbank (intern für die Berechnung); basiert auf
  der vollständigen Lebensmittelliste der Diätologin (österreichische Namen/Werte)
  plus wenige Zusätze, die die Rezepte benötigen
- `recipes.js` – Standard-Rezepte
- `build-single.py` – erzeugt die Einzeldatei `keto-rechner.html`

## Hinweis

Dieses Werkzeug dient der Planung und ersetzt keine ärztliche oder
diätologische Beratung. Die ketogene Ernährung über Sonde sollte – besonders
bei Kindern – nur in Absprache mit dem Behandlungsteam durchgeführt werden.
Die berechneten Mengen vor der Zubereitung bitte fachlich prüfen lassen.
