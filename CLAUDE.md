# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

pnpm/npm workspace monorepo. All code lives under `packages/`:

- **`packages/react-item-list-manage`** — the original full-stack app: a single Cloudflare Worker (Hono API + React SPA served as Worker static assets) backed by Cloudflare D1. This is the only deployable.
- **`packages/item-list-uni-app`** — a mobile-first uni-app (Vue 3) frontend that consumes the *same* `/api/*` backend. Targets both H5 and WeChat Mini Program (AppID `wxfd5d4c43d1f9dcdb` in `src/manifest.json`). H5 dev proxies `/api/*` to the Worker; the Mini Program has no dev proxy and requires an absolute `VITE_API_BASE_URL`.

Both frontends target the same backend API and duplicate their type definitions (`react-app/lib/types.ts` vs `shared/types.ts`). **Keep both in sync when the API shape changes.**

Dependencies are hoisted to the repo-root `node_modules`. Sub-package scripts invoke binaries via `../../node_modules/...` paths, so install at the root, not per-package.

## Common commands

Run from the **repo root**. Root `package.json` delegates to workspaces:

```bash
npm run dev            # Worker dev server (Hono API + React SPA) at :5173, auto-inits local D1
npm run dev:uni        # uni-app H5 frontend (proxies /api/* to :5173)
npm run dev:remote-db  # Worker dev using REMOTE D1 bindings (needs `npx wrangler login` + Node 20+)
npm run build          # builds both packages
npm run lint           # eslint (react) + vue-tsc (uni-app)
npm run check          # tsc + vite build + wrangler dry-run (react package only)
npm run deploy         # wrangler deploy (react package)
npm run d1:init:local  # apply db/schema.sql + db/seed.sql to local D1
npm run d1:init:remote # apply schema + seed to remote D1
npm run cf-typegen     # regenerate worker-configuration.d.ts after changing wrangler bindings
```

To run a single package's script directly: `npm run <script> --workspace react-item-list-manage` (or `item-list-uni-app`).

There is no test runner configured.

## Architecture

### Backend: one Hono Worker, one file

`packages/react-item-list-manage/src/worker/index.ts` is a ~3000-line monolith — all routes, helpers, and integrations live here. The Worker serves both `/api/*` (Hono) and the built React SPA (`assets.directory: ./dist/client` with SPA fallback, configured in `wrangler.json`). Deploying the Worker deploys the whole app.

API conventions:
- All success responses are wrapped as `{ data: ... }`; errors as `{ error: string, details? }`. Both frontend API clients depend on this envelope — preserve it.
- `app.onError` sniffs D1 error messages: `"no such table/view"` → 503 (schema not initialized), `"UNIQUE constraint failed"` → 409. Custom `ApiError(status, message, details)` is the throwing pattern for validation/business errors.
- Input parsing helpers (`getRequiredString`, `getOptionalDate`, `getPositiveNumber`, etc.) throw `ApiError(400, ...)` — use them instead of ad-hoc validation.

### Data model (Cloudflare D1 = SQLite)

Schema in `db/schema.sql`. Core tables: `base_options`, `items`, `item_tags`, `tags`, `stock_batches`, `stock_movements`.

Key invariants a future instance must respect:

- **Remaining stock is computed, never stored.** `batch_inventory_view` = batch `quantity` − SUM of `OUT` movements on that batch. `item_inventory_view` aggregates per item (current quantity, nearest expiry, expired/expiring batch counts). Queries read these views, not the raw tables.
- **Stock-out (`POST /api/stock/out`) does FEFO allocation**: selects batches with `remaining_quantity > 0` ordered by expiry (nulls last) then purchased/created, consumes across batches, and writes one `OUT` movement per batch.
- **`base_options` is polymorphic**, keyed by `option_type`: `category`, `unit`, `location`, `outbound_reason`. `ensureOptionExists()` validates codes against this table before any item/stock write. `getBaseOptionUsageCount()` blocks delete/code-change of in-use options (409).
- **Tags**: `tags` is a catalog; `item_tags` is the junction. A tag can exist in either. Rename cascades through both via a `session.batch([...])`. Tags are joined as newline-separated `tag_names` and normalized with `normalizeTagNames` (zh-Hans-CN collation, dedup).
- **Writes use D1 sessions**: `db.withSession("first-primary")` for read-your-writes consistency within a request; multi-statement writes go through `session.batch([...])`. Items can't be deleted if they have batches/movements (409).

### uniCloud backend (阿里云, 迁移自 Cloudflare)

`packages/item-list-uni-app/uniCloud-aliyun/` 是后端的 uniCloud 版本，与 Cloudflare Worker 共存（同一套 Hono 路由，API 形状一致，前端切后端只改 `VITE_API_BASE_URL`）：

