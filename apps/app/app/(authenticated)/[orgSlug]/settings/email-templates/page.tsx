import { requireOrg, getSessionContext } from "@repo/auth/session";
import type { Metadata } from "next";
import { Header } from "../../../components/header";
import { EmailTemplateEditor } from "./editor";

export const metadata: Metadata = { title: "Email Templates" };

export default async function EmailTemplatesPage() {
  await requireOrg();
  const ctx = await getSessionContext();
  if (ctx?.orgRole !== "super_admin") {
    return <div className="p-8 text-center text-muted-foreground">Access restricted to super admins.</div>;
  }

  return (
    <>
      <Header page="Email Templates" pages={["Settings"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <EmailTemplateEditor />
      </div>
    </>
  );
}
