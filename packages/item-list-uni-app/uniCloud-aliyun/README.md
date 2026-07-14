# uniCloud 阿里云后端

家庭物品清单后端，从 Cloudflare Workers (Hono + D1) 迁移而来。单云函数 `item-list-api` 跑 Hono，URL 化后作为 HTTP API 对外。

## 目录结构

```
uniCloud-aliyun/
  cloudfunctions/item-list-api/
    index.js     # 入口: Web API polyfill + uniCloud event ↔ Hono Request/Response 适配层
    app.js       # Hono app + 全部路由 (~20 个)
    db.js        # 云数据库访问层 + 视图聚合 (替代 D1 视图)
    helpers.js   # 输入解析 / 行映射 / 存在性校验 / 使用量统计
    ocr.js       # 百度 OCR + OpenAI/DeepSeek AI 集成
    utils.js     # 纯工具 (日期 / 数值 / 标签归一化)
    package.json # 依赖: hono 4.11.1
    config.json  # 云函数内存 / 超时
  database/
    *.schema.json       # 6 个集合 schema
    *.init_data.json    # 初始数据 (base_options.init_data.json = 22 条种子, 文档数组; 其余集合无种子)
```

## 一次性配置

1. [uniCloud 控制台](https://unicloud.dcloud.net.cn/) → 创建「阿里云」服务空间（个人免费版）。
2. HBuilderX 打开 `packages/item-list-uni-app`，`manifest.json` 关联该服务空间。

## 部署数据库

`database` 目录下两类文件：`集合名.schema.json`（结构）和 `集合名.init_data.json`（初始数据，文档数组）。旧的单文件 `db_init.json` 已废弃；不需要单独的 index 文件。

1. 右键 `uniCloud-aliyun/database` → **上传 DB Schema**（创建 6 个集合并应用 schema）。
2. 右键 `uniCloud-aliyun/database` → **初始化云数据库**（按 `base_options.init_data.json` 导入 22 条 base_options 种子；其余集合无种子，保持空）。

## 部署云函数

1. 右键 `uniCloud-aliyun/cloudfunctions/item-list-api` → **上传部署**（首次按 `package.json` 装 hono）。
2. 云函数详情 → **环境变量**，配置：
   - `BAIDU_OCR_API_KEY` / `BAIDU_OCR_SECRET_KEY`
   - `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`
   - （可选）`BAIDU_OCR_RECEIPT_API_URL`
3. 云函数详情 → **URL 化** → 开启，记录域名（形如 `https://xxx.next.bspapp.com/item-list-api`）。
4. 用浏览器访问 `https://<域名>/api/health`，应返回 `{"data":{"status":"ok",...}}`。

## 前端配置

1. `packages/item-list-uni-app/.env`（复制 `.env.example`）：
   ```
   VITE_API_BASE_URL=https://xxx.next.bspapp.com/item-list-api
   ```
2. H5：`npm run dev:uni` 验证全部页面。
3. 微信小程序：微信公众平台 → 开发管理 → 服务器域名，把 URL 化域名加入「request 合法域名」和「uploadFile 合法域名」；`npm run dev:mp-weixin`，微信开发者工具导入 `dist/dev/mp-weixin`。

## 实测验证点（URL 化 event 格式可能需微调）

- **`index.js` 适配层**：`event.path` / `queryStringParameters` / `body` / `isBase64Encoded` 字段以 uniCloud 阿里云 URL 化实际为准。若 `/api/health` 不通，先在云函数日志看 event 结构，调整 `normalizePath` 与参数读取。
- **multipart 图片上传**：OCR 路由依赖 Node 18 全局 `Request.formData()` + `index.js` 顶部 polyfill 的 `File`。若图片上传失败，检查 `event.body` 是否 base64 编码、`event.headers.content-type` 是否带 boundary。
- **云数据库 `_.in` / aggregate**：阿里云版写法与文档一致即可；`db.js` 已用 `db.command`。

## 架构要点

- **保留 Hono**：原 Cloudflare Worker 的 ~3000 行 Hono 代码迁移成 CJS，路由/helper/mapper/错误处理/FEFO 分配逻辑原样保留，只换数据访问层与 secrets 来源。
- **NoSQL 替代 SQLite**：6 个表 → 6 个集合（字段保留 snake_case，`is_active` 改为 bool）。2 个 SQL 视图（`batch_inventory_view` / `item_inventory_view`）改为 `db.js` 的运行时聚合 `getBatchInventory` / `getItemInventory`。
- **强一致**：uniCloud 无 D1 session 概念，读写均走主节点；多文档写入（如 stock/in 的 batch+movement）用顺序 `await`，2 人自用量级下一致性足够。
- **secrets**：从 `process.env` 读取（云函数环境变量），替代 Cloudflare 的 `c.env`。

## 与 Cloudflare 版并存

`packages/react-item-list-manage` 的 Cloudflare Worker 后端未删除，可继续作为 React H5 前端的后端，或逐步废弃。两套后端 API 形状一致（同一套 Hono 路由），前端切后端只需改 `VITE_API_BASE_URL`。
