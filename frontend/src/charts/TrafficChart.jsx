import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function TrafficChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="empty-state">No traffic data yet. Run the simulation to generate data.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
        <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(11)} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="vehicles" fill="#2563eb" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
