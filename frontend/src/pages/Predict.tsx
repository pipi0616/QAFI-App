import { useEffect, useState } from "react";
import { api } from "../api/client";

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  border: "1px solid #e2e8f0",
};

const btnStyle: React.CSSProperties = {
  padding: "10px 24px",
  background: "#3b82f6",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

export default function Predict() {
  const [proteins, setProteins] = useState<any[]>([]);
  const [methods, setMethods] = useState<{ psp: string[]; qafi: string[] }>({ psp: [], qafi: [] });
  const [selectedProtein, setSelectedProtein] = useState("");
  const [modelType, setModelType] = useState<"psp" | "qafi">("psp");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    Promise.all([api.getProteins(), api.getMethods()]).then(([p, m]) => {
      setProteins(p.proteins);
      setMethods(m);
      if (p.proteins.length) setSelectedProtein(p.proteins[0].protein_id);
      if (m.psp.length) setSelectedMethod(m.psp[0]);
    });
  }, []);

  const currentMethods = modelType === "psp" ? methods.psp : methods.qafi;

  useEffect(() => {
    if (currentMethods.length) setSelectedMethod(currentMethods[0]);
  }, [modelType]);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await api.runPrediction({
        protein_id: selectedProtein,
        method: selectedMethod,
        model_type: modelType,
      });
      setResult(res);
    } catch (e: any) {
      setResult({ success: false, error: e.message });
    }
    setRunning(false);
  };

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
        Variant Prediction
      </h2>
      <p style={{ color: "#64748b", marginBottom: 28 }}>
        Run PSP or QAFI models to predict functional impact of protein variants
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Configuration */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Configuration</h3>

          {/* Protein */}
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
            Protein
          </label>
          <select
            value={selectedProtein}
            onChange={(e) => setSelectedProtein(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {proteins.map((p) => (
              <option key={p.protein_id} value={p.protein_id}>
                {p.protein_id}
              </option>
            ))}
          </select>

          {/* Model Type */}
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
            Model Type
          </label>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["psp", "qafi"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setModelType(t)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: modelType === t ? "2px solid #3b82f6" : "1px solid #cbd5e1",
                  background: modelType === t ? "#eff6ff" : "#fff",
                  color: modelType === t ? "#3b82f6" : "#64748b",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Method */}
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
            Method
          </label>
          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            {currentMethods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <button onClick={handleRun} disabled={running} style={{ ...btnStyle, opacity: running ? 0.6 : 1 }}>
            {running ? "Running..." : "Run Prediction"}
          </button>
        </div>

        {/* Results */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Results</h3>
          {result ? (
            <div>
              <div
                style={{
                  display: "inline-block",
                  padding: "4px 12px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 12,
                  background: result.success ? "#dcfce7" : "#fee2e2",
                  color: result.success ? "#166534" : "#991b1b",
                }}
              >
                {result.success ? "Success" : "Failed"}
              </div>
              <div style={{ fontSize: 13, color: "#475569", marginBottom: 8 }}>
                <strong>Protein:</strong> {result.protein_id} &nbsp;|&nbsp;
                <strong>Method:</strong> {result.method}
              </div>
              <pre
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: 16,
                  fontSize: 12,
                  maxHeight: 400,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {result.output || result.error || "No output"}
              </pre>
            </div>
          ) : (
            <p style={{ color: "#94a3b8", fontSize: 14 }}>
              Select a protein and method, then click "Run Prediction" to see results.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
