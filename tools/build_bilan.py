"""Bilan public AfroBet Club en pages statiques (lisibles par Google, sans JavaScript).

Lit la feuille publiée (même source que la page interactive, config.js) et écrit :
  bilan/index.html            bilan global + un tableau par mois + 30 dernières sélections
  bilan/AAAA-MM/index.html    toutes les sélections du mois, gagnées comme perdues
  sitemap.xml, robots.txt
Lancé par .github/workflows/bilan.yml (toutes les 3 h) ou à la main : python tools/build_bilan.py
Bibliothèque standard uniquement. Aucune promesse de gain : chiffres passés, pertes comprises, 18+.
"""
import csv
import html
import io
import os
import re
import sys
import urllib.request
from collections import OrderedDict
from datetime import date, datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://archives.afrobet.club"
DERNIER = ""
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def csv_url() -> str:
    txt = open(os.path.join(ROOT, "config.js"), encoding="utf-8").read()
    return re.search(r'CSV_URL:\s*"([^"]+)"', txt).group(1)


def num(v) -> float:
    try:
        return float(str(v or "").replace(" ", "").replace(" ", "").replace("%", "").replace(",", "."))
    except ValueError:
        return 0.0


def fr(v: float, n: int = 2) -> str:
    return f"{v:.{n}f}".replace(".", ",")


def signe(v: float) -> str:
    return ("+" if v > 0 else "") + fr(v)


def load(text: str) -> list:
    rows = list(csv.reader(io.StringIO(text)))[1:]
    out = []
    for r in rows:
        r = (r + [""] * 10)[:10]
        m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", r[0].strip())
        if not m:
            continue
        res = r[6].strip().upper().replace(" ", "")
        out.append({"d": date(int(m[3]), int(m[2]), int(m[1])), "t1": r[1].strip(), "score": r[2].strip(),
                    "t2": r[3].strip(), "pick": r[4].strip(), "odd": num(r[5]),
                    "res": "GAGNÉ" if "WIN" in res else "PERDU" if "LOSS" in res else (res or "—"),
                    "profit": num(r[7])})
    out.sort(key=lambda x: x["d"], reverse=True)
    return out


def bilan(rows: list) -> dict:
    n = len(rows)
    w = sum(1 for r in rows if r["res"] == "GAGNÉ")
    l = sum(1 for r in rows if r["res"] == "PERDU")
    p = sum(r["profit"] for r in rows)
    odds = [r["odd"] for r in rows if r["odd"]]
    return {"n": n, "w": w, "l": l, "taux": (w / (w + l) * 100) if (w + l) else 0,
            "cote": sum(odds) / len(odds) if odds else 0, "unites": p}


def e(s) -> str:
    return html.escape(str(s), quote=True)


def page(title: str, desc: str, path: str, body: str) -> str:
    LAST = DERNIER
    return f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{BASE}{path}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{BASE}{path}">
