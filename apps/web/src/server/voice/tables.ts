export const voiceTables = [
  {
    key: 'voiceTimelines' as const,
    table: 'voice_timelines',
    columns: [
      'revision_id ID NOT NULL REFERENCES workflow_revisions(id)',
      'script_revision_id ID NOT NULL REFERENCES workflow_revisions(id)',
    ],
    fields: ['revisionId', 'scriptRevisionId'],
    constraints: ['UNIQUE(revision_id)'],
  },
  {
    key: 'voiceCues' as const,
    table: 'voice_cue_versions',
    columns: [
      'revision_id ID NOT NULL REFERENCES workflow_revisions(id)',
      'cue_id ID NOT NULL',
      'anchor_id ID NOT NULL',
      'segment_id ID NOT NULL',
    ],
    fields: ['revisionId', 'cueId', 'anchorId', 'segmentId'],
    constraints: ['UNIQUE(revision_id,cue_id)', 'UNIQUE(revision_id,anchor_id)'],
  },
  {
    key: 'subtitleTracks' as const,
    table: 'subtitle_tracks',
    columns: ['revision_id ID NOT NULL REFERENCES workflow_revisions(id)'],
    fields: ['revisionId'],
    constraints: ['UNIQUE(revision_id)'],
  },
];
export function sqliteVoiceGuards() {
  return (
    voiceTables
      .map(
        ({ table }) => `
CREATE TRIGGER IF NOT EXISTS ${table}_draft_insert BEFORE INSERT ON ${table}
WHEN (SELECT json_extract(document,'$.status') FROM workflow_revisions WHERE id=NEW.revision_id)!='draft'
BEGIN SELECT RAISE(ABORT,'Voice snapshot is immutable outside draft'); END;
CREATE TRIGGER IF NOT EXISTS ${table}_draft_update BEFORE UPDATE ON ${table}
WHEN (SELECT json_extract(document,'$.status') FROM workflow_revisions WHERE id=OLD.revision_id)!='draft'
OR (SELECT json_extract(document,'$.status') FROM workflow_revisions WHERE id=NEW.revision_id)!='draft'
BEGIN SELECT RAISE(ABORT,'Voice snapshot is immutable outside draft'); END;
CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
BEGIN SELECT RAISE(ABORT,'Voice history cannot be deleted'); END;`,
      )
      .join('\n') + '\nINSERT OR IGNORE INTO schema_migrations(version) VALUES(5);'
  );
}
