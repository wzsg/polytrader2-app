import { desc } from 'drizzle-orm';
import type {
  DeveloperOrderRecord,
  McpServerAccessLogRecord,
} from '@polytrader/repository-contract';
import { getDb } from '../client.js';
import { walletOrders, mcpServerAccessLogs } from '../schema/index.js';

class SqliteDeveloperDiagnosticsRepository {
  public listMcpAccessLogs(limit?: number): McpServerAccessLogRecord[] {
    const query = getDb()
      .select()
      .from(mcpServerAccessLogs)
      .orderBy(desc(mcpServerAccessLogs.createdAt));
    const normalizedLimit = this._normalizeLimit(limit);
    return normalizedLimit === null ? query.all() : query.limit(normalizedLimit).all();
  }

  public listOrderRecords(limit?: number): DeveloperOrderRecord[] {
    const query = getDb().select().from(walletOrders).orderBy(desc(walletOrders.updatedAt));
    const normalizedLimit = this._normalizeLimit(limit);
    return normalizedLimit === null ? query.all() : query.limit(normalizedLimit).all();
  }

  private _normalizeLimit(limit: number | undefined): number | null {
    if (limit === undefined) return null;
    if (!Number.isFinite(limit)) return null;
    return Math.max(1, Math.min(Math.trunc(limit), 10_000));
  }
}

export { SqliteDeveloperDiagnosticsRepository };
