/**
 * Shared Job Title (Role) and Department dropdown options.
 * Safe for client-side imports — no server dependencies.
 *
 * Departments are generic business departments. RL-specific departments
 * (Recruitment, Hiring Management, ISA - Lofty, RevOps, Tech Operations)
 * are stored in custom_dropdown_options and merged at render time.
 */

export const JOB_TITLE_OPTIONS = [
  { value: "Sales Representative", label: "Sales Representative" },
  { value: "Hiring Manager", label: "Hiring Manager" },
  { value: "Recruiter", label: "Recruiter" },
  { value: "Talent Sourcer", label: "Talent Sourcer" },
  { value: "Marketing Assistant", label: "Marketing Assistant" },
  { value: "Business Development Representative", label: "Business Development Representative" },
  { value: "Sales Development Representative", label: "Sales Development Representative" },
  { value: "Account Executive", label: "Account Executive" },
  { value: "Accountant", label: "Accountant" },
  { value: "Tech Operations Specialist", label: "Tech Operations Specialist" },
] as const;

export const DEPARTMENT_OPTIONS = [
  { value: "Sales", label: "Sales" },
  { value: "Marketing", label: "Marketing" },
  { value: "Operations", label: "Operations" },
  { value: "Finance & Accounting", label: "Finance & Accounting" },
  { value: "Human Resources", label: "Human Resources" },
  { value: "Customer Support", label: "Customer Support" },
  { value: "Customer Success", label: "Customer Success" },
  { value: "Engineering", label: "Engineering" },
  { value: "Product", label: "Product" },
  { value: "Legal", label: "Legal" },
  { value: "Administration", label: "Administration" },
  { value: "Executive", label: "Executive" },
  { value: "IT", label: "IT" },
  { value: "Design", label: "Design" },
  { value: "Logistics", label: "Logistics" },
] as const;
