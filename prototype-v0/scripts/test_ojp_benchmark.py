import unittest
import xml.etree.ElementTree as ET
import io
from pathlib import Path
import tempfile
from unittest.mock import patch
import urllib.error
from ojp_benchmark import NS, capture_pair, request_xml, summarize
from ojp_matrix import departure_timestamp, resolve_endpoint, render_report


class OjpBenchmarkTest(unittest.TestCase):
    def test_paired_requests_share_endpoints_and_departure(self):
        for flag in [False, True]:
            root = ET.fromstring(request_xml("47.375,8.54", "ch:1:sloid:3000", "2026-09-22T08:00:00+02:00", flag))
            self.assertEqual(root.findtext(".//o:BikeTransport", namespaces=NS), str(flag).lower())
            self.assertEqual(root.findtext(".//o:Origin/o:PlaceRef/o:GeoPosition/s:Latitude", namespaces=NS), "47.375")
            self.assertEqual(root.findtext(".//o:Destination/o:PlaceRef/o:StopPlaceRef", namespaces=NS), "ch:1:sloid:3000")
            self.assertEqual(root.findtext(".//o:DepArrTime", namespaces=NS), "2026-09-22T08:00:00+02:00")
            self.assertEqual(root.findtext(".//o:UseRealtimeData", namespaces=NS), "none")
        with self.assertRaises(ValueError):
            request_xml("8503000", "8507000", "2026-09-22T08:00:00", False)

    def test_attributes_are_preserved_without_inventing_permission(self):
        xml = '''<OJP xmlns="http://www.vdv.de/ojp" xmlns:siri="http://www.siri.org.uk/siri">
          <OJPResponse><siri:ServiceDelivery><OJPTripDelivery><siri:Status>true</siri:Status>
          <TripResult><Trip><Id>controlled</Id><Duration>PT20M</Duration><Leg><TimedLeg>
            <LegBoard><siri:StopPointRef>A</siri:StopPointRef><ServiceDeparture><TimetabledTime>2026-09-22T06:00:00Z</TimetabledTime></ServiceDeparture></LegBoard>
            <LegAlight><siri:StopPointRef>B</siri:StopPointRef></LegAlight>
            <Service><JourneyRef>service-1</JourneyRef><OperatingDayRef>2026-09-22</OperatingDayRef><Mode><PtMode>bus</PtMode></Mode>
            <Attribute><Code>A__VB</Code><UserText><Text>Controlled limited-space note</Text></UserText></Attribute></Service>
          </TimedLeg></Leg></Trip></TripResult></OJPTripDelivery></siri:ServiceDelivery></OJPResponse></OJP>'''
        result = summarize(xml)
        leg = result["trips"][0]["legs"][0]
        self.assertEqual(leg["bicycle_permission"], "unassessed")
        self.assertEqual(leg["attributes"][0]["code"], "A__VB")
        self.assertEqual(leg["journey_ref"], "service-1")
        self.assertEqual(result["trips"][0]["boardings"], 1)
        with self.assertRaises(ValueError):
            summarize("<html><body>Service unavailable</body></html>")

    def test_capture_redacts_unexpected_echo_and_stops_on_auth_failure(self):
        key = "controlled-not-a-real-credential"
        error = urllib.error.HTTPError("https://example.test", 401, "not saved " + key, {},
                                       io.BytesIO(("unexpected echo " + key).encode()))
        with tempfile.TemporaryDirectory() as temp, patch("ojp_benchmark.time.sleep"), \
                patch("ojp_benchmark.urllib.request.build_opener") as opener:
            opener.return_value.open.side_effect = error
            output = Path(temp) / "capture"
            report = capture_pair("47.375,8.54", "ch:1:sloid:3000", "2026-09-22T08:00:00+02:00", output, "Bearer " + key)
            self.assertTrue(report["failed"])
            self.assertEqual(len(report["runs"]), 1)
            self.assertEqual(report["runs"][0]["http_status"], 401)
            self.assertEqual(opener.return_value.open.call_count, 1)
            for path in output.iterdir():
                self.assertNotIn(key, path.read_text())

    def test_failed_provider_delivery_is_not_an_empty_success(self):
        xml = b'<OJP xmlns="http://www.vdv.de/ojp" xmlns:s="http://www.siri.org.uk/siri"><OJPTripDelivery><s:Status>false</s:Status><ErrorCondition>Bad request</ErrorCondition></OJPTripDelivery></OJP>'
        with tempfile.TemporaryDirectory() as temp, patch("ojp_benchmark.time.sleep"), \
                patch("ojp_benchmark.urllib.request.build_opener") as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = xml
            report = capture_pair("47.375,8.54", "ch:1:sloid:3000", "2026-09-22T08:00:00+02:00", Path(temp) / "capture", "controlled-key")
            self.assertTrue(report["failed"])
            self.assertEqual(report["runs"][0]["trips"], [])
            self.assertTrue(report["runs"][0]["errors"])

    def test_dry_run_uses_no_network_and_requires_no_key(self):
        with tempfile.TemporaryDirectory() as temp, patch("ojp_benchmark.urllib.request.build_opener") as opener:
            report = capture_pair("47.375,8.54", "ch:1:sloid:3000", "2026-09-22T08:00:00+02:00", Path(temp) / "capture", dry_run=True)
            self.assertFalse(report["failed"])
            self.assertEqual(len(report["runs"]), 2)
            opener.assert_not_called()

    def test_exact_address_matching_rejects_neighbours_and_ambiguity(self):
        spec = {"provider": "geoadmin", "query": "Example Street 33 Testville",
                "required_label_parts": ["Example Street 33", "Testville"]}
        def result(label, lat=47.3):
            return {"attrs": {"label": label, "lat": lat, "lon": 8.5}}
        with patch("ojp_matrix.public_json", return_value={"results": [result("Example Street 330, Testville")] }):
            with self.assertRaises(ValueError):
                resolve_endpoint(spec)
        with patch("ojp_matrix.public_json", return_value={"results": [result("<b>Example Street 33</b> 1234 Testville")] }):
            self.assertEqual(resolve_endpoint(spec)["value"], "47.3,8.5")
        with patch("ojp_matrix.public_json", return_value={"results": [result("Example Street 33 Testville"), result("Example Street 33 Testville", 47.4)]}):
            with self.assertRaises(ValueError):
                resolve_endpoint(spec)

    def test_swiss_offsets_and_missing_location_report(self):
        self.assertEqual(departure_timestamp("2026-09-22", "01:54"), "2026-09-22T01:54:00+02:00")
        self.assertEqual(departure_timestamp("2026-12-01", "08:00"), "2026-12-01T08:00:00+01:00")
        report = render_report({"departure_date": "2026-09-22", "cases": [{"id": "a", "error": "Location failed"}]})
        self.assertIn("Location failed", report)
        self.assertIn("not a bicycle-time comparison", report)

    def test_recorded_ojp_fields_and_wait_are_preserved(self):
        xml = (Path(__file__).parent / "fixtures" / "ojp-zurich-night-2026-09-21.xml").read_bytes()
        result = summarize(xml, "2026-09-22T01:54:00+02:00")
        trip = result["trips"][0]
        self.assertEqual(trip["duration"], "PT26M")
        self.assertEqual(trip["wait_before_start_minutes"], 192)
        self.assertEqual(trip["request_to_arrival_minutes"], 218)
        self.assertFalse(trip["starts_before_request"])
        self.assertEqual(trip["legs"][0]["line"], "31")
        self.assertEqual(trip["legs"][0]["service_name"], "31")
        self.assertTrue(trip["legs"][0]["line_ref"])
        self.assertEqual(trip["active_legs"][0]["duration"], "PT6M")
        self.assertEqual(trip["legs"][0]["bicycle_permission"], "unassessed")
        # The real successful delivery omits optional Status fields.
        self.assertEqual(result["statuses"], [])


if __name__ == "__main__":
    unittest.main()
