"""Check the exported workbook against the exact catalogue and optional previous purchase list."""
import argparse
import json
import re
from collections import Counter
from pathlib import Path

from openpyxl import load_workbook
from workbook_files import read_state

def validate(path, previous):
    root=Path(__file__).resolve().parent.parent
    html=(root/"dist/index.html").read_text()
    def embedded(key):
        return json.loads(re.search(r'id="'+key+r'">(.*?)</script>',html,re.S)[1])
    books=embedded("bookdata")
    boxes={x["isbn"]:x for x in embedded("boxdata")}
    retail=embedded("retaildata")
    audit=embedded("auditdata")
    wb=load_workbook(path)
    computed=load_workbook(path,data_only=True)
    works,eds,gallery,links,mini,review=wb.worksheets
    assert review.title=="核查说明"
    records=lambda sheet: list(sheet.iter_rows(min_row=7))
    assert len(records(works))==len(books)
    editions={(b["title"],v["isbn"]):v for b in books for v in b["variants"]}
    assert audit["editionCount"]==len(editions)==len(records(eds))
    if previous:
        before=Counter((str(isbn),v) for isbn,v in read_state(previous))
        after=Counter((str(isbn),v) for isbn,v in read_state(path))
        assert before==after, "Stored purchase states changed"
    for row,b in zip(records(works),books):
        assert row[0].value==b["title"] and row[1].value==b["isbn"] and row[2].value==b["cn"]
        assert row[3].value=="\n".join(v["label"]+"　"+v["size"] for v in b["variants"])
        assert row[6].value==b["summary"]
        bought=sum(1 for other in records(eds) if other[10].value==b["title"] and
                   computed[eds.title][other[7].coordinate].value=="已有")
        assert computed[works.title][row[7].coordinate].value==bought
    for row in records(eds):
        isbn=row[5].value; v=editions[row[10].value,isbn]
        assert row[0].value==(v.get("editionTitle") or row[10].value)
        assert row[1].value==v["label"]
        assert row[12].value==(v.get("packOnly") or isbn)
        pair=re.fullmatch(r"(?:约\s*)?([\d.]+)\s*×\s*([\d.]+)\s*cm",v["size"])
        assert (row[2].value,row[3].value)==(tuple(float(n) for n in pair.groups()) if pair else ("待核","待核"))
        assert row[5].comment and v["ref"] in row[5].comment.text
        if v.get("pack"):
            assert row[7].data_type=="f"
        else:
            assert any(row[7].coordinate in validation for validation in eds.data_validations.dataValidation)
        if v.get("packOnly"):
            assert row[12].hyperlink.target==boxes[v["packOnly"]]["link"]
            assert row[6].value=="套内单册 ISBN" and boxes[v["packOnly"]]["title"]==row[8].value
    available={v["isbn"] for v in editions.values() if v.get("cover") and not v.get("pack")}
    available.update(i for i in boxes if (root/"dist"/"covers"/(i+".jpg")).is_file())
    image_ids=[]
    for img in gallery._images:
        anchor=img.anchor._from
        image_ids.append(gallery.cell(anchor.row+3,anchor.col+1).value)
    assert set(image_ids)==available and len(image_ids)==len(available)
    singles={v["isbn"]:v for v in editions.values() if not v.get("pack")}
    visual_refs={}
    for row in gallery:
        for cell in row:
            if str(cell.value) in set(singles)|set(boxes):
                visual_refs[cell.value]=gallery.cell(cell.row-2,cell.column).value
    assert set(visual_refs)==set(singles)|set(boxes)
    assert {i for i,caption in visual_refs.items() if caption=="封面待核"}==set(visual_refs)-available
    expected=[]
    for isbn,shops in retail["products"].items():
        if singles.get(isbn,{}).get("packOnly"):
            continue
        for link in shops:
            expected.append((isbn,link["url"],"ISBN 搜索" if link.get("kind")=="search" else "商品详情页"))
        for platform in retail["priority"]:
            if not any(x.get("channel")==platform["channel"] for x in shops):
                expected.append((isbn,platform["search"].replace("{isbn}",isbn),"ISBN 搜索"))
    found=[(row[1].value,row[6].hyperlink.target,row[4].value) for row in records(links)]
    assert Counter(found)==Counter(expected), "Retail targets differ from the catalogue"
    for row in records(links):
        checked=retail.get("checkedByISBN",{}).get(row[1].value,retail["checked"])
        assert row[7].value.date().isoformat()==checked
    review_rows=records(review)
    for box in boxes.values():
        info=next(r for r in review_rows if r[0].value=="套装内容" and r[2].value==box["isbn"])
        assert all(t in info[3].value for t in box["books"])
    for entry in audit["pending"]:
        assert any(r[1].value==entry["title"] and r[3].value==entry["note"] and
                   r[4].hyperlink.target==entry["source"] for r in review_rows)
    assert all(c.data_type!="e" for sheet in computed for row in sheet for c in row)
    print(f"Validated {len(books)} works, {len(editions)} editions, {len(boxes)} sets, "
          f"{len(available)} images, {len(visual_refs)-len(available)} pending covers and "
          f"{len(found)} retail links.")

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook",type=Path)
    parser.add_argument("--previous",type=Path)
    arguments=parser.parse_args()
    validate(arguments.workbook,arguments.previous)
