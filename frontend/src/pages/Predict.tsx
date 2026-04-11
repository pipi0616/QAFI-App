import { useEffect, useState, useRef } from "react";
import { api } from "../api/client";
import { Search, AlertTriangle, CheckCircle, HelpCircle, Bot, Send, User, ExternalLink } from "lucide-react";
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
  clinvar?: {
    found: boolean;
    exact_match: {
      accession: string;
      protein_change: string;
      significance: string;
      review_status: string;
      stars: number;
      traits: string[];
      num_submissions: number;
      url: string;
      last_evaluated: string;
    } | null;
    same_position: any[];
    same_gene_count: number;
  };
  alphamissense?: {
    available: boolean;
    variant: { variant: string; am_score: number; am_class: string; am_class_label: string; am_class_color: string } | null;
    same_position: { variant: string; am_score: number; am_class: string; am_class_label: string; am_class_color: string }[];
    summary: { total: number; pathogenic: number; benign: number; ambiguous: number } | null;
  };
  gnomad?: {
    available: boolean;
    variant: {
      hgvsp: string; rsids: string[]; allele_count: number; allele_number: number;
      allele_freq: number; homozygote_count: number; freq_label: string;
      freq_interpretation: string; freq_color: string;
    } | null;
    same_position: any[];
    gene_missense_count: number;
  };
  literature?: {
    variant_articles: { pmid: string; title: string; authors: string; journal: string; year: string; url: string }[];
    variant_search_count: number;
    gene_articles: { pmid: string; title: string; authors: string; journal: string; year: string; url: string }[];
    gene_search_count: number;
    total_gene_papers: number;
  };
}

const IMPACT_COLORS = { damaging: "#dc2626", moderate: "#ca8a04", benign: "#16a34a" };
const IMPACT_BG = { damaging: "#fef2f2", moderate: "#fefce8", benign: "#f0fdf4" };

type TabKey = "evidence" | "clinvar" | "alphamissense" | "gnomad" | "literature" | "position" | "ai";

const TABS: { key: TabKey; label: string }[] = [
  { key: "evidence", label: "Evidence" },
  { key: "clinvar", label: "ClinVar" },
  { key: "alphamissense", label: "AlphaMissense" },
  { key: "gnomad", label: "gnomAD" },
  { key: "literature", label: "Literature" },
  { key: "position", label: "Position" },
  { key: "ai", label: "AI" },
];

