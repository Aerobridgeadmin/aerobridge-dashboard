import { getAnnouncements } from "@/app/actions/hriq/onboarding";
import { requireOrg } from "@repo/auth/session";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { AnnouncementActions } from "./announcement-actions";

export const metadata: Metadata = { title: "Announcements" };

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950",
  high: "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950",
  normal: "border-border bg-card",
  low: "border-border bg-card",
};

const AnnouncementsPage = async () => {
  await requireOrg();
  const announcements = await getAnnouncements();

  return (
    <>
      <Header page="Announcements" pages={["Client Portal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Announcements ({announcements.length})</h2>
          <AnnouncementActions />
        </div>
        <div className="space-y-4">
          {announcements.map((a) => (
            <div key={a.id} className={`rounded-xl border p-6 ${PRIORITY_COLORS[a.priority] ?? PRIORITY_COLORS.normal}`}>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{a.title}</h3>
                {a.priority !== "normal" && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{a.priority}</span>
                )}
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap">{a.content}</p>
              <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
                {a.authorName && <span>By {a.authorName}</span>}
                <span>{new Date(a.publishedAt).toLocaleDateString()}</span>
                {a.targetDepartment && <span>Dept: {a.targetDepartment}</span>}
              </div>
            </div>
          ))}
          {announcements.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No announcements. Create one to get started.</div>
          )}
        </div>
      </div>
    </>
  );
};

export default AnnouncementsPage;
