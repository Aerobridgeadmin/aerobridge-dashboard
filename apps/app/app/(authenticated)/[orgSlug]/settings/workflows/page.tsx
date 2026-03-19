import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../../components/header";

export const metadata: Metadata = { title: "Workflow Settings" };

const WorkflowsPage = async () => {
  const session = await requireOrg();

  const workflows = await database.workflowTemplate.findMany({
    where: { organizationId: session.orgId },
    include: { _count: { select: { taskTemplates: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <Header page="Workflows" pages={[session.orgRole === "super_admin" ? "RL Internal" : "Client Portal", "Settings"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-3xl space-y-4">
          <h2 className="text-lg font-semibold">Workflow Templates ({workflows.length})</h2>
          {workflows.map((wf: any) => (
            <div key={wf.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{wf.name}</h3>
                  <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{wf.workflowType}</span>
                    {wf.employmentType && <span>&middot; {wf.employmentType}</span>}
                    {wf.department && <span>&middot; {wf.department}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">{wf._count.taskTemplates} tasks</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${wf.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                    {wf.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {workflows.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No workflow templates yet.</div>
          )}
        </div>
      </div>
    </>
  );
};

export default WorkflowsPage;
