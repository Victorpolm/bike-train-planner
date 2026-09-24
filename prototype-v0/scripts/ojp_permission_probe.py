"""Capture three public route pairs and one TripInfo per mode; at most nine calls.

OJP_API_KEY stays in the Actions process. Responses are redacted by the existing
capture helpers. Never infer a live bicycle-space count or completed booking.
"""
import json
import os
from pathlib import Path
import sys
import time
from datetime import date, datetime
from zoneinfo import ZoneInfo

from ojp_benchmark import capture_pair
from ojp_tripinfo import capture


def run(manifest_path, output):
    manifest = json.loads(manifest_path.read_text())
    key = os.environ.get("OJP_API_KEY", "").strip()
    if not key or date.fromisoformat(manifest["departure_date"]) <= datetime.now(ZoneInfo("Europe/Zurich")).date():
        raise ValueError("Configure OJP_API_KEY and choose a future departure date.")
    cases = manifest["cases"]
    if len(cases) != 3 or {c["mode"] for c in cases} != {"rail", "bus", "water"}:
        raise ValueError("Exactly one rail, bus and water case is required.")
    output.mkdir(parents=True, exist_ok=False)
    reports = []
    for case in cases:
        departure = datetime.fromisoformat(manifest["departure_date"] + "T" + case["time"]).replace(tzinfo=ZoneInfo("Europe/Zurich")).isoformat()
        paired = capture_pair(case["origin"], case["destination"], departure, output / case["mode"], key)
        result = {"mode": case["mode"], "paired": paired}
        reports.append(result)
        if any(r.get("http_status") in {401, 403, 429} for r in paired["runs"]):
            break
        selected = next((leg for run in paired["runs"] for trip in run.get("trips", []) for leg in trip["legs"]
                         if leg["mode"] == case["mode"] and leg["journey_ref"] and leg["operating_day"]), None)
        if selected:
            time.sleep(1.3)
            result["tripinfo"] = capture(selected["journey_ref"], selected["operating_day"], output / (case["mode"] + "-tripinfo"), key)
            if result["tripinfo"].get("http_status") in {401, 403, 429}:
                break
        print(case["mode"] + ": paired requests and dated service inspection captured", flush=True)
        (output / "report.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2) + "\n")
    (output / "report.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2) + "\n")
    return int(len(reports) != 3 or any(r["paired"]["failed"] or r.get("tripinfo", {"failed": True})["failed"] for r in reports))


if __name__ == "__main__":
    try:
        sys.exit(run(Path(sys.argv[1]), Path(sys.argv[2])))
    except (ValueError, KeyError, OSError, IndexError):
        print("Probe setup failed; check manifest, future date and secret configuration.", file=sys.stderr)
        sys.exit(1)
