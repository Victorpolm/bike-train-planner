"""Stream a Swiss OSM PBF coverage audit. Requires pyosmium; no routing claims.

Counts describe mapped objects, not road kilometres or real-world completeness.
Station samples are a 600 m radius inventory, not connected pathway graphs.
"""
import argparse
import collections
import datetime as dt
import hashlib
import json
from pathlib import Path
import osmium

STATIONS={'Zürich HB':(47.3782,8.5402),'Baden':(47.4764,8.3077),'Chur':(46.8531,9.5289)}

class Audit(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.counts=collections.Counter(); self.highways=collections.Counter(); self.tag_coverage=collections.Counter()
        self.station_nodes={name:set() for name in STATIONS}; self.station_counts={name:collections.Counter() for name in STATIONS}
    def node(self,node):
        self.counts['nodes']+=1
        if node.tags.get('amenity')=='bicycle_parking': self.counts['bicycle_parking_nodes']+=1
        if not node.location.valid(): return
        for name,(lat,lon) in STATIONS.items():
            if ((node.location.lat-lat)*111000)**2+((node.location.lon-lon)*76000)**2<=600**2:
                self.station_nodes[name].add(node.id)
                if node.tags.get('highway')=='elevator': self.station_counts[name]['elevator_nodes']+=1
                if node.tags.get('barrier'): self.station_counts[name]['barrier_nodes']+=1
                if node.tags.get('entrance'): self.station_counts[name]['entrance_nodes']+=1
    def way(self,way):
        self.counts['ways']+=1
        tags={tag.k:tag.v for tag in way.tags}; highway=tags.get('highway')
        if tags.get('amenity')=='bicycle_parking': self.counts['bicycle_parking_ways']+=1
        if not highway: return
        self.highways[highway]+=1
        for key in ['surface','smoothness','bicycle','foot','incline','lit','maxspeed','oneway','access']:
            if key in tags: self.tag_coverage[key]+=1
        if any(k.startswith('cycleway') for k in tags): self.tag_coverage['any_cycleway_tag']+=1
        if highway=='cycleway' or tags.get('bicycle')=='designated' or any(k.startswith('cycleway') and v not in ('no','none','separate') for k,v in tags.items()):
            self.counts['ways_with_cycle_infrastructure_or_designation']+=1
        refs={node.ref for node in way.nodes}
        for name,nodes in self.station_nodes.items():
            if not nodes.intersection(refs): continue
            if highway in ('footway','pedestrian','path','steps','elevator','corridor'):
                self.station_counts[name][highway+'_ways']+=1
                if tags.get('bicycle')=='no': self.station_counts[name]['movement_ways_bicycle_no']+=1
                if tags.get('bicycle')=='dismount': self.station_counts[name]['movement_ways_dismount']+=1
                if 'bicycle' not in tags: self.station_counts[name]['movement_ways_bicycle_unspecified']+=1
                if tags.get('foot')=='no': self.station_counts[name]['movement_ways_foot_no']+=1
                if tags.get('conveying') in ('yes','forward','backward','reversible'): self.station_counts[name]['conveying_ways']+=1

def audit(path):
    handler=Audit(); handler.apply_file(str(path),locations=False)
    with open(path,'rb') as source: sha=hashlib.file_digest(source,'sha256').hexdigest()
    return {'source':'Geofabrik Switzerland / OpenStreetMap contributors','source_url':'https://download.geofabrik.de/europe/switzerland.html',
        'license':'ODbL 1.0','audited_at':dt.datetime.now(dt.timezone.utc).isoformat(),'sha256':sha,'bytes':Path(path).stat().st_size,
        'counts':dict(handler.counts),'highway_ways':dict(handler.highways),'highway_tag_coverage':dict(handler.tag_coverage),
        'station_600m_inventory':{name:dict(values) for name,values in handler.station_counts.items()},
        'limits':['Object counts, not route length, legal bicycle access or complete real-world coverage.',
                  'Station inventories include nearby streets and do not establish a connected bicycle-compatible transfer.',
                  'OSM bicycle=no does not by itself settle whether pushing a bicycle is permitted; foot and access rules must also be evaluated.',
                  'Map absence means unknown. Escalators, lifts and steps require a station pathway audit before routing use.']}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('pbf'); parser.add_argument('--output',required=True)
    args=parser.parse_args(); result=audit(args.pbf); Path(args.output).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8'); print(json.dumps(result))
