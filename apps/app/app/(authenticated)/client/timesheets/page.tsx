import { getPendingTimesheets, getTimesheetPeriods } from "@/app/actions/hriq/timesheets";
import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { TimesheetApprovals } from "./timesheet-approvals";
import { TimesheetSync } from "./timesheet-sync";

export const metadata: Metadata = {
  title: "Timesheets",
  description: "Review and approve contractor timesheets",
};

const TimesheetsPage = async () => {
  const session = await requireOrg();
  const [pending, periods] = await Promise.all([
    getPendingTimesheets(),
    getTimesheetPeriods(),
  ]);

  // Get contractors with Google Sheet IDs for sync
  const contractorsWithSheets = await database.employee.findMany({
    where: { organizationId: session.orgId, employmentStatus: "active", googleSheetId: { not: null } },
    select: { id: true, legalFirstName: true, legalLastName: true, googleSheetId: true },
  });

  const isSuperAdmin = session.orgRole === "super_admin";

  return (
    <>
      <Header page="Timesheets" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {isSuperAdmin && <TimesheetSync contractorsWithSheets={contractorsWithSheets} />}
        <TimesheetApprovals pending={pending} periods={periods} />
      </div>
    </>
  );
};

export default TimesheetsPage;
