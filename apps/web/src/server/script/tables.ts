export const scriptTables = [
  {
    key: 'scriptDocuments' as const,
    table: 'script_documents',
    columns: ['revision_id ID NOT NULL REFERENCES workflow_revisions(id)'],
    fields: ['revisionId'],
    constraints: ['UNIQUE(revision_id)'],
  },
  {
    key: 'scriptSegments' as const,
    table: 'script_segment_versions',
    columns: [
      'revision_id ID NOT NULL REFERENCES workflow_revisions(id)',
      'segment_id ID NOT NULL',
    ],
    fields: ['revisionId', 'segmentId'],
    constraints: ['UNIQUE(revision_id,segment_id)'],
  },
];
export function sqliteScriptGuards() {
  return (
    scriptTables
      .map(
        ({ table }) => `
CREATE TRIGGER IF NOT EXISTS ${table}_draft_insert BEFORE INSERT ON ${table}
WHEN (SELECT json_extract(document,'$.status') FROM workflow_revisions WHERE id=NEW.revision_id)!='draft'
BEGIN SELECT RAISE(ABORT,'Script snapshot is immutable outside draft'); END;
CREATE TRIGGER IF NOT EXISTS ${table}_draft_update BEFORE UPDATE ON ${table}
WHEN (SELECT json_extract(document,'$.status') FROM workflow_revisions WHERE id=OLD.revision_id)!='draft'
OR (SELECT json_extract(document,'$.status') FROM workflow_revisions WHERE id=NEW.revision_id)!='draft'
BEGIN SELECT RAISE(ABORT,'Script snapshot is immutable outside draft'); END;
CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
BEGIN SELECT RAISE(ABORT,'Script history cannot be deleted'); END;`,
      )
      .join('\n') + '\nINSERT OR IGNORE INTO schema_migrations(version) VALUES(4);'
  );
}
