"""Ten reproducible random Swiss fare checks; credentials never leave the process.

Each case is checkpointed, with bounded calls/timeouts and no automatic retries.
Prices are OJP Fare beta/test quotes, not production ticket offers.
"""
import copy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import random
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from ojp_benchmark import NS, NoRedirect, add, request_xml

FARE_URL = "https://api.opentransportdata.swiss/ojpfare"
STATIONS = [("8503000", "Zürich HB"), ("8507000", "Bern"), ("8500010", "Basel SBB"),
            ("8505000", "Luzern"), ("8504100", "Fribourg/Freiburg"), ("8501120", "Lausanne"),
            ("8501008", "Genève"), ("8509000", "Chur"), ("8506302", "St. Gallen"),
            ("8505300", "Rotkreuz"), ("8502204", "Baden"), ("8506000", "Winterthur"),
            ("8503054", "Rapperswil"), ("8500218", "Olten"), ("8508005", "Lugano"),
            ("8503209", "Pfäffikon SZ"), ("8501100", "Yverdon-les-Bains"), ("8504300", "Biel/Bienne")]


def fare_request(trip, context, profile, now):
    trip = copy.deepcopy(trip)
    # Use a simple request-scoped identifier: the reference mapper separates it
    # from leg numbers with underscores.
    trip.find("o:Id", NS).text = "fareprobe"
    parents = {}
    if context is not None:
        for point in context.findall(".//o:StopPoint", NS):
            ref = point.findtext("s:StopPointRef", namespaces=NS)
            parent = point.findtext("o:ParentRef", namespaces=NS)
            if ref and parent:
                parents[ref] = parent
    for point in trip.findall(".//s:StopPointRef", NS):
        seen = set()
        while point.text in parents and point.text not in seen:
            seen.add(point.text)
            point.text = parents[point.text]
    root = ET.Element("{" + NS["o"] + "}OJP", {"version": "2.0"})
    service = add(add(root, "o:OJPRequest"), "s:ServiceRequest")
    add(service, "s:RequestTimestamp", now)
    add(service, "s:RequestorRef", "bike-train-planner-fare-check")
    request = add(service, "o:OJPFareRequest")
    add(request, "s:RequestTimestamp", now)
    add(add(request, "o:TripFareRequest"), "o:Trip").extend(list(trip))
    params = add(request, "o:Params")
    add(params, "o:FareAuthorityFilter", "ch:1:NOVA")
    # The provider's generated OJP 2.0 enum includes a trailing space.
    add(params, "o:FareClass", "secondClass ")
    traveller = add(params, "o:Traveller")
    add(traveller, "o:Age", 25)
    add(traveller, "o:PassengerCategory", "Bicycle" if profile == "bicycle" else "Adult")
    entitlements = add(traveller, "o:EntitlementProducts")
    if profile == "half-fare":
        entitlement = add(entitlements, "o:EntitlementProduct")
        add(entitlement, "o:FareAuthorityRef", "ch:1:NOVA")
        add(entitlement, "o:EntitlementProductRef", "HTA")
        add(entitlement, "o:EntitlementProductName", "Halbtax-Abonnement")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def run(output):
    fare_key = os.environ.get("OJP_FARE_API_KEY", "").strip().removeprefix("Bearer ").strip()
    trip_key = os.environ.get("OJP_API_KEY", "").strip().removeprefix("Bearer ").strip()
    output.mkdir(parents=True, exist_ok=True)
    report = {"seed": 20260927, "environment": "OJP Fare beta/test", "fare_secret_present": bool(fare_key),
              "trip_secret_present": bool(trip_key), "cases": []}
    def checkpoint():
        (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    checkpoint()
    if not fare_key:
        print("OJP_FARE_API_KEY is missing in this workflow.")
        return 1
    opener = urllib.request.build_opener(NoRedirect())
    blocked = False
    def call(url, payload, key, stem):
        nonlocal blocked
        if blocked:
            return None, {"error": "skipped-after-auth-or-rate-error"}
        (output / (stem + "-request.xml")).write_bytes(payload)
        time.sleep(1.5)
        started = time.monotonic()
        status, raw = None, b""
        try:
            request = urllib.request.Request(url, data=payload, headers={"Authorization": "Bearer " + key,
                "Content-Type": "application/xml", "Accept": "application/xml"})
            with opener.open(request, timeout=20) as response:
                status, raw = response.status, response.read(8_000_001)
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read(8_000_001)
        except (OSError, TimeoutError):
            pass
        if status in (401, 403, 429):
            blocked = True
        for secret in (fare_key, trip_key):
            if secret:
                raw = raw.replace(secret.encode(), b"[REDACTED]")
        meta = {"http_status": status, "seconds": round(time.monotonic() - started, 2)}
        if len(raw) > 8_000_000:
            return None, {**meta, "error": "response-too-large"}
        (output / (stem + "-response.xml")).write_bytes(raw)
        try:
            if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
                raise ValueError()
            tree = ET.fromstring(raw)
            meta["errors"] = [n.text for n in tree.iter() if n.tag.rsplit("}", 1)[-1] in ("Text", "OtherError")][:5] if status != 200 else []
            return tree, meta
        except (ET.ParseError, ValueError):
            return None, {**meta, "error": "invalid-xml"}
    rng = random.Random(report["seed"])
    pairs = rng.sample([(a, b) for a in STATIONS for b in STATIONS if a != b], 10)
    day = (datetime.now(timezone.utc) + timedelta(days=2)).date().isoformat()
    for i, (origin, destination) in enumerate(pairs, 1):
        departure = f"{day}T{rng.randrange(8, 17):02d}:{rng.choice([0, 15, 30, 45]):02d}:00+02:00"
        case = {"number": i, "from": origin[1], "from_id": origin[0], "to": destination[1], "to_id": destination[0], "departure": departure, "fares": {}}
        report["cases"].append(case)
        # Explicitly verify the fare-only journey lookup needed by the Site.
        trip_url = FARE_URL if i == 1 or not trip_key else "https://api.opentransportdata.swiss/ojp20"
        raw, case["lookup"] = call(trip_url, request_xml(origin[0], destination[0], departure, False),
                                  fare_key if trip_url == FARE_URL else trip_key, f"{i:02d}-trip")
        case["lookup"]["endpoint"] = trip_url
        delivery = raw.find(".//o:OJPTripDelivery", NS) if raw is not None else None
        trip = delivery.find("o:TripResult/o:Trip", NS) if delivery is not None else None
        if trip is not None:
            case["trip_id"] = trip.findtext("o:Id", namespaces=NS)
            case["legs"] = [leg.findtext("o:Id", namespaces=NS) for leg in trip.findall("o:Leg", NS) if leg.find("o:TimedLeg", NS) is not None]
            for profile in ("full", "half-fare", "bicycle"):
                result, meta = call(FARE_URL, fare_request(trip, delivery.find("o:TripResponseContext", NS), profile,
                                    datetime.now(timezone.utc).isoformat()), fare_key, f"{i:02d}-{profile}")
                products = []
                if result is not None:
                    for scoped in result.findall(".//o:TripFareResult", NS):
                        for product in scoped.findall("o:FareProduct", NS):
                            item = {child.tag.rsplit("}", 1)[-1]: child.text for child in product}
                            item["from_leg"] = scoped.findtext("o:FromLegIdRef", namespaces=NS)
                            item["to_leg"] = scoped.findtext("o:ToLegIdRef", namespaces=NS)
                            products.append(item)
                case["fares"][profile] = {**meta, "products": products}
                checkpoint()
        case["has_prices"] = all(case["fares"].get(p, {}).get("products") for p in ("full", "half-fare", "bicycle"))
        checkpoint()
        print(f"{i}/10 {origin[1]} → {destination[1]}: {'prices received' if case['has_prices'] else 'incomplete'}", flush=True)
    return int(not all(c["has_prices"] for c in report["cases"]))


if __name__ == "__main__":
    sys.exit(run(Path(sys.argv[1])))
