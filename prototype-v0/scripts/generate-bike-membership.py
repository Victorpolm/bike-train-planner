"""Read official June 2026 AWBF tables; derive conservative membership candidates.

Usage: python generate-bike-membership.py PDF src/bike-membership.json
No permissions are inferred. Raw business numbers must remain separate.
"""
import sys,json,re,hashlib,datetime
from pathlib import Path
from collections import defaultdict,Counter
import pdfplumber
pdf=Path(sys.argv[1]);out=Path(sys.argv[2]);rows=[]
def norm(s):
 return re.sub(r'\s+',' ',(s or '').replace('\u00ad','')).strip()
with pdfplumber.open(pdf) as doc:
 assert len(doc.pages)==36, 'Review new table layout before deriving membership'
 title=doc.pages[0].extract_text()
 assert '01.06.2026' in title and 'Anwendungsbereiche' in title
 for index,page in enumerate(doc.pages[4:],5):
  tables=page.find_tables()
  table=max(tables,key=lambda t:(t.bbox[2]-t.bbox[0])*(t.bbox[3]-t.bbox[1]))
  data=table.extract()
  assert data[0][0]=='Initialen' and data[0][1]=='Code' and norm(data[0][4])=='T600 Velo',(index,data[0])
  for cells in data[1:]:
   if not cells[0] and not cells[1]:continue
   c=[norm(x) for x in cells]
   assert re.fullmatch(r'\d{3,4}',c[1]),(index,c)
   rows.append({'code':str(int(c[1])),'printedCode':c[1],'abbreviation':c[0],
    'operator':c[2],'lineScope':c[3],'t600Velo':c[4],
    'otherTariffFootnote':c[-1],'page':index})
byCode=defaultdict(list)
for row in rows:byCode[row['code']].append(row)
selected=[];excluded=[]
for code,group in sorted(byCode.items(),key=lambda kv:int(kv[0])):
 reasons=[]
 if any(r['lineScope'] for r in group):reasons.append('line-specific-row-present')
 if any(r['t600Velo']!='ja' for r in group):reasons.append('not-unanimously-explicit-yes')
 if any(r['otherTariffFootnote'] or re.search(r'\d+\)',r['operator']+r['abbreviation']+r['t600Velo']) for r in group):reasons.append('footnote-present-conservative-exclusion')
 # A unique exact business number may occur in multiple rows. Every row must pass.
 rec={'code':code,'abbreviations':sorted(set(r['abbreviation'] for r in group)),
  'operator':group[0]['operator'],'pages':sorted(set(r['page'] for r in group))}
 if reasons:excluded.append({**rec,'reasons':reasons,'rows':group})
 else:selected.append(rec)
result={'source':{'title':'Alliance SwissPass T600 participating businesses','url':'https://www.allianceswisspass.ch/awbf','edition':'2026-06-01','checked':'2026-11-02','sha256':hashlib.sha256(pdf.read_bytes()).hexdigest()},
 'validFrom':'2026-06-01','validThrough':'2026-12-12',
 'selection':'Only unqualified unanimous T600 Velo=yes business numbers; scoped or footnoted rows excluded. Not permission evidence. Mountain feeder-line scope still needs verification.',
 'counts':{'rows':len(rows),'businessNumbers':len(byCode),'selected':len(selected),'excluded':len(excluded)},
 'businessNumbers':[r['code'] for r in selected]}
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result['counts']))
