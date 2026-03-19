import { requireRole } from "@repo/auth/session";
import { getExternalTimeOff, getExternalTimeOffStats } from "@/app/actions/hriq/external-operations";
import { getClientOrganizations } from "@/app/actions/hriq/external-finance";
import type { Metadata } from "next";
import { Header } from "../../../components/header";
import { ExternalTimeOffDashboard } from "./external-time-off-dashboard";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = { title: "External Time Off" };

const ExternalTimeOffPage = async () => {
  await requireRole("super_admin");

  const [requests, stats, organizations] = await Promise.all([
    getExternalTimeOff(),
    getExternalTimeOffStats(),
    getClientOrganizations(),
  ]);

  return (
    <>
      <Header page="External Time Off" pages={["Client Orgs"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ExternalTimeOffDashboard requests={serialize(requests)} organizations={organizations} stats={stats} />
      </div>
    </>
  );
};

export default ExternalTimeOffPage;
