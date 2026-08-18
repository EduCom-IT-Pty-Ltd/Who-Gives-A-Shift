CREATE TABLE "member_standard_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_member_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_standard_shifts" ADD CONSTRAINT "member_standard_shifts_store_member_id_store_members_id_fk" FOREIGN KEY ("store_member_id") REFERENCES "public"."store_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_standard_shifts_slot_uq" ON "member_standard_shifts" USING btree ("store_member_id","weekday","start_time");--> statement-breakpoint
CREATE INDEX "member_standard_shifts_member_idx" ON "member_standard_shifts" USING btree ("store_member_id");
