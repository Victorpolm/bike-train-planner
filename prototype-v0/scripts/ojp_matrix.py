"""Run the dated OJP permission-evidence matrix on a trusted CI runner.

No frontend or package dependencies; OJP_API_KEY is used only by capture_pair.
Geocoding requires an unambiguous exact address/stop match, never a first hit.
"""
import argparse
from datetime import date, datetime, time, timezone
import html
import json
import os
from pathlib import Path
import re
import unicodedata
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

from ojp_benchmark import NoRedirect, capture_pair


def normalized(text):
    plain = html.unescape(re.sub(r"<[^>]*>", "", text))
    plain = unicodedata.normalize("NFKD", plain).encode("ascii", "ignore").decode().lower()
    return " ".join(plain.split())


def public_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "bike-train-planner-evaluation"})
    with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
        raw = response.read(1_000_001)
    if len(raw) > 1_000_000:
        raise ValueError("Location response exceeds capture limit")
    return json.loads(raw)


def coordinate(lat, lon):
    lat, lon = float(lat), float(lon)
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("Invalid location coordinates")
    return f"{lat},{lon}"


def resolve_endpoint(spec):
    if "coordinates" in spec:
        return {**spec, "value": coordinate(*spec["coordinates"])}
    if "stop_ref" in spec:
        return {**spec, "value": spec["stop_ref"]}
    candidates = {}
    if spec["provider"] == "geoadmin":
        url = "https://api3.geo.admin.ch/rest/services/ech/SearchServer?" + urllib.parse.urlencode({
            "searchText": spec["query"], "type": "locations", "origins": "address", "limit": "10", "sr": "4326"})
        for item in public_json(url).get("results", []):
            attrs = item.get("attrs", {})
            label = normalized(attrs.get("label", ""))
            # Require the entire street/house number and municipality as words.
            if all(re.search(r"\b" + re.escape(normalized(part)) + r"\b", label)
                   for part in spec["required_label_parts"]):
                point = coordinate(attrs["lat"], attrs["lon"])
                candidates[point] = html.unescape(re.sub(r"<[^>]*>", "", attrs["label"]))
    elif spec["provider"] == "transport":
        url = "https://transport.opendata.ch/v1/locations?" + urllib.parse.urlencode({"query": spec["query"], "type": "station"})
        for item in public_json(url).get("stations", []):
            if normalized(item.get("name", "")) == normalized(spec["expected_name"]):
                point = coordinate(item["coordinate"]["x"], item["coordinate"]["y"])
                candidates[point] = item["name"]
    else:
        raise ValueError("Unknown location provider")
    if len(candidates) != 1:
        raise ValueError("Location lookup must return exactly one matching address or stop")
    point, label = next(iter(candidates.items()))
    return {**spec, "value": point, "resolved_label": label, "source_url": url}


def departure_timestamp(day, clock, zone="Europe/Zurich"):
    parsed = datetime.combine(date.fromisoformat(day), time.fromisoformat(clock))
    if parsed.tzinfo is not None:
        raise ValueError("Case time must be a Swiss local clock time")
    return parsed.replace(tzinfo=ZoneInfo(zone)).isoformat()


def render_report(matrix):
    lines = ["# OJP bicycle evidence benchmark", "", f"Departure date: {matrix['departure_date']} (Europe/Zurich).",
             "Provider-default access, scheduled times; not a bicycle-time comparison. All permissions remain unassessed.", "",
             "| Case | Filter | Trips | Transit trips | Modes | Request seconds | Status |",
             "|---|---|---:|---:|---|---:|---|"]
    for case in matrix["cases"]:
        if "error" in case:
            lines.append(f"| {case['id']} | — | — | — | — | — | {case['error']} |")
            continue
        for run in case["capture"]["runs"]:
            trips = run.get("trips", [])
            modes = sorted({leg["mode"] for trip in trips for leg in trip["legs"]})
            status = run.get("error") or ("provider error" if run.get("errors") or
                     any(s != "true" for s in run.get("statuses", [])) else "ok")
            lines.append(f"| {case['id']} | {'on' if run['bike_transport_filter'] else 'off'} | {len(trips)} | "
                         f"{sum(t['boardings'] > 0 for t in trips)} | {', '.join(modes)} | {run.get('seconds', '')} | {status} |")
    lines += ["", "## Returned service attributes", "", "Codes/text are observations, not permission decisions.", ""]
    attributes = sorted({(a["code"], a["text"]) for case in matrix["cases"]
                         for run in case.get("capture", {}).get("runs", []) for trip in run.get("trips", [])
                         for leg in trip["legs"] for a in leg["attributes"]})
    lines.extend(f"- {code}: {text.replace(chr(10), ' ')}" for code, text in attributes)
    lines += ["", "Exact inputs, service/segment identifiers, conditions and raw XML are in the run artifact.", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--date", default="", help="Future Swiss departure date; overrides the manifest")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    key = os.environ.get("OJP_API_KEY", "").strip()
    if not key or not key.removeprefix("Bearer ").strip():
        parser.error("OJP_API_KEY is missing or empty. Add it as a repository Actions secret.")
    manifest = json.loads(args.manifest.read_text())
    day = args.date or manifest["departure_date"]
    if date.fromisoformat(day) <= datetime.now(ZoneInfo("Europe/Zurich")).date():
        parser.error("Choose a future departure date so the complete day/night matrix remains in the timetable horizon.")
    cases = manifest["cases"]
    if not 1 <= len(cases) <= 10 or len({c["id"] for c in cases}) != len(cases):
        parser.error("Use 1–10 uniquely named cases (at most 20 OJP requests).")
    for case in cases:
        if not re.fullmatch(r"[a-z0-9-]+", case["id"]):
            parser.error("Case IDs must contain only lowercase letters, digits and hyphens.")
        departure_timestamp(day, case["time"])
    args.output.mkdir(parents=True, exist_ok=False)
    matrix = {"captured_at": datetime.now(timezone.utc).isoformat(), "departure_date": day,
              "manifest": manifest, "locations": {}, "cases": [], "failed": False}
    stop_reason = None
    for case in cases:
        record = {**case}
        try:
            if stop_reason:
                raise ValueError(stop_reason)
            for name in [case["origin"], case["destination"]]:
                if name not in matrix["locations"]:
                    matrix["locations"][name] = resolve_endpoint(manifest["locations"][name])
            record["capture"] = capture_pair(matrix["locations"][case["origin"]]["value"],
                                             matrix["locations"][case["destination"]]["value"],
                                             departure_timestamp(day, case["time"]), args.output / case["id"], key)
            matrix["failed"] |= record["capture"]["failed"]
            if any(r.get("http_status") in {401, 403, 429} for r in record["capture"]["runs"]):
                stop_reason = "Not attempted after an authentication or quota error"
        except (OSError, ValueError, KeyError, TypeError):
            record["error"] = stop_reason or "Location or request setup failed; not an empty journey result"
            matrix["failed"] = True
        matrix["cases"].append(record)
        # Preserve partial results if CI times out later in the matrix.
        (args.output / "matrix.json").write_text(json.dumps(matrix, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        (args.output / "report.md").write_text(render_report(matrix), encoding="utf-8")
        print(f"{case['id']}: {'failed' if record.get('error') or record.get('capture', {}).get('failed') else 'captured'}", flush=True)
    return 1 if matrix["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
