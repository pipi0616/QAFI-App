import { useState, useRef, useEffect } from "react";
import { api } from "../api/client";
import { Send, Bot, User, Wrench } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: any[];
}

export default function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const apiMessages = newMessages.map((m) => ({ role: m.role, content: m.content }));
      const res = await api.chat(apiMessages);
      setMessages([...newMessages, { role: "assistant", content: res.reply, toolCalls: res.tool_calls }]);
    } catch (e: any) {
      setMessages([
        ...newMessages,
        { role: "assistant", content: `Error: ${e.message}. Make sure ANTHROPIC_API_KEY is set.` },
      ]);
    }
    setLoading(false);
  };

  const suggestions = [
    "What proteins are available for analysis?",
    "What prediction methods can I use?",
    "Explain the difference between PSP and QAFI models",
    "How does QAFI predict variant pathogenicity?",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
          AI Agent
        </h2>
        <p style={{ color: "#64748b", fontSize: 14 }}>
          Ask questions about variant analysis in natural language
        </p>
      </div>

      {/* Chat area */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          padding: 20,
          marginBottom: 16,
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <Bot size={48} color="#94a3b8" style={{ marginBottom: 16 }} />
            <p style={{ color: "#64748b", fontSize: 15, marginBottom: 20 }}>
              I'm the QAFI Analysis Agent. Ask me anything about protein variant prediction.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    fontSize: 13,
                    color: "#475569",
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: msg.role === "user" ? "#3b82f6" : "#0f172a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {msg.role === "user" ? (
                  <User size={16} color="#fff" />
                ) : (
                  <Bot size={16} color="#38bdf8" />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "#1e293b",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.content}
                </div>

                {/* Tool calls */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {msg.toolCalls.map((tc, j) => (
                      <details
                        key={j}
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 8,
                          padding: "8px 12px",
                          marginTop: 4,
                          fontSize: 12,
                        }}
                      >
                        <summary style={{ cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                          <Wrench size={12} /> {tc.tool}({JSON.stringify(tc.input)})
                        </summary>
                        <pre style={{ marginTop: 8, fontSize: 11, color: "#475569", whiteSpace: "pre-wrap" }}>
                          {tc.output}
                        </pre>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#94a3b8" }}>
            <Bot size={20} />
            <span style={{ fontSize: 14 }}>Thinking...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Ask about protein variant analysis..."
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            padding: "12px 20px",
            borderRadius: 12,
            border: "none",
            background: "#3b82f6",
            color: "#fff",
            cursor: "pointer",
            opacity: loading || !input.trim() ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
