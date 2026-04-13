import { NavLink, Outlet } from "react-router-dom";
import { Activity, BarChart3, Brain, Zap, Home, Globe } from "lucide-react";
import { useLang, t } from "../i18n";

export default function Layout() {
  const { lang, setLang } = useLang();

  const navItems = [
    { to: "/", icon: Home, label: t("nav_home", lang) },
    { to: "/predict", icon: BarChart3, label: t("nav_predict", lang) },
    { to: "/interpret", icon: Brain, label: t("nav_interpret", lang) },
    { to: "/agent", icon: Zap, label: t("nav_agent", lang) },
  ];

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <nav
        style={{
          width: 220, background: "#0f172a", color: "#e2e8f0",
          display: "flex", flexDirection: "column", padding: "20px 0", flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{ padding: "0 20px 24px", borderBottom: "1px solid #1e293b", marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#38bdf8" }}>QAFI</h1>
          <p style={{ fontSize: 11, margin: "4px 0 0", color: "#94a3b8" }}>
            {lang === "en" ? "Variant Impact Prediction" : "变异影响预测"}
          </p>
        </div>

        {/* Nav items */}
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 20px",
              color: isActive ? "#38bdf8" : "#94a3b8",
              background: isActive ? "#1e293b" : "transparent",
              textDecoration: "none", fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              borderLeft: isActive ? "3px solid #38bdf8" : "3px solid transparent",
            })}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Language switch at bottom of sidebar */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: "#64748b", fontSize: 12 }}>
            <Globe size={14} />
            Language
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setLang("en")}
              style={{
                flex: 1, padding: "6px 0", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 600,
                background: lang === "en" ? "#38bdf8" : "#1e293b",
                color: lang === "en" ? "#0f172a" : "#64748b",
              }}
            >
              EN
            </button>
            <button
              onClick={() => setLang("zh")}
              style={{
                flex: 1, padding: "6px 0", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 600,
                background: lang === "zh" ? "#38bdf8" : "#1e293b",
                color: lang === "zh" ? "#0f172a" : "#64748b",
              }}
            >
              中文
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto", background: "#f8fafc" }}>
        <Outlet />
      </main>
    </div>
  );
}
