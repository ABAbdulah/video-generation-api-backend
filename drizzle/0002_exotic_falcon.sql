ALTER TABLE "templates" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
CREATE INDEX "templates_embedding_idx" ON "templates" USING hnsw ("embedding" vector_cosine_ops);