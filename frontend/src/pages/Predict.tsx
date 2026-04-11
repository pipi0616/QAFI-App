import { useEffect, useState } from "react";
import { api } from "../api/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid,
} from "recharts";
import { Play, Download, Search } from "lucide-react";

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  border: "1px solid #e2e8f0",
};

const METHODS_INFO: Record<string, { label: string; desc: string }> = {
  qafi2: { label: "QAFI2", desc: "Single-stage XGBoost ensemble" },
  qafisplit1: { label: "QAFI Split1", desc: "Two-stage: position feature + XGBoost" },
  qafisplit2: { label: "QAFI Split2", desc: "Two-stage: residual prediction" },
  qafisplit3: { label: "QAFI Split3 (Recommended)", desc: "Two-stage + similarity-weighted fusion, best generalization" },
};

interface Variant {
  variant: string;
  position: number;
  wt: string;
  mut: string;
  score: number;
}

interface PredictionResult {
  method: string;
  protein_id: string;
  predictions: {
    total_variants: number;
    variants: Variant[];
    stats: { mean: number; std: number; min: number; max: number; median: number };
    distribution: { bin_start: number; bin_end: number; count: number }[];
  };
}

export default function Predict() {
  const [proteins, setProteins] = useState<any[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [selectedProtein, setSelectedProtein] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("qafisplit3");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"position" | "score">("position");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    Promise.all([api.getProteins(), api.getMethods()]).then(([p, m]) => {
      setProteins(p.proteins);
      if (m.qafi) setMethods(m.qafi);
      if (p.proteins.length) setSelectedProtein(p.proteins[0].protein_id);
    });
  }, []);

  const handleRun = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await api.runPrediction({
        protein_id: selectedProtein,
        method: selectedMethod,
        model_type: "qafi",
      });
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    }
    setRunning(false);
  };

  // Also try loading cached results on protein/method change
  useEffect(() => {
    if (!selectedProtein || !selectedMethod) return;
    fetch(`http://localhost:8000/api/predict/results/${selectedMethod}/${selectedProtein}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setResult(data);
      })
      .catch(() => {});
  }, [selectedProtein, selectedMethod]);

  // Filter and sort variants
  const variants = result?.predictions?.variants ?? [];
  const filtered = variants
    .filter((v) => {
      if (!search) return true;
      const s = search.toUpperCase();
      return v.variant.toUpperCase().includes(s) || String(v.position).includes(s);
    })
    .sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortBy === "position") return (a.position - b.position) * mul;
      return (a.score - b.score) * mul;
    });

  const stats = result?.predictions?.stats;
  const distribution = result?.predictions?.distribution;

  const handleSort = (col: "position" | "score") => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else { setSortBy(col); setSortAsc(col === "position"); }
  };

  const downloadCSV = () => {
    if (!variants.length) return;
    const header = "variant,position,wt,mut,score\n";
    const rows = variants.map((v) => `${v.variant},${v.position},${v.wt},${v.mut},${v.score}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedProtein}_${selectedMethod}_predictions.csv`;
    a.click();
  };

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
        Variant Prediction
      </h2>
      <p style={{ color: "#64748b", marginBottom: 24 }}>
        Predict functional impact of protein variants using QAFI cross-protein generalization models
      </p>

      {/* Config panel */}
      <div style={{ ...card, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
          {/* Protein */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
              Protein
            </label>
            <select
              value={selectedProtein}
              onChange={(e) => setSelectedProtein(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, minWidth: 140 }}
            >
              {proteins.map((p) => (
                <option key={p.protein_id} value={p.protein_id}>{p.protein_id}</option>
              ))}
            </select>
          </div>

          {/* Method */}
          <div style={{ flex: 1, minWidth: 300 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
              QAFI Method
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {methods.map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMethod(m)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: selectedMethod === m ? "2px solid #3b82f6" : "1px solid #cbd5e1",
                    background: selectedMethod === m ? "#eff6ff" : "#fff",
                    color: selectedMethod === m ? "#1d4ed8" : "#64748b",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {METHODS_INFO[m]?.label ?? m}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
              {METHODS_INFO[selectedMethod]?.desc ?? ""}
            </p>
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              padding: "10px 28px",
              background: running ? "#94a3b8" : "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: running ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Play size={16} />
            {running ? "Running..." : "Run Prediction"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ ...card, marginBottom: 24, borderColor: "#fca5a5", background: "#fef2f2" }}>
          <p style={{ color: "#991b1b", fontSize: 14 }}>Error: {error}</p>
        </div>
      )}

      {/* Results */}
      {result?.predictions && (
        <>
          {/* Stats + Distribution */}
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, marginBottom: 24 }}>
            {/* Summary stats */}
            <div style={card}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Summary</h3>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#0f172a" }}>
                {result.predictions.total_variants}
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>total variants predicted</div>
              {stats && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { label: "Mean", value: stats.mean },
                    { label: "Median", value: stats.median },
                    { label: "Std Dev", value: stats.std },
                    { label: "Min", value: stats.min },
                    { label: "Max", value: stats.max },
                  ].map((s) => (
                    <div key={s.label} style={{ background: "#f8fafc", borderRadius: 6, padding: 8 }}>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{s.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Distribution chart */}
            {distribution && (
              <div style={card}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Score Distribution</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="bin_start"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => v.toFixed(1)}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8, fontSize: 12 }}>
                            <div>Score: {d.bin_start.toFixed(2)} ~ {d.bin_end.toFixed(2)}</div>
                            <div style={{ fontWeight: 600 }}>{d.count} variants</div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {distribution.map((d, i) => {
                        const mid = (d.bin_start + d.bin_end) / 2;
                        // Color: negative=blue (benign), positive=red (damaging)
                        const color = mid < 0 ? "#3b82f6" : mid > 0.5 ? "#ef4444" : "#f59e0b";
                        return <Cell key={i} fill={color} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: "#3b82f6" }}>Low impact</span>
                  <span style={{ fontSize: 11, color: "#f59e0b" }}>Moderate</span>
                  <span style={{ fontSize: 11, color: "#ef4444" }}>High impact</span>
                </div>
              </div>
            )}
          </div>

          {/* Variant table */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Variant Predictions</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#94a3b8" }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search variant or position..."
                    style={{
                      padding: "7px 12px 7px 30px",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      fontSize: 13,
                      width: 220,
                    }}
                  />
                </div>
                <button
                  onClick={downloadCSV}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Download size={14} /> CSV
                </button>
              </div>
            </div>

            <div style={{ maxHeight: 500, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "#fff" }}>
                  <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ ...thStyle, width: 100 }}>Variant</th>
                    <th
                      style={{ ...thStyle, cursor: "pointer", width: 80 }}
                      onClick={() => handleSort("position")}
                    >
                      Position {sortBy === "position" ? (sortAsc ? "^" : "v") : ""}
                    </th>
                    <th style={{ ...thStyle, width: 50 }}>WT</th>
                    <th style={{ ...thStyle, width: 50 }}>MUT</th>
                    <th
                      style={{ ...thStyle, cursor: "pointer" }}
                      onClick={() => handleSort("score")}
                    >
                      Score {sortBy === "score" ? (sortAsc ? "^" : "v") : ""}
                    </th>
                    <th style={{ ...thStyle, width: 200 }}>Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((v) => {
                    const absScore = Math.abs(v.score);
                    const impact = absScore > 0.5 ? "High" : absScore > 0.2 ? "Moderate" : "Low";
                    const impactColor = impact === "High" ? "#ef4444" : impact === "Moderate" ? "#f59e0b" : "#3b82f6";
                    const barWidth = Math.min(absScore * 100, 100);
                    return (
                      <tr key={v.variant} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={tdStyle}>
                          <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{v.variant}</span>
                        </td>
                        <td style={tdStyle}>{v.position}</td>
                        <td style={tdStyle}>{v.wt}</td>
                        <td style={tdStyle}>{v.mut}</td>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 600 }}>
                          {v.score.toFixed(4)}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 100, height: 6, background: "#f1f5f9", borderRadius: 3 }}>
                              <div
                                style={{
                                  width: `${barWidth}%`,
                                  height: "100%",
                                  background: impactColor,
                                  borderRadius: 3,
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 12, color: impactColor, fontWeight: 600, minWidth: 60 }}>
                              {impact}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length > 500 && (
                <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 12 }}>
                  Showing 500 of {filtered.length} variants. Use search to filter.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {!result && !running && !error && (
        <div style={{ ...card, textAlign: "center", padding: 60, color: "#94a3b8" }}>
          <p style={{ fontSize: 16 }}>Select a protein and QAFI method, then click Run Prediction.</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            Recommended: <strong>QAFI Split3</strong> — best cross-protein generalization with similarity-weighted ensemble.
          </p>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontSize: 12,
  color: "#64748b",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  color: "#1e293b",
};
