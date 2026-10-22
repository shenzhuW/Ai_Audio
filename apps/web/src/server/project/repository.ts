import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ProjectSchema, type Project } from '../../domain/project';

export interface ProjectRepository {
  create(project: Project): Promise<void>;
  list(ownerId: string): Promise<Project[]>;
  get(id: string, ownerId: string): Promise<Project | null>;
  update(project: Project, expectedVersion: number): Promise<boolean>;
  close(): Promise<void>;
}
// Local-only adapter. PostgreSQL + Prisma is the deployment adapter.
export async function openRepository(url: string): Promise<ProjectRepository> {
  if (!url.startsWith('file:')) throw new Error('SQLite adapter requires file: URL');
  const file = url.slice(5);
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0),
      updated_at TEXT NOT NULL, document TEXT NOT NULL CHECK(json_valid(document))
    );
    CREATE INDEX IF NOT EXISTS projects_owner_updated ON projects(owner_id, updated_at DESC);
    INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);`);
  function read(row: unknown): Project | null {
    return row ? ProjectSchema.parse(JSON.parse((row as { document: string }).document)) : null;
  }
  return {
    async create(p) {
      db.prepare(
        'INSERT INTO projects(id,owner_id,version,updated_at,document) VALUES(?,?,?,?,?)',
      ).run(p.id, p.ownerId, p.version, p.updatedAt, JSON.stringify(p));
    },
    async get(id, owner) {
      return read(
        db.prepare('SELECT document FROM projects WHERE id=? AND owner_id=?').get(id, owner),
      );
    },
    async list(owner) {
      return db
        .prepare('SELECT document FROM projects WHERE owner_id=? ORDER BY updated_at DESC,id')
        .all(owner)
        .map((row) => read(row)!);
    },
    async update(p, expected) {
      return (
        db
          .prepare(
            'UPDATE projects SET document=?,version=?,updated_at=? WHERE id=? AND owner_id=? AND version=?',
          )
          .run(JSON.stringify(p), p.version, p.updatedAt, p.id, p.ownerId, expected).changes === 1
      );
    },
    async close() {
      db.close();
    },
  };
}
