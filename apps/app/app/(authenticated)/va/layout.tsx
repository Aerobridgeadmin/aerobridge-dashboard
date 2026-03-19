import { requireSession } from "@repo/auth/session";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

type VALayoutProps = {
  readonly children: ReactNode;
};

const VALayout = async ({ children }: VALayoutProps) => {
  try {
    // VAs and any authenticated user can access this portal
    // The VA portal is the "self-service" area for contractors/employees
    await requireSession();
  } catch {
    redirect("/sign-in");
  }

  return <>{children}</>;
};

export default VALayout;
