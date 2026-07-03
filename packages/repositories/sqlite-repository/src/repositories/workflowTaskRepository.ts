import { randomUUID } from 'crypto';
import { and, asc, desc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import type {
  WorkflowTaskCreateInput,
  WorkflowTaskRecord,
  WorkflowTaskUpdateInput,
} from '@polytrader/repository-contract';
import { getDb } from '../client.js';
import { workflowTasks } from '../schema/index.js';

type WorkflowTaskRow = typeof workflowTasks.$inferSelect;

class SqliteWorkflowTaskRepository {
  public create(input: WorkflowTaskCreateInput): WorkflowTaskRecord {
    const db = getDb();
    const idempotencyKey = input.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const existing = db
        .select()
        .from(workflowTasks)
        .where(eq(workflowTasks.idempotencyKey, idempotencyKey))
        .get();
      if (existing) {
        if (existing.status === 'failed' || existing.status === 'canceled') {
          const timestamp = this._now();
          db.update(workflowTasks)
            .set({
              groupKey: input.groupKey,
              status: 'pending',
              payloadJson: input.payloadJson,
              resultJson: null,
              errorMessage: null,
              attemptCount: 0,
              maxAttempts: input.maxAttempts ?? 3,
              nextRunAt: input.nextRunAt ?? timestamp,
              lockedAt: null,
              lockedBy: null,
              startedAt: null,
              finishedAt: null,
              updatedAt: timestamp,
            })
            .where(eq(workflowTasks.id, existing.id))
            .run();
          return this.get(existing.id);
        }
        return this._mapRecord(existing);
      }
    }

    const id = randomUUID();
    const timestamp = this._now();
    db.insert(workflowTasks)
      .values({
        id,
        type: input.type,
        groupKey: input.groupKey,
        payloadJson: input.payloadJson,
        maxAttempts: input.maxAttempts ?? 3,
        nextRunAt: input.nextRunAt ?? timestamp,
        idempotencyKey,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return this.get(id);
  }

  public get(id: string): WorkflowTaskRecord {
    const row = getDb().select().from(workflowTasks).where(eq(workflowTasks.id, id)).get();
    if (!row) throw new Error(`Workflow task does not exist: ${id}`);
    return this._mapRecord(row);
  }

  public listRecent(limit?: number): WorkflowTaskRecord[] {
    const query = getDb().select().from(workflowTasks).orderBy(desc(workflowTasks.updatedAt));
    const normalizedLimit = this._normalizeLimit(limit);
    const rows = normalizedLimit === null ? query.all() : query.limit(normalizedLimit).all();
    return rows.map((row) => this._mapRecord(row));
  }

  public listDue(now: string, limit: number): WorkflowTaskRecord[] {
    return getDb()
      .select()
      .from(workflowTasks)
      .where(
        and(
          inArray(workflowTasks.status, ['pending', 'retry_scheduled']),
          or(isNull(workflowTasks.nextRunAt), lte(workflowTasks.nextRunAt, now)),
        ),
      )
      .orderBy(asc(workflowTasks.nextRunAt), asc(workflowTasks.createdAt))
      .limit(Math.max(1, Math.floor(limit)))
      .all()
      .map((row) => this._mapRecord(row));
  }

  public claim(id: string, workerId: string, now: string): WorkflowTaskRecord | null {
    const db = getDb();
    const row = db.select().from(workflowTasks).where(eq(workflowTasks.id, id)).get();
    if (!row || (row.status !== 'pending' && row.status !== 'retry_scheduled')) return null;
    if (row.nextRunAt && row.nextRunAt > now) return null;

    db.update(workflowTasks)
      .set({
        status: 'running',
        lockedAt: now,
        lockedBy: workerId,
        startedAt: row.startedAt ?? now,
        attemptCount: row.attemptCount + 1,
        updatedAt: now,
      })
      .where(eq(workflowTasks.id, id))
      .run();
    return this.get(id);
  }

  public cancelPendingByGroup(groupKey: string, now: string): number {
    const normalizedGroupKey = groupKey.trim();
    if (!normalizedGroupKey) return 0;

    const db = getDb();
    const rows = db
      .select({ id: workflowTasks.id })
      .from(workflowTasks)
      .where(
        and(
          eq(workflowTasks.groupKey, normalizedGroupKey),
          inArray(workflowTasks.status, ['pending', 'retry_scheduled']),
        ),
      )
      .all();
    if (!rows.length) return 0;

    db.update(workflowTasks)
      .set({
        status: 'canceled',
        nextRunAt: null,
        lockedAt: null,
        lockedBy: null,
        finishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(workflowTasks.groupKey, normalizedGroupKey),
          inArray(workflowTasks.status, ['pending', 'retry_scheduled']),
        ),
      )
      .run();
    return rows.length;
  }

  public update(id: string, input: WorkflowTaskUpdateInput): WorkflowTaskRecord {
    this.get(id);
    getDb()
      .update(workflowTasks)
      .set({
        ...input,
        updatedAt: this._now(),
      })
      .where(eq(workflowTasks.id, id))
      .run();
    return this.get(id);
  }

  private _mapRecord(row: WorkflowTaskRow): WorkflowTaskRecord {
    return {
      id: row.id,
      type: row.type,
      groupKey: row.groupKey,
      status: row.status,
      payloadJson: row.payloadJson,
      resultJson: row.resultJson,
      errorMessage: row.errorMessage,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
      nextRunAt: row.nextRunAt,
      lockedAt: row.lockedAt,
      lockedBy: row.lockedBy,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private _now(): string {
    return new Date().toISOString();
  }

  private _normalizeLimit(limit: number | undefined): number | null {
    if (limit === undefined) return 200;
    if (!Number.isFinite(limit)) return 200;
    return Math.max(1, Math.min(Math.trunc(limit), 10_000));
  }
}

export { SqliteWorkflowTaskRepository };
