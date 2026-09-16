# HamHam Keto – Planer für ketogene Sondennahrung

Eine kleine Web-App für die **ketogene Sondennahrung** eines Kindes. Sie
enthält 36 fertige Gerichte (50 Rezept-Varianten), die automatisch auf die **verordnete
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

Oben rechts zeigt der **Verordnungs-Chip** jederzeit, womit gerade gerechnet
wird: Zeile 1 die Verordnung (z. B. „1,8:1 · 140 kcal × 5 · 🥄 KetoCal · MCT
10 % ⚖️"), Zeile 2 die Flüssigkeit (Ziel je Tag, Modus, und laut Tagesplan die
Menge, die zwischen den Mahlzeiten zu sondieren ist). Ein Tipp darauf öffnet die
Vorgaben.

### Vorgaben

- **Verordnung:** Beim Verhältnis wird nur die **vordere Zahl** eingegeben,
  „:1" steht fix daneben („1,8", „1,5", „1"); die App zeigt Verhältnisse
  überall als „x:1", auch unter 1 (z. B. „0,67:1") und warnt dann unter dem
  Feld,
  **Kalorien pro Tag (Ziel)** (leer = Vorschlag nach Gewicht, 80 kcal/kg) und
  **Kalorien mindestens pro Tag** (leer = Vorschlag 70 kcal/kg; die Zusammenfassung zeigt dazu den Richtwert
  ≈ 80 kcal/kg und den Korridor 70–90 kcal/kg nach FAO/WHO/UNU 2004 für
  6–24 Monate – bitte mit der Diätologin abgleichen), **Mahlzeiten pro Tag**, Körpergewicht
  und Eiweiß (fix pro Tag oder g/kg; Standard der App 1,5 g/kg/Tag, sichtbar
  markiert). Daraus ergeben sich kcal und Eiweiß-Ziel je Mahlzeit. Ein
  Vorschlag steht als echter Wert im Feld; die Zeile darunter sagt, woher er
  kommt: grün **„✓ Vorschlag nach Gewicht (80 kcal/kg)"** oder **„eigener
  Wert · ↺ Vorschlag 680"** zum Zurücksetzen. Tippt man genau den Vorschlag
  ein oder leert das Feld, gilt wieder der Vorschlag. Nichts verschiebt sich
  dabei.
- **Flüssigkeit:** ein Schalter mit zwei Stellungen – **„💉 zwischen den
  Mahlzeiten sondieren"** (Standard) oder **„🥣 in den Mahlzeiten dabei"** –
  dazu **Flüssigkeit gesamt pro Tag** (leer = Vorschlag nach Holliday-Segar,
  100 ml/kg bis 10 kg) und, nur beim Sondieren, **Wasser je Zwischenzeit**
  (Vorgabe 60 ml = eine Spritze; bei N Mahlzeiten N−1 Gaben). Beim Sondieren
  kommt der Rest des Tagesbedarfs in die Mahlzeiten, höchstens 25 ml/kg je
  Mahlzeit; reicht das nicht, nennt die App die Fehlmenge. „In den Mahlzeiten
  dabei" gibt jeder Mahlzeit ihren vollen Anteil. Gemerktes Wasser hat immer
  Vorrang; liegt eine Mahlzeit über 25 ml/kg, warnt die App. Gezählt wird das
  Wasser der Zutaten (Näherung: Rest ohne Eiweiß, Fett, KH, Ballaststoffe;
  Pulver und Fertigprodukte mit Etikettwert) plus das Rezept-Wasser.
