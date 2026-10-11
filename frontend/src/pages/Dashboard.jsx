import { useEffect, useState, useCallback } from "react";
import api, { getErrorMessage } from "../services/api";
import StatCard from "../components/StatCard";
import { DensityBadge, SignalBadge, StatusBadge } from "../components/Badges";
import TrafficChart from "../charts/TrafficChart";
import TrafficMap from "../map/TrafficMap";
import { useAuth } from "../contexts/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  const [junctions, setJunctions] = useState([]);
  const [liveTraffic, setLiveTraffic] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [emergencyEvents, setEmergencyEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [toast, setToast] = useState(null);

  const canOperate = user?.role === "ADMIN" || user?.role === "TRAFFIC_OPERATOR";

  const loadAll = useCallback(async () => {
    try {
      const [jRes, liveRes, anRes, emRes] = await Promise.all([
        api.get("/junctions"),
        api.get("/traffic/live"),
        api.get("/analytics"),
        api.get("/emergency/events"),
      ]);
      setJunctions(jRes.data);
      setLiveTraffic(liveRes.data);
      setAnalytics(anRes.data);
      setEmergencyEvents(emRes.data);
    } catch (err) {
      setToast({ type: "error", message: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function runSimulation() {
    setSimulating(true);
    try {
      await api.post("/traffic/simulate-all");
      setToast({ type: "success", message: "Simulation tick complete — traffic data updated." });
      await loadAll();
    } catch (err) {
      setToast({ type: "error", message: getErrorMessage(err) });
    } finally {
      setSimulating(false);
    }
  }

  const activeEmergency = emergencyEvents.find((e) => e.status === "PRIORITY_ACTIVE");
  const emergencyJunctionIds = new Set(liveTraffic.filter((s) => s.active_emergency).map((s) => s.junction_id));

  const totalVehicles = junctions.reduce((sum, j) => sum + (j.current_vehicle_count || 0), 0);
  const activeJunctions = junctions.filter((j) => j.is_active).length;
  const overallDensity = computeOverallDensity(junctions);
  const videoAnalyzed = liveTraffic.some((lane) => lane.data_source === "AI_VIDEO");
  const trafficSource = videoAnalyzed ? "video analysis + simulation" : junctions.some((j) => j.current_vehicle_count > 0) ? "simulation" : "no data yet";

  if (loading) return <div className="loading-text">Loading dashboard...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>Traffic Overview</h2>
        <p>Latest snapshot across active junctions. Data source: {trafficSource}. Video analysis is based on sampled uploaded clips, not a live camera feed.</p>
      </div>

      <div className={`emergency-banner ${activeEmergency ? "active" : "idle"}`}>
        {activeEmergency
          ? `Active emergency: ${activeEmergency.vehicle_type} — green corridor in progress`
          : "No active emergency event"}
      </div>

      <div className="stat-grid">
        <StatCard label="Total Vehicles" value={totalVehicles} />
        <StatCard label="Active Junctions" value={activeJunctions} />
        <StatCard label="Current Traffic Level" value={overallDensity} />
        <StatCard label="Active Emergency Events" value={emergencyEvents.filter((e) => e.status === "PRIORITY_ACTIVE").length} />
        <StatCard label="Avg Waiting Time" value={analytics?.avg_waiting_time_seconds ?? 0} suffix="sec" />
      </div>

      {canOperate && (
        <div style={{ marginBottom: 18 }}>
          <button className="btn btn-primary" onClick={runSimulation} disabled={simulating}>
            {simulating ? "Running simulation..." : "Run Simulation Tick"}
          </button>
          <span style={{ marginLeft: 10, fontSize: 12, color: "var(--color-text-muted)" }}>
            Generates simulated vehicles for every active junction (demo mode — no camera hardware required)
          </span>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h3>Vehicles by Hour</h3>
          <TrafficChart data={analytics?.vehicles_per_hour} />
        </div>
        <div className="card">
          <h3>Junction Map</h3>
          <TrafficMap junctions={junctions} emergencyJunctionIds={emergencyJunctionIds} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>Junction Status</h3>
        {junctions.length === 0 ? (
          <div className="empty-state">No junctions yet. Add one from the Junctions page.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Junction</th>
                <th>Vehicles</th>
                <th>Density</th>
                <th>Avg Wait</th>
                <th>Signals</th>
              </tr>
            </thead>
            <tbody>
              {junctions.map((j) => (
                <tr key={j.id}>
                  <td>{j.name}</td>
                  <td>{j.current_vehicle_count}</td>
                  <td><DensityBadge level={j.current_density} /></td>
                  <td>{j.avg_waiting_time_seconds?.toFixed(0)}s</td>
                  <td>
                    {j.signals.map((s) => (
                      <span key={s.id} style={{ marginRight: 6 }}>
                        <SignalBadge state={s.state} />
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Recent Emergency Events</h3>
        {emergencyEvents.length === 0 ? (
          <div className="empty-state">No emergency events reported yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vehicle Type</th>
                <th>Status</th>
                <th>Reported</th>
              </tr>
            </thead>
            <tbody>
              {emergencyEvents.slice(0, 5).map((e) => (
                <tr key={e.id}>
                  <td>{e.vehicle_type}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td>{new Date(e.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}

function computeOverallDensity(junctions) {
  if (junctions.length === 0) return "—";
  const order = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  const rev = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const avg = junctions.reduce((sum, j) => sum + (order[j.current_density] ?? 0), 0) / junctions.length;
  return rev[Math.round(avg)];
}
