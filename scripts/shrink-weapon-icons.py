"""Shrink reviewed 1024px weapon illustrations to delivery size.

Weapon icons display at most 128 CSS px (roster weapon slot), so 384px stays sharp on 3x screens
while cutting the boot art pack by ~3.5 MB. Run after import-weapon-icons.py, then npm run build:art-pack.
"""
import hashlib,json
from pathlib import Path
from PIL import Image,ImageChops

HEIGHT=384
REPO=Path(__file__).resolve().parents[1]
report_path=REPO/'docs/weapon-illustrated-assets.json'
report=json.loads(report_path.read_text(encoding='utf-8'))
for a in report['assets']:
 dest=REPO/'public'/a['file']
 with Image.open(dest) as im:
  im.load()
  if im.height!=HEIGHT:
   resized=im.convert('RGBA').resize((round(im.width*HEIGHT/im.height),HEIGHT),Image.Resampling.LANCZOS)
   resized.save(dest,'WEBP',quality=80,method=6,exact=True)
   with Image.open(dest) as decoded:
    assert ImageChops.difference(decoded.convert('RGBA').getchannel('A'),resized.getchannel('A')).getbbox() is None,'Compressed alpha mismatch: '+a['id']
 with Image.open(dest) as im:a['size']=list(im.size)
 a['bytes']=dest.stat().st_size;a['sha256']=hashlib.sha256(dest.read_bytes()).hexdigest()
report['compression']['height']=HEIGHT
report['gameBytes']=sum(a['bytes'] for a in report['assets'])
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f"{len(report['assets'])} weapon icons at {HEIGHT}px: {report['gameBytes']:,} bytes")
