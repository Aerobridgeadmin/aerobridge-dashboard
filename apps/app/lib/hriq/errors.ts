/**
 * 
 *  HRIQ ERROR CATALOG
 * 
 *
 *  Code format:  HRIQ-XXYY
 *    XX = module (01–99)    YY = sequence within module
 *
 *  
 *   XX  Module                    Scope                                     
 *  
 *   01  Auth / Session            Login, session, permissions               
 *   02  Employees                 Employee CRUD, status, linking            
 *   03  Documents                 Document management                       
 *   04  Contracts / Signing       Contract templates, JotForm Sign          
 *   05  Onboarding                Sessions, steps, batches, activation      
 *   06  Hiring Pipeline           Forms, submissions, pipeline stages       
 *   07  JotForm                   JotForm API, form config, prefill         
 *   08  Payments                  Payment records, payouts, invoices        
 *   09  Payroll                   Payroll periods, year filters             
 *   10  Timesheets                Submissions, approvals, daily entries     
 *   11  Tasks                     Task management                           
 *   12  Expenses                  Expense reports, approvals                
 *   13  Time-Off                  Time-off requests                         
 *   14  Invitations               Org invitations                           
 *   15  Users / Accounts          User CRUD, passwords                      
 *   16  Organizations             Org management, switching                 
 *   17  Email / Gmail             Gmail API, calendar invites               
 *   18  Upload / Storage          File uploads, Supabase storage            
 *   19  Contractor Info           Self-service info form (one-time use)     
 *   20  Contractor Dashboard      Dashboard provisioning, credentials       
 *   21  Background Sync           Time Doctor sync, cron jobs               
 *   22  RecruitCRM                RecruitCRM integration                    
 *   23  Zoom                      Zoom meeting creation/deletion            
 *   24  Pending Hires             Pre-hire approvals                        
 *   25  Contractor Self-Service   Contractor dashboard access               
 *   30  Pay Runs                  Pay run lifecycle                         
 *   50  Bulk Actions              Bulk email, bulk status changes            
 *   99  System                    Catch-all, database, external services    
 *  
 *
 *  Severity: CRITICAL | ERROR | WARNING | INFO
 */

