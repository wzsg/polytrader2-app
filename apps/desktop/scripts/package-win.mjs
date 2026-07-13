import { spawnSync } from 'child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

class WindowsPackager {
  #appDir;
  #repoRoot;
  #stageDir;
  #publishMode;

  constructor(argv) {
    this.#appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    this.#repoRoot = resolve(this.#appDir, '../..');
    this.#stageDir = join(tmpdir(), 'polytrader2-win-package-stage');
    this.#publishMode = this.#readPublishMode(argv);
  }

  run() {
    let exitCode = 0;
    try {
      this.#prepareStage();
      this.#writePackageMetadata();
      this.#rebuildNativeModules();
      this.#assertNativeModules();
      const configPath = this.#writeBuilderConfig();
      this.#runElectronBuilder(configPath);
    } catch (error) {
      if (error && typeof error === 'object' && 'exitCode' in error) {
        exitCode = Number(error.exitCode) || 1;
      } else {
        throw error;
      }
    } finally {
      this.#restoreWorkspaceInstall();
    }

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  }

  #readPublishMode(argv) {
    const publishIndex = argv.indexOf('--publish');
    if (publishIndex >= 0) return argv[publishIndex + 1] ?? 'always';

    const publishArg = argv.find((arg) => arg.startsWith('--publish='));
    if (publishArg) return publishArg.slice('--publish='.length) || 'always';

    return null;
  }

  #prepareStage() {
    if (existsSync(this.#stageDir)) {
      rmSync(this.#stageDir, { recursive: true, force: true });
    }

    this.#runPnpm(
      ['--filter', '@polytrader2/app', 'deploy', '--legacy', '--prod', this.#stageDir],
      {
        cwd: this.#repoRoot,
      },
      {
        CI: 'true',
        npm_config_confirm_modules_purge: 'false',
        npm_config_ignore_scripts: 'true',
        P2_SKIP_POSTINSTALL_REBUILD: '1',
      },
    );
  }

  #restoreWorkspaceInstall() {
    this.#runPnpm(
      ['install', '--config.confirmModulesPurge=false'],
      {
        cwd: this.#repoRoot,
      },
      {},
    );
  }

  #writePackageMetadata() {
    const packageJsonPath = join(this.#stageDir, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    if (packageJson.scripts) {
      delete packageJson.scripts.postinstall;
    }
    delete packageJson.packageManager;

    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  }

  #rebuildNativeModules() {
    const electronVersion = this.#electronVersion();
    const rebuildCli = join(this.#repoRoot, 'node_modules/@electron/rebuild/lib/cli.js');
    this.#run(
      process.execPath,
      [
        rebuildCli,
        '--module-dir',
        this.#stageDir,
        '--version',
        electronVersion,
        '--force',
        '--only',
        'better-sqlite3',
      ],
      {
        cwd: this.#repoRoot,
      },
      {},
    );
  }

  #assertNativeModules() {
    const betterSqliteBinding = join(
      this.#stageDir,
      'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    );
    if (!existsSync(betterSqliteBinding)) {
      throw new Error(`Missing native binding after rebuild: ${betterSqliteBinding}`);
    }
  }

  #electronVersion() {
    const packageJson = JSON.parse(readFileSync(join(this.#appDir, 'package.json'), 'utf-8'));
    const value = packageJson.devDependencies?.electron ?? packageJson.dependencies?.electron;
    if (!value) throw new Error('Electron version is missing from apps/desktop/package.json');
    return String(value).replace(/^[^\d]*/, '');
  }

  #writeBuilderConfig() {
    const configPath = join(this.#stageDir, 'electron-builder.generated.json');
    const config = {
      appId: 'com.wzsg.fbapp',
      productName: 'Polytrader2',
      copyright: 'Copyright © 2026 wzsg',
      directories: {
        output: join(this.#repoRoot, 'dist'),
        buildResources: join(this.#stageDir, 'build'),
      },
      files: ['out/**', 'build/**', 'package.json'],
      extraResources: [
        {
          from: join(this.#stageDir, 'resources/strategy-runtime'),
          to: 'strategy-runtime',
          filter: ['**/*'],
        },
        {
          from: join(this.#stageDir, 'node_modules/isolated-vm'),
          to: 'strategy-runtime/win32-x64/node_modules/isolated-vm',
        },
        {
          from: join(this.#stageDir, 'node_modules/node-gyp-build'),
          to: 'strategy-runtime/win32-x64/node_modules/node-gyp-build',
        },
        {
          from: join(this.#stageDir, 'node_modules/@noble'),
          to: 'node_modules/@noble',
        },
        {
          from: join(this.#stageDir, 'node_modules/@scure'),
          to: 'node_modules/@scure',
        },
        {
          from: join(this.#stageDir, 'node_modules/isows'),
          to: 'node_modules/isows',
        },
        {
          from: join(this.#stageDir, 'node_modules/ws'),
          to: 'node_modules/ws',
        },
      ],
      asar: true,
      asarUnpack: [
        'out/main/strategyWorker.mjs',
        'out/main/workerProtocol.js',
        'out/main/chunks/**',
        '**/*.node',
        'node_modules/better-sqlite3/**',
        'node_modules/@duckdb/node-bindings*/**',
      ],
      npmRebuild: false,
      publish: {
        provider: 'github',
        owner: 'wzsg',
        repo: 'polytrader2-app',
        releaseType: 'draft',
      },
      win: {
        icon: join(this.#stageDir, 'build/icon.ico'),
        target: [
          {
            target: 'nsis',
            arch: ['x64'],
          },
        ],
        artifactName: '${productName}-Setup-${version}.${ext}',
      },
      nsis: {
        oneClick: true,
        perMachine: false,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: '${productName}',
      },
    };

    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    return configPath;
  }

  #runElectronBuilder(configPath) {
    const builderCli = join(this.#repoRoot, 'node_modules/electron-builder/cli.js');
    const args = [
      builderCli,
      '--projectDir',
      this.#stageDir,
      '--config',
      configPath,
      '--win',
      'nsis',
    ];

    if (this.#publishMode) {
      args.push('--publish', this.#publishMode);
    } else {
      args.push('--publish', 'never');
    }

    this.#run(
      process.execPath,
      args,
      {
        cwd: this.#repoRoot,
      },
      {},
      true,
    );
  }

  #runPnpm(args, options, envOverrides = { CI: 'true' }) {
    if (process.env.npm_execpath) {
      this.#run(process.execPath, [process.env.npm_execpath, ...args], options, envOverrides);
      return;
    }

    this.#run('pnpm', args, options, envOverrides);
  }

  #run(command, args, options, envOverrides = {}, cleanPackageManagerEnv = false) {
    const env = { ...process.env };
    delete env.CI;
    if (cleanPackageManagerEnv) {
      for (const key of Object.keys(env)) {
        if (/^(npm|pnpm)_/i.test(key)) {
          delete env[key];
        }
      }
      delete env.INIT_CWD;
      delete env.npm_execpath;
      delete env.npm_node_execpath;
      delete env.npm_config_user_agent;
      delete env.npm_lifecycle_event;
    }
    Object.assign(env, envOverrides);

    const result = spawnSync(command, args, {
      ...options,
      env,
      stdio: 'inherit',
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
      const error = new Error(`${command} exited with status ${result.status ?? 1}`);
      error.exitCode = result.status ?? 1;
      throw error;
    }
  }
}

new WindowsPackager(process.argv.slice(2)).run();
