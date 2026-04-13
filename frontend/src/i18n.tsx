import { createContext, useContext, useState, ReactNode } from "react";

type Lang = "en" | "zh";

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "en",
  setLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

// All translations
export const T: Record<string, Record<Lang, string>> = {
  // Nav
  nav_home: { en: "Home", zh: "首页" },
  nav_predict: { en: "Prediction", zh: "变异预测" },
  nav_interpret: { en: "Interpretation", zh: "特征解读" },
  nav_agent: { en: "LangChain Agent", zh: "智能分析" },

  // Landing - Hero
  hero_title: {
    en: "Clinical Variant Interpretation,\nPowered by AI",
    zh: "AI 驱动的\n临床变异解读平台",
  },
  hero_subtitle: {
    en: "Comprehensive assessment of protein variant pathogenicity using machine learning prediction, multi-database evidence integration, and ACMG-based classification.",
    zh: "结合机器学习预测、多数据库证据整合和 ACMG 标准分类，提供全面的蛋白质变异致病性评估。",
  },
  hero_cta: { en: "Start Analysis", zh: "开始分析" },
  hero_demo: { en: "View Demo", zh: "查看演示" },

  // Stats
  stat_sources: { en: "Evidence Sources", zh: "证据来源" },
  stat_features: { en: "ML Features", zh: "机器学习特征" },
  stat_variants: { en: "Variants Analyzed", zh: "可分析变异" },
  stat_standard: { en: "ACMG Standard", zh: "ACMG 标准" },

  // Features
  feat_title: { en: "What QAFI Can Do", zh: "QAFI 能做什么" },
  feat1_title: { en: "Variant Pathogenicity Prediction", zh: "变异致病性预测" },
  feat1_desc: {
    en: "QAFI cross-protein generalization model predicts functional impact from 27 evolutionary, structural, and neighborhood features.",
    zh: "QAFI 跨蛋白泛化模型，利用 27 个进化、结构和邻域特征预测变异功能影响。",
  },
  feat2_title: { en: "Multi-Evidence Integration", zh: "多证据综合" },
  feat2_desc: {
    en: "Automatically queries ClinVar, gnomAD, AlphaMissense, UniProt, and PubMed to gather comprehensive evidence.",
    zh: "自动查询 ClinVar、gnomAD、AlphaMissense、UniProt 和 PubMed，收集全面证据。",
  },
  feat3_title: { en: "AI Clinical Report", zh: "AI 临床报告" },
  feat3_desc: {
    en: "AI agent synthesizes all evidence into a structured clinical report with ACMG classification, ready for medical records.",
    zh: "AI 智能体综合所有证据，生成结构化临床报告，包含 ACMG 分类，可直接用于病历。",
  },
  feat4_title: { en: "Clinical Consultation", zh: "临床咨询" },
  feat4_desc: {
    en: "Describe complex clinical scenarios in natural language. The AI agent dynamically queries databases and reasons through evidence.",
    zh: "用自然语言描述复杂临床场景，AI 智能体动态查询数据库并推理分析。",
  },

  // Workflow
  workflow_title: { en: "How It Works", zh: "工作流程" },
  wf1: { en: "Enter Variant", zh: "输入变异" },
  wf1_desc: { en: "Gene name + variant\ne.g. NDUFAF1 L117H", zh: "基因名 + 变异\n如 NDUFAF1 L117H" },
  wf2: { en: "AI Gathers Evidence", zh: "AI 收集证据" },
  wf2_desc: { en: "Agent queries 7 databases\nautomatically", zh: "智能体自动查询\n7 个数据库" },
  wf3: { en: "Synthesize & Classify", zh: "综合分析分类" },
  wf3_desc: { en: "ACMG criteria applied\nConflicts resolved", zh: "应用 ACMG 标准\n解决证据冲突" },
  wf4: { en: "Clinical Report", zh: "生成报告" },
  wf4_desc: { en: "Structured report with\nclassification & recommendation", zh: "结构化报告\n含分类和建议" },

  // Sources
  sources_title: { en: "Evidence Sources", zh: "证据来源" },

  // Footer
  footer_desc: {
    en: "Quantitative Assessment of Functional Impact — A machine learning framework for protein variant interpretation.",
    zh: "QAFI（功能影响定量评估）— 基于机器学习的蛋白质变异解读框架。",
  },
  footer_disclaimer: {
    en: "For research use only. Not a substitute for professional clinical judgment.",
    zh: "仅供研究使用，不能替代专业临床判断。",
  },
};

export function t(key: string, lang: Lang): string {
  return T[key]?.[lang] ?? key;
}