export const ERROR_CATALOG = {
  // 01 — Auth
  "HRIQ-0101": "Authentication required",
  "HRIQ-0102": "Organization context required",
  "HRIQ-0103": "Insufficient permissions",
  "HRIQ-0104": "Only super admins can perform this action",
  "HRIQ-0105": "Cannot change your own role",
  // 02 — Employees
  "HRIQ-0201": "Employee not found",
  "HRIQ-0202": "Employee record is locked",
  "HRIQ-0203": "Work email already in use by another employee",
  "HRIQ-0204": "Unique constraint violated — check for duplicates",
  "HRIQ-0205": "Invalid employee status",
  "HRIQ-0206": "Cannot create employee in another organization",
  "HRIQ-0207": "No email address on file for this contractor",
  "HRIQ-0208": "Employee has no organization",
  "HRIQ-0209": "Employee has no linked user account",
  "HRIQ-0210": "Only super admins can renumber employees",
  // 03 — Documents
  "HRIQ-0301": "Document not found",
  "HRIQ-0302": "Invalid document status",
  "HRIQ-0303": "No document type provided",
  // 04 — Contracts / Signing
  "HRIQ-0401": "Contract template not found",
  "HRIQ-0402": "Signing request not found",
  "HRIQ-0403": "Invalid signing status",
  // 05 — Onboarding
  "HRIQ-0501": "Onboarding step not found",
  "HRIQ-0502": "Invalid onboarding step status",
  "HRIQ-0503": "Onboarding session not found",
  "HRIQ-0504": "Batch session not found",
  "HRIQ-0505": "Employee has no onboarding session",
  // 06 — Hiring
  "HRIQ-0601": "Form not found in hiring pipeline",
  "HRIQ-0602": "Submission not found",
  "HRIQ-0603": "Batch session has no Zoom meeting",
  "HRIQ-0604": "Batch session has no Zoom meeting to delete",
  // 07 — JotForm
  "HRIQ-0701": "JotForm API key not configured",
  "HRIQ-0702": "JotForm account mismatch",
  "HRIQ-0703": "Failed to validate JotForm account",
  // 08 — Payments
  "HRIQ-0801": "Payment not found",
  "HRIQ-0802": "Invalid payment type",
  "HRIQ-0803": "Invalid payment status",
  "HRIQ-0804": "Amount must be a positive number",
  "HRIQ-0805": "Client invoice must be paid first",
  "HRIQ-0806": "Contractor does not have a verified Stripe Connect account",
  "HRIQ-0807": "Invalid payment amount for Stripe transfer",
  "HRIQ-0808": "Stripe Connect transfer failed",
  // 08 — Wise Payouts
  "HRIQ-0810": "Chilean recipient requires additional details",
  "HRIQ-0811": "Colombian recipient requires additional details",
  "HRIQ-0812": "Philippine recipient requires additional details",
  "HRIQ-0813": "Missing bank details for US recipient",
  "HRIQ-0814": "Cannot auto-setup Wise recipient for this country",
  "HRIQ-0815": "Contractor has no Wise recipient configured",
  "HRIQ-0816": "Insufficient Wise balance",
  // 08.3 — ACH Collections
  "HRIQ-0830": "ACH collection not settled — cannot release payout",
  "HRIQ-0831": "ACH collection not found",
  "HRIQ-0832": "Cannot retry ACH collection in current status",
  // 08.5 — Management Auth
  "HRIQ-0850": "Management password not configured",
  "HRIQ-0851": "Invalid management password",
  // 09 — Payroll
  "HRIQ-0901": "Payroll period not found",
  "HRIQ-0902": "Year must be between 2024 and 2030",
  "HRIQ-0910": "Duplicate pay run for this period",
  // 10 — Timesheets
  "HRIQ-1001": "Timesheet submission not found",
  "HRIQ-1002": "Invalid timesheet status",
  "HRIQ-1003": "Cannot approve timesheet in current status",
  "HRIQ-1004": "Cannot reject timesheet in current status",
  "HRIQ-1005": "Hours must be between 0 and 24 per day",
  "HRIQ-1006": "Invalid start or end date",
  "HRIQ-1007": "Overlapping timesheet period",
  "HRIQ-1008": "Cannot modify timesheet: linked to an active payment or pay run",
  // 11 — Tasks
  "HRIQ-1101": "Task not found",
  "HRIQ-1102": "Invalid task status",
  // 12 — Expenses
  "HRIQ-1201": "Expense report not found",
  "HRIQ-1202": "Cannot approve expense in current status",
  "HRIQ-1203": "Cannot reject expense in current status",
  "HRIQ-1204": "Expense item amount must be positive",
  // 13 — Time-Off
  "HRIQ-1301": "Time-off request not found",
  "HRIQ-1302": "Cannot approve request in current status",
  "HRIQ-1303": "Cannot reject request in current status",
  "HRIQ-1304": "End date cannot be before start date",
  "HRIQ-1305": "Total days must be between 1 and 365",
  "HRIQ-1306": "Time-off policy not found",
  "HRIQ-1307": "Overlapping time-off request",
  // 14 — Invitations
  "HRIQ-1401": "Invitation not found",
  "HRIQ-1402": "Invitation expired",
  "HRIQ-1403": "Invalid invitation",
  "HRIQ-1404": "Invitation already accepted",
  "HRIQ-1405": "Admin email is required",
  "HRIQ-1406": "Invitation email mismatch",
  // 15 — Users
  "HRIQ-1501": "User not found",
  "HRIQ-1502": "Failed to create user account",
  "HRIQ-1503": "Failed to resolve user ID",
  "HRIQ-1504": "Invalid user role",
  "HRIQ-1505": "Membership not found",
  "HRIQ-1506": "Failed to reset password",
  // 16 — Organizations
  "HRIQ-1601": "Organization not found",
  "HRIQ-1602": "No RL org found",
  "HRIQ-1603": "Cannot delete the internal super-admin organization",
  "HRIQ-1604": "Failed to switch organization",
  "HRIQ-1605": "Failed to clear organization data",
  // 17 — Email
  "HRIQ-1701": "Email not configured — missing credentials",
  "HRIQ-1702": "Gmail API error",
  "HRIQ-1703": "Failed to send email",
  "HRIQ-1704": "Invalid date for calendar invite",
  // 18 — Upload / Storage
  "HRIQ-1801": "No file provided",
  "HRIQ-1802": "File too large (max 10 MB)",
  "HRIQ-1803": "File must be an image",
  "HRIQ-1804": "Upload failed",
  "HRIQ-1805": "Missing upload token",
  "HRIQ-1806": "Missing Supabase configuration",
  // 19 — Contractor Info
  "HRIQ-1901": "Form is no longer available",
  "HRIQ-1902": "Contractor not found",
  "HRIQ-1906": "Information already submitted — contact your coordinator to make changes",
  // 20 — Contractor Dashboard
  "HRIQ-2001": "Dashboard already provisioned",
  "HRIQ-2002": "Failed to provision contractor dashboard",
  "HRIQ-2003": "Failed to create user — no ID returned",
  // 21 — Sync
  "HRIQ-2101": "Background sync failed",
  // 22 — RecruitCRM
  "HRIQ-2201": "RecruitCRM API error",
  "HRIQ-2202": "RecruitCRM not configured",
  // 23 — Zoom
  "HRIQ-2301": "Failed to create Zoom meeting",
  "HRIQ-2302": "Failed to delete Zoom meeting",
  // 24 — Pending Hires
  "HRIQ-2401": "Pending hire not found",
  // 25 — Contractor Self-Service
  "HRIQ-2501": "No contractor profile linked to your account",
  "HRIQ-2502": "No organization linked to your account",
  "HRIQ-2503": "No organization linked to your account",
  "HRIQ-2504": "You do not have permission to update this profile",
  // 99 — System
  // Pay Run errors
  "HRIQ-3001": "Pay run not found",
  "HRIQ-3002": "Can only edit draft pay runs",
  "HRIQ-3003": "Pay run must be in draft status to send for approval",
  "HRIQ-3004": "Pay run has no items",
  "HRIQ-3005": "Not authorized for this pay run",
  "HRIQ-3006": "Pay run is not pending approval",
  "HRIQ-3007": "Pay run must be approved before completing",
  "HRIQ-3008": "Cannot delete a completed pay run",

  // 50 — Bulk Actions
  "HRIQ-5001": "No contractors selected",
  "HRIQ-5002": "Maximum 200 contractors per bulk action",
  "HRIQ-5003": "Subject is required",
  "HRIQ-5004": "Body is required",

  "HRIQ-9901": "An unexpected error occurred",
  "HRIQ-9902": "Database operation failed",
  "HRIQ-9903": "Validation failed",
  "HRIQ-9904": "External service unavailable",
} as const;

