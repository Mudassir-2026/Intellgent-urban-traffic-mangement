import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../services/api";
import { DensityBadge, SignalBadge } from "../components/Badges";
import { useAuth } from "../contexts/AuthContext";

const emptyForm = { name: "", latitude: "", longitude: "", approaches: 4 };

export default function Junctions() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "TRAFFIC_OPERATOR";
  const canDelete = user?.role === "ADMIN";

  const [junctions, setJunctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    if (!form.name.trim()) return setFormError("Name is required.");
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) return setFormError("Latitude must be between -90 and 90.");
    if (Number.isNaN(lng) || lng < -180 || lng > 180) return setFormError("Longitude must be between -180 and 180.");

    setSubmitting(true);
    try {
      await api.post("/junctions", {
        name: form.name,
        latitude: lat,
        longitude: lng,
        approaches: Number(form.approaches),
      });
      setForm(emptyForm);
      setShowForm(false);
      setToast({ type: "success", message: "Junction created." });
      load();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable(id) {
    if (!window.confirm("Disable this junction? Historical traffic data will be kept.")) return;
    try {
      await api.delete(`/junctions/${id}`);
      setToast({ type: "success", message: "Junction disabled." });
      load();
    } catch (err) {
      setToast({ type: "error", message: getErrorMessage(err) });
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2>Junctions</h2>
          <p>Manage intersections monitored by the system.</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ Add Junction"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>New Junction</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. MG Road & Park Street" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div className="form-group">
                <label>Latitude</label>
                <input value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="17.4326" />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="78.4071" />
              </div>
              <div className="form-group">
                <label>Approaches</label>
                <select value={form.approaches} onChange={(e) => setForm({ ...form, approaches: e.target.value })}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            {formError && <div className="error-text">{formError}</div>}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Creating..." : "Create Junction"}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading junctions...</div>
        ) : junctions.length === 0 ? (
          <div className="empty-state">No junctions yet. {canManage && "Add one to get started."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Approaches</th>
                <th>Density</th>
                <th>Vehicles</th>
                <th>Status</th>
                <th>Signals</th>
                {canDelete && <th></th>}
              </tr>
            </thead>
            <tbody>
              {junctions.map((j) => (
                <tr key={j.id}>
                  <td>{j.name}</td>
                  <td>{j.latitude.toFixed(4)}, {j.longitude.toFixed(4)}</td>
                  <td>{j.approaches}</td>
                  <td><DensityBadge level={j.current_density} /></td>
                  <td>{j.current_vehicle_count}</td>
                  <td>
                    <span className={`badge ${j.is_active ? "badge-low" : "badge-gray"}`}>
                      {j.is_active ? "ACTIVE" : "DISABLED"}
                    </span>
                  </td>
                  <td>
                    {j.signals.map((s) => (
                      <span key={s.id} style={{ marginRight: 4 }}><SignalBadge state={s.state} /></span>
                    ))}
                  </td>
                  {canDelete && (
                    <td>
                      {j.is_active && (
                        <button className="btn btn-sm btn-danger" onClick={() => handleDisable(j.id)}>
                          Disable
                        </button>
                      )}
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
