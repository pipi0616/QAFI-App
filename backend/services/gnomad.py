"""
gnomAD Service — query population allele frequencies from gnomAD.

Uses gnomAD GraphQL API (free, no key needed).
Key clinical question: "How common is this variant in the general population?"
  - Very rare (AF < 0.0001) → more likely pathogenic
  - Common (AF > 0.01) → likely benign (too common to cause rare disease)
"""

from functools import lru_cache
import requests

GNOMAD_API = "https://gnomad.broadinstitute.org/api"

# 1-letter to 3-letter AA mapping
AA1_TO_3 = {
    "A": "Ala", "R": "Arg", "N": "Asn", "D": "Asp", "C": "Cys",
    "Q": "Gln", "E": "Glu", "G": "Gly", "H": "His", "I": "Ile",
    "L": "Leu", "K": "Lys", "M": "Met", "F": "Phe", "P": "Pro",
    "S": "Ser", "T": "Thr", "W": "Trp", "Y": "Tyr", "V": "Val",
}

QUERY_TEMPLATE = """{{
  gene(gene_symbol: "{gene}", reference_genome: GRCh38) {{
    gene_id
    symbol
    variants(dataset: gnomad_r4) {{
      variant_id
      pos
      rsids
      hgvsp
      consequence
      exome {{ ac an af homozygote_count }}
      genome {{ ac an af homozygote_count }}
    }}
  }}
}}"""


def _variant_to_hgvsp(wt: str, position: int, mut: str) -> str:
    """Convert L117H to p.Leu117His format used by gnomAD."""
    wt3 = AA1_TO_3.get(wt, wt)
    mut3 = AA1_TO_3.get(mut, mut)
    return f"p.{wt3}{position}{mut3}"


@lru_cache(maxsize=32)
def _fetch_gene_variants(gene_symbol: str) -> list[dict] | None:
    """Fetch all variants for a gene from gnomAD. Cached per gene."""
    try:
        query = QUERY_TEMPLATE.format(gene=gene_symbol)
        r = requests.post(
            GNOMAD_API,
            json={"query": query},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        return data.get("data", {}).get("gene", {}).get("variants", [])
    except Exception:
        return None


def _parse_variant(v: dict) -> dict:
    """Parse a gnomAD variant record into a clean dict."""
    exome = v.get("exome") or {}
    genome = v.get("genome") or {}

    # Combined allele frequency and counts
    ac = (exome.get("ac") or 0) + (genome.get("ac") or 0)
    an = (exome.get("an") or 0) + (genome.get("an") or 0)
    af = exome.get("af") or genome.get("af") or 0
    hom = (exome.get("homozygote_count") or 0) + (genome.get("homozygote_count") or 0)

    # Population breakdown (pick the one with data)
    populations = {}
    pop_data = exome.get("populations") or genome.get("populations") or []
    for p in pop_data:
        if p["ac"] and p["ac"] > 0:
            populations[p["id"]] = {
                "ac": p["ac"],
                "an": p["an"],
                "af": p["af"],
            }

    # Clinical interpretation of frequency
    if af == 0:
        freq_label = "Absent"
        freq_interpretation = "Not observed in gnomAD — consistent with pathogenic"
        freq_color = "#dc2626"
    elif af < 0.00001:
        freq_label = "Ultra-rare"
        freq_interpretation = f"Extremely rare (AF={af:.2e}) — does not rule out pathogenicity"
        freq_color = "#ea580c"
    elif af < 0.0001:
        freq_label = "Rare"
        freq_interpretation = f"Rare variant (AF={af:.2e}) — compatible with recessive disease"
        freq_color = "#ca8a04"
    elif af < 0.01:
        freq_label = "Low frequency"
        freq_interpretation = f"Low frequency (AF={af:.4f}) — less likely to cause rare disease"
        freq_color = "#2563eb"
    else:
        freq_label = "Common"
        freq_interpretation = f"Common variant (AF={af:.4f}) — likely benign"
        freq_color = "#16a34a"

    return {
        "variant_id": v.get("variant_id", ""),
        "hgvsp": v.get("hgvsp", ""),
        "rsids": v.get("rsids", []),
        "consequence": v.get("consequence", ""),
        "allele_count": ac,
        "allele_number": an,
        "allele_freq": af,
        "homozygote_count": hom,
        "populations": populations,
        "freq_label": freq_label,
        "freq_interpretation": freq_interpretation,
        "freq_color": freq_color,
    }


def lookup_variant(gene_symbol: str, wt: str, position: int, mut: str) -> dict:
    """
    Look up a variant's population frequency in gnomAD.

    Returns:
        {
            "available": bool,
            "variant": parsed variant or None,
            "same_position": [other variants at this position],
            "gene_missense_count": total missense variants in gene,
        }
    """
    all_variants = _fetch_gene_variants(gene_symbol)
    if all_variants is None:
        return {"available": False, "variant": None, "same_position": [], "gene_missense_count": 0}

    target_hgvsp = _variant_to_hgvsp(wt, position, mut)

    exact = None
    same_position = []
    missense_count = 0

    for v in all_variants:
        if v.get("consequence") == "missense_variant":
            missense_count += 1

        hgvsp = v.get("hgvsp", "")
        if hgvsp == target_hgvsp:
            exact = _parse_variant(v)
        elif hgvsp and f"{position}" in hgvsp:
            # Check if same position (e.g. p.Leu117Pro)
            wt3 = AA1_TO_3.get(wt, "")
            if f"{wt3}{position}" in hgvsp:
                same_position.append(_parse_variant(v))

    # Sort same_position by AF descending
    same_position.sort(key=lambda x: x["allele_freq"], reverse=True)

    # If not found, create "absent" entry
    if exact is None:
        exact = {
            "variant_id": "",
            "hgvsp": target_hgvsp,
            "rsids": [],
            "consequence": "missense_variant",
            "allele_count": 0,
            "allele_number": 0,
            "allele_freq": 0,
            "homozygote_count": 0,
            "populations": {},
            "freq_label": "Absent",
            "freq_interpretation": "Not observed in gnomAD — consistent with pathogenic",
            "freq_color": "#dc2626",
        }

    return {
        "available": True,
        "variant": exact,
        "same_position": same_position[:10],
        "gene_missense_count": missense_count,
    }
