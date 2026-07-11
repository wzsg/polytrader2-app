Polymarket API documentation
http://docs.polymarket.com/llms.txt

# Development Guidelines

- All class members must explicitly declare `public`; do not rely on TypeScript's implicit public visibility.
- All class fields must be declared `private` and use an underscore prefix. If external access is required, expose the field through a `get` or `set` accessor. Do not add meaningless accessors when no external access is needed.
- Prefer object-oriented programming. Do not use file-level functions in a class file to implement the class's internal logic. Such helper logic should preferably be implemented as `private` class methods to avoid mixing object-oriented and procedural styles and to reduce long-term maintenance complexity.
- Strongly typed event mechanisms must use the generic `EventEmitter<EventMap>` inheritance pattern. Do not declare `on` / `emit` types by merging a same-named `declare interface` with the class.
- All business-module exports must be grouped at the bottom of the file. Do not use `export` directly on `class`, `function`, `const`, `type`, `interface`, or similar declarations. An `index.ts` or barrel file used as a centralized export entry point must re-export directly with `export { ... } from './...'` / `export type { ... } from './...'`; do not import first solely for the purpose of exporting afterward.
- The root exports of every shared package must expose only public APIs that are actually needed across packages. Do not indiscriminately use `export *` or expose package-internal implementation details from a root `index.ts`. Functions, types, schemas, queries, helpers, and similar items used only within the package must remain internal. When a stable subdomain entry point is needed, expose it through an explicit subpath such as `./schema`.
- Do not re-export types defined by external packages or upstream modules merely for caller convenience. Callers must import types directly from their original definition location to avoid secondary export chains and ambiguous ownership boundaries.
- Business-source `.ts` / `.tsx` filenames must use camelCase; `.vue` component filenames must use PascalCase; `.html` filenames must use kebab-case; directory names must use kebab-case. Tool configuration files, type declaration files, and framework- or build-tool-defined entry points may retain ecosystem-standard names such as `*.config.ts`, `*.d.ts`, `index.ts`, `main.ts`, and `preload.ts`.
- Loading indicators must not use visible text such as "Loading" or "Loading in progress." Use the same spinner effect as the account-management balance loader. If an explanation is needed, place it in non-visible accessibility attributes such as `title` or `aria-label`.
- The project is still under development and refactoring. By default, do not add compatibility code for legacy implementations, data files, fields, or APIs. Unless backward compatibility is explicitly required, converge directly on the new design and remove legacy paths to avoid long-term maintenance burden.

## Branching and Release Process

- Day-to-day development must be performed on the `develop` branch, and development commits must be pushed to `origin/develop`.
- `master` is a protected primary branch. Do not push directly to `master`. To merge `develop` into `master`, create a `develop` -> `master` Pull Request.
- Official releases must be published only from `master`. First confirm that changes from `develop` have been merged into `master` through a PR, then create and push a semantic-versioned `v*` tag, such as `v1.0.23`, on the latest commit of `master`.
- Pushing a `v*` tag triggers `.github/workflows/release-windows.yml`. This workflow derives the desktop app version from the tag, runs validation and builds, and publishes the Windows installer to a GitHub draft release.
- After the GitHub draft release is generated, manually verify the tag, version number, installer filename, and release notes on the GitHub Releases page, then publish it manually.
- Follow `docs/release-process.md` for detailed procedures. See `docs/windows-installer-vm-smoke-test.md` for the local installer verification process.

## Localization and Internationalization Guidelines

