# Build Polytrader2 from Source

[简体中文](./build-from-source.zh-CN.md)

This guide is for developers who want to run, inspect, or package Polytrader2 from source.

For product positioning and end-user features, return to the [main README](../README.md).

## Requirements

- Windows is the primary development and packaging target.
- Node.js compatible with the current workspace toolchain.
- pnpm 11.x. The workspace declares `pnpm@11.5.0`.
- Native Electron dependencies are installed during `pnpm install`.

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

## Install Dependencies

```powershell
pnpm install
```

## Run In Development

```powershell
pnpm run dev
```

The root `dev` script runs the Electron desktop app through Turbo and the `@polytrader2/app` workspace package.

## Build

```powershell
pnpm run build
```

## Preview The Built App

```powershell
pnpm run start
```

## Package For Windows

```powershell
pnpm run dist:win
```

## Package For macOS (Apple Silicon)

```bash
pnpm run dist:mac
```

This creates a signed DMG, ZIP update archive, and `latest-mac.yml` in `dist/` without publishing a GitHub release. The command requires the `Developer ID Application: YongKui Zhao (6X3K4446Z2)` signing identity in the local keychain.

To include Apple notarization, provide `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`, then run:

```bash
pnpm run dist:mac:notarized
```

## Validation Commands

```powershell
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run check
```

## Database Commands

```powershell
pnpm run db:generate
pnpm run db:migrate
pnpm run db:rebuild-local
```

## Smoke Tests

```powershell
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

On first run, the app can guide the user through choosing a data directory and performing an initial Polymarket event sync.
