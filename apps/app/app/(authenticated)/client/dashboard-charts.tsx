"use client";

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

const COLORS = ["#f97316", "#a855f7", "#3b82f6", "#22c55e", "#eab308", "#ef4444", "#06b6d4"];

const STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  pending: "#eab308",
  processing: "#3b82f6",
  failed: "#ef4444",
};

type ChartItem = { name: string; value: number };
type PaymentItem = { name: string; value: number; count: number };

export function ClientDashboardCharts({
  deptData,
  paymentData,
}: {
  deptData: ChartItem[];
  paymentData: PaymentItem[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Department Distribution */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold">Contractors by Department</h3>
        {deptData.length > 0 ? (
          <div className="mt-4 h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {deptData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-muted-foreground">No department data.</p>
        )}
      </div>

      {/* Payment Summary */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold">Payment Summary</h3>
        {paymentData.length > 0 ? (
          <div className="mt-4 h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: $${value.toLocaleString()}`}
                >
                  {paymentData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-muted-foreground">No payment data.</p>
        )}
      </div>
    </div>
  );
}
