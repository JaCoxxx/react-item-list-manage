# react-item-list-manage workspace

This repository is now organized as a workspace with all subprojects under `packages/`.

| Package | Path | Purpose |
| --- | --- | --- |
| `react-item-list-manage` | `packages/react-item-list-manage` | Existing Cloudflare Workers package and backend API project |
| `item-list-uni-app` | `packages/item-list-uni-app` | New uni-app frontend package migrated from the old web pages |

Common commands still work from the repository root:

```bash
npm run dev
npm run dev:uni
npm run lint
npm run build
```

`npm run dev` starts the original backend package, while `npm run dev:uni` starts the uni-app H5 frontend.
The uni-app package proxies `/api/*` to `http://localhost:5173` by default for local development.
