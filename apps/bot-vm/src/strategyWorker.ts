import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import { join } from 'path';
import type * as Ivm from 'isolated-vm';
import {
  serializeStrategyError,
  toJsonArray,
  toJsonObject,
  toJsonValue,
  type JsonValue,
  type StrategyWorkerChildMessage,
  type StrategyWorkerCommand,
  type StrategyWorkerHostResponse,
  type StrategyWorkerParentMessage,
} from './workerProtocol.js';

type IvmModule = typeof Ivm;
type TimerHandle = ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>;

interface TimerEntry {
  handle: TimerHandle;
  callback: Ivm.Reference<(...args: unknown[]) => unknown>;
  interval: boolean;
}

interface PendingHostPromise {
  resolve: Ivm.Reference<(value: JsonValue) => void>;
  reject: Ivm.Reference<(error: JsonValue) => void>;
  method: string;
  timer: ReturnType<typeof setTimeout>;
}

interface WorkerStartInput {
  compiledCode: string;
  context: JsonValue;
  memoryLimitMb: number;
  compileTimeoutMs: number;
  callbackTimeoutMs: number;
}

const require = createRequire(import.meta.url);
const HOST_CALL_TIMEOUT_MS = 30_000;
const runtimeRequire = createRuntimeRequire();
const ivm = runtimeRequire('isolated-vm') as IvmModule;
let runner: IsolatedStrategyRunner | null = null;

function createRuntimeRequire(): NodeRequire {
  const moduleDir = process.env.STRATEGY_RUNTIME_MODULE_DIR;
  if (moduleDir) {
    return createRequire(join(moduleDir, 'package.json'));
  }
  return require;
}

function sendToParent(message: StrategyWorkerChildMessage): void {
  process.send?.(toJsonValue(message));
}

function sendCommandResponse(
  id: string,
  response: { ok: true; result?: JsonValue } | { ok: false; error: unknown },
): void {
  if (response.ok) {
    sendToParent({
      kind: 'command-response',
      id,
      ok: true,
      result: response.result ?? null,
    });
  } else {
    sendToParent({
      kind: 'command-response',
      id,
      ok: false,
      error: serializeStrategyError(response.error),
    });
  }
}

function handleHostResponse(message: StrategyWorkerHostResponse): void {
  void runner?.settleHostResponse(message);
}

async function handleCommand(message: StrategyWorkerCommand): Promise<void> {
  try {
    switch (message.command) {
      case 'start': {
        if (runner) runner.dispose();
        const payload = toJsonObject(message.payload) as unknown as WorkerStartInput;
        runner = new IsolatedStrategyRunner(payload);
        await runner.start();
        sendCommandResponse(message.id, { ok: true, result: null });
        break;
      }
      case 'callback': {
        if (!runner) throw new Error('Strategy runtime has not started');
        const name = String(message.payload.name || '');
        await runner.executeCallback(name, ...toJsonArray(message.payload.args));
        sendCommandResponse(message.id, { ok: true, result: null });
        break;
      }
      case 'stop': {
        if (runner) {
          await runner.stop();
          runner = null;
        }
        sendCommandResponse(message.id, { ok: true, result: null });
        break;
      }
      case 'dispose': {
        runner?.dispose();
        runner = null;
        sendCommandResponse(message.id, { ok: true, result: null });
        process.exit(0);
      }
    }
  } catch (error) {
    sendCommandResponse(message.id, { ok: false, error });
  }
}

function handleParentMessage(raw: unknown): void {
  const message = raw as StrategyWorkerParentMessage;
  if (!message || typeof message !== 'object') return;
  if (message.kind === 'host-response') {
    handleHostResponse(message);
    return;
  }
  if (message.kind === 'command') {
    void handleCommand(message);
  }
}

function handleFatal(error: unknown): void {
  sendToParent({
    kind: 'event',
    event: 'fatal',
    payload: {
      error: toJsonValue(serializeStrategyError(error)),
    },
  });
  runner?.dispose();
  process.exit(1);
}

