import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Activity, Database, FlaskConical, Dna } from "lucide-react";

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  border: "1px solid #e2e8f0",
};

export default function Dashboard() {
  const [proteins, setProteins] = useState<any[]>([]);
  const [methods, setMethods] = useState<{ qafi: string[] }>({ qafi: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getProteins(), api.getMethods()])
      .then(([p, m]) => {
        setProteins(p.proteins);
        setMethods(m);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;

  const stats = [
    { icon: Dna, label: "Proteins Available", value: proteins.length, color: "#3b82f6" },
    { icon: Activity, label: "QAFI Methods", value: methods.qafi?.length ?? 0, color: "#10b981" },
    { icon: Database, label: "Feature Blocks", value: 23, color: "#f59e0b" },
    { icon: FlaskConical, label: "Total Features", value: 27, color: "#8b5cf6" },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
        Dashboard
      </h2>
      <p style={{ color: "#64748b", marginBottom: 28 }}>
        Quantitative Assessment of Functional Impact — Protein Variant Prediction Platform
      </p>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 32 }}>
        {stats.map((s) => (
          <div key={s.label} style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: `${s.color}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <s.icon size={22} color={s.color} />
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Protein List */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Available Proteins</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
              <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 13, color: "#64748b" }}>Protein ID</th>
              <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 13, color: "#64748b" }}>Data Files</th>
              <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 13, color: "#64748b" }}>Structure</th>
            </tr>
          </thead>
          <tbody>
            {proteins.map((p) => (
              <tr key={p.protein_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 12px", fontWeight: 600, color: "#3b82f6" }}>{p.protein_id}</td>
                <td style={{ padding: "10px 12px", fontSize: 13, color: "#64748b" }}>
                  {p.csv_files?.length ?? 0} CSV files
                </td>
                <td style={{ padding: "10px 12px" }}>
                  {p.has_structure ? (
                    <span style={{ color: "#10b981", fontSize: 13 }}>AlphaFold available</span>
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: 13 }}>Not available</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* QAFI Methods */}
      <div style={{ ...cardStyle, marginTop: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>QAFI Prediction Methods</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {(methods.qafi ?? []).map((m) => (
            <div
              key={m}
              style={{
                padding: "12px 16px",
                background: m === "qafisplit3" ? "#f0fdf4" : "#f8fafc",
                borderRadius: 8,
                border: m === "qafisplit3" ? "1px solid #86efac" : "1px solid #e2e8f0",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "monospace" }}>
                {m} {m === "qafisplit3" && <span style={{ fontSize: 11, color: "#16a34a" }}>Recommended</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
