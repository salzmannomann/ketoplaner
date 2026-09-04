# HamHam Keto – Planer für ketogene Sondennahrung

Eine kleine Web-App für die **ketogene Sondennahrung** eines Kindes. Sie
enthält 50 fertige Rezepte, die automatisch auf die **verordnete
Verordnung** (Keto-Verhältnis, Kalorien pro Mahlzeit, Eiweiß) umgerechnet
werden – wahlweise **mit oder ohne KetoCal**, mit Anleitung für die
**Varoma-Zubereitung (Dämpfen im Thermomix)**, mit Abfüllhilfe für
vorgekochte Portionen und mit einem **Tagesplan**.

Die App läuft komplett im Browser – ohne Server, ohne Konto, ohne
Internetverbindung – und ist für das **Smartphone** gemacht. Über GitHub
Pages ist sie als **PWA offline-fähig** (Service Worker `sw.js`): Nach dem
ersten Laden funktioniert sie auch ohne Netz und aktualisiert sich zuverlässig
(die Service-Worker-Version wird beim Build automatisch erhöht). Alle Eingaben
werden **lokal im Browser gespeichert** (localStorage): Vorgaben, Favoriten,
eigene Rezepte, die zuletzt gewählte Menge je Rezept, angepasstes Wasser und
der Tagesplan.

Standardmäßig sind **700 kcal/Tag, 5 Mahlzeiten, 1,8:1 und 8 kg
Körpergewicht** (Eiweiß automatisch nach Gewicht) eingestellt.

## Starten

1. **Online / am Handy:** Die GitHub-Pages-Adresse öffnen und über „Zum
   Home-Bildschirm" installieren.
2. **Einzeldatei:** Nur die Datei **`keto-rechner.html`** herunterladen und per
   Doppelklick öffnen. Sie enthält alles.
3. **Mehrere Dateien:** **`index.html`** öffnen (`index.html`, `styles.css`,
   `app.js`, `foods.js` und `recipes.js` müssen im selben Ordner liegen).

Keine Installation, kein Server nötig.

## Aufbau der App

Die App hat drei Bereiche, erreichbar über die Leiste am unteren Rand
(am Desktop oben):

| Bereich | Wofür |
| --- | --- |
| **Heute** | Tagesplan: ein Slot je Mahlzeit, Tagessummen, Füttern-Ansicht |
| **Rezepte** | Rezeptliste mit Suche, Schnellfiltern, Favoriten und eigenem Rezept |
| **Vorgaben** | Verordnung, MCT-Öl, Küche, Daten (Backup) |

