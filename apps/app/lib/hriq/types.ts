/**
 * Shared types for data passed between Server and Client Components.
 *
 * These types represent the *serialized* shape of Prisma query results
 * after going through serialize(). All Decimal/Date fields are strings.
 *
 * Usage:
 *   import type { SerializedPayment, SerializedEmployee } from "@/lib/hriq/types";
 */

// ─── Employees ─────────────────────────────────────────────────────────────────

export type EmployeeSummary = {
  id: string;
  employeeNumber: string | null;
  legalFirstName: string;
  legalLastName: string;
  secondLastName?: string | null;
  preferredName?: string | null;
  workEmail?: string | null;
  photoUrl?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  employmentStatus: string;
  organization?: { id: string; name: string } | null;
};

export type EmployeeRef = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  employeeNumber: string;
};

// ─── Payments ──────────────────────────────────────────────────────────────────

export type SerializedPayment = {
  id: string;
  status: string;
  amount: string;
  currency: string;
  paymentType: string;
  paymentMethod: string | null;
  paymentDate: string | null;
  createdAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  employee: EmployeeRef;
};

export type ExternalPayment = SerializedPayment & {
  hoursWorked: string | null;
  hourlyRate: string | null;
  description: string | null;
  transactionId: string | null;
  employee: EmployeeRef & {
    organization: { id: string; name: string } | null;
  };
};

export type PaymentStatRow = {
  status: string;
  count: number;
  total: number;
};

// ─── Timesheets ────────────────────────────────────────────────────────────────

export type TimesheetPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status?: string;
};

export type TimesheetSubmission = {
  id: string;
  employeeId: string;
  periodId: string;
  status: string;
  totalHours: string;
  bonusTotal?: string;
  submittedAt: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  notes?: string | null;
  rejectionReason?: string | null;
  employee?: EmployeeSummary;
  period?: TimesheetPeriod;
};

// ─── Organizations ─────────────────────────────────────────────────────────────

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  profile?: {
    website?: string | null;
    industry?: string | null;
    billingEmail?: string | null;
    paymentMethod?: string | null;
    paymentTerms?: string | null;
  } | null;
  _count?: {
    members?: number;
    employees?: number;
  };
};

export type OrgOption = {
  id: string;
  name: string;
};

// ─── Client Invoices ───────────────────────────────────────────────────────────

export type SerializedClientInvoice = {
  id: string;
  invoiceNumber: string;
  periodName: string | null;
  periodStart: string;
  periodEnd: string;
  subtotal: string;
  rlFeeType: string | null;
  rlFeeAmount: string | null;
  rlFeeTotal: string;
  totalAmount: string;
  currency: string;
  status: string;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentLink: string | null;
  stripePaymentIntentId: string | null;
  createdAt: string;
  organization: {
    id: string;
    name: string;
    profile?: { paymentMethod: string | null } | null;
  };
  lineItems: SerializedInvoiceLineItem[];
};

export type SerializedInvoiceLineItem = {
  id: string;
  description: string | null;
  hoursWorked: string | null;
  hourlyRate: string | null;
  amount: string;
  employee: { id: string; legalFirstName: string; legalLastName: string };
};

// ─── Audit Log ─────────────────────────────────────────────────────────────────

export type AuditLogEntry = {
  id: string;
  action: string;
  objectType: string;
  objectId: string | null;
  timestamp: string;
  actorDescription: string | null;
  newValue: Record<string, unknown> | null;
};

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export type RLDashboardData = {
  orgCount: number;
  employeeCount: number;
  activeOnboarding: number;
  userCount: number;
  pendingTimesheets: number;
  unpaidAmount: number;
  pendingPayAmount: number;
  totalPaid: number;
  statusData: { name: string; value: number }[];
  recentOrgs: OrganizationSummary[];
  recentSubmissions: { id: string; status: string; totalHours: string; employee: { legalFirstName: string; legalLastName: string }; period: { name: string } }[];
  recentAudit: AuditLogEntry[];
  pendingInfoApprovals: { id: string; legalFirstName: string; legalLastName: string }[];
};

export type ClientDashboardData = {
  orgName: string;
  orgLogoUrl: string | null;
  employeeCount: number;
  activeCount: number;
  pendingTasks: number;
  pendingPayments: number;
  pendingTimesheets: number;
  deptData: { name: string; value: number }[];
  paymentData: { name: string; value: number; count: number }[];
  recentEmployees: {
    id: string;
    legalFirstName: string;
    legalLastName: string;
    jobTitle: string | null;
    employmentStatus: string;
    createdAt: string;
  }[];
  recentTimesheets: {
    id: string;
    status: string;
    totalHours: string;
    employee: { legalFirstName: string; legalLastName: string };
    period: { name: string };
  }[];
};

// ─── Contractor Status Types ───────────────────────────────────────────────────

export type ContractorRow = {
  id: string;
  employeeNumber: string | null;
  name: string;
  preferredName: string | null;
  secondLastName: string | null;
  workEmail: string | null;
  photoUrl: string | null;
  submissionId: string | null;
  status: "not_started" | "draft" | "submitted" | "approved" | "auto_approved" | "rejected";
  totalHours: number;
  bonusTotal: number;
  submittedAt: string | null;
  periodId: string;
  department: string | null;
  orgName: string | null;
};
