import { requireRole } from "@repo/auth/session";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

type ClientLayoutProps = {
  readonly children: ReactNode;
};

const ClientLayout = async ({ children }: ClientLayoutProps) => {
  try {
    await requireRole("super_admin", "admin", "manager", "bookkeeper");
  } catch {
    redirect("/");
  }

  return <>{children}</>;
};

export default ClientLayout;
