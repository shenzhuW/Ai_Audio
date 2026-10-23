-- CreateTable
CREATE TABLE "research_sources" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "research_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_claims" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "research_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_claim_evidence" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "research_claim_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_index_entries" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "research_index_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_sources_project_id_idx" ON "research_sources"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "research_sources_id_revision_id_key" ON "research_sources"("id", "revision_id");

-- CreateIndex
CREATE INDEX "research_claims_project_id_idx" ON "research_claims"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "research_claims_id_revision_id_key" ON "research_claims"("id", "revision_id");

-- CreateIndex
CREATE INDEX "research_claim_evidence_project_id_idx" ON "research_claim_evidence"("project_id");

-- CreateIndex
CREATE INDEX "research_index_entries_project_id_idx" ON "research_index_entries"("project_id");

-- AddForeignKey
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_claims" ADD CONSTRAINT "research_claims_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_claims" ADD CONSTRAINT "research_claims_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_claim_evidence" ADD CONSTRAINT "research_claim_evidence_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_claim_evidence" ADD CONSTRAINT "research_claim_evidence_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_claim_evidence" ADD CONSTRAINT "research_claim_evidence_claim_id_revision_id_fkey" FOREIGN KEY ("claim_id", "revision_id") REFERENCES "research_claims"("id", "revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_claim_evidence" ADD CONSTRAINT "research_claim_evidence_source_id_revision_id_fkey" FOREIGN KEY ("source_id", "revision_id") REFERENCES "research_sources"("id", "revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_index_entries" ADD CONSTRAINT "research_index_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_index_entries" ADD CONSTRAINT "research_index_entries_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_index_entries" ADD CONSTRAINT "research_index_entries_source_id_revision_id_fkey" FOREIGN KEY ("source_id", "revision_id") REFERENCES "research_sources"("id", "revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Research entities are immutable once their owner revision leaves draft.
CREATE FUNCTION enforce_research_draft() RETURNS trigger AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Research history cannot be deleted'; END IF;
 IF TG_OP = 'UPDATE' AND (SELECT document->>'status' FROM workflow_revisions WHERE id=OLD.revision_id) <> 'draft' THEN RAISE EXCEPTION 'Research snapshot is immutable outside draft'; END IF;
 IF (SELECT document->>'status' FROM workflow_revisions WHERE id=NEW.revision_id) <> 'draft' THEN RAISE EXCEPTION 'Research snapshot is immutable outside draft'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER research_sources_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON research_sources FOR EACH ROW EXECUTE FUNCTION enforce_research_draft();
CREATE TRIGGER research_claims_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON research_claims FOR EACH ROW EXECUTE FUNCTION enforce_research_draft();
CREATE TRIGGER research_claim_evidence_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON research_claim_evidence FOR EACH ROW EXECUTE FUNCTION enforce_research_draft();
CREATE TRIGGER research_index_entries_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON research_index_entries FOR EACH ROW EXECUTE FUNCTION enforce_research_draft();