export type HriqCode = keyof typeof ERROR_CATALOG;

//  HriqError 

export class HriqError extends Error {
  public readonly code: HriqCode;
  public readonly detail?: string;

  constructor(code: HriqCode, detail?: string) {
    const base = ERROR_CATALOG[code];
    super(detail ? `[${code}] ${base}: ${detail}` : `[${code}] ${base}`);
    this.name = "HriqError";
    this.code = code;
    this.detail = detail;
  }
}

//  Helpers (throw shortcuts) 

/** Throw if value is falsy. */
export function hriqAssert(
  condition: unknown,
  code: HriqCode,
  detail?: string,
): asserts condition {
  if (!condition) throw new HriqError(code, detail);
}

//  Client-side helpers 

/** Extract `{ code, text }` from a serialised error message. */
export function parseHriqCode(message: string): { code: string; text: string } | null {
  const m = message.match(/^\[(HRIQ-\d{4})\]\s*(.+)$/);
  return m ? { code: m[1], text: m[2] } : null;
}

//  Error metadata (severity, module, resolution, HTTP status) 

export type ErrorSeverity = "critical" | "error" | "warning" | "info";

type ErrorMeta = { severity: ErrorSeverity; module: string; resolution: string; http: number };

const META: Record<string, ErrorMeta> = {
  // 01 — Auth
  "HRIQ-0101": { severity: "error",    module: "Auth",       resolution: "Redirect to login. Clear cookies if persistent.", http: 401 },
  "HRIQ-0102": { severity: "error",    module: "Auth",       resolution: "Switch to an organization from the sidebar.", http: 403 },
  "HRIQ-0103": { severity: "error",    module: "Auth",       resolution: "Contact an admin to adjust your role.", http: 403 },
  "HRIQ-0104": { severity: "error",    module: "Auth",       resolution: "Login with a super_admin account.", http: 403 },
  "HRIQ-0105": { severity: "warning",  module: "Auth",       resolution: "Ask another admin to change your role.", http: 400 },
  // 02 — Employees
  "HRIQ-0201": { severity: "error",    module: "Employees",  resolution: "Verify employee ID and org scope.", http: 404 },
  "HRIQ-0202": { severity: "warning",  module: "Employees",  resolution: "Unlock the employee record first.", http: 409 },
  "HRIQ-0203": { severity: "error",    module: "Employees",  resolution: "Use a different email or update the existing employee.", http: 409 },
  "HRIQ-0204": { severity: "error",    module: "Employees",  resolution: "Check for duplicate employee numbers, emails, or slugs.", http: 409 },
  "HRIQ-0205": { severity: "error",    module: "Employees",  resolution: "Follow status flow: pre_hire  onboarding  active.", http: 400 },
  "HRIQ-0206": { severity: "error",    module: "Employees",  resolution: "Switch to the correct organization first.", http: 403 },
  "HRIQ-0207": { severity: "error",    module: "Employees",  resolution: "Add an email address to the employee record.", http: 400 },
  "HRIQ-0208": { severity: "critical", module: "Employees",  resolution: "Admin must assign the employee to an organization.", http: 500 },
  "HRIQ-0209": { severity: "warning",  module: "Employees",  resolution: "Provision a dashboard account from the employee detail page.", http: 400 },
  "HRIQ-0210": { severity: "error",    module: "Employees",  resolution: "Only super admins can renumber employees.", http: 403 },
  // 03 — Documents
  "HRIQ-0301": { severity: "error",    module: "Documents",  resolution: "Verify document ID and organization scope.", http: 404 },
  "HRIQ-0302": { severity: "error",    module: "Documents",  resolution: "Use a valid status: pending, verified, rejected, expired.", http: 400 },
  "HRIQ-0303": { severity: "error",    module: "Documents",  resolution: "Provide a documentType (paystub, invoice, id_document, etc.).", http: 400 },
  // 04 — Contracts
  "HRIQ-0401": { severity: "error",    module: "Contracts",  resolution: "Verify template ID or create a new template.", http: 404 },
  "HRIQ-0402": { severity: "error",    module: "Contracts",  resolution: "Check the signing request ID and JotForm Sign config.", http: 404 },
  "HRIQ-0403": { severity: "error",    module: "Contracts",  resolution: "Check signing workflow state and org context.", http: 400 },
  // 05 — Onboarding
  "HRIQ-0501": { severity: "error",    module: "Onboarding", resolution: "Verify step ID and org scope.", http: 404 },
  "HRIQ-0502": { severity: "error",    module: "Onboarding", resolution: "Use: pending, sent, in_progress, completed, skipped, blocked.", http: 400 },
  "HRIQ-0503": { severity: "error",    module: "Onboarding", resolution: "Start onboarding for this employee via the hiring pipeline.", http: 404 },
  "HRIQ-0504": { severity: "error",    module: "Onboarding", resolution: "Verify batch session ID. Create a new batch if needed.", http: 404 },
  "HRIQ-0505": { severity: "error",    module: "Onboarding", resolution: "Complete or skip all required steps, then try activation.", http: 400 },
  // 06 — Hiring
  "HRIQ-0601": { severity: "error",    module: "Hiring",     resolution: "Verify the form configuration.", http: 404 },
  "HRIQ-0602": { severity: "error",    module: "Hiring",     resolution: "Check submission ID. May have been deleted.", http: 404 },
  "HRIQ-0603": { severity: "warning",  module: "Hiring",     resolution: "Add a Zoom meeting date to the batch session.", http: 400 },
  "HRIQ-0604": { severity: "warning",  module: "Hiring",     resolution: "No action needed — batch has no Zoom meeting.", http: 400 },
  // 07 — JotForm
  "HRIQ-0701": { severity: "critical", module: "JotForm",    resolution: "Set JOTFORM_API_KEY in Vercel env vars.", http: 500 },
  "HRIQ-0702": { severity: "error",    module: "JotForm",    resolution: "Verify JOTFORM_API_KEY belongs to correct account.", http: 403 },
  "HRIQ-0703": { severity: "error",    module: "JotForm",    resolution: "Check API key validity and form existence.", http: 502 },
  // 08 — Payments
  "HRIQ-0801": { severity: "error",    module: "Payments",   resolution: "Verify payment ID and org scope.", http: 404 },
  "HRIQ-0802": { severity: "warning",  module: "Payments",   resolution: "Payment is already completed. Create a new one if needed.", http: 409 },
  "HRIQ-0803": { severity: "error",    module: "Payments",   resolution: "Use: wise, bank_transfer, paypal, zelle, crypto, other.", http: 400 },
  "HRIQ-0804": { severity: "error",    module: "Payments",   resolution: "Enter the transaction reference from your payment provider.", http: 400 },
  "HRIQ-0805": { severity: "error",    module: "Payments",   resolution: "Mark the client invoice as paid in the Client Invoices tab before releasing contractor payments.", http: 403 },
  "HRIQ-0810": { severity: "error",    module: "Wise",       resolution: "Provide RUT and bank code via the details override.", http: 400 },
  "HRIQ-0811": { severity: "error",    module: "Wise",       resolution: "Provide ID type/number and bank code via the details override.", http: 400 },
  "HRIQ-0812": { severity: "error",    module: "Wise",       resolution: "Provide bank code via the details override.", http: 400 },
  "HRIQ-0813": { severity: "error",    module: "Wise",       resolution: "Add routing and account numbers to the contractor's profile.", http: 400 },
  "HRIQ-0814": { severity: "error",    module: "Wise",       resolution: "Use setupWiseRecipient with explicit details override for this country.", http: 400 },
  "HRIQ-0815": { severity: "error",    module: "Wise",       resolution: "Run setupWiseRecipient for this contractor before executing a Wise payout.", http: 400 },
  "HRIQ-0816": { severity: "error",    module: "Wise",       resolution: "Top up the Wise USD balance before processing this payout.", http: 402 },
  "HRIQ-0830": { severity: "error",    module: "ACH",        resolution: "Wait for the ACH collection to settle before releasing contractor payouts.", http: 403 },
  "HRIQ-0831": { severity: "error",    module: "ACH",        resolution: "Check the ACH collection ID — it may have been deleted.", http: 404 },
  "HRIQ-0832": { severity: "error",    module: "ACH",        resolution: "Only FAILED or PERMANENTLY_FAILED collections can be retried.", http: 409 },
  "HRIQ-0850": { severity: "error",    module: "Auth",       resolution: "Set MANAGEMENT_PASSWORD env var.", http: 500 },
  "HRIQ-0851": { severity: "error",    module: "Auth",       resolution: "Enter the correct management password.", http: 403 },
  // 09 — Payroll
  "HRIQ-0901": { severity: "error",    module: "Payroll",    resolution: "Verify period ID. Ensure it was synced to the correct org.", http: 404 },
  "HRIQ-0902": { severity: "error",    module: "Payroll",    resolution: "Use a year between 2024 and 2030.", http: 400 },
  "HRIQ-0910": { severity: "error",    module: "Payroll",    resolution: "A pay run already exists for this org and date range. Cancel it first if needed.", http: 409 },
  // 10 — Timesheets
  "HRIQ-1001": { severity: "error",    module: "Timesheets", resolution: "Verify submission ID.", http: 404 },
  "HRIQ-1002": { severity: "error",    module: "Timesheets", resolution: "Use: draft, submitted, approved, rejected, auto_approved.", http: 400 },
  "HRIQ-1003": { severity: "error",    module: "Timesheets", resolution: "Timesheet is locked. Contact admin or create a new submission.", http: 409 },
  "HRIQ-1004": { severity: "error",    module: "Timesheets", resolution: "Only submitted timesheets can be rejected.", http: 409 },
  "HRIQ-1005": { severity: "error",    module: "Timesheets", resolution: "Enter hours between 0 and 24 per day.", http: 400 },
  "HRIQ-1006": { severity: "error",    module: "Timesheets", resolution: "Use ISO format dates (YYYY-MM-DD).", http: 400 },
  "HRIQ-1007": { severity: "error",    module: "Timesheets", resolution: "Adjust dates to avoid overlapping with an existing timesheet period.", http: 409 },
  "HRIQ-1008": { severity: "error",    module: "Timesheets", resolution: "Reverse or void the linked payment before modifying this timesheet.", http: 409 },
  // 11 — Tasks
  "HRIQ-1101": { severity: "error",    module: "Tasks",      resolution: "Verify task ID and org scope.", http: 404 },
  "HRIQ-1102": { severity: "error",    module: "Tasks",      resolution: "Use: open, in_progress, completed, cancelled.", http: 400 },
  // 12 — Expenses
  "HRIQ-1201": { severity: "error",    module: "Expenses",   resolution: "Verify expense ID.", http: 404 },
  "HRIQ-1202": { severity: "error",    module: "Expenses",   resolution: "Expense must be in submitted status to approve.", http: 409 },
  "HRIQ-1203": { severity: "error",    module: "Expenses",   resolution: "Expense must be in submitted status to reject.", http: 409 },
  "HRIQ-1204": { severity: "error",    module: "Expenses",   resolution: "Enter a positive amount.", http: 400 },
  // 13 — Time-Off
  "HRIQ-1301": { severity: "error",    module: "Time-Off",   resolution: "Verify request ID.", http: 404 },
  "HRIQ-1302": { severity: "error",    module: "Time-Off",   resolution: "Request must be in pending status to approve.", http: 409 },
  "HRIQ-1303": { severity: "error",    module: "Time-Off",   resolution: "Request must be in pending status to reject.", http: 409 },
  "HRIQ-1304": { severity: "error",    module: "Time-Off",   resolution: "Correct the date range so end >= start.", http: 400 },
  "HRIQ-1305": { severity: "error",    module: "Time-Off",   resolution: "Request between 1 and 365 days.", http: 400 },
  "HRIQ-1306": { severity: "error",    module: "Time-Off",   resolution: "The selected policy does not belong to your organization.", http: 404 },
  "HRIQ-1307": { severity: "error",    module: "Time-Off",   resolution: "You already have an approved or pending request for these dates.", http: 409 },
  // 14 — Invitations
  "HRIQ-1401": { severity: "error",    module: "Invitations", resolution: "Check invitation link. Request a new one if expired.", http: 404 },
  "HRIQ-1402": { severity: "error",    module: "Invitations", resolution: "Request a new invitation from an admin.", http: 410 },
  "HRIQ-1403": { severity: "error",    module: "Invitations", resolution: "Request a new invitation link.", http: 400 },
  "HRIQ-1404": { severity: "info",     module: "Invitations", resolution: "Login with the account created from this invitation.", http: 409 },
  "HRIQ-1405": { severity: "error",    module: "Invitations", resolution: "Enter the invitee's email address.", http: 400 },
  "HRIQ-1406": { severity: "error",    module: "Invitations", resolution: "This invitation was sent to a different email. Log in with the correct account.", http: 403 },
  // 15 — Users
  "HRIQ-1501": { severity: "error",    module: "Users",      resolution: "Verify user ID/email. Account may not exist yet.", http: 404 },
  "HRIQ-1502": { severity: "critical", module: "Users",      resolution: "Check if email is in use. Verify Supabase service key.", http: 500 },
  "HRIQ-1503": { severity: "error",    module: "Users",      resolution: "Check if user exists in Supabase auth.", http: 404 },
  "HRIQ-1504": { severity: "error",    module: "Users",      resolution: "Use: super_admin, admin, manager, member, va.", http: 400 },
  "HRIQ-1505": { severity: "error",    module: "Users",      resolution: "Add the user to the organization first.", http: 404 },
  "HRIQ-1506": { severity: "error",    module: "Users",      resolution: "Retry. Check Supabase auth service if persistent.", http: 500 },
  // 16 — Organizations
  "HRIQ-1601": { severity: "error",    module: "Orgs",       resolution: "Verify org ID/slug. May have been deleted.", http: 404 },
  "HRIQ-1602": { severity: "critical", module: "Orgs",       resolution: "Check RL_ORGANIZATION_ID env var and database.", http: 500 },
  "HRIQ-1603": { severity: "error",    module: "Orgs",       resolution: "RL org (org_rl_001) is protected and cannot be deleted.", http: 403 },
  "HRIQ-1604": { severity: "error",    module: "Orgs",       resolution: "Verify user has membership in the target org.", http: 403 },
  "HRIQ-1605": { severity: "critical", module: "Orgs",       resolution: "Check database constraints and foreign key dependencies.", http: 500 },
  // 17 — Email
  "HRIQ-1701": { severity: "critical", module: "Email",      resolution: "Set GOOGLE_SERVICE_ACCOUNT_KEY in Vercel env vars.", http: 500 },
  "HRIQ-1702": { severity: "error",    module: "Email",      resolution: "Check Gmail API quotas and service account permissions.", http: 502 },
  "HRIQ-1703": { severity: "warning",  module: "Email",      resolution: "Retry. Check recipient email and Gmail API logs.", http: 502 },
  "HRIQ-1704": { severity: "error",    module: "Email",      resolution: "Use ISO 8601 date format.", http: 400 },
  // 18 — Upload
  "HRIQ-1801": { severity: "error",    module: "Upload",     resolution: "Select a file before uploading.", http: 400 },
  "HRIQ-1802": { severity: "error",    module: "Upload",     resolution: "Compress the file (max 10 MB).", http: 413 },
  "HRIQ-1803": { severity: "error",    module: "Upload",     resolution: "Upload an image file (JPEG, PNG, WebP, GIF).", http: 415 },
  "HRIQ-1804": { severity: "error",    module: "Upload",     resolution: "Retry. Check Supabase storage bucket config.", http: 500 },
  "HRIQ-1805": { severity: "error",    module: "Upload",     resolution: "Use the upload link from the onboarding email.", http: 401 },
  "HRIQ-1806": { severity: "critical", module: "Upload",     resolution: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.", http: 500 },
  // 19 — Contractor Info
  "HRIQ-1901": { severity: "info",     module: "Contractor Info", resolution: "Contact your coordinator for a new link.", http: 410 },
  "HRIQ-1902": { severity: "error",    module: "Contractor Info", resolution: "Link may be incorrect. Contact your coordinator.", http: 404 },
  "HRIQ-1906": { severity: "info",     module: "Contractor Info", resolution: "Ask admin to reject submission to unlock re-entry.", http: 409 },
  // 20 — Contractor Dashboard
  "HRIQ-2001": { severity: "info",     module: "Dashboard",  resolution: "Contractor can login with existing credentials.", http: 409 },
  "HRIQ-2002": { severity: "critical", module: "Dashboard",  resolution: "Check Supabase auth. Email may already be in use.", http: 500 },
  "HRIQ-2003": { severity: "critical", module: "Dashboard",  resolution: "Check Supabase auth logs for service issues.", http: 500 },
  // 21 — Sync
  "HRIQ-2101": { severity: "warning",  module: "Sync",       resolution: "Check API credentials and rate limits. Will auto-retry.", http: 500 },
  // 22 — RecruitCRM
  "HRIQ-2201": { severity: "error",    module: "RecruitCRM", resolution: "Check RECRUITCRM_API_KEY and rate limits.", http: 502 },
  "HRIQ-2202": { severity: "warning",  module: "RecruitCRM", resolution: "Set RECRUITCRM_API_KEY in Vercel env vars.", http: 500 },
  // 23 — Zoom
  "HRIQ-2301": { severity: "warning",  module: "Zoom",       resolution: "Check ZOOM_ACCOUNT_ID, CLIENT_ID, CLIENT_SECRET.", http: 502 },
  "HRIQ-2302": { severity: "warning",  module: "Zoom",       resolution: "Manually delete the meeting from Zoom if needed.", http: 502 },
  // 24 — Pending Hires
  "HRIQ-2401": { severity: "error",    module: "Pending Hires", resolution: "Record may have been approved or deleted.", http: 404 },
  // 25 — Self-Service
  "HRIQ-2501": { severity: "error",    module: "Self-Service", resolution: "Contact admin to link your account to your employee record.", http: 403 },
  "HRIQ-2502": { severity: "error",    module: "Self-Service", resolution: "Log in again or contact support.", http: 403 },
  "HRIQ-2503": { severity: "error",    module: "Self-Service", resolution: "Log in again or contact support.", http: 403 },
  "HRIQ-2504": { severity: "error",    module: "Self-Service", resolution: "Only client admins can update their own profile.", http: 403 },
  // 30 — Pay Runs
  "HRIQ-3001": { severity: "error",    module: "Pay Runs",   resolution: "Verify pay run ID and org scope.", http: 404 },
  "HRIQ-3002": { severity: "error",    module: "Pay Runs",   resolution: "Create a new pay run or revert to draft.", http: 409 },
  "HRIQ-3003": { severity: "error",    module: "Pay Runs",   resolution: "Pay run is already past draft stage.", http: 409 },
  "HRIQ-3004": { severity: "error",    module: "Pay Runs",   resolution: "Add payment items before submitting.", http: 400 },
  "HRIQ-3005": { severity: "error",    module: "Pay Runs",   resolution: "Contact the pay run creator or a super admin.", http: 403 },
  "HRIQ-3006": { severity: "error",    module: "Pay Runs",   resolution: "May have already been approved or is still in draft.", http: 409 },
  "HRIQ-3007": { severity: "error",    module: "Pay Runs",   resolution: "Get the pay run approved first.", http: 409 },
  "HRIQ-3008": { severity: "error",    module: "Pay Runs",   resolution: "Create adjusting entries instead of deleting.", http: 409 },
  // 50 — Bulk Actions
  "HRIQ-5001": { severity: "error",    module: "Bulk Actions", resolution: "Select at least one contractor from the list.", http: 400 },
  "HRIQ-5002": { severity: "error",    module: "Bulk Actions", resolution: "Select fewer than 200 contractors per batch.", http: 400 },
  "HRIQ-5003": { severity: "error",    module: "Bulk Actions", resolution: "Enter a subject for the email.", http: 400 },
  "HRIQ-5004": { severity: "error",    module: "Bulk Actions", resolution: "Enter a message body for the email.", http: 400 },
  // 99 — System
  "HRIQ-9901": { severity: "critical", module: "System",     resolution: "Retry. Check server logs for full stack trace.", http: 500 },
  "HRIQ-9902": { severity: "critical", module: "System",     resolution: "Check DB connection. Run prisma db push if schema is out of sync.", http: 500 },
  "HRIQ-9903": { severity: "error",    module: "System",     resolution: "Review input data. Check error detail for specifics.", http: 400 },
  "HRIQ-9904": { severity: "warning",  module: "System",     resolution: "Retry later. Check the service's status page.", http: 502 },
};

/** Get error metadata (severity, module, resolution, HTTP status). */
export function getErrorMeta(code: string): ErrorMeta | null {
  return META[code] ?? null;
}

/** Turn any caught value into a UI-friendly object. */
export function formatErrorForUI(err: unknown): {
  title: string;
  message: string;
  code: string | null;
  detail: string | null;
  severity: ErrorSeverity;
  module: string | null;
  resolution: string | null;
} {
  if (err instanceof HriqError) {
    const meta = META[err.code];
    return {
      title: meta ? `${meta.module} Error` : "Error",
      message: ERROR_CATALOG[err.code],
      code: err.code,
      detail: err.detail ?? null,
      severity: meta?.severity ?? "error",
      module: meta?.module ?? null,
      resolution: meta?.resolution ?? null,
    };
  }
  if (err instanceof Error) {
    const parsed = parseHriqCode(err.message);
    if (parsed) {
      const meta = META[parsed.code];
      return {
        title: meta ? `${meta.module} Error` : "Error",
        message: parsed.text,
        code: parsed.code,
        detail: null,
        severity: meta?.severity ?? "error",
        module: meta?.module ?? null,
        resolution: meta?.resolution ?? null,
      };
    }
    return { title: "Something went wrong", message: err.message, code: null, detail: null, severity: "error", module: null, resolution: null };
  }
  return { title: "Something went wrong", message: String(err), code: null, detail: null, severity: "error", module: null, resolution: null };
}
