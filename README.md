# HamHam Keto – Planer für ketogene Sondennahrung

Eine kleine Web-App für die **ketogene Sondennahrung** eines Kindes. Sie
enthält 42 fertige Gerichte (58 Rezept-Varianten), die automatisch auf die
**Verordnung** (Keto-Verhältnis, Kalorien pro Mahlzeit, Eiweiß) umgerechnet
werden – wahlweise **mit oder ohne KetoCal**, mit Anleitung für die
**Varoma-Zubereitung (Dämpfen im Thermomix)**, mit Abfüllhilfe für
vorgekochte Portionen und mit einem **Tagesplan**.

Die App läuft komplett im Browser – ohne Server, ohne Konto, ohne
Internetverbindung – und ist für das **Smartphone** gemacht. Über GitHub
Pages ist sie als **PWA offline-fähig** (Service Worker `sw.js`): Nach dem
ersten Laden funktioniert sie auch ohne Netz und aktualisiert sich zuverlässig
(die Service-Worker-Version und die Vorladeliste aller Dateien schreibt der Build
automatisch; beim Installieren wird alles vorgeladen). Alle Eingaben
werden **lokal im Browser gespeichert** (localStorage): Vorgaben, Favoriten,
eigene Rezepte, angepasste Portionen und angepasstes Wasser je Rezept und
der Tagesplan.

Standardmäßig sind **5 Mahlzeiten, 1,8:1 und 8 kg Körpergewicht** eingestellt;
Kalorien (80 kcal/kg, bei 8 kg also 640 kcal/Tag), Minimum, Flüssigkeit und Eiweiß
folgen automatisch dem Gewicht, bis eigene Werte eingetragen werden.

## Starten

1. **Online / am Handy:** Die GitHub-Pages-Adresse öffnen und über „Zum
   Home-Bildschirm" installieren.
2. **Einzeldatei:** Nur die Datei **`keto-rechner.html`** herunterladen und per
   Doppelklick öffnen. Sie enthält alles.
3. **Mehrere Dateien:** **`index.html`** öffnen (`index.html`, `styles.css`,
   `app.js`, `foods.js` und `recipes.js` müssen im selben Ordner liegen).

Keine Installation, kein Server nötig.

Die App folgt dem **Hell-/Dunkelmodus des Geräts** (Systemeinstellung); unter
Vorgaben → 🎨 Darstellung lässt sich Hell oder Dunkel auch fest wählen. Der
Dunkelmodus färbt alle Ansichten, Karten, Tabellen, Hinweise und Overlays um.

## Aufbau der App

Die App hat drei Bereiche, erreichbar über die Leiste am unteren Rand
(am Desktop oben):

| Bereich | Wofür |
| --- | --- |
| **Heute** | Zeitleiste mit Uhrzeiten, einem Rezept je Mahlzeit, Wassergaben und Tagessummen |
| **Rezepte** | Rezeptliste mit Suche, Schnellfiltern, Favoriten und eigenem Rezept |
| **Vorgaben** | Verordnung, Flüssigkeit, Öl (MCT), Küche, Darstellung, Daten (Backup) |

Oben rechts zeigt der **Verordnungs-Chip** jederzeit, womit gerade gerechnet
wird: Zeile 1 die Verordnung (z. B. „1,8:1 · 128 kcal × 5 · MCT
10 % ⚖️"), Zeile 2 die Flüssigkeit (Ziel je Tag, Modus, und laut Tagesplan die
Menge, die zwischen den Mahlzeiten zu sondieren ist). Ein Tipp darauf öffnet die
Vorgaben.

### Vorgaben

- **Verordnung:** Beim Verhältnis wird nur die **vordere Zahl** eingegeben,
  „:1" steht fix daneben („1,8", „1,5", „1"); die App zeigt Verhältnisse
  überall als „x:1", auch unter 1 (z. B. „0,67:1") und warnt dann unter dem
  Feld,
  **Kalorien pro Tag (Ziel)** (leer = Vorschlag nach Gewicht, 80 kcal/kg; ist unter „Bedarf schätzen“ ein
  Geburtsdatum eingetragen, die **Krick-Schätzung**) und
  **Kalorien mindestens pro Tag** (leer = Vorschlag 70 kcal/kg; die Zusammenfassung zeigt dazu den Korridor
  70–90 kcal/kg nach FAO/WHO/UNU 2004 für 6–24 Monate. Mit Geburtsdatum und einem Kind, das nicht geht:
  Minimum = ESPGHAN-Faustregel 60 % und **Bereich laut Schätzungen** ESPGHAN–FAO/WHO – bitte mit der
  Diätologin abgleichen), **Mahlzeiten pro Tag** (Auswahl **3 · 4 · 5**), Körpergewicht
  und Eiweiß (fix pro Tag oder g/kg; Standard der App 1,5 g/kg/Tag, sichtbar
  markiert). Daraus ergeben sich kcal und Eiweiß-Ziel je Mahlzeit. Ein
  Vorschlag steht als echter Wert im Feld; die Zeile darunter sagt, woher er
  kommt: grün **„✓ Vorschlag · 80 kcal/kg"** bzw. **„✓ Vorschlag · Krick"** oder **„eigener
  Wert · ↺ Vorschlag 680"** zum Zurücksetzen. Tippt man genau den Vorschlag
  ein oder leert das Feld, gilt wieder der Vorschlag. Nichts verschiebt sich
  dabei.
