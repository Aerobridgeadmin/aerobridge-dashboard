"use client";

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

const COLORS = ["#f97316", "#a855f7", "#3b82f6", "#22c55e", "#eab308", "#ef4444", "#06b6d4", "#ec4899"];

type ChartItem = { name: string; value: number };

export function ReportsCharts({
  statusData,
  deptData,
  typeData,
  paymentData,
  taskData,
}: {
  statusData: ChartItem[];
  deptData: ChartItem[];
  typeData: ChartItem[];
  paymentData: ChartItem[];
  taskData: ChartItem[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard title="Contractors by Status" data={statusData} type="pie" />
      <ChartCard title="Contractors by Department" data={deptData} type="bar" />
      <ChartCard title="Contract Type" data={typeData} type="pie" />
      <ChartCard title="Task Status" data={taskData} type="bar" />
      <ChartCard title="Payment Summary" data={paymentData} type="pie" />
    </div>
  );
}

function ChartCard({ title, data, type }: { title: string; data: ChartItem[]; type: "pie" | "bar" }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-4 text-center text-sm text-muted-foreground">No data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-4 h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          {type === "pie" ? (
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : (
            <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
