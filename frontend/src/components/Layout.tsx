import { NavLink, Outlet } from "react-router-dom";
import { Activity, BarChart3, Brain, Zap } from "lucide-react";

const navItems = [
  { to: "/", icon: Activity, label: "Dashboard" },
  { to: "/predict", icon: BarChart3, label: "Prediction" },
  { to: "/interpret", icon: Brain, label: "Interpretation" },
  { to: "/agent", icon: Zap, label: "LangChain Agent" },
];

export default function Layout() {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <nav
        style={{
          width: 220,
          background: "#0f172a",
          color: "#e2e8f0",
          display: "flex",
          flexDirection: "column",
          padding: "20px 0",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "0 20px 24px",
            borderBottom: "1px solid #1e293b",
            marginBottom: 16,
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#38bdf8" }}>
            QAFI
          </h1>
          <p style={{ fontSize: 11, margin: "4px 0 0", color: "#94a3b8" }}>
            Variant Impact Prediction
          </p>
        </div>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 20px",
              color: isActive ? "#38bdf8" : "#94a3b8",
              background: isActive ? "#1e293b" : "transparent",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
            })}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
          background: "#f8fafc",
          padding: 32,
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
