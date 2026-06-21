#!/usr/bin/env python3
"""Baut aus index.html + styles.css + foods.js + recipes.js + app.js eine
einzige, eigenständige HTML-Datei (keto-rechner.html).

Verwendung:  python3 build-single.py
"""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as fh:
        return fh.read()


def main():
    html = read("index.html")
    css = read("styles.css")

    # CSS einbetten
    html = html.replace(
        '<link rel="stylesheet" href="styles.css" />',
        "<style>\n" + css + "\n</style>",
    )

    # Skripte einbetten (Reihenfolge wie in index.html beibehalten)
    for src in ("foods.js", "recipes.js", "app.js"):
        js = read(src)
        html = html.replace(
            '<script src="%s"></script>' % src,
            "<script>\n" + js + "\n</script>",
        )

    # Sicherstellen, dass keine externen Verweise mehr übrig sind
    leftovers = re.findall(r'(?:src|href)="(?:foods\.js|recipes\.js|app\.js|styles\.css)"', html)
    if leftovers:
        raise SystemExit("Fehler: externe Verweise nicht ersetzt: %s" % leftovers)

    out = os.path.join(HERE, "keto-rechner.html")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("Geschrieben:", out, "(%d Zeichen)" % len(html))


if __name__ == "__main__":
    main()
