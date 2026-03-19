"use client";

export function CsvExportButton({ data, filename, columns }: {
  data: Record<string, unknown>[];
  filename: string;
  columns: { key: string; label: string }[];
}) {
  const handleExport = () => {
    const header = columns.map((c) => c.label).join(",");
    const rows = data.map((row) =>
      columns.map((c) => {
        const val = String(row[c.key] ?? "").replace(/"/g, '""');
        return val.includes(",") || val.includes('"') || val.includes("\n") ? `"${val}"` : val;
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button onClick={handleExport} className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-accent">
      Export CSV
    </button>
  );
}
