#!/usr/bin/env python3
"""Compile a user-supplied Swiss GTFS extract; never unpack or publish the bulk CSVs."""
import argparse, base64, collections, csv, gzip, hashlib, io, json, pathlib, zipfile

SCOPE = ('from_route_id', 'to_route_id', 'from_trip_id', 'to_trip_id', 'service_id')

def compile_archive(path):
    with zipfile.ZipFile(path) as archive:
        def rows(name, required):
            files = [f for f in archive.namelist() if f.split('/')[-1] == name]
            if len(files) != 1:
                raise ValueError(f'Expected exactly one {name}')
            reader = csv.DictReader(io.TextIOWrapper(archive.open(files[0]), encoding='utf-8-sig'))
            if not set(required).issubset(reader.fieldnames or []):
                raise ValueError(f'Missing columns in {name}')
            return reader
        stops = sorted(rows('stops.txt', ('stop_id', 'original_stop_id', 'parent_station', 'platform_code', 'didok', 'location_type')), key=lambda r:r['stop_id'])
        ids = {r['stop_id']: i for i, r in enumerate(stops)}
        if len(ids) != len(stops): raise ValueError('Duplicate stop ids')
        stop_rows = [[r['stop_id'], r['original_stop_id'], r['didok'], ids.get(r['parent_station'], -1), r['platform_code'], r['location_type']] for r in stops]
        feed = list(rows('feed_info.txt', ('feed_version', 'feed_start_date', 'feed_end_date')))
        if len(feed) != 1: raise ValueError('Expected one feed_info row')
        counts = collections.Counter(); pairs = {}
        for r in rows('transfers.txt', ('from_stop_id', 'to_stop_id', 'transfer_type', 'min_transfer_time', *SCOPE)):
            counts['totalRows'] += 1
            if r['from_stop_id'] not in ids or r['to_stop_id'] not in ids: raise ValueError('Unknown transfer stop')
            if any(r[k] for k in SCOPE):
                counts['excludedScopedRows'] += 1; continue
            if r['transfer_type'] != '2':
                counts['excludedOtherTypes'] += 1; continue
            seconds = int(r['min_transfer_time'])
            if seconds < 0: raise ValueError('Negative minimum transfer')
            pair = (ids[r['from_stop_id']], ids[r['to_stop_id']])
            if pair in pairs and pairs[pair] != seconds: raise ValueError('Conflicting general minima')
            pairs[pair] = seconds; counts['generalRows'] += 1
        date = lambda s: f'{s[:4]}-{s[4:6]}-{s[6:8]}'
        meta = dict(version=feed[0]['feed_version'], validFrom=date(feed[0]['feed_start_date']), validThrough=date(feed[0]['feed_end_date']),
                    publisher=feed[0].get('feed_publisher_name'), source='https://opentransportdata.swiss/en/cookbook/timetable-cookbook/gtfs/',
                    zipSha256=hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest(), stopCount=len(stops), generalRules=len(pairs), **counts)
        return {'feed':meta, 'stops':stop_rows, 'rules':[[a,b,v] for (a,b),v in sorted(pairs.items())]}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive'); parser.add_argument('--output', default='server/data/station-transfers.json')
    args = parser.parse_args(); data = compile_archive(args.archive)
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
    encoded = {'feed':data['feed'], 'gzip':base64.b64encode(gzip.compress(raw, mtime=0)).decode()}
    output = pathlib.Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(encoded, separators=(',', ':'))+'\n')
    print(json.dumps(dict(**data['feed'], runtimeBytes=output.stat().st_size, decodedBytes=len(raw))))
