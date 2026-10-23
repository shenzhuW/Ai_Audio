-- CreateTable
CREATE TABLE "workflow_artifacts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document" JSONB NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "workflow_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_revisions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document" JSONB NOT NULL,
    "artifact_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,

    CONSTRAINT "workflow_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_dependencies" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document" JSONB NOT NULL,
    "upstream_revision_id" UUID NOT NULL,
    "downstream_revision_id" UUID NOT NULL,

    CONSTRAINT "workflow_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_approval_events" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document" JSONB NOT NULL,
    "revision_id" UUID NOT NULL,

    CONSTRAINT "workflow_approval_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_jobs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document" JSONB NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "workflow_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_outbox" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document" JSONB NOT NULL,
    "job_id" UUID NOT NULL,

    CONSTRAINT "workflow_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_request_receipts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document" JSONB NOT NULL,
    "idempotency_key" TEXT NOT NULL,

    CONSTRAINT "workflow_request_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_audit_events" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "workflow_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_artifacts_project_id_idx" ON "workflow_artifacts"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_artifacts_project_id_type_key" ON "workflow_artifacts"("project_id", "type");

-- CreateIndex
CREATE INDEX "workflow_revisions_project_id_idx" ON "workflow_revisions"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_revisions_artifact_id_revision_number_key" ON "workflow_revisions"("artifact_id", "revision_number");

-- CreateIndex
CREATE INDEX "workflow_dependencies_project_id_idx" ON "workflow_dependencies"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_dependencies_upstream_revision_id_downstream_revis_key" ON "workflow_dependencies"("upstream_revision_id", "downstream_revision_id");

-- CreateIndex
CREATE INDEX "workflow_approval_events_project_id_idx" ON "workflow_approval_events"("project_id");

-- CreateIndex
CREATE INDEX "workflow_jobs_state_idx" ON "workflow_jobs"("state");

-- CreateIndex
CREATE INDEX "workflow_jobs_project_id_idx" ON "workflow_jobs"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_outbox_job_id_key" ON "workflow_outbox"("job_id");

-- CreateIndex
CREATE INDEX "workflow_outbox_project_id_idx" ON "workflow_outbox"("project_id");

-- CreateIndex
CREATE INDEX "workflow_request_receipts_project_id_idx" ON "workflow_request_receipts"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_request_receipts_project_id_idempotency_key_key" ON "workflow_request_receipts"("project_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "workflow_audit_events_project_id_idx" ON "workflow_audit_events"("project_id");

-- AddForeignKey
ALTER TABLE "workflow_artifacts" ADD CONSTRAINT "workflow_artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_revisions" ADD CONSTRAINT "workflow_revisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_revisions" ADD CONSTRAINT "workflow_revisions_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "workflow_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_dependencies" ADD CONSTRAINT "workflow_dependencies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_dependencies" ADD CONSTRAINT "workflow_dependencies_upstream_revision_id_fkey" FOREIGN KEY ("upstream_revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_dependencies" ADD CONSTRAINT "workflow_dependencies_downstream_revision_id_fkey" FOREIGN KEY ("downstream_revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_approval_events" ADD CONSTRAINT "workflow_approval_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_approval_events" ADD CONSTRAINT "workflow_approval_events_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_outbox" ADD CONSTRAINT "workflow_outbox_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_outbox" ADD CONSTRAINT "workflow_outbox_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "workflow_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_request_receipts" ADD CONSTRAINT "workflow_request_receipts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_audit_events" ADD CONSTRAINT "workflow_audit_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense in depth: history is append only; approved revision documents cannot be rewritten.
CREATE FUNCTION workflow_protect_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Workflow history is immutable';
END;
$$;
CREATE FUNCTION workflow_protect_approved() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.document->>'status' = 'approved' AND NEW.document IS DISTINCT FROM OLD.document THEN
    RAISE EXCEPTION 'Approved revisions are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workflow_revision_immutable BEFORE UPDATE ON workflow_revisions
FOR EACH ROW EXECUTE FUNCTION workflow_protect_approved();
CREATE TRIGGER workflow_revision_no_delete BEFORE DELETE ON workflow_revisions
FOR EACH ROW EXECUTE FUNCTION workflow_protect_history();
CREATE TRIGGER workflow_approval_append_only BEFORE UPDATE OR DELETE ON workflow_approval_events
FOR EACH ROW EXECUTE FUNCTION workflow_protect_history();
CREATE TRIGGER workflow_audit_append_only BEFORE UPDATE OR DELETE ON workflow_audit_events
FOR EACH ROW EXECUTE FUNCTION workflow_protect_history();
CREATE TRIGGER workflow_request_append_only BEFORE UPDATE OR DELETE ON workflow_request_receipts
FOR EACH ROW EXECUTE FUNCTION workflow_protect_history();
