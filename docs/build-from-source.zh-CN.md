# 从源码构建 Polytrader2

[English](./build-from-source.md)

本文档面向希望从源码运行、检查或打包 Polytrader2 的开发者。

产品定位和最终用户功能介绍请返回 [主 README](../README.zh-CN.md)。

## 环境要求

- Windows 是主要开发和打包目标。
- Node.js 版本需要兼容当前工作区工具链。
- pnpm 11.x。当前 workspace 声明为 `pnpm@11.5.0`。
- Electron 原生依赖会在 `pnpm install` 阶段安装。

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

## 安装依赖

```powershell
pnpm install
```

## 开发模式运行

```powershell
pnpm run dev
```

根目录的 `dev` 脚本会通过 Turbo 启动 `@polytrader2/app` workspace package 中的 Electron 桌面应用。

## 构建

```powershell
pnpm run build
```

## 预览构建后的应用

```powershell
pnpm run start
```

## 打包 Windows 应用

```powershell
pnpm run dist:win
```

## 打包 macOS 应用（Apple Silicon）

```bash
pnpm run dist:mac
```

该命令会在 `dist/` 中生成已签名的 DMG、ZIP 更新包和 `latest-mac.yml`，但不会发布 GitHub Release。运行前要求本机钥匙串中存在 `Developer ID Application: YongKui Zhao (6X3K4446Z2)` 签名身份。

如需包含 Apple 公证，请设置 `APPLE_API_KEY`、`APPLE_API_KEY_ID` 和 `APPLE_API_ISSUER`，然后运行：

```bash
pnpm run dist:mac:notarized
```

## 校验命令

```powershell
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run check
```

## 数据库命令

```powershell
pnpm run db:generate
pnpm run db:migrate
pnpm run db:rebuild-local
```

## Smoke Test

```powershell
pnpm --filter @polytrader2/app run smoke:crypto-events
```

## 环境变量

桌面应用会从当前工作目录或应用路径加载 `.env` 文件。生产环境示例位于 `apps/desktop/.env.production.example`。

| 变量                                                         | 用途                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL`                         | 可选 Supabase 项目 URL，用于账号同步和认证。                                                          |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | 可选 Supabase publishable key。                                                                       |
| `P2_ENABLE_ACCOUNT_DATA_SYNC`                                | 启用账户认证和云端数据同步。开发模式下除非显式设置为 `0`，否则默认启用；生产构建需要设置 `1` 才启用。 |
| `P2_ENABLE_STRATEGY_AUTOMATION`                              | 启用策略和机器人 UI。开发模式下除非显式设置为 `0`，否则默认启用；生产构建需要设置 `1` 才启用。        |
| `P2_ENABLE_TURNSTILE`                                        | 设置为 `1` 时在认证表单启用 Cloudflare Turnstile。                                                    |
| `VITE_TURNSTILE_SITE_KEY`                                    | Renderer 认证表单使用的 Turnstile site key。                                                          |

## 本地数据

默认 SQLite 数据库路径为：

```text
%USERPROFILE%\AppData\Roaming\polytrader2\polytrader2.db
```

首次运行时，应用会引导用户选择数据目录并执行初始 Polymarket 事件同步。
