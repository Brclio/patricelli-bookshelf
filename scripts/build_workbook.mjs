import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const packageName="@oai/artifact-tool";
const library=process.env.WORKBOOK_NODE_MODULES
  ? pathToFileURL(createRequire(import.meta.url).resolve(packageName,{paths:[process.env.WORKBOOK_NODE_MODULES]})).href
  : packageName;
const {Workbook,SpreadsheetFile}=await import(library);

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {values:args} = parseArgs({options:{
  output:{type:"string"}, previous:{type:"string"}, previews:{type:"string"}, python:{type:"string"},
}});
const outputPath = path.resolve(args.output || path.join(repo,"dist/english-board-books.xlsx"));
const python = args.python || process.env.PYTHON || "python3";
const helper = path.join(repo,"scripts/workbook_files.py");
const previousPath = path.resolve(args.previous || outputPath);
const work = args.previews ? path.resolve(args.previews) : await fs.mkdtemp(path.join(os.tmpdir(),"patricelli-workbook-"));
await fs.mkdir(work,{recursive:true});
const previousStates = new Map(JSON.parse(execFileSync(python,[helper,"states",previousPath],{encoding:"utf8"})));
const siteHtml = await fs.readFile(path.join(repo,"dist/index.html"),"utf8");
function pageData(id) {
  const container = siteHtml.match(new RegExp('<script[^>]+id="' + id + '"[^>]*>([\\s\\S]*?)</script>'));
  if (!container) throw Error("Missing website catalogue data: " + id);
  return JSON.parse(container[1]);
}
const siteBooks = new Map(pageData("bookdata").map(book => [book.title, book]));
const siteBoxes = new Map(pageData("boxdata").map(pack => [pack.isbn, pack]));
const singles = new Map([...siteBooks.values()].flatMap(book => book.variants
  .filter(variant => !variant.pack).map(variant => [variant.isbn, variant])));
function editionFor(title, isbn) {
  const variant = siteBooks.get(title)?.variants.find(variant => variant.isbn === isbn);
  if (!variant?.size) throw Error("Missing catalogue dimensions: " + title + " " + isbn);
  return variant;
}
function catalogueSizes(title) {
  return siteBooks.get(title).variants.map(v => v.label + "　" + v.size).join("\n");
}
const synopses = Object.fromEntries([...siteBooks.values()].map(b=>[b.title,{summary:b.summary,source:b.summarySource}]));
const data = [...siteBooks.values()].map(b=>[b.title,b.isbn,b.cn,b.kind,b.tower?"是":"否",b.alias||null,b.summary,
  null,b.series || b.group,b.edition,b.author,b.artist || "分工未详"]);
