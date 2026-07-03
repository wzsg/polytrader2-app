import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';

class LocalDbRebuilder {
  constructor() {
    this._scriptDir = dirname(fileURLToPath(import.meta.url));
    this._projectRoot = resolve(this._scriptDir, '..');
    this._workspaceRoot = resolve(this._projectRoot, '..', '..');
    this._migrationsFolder = join(this._projectRoot, 'drizzle');
    this._localFolder = join(this._workspaceRoot, '.local');
    this._sqlite = 'sqlite3.exe';
    this._stamp = this._createStamp();
    this._userDataFolder = this._resolveUserDataFolder();
    this._dbPath = join(this._userDataFolder, 'polytrader2.db');
    this._backupFolder = join(this._userDataFolder, 'backups');
    this._skipGenerate = process.argv.includes('--skip-generate');
  }

  run() {
    this._ensureFolders();
    this._ensureSqlite();
    this._ensureDatabaseExists();

    if (!this._skipGenerate) {
      this._archiveAndRegenerateMigrations();
    }

    const backupPath = this._backupDatabase();
    const rebuiltPath = this._createFreshDatabase();
    this._restoreData({ backupPath, rebuiltPath });
    this._verifyRestoredDatabase({ backupPath, rebuiltPath });
    this._replaceLiveDatabase(rebuiltPath);
    this._verifyLiveDatabase();
  }

  _archiveAndRegenerateMigrations() {
    const archivePath = join(this._localFolder, `drizzle-before-rebuild-${this._stamp}`);
    cpSync(this._migrationsFolder, archivePath, { recursive: true });

    for (const entry of readdirSync(this._migrationsFolder, { withFileTypes: true })) {
      rmSync(join(this._migrationsFolder, entry.name), { force: true, recursive: true });
    }

    this._run('pnpm', ['--filter', '@polytrader2/app', 'run', 'db:generate'], {
      cwd: this._workspaceRoot,
    });
    console.log(`Archived previous migrations: ${archivePath}`);
  }

  _backupDatabase() {
    const backupPath = join(this._backupFolder, `polytrader2-before-rebuild-${this._stamp}.db`);
    this._runSqlite(this._dbPath, [`.backup '${this._escapeSqlLiteral(backupPath)}'`]);
    console.log(`Backed up database: ${backupPath}`);
    return backupPath;
  }

  _createFreshDatabase() {
    const rebuiltPath = join(this._userDataFolder, `polytrader2-rebuilt-${this._stamp}.db`);
    const migrations = readMigrationFiles({ migrationsFolder: this._migrationsFolder });
    const statements = [];

    for (const migration of migrations) {
      statements.push(...migration.sql);
    }

    statements.push(
      'CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric);',
    );

    for (const migration of migrations) {
      statements.push(
        `INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('${this._escapeSqlLiteral(migration.hash)}', ${migration.folderMillis});`,
      );
    }

    statements.push('PRAGMA integrity_check;');
    const output = this._runSqlite(rebuiltPath, statements, { silent: true });
    if (!output.split(/\r?\n/).includes('ok')) {
      throw new Error(`Fresh database integrity check failed: ${output}`);
    }

    console.log(`Created fresh database: ${rebuiltPath}`);
    return rebuiltPath;
  }

  _restoreData({ backupPath, rebuiltPath }) {
    const restoreScriptPath = join(
      this._localFolder,
      `restore-polytrader2-data-${this._stamp}.sql`,
    );
    const tables = this._queryRows(
      rebuiltPath,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name;",
    );
    const statements = [
      'PRAGMA foreign_keys=OFF;',
      `ATTACH DATABASE '${this._escapeSqlLiteral(backupPath)}' AS old;`,
      'BEGIN;',
    ];

    for (const table of tables) {
      const newColumns = this._tableColumns(rebuiltPath, table);
      const oldColumns = this._tableColumns(backupPath, table);
      const oldColumnSet = new Set(oldColumns);
      const commonColumns = newColumns.filter((column) => oldColumnSet.has(column));

      if (!commonColumns.length) {
        continue;
      }

      const columnList = commonColumns.map((column) => this._quoteIdentifier(column)).join(', ');
      statements.push(
        `INSERT INTO ${this._quoteIdentifier(table)} (${columnList}) SELECT ${columnList} FROM old.${this._quoteIdentifier(table)};`,
      );
    }

    statements.push('COMMIT;');
    statements.push('DETACH DATABASE old;');
    statements.push('PRAGMA foreign_keys=ON;');
    writeFileSync(restoreScriptPath, `${statements.join('\n')}\n`, 'utf8');
    this._runSqlite(rebuiltPath, [`.read '${this._escapeSqlLiteral(restoreScriptPath)}'`], {
      silent: true,
    });
    console.log(`Restored data using script: ${restoreScriptPath}`);
  }

