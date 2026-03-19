"use client";

import { createContext, useContext, type ReactNode } from "react";

type OrgContextValue = {
  orgSlug: string;
  /** Build org-scoped path: p("employees")  "/acme/employees", p()  "/acme" */
  p: (path?: string) => string;
};

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ slug, children }: { slug: string; children?: ReactNode }) {
  const p = (path?: string) => (path ? `/${slug}/${path}` : `/${slug}`);
  return <OrgContext.Provider value={{ orgSlug: slug, p }}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}