const workEnd=data.length+6;
const mainRange=(columns)=>columns.replaceAll("{end}",String(workEnd));
if(new Set(data.map(row=>row[1])).size!==data.length || data.some(row=>!row[2] || !row[6])){
  throw Error("Each work needs a unique base-edition ISBN, Chinese title and synopsis.");
}
const wb = Workbook.create();
const sh = wb.worksheets.add("英文原版书目");
sh.showGridLines = false;
sh.tabColor = "#315F58";
const cell = address => sh.getRange(address);
const body = mainRange("A7:M{end}");
cell(mainRange("A1:M{end}")).format.font = {name: "Arial", size: 11, color: "#293733"};
cell(mainRange("A1:M{end}")).format.verticalAlignment = "center";
for(const [i, width] of [327, 185, 205, 325, 136, 155, 512, 122, 161, 145, 231, 148, 130].entries()) {
  const c = String.fromCharCode(65+i);
  cell(`${c}1:${c}${workEnd}`).format.columnWidthPx = width;
}
cell("A1:H1").format.rowHeightPx = 12;
cell("A2").values = [["Leslie Patricelli  ·  英文原版作品书目"]];
cell("A2").format.font = {name:"Arial", size:17, bold:true, color:"#1C4C45"};
cell("A2:H2").format.rowHeightPx = 38;
cell("A2:M2").format.borders = {bottom: {style:"thin", color:"#B7D1C5"}};
cell("A3").values = [[`${data.length} 部英文作品。D 栏按版本列出单册宽 × 高，单位为厘米。详细覆盖范围、套装内容和待核资料见「核查说明」。`]];
cell("A4").values = [["迷你本请在「迷你本逐册清单」登记，其他尺寸在「版本购买表」登记。「封面索引」可查看英文原版封面。"]];
cell("A3:H4").format.rowHeightPx = 23;
cell("A3:H4").format.font = {name:"Arial",size:11,color:"#43544D"};
cell("A5:H5").format.rowHeightPx = 8;
cell("A6:M6").values = [["作品主书名","基准版本 ISBN-13","中文名称","各版本单册尺寸（宽 × 高）","收入图中书塔","英国版异名","中文内容简介","已有版本数","系列／分类","基准版装帧","文字／共同作者","绘图","中文名称依据"]];
cell(mainRange("B7:B{end}")).setNumberFormat("0");
cell(body).values = data.map(row => [row[0],row[1],row[2],catalogueSizes(row[0]),...row.slice(4),row[3]]);
const table = sh.tables.add(mainRange("A6:M{end}"), true, "EnglishWorks");
table.style = "TableStyleLight1";
table.showFilterButton = true;
cell("A6:M6").format = {
  fill: "#315F58",
  font: {name:"Arial",size:11,bold:true,color:"#FFFFFF"},
  verticalAlignment:"center",horizontalAlignment:"center",
  borders:{insideVertical:{style:"thin",color:"#FFFFFF"}}
};
cell("A6:M6").format.rowHeightPx = 36;
cell(body).format.rowHeightPx = 27;
for(let r = 7; r<=workEnd; r++){
  cell(`A${r}:M${r}`).format.fill = r%2===0 ? "#F3F6F3" : "#FFFFFF";
}
cell(mainRange("A7:M{end}")).format.wrapText=true;
cell(mainRange("D7:D{end}")).format.wrapText=true;
cell(mainRange("G7:G{end}")).format.wrapText=true;
for(const [i,row] of data.entries()){
 const lines=Math.ceil([...row[6]].length/31);
 const sizeLines=catalogueSizes(row[0]).split("\n").reduce((n,s)=>n+Math.max(1,Math.ceil([...s].length/22)),0);
 cell(`A${i+7}:M${i+7}`).format.rowHeightPx=Math.max(48,Math.max(lines,sizeLines)*20+10);
}
cell(mainRange("A7:A{end}")).format.font = {name:"Arial",size:11,bold:true,color:"#254D44"};
cell(mainRange("B7:B{end}")).format.horizontalAlignment = "left";
cell(mainRange("E7:E{end}")).format.horizontalAlignment = "center";
cell("E7:E10").format.fill = "#DCEEDD";
cell("E7:E10").format.font = {name:"Arial",size:11,bold:true,color:"#235840"};
cell(mainRange("H7:H{end}")).format.horizontalAlignment = "center";
sh.freezePanes.freezeRows(6);
function source(address, body) {
  wb.notes.add({id: "src-"+address,target:{cell:{sheetId:sh.sheetId,sheetName:sh.name,address}},authorId:"",createdAt:"",body:{plainText:body}});
}
source("A7","英文书名与范围核对　Leslie Patricelli 作者官网 Board Books · https://www.lesliepatricelli.com/board-books\nSpring! 增补依据　https://www.candlewick.com/9781536230031/spring/");
source("E7","书塔四本的出版信息　https://www.walkerbooks.com.au/book/9780763650100/");
source("C7","12 个接力版正式中文书名参照接力出版社和上海新华书店目录。其他行的中文名称为本表参考译名。\nhttps://www.jielibj.com/books?page=39\nhttps://detail.youzan.com/show/goods?alias=3f0aa9mz6m7vvqb&from_source=gbox_seo");
const ukSources = {
  "Binky":"https://obnb.uk/p13125495-dummy",
  "Potty":"https://www.walker.co.uk/9781406328370/on-my-potty/",
  "Mommy":"https://www.walker.co.uk/9781406397970/mummy/",
  "Tubby":"https://assets-us-01.kc-usercontent.com/c47bdf8e-37f3-4353-b63b-5f82ede29bf0/4a1947c1-08cd-4af4-84fd-3b562c4dc58e/Walker2018Backlist%20Cat_2018%20Emailable.pdf",
};
let previousSource = null;
for(const [index, row] of data.entries()) {
  const entry = siteBooks.get(row[0]);
  source("G"+(index+7),"中文简介参考资料\n"+synopses[row[0]].source);
  const isbnSource = entry.link;
  if (isbnSource !== previousSource) source("B"+(index+7),"基准英文实体书 ISBN 书目来源（同一来源的连续记录共用此注）\n"+isbnSource);
  previousSource = isbnSource;
  if(ukSources[row[0]]) source("F"+(index+7),"英国版书名来源　"+ukSources[row[0]]);
}
const editionSheet = wb.worksheets.add("版本购买表");
editionSheet.tabColor="#376368";
editionSheet.showGridLines=false;
const editionEntries = [...siteBooks.values()].flatMap(book=>book.variants.map(v=>{
  const pair=v.size.match(/^(?:约\s*)?(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*cm$/);
  const parent = v.packOnly ? siteBoxes.get(v.packOnly) : undefined;
  if (v.packOnly && !parent) throw Error("Unknown box for "+v.isbn);
  const publication=[v.publisher,v.year ? v.year+" 年" : null,v.pages ? v.pages+" 页" : null].filter(Boolean).join("，");
  const notes=[v.size,v.sizeBasis,publication,v.packageSize ? "外盒（宽 × 高 × 厚）"+v.packageSize : null,
    v.sizeNote, v.pack ? "书号对应整盒" : null, parent ? "此单册随 "+parent.title+" 收录。购买整套请用 "+parent.isbn : null].filter(Boolean);
  const label = v.label.split(" · ")[0];
  return {title:book.title,displayTitle:v.editionTitle || book.title,variant:v.label,isbn:v.isbn,key:v.key,
    w_cm:pair?Number(pair[1]):null,h_cm:pair?Number(pair[2]):null,
    format:v.format || (v.pack ? "纸板书" : label),market:v.market || (v.pack ? "美版" : v.isbn===book.isbn ? "美版" : ""),
    box:v.pack,packOnly:v.packOnly,purchaseIsbn:v.packOnly || v.isbn,cover:v.cover,
    size:v.size,note:notes.join("。"),sources:[...new Set([v.ref,v.packageRef,v.link,parent?.link].filter(Boolean))]};
}));
const compactTitle = new Map(data.map(row=>[row[0],row[2]]));
if(editionEntries.some(e=>!compactTitle.has(e.title)) || new Set(editionEntries.map(e=>e.title+"_"+e.isbn)).size!==editionEntries.length) throw Error("Unmatched title or repeated edition");
const editionCell = address => editionSheet.getRange(address);
const last=editionEntries.length+6;
const requiredSetLinks=[];
const bodyRegion=`A7:M${last}`;
editionCell(`A1:M${last}`).format.font={name:"Arial",size:11,color:"#293733"};
editionCell(`A1:M${last}`).format.verticalAlignment="center";
for(const [index,width] of [305,190,132,132,147,189,120,129,299,438,305,129,187].entries()){
  const c=String.fromCharCode(65+index);
  editionCell(`${c}1:${c}${last}`).format.columnWidthPx=width;
}
editionCell("A1:J1").format.rowHeightPx=12;
editionCell("A2").values=[["英文版本购买表"]];
editionCell("A2").format.font={name:"Arial",size:17,bold:true,color:"#1C4C45"};
editionCell("A2:J2").format.rowHeightPx=38;
editionCell("A2:J2").format.borders={bottom:{style:"thin",color:"#B7D1C5"}};
editionCell("A3").values=[["每种开本单独列出，C、D 栏为单册宽高。买套装专属版本时，请使用 M 栏的实际购买书号。"]];
editionCell("A4").values=[["在黄色栏选择「想买」「已下单」「已有」。迷你本在「迷你本逐册清单」登记，相应状态会显示在此表。"]];
editionCell("A3:J4").format.rowHeightPx=23;
editionCell("A5:J5").format.rowHeightPx=8;
editionCell("A6:M6").values=[["本版英文书名","英文版本","单本宽（cm）","单本高（cm）","装帧","本版／迷你整盒 ISBN-13","ISBN 所指","我的购买状态","所属套装／同名对照","版本说明","对应作品主书名","市场","实际购买 ISBN-13"]];
editionCell(bodyRegion).values=editionEntries.map(e=>[e.displayTitle,e.variant,e.w_cm??"待核",e.h_cm??"待核",e.format,e.isbn,e.box?"整盒":e.packOnly?"套内单册 ISBN":"单本",null,e.box || siteBoxes.get(e.packOnly)?.title || (e.displayTitle!==e.title?compactTitle.get(e.title)+" · 美版 "+e.title:null),e.note,e.title,e.market || null,e.purchaseIsbn]);
editionCell(`C7:D${last}`).setNumberFormat("0.0");
editionCell(`F7:F${last}`).setNumberFormat("0");
editionCell(`M7:M${last}`).setNumberFormat("0");
const versionTable=editionSheet.tables.add(`A6:M${last}`,true,"EditionBuying");
versionTable.style="TableStyleLight1";
versionTable.showFilterButton=true;
editionCell("A6:M6").format={fill:"#315F58",font:{name:"Arial",size:11,bold:true,color:"#FFFFFF"},verticalAlignment:"center",horizontalAlignment:"center",borders:{insideVertical:{style:"thin",color:"#FFFFFF"}}};
editionCell("A6:M6").format.rowHeightPx=36;
editionCell(bodyRegion).format.wrapText=true;
editionCell(bodyRegion).format.rowHeightPx=38;
for(const [i,e] of editionEntries.entries()){
  const r=i+7;
  editionCell(`A${r}:M${r}`).format.fill=i%2?"#F2F5F2":"#FFFFFF";
  if(e.packOnly) {
    editionCell("M"+r).format.font={name:"Arial",size:11,bold:true,color:"#1B5E89",underline:"single"};
    requiredSetLinks.push({cell:"M"+r,url:siteBoxes.get(e.packOnly).link});
  }
  if(e.note)editionCell(`A${r}:M${r}`).format.rowHeightPx=Math.max(38,Math.ceil([...e.note].length/27)*18+9);
  if(e.sources?.length){
    const address="F"+r;
    wb.notes.add({id:"edition-src-"+address,target:{cell:{sheetId:editionSheet.sheetId,sheetName:editionSheet.name,address}},authorId:"",createdAt:"",body:{plainText:"英文实体版书号与尺寸核对资料\n"+e.sources.join("\n")}});
  }
}
editionCell(`A7:A${last}`).format.font={name:"Arial",size:11,bold:true,color:"#254D44"};
editionCell(`F7:F${last}`).format.horizontalAlignment="left";
const purchaseValidation={rule:{type:"list",values:["想买","已下单","已有"]}};
for(const [index,edition] of editionEntries.entries()){
  if(!edition.box){
    const input=editionCell("H"+(index+7));
    input.format.fill="#FFF5D9";
    input.dataValidation=purchaseValidation;
  }
}
editionSheet.freezePanes.freezeRows(6);
for(let r=7;r<=workEnd;r++) cell("H"+r).formulas=[[`=COUNTIFS('版本购买表'!$K$7:$K$${last},A${r},'版本购买表'!$H$7:$H$${last},"已有")`]];
const gallery = wb.worksheets.add("封面索引");
gallery.showGridLines=false;
gallery.tabColor="#8BAE9D";
const galleryCell = address => gallery.getRange(address);
const thumbDir=path.join(work,"thumbs");
const dimensions=JSON.parse(execFileSync(python,[helper,"thumbs",path.join(repo,"dist/covers"),thumbDir],{encoding:"utf8"}));
const bases=data.map(row=>row[1]);
const basicSet = new Set(bases);
const booksByISBN = new Map(data.map(row=>[row[1],siteBooks.get(row[0])]));
const altEntries = editionEntries.filter(e=>!e.box && !basicSet.has(e.isbn));
const galleryEntries=[
  ...data.map(row=>({title:row[0],isbn:row[1],cover:booksByISBN.get(row[1]).variants[0].cover})),
  ...altEntries.map(e=>({title:e.displayTitle===e.title?e.title+" · "+e.format:e.displayTitle,isbn:e.isbn,cover:e.cover})),
  ...[...siteBoxes.values()].map(box=>({title:box.title+" · 整套",isbn:box.isbn,cover:box.isbn}))
];
if (new Set(galleryEntries.map(x=>x.isbn)).size!==galleryEntries.length) throw Error("Duplicate gallery ISBN");
const galleryHeading=4+4*Math.ceil(bases.length/4)+1;
const galleryAltStart=galleryHeading+2;
const galleryEnd=galleryAltStart+4*Math.ceil((galleryEntries.length-bases.length)/4)-1;
galleryCell(`A1:D${galleryEnd}`).format.font={name:"Arial",size:11,color:"#27433B"};
galleryCell(`A1:D${galleryEnd}`).format.columnWidthPx=247;
galleryCell("A1:D1").format.rowHeightPx=12;
galleryCell("A2").values=[[`${data.length} 部作品的英文原版封面`]];
galleryCell("A2").format.font={name:"Arial",size:17,bold:true,color:"#1C4C45"};
galleryCell("A2:D2").format.rowHeightPx=36;
galleryCell("A3").values=[["先列每部作品的基准版，其后是其他开本及整套封面。图片对应标签下的英文书号。"]];
galleryCell("A3:D3").format.rowHeightPx=25;
galleryCell("A"+galleryHeading).values=[["其他英文版本与整套封面"]];
galleryCell("A"+galleryHeading).format.font={name:"Arial",size:17,bold:true,color:"#1C4C45"};
galleryCell("A"+galleryHeading+":D"+galleryHeading).format.rowHeightPx=36;
galleryCell("A"+(galleryHeading+1)).values=[["封面待核的版本保留书号和尺寸。套装专属版本的购书号见「版本购买表」。"]];
galleryCell("A"+(galleryHeading+1)+":D"+(galleryHeading+1)).format.rowHeightPx=25;
const galleryRowHeights=new Map();
for (const [i,item] of galleryEntries.entries()){
  const {title,isbn,cover}=item;
  const sectionOffset = i < bases.length ? i : i-bases.length;
  const col=sectionOffset % 4;
  const letter=String.fromCharCode(65+col);
  const row=(i < bases.length ? 4 : galleryAltStart) + 4*Math.floor(sectionOffset/4);
  galleryCell(`A${row}:D${row}`).format.rowHeightPx=153;
  galleryCell(`A${row+1}:D${row+1}`).format.rowHeightPx=48;
  galleryCell(`A${row+2}:D${row+2}`).format.rowHeightPx=22;
  galleryCell(`A${row}:D${row}`).format.fill="#F5F6F0";
  galleryCell(`${letter}${row+1}`).values=[[title]];
  galleryCell(`${letter}${row+1}`).format={font:{name:"Arial",size:11,bold:true,color:"#254D44"},horizontalAlignment:"center",verticalAlignment:"center",wrapText:true};
  galleryCell(`${letter}${row+2}`).values=[[isbn]];
  galleryCell(`${letter}${row+2}`).setNumberFormat("0");
  galleryCell(`${letter}${row+2}`).format.horizontalAlignment="center";
  const pack=siteBoxes.get(isbn);
  const size=pack ? "套内单册　"+pack.singleSize : "宽 × 高　"+singles.get(isbn).size;
  const height=Math.max(galleryRowHeights.get(row)||25,Math.ceil([...size].length/17)*18+10);
  galleryRowHeights.set(row,height);
  galleryCell(`A${row+3}:D${row+3}`).format.rowHeightPx=height;
  galleryCell(`${letter}${row+3}`).values=[[size]];
  galleryCell(`${letter}${row+3}`).format={font:{name:"Arial",size:10,color:"#47604F"},horizontalAlignment:"center",verticalAlignment:"center",wrapText:true};
  if (!cover || !dimensions[isbn]) {
    galleryCell(`${letter}${row}`).values=[["封面待核"]];
    galleryCell(`${letter}${row}`).format={fill:"#F5F3EB",font:{name:"Arial",italic:true,color:"#6B7062"},horizontalAlignment:"center",verticalAlignment:"center"};
    continue;
  }
  if(cover!==isbn) throw Error("Incorrect edition cover for ISBN "+isbn);
  const [imgW,imgH]=dimensions[isbn];
  const scale=Math.min(177/imgW,139/imgH);
  const w=Math.round(imgW*scale),h=Math.round(imgH*scale);
  const bytes=await fs.readFile(path.join(thumbDir,isbn+".jpg"));
  gallery.images.add({dataUrl:"data:image/jpeg;base64,"+bytes.toString("base64"),anchor:{from:{row:row-1,col,rowOffsetPx:Math.round((153-h)/2),colOffsetPx:Math.round((247-w)/2)},extent:{widthPx:w,heightPx:h}}});
}
const retail=pageData("retaildata");
const titlesByISBN=new Map(editionEntries.filter(e=>!e.box).map(e=>[e.isbn,{title:e.displayTitle,edition:e.variant,packOnly:e.packOnly}]));
for (const box of siteBoxes.values()) titlesByISBN.set(box.isbn,{title:box.title,edition:`整套（${box.books.length} 册）`});
if (titlesByISBN.size!==Object.keys(retail.products).length) throw Error("Retail ISBNs differ from the edition and box catalogue.");
const retailRows=[];
function addRetail(isbn,b,platform,url,type,stock,source) {
  const reviewed=retail.checkedByISBN?.[isbn] || retail.checked;
  const checkedDateSerial=Date.parse(reviewed+"T00:00:00Z")/86400000+25569;
  if(!url.startsWith("https://") || !Number.isInteger(checkedDateSerial)) throw Error("Invalid workbook retailer link or date: "+url);
  retailRows.push({title:b.title,isbn,edition:b.edition,platform,type,stock,url,source:source||null,checkedDateSerial});
}
for (const [isbn,b] of titlesByISBN) {
  if(b.packOnly) continue;
  const links=retail.products[isbn];
  if(!Array.isArray(links)) throw Error("Missing retail input for "+isbn);
  for(const target of retail.priority) {
    const direct=links.filter(v=>v.channel===target.channel);
    if(direct.length) {
      for(const link of direct) addRetail(isbn,b,link.platform,link.url,"商品详情页",link.stock||"需在店内确认",link.source);
    } else {
      addRetail(isbn,b,target.label,target.search.replace("{isbn}",isbn),"ISBN 搜索","需在搜索结果中确认");
    }
  }
  for(const link of links.filter(v=>!retail.priority.some(t=>t.channel===v.channel))) {
    addRetail(isbn,b,link.platform,link.url,link.kind==="search"?"ISBN 搜索":"商品详情页",link.stock||"需在店内确认",link.source);
  }
}
const retailSheet = wb.worksheets.add("购买链接");
retailSheet.showGridLines=false;
retailSheet.tabColor="#315F58";
const rc=address=>retailSheet.getRange(address);
const retailLast = 6+retailRows.length;
rc(`A1:H${retailLast}`).format.font={name:"Arial",size:11,color:"#293733"};
rc(`A1:H${retailLast}`).format.verticalAlignment="center";
for(const [i,width] of [285,165,158,150,132,174,157,121].entries()){
  const c=String.fromCharCode(65+i);
  rc(`${c}1:${c}${retailLast}`).format.columnWidthPx=width;
}
rc("A1:H1").format.rowHeightPx=12;
rc("A2").values=[["英文原版购买链接"]];
rc("A2").format.font={name:"Arial",size:17,bold:true,color:"#1C4C45"};
rc("A2:H2").format.rowHeightPx=38;
rc("A2:H2").format.borders={bottom:{style:"thin",color:"#B7D1C5"}};
rc("A3").values=[[`${titlesByISBN.size} 个单本或套装书号 · ${retailRows.filter(r=>r.type==="商品详情页").length} 个商品页 · ${retailRows.filter(r=>r.type==="ISBN 搜索").length} 个按书号搜索的入口`]];
rc("A4").values=[["可按书号、平台或页面类型筛选。点击「打开页面」中的链接查看商品。搜索结果及实时库存请在店内确认。"]];
rc("A3:H4").format.rowHeightPx=23;
rc("A3:H4").format.font={name:"Arial",size:11,color:"#43544D"};
rc("A5:H5").format.rowHeightPx=8;
rc("A6:H6").values=[["英文书名／套装名称","购买 ISBN-13","版本／单册宽 × 高","平台／书店","页面类型","库存说明","打开页面","核对日期"]];
function retailEditionLabel(row) {
  const pack=siteBoxes.get(row.isbn);
  return row.edition+"\n"+(pack ? "套内单册："+pack.singleSize : singles.get(row.isbn).size);
}
rc(`A7:H${retailLast}`).values=retailRows.map(r=>[r.title,r.isbn,retailEditionLabel(r),r.platform,r.type,r.stock,null,r.checkedDateSerial]);
// Values are still stored as 13-character string identifiers. The zero-format
// keeps the artifact renderer from switching long numeric-looking text to E+12.
rc(`B7:B${retailLast}`).setNumberFormat("0");
rc(`H7:H${retailLast}`).setNumberFormat("yyyy-mm-dd");
rc(`G7:G${retailLast}`).values=retailRows.map(r=>[r.type==="商品详情页"?"打开商品页 ↗":"按 ISBN 搜索 ↗"]);
const retailTable=retailSheet.tables.add(`A6:H${retailLast}`,true,"RetailOffers");
retailTable.style="TableStyleLight1";
retailTable.showFilterButton=true;
rc("A6:H6").format={fill:"#315F58",font:{name:"Arial",size:11,bold:true,color:"#FFFFFF"},verticalAlignment:"center",horizontalAlignment:"center",borders:{insideVertical:{style:"thin",color:"#FFFFFF"}}};
rc("A6:H6").format.rowHeightPx=36;
rc(`C1:C${retailLast}`).format.columnWidthPx=244;
rc(`A7:H${retailLast}`).format.wrapText=true;
for(const [i,r] of retailRows.entries()){
  const n=i+7;
  rc(`A${n}:H${n}`).format.fill=i%2?"#F3F6F3":"#FFFFFF";
  rc(`A${n}:H${n}`).format.rowHeightPx=Math.max(44,r.title.length>38?48:0,(1+Math.ceil([...retailEditionLabel(r).split("\n")[1]].length/17))*19+6);
  if(r.type==="ISBN 搜索") rc("E"+n).format.fill="#FFF5D9";
  if(r.source && r.source!==r.url) {
    const address="G"+n;
    wb.notes.add({id:"retailer-"+n,target:{cell:{sheetId:retailSheet.sheetId,sheetName:retailSheet.name,address}},authorId:"",createdAt:"",body:{plainText:"商品与书号核对来源\n"+r.source}});
  }
}
rc(`A7:A${retailLast}`).format.font={name:"Arial",size:11,bold:true,color:"#254D44"};
rc(`G7:G${retailLast}`).format.font={name:"Arial",size:11,bold:true,color:"#1B5E89",underline:"single"};
rc(`B7:B${retailLast}`).format.horizontalAlignment="left";
retailSheet.freezePanes.freezeRows(6);
const miniSheet=wb.worksheets.add("迷你本逐册清单");
miniSheet.showGridLines=false;
miniSheet.tabColor="#C58436";
const mc=address=>miniSheet.getRange(address);
const miniPacks=[...siteBoxes.values()].filter(pack=>
  editionEntries.some(edition=>edition.box && edition.isbn===pack.isbn)
);
const repeated=new Set(miniPacks[0].books.filter(title=>miniPacks[1].books.includes(title)));
const miniRows=new Map();
const miniLinks=[];
mc("A1:I24").format.font={name:"Arial",size:11,color:"#293733"};
mc("A1:I24").format.verticalAlignment="center";
for (const [i,width] of [238,166,132,196,173,157,146,146,435].entries()) {
  const c=String.fromCharCode(65+i);
  mc(c+"1:"+c+"24").format.columnWidthPx=width;
}
mc("A1:H1").format.rowHeightPx=12;
mc("A2").values=[["迷你本逐册购买清单"]];
mc("A2").format.font={name:"Arial",size:17,bold:true,color:"#1C4C45"};
mc("A2:H2").format.rowHeightPx=38;
mc("A2:H2").format.borders={bottom:{style:"thin",color:"#B7D1C5"}};
mc("A3").values=[["两套共 12 册、10 个故事。Quiet Loud 和 Yummy Yucky 各有两个开本。"]];
mc("A4").values=[["每册在黄色栏单独登记。购买入口和 ISBN 指向整套。"]];
mc("A3:H4").format.rowHeightPx=24;
mc("A5:H5").format.rowHeightPx=8;
const miniHeaders=["英文书名","中文名称","我的购买状态","单册尺寸（宽 × 高）","其他套装也收录","整套 ISBN-13","亚马逊美国","淘宝","中文内容简介"];
for (const [i,pack] of miniPacks.entries()) {
  const heading=i===0?6:14;
  const header=heading+2, first=header+1, end=first+pack.books.length-1;
  const title=i===0?"书塔迷你本（4 册）":"Little Library 小开本（8 册）";
  mc("A"+heading).values=[[title+"     "+pack.title]];
  mc("A"+heading+":I"+heading).format.fill=i===0?"#E4F0E8":"#E0EDEF";
  mc("A"+heading+":I"+heading).format.rowHeightPx=31;
  mc("A"+heading).format.font={name:"Arial",size:13,bold:true,color:"#285349"};
  const sample=editionFor(pack.books[0],pack.isbn);
  mc("A"+(heading+1)).values=[[sample.packageSize ? "外盒尺寸（宽 × 高 × 厚）　"+sample.packageSize : ("套内单册　"+pack.singleSize)]];
  mc("A"+(heading+1)+":I"+(heading+1)).format.rowHeightPx=24;
  mc("A"+header+":I"+header).values=[miniHeaders];
  const table=miniSheet.tables.add("A"+header+":I"+end,true,i===0?"MiniTower":"LittleLibraryBooks");
  table.style="TableStyleLight1";
  table.showFilterButton=true;
  mc("A"+header+":I"+header).format={fill:"#315F58",font:{name:"Arial",size:11,bold:true,color:"#FFFFFF"},verticalAlignment:"center",horizontalAlignment:"center"};
  mc("A"+header+":I"+header).format.rowHeightPx=35;
  const preferred=retail.priority.map(platform=>{
    const direct=retail.products[pack.isbn].find(link=>link.channel===platform.channel);
    return direct?{label:"整套商品页",url:direct.url}:{label:"按整套书号搜索",url:platform.search.replace("{isbn}",pack.isbn)};
  });
  for(const [bookIndex,book] of pack.books.entries()){
    const row=first+bookIndex;
    const editionIndex=editionEntries.findIndex(entry=>entry.isbn===pack.isbn && entry.title===book);
    if(editionIndex<0) throw Error("Missing mini edition: "+book);
    const er=editionIndex+7;
    miniRows.set(pack.isbn+"/"+book,{row,er});
    mc("A"+row+":I"+row).values=[[book,compactTitle.get(book),null,editionEntries[editionIndex].size,repeated.has(book)?(i===0?"Little Library":"Baby’s Book Tower"):"",pack.isbn,preferred[0].label,preferred[1].label,synopses[book].summary]];
    const region=mc("A"+row+":I"+row);
    region.format.fill=bookIndex%2?"#F3F6F3":"#FFFFFF";
    region.format.rowHeightPx=Math.max(52,Math.ceil([...synopses[book].summary].length/26)*21+7);
    region.format.wrapText=true;
    mc("A"+row).format.font={name:"Arial",size:11,bold:true,color:"#254D44"};
    mc("C"+row).format.fill="#FFF5D9";
    mc("F"+row).setNumberFormat("0");
    mc("F"+row).format.horizontalAlignment="left";
    mc("G"+row+":H"+row).format.font={name:"Arial",size:11,bold:true,color:"#1B5E89",underline:"single"};
    preferred.forEach((link,at)=>miniLinks.push({cell:(at===0?"G":"H")+row,url:link.url}));
    // Use the title within its own pack so filtering or sorting either table
    // keeps every acquisition state associated with the intended edition.
    editionCell("H"+er).formulas=[["=T(INDEX('迷你本逐册清单'!$C$"+first+":$C$"+end+",MATCH(A"+er+",'迷你本逐册清单'!$A$"+first+":$A$"+end+",0)))"]];
  }
  mc("C"+first+":C"+end).dataValidation=purchaseValidation;
}
if(miniRows.size!==12||repeated.size!==2) throw Error("Incomplete mini list");
miniSheet.freezePanes.freezeRows(4);
// Confirm ownership is independent for two sizes of the same story and flows
// from the mini worksheet through the edition view to the catalogue totals.
const towerYummy=miniRows.get("9780763650100/Yummy Yucky");
const libraryYummy=miniRows.get("9781536218794/Yummy Yucky");
const yummyTotal=cell("H"+(data.findIndex(row=>row[0]==="Yummy Yucky")+7));
mc("C"+towerYummy.row).values=[["已有"]];
mc("C"+libraryYummy.row).values=[["已下单"]];
wb.recalculate();
if(editionCell("H"+towerYummy.er).values[0][0]!=="已有" || editionCell("H"+libraryYummy.er).values[0][0]!=="已下单" || yummyTotal.values[0][0]!==1) throw Error("Mini marking did not update independent size states");
mc("C"+towerYummy.row).clear({applyTo:"contents"});
mc("C"+libraryYummy.row).clear({applyTo:"contents"});
wb.recalculate();
const ownedTest=editionEntries.findIndex(e=>e.title===data[0][0])+7;
const editStatus=editionCell("H"+ownedTest);
editStatus.values=[["已有"]];
wb.recalculate();
if(cell("H7").values[0][0]!==1)throw Error("Purchase state does not flow into title catalogue");
editStatus.clear({applyTo:"contents"});
wb.recalculate();
if(cell("H7").values[0][0]!==0)throw Error("Clearing status did not reset purchase count");
const workRecord = siteBooks.get("Tubby");
const usBathIndex=editionEntries.findIndex(entry=>entry.isbn===workRecord.isbn);
const ukBathIndex=editionEntries.findIndex(entry=>entry.title===workRecord.title && entry.displayTitle==="In the Bath");
if (ukBathIndex<0 || usBathIndex<0) throw Error("Missing US or UK bath edition");
const ukPurchase=editionCell("H"+(ukBathIndex+7));
const workTotal=cell("H"+(data.findIndex(row=>row[0]===workRecord.title)+7));
ukPurchase.values=[["已有"]];
wb.recalculate();
if (workTotal.values[0][0]!==1 || editionCell("H"+(usBathIndex+7)).values[0][0]) throw Error("UK ownership should affect only its ISBN");
ukPurchase.clear({applyTo:"contents"});
for (const [index,e] of editionEntries.entries()) {
  const key=e.isbn+"/"+e.title;
  const previous=previousStates.get(e.isbn+"/"+e.displayTitle) || previousStates.get(key);
  if (!previous) continue;
  const status=e.box?mc("C"+miniRows.get(key).row):editionCell("H"+(index+7));
  status.values=[[previous]];
}
wb.recalculate();
for (const [area,tag] of [["A1:H20","main"],["F6:J20","notes"],[`A${last-8}:J${last}`,"tail"],[`A${ukBathIndex+6}:K${ukBathIndex+7}`,"bath"]]) {
  const p=await wb.render({sheetName:editionSheet.name,range:area,scale:.9,format:"png"});
  await fs.writeFile(path.join(work,"edition-"+tag+".png"),new Uint8Array(await p.arrayBuffer()));
}
for (const [where,label] of [["A1:H16","top"],["A34:G50","bottom"],["H34:L50","credits"]]) {
  const pic = await wb.render({sheetName:sh.name,range:where,scale:1.2,format:"png"});
  await fs.writeFile(path.join(work, "catalog-"+label+".png"),new Uint8Array(await pic.arrayBuffer()));
}
for(const [start,end] of [[1,15],[16,31],[32,47],[galleryHeading,Math.min(galleryHeading+13,galleryEnd)]]) {
  const pic=await wb.render({sheetName:gallery.name,range:`A${start}:D${end}`,scale:.85,format:"png"});
  await fs.writeFile(path.join(work,`gallery-${start}.png`),new Uint8Array(await pic.arrayBuffer()));
}
const audit=pageData("auditdata");
const auditSheet=wb.worksheets.add("核查说明");
auditSheet.showGridLines=false;
auditSheet.tabColor="#527F80";
const ac=address=>auditSheet.getRange(address);
const auditRows=[];
const auditLinks=[];
function record(kind,title,isbn,detail,url) {
  auditRows.push([kind,title,isbn || null,detail,url ? "查看资料 ↗" : null]);
  if(url) auditLinks.push({cell:"E"+(6+auditRows.length),url});
}
record("书目范围","纳入范围",null,Array.isArray(audit.scope)?audit.scope.join("。"):audit.scope);
record("书目范围","作品与版本",null,`按故事计 ${siteBooks.size} 部。可分别标记 ${editionEntries.length} 个版本；${siteBoxes.size} 套合售／盒装按整套书号列出。`);
const missingCovers=galleryEntries.filter(x=>!x.cover || !dimensions[x.isbn]);
const missingDimensions=editionEntries.filter(e=>e.w_cm===null || e.h_cm===null);
record("书目范围","单册尺寸与封面",null,`单册尺寸待核实的版本有 ${missingDimensions.length} 个；封面待核的商品书号有 ${missingCovers.length} 个。单册的宽、高使用厘米，外盒规格在各自的说明里列出。`);
for (const entry of audit.pending || []) record("待核记录",entry.title,entry.isbn,entry.note,entry.source);
for (const item of missingCovers) {
  const edition=editionEntries.find(e=>e.isbn===item.isbn);
  record("封面待核",item.title,item.isbn,"封面索引保留了此书号的位置。",edition?.sources[0]);
}
for (const e of editionEntries.filter(e=>e.packOnly)){
  const pack=siteBoxes.get(e.packOnly);
  record("套内单册",e.displayTitle,e.isbn,"单册登记书号 "+e.isbn+"；购买整套 "+pack.title+" 使用书号 "+pack.isbn+"，可在「购买链接」按整套书号筛选。",pack.link);
}
for(const box of siteBoxes.values()) record("套装内容",box.title,box.isbn,`${box.books.length} 册：${box.books.join("、")}。套内尺寸：${box.singleSize}`,box.link);
for (const e of audit.additions || []) record("此次新增版本",e.title,e.isbn,"对应作品："+e.work,e.source);
for (const [label,url] of audit.sources || []) record("核查来源",label,null,"本次核查涉及的目录或出版资料。",url);
const auditEnd=6+auditRows.length;
ac(`A1:E${auditEnd}`).format.font={name:"Arial",size:11,color:"#293733"};
ac(`A1:E${auditEnd}`).format.verticalAlignment="center";
for (const [i,width] of [148,302,185,636,140].entries()) {
    const c=String.fromCharCode(65+i);ac(c+"1:"+c+auditEnd).format.columnWidthPx=width;
}
ac("A2").values=[["英文书目核查说明"]];
ac("A2").format.font={name:"Arial",size:17,bold:true,color:"#1C4C45"};
ac("A2:E2").format.rowHeightPx=36;
ac("A2:E2").format.borders={bottom:{style:"thin",color:"#B7D1C5"}};
ac("A3").values=[["目录核查日期　"+audit.date]];
ac("A3:E3").format.rowHeightPx=26;
ac("A6:E6").values=[["项目","作品／主题","ISBN-13","具体说明","资料来源"]];
const reportTable=auditSheet.tables.add(`A6:E${auditEnd}`,true,"CatalogueReview");
reportTable.style="TableStyleLight1";
reportTable.showFilterButton=true;
ac("A6:E6").format={fill:"#315F58",font:{name:"Arial",size:11,bold:true,color:"#FFFFFF"},verticalAlignment:"center",horizontalAlignment:"center"};
ac("A6:E6").format.rowHeightPx=32;
ac(`A7:E${auditEnd}`).values=auditRows;
ac(`A7:E${auditEnd}`).format.wrapText=true;
ac(`C7:C${auditEnd}`).setNumberFormat("0");
for(const [i,item] of auditRows.entries()){
  const n=i+7;
  ac("A"+n+":E"+n).format.fill=i%2?"#F2F5F2":"#FFFFFF";
  ac("A"+n+":E"+n).format.rowHeightPx=Math.max(38,Math.ceil([...item[3]].length/40)*19+10,Math.ceil([...item[1]].length/25)*19+10);
  if(item[4])ac("E"+n).format.font={name:"Arial",size:11,bold:true,color:"#1B5E89",underline:"single"};
}
auditSheet.freezePanes.freezeRows(6);
const auditPreview=await wb.render({sheetName:auditSheet.name,range:"A1:E13",scale:.8,format:"png"});
await fs.writeFile(path.join(work,"catalog-audit.png"),new Uint8Array(await auditPreview.arrayBuffer()));
const checked = await wb.inspect({kind:"table",range:"'英文原版书目'!A6:L50",tableMaxRows:3,tableMaxCols:8,maxChars:700});
console.log(checked.ndjson);
const miniPreview=await wb.render({sheetName:miniSheet.name,range:"A1:I24",scale:1,format:"png"});
await fs.writeFile(path.join(work,"mini-buying.png"),new Uint8Array(await miniPreview.arrayBuffer()));
const miniCheck=await wb.inspect({kind:"table",range:"'迷你本逐册清单'!A8:H12",tableMaxRows:3,tableMaxCols:5,maxChars:750});
console.log(miniCheck.ndjson);
const retailPreview=await wb.render({sheetName:retailSheet.name,range:"A1:H16",scale:1,format:"png"});
await fs.writeFile(path.join(work,"retail-links-top.png"),new Uint8Array(await retailPreview.arrayBuffer()));
console.log("Retail", retailRows.length, rc("G7").values);
const file = await SpreadsheetFile.exportXlsx(wb);
await fs.mkdir(path.dirname(outputPath),{recursive:true});
await file.save(outputPath);
execFileSync(python,[helper,"links",outputPath],{
  input:JSON.stringify({"购买链接":retailRows.map((r,i)=>({cell:"G"+(i+7),url:r.url})),"迷你本逐册清单":miniLinks,"核查说明":auditLinks,"版本购买表":requiredSetLinks}),stdio:["pipe","inherit","inherit"],
});
console.log(data.length, "works;", editionEntries.length, "editions;", siteBoxes.size, "boxes;", retailRows.length, "buying links.", outputPath);
if (!args.previews) await fs.rm(work,{recursive:true,force:true});
