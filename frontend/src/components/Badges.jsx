const DENSITY_CLASS = {
  LOW: "badge-low",
  MEDIUM: "badge-medium",
  HIGH: "badge-high",
  CRITICAL: "badge-critical",
};

const SIGNAL_CLASS = {
  GREEN: "badge-green",
  RED: "badge-red",
  YELLOW: "badge-yellow",
};

export function DensityBadge({ level }) {
  return <span className={`badge ${DENSITY_CLASS[level] || "badge-gray"}`}>{level}</span>;
}

export function SignalBadge({ state }) {
  return <span className={`badge ${SIGNAL_CLASS[state] || "badge-gray"}`}>{state}</span>;
}

export function StatusBadge({ status }) {
  const map = {
    OPEN: "badge-red",
    INVESTIGATING: "badge-medium",
    RESOLVED: "badge-low",
    REPORTED: "badge-gray",
    ROUTE_CALCULATED: "badge-medium",
    PRIORITY_ACTIVE: "badge-critical",
    COMPLETED: "badge-low",
    CANCELLED: "badge-gray",
  };
  return <span className={`badge ${map[status] || "badge-gray"}`}>{status?.replace("_", " ")}</span>;
}
