import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../services/api";
import StatCard from "../components/StatCard";
import TrafficChart from "../charts/TrafficChart";

const WINDOWS = [
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 168 },
  { label: "Last 30 days", hours: 720 },
];

export default function Analytics() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  async function load(h) {
    setLoading(true);
    try {
      const res = await api.get("/analytics", { params: { hours: h } });
      setData(res.data);
    } catch (err) {
      setToast({ type: "error", message: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(hours);
  }, [hours]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2>Analytics</h2>
          <p>Aggregated traffic performance. Comparison figures are simulation estimates, not real-world measurements.</p>
        </div>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ width: 160 }}>
          {WINDOWS.map((w) => <option key={w.hours} value={w.hours}>{w.label}</option>)}
        </select>
      </div>

      {loading || !data ? (
        <div className="loading-text">Loading analytics...</div>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Total Vehicles" value={data.total_vehicles} />
            <StatCard label="Avg Waiting Time" value={data.avg_waiting_time_seconds} suffix="sec" />
            <StatCard label="Avg Density Score" value={data.avg_density_score} suffix="/100" />
            <StatCard
              label="Avg Emergency Response"
              value={data.avg_emergency_response_seconds !== null ? Math.round(data.avg_emergency_response_seconds) : "—"}
              suffix={data.avg_emergency_response_seconds !== null ? "sec" : ""}
            />
          </div>

          <div className="grid-2">
            <div className="card">
              <h3>Vehicles per Hour</h3>
              <TrafficChart data={data.vehicles_per_hour} />
            </div>
            <div className="card">
              <h3>Density Breakdown</h3>
              <table>
                <thead><tr><th>Level</th><th>Sample Count</th></tr></thead>
                <tbody>
                  {Object.entries(data.density_breakdown).map(([level, count]) => (
                    <tr key={level}><td>{level}</td><td>{count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <h3>Junction Performance</h3>
            {data.junction_performance.length === 0 ? (
              <div className="empty-state">No traffic records in this window.</div>
            ) : (
              <table>
                <thead>
                  <tr><th>Junction</th><th>Avg Density Score</th><th>Avg Waiting Time</th><th>Samples</th></tr>
                </thead>
                <tbody>
                  {data.junction_performance.map((jp) => (
                    <tr key={jp.junction_id}>
                      <td>{jp.junction_name}</td>
                      <td>{jp.avg_density_score}</td>
                      <td>{jp.avg_waiting_time_seconds}s</td>
                      <td>{jp.sample_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <h3>Fixed vs. Intelligent Signal Control (Simulation Estimate)</h3>
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: -4 }}>{data.performance_comparison.note}</p>
            <div className="stat-grid" style={{ marginTop: 12 }}>
              <StatCard label="Intelligent Avg Wait" value={data.performance_comparison.intelligent_avg_wait_seconds} suffix="sec" />
              <StatCard label="Fixed-Timing Avg Wait" value={data.performance_comparison.fixed_signal_avg_wait_seconds} suffix="sec" />
              <StatCard label="Improvement" value={data.performance_comparison.improvement_percent} suffix="%" />
            </div>
          </div>

          <div className="card">
            <h3>Incidents by Type</h3>
            {Object.keys(data.incidents_by_type).length === 0 ? (
              <div className="empty-state">No incidents in this window.</div>
            ) : (
              <table>
                <thead><tr><th>Type</th><th>Count</th></tr></thead>
                <tbody>
                  {Object.entries(data.incidents_by_type).map(([type, count]) => (
                    <tr key={type}><td>{type.replace(/_/g, " ")}</td><td>{count}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
