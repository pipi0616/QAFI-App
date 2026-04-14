/**
 * Detailed evidence tabs — reusable components showing rich data
 * from /api/predict/lookup for each evidence source.
 */
import { ExternalLink } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";

export interface LookupResult {
  variant: string; protein_id: string; protein_name: string;
  position: number; wt: string; mut: string;
  score: number; score_range: { min: number; max: number };
  percentile: number; classification: string; confidence: string; color: string; method: string;
  evidence: { feature: string; value: string; detail: string; impact: "damaging" | "moderate" | "benign" }[];
  position_context: {
    total_variants: number; mean_score: number; rank: number;
    variants: { variant: string; mut: string; score: number }[];
  };
  clinvar?: any;
  alphamissense?: any;
  gnomad?: any;
  literature?: any;
}

const IC = { damaging: "#dc2626", moderate: "#ca8a04", benign: "#16a34a" };
const IB = { damaging: "#fef2f2", moderate: "#fefce8", benign: "#f0fdf4" };

export function EvidenceTab({ result }: { result: LookupResult }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {result.evidence.map((e, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "flex-start", gap: 12, padding: 12,
          borderRadius: 8, background: IB[e.impact], border: `1px solid ${IC[e.impact]}20`,
        }}>
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
  );
}

export function ClinVarTab({ result }: { result: LookupResult }) {
  const cv = result.clinvar;
  if (!cv?.found) return (
    <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>Not found in ClinVar</div>
      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
        {cv?.same_gene_count ? `${cv.same_gene_count} other ${result.protein_name} variants in ClinVar.` : ""}
      </div>
    </div>
  );

  return (
    <div>
      {cv.exact_match && (
        <div style={{
          padding: 16, borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 12,
          background: cv.exact_match.significance.toLowerCase().includes("pathogenic") ? "#fef2f2"
            : cv.exact_match.significance.toLowerCase().includes("benign") ? "#f0fdf4" : "#fefce8",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{cv.exact_match.significance}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{cv.exact_match.review_status}</div>
              {cv.exact_match.traits.length > 0 && (
                <div style={{ fontSize: 13, marginTop: 6 }}>Condition: {cv.exact_match.traits.join(", ")}</div>
              )}
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                {cv.exact_match.num_submissions} submission(s)
                {cv.exact_match.last_evaluated && ` · ${cv.exact_match.last_evaluated.split(" ")[0]}`}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, letterSpacing: 2 }}>
                {"★".repeat(cv.exact_match.stars)}{"☆".repeat(4 - cv.exact_match.stars)}
              </div>
              <a href={cv.exact_match.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#3b82f6", display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: 4 }}>
                View <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </div>
      )}
      {cv.same_position?.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>
            Other variants at this position
          </div>
          {cv.same_position.map((v: any, i: number) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
              <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{v.protein_change}</span>
              <span style={{ color: "#64748b" }}>{v.significance || "N/A"}</span>
              <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", fontSize: 12 }}>View</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AlphaMissenseTab({ result }: { result: LookupResult }) {
  const am = result.alphamissense;
  if (!am?.available || !am.variant) {
    return <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>Not available</div>
    </div>;
  }
  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: 16, borderRadius: 8, marginBottom: 12,
        background: am.variant.am_class === "LPath" ? "#fef2f2" : am.variant.am_class === "LBen" ? "#f0fdf4" : "#fefce8",
        border: `1px solid ${am.variant.am_class_color}30`,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: am.variant.am_class_color }}>{am.variant.am_class_label}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>AlphaMissense (Google DeepMind)</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "monospace", color: am.variant.am_class_color }}>
            {am.variant.am_score.toFixed(2)}
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8" }}>0 = benign · 1 = pathogenic</div>
        </div>
      </div>
      {am.same_position?.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>
            All substitutions at position {result.position}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {am.same_position.map((v: any) => (
              <div key={v.variant} style={{
                padding: "4px 10px", borderRadius: 5, fontSize: 12, fontFamily: "monospace",
                background: v.variant === result.variant ? `${v.am_class_color}20` : "#f8fafc",
                border: v.variant === result.variant ? `2px solid ${v.am_class_color}` : "1px solid #e2e8f0",
                fontWeight: v.variant === result.variant ? 700 : 400,
              }}>
                <span style={{ color: v.am_class_color }}>{v.am_score.toFixed(2)}</span> {v.variant.slice(-1)}
              </div>
            ))}
          </div>
        </div>
      )}
      {am.summary && (
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          {[
            { l: "Pathogenic", c: am.summary.pathogenic, co: "#dc2626" },
            { l: "Ambiguous", c: am.summary.ambiguous, co: "#ca8a04" },
            { l: "Benign", c: am.summary.benign, co: "#16a34a" },
          ].map(s => (
            <div key={s.l} style={{ flex: 1, padding: 8, background: "#f8fafc", borderRadius: 6, textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: s.co }}>{s.c}</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function GnomadTab({ result }: { result: LookupResult }) {
  const gn = result.gnomad;
  if (!gn?.available || !gn.variant) {
    return <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8 }}>Not available</div>;
  }
  const v = gn.variant;
  return (
    <div>
      <div style={{
        padding: 16, borderRadius: 8, marginBottom: 12,
        background: v.allele_freq === 0 ? "#fef2f2" : "#f8fafc",
        border: `1px solid ${v.freq_color}30`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: v.freq_color }}>{v.freq_label}</div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{v.freq_interpretation}</div>
            {v.rsids?.length > 0 && (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                rsID: {v.rsids.map((rs: string) => (
                  <a key={rs} href={`https://www.ncbi.nlm.nih.gov/snp/${rs}`} target="_blank" rel="noopener noreferrer"
                    style={{ color: "#3b82f6", marginRight: 6 }}>{rs}</a>
                ))}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace", color: v.freq_color }}>
              {v.allele_freq === 0 ? "0" : v.allele_freq < 0.001 ? v.allele_freq.toExponential(2) : v.allele_freq.toFixed(4)}
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8" }}>Allele Frequency</div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        {[
          { l: "Allele Count", v: v.allele_count.toLocaleString() },
          { l: "Allele Number", v: v.allele_number ? v.allele_number.toLocaleString() : "—" },
          { l: "Homozygotes", v: v.homozygote_count.toLocaleString() },
          { l: "Gene Missense", v: gn.gene_missense_count.toLocaleString() },
        ].map(s => (
          <div key={s.l} style={{ flex: 1, padding: 10, background: "#f8fafc", borderRadius: 6, textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{s.v}</div>
            <div style={{ fontSize: 10, color: "#94a3b8" }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: 12, background: "#eff6ff", borderRadius: 8, fontSize: 12, color: "#1e40af" }}>
        <strong>ACMG:</strong> AF &gt; 5% = BA1 (benign). Absent from gnomAD = PM2 (moderate pathogenic).
      </div>
    </div>
  );
}

function ArticleCard({ article }: { article: { pmid: string; title: string; authors: string; journal: string; year: string; url: string } }) {
  return (
    <div style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
      <a href={article.url} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", textDecoration: "none", lineHeight: 1.4, display: "block" }}>
        {article.title}
      </a>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
        {article.authors} · <em>{article.journal}</em> · {article.year}{" "}
        <span style={{ color: "#3b82f6" }}>PMID:{article.pmid}</span>
      </div>
    </div>
  );
}

export function LiteratureTab({ result }: { result: LookupResult }) {
  const lit = result.literature;
  if (!lit) return <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8 }}>Not available</div>;
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
          Variant-Specific ({lit.variant_search_count})
        </div>
        {lit.variant_articles.length > 0
          ? lit.variant_articles.map((a: any) => <ArticleCard key={a.pmid} article={a} />)
          : <div style={{ padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#64748b" }}>
              No publications for this specific variant (novel/unreported).
            </div>}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
          {result.protein_name} Clinical Papers ({lit.gene_search_count})
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>{lit.total_gene_papers} total gene papers</div>
        {lit.gene_articles.length > 0
          ? lit.gene_articles.map((a: any) => <ArticleCard key={a.pmid} article={a} />)
          : <div style={{ padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#64748b" }}>
              No clinical publications found.
            </div>}
      </div>
    </div>
  );
}

export function PositionTab({ result }: { result: LookupResult }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>
        {result.position_context.total_variants} substitutions ·
        Rank <strong>#{result.position_context.rank}</strong> of {result.position_context.total_variants}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={result.position_context.variants} margin={{ left: 10, right: 10 }}>
          <XAxis dataKey="mut" tick={{ fontSize: 12, fontFamily: "monospace" }} />
          <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8, fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{d.variant}</div><div>Score: {d.score.toFixed(4)}</div>
            </div>;
          }} />
          <ReferenceLine y={result.score} stroke={result.color} strokeDasharray="4 4" />
          <Bar dataKey="score" radius={[3, 3, 0, 0]}>
            {result.position_context.variants.map((v, i) => (
              <Cell key={i} fill={v.variant === result.variant ? result.color : "#cbd5e1"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
            <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, color: "#64748b" }}>Variant</th>
            <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, color: "#64748b" }}>Sub</th>
            <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, color: "#64748b" }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {result.position_context.variants.map(v => (
            <tr key={v.variant} style={{
              borderBottom: "1px solid #f1f5f9",
              background: v.variant === result.variant ? `${result.color}08` : "transparent",
              fontWeight: v.variant === result.variant ? 700 : 400,
            }}>
              <td style={{ padding: "6px 10px", fontSize: 12, fontFamily: "monospace" }}>
                {v.variant}
                {v.variant === result.variant && (
                  <span style={{ color: result.color, fontSize: 10, marginLeft: 4 }}>current</span>
                )}
              </td>
              <td style={{ padding: "6px 10px", fontSize: 12 }}>{result.wt}→{v.mut}</td>
              <td style={{ padding: "6px 10px", fontSize: 12, fontFamily: "monospace" }}>{v.score.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
