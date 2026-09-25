"""Stream a national GTFS ZIP into an atomic, dated SQLite index. Python stdlib only.

The ZIP and database stay outside Git. Explicit service dates bound disk/memory;
the following day is included for overnight searches. No external requests occur.
"""
import argparse
import collections
import csv
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import time
import zipfile

WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
BIKE_CODES = {'VN', 'VR', 'VB', 'VI', 'VC', 'VK', 'VT'}

def rows(archive, name):
    if name not in archive.namelist():
        return
    with archive.open(name) as stream:
        yield from csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig', newline=''))

def seconds(value):
    if not value:
        return None
    h, m, s = map(int, value.split(':'))
    if h < 0 or not 0 <= m < 60 or not 0 <= s < 60:
        raise ValueError('Invalid GTFS time')
    return h * 3600 + m * 60 + s

def build(source, output, dates):
    started = time.monotonic()
    output = Path(output)
    temporary = output.with_suffix(output.suffix + '.importing')
    temporary.unlink(missing_ok=True)
    report = {'source': 'Swiss national GTFS', 'source_url': 'https://data.opentransportdata.swiss/dataset/timetable-2026-gtfs2020',
              'imported_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'requested_dates': sorted(set(dates)),
              'counts': {}, 'warnings': [], 'bike_hint_counts': collections.Counter()}
    with open(source, 'rb') as stream:
        report['sha256'] = hashlib.file_digest(stream, 'sha256').hexdigest()
    connection = sqlite3.connect(temporary)
    connection.executescript('''
      PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=FILE; PRAGMA cache_size=-64000;
      CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE stops(id TEXT PRIMARY KEY, name TEXT, lat REAL, lon REAL, parent TEXT, platform TEXT, uic TEXT);
      CREATE TABLE agencies(id TEXT PRIMARY KEY, name TEXT, timezone TEXT);
      CREATE TABLE routes(id TEXT PRIMARY KEY, agency TEXT, name TEXT, category TEXT, type TEXT);
      CREATE TABLE service_dates(service TEXT, date TEXT, PRIMARY KEY(service,date));
      CREATE TABLE trips(id TEXT PRIMARY KEY, route TEXT, service TEXT, headsign TEXT, number TEXT, original_id TEXT, hints TEXT);
      CREATE TABLE stop_times(trip TEXT, seq INTEGER, stop TEXT, arrival INTEGER, departure INTEGER, pickup INTEGER, dropoff INTEGER);
      CREATE TABLE transfers(from_stop TEXT, to_stop TEXT, type INTEGER, seconds INTEGER);
      CREATE TABLE frequencies(trip TEXT, start INTEGER, end INTEGER, headway INTEGER, exact INTEGER);
    ''')
    try:
        with zipfile.ZipFile(source) as archive:
            for name in ['agency.txt', 'routes.txt', 'trips.txt', 'stops.txt', 'stop_times.txt']:
                if name not in archive.namelist():
                    raise ValueError('Required file missing: ' + name)
            feed = next(rows(archive, 'feed_info.txt'), {})
            report['feed'] = feed
            report['uncompressed_bytes'] = sum(info.file_size for info in archive.infolist())
            valid_dates = set()
            for date in dates:
                day = dt.date.fromisoformat(date)
                for offset in (-1, 0, 1):
                    actual = day + dt.timedelta(days=offset)
                    key = actual.strftime('%Y%m%d')
                    if feed.get('feed_start_date', key) <= key <= feed.get('feed_end_date', key):
                        valid_dates.add(actual)
                    elif offset == 0:
                        raise ValueError('Requested date is outside feed validity: ' + date)
            if not valid_dates:
                raise ValueError('No service dates requested')
            active = {d: set() for d in valid_dates}
            for row in rows(archive, 'calendar.txt'):
                for day, services in active.items():
                    key = day.strftime('%Y%m%d')
                    if row['start_date'] <= key <= row['end_date'] and row[WEEKDAYS[day.weekday()]] == '1':
                        services.add(row['service_id'])
            date_keys = {day.strftime('%Y%m%d'): day for day in valid_dates}
            for row in rows(archive, 'calendar_dates.txt'):
                if row['date'] in date_keys:
                    services = active[date_keys[row['date']]]
                    if row['exception_type'] == '1':
                        services.add(row['service_id'])
                    elif row['exception_type'] == '2':
                        services.discard(row['service_id'])
            selected_services = set().union(*active.values())
            connection.executemany('INSERT INTO service_dates VALUES (?,?)',
                ((s, d.isoformat()) for d, services in active.items() for s in services))
            report['indexed_dates'] = sorted(d.isoformat() for d in valid_dates)
            for row in rows(archive, 'agency.txt'):
                connection.execute('INSERT INTO agencies VALUES (?,?,?)', (row['agency_id'], row['agency_name'], row.get('agency_timezone', 'Europe/Zurich')))
            route_types = collections.Counter()
            for row in rows(archive, 'routes.txt'):
                connection.execute('INSERT INTO routes VALUES (?,?,?,?,?)', (row['route_id'], row['agency_id'], row.get('route_short_name', ''), row.get('route_desc', ''), row['route_type']))
                route_types[row['route_type']] += 1
            report['routes_by_type'] = dict(route_types)
            for row in rows(archive, 'stops.txt'):
                connection.execute('INSERT INTO stops VALUES (?,?,?,?,?,?,?)', (row['stop_id'], row['stop_name'], float(row['stop_lat']), float(row['stop_lon']), row.get('parent_station', ''), row.get('platform_code', ''), row.get('didok', '')))
            selected_trips = set()
            all_trips = 0
            for row in rows(archive, 'trips.txt'):
                all_trips += 1
                report['bike_hint_counts'].update(set(row.get('hints', '').split()) & BIKE_CODES)
                if row['service_id'] not in selected_services:
                    continue
                selected_trips.add(row['trip_id'])
                connection.execute('INSERT INTO trips VALUES (?,?,?,?,?,?,?)', (row['trip_id'], row['route_id'], row['service_id'], row.get('trip_headsign', ''), row.get('trip_short_name', ''), row.get('original_trip_id', ''), row.get('hints', '')))
            report['all_feed_trips'] = all_trips
            print(json.dumps({'phase': 'stop_times', 'selected_trips': len(selected_trips)}), flush=True)
            batch = []
            all_stop_times = 0
            for row in rows(archive, 'stop_times.txt'):
                all_stop_times += 1
                if row['trip_id'] not in selected_trips:
                    continue
                batch.append((row['trip_id'], int(row['stop_sequence']), row['stop_id'], seconds(row['arrival_time']), seconds(row['departure_time']), int(row.get('pickup_type') or 0), int(row.get('drop_off_type') or 0)))
                if len(batch) >= 20000:
                    connection.executemany('INSERT INTO stop_times VALUES (?,?,?,?,?,?,?)', batch)
                    batch.clear()
            connection.executemany('INSERT INTO stop_times VALUES (?,?,?,?,?,?,?)', batch)
            report['all_feed_stop_times'] = all_stop_times
            for row in rows(archive, 'frequencies.txt'):
                if row['trip_id'] in selected_trips:
                    connection.execute('INSERT INTO frequencies VALUES (?,?,?,?,?)', (row['trip_id'], seconds(row['start_time']), seconds(row['end_time']), int(row['headway_secs']), int(row.get('exact_times') or 0)))
            batch = []
            for row in rows(archive, 'transfers.txt'):
                batch.append((row['from_stop_id'], row['to_stop_id'], int(row['transfer_type']), int(row.get('min_transfer_time') or 0)))
                if len(batch) >= 20000:
                    connection.executemany('INSERT INTO transfers VALUES (?,?,?,?)', batch); batch.clear()
            connection.executemany('INSERT INTO transfers VALUES (?,?,?,?)', batch)
            report['has_pathways'] = 'pathways.txt' in archive.namelist()
            report['has_shapes'] = 'shapes.txt' in archive.namelist()
        print(json.dumps({'phase': 'indexes'}), flush=True)
        connection.executescript('''
          CREATE INDEX stop_departures ON stop_times(stop,departure);
          CREATE UNIQUE INDEX trip_sequence ON stop_times(trip,seq);
          CREATE INDEX trips_service ON trips(service);
          CREATE INDEX stops_uic ON stops(uic);
          CREATE INDEX stops_parent ON stops(parent);
          CREATE INDEX transfers_from ON transfers(from_stop);
          CREATE INDEX frequencies_trip ON frequencies(trip);
          PRAGMA optimize;
        ''')
        for table in ['agencies', 'routes', 'stops', 'trips', 'stop_times', 'transfers', 'frequencies']:
            report['counts'][table] = connection.execute('SELECT count(*) FROM ' + table).fetchone()[0]
        orphan = connection.execute('SELECT count(*) FROM stop_times s LEFT JOIN stops p ON p.id=s.stop WHERE p.id IS NULL').fetchone()[0]
        if orphan:
            raise ValueError(f'{orphan} stop times refer to absent stops')
        if not report['counts']['trips'] or not report['counts']['stop_times']:
            raise ValueError('No active timetable data imported')
        report['warnings'] = ['Scheduled data; realtime disruptions are not included.',
            'Only indexed service dates are available; other dates must use a fresh index or live timetable.',
            'Timetable coverage is not a complete cycle-path or station-access inventory.']
        report['elapsed_seconds'] = round(time.monotonic() - started, 2)
        connection.execute('INSERT INTO metadata VALUES (?,?)', ('report', json.dumps(report)))
        connection.commit()
        connection.close()
        os.replace(temporary, output)
        report['database_bytes'] = output.stat().st_size
        output.with_suffix('.report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report), flush=True)
        return report
    except BaseException:
        connection.close(); temporary.unlink(missing_ok=True)
        raise

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('zip')
    parser.add_argument('database')
    parser.add_argument('--date', action='append', required=True, help='Swiss service date; repeat for several dates')
    args = parser.parse_args()
    build(args.zip, args.database, args.date)
