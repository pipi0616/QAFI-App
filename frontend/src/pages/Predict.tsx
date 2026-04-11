import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Search, AlertTriangle, CheckCircle, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine,
} from "recharts";

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  border: "1px solid #e2e8f0",
};

interface Evidence {
  feature: string;
  value: string;
  detail: string;
  impact: "damaging" | "moderate" | "benign";
}

interface PositionVariant {
  variant: string;
  mut: string;
  score: number;
}

interface LookupResult {
  variant: string;
  protein_id: string;
  protein_name: string;
  position: number;
  wt: string;
  mut: string;
  score: number;
  score_range: { min: number; max: number };
  percentile: number;
  classification: string;
  confidence: string;
  color: string;
  method: string;
  evidence: Evidence[];
  position_context: {
    total_variants: number;
    mean_score: number;
    rank: number;
    variants: PositionVariant[];
  };
}

const IMPACT_COLORS = { damaging: "#dc2626", moderate: "#ca8a04", benign: "#16a34a" };
const IMPACT_BG = { damaging: "#fef2f2", moderate: "#fefce8", benign: "#f0fdf4" };

export default function Predict() {
  const [proteins, setProteins] = useState<any[]>([]);
  const [selectedProtein, setSelectedProtein] = useState("Q9Y375");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState("");
  const [showAllPos, setShowAllPos] = useState(false);

  useEffect(() => {
    api.getProteins().then((p) => {
      setProteins(p.proteins);
      if (p.proteins.length) setSelectedProtein(p.proteins[0].protein_id);
    });
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.lookupVariant(selectedProtein, query.trim());
      setResult(res);
    } catch (e: any) {
      setError(`Variant "${query}" not found for ${selectedProtein}. Try format: L117H, M1A, etc.`);
    }
    setLoading(false);
  };

  const scorePercent = result
    ? ((result.score - result.score_range.min) / (result.score_range.max - result.score_range.min)) * 100
    : 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
        Variant Lookup
      </h2>
      <p style={{ color: "#64748b", marginBottom: 24, fontSize: 15 }}>
        Enter a variant to assess its predicted functional impact
      </p>

      {/* Search bar */}
      <div style={{ ...card, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
              Protein
            </label>
            <select
              value={selectedProtein}
              onChange={(e) => { setSelectedProtein(e.target.value); setResult(null); }}
              style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
            >
              {proteins.map((p) => (
                <option key={p.protein_id} value={p.protein_id}>{p.protein_id}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
              Variant
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="e.g. L117H, M1A, R230W..."
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 15,
                  fontFamily: "monospace",
                }}
              />
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: loading || !query.trim() ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Search size={18} />
                {loading ? "Searching..." : "Look Up"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ ...card, borderColor: "#fca5a5", background: "#fef2f2", marginBottom: 24 }}>
          <p style={{ color: "#991b1b", fontSize: 14 }}>{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <>
          {/* Classification card */}
          <div style={{ ...card, marginBottom: 20, borderLeft: `5px solid ${result.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
                  {result.protein_name} ({result.protein_id}) &middot; Position {result.position}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "monospace", color: "#0f172a", marginBottom: 8 }}>
                  p.{result.wt}{result.position}{result.mut}
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 20px",
                    borderRadius: 8,
                    background: result.color + "12",
                    border: `1px solid ${result.color}40`,
                  }}
                >
                  {result.classification.includes("Pathogenic") ? (
                    <AlertTriangle size={20} color={result.color} />
                  ) : result.classification.includes("Benign") ? (
                    <CheckCircle size={20} color={result.color} />
                  ) : (
                    <HelpCircle size={20} color={result.color} />
                  )}
                  <span style={{ fontSize: 18, fontWeight: 700, color: result.color }}>
                    {result.classification}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>
                  Confidence: {result.confidence} &middot; Method: {result.method}
                </div>
              </div>

              {/* Score gauge */}
              <div style={{ textAlign: "center", minWidth: 160 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>QAFI Score</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: result.color, fontFamily: "monospace" }}>
                  {result.score.toFixed(2)}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  Percentile: {result.percentile.toFixed(0)}%
                </div>
                {/* Score bar */}
                <div style={{ marginTop: 8, background: "#f1f5f9", borderRadius: 4, height: 8, position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      height: "100%",
                      width: `${scorePercent}%`,
                      background: `linear-gradient(to right, #16a34a, #ca8a04, #dc2626)`,
                      borderRadius: 4,
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                  <span>{result.score_range.min.toFixed(2)}</span>
                  <span>{result.score_range.max.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Evidence */}
          <div style={{ ...card, marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Evidence</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {result.evidence.map((e, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: 14,
                    borderRadius: 8,
                    background: IMPACT_BG[e.impact],
                    border: `1px solid ${IMPACT_COLORS[e.impact]}20`,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: IMPACT_COLORS[e.impact],
                      marginTop: 6,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                        {e.feature}
                      </span>
                      <span style={{ fontSize: 13, fontFamily: "monospace", color: "#475569" }}>
                        {e.value}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>
                      {e.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Position context */}
          <div style={{ ...card }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              onClick={() => setShowAllPos(!showAllPos)}
            >
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                  Other Substitutions at Position {result.position}
                </h3>
                <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
                  {result.position_context.total_variants} possible substitutions &middot;
                  This variant ranks #{result.position_context.rank} of {result.position_context.total_variants}
                </p>
              </div>
              {showAllPos ? <ChevronUp size={20} color="#64748b" /> : <ChevronDown size={20} color="#64748b" />}
            </div>

            {/* Always show the bar chart */}
            <div style={{ marginTop: 16 }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={result.position_context.variants}
                  margin={{ left: 10, right: 10 }}
                >
                  <XAxis dataKey="mut" tick={{ fontSize: 12, fontFamily: "monospace" }} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8, fontSize: 13 }}>
                          <div style={{ fontWeight: 600 }}>{d.variant}</div>
                          <div>Score: {d.score.toFixed(4)}</div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={result.score} stroke={result.color} strokeDasharray="4 4" label="" />
                  <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                    {result.position_context.variants.map((v, i) => (
                      <Cell
                        key={i}
                        fill={v.variant === result.variant ? result.color : "#cbd5e1"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Expandable table */}
            {showAllPos && (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                    <th style={thStyle}>Variant</th>
                    <th style={thStyle}>Substitution</th>
                    <th style={thStyle}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {result.position_context.variants.map((v) => (
                    <tr
                      key={v.variant}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        background: v.variant === result.variant ? `${result.color}08` : "transparent",
                        fontWeight: v.variant === result.variant ? 700 : 400,
                      }}
                    >
                      <td style={tdStyle}>{v.variant} {v.variant === result.variant && " <--"}</td>
                      <td style={tdStyle}>{result.wt} &rarr; {v.mut}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace" }}>{v.score.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!result && !error && !loading && (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px" }}>
          <Search size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
          <h3 style={{ fontSize: 18, fontWeight: 600, color: "#475569", marginBottom: 8 }}>
            Enter a variant to begin
          </h3>
          <p style={{ fontSize: 14, color: "#94a3b8", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
            Type a variant name like <strong style={{ fontFamily: "monospace" }}>L117H</strong> or <strong style={{ fontFamily: "monospace" }}>M1A</strong> to
            see its predicted functional impact, classification, and supporting evidence.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {["M1A", "L117H", "R230W", "G50D"].map((ex) => (
              <button
                key={ex}
                onClick={() => { setQuery(ex); }}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  fontSize: 13,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  color: "#475569",
                }}
              >
                {ex}
              </button>
            ))}
          </div>
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
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  color: "#1e293b",
};
