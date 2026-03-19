import { getSessionContext } from "@repo/auth/session";
import { SidebarProvider } from "@repo/design-system/components/ui/sidebar";
import { showBetaFeature } from "@repo/feature-flags";
import { secure } from "@repo/security";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { env } from "@/env";
import { NotificationsProvider } from "./components/notifications-provider";
import { ErrorDialogProvider } from "./components/error-dialog";
import { ToastProvider } from "./components/toast-provider";
import { BackgroundSync } from "./components/background-sync";
import { GlobalSidebar } from "./components/sidebar";
import { IdleTimeoutProvider } from "./components/idle-timeout-provider";
import { ForcePasswordChange } from "./components/force-password-change";
import { AppsProvider } from "./components/apps/apps-context";
import { AppsShell } from "./components/apps/apps-shell";

import { AiAssistant } from "./components/ai-assistant";

type AppLayoutProperties = {
  readonly children?: ReactNode;
};

const AppLayout = async ({ children }: AppLayoutProperties) => {
  if (env.ARCJET_KEY) {
    await secure(["CATEGORY:PREVIEW"]);
  }

  // CRITICAL: Only call getSessionContext() once. It internally calls getUser()
  // which makes a network roundtrip to Supabase. Previously we also called
  // currentUser() in parallel, causing TWO simultaneous getUser() calls.
  // When the JWT expires, both race to refresh the token. Supabase's refresh
  // token rotation means the second call fails with "refresh_token_not_found",
  // causing intermittent auth failures and redirects to sign-in.
  const [session, betaFeature] = await Promise.all([
    getSessionContext(),
    showBetaFeature(),
  ]);

  if (!session) {
    redirect("/sign-in");
  }

  // Build a user-like object from session for backwards compatibility
  const user = { id: session.userId, email: session.email };
  const role = session.orgRole;

  // Fetch org info + KYC status in a single query (avoids extra DB round-trip per page load)
  const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";
  const isClientAdmin = role === "admin" && session.orgId !== RL_ORG_ID;

  const orgInfo = session.orgId
    ? await (async () => {
        const { database } = await import("@repo/database");
        const data = await database.organization.findUnique({
          where: { id: session.orgId! },
          select: {
            name: true,
            logoUrl: true,
            stripeConnectAccountId: true,
            stripeConnectStatus: true,
            profile: role === "admin" ? { select: { kycStatus: true, paymentMethod: true } } : false,
          },
        });
        if (!data) return null;
        return {
          name: data.name,
          logoUrl: data.logoUrl,
          profile: data.profile,
          stripeConnect: isClientAdmin
            ? { accountId: data.stripeConnectAccountId, status: data.stripeConnectStatus }
            : null,
        };
      })()
    : null;

  // ─── KYC Gate: Client admins must verify identity before accessing dashboard ───
  // Gate fires if: (a) no profile exists yet (profile creation may have failed silently)
  // OR (b) profile exists but kycStatus is not approved yet.
  if (isClientAdmin && (!orgInfo?.profile || orgInfo.profile.kycStatus !== "approved")) {
    redirect("/kyc-gate");
  }

  // ─── Stripe Connect Gate: REMOVED ───────────────────────────────────────────
  // With direct charges, PPP payments go directly to contractor Express accounts.
  // COR payments go through RL's platform account. Neither model requires the
  // CLIENT org to have a Stripe Connect account. Gate was causing redirect loops
  // for COR orgs (layout → stripe-gate → dashboard → layout → loop).

  // ─── Contractor Payment Gate: members/VAs must complete payment setup at first login ───
  const isContractor = role === "member";
  if (isContractor && user.id) {
    const { database: db } = await import("@repo/database");
    let linkedEmployee = await db.employee.findFirst({
      where: { linkedUserId: user.id },
      select: {
        id: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
        wiseGateRequired: true,
        cadanaGateRequired: true,
        organizationId: true,
        employmentStatus: true,
        bankAccountNumber: true,
      },
    });
    // Fallback: find by email if not yet linked (covers first-login race condition)
    if (!linkedEmployee && user.email && session.orgId) {
      linkedEmployee = await db.employee.findFirst({
        where: {
          organizationId: session.orgId,
          OR: [
            { workEmail: { equals: user.email, mode: "insensitive" } },
            { personalEmail: { equals: user.email, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          stripeAccountId: true,
          stripeAccountStatus: true,
          wiseGateRequired: true,
          cadanaGateRequired: true,
          organizationId: true,
          employmentStatus: true,
          bankAccountNumber: true,
        },
      });
    }
    if (linkedEmployee && (linkedEmployee.employmentStatus === "onboarding_in_progress" || linkedEmployee.employmentStatus === "active")) {
      // Auto-clear Wise gate if contractor already has a Wise tag (@username)
      const hasWiseTag = linkedEmployee.bankAccountNumber?.trim().startsWith("@");
      if (linkedEmployee.wiseGateRequired && hasWiseTag) {
        db.employee.update({
          where: { id: linkedEmployee.id },
          data: { wiseGateRequired: false },
        }).catch(() => {}); // fire-and-forget
        linkedEmployee.wiseGateRequired = false;
      }
      const isRLEmployee = linkedEmployee.organizationId === RL_ORG_ID;
      const empOrgProfile = linkedEmployee.organizationId
        ? await db.organizationProfile.findUnique({
            where: { organizationId: linkedEmployee.organizationId },
            select: { paymentMethod: true },
          })
        : null;
      const empPaymentMethod = empOrgProfile?.paymentMethod ?? "ppp";

      const contractorNeedsStripe = !isRLEmployee && (empPaymentMethod === "ppp" || empPaymentMethod === "both") &&
        !["verified", "restricted"].includes(linkedEmployee.stripeAccountStatus ?? "");
      // Wise/Cadana gates: admin explicitly flagged this contractor for payment setup on login
      const contractorNeedsWise = linkedEmployee.wiseGateRequired === true;
      const contractorNeedsCadana = linkedEmployee.cadanaGateRequired === true;

      if (contractorNeedsStripe || contractorNeedsWise || contractorNeedsCadana) {
        redirect("/contractor-payment-gate");
      }
    }
  }

  // Fire-and-forget: auto-link user to employee record if not already linked
  if (session.orgId && user.email) {
    (async () => {
      try {
        const { database } = await import("@repo/database");
        const alreadyLinked = await database.employee.findFirst({
          where: { linkedUserId: user.id },
          select: { id: true },
        });
        if (!alreadyLinked) {
          const employee = await database.employee.findFirst({
            where: {
              organizationId: session.orgId,
              linkedUserId: null,
              OR: [
                { workEmail: { equals: user.email, mode: "insensitive" } },
                { personalEmail: { equals: user.email, mode: "insensitive" } },
              ],
            },
            select: { id: true, workEmail: true },
          });
          if (employee) {
            await database.employee.update({
              where: { id: employee.id },
              data: {
                linkedUserId: user.id,
                ...(!employee.workEmail ? { workEmail: user.email } : {}),
              },
            });
            // linked successfully
          }
        }
      } catch (err) {
        // Non-critical — don't break the layout
        console.error("[Layout] Auto-link employee failed:", err);
      }
    })();
  }

  // Read sidebar cookie on server to prevent hydration mismatch
  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const sidebarOpen = sidebarState === "false" ? false : true;

  return (
    <NotificationsProvider userId={user.id}>
      <ToastProvider>
        <ErrorDialogProvider>
          <SidebarProvider defaultOpen={sidebarOpen}>
            <AppsProvider>
            <ForcePasswordChange />
            <GlobalSidebar orgName={orgInfo?.name} orgLogoUrl={orgInfo?.logoUrl}>
              {betaFeature && (
                <div className="m-4 rounded-full bg-blue-500 p-1.5 text-center text-sm text-white">
                  Beta feature now available
                </div>
              )}
              {children}
              <BackgroundSync role={role} />
              <IdleTimeoutProvider />
            </GlobalSidebar>
            <AppsShell />
            {(role === "super_admin" || (session.orgId === RL_ORG_ID && ["admin", "manager"].includes(role ?? ""))) && <AiAssistant />}
            </AppsProvider>
          </SidebarProvider>
        </ErrorDialogProvider>
      </ToastProvider>
    </NotificationsProvider>
  );
};

export default AppLayout;
