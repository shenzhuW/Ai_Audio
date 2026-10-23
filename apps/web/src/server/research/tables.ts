export const researchTables = [
  {
    key: 'researchSources' as const,
    table: 'research_sources',
    columns: ['revision_id ID NOT NULL REFERENCES workflow_revisions(id)'],
    fields: ['revisionId'],
    constraints: ['UNIQUE(id,revision_id)'],
  },
  {
    key: 'researchClaims' as const,
    table: 'research_claims',
    columns: ['revision_id ID NOT NULL REFERENCES workflow_revisions(id)'],
    fields: ['revisionId'],
    constraints: ['UNIQUE(id,revision_id)'],
  },
  {
    key: 'researchEvidence' as const,
    table: 'research_claim_evidence',
    columns: [
      'revision_id ID NOT NULL REFERENCES workflow_revisions(id)',
      'claim_id ID NOT NULL',
      'source_id ID NOT NULL',
    ],
    fields: ['revisionId', 'claimId', 'sourceId'],
    constraints: [
      'FOREIGN KEY(claim_id,revision_id) REFERENCES research_claims(id,revision_id)',
      'FOREIGN KEY(source_id,revision_id) REFERENCES research_sources(id,revision_id)',
    ],
  },
  {
    key: 'researchIndexes' as const,
    table: 'research_index_entries',
    columns: ['revision_id ID NOT NULL REFERENCES workflow_revisions(id)', 'source_id ID NOT NULL'],
    fields: ['revisionId', 'sourceId'],
    constraints: ['FOREIGN KEY(source_id,revision_id) REFERENCES research_sources(id,revision_id)'],
  },
];
export function sqliteResearchGuards() {
  return (
    researchTables
      .map(
        ({ table }) => `
CREATE TRIGGER IF NOT EXISTS ${table}_draft_insert BEFORE INSERT ON ${table}
WHEN (SELECT json_extract(document,'$.status') FROM workflow_revisions WHERE id=NEW.revision_id)!='draft'
BEGIN SELECT RAISE(ABORT,'Research snapshot is immutable outside draft'); END;
CREATE TRIGGER IF NOT EXISTS ${table}_draft_update BEFORE UPDATE ON ${table}
WHEN (SELECT json_extract(document,'$.status') FROM workflow_revisions WHERE id=OLD.revision_id)!='draft'
OR (SELECT json_extract(document,'$.status') FROM workflow_revisions WHERE id=NEW.revision_id)!='draft'
BEGIN SELECT RAISE(ABORT,'Research snapshot is immutable outside draft'); END;
CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
BEGIN SELECT RAISE(ABORT,'Research history cannot be deleted'); END;`,
      )
      .join('\n') + '\nINSERT OR IGNORE INTO schema_migrations(version) VALUES(3);'
  );
}