  _verifyRestoredDatabase({ backupPath, rebuiltPath }) {
    const integrity = this._queryScalar(rebuiltPath, 'PRAGMA integrity_check;');
    if (integrity !== 'ok') {
      throw new Error(`Restored database integrity check failed: ${integrity}`);
    }

    const oldForeignKeyIssues = this._queryScalar(
      backupPath,
      'SELECT COUNT(*) FROM pragma_foreign_key_check;',
    );
    const newForeignKeyIssues = this._queryScalar(
      rebuiltPath,
      'SELECT COUNT(*) FROM pragma_foreign_key_check;',
    );
    const staleReferences = this._queryScalar(
      rebuiltPath,
      "SELECT COUNT(*) FROM sqlite_master WHERE sql LIKE '%_old%';",
    );

    if (Number(staleReferences) > 0) {
      throw new Error(
        `Restored database still has stale *_old schema references: ${staleReferences}`,
      );
    }

    const tables = this._queryRows(
      rebuiltPath,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name;",
    );
    const mismatches = [];

    for (const table of tables) {
      const oldCount = this._queryScalar(
        backupPath,
        `SELECT COUNT(*) FROM ${this._quoteIdentifier(table)};`,
      );
      const newCount = this._queryScalar(
        rebuiltPath,
        `SELECT COUNT(*) FROM ${this._quoteIdentifier(table)};`,
      );

      if (oldCount !== newCount) {
        mismatches.push(`${table}: old=${oldCount} new=${newCount}`);
      }
    }

    if (mismatches.length) {
      throw new Error(`Row count mismatch after restore:\n${mismatches.join('\n')}`);
    }

    console.log(
      `Verified restored database: integrity=ok, foreign_key_check old=${oldForeignKeyIssues} new=${newForeignKeyIssues}`,
    );
  }

  _replaceLiveDatabase(rebuiltPath) {
    const replacedPath = join(
      this._backupFolder,
      `polytrader2-replaced-during-rebuild-${this._stamp}.db`,
    );
    renameSync(this._dbPath, replacedPath);

    for (const suffix of ['-wal', '-shm']) {
      const sidecarPath = `${this._dbPath}${suffix}`;
      if (existsSync(sidecarPath)) {
        renameSync(
          sidecarPath,
          join(
            this._backupFolder,
            `polytrader2-replaced-during-rebuild-${this._stamp}.db${suffix}`,
          ),
        );
      }
    }

    renameSync(rebuiltPath, this._dbPath);
    console.log(`Replaced live database. Previous live database: ${replacedPath}`);
  }

  _verifyLiveDatabase() {
    const output = this._runSqlite(
      this._dbPath,
      [
        'PRAGMA journal_mode=WAL;',
        'PRAGMA integrity_check;',
        'SELECT COUNT(*) FROM __drizzle_migrations;',
        "SELECT COUNT(*) FROM sqlite_master WHERE sql LIKE '%_old%';",
      ],
      { silent: true },
    );
    console.log(output.trim());
  }

  _tableColumns(dbPath, table) {
    return this._queryRows(dbPath, `PRAGMA table_info('${this._escapeSqlLiteral(table)}');`).map(
      (row) => row.split('|')[1],
    );
  }

  _queryScalar(dbPath, sql) {
    return this._queryRows(dbPath, sql)[0] ?? '';
  }

  _queryRows(dbPath, sql) {
    const output = this._runSqlite(dbPath, [sql], { silent: true });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  _runSqlite(dbPath, statements, options = {}) {
    return this._run(this._sqlite, [dbPath], {
      input: `${statements.join('\n')}\n`,
      cwd: this._workspaceRoot,
      silent: options.silent,
    });
  }

  _run(command, args, options = {}) {
    const result = spawnSync(this._resolveCommand(command), args, {
      cwd: options.cwd ?? this._workspaceRoot,
      input: options.input,
      encoding: 'utf8',
      shell: false,
    });

    if (result.status !== 0) {
      const stdout = result.stdout?.trim() ?? '';
      const stderr = result.stderr?.trim() ?? result.error?.message ?? '';
      throw new Error(
        [`Command failed: ${command} ${args.join(' ')}`, stdout, stderr].filter(Boolean).join('\n'),
      );
    }

    if (result.stderr.trim()) {
      process.stderr.write(result.stderr);
    }

    if (!options.silent && result.stdout.trim()) {
      process.stdout.write(result.stdout);
      process.stdout.write('\n');
    }

    return result.stdout;
  }

  _resolveCommand(command) {
    if (process.platform === 'win32' && command === 'pnpm') {
      return 'pnpm.cmd';
    }

    return command;
  }

  _ensureFolders() {
    mkdirSync(this._backupFolder, { recursive: true });
    mkdirSync(this._localFolder, { recursive: true });
  }

  _ensureSqlite() {
    execFileSync('where.exe', [this._sqlite], { stdio: 'ignore' });
  }

  _ensureDatabaseExists() {
    if (!existsSync(this._dbPath)) {
      throw new Error(`Database does not exist: ${this._dbPath}`);
    }
  }

  _resolveUserDataFolder() {
    const appData = process.env.APPDATA;

    if (!appData) {
      throw new Error('APPDATA is not set');
    }

    return join(appData, 'polytrader2');
  }

  _createStamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');

    return [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      '-',
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join('');
  }

  _quoteIdentifier(value) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  _escapeSqlLiteral(value) {
    return value.replaceAll("'", "''");
  }
}

new LocalDbRebuilder().run();
