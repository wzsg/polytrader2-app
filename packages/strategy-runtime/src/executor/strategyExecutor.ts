import { randomUUID } from 'crypto';
import { type ChildProcess, fork } from 'child_process';
import { existsSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  serializeStrategyError,
  toJsonArray,
  toJsonValue,
  type JsonValue,
  type SerializedStrategyError,
  type StrategyExecutorContract,
  type StrategyExecutorOptions,
  type StrategyExecutorRuntimePaths,
  type StrategyWorkerChildMessage,
  type StrategyWorkerCommand,
  type StrategyWorkerCommandResponse,
  type StrategyWorkerHostCall,
  type StrategyWorkerHostResponse,
} from '@polytrader/bot-runtime-contract';

type ChildIpcMessage = Parameters<NonNullable<ChildProcess['send']>>[0];

interface PendingCommand {
  resolve: (value: JsonValue) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_MEMORY_LIMIT_MB = 128;
const DEFAULT_COMPILE_TIMEOUT_MS = 1_000;
const DEFAULT_CALLBACK_TIMEOUT_MS = 5_000;
const COMMAND_TIMEOUT_BUFFER_MS = 2_000;
const WORKER_FILE = 'strategyWorker.mjs';
const MODULE_DIRNAME = dirname(fileURLToPath(import.meta.url));

class StrategyExecutor implements StrategyExecutorContract {
  private _child: ChildProcess | null = null;
  private readonly _pendingCommands = new Map<string, PendingCommand>();
  private _started = false;
  private _disposed = false;
  private readonly _compiledCode: string;
  private readonly _strategyContext: unknown;
  private readonly _options: StrategyExecutorOptions;

  public constructor(
    compiledCode: string,
    strategyContext: unknown,
    options: StrategyExecutorOptions = {},
  ) {
    this._compiledCode = compiledCode;
    this._strategyContext = strategyContext;
    this._options = options;
  }

  public async start(): Promise<void> {
    if (this._started) return;
    this._disposed = false;
    this.spawnWorker();
    await this.sendCommand(
      {
        kind: 'command',
        id: randomUUID(),
        command: 'start',
        payload: {
          compiledCode: this._compiledCode,
          context: toJsonValue(this._strategyContext),
          memoryLimitMb: this._options.memoryLimitMb ?? DEFAULT_MEMORY_LIMIT_MB,
          compileTimeoutMs: this._options.compileTimeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS,
          callbackTimeoutMs: this._options.callbackTimeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS,
        },
      },
      this.startTimeoutMs(),
    );
    this._started = true;
  }

  public async executeCallback(name: string, ...args: unknown[]): Promise<void> {
    if (!this._started || this._disposed) return;
    await this.sendCommand(
      {
        kind: 'command',
        id: randomUUID(),
        command: 'callback',
        payload: {
          name,
          args: toJsonArray(args),
        },
      },
      (this._options.callbackTimeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS) + COMMAND_TIMEOUT_BUFFER_MS,
    );
  }

  public async stop(): Promise<void> {
    if (!this._started || this._disposed) {
      this.dispose();
      return;
    }
    try {
      await this.sendCommand(
        {
          kind: 'command',
          id: randomUUID(),
          command: 'stop',
          payload: null,
        },
        (this._options.callbackTimeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS) +
          COMMAND_TIMEOUT_BUFFER_MS,
      );
    } finally {
      this.dispose();
    }
  }

  public dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._started = false;
    const child = this._child;
    this._child = null;
    this.rejectAllPending(new Error('Strategy worker has been disposed'));
    if (!child) return;
    if (child.connected) {
      child.send(
        this.toChildIpcMessage({
          kind: 'command',
          id: randomUUID(),
          command: 'dispose',
          payload: null,
        } satisfies StrategyWorkerCommand),
      );
    }
    child.kill();
  }

