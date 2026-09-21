"""Record paired OJP 2.0 searches; never infer permission from missing restrictions.

This is an offline evaluation tool, not part of the browser application.
Credentials are read only from OJP_API_KEY. Outputs never contain request headers.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ENDPOINT = "https://api.opentransportdata.swiss/ojp20"
NS = {"o": "http://www.vdv.de/ojp", "s": "http://www.siri.org.uk/siri"}
ET.register_namespace("", NS["o"])
ET.register_namespace("siri", NS["s"])


def add(parent, name, text=None):
    namespace, _, tag = name.partition(":")
    element = ET.SubElement(parent, "{" + NS[namespace] + "}" + tag)
    if text is not None:
        element.text = str(text)
    return element


def request_xml(origin, destination, departure, bike_transport, now=None):
    parsed = datetime.fromisoformat(departure.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Departure must include the Swiss UTC offset or Z.")
    root = ET.Element("{" + NS["o"] + "}OJP", {"version": "2.0"})
    service = add(add(root, "o:OJPRequest"), "s:ServiceRequest")
    timestamp = (now or datetime.now(timezone.utc)).isoformat()
    add(service, "s:RequestTimestamp", timestamp)
    add(service, "s:RequestorRef", "bike-train-planner-evaluation")
    request = add(service, "o:OJPTripRequest")
    add(request, "s:RequestTimestamp", timestamp)
    add(request, "s:MessageIdentifier", "bike-filter-on" if bike_transport else "bike-filter-off")
    for role, value in [("Origin", origin), ("Destination", destination)]:
        endpoint = add(request, "o:" + role)
        place = add(endpoint, "o:PlaceRef")
        if "," in value:
            lat, lon = map(float, value.split(","))
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError("Coordinates must be latitude,longitude.")
            position = add(place, "o:GeoPosition")
            add(position, "s:Longitude", lon)
            add(position, "s:Latitude", lat)
        else:
            add(place, "o:StopPlaceRef", value)
        add(add(place, "o:Name"), "o:Text", value)
        if role == "Origin":
            add(endpoint, "o:DepArrTime", parsed.isoformat())
    params = add(request, "o:Params")
    add(params, "o:NumberOfResults", 6)
    add(params, "o:UseRealtimeData", "none")
    add(params, "o:IncludeIntermediateStops", "true")
    add(params, "o:BikeTransport", "true" if bike_transport else "false")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def summarize(xml):
    root = ET.fromstring(xml)
    if root.tag != "{" + NS["o"] + "}OJP" or root.find(".//o:OJPTripDelivery", NS) is None:
        raise ValueError("Not an OJP trip delivery")
    def value(node, path):
        return node.findtext(path, default="", namespaces=NS)
    trips = []
    for trip in root.findall(".//o:Trip", NS):
        legs = []
        for leg in trip.findall("o:Leg/o:TimedLeg", NS):
            service = leg.find("o:Service", NS)
            if service is None:
                continue
            attributes = [{"code": value(a, "o:Code"), "text": value(a, "o:UserText/o:Text")}
                          for a in service.findall("o:Attribute", NS)]
            legs.append({
                "journey_ref": value(service, "o:JourneyRef"),
                "operating_day": value(service, "o:OperatingDayRef"),
                "mode": value(service, "o:Mode/o:PtMode"),
                "operator": value(service, "s:OperatorRef"),
                "line": value(service, "o:PublishedLineName/o:Text"),
                "service_name": value(service, "o:ServiceSection/o:PublishedLineName/o:Text"),
                "from": value(leg, "o:LegBoard/s:StopPointRef"),
                "to": value(leg, "o:LegAlight/s:StopPointRef"),
                "from_name": value(leg, "o:LegBoard/o:StopPointName/o:Text"),
                "to_name": value(leg, "o:LegAlight/o:StopPointName/o:Text"),
                "departure": value(leg, "o:LegBoard/o:ServiceDeparture/o:TimetabledTime"),
                "arrival": value(leg, "o:LegAlight/o:ServiceArrival/o:TimetabledTime"),
                "attributes": attributes,
                # Keep segment/stop conditions and structured facilities available
                # for a later interpretation against the official code mapping.
                "conditions": [ET.tostring(n, encoding="unicode") for n in leg.iter()
                               if n.tag.rsplit("}", 1)[-1] in
                               {"Attribute", "ServiceFeature", "BicycleTransport", "SituationRef"}],
                "bicycle_permission": "unassessed",
            })
        active_legs = []
        for leg in trip.findall("o:Leg", NS):
            for kind in ["ContinuousLeg", "TransferLeg"]:
                active = leg.find("o:" + kind, NS)
                if active is not None:
                    active_legs.append({"kind": kind, "duration": value(leg, "o:Duration"),
                                        "mode": value(active, "o:Service/o:PersonalMode")})
        trips.append({"id": value(trip, "o:Id"), "duration": value(trip, "o:Duration"),
                      "start": value(trip, "o:StartTime"), "end": value(trip, "o:EndTime"),
                      "boardings": len(legs), "legs": legs, "active_legs": active_legs})
    return {"statuses": [n.text for n in root.findall(".//s:Status", NS)],
            "errors": [ET.tostring(n, encoding="unicode") for n in root.iter() if n.tag.rsplit("}", 1)[-1] == "ErrorCondition"],
            "trips": trips}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    # Do not forward an API credential to an unexpected redirect destination.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def capture_pair(origin, destination, departure, output, key="", dry_run=False):
    """Make at most two calls. Never save headers or exception messages."""
    if not dry_run and not key.strip():
        raise ValueError("OJP_API_KEY is not configured.")
    now = datetime.now(timezone.utc)
    payloads = {flag: request_xml(origin, destination, departure, flag, now) for flag in [False, True]}
    output.mkdir(parents=True, exist_ok=False)
    report = {"origin": origin, "destination": destination, "departure": departure,
              "captured_at": now.isoformat(), "endpoint": ENDPOINT, "dry_run": dry_run,
              "access_mode": "provider default; reroute bicycle access before app comparison",
              "realtime": "none",
              "confirmation": "Filter inclusion alone does not confirm bicycle permission or space.", "runs": []}
    token = key.strip().removeprefix("Bearer ").strip()

    def save_response(name, raw):
        if len(raw) > 8_000_000:
            raise ValueError("Response exceeds capture limit")
        # Defense against any unexpected response that echoes the credential.
        if token:
            raw = raw.replace(token.encode(), b"[REDACTED]")
        (output / (name + "-response.xml")).write_bytes(raw)
        return raw

    failed = False
    for flag, payload in payloads.items():
        name = "bike-filter-on" if flag else "bike-filter-off"
        (output / (name + "-request.xml")).write_bytes(payload)
        record = {"bike_transport_filter": flag}
        if not dry_run:
            # This also keeps a full matrix below the plan's 50 calls/minute.
            time.sleep(1.3)
            headers = {"Authorization": "Bearer " + token,
                       "Content-Type": "application/xml", "Accept": "application/xml",
                       "User-Agent": "bike-train-planner-evaluation"}
            started = time.monotonic()
            try:
                request = urllib.request.Request(ENDPOINT, data=payload, headers=headers, method="POST")
                with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
                    raw = save_response(name, response.read(8_000_001))
                record.update(summarize(raw))
                if record["errors"] or any(s != "true" for s in record["statuses"]):
                    failed = True
            except urllib.error.HTTPError as error:
                record["error"] = f"HTTP {error.code}"
                record["http_status"] = error.code
                failed = True
                # Retain bounded diagnostic bodies, never request/response headers.
                try:
                    with error:
                        save_response(name, error.read(8_000_001))
                except (OSError, ValueError):
                    pass
            except (OSError, ValueError, ET.ParseError):
                record["error"] = "Request failed or returned an invalid response; no empty-result conclusion is valid."
                failed = True
            record["seconds"] = round(time.monotonic() - started, 3)
        report["runs"].append(record)
        if record.get("http_status") in {401, 403, 429}:
            break
    report["failed"] = failed
    (output / "summary.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True, help="StopPlaceRef or latitude,longitude from the app")
    parser.add_argument("--destination", required=True)
    parser.add_argument("--departure", required=True, help="ISO timestamp with UTC offset")
    parser.add_argument("--output", type=Path, required=True, help="New output directory; do not commit personal journey captures")
    parser.add_argument("--dry-run", action="store_true", help="Write paired XML requests without network access")
    args = parser.parse_args()
    key = os.environ.get("OJP_API_KEY", "").strip()
    if not args.dry_run and not key:
        parser.error("OJP_API_KEY is not configured. Use --dry-run to review requests.")
    try:
        report = capture_pair(args.origin, args.destination, args.departure, args.output, key, args.dry_run)
    except ValueError as error:
        parser.error(str(error))
    print("Paired request capture complete." if args.dry_run else "Paired OJP capture complete; inspect summary.json and service attributes.")
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