- **Rundung beim Abwiegen (fest):** Gemüse, Fleisch, Obst, Brei und Pulver
  werden auf 0,5 g gerundet, Wasser auf 1 ml.
  Fettträger (Öl, Butter, Obers, KetoCal) folgen dieser Rundung **nicht**: sie
  werden nach dem Runden der anderen Zutaten so nachgestellt, dass das
  Verhältnis exakt stimmt, und immer auf 0,1 g genau angezeigt (z. B. 21,0 g). Gerundet wird die
  Menge, die auf der Waage liegt; Vielfache („Ganzer Tag") bleiben im Raster.
- **Rechenregel:** **⚖️ Verhältnis halten** oder **🎯 Kalorien halten** – eine
  Regel für den Fall, dass nicht beides geht (MCT-Anteil). In den Rezepten
  wird die Regel nur angezeigt.
- **MCT-Öl:** Anteil an der Öl-Fettmasse in Stufen (0 / 10 / 20 / 30 / 50 /
  100 %; Vorbelegung 10 %); Erklärung und die vom Etikett übersteuerbaren
  Fett-/kcal-Werte erscheinen erst ab 10 %.
- **Küche:** Verdunstung beim Dämpfen (ml) – einmal für den eigenen Thermomix
  kalibrieren (Standard 150 ml).
- **Daten:** **Backup exportieren/importieren** (JSON-Datei oder Text zum
  Kopieren) – so lassen sich alle Einstellungen, Favoriten, eigene Rezepte und
  der Tagesplan auf ein anderes Handy übertragen. **„Werte prüfen"** listet
  die Nährwerte aller verwendeten Lebensmittel zum Abgleich mit der
  Diätologin.

### Rezepte

- **Ein Eintrag je Gericht.** Hat ein Gericht eine Variante mit und ohne
  KetoCal (z. B. „Hendl & Zucchini" mit Rapsöl oder mit KetoCal + Butter) –
  **jedes Rezept ist ein eigener Eintrag** mit gleichem Namen und einem
  Fettbasis-Schild („Rapsöl" bzw. „🥄 KetoCal + Butter"); der Eintrag ohne
  KetoCal steht zuerst. Rezepte, die nur mit KetoCal existieren, tragen
  „🥄 KetoCal". Im ⋯-Menü lassen sich **Rezepte mit KetoCal ausblenden**.
- **Gruppen nach Hauptzutat:** 🍗 Geflügel, 🥩 Rind & Schwein, 🐟 Fisch,
  🥚 Ei, 🥔 Erdäpfel & Gemüse, 🍓 Obst & Brei und 🥤 Angerührt (ohne Kochen:
  HiPP-Fertigprodukt, KetoCal & Pre Apta, Compleat & KetoCal, Compleat & KetoCal & Pre Apta). Die Gruppen stehen
  in **einer wischbaren Chip-Zeile**, direkt darunter beginnen die Rezepte. Rechts
  daneben: **🔍 Suche** (klappt ein Suchfeld auf), **🧪 Eigenes Rezept** und **⋯**
  mit dem Haken **👩‍⚕️ nur Rezepte der Diätologie** (Original-Rezepte aus den
  Vorlagen) und der Sortierung nach Gruppe, Name, Eiweiß oder Menge. Die
  Eine KetoCal-Vorgabe gibt es nicht mehr.
- Die **Kacheln** zeigen Icon, Name, aktive Fettbasis, kcal und Eiweiß; ein
  Stern markiert Favoriten (immer ganz oben).
- **🧪 Eigenes Rezept:** beliebige Zutaten (z. B. saisonales Obst) plus ein oder
  mehrere Fette zum Ausgleich; die App berechnet die Fettmenge fürs
  Verhältnis, wahlweise für eine fixe Zutatenmenge oder hochgerechnet auf eine
  Mahlzeit. Eigene Rezepte können gespeichert, bearbeitet und gelöscht werden.

### Detailansicht eines Rezepts

Die Detailansicht besteht aus **sechs Blättern** und öffnet mit **Mahlzeit**. Am
Handy liegen die Blätter nebeneinander: seitlich wischen oder auf die Reiterleiste
tippen; jedes Blatt passt auf einen Bildschirm, nichts scrollt vertikal (nur bei
sehr vielen Zutaten scrollt das einzelne Blatt). Oben stehen fest Name,
Verhältnis-Pille, kcal je Portion und Badges, unten fest die Aktionsleiste
**☆ Favorit · 🖨️ Drucken · ✏️ Editor** (bei eigenen Rezepten auch 🗑️). Am Desktop
sind die sechs Blätter Reiter nebeneinander.

1. **Mahlzeit** – Kennzahlen **einer Portion** (kcal mit Ziel, Menge, Volumen,
   Eiweiß) und die Zutatentabelle je Portion. Die **Gramm-Werte sind
   editierbar**: ändert man eine Zutat, skalieren alle anderen proportional mit
   („Portion angepasst: 80 %"); das Verhältnis bleibt, kcal je Mahlzeit ändern
   sich, Tagesplan und „Ein Tag" rechnen mit der angepassten Portion. Die
   Anpassung wird je Gericht gemerkt, „↺ wie berechnet" setzt sie zurück;
   Wasser bleibt ausgenommen (gemerkter Wert je Portion).
2. **Ein Tag** – **= N × diese Mahlzeit**: Tageskacheln (kcal mit Ziel und
   Minimum, Eiweiß, Fett/KH, Flüssigkeit), Zutatentabelle je Tag, der
   Wasser-Hinweis (Sondieren zwischen den Mahlzeiten bzw. Fehlmenge) und bei
   Compleat die Packungsinfo.
3. **Anpassen** – Link **„Auch als …"** zum Geschwister-Rezept in der anderen Fettbasis,
   **Fleisch-Umschalter 🍗 Huhn / 🥩 Rind / 🦃 Pute** und der **Öl-Schalter mit
   MCT-Anteil** samt Kennzahlen; Erklärungen hinter „ⓘ".
4. **Abwiegen** – Menge zubereiten (1 Portion / Ganzer Tag / Stepper), die
   Waage-Tabelle mit Gramm-Feldern und der kurze Wasser-Hinweis. Ändert man
   eine Zutatenmenge direkt (z. B. „827 g Zucchini"), skalieren alle anderen
   Zutaten proportional mit; **Wasser** ist davon ausgenommen. Menge und Wasser
   werden **je Rezept gemerkt**; „Ganzer Tag" folgt der Mahlzeitenzahl.
5. **Zubereitung** – die nummerierten Schritte (Varoma bevorzugt, Dämpfwasser
   eingerechnet), groß und lesbar.
6. **Abfüllen** – groß: **Menge je Portion ohne Öl** (das Öl kommt erst kurz
   vor dem Füttern dazu), die Spritzenzahl, die Öl-Zeilen je Portion und der
   Sieb-Hinweis.

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
gleichzeitig halten – nur zwei davon; welche, legt die Rechenregel unter
Vorgaben fest:

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

## Rezepte (36 Gerichte, 50 Varianten: 22 mit / 28 ohne KetoCal)

Ausgewogen über die Gruppen Geflügel, Rind & Schwein, Fisch, Ei, Erdäpfel &
Gemüse sowie Obst & Brei. Die Namen folgen dem Schema **„Hauptzutat &
Beilage"** (z. B. „Hendl & Karotte", „Ei & Spinat"); in `recipes.js` tragen
KetoCal-Varianten den Zusatz „(mit KetoCal)" und werden in der App mit der
Grundvariante zu einem Gericht zusammengefasst. Unter „Angerührt" stehen das
Fertigprodukt **„HiPP Hühnchen & Öl"** sowie die Pulver-Mischungen **„KetoCal &
Pre Apta"**, **„Compleat & KetoCal"** und **„Compleat & KetoCal & Pre Apta"**
(Nestlé Compleat **Paediatric** Nature Mix; für die Ausschleich-Phase das verordnete Verhältnis, z. B. 1:1,5, eingeben).

**Compleat-Packung (500 ml, offen 2 Tage haltbar):** Die Compleat-Rezepte zeigen
unter Rechnen, für wie viele Mahlzeiten eine Packung bei der aktuellen Rechnung
reicht und ob nach 2 Tagen etwas verfällt; der Tagesplan zeigt den
**Packungsstand** (heute verplant, Rest für morgen). Soll eine Packung auf mehr
Mahlzeiten reichen, hilft das Rezept **„Compleat & KetoCal & Pre Apta"**: Pre
Apta liefert Kohlenhydrate, damit braucht die Mahlzeit weniger Compleat für
dieselben Kalorien; das Verhältnis Compleat zu Pre Apta lässt sich unter Kochen
ändern. Achtung bei hohen Verhältnissen (z. B. 1,5:1): Viel Compleat je
Mahlzeit erzwingt viel KetoCal, weil KetoCal selbst Eiweiß und KH mitbringt.

Varianten
haben eine Varoma-Anleitung, die übrigen werden klassisch zubereitet.

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
