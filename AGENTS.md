Polymarket API 文档
http://docs.polymarket.com/llms.txt

# Development Guidelines

- 所有类成员必须显式声明 `public`，不能依赖 TypeScript 的隐式 public。
- 所有类的成员变量必须声明为 `private`，并采用下划线前缀命名；如需外部访问，必须通过 `get` 或 `set` 访问器暴露；如果外部没有访问需求，不要添加无意义的 `get` 或 `set` 访问器。
- 尽量面向对象编程，不要在类所在文件中使用文件级函数承载类的内部逻辑；这类辅助逻辑应优先实现为类的 `private` 方法，避免混淆面向对象和面向过程的写法，降低长期维护难度。
- 强类型事件机制必须使用 `EventEmitter<EventMap>` 泛型继承方案，不要使用同名 `declare interface` 与类合并的方式声明 `on` / `emit` 类型。
- 所有业务模块的导出必须集中放在文件底部，禁止在 `class` / `function` / `const` / `type` / `interface` 等声明处直接使用 `export`；作为集中导出入口的 `index.ts` / barrel 文件必须直接使用 `export { ... } from './...'` / `export type { ... } from './...'` 转导出，不要为了导出而先 `import` 再 `export`。
- 所有共享包的根导出必须只暴露跨包实际需要使用的公共 API，不要为了省事在根 `index.ts` 中盲目 `export *` 或导出包内实现细节；仅包内使用的函数、类型、schema、query、helper 等应留在内部模块中，需要稳定子域入口时再通过明确的子路径导出（例如 `./schema`）。
- 禁止为了调用方便在其他模块中重导出外部包或上游模块已经定义的类型；调用方必须直接从类型的原始定义位置导入，避免形成二次导出链路和模糊的所有权边界。
- 业务源码 `.ts` / `.tsx` 文件名必须使用 camelCase；`.vue` 组件文件名必须使用 PascalCase；`.html` 文件名必须使用 kebab-case；目录名必须使用 kebab-case。工具配置文件、类型声明文件、框架或构建工具约定入口文件可以保留生态约定命名，例如 `*.config.ts`、`*.d.ts`、`index.ts`、`main.ts`、`preload.ts`。
- 加载提示不要使用可见文字（例如“加载中”“正在加载”），统一使用账号管理余额加载同款的旋转图标效果；需要说明时放在 title/aria-label 等非可见辅助属性中。
- 项目仍处于开发和重构阶段，默认不要为了旧实现、旧数据文件、旧字段或旧接口增加兼容代码；除非明确要求保留兼容，否则应直接收敛到新的设计，删除旧路径，避免长期维护负担。

## 分支与发布流程

- 日常开发必须基于 `develop` 分支完成，并把开发提交推送到 `origin/develop`。
- `master` 是受保护主分支，不要直接向 `master` push；需要将 `develop` 合并到 `master` 时，必须创建 `develop` -> `master` 的 Pull Request。
- 正式 release 只从 `master` 发布：先确认 `develop` 的变更已经通过 PR 合并到 `master`，再在 `master` 最新提交上创建并推送 `v*` 语义化版本 tag，例如 `v1.0.23`。
- 推送 `v*` tag 会触发 `.github/workflows/release-windows.yml`，该 workflow 会从 tag 写入桌面端版本号，执行校验、构建并发布 Windows 安装包到 GitHub draft release。
- GitHub draft release 生成后，需要在 GitHub Releases 页面人工确认 tag、版本号、安装包文件名和发布说明，再手动 publish。
- 详细操作步骤以 `docs/release-process.md` 为准；本地安装包验证流程参考 `docs/windows-installer-vm-smoke-test.md`。

## 多语言与国际化规范

- 项目默认采用英文优先（`en-US`），并支持中文（`zh-CN`）；新增界面、窗口标题、弹窗、按钮、表头、空状态、错误提示、title、aria-label、placeholder 等用户可感知文案时，必须先提供英文文案，再补充中文资源。
- 禁止在业务代码、Vue 模板、组合式函数、主进程、preload、共享包和运行时服务中直接硬编码中文用户文案；中文只能出现在明确的语言资源、自动翻译词典、测试样例或确有业务含义的数据常量中。
- Renderer 侧用户文案必须优先通过 `apps/desktop/src/renderer/src/shared/i18n/messages.ts` 中的语义化 key 管理，并通过 `vue-i18n` 的 `t(...)` 或现有 i18n helper 使用；不要为了省事把中文或英文直接写在模板里。
- 错误提示也属于用户文案。新增 `throw new Error(...)`、IPC 返回错误、表单校验错误、toast/dialog 文案时，应使用英文默认表达，并在需要展示到界面的位置接入 i18n 资源；底层异常消息无法本地化时，可以原样透传，但包裹文案必须英文优先。
- key 命名必须表达业务语义，不要使用中文拼音、页面位置或临时编号；优先复用已有 `common`、`account`、`order`、`position`、`strategy`、`bot`、`tradingWindow` 等命名空间，只有明确新子域时再新增命名空间。
- HTML 入口、窗口标题和默认 locale 必须保持英文优先；`lang` 默认使用 `en-US`，系统语言或用户偏好切换到中文时再显示中文。
- 加载状态不得使用可见文字；需要无障碍说明时，使用本地化后的 `title` / `aria-label`，视觉上仍使用统一旋转图标。
- 完成涉及文案的修改后，必须用 `rg -n "[\p{Han}]" apps packages -S --glob "*.ts" --glob "*.vue" --glob "!**/shared/i18n/messages.ts" --glob "!**/shared/i18n/autoTranslate.ts"` 检查是否有中文硬编码残留；若存在残留，必须确认它是数据常量、测试样例或其他非用户文案，否则应迁入 i18n 资源。

注意事项
1、本项目默认数据目录：
  - Windows：`%APPDATA%\Polytrader2\data`，通常等价于 `%USERPROFILE%\AppData\Roaming\Polytrader2\data`
  - macOS：`~/Library/Application Support/Polytrader2/data`
2、默认 SQLite 数据库文件路径：
  - Windows：`%APPDATA%\Polytrader2\data\polytrader2.db`
  - macOS：`~/Library/Application Support/Polytrader2/data/polytrader2.db`
