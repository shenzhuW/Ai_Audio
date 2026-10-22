import { PrismaClient, type Prisma } from '@prisma/client';
import { ProjectSchema, type Project } from '../../domain/project';
import type { ProjectRepository } from './repository';

const row = (p: Project): Prisma.ProjectUncheckedCreateInput => ({
  id: p.id,
  ownerId: p.ownerId,
  version: p.version,
  updatedAt: p.updatedAt,
  document: p,
});
export async function openPostgresRepository(url: string): Promise<ProjectRepository> {
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
