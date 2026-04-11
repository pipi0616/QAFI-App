"""
Literature Service — search PubMed for variant/gene related publications.

Uses NCBI E-utilities API (free, no key required).
Three search strategies by priority:
1. Gene + exact variant (e.g. "NDUFAF1 AND Leu117His")
2. Gene + clinical keywords (mutation, pathogenic, etc.)
3. Gene only (fallback)
"""

import time
from functools import lru_cache
import requests

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

AA1_TO_3 = {
    "A": "Ala", "R": "Arg", "N": "Asn", "D": "Asp", "C": "Cys",
    "Q": "Gln", "E": "Glu", "G": "Gly", "H": "His", "I": "Ile",
    "L": "Leu", "K": "Lys", "M": "Met", "F": "Phe", "P": "Pro",
    "S": "Ser", "T": "Thr", "W": "Trp", "Y": "Tyr", "V": "Val",
}


def _esearch(term: str, retmax: int = 20) -> tuple[int, list[str]]:
    """Search PubMed, return (total_count, id_list)."""
    try:
        r = requests.get(f"{EUTILS}/esearch.fcgi", params={
            "db": "pubmed", "term": term, "retmode": "json",
            "retmax": retmax, "sort": "relevance",
        }, timeout=10)
        r.raise_for_status()
        res = r.json()["esearchresult"]
        return int(res["count"]), res["idlist"]
    except Exception:
        return 0, []


def _get_summaries(pmids: list[str]) -> list[dict]:
    """Get article summaries for a list of PMIDs."""
    if not pmids:
        return []
    try:
        r = requests.get(f"{EUTILS}/esummary.fcgi", params={
            "db": "pubmed", "id": ",".join(pmids[:15]),
            "retmode": "json",
        }, timeout=10)
        r.raise_for_status()
        data = r.json().get("result", {})
    except Exception:
        return []

    articles = []
    for uid in data.get("uids", []):
        rec = data[uid]
        authors = rec.get("authors", [])
        first_author = authors[0]["name"] if authors else "Unknown"
        author_str = f"{first_author} et al." if len(authors) > 1 else first_author

        articles.append({
            "pmid": uid,
            "title": rec.get("title", ""),
            "authors": author_str,
            "journal": rec.get("source", ""),
            "year": rec.get("pubdate", "")[:4],
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{uid}/",
        })
    return articles


def search_literature(gene: str, wt: str, position: int, mut: str) -> dict:
    """
    Search PubMed for literature related to a gene/variant.

    Returns:
        {
            "variant_articles": articles mentioning the exact variant,
            "gene_articles": articles about the gene + clinical context,
            "total_gene_papers": total papers mentioning this gene,
            "search_terms": what was searched,
        }
    """
    wt3 = AA1_TO_3.get(wt, wt)
    mut3 = AA1_TO_3.get(mut, mut)
    variant_name = f"{wt}{position}{mut}"
    variant_3letter = f"{wt3}{position}{mut3}"

    # Strategy 1: Exact variant search
    variant_term = f'{gene} AND ("{variant_name}" OR "{variant_3letter}" OR "p.{variant_3letter}")'
    count1, ids1 = _esearch(variant_term, retmax=10)
    variant_articles = _get_summaries(ids1)
    time.sleep(0.35)

    # Strategy 2: Gene + clinical keywords
    clinical_term = f'{gene} AND (mutation OR variant OR pathogenic OR "loss of function" OR "gain of function")'
    count2, ids2 = _esearch(clinical_term, retmax=10)
    # Remove duplicates from variant search
    ids2_unique = [i for i in ids2 if i not in set(ids1)]
    gene_articles = _get_summaries(ids2_unique)
    time.sleep(0.35)

    # Total gene papers count
    total_count, _ = _esearch(gene, retmax=0)

    return {
        "variant_articles": variant_articles,
        "variant_search_count": count1,
        "gene_articles": gene_articles,
        "gene_search_count": count2,
        "total_gene_papers": total_count,
        "search_terms": {
            "variant": variant_term,
            "gene": clinical_term,
        },
    }
