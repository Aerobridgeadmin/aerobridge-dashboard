import { getAnnouncements } from "@/app/actions/hriq/onboarding";
import type { Metadata } from "next";
import { Header } from "../../components/header";

export const metadata: Metadata = { title: "Announcements" };

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950",
  high: "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950",
  normal: "border-border bg-card",
  low: "border-border bg-card",
};

const VAAnnouncementsPage = async () => {
  const announcements = await getAnnouncements();

  return (
    <>
      <Header page="Announcements" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="space-y-4">
          {announcements.map((a) => (
            <div key={a.id} className={`rounded-xl border p-6 ${PRIORITY_COLORS[a.priority] ?? PRIORITY_COLORS.normal}`}>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{a.title}</h3>
                {a.priority !== "normal" && <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{a.priority}</span>}
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap">{a.content}</p>
              <p className="mt-3 text-xs text-muted-foreground">{new Date(a.publishedAt).toLocaleDateString()}</p>
            </div>
          ))}
          {announcements.length === 0 && <div className="py-12 text-center text-muted-foreground">No announcements.</div>}
        </div>
      </div>
    </>
  );
};

export default VAAnnouncementsPage;
