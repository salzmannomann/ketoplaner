// Sondennahrungs-Rezepte für die ketogene Ernährung.
// Mengen in Gramm (Basis/Arbeitsblatt). Die Software rechnet jedes Rezept
// automatisch auf das eingestellte Verhältnis und die Kalorien pro Mahlzeit um.
// Felder:
//   name, kategorie, ketocal (true/false – nur zur Info),
//   zubereitung   = klassische Zubereitung
//   thermomix     = Zubereitung mit Thermomix TM5
//   items         = Zutaten [{food, grams}]
const RECIPES_SONDE = [
  {
    name: "Obstbrei – Banane",
    ketocal: true,
    zubereitung: "Das kalte Wasser in einen Topf geben und das Johannisbrotkernmehl mit dem Schneebesen einrühren. Unter gelegentlichem Rühren erhitzen, bis der Brei andickt. Auf 45–50 °C abkühlen lassen, dann KetoCal 3:1 glatt unterrühren und Butter sowie Banane zugeben.",
    thermomix: "Wasser und Johannisbrotkernmehl in den Mixtopf geben, 8 Sek./Stufe 4 verrühren. 6 Min./90 °C/Stufe 2 andicken. Ca. 5 Min. auf 45–50 °C abkühlen lassen, dann KetoCal 3:1, Butter und Banane zugeben und 20 Sek./Stufe 6 glatt pürieren.",
    items: [
      { food: "Butter", grams: 4 },
      { food: "Wasser", grams: 100 },
      { food: "Johannisbrotkernmehl", grams: 2 },
      { food: "KetoCal 3:1", grams: 15 },
      { food: "Banane roh", grams: 20 },
    ],
  },
  {
    name: "Obstbrei – Apfelmus",
    ketocal: true,
    zubereitung: "Das kalte Wasser in einen Topf geben und das Johannisbrotkernmehl mit dem Schneebesen einrühren. Unter gelegentlichem Rühren erhitzen, bis der Brei andickt. Auf 45–50 °C abkühlen lassen, dann KetoCal 3:1 glatt unterrühren und Butter sowie Apfelmus zugeben.",
    thermomix: "Wasser und Johannisbrotkernmehl in den Mixtopf geben, 8 Sek./Stufe 4 verrühren. 6 Min./90 °C/Stufe 2 andicken. Ca. 5 Min. auf 45–50 °C abkühlen lassen, dann KetoCal 3:1, Butter und Apfelmus zugeben und 20 Sek./Stufe 6 glatt pürieren.",
    items: [
      { food: "Butter", grams: 3 },
      { food: "Wasser", grams: 100 },
      { food: "Johannisbrotkernmehl", grams: 2 },
      { food: "KetoCal 3:1", grams: 15 },
      { food: "Apfelmus ohne Zuckerzusatz", grams: 20 },
    ],
  },
  {
    name: "Obstbrei – Banane & Apfelmus",
    ketocal: true,
    zubereitung: "Das kalte Wasser in einen Topf geben und das Johannisbrotkernmehl mit dem Schneebesen einrühren. Unter gelegentlichem Rühren erhitzen, bis der Brei andickt. Auf 45–50 °C abkühlen lassen, dann KetoCal 3:1 glatt unterrühren und Butter sowie das Obst zugeben.",
    thermomix: "Wasser und Johannisbrotkernmehl in den Mixtopf geben, 8 Sek./Stufe 4 verrühren. 6 Min./90 °C/Stufe 2 andicken. Ca. 5 Min. abkühlen lassen, dann KetoCal 3:1, Butter, Banane und Apfelmus zugeben und 20 Sek./Stufe 6 glatt pürieren.",
    items: [
      { food: "Butter", grams: 10 },
      { food: "Wasser", grams: 100 },
      { food: "Johannisbrotkernmehl", grams: 2 },
      { food: "KetoCal 3:1", grams: 15 },
      { food: "Banane roh", grams: 20 },
      { food: "Apfelmus ohne Zuckerzusatz", grams: 15 },
    ],
  },
  {
    name: "Gemüse-Fleischbrei – Zucchini",
    ketocal: false,
    zubereitung: "Das Gemüse abwiegen, in wenig Wasser weich dünsten und mit dem gegarten Fleisch pürieren. Anschließend das Rapsöl untermischen.",
    thermomix: "Zucchini in groben Stücken in den Mixtopf geben, 5 Sek./Stufe 5 zerkleinern. Wasser und gegartes Hühnerfleisch zugeben, 10 Min./100 °C/Stufe 1 garen. Rapsöl zugeben und 40 Sek./Stufe 8 fein pürieren.",
    items: [
      { food: "Hühnerbrust ohne Haut", grams: 20 },
      { food: "Rapsöl", grams: 13 },
      { food: "Wasser", grams: 60 },
      { food: "Zucchini roh", grams: 80 },
    ],
  },
  {
    name: "Gemüse-Fleischbrei – Karotte",
    ketocal: false,
    zubereitung: "Das Gemüse abwiegen, in wenig Wasser weich dünsten und mit dem gegarten Fleisch pürieren. Anschließend das Rapsöl untermischen.",
    thermomix: "Karotte in Stücken 5 Sek./Stufe 5 zerkleinern. Wasser und gegartes Hühnerfleisch zugeben, 12 Min./100 °C/Stufe 1 garen. Rapsöl zugeben und 40 Sek./Stufe 8 fein pürieren.",
    items: [
      { food: "Karotte", grams: 45 },
      { food: "Hühnerbrust ohne Haut", grams: 20 },
      { food: "Rapsöl", grams: 12 },
      { food: "Wasser", grams: 60 },
    ],
  },
  {
    name: "Gemüse-Kartoffelbrei (Variante 1)",
    ketocal: true,
    zubereitung: "Kartoffel und Zucchini garen, mit dem Wasser und KetoCal 3:1 fein pürieren und das Rapsöl untermischen.",
    thermomix: "Gegarte Kartoffel und Zucchini mit Wasser und KetoCal 3:1 in den Mixtopf geben, 8 Min./90 °C/Stufe 1 erwärmen. Rapsöl zugeben und 40 Sek./Stufe 8 fein pürieren.",
    items: [
      { food: "Wasser", grams: 40 },
      { food: "KetoCal 3:1", grams: 12 },
      { food: "Rapsöl", grams: 9 },
      { food: "Kartoffel gekocht", grams: 30 },
      { food: "Zucchini gegart", grams: 50 },
    ],
  },
  {
    name: "Gemüse-Kartoffelbrei (Variante 2)",
    ketocal: true,
    zubereitung: "Kartoffel und Zucchini garen, mit dem Wasser und KetoCal 3:1 fein pürieren und das Rapsöl untermischen.",
    thermomix: "Gegarte Kartoffel und Zucchini mit Wasser und KetoCal 3:1 in den Mixtopf geben, 8 Min./90 °C/Stufe 1 erwärmen. Rapsöl zugeben und 40 Sek./Stufe 8 fein pürieren.",
    items: [
      { food: "Wasser", grams: 40 },
      { food: "KetoCal 3:1", grams: 12 },
      { food: "Rapsöl", grams: 7 },
      { food: "Kartoffel gekocht", grams: 30 },
      { food: "Zucchini gegart", grams: 50 },
    ],
  },
  {
    name: "Milch-Grieß-Obstbrei",
    ketocal: true,
    zubereitung: "Wasser mit dem Johannisbrotkernmehl verrühren und erhitzen, bis der Brei andickt. Auf 45–50 °C abkühlen lassen, dann Grießbrei und KetoCal 3:1 glatt unterrühren. Zum Schluss Butter und Apfelmus zugeben.",
    thermomix: "Wasser und Johannisbrotkernmehl in den Mixtopf geben, 8 Sek./Stufe 4 verrühren, 6 Min./90 °C/Stufe 2 andicken. Auf ~45–50 °C abkühlen lassen, dann Grießbrei, KetoCal 3:1, Butter und Apfelmus zugeben und 20 Sek./Stufe 6 glatt rühren.",
    items: [
      { food: "Wasser", grams: 120 },
      { food: "Apfelmus ohne Zuckerzusatz", grams: 15 },
      { food: "Himmeltau Grießbrei", grams: 5 },
      { food: "KetoCal 3:1", grams: 12 },
      { food: "Butter", grams: 11 },
      { food: "Johannisbrotkernmehl", grams: 2 },
    ],
  },
  {
    name: "Karottensuppe",
    ketocal: true,
    zubereitung: "Karotten und Zwiebel in Wasser oder – ganz bzw. teilweise – in klarer Gemüsebrühe weich kochen und fein pürieren. KetoCal 3:1, Schlagobers und Butter unterrühren.",
    thermomix: "Karotten und Zwiebel grob 5 Sek./Stufe 5 zerkleinern. Wasser (oder Gemüsebrühe) zugeben, 15 Min./100 °C/Stufe 1 weich garen. KetoCal 3:1, Schlagobers und Butter zugeben und 45 Sek./Stufe 8 fein pürieren.",
    items: [
      { food: "Karotte", grams: 130 },
      { food: "Zwiebel, roh", grams: 5 },
      { food: "KetoCal 3:1", grams: 10 },
      { food: "Wasser", grams: 120 },
      { food: "Schlagobers (NÖM)", grams: 20 },
      { food: "Butter", grams: 6 },
    ],
  },

  // ---------- Zusätzliche Rezepte OHNE KetoCal ----------
  {
    name: "Avocado-Ei-Creme",
    ketocal: false,
    zubereitung: "Ei hart kochen, schälen und mit Avocado, Wasser und Rapsöl fein pürieren.",
    thermomix: "Ei in den Varoma legen, 1 Liter Wasser in den Mixtopf, 15 Min./Varoma/Stufe 1 hart garen. Mixtopf leeren. Geschältes Ei, Avocado, Wasser und Rapsöl einfüllen und 30 Sek./Stufe 7 cremig pürieren.",
    items: [
      { food: "Hühnerei, Vollei, frisch", grams: 30 },
      { food: "Avocado", grams: 40 },
      { food: "Rapsöl", grams: 10 },
      { food: "Wasser", grams: 40 },
    ],
  },
  {
    name: "Fisch-Brokkoli-Püree",
    ketocal: false,
    zubereitung: "Brokkoli weich garen und mit gegartem Fisch, Wasser und Rapsöl fein pürieren.",
    thermomix: "Brokkoli in den Mixtopf geben, 5 Sek./Stufe 5 zerkleinern. Wasser zugeben, 8 Min./100 °C/Stufe 1 garen. Gegarten Fisch und Rapsöl zugeben und 40 Sek./Stufe 8 fein pürieren.",
    items: [
      { food: "Heilbutt, gegart", grams: 30 },
      { food: "Broccoli, gekocht", grams: 50 },
      { food: "Rapsöl", grams: 12 },
      { food: "Wasser", grams: 50 },
    ],
  },
  {
    name: "Hähnchen-Karotte-Creme",
    ketocal: false,
    zubereitung: "Karotten weich garen, mit gegartem Hähnchen, Wasser und Rapsöl fein pürieren.",
    thermomix: "Möhren 5 Sek./Stufe 5 zerkleinern. Wasser und Hähnchenbrust zugeben, 12 Min./100 °C/Stufe 1 garen. Rapsöl zugeben und 40 Sek./Stufe 8 fein pürieren.",
    items: [
      { food: "Hähnchenbrust ohne Haut", grams: 25 },
      { food: "Möhren, gekocht", grams: 50 },
      { food: "Rapsöl", grams: 12 },
      { food: "Wasser", grams: 50 },
    ],
  },
  {
    name: "Rührei-Sahne-Creme",
    ketocal: false,
    zubereitung: "Ei, Sahne, Butter und Wasser verquirlen, unter Rühren stocken lassen und glatt pürieren.",
    thermomix: "Alle Zutaten in den Mixtopf geben, 10 Sek./Stufe 4 verrühren. 6 Min./90 °C/Stufe 2 unter Rühren stocken lassen, dann 20 Sek./Stufe 6 cremig pürieren.",
    items: [
      { food: "Hühnerei, Vollei, frisch", grams: 40 },
      { food: "Schlagsahne 30 % Fett", grams: 40 },
      { food: "Butter", grams: 8 },
      { food: "Wasser", grams: 20 },
    ],
  },
  {
    name: "Beeren-Sahne-Creme",
    ketocal: false,
    zubereitung: "Wasser mit Johannisbrotkernmehl andicken, abkühlen lassen und mit Sahne, Butter und Himbeeren fein pürieren.",
    thermomix: "Wasser und Johannisbrotkernmehl 8 Sek./Stufe 4 verrühren, 5 Min./90 °C/Stufe 2 andicken. Abkühlen lassen, dann Sahne, Butter und Himbeeren zugeben und 20 Sek./Stufe 6 fein pürieren.",
    items: [
      { food: "Schlagsahne 30 % Fett", grams: 60 },
      { food: "Himbeere", grams: 25 },
      { food: "Butter", grams: 8 },
      { food: "Wasser", grams: 40 },
      { food: "Johannisbrotkernmehl", grams: 1 },
    ],
  },
  {
    name: "Thunfisch-Zucchini-Püree",
    ketocal: false,
    zubereitung: "Zucchini weich garen, abgetropften Thunfisch, Wasser und Olivenöl zugeben und fein pürieren.",
    thermomix: "Zucchini 5 Sek./Stufe 5 zerkleinern, Wasser zugeben, 8 Min./100 °C/Stufe 1 garen. Abgetropften Thunfisch und Olivenöl zugeben und 40 Sek./Stufe 8 fein pürieren.",
    items: [
      { food: "Thunfisch in der Dose in Öl", grams: 30 },
      { food: "Zucchini gegart", grams: 70 },
      { food: "Olivenöl", grams: 12 },
      { food: "Wasser", grams: 50 },
    ],
  },
  {
    name: "Kartoffel-Gemüse-Creme",
    ketocal: false,
    zubereitung: "Kartoffel und Zucchini garen, mit Wasser fein pürieren und das Rapsöl untermischen.",
    thermomix: "Gegarte Kartoffel und Zucchini mit Wasser in den Mixtopf geben, 8 Min./90 °C/Stufe 1 erwärmen. Rapsöl zugeben und 40 Sek./Stufe 8 fein pürieren.",
    items: [
      { food: "Kartoffel gekocht", grams: 30 },
      { food: "Zucchini gegart", grams: 50 },
      { food: "Rapsöl", grams: 12 },
      { food: "Wasser", grams: 40 },
    ],
  },
];
