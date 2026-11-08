from pathlib import Path
import csv
import html
import json

project = Path(__file__).resolve().parents[1]
base = project / "catalog"
site = project / "dist"
variables = (base / "base.css").read_text()
rows = list(csv.DictReader((base / "baby-worklist.tsv").open(), delimiter="\t"))
us = {book["title"]: book for book in json.loads((base / "us-isbn.json").read_text())}
links_file = base / "us-links.json"
links = json.loads(links_file.read_text()) if links_file.exists() else {}
books = []
for row in rows:
    entry = us[row["英文原名"]]
    isbn = entry["isbn"]
    books.append(dict(title=entry["title"], cn=row["中文名称"], kind=row["名称依据"], about=row["内容主题"],
                      group="一根毛宝宝", series="Baby Board Books", author="Leslie Patricelli", artist="Leslie Patricelli", edition="纸板书",
                      tower=row["书塔"] == "是", alias=row["英国版异名"], isbn=isbn, link=links.get(isbn) or "https://www.penguinrandomhouseretail.com/book/?isbn=" + isbn))
assert len(books) == len(us) == len({book["isbn"] for book in books}) == 27
assert sum(book["tower"] for book in books) == 4
for collection in ("authored", "illustrated", "rare"):
    for item in json.loads((base / f"{collection}-extra.json").read_text()):
        section = {"illustrated":"合作绘本", "rare":"成人漫画"}.get(collection, "章节小说" if "Rizzlerunk" in item["title"] else "原创绘本")
        books.append(dict(title=item["title"], cn=item["cn"], kind="参考译名", about=(item.get("about") or item["theme"]).rstrip("。"),
                          group=section, series=item.get("series") or item["group"], author=item["author"],
                          artist=item.get("artist") or item.get("illustrator", ""), edition=item["format"],
                          tower=False, alias=item.get("alias",""), isbn=item["isbn"],
                          link=item.get("link") or item.get("url") or item["source"]))
assert len({b["isbn"] for b in books}) == len({b["title"] for b in books}) == len(books)
boxes = json.loads((base / "boxes.json").read_text())
assert all(set(box["books"]) <= {b["title"] for b in books} for box in boxes)
dim = json.loads((base / "work-dimensions.json").read_text())
packs = json.loads((base / "mini-editions.json").read_text())["packs"]
alt = json.loads((base / "standalone-editions.json").read_text())
size_by_pack = {p["isbn"]: p for p in packs}
for box in boxes:
    box.update({k: size_by_pack[box["isbn"]][k] for k in ["singleSize", "packageSize", "miniStatus"]})

def cm(w,h):
    if not (w and h): return "单册尺寸待核"
    return f"约 {float(w):.1f} × {float(h):.1f} cm"

for b in books:
    isbn = b["isbn"]
    d = dim.get(isbn) or {}
    size = cm(d.get("w_cm"),d.get("h_cm"))
    b["variants"] = [dict(key=isbn, isbn=isbn, label="常规纸板书" if b["group"]=="一根毛宝宝" else b["edition"],
                          size=size, scope="单本 ISBN", link=b["link"], ref=d.get("source") or b["link"], cover=isbn)]
    for a in alt:
        if a["title"] != b["title"]: continue
        aid=a["isbn"]
        b["variants"].append(dict(key=aid,isbn=aid,label=a["format"],size=cm(a["w_cm"],a["h_cm"]),scope="单本 ISBN",
                                  link=a["source"],ref=a["source"],cover=aid if (site / "covers" / f"{aid}.jpg").exists() else ""))
    for pack in (size_by_pack["9780763650100"], size_by_pack["9781536218794"]):
        if b["title"] not in pack["books"]: continue
        mini=pack["isbn"]=="9780763650100"
        pid=pack["isbn"]
        b["variants"].append(dict(key=f"{isbn}-{pid}",isbn=pid,label="书塔迷你纸板书" if mini else "Little Library 较小盒装本",
                                  size="单册约 6 × 6 cm" if mini else "按外盒尺寸判断，单册比常规版小；精确边长待核",
                                  scope="整盒 ISBN", pack=pack["title"], link=pack["link"], ref=pack["sources"][0],
                                  cover=pid if (site / "covers" / f"{pid}.jpg").exists() else ""))
    b["multiSize"] = len(b["variants"])>1 and not b["title"].startswith("The Rizzlerunk Club:")
synopses = {}
for filename in ("baby-synopses.json", "authored-synopses.json", "other-synopses.json"):
    file = base / filename
    if file.is_file():
        synopses.update(json.loads(file.read_text()))
for b in books:
    synopsis = synopses.get(b["title"], {})
    b["summary"] = synopsis.get("summary", b["about"])
    b["summarySource"] = synopsis.get("source", b["link"])

