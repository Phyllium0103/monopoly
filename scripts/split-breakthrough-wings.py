"""Partition the original wing pixels into registered front/rear animation atlases."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-src/ui/breakthrough-wings-source.webp'
MASK = ROOT / 'art-src/ui/breakthrough-wings-front-mask.png'
source = np.asarray(Image.open(SOURCE).convert('RGBA'))
mask = np.asarray(Image.open(MASK).convert('L').resize(
    (source.shape[1], source.shape[0]), Image.Resampling.NEAREST)) >= 128
counts = []
for index in range(8):
    x0, x1 = [round((index % 2 + n) * source.shape[1] / 2) for n in [0, 1]]
    y0, y1 = [round((index // 2 + n) * source.shape[0] / 4) for n in [0, 1]]
    alpha = source[y0:y1, x0:x1, 3] > 128
    front = mask[y0:y1, x0:x1] & alpha
    counts.append({'frame': index, 'frontPixels': int(front.sum()),
                   'rearPixels': int((alpha & ~front).sum())})
    assert front.sum() > alpha.sum() * .30, 'Entire folded arms must be foreground, not just tips'
    assert (alpha & ~front).sum() > alpha.sum() * .03, 'Keep the rear shoulder attachment'

for name, selection in [('front', mask), ('rear', ~mask)]:
    rgba = source.copy()
    rgba[:, :, 3] = np.where(selection, source[:, :, 3], 0)
    rgba[rgba[:, :, 3] == 0, :3] = 0
    target = ROOT / f'src/ui/breakthrough-wings-{name}.webp'
    Image.fromarray(rgba).save(target, 'WEBP', lossless=True, method=6, exact=True)
    print(f'{name}: {target.stat().st_size:,} bytes')

layers = [np.asarray(Image.open(ROOT / f'src/ui/breakthrough-wings-{n}.webp').convert('RGBA'))
          for n in ['front', 'rear']]
assert np.array_equal(layers[0][:, :, 3].astype(int) + layers[1][:, :, 3], source[:, :, 3])
assert not np.any((layers[0][:, :, 3] > 0) & (layers[1][:, :, 3] > 0))
for layer in layers:
    visible = layer[:, :, 3] > 0
    assert np.array_equal(layer[visible, :3], source[visible, :3]), 'Do not repaint source feathers'
manifest = {'grid': [2, 4], 'size': list(Image.open(SOURCE).size), 'frames': counts,
            'partition': 'Disjoint foreground fold and rear shoulder; original visible RGB and alpha preserved exactly'}
(ROOT / 'art-src/manifests/breakthrough-wing-layers.json').write_text(
    json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print('PASS all eight poses: exact RGB/alpha reconstruction, no missing or overlapping source pixels')
