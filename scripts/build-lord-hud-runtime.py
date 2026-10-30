"""Offline runtime sprites. Requires Pillow; never edits source artwork.

Atlas coordinates remain source logical pixels. UVs are normalized, so uniform
texture downsampling must not change frame rectangles, anchors or timing.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageChops, ImageStat

def sha(data):
    return hashlib.sha256(data).hexdigest()

def build(repo):
    source=repo/'public/art/lord-hud'
    atlases={}
    files=set()
    sources={}
    for lord in ['liu','cao','sun','dong']:
        for clip in ['prep','throw']+([] if lord=='liu' else ['recovery']):
            name=f'{lord}/{clip}-16.json'
            raw=(source/name).read_bytes()
            sources[name]=sha(raw)
            atlas=atlases[name]=json.loads(raw)
            for frame in atlas['frames']:
                file=frame.get('externalSheet') or atlas['sheets'][frame['sheet']]
                assert Path(file).name==file, file
                files.add(f'{lord}/{file}')
    for name in sorted(files):
        sources[name]=sha((source/name).read_bytes())
    fingerprint=sha(json.dumps({'method':'lanczos-rgba-webp-quality95-alpha-exact-v1','size':[768,384],'sources':sources},sort_keys=True).encode())[:12]
    base=f'art/lord-hud-runtime-{fingerprint}'
    output=repo/'public'/base
    output.mkdir(parents=True,exist_ok=True)
    assets=[]
    for name in sorted(files):
        original=source/name
        with Image.open(original) as image:
            assert image.size==(1774,887), (name,image.size)
            rgba=image.convert('RGBA')
            resized=rgba.resize((768,384),Image.Resampling.LANCZOS)
            target=output/name
            target.parent.mkdir(parents=True,exist_ok=True)
            resized.save(target,'WEBP',quality=95,method=4,exact=True)
            with Image.open(target) as actual:
                assert actual.size==(768,384)
                decoded=actual.convert('RGBA')
                assert decoded.getchannel('A').tobytes()==resized.getchannel('A').tobytes(), name
                error=ImageStat.Stat(ImageChops.difference(resized,decoded).convert('RGB'),mask=resized.getchannel('A')).mean
                assert max(error)<8, (name,error)
                assert actual.getchannel('A').getextrema()[0]==0, name
        assets.append({'file':name,'sourceSha256':sources[name],'sha256':sha(target.read_bytes()),'sourceBytes':original.stat().st_size,'bytes':target.stat().st_size,'size':[768,384],'encoding':'webp-quality95','alphaExact':True,'rgbMeanAbsoluteError':error})
        if len(assets)%8==0: print(f'Prepared {len(assets)}/{len(files)} runtime sprites',flush=True)
    for name,atlas in atlases.items():
        # Only referenced sheets are shipped. Preserve each frame's source file.
        indices=sorted({f['sheet'] for f in atlas['frames'] if not f.get('externalSheet')})
        remap={old:new for new,old in enumerate(indices)}
        compact=json.loads(json.dumps(atlas))
        compact['sheets']=[atlas['sheets'][i] for i in indices]
        compact['textureWidth']=768
        compact['textureHeight']=384
        for old,new in zip(atlas['frames'],compact['frames']):
            new['sheet']=remap.get(old['sheet'],0)
            assert (old.get('externalSheet') or atlas['sheets'][old['sheet']])==(new.get('externalSheet') or compact['sheets'][new['sheet']])
        (output/name).write_text(json.dumps(compact,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    report={'version':1,'base':base,'coordinateSpace':'unchanged source logical pixels','width':768,'height':384,'sources':sources,'assets':assets,'sourceBytes':sum(a['sourceBytes'] for a in assets),'bytes':sum(a['bytes'] for a in assets),'files':len(assets),'sourceDecodedRGBABytes':1774*887*4*len(assets),'runtimeDecodedRGBABytes':768*384*4*len(assets)}
    assert report['bytes']<report['sourceBytes'], report
    for name,expected in sources.items():
        assert sha((source/name).read_bytes())==expected, f'Source changed: {name}'
    (output/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (repo/'src/data/lordHudRuntime.ts').write_text("import {assetUrl} from './assetUrl';\n"+f"export const LORD_HUD_RUNTIME_BASE='{base}';\n"+"export const LORD_HUD_TEXTURE_WIDTH=768;\nexport const LORD_HUD_TEXTURE_HEIGHT=384;\nexport const lordHudAssetUrl=(id:string,file:string)=>assetUrl(`${LORD_HUD_RUNTIME_BASE}/${id}/${file}`);\n",encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ['sources','assets']},ensure_ascii=False),flush=True)
    return report

if __name__=='__main__':
    import sys
    repo=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]
    build(repo)
