#!/usr/bin/env python3
"""Baut aus index.html + styles.css + foods.js + recipes.js + app.js eine
einzige, eigenständige HTML-Datei (keto-rechner.html).

Außerdem werden in index.html die Cache-Busting-Versionen (?v=...) der
eingebundenen Dateien anhand ihres Inhalts (Kurz-Hash) aktualisiert. So lädt
der Browser nach einer Änderung garantiert die neue Datei statt der alten aus
dem Cache.

Verwendung:  python3 build-single.py
"""
import os, re, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))

ASSETS = ("styles.css", "foods.js", "recipes.js", "app.js")


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as fh:
        return fh.read()


def short_hash(text):
    return hashlib.md5(text.encode("utf-8")).hexdigest()[:8]


def update_versions(html):
    """Setzt in index.html für jede Datei ?v=<inhalts-hash>."""
    for name in ASSETS:
        ver = short_hash(read(name))
        # href="styles.css" / href="styles.css?v=xyz"  bzw. src="..."
        pattern = r'((?:href|src)="%s)(?:\?v=[^"]*)?(")' % re.escape(name)
        html = re.sub(pattern, r'\1?v=%s\2' % ver, html)
    return html


def main():
    html = read("index.html")

    # 1) Versionen in index.html aktualisieren und zurückschreiben
    new_html = update_versions(html)
    if new_html != html:
        with open(os.path.join(HERE, "index.html"), "w", encoding="utf-8") as fh:
            fh.write(new_html)
        print("index.html: Cache-Versionen aktualisiert")
    html = new_html

    # 1b) Service-Worker-Version anhand des Inhalts aktualisieren (zuverlässige Updates)
    sw_path = os.path.join(HERE, "sw.js")
    if os.path.exists(sw_path):
        core = "".join(read(f) for f in ("index.html", "styles.css", "foods.js", "recipes.js", "app.js"))
        ver = short_hash(core)
        sw = read("sw.js")
        sw2 = re.sub(r'const VERSION = "hamham-[^"]*";', 'const VERSION = "hamham-%s";' % ver, sw)
        if sw2 != sw:
            with open(sw_path, "w", encoding="utf-8") as fh:
                fh.write(sw2)
            print("sw.js: Version aktualisiert ->", ver)

    # 2) Einzeldatei bauen – CSS einbetten (Query-String ?v=... ignorieren)
    css = read("styles.css")
    html = re.sub(
        r'<link rel="stylesheet" href="styles\.css(?:\?v=[^"]*)?" />',
        "<style>\n" + css + "\n</style>",
        html,
    )

    # Marken-Logo als data-URI einbetten, damit die Einzeldatei eigenständig bleibt
    logo = os.path.join(HERE, "icon-192.png")
    if os.path.exists(logo):
        import base64
        with open(logo, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")
        html = html.replace('src="icon-192.png"', 'src="data:image/png;base64,' + b64 + '"')

    # Skripte einbetten (Reihenfolge wie in index.html beibehalten)
    for src in ("foods.js", "recipes.js", "app.js"):
        js = read(src)
        html = re.sub(
            r'<script src="%s(?:\?v=[^"]*)?"></script>' % re.escape(src),
            lambda m, js=js: "<script>\n" + js + "\n</script>",
            html,
        )

    # Sicherstellen, dass keine externen Verweise mehr übrig sind
    leftovers = re.findall(r'(?:src|href)="(?:foods\.js|recipes\.js|app\.js|styles\.css)(?:\?v=[^"]*)?"', html)
    if leftovers:
        raise SystemExit("Fehler: externe Verweise nicht ersetzt: %s" % leftovers)

    out = os.path.join(HERE, "keto-rechner.html")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("Geschrieben:", out, "(%d Zeichen)" % len(html))


if __name__ == "__main__":
    main()
