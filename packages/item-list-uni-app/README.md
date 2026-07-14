# item-list-uni-app

Mobile-first uni-app frontend for the household inventory system.

## Commands

```bash
npm run dev --workspace item-list-uni-app
npm run build --workspace item-list-uni-app
```

By default the H5 dev server proxies `/api/*` to `http://localhost:5173`.
Set `VITE_API_PROXY_TARGET` or `VITE_API_BASE_URL` if your backend runs elsewhere.

## 微信小程序

小程序 AppID 已写入 `src/manifest.json`（`mp-weixin.appid` = `wxfd5d4c43d1f9dcdb`）。

```bash
npm run dev:mp-weixin          # 编译到 dist/dev/mp-weixin
npm run build:mp-weixin        # 生产构建到 dist/build/mp-weixin
```

用微信开发者工具导入 `dist/dev/mp-weixin` 目录调试。小程序没有 H5 的 dev proxy，所有请求必须是绝对 URL：复制 `.env.example` 为 `.env`，配置 `VITE_API_BASE_URL` 指向后端 https 域名（已部署的 Cloudflare Worker）。

上线前还需在微信公众平台 → 开发管理 → 开发设置 → 服务器域名，把后端 Worker 域名加入「request 合法域名」和「uploadFile 合法域名」。OCR/AI 图片经后端转发，只需配置后端一个域名。开发期可在微信开发者工具勾选「不校验合法域名」临时调试（`manifest.json` 已设 `urlCheck: false`）。
