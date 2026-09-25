"""Summarise a timestamped GPX ride into slope bins, without coordinates or dates.

This is a calibration input report, not a fitted speed model. No uploads or
external requests occur. Use --output for a private JSON report.
"""
import argparse
import datetime as dt
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

def distance(a, b):
    lat1,lon1,lat2,lon2=map(math.radians,[a[0],a[1],b[0],b[1]])
    v=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371000*2*math.asin(min(1,math.sqrt(v)))

def points(segment):
    for element in segment:
        if element.tag.rsplit('}',1)[-1]!='trkpt': continue
        data={child.tag.rsplit('}',1)[-1]:child.text for child in element}
        try:
            lat,lon=float(element.attrib['lat']),float(element.attrib['lon'])
            time=dt.datetime.fromisoformat(data['time'].replace('Z','+00:00'))
            if not -90<=lat<=90 or not -180<=lon<=180 or time.tzinfo is None: raise ValueError()
            elevation=float(data['ele']) if data.get('ele') else None
            if elevation is not None and not math.isfinite(elevation): elevation=None
            yield (lat,lon,time,elevation)
        except (KeyError,TypeError,ValueError): yield None

def slope_bin(slope):
    if slope is None: return 'elevation unknown'
    if slope < -3: return 'downhill below -3%'
    if slope < -1: return 'gentle downhill -3% to -1%'
    if slope <= 1: return 'flat -1% to 1%'
    if slope <= 3: return 'gentle uphill 1% to 3%'
    if slope <= 6: return 'uphill 3% to 6%'
    return 'steep uphill above 6%'

def analyse(path):
    if Path(path).stat().st_size>32*1024*1024: raise ValueError('GPX is larger than 32 MiB')
    root=ET.parse(path).getroot()
    bins={}; moving_distance=0.; moving_seconds=0.; stopped_seconds=0.; rejected=0; point_count=0; windows=0
    for segment in root.iter():
        if segment.tag.rsplit('}',1)[-1]!='trkseg': continue
        previous=None; window_start=None; window_distance=0.; window_seconds=0.; missing_elevation=False
        for point in points(segment):
            point_count+=1
            if point is None or previous is None:
                previous=point; window_start=point; window_distance=0.; window_seconds=0.; missing_elevation=False
                if point is None: rejected+=1
                continue
            seconds=(point[2]-previous[2]).total_seconds(); metres=distance(previous,point)
            if seconds<=0 or seconds>30 or metres/seconds>25:
                rejected+=1; previous=point; window_start=point; window_distance=0.; window_seconds=0.; missing_elevation=False; continue
            if metres/seconds<0.7:
                stopped_seconds+=seconds; previous=point; window_start=point; window_distance=0.; window_seconds=0.; missing_elevation=False; continue
            moving_distance+=metres; moving_seconds+=seconds
            window_distance+=metres; window_seconds+=seconds
            missing_elevation |= point[3] is None or previous[3] is None
            if window_distance>=100:
                slope=None if missing_elevation or window_start[3] is None else 100*(point[3]-window_start[3])/window_distance
                key=slope_bin(slope); bucket=bins.setdefault(key,{'metres':0.,'seconds':0.,'windows':0})
                bucket['metres']+=window_distance; bucket['seconds']+=window_seconds; bucket['windows']+=1; windows+=1
                window_start=point; window_distance=0.; window_seconds=0.; missing_elevation=False
            previous=point
    if point_count<2 or moving_seconds<=0: raise ValueError('No usable timestamped moving track points found; export the recorded activity, not a planned route')
    return {'point_count':point_count,'moving_km':round(moving_distance/1000,3),'moving_minutes':round(moving_seconds/60,2),
        'stopped_minutes':round(stopped_seconds/60,2),'rejected_points_or_links':rejected,'slope_windows':windows,
        'bins':{k:{'distance_km':round(v['metres']/1000,3),'minutes':round(v['seconds']/60,2),
                   'speed_kmh':round(v['metres']/v['seconds']*3.6,2),'windows':v['windows']} for k,v in bins.items()},
        'notes':['No coordinates, exact dates or track names are included in this report.',
                 'Slope uses moving windows of at least 100 metres; elevation noise and wind are not corrected.',
                 'Stops, gaps over 30 seconds and links above 90 km/h are excluded from moving calibration.',
                 'Short window remainders are excluded from slope bins but retained in moving totals.',
                 'This report does not change the cycling model automatically.']}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('gpx'); parser.add_argument('--output')
    args=parser.parse_args(); text=json.dumps(analyse(args.gpx),indent=2)
    if args.output: Path(args.output).write_text(text+'\n',encoding='utf-8')
    else: print(text)
