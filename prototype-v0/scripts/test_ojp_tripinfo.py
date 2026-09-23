import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import xml.etree.ElementTree as ET
from ojp_tripinfo import NS, capture, request_xml, summarize

REF = "controlled-dated-service"
DAY = "2026-09-22"
XML = b'''<OJP xmlns="http://www.vdv.de/ojp" xmlns:s="http://www.siri.org.uk/siri">
<OJPResponse><s:ServiceDelivery><OJPTripInfoDelivery><TripInfoResult>
<PreviousCall><s:StopPointRef>A</s:StopPointRef><Order>1</Order>
<Attribute><Code>controlled-stop-rule</Code><UserText><Text>Check bicycle restriction at this stop</Text></UserText></Attribute></PreviousCall>
<OnwardCall><s:StopPointRef>B</s:StopPointRef><Order>2</Order></OnwardCall>
<Service><JourneyRef>controlled-dated-service</JourneyRef><OperatingDayRef>2026-09-22</OperatingDayRef>
<Mode><PtMode>water</PtMode></Mode><Attribute><Code>controlled-bike-note</Code><UserText><Text>Bicycles subject to operator conditions</Text></UserText></Attribute></Service>
</TripInfoResult></OJPTripInfoDelivery></s:ServiceDelivery></OJPResponse></OJP>'''


class TripInfoTest(unittest.TestCase):
    def test_request_is_dated_and_does_not_request_formation_or_capacity(self):
        root = ET.fromstring(request_xml(REF, DAY))
        self.assertEqual(root.findtext(".//o:JourneyRef", namespaces=NS), REF)
        self.assertEqual(root.findtext(".//o:OperatingDayRef", namespaces=NS), DAY)
        self.assertEqual(root.findtext(".//o:IncludeCalls", namespaces=NS), "true")
        self.assertEqual(root.findtext(".//o:IncludeService", namespaces=NS), "true")
        self.assertIsNone(root.find(".//o:IncludeFormation", NS))
        with self.assertRaises(ValueError):
            request_xml(REF, "2026-02-30")

    def test_preserves_service_and_stop_scope_without_promoting_notes(self):
        result = summarize(XML, REF, DAY)["results"][0]
        self.assertEqual(result["bicycle_permission"], "unassessed")
        self.assertEqual(result["mode"], "water")
        self.assertIn("controlled-bike-note", result["service_conditions"][0])
        self.assertIn("controlled-stop-rule", result["calls"][0]["conditions"][0])
        self.assertEqual(result["calls"][1]["conditions"], [])
        with self.assertRaises(ValueError):
            summarize(XML, REF, "2026-09-23")
        with self.assertRaises(ValueError):
            summarize("<html/>", REF, DAY)

    def test_one_call_redacts_an_echo_and_does_not_retry_auth_failure(self):
        key = "controlled-placeholder-credential"
        error = urllib.error.HTTPError("https://example.test", 401, key, {}, io.BytesIO(key.encode()))
        with tempfile.TemporaryDirectory() as temp, patch("ojp_tripinfo.urllib.request.build_opener") as opener:
            opener.return_value.open.side_effect = error
            output = Path(temp) / "capture"
            report = capture(REF, DAY, output, key)
            self.assertTrue(report["failed"])
            self.assertEqual(opener.return_value.open.call_count, 1)
            self.assertTrue(all(key not in p.read_text() for p in output.iterdir()))

    def test_empty_delivery_is_not_a_successful_permission_lookup(self):
        xml = XML.replace(XML[XML.index(b"<TripInfoResult>"):XML.index(b"</TripInfoResult>") + len(b"</TripInfoResult>")], b"")
        with tempfile.TemporaryDirectory() as temp, patch("ojp_tripinfo.urllib.request.build_opener") as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = xml
            self.assertTrue(capture(REF, DAY, Path(temp) / "capture", "controlled-key")["failed"])

    def test_dry_run_needs_no_secret_and_makes_no_call(self):
        with tempfile.TemporaryDirectory() as temp, patch("ojp_tripinfo.urllib.request.build_opener") as opener:
            self.assertFalse(capture(REF, DAY, Path(temp) / "capture", dry_run=True)["failed"])
            opener.assert_not_called()


if __name__ == "__main__":
    unittest.main()
