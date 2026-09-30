"""Bounded offline comparison. Supply an already downloaded MOTIS 2.11.3 binary.

Creates a tiny synthetic GTFS feed in a temporary directory, queries only localhost,
and removes the feed/index after use. No Swiss bulk dataset or public routing API.
"""
import argparse
import csv
import io
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.parse import urlencode
from urllib.request import urlopen
from zipfile import ZipFile


def csv_text(fields, rows):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(fields)
    writer.writerows(rows)
    return out.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--motis", type=Path, required=True)
    args = parser.parse_args()
    binary = args.motis.resolve()
    version = subprocess.check_output([binary, "--version"], text=True).strip()
    if version != "v2.11.3":
        raise RuntimeError(f"Review the API contract before changing the pinned pilot: {version}")
    fixture = json.loads(subprocess.check_output([
        "node", Path(__file__).with_name("motis-permission-fixture.mjs")], text=True))
    with tempfile.TemporaryDirectory(prefix="bike-motis-pilot-") as temp:
        root = Path(temp)
        files = {
            "agency.txt": csv_text(["agency_id", "agency_name", "agency_url", "agency_timezone"],
                                   [["P", "Synthetic pilot", "https://example.org", "Europe/Zurich"]]),
            "stops.txt": csv_text(["stop_id", "stop_name", "stop_lat", "stop_lon"],
                                  [[s["id"], s["name"], s["lat"], s["lon"]] for s in fixture["stops"]]),
            "routes.txt": csv_text(["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"],
                                   [[s["id"], "P", s["id"], "Synthetic " + s["id"], s["routeType"]] for s in fixture["services"]]),
            "trips.txt": csv_text(["route_id", "service_id", "trip_id", "bikes_allowed"],
                                  [[s["id"], "D", s["id"], s["bikesAllowed"]] for s in fixture["services"]]),
            "calendar_dates.txt": "service_id,date,exception_type\nD,20261001,1\n",
        }
        times = []
        for s in fixture["services"]:
            times.append([s["id"], "08:10:00", "08:10:00", "A", 1])
            if s["id"] == "OK":
                times.append([s["id"], "08:25:00", "08:25:00", "B", 2])
            arrival = f'08:{s["arrival"]:02d}:00'
            times.append([s["id"], arrival, arrival, "C", 3])
        files["stop_times.txt"] = csv_text(["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"], times)
        with ZipFile(root / "fixture.zip", "w") as archive:
            for name, content in files.items():
                archive.writestr(name, content)
        with socket.socket() as port_socket:
            port_socket.bind(("127.0.0.1", 0))
            port = port_socket.getsockname()[1]
        (root / "config.yml").write_text(f"""server:
  host: 127.0.0.1
  port: {port}
  n_threads: 2
timetable:
  first_day: 2026-10-01
  num_days: 2
  datasets:
    fixture:
      path: fixture.zip
      default_bikes_allowed: false
street_routing: false
geocoding: false
osr_footpath: false
""")
        base = {"fromPlace": "fixture_A", "toPlace": "fixture_C", "time": "2026-10-01T06:00:00Z",
                "numItineraries": 10, "searchWindow": 3600, "maxTransfers": 0, "directModes": ""}

        def query(**params):
            with urlopen(f"http://127.0.0.1:{port}/api/v6/plan?" + urlencode({**base, **params}), timeout=5) as response:
                return json.load(response)

        with (root / "run.log").open("w") as log:
            subprocess.run([binary, "import"], cwd=root, stdout=log, stderr=log, check=True, timeout=30)
            process = subprocess.Popen([binary, "server", "--log-level", "error"], cwd=root, stdout=log, stderr=log)
            try:
                for attempt in range(20):
                    try:
                        strict = query(requireBikeTransport="true")
                        break
                    except OSError:
                        if attempt == 19 or process.poll() is not None:
                            raise
                        time.sleep(.25)
                unrestricted = query(requireBikeTransport="false")
                via = query(requireBikeTransport="true", via="fixture_B")
            finally:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

        def summary(response):
            return [{"arrival": it["endTime"], "services": [leg["routeShortName"] for leg in it["legs"] if "routeShortName" in leg]}
                    for it in response["itineraries"]]

        strict, unrestricted, via = map(summary, [strict, unrestricted, via])
        assert [x["services"] for x in strict] == [["OK"]], strict
        assert [x["services"] for x in unrestricted] == [["NO"]], unrestricted
        assert [x["services"] for x in via] == [["OK"]], via
        filtered = [x for x in unrestricted if "NO" not in x["services"]]
        assert not filtered  # The unknown-permission winner was already pruned.
        print(json.dumps({"checkedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "motis": version,
            "fixture": "Synthetic three-service GTFS; station endpoints; one date; no street network",
            "currentSolver": fixture["current"], "motisStrict": strict, "motisUnrestricted": unrestricted,
            "motisViaStop": via, "postfilterProhibitedFromUnrestricted": filtered,
            "conclusion": "A simple boolean request plus result postfilter cannot reproduce the middle bicycle scope on this fixture.",
            "notTested": ["Swiss feed coverage", "intermediate cycling", "coordinate waypoints", "category completeness", "national performance", "fares"]}, indent=2))


if __name__ == "__main__":
    main()
