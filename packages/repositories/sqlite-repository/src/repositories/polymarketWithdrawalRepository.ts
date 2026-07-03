import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import type {
  PolymarketWithdrawalCreateInput,
  PolymarketWithdrawalUpdateInput,
} from '@polytrader/repository-contract';
import type {
  PolymarketBridgeAddressResponse,
  PolymarketBridgeTransactionStatusResponse,
  PolymarketBridgeWithdrawalRecord,
} from '@polytrader/shared';
import { getDb } from '../client.js';
import { polymarketWithdrawals } from '../schema/index.js';

type PolymarketWithdrawalRow = typeof polymarketWithdrawals.$inferSelect;

class SqlitePolymarketWithdrawalRepository {
  public create(input: PolymarketWithdrawalCreateInput): PolymarketBridgeWithdrawalRecord {
    const id = randomUUID();
    const timestamp = this._now();
    getDb()
      .insert(polymarketWithdrawals)
      .values({
        id,
        ...input,
        status: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return this.get(id);
  }

  public get(id: string): PolymarketBridgeWithdrawalRecord {
    const row = getDb()
      .select()
      .from(polymarketWithdrawals)
      .where(eq(polymarketWithdrawals.id, id))
      .get();
    if (!row) throw new Error(`Withdrawal does not exist: ${id}`);
    return this._mapRecord(row);
  }

  public listByWallet(walletId: string, limit?: number): PolymarketBridgeWithdrawalRecord[] {
    const query = getDb()
      .select()
      .from(polymarketWithdrawals)
      .where(eq(polymarketWithdrawals.walletId, walletId))
      .orderBy(desc(polymarketWithdrawals.createdAt));
    const normalizedLimit = this._normalizeLimit(limit);
    const rows = normalizedLimit === null ? query.all() : query.limit(normalizedLimit).all();
    return rows.map((row) => this._mapRecord(row));
  }

  public listRecent(limit?: number): PolymarketBridgeWithdrawalRecord[] {
    const query = getDb()
      .select()
      .from(polymarketWithdrawals)
      .orderBy(desc(polymarketWithdrawals.createdAt));
    const normalizedLimit = this._normalizeLimit(limit);
    const rows = normalizedLimit === null ? query.all() : query.limit(normalizedLimit).all();
    return rows.map((row) => this._mapRecord(row));
  }

  public update(
    id: string,
    input: PolymarketWithdrawalUpdateInput,
  ): PolymarketBridgeWithdrawalRecord {
    this.get(id);
    const { bridgeResponse, bridgeStatusResponse, ...fields } = input;
    getDb()
      .update(polymarketWithdrawals)
      .set({
        ...fields,
        bridgeResponseJson:
          bridgeResponse === undefined ? undefined : this._serialize(bridgeResponse),
        bridgeStatusResponseJson:
          bridgeStatusResponse === undefined ? undefined : this._serialize(bridgeStatusResponse),
        updatedAt: this._now(),
      })
      .where(eq(polymarketWithdrawals.id, id))
      .run();
    return this.get(id);
  }

  private _mapRecord(row: PolymarketWithdrawalRow): PolymarketBridgeWithdrawalRecord {
    return {
      id: row.id,
      walletId: row.walletId,
      walletAddress: row.walletAddress,
      depositWalletAddress: row.depositWalletAddress,
      amount: row.amount,
      amountBaseUnits: row.amountBaseUnits,
      fromChainId: row.fromChainId,
      fromTokenAddress: row.fromTokenAddress,
      toChainId: row.toChainId,
      toTokenAddress: row.toTokenAddress,
      recipientAddress: row.recipientAddress,
      bridgeAddress: row.bridgeAddress,
      status: row.status,
      bridgeResponse: this._parseJson<PolymarketBridgeAddressResponse>(row.bridgeResponseJson),
      bridgeStatus: row.bridgeStatus,
      bridgeStatusResponse: this._parseJson<PolymarketBridgeTransactionStatusResponse>(
        row.bridgeStatusResponseJson,
      ),
      relayerTransactionId: row.relayerTransactionId,
      relayerTransactionState: row.relayerTransactionState,
      relayerTransactionHash: row.relayerTransactionHash,
      errorMessage: row.errorMessage,
      submittedAt: row.submittedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private _serialize(value: unknown): string | null {
    if (value === null) return null;
    return JSON.stringify(value);
  }

  private _parseJson<T>(value: string | null): T | null {
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  private _now(): string {
    return new Date().toISOString();
  }

  private _normalizeLimit(limit: number | undefined): number | null {
    if (limit === undefined) return 100;
    if (!Number.isFinite(limit)) return 100;
    return Math.max(1, Math.min(Math.trunc(limit), 10_000));
  }
}

export { SqlitePolymarketWithdrawalRepository };
