import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const mcpServerAccessLogs = sqliteTable(
  'mcp_server_access_logs',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id').notNull(),
    sessionId: text('session_id'),
    method: text('method').notNull(),
    path: text('path').notNull(),
    statusCode: integer('status_code'),
    rpcMethod: text('rpc_method'),
    toolName: text('tool_name'),
    resourceUri: text('resource_uri'),
    success: integer('success', { mode: 'boolean' }).notNull(),
    durationMs: integer('duration_ms'),
    clientHost: text('client_host'),
    userAgent: text('user_agent'),
    errorCode: integer('error_code'),
    errorMessage: text('error_message'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_mcp_server_access_logs_request_id').on(table.requestId),
    index('idx_mcp_server_access_logs_session_id').on(table.sessionId),
    index('idx_mcp_server_access_logs_rpc_method').on(table.rpcMethod),
    index('idx_mcp_server_access_logs_tool_name').on(table.toolName),
    index('idx_mcp_server_access_logs_created_at').on(table.createdAt),
    index('idx_mcp_server_access_logs_success').on(table.success),
  ],
);

export { mcpServerAccessLogs };
