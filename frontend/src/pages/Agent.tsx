import { useEffect, useState, useRef } from "react";
import { api } from "../api/client";
import { Bot, Send, User, Loader2, Search, ChevronDown, ChevronUp, Zap, FileText, MessageSquare, CheckCircle, XCircle, MinusCircle, ExternalLink, Copy, Check } from "lucide-react";

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 12, padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0",
};

// Clinical-friendly labels and descriptions for each evidence source
const EVIDENCE_SOURCES: Record<string, { icon: string; label: string; desc: string; color: string }> = {
  qafi_predict:          { icon: "🧬", label: "QAFI Prediction",    desc: "ML functional impact score",              color: "#3b82f6" },
  clinvar_lookup:        { icon: "🏥", label: "ClinVar",            desc: "Clinical significance database",          color: "#10b981" },
  alphamissense_predict: { icon: "🤖", label: "AlphaMissense",      desc: "DeepMind pathogenicity predictor",        color: "#8b5cf6" },
  gnomad_frequency:      { icon: "👥", label: "Population Frequency",desc: "gnomAD allele frequency",                color: "#f59e0b" },
  uniprot_annotate:      { icon: "🔬", label: "Protein Annotation",  desc: "UniProt function & domains",             color: "#ec4899" },
  pubmed_search:         { icon: "📚", label: "Literature",          desc: "PubMed publication search",               color: "#06b6d4" },
  acmg_guideline:        { icon: "📋", label: "ACMG Guidelines",     desc: "Classification standards (RAG)",          color: "#ef4444" },
};

interface ToolCall {
  name: string; icon: string; label: string; args: any; result?: string;
}

type TabKey = "assess" | "chat";

// Parse tool result into a readable one-liner
function summarizeToolResult(name: string, result?: string): { status: "positive" | "negative" | "neutral"; summary: string } {
  if (!result) return { status: "neutral", summary: "No data" };
  try {
    const d = JSON.parse(result);
    switch (name) {
      case "qafi_predict":
        if (d.score != null) {
          const pct = d.percentile ?? 0;
          const s = pct >= 80 ? "positive" : pct < 30 ? "negative" : "neutral";
          const pos = d.position_analysis;
          const posInfo = pos ? ` · Rank ${pos.rank_at_position}/${pos.total_at_position} at position` : "";
          return { status: s as any, summary: `Score ${d.score} — ${d.classification || "N/A"} (${pct}th percentile)${posInfo}` };
        }
        return { status: "neutral", summary: d.error || "No prediction available" };
      case "clinvar_lookup":
        if (d.found) {
          const sig = (d.significance || "").toLowerCase();
          const st = sig.includes("pathogenic") ? "positive" : sig.includes("benign") ? "negative" : "neutral";
          return { status: st, summary: `${d.significance} (${d.stars ?? 0}★) — ${d.accession || ""}` };
        }
        return { status: "neutral", summary: `Not reported in ClinVar — ${d.gene_variant_count ?? 0} gene variants exist` };
      case "alphamissense_predict":
        if (!d.available) return { status: "neutral", summary: "Not available" };
        return { status: d.am_class === "LPath" ? "positive" : d.am_class === "LBen" ? "negative" : "neutral", summary: `${d.am_class_label} (${d.am_score})` };
      case "gnomad_frequency":
        if (d.allele_freq === 0) return { status: "positive", summary: "Absent from gnomAD (~800K individuals) — supports PM2" };
        if (d.allele_freq < 0.0001) return { status: "neutral", summary: `Ultra-rare (AF=${d.allele_freq.toExponential(2)}) — AC=${d.allele_count}` };
        if (d.allele_freq < 0.01) return { status: "neutral", summary: `Rare (AF=${d.allele_freq.toFixed(4)}) — AC=${d.allele_count}` };
        return { status: "negative", summary: `Common (AF=${d.allele_freq.toFixed(4)}) — likely benign (BA1 if >5%)` };
      case "uniprot_annotate": {
        const protName = d.protein_name?.slice(0, 50) ?? "N/A";
        if (d.in_functional_region) return { status: "positive", summary: `${protName} — In functional domain` };
        const feats = d.position_features?.length ?? 0;
        return { status: "neutral", summary: `${protName} — ${feats > 0 ? `${feats} annotation(s) at position` : "No functional domain"}` };
      }
      case "pubmed_search":
        return {
          status: (d.variant_paper_count ?? 0) > 0 ? "positive" : "neutral",
          summary: `${d.variant_paper_count ?? 0} variant-specific paper(s), ${d.gene_paper_count ?? 0} gene clinical paper(s)`,
        };
      case "acmg_guideline":
        return { status: "neutral", summary: "Guidelines consulted" };
      default:
        return { status: "neutral", summary: result.slice(0, 80) };
    }
  } catch {
    return { status: "neutral", summary: result.slice(0, 80) };
  }
}

