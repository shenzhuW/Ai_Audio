CREATE TABLE "source_assets" (id UUID PRIMARY KEY, project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE, document JSONB NOT NULL);
CREATE INDEX "source_assets_project_id_idx" ON "source_assets"(project_id);
CREATE TABLE "candidate_clips" (id UUID PRIMARY KEY, project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE, document JSONB NOT NULL, director_revision_id UUID NOT NULL REFERENCES workflow_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE, source_asset_id UUID NOT NULL REFERENCES source_assets(id) ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX "candidate_clips_project_id_idx" ON "candidate_clips"(project_id);
CREATE TABLE "asset_bindings" (id UUID PRIMARY KEY, project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE, document JSONB NOT NULL, director_revision_id UUID NOT NULL REFERENCES workflow_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE, shot_id UUID NOT NULL, binding_version INTEGER NOT NULL, source_asset_id UUID NOT NULL REFERENCES source_assets(id) ON DELETE RESTRICT ON UPDATE CASCADE, candidate_id UUID NOT NULL REFERENCES candidate_clips(id) ON DELETE RESTRICT ON UPDATE CASCADE, UNIQUE(project_id,director_revision_id,shot_id,binding_version));
CREATE INDEX "asset_bindings_project_id_idx" ON "asset_bindings"(project_id);
CREATE TABLE "prepared_assets" (id UUID PRIMARY KEY, project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE, document JSONB NOT NULL, recipe_hash TEXT NOT NULL, producer_binding_id UUID NOT NULL REFERENCES asset_bindings(id) ON DELETE RESTRICT ON UPDATE CASCADE, UNIQUE(project_id,recipe_hash));
CREATE INDEX "prepared_assets_project_id_idx" ON "prepared_assets"(project_id);
CREATE FUNCTION enforce_asset_history() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Asset history cannot be deleted'; END IF;
 IF TG_TABLE_NAME='source_assets' THEN
  IF OLD.document->'blob'->>'sha256' IS NOT NULL AND ((OLD.document->'blob'->>'sha256') IS DISTINCT FROM (NEW.document->'blob'->>'sha256') OR (OLD.document->>'sourceUrl') IS DISTINCT FROM (NEW.document->>'sourceUrl')) THEN RAISE EXCEPTION 'Original source is immutable'; END IF;
 ELSIF OLD.document IS DISTINCT FROM NEW.document THEN RAISE EXCEPTION 'Asset history is append only'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER source_assets_history_guard BEFORE UPDATE OR DELETE ON source_assets FOR EACH ROW EXECUTE FUNCTION enforce_asset_history();
CREATE TRIGGER candidate_clips_history_guard BEFORE UPDATE OR DELETE ON candidate_clips FOR EACH ROW EXECUTE FUNCTION enforce_asset_history();
CREATE TRIGGER asset_bindings_history_guard BEFORE UPDATE OR DELETE ON asset_bindings FOR EACH ROW EXECUTE FUNCTION enforce_asset_history();
CREATE TRIGGER prepared_assets_history_guard BEFORE UPDATE OR DELETE ON prepared_assets FOR EACH ROW EXECUTE FUNCTION enforce_asset_history();
