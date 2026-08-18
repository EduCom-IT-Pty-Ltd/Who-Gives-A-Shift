CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"submission_reviewer_email" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
