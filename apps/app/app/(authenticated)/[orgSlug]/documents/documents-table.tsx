"use client";

import { deleteDocument, updateDocument } from "@/app/actions/hriq/documents";
import { shortDate } from "@/lib/hriq/format";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";

type Doc = {
  id: string;
  documentName: string;
  documentType: string;
  status: string;
  fileUrl: string | null;
  filePath: string | null;
  description: string | null;
  createdAt: string;
  employee: {
    id: string;
    legalFirstName: string;
    legalLastName: string;
    employeeNumber: string;
  };
};

type SortKey = "name" | "contractor" | "type" | "status" | "date";
type GroupBy = "none" | "contractor" | "type" | "status";

const TYPE_LABELS: Record<string, string> = {
  id_document: "Government ID",
  contract: "Contract",
  tax_form: "Tax Form",
  bank_details: "Bank Details",
  resume: "Resume",
  nda: "NDA",
  offer_letter: "Offer Letter",
  onboarding_form: "Onboarding Form",
  certificate: "Certificate",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  verified: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  uploaded: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  expired: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

export function DocumentsTable({ documents }: { documents: Doc[] }) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const types = useMemo(() => [...new Set(documents.map((d) => d.documentType))].sort(), [documents]);
  const statuses = useMemo(() => [...new Set(documents.map((d) => d.status))].sort(), [documents]);

  const filtered = useMemo(() => {
    let docs = documents;
    if (search) {
      const q = search.toLowerCase();
      docs = docs.filter(
        (d) =>
          d.documentName.toLowerCase().includes(q) ||
          d.employee.legalFirstName.toLowerCase().includes(q) ||
          d.employee.legalLastName.toLowerCase().includes(q) ||
          d.employee.employeeNumber.toLowerCase().includes(q) ||
          (TYPE_LABELS[d.documentType] ?? d.documentType).toLowerCase().includes(q)
      );
    }
    if (filterType !== "all") docs = docs.filter((d) => d.documentType === filterType);
    if (filterStatus !== "all") docs = docs.filter((d) => d.status === filterStatus);

    docs = [...docs].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.documentName.localeCompare(b.documentName);
          break;
        case "contractor":
          cmp = `${a.employee.legalFirstName} ${a.employee.legalLastName}`.localeCompare(
            `${b.employee.legalFirstName} ${b.employee.legalLastName}`
          );
          break;
        case "type":
          cmp = a.documentType.localeCompare(b.documentType);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "date":
          cmp = new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime();
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return docs;
  }, [documents, search, filterType, filterStatus, sortKey, sortAsc]);

  const grouped = useMemo<{ label: string | null; docs: Doc[] }[]>(() => {
    if (groupBy === "none") return [{ label: null, docs: filtered }];
    const map = new Map<string, Doc[]>();
    for (const d of filtered) {
      let key: string;
      switch (groupBy) {
        case "contractor":
          key = `${d.employee.legalFirstName} ${d.employee.legalLastName}`;
          break;
        case "type":
          key = TYPE_LABELS[d.documentType] ?? d.documentType.replace(/_/g, " ");
          break;
        case "status":
          key = d.status;
          break;
        default:
          key = "";
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, docs]) => ({ label, docs }));
  }, [filtered, groupBy]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-1 text-muted-foreground/40"></span>;
    return <span className="ml-1">{sortAsc ? "" : ""}</span>;
  };

  const activeFilters = (filterType !== "all" ? 1 : 0) + (filterStatus !== "all" ? 1 : 0) + (search ? 1 : 0);

  return (
    <div className="rounded-xl border bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents, contractors..."
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <CustomSelect
          value={filterType}
          onValueChange={setFilterType}
          triggerClassName="h-8 min-w-[130px]"
          placeholder="All types"
          options={[
            { value: "all", label: "All types" },
            ...types.map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t.replace(/_/g, " ") })),
          ]}
        />

        <CustomSelect
          value={filterStatus}
          onValueChange={setFilterStatus}
          triggerClassName="h-8 min-w-[120px]"
          placeholder="All statuses"
          options={[
            { value: "all", label: "All statuses" },
            ...statuses.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
          ]}
        />

        <CustomSelect
          value={groupBy}
          onValueChange={(v) => setGroupBy(v as GroupBy)}
          triggerClassName="h-8 min-w-[160px]"
          placeholder="No grouping"
          options={[
            { value: "none", label: "No grouping" },
            { value: "contractor", label: "Group by contractor" },
            { value: "type", label: "Group by type" },
            { value: "status", label: "Group by status" },
          ]}
        />

        {activeFilters > 0 && (
          <button
            onClick={() => {
              setSearch("");
              setFilterType("all");
              setFilterStatus("all");
            }}
            className="h-8 rounded-md border border-input px-2 text-xs text-muted-foreground hover:bg-accent"
          >
            Clear ({activeFilters})
          </button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} document{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-sm text-muted-foreground">
              <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("name")}>
                Document <SortIcon col="name" />
              </th>
              <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("contractor")}>
                Contractor <SortIcon col="contractor" />
              </th>
              <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("type")}>
                Type <SortIcon col="type" />
              </th>
              <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("status")}>
                Status <SortIcon col="status" />
              </th>
              <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("date")}>
                Date <SortIcon col="date" />
              </th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => (
              <GroupRows key={group.label ?? "__all"} group={group} groupBy={groupBy} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {documents.length === 0 ? "No documents yet." : "No documents match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ group, groupBy }: { group: { label: string | null; docs: Doc[] }; groupBy: GroupBy; key?: React.Key }) {
  return (
    <>
      {group.label && (
        <tr className="bg-muted/30">
          <td colSpan={6} className="px-4 py-2">
            <span className="text-sm font-semibold capitalize">{group.label}</span>
            <span className="ml-2 text-xs text-muted-foreground">({group.docs.length})</span>
          </td>
        </tr>
      )}
      {group.docs.map((doc) => (
        <DocumentRow key={doc.id} doc={doc} />
      ))}
    </>
  );
}

function DocumentRow({ doc }: { doc: Doc; key?: React.Key }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { showError } = useErrorDialog();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const handleDelete = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      try {
        await deleteDocument(doc.id);
      } catch (err) {
        showError({ title: "Delete Failed", message: err instanceof Error ? err.message : "Failed to delete document." });
      }
    });
  };

  const handleVerify = () => {
    startTransition(async () => {
      try {
        await updateDocument(doc.id, { status: "verified" });
      } catch (err) {
        showError({ title: "Verification Failed", message: err instanceof Error ? err.message : "Failed to verify document." });
      }
    });
  };

  const handleReject = () => {
    setRejectOpen(false);
    startTransition(async () => {
      try {
        await updateDocument(doc.id, { status: "rejected", rejectionReason: rejectionReason.trim() || undefined });
        setRejectionReason("");
      } catch (err) {
        showError({ title: "Rejection Failed", message: err instanceof Error ? err.message : "Failed to reject document." });
      }
    });
  };

  const isPendingOrUploaded = doc.status === "pending" || doc.status === "uploaded";

  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/50">
        <td className="px-4 py-3">
          <span className="font-medium">{doc.documentName}</span>
        </td>
        <td className="px-4 py-3 text-sm">
          <Link href={`/${orgSlug}/employees/${doc.employee.id}`} className="hover:underline">
            {doc.employee.legalFirstName} {doc.employee.legalLastName}
          </Link>
          <span className="ml-1 text-xs text-muted-foreground">({doc.employee.employeeNumber})</span>
        </td>
        <td className="px-4 py-3">
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">
            {TYPE_LABELS[doc.documentType] ?? doc.documentType.replace(/_/g, " ")}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[doc.status] ?? ""}`}>
            {doc.status}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {shortDate(doc.createdAt as any)}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {(doc.fileUrl || doc.filePath || (doc.description && /submission\s+\d+/i.test(doc.description))) ? (
              <a href={`/api/documents/view?id=${doc.id}`} target="_blank" rel="noopener noreferrer" className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent">
                View
              </a>
            ) : doc.documentType === "bank_details" ? (
              <span className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground">Submitted</span>
            ) : doc.documentType === "time_doctor_report" ? (
              <span className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground">Log entry</span>
            ) : (
              <span className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground">Pending file</span>
            )}
            {isPendingOrUploaded && (
              <>
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={isPending}
                  className="rounded-md border border-green-200 px-2.5 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/30"
                >
                  {isPending ? "…" : "Verify"}
                </button>
                <button
                  type="button"
                  onClick={() => setRejectOpen(true)}
                  disabled={isPending}
                  className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                   Reject
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={isPending}
              className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              Delete
            </button>
          </div>
        </td>
      </tr>
      {confirmOpen && (
        <tr>
          <td colSpan={6} className="p-0">
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
              <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-base font-semibold">Delete Document</h3>
                <p className="mt-2 text-sm text-muted-foreground">Delete &quot;{doc.documentName}&quot;? This cannot be undone.</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setConfirmOpen(false)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
                  <button type="button" onClick={handleDelete} disabled={isPending} className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                    {isPending ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
      {rejectOpen && (
        <tr>
          <td colSpan={6} className="p-0">
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
              <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-base font-semibold">Reject Document</h3>
                <p className="mt-2 text-sm text-muted-foreground">Reject &quot;{doc.documentName}&quot;? The contractor will be notified.</p>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Reason for rejection (optional)..."
                  rows={3}
                  className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setRejectOpen(false)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
                  <button type="button" onClick={handleReject} disabled={isPending} className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                    {isPending ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
