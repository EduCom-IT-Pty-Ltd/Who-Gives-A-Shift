import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  date,
  time,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const shiftStatus = pgEnum("shift_status", ["draft", "published"]);
export const payPeriodStatus = pgEnum("pay_period_status", [
  "open",
  "submitted",
  "approved",
  "rejected",
]);
export const memberRole = pgEnum("member_role", ["manager", "staff"]);

/**
 * A trading location. Authorisation for managing a store is driven by Entra
 * security-group membership: whoever is in `managerGroupId` manages this store.
 */
export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  timezone: text("timezone").notNull().default("Australia/Sydney"),
  managerGroupId: text("manager_group_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tenant-wide operational settings. The keyed row keeps this extensible while
 * ensuring we never accidentally create multiple competing configurations.
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  submissionReviewerEmail: text("submission_reviewer_email").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Provisioned just-in-time on first successful sign-in. `entraObjectId` is the
 * `oid` claim and is the only stable identifier — UPNs and emails change.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entraObjectId: text("entra_object_id").notNull().unique(),
    upn: text("upn").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_upn_idx").on(t.upn)],
);

/** Who appears on a store's roster. Distinct from Entra-driven authorisation. */
export const storeMembers = pgTable(
  "store_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("staff"),
    employmentType: text("employment_type"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("store_members_store_user_uq").on(t.storeId, t.userId),
    index("store_members_store_idx").on(t.storeId),
  ],
);

/**
 * A staff member's recurring week. Full-time and part-time staff work the same
 * pattern every cycle, so it is described once here and stamped onto a cycle as
 * draft shifts rather than retyped weekly. Rows are per weekday, and more than
 * one row per weekday expresses a split shift.
 */
export const memberStandardShifts = pgTable(
  "member_standard_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeMemberId: uuid("store_member_id")
      .notNull()
      .references(() => storeMembers.id, { onDelete: "cascade" }),
    /** 0 = Sunday, matching `Date#getUTCDay` as used throughout `lib/dates`. */
    weekday: integer("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    breakMinutes: integer("break_minutes").notNull().default(0),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("member_standard_shifts_slot_uq").on(t.storeMemberId, t.weekday, t.startTime),
    index("member_standard_shifts_member_idx").on(t.storeMemberId),
  ],
);

/**
 * A rostered shift. Times are stored as a local date plus wall-clock times
 * rather than instants: a roster written as "Thu 9:00–17:00" must stay that way
 * across a daylight-saving boundary. Overnight shifts are implied by
 * `endTime <= startTime` and are resolved in `lib/shift-time.ts`.
 */
export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workDate: date("work_date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    breakMinutes: integer("break_minutes").notNull().default(0),
    label: text("label"),
    notes: text("notes"),
    status: shiftStatus("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("shifts_store_date_idx").on(t.storeId, t.workDate),
    index("shifts_user_date_idx").on(t.userId, t.workDate),
  ],
);

/**
 * One Thursday-to-Wednesday cycle for one store. `startDate` is always a
 * Thursday; `endDate` the following Wednesday.
 */
export const payPeriods = pgTable(
  "pay_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: payPeriodStatus("status").notNull().default("open"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedBy: uuid("submitted_by").references(() => users.id),
    submissionNote: text("submission_note"),
    reviewerEmail: text("reviewer_email"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pay_periods_store_start_uq").on(t.storeId, t.startDate)],
);

/**
 * Actual hours worked, seeded from the published roster then corrected by the
 * manager. `shiftId` is nullable so unrostered work can be added.
 */
export const timesheetEntries = pgTable(
  "timesheet_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payPeriodId: uuid("pay_period_id")
      .notNull()
      .references(() => payPeriods.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shiftId: uuid("shift_id").references(() => shifts.id, { onDelete: "set null" }),
    workDate: date("work_date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    breakMinutes: integer("break_minutes").notNull().default(0),
    /** Minutes originally rostered, kept so variance survives roster edits. */
    rosteredMinutes: integer("rostered_minutes"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("timesheet_entries_period_idx").on(t.payPeriodId),
    index("timesheet_entries_period_user_idx").on(t.payPeriodId, t.userId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorLabel: text("actor_label"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId)],
);

export type Store = typeof stores.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
export type User = typeof users.$inferSelect;
export type StoreMember = typeof storeMembers.$inferSelect;
export type MemberStandardShift = typeof memberStandardShifts.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type PayPeriod = typeof payPeriods.$inferSelect;
export type TimesheetEntry = typeof timesheetEntries.$inferSelect;
