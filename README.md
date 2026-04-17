# React + Vite + Hono + Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/vite-react-template)

This template provides a minimal setup for building a React application with TypeScript and Vite, designed to run on Cloudflare Workers. It features hot module replacement, ESLint integration, and the flexibility of Workers deployments.

![React + TypeScript + Vite + Cloudflare Workers](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fc7b4b62-442b-4769-641b-ad4422d74300/public)

<!-- dash-content-start -->

🚀 Supercharge your web development with this powerful stack:

- [**React**](https://react.dev/) - A modern UI library for building interactive interfaces
- [**Vite**](https://vite.dev/) - Lightning-fast build tooling and development server
- [**Hono**](https://hono.dev/) - Ultralight, modern backend framework
- [**Cloudflare Workers**](https://developers.cloudflare.com/workers/) - Edge computing platform for global deployment

### ✨ Key Features

- 🔥 Hot Module Replacement (HMR) for rapid development
- 📦 TypeScript support out of the box
- 🛠️ ESLint configuration included
- ⚡ Zero-config deployment to Cloudflare's global network
- 🎯 API routes with Hono's elegant routing
- 🔄 Full-stack development setup
- 🔎 Built-in Observability to monitor your Worker

Get started in minutes with local development or deploy directly via the Cloudflare dashboard. Perfect for building modern, performant web applications at the edge.

<!-- dash-content-end -->

## Getting Started

To start a new project with this template, run:

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/vite-react-template
```

A live deployment of this template is available at:
[https://react-vite-template.templates.workers.dev](https://react-vite-template.templates.workers.dev)

## Development

Install dependencies:

```bash
npm install
```

Start the development server with:

```bash
npm run dev
```

The `dev` command now initializes the local D1 schema and seed data only when the
local database does not exist yet.
Your application will be available at [http://localhost:5173](http://localhost:5173).

To start local dev while using **remote D1 bindings** (online database), run:

```bash
npm run dev:remote-db
```

This command uses the `remote_db` Cloudflare environment and sets the D1 binding
to `"remote": true` for development.

If this command fails to start, make sure you are logged in and can reach Cloudflare:

```bash
npx wrangler login
```

Also make sure your network can access `*.workers.dev` over HTTPS, and use Node 20+
for Wrangler-related commands.

## D1 setup

This project now includes a household inventory backend schema in `db/schema.sql`
and seed data in `db/seed.sql`.

Because Wrangler in this repo requires Node 20+, ready-made commands are provided:

```bash
npm run d1:init:local
npm run d1:init:remote
```

## Baidu OCR setup

Configure Baidu OCR credentials (for shopping receipt recognition):

```bash
npx wrangler secret put BAIDU_OCR_API_KEY
npx wrangler secret put BAIDU_OCR_SECRET_KEY
```

Optional endpoint override (default is `.../ocr/v1/shopping_receipt`):

```bash
npx wrangler secret put BAIDU_OCR_RECEIPT_API_URL
```

## API overview

Main backend endpoints:

- `GET /api/setup/status` - verify whether schema and seed data are ready
- `GET /api/base-options` / `POST /api/base-options` / `PATCH /api/base-options/:type/:id` / `DELETE /api/base-options/:type/:id`
- `GET /api/items` / `POST /api/items` / `PATCH /api/items/:id` / `DELETE /api/items/:id`
- `POST /api/stock/in` - create a stock batch and inbound movement
- `POST /api/stock/out` - deduct stock using FEFO batch allocation
- `GET /api/movements` - list inventory movements
- `GET /api/dashboard` - inventory overview
- `GET /api/alerts` - expiring and expired stock
- `POST /api/ocr/baidu/receipt` - upload image and run Baidu shopping receipt OCR

## Production

Build your project for production:

```bash
npm run build
```

Preview your build locally:

```bash
npm run preview
```

Deploy your project to Cloudflare Workers:

```bash
npm run build && npm run deploy
```

Monitor your workers:

```bash
npx wrangler tail
```

## Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Vite Documentation](https://vitejs.dev/guide/)
- [React Documentation](https://reactjs.org/)
- [Hono Documentation](https://hono.dev/)
