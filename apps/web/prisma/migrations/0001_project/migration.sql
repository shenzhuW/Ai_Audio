CREATE TABLE "projects" (
  "id" UUID PRIMARY KEY,
  "owner_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "updated_at" TEXT NOT NULL,
  "document" JSONB NOT NULL
);
CREATE INDEX "projects_owner_id_updated_at_idx" ON "projects"("owner_id", "updated_at");
