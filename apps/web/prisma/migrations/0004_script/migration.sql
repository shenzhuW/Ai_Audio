-- CreateTable
CREATE TABLE "script_documents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "script_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "script_segment_versions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "segment_id" UUID NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "script_segment_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "script_documents_revision_id_key" ON "script_documents"("revision_id");

-- CreateIndex
CREATE INDEX "script_documents_project_id_idx" ON "script_documents"("project_id");

-- CreateIndex
CREATE INDEX "script_segment_versions_project_id_idx" ON "script_segment_versions"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "script_segment_versions_revision_id_segment_id_key" ON "script_segment_versions"("revision_id", "segment_id");

-- AddForeignKey
ALTER TABLE "script_documents" ADD CONSTRAINT "script_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "script_documents" ADD CONSTRAINT "script_documents_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "script_segment_versions" ADD CONSTRAINT "script_segment_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "script_segment_versions" ADD CONSTRAINT "script_segment_versions_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION enforce_script_draft() RETURNS trigger AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Script history cannot be deleted'; END IF;
 IF TG_OP = 'UPDATE' AND (SELECT document->>'status' FROM workflow_revisions WHERE id=OLD.revision_id) <> 'draft' THEN RAISE EXCEPTION 'Script snapshot is immutable outside draft'; END IF;
 IF (SELECT document->>'status' FROM workflow_revisions WHERE id=NEW.revision_id) <> 'draft' THEN RAISE EXCEPTION 'Script snapshot is immutable outside draft'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER script_documents_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON script_documents FOR EACH ROW EXECUTE FUNCTION enforce_script_draft();
CREATE TRIGGER script_segment_versions_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON script_segment_versions FOR EACH ROW EXECUTE FUNCTION enforce_script_draft();
