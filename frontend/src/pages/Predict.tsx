import { useEffect, useState, useRef } from "react";
import { api } from "../api/client";
import { Search, AlertTriangle, CheckCircle, HelpCircle, Bot, Send, User, ExternalLink, Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 12, padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0",
};

// ============ Types ============

interface Evidence { feature: string; value: string; detail: string; impact: "damaging" | "moderate" | "benign"; }
interface PositionVariant { variant: string; mut: string; score: number; }

interface Assessment {
  classification: string; confidence: string; summary: string;
  evidence_for_pathogenic: string[]; evidence_for_benign: string[];
  evidence_uncertain: string[]; acmg_criteria: string[];
  recommendation: string; report: string;
}

interface LookupResult {
  variant: string; protein_id: string; protein_name: string;
  position: number; wt: string; mut: string;
  score: number; score_range: { min: number; max: number };
  percentile: number; classification: string; confidence: string; color: string; method: string;
  evidence: Evidence[];
  position_context: { total_variants: number; mean_score: number; rank: number; variants: PositionVariant[]; };
  clinvar?: any; alphamissense?: any; gnomad?: any; literature?: any;
}

const IC = { damaging: "#dc2626", moderate: "#ca8a04", benign: "#16a34a" };
const IB = { damaging: "#fef2f2", moderate: "#fefce8", benign: "#f0fdf4" };

type TabKey = "evidence" | "clinvar" | "alphamissense" | "gnomad" | "literature" | "position";
const TABS: { key: TabKey; label: string }[] = [
  { key: "evidence", label: "QAFI Features" },
  { key: "clinvar", label: "ClinVar" },
  { key: "alphamissense", label: "AlphaMissense" },
  { key: "gnomad", label: "gnomAD" },
  { key: "literature", label: "Literature" },
  { key: "position", label: "Position" },
];

// ============ Component ============

