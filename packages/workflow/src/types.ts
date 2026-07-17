import type { WorkflowTaskRecord, WorkflowTaskRepository } from '@polytrader/repository-contract';

interface WorkflowRuntimeOptions {
  repository: WorkflowTaskRepository;
  pollIntervalMs?: number;
  batchSize?: number;
  workerId?: string;
  groups?: Record<string, WorkflowGroupConfig>;
}

interface WorkflowEnqueueInput {
  type: string;
  groupKey?: string;
  payload: unknown;
  idempotencyKey?: string | null;
  maxAttempts?: number;
  nextRunAt?: string | null;
}

type WorkflowGroupConfig =
  | {
      mode: 'serial';
    }
  | {
      mode: 'parallel';
      concurrency: number;
    };

interface WorkflowHandlerContext {
  task: WorkflowTaskRecord;
  payload: unknown;
  signal: AbortSignal;
}

type WorkflowHandler = (context: WorkflowHandlerContext) => Promise<unknown>;

interface WorkflowHandlerOptions {
  cancelOnStop?: boolean;
}

export type {
  WorkflowEnqueueInput,
  WorkflowGroupConfig,
  WorkflowHandler,
  WorkflowHandlerContext,
  WorkflowHandlerOptions,
  WorkflowRuntimeOptions,
};
