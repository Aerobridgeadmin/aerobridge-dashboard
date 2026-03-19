"use client";

import { updateUserRole, deactivateUser, reactivateUser } from "@/app/actions/hriq/users";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { useTransition } from "react";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "member", label: "Member" },
];

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  manager: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  member: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
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
  const { showError } = useErrorDialog();
  const [isPending, startTransition] = useTransition();

  if (membership) {
    const handleRoleChange = (newRole: string) => {
      if (newRole === membership.role) return;
      startTransition(async () => {
        try {
          await updateUserRole(membership.id, newRole);
        } catch (err) {
          showError({ title: "Role Update Failed", message: err instanceof Error ? err.message : "Failed to update role." });
        }
      });
    };

    return (
      <div className={`min-w-[130px] ${ROLE_COLORS[membership.role] ?? "bg-gray-100"} rounded-md`}>
        <CustomSelect
          value={membership.role}
          onValueChange={handleRoleChange}
          disabled={isPending}
          triggerClassName="h-7 border-0 bg-transparent px-2 text-xs font-medium"
          options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
        />
      </div>
    );
  }

  if (user) {
    const handleToggleActive = () => {
      startTransition(async () => {
        try {
          if (user.isActive) {
            await deactivateUser(user.id);
          } else {
            await reactivateUser(user.id);
          }
        } catch (err) {
          showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to update user status." });
        }
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