<meta property="og:locale" content="fr_FR">
<link rel="stylesheet" href="/style.css?v=13">
<style>
.bilan-nav{{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 28px}}
.bilan-nav a{{border:1px solid #d6cec1;padding:6px 10px;text-decoration:none;color:inherit;font-size:13px}}
.mois-table{{width:100%;border-collapse:collapse;margin:8px 0 32px;font-size:14px}}
.mois-table th,.mois-table td{{text-align:left;padding:8px 6px;border-bottom:1px solid #d6cec1}}
.mois-table td.num,.mois-table th.num{{text-align:right}}
.note{{font-size:13px;color:#69645d;line-height:1.5;margin:24px 0}}
</style>
</head>
<body>
<header class="global-header">
  <a class="global-brand" href="https://www.afrobet.club/">AfroBet Club</a>
  <nav class="desktop-nav" aria-label="Navigation principale">
    <a href="https://www.afrobet.club/">ACCUEIL</a>
    <a href="/bilan/">BILAN</a>
    <a href="https://studio.afrobet.club/go/tg-site">TELEGRAM GRATUIT</a>
  </nav>
  <a class="archives-cta" href="/">ARCHIVES <span>→</span></a>
</header>
<main class="page">
{body}
<p class="note">Bilan publié tel quel depuis la feuille officielle d'AfroBet Club : chaque sélection publiée est conservée, gagnée comme perdue.
Résultats passés, en unités (mise fixe de 1) : ils ne préjugent pas des résultats futurs. Les paris comportent des risques de perte.
Réservé aux personnes majeures (18 ans et plus). Jouez de façon responsable.</p>
<footer>Données arrêtées au {LAST}.</footer>
</main>
</body>
</html>
"""


def mil(n: int) -> str:
    return f"{n:,}".replace(",", "\u202f")


def stats_html(b: dict) -> str:
    return f"""<section class="stats">
  <article><span>{mil(b['n'])}</span><small>Sélections publiées</small></article>
  <article><span>{mil(b['w'])} / {mil(b['l'])}</span><small>Gagnées / perdues</small></article>
  <article><span>{fr(b['taux'])} %</span><small>Taux de réussite</small></article>
  <article><span>{fr(b['cote'])}</span><small>Cote moyenne</small></article>
  <article><span>{signe(b['unites'])}</span><small>Bilan en unités</small></article>
</section>"""


def rows_html(rows: list) -> str:
    items = []
    for r in rows:
        cls = "win" if r["res"] == "GAGNÉ" else "loss" if r["res"] == "PERDU" else "void"
        items.append(f"""<article class="row">
  <div class="date">{r['d'].strftime('%d/%m/%Y')}</div>
  <div class="match"><strong>{e(r['t1'])} — {e(r['t2'])}</strong><div class="score">{e(r['score'])}</div></div>
  <div class="pick">{e(r['pick']) or '—'}</div>
  <div class="odds">{fr(r['odd']) if r['odd'] else '—'}</div>
  <div class="result {cls}">{r['res']}</div>
  <div class="profit {'win' if r['profit'] >= 0 else 'loss'}">{signe(r['profit'])}</div>
</article>""")
    head = '<div class="archive-head"><span>Date</span><span>Match</span><span>Sélection</span><span>Cote</span><span>Résultat</span><span>Unités</span></div>'
    return f'<section class="archive">{head}<div class="archive-rows">{"".join(items)}</div></section>'


def write(rel: str, content: str):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)


def build(rows: list) -> list:
    global DERNIER
    if len(rows) < 100:
        sys.exit(f"feuille incomplète ({len(rows)} lignes) : rien n'est réécrit")
    DERNIER = rows[0]["d"].strftime("%d/%m/%Y")
    months = OrderedDict()
    for r in rows:
        months.setdefault((r["d"].year, r["d"].month), []).append(r)
    urls = [("/", None), ("/bilan/", rows[0]["d"])]
    g = bilan(rows)
    first = rows[-1]["d"]
    lignes = []
    for (y, m), rs in months.items():
        b = bilan(rs)
        slug = f"{y}-{m:02d}"
        lignes.append(f'<tr><td><a href="/bilan/{slug}/">{MOIS[m-1].capitalize()} {y}</a></td><td class="num">{b["n"]}</td>'
                      f'<td class="num">{b["w"]} / {b["l"]}</td><td class="num">{fr(b["taux"])} %</td><td class="num">{signe(b["unites"])}</td></tr>')
        titre = f"Bilan AfroBet Club — {MOIS[m-1]} {y} : {b['n']} sélections, {fr(b['taux'], 1)} % de réussite"
        desc = (f"Toutes les sélections foot publiées par AfroBet Club en {MOIS[m-1]} {y}, gagnées comme perdues : "
                f"{b['w']} gagnées, {b['l']} perdues, cote moyenne {fr(b['cote'])}.")
        body = (f'<header class="hero"><h1>Bilan de {MOIS[m-1]} {y}</h1><p>{e(desc)}</p></header>'
                f'<nav class="bilan-nav"><a href="/bilan/">← Bilan complet</a><a href="/">Archives interactives</a></nav>'
                + stats_html(b) + rows_html(rs))
        write(f"bilan/{slug}/index.html", page(titre, desc, f"/bilan/{slug}/", body))
        urls.append((f"/bilan/{slug}/", max(r["d"] for r in rs)))
    desc = (f"Bilan public et vérifiable d'AfroBet Club : {g['n']} sélections foot publiées depuis {MOIS[first.month-1]} {first.year}, "
            f"{fr(g['taux'], 1)} % de réussite, toutes les pertes comprises. Détail mois par mois.")
    body = (f'<header class="hero"><h1>Bilan public AfroBet Club</h1><p>{e(desc)}</p></header>'
            + stats_html(g)
            + '<div class="section-label">Mois par mois</div><table class="mois-table"><thead><tr><th>Mois</th><th class="num">Sélections</th>'
              '<th class="num">Gagnées / perdues</th><th class="num">Réussite</th><th class="num">Unités</th></tr></thead><tbody>'
            + "".join(lignes) + '</tbody></table><div class="section-label">30 dernières sélections</div>' + rows_html(rows[:30]))
    write("bilan/index.html", page("Bilan public AfroBet Club : toutes les sélections foot, gagnées comme perdues", desc, "/bilan/", body))
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u, d in urls:
        sm.append(f"  <url><loc>{BASE}{u}</loc>" + (f"<lastmod>{d.isoformat()}</lastmod>" if d else "") + "</url>")
    sm.append("</urlset>")
    write("sitemap.xml", "\n".join(sm) + "\n")
    write("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /embed/\nDisallow: /freetips/\n\nSitemap: {BASE}/sitemap.xml\n")
    return urls


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else None
    text = open(src, encoding="utf-8").read() if src else urllib.request.urlopen(csv_url(), timeout=60).read().decode("utf-8")
    u = build(load(text))
    print(f"{len(u)} adresses dans le sitemap")
