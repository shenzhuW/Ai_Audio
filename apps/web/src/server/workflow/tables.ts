import { directorTables, sqliteDirectorGuards } from '../director/tables';
import type { WorkflowState } from '../../domain/workflow';
import { researchTables, sqliteResearchGuards } from '../research/tables';
import { scriptTables, sqliteScriptGuards } from '../script/tables';
import { voiceTables, sqliteVoiceGuards } from '../voice/tables';
type Collection = Exclude<keyof WorkflowState, 'schemaVersion'>;
export const tables: {
  key: Collection;
  table: string;
  columns: string[];
  fields: string[];
  constraints: string[];
}[] = [
  {
    key: 'artifacts',
    table: 'workflow_artifacts',
    columns: ['type TEXT NOT NULL'],
    fields: ['type'],
    constraints: ['UNIQUE(project_id,type)'],
  },
  {
    key: 'revisions',
    table: 'workflow_revisions',
    columns: [
      'artifact_id ID NOT NULL REFERENCES workflow_artifacts(id)',
      'revision_number INTEGER NOT NULL',
    ],
    fields: ['artifactId', 'revisionNumber'],
    constraints: ['UNIQUE(artifact_id,revision_number)'],
  },
  {
    key: 'dependencies',
    table: 'workflow_dependencies',
    columns: [
      'upstream_revision_id ID NOT NULL REFERENCES workflow_revisions(id)',
      'downstream_revision_id ID NOT NULL REFERENCES workflow_revisions(id)',
    ],
    fields: ['upstreamRevisionId', 'downstreamRevisionId'],
    constraints: ['UNIQUE(upstream_revision_id,downstream_revision_id)'],
  },
  {
    key: 'approvals',
    table: 'workflow_approval_events',
    columns: ['revision_id ID NOT NULL REFERENCES workflow_revisions(id)'],
    fields: ['revisionId'],
    constraints: [],
  },
  {
    key: 'jobs',
    table: 'workflow_jobs',
    columns: ['state TEXT NOT NULL'],
    fields: ['state'],
    constraints: [],
  },
  {
    key: 'outbox',
    table: 'workflow_outbox',
    columns: ['job_id ID NOT NULL REFERENCES workflow_jobs(id)'],
    fields: ['jobId'],
    constraints: ['UNIQUE(job_id)'],
  },
  {
    key: 'receipts',
    table: 'workflow_request_receipts',
    columns: ['idempotency_key TEXT NOT NULL'],
    fields: ['key'],
    constraints: ['UNIQUE(project_id,idempotency_key)'],
  },
  { key: 'audit', table: 'workflow_audit_events', columns: [], fields: [], constraints: [] },
  ...researchTables,
  ...scriptTables,
  ...voiceTables,
  ...directorTables,
];
export function sqliteWorkflowSchema() {
  return (
    tables
      .map(
        (t) =>
          `CREATE TABLE IF NOT EXISTS ${t.table} (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), document TEXT NOT NULL CHECK(json_valid(document))${t.columns.length ? ',' + t.columns.map((c) => c.replace(/\bID\b/g, 'TEXT')).join(',') : ''}${t.constraints.length ? ',' + t.constraints.join(',') : ''}); CREATE INDEX IF NOT EXISTS ${t.table}_project_id_idx ON ${t.table}(project_id);`,
      )
      .join('\n') +
    `
CREATE INDEX IF NOT EXISTS workflow_jobs_state_idx ON workflow_jobs(state);
CREATE TRIGGER IF NOT EXISTS workflow_revision_immutable BEFORE UPDATE ON workflow_revisions
WHEN json_extract(OLD.document,'$.status')='approved' AND NEW.document!=OLD.document BEGIN SELECT RAISE(ABORT,'Approved revisions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS workflow_revision_no_delete BEFORE DELETE ON workflow_revisions
BEGIN SELECT RAISE(ABORT,'Revision history cannot be deleted'); END;
` +
    ['workflow_approval_events', 'workflow_audit_events', 'workflow_request_receipts']
      .map(
        (
          t,
        ) => `CREATE TRIGGER IF NOT EXISTS ${t}_append_only_update BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT,'History is append only'); END;
CREATE TRIGGER IF NOT EXISTS ${t}_append_only_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT,'History is append only'); END;`,
      )
      .join('\n') +
    '\nINSERT OR IGNORE INTO schema_migrations(version) VALUES(2);' +
    sqliteResearchGuards() +
    sqliteScriptGuards() +
    sqliteVoiceGuards() +
    sqliteDirectorGuards()
  );
}
