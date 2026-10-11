import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/junctions", label: "Junctions" },
  { to: "/signals", label: "Signals" },
  { to: "/video-upload", label: "Upload Videos" },
  { to: "/emergency", label: "Emergency" },
  { to: "/incidents", label: "Incidents" },
  { to: "/analytics", label: "Analytics" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Intelligent Traffic<br />Management System</h1>
        <span>B.Tech Final Year Project</span>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div>{user?.full_name}</div>
        <span className="role-badge">{user?.role?.replace("_", " ")}</span>
        <button className="logout-btn" onClick={logout}>
          Log out
        </button>
      </div>
    </aside>
  );
}
