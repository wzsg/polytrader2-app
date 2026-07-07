# Polytrader2

[English](./README.md)

Polytrader2 是面向 Polymarket 高级用户的 AI-native 桌面交易工作台。它把市场发现、本地数据同步、钱包管理、交易窗口、策略编写、机器人运行控制，以及面向 AI Agent 的本地 MCP Server 放在同一个桌面应用里。

本项目是 Windows 优先的 Electron 应用，技术栈包括 Vue、TypeScript、pnpm、Turbo、SQLite、DuckDB 和 Polymarket API 集成。

## 项目功能

- 浏览 Polymarket 通用市场、Crypto、Sports、Esports 和本地 Watchlist。
- 将 Polymarket event 和 market 元数据同步到本地 SQLite 数据库。
- 为具体市场打开独立交易窗口，查看订单簿、近期成交、价格历史、持有人和市场详情。
- 管理 Polymarket 钱包，包括生成钱包、HD 钱包、派生钱包、导入私钥和导入助记词。
- 通过 Electron secure storage 保存钱包关键材料，并在本地持久化钱包和账户元数据。
- 初始化 Polymarket 交易凭据，部署 deposit wallet，并按需执行 Polymarket 授权。
- 按钱包查看余额、当前订单、成交、持仓和持仓汇总。
- 创建入金请求，并通过 Polymarket bridge 集成运行提款工作流。
- 在基于 Monaco 的策略编辑器中编写 TypeScript 交易策略。
- 管理策略版本、编译状态、机器人配置、机器人运行历史、日志和策略产生的订单记录。
- 暴露本地 MCP Server，让 AI Agent 可以检查市场、读写策略、编译策略源码和管理机器人。
- 配置语言、同步计划、本地 MCP endpoint/token、开发者模式和订单确认安全阈值。
- 可选支持 Supabase 账号同步，以及登录表单中的 Cloudflare Turnstile。

## 产品形态

Polytrader2 不只是一个 Polymarket 浏览器。它的目标产品闭环是：

1. 从本地同步的 Polymarket 数据中发现市场。
2. 查看订单簿、价格历史、成交和市场上下文。
3. 管理本地 Polymarket 交易钱包。
4. 在专用交易窗口中执行手动交易。
5. 编写并版本化 TypeScript 策略。
6. 运行策略机器人，并保留可审计的日志、运行历史和订单记录。
7. 通过本地 MCP Server 让 AI Agent 参与策略工作，同时让数据和执行控制留在桌面应用内。

## 工作区结构

```text
apps/
  desktop/                 Electron 桌面应用、renderer 窗口、IPC、打包和迁移
  bot-vm/                  隔离的策略 worker runtime
packages/
  polymarket-api/          Polymarket Gamma、CLOB、Data、Bridge、Relayer 和 R2 API client
  polymarket-market/       事件同步、分类服务、市场详情、成交同步
  polymarket-wallet/       钱包创建、派生、关键材料处理和初始化
  trading-account/         余额、订单、成交、持仓、账户同步和订单操作
  trading-market/          交易窗口市场 runtime、订单簿、价格历史、tick、成交
  trading-strategy/        策略 service/factory 层
  strategy-runtime/        策略编译器、策略目录、机器人 runtime、运行历史
  repositories/            SQLite 和 DuckDB repository
  shared/                  共享常量、IPC 类型、领域类型、策略模板
  event-bus/               强类型应用事件总线
  app-preferences/         本地应用偏好服务
  workflow/                桌面工作流 runtime
```

## 环境要求

- Windows 是主要开发和打包目标。
- Node.js 版本需要兼容当前工作区工具链。
- pnpm 11.x。当前 workspace 声明为 `pnpm@11.5.0`。
- Electron 原生依赖会在 `pnpm install` 阶段安装。

## 快速开始

安装依赖：

```powershell
pnpm install
```

以开发模式运行桌面应用：

```powershell
pnpm run dev
```

构建桌面应用：

```powershell
pnpm run build
```

预览构建后的应用：

```powershell
pnpm run start
```

创建 Windows 安装包/应用包：

```powershell
pnpm run dist:win
```

## 常用命令

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

## 环境变量

桌面应用会从当前工作目录或应用路径加载 `.env` 文件。生产环境示例位于 `apps/desktop/.env.production.example`。

| 变量 | 用途 |
| --- | --- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | 可选 Supabase 项目 URL，用于账号同步和认证。 |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | 可选 Supabase publishable key。 |
| `P2_ENABLE_STRATEGY_AUTOMATION` | 启用策略和机器人 UI。开发模式下除非显式设置为 `0`，否则默认启用；生产构建需要设置 `1` 才启用。 |
| `P2_ENABLE_TURNSTILE` | 设置为 `1` 时在认证表单启用 Cloudflare Turnstile。 |
| `VITE_TURNSTILE_SITE_KEY` | Renderer 认证表单使用的 Turnstile site key。 |

## 本地数据

默认 SQLite 数据库路径为：

```text
%USERPROFILE%\AppData\Roaming\polytrader2\polytrader2.db
```

首次运行时，应用会引导用户选择数据目录并执行初始 Polymarket 事件同步。SQLite 用于保存应用元数据、偏好设置、钱包、策略目录、机器人记录、工作流任务和账户相关记录。更重的市场成交和价格历史数据使用 DuckDB 本地存储。

## 交易与钱包安全

Polytrader2 可以管理真实钱包，也可以下真实 Polymarket 订单。应用内有订单确认阈值、本地安全存储、钱包备份流程，以及显式的机器人启动/停止控制，但开发者和操作者仍应把每个已配置钱包视为真实可用钱包。

除非你明确想执行真实交易或 bridge 操作，否则不要在有资金的钱包上运行机器人策略或钱包工作流。

## MCP Server

本地 MCP Server 可以在 Settings 中启用。默认监听地址为：

```text
http://127.0.0.1:8708/mcp
```

该 Server 暴露策略编写资源，以及以下工具能力：

- 将 Polymarket `conditionId` 解析为本地市场数据；
- 列出、创建、更新、编译和版本化策略；
- 列出、创建、更新、启动和停止机器人；
- 读取策略运行历史、日志和订单记录。

endpoint 和访问 token 在桌面端 Settings 页面管理。

## 技术栈

- Electron 42 和 electron-vite
- Vue 3、vue-i18n、Tailwind CSS、lucide-vue、Monaco Editor
- TypeScript、pnpm workspaces、Turbo、tsup
- SQLite，通过 `better-sqlite3` 和 Drizzle migrations
- DuckDB，用于市场成交和价格历史存储
- Polymarket Gamma、CLOB、Data、Bridge、Relayer 和 R2 集成
- 可选 Supabase auth/sync 集成
- MCP SDK，用于本地 AI Agent 集成
- `isolated-vm`，用于策略执行隔离

## 许可证

Apache-2.0。详见 [LICENSE](./LICENSE)。