export default function Predict() {
  const [proteins, setProteins] = useState<any[]>([]);
  const [selectedProtein, setSelectedProtein] = useState("Q9Y375");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("evidence");

  // AI Chat state
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getProteins().then((p) => {
      setProteins(p.proteins);
      if (p.proteins.length) setSelectedProtein(p.proteins[0].protein_id);
    });
  }, []);

  useEffect(() => {
    setChatMessages([]);
    setChatInput("");
  }, [result?.variant]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendChat = async (text?: string) => {
    const msg = text ?? chatInput.trim();
    if (!msg || chatLoading) return;
    const userMsg = { role: "user" as const, content: msg };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await api.chat(
        newMessages.map((m) => ({ role: m.role, content: m.content })),
        result,
      );
      setChatMessages([...newMessages, { role: "assistant", content: res.reply }]);
    } catch {
      setChatMessages([
        ...newMessages,
        { role: "assistant", content: "Failed to connect. Make sure ANTHROPIC_API_KEY is set in .env." },
      ]);
    }
    setChatLoading(false);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.lookupVariant(selectedProtein, query.trim());
      setResult(res);
      setActiveTab("evidence");
    } catch {
      setError(`Variant "${query}" not found for ${selectedProtein}. Try format: L117H, M1A, etc.`);
    }
    setLoading(false);
  };

  const scorePercent = result
    ? ((result.score - result.score_range.min) / (result.score_range.max - result.score_range.min)) * 100
    : 0;

  // ClinVar badge for tab
  const clinvarBadge = result?.clinvar?.exact_match
    ? result.clinvar.exact_match.significance.split(" ").map(w => w[0]).join("").toUpperCase()
    : null;

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
                style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, fontFamily: "monospace" }}
              />
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                style={{
                  padding: "10px 24px", borderRadius: 8, border: "none", background: "#3b82f6",
                  color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer",
                  opacity: loading || !query.trim() ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6,
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
          {/* === Classification card (always visible) === */}
          <div style={{ ...card, marginBottom: 0, borderLeft: `5px solid ${result.color}`, borderRadius: "12px 12px 0 0" }}>
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
                    display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px",
                    borderRadius: 8, background: result.color + "12", border: `1px solid ${result.color}40`,
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
              <div style={{ textAlign: "center", minWidth: 150 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>QAFI Score</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: result.color, fontFamily: "monospace" }}>
                  {result.score.toFixed(2)}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  Percentile: {result.percentile.toFixed(0)}%
                </div>
                <div style={{ marginTop: 8, background: "#f1f5f9", borderRadius: 4, height: 8, position: "relative" }}>
                  <div
                    style={{
                      position: "absolute", left: 0, top: 0, height: "100%", width: `${scorePercent}%`,
                      background: "linear-gradient(to right, #16a34a, #ca8a04, #dc2626)", borderRadius: 4,
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

          {/* === Tab bar === */}
          <div
            style={{
              display: "flex", background: "#fff", borderLeft: "1px solid #e2e8f0",
              borderRight: "1px solid #e2e8f0", padding: "0 8px",
            }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "12px 20px",
                  fontSize: 14,
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  color: activeTab === tab.key ? "#0f172a" : "#94a3b8",
                  background: "transparent",
                  border: "none",
                  borderBottom: activeTab === tab.key ? "2px solid #3b82f6" : "2px solid transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {tab.label}
                {/* Status dots */}
                {tab.key === "clinvar" && result.clinvar && (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: result.clinvar.found ? "#10b981" : "#cbd5e1", display: "inline-block" }} />
                )}
                {tab.key === "alphamissense" && result.alphamissense?.variant && (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: result.alphamissense.variant.am_class_color, display: "inline-block" }} />
                )}
                {tab.key === "gnomad" && result.gnomad?.variant && (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: result.gnomad.variant.freq_color, display: "inline-block" }} />
                )}
                {tab.key === "literature" && result.literature && (
                  <span style={{ fontSize: 11, color: "#64748b", fontWeight: 400 }}>
                    {(result.literature.variant_search_count || 0) + (result.literature.gene_search_count || 0)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* === Tab content === */}
          <div style={{ ...card, borderRadius: "0 0 12px 12px", marginBottom: 20, minHeight: 200 }}>

            {/* Evidence tab */}
            {activeTab === "evidence" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.evidence.map((e, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 12, padding: 14,
                      borderRadius: 8, background: IMPACT_BG[e.impact], border: `1px solid ${IMPACT_COLORS[e.impact]}20`,
                    }}
                  >
                    <div
                      style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: IMPACT_COLORS[e.impact], marginTop: 6, flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{e.feature}</span>
                        <span style={{ fontSize: 13, fontFamily: "monospace", color: "#475569" }}>{e.value}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>{e.detail}</div>
                    </div>
                  </div>
                ))}
                {result.evidence.length === 0 && (
                  <p style={{ color: "#94a3b8", fontSize: 14 }}>No feature evidence available for this variant.</p>
                )}
              </div>
            )}

            {/* ClinVar tab */}
            {activeTab === "clinvar" && (
              <div>
                {!result.clinvar || !result.clinvar.found ? (
                  <div style={{ padding: "20px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#475569" }}>Not found in ClinVar</div>
                    <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                      This variant has no ClinVar record.
                      {result.clinvar?.same_gene_count
                        ? ` ${result.clinvar.same_gene_count} other ${result.protein_name} variants are in ClinVar.`
                        : ""}
                    </div>
                  </div>
                ) : (
                  <>
                    {result.clinvar.exact_match && (
                      <div
                        style={{
                          padding: "20px", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 16,
                          background: result.clinvar.exact_match.significance.toLowerCase().includes("pathogenic")
                            ? "#fef2f2"
                            : result.clinvar.exact_match.significance.toLowerCase().includes("benign")
                              ? "#f0fdf4" : "#fefce8",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                              {result.clinvar.exact_match.significance}
                            </div>
                            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                              {result.clinvar.exact_match.review_status}
                            </div>
                            {result.clinvar.exact_match.traits.length > 0 && (
                              <div style={{ fontSize: 14, color: "#475569", marginTop: 8 }}>
                                Condition: {result.clinvar.exact_match.traits.join(", ")}
                              </div>
                            )}
                            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
                              {result.clinvar.exact_match.num_submissions} submission(s)
                              {result.clinvar.exact_match.last_evaluated &&
                                ` · Last evaluated: ${result.clinvar.exact_match.last_evaluated.split(" ")[0]}`}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 22, letterSpacing: 2 }}>
                              {"★".repeat(result.clinvar.exact_match.stars)}
                              {"☆".repeat(4 - result.clinvar.exact_match.stars)}
                            </div>
                            <a
                              href={result.clinvar.exact_match.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 13, color: "#3b82f6", display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", marginTop: 4 }}
                            >
                              View in ClinVar <ExternalLink size={12} />
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                    {result.clinvar.same_position.length > 0 && (
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginBottom: 10 }}>
                          Other variants at this position
                        </div>
                        {result.clinvar.same_position.map((v, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
                            <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 14 }}>{v.protein_change}</span>
                            <span style={{ fontSize: 13, color: "#64748b" }}>{v.significance || "No classification"}</span>
                            <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#3b82f6", display: "flex", alignItems: "center", gap: 2 }}>
                              View <ExternalLink size={11} />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                    {result.clinvar.same_gene_count > 0 && (
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 12 }}>
                        {result.clinvar.same_gene_count} total {result.protein_name} variants in ClinVar
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* AlphaMissense tab */}
            {activeTab === "alphamissense" && (
              <div>
                {!result.alphamissense?.available ? (
                  <div style={{ padding: 20, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#475569" }}>AlphaMissense data not available</div>
                    <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                      No AlphaMissense predictions found for this protein.
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Main prediction */}
                    {result.alphamissense.variant && (
                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: 20, borderRadius: 8, marginBottom: 16,
                        background: result.alphamissense.variant.am_class === "LPath" ? "#fef2f2"
                          : result.alphamissense.variant.am_class === "LBen" ? "#f0fdf4" : "#fefce8",
                        border: `1px solid ${result.alphamissense.variant.am_class_color}30`,
                      }}>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: result.alphamissense.variant.am_class_color }}>
                            {result.alphamissense.variant.am_class_label}
                          </div>
                          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                            AlphaMissense prediction (Google DeepMind)
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "monospace", color: result.alphamissense.variant.am_class_color }}>
                            {result.alphamissense.variant.am_score.toFixed(2)}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>
                            0 = benign · 1 = pathogenic
                          </div>
                        </div>
                      </div>
                    )}

                    {/* QAFI vs AlphaMissense comparison */}
                    {result.alphamissense.variant && (
                      <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>QAFI vs AlphaMissense</div>
                        <div style={{ display: "flex", gap: 24 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>QAFI</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: result.color }}>{result.classification}</div>
                            <div style={{ fontSize: 13, fontFamily: "monospace" }}>Score: {result.score.toFixed(4)}</div>
                          </div>
                          <div style={{ width: 1, background: "#e2e8f0" }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>AlphaMissense</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: result.alphamissense.variant.am_class_color }}>
                              {result.alphamissense.variant.am_class_label}
                            </div>
                            <div style={{ fontSize: 13, fontFamily: "monospace" }}>Score: {result.alphamissense.variant.am_score.toFixed(4)}</div>
                          </div>
                        </div>
                        {result.classification !== result.alphamissense.variant.am_class_label && (
                          <div style={{ marginTop: 10, padding: "8px 12px", background: "#fefce8", borderRadius: 6, fontSize: 13, color: "#854d0e" }}>
                            Note: QAFI and AlphaMissense disagree on this variant. Consider additional evidence.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Same position variants */}
                    {result.alphamissense.same_position.length > 0 && (
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginBottom: 10 }}>
                          All substitutions at position {result.position}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {result.alphamissense.same_position.map((v) => (
                            <div
                              key={v.variant}
                              style={{
                                padding: "6px 12px", borderRadius: 6, fontSize: 13, fontFamily: "monospace",
                                background: v.variant === result.variant ? `${v.am_class_color}20` : "#f8fafc",
                                border: v.variant === result.variant ? `2px solid ${v.am_class_color}` : "1px solid #e2e8f0",
                                fontWeight: v.variant === result.variant ? 700 : 400,
                              }}
                            >
                              <span style={{ color: v.am_class_color }}>{v.am_score.toFixed(2)}</span>
                              {" "}{v.variant.slice(-1)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Summary */}
                    {result.alphamissense.summary && (
                      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
                        {[
                          { label: "Likely Pathogenic", count: result.alphamissense.summary.pathogenic, color: "#dc2626" },
                          { label: "Ambiguous", count: result.alphamissense.summary.ambiguous, color: "#ca8a04" },
                          { label: "Likely Benign", count: result.alphamissense.summary.benign, color: "#16a34a" },
                        ].map((s) => (
                          <div key={s.label} style={{ flex: 1, padding: 10, background: "#f8fafc", borderRadius: 6, textAlign: "center" }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.count}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* gnomAD tab */}
            {activeTab === "gnomad" && (
              <div>
                {!result.gnomad?.available ? (
                  <div style={{ padding: 20, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#475569" }}>gnomAD data not available</div>
                  </div>
                ) : result.gnomad.variant && (
                  <>
                    {/* Main frequency card */}
                    <div style={{
                      padding: 20, borderRadius: 8, marginBottom: 16,
                      background: result.gnomad.variant.allele_freq === 0 ? "#fef2f2" : "#f8fafc",
                      border: `1px solid ${result.gnomad.variant.freq_color}30`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: result.gnomad.variant.freq_color }}>
                            {result.gnomad.variant.freq_label}
                          </div>
                          <div style={{ fontSize: 14, color: "#475569", marginTop: 6 }}>
                            {result.gnomad.variant.freq_interpretation}
                          </div>
                          {result.gnomad.variant.rsids.length > 0 && (
                            <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>
                              rsID: {result.gnomad.variant.rsids.map((rs) => (
                                <a key={rs} href={`https://www.ncbi.nlm.nih.gov/snp/${rs}`} target="_blank" rel="noopener noreferrer"
                                  style={{ color: "#3b82f6", marginRight: 8 }}>{rs}</a>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "monospace", color: result.gnomad.variant.freq_color }}>
                            {result.gnomad.variant.allele_freq === 0
                              ? "0"
                              : result.gnomad.variant.allele_freq < 0.001
                                ? result.gnomad.variant.allele_freq.toExponential(2)
                                : result.gnomad.variant.allele_freq.toFixed(4)}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>Allele Frequency</div>
                        </div>
                      </div>
                    </div>

                    {/* Counts */}
                    <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                      {[
                        { label: "Allele Count", value: result.gnomad.variant.allele_count.toLocaleString() },
                        { label: "Allele Number", value: result.gnomad.variant.allele_number ? result.gnomad.variant.allele_number.toLocaleString() : "—" },
                        { label: "Homozygotes", value: result.gnomad.variant.homozygote_count.toLocaleString() },
                        { label: "Gene Missense Variants", value: result.gnomad.gene_missense_count.toLocaleString() },
                      ].map((s) => (
                        <div key={s.label} style={{ flex: 1, padding: 12, background: "#f8fafc", borderRadius: 8, textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{s.value}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Clinical guideline */}
                    <div style={{ padding: 14, background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe", fontSize: 13, color: "#1e40af" }}>
                      <strong>ACMG Guideline:</strong> Variants with AF &gt; 5% in any population are classified as BA1 (standalone benign).
                      Variants absent from gnomAD support PM2 (moderate pathogenic evidence).
                    </div>

                    {/* Same position variants */}
                    {result.gnomad.same_position.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginBottom: 10 }}>
                          Other variants at this position in gnomAD
                        </div>
                        {result.gnomad.same_position.map((v, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                            <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{v.hgvsp}</span>
                            <span style={{ color: v.freq_color }}>{v.freq_label} (AF={v.allele_freq === 0 ? "0" : v.allele_freq.toExponential(2)})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Literature tab */}
            {activeTab === "literature" && (
              <div>
                {!result.literature ? (
                  <div style={{ padding: 20, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#475569" }}>Literature search unavailable</div>
                  </div>
                ) : (
                  <>
                    {/* Variant-specific articles */}
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>
                        Variant-Specific Publications
                      </div>
                      <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
                        Papers mentioning {result.variant} specifically
                        ({result.literature.variant_search_count} found)
                      </div>
                      {result.literature.variant_articles.length > 0 ? (
                        result.literature.variant_articles.map((a) => (
                          <ArticleCard key={a.pmid} article={a} />
                        ))
                      ) : (
                        <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, color: "#64748b" }}>
                          No publications found for this specific variant.
                          This is a novel or unreported variant.
                        </div>
                      )}
                    </div>

                    {/* Gene clinical articles */}
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>
                        {result.protein_name} Clinical Publications
                      </div>
                      <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
                        Papers about {result.protein_name} mutations and clinical significance
                        ({result.literature.gene_search_count} found · {result.literature.total_gene_papers} total gene papers)
                      </div>
                      {result.literature.gene_articles.length > 0 ? (
                        result.literature.gene_articles.map((a) => (
                          <ArticleCard key={a.pmid} article={a} />
                        ))
                      ) : (
                        <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, color: "#64748b" }}>
                          No clinical publications found for this gene.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Position tab */}
            {activeTab === "position" && (
              <div>
                <div style={{ fontSize: 14, color: "#475569", marginBottom: 16 }}>
                  {result.position_context.total_variants} possible substitutions at position {result.position} &middot;
                  This variant ranks <strong>#{result.position_context.rank}</strong> of {result.position_context.total_variants}
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={result.position_context.variants} margin={{ left: 10, right: 10 }}>
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
                    <ReferenceLine y={result.score} stroke={result.color} strokeDasharray="4 4" />
                    <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                      {result.position_context.variants.map((v, i) => (
                        <Cell key={i} fill={v.variant === result.variant ? result.color : "#cbd5e1"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
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
                        <td style={tdStyle}>
                          <span style={{ fontFamily: "monospace" }}>{v.variant}</span>
                          {v.variant === result.variant && <span style={{ color: result.color, fontSize: 12, marginLeft: 6 }}>current</span>}
                        </td>
                        <td style={tdStyle}>{result.wt} → {v.mut}</td>
                        <td style={{ ...tdStyle, fontFamily: "monospace" }}>{v.score.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* AI Assistant tab */}
            {activeTab === "ai" && (
              <div>
                {/* Quick prompts */}
                {chatMessages.length === 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                    {[
                      `Why is ${result.variant} classified as ${result.classification}?`,
                      "Generate a clinical report for this variant",
                      "What is the clinical significance of this position?",
                      "Compare with the most damaging substitution at this position",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => sendChat(prompt)}
                        style={{
                          padding: "8px 14px", borderRadius: 20, border: "1px solid #e2e8f0",
                          background: "#f8fafc", fontSize: 13, color: "#475569", cursor: "pointer", textAlign: "left",
                        }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}

                {/* Chat messages */}
                {chatMessages.length > 0 && (
                  <div style={{ maxHeight: 400, overflow: "auto", marginBottom: 12, padding: "0 4px" }}>
                    {chatMessages.map((msg, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "flex-start" }}>
                        <div
                          style={{
                            width: 28, height: 28, borderRadius: 6,
                            background: msg.role === "user" ? "#3b82f6" : "#0f172a",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}
                        >
                          {msg.role === "user" ? <User size={14} color="#fff" /> : <Bot size={14} color="#38bdf8" />}
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.7, color: "#1e293b", whiteSpace: "pre-wrap", flex: 1 }}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", color: "#94a3b8" }}>
                        <Bot size={18} /> <span style={{ fontSize: 14 }}>Thinking...</span>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Input */}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendChat()}
                    placeholder="Ask about this variant..."
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" }}
                  />
                  <button
                    onClick={() => sendChat()}
                    disabled={chatLoading || !chatInput.trim()}
                    style={{
                      padding: "10px 16px", borderRadius: 8, border: "none", background: "#0f172a",
                      color: "#fff", cursor: "pointer", opacity: chatLoading || !chatInput.trim() ? 0.4 : 1,
                    }}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
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
            Type a variant name like <strong style={{ fontFamily: "monospace" }}>L117H</strong> or{" "}
            <strong style={{ fontFamily: "monospace" }}>M1A</strong> to see its predicted functional impact,
            classification, and supporting evidence.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {["M1A", "L117H", "R230W", "G50D"].map((ex) => (
              <button
                key={ex}
                onClick={() => setQuery(ex)}
                style={{
                  padding: "6px 14px", borderRadius: 20, border: "1px solid #e2e8f0",
                  background: "#f8fafc", fontSize: 13, fontFamily: "monospace", cursor: "pointer", color: "#475569",
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

function ArticleCard({ article }: { article: { pmid: string; title: string; authors: string; journal: string; year: string; url: string } }) {
  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9" }}>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", textDecoration: "none", lineHeight: 1.4, display: "block" }}
      >
        {article.title}
      </a>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
        {article.authors} · <em>{article.journal}</em> · {article.year}
        <span style={{ marginLeft: 8, color: "#3b82f6" }}>PMID:{article.pmid}</span>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "8px 12px", fontSize: 12, color: "#64748b", fontWeight: 600,
};
const tdStyle: React.CSSProperties = {
  padding: "8px 12px", fontSize: 13, color: "#1e293b",
};