Oben rechts zeigt der **Verordnungs-Chip** (z. B. „1,8:1 · 140 kcal/Mahlz. ·
MCT 10 % ⚖️") jederzeit, womit gerade gerechnet wird; ein Tipp darauf öffnet
die Vorgaben.

### Vorgaben

- **Verordnung:** Presets **1,8:1** / **1:1** (z. B. für die Ausschleichphase),
  Verhältnis frei, **Kalorien pro Tag**, **Mahlzeiten pro Tag**, Körpergewicht
  und Eiweiß (fix pro Tag oder automatisch g/kg). Daraus ergeben sich kcal und
  Eiweiß-Ziel je Mahlzeit.
- **MCT-Öl:** Anteil an der Öl-Fettmasse in Stufen (0 / 10 / 20 / 30 / 50 /
  100 %; Vorbelegung 10 %) und Rechenmodus (siehe unten); Fett- und
  kcal-Werte des MCT-Öls sind vom Etikett übersteuerbar.
- **Küche:** Verdunstung beim Dämpfen (ml) – einmal für den eigenen Thermomix
  kalibrieren (Standard 150 ml).
- **Daten:** **Backup exportieren/importieren** (JSON-Datei oder Text zum
  Kopieren) – so lassen sich alle Einstellungen, Favoriten, eigene Rezepte und
  der Tagesplan auf ein anderes Handy übertragen. **„Werte prüfen"** listet
  die Nährwerte aller verwendeten Lebensmittel zum Abgleich mit der
  Diätologin.

### Rezepte

- **Suche** nach Name oder Zutat.
- **Schnellfilter:** KetoCal dreistufig (**alle / ohne / mit**), Kategorie
  (Alle, Fleisch, Fisch, Vegetarisch, Obst), **👩‍⚕️ Diätologie** (nur
  Original-Rezepte aus den Vorlagen), **🥫 Unterwegs** (Fertigprodukt) und
  **🍼 Flasche** (Sondenflasche aus KetoCal + Pre-Milch; unabhängig vom
  KetoCal-Filter immer auffindbar). Sortierung nach Kategorie, Name oder Eiweiß.
- Die **Kacheln** zeigen Icon, Name, kcal, Verhältnis und Eiweiß; ein Stern
  markiert Favoriten (immer ganz oben).
- **🧪 Eigenes Rezept:** beliebige Zutaten (z. B. saisonales Obst) plus ein oder
  mehrere Fette zum Ausgleich; die App berechnet die Fettmenge fürs
  Verhältnis, wahlweise für eine fixe Zutatenmenge oder hochgerechnet auf eine
  Mahlzeit. Eigene Rezepte können gespeichert, bearbeitet und gelöscht werden.

### Detailansicht eines Rezepts

Die Detailansicht ist in drei Reiter geteilt – so, wie man in der Küche
arbeitet:

1. **Kochen** – Zutatentabelle für die gewählte Menge (Portionen-Stepper,
   „1 Portion" / „Ganzer Tag"), **Fleisch-Umschalter 🍗 Huhn / 🥩 Rind /
   🦃 Pute** und die **Varoma-Anleitung** als nummerierte Schritte. Ändert man
   eine Zutatenmenge direkt (z. B. „827 g Zucchini"), skalieren alle anderen
   Zutaten proportional mit; **Wasser** ist davon ausgenommen und kann
   unabhängig angepasst werden. Menge und Wasser werden **je Rezept gemerkt**.
2. **Abfüllen** – groß: **Menge je Portion ohne Öl** (das Öl kommt erst kurz
   vor dem Verabreichen dazu), darunter die Öl-Menge je Portion (Rapsöl / MCT
   getrennt) und die Gesamtmenge.
3. **Rechnen** – Kennzahlen (kcal, Verhältnis, Eiweiß, Fett, KH), die
   MCT-Kacheln und Warnungen sowie die Links „Zutaten anpassen / tauschen"
   (öffnet das Rezept im freien Rechner) und **Drucken** (A4 Hochformat).

### Heute (Tagesplan)

Ein Slot je Mahlzeit (Anzahl folgt den Vorgaben). Über **„Rezept wählen"**
öffnet sich ein Picker mit Suche; jeder Slot zeigt kcal, Verhältnis, Menge und
Öl. Unten stehen die **Tagessummen** (kcal, Eiweiß, Fett, MCT gesamt) im
Vergleich zur Verordnung. Die **Füttern-Ansicht** zeigt je Slot nur das, was am
Bett gebraucht wird (Menge, Öl, ggf. Hinweise); der Tagesplan lässt sich
drucken.

## Fachliche Details

**Zutaten** verwenden österreichische Bezeichnungen (Erdäpfel, Karotten,
Karfiol, Hendl, Paradeiser, Marille, Schlagobers …). Beim Geflügel wird
stückiges Fleisch ohne Haut verwendet (Hühnerbrust, Putenbrust); beim Rind –
wie von der Diätologin vorgesehen – **Rinderfaschiertes** (lässt sich feiner
pürieren und verstopft die Spritze weniger).

**Fleisch tauschen:** Beim Umstellen ändert sich nur das Fleisch – Gemüse,
Wasser und Öl bleiben gleich. Die Fleischmenge wird so berechnet, dass das
Verhältnis exakt erhalten bleibt; die Kalorien können leicht variieren (wird
angezeigt). Der Tausch gilt nur für die geöffnete Ansicht.

**MCT-Anteil (Rapsöl / MCT):** Beim Tausch eines Fettes gegen ein Fett
anderer Energiedichte lassen sich Fettmasse, Kalorien und Verhältnis nicht
gleichzeitig halten – nur zwei davon; welche, entscheidet die Anwenderin:

- **⚖️ Verhältnis halten:** Das Verhältnis bleibt für jeden MCT-Anteil exakt
  gleich; die Kalorien sinken mit dem Anteil, weil MCT weniger kcal je Gramm
  liefert.
- **🎯 Kalorien halten:** Die Kalorien bleiben gleich; dafür steigt das
  Verhältnis mit dem Anteil – die App warnt ab +0,05, denn das ist eine
  Änderung der Verordnung, nicht der Fettart.

Drei Kacheln zeigen den **MCT-Anteil der Energie in %** (Einordnung nach der
Konsensusempfehlung: modifizierte MCT-Diät 30 %, Arbeitsbereich 40–50 %,
traditionelle MCT-Diät 60 % – Kossoff 2018, Liu 2013, Neal 2009), die
**Kalorienabweichung** je Portion und Tag sowie die **MCT-Gramm je Portion**
(maßgeblich für die Verträglichkeit; besser wenig je Mahlzeit, dafür in jeder
Mahlzeit). Die Vorbelegung 8,3 kcal/g für MCT ist ein Praxiswert, kein
belegter Etikettwert – bitte vom Etikett übernehmen. Bei 0 % rechnet die App
exakt wie ohne MCT-Funktion.

**Dämpfwasser mitverwenden (Varoma):** Beim Dämpfen gehen wasserlösliche
Nährstoffe ins Wasser über. Die Varoma-Anleitung berechnet daher, wie viel
Wasser in den Mixtopf gehört (**Rezept-Wasser + Verdunstungs-Reserve**); nach
dem Dämpfen wird das Wasser nicht abgegossen, sondern die Rezeptmenge davon
abgemessen und mitpüriert. Püriert wird 1 Min./Stufe 10 und anschließend durch
ein feines Sieb gestrichen, damit die Spritze nicht verstopft.

**Herkunft:** Rezepte direkt von der Diätologie (aus den PDF-/Excel-Vorlagen)
tragen das Schild **„👩‍⚕️ Diätologie"**. Bei Rezepten ohne KetoCal weist die App
darauf hin, dass Vitamine und Mineralstoffe separat ergänzt werden müssen.

## Rezepte (50 insgesamt: 21 mit / 29 ohne KetoCal)

Ausgewogen über die Kategorien (Fleisch, Fisch, vegetarisch inkl. Ei-,
Erdäpfel- und Gemüsegerichte sowie Obst). Die Namen folgen dem Schema
**„Hauptzutat & Beilage"** (z. B. „Hendl & Karotte", „Ei & Spinat"); KetoCal-
Varianten tragen den Zusatz „(mit KetoCal)". Dazu kommen das Fertigprodukt
**„HiPP Hühnchen & Öl"** (Unterwegs) und die Sondenflasche **„Flasche: KetoCal &
Pre Apta"** (Flasche). 35 Rezepte haben eine Varoma-Anleitung, die übrigen
werden klassisch zubereitet.

## Berechnungsgrundlage

- Kalorien je Gramm: Eiweiß 4 kcal, Fett 9 kcal, Kohlenhydrate 4 kcal (bei
  Lebensmitteln mit Etikett-kcal wird dieser Wert verwendet).
- Keto-Verhältnis = Fett ÷ (Eiweiß + Kohlenhydrate).
- Kalorien pro Mahlzeit = Kalorien pro Tag ÷ Anzahl Mahlzeiten.
- Zur Anpassung wird die Fett-Zutat so berechnet, dass Verhältnis und
  Ziel-Kalorien gleichzeitig getroffen werden; die übrigen Zutaten werden
  proportional skaliert. Alle Nährwerte stammen aus `foods.js`.

## Entwicklung

```
npm install        # einmalig: jsdom für die Tests
npm run build      # src/*.js -> app.js, Versionen, keto-rechner.html
npm test           # Build + Regressionstests (node --test)
```

Der Quellcode liegt modular in **`src/`** (nummeriert in Ladereihenfolge:
State, Helfer, Lebensmittel, Filter, Rezept-Anpassung, Fleisch-Tausch,
Öl-Rechnung, Rezeptliste, Kopfzeile/Vorgaben, Kachel, Detailansicht, Tagesplan,
Drucken, eigenes Rezept, Init). **`app.js` ist generiert** – Änderungen bitte
in `src/` machen und `npm run build` ausführen. Die Tests in `test/`
starten die gebaute App in jsdom und prüfen u. a., dass alle Rezepte das
Verhältnis bei 1,8:1 und 1:1 treffen, die MCT-Rechnung ihre Zusicherungen
einhält, Wasser unabhängig skaliert, Abfüllmengen aufgehen, Filter, Backup und
Tagesplan funktionieren.

## Dateien

- `index.html` – Oberfläche (drei Bereiche, Overlays)
- `styles.css` – Gestaltung
- `src/*.js` – Logik und Berechnungen (Quellcode)
- `app.js` – aus `src/` gebaut (nicht direkt bearbeiten)
- `foods.js` – Lebensmittel-Datenbank; basiert auf der Lebensmittelliste der
  Diätologin (österreichische Namen/Werte) plus wenige Zusätze
- `recipes.js` – Standard-Rezepte
- `test/app.test.js` – Regressionstests
- `build-single.py` – Build (siehe oben), erzeugt auch `keto-rechner.html`
- `sw.js`, `manifest.webmanifest`, `icon-*.png` – PWA/Offline

## Hinweis

Dieses Werkzeug dient der Planung und ist **keine Behandlungsempfehlung**; es
ersetzt keine ärztliche oder diätologische Beratung. Die ketogene Ernährung
über Sonde sollte – besonders bei Kindern – nur in Absprache mit dem
Behandlungsteam durchgeführt werden. Die berechneten Mengen vor der
Zubereitung bitte fachlich prüfen lassen.