- **Flüssigkeit:** ein Schalter mit zwei Stellungen – **„💉 zwischen den
  Mahlzeiten sondieren"** (Standard) oder **„🥣 in den Mahlzeiten dabei"** –
  dazu **Gesamt pro Tag** (leer = Vorschlag nach Holliday-Segar,
  100 ml/kg bis 10 kg) und, nur beim Sondieren, **Höchstens kcal je ml**
  (Vorgabe 1,5). Beim Sondieren behält jede Mahlzeit nur ihr Rezept-Wasser zum
  Anrühren – so bleibt sie klein; ist sie damit dichter als erlaubt (z. B.
  Compleat & KetoCal), füllt die App gerade so weit auf. Der Rest des
  Tagesbedarfs kommt als **Wassergaben**, deren Menge die App selbst rechnet
  (Uhrzeiten unter Heute → ⏰ Uhrzeiten). Für den Stuhl zählt die Tagesmenge,
  nicht ob das Wasser in oder zwischen den Mahlzeiten kommt. „In den Mahlzeiten
  dabei" gibt jeder Mahlzeit ihren vollen Anteil. Gemerktes Wasser hat immer
  Vorrang; liegt eine Mahlzeit oder Wassergabe über 25 ml/kg, warnt die App. Gezählt wird das
  Wasser der Zutaten (Näherung: Rest ohne Eiweiß, Fett, KH, Ballaststoffe;
  Pulver und Fertigprodukte mit Etikettwert) plus das Rezept-Wasser.
- **Rundung beim Abwiegen (fest):** Gemüse, Fleisch, Obst, Brei und Pulver
  werden auf 0,5 g gerundet, Wasser auf 1 ml.
  Fettträger (Öl, Butter, Obers, KetoCal) folgen dieser Rundung **nicht**: sie
  werden nach dem Runden der anderen Zutaten so nachgestellt, dass das
  Verhältnis exakt stimmt, und immer auf 0,1 g genau angezeigt (z. B. 21,0 g). Gerundet wird die
  Menge, die auf der Waage liegt; Vielfache („1 Tag", „2 Tage") bleiben im Raster.
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
  Diätologin. Die drei Fisch-Filets **Lachs, Seelachs (Alaska-Seelachs) und
  Kabeljau** stehen mit Tabellenwerten für rohe Handelsfilets in der Liste
  (Zuchtlachs 20 g Eiweiß / 13 g Fett, Seelachs 17,4 / 0,8, Kabeljau 17,7 / 0,7
  je 100 g) – bitte gegen die Packung bzw. mit der Diätologin abgleichen.

### Rezepte

