import { getTimeOffRequests, getMyTimeOffRequests, getTimeOffPolicies } from "@/app/actions/hriq/time-off";
import { requireOrg, getSessionContext } from "@repo/auth/session";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { TimeOffManager } from "./time-off-manager";
import { TimeOffRequestForm } from "./time-off-request-form";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = { title: "Time Off" };

const TimeOffPage = async () => {
  const session = await requireOrg();
  const ctx = await getSessionContext();
  const isAdmin = ["super_admin", "admin", "manager"].includes(ctx?.orgRole ?? "");

  if (isAdmin) {
    const [requests, policies] = await Promise.all([getTimeOffRequests(), getTimeOffPolicies()]);
    // Serialize to strip Prisma Date/Decimal objects that break RSC serialization
    const safeRequests = serialize(requests);
    const safePolicies = serialize(policies);
    return (
      <>
        <Header page="Time Off" pages={[ctx?.orgRole === "super_admin" ? "RL Internal" : "Client Portal"]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0"><TimeOffManager requests={safeRequests} policies={safePolicies} /></div>
      </>
    );
  }

  const [requests, policies] = await Promise.all([getMyTimeOffRequests(), getTimeOffPolicies()]);
  const safeRequests = serialize(requests);
  const safePolicies = serialize(policies);
  return (
    <>
      <Header page="Time Off" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0"><TimeOffRequestForm requests={safeRequests} policies={safePolicies} /></div>
    </>
  );
};

export default TimeOffPage;
