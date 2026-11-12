"""Compress approved transparent armor illustrations for the 54px roster and art pack.

Usage: python scripts/import-armor-icons.py [--source output/armor-four-tiers-style02-20261111]
Requires Pillow. Source PNGs remain untouched.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FAMILIES = ['chiyou', 'houtou', 'nuwa', 'shennong', 'pangu', 'cangjie', 'fuxi', 'hongjun', 'buddha']
GRADES = ['huang', 'xuan', 'di', 'tian']

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'output/armor-four-tiers-style02-20261111')
    args = parser.parse_args()
    target = ROOT / 'public/art/icons/armor'
    target.mkdir(parents=True, exist_ok=True)
    assets = []
    for family in FAMILIES:
        for grade in GRADES:
            asset_id = f'{family}-{grade}'
            source = args.source / f'{asset_id}.png'
            original = source.read_bytes()
            with Image.open(source) as image:
                image = image.convert('RGBA')
                source_size = list(image.size)
                assert image.getchannel('A').getextrema() == (0, 255), source
                image.thumbnail((256, 256), Image.Resampling.LANCZOS)
                output = target / f'{asset_id}.webp'
                image.save(output, 'WEBP', quality=85, method=6, exact=True)
            packed = output.read_bytes()
            with Image.open(output) as check:
                assert check.mode == 'RGBA' and check.width <= 256 and check.height <= 256
                assert check.getchannel('A').getextrema() == (0, 255)
                size = list(check.size)
            assert len(packed) < len(original)
            assets.append(dict(id=asset_id, file=output.relative_to(ROOT).as_posix(),
                source=source.relative_to(ROOT).as_posix(), sourceSha256=digest(original),
                sourceSize=source_size, sourceBytes=len(original), size=size,
                bytes=len(packed), sha256=digest(packed)))
    report = dict(version=1, style='approved-technique-style-02', encoding='WebP quality85 method6; transparent RGBA',
        count=len(assets), sourceBytes=sum(a['sourceBytes'] for a in assets), bytes=sum(a['bytes'] for a in assets), assets=assets)
    manifest = ROOT / 'art-src/manifests/armor-icons.json'
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'assets'}, ensure_ascii=False))

if __name__ == '__main__':
    main()
