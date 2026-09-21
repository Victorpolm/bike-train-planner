import unittest
import xml.etree.ElementTree as ET
from ojp_benchmark import NS, request_xml, summarize


class OjpBenchmarkTest(unittest.TestCase):
    def test_paired_requests_share_endpoints_and_departure(self):
        for flag in [False, True]:
            root = ET.fromstring(request_xml("47.375,8.54", "8503000", "2026-09-22T08:00:00+02:00", flag))
            self.assertEqual(root.findtext(".//o:BikeTransport", namespaces=NS), str(flag).lower())
            self.assertEqual(root.findtext(".//o:Origin/o:PlaceRef/o:GeoPosition/s:Latitude", namespaces=NS), "47.375")
            self.assertEqual(root.findtext(".//o:Destination/o:PlaceRef/o:StopPlaceRef", namespaces=NS), "8503000")
            self.assertEqual(root.findtext(".//o:DepArrTime", namespaces=NS), "2026-09-22T08:00:00+02:00")
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


if __name__ == "__main__":
    unittest.main()
