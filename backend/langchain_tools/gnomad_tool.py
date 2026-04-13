"""gnomAD tool — query population allele frequencies."""

from functools import lru_cache
import requests
from langchain_core.tools import tool

GNOMAD_API = "https://gnomad.broadinstitute.org/api"

AA1_TO_3 = {
    "A": "Ala", "R": "Arg", "N": "Asn", "D": "Asp", "C": "Cys",
    "Q": "Gln", "E": "Glu", "G": "Gly", "H": "His", "I": "Ile",
    "L": "Leu", "K": "Lys", "M": "Met", "F": "Phe", "P": "Pro",
    "S": "Ser", "T": "Thr", "W": "Trp", "Y": "Tyr", "V": "Val",
}


@lru_cache(maxsize=16)
def _fetch_gene_variants(gene: str) -> list:
    query = '{gene(gene_symbol: "' + gene + '", reference_genome: GRCh38) { variants(dataset: gnomad_r4) { variant_id hgvsp consequence exome { ac an af homozygote_count } genome { ac an af homozygote_count } } } }'
    try:
        r = requests.post(GNOMAD_API, json={"query": query}, timeout=30)
        return r.json().get("data", {}).get("gene", {}).get("variants", [])
    except Exception:
        return []


@tool
def gnomad_frequency(gene: str, wt: str, position: int, mut: str) -> dict:
    """Query gnomAD for variant population frequency.
    Returns allele frequency, allele count, and clinical interpretation.
    Absent from gnomAD supports ACMG PM2 criterion.
    Use this when asked about how common a variant is in the general population."""

    target = f"p.{AA1_TO_3.get(wt, wt)}{position}{AA1_TO_3.get(mut, mut)}"
    variants = _fetch_gene_variants(gene)

    for v in variants:
        if v.get("hgvsp") == target:
            ex = v.get("exome") or {}
            ge = v.get("genome") or {}
            af = ex.get("af") or ge.get("af") or 0
            ac = (ex.get("ac") or 0) + (ge.get("ac") or 0)
            hom = (ex.get("homozygote_count") or 0) + (ge.get("homozygote_count") or 0)

            if af == 0:
                interp = "Absent — supports ACMG PM2 (moderate pathogenic)"
            elif af < 0.0001:
                interp = f"Ultra-rare (AF={af:.2e}) — does not rule out pathogenicity"
            elif af < 0.01:
                interp = f"Rare (AF={af:.4f}) — less likely pathogenic for dominant disease"
            else:
                interp = f"Common (AF={af:.4f}) — likely benign (ACMG BA1 if >5%)"

            return {
                "variant": f"{wt}{position}{mut}",
                "allele_freq": af,
                "allele_count": ac,
                "homozygotes": hom,
                "interpretation": interp,
            }

    # Not found = absent
    missense_count = sum(1 for v in variants if v.get("consequence") == "missense_variant")
    return {
        "variant": f"{wt}{position}{mut}",
        "allele_freq": 0,
        "allele_count": 0,
        "homozygotes": 0,
        "interpretation": f"Absent from gnomAD (~800k individuals) — supports ACMG PM2. {missense_count} missense variants in {gene} found in gnomAD.",
    }
