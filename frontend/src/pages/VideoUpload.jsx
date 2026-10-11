import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../services/api";
import { DensityBadge } from "../components/Badges";
import { useAuth } from "../contexts/AuthContext";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function VideoUpload() {
  const { user } = useAuth();
  const canUpload = user?.role === "ADMIN" || user?.role === "TRAFFIC_OPERATOR";

  const [junctions, setJunctions] = useState([]);
  const [selectedJunctionId, setSelectedJunctionId] = useState("");
  const [laneFiles, setLaneFiles] = useState({ lane_1: null, lane_2: null, lane_3: null, lane_4: null });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);
  const [videoUrls, setVideoUrls] = useState({});

  async function loadJunctions() {
    try {
      const res = await api.get("/junctions");
      setJunctions(res.data);
      if (res.data.length > 0 && !selectedJunctionId) {
        setSelectedJunctionId(res.data[0].id);
      }
    } catch (err) {
      setToast({ type: "error", message: getErrorMessage(err) });
    }
  }

  useEffect(() => {
    loadJunctions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const urls = Object.fromEntries(Object.entries(laneFiles).filter(([, file]) => file).map(([key, file]) => [key, URL.createObjectURL(file)]));
    setVideoUrls(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [laneFiles]);

  useEffect(() => {
    if (!selectedJunctionId) return;
    let active = true;
    api.get(`/traffic/junctions/${selectedJunctionId}/lanes/latest`)
      .then((res) => { if (active) setResult(res.data); })
      .catch((err) => { if (active && err?.response?.status !== 404) setUploadError(getErrorMessage(err)); })
      .finally(() => { if (active) setUploading(false); });
    return () => { active = false; };
  }, [selectedJunctionId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function handleFileChange(laneKey, file) {
    setLaneFiles((prev) => ({ ...prev, [laneKey]: file }));
  }

  async function handleUpload(e) {
    e.preventDefault();
    setUploadError("");
    setResult(null);

    if (!selectedJunctionId) return setUploadError("Please select a junction first.");
    if (!laneFiles.lane_1) return setUploadError("At least Lane 1 video is required.");

    const formData = new FormData();
    Object.entries(laneFiles).forEach(([key, file]) => {
      if (file) formData.append(key, file);
    });

    setUploading(true);
    try {
      const res = await api.post(
        `/traffic/junctions/${selectedJunctionId}/lanes/upload`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setResult(res.data);
      setToast({ type: "success", message: "Video analysis is ready. Review the estimated counts and annotated frames below." });
      loadJunctions();
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  if (!canUpload) {
    return (
      <div>
        <div className="page-header">
          <h2>Upload Lane Videos</h2>
          <p>Video-based vehicle detection.</p>
        </div>
        <div className="card">
          <div className="empty-state">Only Admin and Traffic Operator roles can upload lane videos.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Upload Lane Videos</h2>
        <p>
          Analyze one video per approach. YOLOv8 samples the clips, tracks common road-vehicle classes,
          and produces a reviewable annotated frame and lane-by-lane report.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>Upload Lane Videos</h3>
        <form onSubmit={handleUpload}>
          <div className="form-group">
            <label>Junction</label>
            <select value={selectedJunctionId} onChange={(e) => setSelectedJunctionId(e.target.value)}>
              {junctions.length === 0 && <option value="">No junctions available</option>}
              {junctions.map((j) => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
          </div>

          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 14 }}>
            Add a clip for each lane you want analyzed. MP4, AVI, MOV, MKV, MPEG, and WEBM are supported; each clip can be up to 500 MB.
          </p>

          {["lane_1", "lane_2", "lane_3", "lane_4"].map((key, idx) => (
            <div className="form-group" key={key}>
              <label>Lane {idx + 1} Video{idx === 0 ? "" : " (optional)"}</label>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => handleFileChange(key, e.target.files?.[0] || null)}
              />
              {laneFiles[key] && (
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                  {laneFiles[key].name}
                </div>
              )}
            </div>
          ))}

          {uploadError && <div className="error-text" style={{ marginBottom: 12 }}>{uploadError}</div>}

          <button type="submit" className="btn btn-primary" disabled={uploading}>
            {uploading ? "Processing videos (this can take a moment)..." : "Upload and Start"}
          </button>
        </form>
      </div>

      {result && (
        <div className="card">
          <h3>Lane Video Analysis</h3>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: -6, marginBottom: 14 }}>
            {result.note}
          </p>

          <div className="card" style={{ marginBottom: 16, padding: 12, color: "var(--color-text-muted)" }}>
            Emergency-vehicle recognition is not available in this model. Review the footage and report confirmed emergencies manually.
          </div>

          <div className="grid-2">
            {result.lanes.map((lane) => {
              const key = lane.lane_label.toLowerCase().replace(" ", "_");
              const advisoryColor = { RED: "#e74444", AMBER: "#e8a629", GREEN: "#35a86b" }[lane.signal_advisory] || "#9aa3af";
              const advisoryLabel = lane.signal_advisory === "AMBER" ? "YELLOW" : lane.signal_advisory;
              const signalLights = [
                { name: "RED", on: "#ff3028", off: "#571b19", glow: "rgba(255,48,40,.65)" },
                { name: "AMBER", label: "YELLOW", on: "#ffbd22", off: "#58431b", glow: "rgba(255,189,34,.65)" },
                { name: "GREEN", on: "#22dc4c", off: "#174b29", glow: "rgba(34,220,76,.65)" },
              ];
              return <section className="card" key={lane.lane_label} style={{ marginBottom: 16, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h4 style={{ margin: 0 }}>{lane.lane_label}</h4>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "64px minmax(0, 1fr)", gap: 12, alignItems: "start", marginBottom: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".04em", color: "var(--color-text-muted)" }}>SIGNAL</span>
                    <div role="img" aria-label={`${lane.lane_label} signal advisory: ${advisoryLabel}`} style={{ background: "linear-gradient(110deg, #555b62, #292d32 35%, #444a50)", border: "3px solid #aeb4ba", borderRadius: 15, padding: 8, display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 2px 6px rgba(0,0,0,.2)" }}>
                      {signalLights.map((light) => {
                        const active = lane.signal_advisory === light.name;
                        return <span key={light.name} title={`${light.label || light.name}${active ? " (advisory active)" : ""}`} style={{ width: 31, height: 31, borderRadius: "50%", background: active ? light.on : light.off, border: "2px solid rgba(0,0,0,.45)", boxShadow: active ? `0 0 12px 3px ${light.glow}, inset 0 1px 4px rgba(255,255,255,.5)` : "inset 0 2px 5px rgba(0,0,0,.55)", display: "block" }} />;
                      })}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: advisoryColor }}>{advisoryLabel}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>{lane.signal_advisory_reason} Video-based advisory only; it does not control physical lights.</div>
                    {videoUrls[key] && <video src={videoUrls[key]} controls preload="metadata" style={{ width: "100%", maxHeight: 260, background: "#111", borderRadius: 8, marginBottom: 10 }} />}
                    {lane.annotated_frame_base64 && <img src={`data:image/jpeg;base64,${lane.annotated_frame_base64}`} alt={`YOLO detections in ${lane.lane_label}`} style={{ width: "100%", borderRadius: 8, border: "1px solid var(--color-border)", display: "block", marginBottom: 10 }} />}
                  </div>
                </div>
                <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                  <div className="stat-card"><div className="stat-label">Unique tracks (estimate)</div><div className="stat-value">{lane.total_vehicles}</div></div>
                  <div className="stat-card"><div className="stat-label">Peak visible</div><div className="stat-value">{lane.peak_visible_vehicles}</div></div>
                  <div className="stat-card"><div className="stat-label">Frames sampled</div><div className="stat-value">{lane.frames_sampled}</div></div>
                </div>
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 0 }}>Clip {lane.duration_seconds ?? "—"}s · analyzed in {lane.processing_seconds}s · advisory only</p>
              </section>;
            })}
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <h3>Current Traffic Density by Lane</h3>
            <p style={{ color: "var(--color-text-muted)", fontSize: 12 }}>Peak vehicles visible in sampled frames. Density is estimated from the peak snapshot; it is not a live camera feed.</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={result.lanes} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="lane_label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="peak_visible_vehicles" name="Peak vehicles visible" radius={[5, 5, 0, 0]}>
                  {result.lanes.map((lane) => <Cell key={lane.lane_label} fill={{ RED: "#e74444", AMBER: "#e8a629", GREEN: "#35a86b" }[lane.signal_advisory] || "#9aa3af"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <h3>Vehicles Tracked Across Each Clip</h3>
            <p style={{ color: "var(--color-text-muted)", fontSize: 12 }}>Approximate tracked vehicles across sampled frames; these are not confirmed stop-line crossings.</p>
            <div style={{ overflowX: "auto" }}><table>
              <thead><tr><th>Lane</th><th>Cars</th><th>Buses</th><th>Trucks</th><th>Motorcycles</th><th>Bicycles</th><th>Estimated unique total</th></tr></thead>
              <tbody>{result.lanes.map((lane) => <tr key={lane.lane_label}>
                <td>{lane.lane_label}</td><td>{lane.vehicle_counts.car || 0}</td><td>{lane.vehicle_counts.bus || 0}</td><td>{lane.vehicle_counts.truck || 0}</td><td>{lane.vehicle_counts.motorcycle || 0}</td><td>{lane.vehicle_counts.bicycle || 0}</td><td>{lane.total_vehicles}</td>
              </tr>)}</tbody>
            </table></div>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Tracked Vehicles (All Lanes)</div>
              <div className="stat-value">{result.traffic_record.vehicle_count}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Density Level</div>
              <div className="stat-value" style={{ fontSize: 18, marginTop: 8 }}>
                <DensityBadge level={result.traffic_record.density_level} />
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Density Score</div>
              <div className="stat-value">{result.traffic_record.density_score}<span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>/100</span></div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
