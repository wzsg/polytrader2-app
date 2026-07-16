import { spawnSync } from 'child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const NODE_VERSION = '24.9.0';
const NODE_RUNTIME_ARCHIVE = `node-v${NODE_VERSION}-darwin-arm64.tar.gz`;
const NODE_RUNTIME_SHA256 = '961024296c2a8e60daed0784f8b61e0fab5c51d197502a92eff052c72b53209b';
const NODE_RUNTIME_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_RUNTIME_ARCHIVE}`;
const NODE_RUNTIME_ABI = '137';
const SIGNING_IDENTITY = 'Developer ID Application: YongKui Zhao (6X3K4446Z2)';
const SIGNING_NAME = 'YongKui Zhao (6X3K4446Z2)';

class MacPackager {
  #appDir;
  #repoRoot;
  #stageDir;
  #notarize;

  constructor(argv) {
    this.#appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    this.#repoRoot = resolve(this.#appDir, '../..');
    this.#stageDir = join(tmpdir(), 'polytrader2-mac-package-stage');
    this.#notarize = argv.includes('--notarize');
  }

  run() {
    let exitCode = 0;
    try {
      this.#assertHostPlatform();
      this.#assertSigningIdentity();
      this.#prepareStage();
      this.#writePackageMetadata();
      this.#removePackagedSourceArchives();
      this.#prepareStrategyRuntime();
      this.#rebuildNativeModules();
      this.#assertNativeModules();
      const configPath = this.#writeBuilderConfig();
      this.#runElectronBuilder(configPath);
      this.#assertArtifacts();
    } catch (error) {
      if (error && typeof error === 'object' && 'exitCode' in error) {
        exitCode = Number(error.exitCode) || 1;
      } else {
        throw error;
      }
    } finally {
      this.#restoreWorkspaceInstall();
    }

    if (exitCode !== 0) process.exit(exitCode);
  }

  #assertHostPlatform() {
    if (process.platform !== 'darwin' || process.arch !== 'arm64') {
      throw new Error('macOS packaging is supported only on Apple Silicon hosts');
    }
  }

  #assertSigningIdentity() {
    if (process.env.CSC_LINK) return;
    const result = this.#run('security', ['find-identity', '-v', '-p', 'codesigning'], {
      captureOutput: true,
    });
    if (!result.includes(SIGNING_IDENTITY)) {
      throw new Error(`Missing signing identity: ${SIGNING_IDENTITY}`);
    }
  }

  #prepareStage() {
    if (existsSync(this.#stageDir)) {
      rmSync(this.#stageDir, { recursive: true, force: true });
    }

    this.#runPnpm(
      ['--filter', '@polytrader2/app', 'deploy', '--legacy', '--prod', this.#stageDir],
      { cwd: this.#repoRoot },
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
      ['install', '--config.confirmModulesPurge=false', '--ignore-scripts'],
      { cwd: this.#repoRoot },
      { P2_SKIP_POSTINSTALL_REBUILD: '1' },
    );
  }

  #writePackageMetadata() {
    const packageJsonPath = join(this.#stageDir, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (packageJson.scripts) delete packageJson.scripts.postinstall;
    delete packageJson.packageManager;
    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  }

  #removePackagedSourceArchives() {
    const isolatedVmDir = join(this.#stageDir, 'node_modules', 'isolated-vm');
    if (!existsSync(isolatedVmDir)) return;

    for (const entry of readdirSync(isolatedVmDir)) {
      if (!/^isolated-vm-[\d.]+\.tgz$/.test(entry)) continue;
      rmSync(join(isolatedVmDir, entry), { force: true });
    }
  }

  #prepareStrategyRuntime() {
    const strategyRuntimeDir = join(this.#stageDir, 'resources', 'strategy-runtime');
    const runtimeDir = join(strategyRuntimeDir, 'darwin-arm64');
    const archivePath = join(this.#stageDir, NODE_RUNTIME_ARCHIVE);
    const extractDir = join(this.#stageDir, 'node-runtime-extract');
    const localIsolatedVm = join(this.#repoRoot, 'node_modules', 'isolated-vm');
    const localNodeGypBuild = join(this.#repoRoot, 'node_modules', 'node-gyp-build');

    mkdirSync(strategyRuntimeDir, { recursive: true });
    this.#run('curl', [
      '--fail',
      '--location',
      '--silent',
      '--show-error',
      NODE_RUNTIME_URL,
      '--output',
      archivePath,
    ]);
    const checksum = this.#run('shasum', ['-a', '256', archivePath], {
      captureOutput: true,
    })
      .trim()
      .split(/\s+/)[0];
    if (checksum !== NODE_RUNTIME_SHA256) {
      throw new Error(`Unexpected Node runtime checksum: ${checksum}`);
    }

    mkdirSync(extractDir, { recursive: true });
    this.#run('tar', ['-xzf', archivePath, '-C', extractDir]);
    mkdirSync(join(runtimeDir, 'bin'), { recursive: true });
    cpSync(
      join(extractDir, `node-v${NODE_VERSION}-darwin-arm64`, 'bin', 'node'),
      join(runtimeDir, 'bin', 'node'),
    );
    rmSync(archivePath, { force: true });
    rmSync(extractDir, { recursive: true, force: true });

    if (!existsSync(localIsolatedVm) || !existsSync(localNodeGypBuild)) {
      throw new Error('Missing local strategy runtime dependencies; run pnpm install first');
    }

    const runtimeModulesDir = join(runtimeDir, 'node_modules');
    const isolatedVmDir = join(runtimeModulesDir, 'isolated-vm');
    mkdirSync(runtimeModulesDir, { recursive: true });
    mkdirSync(join(isolatedVmDir, 'prebuilds', 'darwin-arm64'), { recursive: true });
    copyFileSync(join(localIsolatedVm, 'package.json'), join(isolatedVmDir, 'package.json'));
    copyFileSync(join(localIsolatedVm, 'isolated-vm.js'), join(isolatedVmDir, 'isolated-vm.js'));
    copyFileSync(
      join(localIsolatedVm, 'prebuilds', 'darwin-arm64', `isolated-vm.abi${NODE_RUNTIME_ABI}.node`),
      join(isolatedVmDir, 'prebuilds', 'darwin-arm64', `isolated-vm.abi${NODE_RUNTIME_ABI}.node`),
    );
    cpSync(localNodeGypBuild, join(runtimeModulesDir, 'node-gyp-build'), { recursive: true });
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
        '--parallel',
      ],
      { cwd: this.#repoRoot },
    );
  }

  #assertNativeModules() {
    const betterSqliteBinding = join(
      this.#stageDir,
      'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    );
    const runtimeNode = join(this.#stageDir, 'resources/strategy-runtime/darwin-arm64/bin/node');
    const isolatedVm = join(
      this.#stageDir,
      'resources/strategy-runtime/darwin-arm64/node_modules/isolated-vm',
    );
    if (!existsSync(betterSqliteBinding)) {
      throw new Error(`Missing native binding after rebuild: ${betterSqliteBinding}`);
    }
    if (!existsSync(runtimeNode)) throw new Error(`Missing strategy runtime: ${runtimeNode}`);
    this.#run(runtimeNode, [
      '-e',
      'if (!require(process.argv[1]).Isolate) process.exit(1)',
      isolatedVm,
    ]);
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
          from: join(this.#stageDir, 'out/mcp-stdio-bridge/mcp-stdio-bridge.js'),
          to: 'mcp-stdio-bridge/mcp-stdio-bridge.js',
        },
        {
          from: join(this.#stageDir, 'resources/strategy-runtime'),
          to: 'strategy-runtime',
          filter: ['**/*'],
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
      mac: {
        identity: SIGNING_NAME,
        icon: join(this.#stageDir, 'build/icon.icns'),
        target: [
          { target: 'dmg', arch: ['arm64'] },
          { target: 'zip', arch: ['arm64'] },
        ],
        artifactName: '${productName}-${version}-mac-${arch}.${ext}',
        hardenedRuntime: true,
        entitlements: join(this.#stageDir, 'build/entitlements.mac.plist'),
        gatekeeperAssess: false,
        notarize: this.#notarize || false,
      },
      dmg: {
        title: '${productName} ${version}',
        contents: [
          { x: 130, y: 220, type: 'file' },
          { x: 410, y: 220, type: 'link', path: '/Applications' },
        ],
      },
    };

    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    return configPath;
  }

  #runElectronBuilder(configPath) {
    const builderCli = join(this.#repoRoot, 'node_modules/electron-builder/cli.js');
    this.#run(
      process.execPath,
      [
        builderCli,
        '--projectDir',
        this.#stageDir,
        '--config',
        configPath,
        '--mac',
        '--arm64',
        '--publish',
        'never',
      ],
      { cwd: this.#repoRoot },
      {},
      true,
    );
  }

  #assertArtifacts() {
    const packageJson = JSON.parse(readFileSync(join(this.#stageDir, 'package.json'), 'utf-8'));
    const version = packageJson.version;
    const dmgPath = join(this.#repoRoot, 'dist', `Polytrader2-${version}-mac-arm64.dmg`);
    const zipPath = join(this.#repoRoot, 'dist', `Polytrader2-${version}-mac-arm64.zip`);
    const updateInfoPath = join(this.#repoRoot, 'dist', 'latest-mac.yml');
    const appPath = join(this.#repoRoot, 'dist', 'mac-arm64', 'Polytrader2.app');
    if (!existsSync(dmgPath) || !existsSync(zipPath) || !existsSync(updateInfoPath)) {
      throw new Error('macOS package artifacts are incomplete');
    }
    this.#run('codesign', ['--verify', '--deep', '--strict', appPath]);
  }

  #runPnpm(args, options, envOverrides = { CI: 'true' }) {
    if (process.env.npm_execpath) {
      this.#run(process.execPath, [process.env.npm_execpath, ...args], options, envOverrides);
      return;
    }
    this.#run('pnpm', args, options, envOverrides);
  }

  #run(command, args, options = {}, envOverrides = {}, cleanPackageManagerEnv = false) {
    const env = { ...process.env };
    delete env.CI;
    if (cleanPackageManagerEnv) {
      for (const key of Object.keys(env)) {
        if (/^(npm|pnpm)_/i.test(key)) delete env[key];
      }
      delete env.INIT_CWD;
      delete env.npm_execpath;
      delete env.npm_node_execpath;
      delete env.npm_config_user_agent;
      delete env.npm_lifecycle_event;
    }
    Object.assign(env, envOverrides);
    const { captureOutput = false, ...spawnOptions } = options;
    const result = spawnSync(command, args, {
      ...spawnOptions,
      env,
      encoding: 'utf8',
      stdio: captureOutput ? 'pipe' : 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      console.error(`${command} exited with status ${result.status ?? 1}`);
      const error = new Error(`${command} exited with status ${result.status ?? 1}`);
      error.exitCode = result.status ?? 1;
      throw error;
    }
    return result.stdout ?? '';
  }
}

new MacPackager(process.argv.slice(2)).run();
