# Polytrader2

[简体中文](./README.zh-CN.md)

Polytrader2 is an AI-native desktop trading workstation for Polymarket power users. It combines market discovery, local market data sync, wallet management, trading windows, strategy authoring, bot runtime controls, and a local MCP server for AI-assisted strategy work.

The project is a Windows-first Electron application built with Vue, TypeScript, pnpm, Turbo, SQLite, DuckDB, and Polymarket API integrations.

## What It Does

- Browse Polymarket events across general markets, crypto, sports, esports, and a local watchlist.
- Sync Polymarket event and market metadata into a local SQLite database.
- Open dedicated trading windows for markets, including order book, recent trades, price history, holders, and market detail panels.
- Manage Polymarket wallets, including generated wallets, HD wallets, derived wallets, imported private keys, and imported mnemonics.
- Store wallet key material through Electron secure storage and persist wallet/account metadata locally.
- Initialize Polymarket trading credentials, deploy deposit wallets, and approve Polymarket trading where needed.
- View balances, current orders, trades, positions, and position summaries per wallet.
- Create deposit requests and run withdrawal workflows through the Polymarket bridge integration.
- Author TypeScript trading strategies in a Monaco-based strategy editor.
- Manage strategy versions, compile status, bot configurations, bot run history, logs, and strategy-generated orders.
- Expose a local MCP server so AI agents can inspect markets, read/write strategy assets, compile strategy source, and manage bots.
- Configure language, sync schedule, local MCP endpoint/token, developer mode, and order confirmation safety thresholds.
- Support optional Supabase account sync and optional Cloudflare Turnstile on the auth form.

## Product Shape

Polytrader2 is not only a Polymarket browser. The intended product loop is:

1. Discover markets from locally synced Polymarket data.
2. Inspect order book, price history, trades, and market context.
3. Manage a local set of Polymarket trading wallets.
4. Execute manual trades from focused trading windows.
5. Draft and version TypeScript strategies.
6. Run strategy bots with auditable logs, run history, and order records.
7. Let AI agents help through the local MCP server while keeping data and execution under the desktop app.

## Workspace Layout

```text
apps/
  desktop/                 Electron desktop app, renderer windows, IPC, packaging, migrations
  bot-vm/                  Isolated strategy worker runtime
packages/
  polymarket-api/          Polymarket Gamma, CLOB, Data, Bridge, Relayer, and R2 API clients
  polymarket-market/       Event sync, category services, market detail, trade sync
  polymarket-wallet/       Wallet creation, derivation, key material handling, initialization
  trading-account/         Balances, orders, trades, positions, account sync, order operations
  trading-market/          Trading-window market runtime, order book, price history, ticks, trades
  trading-strategy/        Strategy service/factory layer
  strategy-runtime/        Strategy compiler, catalog, bot runtime, run history
  repositories/            SQLite and DuckDB repositories
  shared/                  Shared constants, IPC types, domain types, strategy templates
  event-bus/               Typed application event bus
  app-preferences/         Local app preference service
  workflow/                Desktop workflow runtime
```

## Requirements

- Windows is the primary development and packaging target.
- Node.js compatible with the current workspace toolchain.
- pnpm 11.x. The workspace declares `pnpm@11.5.0`.
- Native Electron dependencies are installed during `pnpm install`.

## Getting Started

Install dependencies:

```powershell
pnpm install
```

Run the desktop app in development mode:

```powershell
pnpm run dev
```

Build the desktop app:

```powershell
pnpm run build
```

Preview the built app:

```powershell
pnpm run start
```

Create a Windows installer/app package:

```powershell
pnpm run dist:win
```

## Useful Commands

```powershell
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run check
pnpm run db:generate
pnpm run db:migrate
pnpm run db:rebuild-local
pnpm --filter @polytrader2/app run smoke:crypto-events
```

## Environment Variables

The desktop app can load `.env` files from the working directory or app path. A production example is available at `apps/desktop/.env.production.example`.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | Optional Supabase project URL for account sync and auth. |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Optional Supabase publishable key. |
| `P2_ENABLE_STRATEGY_AUTOMATION` | Enables strategy and bot UI. In dev, it is enabled unless explicitly set to `0`; for production set `1` to enable. |
| `P2_ENABLE_TURNSTILE` | Enables Cloudflare Turnstile on the auth form when set to `1`. |
| `VITE_TURNSTILE_SITE_KEY` | Turnstile site key for the renderer auth form. |

## Local Data

The default SQLite database path is:

```text
%USERPROFILE%\AppData\Roaming\polytrader2\polytrader2.db
```

On first run, the app can guide the user through choosing a data directory and performing an initial Polymarket event sync. SQLite stores application metadata, preferences, wallets, strategy catalog data, bot records, workflow tasks, and account-related records. DuckDB-backed local stores are used for heavier market trade and price-history data.

## Trading And Wallet Safety

Polytrader2 can manage real wallets and place real Polymarket orders. The app includes an order confirmation threshold, local secure storage, wallet backup flows, and explicit bot start/stop controls, but developers and operators should still treat every configured wallet as live.

Do not run bot strategies or wallet workflows against funded accounts unless you intend to execute real trading or bridge operations.

## MCP Server

The local MCP server can be enabled from Settings. By default it listens on:

```text
http://127.0.0.1:8708/mcp
```

The server exposes resources for strategy authoring and tools for:

- resolving a Polymarket `conditionId` to local market data;
- listing, creating, updating, compiling, and versioning strategies;
- listing, creating, updating, starting, and stopping bots;
- reading strategy run history, logs, and order records.

The endpoint and access token are managed in the desktop Settings screen.

## Tech Stack

- Electron 42 and electron-vite
- Vue 3, vue-i18n, Tailwind CSS, lucide-vue, Monaco Editor
- TypeScript, pnpm workspaces, Turbo, tsup
- SQLite through `better-sqlite3` and Drizzle migrations
- DuckDB for market trade and price-history storage
- Polymarket Gamma, CLOB, Data, Bridge, Relayer, and R2 integrations
- Supabase auth/sync integration, optional
- MCP SDK for local AI-agent integration
- `isolated-vm` for strategy execution isolation

## License

Apache-2.0. See [LICENSE](./LICENSE).
