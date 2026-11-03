# Meridian Retail Intelligence — Render + Supabase

An independent React/TypeScript application with a Node/Express API. Render hosts the application; Supabase provides email/password authentication, Postgres and private upload storage. There is no ChatGPT, Sites, Cloudflare Worker, D1 or R2 runtime dependency.

## Features and data

Six working areas: sales overview, customer segmentation/cohorts, Apriori market baskets, forecast evaluation, CSV imports/data quality, and an evidence-linked team action board. The built-in study processes all 1,067,371 UCI transaction lines. Interactive imports support 20,000 rows / 3 MB. The Python pipeline and its analytical tests are preserved in `analytics/`.

Source: Chen, D. (2012). Online Retail II. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D. Data licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/. Data is cleaned and aggregated. The 120-invoice CSV sample is for testing imports, not a complete trading history.

The records describe one UK giftware retailer in 2009–2011. They support historical sales analysis, customer grouping, basket associations and observed-sales forecasting. Product costs, inventory levels and intervention outcomes are absent, so the study does not establish profit, stockout prevention or causal revenue uplift.

## Development

Use Node 24 and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Set the Supabase project URL and publishable key in .env.
pnpm run build
pnpm start
```

The app opens at http://localhost:3000. For frontend HMR, run `pnpm run dev` in another terminal; Vite proxies API requests to port 3000. Set APP_ORIGIN=http://127.0.0.1:5180 when testing mutations through that dev origin.

## Supabase setup

Apply `supabase/schema.sql` once to a fresh Supabase project. It defines the Meridian tables, RLS policies, a private upload bucket, transactional action-history triggers and a workspace bootstrap RPC. This deployment's schema has already been applied to its dedicated Meridian project.

Only the project URL and publishable key are needed. The API verifies each bearer token with `auth.getUser` and queries Supabase as that user; no service-role key is used. RLS independently protects workspace records and files. New members are linked by a confirmed email address. User metadata is used for display names, never role authorization.

Set Authentication → URL Configuration → Site URL and Redirect URLs to the final Render HTTPS origin. Keep email confirmations enabled. Supabase's default email sender has delivery restrictions/rate limits; configure custom SMTP before offering unrestricted public registration. Signup and sign-in are standard Supabase email/password flows. Your teammate needs their own account; they can then join the workspace after you add their email in Workspace settings.

## Render deployment

Connect the private GitHub repository to Render. One Node web service serves both the frontend and API. No local disk/database is required for durable records.

- Build: `corepack pnpm install --frozen-lockfile && corepack pnpm run build`
- Start: `node dist-server/index.js`
- Variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NODE_VERSION=24`
- Optional `APP_ORIGIN`: exact public HTTPS origin. When omitted, Render's own `RENDER_EXTERNAL_URL` is used.
- Health endpoint: `/api/health`

Free Render instances can sleep when idle, share a workspace-level monthly free-hour allowance and take time to wake. Supabase persists users, actions, saved views and uploads across Render restarts. Hosted data is independent of any laptop.

## Verification

```sh
pnpm test
pnpm run build
python -m unittest discover -s analytics -p 'test_*.py'
```

`tests/analytics.test.mjs` covers CSV parsing, invalid mappings, dates, credits, duplicates, anonymous customers, invoice identity conflicts, cohort maturity and full-study financial reconciliation. Python tests verify Apriori triple support and forecast look-ahead. `supabase/rls-test.sql` tests roles, isolation and transactional action history inside a rolled-back transaction.

Large study rebuild:

```sh
python -m pip install -r analytics/requirements-study.txt
python analytics/prepare.py --input /absolute/path/online_retail_II.xlsx
pnpm run build
```

The original workbook is downloadable from https://archive.ics.uci.edu/dataset/502/online+retail+ii. Preserve attribution when distributing derived reports. The original study's forecasts are a chronological backtest, not an untouched external benchmark.

The previous Healthy Route AI project was paused to free the account's active-project slot. BriefActions was not changed. The earlier Sites deployment is retained as a fallback; it is not used by this application.
