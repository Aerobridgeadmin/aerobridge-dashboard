"use client";

import Image from "next/image";
import { createClient } from "@repo/auth/client";
import type { AppRole } from "@repo/auth/abilities";
import { ModeToggle } from "@repo/design-system/components/mode-toggle";
// Button import kept for future use
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/design-system/components/ui/sidebar";
// NotificationsTrigger removed — using custom NotificationBell instead
import {
  BadgeDollarSignIcon,
  BarChart3Icon,
  BellIcon,
  BuildingIcon,
  CalendarIcon,
  ClockIcon,
  CreditCardIcon,
  FileTextIcon,
  HeadphonesIcon,
  HomeIcon,
  LayoutGridIcon,
  LogOutIcon,
  NetworkIcon,
  PackageIcon,
  ReceiptIcon,
  Settings2Icon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Search } from "./search";
import { OrgSwitcher } from "./org-switcher";
import { useApps } from "./apps/apps-context";



const RL_COLORS = ["#7C3AED", "#F97316", "#00B0BB", "#EC4899"];
function ColoredHomeLabel() {
  return (
    <span className="font-semibold tracking-wide">
      {"Home".split("").map((ch, i) => (
        <span key={i} style={{ color: RL_COLORS[i] }}>{ch}</span>
      ))}
    </span>
  );
}

