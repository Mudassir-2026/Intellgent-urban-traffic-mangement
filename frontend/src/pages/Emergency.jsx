import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../services/api";
import { StatusBadge } from "../components/Badges";
import { useAuth } from "../contexts/AuthContext";

const VEHICLE_TYPES = ["AMBULANCE", "FIRE_TRUCK", "POLICE"];

const emptyForm = {
  vehicle_type: "AMBULANCE",
  origin_lat: "",
  origin_lng: "",
  destination_lat: "",
  destination_lng: "",
};

export default function Emergency() {
  const { user } = useAuth();
  const canManage = ["ADMIN", "EMERGENCY_OPERATOR", "TRAFFIC_OPERATOR"].includes(user?.role);

  const [events, setEvents] = useState([]);
  const [junctions, setJunctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actioning, setActioning] = useState(null);
  const [toast, setToast] = useState(null);
  const [routeInfo, setRouteInfo] = useState({});

  async function load() {
    setLoading(true);
    try {
      const [eRes, jRes] = await Promise.all([api.get("/emergency/events"), api.get("/junctions")]);
      setEvents(eRes.data);
      setJunctions(jRes.data);
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
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function fillFromCorridorPreset() {
    // Convenience: use the first and last known junction as origin/destination,
    // matching the demo scenario described in the project spec.
    if (junctions.length >= 2) {
      const first = junctions[0];
      const last = junctions[junctions.length - 1];
      setForm({
        ...form,
        origin_lat: String(first.latitude),
        origin_lng: String(first.longitude),
        destination_lat: String(last.latitude),
        destination_lng: String(last.longitude),
      });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    const lat1 = parseFloat(form.origin_lat);
    const lng1 = parseFloat(form.origin_lng);
    const lat2 = parseFloat(form.destination_lat);
    const lng2 = parseFloat(form.destination_lng);
    if ([lat1, lng1, lat2, lng2].some((v) => Number.isNaN(v))) {
      return setFormError("Please fill in valid origin and destination coordinates.");
    }

    setSubmitting(true);
    try {
      await api.post("/emergency/events", {
        vehicle_type: form.vehicle_type,
        origin_lat: lat1,
        origin_lng: lng1,
        destination_lat: lat2,
        destination_lng: lng2,
      });
      setForm(emptyForm);
      setShowForm(false);
      setToast({ type: "success", message: "Emergency event reported and route calculated." });
      load();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleActivate(eventId) {
    setActioning(eventId);
    try {
      await api.post(`/emergency/${eventId}/activate`);
      setToast({ type: "success", message: "Green corridor activated — priority signals applied along the route." });
      load();
    } catch (err) {
      setToast({ type: "error", message: getErrorMessage(err) });
    } finally {
      setActioning(null);
    }
  }

  async function handleComplete(eventId) {
    setActioning(eventId);
    try {
      await api.post(`/emergency/${eventId}/complete`);
      setToast({ type: "success", message: "Emergency completed — signals restored to intelligent optimization." });
      load();
    } catch (err) {
      setToast({ type: "error", message: getErrorMessage(err) });
    } finally {
      setActioning(null);
    }
  }

  async function viewRoute(eventId) {
    if (routeInfo[eventId]) {
      setRouteInfo((r) => ({ ...r, [eventId]: undefined }));
      return;
    }
    try {
      const res = await api.get(`/emergency/events/${eventId}/route`);
      setRouteInfo((r) => ({ ...r, [eventId]: res.data }));
    } catch (err) {
      setToast({ type: "error", message: getErrorMessage(err) });
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2>Emergency Priority</h2>
          <p>Report an emergency vehicle, activate the green corridor, and release it once the vehicle has passed.</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ Report Emergency"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>Report Emergency Vehicle</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Vehicle Type</label>
              <select value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
                {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group">
                <label>Origin Latitude</label>
                <input value={form.origin_lat} onChange={(e) => setForm({ ...form, origin_lat: e.target.value })} placeholder="17.4326" />
              </div>
              <div className="form-group">
                <label>Origin Longitude</label>
                <input value={form.origin_lng} onChange={(e) => setForm({ ...form, origin_lng: e.target.value })} placeholder="78.4071" />
              </div>
              <div className="form-group">
                <label>Destination Latitude</label>
                <input value={form.destination_lat} onChange={(e) => setForm({ ...form, destination_lat: e.target.value })} placeholder="17.4483" />
              </div>
              <div className="form-group">
                <label>Destination Longitude</label>
                <input value={form.destination_lng} onChange={(e) => setForm({ ...form, destination_lng: e.target.value })} placeholder="78.3915" />
              </div>
            </div>
            {junctions.length >= 2 && (
              <button type="button" className="btn btn-sm" onClick={fillFromCorridorPreset} style={{ marginBottom: 12 }}>
                Use first/last junction as demo route
              </button>
            )}
            {formError && <div className="error-text">{formError}</div>}
            <div>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Reporting..." : "Report & Calculate Route"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Emergency Events</h3>
        {loading ? (
          <div className="loading-text">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="empty-state">No emergency events reported yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vehicle Type</th>
                <th>Status</th>
                <th>Reported</th>
                <th>Route</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <>
                  <tr key={e.id}>
                    <td>{e.vehicle_type.replace("_", " ")}</td>
                    <td><StatusBadge status={e.status} /></td>
                    <td>{new Date(e.created_at).toLocaleString()}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => viewRoute(e.id)}>
                        {routeInfo[e.id] ? "Hide" : "View"}
                      </button>
                    </td>
                    {canManage && (
                      <td>
                        {(e.status === "REPORTED" || e.status === "ROUTE_CALCULATED") && (
                          <button className="btn btn-sm btn-primary" onClick={() => handleActivate(e.id)} disabled={actioning === e.id}>
                            {actioning === e.id ? "Activating..." : "Activate Priority"}
                          </button>
                        )}
                        {e.status === "PRIORITY_ACTIVE" && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleComplete(e.id)} disabled={actioning === e.id}>
                            {actioning === e.id ? "Completing..." : "Complete"}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {routeInfo[e.id] && (
                    <tr>
                      <td colSpan={canManage ? 5 : 4} style={{ background: "var(--color-bg)", fontSize: 12.5 }}>
                        Affected junctions: {routeInfo[e.id].junction_sequence.length} &nbsp;|&nbsp;
                        Total distance: {(routeInfo[e.id].total_distance_meters / 1000).toFixed(2)} km &nbsp;|&nbsp;
                        Estimated travel time: {Math.round(routeInfo[e.id].estimated_travel_seconds / 60)} min
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
