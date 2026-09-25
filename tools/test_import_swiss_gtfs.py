import contextlib
import csv
import io
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path
from import_swiss_gtfs import build, seconds

class ImportTests(unittest.TestCase):
    def archive(self, path, orphan=False):
        data = {
            'agency.txt': [['agency_id','agency_name'],['11','SBB']],
            'routes.txt': [['route_id','agency_id','route_type'],['r','11','100']],
            'stops.txt': [['stop_id','stop_name','stop_lat','stop_lon','didok'],['a','A','47','8','8500001'],['b','B','47.1','8.1','8500002']],
            'trips.txt': [['trip_id','route_id','service_id','hints'],['t','r','active','VR VB'],['off','r','inactive','VN']],
            'stop_times.txt': [['trip_id','stop_sequence','stop_id','arrival_time','departure_time'],['t','1','absent' if orphan else 'a','25:00:00','25:00:00'],['t','2','b','25:20:00','25:20:00']],
            'calendar_dates.txt': [['service_id','date','exception_type'],['active','20260924','1'],['inactive','20260925','1'],['inactive','20260925','2']],
        }
        with zipfile.ZipFile(path,'w') as archive:
            for name, rows in data.items():
                stream=io.StringIO(); csv.writer(stream).writerows(rows); archive.writestr(name,stream.getvalue())
    def test_stream_import_preserves_overnight_and_calendar_exceptions(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'fixture.zip'; target=Path(directory)/'index.sqlite'; self.archive(source)
            with contextlib.redirect_stdout(io.StringIO()): report=build(source,target,['2026-09-25'])
            self.assertEqual(report['counts']['trips'],1)
            self.assertEqual(report['indexed_dates'],['2026-09-24','2026-09-25','2026-09-26'])
            with sqlite3.connect(target) as db:
                self.assertEqual(db.execute('select departure from stop_times order by seq limit 1').fetchone()[0],90000)
    def test_bad_import_preserves_existing_index_atomically(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'fixture.zip'; target=Path(directory)/'index.sqlite'; target.write_bytes(b'previous index'); self.archive(source,True)
            with self.assertRaisesRegex(ValueError,'absent stops'),contextlib.redirect_stdout(io.StringIO()): build(source,target,['2026-09-25'])
            self.assertEqual(target.read_bytes(),b'previous index')
            self.assertFalse(target.with_suffix('.sqlite.importing').exists())
    def test_rejects_invalid_time_and_accepts_missing_optional_time(self):
        self.assertEqual(seconds('26:01:02'),93662)
        self.assertIsNone(seconds(''))
        for value in ['-1:00:00','12:61:00','12:00:99']:
            with self.assertRaises(ValueError): seconds(value)

if __name__=='__main__': unittest.main()