- **Ein Eintrag je Gericht.** Hat ein Gericht eine Variante mit und ohne
  KetoCal (z. B. „Hendl & Zucchini" mit Rapsöl oder mit KetoCal + Butter) –
  **jedes Rezept ist ein eigener Eintrag** mit gleichem Namen und einem
  Fettbasis-Schild („Rapsöl" bzw. „🥄 KetoCal + Butter"); der Eintrag ohne
  KetoCal steht zuerst. Rezepte, die nur mit KetoCal existieren, tragen
  „🥄 KetoCal". Im ⋯-Menü lassen sich **Rezepte mit KetoCal ausblenden**.
- **Gruppen nach Hauptzutat:** 🍗 Geflügel, 🥩 Rind & Schwein, 🐟 Fisch,
  🥚 Ei, 🥔 Erdäpfel & Gemüse, 🍓 Obst & Brei und 🥤 Angerührt (ohne Kochen:
  HiPP-Gläschen, KetoCal & Pre Apta, Compleat & KetoCal, Compleat & KetoCal & Pre Apta). Die Gruppen stehen
  in **einer wischbaren Chip-Zeile**, direkt darunter beginnen die Rezepte. Auch
  **in der Liste selbst** wechselt seitliches Wischen (drücken und ziehen, Finger
  oder Maus) zur nächsten bzw. vorigen Gruppe – ein echtes Blättern: die
  Nachbargruppe rutscht schon beim Ziehen neben der aktuellen Liste herein, die
  Markierung in der Chip-Zeile wandert mit, beim Loslassen läuft die Bewegung
  bis zur Ruhelage durch; senkrecht bleibt Scrollen. Rechts
  daneben: **🔍 Suche** (klappt ein Suchfeld auf), **➕ Eigenes Rezept** und **⋯**
  mit dem Haken **👩‍⚕️ nur Rezepte der Diätologie** (Original-Rezepte aus den
  Vorlagen) und der Sortierung nach Gruppe, Name, Eiweiß oder Menge.
  Findet die Suche in der gewählten Gruppe nichts, führt **„In allen Gruppen
  suchen“** weiter. Eine KetoCal-Vorgabe gibt es nicht mehr.
- Die **Kacheln** zeigen Icon, Name, aktive Fettbasis, kcal und Eiweiß; ein
  Stern markiert Favoriten (immer ganz oben). Eiweiß unter 90 % des Ziels ist
  gelb, über dem **Doppelten des Ziels** gelb mit „↑“ – im Rezept steht dann
  „Eiweiß x-mal so hoch wie das Ziel – mit dem Team abklären“ (viel Eiweiß kann
  die Ketose schwächen; bei 1,5:1 liefern viele Fleisch-Rezepte 2–3 × das Ziel).
- **Nach dem Real-Food-Blends-Ketokochbuch** (2020) nachgebaut, ohne
  Diätologie-Schild: **Hendl & Fisolen & Ei**, **Lachs & Hafer & Kürbis** und
  **Ei & Apfel & Hafer** – Fisolen als ballaststoffreiches Gemüse, Ei als zweite
  Eiweißquelle, etwas Hafer; das Fett stellt die App fürs Verhältnis ein.
- **➕ Eigenes Rezept:** beliebige Zutaten (z. B. saisonales Obst) plus ein oder
  mehrere Fette zum Ausgleich; die App berechnet die Fettmenge fürs
  Verhältnis, wahlweise für eine fixe Zutatenmenge oder hochgerechnet auf eine
  Mahlzeit. Der Editor sieht aus wie die Detailansicht: oben Name (als
  Eingabefeld), Verhältnis-Pille und kcal, darunter zwei Blätter **✏️ Zutaten**
  (Zutatenzeilen, Fett(e) zum Ausgleich, Skalieren-Haken) und **🍽️ Mahlzeit**
  (Statuszeile, Kacheln und Tabelle genau wie bei einem Rezept), unten die feste
  Leiste **💾 Speichern · 🖨️ Drucken · 🗑️**. Eigene Rezepte können gespeichert,
  bearbeitet und gelöscht werden.

### Detailansicht eines Rezepts

Die Detailansicht besteht aus **vier Blättern** und öffnet mit **Mahlzeit**. Am
Handy liegen die Blätter nebeneinander: seitlich wischen oder auf die Punkte
tippen; jedes Blatt passt auf einen Bildschirm, nichts scrollt vertikal (nur bei
sehr vielen Zutaten oder langen Anleitungen scrollt das einzelne Blatt). **Nach unten
wischen schließt** die Ansicht – überall auf der Karte und auf jedem Blatt (auch über die
Gramm-Felder); ist ein Blatt nach unten gescrollt, scrollt der Wisch zuerst zurück nach oben,
seitliches Wischen blättert. Gleiches gilt für den Editor. Oben
stehen fest Name, Verhältnis-Pille, kcal je Portion und Badges, unten fest die
Aktionsleiste **☆ Favorit · 🖨️ Drucken · 📅 Für heute · ✏️ Editor** (bei eigenen
Rezepten auch 🗑️; am Handy zeigen Favorit und Drucken nur ihr Symbol).
**🖨️ Drucken** (Rezept, Tagesplan, eigenes Rezept) öffnet eine **Druckvorschau in
der App** – die ganze A4-Seite, am Handy auf die Breite verkleinert – mit
**‹ Zurück**, **📤 Teilen** und **🖨️ Drucken**. Kein neues Fenster, damit es auch
in der am iPhone installierten App funktioniert. Die Vorschau lässt sich
**zoomen**: zwei Finger auseinanderziehen (bis 4-fach), Doppeltippen wechselt
zwischen 2,5-fach und Seitenbreite, mit einem Finger verschieben, am Desktop
Strg/⌘ + Mausrad. Der Rest der App bleibt wie bisher nicht zoombar. **📤 Teilen** erzeugt aus
derselben Vorlage ein **PDF** (z. B. „Tagesplan 2026-10-03.pdf“, „Hendl &
Brokkoli.pdf“) und öffnet das Teilen-Menü (WhatsApp, Signal, Mail, Dateien); am
Desktop wird es heruntergeladen. Das PDF entsteht offline in der App (jsPDF);
Emojis und Zeichen wie „≈“ ersetzt es durch Text („ca.“).
In der **vom Home-Bildschirm gestarteten iPhone/iPad-App** ignoriert iOS den Druckbefehl
der Seite; dort öffnet **🖨️ Drucken** deshalb dasselbe PDF im Teilen-Menü, in dem man
**„Drucken“** wählt (AirPrint). In Safari und am Computer kommt der normale Druckdialog.

**Ausdrucke:** einheitlicher Kopf (Titel, Datum, grüne Linie), Fußzeile mit
Erstelldatum. Der **Tagesplan** ist ein **Küchenzettel**: eine A6-Karte (10,5 × 14,8 cm) mit
gestrichelter Schnittlinie oben links auf A4 (passt in jeden Drucker, dann ausschneiden). Groß stehen
**Uhrzeit, Rezeptname (statt „Mahlzeit 1“) bzw. Wasser und die Menge in ml**, darunter die Sondierdauer, klein die
**Zutaten je Portion** (Öl am Ende); Wassergaben blau, zuletzt „Schlafen“. Die Schrift ist so groß wie
möglich: Vorschau und PDF beginnen bei 120 % und verkleinern, bis alles auf die Karte passt (mindestens 60 %).
Das **Rezept** zeigt Fettbasis, Verhältnis, kcal,
Eiweiß gegen das Ziel, Flüssigkeit und Volumen, die **Zutaten je Portion und für
die gewählte Menge** mit Eiweiß, Fett, KH und kcal, einen Abfüll-Kasten (abfüllen, dann das Öl
in die Portion einrühren), ggf. den Eiweiß-Hinweis und die **nummerierten
Zubereitungsschritte** mit dem Öl als letztem Schritt. **📅 Für
heute** übernimmt das Rezept in den Tagesplan: für **alle Mahlzeiten**, **nur die
freien** oder **eine einzelne** (mit Uhrzeit und dem bisherigen Rezept). Danach
erscheint eine Meldung mit **Rückgängig** und **Ansehen** (wechselt zu Heute).
Übernommen wird genau die offene Variante (mit oder ohne KetoCal); angepasste
Portion und Wasser gelten auch im Tagesplan. Am Desktop sind die vier Blätter
Reiter nebeneinander.

1. **Mahlzeit** – Kennzahlen **einer Portion** (kcal mit Ziel, Eiweiß, Menge,
   Volumen), die Zutatentabelle je Portion und die Flüssigkeitszeile (Zutaten +
   Wasser gegen das Ziel je Mahlzeit). Die **Gramm-Werte sind editierbar**:
   ändert man eine Zutat, skalieren alle anderen proportional mit; das
   Verhältnis bleibt, kcal je Mahlzeit ändern sich, Tagesplan und Tag
   rechnen mit der angepassten Portion. **Wasser** ist davon ausgenommen und
   wird für sich gemerkt. Beide Anpassungen stehen gleich in der
   **Statuszeile** über den Kacheln („Portion angepasst: 80 % … ↺ wie
   berechnet" bzw. „Wasser angepasst (85 statt 100 ml) · ↺ wie berechnet");
   in der Wasserzeile steht nur „⟵ eigener Wert".
2. **Tag** – **gleiches Layout wie Mahlzeit, nur mit den Mengen für einen
   ganzen Tag** (= N × diese Mahlzeit), direkt daneben, damit man zwischen
   Portion und Tag hin- und herwischen kann. Unter der Überschrift lässt sich
   die Menge umstellen: **1 Tag · 2 Tage · 3 Tage** oder eine freie
   Portionenzahl (Stepper; eine Portion zeigt ohnehin das Blatt Mahlzeit) – so lässt sich gleich für mehrere Tage vorkochen,
   ohne die Vorgaben anzurühren. Beim Öffnen steht die Menge **immer auf
   1 Tag** (sie wird nicht gemerkt). Kacheln (kcal, Eiweiß, Menge, Flüssigkeit
   mit skalierten Zielen) und die Waage-Tabelle mit editierbaren Gramm-Feldern
   gelten für diese Menge; Gramm-Änderungen wirken genau wie auf „Mahlzeit"
   (Portion angepasst, alle anderen Zutaten skalieren mit; Wasser für sich,
   je Rezept gemerkt) und stehen mit „↺ wie berechnet" in derselben
   Statuszeile. „Tag(e)" folgen der Mahlzeitenzahl. Darunter der
   Wasser-Hinweis (Sondieren zwischen den Mahlzeiten bzw. Fehlmenge), bei
   Compleat die Packungsinfo und eine Warnung, falls ein Tag nur mit diesem
   Rezept unter dem Kalorien-Minimum oder über dem Korridor läge.
3. **Anpassen** – Link **„Auch als …"** zum Geschwister-Rezept in der anderen Fettbasis,
   **Fleisch-Umschalter 🍗 Huhn / 🥩 Rind / 🦃 Pute** (gilt nur in der offenen
   Ansicht) und der **Öl-Schalter mit MCT-Anteil** samt Kennzahlen – das ist
   dieselbe Vorgabe wie unter Vorgaben → Öl und gilt für **alle** Rezepte.
   Wie auf Mahlzeit und Tag steht eine Statuszeile darüber: „Fleisch
   getauscht: 🥩 Rind · ↺ wie im Rezept" bzw. „MCT-Anteil 30 % statt 10 % –
   gilt für alle Rezepte · ↺ 10 %" (Bezug ist der Wert beim Öffnen).
   Erklärungen hinter „ⓘ".
4. **Kochen** – oben der Abfüll-Block je Portion (**Menge ohne Öl**, weil das
   Öl erst in die abgefüllte Portion kommt, ml und Spritzenzahl, Öl-Kacheln),
   bei mehreren Portionen die Gesamtmenge, eine kurze Notiz (Sieb, MCT,
   Garzeiten) und darunter die nummerierten Zubereitungsschritte (Varoma
   bevorzugt, Dämpfwasser eingerechnet). **Öl kommt nie in den Topf:** püriert
   wird ohne Öl, der letzte Schritt nennt das Öl je Portion („Abfüllen und in jede
   Portion Rapsöl 14,2 g + MCT-Öl 1,6 g gründlich einrühren“). Der
   Ausdruck enthält dieselbe Abfüllzeile und denselben Schritt.

### Heute (Zeitplan)

Eine einzige **Zeitleiste** für den ganzen Tag, am Handy auf einem Bildschirm
ohne Scrollen (3, 4 und 5 Mahlzeiten, auch im Browser mit Adress- und Werkzeugleiste). Jede
Mahlzeit zeigt unter dem Namen über die ganze Breite ihre **Zutaten einer Portion mit Gramm**
(kurze Namen, roh/gekocht bleibt, Gramm ohne „,0“), das **Öl** als normale Zutat am Ende
(„… · Rapsöl 14,2 g · MCT-Öl 1,6 g“). Die Zeitleiste **füllt den Bildschirm bis zur Tab-Leiste**:
Die App wählt die großzügigste Stufe, die ohne Scrollen passt – mit viel Platz größere
Schrift, zweizeilige Rezeptnamen und kcal/Eiweiß je Mahlzeit, der Rest wird Zeilenhöhe
(Mahlzeiten mehr als Wasser); wird es eng (5 Mahlzeiten im Browser), rückt alles enger
zusammen (kleinere Schrift, schmale Wasserzeilen, die Kopf-Pille ohne die Wasserzeile).
Nur auf sehr kleinen Bildschirmen wird gescrollt. Der Kopf „📅 Heute · 7:00–17:30 · alle 3 h 30
min" hat drei Knöpfe: **⏰** klappt die Uhrzeiten auf (**erste Mahlzeit**,
**letzte Mahlzeit**, **Schlafen**; Vorgabe 7:00, 17:30, 20:00), **🖨️** druckt,
**🗑️** leert den Plan (ohne Rückfrage, mit **Rückgängig**). Darunter eine
niedrige Kachelreihe: kcal, Eiweiß, Verhältnis und Flüssigkeit am ganzen Tag
(Mahlzeiten plus Wassergaben, „≈" solange Mahlzeiten offen sind).

In der Zeitleiste steht jede **Mahlzeit** mit Uhrzeit, Rezept, Menge und **Sondierdauer**
(etwa 5 ml pro Minute, auf 5 Minuten gerundet, z. B. „≈ 125 ml · 25 min“; Wasser ohne
Zeitangabe), darunter die Zutatenzeile; unter dem Namen steht ein Hinweis nur, wenn das
Eiweiß zu niedrig ist. Liegt eine Mahlzeit über 25 ml/kg auf einmal (z. B. bei 3
Mahlzeiten), steht die Menge gelb mit ⚠️. ↻ tauscht das Rezept, ✕ leert die Zeile (mit **Rückgängig**), ein Tipp
öffnet das Rezept; offene Mahlzeiten („＋ Rezept wählen") zeigen eine geschätzte
Menge. Erreicht ein geplantes Rezept die Verordnung nicht mehr (z. B. nach einer Änderung
des Verhältnisses), ist es durchgestrichen markiert („passt nicht zu 1,5:1 – anderes Rezept
wählen“) und zählt nicht in die Tagessummen. Die Rezeptauswahl zeigt je Rezept kcal, **Volumen der Mahlzeit** (⚠️
über 25 ml/kg) und Eiweiß. Die Mahlzeiten liegen gleichmäßig zwischen erster
und letzter; dazwischen stehen einzeilig die **Wassergaben** (Mitte jeder Pause
und eine vor dem Schlafen; „🌙 Schlafen 20:00“ steht rechts in deren Zeile). Die Menge je Wassergabe ergibt sich aus dem
Tagesziel minus der Flüssigkeit der Mahlzeiten, gleich verteilt und auf 5 ml
gerundet. Kurze Hinweise erscheinen bei weniger als 3 Stunden Abstand, bei
weniger als 2 Stunden zwischen letzter Mahlzeit und Schlafen und wenn eine
Wassergabe über 25 ml/kg liegt. Bei Compleat steht der Packungsstand einzeilig
darunter (Einzelheiten im Rezept). Der Haftungshinweis steht am Handy nur unter
Rezepte und Vorgaben. Der Ausdruck enthält den Zeitplan als Tabelle mit Spalte „Dauer“ und dem Hinweis,
den Oberkörper während der Gabe und 30 Minuten danach hoch zu halten.

## Fachliche Details

**Rezeptnamen und viele Zutaten** verwenden österreichische Bezeichnungen (Erdäpfel,
Karfiol, Hendl, Marille, Schlagobers …); einzelne Zutaten heißen wie in der
Nährwerttabelle (z. B. „Kartoffel gekocht“). Beim Geflügel wird
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

Eine Kennzahlenzeile zeigt den **MCT-Anteil der Energie in %** (Einordnung nach der
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

## Rezepte (42 Gerichte, 58 Varianten: 22 mit / 36 ohne KetoCal)

Ausgewogen über die Gruppen Geflügel, Rind & Schwein, Fisch, Ei, Erdäpfel &
Gemüse sowie Obst & Brei. Die Namen folgen dem Schema **„Hauptzutat &
Beilage"** (z. B. „Hendl & Karotte", „Ei & Spinat"); in `recipes.js` tragen
KetoCal-Varianten den Zusatz „(mit KetoCal)" und werden in der App mit der
Grundvariante zu einem Gericht zusammengefasst. Unter „Angerührt" stehen die
Gläschen-Rezepte **„HiPP Hühnchen & Öl"**, **„HiPP Rind & Öl"**, **„HiPP Hühnchen &
Gemüse & Öl"** und **„HiPP Rind & Gemüse & Öl"** (HiPP Bio-Fleischzubereitung
125 g bzw. Gemüse-Allerlei 190 g – in Österreich bei Spar, Billa und dm erhältlich;
Menü-Gläser mit Reis/Erdäpfeln sind wegen der Kohlenhydrate bewusst nicht dabei)
sowie die Pulver-Mischungen **„KetoCal & Pre Apta"**, **„Compleat & KetoCal"** und
**„Compleat & KetoCal & Pre Apta"** (Nestlé Compleat **Paediatric** Nature Mix; für die
Ausschleich-Phase das verordnete Verhältnis eingeben, z. B. 1:1 oder 0,67:1).

**Compleat-Packung (500 ml, offen 3 Tage haltbar):** Die Compleat-Rezepte zeigen
auf dem Blatt Tag, für wie viele Mahlzeiten eine Packung bei der aktuellen Rechnung
reicht und ob nach 3 Tagen etwas verfällt; der Tagesplan zeigt den
**Packungsstand** (heute verplant, Rest für morgen). Soll eine Packung auf mehr
Mahlzeiten reichen, hilft das Rezept **„Compleat & KetoCal & Pre Apta"**: Pre
Apta liefert Kohlenhydrate, damit braucht die Mahlzeit weniger Compleat für
dieselben Kalorien; das Verhältnis Compleat zu Pre Apta lässt sich im ✏️ Editor
ändern. Achtung bei hohen Verhältnissen (z. B. 1,5:1): Viel Compleat je
Mahlzeit erzwingt viel KetoCal, weil KetoCal selbst Eiweiß und KH mitbringt.

38 Varianten
haben eine Varoma-Anleitung, die übrigen werden klassisch zubereitet.

## Berechnungsgrundlage

- Kalorien je Gramm: Eiweiß 4 kcal, Fett 9 kcal, Kohlenhydrate 4 kcal (bei
  Lebensmitteln mit Etikett-kcal wird dieser Wert verwendet).
- Keto-Verhältnis = Fett ÷ (Eiweiß + Kohlenhydrate).
- Kalorien pro Mahlzeit = Kalorien pro Tag ÷ Anzahl Mahlzeiten.
- Zur Anpassung wird die Fett-Zutat so berechnet, dass Verhältnis und
  Ziel-Kalorien gleichzeitig getroffen werden; die übrigen Zutaten werden
  proportional skaliert. Alle Nährwerte stammen aus `foods.js`.

## Bedarf schätzen

Unter **Vorgaben → 📊 Bedarf schätzen** vergleicht die App die Kalorien mit Studienwerten für Kinder mit
neurologischen Einschränkungen – **zur Orientierung fürs Gespräch mit dem Team, die Verordnung bleibt
unverändert**. Eingaben: **Geburtsdatum** (das Alter rechnet die App laufend selbst), Geschlecht,
**Bewegung** (geht · krabbelt · getragen/Rollstuhl · liegt viel) und **Muskelspannung** (schlaff · normal ·
erhöht); das Gewicht kommt aus der Verordnung. Die Eingaben stehen auf zwei Zeilen (am Desktop auf
einer). Eine Skala ordnet drei Werte ein; die Legende darunter sagt bei jedem, woher er kommt:

- **Krick-Formel (1992)** (persönliche Schätzung): Grundumsatz nach Schofield aus Gewicht, Alter und Geschlecht ×
  Muskelspannung (0,9/1,0/1,1) × Bewegung (1,15/1,2/1,25/1,3) + 5 kcal je g gewünschter Zunahme
  (halten/normal/aufholen, unter „ⓘ“),
- **ESPGHAN-Leitlinie (2017)**: Faustregel für Kinder, die nicht gehen, 60–70 % des Bedarfs gesunder Kinder
  (Romano et al., JPGN 2017) – rechnet nur mit dem Alter; bei „geht“ ausgeblendet,
- **FAO/WHO (2004)**: Bedarf gesunder Kinder gleichen Alters (FAO/WHO/UNU, kcal/kg nach Alter).

Auf der Skala und in der Legende heißt jeder Wert nach seiner Quelle (Krick, ESPGHAN, FAO/WHO).

Darunter der Hinweis, dass das **keine feste Empfehlung** ist – das Team legt den Bedarf nach dem Wachstum fest.

Die Krick-Schätzung ist zugleich der **Kalorien-Vorschlag** in der Verordnung (gilt nur, solange dort kein
eigener Wert steht); bei Kindern, die nicht gehen, wird das Minimum die ESPGHAN-Untergrenze (60 %).
Dazu die Eiweiß-Prüfung (g/kg gegenüber dem Referenzwert), ein Hinweis zu Vitaminen/Mineralstoffen, wenn
die verordneten kcal unter 70 % des Referenzwerts liegen, und ein Hinweis auf den Formelwechsel am 3.
Geburtstag. Formeln irren im Einzelfall um 20–40 %; entscheidend ist das Wachstum. Quellen unter „ⓘ“
(u. a. Walker 2012, Borsani 2023, Arrowsmith 2012, Kossoff 2018); die Krick-Faktoren und die FAO-Tabelle
stammen aus Sekundärquellen.

## Erinnerungen (Push)

Unter **Vorgaben → 🔔 Erinnerungen** lassen sich Push-Nachrichten zu jeder **Mahlzeit** und
**Wassergabe** einschalten (pünktlich oder 5/10/15 min vorher), z. B. „🍽️ Mahlzeit 2 · 10:30 –
Hendl & Brokkoli · ≈ 217 ml · 45 min“ oder „💧 Wasser · 12:15 – 115 ml Wasser“. Die Uhrzeiten
kommen aus dem Zeitplan; ändern sich Uhrzeiten, Rezepte oder Wassergaben, gleicht die App den
Dienst automatisch ab (und einmal am Tag beim Öffnen). Verschickt werden die Nachrichten von einem
kleinen eigenen **Cloudflare Worker** (`push-worker/`, Web Push mit VAPID und aes128gcm,
ohne Abhängigkeiten); Einrichtung Schritt für Schritt in `push-worker/ANLEITUNG.md`. Funktioniert
nur in der App vom Home-Bildschirm (iOS ab 16.4) bzw. in Browsern mit Push, auf jedem Gerät einzeln;
ohne Internet keine Nachricht. **Testnachricht** prüft die Einrichtung.

## Entwicklung

```
npm install        # einmalig: jsdom für die Tests
npm run build      # src/*.js -> app.js, Versionen, keto-rechner.html
npm test           # Build + Regressionstests (node --test)
```

Der Quellcode liegt modular in **`src/`**, nummeriert in Ladereihenfolge; der Build
fügt alle Dateien in eine gemeinsame Funktion (`app.js`) zusammen, sie teilen sich
also einen Gültigkeitsbereich. **`app.js` ist generiert** – Änderungen bitte in `src/`
machen und `npm run build` ausführen.

| Datei | Inhalt |
|---|---|
| `00-state.js` | Speicher (localStorage), Standardwerte, Migration alter Daten |
| `10-helpers.js` | Zahlen/Formatierung, kleine DOM-Helfer, Hinweis-Leiste („Toast“) |
| `20-foods.js` | Lebensmittel-Index, Nährwerte, Flüssigkeit und Volumen |
| `21-filter.js` | Gruppen der Rezeptliste |
| `22-derived.js` | abgeleitete Vorgaben (kcal, Eiweiß, Flüssigkeit, Mahlzeiten 3–5) |
| `23-adjust.js` | Rezept auf Verhältnis und kcal umrechnen, Rundung fürs Abwiegen |
| `24-meat.js` | Fleisch tauschen |
| `25-oil.js` | Öl-Erkennung und MCT-Mischung |
| `26-favorites.js` | Rezeptfamilien (Fettbasis-Varianten), Favoriten, eigene Rezepte |
| `30-ui-list.js` | Rezeptliste, Wischen zwischen Gruppen, Vorgaben-Felder |
| `31-ui-header-vorgaben.js` | Ansichten, Kopf-Pille, Vorgaben, Backup |
| `32-ui-tile.js` | Rezept-Kachel |
| `34-ui-bedarf.js` | Bedarf schätzen (Schofield, Krick, 60–70 %, Referenz) |
| `40-ui-detail.js` | Detailansicht (4 Blätter), Mahlzeit-Kennzahlen, Wisch-Gesten |
| `50-ui-heute.js` | Heute: Zeitleiste, Einpassen auf den Bildschirm, Rezeptauswahl, Tagesplan-Ausdruck |
| `52-zeitplan.js` | Uhrzeiten, Wassergaben, Hinweise zum Zeitplan |
| `55-push.js` | Erinnerungen: Anmeldung beim Dienst, Abgleich des Plans, Karte in den Vorgaben |
| `60-print.js` | Druckvorschau (mit Zoom), Druckvorlage, Rezept-Ausdruck |
| `62-pdf.js` | PDF zum Teilen aus der Druckvorlage |
| `70-ui-compose.js` | Editor für eigene Rezepte |
| `90-init.js` | Start |

`styles.css` ist nach Bereichen gegliedert; spätere Abschnitte verfeinern frühere
(Handy-Anpassungen in `@media (max-width: 820px/560px)`, Dunkelmodus doppelt für
„Gerät folgt“ und „dunkel erzwungen“). Die Tests in `test/`
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
- `push-worker/` – Erinnerungsdienst für Cloudflare (`worker.js`, `wrangler.toml`,
  Einrichtung in `ANLEITUNG.md`); nicht Teil der App-Dateien
- `vendor/` – jsPDF 4.2 und jsPDF-AutoTable 5.0 (MIT-Lizenz, siehe
  `vendor/LICENSE-*.txt`) fürs PDF zum Teilen; werden in die Einzeldatei
  eingebettet

## Hinweis

Dieses Werkzeug dient der Planung und ist **keine Behandlungsempfehlung**; es
ersetzt keine ärztliche oder diätologische Beratung. Die ketogene Ernährung
über Sonde sollte – besonders bei Kindern – nur in Absprache mit dem
Behandlungsteam durchgeführt werden. Die berechneten Mengen vor der
Zubereitung bitte fachlich prüfen lassen.
