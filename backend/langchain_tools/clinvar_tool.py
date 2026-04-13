"""ClinVar tool — query NCBI ClinVar for clinical significance."""

import time
import requests
from langchain_core.tools import tool

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

AA1_TO_3 = {
    "A": "Ala", "R": "Arg", "N": "Asn", "D": "Asp", "C": "Cys",
    "Q": "Gln", "E": "Glu", "G": "Gly", "H": "His", "I": "Ile",
    "L": "Leu", "K": "Lys", "M": "Met", "F": "Phe", "P": "Pro",
    "S": "Ser", "T": "Thr", "W": "Trp", "Y": "Tyr", "V": "Val",
}

REVIEW_STARS = {
    "practice guideline": 4,
    "reviewed by expert panel": 3,
    "criteria provided, multiple submitters, no conflicts": 2,
    "criteria provided, single submitter": 1,
    "no assertion criteria provided": 0,
}


@tool
def clinvar_lookup(gene: str, wt: str, position: int, mut: str) -> dict:
    """Search ClinVar for a variant's clinical significance.
    Returns classification (pathogenic/benign/VUS), review stars, associated conditions.
    Use this when asked about clinical evidence or ClinVar status of a variant."""

    wt3 = AA1_TO_3.get(wt, wt)
    mut3 = AA1_TO_3.get(mut, mut)

    # Search ClinVar
    term = f'{gene}[gene] AND ("{wt3}{position}{mut3}" OR "{wt}{position}{mut}")'
    try:
        r = requests.get(f"{EUTILS}/esearch.fcgi",
                         params={"db": "clinvar", "term": term, "retmode": "json", "retmax": 5}, timeout=10)
        ids = r.json().get("esearchresult", {}).get("idlist", [])
    except Exception:
        ids = []

    if not ids:
        # Get gene-level count
        time.sleep(0.35)
        try:
            r2 = requests.get(f"{EUTILS}/esearch.fcgi",
                              params={"db": "clinvar", "term": f"{gene}[gene]", "retmode": "json", "retmax": 0}, timeout=10)
            gene_count = int(r2.json().get("esearchresult", {}).get("count", 0))
        except Exception:
            gene_count = 0

        return {
            "found": False,
            "variant": f"{wt}{position}{mut}",
            "gene": gene,
            "message": f"Not found in ClinVar. {gene_count} other {gene} variants exist in ClinVar.",
            "gene_variant_count": gene_count,
        }

    # Get details
    time.sleep(0.35)
    try:
        r = requests.get(f"{EUTILS}/esummary.fcgi",
                         params={"db": "clinvar", "id": ",".join(ids), "retmode": "json"}, timeout=10)
        data = r.json().get("result", {})
    except Exception:
        return {"found": False, "error": "Failed to fetch details"}

    # Parse first match
    for uid in data.get("uids", []):
        rec = data[uid]
        germline = rec.get("germline_classification", {})
        return {
            "found": True,
            "variant": f"{wt}{position}{mut}",
            "gene": gene,
            "significance": germline.get("description", "Not provided"),
            "review_status": germline.get("review_status", ""),
            "stars": REVIEW_STARS.get(germline.get("review_status", ""), 0),
            "last_evaluated": germline.get("last_evaluated", ""),
            "accession": rec.get("accession", ""),
            "url": f"https://www.ncbi.nlm.nih.gov/clinvar/variation/{rec.get('accession', '').replace('VCV', '')}/",
        }

    return {"found": False, "variant": f"{wt}{position}{mut}"}