def card(book):
    isbn = book["isbn"]
    return f'''<article class="book" data-isbn="{isbn}">
    <button class="coverbtn" type="button" data-open="{isbn}" aria-label="查看 {html.escape(book['title'])} 的封面和版本">
      <span class="jacket {'originalshape' if book['group'] != '一根毛宝宝' else ''}"><img src="covers/{isbn}.jpg" loading="lazy" alt="{html.escape(book['title'])} 英文版封面"></span>
    </button>
    <button class="booktitle" type="button" data-open="{isbn}">{html.escape(book['title'])}</button>
    <p class="cname">{html.escape(book["cn"])}</p>
    <p class="cardintro">{html.escape(book["about"].rstrip("。"))}。</p>
    <p class="sizenote">{'常规单本 ' if book['group']=='一根毛宝宝' else ''}{html.escape(book['variants'][0]['size'])}</p>
    <div class="bookmeta"><span>{'书塔含迷你本' if book["tower"] else book["group"]}</span><button type="button" data-variants="{isbn}" aria-label="查看并标记 {html.escape(book['title'])} 的购买版本">选购版本 ↗</button></div>
    </article>'''

index = '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#fcf9ef">
<title>Leslie Patricelli 的英文书架 · 英文作品目录</title>
<meta name="description" content="Leslie Patricelli 英文作品书目。按独立作品去重，含宝宝纸板书、绘本、章节小说、合作插画与早期漫画的英文封面与 ISBN。">
<style>BASECSS</style><link rel="stylesheet" href="shelf.css"><script src="purchases.js" defer></script><script src="account.js" defer></script><script src="shelf.js" defer></script></head>
<body><a href="#catalog" class="skip">跳到单本目录</a>
<header class="top"><div class="topline"><a class="brand" href="#top"><i class="mark" aria-hidden="true"><b></b><b></b><b></b></i>Patricelli Bookshelf</a>
<nav aria-label="站内导航"><a href="#catalog">单本目录</a><a class="setlink" href="#sets">套装查重</a><button type="button" data-tower>照片里的书塔 <span aria-hidden="true">↗</span></button><button type="button" class="accountnav" id="accountOpen" aria-haspopup="dialog">书架账号</button></nav></div></header>
<main id="top">
<div class="herowrap"><section class="hero wrap"><div class="intro"><p class="byline"><span></span>LESLIE PATRICELLI</p>
<h1>从一根毛宝宝<br><em>到整座书架</em></h1>
<p class="introtext">Leslie Patricelli 著绘、合著或参与插画的 COUNT 部英文作品。照片里的书塔小本约 6 cm 见方，常规宝宝纸板书约 17.8 cm 见方。点开封面，可按版本分别标记已购。</p>
<a class="primary" href="#catalog">浏览单本目录 <span aria-hidden="true">↓</span></a>
<button class="herocompare" type="button" data-tower>书塔小本与常规本 ↗</button></div>
<div class="showcase" aria-label="书架选取的三本英文原版封面">
<div class="hbook hback"><img src="covers/9780763632410.jpg" alt="Higher! Higher! 封面"></div>
<div class="hbook hmiddle"><img src="covers/9781419709517.jpg" alt="Be Patient, Pandora! 封面"></div>
<div class="hbook hfront"><img src="covers/9780763619503.jpg" alt="Yummy Yucky 封面"></div>
<div class="showcaption"><span>Leslie Patricelli</span><span>Collected Works</span></div></div></section></div>
<section class="wrap catalog" id="catalog"><div class="cataloghead"><div><p class="kicker">THE COLLECTION</p><h2>单本目录</h2></div>
<div class="controls"><label class="groupctl"><select id="group" aria-label="按作品类型筛选">GROUPS</select></label>
<label class="search"><span aria-hidden="true" class="glass"></span><input id="search" type="search" aria-label="搜索英文书名、中文或 ISBN" placeholder="搜索书名、中文或 ISBN"></label></div></div>
<div class="filterrow"><div class="filters" role="group" aria-label="筛选图书">
<button type="button" data-filter="all" aria-pressed="true">全部 <small>COUNT</small></button>
<button type="button" data-filter="tower" aria-pressed="false">书塔收录 <small>4</small></button>
<button type="button" data-filter="more" aria-pressed="false">宝宝系列其余 <small>23</small></button>
<button type="button" data-filter="sizes" aria-pressed="false">多种开本 <small>SIZECOUNT</small></button>
<button type="button" data-filter="owned" aria-pressed="false">已购买 <small id="ownedcount">…</small></button>
<button type="button" data-filter="unowned" aria-pressed="false">未购买 <small id="unownedcount">…</small></button>
</div><p class="count" aria-live="polite" id="count">COUNT 本</p></div>
<div class="syncrow"><span id="syncnote" role="status">正在读取账号的购买记录…</span> <button type="button" class="syncagain" id="syncagain" hidden>重试同步</button><button type="button" class="syncagain" data-account-login hidden>登录 / 注册</button></div>
<div class="grid" id="books">CARDS</div>
<div id="empty" hidden><p>当前没有匹配的图书。</p><button type="button" id="reset">查看全部单本</button></div>
<small class="storage">已购买和未购买的数量按版本统计。同一部作品还有未购买版本时，会同时出现在两项筛选中。尺寸按宽 × 高排列。</small></section>
<section class="wrap setcompare" id="sets"><p class="kicker">BOXED EDITIONS</p><h2>套装查重</h2>
<p class="setintro"><b>照片里约 6 cm 见方的迷你本，目前核实到 4 本。</b>另外，《Little Library》收录 8 本较小开本，其中《Yummy Yucky》和《Quiet Loud》也在书塔里。两套合起来有 10 个不同故事。</p>
<p class="setintro">下面可以任选两套英文组合，比较重复的书名和各自的尺寸。</p>
<div class="setinputs"><label>已有的套装<select id="baseBox" aria-label="已有的套装">BOXOPTIONS</select></label>
<label>想比较的套装<select id="nextBox" aria-label="想比较的套装">BOXOPTIONS</select></label></div>
<div id="comparison" aria-live="polite"></div></section>
</main><footer><div class="wrap foot"><div><strong>Patricelli Bookshelf</strong><p>截至 2026 年 11 月 8 日可核实的英文独立作品。中文用于理解书名，同一作品的再版与盒装选集均合并。</p></div><div class="footlinks"><a href="https://www.lesliepatricelli.com" target="_blank" rel="noopener">作者书目 ↗</a><a href="https://www.lesliepatricelli.com/mini-myths-books" target="_blank" rel="noopener">合作绘本 ↗</a><a href="english-board-books.xlsx" download>下载 Excel 清单 ↓</a></div><small>Design · Brclio</small></div></footer>
<dialog id="detail" aria-labelledby="dialogtitle"><button class="close" type="button" id="close" aria-label="关闭详情">×</button><div id="inside"></div></dialog>
<dialog id="accountDialog" aria-labelledby="accountTitle">
<button type="button" class="close" id="accountClose" aria-label="关闭账号窗口">×</button>
<div class="accountbody">
<h2 id="accountTitle">书架账号</h2>
<p id="accountDesc" class="accountdesc">登录后，可在不同设备查看和标记购买记录。</p>
<div id="accountTabs" class="accounttabs" role="group" aria-label="账号操作">
<button type="button" data-account-mode="login" aria-pressed="true">登录</button>
<button type="button" data-account-mode="register" aria-pressed="false">注册</button></div>
<form id="accountForm" autocomplete="on" method="post" action="/api/auth/login">
<label for="accountName">用户名</label>
<input id="accountName" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required aria-describedby="nameHint">
<small id="nameHint" hidden>3–32 个字符，可用中英文字母、数字、下划线或短横线。</small>
<label for="accountPassword">密码</label>
<input id="accountPassword" name="password" type="password" autocomplete="current-password" required aria-describedby="passwordHint">
<small id="passwordHint" hidden>10–128 个字符。</small>
<label id="importChoice" class="importchoice" hidden><input id="importCheck" type="checkbox"> <span id="importText"></span></label>
<button class="action" type="submit" id="accountSubmit">登录</button>
</form>
<div id="accountProfile" hidden>
<p id="accountWho" class="accountwho"></p>
<p id="accountImportNote" class="accountdesc" hidden></p>
<button type="button" class="secondary" id="accountImport" hidden>导入原 Sites 购买记录</button>
<button type="button" class="secondary" id="accountLogout">退出登录</button>
</div>
<p id="accountMessage" role="status" aria-live="polite"></p>
</div></dialog>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script type="application/json" id="bookdata">DATA</script>
<script type="application/json" id="boxdata">BOXJSON</script>
</body></html>'''
groups = ['<option value="">所有作品类型</option>']
for name in dict.fromkeys(b["group"] for b in books):
    groups.append(f'<option value="{name}">{name} · {sum(b["group"]==name for b in books)} 本</option>')
index = index.replace("BASECSS", variables).replace("GROUPS","".join(groups)).replace("SIZECOUNT",str(sum(b["multiSize"] for b in books))).replace("COUNT",str(len(books))).replace("CARDS", "".join(map(card, books))).replace("DATA", json.dumps(books,ensure_ascii=False).replace("<","\\u003c"))
index = index.replace("BOXOPTIONS", "".join(f'<option value="{b["isbn"]}">{html.escape(b["title"])}（{len(b["books"])} 册）</option>' for b in boxes)).replace("BOXJSON", json.dumps(boxes, ensure_ascii=False).replace("<","\\u003c"))
(site / "index.html").write_text(index)
