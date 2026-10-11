export default function StatCard({ label, value, suffix }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {suffix && <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 4, color: "var(--color-text-muted)" }}>{suffix}</span>}
      </div>
    </div>
  );
}
