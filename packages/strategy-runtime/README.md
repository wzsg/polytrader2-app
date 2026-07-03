# @polytrader/strategy-runtime

`@polytrader/strategy-runtime` 是 Polytrader2 的策略运行域包，负责承载策略资产、策略机器人生命周期、策略运行记录、日志、订单记录和策略执行器封装。

这个包的目标是把策略域逻辑从 Electron desktop 主进程中抽离出来，让 `apps/desktop` 只保留窗口、IPC、Electron runtime path 和宿主服务适配。

## 语义边界

策略相关概念按三层划分：

| 概念          | 职责                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| `Strategy`    | 策略资产，包括源码、编译结果、版本、DTS 和默认模板                       |
| `StrategyBot` | 可管理的运行配置，绑定市场、账号、策略版本、配置、启用状态和自动启动行为 |
| `StrategyRun` | 一次实际运行产生的审计记录，包括状态、日志、订单、错误和历史查询         |

生命周期只属于 `StrategyBot`：启动和停止统一通过 bot 完成。

`StrategyRun` 不再代表一个可直接启动的入口，只表示运行历史和事件记录。也就是说，`strategy-runs:*` API 应该只做查询和事件分发，不应该再提供 `start` / `stop` 之类生命周期能力。

## 包内职责

当前包负责：

- 策略源码编译和 import 限制校验
- 策略 CRUD、版本创建和版本查询
- bot CRUD、运行状态修复、自动启动、启动、停止和删除
- run 历史、活跃 run 查询、日志和订单记录
- 策略 worker 子进程执行器封装
- 策略运行事件和 bot 运行事件分发

包不负责：

- Electron `ipcMain` 注册
- BrowserWindow / WebContents 事件广播
- `app.getAppPath()`、`process.resourcesPath` 等 Electron 运行时路径读取
- 交易窗口 UI 状态和 renderer 组件
- 账号私钥解密和 Electron `safeStorage`
- 市场 runtime 的具体实现

这些能力由 `apps/desktop` 通过端口适配注入。

## 目录结构

```text
src/
  index.ts
  ports.ts
  bot/
    strategyBotRepository.ts
    strategyBotRuntimeService.ts
  executor/
    strategyExecutor.ts
  run/
    strategyRunHistoryService.ts
    strategyRunRepository.ts
  strategy/
    strategyCatalogService.ts
    strategyCompiler.ts
  utils/
    json.ts
    market.ts
    time.ts
```

## 端口适配

`StrategyBotRuntimeService` 通过 `StrategyRuntimePorts` 访问宿主能力：

- `marketRuntime`：加载市场快照、按明确数据域加载市场详情/价格历史/成交数据、订阅交易 runtime 事件、维护策略引用计数
- `accounts`：读取账号凭据、读取账号摘要、下单后触发账号缓存同步
- `executor`：提供策略 worker 所需的运行时路径

desktop 侧的组合入口位于：

```text
apps/desktop/src/main/strategyRuntime.ts
```

这个文件负责把 Electron、账号服务、交易窗口 runtime 和本包连接起来。

## 主要导出

常用导出：

- `strategyCatalogService`
- `compileStrategySource`
- `strategyRunHistoryService`
- `StrategyBotRuntimeService`
- `StrategyRunRepository`
- `StrategyBotRepository`
- `StrategyExecutor`
- `StrategyRuntimePorts`

## 设计约束

- bot 是唯一生命周期入口。
- run 是持久化运行记录，不承载直接启动语义。
- 包内不引入 Electron 依赖。
- 宿主相关能力必须通过 `ports.ts` 注入。
- 运行状态修复发生在启动阶段：未完成的 bot/run 会被标记为中断或错误。
- 策略执行上下文由 runtime service 构造，策略代码只通过注入的 `context` 访问市场、账号、日志和交易能力。

## 验证命令

```powershell
pnpm --filter @polytrader/strategy-runtime run build
pnpm run typecheck
pnpm --filter @polytrader2/app run lint
```
