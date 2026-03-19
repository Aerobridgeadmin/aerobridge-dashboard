import {
  AbilityBuilder,
  type MongoAbility,
  createMongoAbility,
} from "@casl/ability";

// All entity types that can be acted upon
export type AppSubjects =
  | "Employee"
  | "Task"
  | "Document"
  | "Payment"
  | "AccessProvisioning"
  | "ManagerNote"
  | "Announcement"
  | "AuditLog"
  | "BatchSession"
  | "OnboardingSession"
  | "OnboardingStep"
  | "WorkflowTemplate"
  | "TaskTemplate"
  | "JotformTemplate"
  | "Organization"
  | "OrganizationMember"
  | "OrganizationInvitation"
  | "ApprovedEmail"
  | "Dashboard"
  | "Settings"
  | "all";

// All possible actions
export type AppActions =
  | "manage" // wildcard: all actions
  | "create"
  | "read"
  | "update"
  | "delete"
  | "approve"
  | "assign"
  | "export";

export type AppAbility = MongoAbility<[AppActions, AppSubjects]>;

// The platform roles
export type AppRole =
  | "super_admin" // RL staff: full access to everything across all orgs
  | "admin" // Org admin: full access within their organization
  | "manager" // Team manager: manages their team's contractors
  | "member"; // Default: self-service access

export function defineAbilitiesFor(role: AppRole): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(
    createMongoAbility
  );

  switch (role) {
    // 
    // Super Admin (RL Staff): God mode
    // 
    case "super_admin":
      can("manage", "all");
      break;

    // 
    // Admin (Client Admin): Full org access
    // 
    case "admin":
      // Employees: full CRUD
      can("manage", "Employee");
      can("manage", "Task");
      can("manage", "Document");
      can("manage", "Payment");
      can("manage", "AccessProvisioning");
      can("manage", "ManagerNote");

      // Onboarding: full CRUD
      can("manage", "BatchSession");
      can("manage", "OnboardingSession");
      can("manage", "OnboardingStep");

      // Templates: full CRUD
      can("manage", "WorkflowTemplate");
      can("manage", "TaskTemplate");
      can("manage", "JotformTemplate");

      // Announcements
      can("manage", "Announcement");

      // Org management
      can("read", "Organization");
      can("update", "Organization");
      can("manage", "OrganizationMember");
      can("manage", "OrganizationInvitation");
      can("manage", "ApprovedEmail");

      // Dashboard & Settings
      can("read", "Dashboard");
      can("manage", "Settings");

      // Audit: read-only
      can("read", "AuditLog");

      // Cannot delete the org itself
      cannot("delete", "Organization");
      break;




    // 
    // Manager: Manage their team
    // 
    case "manager":
      // Employees: read all, update their reports
      can("read", "Employee");
      can("update", "Employee");
      can("create", "Employee");

      // Tasks: manage tasks for their reports
      can("manage", "Task");

      // Documents: read, upload for their reports
      can("read", "Document");
      can("create", "Document");
      can("update", "Document");

      // Payments: read-only
      can("read", "Payment");

      // Access: read, request
      can("read", "AccessProvisioning");
      can("create", "AccessProvisioning");
      can("update", "AccessProvisioning");

      // Notes: full CRUD for their notes
      can("manage", "ManagerNote");

      // Onboarding: manage for their reports
      can("read", "BatchSession");
      can("read", "OnboardingSession");
      can("update", "OnboardingSession");
      can("read", "OnboardingStep");
      can("update", "OnboardingStep");

      // Announcements: read
      can("read", "Announcement");

      // Dashboard
      can("read", "Dashboard");

      // Audit: read
      can("read", "AuditLog");

      // Cannot manage org or templates
      cannot("manage", "Organization");
      cannot("manage", "OrganizationMember");
      cannot("manage", "WorkflowTemplate");
      cannot("manage", "Settings");
      break;


    // 
    // Member: Same self-service access as VA
    // 
    case "member":
      can("read", "Employee");
      can("update", "Employee");
      can("read", "Task");
      can("update", "Task");
      can("read", "Document");
      can("create", "Document");
      can("read", "Payment");
      can("read", "OnboardingSession");
      can("read", "OnboardingStep");
      can("update", "OnboardingStep");
      can("read", "Announcement");
      can("read", "Dashboard");
      cannot("manage", "Organization");
      cannot("manage", "OrganizationMember");
      cannot("manage", "AccessProvisioning");
      cannot("manage", "BatchSession");
      cannot("manage", "ManagerNote");
      cannot("manage", "WorkflowTemplate");
      cannot("manage", "Settings");
      cannot("delete", "Employee");
      cannot("delete", "Document");
      break;

    default:
      can("read", "Announcement");
      can("read", "Dashboard");
      break;
  }

  return build();
}
