"use client";

import { updateUserRole, deactivateUser, reactivateUser } from "@/app/actions/hriq/users";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "bookkeeper", label: "Bookkeeper" },
  { value: "va", label: "VA" },
  { value: "member", label: "Member" },
];

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  manager: "bg-green-100 text-green-800",
  bookkeeper: "bg-yellow-100 text-yellow-800",
  va: "bg-orange-100 text-orange-800",
  member: "bg-gray-100 text-gray-600",
};

type Membership = {
  id: string;
  userId: string;
  role: string;
  organization: { name: string };
};

type AppUser = {
  id: string;
  isActive: boolean;
};

export function UserActions({
  membership,
  user,
}: {
  membership?: Membership;
  user?: AppUser;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (membership) {
    const handleRoleChange = (newRole: string) => {
      if (newRole === membership.role) return;
      startTransition(async () => {
        await updateUserRole(membership.id, newRole);
        router.refresh();
      });
    };

    return (
      <select
        value={membership.role}
        onChange={(e) => handleRoleChange(e.target.value)}
        disabled={isPending}
        className={`h-7 rounded-md border-0 px-2 text-xs font-medium ${ROLE_COLORS[membership.role] ?? "bg-gray-100"} cursor-pointer disabled:opacity-50`}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
    );
  }

  if (user) {
    const handleToggleActive = () => {
      startTransition(async () => {
        if (user.isActive) {
          await deactivateUser(user.id);
        } else {
          await reactivateUser(user.id);
        }
        router.refresh();
      });
    };

    return (
      <button
        onClick={handleToggleActive}
        disabled={isPending}
        className={`h-8 rounded-md border px-3 text-xs font-medium disabled:opacity-50 ${
          user.isActive
            ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            : "text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
        }`}
      >
        {isPending ? "..." : user.isActive ? "Deactivate" : "Reactivate"}
      </button>
    );
  }

  return null;
}
