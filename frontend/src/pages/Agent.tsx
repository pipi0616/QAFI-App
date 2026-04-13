import { useEffect, useState, useRef } from "react";
import { api } from "../api/client";
import { Bot, Send, User, Loader2, Search, Wrench, ChevronDown, ChevronUp, Zap, FileText, MessageSquare } from "lucide-react";

// ============ Styles ============

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 12, padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0",
};

const TOOL_COLORS: Record<string, string> = {
  qafi_predict: "#3b82f6",
  clinvar_lookup: "#10b981",
  alphamissense_predict: "#8b5cf6",
  gnomad_frequency: "#f59e0b",
  uniprot_annotate: "#ec4899",
  pubmed_search: "#06b6d4",
  acmg_guideline: "#ef4444",
};

// ============ Types ============

interface ToolCall {
  name: string;
  icon: string;
  label: string;
  args: any;
  result?: string;
}

type TabKey = "assess" | "chat";

// ============ Component ============

export default function AgentPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>("assess");

  // Assessment state
  const [protein, setProtein] = useState("Q9Y375");
  const [gene, setGene] = useState("NDUFAF1");
  const [variant, setVariant] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [showTools, setShowTools] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<any>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string; tools?: ToolCall[] }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Tools info
  const [tools, setTools] = useState<any[]>([]);

  useEffect(() => {
    api.tools().then((d) => setTools(d.tools)).catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // === Assessment ===
  const runAssess = async () => {
    if (!variant.trim()) return;
    setLoading(true);
    setReport("");
    setToolCalls([]);
    setError("");
    setMeta(null);
    setShowTools(false);
    try {
      const res = await api.assess({ protein_id: protein, gene, variant: variant.trim() });
      setReport(res.report);
      setToolCalls(res.tool_calls || []);
      setMeta({ variant: res.variant, gene: res.gene, position: res.position, wt: res.wt, mut: res.mut });
    } catch (e: any) {
      setError(e.message || "Assessment failed");
    }
    setLoading(false);
  };

  // === Chat ===
  const sendChat = async (text?: string) => {
    const msg = text ?? chatInput.trim();
    if (!msg || chatLoading) return;
    const userMsg = { role: "user" as const, content: msg };
    const newMsgs = [...chatMessages, userMsg];
    setChatMessages(newMsgs);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await api.chat(newMsgs.map((m) => ({ role: m.role, content: m.content })));
      setChatMessages([...newMsgs, { role: "assistant", content: res.reply, tools: res.tool_calls }]);
    } catch {
      setChatMessages([...newMsgs, { role: "assistant", content: "Connection failed. Check ANTHROPIC_API_KEY." }]);
    }
    setChatLoading(false);
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
              Agentic AI with 7 tools, automatic reasoning, and ACMG-based classification
            </p>
          </div>
          <div style={{
            background: "rgba(255,255,255,0.1)", borderRadius: 8,
            padding: "6px 14px", fontSize: 12, color: "#94a3b8",
          }}>
            Powered by LangChain + LangGraph
          </div>
        </div>
        {/* Tool badges */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 16 }}>
          {tools.map((t) => (
            <span key={t.name} style={{
              padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500,
              background: `${TOOL_COLORS[t.name] || "#64748b"}25`, color: TOOL_COLORS[t.name] || "#94a3b8",
              border: `1px solid ${TOOL_COLORS[t.name] || "#64748b"}40`,
            }}>
              {t.icon} {t.label}
            </span>
          ))}
          <span style={{
            padding: "4px 10px", borderRadius: 20, fontSize: 11,
            background: "#ef444425", color: "#ef4444", border: "1px solid #ef444440",
          }}>
            📋 ACMG RAG
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {[
          { key: "assess" as TabKey, icon: FileText, label: "Variant Assessment" },
          { key: "chat" as TabKey, icon: MessageSquare, label: "Clinical Consultation" },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              flex: 1, padding: "12px 16px", borderRadius: 10,
              border: activeTab === key ? "2px solid #3b82f6" : "1px solid #e2e8f0",
              background: activeTab === key ? "#eff6ff" : "#fff",
              color: activeTab === key ? "#1d4ed8" : "#64748b",
              fontWeight: 600, fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>

      {/* ====== Tab: Assessment ====== */}
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
              <button onClick={runAssess} disabled={loading || !variant.trim()}
                style={{
                  padding: "10px 24px", borderRadius: 8, border: "none",
                  background: loading ? "#94a3b8" : "#3b82f6", color: "#fff",
                  fontSize: 14, fontWeight: 600, cursor: loading ? "default" : "pointer",
                  display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                }}>
                {loading ? <><Loader2 size={16} className="spin" /> Analyzing...</> : <><Search size={16} /> Analyze</>}
              </button>
            </div>
            {/* Quick examples */}
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              {["L117H", "M1A", "V116F", "G50D"].map((v) => (
                <button key={v} onClick={() => setVariant(v)}
                  style={{
                    padding: "4px 12px", borderRadius: 16, border: "1px solid #e2e8f0",
                    background: variant === v ? "#eff6ff" : "#f8fafc", fontSize: 12,
                    fontFamily: "monospace", cursor: "pointer", color: "#475569",
                  }}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Loading state */}
          {loading && (
            <div style={{ ...card, marginTop: 20, textAlign: "center", padding: 48 }}>
              <Loader2 size={36} color="#3b82f6" style={{ animation: "spin 1s linear infinite", marginBottom: 16 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>Agent is analyzing {gene} {variant}</div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 8 }}>
                Querying 7 evidence sources: QAFI, ClinVar, AlphaMissense, gnomAD, UniProt, PubMed, ACMG
              </div>
            </div>
          )}

          {error && (
            <div style={{ ...card, marginTop: 20, borderColor: "#fca5a5", background: "#fef2f2" }}>
              <p style={{ color: "#991b1b", fontSize: 14 }}>Error: {error}</p>
            </div>
          )}

          {/* Results */}
          {report && (
            <>
              {/* Variant header */}
              {meta && (
                <div style={{ ...card, marginTop: 20, borderLeft: "4px solid #3b82f6" }}>
                  <div style={{ fontSize: 13, color: "#64748b" }}>{meta.gene} ({protein})</div>
                  <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace", color: "#0f172a", margin: "4px 0" }}>
                    p.{meta.wt}{meta.position}{meta.mut}
                  </div>
                </div>
              )}

              {/* Tool calls */}
              {toolCalls.length > 0 && (
                <div style={{ ...card, marginTop: 12 }}>
                  <div
                    onClick={() => setShowTools(!showTools)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Wrench size={16} color="#64748b" />
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>
                        {toolCalls.length} Tools Called
                      </span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {toolCalls.map((tc, i) => (
                          <span key={i} style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: TOOL_COLORS[tc.name] || "#94a3b8",
                          }} />
                        ))}
                      </div>
                    </div>
                    {showTools ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
                  </div>
                  {showTools && (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                      {toolCalls.map((tc, i) => (
                        <div key={i} style={{
                          padding: "10px 14px", borderRadius: 8, background: "#f8fafc",
                          borderLeft: `3px solid ${TOOL_COLORS[tc.name] || "#94a3b8"}`,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>
                              {tc.icon} {tc.label}
                            </span>
                            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#94a3b8" }}>
                              {JSON.stringify(tc.args)}
                            </span>
                          </div>
                          {tc.result && (
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                              {tc.result.length > 150 ? tc.result.slice(0, 150) + "..." : tc.result}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Report */}
              <div style={{ ...card, marginTop: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <Bot size={18} /> Clinical Assessment Report
                </h3>
                <div style={{ fontSize: 14, lineHeight: 1.8, color: "#1e293b", whiteSpace: "pre-wrap" }}>
                  {report}
                </div>
              </div>
            </>
          )}

          {/* Empty state */}
          {!report && !loading && !error && (
            <div style={{ ...card, marginTop: 20, textAlign: "center", padding: 60 }}>
              <Bot size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, fontWeight: 600, color: "#475569", marginBottom: 8 }}>
                Enter a variant to analyze
              </h3>
              <p style={{ fontSize: 14, color: "#94a3b8", maxWidth: 500, margin: "0 auto", lineHeight: 1.6 }}>
                The LangChain agent will automatically query 7 databases, apply ACMG guidelines
                via RAG, and generate a comprehensive clinical interpretation report.
              </p>
            </div>
          )}
        </>
      )}

      {/* ====== Tab: Chat ====== */}
      {activeTab === "chat" && (
        <div style={{ ...card, display: "flex", flexDirection: "column", height: "calc(100vh - 280px)" }}>
          {/* Chat area */}
          <div style={{ flex: 1, overflow: "auto", marginBottom: 12, padding: "4px" }}>
            {chatMessages.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <Bot size={40} color="#94a3b8" style={{ marginBottom: 12 }} />
                <p style={{ color: "#64748b", fontSize: 15, marginBottom: 20 }}>
                  Ask about variant interpretation, ACMG criteria, or describe a patient case.
                  The agent can look up variants and consult databases during the conversation.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 500, margin: "0 auto" }}>
                  {[
                    "Patient has mitochondrial disease. Found NDUFAF1 L117H and M1A. Which is more likely pathogenic?",
                    "Explain ACMG PM2 criterion and when it applies",
                    "Look up NDUFAF1 V116F in ClinVar and gnomAD, then tell me the clinical significance",
                  ].map((ex) => (
                    <button key={ex} onClick={() => sendChat(ex)}
                      style={{
                        padding: "10px 16px", borderRadius: 10, border: "1px solid #e2e8f0",
                        background: "#f8fafc", fontSize: 13, color: "#475569", cursor: "pointer",
                        textAlign: "left", lineHeight: 1.5,
                      }}>
                      {ex}
                    </button>
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
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: "#1e293b", whiteSpace: "pre-wrap" }}>
                    {msg.content}
                  </div>
                  {msg.tools && msg.tools.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {msg.tools.map((tc, j) => (
                        <span key={j} style={{
                          padding: "2px 8px", borderRadius: 4, fontSize: 11,
                          background: `${TOOL_COLORS[tc.name] || "#64748b"}15`,
                          color: TOOL_COLORS[tc.name] || "#64748b",
                          border: `1px solid ${TOOL_COLORS[tc.name] || "#64748b"}30`,
                        }}>
                          {tc.icon} {tc.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", color: "#94a3b8" }}>
                <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: 14 }}>Agent is thinking and calling tools...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="Describe a clinical scenario or ask about a variant..."
              style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" }} />
            <button onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()}
              style={{
                padding: "12px 20px", borderRadius: 10, border: "none", background: "#0f172a",
                color: "#fff", cursor: "pointer", opacity: chatLoading || !chatInput.trim() ? 0.4 : 1,
              }}>
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
