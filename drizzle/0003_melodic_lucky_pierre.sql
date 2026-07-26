CREATE TYPE "public"."generation_outcome" AS ENUM('accepted', 'rejected_moderation', 'rejected_rate_limit', 'rejected_credits', 'rejected_access', 'failed');--> statement-breakpoint
CREATE TABLE "generation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"tier" text NOT NULL,
	"outcome" "generation_outcome" NOT NULL,
	"prompt" text NOT NULL,
	"detail" text,
	"scene_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_events" ADD CONSTRAINT "generation_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_events" ADD CONSTRAINT "generation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_events" ADD CONSTRAINT "generation_events_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_events_workspace_created_idx" ON "generation_events" USING btree ("workspace_id","created_at");