class IsolatedStrategyRunner {
  private isolate: Ivm.Isolate | null = null;
  private context: Ivm.Context | null = null;
  private readonly timers = new Map<number, TimerEntry>();
  private readonly pendingHostPromises = new Map<string, PendingHostPromise>();
  private nextTimerId = 1;
  private queue: Promise<void> = Promise.resolve();
  private started = false;
  private disposed = false;

  constructor(private readonly input: WorkerStartInput) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.disposed = false;

    this.isolate = new ivm.Isolate({
      memoryLimit: this.input.memoryLimitMb,
      onCatastrophicError: (message) => {
        this.emitHostCall('logger.error', [`isolated-vm catastrophic error: ${message}`]);
      },
    });
    this.context = this.isolate.createContextSync();
    const jail = this.context.global;
    jail.setSync('global', jail.derefInto());
    jail.setSync('__nextHostCallIdRef', new ivm.Reference(this.nextHostCallId));
    jail.setSync('__registerHostPromiseRef', new ivm.Reference(this.registerHostPromise));
    jail.setSync('__hostCallStartRef', new ivm.Reference(this.hostCallStart));
    jail.setSync('__setTimerRef', new ivm.Reference(this.setTimer));
    jail.setSync('__clearTimerRef', new ivm.Reference(this.clearTimer));
    jail.setSync('__strategyContextPayload', new ivm.ExternalCopy(this.input.context).copyInto());

    this.context.evalSync(this.buildRuntimePrelude(), {
      filename: 'strategy-runtime.js',
      timeout: this.input.compileTimeoutMs,
    });
    this.context.evalSync(this.input.compiledCode, {
      filename: 'strategy.js',
      timeout: this.input.compileTimeoutMs,
    });
    this.context.evalSync(this.buildInstantiationScript(), {
      filename: 'strategy-bootstrap.js',
      timeout: this.input.compileTimeoutMs,
    });

