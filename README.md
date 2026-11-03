# Meridian Retail Intelligence — Render + Supabase

**Live website:** [Open Meridian Retail Intelligence](https://meridian-retail-intelligence.onrender.com)

Create an account or sign in with your email and password. The free Render service may take a moment to wake after being idle.

An independent React/TypeScript application with a Node/Express API. Render hosts the application; Supabase provides email/password authentication, Postgres and private upload storage. There is no ChatGPT, Sites, Cloudflare Worker, D1 or R2 runtime dependency.

## Features and data

The header includes sign-out and System / Light / Dark appearance controls. Theme choice is remembered on the device. Managers can use **Add data** beside the dataset selector to import another CSV; imported datasets are stored privately in their workspace.

Google and GitHub sign-in controls appear automatically when the corresponding Supabase provider is enabled. Configure each provider in Authentication → Sign In / Providers with its OAuth client ID and secret. Provider callback URL: `https://huzwxbquiwpalzxtuhkb.supabase.co/auth/v1/callback`. Application redirect URL: `https://meridian-retail-intelligence.onrender.com`. Keep client secrets in Supabase, never in this repository. These providers are not enabled merely by deploying the frontend.

Provider setup: [Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [GitHub](https://supabase.com/docs/guides/auth/social-sign-in/auth-github).

Seven working areas: sales overview, customer segmentation/cohorts, Apriori market baskets, forecast evaluation, business impact, CSV imports/data quality, and an evidence-linked team action board. The built-in study processes all 1,067,371 UCI transaction lines. Interactive imports support 20,000 rows / 3 MB. The Python pipeline and its analytical tests are preserved in `analytics/`.

Source: Chen, D. (2012). Online Retail II. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D. Data licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/. Data is cleaned and aggregated. The 120-invoice CSV sample is for testing imports, not a complete trading history.

The records describe one UK giftware retailer in 2009–2011. They support historical sales analysis, customer grouping, basket associations and observed-sales forecasting. Product costs, inventory levels and intervention outcomes are absent, so the study does not establish profit, stockout prevention or causal revenue uplift.

## Dataset library and business evidence

Data studio contains **11 importable transaction studies**: eight country subsets from UCI Online Retail II and three 2017 quarter subsets from the separate Brazilian E-Commerce Public Dataset by Olist. Country/quarter subsets are not independent retailers. The original quick sample remains available. Source filters, citations, per-file SHA-256 hashes, preparation notes and licences appear in the library and `DATA_LICENSES.md`.

UCI amounts stay in GBP. Olist amounts stay in BRL; no currency conversion or cross-source pooling is performed. Olist samples include delivered purchases only, join customer_unique_id for repeat-buyer identity, use stable identifier aliases, and combine repeated unit lines into quantities. Categories and SKU aliases stand in for unavailable product names. They exclude cancelled orders, refunds and freight. Olist data and its adapted outputs are **CC BY-NC-SA 4.0 for noncommercial educational use**. UCI data is CC BY 4.0. Exact known CSVs retain their own source attribution on import, and their currencies are enforced.

Each import has a row reconciliation and an availability summary. Small or sparse studies do not receive fabricated basket rules or forecasts. Customer, basket and forecast pages explain the results and suggest evidence-linked actions.

**Business impact** presents three evidence levels:

- A comparison with previous-week forecasting on identical observed target weeks, later-period basket evidence and internal clustering diagnostics for the selected dataset.
- An independent UCI Sales Transactions Weekly benchmark: 811 products, 52 raw weekly quantities per product. Select a global method on W32–W43, then evaluate all methods on W44–W51. The selected four-week average has WAPE 0.26999894 versus 0.31741792 for the previous-week baseline: **14.94% lower absolute error** over 6,488 product-week predictions. The expanding historical mean is slightly better on the later window; it was not selected because its earlier-window error was worse. This retrospective baseline comparison is not profit evidence. Original indexed weeks are retained; no dates or prices are invented.
- An interactive **assumption-based profit scenario**. It charges incentives on all treatment purchases, includes contact and fixed costs, can report a loss, and computes ROI and a break-even purchase rate. Inputs are not learned campaign outcomes. A prospective randomized retailer trial with net contribution per assigned customer and uncertainty is still needed to establish profit caused by Meridian. The page includes a trial plan and exports a JSON evidence pack.

Reproduce the datasets and independent benchmark after downloading the original sources:

```sh
python analytics/build_samples.py --input /absolute/path/online_retail_II.xlsx
python analytics/build_external_studies.py --olist /absolute/path/olist.zip --weekly /absolute/path/weekly.zip
```

Official Olist download: https://www.kaggle.com/api/v1/datasets/download/olistbr/brazilian-ecommerce

Official weekly dataset: https://archive.ics.uci.edu/dataset/396/sales+transactions+dataset+weekly

The scripts, source hashes, CSVs and benchmark JSON are versioned. Missing product costs, campaign assignments and intervention outcomes mean **no realized profit uplift is claimed**.

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

Connect the GitHub repository to Render. One Node web service serves both the frontend and API. No local disk/database is required for durable records.

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

GitHub: https://github.com/sagar-varshney/meridian-retail-intelligence (made public by the owner for Render access).

The previous Healthy Route AI project was paused to free the account's active-project slot. BriefActions was not changed. The earlier Sites deployment is retained as a fallback; it is not used by this application.
