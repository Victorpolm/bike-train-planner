#!/usr/bin/env python3
"""Reproduce reviewed TPG platform -> OFT/DIDOK joins; never approve fares.

Python standard library only. Optional --cache-dir uses/downloads source files.
Example:
  python docs/research/derive_tpg_zone10_evidence.py --date 2026-10-11 \
    --cache-dir /path/to/research --output /tmp/tpg-evidence.json

An output is a review candidate, NOT an automatic validity extension. Platform
lists are membership evidence, not guaranteed trip sequences or stop counts.
"""
import argparse
import hashlib
import json
import re
import urllib.request
from pathlib import Path

LINES = ("1", "10", "12", "14", "15", "18")
BASE = "https://opendata.tpg.ch/api/explore/v2.1/catalog/datasets/arrets"
# Explicit municipalities encountered and reviewed on 2026-10-11. A new one
# must trigger review, even if it is also inside Geneva.
REVIEWED_GENEVA_MUNICIPALITIES = {
    "BERNEX", "CAROUGE", "CHÊNE-BOUGERIES", "CHÊNE-BOURG", "COLOGNY",
    "CONFIGNON", "GENÈVE", "LANCY", "LE GRAND-SACONNEX", "MEYRIN",
    "ONEX", "PLAN-LES-OUATES", "THÔNEX", "VERNIER",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", required=True, help="Retrieval date YYYY-MM-DD")
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.date):
        parser.error("--date must be YYYY-MM-DD")

    def obtain(url, name):
        path = args.cache_dir / name if args.cache_dir else None
        if path and path.exists():
            return path.read_bytes()
        request = urllib.request.Request(url, headers={"User-Agent": "BikePlannerSourceReview/1.0"})
        with urllib.request.urlopen(request, timeout=45) as response:
            data = response.read()
        if path:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        return data

    stop_bytes = obtain(BASE + "/exports/json", f"tpg-arrets-{args.date}.json")
    stops = json.loads(stop_bytes)
    metadata = json.loads(obtain(BASE, f"tpg-arrets-metadata-{args.date}.json"))
    by_platform = {}
    for stop in stops:
        key = stop["arretcodelong"].upper()
        if key in by_platform:
            raise ValueError(f"Duplicate platform: {key}")
        by_platform[key] = stop
    proof = {
        "schemaVersion": 1,
        "checkedAt": args.date,
        "purpose": "Human-reviewed Zone10 membership evidence, not ordered trip patterns or automatic fare authority",
        "attribution": "Source: Transports publics genevois (tpg). Independent derived dataset; join and filtering performed by this project.",
        "sourceTerms": "https://opendata.tpg.ch/terms/terms-and-conditions/",
        "stopSource": {
            "url": BASE + "/exports/json",
            "metadataUrl": BASE,
            "sha256": hashlib.sha256(stop_bytes).hexdigest(),
            "dataUpdatedAt": metadata["metas"]["default"]["modified"],
            "totalPlatformRecords": len(stops),
            "identifierDefinition": "codedidoc is the unique public transport stop identifier assigned by OFT, per TPG dataset metadata",
        },
        "zoneAuthority": "https://www.unireso.com/wp-content/uploads/2026/06/CGV-unireso-Juin-2026-1.pdf",
        "zoneAuthoritySections": ["1.1", "2.1.1", "10.1"],
        "limits": [
            "CH country alone does not prove Zone10; the TPG dataset includes Vaud.",
            "The fare authority covers Geneva except Celigny; no bounding-box inference is used.",
            "Every line/direction platform is joined; endpoints alone do not prove arbitrary line coverage.",
            "These are complete published line-page membership lists, not an OJP-trip-specific stop sequence.",
            "Raw JSON object order, repeated DIDOK values, and null time values cannot establish Saut-de-puce eligibility.",
            "Compare OJP operator, line, date and exact official stop IDs; do not fuzzy-match names.",
            "Review route changes and service exceptions before extending validity.",
        ],
        "lines": [],
    }
    for line in LINES:
        url = "https://www.tpg.ch/fr/lignes/" + line
        page_bytes = obtain(url, f"tpg-line-{line}-{args.date}.html")
        page = page_bytes.decode("utf-8")
        matches = list(re.finditer(r"ligneArrets\s*=\s*", page))
        if len(matches) != 1:
            raise ValueError(f"Unexpected ligneArrets structure on line {line}")
        directions, _ = json.JSONDecoder().raw_decode(page[matches[0].end():])
        if set(directions) != {"aller", "retour"}:
            raise ValueError(f"Unexpected directions on line {line}")
        result = {
            "line": line, "url": url,
            "pageSha256": hashlib.sha256(page_bytes).hexdigest(),
            "validityText": sorted(set(re.findall(r"Valable du[^<]*", page))),
            "directions": {},
        }
        for direction, values in directions.items():
            entries = []
            for key, value in values.items():
                platform = value["code"].upper()
                stop = by_platform[platform]
                if not (stop["actif"] == "Y" and stop["pays"] == "CH"
                        and stop["codedidoc"] is not None
                        and stop["commune"] in REVIEWED_GENEVA_MUNICIPALITIES):
                    raise ValueError(f"Line {line} needs municipality/platform review: {stop}")
                entries.append({
                    "linePageObjectKey": key, "platformCode": platform,
                    "linePageName": value["description"],
                    "linePageTime": value.get("time"),
                    "pdfValidityKeys": list(value.get("pdfs", {})),
                    "didok": str(stop["codedidoc"]),
                    "municipality": stop["commune"], "country": stop["pays"],
                    "active": stop["actif"],
                })
            counts = {}
            for entry in entries:
                counts[entry["didok"]] = counts.get(entry["didok"], 0) + 1
            result["directions"][direction] = {
                "platforms": entries,
                "distinctDidokMembership": sorted(counts),
                "repeatedDidok": {key: count for key, count in counts.items() if count > 1},
            }
        proof["lines"].append(result)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(proof, ensure_ascii=False, indent=2) + "\n")
    count = sum(len(d["platforms"]) for line in proof["lines"] for d in line["directions"].values())
    print(f"Wrote {len(proof['lines'])} reviewed lines / {count} joined platform entries to {args.output}")


if __name__ == "__main__":
    main()