function NavItemRenderer({ item }: { item: NavItem; key?: React.Key }) {
  const [open, setOpen] = useState(false);
  const isHome = item.title === "Home";
  const label = isHome ? <ColoredHomeLabel /> : <span>{item.title}</span>;

  if (item.items && item.items.length > 0) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton tooltip={item.title} onClick={() => setOpen(!open)} className="cursor-pointer" data-tour={item.title.toLowerCase().replace(/\s+/g, "-")}>
          <item.icon />
          <span className="flex-1">{label}</span>
          <span
            className="text-[10px] text-muted-foreground transition-transform duration-200 ease-out"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            {"\u25B6"}
          </span>
        </SidebarMenuButton>
        <div
          className="ml-6 border-l pl-2 overflow-hidden"
          style={{
            display: "grid",
            gridTemplateRows: open ? "1fr" : "0fr",
            opacity: open ? 1 : 0,
            transition: "grid-template-rows 0.2s ease-out, opacity 0.2s ease-out",
          }}
        >
          <div className="min-h-0">
            <div className="mt-0.5 space-y-0.5">
              {item.items.map((sub, i) => (
                <div
                  key={sub.url}
                  style={{
                    opacity: open ? 1 : 0,
                    transform: open ? "translateX(0)" : "translateX(-8px)",
                    transition: `opacity 0.15s ease-out ${i * 0.04}s, transform 0.15s ease-out ${i * 0.04}s`,
                  }}
                >
                  <SidebarMenuButton asChild tooltip={sub.title} className="h-7 text-xs">
                    <Link href={sub.url} prefetch={false}>
                      <span>{sub.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.title}>
        <Link href={item.url} prefetch={false} data-tour={item.title.toLowerCase().replace(/\s+/g, "-")}>
          <item.icon />
          {label}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

type GlobalSidebarProperties = {
  readonly children?: ReactNode;
  readonly orgName?: string | null;
  readonly orgLogoUrl?: string | null;
};

type NavItem = {
  title: string;
  url: string;
  icon: typeof HomeIcon;
  isActive?: boolean;
  items?: { title: string; url: string }[];
};

function getNavForRole(role: AppRole, p: (path?: string) => string): {
  navMain: NavItem[];
  platformNav?: NavItem[];
  operationsNav?: NavItem[];
} {
  switch (role) {
    case "super_admin":
      return { navMain: [] };

    case "admin":
      return {
        navMain: [],
        platformNav: [
          {
            title: "Home",
            url: p(),
            icon: HomeIcon,
            isActive: true,
          },
          {
            title: "Contractors",
            url: p("employees"),
            icon: UsersIcon,
          },
        ],
        operationsNav: [
          { title: "Payroll", url: p("payroll"), icon: CreditCardIcon },
          { title: "Settings", url: p("settings"), icon: Settings2Icon },
        ],
      };

    case "manager":
      return {
        navMain: [
          {
            title: "Home",
            url: p(),
            icon: HomeIcon,
            isActive: true,
          },
          {
            title: "My Team",
            url: p("employees"),
            icon: UsersIcon,
          },
          {
            title: "Timesheets",
            url: p("timesheets"),
            icon: ClockIcon,
          },
          {
            title: "Payments",
            url: p("payments"),
            icon: ReceiptIcon,
          },
          {
            title: "Documents",
            url: p("documents"),
            icon: FileTextIcon,
          },
          {
            title: "Commissions",
            url: p("commissions"),
            icon: BadgeDollarSignIcon,
          }],
      
      };

    case "member":
      return {
        navMain: [
          {
            title: "Home",
            url: p(),
            icon: HomeIcon,
            isActive: true,
          },
          {
            title: "Timesheets",
            url: p("timesheets"),
            icon: ClockIcon,
          },
          {
            title: "Payments",
            url: p("payments"),
            icon: ReceiptIcon,
          },
          {
            title: "Documents",
            url: p("documents"),
            icon: FileTextIcon,
          }],
      
      };

    default:
      return {
        navMain: [
          {
            title: "Home",
            url: "/",
            icon: HomeIcon,
            isActive: true,
          }],
      
      };
  }
}

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
};

function getRLPlatformNav(p: (path?: string) => string): NavItem[] {
  return [
    { title: "Home", url: p(), icon: HomeIcon, isActive: true },
    { title: "Organizations", url: p("organizations"), icon: BuildingIcon },
    { title: "Contacts", url: p("contacts"), icon: UserIcon },
    { title: "Service Catalog", url: p("catalog"), icon: PackageIcon },
    { title: "Pipeline Management", url: p("settings/pipeline"), icon: NetworkIcon },
    {
      title: "Contractors",
      url: p("employees"),
      icon: UsersIcon,
      items: [
        { title: "All Contractors", url: p("employees") },
        { title: "Add Contractor", url: p("employees/new") },
        { title: "Onboarding", url: p("onboarding") },
        { title: "Org Chart", url: p("org-chart") }],
    },
    { title: "Settings", url: p("settings"), icon: Settings2Icon }];
}

function getRLOperationsNav(p: (path?: string) => string): NavItem[] {
  return [
    {
      title: "Time Off",
      url: p("time-off"),
      icon: CalendarIcon,
      items: [
        { title: "RL Internal", url: p("time-off") },
        { title: "External Time Off", url: p("time-off/external") },
      ],
    },
    {
      title: "Timesheets",
      url: p("timesheets"),
      icon: ClockIcon,
      items: [
        { title: "Contractor Timesheets", url: p("timesheets") },
        { title: "My Timesheet", url: p("timesheets?view=mine") },
      ],
    },
    {
      title: "Payroll",
      url: p("payroll"),
      icon: CreditCardIcon,
      items: [
        { title: "Internal", url: p("payroll") },
        { title: "External", url: p("payroll/external") },
      ],
    },
    {
      title: "Documents",
      url: p("documents"),
      icon: FileTextIcon,
      items: [
        { title: "RL Internal", url: p("documents") },
        { title: "External Docs", url: p("documents/external") },
      ],
    },
    {
      title: "Expenses",
      url: p("expenses"),
      icon: ReceiptIcon,
      items: [
        { title: "RL Internal", url: p("expenses") },
        { title: "External Expenses", url: p("expenses/external") },
      ],
    },
    { title: "Reports", url: p("reports"), icon: BarChart3Icon },
    { title: "Commissions", url: p("commissions"), icon: BadgeDollarSignIcon }];
}

function AppsButton() {
  const { setShowPicker, widgets } = useApps();
  return (
    <SidebarMenuButton
      onClick={() => setShowPicker(true)}
      tooltip="Apps"
      className="relative"
    >
      <LayoutGridIcon />
      <span>Apps</span>
      {widgets.length > 0 ? (
        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {widgets.length}
        </span>
      ) : (
        <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          New
        </span>
      )}
    </SidebarMenuButton>
  );
}

function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ id: string; message: string; time: string; link: string }[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => { setCount(d.count ?? 0); setItems(d.items ?? []); })
      .catch((err) => { console.warn("[Sidebar] Notification fetch failed:", err); });
  }, []);

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 8, left: rect.right - 288 });
    }
  }, [open]);

  const visibleItems = items.filter((i) => !dismissed.has(i.id));
  const visibleCount = visibleItems.length;

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed((prev) => new Set(prev).add(id));
  };

  const handleNavigate = (link: string) => {
    setOpen(false);
    router.push(link);
  };

  return (
    <div className="relative ml-auto">
      <button ref={btnRef} onClick={(e) => { e.stopPropagation(); setOpen(!open); }} aria-label={`Notifications${visibleCount > 0 ? ` (${visibleCount} new)` : ""}`} aria-expanded={open} aria-haspopup="true" className="relative flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent">
        <BellIcon className="h-4 w-4" />
        {visibleCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{visibleCount}</span>
        )}
      </button>
      {open && pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed z-50 w-80 rounded-xl border bg-popover p-2 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150" style={{ top: pos.top, left: Math.max(8, pos.left), transform: "translateY(-100%)" }}>
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-medium text-muted-foreground">Notifications</span>
              {visibleItems.length > 0 && (
                <button onClick={() => setDismissed(new Set(items.map((i) => i.id)))} className="text-[10px] text-muted-foreground hover:text-foreground">
                  Clear all
                </button>
              )}
            </div>
            {visibleItems.length > 0 ? visibleItems.map((item) => (
              <div key={item.id} onClick={() => handleNavigate(item.link)} className="group flex items-center justify-between rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-accent">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.message}</div>
                  <div className="text-[10px] text-muted-foreground">{item.time}</div>
                </div>
                <button onClick={(e) => handleDismiss(item.id, e)} className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted" aria-label="Dismiss">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )) : (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">No new notifications</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export const GlobalSidebar = ({ children, orgName: serverOrgName, orgLogoUrl: serverOrgLogoUrl }: GlobalSidebarProperties) => {
  const router = useRouter();
  const supabase = createClient();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<AppRole>("member");
  const [userDepartment, setUserDepartment] = useState<string | null>(null);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  useEffect(() => {
    // Fetch user identity + real DB role in parallel
    Promise.all([
      supabase.auth.getUser(),
      fetch("/api/auth/me").then((r) => r.json()).catch(() => ({ role: "member", orgId: null, department: null })),
    ]).then(([{ data: { user } }, me]) => {
      if (user) {
        setUserEmail(user.email ?? null);
        setUserName(
          (user.user_metadata?.name as string) ?? user.email ?? null
        );
        setUserAvatar(
          (user.user_metadata?.avatar_url as string) ?? null
        );
        // Use real DB role, not user_metadata.role (which reflects OAuth data)
        const role = (me?.role as AppRole) ?? "member";
        setUserRole(role);
        setUserDepartment(me?.department ?? null);
        // If viewing our own org, treat as internal platform view
        const activeOrg = (user.user_metadata?.activeOrganizationId as string) ?? null;
        if (activeOrg === "org_rl_001") {
          setCurrentOrgId(null);
          supabase.auth.updateUser({ data: { activeOrganizationId: null } });
        } else {
          setCurrentOrgId(activeOrg);
        }
      }
    });
  }, [supabase]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }, [supabase, router]);

  const isSuperAdmin = userRole === "super_admin";
  const isViewingClientOrg = isSuperAdmin && Boolean(currentOrgId);
  const [viewingOrgName, setViewingOrgName] = useState<string | null>(null);

  // Path builder: p("employees")  "/acme/employees"
  const slug = orgSlug ?? "rl";
  const p = (path?: string) => (path ? `/${slug}/${path}` : `/${slug}`);

  const superAdminInternalNav = getRLPlatformNav(p);
  const superAdminOperationsNav = getRLOperationsNav(p);
  const { navMain: rawRoleNav, platformNav: rolePlatformNav, operationsNav: roleOperationsNav } = getNavForRole(userRole, p);

  const isRLOrg = slug === "rl";

  // Hide Timesheets for salaried internal Marketing department members (they don't track hourly timesheets)
  const isSalariedDept = isRLOrg && userDepartment === "Marketing";
  const roleNav = isSalariedDept
    ? rawRoleNav.filter((item) => item.title !== "Timesheets")
    : rawRoleNav;

  const handleOrgSwitch = useCallback((orgId: string | null, orgName: string | null) => {
    setCurrentOrgId(orgId);
    setViewingOrgName(orgName);
  }, []);

  const sidebarOrgName = isRLOrg ? "Remote Leverage" : (serverOrgName ?? "Dashboard");
  const sidebarLogoUrl = isRLOrg ? null : serverOrgLogoUrl;

  return (
    <>
      <Sidebar variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href={p()} className="flex items-center gap-2 font-semibold">
                  {sidebarLogoUrl ? (
                    <Image src={sidebarLogoUrl} alt={sidebarOrgName} width={24} height={24} className="h-6 w-6 rounded-sm object-cover" />
                  ) : (
                    <Image src="/logo.png" alt="Remote Leverage" width={24} height={24} className="h-6 w-6 rounded-sm" />
                  )}
                  <span>{sidebarOrgName}</span>
                </Link>
              </SidebarMenuButton>
              {!isRLOrg && (
                <p className="px-2 text-[10px] text-muted-foreground/60">Managed by Remote Leverage</p>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* Only show search for roles that can view contractor records */}
        {["super_admin", "admin", "manager"].includes(userRole) && <Search />}
        <SidebarContent>
          {/* Super Admin viewing RL Internal: platform + operations nav */}
          {isSuperAdmin && !isViewingClientOrg && (
            <>
              <SidebarGroup>
                <SidebarGroupLabel>Platform</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {superAdminInternalNav.map((item) => (
                      <NavItemRenderer key={`${item.title}-${item.url}`} item={item} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel>Operations</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {superAdminOperationsNav.map((item) => (
                      <NavItemRenderer key={`${item.title}-${item.url}`} item={item} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}

          {/* Super Admin viewing a client org (or client super_admin): grouped layout matching RL */}
          {isSuperAdmin && isViewingClientOrg && (() => {
            const clientPlatformNav: NavItem[] = [
              { title: "Home", url: p(), icon: HomeIcon, isActive: true },
              {
                title: "Contractors",
                url: p("employees"),
                icon: UsersIcon,
              }];
            const clientOperationsNav: NavItem[] = [
              { title: "Timesheets", url: p("timesheets"), icon: ClockIcon },
              { title: "Payroll", url: p("payroll"), icon: CreditCardIcon },
              { title: "Documents", url: p("documents"), icon: FileTextIcon },
              { title: "Settings", url: p("settings"), icon: Settings2Icon }];
            // isRLOrg is defined at component level
            return (
              <>
                <SidebarGroup>
                  <SidebarGroupLabel>{viewingOrgName ?? "Platform"}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {clientPlatformNav.map((item) => (
                        <NavItemRenderer key={`${item.title}-${item.url}`} item={item} />
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                  <SidebarGroupLabel>Operations</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {clientOperationsNav.map((item) => (
                        <NavItemRenderer key={`${item.title}-${item.url}`} item={item} />
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
                {isRLOrg && (
                  <SidebarGroup>
                    <SidebarGroupLabel>RL Quick Links</SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        <NavItemRenderer item={{ title: "Hiring Pipeline", url: p("hiring"), icon: NetworkIcon }} />
                        <NavItemRenderer item={{ title: "All Clients", url: p("organizations"), icon: BuildingIcon }} />
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                )}
              </>
            );
          })()}

          {/* Non-super_admin: role-based nav */}
          {!isSuperAdmin && rolePlatformNav && roleOperationsNav && (
            <>
              <SidebarGroup>
                <SidebarGroupLabel>Platform</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {rolePlatformNav.map((item) => (
                      <NavItemRenderer key={`${item.title}-${item.url}`} item={item} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel>Operations</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {roleOperationsNav.map((item) => (
                      <NavItemRenderer key={`${item.title}-${item.url}`} item={item} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}

          {!isSuperAdmin && !rolePlatformNav && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {roleNav.map((item) => (
                    <NavItemRenderer key={`${item.title}-${item.url}`} item={item} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter>
          {isSuperAdmin && (
            <OrgSwitcher currentOrgId={currentOrgId} isSuperAdmin={isSuperAdmin} onSwitch={handleOrgSwitch} />
          )}
          <SidebarMenu>
            {/* Apps Button */}
            {!isViewingClientOrg && (
            <SidebarMenuItem>
              <AppsButton />
            </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="h-auto flex-1">
                      {userAvatar ? (
                        <Image src={userAvatar} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : sidebarLogoUrl ? (
                        <Image src={sidebarLogoUrl} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                          {userName?.charAt(0)?.toUpperCase() ?? (
                            <UserIcon className="h-4 w-4" />
                          )}
                        </div>
                      )}
                      <div className="flex flex-col gap-0.5 overflow-hidden">
                        <span className="truncate text-sm font-medium">
                          {userName ?? "User"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {userEmail}
                        </span>
                      </div>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem disabled>
                    <span className="text-xs text-muted-foreground">
                      Role: {ROLE_LABELS[userRole]}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/profile")}>
                    <UserIcon className="text-muted-foreground" />
                    <span>My Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/contact-us")}>
                    <HeadphonesIcon className="text-muted-foreground" />
                    <span>Contact Us</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOutIcon className="text-muted-foreground" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <NotificationBell />
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <div className="flex items-center">
                <ModeToggle />
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </>
  );
};
