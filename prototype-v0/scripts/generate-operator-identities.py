"""Derive exact, dated business identities from the official Atlas CSV/inventory.
Usage: python scripts/generate-operator-identities.py INPUT_CSV --checked YYYY-MM-DD
Only public identity fields are retained. No tariff/permission membership is inherited.
"""
import argparse,csv,hashlib,io,json
from collections import defaultdict
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('--checked',required=True);a=p.parse_args()
b=Path(a.input).read_bytes();text=b.decode('utf-8-sig')
rows=list(csv.DictReader(io.StringIO(text),delimiter=';' if text.splitlines()[0].count(';')>text.splitlines()[0].count(',') else ','))
by=defaultdict(set)
for r in rows:
    if r.get('status')!='VALIDATED' or not r.get('sboid') or not r.get('organisationNumber','').isdigit():continue
    start,end=r['validFrom'],r['validTo']
    if not start<=a.checked<=end:continue
    # Use the business abbreviation, not the parent company. Sibling businesses
    # can have different policies (e.g. STI vs STI Berg).
    abbr=' '.join(r.get('abbreviationEn','').upper().split())
    if not abbr:continue
    code=str(int(r['organisationNumber']))
    row=(code,r['sboid'].upper(),abbr,start,end,r.get('businessTypesId',''))
    for key in ['OJP:'+code,r['sboid'].upper()]:by[key].add(row)
selected={k:list(next(iter(v))) for k,v in sorted(by.items()) if len(v)==1}
result={'source':'https://data.opentransportdata.swiss/dataset/business-organisation-v2/permalink','checked':a.checked,
        'inputSha256':hashlib.sha256(b).hexdigest(),'columns':['businessNumber','sboid','abbreviation','validFrom','validThrough','businessTypes'],
        'ambiguousKeysExcluded':sum(len(v)>1 for v in by.values()),'identities':selected}
Path('src/operator-identities.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'{len(selected)} exact identity keys; {result["ambiguousKeysExcluded"]} ambiguous keys excluded')
