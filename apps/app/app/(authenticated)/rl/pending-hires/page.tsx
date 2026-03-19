import { getPendingHires } from "@/app/actions/hriq/pending-hires";
import { requireRole } from "@repo/auth/session";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { PendingHiresList } from "./pending-hires-list";

export const metadata: Metadata = { title: "Pending Hires — RecruitCRM" };

const PendingHiresPage = async () => {
  await requireRole("super_admin");
  const hires = await getPendingHires();

  return (
    <>
      <Header page="Pending Hires" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <PendingHiresList hires={hires} />
      </div>
    </>
  );
};

export default PendingHiresPage;
