import tempfile
import unittest
from pathlib import Path
from analyse_gpx import analyse

class GpxTests(unittest.TestCase):
    def test_flat_climb_pause_and_gap_without_location_disclosure(self):
        points=[]
        for i in range(12):
            time=10*i if i<6 else 10*i+60
            points.append(f'<trkpt lat="47" lon="{8+i*.00066}"><ele>{400+max(0,i-6)*3}</ele><time>2026-09-25T10:{time//60:02}:{time%60:02}Z</time></trkpt>')
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'ride.gpx'; path.write_text('<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>'+''.join(points)+'</trkseg></trk></gpx>')
            report=analyse(path)
        self.assertEqual(report['rejected_points_or_links'],1)
        self.assertIn('flat -1% to 1%',report['bins'])
        self.assertIn('uphill 3% to 6%',report['bins'])
        self.assertNotIn('2026-09-25',str(report)); self.assertNotIn('longitude',str(report))
    def test_planned_route_without_timestamps_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'route.gpx'; path.write_text('<gpx><trk><trkseg><trkpt lat="47" lon="8"/><trkpt lat="48" lon="8"/></trkseg></trk></gpx>')
            with self.assertRaisesRegex(ValueError,'recorded activity'): analyse(path)

if __name__=='__main__': unittest.main()
