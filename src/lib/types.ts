/** Wire types shared by the route handlers and the browser. */

export interface StoreSummary {
  id: string;
  name: string;
  code: string;
  timezone: string;
  canManage: boolean;
}

export interface MeResponse {
  user: { id: string; displayName: string; upn: string; email: string | null };
  isAdmin: boolean;
  stores: StoreSummary[];
}

export interface StandardShiftDto {
  id: string;
  /** 0 = Sunday, matching `Date#getUTCDay`. */
  weekday: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  label: string | null;
  workedMinutes: number;
}

export interface MemberDto {
  id: string;
  userId: string;
  displayName: string;
  upn: string;
  role: "manager" | "staff";
  employmentType: string | null;
  active: boolean;
  /** The recurring week this person works, empty when nothing is defined. */
  standardShifts: StandardShiftDto[];
}

export interface ShiftDto {
  id: string;
  storeId: string;
  userId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  label: string | null;
  notes: string | null;
  status: "draft" | "published";
  workedMinutes: number;
}

export interface PayPeriodDto {
  id: string | null;
  storeId: string;
  startDate: string;
  endDate: string;
  status: "open" | "submitted" | "approved" | "rejected";
  submittedAt: string | null;
  submittedByName: string | null;
  submissionNote: string | null;
  reviewerEmail: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface RosterResponse {
  store: StoreSummary;
  period: { startDate: string; endDate: string };
  days: string[];
  members: MemberDto[];
  shifts: ShiftDto[];
}

export interface TimesheetEntryDto {
  id: string;
  userId: string;
  shiftId: string | null;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  rosteredMinutes: number | null;
  note: string | null;
  workedMinutes: number;
}

export interface TimesheetResponse {
  store: StoreSummary;
  period: PayPeriodDto;
  days: string[];
  members: MemberDto[];
  entries: TimesheetEntryDto[];
  locked: boolean;
  canSubmit: boolean;
  periodComplete: boolean;
}

export interface StaffTotal {
  userId: string;
  displayName: string;
  upn: string;
  rosteredMinutes: number;
  workedMinutes: number;
  varianceMinutes: number;
  days: number;
}

export interface SubmissionSummary {
  storeName: string;
  storeCode: string;
  startDate: string;
  endDate: string;
  submittedBy: string;
  submittedAt: string;
  note: string | null;
  totals: StaffTotal[];
  totalWorkedMinutes: number;
  totalRosteredMinutes: number;
}

export interface ApiErrorBody {
  error: string;
  detail?: unknown;
}
