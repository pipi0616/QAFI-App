"""ACMG/AMP Guidelines RAG — vector store of clinical variant classification guidelines."""

from langchain_core.documents import Document
from langchain_core.tools import tool
from langchain_chroma import Chroma

# ACMG/AMP 2015 Standards and Guidelines (key sections)
ACMG_DOCUMENTS = [
    # Pathogenic criteria
    "PVS1 (Very Strong): Null variant (nonsense, frameshift, canonical splice sites, initiation codon, single or multi-exon deletion) in a gene where loss of function is a known mechanism of disease. Caveats: must be in a gene with a known LOF mechanism, must verify that the variant causes loss of function.",

    "PS1 (Strong): Same amino acid change as a previously established pathogenic variant regardless of nucleotide change. Example: c.34G>T and c.34G>C both result in Val12Leu. Caveat: must verify that the nucleotide change does not affect splicing.",

    "PS3 (Strong): Well-established in vitro or in vivo functional studies supportive of a damaging effect on the gene or gene product. Functional studies must be validated and reproducible, and the assay must measure the actual function of the protein.",

    "PM1 (Moderate): Located in a mutational hot spot and/or critical and well-established functional domain without benign variation. Examples include active sites of enzymes, regions known to be important for protein-protein interactions.",

    "PM2 (Moderate): Absent from controls or at extremely low frequency in population databases (gnomAD, ExAC). The variant should not be present in large population databases, supporting its rarity and potential pathogenicity.",

    "PM5 (Moderate): Novel missense change at an amino acid residue where a different missense change determined to be pathogenic has been seen before. Example: Arg156His is pathogenic, and now Arg156Cys is observed.",

    "PP3 (Supporting): Multiple lines of computational evidence support a deleterious effect on the gene or gene product. Including: conservation, evolutionary, splicing impact, SIFT, PolyPhen-2, AlphaMissense, CADD, REVEL, etc.",

    # Benign criteria
    "BA1 (Stand-alone): Allele frequency is >5% in gnomAD or other large population databases. This is considered stand-alone evidence for benign classification. A single BA1 criterion is sufficient to classify a variant as benign.",

    "BS1 (Strong): Allele frequency is greater than expected for disorder. The expected frequency depends on the disease prevalence and genetic model (dominant vs recessive).",

    "BS3 (Strong): Well-established in vitro or in vivo functional studies show no damaging effect on protein function or splicing.",

    "BP4 (Supporting): Multiple lines of computational evidence suggest no impact on gene or gene product. Including: benign predictions from SIFT, PolyPhen-2, AlphaMissense, conservation analysis showing the position is not conserved.",

    "BP6 (Supporting): Reputable source recently reports variant as benign, but the evidence is not available to the laboratory to perform an independent evaluation. ClinVar entries with multiple submitters and concordant benign classifications support this criterion.",

    # Classification rules
    "To classify as PATHOGENIC, a variant needs: (i) 1 Very Strong + 1 Strong; or (ii) 1 Very Strong + 2 Moderate; or (iii) 1 Very Strong + 1 Moderate + 1 Supporting; or (iv) 2 Strong; or (v) 1 Strong + 3 Moderate; or other specified combinations.",

    "To classify as LIKELY PATHOGENIC: (i) 1 Very Strong + 1 Moderate; or (ii) 1 Strong + 1-2 Moderate; or (iii) 1 Strong + 2 Supporting; or (iv) 3 Moderate; or other specified combinations.",

    "To classify as BENIGN: (i) 1 Stand-alone (BA1); or (ii) 2 Strong benign criteria (BS1+BS2, etc.).",

    "To classify as LIKELY BENIGN: (i) 1 Strong + 1 Supporting benign; or (ii) 2 Supporting benign criteria.",

    "VUS (Variant of Uncertain Significance): Variants that do not meet criteria for either pathogenic or benign classification. This includes variants with conflicting evidence, insufficient evidence, or novel variants without functional data.",

    # Missense-specific
    "For missense variants, computational predictions (PP3/BP4) should use multiple tools including REVEL, AlphaMissense, CADD, and conservation measures. Concordance across tools strengthens the evidence. Discordance reduces confidence.",

    "Protein structure information from AlphaFold can inform variant interpretation. Variants in well-structured regions (pLDDT > 90) affecting buried residues or active sites are more likely pathogenic. Variants in disordered regions (pLDDT < 70) may be more tolerated.",
]


def build_acmg_vectorstore() -> Chroma:
    """Build vector store from ACMG guidelines."""
    docs = [Document(page_content=text, metadata={"source": "ACMG_2015"})
            for text in ACMG_DOCUMENTS]
    return Chroma.from_documents(docs, collection_name="acmg_guidelines")


# Singleton
_vectorstore = None


def get_retriever():
    global _vectorstore
    if _vectorstore is None:
        _vectorstore = build_acmg_vectorstore()
    return _vectorstore.as_retriever(search_kwargs={"k": 3})


@tool
def acmg_guideline(question: str) -> str:
    """Search ACMG/AMP variant classification guidelines.
    Use this when you need to determine which ACMG criteria apply to a variant,
    or when asked about classification rules, evidence strength, or standards."""

    retriever = get_retriever()
    docs = retriever.invoke(question)
    return "\n\n".join(f"[ACMG] {doc.page_content}" for doc in docs)
