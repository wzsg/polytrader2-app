export type StrategyHostCall = (method: string, args: unknown[]) => Promise<unknown> | unknown;

export interface StrategyExecutorOptions {
  memoryLimitMb?: number;
  compileTimeoutMs?: number;
  callbackTimeoutMs?: number;
  hostCall?: StrategyHostCall;
  runtimePaths?: StrategyExecutorRuntimePaths;
}

export interface StrategyExecutorRuntimePaths {
  workerScriptPath?: string;
  nodePath?: string;
  moduleDir?: string;
  outMainDir?: string;
  resourcesPath?: string;
  appPath?: string;
  isPackaged?: boolean;
}

export interface StrategyExecutorContract {
  start(): Promise<void>;
  executeCallback(name: string, ...args: unknown[]): Promise<void>;
  stop(): Promise<void>;
  dispose(): void;
}