    this.started = true;
    await this.executeCallback('onStart');
  }

  async executeCallback(name: string, ...args: unknown[]): Promise<void> {
    if (!this.started || this.disposed) return;
    const task = async () => {
      if (!this.context || this.disposed) return;
      await this.context.evalClosure(
        `
          const fn = globalThis.__strategyInstance && globalThis.__strategyInstance[$0];
          if (typeof fn !== 'function') return undefined;
          return fn.call(globalThis.__strategyInstance, globalThis.__strategyContext, ...$1);
        `,
        [name, toJsonArray(args)],
        {
          arguments: { copy: true },
          result: { copy: true, promise: true },
          timeout: this.input.callbackTimeoutMs,
        },
      );
    };
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async stop(): Promise<void> {
    if (!this.started || this.disposed) {
      this.dispose();
      return;
    }
    try {
      await this.executeCallback('onStop');
    } finally {
      this.dispose();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.disposeHostPromises();
    this.disposeTimers();
    this.context?.release();
    this.context = null;
    this.isolate?.dispose();
    this.isolate = null;
    this.started = false;
  }

  private disposeTimers(): void {
    for (const [id, timer] of this.timers) {
      if (timer.interval) clearInterval(timer.handle as ReturnType<typeof setInterval>);
      else clearTimeout(timer.handle as ReturnType<typeof setTimeout>);
      timer.callback.release();
      this.timers.delete(id);
    }
  }

  private disposeHostPromises(): void {
    for (const [id, entry] of this.pendingHostPromises) {
      clearTimeout(entry.timer);
      entry.resolve.release();
      entry.reject.release();
      this.pendingHostPromises.delete(id);
    }
  }

  async settleHostResponse(message: StrategyWorkerHostResponse): Promise<void> {
    const entry = this.pendingHostPromises.get(message.id);
    if (!entry) return;
    this.pendingHostPromises.delete(message.id);
    clearTimeout(entry.timer);
    try {
      if (message.ok) {
        await entry.resolve.apply(undefined, [message.result], {
          arguments: { copy: true },
          result: { copy: true },
          timeout: 1_000,
        });
      } else {
        await entry.reject.apply(undefined, [toJsonValue(message.error)], {
          arguments: { copy: true },
          result: { copy: true },
          timeout: 1_000,
        });
      }
    } finally {
      entry.resolve.release();
      entry.reject.release();
    }
  }

  private readonly nextHostCallId = (): string => randomUUID();

  private readonly registerHostPromise = (
    idInput: unknown,
    resolveRef: Ivm.Reference<(value: JsonValue) => void>,
    rejectRef: Ivm.Reference<(error: JsonValue) => void>,
  ): void => {
    const id = readReferenceString(idInput);
    const timer = setTimeout(() => {
      void this.settleHostResponse({
        kind: 'host-response',
        id,
        ok: false,
        error: serializeStrategyError(
          new Error(
            `Strategy host call timed out: ${this.pendingHostPromises.get(id)?.method || id}`,
          ),
        ),
      });
    }, HOST_CALL_TIMEOUT_MS);
    this.pendingHostPromises.set(id, {
      resolve: resolveRef,
      reject: rejectRef,
      method: id,
      timer,
    });
  };

  private readonly hostCallStart = (id: string, method: string, args: unknown[]): void => {
    const normalizedId = String(id);
    const normalizedMethod = String(method);
    const entry = this.pendingHostPromises.get(normalizedId);
    if (entry) entry.method = normalizedMethod;
    sendToParent({
      kind: 'host-call',
      id: normalizedId,
      method: normalizedMethod,
      args: toJsonArray(args),
    });
  };

  private emitHostCall(method: string, args: unknown[]): void {
    sendToParent({
      kind: 'host-call',
      id: randomUUID(),
      method,
      args: toJsonArray(args),
    });
  }

  private readonly setTimer = (
    callbackRef: Ivm.Reference<(...args: unknown[]) => unknown>,
    timeoutRef: Ivm.Reference<number | undefined>,
    argsRef: Ivm.Reference<unknown[]>,
    intervalRef: Ivm.Reference<boolean | undefined>,
  ): number => {
    const id = this.nextTimerId++;
    const timeout = Math.max(0, Number(timeoutRef.copySync() ?? 0));
    const args = toJsonArray(argsRef.copySync());
    const interval = Boolean(intervalRef.copySync());
    const invoke = () => {
      if (this.disposed) return;
      const entry = this.timers.get(id);
      if (!entry) return;
      const run = async () => {
        await entry.callback.apply(undefined, args, {
          arguments: { copy: true },
          result: { copy: true, promise: true },
          timeout: this.input.callbackTimeoutMs,
        });
      };
      const queued = this.queue.then(run, run);
      this.queue = queued.catch((err) => {
        this.emitHostCall('logger.error', [errorMessage(err)]);
      });
      if (!interval) {
        queued.finally(() => this.clearTimer(id));
      }
    };
    const handle = interval ? setInterval(invoke, timeout) : setTimeout(invoke, timeout);
    this.timers.set(id, { handle, callback: callbackRef, interval });
    return id;
  };

  private readonly clearTimer = (id: number): void => {
    const timer = this.timers.get(Number(id));
    if (!timer) return;
    if (timer.interval) clearInterval(timer.handle as ReturnType<typeof setInterval>);
    else clearTimeout(timer.handle as ReturnType<typeof setTimeout>);
    timer.callback.release();
    this.timers.delete(Number(id));
  };

  private buildRuntimePrelude(): string {
    return `
      const module = { exports: {} };
      let exports = module.exports;
      class StrategyBase {}
      globalThis.module = module;
      globalThis.exports = exports;
      globalThis.StrategyBase = StrategyBase;

      const __callHost = (method, args) => new Promise((resolve, reject) => {
        const id = __nextHostCallIdRef.applySync(undefined, [], { arguments: { copy: true } });
        __registerHostPromiseRef.applySync(
          undefined,
          [
            id,
            (value) => resolve(value),
            (error) => {
              const normalized = error && typeof error === 'object' ? error : { message: String(error) };
              const err = new Error(normalized.message || 'Strategy host call failed');
              if (normalized.name) err.name = normalized.name;
              if (normalized.stack) err.stack = normalized.stack;
              reject(err);
            },
          ],
          { arguments: { reference: true } },
        );
        __hostCallStartRef.applyIgnored(undefined, [id, method, args], { arguments: { copy: true } });
      });
      const __log = (level, args) => {
        void __callHost(\`logger.\${level}\`, args);
      };
      globalThis.console = {
        log: (...args) => __log('info', args),
        debug: (...args) => __log('debug', args),
        info: (...args) => __log('info', args),
        warn: (...args) => __log('warn', args),
        error: (...args) => __log('error', args),
      };
      globalThis.setTimeout = (handler, timeout, ...args) => {
        if (typeof handler !== 'function') throw new TypeError('setTimeout handler must be a function');
        return __setTimerRef.applySync(
          undefined,
          [handler, timeout, args, false],
          { arguments: { reference: true } },
        );
      };
      globalThis.setInterval = (handler, timeout, ...args) => {
        if (typeof handler !== 'function') throw new TypeError('setInterval handler must be a function');
        return __setTimerRef.applySync(
          undefined,
          [handler, timeout, args, true],
          { arguments: { reference: true } },
        );
      };
      globalThis.clearTimeout = (id) =>
        __clearTimerRef.applyIgnored(undefined, [id], { arguments: { copy: true } });
      globalThis.clearInterval = globalThis.clearTimeout;
      globalThis.__strategyContext = {
        ...__strategyContextPayload,
        logger: {
          debug: (message, ...data) =>
            __callHost('logger.debug', data.length ? [message, data[0]] : [message]),
          info: (message, ...data) =>
            __callHost('logger.info', data.length ? [message, data[0]] : [message]),
          warn: (message, ...data) =>
            __callHost('logger.warn', data.length ? [message, data[0]] : [message]),
          error: (message, ...data) =>
            __callHost('logger.error', data.length ? [message, data[0]] : [message]),
        },
        marketData: {
          getSnapshot: () => __callHost('marketData.getSnapshot', []),
          loadMarketDetail: () => __callHost('marketData.loadMarketDetail', []),
          loadPriceHistory: (interval, fidelity) =>
            __callHost('marketData.loadPriceHistory', [interval, fidelity]),
          loadTrades: () => __callHost('marketData.loadTrades', []),
        },
        trading: {
          placeOrder: (input) => __callHost('trading.placeOrder', [input]),
          cancelOrder: (orderId) => __callHost('trading.cancelOrder', [orderId]),
          cancelAllOrders: () => __callHost('trading.cancelAllOrders', []),
        },
      };
    `;
  }

  private buildInstantiationScript(): string {
    return `
      const exported = module.exports && Object.keys(module.exports).length ? module.exports : exports;
      const StrategyClass = exported.Strategy || exported.default || globalThis.Strategy;
      if (!StrategyClass) {
        throw new Error('Strategy code must export a Strategy class: export class Strategy extends StrategyBase');
      }
      globalThis.__strategyInstance = new StrategyClass();
    `;
  }
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(toJsonValue(value));
  } catch {
    return String(value);
  }
}

function readReferenceString(value: unknown): string {
  const maybeReference = value as {
    copySync?: () => unknown;
    release?: () => void;
  };
  if (typeof maybeReference?.copySync === 'function') {
    try {
      return String(maybeReference.copySync());
    } finally {
      maybeReference.release?.();
    }
  }
  return String(value);
}

process.on('message', handleParentMessage);
process.on('disconnect', () => {
  runner?.dispose();
  process.exit(0);
});
process.on('uncaughtException', handleFatal);
process.on('unhandledRejection', handleFatal);

sendToParent({
  kind: 'event',
  event: 'ready',
  payload: {
    nodeVersion: process.version,
    isolatedVmVersion: String(runtimeRequire('isolated-vm/package.json').version),
  },
});
