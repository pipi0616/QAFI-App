"""PubMed tool — search biomedical literature."""

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


def _search_pubmed(term: str, retmax: int = 5) -> list:
    try:
        r = requests.get(f"{EUTILS}/esearch.fcgi",
                         params={"db": "pubmed", "term": term, "retmode": "json", "retmax": retmax}, timeout=10)
        ids = r.json().get("esearchresult", {}).get("idlist", [])
        if not ids:
            return []
        time.sleep(0.35)
        r2 = requests.get(f"{EUTILS}/esummary.fcgi",
                          params={"db": "pubmed", "id": ",".join(ids), "retmode": "json"}, timeout=10)
        data = r2.json().get("result", {})
        articles = []
        for uid in data.get("uids", []):
            rec = data[uid]
            authors = rec.get("authors", [])
            articles.append({
                "pmid": uid,
                "title": rec.get("title", ""),
                "authors": f"{authors[0]['name']} et al." if len(authors) > 1 else authors[0]["name"] if authors else "Unknown",
                "journal": rec.get("source", ""),
                "year": rec.get("pubdate", "")[:4],
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{uid}/",
            })
        return articles
    except Exception:
        return []


@tool
def pubmed_search(gene: str, wt: str, position: int, mut: str) -> dict:
    """Search PubMed for publications about a specific variant or gene.
    Returns variant-specific papers and gene clinical papers.
    Use this when asked about published evidence or literature for a variant."""

    wt3 = AA1_TO_3.get(wt, wt)
    mut3 = AA1_TO_3.get(mut, mut)
    variant_name = f"{wt}{position}{mut}"

    # Search 1: exact variant
    variant_term = f'{gene} AND ("{variant_name}" OR "{wt3}{position}{mut3}")'
    variant_articles = _search_pubmed(variant_term, retmax=5)
    time.sleep(0.35)

    # Search 2: gene + clinical
    gene_term = f'{gene} AND (mutation OR variant OR pathogenic)'
    gene_articles = _search_pubmed(gene_term, retmax=5)

    # Deduplicate
    variant_pmids = {a["pmid"] for a in variant_articles}
    gene_articles = [a for a in gene_articles if a["pmid"] not in variant_pmids]

    return {
        "variant": variant_name,
        "gene": gene,
        "variant_specific_papers": variant_articles,
        "variant_paper_count": len(variant_articles),
        "gene_clinical_papers": gene_articles,
        "gene_paper_count": len(gene_articles),
        "summary": f"Found {len(variant_articles)} variant-specific and {len(gene_articles)} gene-level clinical papers.",
    }
