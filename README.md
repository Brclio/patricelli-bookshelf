# Leslie Patricelli 英文作品书架

[在线书架](https://baby-bookshelf.bornforthis.cn/)收录 44 部作品，附英文封面、中文内容摘要和 61 条购买版本记录。亚马逊、淘宝及其他书店的入口按单本或套装 ISBN 匹配，搜索入口标为「按 ISBN 搜索」。读者可以注册自己的书架账号，登录后分别标记同一个故事的不同开本。购买记录保存在 Cloudflare D1，同一账号可在不同设备上使用。

[迷你本逐册清单](https://baby-bookshelf.bornforthis.cn/#mini) 将书塔 4 册和 Little Library 8 册分别列出，涵盖 10 个不同故事。两种开本和常规本分别使用自己的版本记录；在作品目录或迷你本清单中修改同一册，状态会同步。单册详情区分拆售搜索和按整盒 ISBN 购买的入口。

## 本地运行

安装 Node.js 22 或更新版本。在仓库根目录执行以下命令，Wrangler 会创建独立的本地 SQLite 数据库并启动预览。

```sh
npm ci
npm run build
npx wrangler d1 migrations apply DB --local --config dist/server/wrangler.json
npm run preview
```

打开终端打印的本地地址即可注册测试账号。网页调整后，再次运行 `npm run build` 生成预览资源。

## 维护书目

书名、摘要、ISBN、尺寸和出处在 `catalog/`，封面在 `dist/covers/`。`catalog/retailers.json` 保存按 ISBN 核对的商品页、核对来源和日期。编辑书目后运行以下命令重新生成页面并构建 Worker。渲染脚本使用 Python 3 标准库。

```sh
python3 scripts/render_catalog.py
npm run build
```

浏览器代码在 `dist/`，账号和购买 API 在 `worker/`。数据库结构在 `db/schema.js`。修改结构后运行 `npm run db:generate`，检查新增的 `drizzle/` 迁移并提交。Sites 的托管配置在 `.openai/hosting.json`，发布时通过 `DB` 绑定访问线上数据。

页面视觉基于 Brclio 的设计系统，相关设计沿用 CC BY-NC-SA 4.0。书目数据列有作者及出版社来源。[Brclio Design System](https://github.com/Brclio/brclio-design-system)
