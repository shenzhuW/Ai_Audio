CREATE TABLE "director_documents" ("id" UUID PRIMARY KEY, "project_id" UUID NOT NULL, "document" JSONB NOT NULL, "revision_id" UUID NOT NULL, "script_revision_id" UUID NOT NULL, "voice_revision_id" UUID NOT NULL);
CREATE INDEX "director_documents_project_id_idx" ON "director_documents"("project_id");
CREATE UNIQUE INDEX "director_documents_revision_id_key" ON "director_documents"("revision_id");
ALTER TABLE "director_documents" ADD CONSTRAINT "director_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "director_documents" ADD CONSTRAINT "director_documents_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "director_documents" ADD CONSTRAINT "director_documents_script_revision_id_fkey" FOREIGN KEY ("script_revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "director_documents" ADD CONSTRAINT "director_documents_voice_revision_id_fkey" FOREIGN KEY ("voice_revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "director_shot_versions" ("id" UUID PRIMARY KEY, "project_id" UUID NOT NULL, "document" JSONB NOT NULL, "revision_id" UUID NOT NULL, "shot_id" UUID NOT NULL);
CREATE INDEX "director_shot_versions_project_id_idx" ON "director_shot_versions"("project_id");
CREATE UNIQUE INDEX "director_shot_versions_revision_id_shot_id_key" ON "director_shot_versions"("revision_id","shot_id");
ALTER TABLE "director_shot_versions" ADD CONSTRAINT "director_shot_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "director_shot_versions" ADD CONSTRAINT "director_shot_versions_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION enforce_director_draft() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Director history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND (SELECT document->>'status' FROM workflow_revisions WHERE id=OLD.revision_id)<>'draft' THEN RAISE EXCEPTION 'Director snapshot is immutable outside draft'; END IF;
 IF (SELECT document->>'status' FROM workflow_revisions WHERE id=NEW.revision_id)<>'draft' THEN RAISE EXCEPTION 'Director snapshot is immutable outside draft'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER director_documents_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON director_documents FOR EACH ROW EXECUTE FUNCTION enforce_director_draft();
CREATE TRIGGER director_shot_versions_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON director_shot_versions FOR EACH ROW EXECUTE FUNCTION enforce_director_draft();
