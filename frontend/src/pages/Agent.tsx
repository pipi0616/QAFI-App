import { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api/client";
import { Bot, Send, User, Loader2, Search, Zap, FileText, MessageSquare, CheckCircle, XCircle, MinusCircle, Copy, Check } from "lucide-react";

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

    // Add empty assistant message that will be filled by streaming
    const placeholderIdx = newMsgs.length;
    setChatMessages([...newMsgs, { role: "assistant", content: "", tools: [] }]);
    setChatInput(""); setChatLoading(true);

    let streamedContent = "";
    const streamedTools: ToolCall[] = [];

    try {
      await api.chatStream(
        newMsgs.map((m) => ({ role: m.role, content: m.content })),
        (event) => {
          if (event.type === "token") {
            streamedContent += event.text;
            setChatMessages((prev) => {
              const updated = [...prev];
              updated[placeholderIdx] = { role: "assistant", content: streamedContent, tools: [...streamedTools] };
              return updated;
            });
          } else if (event.type === "tool_start") {
            streamedTools.push({ name: event.name, icon: event.icon, label: event.label, args: event.args });
            setChatMessages((prev) => {
              const updated = [...prev];
              updated[placeholderIdx] = { role: "assistant", content: streamedContent, tools: [...streamedTools] };
              return updated;
            });
          } else if (event.type === "tool_end") {
            // Find latest matching tool and attach result
            const t = [...streamedTools].reverse().find((tc) => tc.name === event.name && !tc.result);
            if (t) t.result = event.result;
          } else if (event.type === "error") {
            streamedContent += `\n\nError: ${event.message}`;
          }
        },
      );
    } catch {
      streamedContent += "\n\nConnection failed. Check ANTHROPIC_API_KEY.";
      setChatMessages((prev) => {
        const updated = [...prev];
        updated[placeholderIdx] = { role: "assistant", content: streamedContent, tools: streamedTools };
        return updated;
      });
    }
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

              {/* ====== EVIDENCE SUMMARY (compact grid) ====== */}
              <div style={{ ...card, marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#0f172a" }}>Evidence Summary</h3>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 11, color: "#dc2626", display: "flex", alignItems: "center", gap: 3 }}><XCircle size={11} /> Pathogenic</span>
                    <span style={{ fontSize: 11, color: "#16a34a", display: "flex", alignItems: "center", gap: 3 }}><CheckCircle size={11} /> Benign</span>
                    <span style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 3 }}><MinusCircle size={11} /> Inconclusive</span>
                  </div>
                </div>

                {/* 3-column grid for density */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
                  {toolCalls.map((tc, i) => {
                    const source = EVIDENCE_SOURCES[tc.name] || { icon: "🔧", label: tc.label, desc: "", color: "#94a3b8" };
                    const { status, summary } = summarizeToolResult(tc.name, tc.result);
                    const statusColor = status === "positive" ? "#dc2626" : status === "negative" ? "#16a34a" : "#94a3b8";
                    return (
                      <div key={i} style={{
                        padding: "10px 12px", borderRadius: 8,
                        background: status === "positive" ? "#fef2f2" : status === "negative" ? "#f0fdf4" : "#f8fafc",
                        border: `1px solid ${status === "positive" ? "#fecaca" : status === "negative" ? "#bbf7d0" : "#e2e8f0"}`,
                        borderLeft: `3px solid ${statusColor}`,
                      }}>
                        {/* Header: icon + name */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 15 }}>{source.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{source.label}</span>
                        </div>
                        {/* Summary content */}
                        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{summary}</div>
                      </div>
                    );
                  })}
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

                <div className="clinical-report" style={{
                  background: "#fafbfd", border: "1px solid #e8ecf1", borderRadius: 10,
                  padding: "28px 32px",
                }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {report}
                  </ReactMarkdown>
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
                  <div className={msg.role === "assistant" ? "chat-md" : ""} style={{ fontSize: 14, lineHeight: 1.7, color: "#1e293b" }}>
                    {msg.role === "assistant" ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    ) : (
                      <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                    )}
                  </div>
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
            {chatLoading && (() => {
              // Show what the Agent is currently doing based on last message tools
              const last = chatMessages[chatMessages.length - 1];
              const tools = last?.tools || [];
              const lastTool = tools[tools.length - 1];
              const inProgress = lastTool && !lastTool.result;
              return (
                <div style={{ display: "flex", gap: 10, alignItems: "center", color: "#94a3b8" }}>
                  <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: 14 }}>
                    {inProgress
                      ? `Calling ${lastTool.label}...`
                      : last?.content
                        ? "Generating response..."
                        : "Agent is thinking..."}
                  </span>
                </div>
              );
            })()}
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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }

        /* Clinical report markdown styling */
        .clinical-report { font-family: 'Georgia', 'Times New Roman', serif; color: #1e293b; line-height: 1.75; }
        .clinical-report h1, .clinical-report h2 {
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 20px; font-weight: 700; color: #0f172a;
          margin: 0 0 16px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;
        }
        .clinical-report h3 {
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 15px; font-weight: 700; color: #1e3a5f;
          margin: 24px 0 10px; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .clinical-report h4 {
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 14px; font-weight: 600; color: #475569;
          margin: 16px 0 8px;
        }
        .clinical-report p { margin: 0 0 12px; font-size: 14px; }
        .clinical-report strong { color: #0f172a; font-weight: 700; }
        .clinical-report ul, .clinical-report ol { margin: 8px 0 16px; padding-left: 24px; }
        .clinical-report li { margin: 4px 0; font-size: 14px; }
        .clinical-report code {
          background: #f1f5f9; padding: 2px 6px; border-radius: 4px;
          font-family: 'Monaco', 'Consolas', monospace; font-size: 12px; color: #0f172a;
        }
        .clinical-report blockquote {
          border-left: 3px solid #3b82f6; padding: 8px 16px; margin: 12px 0;
          background: #eff6ff; color: #1e3a5f; font-style: italic;
        }
        .clinical-report table {
          border-collapse: collapse; width: 100%; margin: 12px 0;
          font-family: 'Inter', sans-serif; font-size: 13px;
        }
        .clinical-report th, .clinical-report td {
          border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left;
        }
        .clinical-report th { background: #f8fafc; font-weight: 600; }
        .clinical-report hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }

        /* Chat markdown — lighter than clinical report */
        .chat-md p { margin: 0 0 8px; }
        .chat-md p:last-child { margin-bottom: 0; }
        .chat-md ul, .chat-md ol { margin: 6px 0 8px; padding-left: 22px; }
        .chat-md li { margin: 2px 0; }
        .chat-md h1, .chat-md h2, .chat-md h3, .chat-md h4 {
          font-size: 14px; font-weight: 700; margin: 12px 0 6px; color: #0f172a;
        }
        .chat-md strong { color: #0f172a; font-weight: 600; }
        .chat-md code {
          background: #f1f5f9; padding: 1px 5px; border-radius: 3px;
          font-family: monospace; font-size: 12px;
        }
      `}</style>
    </div>
  );
}
