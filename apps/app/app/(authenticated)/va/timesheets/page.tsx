import { getMyTimesheets, getTimesheetPeriods } from "@/app/actions/hriq/timesheets";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { TimesheetForm } from "./timesheet-form";

export const metadata: Metadata = {
  title: "My Timesheets",
  description: "Submit and view your timesheets",
};

const VATimesheetsPage = async () => {
  const [timesheets, periods] = await Promise.all([
    getMyTimesheets(),
    getTimesheetPeriods(),
  ]);

  const openPeriods = periods.filter((p) => p.status === "open");

  return (
    <>
      <Header page="My Timesheets" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <TimesheetForm timesheets={timesheets} openPeriods={openPeriods} />
      </div>
    </>
  );
};

export default VATimesheetsPage;
