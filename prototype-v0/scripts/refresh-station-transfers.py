#!/usr/bin/env python3
"""Refresh compact current/next-year GTFS transfer indexes on a trusted CI runner.
Bulk ZIPs remain temporary. A failed download/import never changes the manifest.
"""
import html.parser
import argparse, base64, datetime, gzip, hashlib, importlib.util, json, pathlib, re, tempfile, urllib.parse, urllib.request

spec = importlib.util.spec_from_file_location('import_transfers', pathlib.Path(__file__).with_name('import-station-transfers.py'))
compiler = importlib.util.module_from_spec(spec); spec.loader.exec_module(compiler)
HOST = 'data.opentransportdata.swiss'
MAX_ARCHIVE = 500_000_000

def retrieve(url, path, limit):
    request = urllib.request.Request(url, headers={'User-Agent': 'Re.route transfer refresh (public GTFS)'})
    with urllib.request.urlopen(request, timeout=90) as response, path.open('wb') as out:
        total = 0
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > limit: raise ValueError('Download size exceeds limit')
            out.write(chunk)

def resource(metadata, year):
    candidates = []
    for r in metadata.get('result', {}).get('resources', []):
        url = r.get('url', '')
        parsed = urllib.parse.urlparse(url)
        match = re.search(r'gtfs_fp'+str(year)+r'_(\d{8})\.zip', url, re.I)
        if match and parsed.scheme == 'https' and parsed.hostname == HOST:
            candidates.append((match.group(1), url))
    if not candidates: raise ValueError(f'No official GTFS archive for {year}')
    return max(candidates)

def catalogue_resources(page):
    class Links(html.parser.HTMLParser):
        def __init__(self): super().__init__(); self.resources=[]
        def handle_starttag(self, tag, attrs):
            href=dict(attrs).get('href', '')
            if tag == 'a' and '.zip' in href.lower():
                self.resources.append({'url':urllib.parse.urljoin(f'https://{HOST}',href)})
    parser=Links();parser.feed(page)
    return {'result':{'resources':parser.resources}}

def refresh(output, today):
    old = json.loads((output / 'index.json').read_text()) if (output / 'index.json').exists() else {'feeds': []}
    feeds = {entry['year']: entry for entry in old['feeds'] if today.year - 1 <= entry['year'] <= today.year + 1}
    pending = []
    with tempfile.TemporaryDirectory() as temporary:
        directory = pathlib.Path(temporary)
        for year in [today.year, today.year + 1]:
            meta = directory / f'{year}.json'
            try:
                retrieve(f'https://{HOST}/en/dataset/timetable-{year}-gtfs2020', meta, 5_000_000)
                edition, url = resource(catalogue_resources(meta.read_text()), year)
            except urllib.error.HTTPError as error:
                if year > today.year and error.code == 404: continue
                raise
            if feeds.get(year, {}).get('edition') == edition: continue
            archive = directory / f'{year}.zip'; retrieve(url, archive, MAX_ARCHIVE)
            data = compiler.compile_archive(archive)
            feed = data['feed']; start = datetime.date.fromisoformat(feed['validFrom']); end = datetime.date.fromisoformat(feed['validThrough'])
            if not (start < end and start.year in [year-1, year] and end.year == year
                    and feed['generalRules'] > 1000 and feed['stopCount'] > 1000):
                raise ValueError('Unexpected transfer feed coverage/schema')
            # Do not replace a usable feed by a narrower partial delivery.
            previous = feeds.get(year)
            if previous and (feed['validFrom'] > previous['validFrom'] or feed['validThrough'] < previous['validThrough']):
                raise ValueError('Replacement would shorten feed coverage')
            raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
            if len(raw) > 24_000_000: raise ValueError('Runtime index exceeds decompression budget')
            packed = json.dumps({'feed':feed, 'gzip':base64.b64encode(gzip.compress(raw, mtime=0)).decode()}, separators=(',', ':')).encode()+b'\n'
            name = f'{year}-{edition}.json'
            feeds[year] = {'year':year, 'edition':edition, 'file':name, 'sha256':hashlib.sha256(packed).hexdigest(),
                           'bytes':len(packed), 'validFrom':feed['validFrom'], 'validThrough':feed['validThrough'], 'source':url}
            pending.append((name, packed))
        if not any(f['validFrom'] <= today.isoformat() <= f['validThrough'] for f in feeds.values()):
            raise ValueError('No transfer edition covers today')
        if today.month == 12 and today.day >= 1 and not any(f['year'] > today.year for f in feeds.values()):
            raise ValueError('Next-year feed missing before timetable rollover')
        if pending or len(feeds) != len(old['feeds']):
            output.mkdir(parents=True, exist_ok=True)
            for name, packed in pending: (output / name).write_bytes(packed)
            manifest = {'version':1, 'checked':today.isoformat(), 'feeds': sorted(feeds.values(), key=lambda f:f['year'])}
            temporary_manifest=output / 'index.pending'
            temporary_manifest.write_text(json.dumps(manifest, indent=2)+'\n')
            temporary_manifest.replace(output / 'index.json')
            retained={entry['file'] for entry in feeds.values()}
            for file in output.glob('????-????????.json'):
                if file.name not in retained: file.unlink()
        print(json.dumps({'checked':today.isoformat(), 'updated':len(pending), 'feeds':list(feeds.values())}))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output', required=True)
    args=parser.parse_args();refresh(pathlib.Path(args.output), datetime.datetime.now(datetime.timezone.utc).date())
