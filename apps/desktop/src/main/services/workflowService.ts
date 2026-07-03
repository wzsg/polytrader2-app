import { WorkflowRuntime, type WorkflowHandlerContext } from '@polytrader/workflow';
import { createSqliteWorkflowTaskRepository } from '@polytrader/sqlite-repository';
import type { PolymarketWalletInitializationWorkflowInput } from '@polytrader/polymarket-wallet';
import type { EventSyncWorkflowInput } from '@polytrader/polymarket-market';
import type { AppLocale, EventSyncTrigger } from '@polytrader/shared';

const POLYMARKET_WALLET_INITIALIZATION_WORKFLOW = 'polymarket-wallet.initialize';
const POLYMARKET_EVENT_SYNC_WORKFLOW = 'polymarket-event.sync';

class DesktopWorkflowService {
  private readonly _runtime: WorkflowRuntime;
  private readonly _repository = createSqliteWorkflowTaskRepository();

  public constructor() {
    this._runtime = new WorkflowRuntime({
      repository: this._repository,
      pollIntervalMs: 5000,
      batchSize: 50,
      groups: {
        [POLYMARKET_WALLET_INITIALIZATION_WORKFLOW]: {
          mode: 'parallel',
          concurrency: 5,
        },
        [POLYMARKET_EVENT_SYNC_WORKFLOW]: {
          mode: 'serial',
        },
      },
    });
  }

  public registerPolymarketWalletInitializationHandler(
    handler: (input: PolymarketWalletInitializationWorkflowInput) => Promise<unknown>,
  ): void {
    this._runtime.register(POLYMARKET_WALLET_INITIALIZATION_WORKFLOW, async (context) =>
      handler(this._parsePolymarketWalletInitializationInput(context)),
    );
  }

  public async enqueuePolymarketWalletInitialization(
    input: PolymarketWalletInitializationWorkflowInput,
  ): Promise<void> {
    await this._runtime.enqueue({
      type: POLYMARKET_WALLET_INITIALIZATION_WORKFLOW,
      groupKey: POLYMARKET_WALLET_INITIALIZATION_WORKFLOW,
      payload: input,
      idempotencyKey: `${POLYMARKET_WALLET_INITIALIZATION_WORKFLOW}:${input.walletId}`,
      maxAttempts: 5,
    });
  }

  public registerPolymarketEventSyncHandler(
    handler: (input: EventSyncWorkflowInput, signal: AbortSignal) => Promise<unknown>,
  ): void {
    this._runtime.register(POLYMARKET_EVENT_SYNC_WORKFLOW, async (context) => {
      const controller = new AbortController();
      return handler(this._parsePolymarketEventSyncInput(context), controller.signal);
    });
  }

  public async enqueuePolymarketEventSync(
    input: EventSyncWorkflowInput,
    options: { replacePending?: boolean } = {},
  ): Promise<void> {
    if (options.replacePending === true) {
      await this._repository.cancelPendingByGroup(
        POLYMARKET_EVENT_SYNC_WORKFLOW,
        new Date().toISOString(),
      );
    }
    await this._runtime.enqueue({
      type: POLYMARKET_EVENT_SYNC_WORKFLOW,
      groupKey: POLYMARKET_EVENT_SYNC_WORKFLOW,
      payload: input,
      maxAttempts: 3,
    });
  }

  public start(): void {
    this._runtime.start();
  }

  public stop(): void {
    this._runtime.stop();
  }

  private _parsePolymarketWalletInitializationInput(
    context: WorkflowHandlerContext,
  ): PolymarketWalletInitializationWorkflowInput {
    const payload = context.payload;
    if (!this._isPolymarketWalletInitializationInput(payload)) {
      throw new Error(`Invalid wallet initialization workflow payload: ${context.task.id}`);
    }
    return payload;
  }

  private _isPolymarketWalletInitializationInput(
    value: unknown,
  ): value is PolymarketWalletInitializationWorkflowInput {
    return (
      typeof value === 'object' &&
      value !== null &&
      'walletId' in value &&
      typeof value.walletId === 'string' &&
      value.walletId.trim().length > 0 &&
      (!('nonce' in value) || value.nonce === undefined || typeof value.nonce === 'number')
    );
  }

  private _parsePolymarketEventSyncInput(context: WorkflowHandlerContext): EventSyncWorkflowInput {
    const payload = context.payload;
    if (!this._isPolymarketEventSyncInput(payload)) {
      throw new Error(`Invalid event sync workflow payload: ${context.task.id}`);
    }
    return payload;
  }

  private _isPolymarketEventSyncInput(value: unknown): value is EventSyncWorkflowInput {
    if (typeof value !== 'object' || value === null) return false;
    const input = value as Partial<{ locale: AppLocale; trigger: EventSyncTrigger }>;
    return (
      (input.locale === 'en-US' || input.locale === 'zh-CN') &&
      (input.trigger === 'startup' ||
        input.trigger === 'schedule' ||
        input.trigger === 'manual' ||
        input.trigger === 'retry' ||
        input.trigger === 'locale-change')
    );
  }
}

const desktopWorkflowService = new DesktopWorkflowService();

export { desktopWorkflowService };
