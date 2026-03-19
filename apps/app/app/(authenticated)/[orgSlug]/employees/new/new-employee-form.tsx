"use client";

import { createEmployee } from "@/app/actions/hriq/employees";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { CustomSelectWithOther } from "@/app/(authenticated)/components/custom-select-with-other";
import { DatePicker } from "@/app/(authenticated)/components/date-picker";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { useRouter, useParams } from "next/navigation";
import { useState, useTransition } from "react";

import { JOB_TITLE_OPTIONS, DEPARTMENT_OPTIONS } from "@/lib/hriq/role-department-options";
import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";
import { TIMEZONE_OPTIONS } from "@/lib/hriq/timezone-options";
import { CURRENCY_OPTIONS } from "@/lib/hriq/currency-options";
import { SearchableSelect } from "@/app/(authenticated)/components/searchable-select";

const EMPLOYMENT_TYPES = ["full_time", "part_time"];

export function NewEmployeeForm() {
  const router = useRouter();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [isPending, startTransition] = useTransition();
  const { showError } = useErrorDialog();
  const [compType, setCompType] = useState<"hourly" | "monthly">("hourly");
  const [payMethod, setPayMethod] = useState<"" | "cadana" | "wise">("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const employee = await createEmployee({
          legalFirstName: fd.get("legalFirstName") as string,
          legalLastName: fd.get("legalLastName") as string,
          secondLastName: fd.get("secondLastName") as string,
          preferredName: fd.get("preferredName") as string,
          employmentType: fd.get("employmentType") as string,
          personalEmail: fd.get("personalEmail") as string,
          workEmail: fd.get("workEmail") as string,
          phoneNumber: fd.get("phoneNumber") as string,
          mobileNumber: fd.get("mobileNumber") as string,
          department: fd.get("department") as string,
          jobTitle: fd.get("jobTitle") as string,
          timezone: fd.get("timezone") as string,
          compensationType: compType,
          hourlyRate: compType === "hourly" ? (fd.get("hourlyRate") as string) : undefined,
          monthlySalary: compType === "monthly" ? (fd.get("monthlySalary") as string) : undefined,
          currency: (fd.get("currency") as string) || "USD",
          preferredPaymentMethod: payMethod || undefined,
          startDate: fd.get("startDate") as string,
          dateOfBirth: fd.get("dateOfBirth") as string,
          country: fd.get("country") as string,
          dailyHoursTarget: fd.get("dailyHoursTarget") as string,
        });
        // Server action returns { _error } on failure instead of throwing (Next.js strips thrown messages in production)
        if (employee && typeof employee === "object" && "_error" in employee) {
          showError({ title: "Failed to create contractor", message: (employee as any).error });
          return;
        }
        router.push(`/${orgSlug}/employees/${employee.id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
        const isMasked = msg.includes("Server Components render") || msg.includes("specific message is omitted");
        showError({
          title: "Failed to create contractor",
          message: isMasked
            ? "Server error creating the contractor. Check Vercel logs for details."
            : msg,
          detail: isMasked && err instanceof Error
            ? `Next.js masked the real error in production.\nDigest: ${(err as any).digest ?? "N/A"}\n\nCheck Vercel Runtime Logs for the actual error.`
            : err instanceof Error ? err.stack : undefined,
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Personal Information</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">First Name *</label>
            <input name="legalFirstName" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Last Name (first surname) *</label>
            <input name="legalLastName" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Second Last Name <span className="font-normal text-muted-foreground">(maternal, optional)</span></label>
            <input name="secondLastName" placeholder="e.g. Aguirre" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Preferred Name</label>
            <input name="preferredName" placeholder="Display name (optional)" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Date of Birth</label>
            <DatePicker name="dateOfBirth" className="mt-1" minYear={1940} maxYear={new Date().getFullYear() - 16} />
          </div>
          <div>
            <label className="text-sm font-medium">Personal Email</label>
            <input name="personalEmail" type="email" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Work Email</label>
            <input name="workEmail" type="email" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Phone Number</label>
            <input name="phoneNumber" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Mobile Number</label>
            <input name="mobileNumber" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Country</label>
            <SearchableSelect name="country" placeholder="Select country..." triggerClassName="mt-1 h-10 w-full" options={[...COUNTRY_OPTIONS]} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Employment Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Employment Type *</label>
            <CustomSelect
              name="employmentType"
              defaultValue="full_time"
              triggerClassName="mt-1 h-10 w-full"
              options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Department</label>
            <CustomSelectWithOther
              name="department"
              placeholder="Select department..."
              triggerClassName="mt-1 h-10 w-full"
              baseOptions={[...DEPARTMENT_OPTIONS]}
              category="department"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Job Title</label>
            <CustomSelectWithOther
              name="jobTitle"
              placeholder="Select role..."
              triggerClassName="mt-1 h-10 w-full"
              baseOptions={[...JOB_TITLE_OPTIONS]}
              category="job_title"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Start Date</label>
            <DatePicker name="startDate" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Timezone</label>
            <SearchableSelect name="timezone" placeholder="Select timezone..." triggerClassName="mt-1 h-10 w-full" options={[...TIMEZONE_OPTIONS]} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Compensation</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Compensation Type</label>
            <div className="mt-1 flex h-10 rounded-md border border-input overflow-hidden">
              <button
                type="button"
                onClick={() => setCompType("hourly")}
                className={`flex-1 text-sm font-medium transition-colors ${compType === "hourly" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
              >
                Hourly
              </button>
              <button
                type="button"
                onClick={() => setCompType("monthly")}
                className={`flex-1 text-sm font-medium transition-colors ${compType === "monthly" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
              >
                Monthly Salary
              </button>
            </div>
          </div>
          {compType === "hourly" ? (
            <div>
              <label className="text-sm font-medium">Hourly Rate</label>
              <input name="hourlyRate" type="number" step="0.01" placeholder="e.g. 25.00" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium">Monthly Salary</label>
              <input name="monthlySalary" type="number" step="0.01" placeholder="e.g. 3000.00" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Currency</label>
            <CustomSelect
              name="currency"
              defaultValue="USD"
              triggerClassName="mt-1 h-10 w-full"
              options={[...CURRENCY_OPTIONS]}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Payment Method</label>
            <div className="mt-1 flex h-10 rounded-md border border-input overflow-hidden">
              <button
                type="button"
                onClick={() => setPayMethod(payMethod === "cadana" ? "" : "cadana")}
                className={`flex-1 text-sm font-medium transition-colors ${payMethod === "cadana" ? "bg-orange-500 text-white" : "bg-background hover:bg-accent"}`}
              >
                Cadana
              </button>
              <button
                type="button"
                onClick={() => setPayMethod(payMethod === "wise" ? "" : "wise")}
                className={`flex-1 text-sm font-medium transition-colors ${payMethod === "wise" ? "bg-green-600 text-white" : "bg-background hover:bg-accent"}`}
              >
                Wise
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {payMethod === "cadana"
                ? "Cadana account will be created and contractor will receive a setup email"
                : payMethod === "wise"
                  ? "Contractor will fill bank details in their info form — no payment gate"
                  : "Select how this contractor will be paid"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="h-10 rounded-md border px-6 text-sm font-medium hover:bg-accent">
          Cancel
        </button>
        <button type="submit" disabled={isPending} className="h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {isPending ? "Creating..." : "Create Contractor"}
        </button>
      </div>
    </form>
  );
}
