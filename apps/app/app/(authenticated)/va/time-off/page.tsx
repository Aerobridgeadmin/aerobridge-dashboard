import { getMyTimeOffRequests, getTimeOffPolicies } from "@/app/actions/hriq/time-off";
import { requestTimeOff } from "@/app/actions/hriq/time-off";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { TimeOffRequestForm } from "./time-off-request-form";

export const metadata: Metadata = { title: "My Time Off" };

const VATimeOffPage = async () => {
  const [requests, policies] = await Promise.all([
    getMyTimeOffRequests(),
    getTimeOffPolicies(),
  ]);

  return (
    <>
      <Header page="Time Off" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <TimeOffRequestForm requests={requests} policies={policies} />
      </div>
    </>
  );
};

export default VATimeOffPage;
