"""Helpers for producing the Excel catalogue. Python dependencies: Pillow, openpyxl."""
import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import quoteattr
from zipfile import ZIP_DEFLATED, ZipFile

def read_state(workbook):
    from openpyxl import load_workbook
    if not workbook.is_file():
        return []
    old = load_workbook(workbook, read_only=True, data_only=False)
    states = []
    for row in list(old["版本购买表"].values)[6:]:
        if row[7] and not str(row[7]).startswith("="):
            states.append([f"{row[5]}/{row[0]}", row[7]])
    if "迷你本逐册清单" in old.sheetnames:
        isbn_col = None
        for row in old["迷你本逐册清单"].values:
            if "整套 ISBN-13" in row:
                isbn_col = row.index("整套 ISBN-13")
            elif isbn_col is not None and str(row[isbn_col]).isdigit() and row[2]:
                states.append([f"{row[isbn_col]}/{row[0]}", row[2]])
    old.close()
    return states

def make_thumbnails(covers, output):
    from PIL import Image
    output.mkdir(parents=True, exist_ok=True)
    sizes = {}
    for path in sorted(covers.glob("*.jpg")):
        if re.fullmatch(r"\d{13}", path.stem) is None:
            continue
        with Image.open(path) as original:
            image = original.convert("RGB")
            image.thumbnail((360, 360), Image.Resampling.LANCZOS)
            image.save(output/path.name, quality=87, optimize=True)
            sizes[path.stem] = image.size
    return sizes

def bind_links(path, links):
    rels_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    main_ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    pkg_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
    temporary = path.with_name(path.name + ".tmp")
    with ZipFile(path) as source, ZipFile(temporary,"w",ZIP_DEFLATED) as target:
        wb = ET.fromstring(source.read("xl/workbook.xml"))
        wb_rels = ET.fromstring(source.read("xl/_rels/workbook.xml.rels"))
        replacements = {}
        ET.register_namespace("",pkg_ns)
        for name, entries in links.items():
            if not entries:
                continue
            sheet = next(s for s in wb.iter(f"{{{main_ns}}}sheet") if s.get("name") == name)
            rel = next(r for r in wb_rels if r.get("Id") == sheet.get(f"{{{rels_ns}}}id"))
            raw = rel.get("Target")
            sheet_part = raw.lstrip("/") if raw.startswith("/") else "xl/" + raw
            rel_part = str(Path(sheet_part).parent/"_rels"/(Path(sheet_part).name+".rels"))
            xml = source.read(sheet_part).decode()
            assert "<x:hyperlinks" not in xml and xml.count("</x:sheetData>") == 1
            relationships = (ET.fromstring(source.read(rel_part)) if rel_part in source.namelist()
                             else ET.Element(f"{{{pkg_ns}}}Relationships"))
            xml_links = []
            for i, row in enumerate(entries):
                ref, url = row["cell"], row["url"]
                assert f'r="{ref}"' in xml and url.startswith("https://")
                key = "rIdRetail"+str(i+1)
                ET.SubElement(relationships,f"{{{pkg_ns}}}Relationship", {
                    "Id":key,"Type":rels_ns+"/hyperlink","Target":url,"TargetMode":"External"})
                xml_links.append(f'<x:hyperlink ref={quoteattr(ref)} r:id={quoteattr(key)}/>')
            next_tag = re.search(r"<x:(?:printOptions|pageMargins|pageSetup|headerFooter|drawing|legacyDrawing|tableParts)\b",xml)
            insert = next_tag.start() if next_tag else xml.index("</x:worksheet>")
            xml=xml[:insert]+'<x:hyperlinks xmlns:r="'+rels_ns+'">'+''.join(xml_links)+"</x:hyperlinks>"+xml[insert:]
            replacements[sheet_part] = xml.encode()
            replacements[rel_part] = ET.tostring(relationships,encoding="utf-8",xml_declaration=True)
        for entry in source.infolist():
            target.writestr(entry, replacements.pop(entry.filename, source.read(entry.filename)))
        for name, content in replacements.items():
            target.writestr(name,content)
    temporary.replace(path)

if __name__=="__main__":
    mode,*args=sys.argv[1:]
    if mode=="states":
        print(json.dumps(read_state(Path(args[0]))))
    elif mode=="thumbs":
        print(json.dumps(make_thumbnails(Path(args[0]),Path(args[1]))))
    elif mode=="links":
        bind_links(Path(args[0]),json.load(sys.stdin))
    else:
        raise SystemExit("expected states, thumbs, or links")
