import { requireRole } from "@repo/auth/session";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

type RLLayoutProps = {
  readonly children: ReactNode;
};

const RLLayout = async ({ children }: RLLayoutProps) => {
  try {
    await requireRole("super_admin");
  } catch {
    redirect("/");
  }

  return <>{children}</>;
};

export default RLLayout;
