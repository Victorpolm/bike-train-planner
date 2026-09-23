"""Inspect one dated OJP service's rules, without interpreting permission or capacity.

Use JourneyRef and OperatingDayRef returned by TripRequest/StopEventRequest.
This evaluation tool is separate from the website and makes at most one call.
"""
import argparse
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

from ojp_benchmark import ENDPOINT, NS, NoRedirect, add


def request_xml(journey_ref, operating_day, now=None):
    if not journey_ref.strip() or len(journey_ref) > 512:
        raise ValueError("Use the JourneyRef returned by OJP, not a route or train number.")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", operating_day):
        raise ValueError("OperatingDayRef must use YYYY-MM-DD.")
    date.fromisoformat(operating_day)
    root = ET.Element("{" + NS["o"] + "}OJP", {"version": "2.0"})
    service = add(add(root, "o:OJPRequest"), "s:ServiceRequest")
    timestamp = (now or datetime.now(timezone.utc)).isoformat()
    add(service, "s:RequestTimestamp", timestamp)
    add(service, "s:RequestorRef", "bike-train-planner-evaluation")
    request = add(service, "o:OJPTripInfoRequest")
    add(request, "s:RequestTimestamp", timestamp)
    add(request, "s:MessageIdentifier", "bicycle-rule-tripinfo")
    add(request, "o:JourneyRef", journey_ref)
    add(request, "o:OperatingDayRef", operating_day)
    params = add(request, "o:Params")
    add(params, "o:UseRealtimeData", "none")
    add(params, "o:IncludeCalls", "true")
    add(params, "o:IncludeService", "true")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def summarize(xml, journey_ref, operating_day):
    root = ET.fromstring(xml)
    delivery = root.find(".//o:OJPTripInfoDelivery", NS)
    if root.tag != "{" + NS["o"] + "}OJP" or delivery is None:
        raise ValueError("Not an OJP TripInfo delivery")

    def value(node, path):
        return node.findtext(path, default="", namespaces=NS)

    def conditions(node):
        # Retain source scope and codes for review. Do not promote free text or
        # the absence of a prohibition into confirmed permission.
        return [ET.tostring(n, encoding="unicode") for n in node.iter()
                if n.tag.rsplit("}", 1)[-1] in
                {"Attribute", "ServiceFeature", "BicycleTransport", "RestrictionNote", "SituationFullRefs"}]

    results = []
    for result in delivery.findall("o:TripInfoResult", NS):
        service = result.find("o:Service", NS)
        if service is None or value(service, "o:JourneyRef") != journey_ref or value(service, "o:OperatingDayRef") != operating_day:
            raise ValueError("TripInfo response does not match the requested dated service")
        calls = []
        for call in result:
            kind = call.tag.rsplit("}", 1)[-1]
            if kind not in {"PreviousCall", "ThisCall", "OnwardCall"}:
                continue
            calls.append({"kind": kind, "stop_ref": value(call, "s:StopPointRef"),
                          "name": value(call, "o:StopPointName/o:Text"), "order": value(call, "o:Order"),
                          "arrival": value(call, "o:ServiceArrival/o:TimetabledTime"),
                          "departure": value(call, "o:ServiceDeparture/o:TimetabledTime"),
                          "conditions": conditions(call)})
        results.append({"journey_ref": journey_ref, "operating_day": operating_day,
                        "operator": value(service, "s:OperatorRef"), "mode": value(service, "o:Mode/o:PtMode"),
                        "service_name": value(service, "o:PublishedServiceName/o:Text"),
                        "service_conditions": conditions(service), "calls": calls,
                        "bicycle_permission": "unassessed"})
    return {"statuses": [n.text for n in delivery.findall(".//s:Status", NS)],
            "errors": [ET.tostring(n, encoding="unicode") for n in delivery.iter()
                       if n.tag.rsplit("}", 1)[-1] == "ErrorCondition"], "results": results}


def capture(journey_ref, operating_day, output, key="", dry_run=False):
    if not dry_run and not key.strip():
        raise ValueError("OJP_API_KEY is not configured.")
    now = datetime.now(timezone.utc)
    payload = request_xml(journey_ref, operating_day, now)
    output.mkdir(parents=True, exist_ok=False)
    (output / "request.xml").write_bytes(payload)
    report = {"journey_ref": journey_ref, "operating_day": operating_day,
              "captured_at": now.isoformat(), "endpoint": ENDPOINT, "dry_run": dry_run,
              "capacity_evaluation": "out of scope", "failed": False}
    token = key.strip().removeprefix("Bearer ").strip()

    def save(raw):
        if len(raw) > 8_000_000:
            raise ValueError("Response exceeds capture limit")
        raw = raw.replace(token.encode(), b"[REDACTED]") if token else raw
        (output / "response.xml").write_bytes(raw)
        return raw

    if not dry_run:
        headers = {"Authorization": "Bearer " + token, "Content-Type": "application/xml", "Accept": "application/xml"}
        started = time.monotonic()
        try:
            request = urllib.request.Request(ENDPOINT, data=payload, headers=headers, method="POST")
            with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
                raw = save(response.read(8_000_001))
            report.update(summarize(raw, journey_ref, operating_day))
            report["failed"] = bool(report["errors"] or not report["results"] or any(s != "true" for s in report["statuses"]))
        except urllib.error.HTTPError as error:
            report.update(failed=True, error=f"HTTP {error.code}", http_status=error.code)
            try:
                with error:
                    save(error.read(8_000_001))
            except (OSError, ValueError):
                pass
        except (OSError, ValueError, ET.ParseError):
            report.update(failed=True, error="Request failed or returned an invalid/mismatched response; permission remains unassessed.")
        report["seconds"] = round(time.monotonic() - started, 3)
    (output / "summary.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--journey-ref", required=True)
    parser.add_argument("--operating-day", required=True)
    parser.add_argument("--output", required=True, type=Path, help="New capture directory; keep responses out of git")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        report = capture(args.journey_ref, args.operating_day, args.output, os.environ.get("OJP_API_KEY", ""), args.dry_run)
    except (OSError, ValueError):
        parser.error("Check the dated OJP references, new output directory and API-key configuration; use --dry-run without a key.")
    print("TripInfo request prepared." if args.dry_run else "TripInfo capture finished; inspect summary.json. No permission was inferred.")
    return int(report["failed"])


if __name__ == "__main__":
    raise SystemExit(main())
