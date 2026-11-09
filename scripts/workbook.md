# 重新生成英文书目 Excel

运行环境需要 Node.js 22 或更新版本、可导入的 `@oai/artifact-tool`，以及安装 Pillow 和 openpyxl 的 Python 3。Codex 的工作区依赖运行时包含这些库。也可将 `WORKBOOK_NODE_MODULES` 设为该运行时的 Node 模块目录，将 `PYTHON` 指向其中的 Python 可执行文件。

在仓库根目录运行以下命令。`render_catalog.py` 将书目、套装、购买链接和核查结论写入网页。`build_workbook.mjs` 从同一份网页及 `dist/covers/` 的图片制作 Excel。

```sh
python3 scripts/render_catalog.py
node scripts/build_workbook.mjs
python3 scripts/check_workbook.py dist/english-board-books.xlsx
```

生成器默认从现有的 `dist/english-board-books.xlsx` 读取购买状态，将新版本写到同一位置。用 `--previous` 指定原始清单，`--output` 指定另存位置，`--previews` 指定留存校样图的位置。购买状态只从已有的 Excel 读取。发布用的 Excel 应以公开模板为输入，读者可用自己的副本另行导出。

```sh
node scripts/build_workbook.mjs --previous my-books.xlsx --output updated-books.xlsx
python3 scripts/check_workbook.py updated-books.xlsx --previous my-books.xlsx
```

版本表按真实单册或套装书号保存购买状态。封面索引直接读取对应书号的本地图像。套装专属单册分别列出书内 ISBN 和实际购买用的整盒 ISBN。核查说明页包含套内书目、已核实的新版本和有待确认的资料。
