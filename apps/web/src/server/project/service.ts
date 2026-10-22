import { randomUUID } from 'node:crypto';
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ProjectSchema,
  type Attachment,
  type Project,
} from '../../domain/project';
import { AppError } from '../errors';
import type { ProjectRepository } from './repository';

export function createProjectService(repo: ProjectRepository, limits: { maxDurationMs: number }) {
  return {
    async create(raw: unknown, ownerId: string, attachments: Attachment[] = []): Promise<Project> {
      const parsed = CreateProjectSchema.safeParse(raw);
      if (!parsed.success)
        throw new AppError('VALIDATION_ERROR', '请检查项目输入', 400, parsed.error.flatten());
      const { prompt, entryType, voiceMode, ...brief } = parsed.data;
      if (brief.targetDurationMs > limits.maxDurationMs)
        throw new AppError(
          'DURATION_LIMIT',
          `当前运行限额为 ${limits.maxDurationMs / 1000} 秒，可由管理员配置`,
          429,
        );
      const now = new Date().toISOString();
      const project = ProjectSchema.parse({
        ...brief,
        id: randomUUID(),
        ownerId,
        version: 1,
        status: 'draft',
        currentStage: 'brief',
        createdAt: now,
        updatedAt: now,
        input: { schemaVersion: 1, prompt, entryType, voiceMode, attachments },
      });
      await repo.create(project);
      return project;
    },
    async list(ownerId: string) {
      return repo.list(ownerId);
    },
    async get(id: string, ownerId: string) {
      const result = await repo.get(id, ownerId);
      if (!result) throw new AppError('NOT_FOUND', '找不到这个项目', 404);
      return ProjectSchema.parse(result);
    },
    async update(id: string, raw: unknown, ownerId: string) {
      const parsed = UpdateProjectSchema.safeParse(raw);
      if (!parsed.success)
        throw new AppError(
          'VALIDATION_ERROR',
          '修改内容无效，请检查版本和字段',
          400,
          parsed.error.flatten(),
        );
      const old = await this.get(id, ownerId);
      const { expectedVersion, ...changes } = parsed.data;
      const updated = ProjectSchema.parse({
        ...old,
        ...changes,
        version: expectedVersion + 1,
        updatedAt: new Date().toISOString(),
      });
      if (!(await repo.update(updated, expectedVersion)))
        throw new AppError('REVISION_CONFLICT', '项目已在其他窗口更新。请重新载入后再保存。', 409);
      return updated;
    },
  };
}
