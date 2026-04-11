"""
ClinVar Service — query NCBI ClinVar for variant clinical significance.

Uses NCBI E-utilities API (free, no key required, rate limit ~3 req/sec).
Docs: https://www.ncbi.nlm.nih.gov/clinvar/docs/maintenance/eutils/

Two query strategies:
1. By protein change (e.g. "NDUFAF1 L117H") — exact variant match
2. By gene + position — find all variants near a position
"""

import time
import urllib.parse
import requests

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

# Amino acid 3-letter to 1-letter mapping (for matching protein_change field)
AA3_TO_1 = {
    "Ala": "A", "Arg": "R", "Asn": "N", "Asp": "D", "Cys": "C",
    "Gln": "Q", "Glu": "E", "Gly": "G", "His": "H", "Ile": "I",
    "Leu": "L", "Lys": "K", "Met": "M", "Phe": "F", "Pro": "P",
    "Ser": "S", "Thr": "T", "Trp": "W", "Tyr": "Y", "Val": "V",
}
AA1_TO_3 = {v: k for k, v in AA3_TO_1.items()}

# Review status to stars mapping
REVIEW_STARS = {
    "practice guideline": 4,
    "reviewed by expert panel": 3,
    "criteria provided, multiple submitters, no conflicts": 2,
    "criteria provided, conflicting classifications": 1,
    "criteria provided, single submitter": 1,
    "no assertion criteria provided": 0,
    "no classification provided": 0,
}


def _esearch(term: str, retmax: int = 50) -> list[str]:
    """Search ClinVar and return list of UIDs."""
    url = f"{EUTILS_BASE}/esearch.fcgi"
    params = {"db": "clinvar", "term": term, "retmode": "json", "retmax": retmax}
    try:
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        return r.json().get("esearchresult", {}).get("idlist", [])
    except Exception:
        return []


def _esummary(uids: list[str]) -> dict:
    """Get summary info for ClinVar UIDs."""
    if not uids:
        return {}
    url = f"{EUTILS_BASE}/esummary.fcgi"
    params = {"db": "clinvar", "id": ",".join(uids[:20]), "retmode": "json"}
    try:
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json().get("result", {})
        data.pop("uids", None)
        return data
    except Exception:
        return {}


def _parse_variant_record(record: dict) -> dict:
    """Parse a ClinVar esummary record into a clean dict."""
    title = record.get("title", "")
    protein_change = record.get("protein_change", "")
    accession = record.get("accession", "")

    # Get germline classification (the main one for constitutional variants)
    germline = record.get("germline_classification", {})
    significance = germline.get("description", "")
    review_status = germline.get("review_status", "")
    last_evaluated = germline.get("last_evaluated", "")

    # Traits (associated conditions)
    traits = []
    for ts in germline.get("trait_set", []):
        name = ts.get("trait_name", "")
        if name and name != "not provided":
            traits.append(name)

    # Stars
    stars = REVIEW_STARS.get(review_status, 0)

    # Submissions
    submissions = record.get("supporting_submissions", {})
    num_submissions = len(submissions.get("scv", []))

    # cDNA change
    cdna_change = ""
    for vs in record.get("variation_set", []):
        cdna_change = vs.get("cdna_change", "")
        if cdna_change:
            break

    # Molecular consequence
    consequences = record.get("molecular_consequence_list", [])

    return {
        "accession": accession,
        "title": title,
        "protein_change": protein_change,
        "cdna_change": cdna_change,
        "significance": significance,
        "review_status": review_status,
        "stars": stars,
        "last_evaluated": last_evaluated,
        "traits": traits,
        "num_submissions": num_submissions,
        "consequences": consequences,
        "url": f"https://www.ncbi.nlm.nih.gov/clinvar/variation/{accession.replace('VCV', '')}/",
    }


def variant_to_search_terms(gene: str, wt: str, position: int, mut: str) -> list[str]:
    """Generate ClinVar search terms for a variant."""
    wt3 = AA1_TO_3.get(wt, wt)
    mut3 = AA1_TO_3.get(mut, mut)

    return [
        # Most specific: gene + protein change
        f'{gene}[gene] AND "{wt3}{position}{mut3}"',
        # By protein change notation
        f'{gene}[gene] AND "{wt}{position}{mut}"',
        # Broader: gene + position
        f'{gene}[gene] AND {position}[Protein position]',
    ]


def lookup_variant(gene: str, wt: str, position: int, mut: str) -> dict:
    """
    Look up a variant in ClinVar.

    Returns:
        {
            "found": bool,
            "exact_match": variant record or None,
            "same_position": [records at same position],
            "same_gene_count": total variants in gene,
        }
    """
    target_change = f"{wt}{position}{mut}"

    # Strategy 1: Search for exact variant
    search_terms = variant_to_search_terms(gene, wt, position, mut)

    all_uids = set()
    for term in search_terms[:2]:  # Try exact searches first
        uids = _esearch(term)
        all_uids.update(uids)
        if uids:
            break
        time.sleep(0.35)  # Rate limit

    # Strategy 2: Also get all variants at this position
    time.sleep(0.35)
    pos_uids = _esearch(search_terms[2], retmax=50)
    all_uids.update(pos_uids)

    # Get total count for this gene
    time.sleep(0.35)
    gene_uids = _esearch(f"{gene}[gene]", retmax=1)
    gene_search_url = f"{EUTILS_BASE}/esearch.fcgi"
    try:
        r = requests.get(gene_search_url, params={
            "db": "clinvar", "term": f"{gene}[gene]", "retmode": "json", "retmax": 0
        }, timeout=10)
        gene_count = int(r.json().get("esearchresult", {}).get("count", 0))
    except Exception:
        gene_count = 0

    if not all_uids:
        return {
            "found": False,
            "exact_match": None,
            "same_position": [],
            "same_gene_count": gene_count,
            "query": {"gene": gene, "variant": target_change},
        }

    # Fetch details
    records = _esummary(list(all_uids))

    exact_match = None
    same_position = []

    for uid, record in records.items():
        parsed = _parse_variant_record(record)

        # Check if this is our exact variant
        pc = parsed["protein_change"].upper()
        if pc == target_change.upper() or pc == f"{wt}{position}{mut}".upper():
            exact_match = parsed
        else:
            same_position.append(parsed)

    # Sort same_position by significance relevance
    sig_order = {"pathogenic": 0, "likely pathogenic": 1, "uncertain significance": 2,
                 "likely benign": 3, "benign": 4}
    same_position.sort(
        key=lambda x: sig_order.get(x["significance"].lower(), 5)
    )

    return {
        "found": exact_match is not None or len(same_position) > 0,
        "exact_match": exact_match,
        "same_position": same_position[:10],  # Limit to 10
        "same_gene_count": gene_count,
        "query": {"gene": gene, "variant": target_change},
    }
