CREATE TABLE "voice_timelines" (
 "id" UUID NOT NULL, "project_id" UUID NOT NULL, "revision_id" UUID NOT NULL,
 "script_revision_id" UUID NOT NULL, "document" JSONB NOT NULL,
 CONSTRAINT "voice_timelines_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "voice_cue_versions" (
 "id" UUID NOT NULL, "project_id" UUID NOT NULL, "revision_id" UUID NOT NULL,
 "cue_id" UUID NOT NULL, "anchor_id" UUID NOT NULL, "segment_id" UUID NOT NULL, "document" JSONB NOT NULL,
 CONSTRAINT "voice_cue_versions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "subtitle_tracks" (
 "id" UUID NOT NULL, "project_id" UUID NOT NULL, "revision_id" UUID NOT NULL, "document" JSONB NOT NULL,
 CONSTRAINT "subtitle_tracks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "voice_timelines_revision_id_key" ON "voice_timelines"("revision_id");
CREATE INDEX "voice_timelines_project_id_idx" ON "voice_timelines"("project_id");
CREATE UNIQUE INDEX "voice_cue_versions_revision_id_cue_id_key" ON "voice_cue_versions"("revision_id","cue_id");
CREATE UNIQUE INDEX "voice_cue_versions_revision_id_anchor_id_key" ON "voice_cue_versions"("revision_id","anchor_id");
CREATE INDEX "voice_cue_versions_project_id_idx" ON "voice_cue_versions"("project_id");
CREATE UNIQUE INDEX "subtitle_tracks_revision_id_key" ON "subtitle_tracks"("revision_id");
CREATE INDEX "subtitle_tracks_project_id_idx" ON "subtitle_tracks"("project_id");
ALTER TABLE "voice_timelines" ADD CONSTRAINT "voice_timelines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_timelines" ADD CONSTRAINT "voice_timelines_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_timelines" ADD CONSTRAINT "voice_timelines_script_revision_id_fkey" FOREIGN KEY ("script_revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_cue_versions" ADD CONSTRAINT "voice_cue_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_cue_versions" ADD CONSTRAINT "voice_cue_versions_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subtitle_tracks" ADD CONSTRAINT "subtitle_tracks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subtitle_tracks" ADD CONSTRAINT "subtitle_tracks_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "workflow_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION enforce_voice_draft() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Voice history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND (SELECT document->>'status' FROM workflow_revisions WHERE id=OLD.revision_id)<>'draft' THEN RAISE EXCEPTION 'Voice snapshot is immutable outside draft'; END IF;
 IF (SELECT document->>'status' FROM workflow_revisions WHERE id=NEW.revision_id)<>'draft' THEN RAISE EXCEPTION 'Voice snapshot is immutable outside draft'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER voice_timelines_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON voice_timelines FOR EACH ROW EXECUTE FUNCTION enforce_voice_draft();
CREATE TRIGGER voice_cue_versions_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON voice_cue_versions FOR EACH ROW EXECUTE FUNCTION enforce_voice_draft();
CREATE TRIGGER subtitle_tracks_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON subtitle_tracks FOR EACH ROW EXECUTE FUNCTION enforce_voice_draft();
