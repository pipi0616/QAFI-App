import { useNavigate } from "react-router-dom";
import { useLang, t } from "../i18n";
import { ArrowRight, Dna, Database, Brain, MessageSquare, Shield, BookOpen, FlaskConical, Search } from "lucide-react";

// ============ Animated DNA Background ============

function DNABackground() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: 0.06, pointerEvents: "none" }}>
      <svg viewBox="0 0 800 600" style={{ width: "100%", height: "100%" }}>
        {/* Double helix */}
        {Array.from({ length: 20 }).map((_, i) => {
          const y = i * 30 + 10;
          const x1 = 400 + Math.sin(i * 0.5) * 150;
          const x2 = 400 - Math.sin(i * 0.5) * 150;
          return (
            <g key={i}>
              <circle cx={x1} cy={y} r={4} fill="#fff" />
              <circle cx={x2} cy={y} r={4} fill="#fff" />
              <line x1={x1} y1={y} x2={x2} y2={y} stroke="#fff" strokeWidth={1} opacity={0.5} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ============ Floating Variant Cards (visual decoration) ============

function FloatingCards() {
  const variants = [
    { name: "p.L117H", score: "1.06", cls: "VUS", color: "#fbbf24" },
    { name: "p.M1A", score: "1.12", cls: "LP", color: "#ef4444" },
    { name: "p.V116F", score: "1.12", cls: "VUS", color: "#fbbf24" },
    { name: "p.R230W", score: "0.85", cls: "LB", color: "#22c55e" },
  ];
  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 32 }}>
      {variants.map((v, i) => (
        <div
          key={i}
          style={{
            background: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
            padding: "14px 20px", minWidth: 140,
            animation: `float ${3 + i * 0.5}s ease-in-out infinite alternate`,
          }}
        >
          <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#fff" }}>{v.name}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Score: {v.score}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
              background: `${v.color}25`, color: v.color, border: `1px solid ${v.color}40`,
            }}>{v.cls}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ Source cards data ============

const SOURCES = [
  { name: "QAFI", desc_en: "ML-based functional impact prediction with 27 features", desc_zh: "基于 27 个特征的机器学习功能影响预测", color: "#3b82f6", icon: "🧬" },
  { name: "ClinVar", desc_en: "NCBI clinical variant significance database", desc_zh: "NCBI 临床变异意义数据库", color: "#10b981", icon: "🏥" },
  { name: "AlphaMissense", desc_en: "Google DeepMind deep learning pathogenicity predictor", desc_zh: "Google DeepMind 深度学习致病性预测", color: "#8b5cf6", icon: "🤖" },
  { name: "gnomAD", desc_en: "Population allele frequencies from ~800K individuals", desc_zh: "约 80 万人的群体等位基因频率", color: "#f59e0b", icon: "👥" },
  { name: "UniProt", desc_en: "Protein function, domains, and structural annotations", desc_zh: "蛋白质功能、结构域和结构注释", color: "#ec4899", icon: "🔬" },
  { name: "PubMed", desc_en: "Biomedical literature search for variant evidence", desc_zh: "生物医学文献检索变异证据", color: "#06b6d4", icon: "📚" },
  { name: "ACMG (RAG)", desc_en: "ACMG/AMP guidelines via retrieval-augmented generation", desc_zh: "通过检索增强生成查询 ACMG/AMP 指南", color: "#ef4444", icon: "📋" },
];

// ============ Main Component ============

export default function Landing() {
  const { lang } = useLang();
  const navigate = useNavigate();

  const features = [
    { icon: Search, title: t("feat1_title", lang), desc: t("feat1_desc", lang), color: "#3b82f6" },
    { icon: Database, title: t("feat2_title", lang), desc: t("feat2_desc", lang), color: "#10b981" },
    { icon: Brain, title: t("feat3_title", lang), desc: t("feat3_desc", lang), color: "#8b5cf6" },
    { icon: MessageSquare, title: t("feat4_title", lang), desc: t("feat4_desc", lang), color: "#f59e0b" },
  ];

  const workflow = [
    { step: "01", title: t("wf1", lang), desc: t("wf1_desc", lang), icon: "🧬" },
    { step: "02", title: t("wf2", lang), desc: t("wf2_desc", lang), icon: "🔍" },
    { step: "03", title: t("wf3", lang), desc: t("wf3_desc", lang), icon: "🧠" },
    { step: "04", title: t("wf4", lang), desc: t("wf4_desc", lang), icon: "📄" },
  ];

  return (
    <div style={{ maxWidth: "100%", overflow: "hidden" }}>
      {/* ====== HERO ====== */}
      <section
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f4c75 100%)",
          padding: "80px 40px 60px", color: "#fff", position: "relative", borderRadius: "0 0 24px 24px",
        }}
      >
        <DNABackground />
        <div style={{ position: "relative", maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.3)",
            borderRadius: 20, padding: "6px 16px", fontSize: 13, color: "#93c5fd", marginBottom: 24,
          }}>
            <Shield size={14} /> ACMG/AMP Compliant
          </div>

          <h1 style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.2, margin: "0 0 20px", whiteSpace: "pre-line" }}>
            {t("hero_title", lang)}
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "#cbd5e1", maxWidth: 650, margin: "0 auto 32px" }}>
            {t("hero_subtitle", lang)}
          </p>

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => navigate("/agent")}
              style={{
                padding: "14px 32px", borderRadius: 10, border: "none",
                background: "#3b82f6", color: "#fff", fontSize: 16, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                boxShadow: "0 4px 14px rgba(59,130,246,0.4)",
              }}
            >
              {t("hero_cta", lang)} <ArrowRight size={18} />
            </button>
            <button
              onClick={() => navigate("/agent")}
              style={{
                padding: "14px 32px", borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)",
                color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer",
                backdropFilter: "blur(4px)",
              }}
            >
              {t("hero_demo", lang)}
            </button>
          </div>

          {/* Floating variant cards */}
          <FloatingCards />
        </div>
      </section>

      {/* ====== STATS ====== */}
      <section style={{ maxWidth: 900, margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 1 }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16,
          background: "#fff", borderRadius: 16, padding: 24,
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0",
        }}>
          {[
            { value: "7", label: t("stat_sources", lang), icon: Database, color: "#3b82f6" },
            { value: "27", label: t("stat_features", lang), icon: FlaskConical, color: "#8b5cf6" },
            { value: "6,213", label: t("stat_variants", lang), icon: Dna, color: "#10b981" },
            { value: "2015", label: t("stat_standard", lang), icon: BookOpen, color: "#f59e0b" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, margin: "0 auto 10px",
                background: `${s.color}12`, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <s.icon size={22} color={s.color} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ====== FEATURES ====== */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "60px 20px" }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: "center", color: "#0f172a", marginBottom: 40 }}>
          {t("feat_title", lang)}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {features.map((f, i) => (
            <div
              key={i}
              style={{
                background: "#fff", borderRadius: 14, padding: 28,
                border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                transition: "box-shadow 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)")}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 12, marginBottom: 16,
                background: `${f.color}12`, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <f.icon size={24} color={f.color} />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ====== WORKFLOW ====== */}
      <section style={{ background: "#f8fafc", padding: "60px 20px", borderRadius: 24 }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: "center", color: "#0f172a", marginBottom: 48 }}>
            {t("workflow_title", lang)}
          </h2>
          <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
            {workflow.map((w, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", position: "relative" }}>
                {/* Connector line */}
                {i < workflow.length - 1 && (
                  <div style={{
                    position: "absolute", top: 30, left: "60%", width: "80%", height: 2,
                    background: "linear-gradient(to right, #3b82f6, #cbd5e1)", zIndex: 0,
                  }} />
                )}
                {/* Circle */}
                <div style={{
                  width: 60, height: 60, borderRadius: "50%", margin: "0 auto 16px",
                  background: "#fff", border: "3px solid #3b82f6",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 24, position: "relative", zIndex: 1,
                  boxShadow: "0 4px 12px rgba(59,130,246,0.15)",
                }}>
                  {w.icon}
                </div>
                <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 700, marginBottom: 4 }}>STEP {w.step}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>{w.title}</div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, whiteSpace: "pre-line" }}>{w.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== EVIDENCE SOURCES ====== */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "60px 20px" }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: "center", color: "#0f172a", marginBottom: 40 }}>
          {t("sources_title", lang)}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {SOURCES.map((s, i) => (
            <div
              key={i}
              style={{
                background: "#fff", borderRadius: 12, padding: "20px 16px", textAlign: "center",
                border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                gridColumn: i >= 4 ? undefined : undefined,
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color, marginBottom: 6 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
                {lang === "en" ? s.desc_en : s.desc_zh}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer style={{
        background: "#0f172a", color: "#94a3b8", padding: "40px 20px", borderRadius: "24px 24px 0 0",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#38bdf8", marginBottom: 8 }}>QAFI</div>
        <p style={{ fontSize: 13, maxWidth: 500, margin: "0 auto 16px", lineHeight: 1.6 }}>
          {t("footer_desc", lang)}
        </p>
        <p style={{ fontSize: 11, color: "#475569" }}>
          {t("footer_disclaimer", lang)}
        </p>
        <div style={{ marginTop: 16, fontSize: 12, color: "#475569" }}>
          © 2026 QAFI Project
        </div>
      </footer>

      {/* Keyframe animations */}
      <style>{`
        @keyframes float {
          0% { transform: translateY(0px); }
          100% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
