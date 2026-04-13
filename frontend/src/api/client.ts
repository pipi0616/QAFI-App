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
  getMethods: () => request<{ qafi: string[] }>("/predict/methods"),
  runPrediction: (data: { protein_id: string; method: string; model_type?: string }) =>
    request<any>("/predict/run", { method: "POST", body: JSON.stringify(data) }),
  getResults: (method: string, proteinId: string) =>
    request<any>(`/predict/results/${method}/${proteinId}`),
  lookupVariant: (proteinId: string, variant: string, method?: string) =>
    request<any>(`/predict/lookup/${proteinId}/${variant}${method ? `?method=${method}` : ""}`),

  // Analysis
  getFeatures: (proteinId: string) => request<any>(`/analysis/features/${proteinId}`),
  getDatasetOverview: () => request<any>("/analysis/dataset/overview"),
  getFeatureImportance: () => request<any>("/analysis/feature-importance"),

  // Agent (LangChain)
  assess: (data: { protein_id: string; gene: string; variant: string; language?: string }) =>
    request<any>("/agent/assess", { method: "POST", body: JSON.stringify(data) }),
  chat: (messages: { role: string; content: string }[], language?: string) =>
    request<any>("/agent/chat", {
      method: "POST",
      body: JSON.stringify({ messages, language: language ?? "en" }),
    }),
  tools: () => request<any>("/agent/tools"),
};
