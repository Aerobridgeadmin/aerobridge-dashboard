import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../../components/header";

export const metadata: Metadata = { title: "Security Settings" };

const SecurityPage = async () => {
  await requireRole("super_admin");

  const recentAudit = await database.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take: 25,
  });

  return (
    <>
      <Header page="Security" pages={["RL Admin", "Settings"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-4xl space-y-6">
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Security Configuration</h2>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rate Limiting (Arcjet)</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${process.env.ARCJET_KEY ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                  {process.env.ARCJET_KEY ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Error Tracking (Sentry)</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${process.env.SENTRY_DSN ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                  {process.env.SENTRY_DSN ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Recent Audit Log</h2>
            <div className="mt-3 space-y-2">
              {recentAudit.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{entry.action}</span>
                    <span className="text-muted-foreground">{entry.objectType}:{entry.objectId.slice(0, 8)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SecurityPage;
