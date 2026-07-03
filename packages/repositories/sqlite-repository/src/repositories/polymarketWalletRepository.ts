import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import type {
  PolymarketWalletFields,
  PolymarketWalletInitializationCredentialFields,
  PolymarketWalletInitializationUpdateFields,
  PolymarketWalletPositionSummary,
  PolymarketWalletRecord,
} from '@polytrader/repository-contract';
import type { BalanceAllowance } from '@polytrader/shared';
import { getDb } from '../client.js';
import { polymarketWallets } from '../schema/index.js';

type PolymarketWalletRow = typeof polymarketWallets.$inferSelect;

class SqlitePolymarketWalletRepository {
  public list(): PolymarketWalletRecord[] {
    return getDb()
      .select()
      .from(polymarketWallets)
      .orderBy(desc(polymarketWallets.isDefault), polymarketWallets.name)
      .all()
      .map((row) => this._mapRecord(row));
  }

  public listConfigured(): PolymarketWalletRecord[] {
    return getDb()
      .select()
      .from(polymarketWallets)
      .orderBy(desc(polymarketWallets.isDefault), polymarketWallets.name)
      .all()
      .filter((row) => this._credentialsConfigured(row))
      .map((row) => this._mapRecord(row));
  }

  public get(id: string): PolymarketWalletRecord {
    return this._mapRecord(this._getRow(id));
  }

  public getDefault(): PolymarketWalletRecord | null {
    const db = getDb();
    const row =
      db
        .select()
        .from(polymarketWallets)
        .where(eq(polymarketWallets.isDefault, true))
        .orderBy(desc(polymarketWallets.createdAt))
        .get() ||
      db.select().from(polymarketWallets).orderBy(desc(polymarketWallets.createdAt)).get();
    return row ? this._mapRecord(row) : null;
  }

  public getDefaultConfigured(): PolymarketWalletRecord | null {
    const row = getDb()
      .select()
      .from(polymarketWallets)
      .orderBy(desc(polymarketWallets.isDefault), desc(polymarketWallets.createdAt))
      .all()
      .find((item) => this._credentialsConfigured(item));
    return row ? this._mapRecord(row) : null;
  }

  public insert(fields: PolymarketWalletFields): PolymarketWalletRecord {
    const db = getDb();
    const createdAt = this._now();
    const existingCount = db
      .select({ id: polymarketWallets.id })
      .from(polymarketWallets)
      .all().length;
    const shouldDefault = fields.isDefault || existingCount === 0;
    const id = randomUUID();

    db.transaction(() => {
      if (shouldDefault) {
        db.update(polymarketWallets).set({ isDefault: false, updatedAt: this._now() }).run();
      }
      db.insert(polymarketWallets)
        .values({
          ...fields,
          id,
          isDefault: shouldDefault,
          createdAt,
          updatedAt: createdAt,
        })
        .run();
    });

    return this.get(id);
  }

  public update(id: string, fields: PolymarketWalletFields): PolymarketWalletRecord {
    this._getRow(id);
    const db = getDb();
    const timestamp = this._now();

    db.transaction(() => {
      if (fields.isDefault) {
        db.update(polymarketWallets).set({ isDefault: false, updatedAt: timestamp }).run();
      }
      db.update(polymarketWallets)
        .set({
          ...fields,
          updatedAt: timestamp,
        })
        .where(eq(polymarketWallets.id, id))
        .run();
    });

    return this.get(id);
  }

  public updateInitialization(
    id: string,
    fields: PolymarketWalletInitializationUpdateFields,
  ): PolymarketWalletRecord {
    this._getRow(id);
    getDb()
      .update(polymarketWallets)
      .set({
        initializationStatus: fields.initializationStatus,
        initializationError: fields.initializationError ?? '',
        updatedAt: this._now(),
      })
      .where(eq(polymarketWallets.id, id))
      .run();
    return this.get(id);
  }

  public updateInitializationCredentials(
    id: string,
    fields: PolymarketWalletInitializationCredentialFields,
  ): PolymarketWalletRecord {
    this._getRow(id);
    getDb()
      .update(polymarketWallets)
      .set({
        ...fields,
        updatedAt: this._now(),
      })
      .where(eq(polymarketWallets.id, id))
      .run();
    return this.get(id);
  }

  public updateBalance(id: string, balance: BalanceAllowance | null): boolean {
    const current = this._getRow(id);
    const nextBalance = this._serializeBalance(balance);
    if ((current.balance ?? null) === nextBalance) return false;
    getDb()
      .update(polymarketWallets)
      .set({ balance: nextBalance })
      .where(eq(polymarketWallets.id, id))
      .run();
    return true;
  }

