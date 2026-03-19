"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/design-system/components/ui/breadcrumb";
import { Separator } from "@repo/design-system/components/ui/separator";
import { SidebarTrigger } from "@repo/design-system/components/ui/sidebar";
import { useParams } from "next/navigation";
import { Fragment, type ReactNode } from "react";

// Breadcrumb paths relative to org root (no prefix)
const BREADCRUMB_PATHS: Record<string, string> = {
  "RL Internal": "",
  "RL Admin": "settings",
  "Dashboard": "",
  "Client Portal": "",
  "Self Service": "",
  "Remote Leverage": "",
  "Organizations": "organizations",
  "Client Organizations": "organizations",
  "Contractors": "employees",
  "Employees": "employees",
  "Settings": "settings",
  "Hiring Pipeline": "hiring",
  "Pending Hires": "pending-hires",
  "Tasks": "tasks",
  "Payments": "payments",
  "Documents": "documents",
  "Contracts": "contracts",
  "Reports": "reports",
  "Time Off": "time-off",
  "Timesheets": "timesheets",
  "Payroll": "payroll",
  "Pay Runs": "pay-runs",
  "Onboarding": "onboarding",
  "Expenses": "expenses",
};

type HeaderProps = {
  pages: string[];
  page: string;
  children?: ReactNode;
  noBreadcrumb?: boolean;
};

export const Header = ({ pages, page, children, noBreadcrumb }: HeaderProps) => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const base = orgSlug ? `/${orgSlug}` : "";

  const getBreadcrumbUrl = (label: string) => {
    const path = BREADCRUMB_PATHS[label] ?? "";
    return path ? `${base}/${path}` : base || "/";
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        {!noBreadcrumb && (
          <>
            <Separator className="mr-2 h-4" orientation="vertical" />
            <Breadcrumb>
              <BreadcrumbList>
                {pages.map((p, index) => (
                  <Fragment key={p}>
                    {index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink href={getBreadcrumbUrl(p)}>{p}</BreadcrumbLink>
                    </BreadcrumbItem>
                  </Fragment>
                ))}
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{page}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </>
        )}
      </div>
      {children}
    </header>
  );
};
