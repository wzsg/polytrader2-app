# Polytrader2

[简体中文](./README.zh-CN.md)

**A desktop trading workstation for Polymarket.**

Polytrader2 helps you browse Polymarket markets faster, manage local wallets, analyze market data, place trades, and run automated strategies from one app.

Market data is synced into a local cache for fast browsing. Wallet keys stay encrypted on your machine, and transactions are signed locally. Local AI agents can connect through MCP to help inspect markets, write strategies, and review bot runs.

## Demo

[Watch the Polytrader2 demo video](https://example.com/polytrader2-demo)

## Screenshots

| Markets | Trading |
| --- | --- |
| ![Market browser](docs/assets/screenshots/market-discovery.png) | ![Trading workspace](docs/assets/screenshots/trading-workspace.png) |

| Wallets | Strategies |
| --- | --- |
| ![Wallet management](docs/assets/screenshots/wallet-management.png) | ![Strategy automation](docs/assets/screenshots/strategy-automation.png) |

## What You Can Do

- Browse Polymarket markets from a local cache.
- Filter general, crypto, sports, esports, and watchlist views.
- Open dedicated trading windows with order book, price history, recent trades, and market details.
- Create, import, derive, and manage Polymarket wallets.
- View wallet balances, orders, trades, positions, and position summaries.
- Deposit and withdraw through Polymarket bridge workflows.
- Write TypeScript strategies and keep version history.
- Start and stop strategy bots, then review logs, runs, and generated orders.
- Connect local AI agents through MCP.

## How It Works

1. Start the app and choose a local data directory.
2. Sync Polymarket market data.
3. Add or import a wallet.
4. Browse markets and open a trading window.
5. Place trades manually or create a strategy.
6. Review orders, positions, bot runs, and logs from the app.

## Wallet Safety

Polytrader2 is designed so private keys do not leave your machine.

- Wallet key material is encrypted locally.
- Windows uses DPAPI through Electron secure storage.
- macOS uses Keychain through Electron secure storage.
- Transactions are signed locally.
- The project is open source and auditable.

Polytrader2 can operate real wallets and submit real orders. Treat every configured wallet as live.

## AI Agent Support

Polytrader2 exposes a local MCP server for AI tools such as Codex, Claude Code, and other local agents.

Agents can help look up local market data, draft strategy code, compile strategies, inspect bots, and review run logs. The desktop app remains the control plane for wallets, strategy execution, and trading state.

## Local Strategy Runtime

Strategies run locally in an isolated runtime. Strategy source, versions, compile status, bot configuration, run logs, and generated order records are kept inspectable inside the app.

## Source Builds

For developers who want to run or package the app from source, see [Build from Source](./docs/build-from-source.md).

## License

Apache-2.0. See [LICENSE](./LICENSE).
