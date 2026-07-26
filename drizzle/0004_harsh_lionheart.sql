ALTER TABLE "exports" ADD COLUMN "scene_id" text;--> statement-breakpoint
ALTER TABLE "exports" ADD COLUMN "file_data" "bytea";--> statement-breakpoint
ALTER TABLE "exports" ADD COLUMN "file_size" integer;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exports_status_idx" ON "exports" USING btree ("status");