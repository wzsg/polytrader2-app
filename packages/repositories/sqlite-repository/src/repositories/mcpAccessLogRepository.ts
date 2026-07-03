import { and, desc, eq } from 'drizzle-orm';
import type {
  McpServerAccessLogInsertInput,
  McpServerAccessLogListParams,
  McpServerAccessLogRecord,
} from '@polytrader/repository-contract';
import { getDb } from '../client.js';
import { mcpServerAccessLogs } from '../schema/index.js';

type McpServerAccessLogRow = typeof mcpServerAccessLogs.$inferSelect;

class SqliteMcpServerAccessLogRepository {
  public insertLog(input: McpServerAccessLogInsertInput): void {
    getDb()
      .insert(mcpServerAccessLogs)
      .values({
        id: input.id,
        requestId: input.requestId,
        sessionId: input.sessionId,
        method: input.method,
        path: input.path,
        statusCode: input.statusCode,
        rpcMethod: input.rpcMethod,
        toolName: input.toolName,
        resourceUri: input.resourceUri,
        success: input.success,
        durationMs: input.durationMs,
        clientHost: input.clientHost,
        userAgent: input.userAgent,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        createdAt: input.createdAt,
      })
      .run();
  }

  public listLogs(params: McpServerAccessLogListParams = {}): McpServerAccessLogRecord[] {
    const filters = [];
    if (params.sessionId) filters.push(eq(mcpServerAccessLogs.sessionId, params.sessionId));
    if (params.rpcMethod) filters.push(eq(mcpServerAccessLogs.rpcMethod, params.rpcMethod));
    if (params.toolName) filters.push(eq(mcpServerAccessLogs.toolName, params.toolName));
    if (params.success !== undefined) {
      filters.push(eq(mcpServerAccessLogs.success, params.success));
    }

    const base = getDb().select().from(mcpServerAccessLogs);
    const query = filters.length ? base.where(and(...filters)) : base;
    return query
      .orderBy(desc(mcpServerAccessLogs.createdAt))
      .limit(Math.max(1, Math.min(params.limit || 200, 1_000)))
      .all()
      .map((row) => this._mapLog(row));
  }

  private _mapLog(row: McpServerAccessLogRow): McpServerAccessLogRecord {
    return {
      id: row.id,
      requestId: row.requestId,
      sessionId: row.sessionId,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      rpcMethod: row.rpcMethod,
      toolName: row.toolName,
      resourceUri: row.resourceUri,
      success: row.success,
      durationMs: row.durationMs,
      clientHost: row.clientHost,
      userAgent: row.userAgent,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
    };
  }
}

export { SqliteMcpServerAccessLogRepository };
