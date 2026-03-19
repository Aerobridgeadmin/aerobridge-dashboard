import { getSessionContext } from "@repo/auth/session";
import { redirect } from "next/navigation";
import { AppsLanding } from "./apps-landing";

export default async function AppsPage() {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");

  return <AppsLanding />;
}
