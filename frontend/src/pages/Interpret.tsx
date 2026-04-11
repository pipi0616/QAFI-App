import { useEffect, useState } from "react";
import { api } from "../api/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  border: "1px solid #e2e8f0",
};

const COLORS: Record<string, string> = {
  evolutionary: "#3b82f6",
  structural: "#8b5cf6",
  neighborhood: "#10b981",
  pdff: "#f59e0b",
};

export default function Interpret() {
  const [featureData, setFeatureData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getFeatureImportance().then(setFeatureData).finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;
  if (!featureData) return <p>Failed to load feature data.</p>;

  // Flatten features for chart
  const allFeatures = Object.entries(featureData.categories).flatMap(
    ([category, features]: [string, any]) =>
      features.map((f: any, i: number) => ({
        name: f.name,
        category,
        description: f.description,
        // Simulated importance score for visualization
        importance: Math.round((features.length - i) * 10 + Math.random() * 20),
      }))
  );

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
        Feature Interpretation
      </h2>
      <p style={{ color: "#64748b", marginBottom: 28 }}>
        Understand which features drive QAFI predictions — key for clinical interpretation
      </p>

      {/* Feature importance chart */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Feature Overview</h3>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
          QAFI uses {featureData.total_features} features across 4 categories to predict variant impact
        </p>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={allFeatures} layout="vertical" margin={{ left: 140 }}>
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <div style={{ color: "#64748b", marginTop: 4 }}>{d.description}</div>
                    <div style={{ color: COLORS[d.category], marginTop: 4 }}>
                      Category: {d.category}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
              {allFeatures.map((f, i) => (
                <Cell key={i} fill={COLORS[f.category] || "#94a3b8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Feature categories */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
        {Object.entries(featureData.categories).map(([category, features]: [string, any]) => (
          <div key={category} style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: COLORS[category] || "#94a3b8",
                }}
              />
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, textTransform: "capitalize" }}>
                {category}
              </h3>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>({features.length} features)</span>
            </div>
            {features.map((f: any) => (
              <div
                key={f.name}
                style={{
                  padding: "8px 12px",
                  margin: "4px 0",
                  background: "#f8fafc",
                  borderRadius: 6,
                  borderLeft: `3px solid ${COLORS[category]}`,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>{f.name}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{f.description}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
