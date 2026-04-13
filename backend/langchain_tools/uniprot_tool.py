"""UniProt tool — fetch protein annotations and functional domains."""

from functools import lru_cache
import requests
from langchain_core.tools import tool


@lru_cache(maxsize=16)
def _fetch_uniprot(uniprot_id: str) -> dict:
    try:
        r = requests.get(f"https://rest.uniprot.org/uniprotkb/{uniprot_id}.json", timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}


@tool
def uniprot_annotate(protein_id: str, position: int) -> dict:
    """Get UniProt protein annotations for a specific position.
    Returns protein function, domains, and whether the position falls in
    a functional region (signal peptide, active site, binding site, etc.).
    Use this to understand the biological context of a variant's location."""

    data = _fetch_uniprot(protein_id)
    if not data:
        return {"error": f"Could not fetch UniProt data for {protein_id}"}

    # Basic protein info
    protein_name = (data.get("proteinDescription", {})
                    .get("recommendedName", {})
                    .get("fullName", {})
                    .get("value", "Unknown"))
    gene_name = data.get("genes", [{}])[0].get("geneName", {}).get("value", "Unknown")

    # Function description
    function = ""
    for comment in data.get("comments", []):
        if comment.get("commentType") == "FUNCTION":
            texts = comment.get("texts", [])
            if texts:
                function = texts[0].get("value", "")
                break

    # Subcellular location
    location = ""
    for comment in data.get("comments", []):
        if comment.get("commentType") == "SUBCELLULAR LOCATION":
            locs = comment.get("subcellularLocations", [])
            if locs:
                location = locs[0].get("location", {}).get("value", "")
                break

    # Disease associations
    diseases = []
    for comment in data.get("comments", []):
        if comment.get("commentType") == "DISEASE":
            disease = comment.get("disease", {})
            if disease:
                diseases.append({
                    "name": disease.get("diseaseId", ""),
                    "description": disease.get("description", "")[:150],
                })

    # Features overlapping with the position
    position_features = []
    all_domains = []
    for feat in data.get("features", []):
        loc = feat.get("location", {})
        start = loc.get("start", {}).get("value")
        end = loc.get("end", {}).get("value")
        if start is not None and end is not None:
            feat_info = {
                "type": feat.get("type", ""),
                "start": start,
                "end": end,
                "description": feat.get("description", ""),
            }
            # Collect domains
            if feat.get("type") in ("Domain", "Region", "Motif", "Active site",
                                     "Binding site", "Transit peptide", "Signal peptide"):
                all_domains.append(feat_info)
            # Check if position overlaps
            if start <= position <= end:
                position_features.append(feat_info)

    # Is position in a functional region?
    in_functional_region = any(
        f["type"] in ("Domain", "Active site", "Binding site", "Motif", "Disulfide bond")
        for f in position_features
    )

    return {
        "protein_id": protein_id,
        "protein_name": protein_name,
        "gene": gene_name,
        "function": function[:300],
        "subcellular_location": location,
        "diseases": diseases[:3],
        "position": position,
        "position_features": position_features,
        "in_functional_region": in_functional_region,
        "all_domains": all_domains[:10],
        "sequence_length": data.get("sequence", {}).get("length", 0),
    }
