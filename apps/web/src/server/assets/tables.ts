export const assetTables = [
  {
    key: 'sourceAssets' as const,
    table: 'source_assets',
    columns: [],
    fields: [],
    constraints: [],
  },
  {
    key: 'candidateClips' as const,
    table: 'candidate_clips',
    columns: [
      'director_revision_id ID NOT NULL REFERENCES workflow_revisions(id)',
      'source_asset_id ID NOT NULL REFERENCES source_assets(id)',
    ],
    fields: ['directorRevisionId', 'sourceAssetId'],
    constraints: [],
  },
  {
    key: 'assetBindings' as const,
    table: 'asset_bindings',
    columns: [
      'director_revision_id ID NOT NULL REFERENCES workflow_revisions(id)',
      'shot_id ID NOT NULL',
      'binding_version INTEGER NOT NULL',
      'source_asset_id ID NOT NULL REFERENCES source_assets(id)',
      'candidate_id ID NOT NULL REFERENCES candidate_clips(id)',
    ],
    fields: ['directorRevisionId', 'shotId', 'version', 'sourceAssetId', 'candidateId'],
    constraints: ['UNIQUE(project_id,director_revision_id,shot_id,binding_version)'],
  },
  {
    key: 'preparedAssets' as const,
    table: 'prepared_assets',
    columns: [
      'recipe_hash TEXT NOT NULL',
      'producer_binding_id ID NOT NULL REFERENCES asset_bindings(id)',
    ],
    fields: ['recipeHash', 'producerBindingId'],
    constraints: ['UNIQUE(project_id,recipe_hash)'],
  },
];
export function sqliteAssetGuards() {
  return (
    assetTables
      .map(
        ({ table }) => `
 CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Asset history cannot be deleted'); END;
 ${
   table === 'source_assets'
     ? `CREATE TRIGGER IF NOT EXISTS source_assets_original_immutable BEFORE UPDATE ON source_assets
 WHEN json_extract(OLD.document,'$.blob.sha256') IS NOT NULL AND
 (json_extract(NEW.document,'$.blob.sha256') IS NOT json_extract(OLD.document,'$.blob.sha256') OR
 json_extract(NEW.document,'$.sourceUrl') IS NOT json_extract(OLD.document,'$.sourceUrl'))
 BEGIN SELECT RAISE(ABORT,'Original source is immutable'); END;`
     : `CREATE TRIGGER IF NOT EXISTS ${table}_append_only BEFORE UPDATE ON ${table} WHEN NEW.document!=OLD.document BEGIN SELECT RAISE(ABORT,'Asset history is append only'); END;`
 }`,
      )
      .join('\n') + '\nINSERT OR IGNORE INTO schema_migrations(version) VALUES(7);'
  );
}