  private spawnWorker(): void {
    if (this._child) return;
    const workerScript = this.resolveWorkerScriptPath(this._options.runtimePaths);
    if (!existsSync(workerScript)) {
      throw new Error(`Strategy worker file does not exist: ${workerScript}`);
    }

    const nodePath = this.resolveStrategyNodePath(this._options.runtimePaths);
    const moduleDir = this.resolveStrategyModuleDir(nodePath, this._options.runtimePaths);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    if (moduleDir) env.STRATEGY_RUNTIME_MODULE_DIR = moduleDir;

    const child = fork(workerScript, [], {
      execPath: nodePath,
      execArgv: ['--no-node-snapshot'],
      env,
      serialization: 'json',
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    this._child = child;

    child.on('message', (message) => this.handleWorkerMessage(message));
    child.on('error', (error) => this.handleWorkerExit(error));
    child.on('exit', (code, signal) => {
      if (!this._disposed) {
        this.handleWorkerExit(
          new Error(`Strategy worker exited: code=${code ?? 'null'} signal=${signal ?? 'null'}`),
        );
      }
    });
    child.stdout?.on('data', (chunk) => {
      void this.callHost('logger.info', [String(chunk).trim(), { source: 'worker.stdout' }]);
    });
    child.stderr?.on('data', (chunk) => {
      void this.callHost('logger.error', [String(chunk).trim(), { source: 'worker.stderr' }]);
    });
  }

  private sendCommand(message: StrategyWorkerCommand, timeoutMs: number): Promise<JsonValue> {
    const child = this._child;
    if (!child || !child.connected) {
      return Promise.reject(new Error('Strategy worker is not connected'));
    }

    const jsonMessage = this.toChildIpcMessage(message);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingCommands.delete(message.id);
        this.dispose();
        reject(new Error(`Strategy worker command timed out: ${message.command}`));
      }, timeoutMs);

      this._pendingCommands.set(message.id, { resolve, reject, timer });
      child.send(jsonMessage, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this._pendingCommands.delete(message.id);
        reject(error);
      });
    });
  }

  private handleWorkerMessage(raw: unknown): void {
    const message = raw as StrategyWorkerChildMessage;
    if (!message || typeof message !== 'object') return;
    if (message.kind === 'command-response') {
      this.handleCommandResponse(message);
      return;
    }
    if (message.kind === 'host-call') {
      void this.handleHostCall(message);
      return;
    }
    if (message.kind === 'event') {
      if (message.event === 'fatal') {
        void this.callHost('logger.error', ['Strategy worker fatal error', message.payload]);
      }
    }
  }

  private handleCommandResponse(message: StrategyWorkerCommandResponse): void {
    const pending = this._pendingCommands.get(message.id);
    if (!pending) return;
    this._pendingCommands.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(this.errorFromSerialized(message.error));
    }
  }

  private async handleHostCall(message: StrategyWorkerHostCall): Promise<void> {
    try {
      const result = await this.callHost(message.method, message.args);
      this.sendHostResponse({
        kind: 'host-response',
        id: message.id,
        ok: true,
        result: toJsonValue(result),
      });
    } catch (error) {
      this.sendHostResponse({
        kind: 'host-response',
        id: message.id,
        ok: false,
        error: serializeStrategyError(error),
      });
    }
  }

  private sendHostResponse(message: StrategyWorkerHostResponse): void {
    const child = this._child;
    if (!child || !child.connected) return;
    child.send(this.toChildIpcMessage(message));
  }

  private async callHost(method: string, args: unknown[]): Promise<unknown> {
    if (this._options.hostCall) return this._options.hostCall(method, args);
    if (method.startsWith('logger.')) return undefined;
    throw new Error(`Strategy bridge is not implemented: ${method}`);
  }

  private handleWorkerExit(error: Error): void {
    this._started = false;
    this._child = null;
    this.rejectAllPending(error);
    void this.callHost('logger.error', [error.message, { source: 'worker' }]);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this._pendingCommands) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this._pendingCommands.delete(id);
    }
  }

  private startTimeoutMs(): number {
    return (
      (this._options.compileTimeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS) +
      (this._options.callbackTimeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS) +
      COMMAND_TIMEOUT_BUFFER_MS
    );
  }

  private resolveWorkerScriptPath(paths: StrategyExecutorRuntimePaths = {}): string {
    if (paths.workerScriptPath) return paths.workerScriptPath;
    if (paths.isPackaged && paths.resourcesPath) {
      const unpacked = join(paths.resourcesPath, 'app.asar.unpacked', 'out', 'main', WORKER_FILE);
      if (existsSync(unpacked)) return unpacked;
    }
    return join(paths.outMainDir || this.resolveOutMainDir(), WORKER_FILE);
  }

  private resolveOutMainDir(): string {
    return basename(MODULE_DIRNAME) === 'chunks' ? dirname(MODULE_DIRNAME) : MODULE_DIRNAME;
  }

  private resolveStrategyNodePath(paths: StrategyExecutorRuntimePaths = {}): string {
    if (
      paths.nodePath &&
      existsSync(paths.nodePath) &&
      !this.isElectronExecutable(paths.nodePath)
    ) {
      return paths.nodePath;
    }
    const envPath =
      process.env.POLYTRADER_STRATEGY_NODE_PATH ||
      process.env.STRATEGY_NODE_PATH ||
      process.env.npm_node_execpath;
    if (envPath && existsSync(envPath) && !this.isElectronExecutable(envPath)) return envPath;

    if (!paths.resourcesPath && paths.isPackaged) {
      throw new Error('Strategy Node runtime resourcesPath was not provided');
    }
    const bundled = join(
      paths.resourcesPath || '',
      'strategy-runtime',
      `${process.platform}-${process.arch}`,
      process.platform === 'win32' ? 'node.exe' : 'bin/node',
    );
    if (existsSync(bundled)) return bundled;
    if (paths.isPackaged) {
      throw new Error(`Strategy Node 24 runtime was not found: ${bundled}`);
    }
    return process.platform === 'win32' ? 'node.exe' : 'node';
  }

  private resolveStrategyModuleDir(
    nodePath: string,
    paths: StrategyExecutorRuntimePaths = {},
  ): string | undefined {
    if (paths.moduleDir && this.hasIsolatedVmModule(paths.moduleDir)) return paths.moduleDir;
    const envPath =
      process.env.POLYTRADER_STRATEGY_MODULE_DIR || process.env.STRATEGY_RUNTIME_MODULE_DIR;
    if (envPath && this.hasIsolatedVmModule(envPath)) return envPath;

    if (paths.appPath) {
      const appNodeModules = join(paths.appPath, 'node_modules');
      if (this.hasIsolatedVmModule(appNodeModules)) return appNodeModules;
    }
    const cwdNodeModules = join(process.cwd(), 'node_modules');
    if (this.hasIsolatedVmModule(cwdNodeModules)) return cwdNodeModules;
    if (paths.resourcesPath) {
      const resourcesNodeModules = join(paths.resourcesPath, 'node_modules');
      if (this.hasIsolatedVmModule(resourcesNodeModules)) return resourcesNodeModules;
    }
    const bundled = join(dirname(nodePath), 'node_modules');
    if (this.hasIsolatedVmModule(bundled)) return bundled;
    return undefined;
  }

  private hasIsolatedVmModule(moduleDir: string): boolean {
    return existsSync(join(moduleDir, 'isolated-vm', 'package.json'));
  }

  private isElectronExecutable(executablePath: string): boolean {
    return basename(executablePath).toLowerCase().includes('electron');
  }

  private errorFromSerialized(error: SerializedStrategyError): Error {
    const instance = new Error(error.message);
    instance.name = error.name || 'Error';
    if (error.stack) instance.stack = error.stack;
    return instance;
  }

  private toChildIpcMessage(message: unknown): ChildIpcMessage {
    return toJsonValue(message) as ChildIpcMessage;
  }
}

export { StrategyExecutor };
