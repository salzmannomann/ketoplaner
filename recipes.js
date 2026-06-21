// Sondennahrungs-Rezepte (aus dem Arbeitsblatt "Ketogene Diät").
// Mengen in Gramm; ratioZiel = das im Arbeitsblatt vorgesehene Keto-Verhältnis.
// Diese Rezepte sind fest hinterlegt und können in eine Mahlzeit geladen
// oder als eigene Mahlzeit kopiert und angepasst werden.
const RECIPES_SONDE = [
  {
    name: "Obstbrei – Banane",
    kategorie: "Sondennahrung",
    ratioZiel: 1.7,
    zubereitung: "Das kalte Wasser in einen Topf geben und das Johannisbrotkernmehl mit dem Schneebesen einrühren. Dann den Brei unter gelegentlichem Umrühren erhitzen, bis er andickt. Bevor das KetoCal 3:1 eingerührt wird, muss der Brei wieder auf 45–50 °C abkühlen. Inzwischen die Obstportion abwiegen und ggf. pürieren. Das KetoCal 3:1 mit dem Schneebesen glatt unterrühren, dann Butter und Obst zugeben.",
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
    kategorie: "Sondennahrung",
    ratioZiel: 1.7,
    zubereitung: "Das kalte Wasser in einen Topf geben und das Johannisbrotkernmehl mit dem Schneebesen einrühren. Dann den Brei unter gelegentlichem Umrühren erhitzen, bis er andickt. Bevor das KetoCal 3:1 eingerührt wird, muss der Brei wieder auf 45–50 °C abkühlen. Inzwischen die Obstportion abwiegen und ggf. pürieren. Das KetoCal 3:1 mit dem Schneebesen glatt unterrühren, dann Butter und Obst zugeben.",
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
    kategorie: "Sondennahrung",
    ratioZiel: 1.7,
    zubereitung: "Das kalte Wasser in einen Topf geben und das Johannisbrotkernmehl mit dem Schneebesen einrühren. Dann den Brei unter gelegentlichem Umrühren erhitzen, bis er andickt. Bevor das KetoCal 3:1 eingerührt wird, muss der Brei wieder auf 45–50 °C abkühlen. Inzwischen die Obstportion abwiegen und ggf. pürieren. Das KetoCal 3:1 mit dem Schneebesen glatt unterrühren, dann Butter und Obst zugeben.",
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
    kategorie: "Sondennahrung",
    ratioZiel: 1.76,
    zubereitung: "Das Gemüse abwiegen, in wenig Wasser weich dünsten und mit dem gegarten Fleisch pürieren. Anschließend das Rapsöl untermischen.",
    items: [
      { food: "Hühnerbrust ohne Haut", grams: 20 },
      { food: "Rapsöl", grams: 13 },
      { food: "Wasser", grams: 60 },
      { food: "Zucchini roh", grams: 80 },
    ],
  },
  {
    name: "Gemüse-Fleischbrei – Karotte",
    kategorie: "Sondennahrung",
    ratioZiel: 1.68,
    zubereitung: "Das Gemüse abwiegen, in wenig Wasser weich dünsten und mit dem gegarten Fleisch pürieren. Anschließend das Rapsöl untermischen.",
    items: [
      { food: "Karotte", grams: 45 },
      { food: "Hühnerbrust ohne Haut", grams: 20 },
      { food: "Rapsöl", grams: 12 },
      { food: "Wasser", grams: 60 },
    ],
  },
  {
    name: "Gemüse-Kartoffelbrei (Variante 1)",
    kategorie: "Sondennahrung",
    ratioZiel: 1.7,
    zubereitung: "Kartoffel und Zucchini garen, mit dem Wasser und KetoCal 3:1 fein pürieren und das Rapsöl untermischen.",
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
    kategorie: "Sondennahrung",
    ratioZiel: 1.5,
    zubereitung: "Kartoffel und Zucchini garen, mit dem Wasser und KetoCal 3:1 fein pürieren und das Rapsöl untermischen.",
    items: [
      { food: "Wasser", grams: 40 },
      { food: "KetoCal 3:1", grams: 12 },
      { food: "Rapsöl", grams: 7 },
      { food: "Kartoffel gekocht", grams: 30 },
      { food: "Zucchini gegart", grams: 50 },
    ],
  },
  {
    name: "Milch-Grieß-Obstbrei (1,5:1)",
    kategorie: "Sondennahrung",
    ratioZiel: 1.5,
    zubereitung: "Wasser mit dem Johannisbrotkernmehl verrühren und erhitzen, bis der Brei andickt. Auf 45–50 °C abkühlen lassen, dann Grießbrei und KetoCal 3:1 glatt unterrühren. Zum Schluss Butter und Apfelmus zugeben.",
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
    kategorie: "Sondennahrung",
    ratioZiel: 1.6,
    zubereitung: "Karotten und Zwiebel in Wasser oder – ganz bzw. teilweise – in klarer Gemüsebrühe weich kochen und fein pürieren. KetoCal 3:1, Schlagobers und Butter unterrühren.",
    items: [
      { food: "Karotte", grams: 130 },
      { food: "Zwiebel, roh", grams: 5 },
      { food: "KetoCal 3:1", grams: 10 },
      { food: "Wasser", grams: 120 },
      { food: "Schlagobers (NÖM)", grams: 20 },
      { food: "Butter", grams: 6 },
    ],
  },
];
