import { createRequire } from 'node:module';
import { ProjectSchema, type Project } from '../../domain/project';
import type { ProjectRepository } from './repository';

// Explicit structural port allows typechecking local development before Prisma's
// platform-specific client is generated. PostgreSQL integration requires db:generate.
interface PrismaPort {
  project: {
    create(args: { data: Row }): Promise<unknown>;
    findFirst(args: { where: { id: string; ownerId: string } }): Promise<Row | null>;
    findMany(args: { where: { ownerId: string }; orderBy: { updatedAt: 'desc' } }): Promise<Row[]>;
    updateMany(args: {
      where: { id: string; ownerId: string; version: number };
      data: Row;
    }): Promise<{ count: number }>;
  };
  $disconnect(): Promise<void>;
}
type Row = { id: string; ownerId: string; version: number; updatedAt: string; document: unknown };
const row = (p: Project): Row => ({
  id: p.id,
  ownerId: p.ownerId,
  version: p.version,
  updatedAt: p.updatedAt,
  document: p,
});
export async function openPostgresRepository(url: string): Promise<ProjectRepository> {
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require('@prisma/client') as {
    PrismaClient: new (config: unknown) => PrismaPort;
  };
  const db = new PrismaClient({ datasources: { db: { url } } });
  return {
    async create(p) {
      await db.project.create({ data: row(p) });
    },
    async get(id, ownerId) {
      const r = await db.project.findFirst({ where: { id, ownerId } });
      return r ? ProjectSchema.parse(r.document) : null;
    },
    async list(ownerId) {
      return (
        await db.project.findMany({ where: { ownerId }, orderBy: { updatedAt: 'desc' } })
      ).map((r) => ProjectSchema.parse(r.document));
    },
    async update(p, expectedVersion) {
      return (
        (
          await db.project.updateMany({
            where: { id: p.id, ownerId: p.ownerId, version: expectedVersion },
            data: row(p),
          })
        ).count === 1
      );
    },
    async close() {
      await db.$disconnect();
    },
  };
}