- The project is English-first (`en-US`) and also supports Chinese (`zh-CN`). When adding user-visible text for interfaces, window titles, dialogs, buttons, table headers, empty states, error messages, `title`, `aria-label`, `placeholder`, or similar elements, provide the English copy first and then add the Chinese resource.
- Do not hard-code Chinese user-facing text in business code, Vue templates, composables, the main process, preload scripts, shared packages, or runtime services. Chinese may appear only in explicit localization resources, automatic-translation dictionaries, test samples, or data constants where it has genuine business meaning.
- Renderer-side user-facing text must preferably be managed with semantic keys in `apps/desktop/src/renderer/src/shared/i18n/messages.ts` and accessed through `vue-i18n`'s `t(...)` or an existing i18n helper. Do not hard-code Chinese or English directly in templates for convenience.
- Error messages are also user-facing text. New `throw new Error(...)` messages, IPC-returned errors, form-validation errors, and toast/dialog copy must use English as the default. Where they are displayed in the UI, integrate them with localization resources. Low-level exception messages that cannot be localized may be passed through unchanged, but any wrapping text must be English-first.
- Keys must express business semantics. Do not use Chinese pinyin, page positions, or temporary numbers. Prefer reusing existing namespaces such as `common`, `account`, `order`, `position`, `strategy`, `bot`, and `tradingWindow`; add a new namespace only for a clearly distinct subdomain.
- HTML entry points, window titles, and the default locale must remain English-first. The default `lang` must be `en-US`; display Chinese only when the system language or user preference switches to Chinese.
- Loading states must not use visible text. When an accessibility description is needed, use a localized `title` / `aria-label`, while visually retaining the standardized spinner.
- After completing changes that involve user-facing copy, run `rg -n "[\p{Han}]" apps packages -S --glob "*.ts" --glob "*.vue" --glob "!**/shared/i18n/messages.ts" --glob "!**/shared/i18n/autoTranslate.ts"` to check for remaining hard-coded Chinese. Any matches must be confirmed as data constants, test samples, or other non-user-facing text; otherwise, move them into localization resources.

## Electron Smoke Tests

- Smoke tests involving `better-sqlite3`, SQLite workers, Electron main-process services, or other native dependencies must run through the desktop Electron runtime. Do not run them directly with system `node` or `pnpm exec tsx`. The system Node and Electron Node ABIs may differ; running them directly can produce a `NODE_MODULE_VERSION` mismatch, and the results would not represent the actual desktop runtime.
- Use the standardized `apps/desktop/scripts/run-electron-node.mjs` launcher. Add a `smoke:*` command to `apps/desktop/package.json` in the form `node scripts/run-electron-node.mjs scripts/<name>.mjs`, then run it from the repository root with `pnpm.cmd --filter @polytrader2/app run smoke:<name>`.
- Scripts that test SQLite writes, migrations, or data transformations must create an isolated temporary `userDataPath`, call `initDb({ userDataPath, migrationsFolder })`, and always call `closeDb()` and delete the temporary directory in a `finally` block. Performance smoke tests must never write to the default application database.
- Performance comparisons must use the same snapshot, SQLite schema, and data volume for every approach, with a separate temporary database for each approach. Report the event count, associated market count, batch count, data size, download time, write time, and end-to-end total time.
- When comparing "streamed download + batched writes" with "complete download + single write," the streamed approach must call `bulkUpsert` immediately after each page arrives, while the single-write approach must collect the complete snapshot first and then call `bulkUpsert` exactly once. In addition to total duration, explain the complete snapshot's memory usage, cross-SQLite-worker transfer overhead, long-transaction write locking, and risk of having to redo the entire operation after failure.
- The existing event-sync write benchmark script is `apps/desktop/scripts/event-sync-write-benchmark.mjs`. Run it with `pnpm.cmd --filter @polytrader2/app run smoke:event-sync-write`.

## Notes

1. Default project data directories:
   - Windows: `%APPDATA%\Polytrader2\data`, typically equivalent to `%USERPROFILE%\AppData\Roaming\Polytrader2\data`
   - macOS: `~/Library/Application Support/Polytrader2/data`
2. Default SQLite database file paths:
   - Windows: `%APPDATA%\Polytrader2\data\polytrader2.db`
   - macOS: `~/Library/Application Support/Polytrader2/data/polytrader2.db`
