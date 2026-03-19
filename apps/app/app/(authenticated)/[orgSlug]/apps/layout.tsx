import { getSessionContext } from "@repo/auth/session";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Layout guard for all /apps routes.
 * All authenticated users can access apps (games, tools, etc.).
 */
export default async function AppsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");

  return <>{children}</>;
}
