import datetime, importlib.util, json, pathlib, tempfile, unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('refresh',pathlib.Path(__file__).with_name('refresh-station-transfers.py'))
refresh=importlib.util.module_from_spec(spec);spec.loader.exec_module(refresh)

class TransferRefreshTests(unittest.TestCase):
    def test_only_publisher_https_and_requested_year(self):
        urls=['https://evil.example/gtfs_fp2027_20261201.zip','http://data.opentransportdata.swiss/gtfs_fp2027_20261201.zip',
              'https://data.opentransportdata.swiss/x/gtfs_fp2026_20261201.zip','https://data.opentransportdata.swiss/x/gtfs_fp2027_20261007.zip']
        self.assertEqual(refresh.resource({'result':{'resources':[{'url':u} for u in urls]}},2027)[0],'20261007')
        with self.assertRaises(ValueError):refresh.resource({'result':{'resources':[{'url':urls[0]}]}},2027)
    def test_failed_refresh_preserves_previous_manifest_and_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            output=pathlib.Path(directory); manifest={'feeds':[{'year':2026,'edition':'20260930','validFrom':'2025-12-14','validThrough':'2026-12-12'}]}
            previous=json.dumps(manifest);(output/'index.json').write_text(previous)
            with patch.object(refresh,'retrieve',side_effect=RuntimeError('offline')):
                with self.assertRaises(RuntimeError):refresh.refresh(output,datetime.date(2026,10,11))
            self.assertEqual((output/'index.json').read_text(),previous)
    def test_current_and_next_year_are_published_together_with_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            output=pathlib.Path(directory)
            def retrieve(url,path,limit):
                year=2027 if '2027' in url else 2026
                path.write_text(f'<a href="/en/dataset/example/resource_permalink/gtfs_fp{year}_20261007.zip">Download</a>')
            def compile(path):
                year=int(path.stem)
                return {'feed':{'validFrom':f'{year-1}-12-13','validThrough':f'{year}-12-12','generalRules':2000,'stopCount':3000},'stops':[],'rules':[]}
            with patch.object(refresh,'retrieve',side_effect=retrieve),patch.object(refresh.compiler,'compile_archive',side_effect=compile):
                refresh.refresh(output,datetime.date(2026,10,11))
            data=json.loads((output/'index.json').read_text());self.assertEqual(len(data['feeds']),2)
            for feed in data['feeds']:
                self.assertEqual(refresh.hashlib.sha256((output/feed['file']).read_bytes()).hexdigest(),feed['sha256'])