- 单云函数 `item-list-api` 跑 Hono（CJS — Hono 4.11.1 的 `require('hono')` 已验证可用）。`index.js` 是适配层：顶部 polyfill `File`/`toWellFormed`（Node 18 云函数环境缺），再把 uniCloud URL 化 `event` ↔ Hono `Request`/`Response`。**event 字段结构是需部署实测的点**（`path`/`queryStringParameters`/`body`/`isBase64Encoded`）。
- 6 个 NoSQL 集合替代 D1 表（字段保留 snake_case，`is_active` 由 0/1 改为 bool）。2 个 SQL 视图改为 `db.js` 的运行时聚合 `getBatchInventory` / `getItemInventory`（FEFO 出库、看板、临期提醒都依赖它们）。
- 代码分层：`app.js`（路由）→ `helpers.js`（解析/映射/校验）+ `ocr.js`（百度/AI）+ `db.js`（数据访问）+ `utils.js`（纯工具）。secrets 从 `process.env`（云函数环境变量）。
- 部署/URL 化/合法域名步骤见 `uniCloud-aliyun/README.md`。

### React frontend (`react-app/`)

- **Ant Design 6** UI. Routing is **manual** — `App.tsx` uses `window.history.pushState`/`popstate` and a `currentPath` switch, with routes enumerated in `APP_PATHS`. `react-router-dom` is a dependency but is **not used** in source.
- **Core data is loaded once in `App.tsx`** (`/api/base-options` + `/api/items?limit=200`) and threaded down as props; `reloadCoreData(showToast?)` is passed to pages for mutation-after-refresh.
- UI preferences persist in `localStorage`: page layout mode (`item-list-page-layout-mode`), AI provider (`item-list-ai-provider`). Both are managed in `App.tsx` and surfaced on the Tools page.
- API client (`lib/api.ts`) is a thin `fetch` wrapper expecting the `{ data }` envelope.

### uni-app frontend (`item-list-uni-app/`)

- Vue 3 + `@dcloudio/uni-app`, `@` alias → `src/`. Pages registered in `src/pages.json`; shared logic in `src/shared/` (`api.ts` wraps `uni.request`/`uni.uploadFile`, `data.ts` has typed API helpers). Source uses only `uni.*` APIs, so it builds for both H5 and WeChat Mini Program.
- **H5**: `npm run dev:uni` proxies `/api/*` to `http://localhost:5173` by default; override with `VITE_API_PROXY_TARGET` (proxy) or `VITE_API_BASE_URL` (absolute). Run the Worker (`npm run dev`) first.
- **WeChat Mini Program**: `npm run dev:mp-weixin` / `build:mp-weixin` compile to `dist/{dev,build}/mp-weixin`; import that directory in WeChat DevTools. **`VITE_API_BASE_URL` is required** (copy `.env.example` → `.env`) because the Mini Program cannot use relative URLs. `api.ts` enforces this at runtime via a `#ifdef MP-WEIXIN` guard. Before release, the Worker domain must be added to the Mini Program's request/uploadFile legal domains in the WeChat admin console. `urlCheck: false` in `manifest.json` skips this check during development.
- Query strings are built with `buildQueryString` (in `shared/utils.ts`), not `URLSearchParams` — the Mini Program runtime has no `URLSearchParams` global.

### AI / OCR integrations (backend)

- **AI provider** (`gpt` | `deepseek`) is chosen client-side and sent per request; the backend resolves the API key from `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` (503 if missing). `resolveAiProviderConfig` maps provider → endpoint + model (gpt-4o / deepseek-chat).
- Two AI features: `/api/ocr/openai/receipt` (vision receipt extraction) and `/api/ai/command/parse` (natural-language → stock_in/stock_out/create_item/unsupported JSON). Both use the OpenAI chat-completions wire format and strip ```json fences before parsing.
- **Baidu OCR** (`/api/ocr/baidu/receipt`): OAuth token cached in a module-level `baiduTokenCache` with refresh-on-expiry (error codes 110/111). Receipt parsing merges fragmented table rows heuristically (`mergeBaiduReceiptRows`, `looksLikeSkuCode`).

## Secrets & environment

- **Local dev**: `packages/react-item-list-manage/.dev.vars` (gitignored). Required keys: `BAIDU_OCR_API_KEY`, `BAIDU_OCR_SECRET_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`. Optional: `BAIDU_OCR_RECEIPT_API_URL`.
- **Production**: `npx wrangler secret put <NAME>` (run from the react package).
- D1 binding `item_list_db` (database `item-list-db`) is configured in `wrangler.json`; the `remote_db` env marks it `"remote": true` for `dev:remote-db`.

## Non-obvious dev quirks

- **Wrangler needs Node 20+.** The react package's scripts wrap wrangler calls with `npx -y node@20` for this reason.
- **`globalThis.File` polyfill.** Scripts run Vite/wrangler through `node -r ./scripts/node-web-globals.cjs`, which polyfills `File` and `String.prototype.toWellFormed` for older Node. The Vite config also polyfills `File` at the top of `vite.config.ts`.
- **React dedupe.** `vite.config.ts` aliases `react`, `react-dom`, and the jsx runtimes to the workspace-root `node_modules` and sets `dedupe`. Don't add a second React copy.
- **`dev` auto-initializes local D1** only when no local sqlite exists yet (checks `.wrangler/state/v3/d1/miniflare-D1DatabaseObject`). If schema changes aren't picked up, delete that directory or re-run `d1:init:local`.
- **Lockfile is `pnpm-lock.yaml`** with a `pnpm-workspace.yaml`, but root scripts use `npm run --workspace`. Both work because deps are hoisted; pick one tool and stick with it for a given install.
