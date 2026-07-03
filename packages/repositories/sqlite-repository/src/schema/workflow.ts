import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, uniqueIndex, integer } from 'drizzle-orm/sqlite-core';

const workflowTasks = sqliteTable(
  'workflow_tasks',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    groupKey: text('group_key').notNull().default('default'),
    status: text('status', {
      enum: ['pending', 'running', 'retry_scheduled', 'succeeded', 'failed', 'canceled'],
    })
      .notNull()
      .default('pending'),
    payloadJson: text('payload_json').notNull(),
    resultJson: text('result_json'),
    errorMessage: text('error_message'),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    nextRunAt: text('next_run_at'),
    lockedAt: text('locked_at'),
    lockedBy: text('locked_by'),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    idempotencyKey: text('idempotency_key'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('idx_workflow_tasks_idempotency_key_unique')
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index('idx_workflow_tasks_due').on(table.status, table.nextRunAt),
    index('idx_workflow_tasks_type_status').on(table.type, table.status),
    index('idx_workflow_tasks_group_status').on(table.groupKey, table.status, table.nextRunAt),
  ],
);

export { workflowTasks };
