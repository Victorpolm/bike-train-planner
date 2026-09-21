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
                "from": value(leg, "o:LegBoard/s:StopPointRef"),
                "to": value(leg, "o:LegAlight/s:StopPointRef"),
                "departure": value(leg, "o:LegBoard/o:ServiceDeparture/o:TimetabledTime"),
                "arrival": value(leg, "o:LegAlight/o:ServiceArrival/o:TimetabledTime"),
                "attributes": attributes,
                "bicycle_permission": "unassessed",
            })
        trips.append({"id": value(trip, "o:Id"), "duration": value(trip, "o:Duration"),
                      "start": value(trip, "o:StartTime"), "end": value(trip, "o:EndTime"),
                      "boardings": len(legs), "legs": legs})
    return {"statuses": [n.text for n in root.findall(".//s:Status", NS)],
            "errors": [ET.tostring(n, encoding="unicode") for n in root.iter() if n.tag.rsplit("}", 1)[-1] == "ErrorCondition"],
            "trips": trips}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    # Do not forward an API credential to an unexpected redirect destination.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


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
        payloads = {flag: request_xml(args.origin, args.destination, args.departure, flag) for flag in [False, True]}
    except ValueError as error:
        parser.error(str(error))
    args.output.mkdir(parents=True, exist_ok=False)
    report = {"origin": args.origin, "destination": args.destination, "departure": args.departure,
              "endpoint": ENDPOINT, "dry_run": args.dry_run,
              "access_mode": "provider default; reroute bicycle access before app comparison",
              "confirmation": "Filter inclusion alone does not confirm bicycle permission or space.", "runs": []}
    failed = False
    for flag, payload in payloads.items():
        name = "bike-filter-on" if flag else "bike-filter-off"
        (args.output / (name + "-request.xml")).write_bytes(payload)
        record = {"bike_transport_filter": flag}
        if not args.dry_run:
            headers = {"Authorization": key if key.startswith("Bearer ") else "Bearer " + key,
                       "Content-Type": "application/xml", "Accept": "application/xml",
                       "User-Agent": "bike-train-planner-evaluation"}
            started = time.monotonic()
            try:
                request = urllib.request.Request(ENDPOINT, data=payload, headers=headers, method="POST")
                with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
                    raw = response.read(8_000_001)
                if len(raw) > 8_000_000:
                    raise ValueError("Response exceeds capture limit")
                (args.output / (name + "-response.xml")).write_bytes(raw)
                record.update(summarize(raw))
                if record["errors"] or any(s != "true" for s in record["statuses"]):
                    failed = True
            except urllib.error.HTTPError as error:
                record["error"] = f"HTTP {error.code}"
                failed = True
            except (urllib.error.URLError, TimeoutError, ValueError, ET.ParseError):
                record["error"] = "Request failed or returned an invalid response; no empty-result conclusion is valid."
                failed = True
            record["seconds"] = round(time.monotonic() - started, 3)
        report["runs"].append(record)
    (args.output / "summary.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Paired request capture complete." if args.dry_run else "Paired OJP capture complete; inspect summary.json and service attributes.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
