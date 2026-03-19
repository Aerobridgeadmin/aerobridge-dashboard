import { getContacts } from "@/app/actions/hriq/contacts";
import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "../../components/header";
import { ContactsPanel } from "./contacts-panel";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (session.orgRole !== "super_admin") redirect("/");

  const [contacts, organizations] = await Promise.all([
    getContacts(),
    database.organization.findMany({
      take: 200,
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <Header page="Contacts" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ContactsPanel
          contacts={serialize(contacts)}
          organizations={organizations}
        />
      </div>
    </>
  );
}
