import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../services/api";
import { StatusBadge } from "../components/Badges";
import { useAuth } from "../contexts/AuthContext";

const INCIDENT_TYPES = ["ACCIDENT", "ROAD_BLOCKAGE", "HEAVY_CONGESTION", "SIGNAL_FAILURE", "ROAD_CONSTRUCTION", "OTHER"];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES = ["OPEN", "INVESTIGATING", "RESOLVED"];

const emptyForm = { type: "ACCIDENT", latitude: "", longitude: "", description: "", severity: "MEDIUM" };

export default function Incidents() {
  const { user } = useAuth();
  const canResolve = user?.role === "ADMIN" || user?.role === "TRAFFIC_OPERATOR";

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [toast, setToast] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/incidents");
      setIncidents(res.data);
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

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return setFormError("Please enter valid coordinates.");

    setSubmitting(true);
    try {
      await api.post("/incidents", {
        type: form.type,
        latitude: lat,
        longitude: lng,
        description: form.description || null,
        severity: form.severity,
      });
      setForm(emptyForm);
      setShowForm(false);
      setToast({ type: "success", message: "Incident reported." });
      load();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id, status) {
    setUpdating(id);
    try {
      await api.put(`/incidents/${id}`, { status });
      setToast({ type: "success", message: "Incident status updated." });
      load();
    } catch (err) {
      setToast({ type: "error", message: getErrorMessage(err) });
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2>Incidents</h2>
          <p>Accidents, blockages, and other reported road issues. Any signed-in user can report an incident.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ Report Incident"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>Report Incident</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group">
                <label>Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Severity</label>
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Latitude</label>
                <input value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="17.43" />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="78.41" />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description of what happened" />
            </div>
            {formError && <div className="error-text">{formError}</div>}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Reporting..." : "Report Incident"}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading incidents...</div>
        ) : incidents.length === 0 ? (
          <div className="empty-state">No incidents reported.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Severity</th>
                <th>Description</th>
                <th>Status</th>
                <th>Reported</th>
                {canResolve && <th>Update</th>}
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id}>
                  <td>{i.type.replace(/_/g, " ")}</td>
                  <td>
                    <span className={`badge ${i.severity === "CRITICAL" ? "badge-critical" : i.severity === "HIGH" ? "badge-high" : i.severity === "MEDIUM" ? "badge-medium" : "badge-low"}`}>
                      {i.severity}
                    </span>
                  </td>
                  <td>{i.description || "—"}</td>
                  <td><StatusBadge status={i.status} /></td>
                  <td>{new Date(i.created_at).toLocaleString()}</td>
                  {canResolve && (
                    <td>
                      <select
                        value={i.status}
                        disabled={updating === i.id}
                        onChange={(e) => handleStatusChange(i.id, e.target.value)}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  )}
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
