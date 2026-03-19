import { getTimeOffRequests, getTimeOffPolicies } from "@/app/actions/hriq/time-off";
import { requireOrg } from "@repo/auth/session";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { TimeOffManager } from "./time-off-manager";

export const metadata: Metadata = { title: "Time Off Management" };

const TimeOffPage = async () => {
  await requireOrg();
  const [requests, policies] = await Promise.all([
    getTimeOffRequests(),
    getTimeOffPolicies(),
  ]);

  return (
    <>
      <Header page="Time Off" pages={["Client Portal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <TimeOffManager requests={requests} policies={policies} />
      </div>
    </>
  );
};

export default TimeOffPage;
