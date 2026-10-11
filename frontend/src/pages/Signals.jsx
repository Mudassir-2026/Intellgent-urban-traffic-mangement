import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../services/api";
import { SignalBadge } from "../components/Badges";
import { useAuth } from "../contexts/AuthContext";

export default function Signals() {
  const { user } = useAuth();
  const canOperate = user?.role === "ADMIN" || user?.role === "TRAFFIC_OPERATOR";

  const [junctions, setJunctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(null);
  const [toast, setToast] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/junctions");
      setJunctions(res.data);
    } catch (err) {
      setToast({ type: "error", message: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleOptimize(junctionId) {
    setOptimizing(junctionId);
    try {
      await api.post(`/signals/junctions/${junctionId}/optimize`);
      setToast({ type: "success", message: "Signal timing optimized based on current traffic conditions." });
      load();
    } catch (err) {
      setToast({ type: "error", message: getErrorMessage(err) });
    } finally {
      setOptimizing(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Signals</h2>
        <p>Signal state and green-time durations per junction. Optimization uses the latest traffic record.</p>
      </div>

      {loading ? (
        <div className="loading-text">Loading signals...</div>
      ) : junctions.length === 0 ? (
        <div className="card"><div className="empty-state">No junctions configured yet.</div></div>
      ) : (
        junctions.map((j) => (
          <div className="card" key={j.id} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{j.name}</h3>
              {canOperate && (
                <button className="btn btn-sm btn-primary" onClick={() => handleOptimize(j.id)} disabled={optimizing === j.id}>
                  {optimizing === j.id ? "Optimizing..." : "Run Optimization"}
                </button>
              )}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Approach</th>
                  <th>State</th>
                  <th>Green (s)</th>
                  <th>Red (s)</th>
                  <th>Min / Max Green</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {j.signals.map((s) => (
                  <tr key={s.id}>
                    <td>{s.approach_name}</td>
                    <td><SignalBadge state={s.state} /></td>
                    <td>{s.green_duration_seconds}</td>
                    <td>{s.red_duration_seconds}</td>
                    <td>{s.min_green_seconds}s / {s.max_green_seconds}s</td>
                    <td>{s.is_priority_active ? <span className="badge badge-critical">ACTIVE</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