  public updatePositionSummary(id: string, summary: PolymarketWalletPositionSummary): boolean {
    const current = this._getRow(id);
    const next = this._normalizePositionSummary(summary);
    if (
      current.positionsTotalValue === next.positionsTotalValue &&
      current.positionsInitialValue === next.positionsInitialValue
    ) {
      return false;
    }
    getDb()
      .update(polymarketWallets)
      .set({
        positionsTotalValue: next.positionsTotalValue,
        positionsInitialValue: next.positionsInitialValue,
      })
      .where(eq(polymarketWallets.id, id))
      .run();
    return true;
  }

  public markKeyMaterialBackedUp(id: string): PolymarketWalletRecord {
    this._getRow(id);
    getDb()
      .update(polymarketWallets)
      .set({ keyMaterialBackedUp: true, updatedAt: this._now() })
      .where(eq(polymarketWallets.id, id))
      .run();
    return this.get(id);
  }

  public setDefault(id: string): PolymarketWalletRecord {
    const db = getDb();
    this._getRow(id);

    db.transaction(() => {
      const timestamp = this._now();
      db.update(polymarketWallets).set({ isDefault: false, updatedAt: timestamp }).run();
      db.update(polymarketWallets)
        .set({ isDefault: true, updatedAt: timestamp })
        .where(eq(polymarketWallets.id, id))
        .run();
    });

    return this.get(id);
  }

  public delete(id: string): void {
    const db = getDb();
    const target = this._getRow(id);
    db.delete(polymarketWallets).where(eq(polymarketWallets.id, id)).run();

    if (target.isDefault) {
      const next = db
        .select()
        .from(polymarketWallets)
        .orderBy(desc(polymarketWallets.createdAt))
        .get();
      if (next) this.setDefault(next.id);
    }
  }

  private _getRow(id: string): PolymarketWalletRow {
    const row = getDb().select().from(polymarketWallets).where(eq(polymarketWallets.id, id)).get();
    if (!row) throw new Error(`Account does not exist: ${id}`);
    return row;
  }

  private _credentialsConfigured(
    credential: Pick<
      PolymarketWalletRecord,
      'apiKey' | 'secret' | 'passphrase' | 'depositWalletAddress' | 'initializationStatus'
    >,
  ): boolean {
    return Boolean(
      credential.initializationStatus === 'ready' &&
      credential.apiKey.trim() &&
      credential.secret.trim() &&
      credential.passphrase.trim() &&
      credential.depositWalletAddress.trim(),
    );
  }

  private _mapRecord(row: PolymarketWalletRow): PolymarketWalletRecord {
    return {
      id: row.id,
      name: row.name,
      creationType: row.creationType,
      walletKeyMaterial: row.walletKeyMaterial,
      walletKeyMaterialType: row.walletKeyMaterialType,
      parentWalletId: row.parentWalletId,
      derivationPath: row.derivationPath,
      walletAddress: row.walletAddress,
      apiKey: row.apiKey,
      secret: row.secret,
      passphrase: row.passphrase,
      depositWalletAddress: row.depositWalletAddress,
      balance: this._parseBalance(row.balance),
      positionsTotalValue: row.positionsTotalValue,
      positionsInitialValue: row.positionsInitialValue,
      relayerApiKey: row.relayerApiKey,
      signatureType: row.signatureType,
      chainId: row.chainId,
      clobHost: row.clobHost,
      initializationStatus: row.initializationStatus,
      initializationError: row.initializationError,
      keyMaterialBackedUp: row.keyMaterialBackedUp,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private _now(): string {
    return new Date().toISOString();
  }

  private _parseBalance(value: string | null): BalanceAllowance | null {
    if (!value) return null;
    try {
      return JSON.parse(value) as BalanceAllowance;
    } catch {
      return null;
    }
  }

  private _serializeBalance(balance: BalanceAllowance | null): string | null {
    if (!balance) return null;
    return JSON.stringify({
      ...balance,
      allowances: [...balance.allowances].sort((left, right) =>
        left.address.localeCompare(right.address),
      ),
    });
  }

  private _normalizePositionSummary(
    summary: PolymarketWalletPositionSummary,
  ): PolymarketWalletPositionSummary {
    return {
      positionsTotalValue: this._nullableFiniteNumber(summary.positionsTotalValue),
      positionsInitialValue: this._nullableFiniteNumber(summary.positionsInitialValue),
    };
  }

  private _nullableFiniteNumber(value: number | null): number | null {
    if (value == null) return null;
    return Number.isFinite(value) ? Number(value) : null;
  }
}

export { SqlitePolymarketWalletRepository };
