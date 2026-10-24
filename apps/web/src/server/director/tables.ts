export const directorTables = [
  {
    key: 'directorDocuments' as const,
    table: 'director_documents',
    columns: [
      'revision_id ID NOT NULL REFERENCES workflow_revisions(id)',
      'script_revision_id ID NOT NULL REFERENCES workflow_revisions(id)',
      'voice_revision_id ID NOT NULL REFERENCES workflow_revisions(id)',
    ],
    fields: ['revisionId', 'scriptRevisionId', 'voiceRevisionId'],
    constraints: ['UNIQUE(revision_id)'],
  },
  {
    key: 'directorShots' as const,
    table: 'director_shot_versions',
    columns: ['revision_id ID NOT NULL REFERENCES workflow_revisions(id)', 'shot_id ID NOT NULL'],
    fields: ['revisionId', 'shotId'],
    constraints: ['UNIQUE(revision_id,shot_id)'],
  },
];
export function sqliteDirectorGuards() {
  return (
    directorTables
      .map(
        ({ table }) => `
CREATE TRIGGER IF NOT EXISTS ${table}_draft_insert BEFORE INSERT ON ${table}
WHEN (SELECT json_extract(document,'$.status') FROM workflow_revisions WHERE id=NEW.revision_id)!='draft'
BEGIN SELECT RAISE(ABORT,'Director snapshot is immutable outside draft'); END;
CREATE TRIGGER IF NOT EXISTS ${table}_draft_update BEFORE UPDATE ON ${table}
WHEN (SELECT json_extract(document,'$.status') FROM workflow_revisions WHERE id=OLD.revision_id)!='draft'
OR (SELECT json_extract(document,'$.status') FROM workflow_revisions WHERE id=NEW.revision_id)!='draft'
BEGIN SELECT RAISE(ABORT,'Director snapshot is immutable outside draft'); END;
CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
BEGIN SELECT RAISE(ABORT,'Director history cannot be deleted'); END;`,
      )
      .join('\n') + '\nINSERT OR IGNORE INTO schema_migrations(version) VALUES(6);'
  );
}
