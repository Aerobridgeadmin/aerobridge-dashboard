"use client";

import { createEmployee } from "@/app/actions/hriq/employees";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contractor", "freelancer", "intern"];

export function NewEmployeeForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const employee = await createEmployee({
          legalFirstName: fd.get("legalFirstName") as string,
          legalLastName: fd.get("legalLastName") as string,
          employmentType: fd.get("employmentType") as string,
          personalEmail: fd.get("personalEmail") as string,
          workEmail: fd.get("workEmail") as string,
          phoneNumber: fd.get("phoneNumber") as string,
          department: fd.get("department") as string,
          jobTitle: fd.get("jobTitle") as string,
          location: fd.get("location") as string,
          timezone: fd.get("timezone") as string,
          hourlyRate: fd.get("hourlyRate") as string,
          currency: (fd.get("currency") as string) || "USD",
          startDate: fd.get("startDate") as string,
        });
        router.push(`/client/employees/${employee.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create employee");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Personal Information</h2>
        {error && <div className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">First Name *</label>
            <input name="legalFirstName" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Last Name *</label>
            <input name="legalLastName" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
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
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Employment Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Employment Type *</label>
            <select name="employmentType" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Department</label>
            <input name="department" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Job Title</label>
            <input name="jobTitle" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Start Date</label>
            <input name="startDate" type="date" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Location</label>
            <input name="location" placeholder="e.g. Manila, Philippines" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Timezone</label>
            <input name="timezone" placeholder="e.g. Asia/Manila" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Compensation</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Hourly Rate</label>
            <input name="hourlyRate" type="number" step="0.01" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Currency</label>
            <select name="currency" defaultValue="USD" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="PHP">PHP</option>
              <option value="INR">INR</option>
              <option value="AUD">AUD</option>
              <option value="CAD">CAD</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="h-10 rounded-md border px-6 text-sm font-medium hover:bg-accent">
          Cancel
        </button>
        <button type="submit" disabled={isPending} className="h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {isPending ? "Creating..." : "Create Employee"}
        </button>
      </div>
    </form>
  );
}