const STATUS_ICON: Record<string, any> = {
  positive: { Icon: XCircle, color: "#dc2626", label: "Supports pathogenicity" },
  negative: { Icon: CheckCircle, color: "#16a34a", label: "Supports benign" },
  neutral:  { Icon: MinusCircle, color: "#94a3b8", label: "Inconclusive" },
};

export default function AgentPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("assess");
  const [protein, setProtein] = useState("Q9Y375");
  const [gene, setGene] = useState("NDUFAF1");
  const [variant, setVariant] = useState("V116F");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string; tools?: ToolCall[] }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [tools, setTools] = useState<any[]>([]);

  useEffect(() => { api.tools().then((d) => setTools(d.tools)).catch(() => {}); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const runAssess = async () => {
    if (!variant.trim()) return;
    setLoading(true); setReport(""); setToolCalls([]); setError(""); setMeta(null); setCopied(false);
    try {
      const res = await api.assess({ protein_id: protein, gene, variant: variant.trim() });
      setReport(res.report); setToolCalls(res.tool_calls || []);
      setMeta({ variant: res.variant, gene: res.gene, position: res.position, wt: res.wt, mut: res.mut });
    } catch (e: any) { setError(e.message || "Assessment failed"); }
    setLoading(false);
  };

  const sendChat = async (text?: string) => {
    const msg = text ?? chatInput.trim();
    if (!msg || chatLoading) return;
    const userMsg = { role: "user" as const, content: msg };
    const newMsgs = [...chatMessages, userMsg];
    setChatMessages(newMsgs); setChatInput(""); setChatLoading(true);
    try {
      const res = await api.chat(newMsgs.map((m) => ({ role: m.role, content: m.content })));
      setChatMessages([...newMsgs, { role: "assistant", content: res.reply, tools: res.tool_calls }]);
    } catch { setChatMessages([...newMsgs, { role: "assistant", content: "Connection failed." }]); }
    setChatLoading(false);
  };

  const copyReport = () => {
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
        borderRadius: 16, padding: "28px 32px", marginBottom: 24, color: "#fff",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Zap size={22} color="#fbbf24" />
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>LangChain Agent</h2>
            </div>
            <p style={{ fontSize: 14, opacity: 0.8, margin: "4px 0 0" }}>
              AI-powered clinical variant interpretation with 7 evidence sources
            </p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#94a3b8" }}>
            LangChain + LangGraph
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {[
          { key: "assess" as TabKey, icon: FileText, label: "Variant Assessment" },
          { key: "chat" as TabKey, icon: MessageSquare, label: "Clinical Consultation" },
        ].map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            flex: 1, padding: "12px 16px", borderRadius: 10,
            border: activeTab === key ? "2px solid #3b82f6" : "1px solid #e2e8f0",
            background: activeTab === key ? "#eff6ff" : "#fff",
            color: activeTab === key ? "#1d4ed8" : "#64748b",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>

      {/* ====== ASSESSMENT TAB ====== */}
      {activeTab === "assess" && (
        <>
          {/* Input */}
          <div style={card}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 120 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Protein</label>
                <input value={protein} onChange={(e) => setProtein(e.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, width: "100%" }} />
              </div>
              <div style={{ minWidth: 120 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Gene</label>
                <input value={gene} onChange={(e) => setGene(e.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, width: "100%" }} />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Variant</label>
                <input value={variant} onChange={(e) => setVariant(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runAssess()}
                  placeholder="e.g. L117H, M1A, R230W"
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, fontFamily: "monospace", width: "100%" }} />
              </div>
              <button onClick={runAssess} disabled={loading || !variant.trim()} style={{
                padding: "10px 24px", borderRadius: 8, border: "none",
                background: loading ? "#94a3b8" : "#3b82f6", color: "#fff",
                fontSize: 14, fontWeight: 600, cursor: loading ? "default" : "pointer",
                display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
              }}>
                {loading ? <><Loader2 size={16} className="spin" /> Analyzing...</> : <><Search size={16} /> Analyze</>}
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              {["V116F", "L117H", "M1A", "T72S"].map((v) => (
                <button key={v} onClick={() => setVariant(v)} style={{
                  padding: "4px 12px", borderRadius: 16, border: "1px solid #e2e8f0",
                  background: variant === v ? "#eff6ff" : "#f8fafc", fontSize: 12,
                  fontFamily: "monospace", cursor: "pointer", color: "#475569",
                }}>{v}</button>
              ))}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ ...card, marginTop: 20, textAlign: "center", padding: 48 }}>
              <Loader2 size={36} color="#3b82f6" style={{ animation: "spin 1s linear infinite", marginBottom: 16 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>Analyzing {gene} {variant}</div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 8 }}>Querying 7 evidence sources...</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
                {Object.values(EVIDENCE_SOURCES).map((s) => (
                  <span key={s.label} style={{ fontSize: 12, color: s.color, padding: "4px 10px", background: `${s.color}10`, borderRadius: 12 }}>
                    {s.icon} {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ ...card, marginTop: 20, borderColor: "#fca5a5", background: "#fef2f2" }}><p style={{ color: "#991b1b", fontSize: 14 }}>Error: {error}</p></div>}

          {/* ====== RESULTS ====== */}
          {report && (
            <>
              {/* Variant header */}
              {meta && (
                <div style={{ ...card, marginTop: 20, borderLeft: "4px solid #3b82f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#64748b" }}>{meta.gene} ({protein}) &middot; Position {meta.position}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "monospace", color: "#0f172a", margin: "4px 0" }}>
                      p.{meta.wt}{meta.position}{meta.mut}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{toolCalls.length} evidence sources queried</div>
                </div>
              )}

              {/* ====== EVIDENCE SUMMARY (clinical-friendly) ====== */}
              <div style={{ ...card, marginTop: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#0f172a" }}>
                  Evidence Summary
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {toolCalls.map((tc, i) => {
                    const source = EVIDENCE_SOURCES[tc.name] || { icon: "🔧", label: tc.label, desc: "", color: "#94a3b8" };
                    const { status, summary } = summarizeToolResult(tc.name, tc.result);
                    const si = STATUS_ICON[status];
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "14px 16px", borderRadius: 10,
                        background: status === "positive" ? "#fef2f2" : status === "negative" ? "#f0fdf4" : "#f8fafc",
                        border: `1px solid ${status === "positive" ? "#fecaca" : status === "negative" ? "#bbf7d0" : "#e2e8f0"}`,
                      }}>
                        {/* Status indicator */}
                        <si.Icon size={18} color={si.color} style={{ flexShrink: 0 }} />

                        {/* Source info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 18 }}>{source.icon}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{source.label}</span>
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>{source.desc}</span>
                          </div>
                          <div style={{ fontSize: 13, color: "#475569", marginTop: 3 }}>{summary}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div style={{ display: "flex", gap: 16, marginTop: 14, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: 11, color: "#dc2626", display: "flex", alignItems: "center", gap: 4 }}><XCircle size={12} /> Supports pathogenicity</span>
                  <span style={{ fontSize: 11, color: "#16a34a", display: "flex", alignItems: "center", gap: 4 }}><CheckCircle size={12} /> Supports benign</span>
                  <span style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}><MinusCircle size={12} /> Inconclusive / Not available</span>
                </div>
              </div>

              {/* ====== CLINICAL REPORT ====== */}
              <div style={{ ...card, marginTop: 12, borderTop: "3px solid #0f172a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <FileText size={18} /> Clinical Report
                  </h3>
                  <button onClick={copyReport} style={{
                    padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0",
                    background: copied ? "#f0fdf4" : "#fff", fontSize: 12, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                    color: copied ? "#16a34a" : "#64748b",
                  }}>
                    {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy Report</>}
                  </button>
                </div>

                <div style={{
                  background: "#fafbfd", border: "1px solid #e8ecf1", borderRadius: 10,
                  padding: "24px 28px", fontSize: 14, lineHeight: 2, color: "#1e293b",
                  whiteSpace: "pre-wrap", fontFamily: "'Georgia', 'Times New Roman', serif",
                }}>
                  {report}
                </div>

                <div style={{ marginTop: 12, fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>
                  This report was generated by AI and should be reviewed by a qualified clinical geneticist before clinical use.
                </div>
              </div>
            </>
          )}

          {/* Empty state */}
          {!report && !loading && !error && (
            <div style={{ ...card, marginTop: 20, textAlign: "center", padding: 60 }}>
              <Bot size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Enter a variant to analyze</h3>
              <p style={{ fontSize: 14, color: "#94a3b8", maxWidth: 500, margin: "0 auto", lineHeight: 1.6 }}>
                The AI agent queries 7 evidence sources, applies ACMG guidelines, and generates a comprehensive clinical interpretation report.
              </p>
            </div>
          )}
        </>
      )}

      {/* ====== CHAT TAB ====== */}
      {activeTab === "chat" && (
        <div style={{ ...card, display: "flex", flexDirection: "column", height: "calc(100vh - 280px)" }}>
          <div style={{ flex: 1, overflow: "auto", marginBottom: 12, padding: "4px" }}>
            {chatMessages.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <Bot size={40} color="#94a3b8" style={{ marginBottom: 12 }} />
                <p style={{ color: "#64748b", fontSize: 15, marginBottom: 20 }}>
                  Describe a clinical scenario or ask about variant interpretation. The agent can query databases during the conversation.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 520, margin: "0 auto" }}>
                  {[
                    "Patient has mitochondrial disease. Found NDUFAF1 L117H and M1A. Which is more likely pathogenic?",
                    "Explain ACMG PM2 criterion and when it applies",
                    "Look up NDUFAF1 V116F in ClinVar and gnomAD, then tell me the clinical significance",
                  ].map((ex) => (
                    <button key={ex} onClick={() => sendChat(ex)} style={{
                      padding: "10px 16px", borderRadius: 10, border: "1px solid #e2e8f0",
                      background: "#f8fafc", fontSize: 13, color: "#475569", cursor: "pointer",
                      textAlign: "left", lineHeight: 1.5,
                    }}>{ex}</button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "flex-start" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: msg.role === "user" ? "#3b82f6" : "#0f172a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {msg.role === "user" ? <User size={16} color="#fff" /> : <Bot size={16} color="#38bdf8" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: "#1e293b", whiteSpace: "pre-wrap" }}>{msg.content}</div>
                  {msg.tools && msg.tools.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {msg.tools.map((tc, j) => {
                        const s = EVIDENCE_SOURCES[tc.name];
                        return (
                          <span key={j} style={{
                            padding: "3px 10px", borderRadius: 6, fontSize: 11,
                            background: `${s?.color || "#64748b"}10`, color: s?.color || "#64748b",
                            border: `1px solid ${s?.color || "#64748b"}25`,
                          }}>
                            {s?.icon || "🔧"} {s?.label || tc.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", color: "#94a3b8" }}>
                <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> <span style={{ fontSize: 14 }}>Agent is thinking...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="Describe a clinical scenario or ask about a variant..."
              style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" }} />
            <button onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()} style={{
              padding: "12px 20px", borderRadius: 10, border: "none", background: "#0f172a",
              color: "#fff", cursor: "pointer", opacity: chatLoading || !chatInput.trim() ? 0.4 : 1,
            }}><Send size={18} /></button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
