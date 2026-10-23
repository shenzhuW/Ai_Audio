import { DatabaseSync } from 'node:sqlite';
import { Prisma, PrismaClient } from '@prisma/client';
import { ProjectSchema, type Project } from '../../domain/project';
import { WorkflowStateSchema, type WorkflowState } from '../../domain/workflow';
import { AppError } from '../errors';
import { emptyWorkflow, fingerprint } from './engine';
import { tables, sqliteWorkflowSchema } from './tables';
export type Collection = (typeof tables)[number]['key'];
type Change = (state: WorkflowState, project: Project) => { state: WorkflowState; result: unknown };
export interface WorkflowRepository {
  transaction(
    projectId: string,
    ownerId: string,
    change?: Change,
  ): Promise<{ state: WorkflowState; project: Project; result?: unknown }>;
  locate(collection: Collection, id: string, ownerId: string): Promise<string>;
  workProjects(): Promise<string[]>;
  close(): Promise<void>;
}
type Entity = { id: string } & Record<string, unknown>;
const missing = (): never => {
  throw new AppError('NOT_FOUND', '找不到项目、产物或任务。', 404);
};
function mutations(before: WorkflowState, after: WorkflowState, projectId: string) {
  return tables.flatMap((t) =>
    (after[t.key] as Entity[])
      .filter((entity) => {
        const old = (before[t.key] as Entity[]).find((x) => x.id === entity.id);
        return !old || fingerprint(old) !== fingerprint(entity);
      })
      .map((entity) => ({
        table: t.table,
        names: ['id', 'project_id', 'document', ...t.columns.map((c) => c.split(' ')[0])],
        values: [entity.id, projectId, JSON.stringify(entity), ...t.fields.map((f) => entity[f])],
        casts: [
          'uuid',
          'uuid',
          'jsonb',
          ...t.columns.map((c) =>
            c.includes(' ID ') ? 'uuid' : c.includes('INTEGER') ? 'int' : 'text',
          ),
        ],
      })),
  );
}
export async function openWorkflowRepository(url: string): Promise<WorkflowRepository> {
  if (url.startsWith('file:')) {
    const db = new DatabaseSync(url.slice(5));
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    db.exec(sqliteWorkflowSchema());
    return {
      async transaction(id, owner, change) {
        db.exec(change ? 'BEGIN IMMEDIATE' : 'BEGIN');
        try {
          const row =
            (db
              .prepare('SELECT document FROM projects WHERE id=? AND owner_id=?')
              .get(id, owner) as { document: string } | undefined) ?? missing();
          const project = ProjectSchema.parse(JSON.parse(row.document));
          const state = emptyWorkflow();
          for (const t of tables)
            (state[t.key] as unknown[]) = db
              .prepare(`SELECT document FROM ${t.table} WHERE project_id=? ORDER BY id`)
              .all(id)
              .map((r) => JSON.parse(r.document as string));
          WorkflowStateSchema.parse(state);
          const output = change?.(state, project);
          if (output)
            for (const m of mutations(state, output.state, id)) {
              db.prepare(
                `INSERT INTO ${m.table} (${m.names.join(',')}) VALUES (${m.names.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${m.names
                  .slice(2)
                  .map((n) => n + '=excluded.' + n)
                  .join(',')}`,
              ).run(...(m.values as (string | number)[]));
            }
          db.exec('COMMIT');
          return { state: output?.state ?? state, project, result: output?.result };
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      },
      async locate(key, id, owner) {
        const t = tables.find((t) => t.key === key)!;
        const r = db
          .prepare(
            `SELECT e.project_id FROM ${t.table} e JOIN projects p ON p.id=e.project_id WHERE e.id=? AND p.owner_id=?`,
          )
          .get(id, owner);
        return r ? String(r.project_id) : missing();
      },
      async workProjects() {
        return db
          .prepare(
            "SELECT DISTINCT j.project_id FROM workflow_jobs j JOIN projects p ON p.id=j.project_id WHERE j.state IN ('queued','running') AND p.owner_id='local-user'",
          )
          .all()
          .map((r) => String(r.project_id));
      },
      async close() {
        db.close();
      },
    };
  }
  if (!/^postgres(ql)?:/.test(url)) throw new Error('Unsupported workflow database');
  const db = new PrismaClient({ datasources: { db: { url } } });
  return {
    async transaction(id, owner, change) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await db.$transaction(
            async (tx) => {
              // The existing project row serializes all writes for this project's workflow.
              const rows = await tx.$queryRawUnsafe<{ document: unknown }[]>(
                `SELECT document FROM projects WHERE id=$1::uuid AND owner_id=$2${change ? ' FOR UPDATE' : ''}`,
                id,
                owner,
              );
              if (!rows.length) missing();
              const project = ProjectSchema.parse(rows[0].document),
                state = emptyWorkflow();
              for (const t of tables)
                (state[t.key] as unknown[]) = (
                  await tx.$queryRawUnsafe<{ document: unknown }[]>(
                    `SELECT document FROM ${t.table} WHERE project_id=$1::uuid ORDER BY id`,
                    id,
                  )
                ).map((r) => r.document);
              WorkflowStateSchema.parse(state);
              const output = change?.(state, project);
              if (output)
                for (const m of mutations(state, output.state, id))
                  await tx.$executeRawUnsafe(
                    `INSERT INTO ${m.table} (${m.names.join(',')}) VALUES (${m.names.map((_, i) => '$' + (i + 1) + '::' + m.casts[i]).join(',')}) ON CONFLICT(id) DO UPDATE SET ${m.names
                      .slice(2)
                      .map((n) => n + '=excluded.' + n)
                      .join(',')}`,
                    ...m.values,
                  );
              return { state: output?.state ?? state, project, result: output?.result };
            },
            {
              isolationLevel: change
                ? Prisma.TransactionIsolationLevel.ReadCommitted
                : Prisma.TransactionIsolationLevel.RepeatableRead,
              timeout: 15000,
            },
          );
        } catch (e) {
          if (
            attempt >= 2 ||
            !(e instanceof Prisma.PrismaClientKnownRequestError) ||
            e.code !== 'P2034'
          )
            throw e;
        }
      }
    },
    async locate(key, id, owner) {
      const t = tables.find((t) => t.key === key)!;
      const rows = await db.$queryRawUnsafe<{ project_id: string }[]>(
        `SELECT e.project_id FROM ${t.table} e JOIN projects p ON p.id=e.project_id WHERE e.id=$1::uuid AND p.owner_id=$2`,
        id,
        owner,
      );
      return rows.length ? rows[0].project_id : missing();
    },
    async workProjects() {
      return (
        await db.$queryRawUnsafe<{ project_id: string }[]>(
          "SELECT DISTINCT j.project_id FROM workflow_jobs j JOIN projects p ON p.id=j.project_id WHERE j.state IN ('queued','running') AND p.owner_id='local-user'",
        )
      ).map((r) => r.project_id);
    },
    async close() {
      await db.$disconnect();
    },
  };
}
