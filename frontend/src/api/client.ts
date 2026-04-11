const BASE_URL = "http://localhost:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  // Prediction
  getProteins: () => request<{ proteins: any[] }>("/predict/proteins"),
  getProtein: (id: string) => request<any>(`/predict/proteins/${id}`),
  getMethods: () => request<{ psp: string[]; qafi: string[] }>("/predict/methods"),
  runPrediction: (data: { protein_id: string; method: string; model_type: string }) =>
    request<any>("/predict/run", { method: "POST", body: JSON.stringify(data) }),

  // Analysis
  getFeatures: (proteinId: string) => request<any>(`/analysis/features/${proteinId}`),
  getDatasetOverview: () => request<any>("/analysis/dataset/overview"),
  getFeatureImportance: () => request<any>("/analysis/feature-importance"),

  // Agent
  chat: (messages: { role: string; content: string }[]) =>
    request<{ reply: string; tool_calls: any[] }>("/agent/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
};
