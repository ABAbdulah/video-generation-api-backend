ALTER TABLE "templates" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "duration_in_frames" integer DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "fps" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_slug_unique" UNIQUE("slug");