export default function Predict() {
  const [proteins, setProteins] = useState<any[]>([]);
  const [selectedProtein, setSelectedProtein] = useState("Q9Y375");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("evidence");

  // Agent assessment
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [assessing, setAssessing] = useState(false);

  // Follow-up chat
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

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // Auto-trigger assessment when result arrives
  useEffect(() => {
    if (!result) return;
    setAssessment(null);
    setChatMessages([]);
    setAssessing(true);
    api.assess({ protein_id: result.protein_id, gene: result.protein_name, variant: result.variant })
      .then((res: any) => {
        // Map LangChain response to Assessment format
        setAssessment({
          classification: res.report?.match(/Classification[:\s]*(.*)/i)?.[1]?.trim() || "See report below",
          confidence: "See report",
          summary: res.report?.slice(0, 300) || "",
          evidence_for_pathogenic: [],
          evidence_for_benign: [],
          evidence_uncertain: [],
          acmg_criteria: [],
          recommendation: "",
          report: res.report || "",
        });
      })
      .catch(() => setAssessment(null))
      .finally(() => setAssessing(false));
  }, [result]);

  const sendChat = async (text?: string) => {
    const msg = text ?? chatInput.trim();
    if (!msg || chatLoading) return;
    const userMsg = { role: "user" as const, content: msg };
    const newMsgs = [...chatMessages, userMsg];
    setChatMessages(newMsgs);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await api.chat(newMsgs.map(m => ({ role: m.role, content: m.content })));
      setChatMessages([...newMsgs, { role: "assistant", content: res.reply }]);
    } catch {
      setChatMessages([...newMsgs, { role: "assistant", content: "Connection failed. Check ANTHROPIC_API_KEY." }]);
    }
    setChatLoading(false);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(""); setResult(null); setAssessment(null);
    try {
      const res = await api.lookupVariant(selectedProtein, query.trim());
      setResult(res);
      setActiveTab("evidence");
    } catch { setError(`Variant "${query}" not found. Try: L117H, M1A, R230W`); }
    setLoading(false);
  };

  const scorePercent = result
    ? ((result.score - result.score_range.min) / (result.score_range.max - result.score_range.min)) * 100 : 0;

  const classColor = assessment
    ? assessment.classification.includes("Pathogenic") ? "#dc2626"
      : assessment.classification.includes("Benign") ? "#16a34a" : "#ca8a04"
    : result?.color ?? "#94a3b8";

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Variant Lookup</h2>
      <p style={{ color: "#64748b", marginBottom: 24, fontSize: 15 }}>
        Enter a variant to get AI-powered clinical assessment
      </p>

      {/* Search */}
      <div style={{ ...card, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Protein</label>
            <select value={selectedProtein} onChange={(e) => { setSelectedProtein(e.target.value); setResult(null); setAssessment(null); }}
              style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}>
              {proteins.map(p => <option key={p.protein_id} value={p.protein_id}>{p.protein_id}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Variant</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="e.g. L117H, M1A, R230W..." style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, fontFamily: "monospace" }} />
              <button onClick={handleSearch} disabled={loading || !query.trim()}
                style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: loading || !query.trim() ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}>
                <Search size={18} />{loading ? "Searching..." : "Look Up"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <div style={{ ...card, borderColor: "#fca5a5", background: "#fef2f2", marginBottom: 24 }}><p style={{ color: "#991b1b", fontSize: 14 }}>{error}</p></div>}

      {result && (
        <>
          {/* ====== HEADER: Variant + Score ====== */}
          <div style={{ ...card, marginBottom: 20, borderLeft: `5px solid ${classColor}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 13, color: "#64748b" }}>{result.protein_name} ({result.protein_id}) · Position {result.position}</div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "monospace", color: "#0f172a", margin: "4px 0 8px" }}>
                  p.{result.wt}{result.position}{result.mut}
                </div>
              </div>
              <div style={{ textAlign: "center", minWidth: 140 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>QAFI Score</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: result.color, fontFamily: "monospace" }}>{result.score.toFixed(2)}</div>
                <div style={{ marginTop: 6, background: "#f1f5f9", borderRadius: 4, height: 8, position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${scorePercent}%`, background: "linear-gradient(to right, #16a34a, #ca8a04, #dc2626)", borderRadius: 4 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                  <span>{result.score_range.min.toFixed(2)}</span><span>{result.score_range.max.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ====== AI ASSESSMENT (the core agentic part) ====== */}
          <div style={{ ...card, marginBottom: 20, borderTop: `3px solid ${classColor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Bot size={20} color="#0f172a" />
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>AI Clinical Assessment</h3>
              {assessing && <Loader2 size={16} color="#3b82f6" style={{ animation: "spin 1s linear infinite" }} />}
            </div>

            {assessing && (
              <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>
                <Loader2 size={32} color="#3b82f6" style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
                <div style={{ fontSize: 14 }}>Analyzing 5 evidence sources...</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>QAFI · ClinVar · AlphaMissense · gnomAD · PubMed</div>
              </div>
            )}

            {assessment && (
              <>
                {/* Classification badge */}
                <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "center" }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: 8,
                    background: classColor + "12", border: `1px solid ${classColor}40`,
                  }}>
                    {assessment.classification.includes("Pathogenic") ? <AlertTriangle size={22} color={classColor} />
                      : assessment.classification.includes("Benign") ? <CheckCircle size={22} color={classColor} />
                      : <HelpCircle size={22} color={classColor} />}
                    <span style={{ fontSize: 20, fontWeight: 700, color: classColor }}>{assessment.classification}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>Confidence: <strong>{assessment.confidence}</strong></div>
                  {assessment.acmg_criteria.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {assessment.acmg_criteria.map(c => (
                        <span key={c} style={{ padding: "2px 8px", borderRadius: 4, background: "#f1f5f9", fontSize: 11, fontWeight: 600, color: "#475569", fontFamily: "monospace" }}>{c}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Summary */}
                <div style={{ fontSize: 15, lineHeight: 1.7, color: "#1e293b", marginBottom: 16, padding: "14px 16px", background: "#f8fafc", borderRadius: 8 }}>
                  {assessment.summary}
                </div>

                {/* Evidence for/against */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  {assessment.evidence_for_pathogenic.length > 0 && (
                    <div style={{ padding: 14, borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#991b1b", marginBottom: 8 }}>Evidence for Pathogenic</div>
                      {assessment.evidence_for_pathogenic.map((e, i) => (
                        <div key={i} style={{ fontSize: 13, color: "#7f1d1d", marginBottom: 4, paddingLeft: 12, borderLeft: "2px solid #fca5a5" }}>{e}</div>
                      ))}
                    </div>
                  )}
                  {assessment.evidence_for_benign.length > 0 && (
                    <div style={{ padding: 14, borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#166534", marginBottom: 8 }}>Evidence for Benign</div>
                      {assessment.evidence_for_benign.map((e, i) => (
                        <div key={i} style={{ fontSize: 13, color: "#14532d", marginBottom: 4, paddingLeft: 12, borderLeft: "2px solid #86efac" }}>{e}</div>
                      ))}
                    </div>
                  )}
                </div>

                {assessment.evidence_uncertain.length > 0 && (
                  <div style={{ padding: 14, borderRadius: 8, background: "#fefce8", border: "1px solid #fde68a", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#854d0e", marginBottom: 8 }}>Uncertain / Conflicting</div>
                    {assessment.evidence_uncertain.map((e, i) => (
                      <div key={i} style={{ fontSize: 13, color: "#713f12", marginBottom: 4, paddingLeft: 12, borderLeft: "2px solid #fde68a" }}>{e}</div>
                    ))}
                  </div>
                )}

                {/* Recommendation */}
                <div style={{ padding: 14, borderRadius: 8, background: "#eff6ff", border: "1px solid #bfdbfe", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e40af", marginBottom: 4 }}>Recommendation</div>
                  <div style={{ fontSize: 14, color: "#1e3a5f" }}>{assessment.recommendation}</div>
                </div>

                {/* Clinical report (collapsible) */}
                <details style={{ marginBottom: 16 }}>
                  <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#475569", padding: "8px 0" }}>
                    Clinical Report (copy for medical records)
                  </summary>
                  <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, lineHeight: 1.7, color: "#1e293b", marginTop: 8, whiteSpace: "pre-wrap" }}>
                    {assessment.report}
                  </div>
                </details>

                {/* Follow-up chat */}
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginBottom: 10 }}>Follow-up Questions</div>
                  {chatMessages.length === 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                      {["Why do the predictors disagree?",
                        "What functional studies would resolve this?",
                        "Rewrite the report in Chinese",
                      ].map(p => (
                        <button key={p} onClick={() => sendChat(p)} style={{ padding: "6px 12px", borderRadius: 16, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 12, color: "#475569", cursor: "pointer" }}>{p}</button>
                      ))}
                    </div>
                  )}
                  {chatMessages.length > 0 && (
                    <div style={{ maxHeight: 300, overflow: "auto", marginBottom: 10 }}>
                      {chatMessages.map((msg, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-start" }}>
                          <div style={{ width: 24, height: 24, borderRadius: 5, background: msg.role === "user" ? "#3b82f6" : "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {msg.role === "user" ? <User size={12} color="#fff" /> : <Bot size={12} color="#38bdf8" />}
                          </div>
                          <div style={{ fontSize: 13, lineHeight: 1.7, color: "#1e293b", whiteSpace: "pre-wrap", flex: 1 }}>{msg.content}</div>
                        </div>
                      ))}
                      {chatLoading && <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#94a3b8", fontSize: 13 }}><Bot size={16} /> Thinking...</div>}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()} placeholder="Ask a follow-up question..."
                      style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none" }} />
                    <button onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()}
                      style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", opacity: chatLoading || !chatInput.trim() ? 0.4 : 1 }}>
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ====== DATA TABS (supporting evidence) ====== */}
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
            Supporting Data
          </div>
          <div style={{ display: "flex", background: "#fff", borderRadius: "12px 12px 0 0", border: "1px solid #e2e8f0", borderBottom: "none", padding: "0 8px" }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: "10px 14px", fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? "#0f172a" : "#94a3b8", background: "transparent",
                border: "none", borderBottom: activeTab === tab.key ? "2px solid #3b82f6" : "2px solid transparent",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              }}>
                {tab.label}
                {tab.key === "clinvar" && result.clinvar && <span style={{ width: 7, height: 7, borderRadius: "50%", background: result.clinvar.found ? "#10b981" : "#cbd5e1", display: "inline-block" }} />}
                {tab.key === "alphamissense" && result.alphamissense?.variant && <span style={{ width: 7, height: 7, borderRadius: "50%", background: result.alphamissense.variant.am_class_color, display: "inline-block" }} />}
                {tab.key === "gnomad" && result.gnomad?.variant && <span style={{ width: 7, height: 7, borderRadius: "50%", background: result.gnomad.variant.freq_color, display: "inline-block" }} />}
                {tab.key === "literature" && result.literature && <span style={{ fontSize: 11, color: "#64748b", fontWeight: 400 }}>{(result.literature.variant_search_count || 0) + (result.literature.gene_search_count || 0)}</span>}
              </button>
            ))}
          </div>
          <div style={{ ...card, borderRadius: "0 0 12px 12px", minHeight: 150 }}>
            {/* Evidence */}
            {activeTab === "evidence" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.evidence.map((e, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 12, borderRadius: 8, background: IB[e.impact], border: `1px solid ${IC[e.impact]}20` }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: IC[e.impact], marginTop: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{e.feature}</span>
                        <span style={{ fontSize: 12, fontFamily: "monospace", color: "#475569" }}>{e.value}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{e.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* ClinVar */}
            {activeTab === "clinvar" && (<ClinVarTab result={result} />)}
            {/* AlphaMissense */}
            {activeTab === "alphamissense" && (<AlphaMissenseTab result={result} />)}
            {/* gnomAD */}
            {activeTab === "gnomad" && (<GnomadTab result={result} />)}
            {/* Literature */}
            {activeTab === "literature" && (<LiteratureTab result={result} />)}
            {/* Position */}
            {activeTab === "position" && (<PositionTab result={result} />)}
          </div>
        </>
      )}

      {/* Empty state */}
      {!result && !error && !loading && (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px" }}>
          <Search size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
          <h3 style={{ fontSize: 18, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Enter a variant to begin</h3>
          <p style={{ fontSize: 14, color: "#94a3b8", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
            Type a variant name like <strong style={{ fontFamily: "monospace" }}>L117H</strong> to get a comprehensive AI-powered clinical assessment with evidence from 5 sources.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center" }}>
            {["V116F", "L117H", "M1A", "T72S"].map(ex => (
              <button key={ex} onClick={() => setQuery(ex)} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 13, fontFamily: "monospace", cursor: "pointer", color: "#475569" }}>{ex}</button>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ============ Sub-components for each tab ============

function ClinVarTab({ result }: { result: LookupResult }) {
  const cv = result.clinvar;
  if (!cv?.found) return <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}><div style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>Not found in ClinVar</div><div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{cv?.same_gene_count ? `${cv.same_gene_count} other ${result.protein_name} variants in ClinVar.` : ""}</div></div>;
  return (<div>
    {cv.exact_match && (<div style={{ padding: 16, borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 12, background: cv.exact_match.significance.toLowerCase().includes("pathogenic") ? "#fef2f2" : cv.exact_match.significance.toLowerCase().includes("benign") ? "#f0fdf4" : "#fefce8" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div><div style={{ fontSize: 16, fontWeight: 700 }}>{cv.exact_match.significance}</div><div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{cv.exact_match.review_status}</div>{cv.exact_match.traits.length > 0 && <div style={{ fontSize: 13, marginTop: 6 }}>Condition: {cv.exact_match.traits.join(", ")}</div>}<div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{cv.exact_match.num_submissions} submission(s){cv.exact_match.last_evaluated && ` · ${cv.exact_match.last_evaluated.split(" ")[0]}`}</div></div>
        <div style={{ textAlign: "right" }}><div style={{ fontSize: 20, letterSpacing: 2 }}>{"★".repeat(cv.exact_match.stars)}{"☆".repeat(4 - cv.exact_match.stars)}</div><a href={cv.exact_match.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#3b82f6", display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: 4 }}>View <ExternalLink size={11} /></a></div>
      </div></div>)}
    {cv.same_position?.length > 0 && <div><div style={{ fontSize: 13, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>Other variants at this position</div>{cv.same_position.map((v: any, i: number) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}><span style={{ fontFamily: "monospace", fontWeight: 600 }}>{v.protein_change}</span><span style={{ color: "#64748b" }}>{v.significance || "N/A"}</span><a href={v.url} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", fontSize: 12 }}>View</a></div>)}</div>}
  </div>);
}

function AlphaMissenseTab({ result }: { result: LookupResult }) {
  const am = result.alphamissense;
  if (!am?.available || !am.variant) return <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8 }}><div style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>Not available</div></div>;
  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, borderRadius: 8, marginBottom: 12, background: am.variant.am_class === "LPath" ? "#fef2f2" : am.variant.am_class === "LBen" ? "#f0fdf4" : "#fefce8", border: `1px solid ${am.variant.am_class_color}30` }}>
      <div><div style={{ fontSize: 16, fontWeight: 700, color: am.variant.am_class_color }}>{am.variant.am_class_label}</div><div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>AlphaMissense (Google DeepMind)</div></div>
      <div style={{ textAlign: "right" }}><div style={{ fontSize: 28, fontWeight: 700, fontFamily: "monospace", color: am.variant.am_class_color }}>{am.variant.am_score.toFixed(2)}</div><div style={{ fontSize: 10, color: "#94a3b8" }}>0 = benign · 1 = pathogenic</div></div>
    </div>
    {am.same_position.length > 0 && <div><div style={{ fontSize: 13, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>All substitutions at position {result.position}</div><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{am.same_position.map((v: any) => <div key={v.variant} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 12, fontFamily: "monospace", background: v.variant === result.variant ? `${v.am_class_color}20` : "#f8fafc", border: v.variant === result.variant ? `2px solid ${v.am_class_color}` : "1px solid #e2e8f0", fontWeight: v.variant === result.variant ? 700 : 400 }}><span style={{ color: v.am_class_color }}>{v.am_score.toFixed(2)}</span> {v.variant.slice(-1)}</div>)}</div></div>}
    {am.summary && <div style={{ display: "flex", gap: 12, marginTop: 12 }}>{[{ l: "Pathogenic", c: am.summary.pathogenic, co: "#dc2626" }, { l: "Ambiguous", c: am.summary.ambiguous, co: "#ca8a04" }, { l: "Benign", c: am.summary.benign, co: "#16a34a" }].map(s => <div key={s.l} style={{ flex: 1, padding: 8, background: "#f8fafc", borderRadius: 6, textAlign: "center" }}><div style={{ fontSize: 16, fontWeight: 700, color: s.co }}>{s.c}</div><div style={{ fontSize: 10, color: "#94a3b8" }}>{s.l}</div></div>)}</div>}
  </div>);
}

function GnomadTab({ result }: { result: LookupResult }) {
  const gn = result.gnomad;
  if (!gn?.available || !gn.variant) return <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8 }}>Not available</div>;
  const v = gn.variant;
  return (<div>
    <div style={{ padding: 16, borderRadius: 8, marginBottom: 12, background: v.allele_freq === 0 ? "#fef2f2" : "#f8fafc", border: `1px solid ${v.freq_color}30` }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div><div style={{ fontSize: 16, fontWeight: 700, color: v.freq_color }}>{v.freq_label}</div><div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{v.freq_interpretation}</div>{v.rsids?.length > 0 && <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>rsID: {v.rsids.map((rs: string) => <a key={rs} href={`https://www.ncbi.nlm.nih.gov/snp/${rs}`} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", marginRight: 6 }}>{rs}</a>)}</div>}</div>
        <div style={{ textAlign: "right" }}><div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace", color: v.freq_color }}>{v.allele_freq === 0 ? "0" : v.allele_freq < 0.001 ? v.allele_freq.toExponential(2) : v.allele_freq.toFixed(4)}</div><div style={{ fontSize: 10, color: "#94a3b8" }}>Allele Frequency</div></div>
      </div>
    </div>
    <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>{[{ l: "Allele Count", v: v.allele_count.toLocaleString() }, { l: "Allele Number", v: v.allele_number ? v.allele_number.toLocaleString() : "—" }, { l: "Homozygotes", v: v.homozygote_count.toLocaleString() }, { l: "Gene Missense", v: gn.gene_missense_count.toLocaleString() }].map(s => <div key={s.l} style={{ flex: 1, padding: 10, background: "#f8fafc", borderRadius: 6, textAlign: "center" }}><div style={{ fontSize: 16, fontWeight: 700 }}>{s.v}</div><div style={{ fontSize: 10, color: "#94a3b8" }}>{s.l}</div></div>)}</div>
    <div style={{ padding: 12, background: "#eff6ff", borderRadius: 8, fontSize: 12, color: "#1e40af" }}><strong>ACMG:</strong> AF &gt; 5% = BA1 (benign). Absent from gnomAD = PM2 (moderate pathogenic).</div>
  </div>);
}

function LiteratureTab({ result }: { result: LookupResult }) {
  const lit = result.literature;
  if (!lit) return <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8 }}>Not available</div>;
  return (<div>
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Variant-Specific ({lit.variant_search_count})</div>
      {lit.variant_articles.length > 0 ? lit.variant_articles.map((a: any) => <ArticleCard key={a.pmid} article={a} />) : <div style={{ padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#64748b" }}>No publications for this specific variant (novel/unreported).</div>}
    </div>
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{result.protein_name} Clinical Papers ({lit.gene_search_count})</div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>{lit.total_gene_papers} total gene papers</div>
      {lit.gene_articles.length > 0 ? lit.gene_articles.map((a: any) => <ArticleCard key={a.pmid} article={a} />) : <div style={{ padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#64748b" }}>No clinical publications found.</div>}
    </div>
  </div>);
}

function PositionTab({ result }: { result: LookupResult }) {
  return (<div>
    <div style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>{result.position_context.total_variants} substitutions · Rank <strong>#{result.position_context.rank}</strong> of {result.position_context.total_variants}</div>
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={result.position_context.variants} margin={{ left: 10, right: 10 }}>
        <XAxis dataKey="mut" tick={{ fontSize: 12, fontFamily: "monospace" }} />
        <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
        <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0].payload; return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8, fontSize: 13 }}><div style={{ fontWeight: 600 }}>{d.variant}</div><div>Score: {d.score.toFixed(4)}</div></div>; }} />
        <ReferenceLine y={result.score} stroke={result.color} strokeDasharray="4 4" />
        <Bar dataKey="score" radius={[3, 3, 0, 0]}>{result.position_context.variants.map((v, i) => <Cell key={i} fill={v.variant === result.variant ? result.color : "#cbd5e1"} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}><thead><tr style={{ borderBottom: "2px solid #e2e8f0" }}><th style={{ textAlign: "left" as const, padding: "6px 10px", fontSize: 11, color: "#64748b" }}>Variant</th><th style={{ textAlign: "left" as const, padding: "6px 10px", fontSize: 11, color: "#64748b" }}>Sub</th><th style={{ textAlign: "left" as const, padding: "6px 10px", fontSize: 11, color: "#64748b" }}>Score</th></tr></thead>
    <tbody>{result.position_context.variants.map(v => <tr key={v.variant} style={{ borderBottom: "1px solid #f1f5f9", background: v.variant === result.variant ? `${result.color}08` : "transparent", fontWeight: v.variant === result.variant ? 700 : 400 }}><td style={{ padding: "6px 10px", fontSize: 12, fontFamily: "monospace" }}>{v.variant}{v.variant === result.variant && <span style={{ color: result.color, fontSize: 10, marginLeft: 4 }}>current</span>}</td><td style={{ padding: "6px 10px", fontSize: 12 }}>{result.wt}→{v.mut}</td><td style={{ padding: "6px 10px", fontSize: 12, fontFamily: "monospace" }}>{v.score.toFixed(4)}</td></tr>)}</tbody></table>
  </div>);
}

function ArticleCard({ article }: { article: { pmid: string; title: string; authors: string; journal: string; year: string; url: string } }) {
  return (<div style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
    <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", textDecoration: "none", lineHeight: 1.4, display: "block" }}>{article.title}</a>
    <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{article.authors} · <em>{article.journal}</em> · {article.year} <span style={{ color: "#3b82f6" }}>PMID:{article.pmid}</span></div>
  </div>);
}
