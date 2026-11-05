"""Bake reviewed roof colors into runtime GLBs without changing mesh data.

Install Pillow and NumPy in an isolated Python environment, then run this file.
Selections and immutable source filenames live in art-src/roof-colors/selection.json.
The original selected GLBs and the uncolored runtime GLBs remain available.
"""
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'public/art/map-runtime'
SELECTION = ROOT / 'art-src/roof-colors/selection.json'


def linear(rgb):
    return np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)


def srgb(rgb):
    return np.where(rgb <= .0031308, rgb * 12.92, 1.055 * np.maximum(rgb, 0) ** (1 / 2.4) - .055)


def read_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<III', data)
    assert magic == 0x46546C67 and version == 2 and length == len(data), path
    json_length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A, path
    document = json.loads(data[20:20 + json_length])
    offset = 20 + json_length
    binary_length, kind = struct.unpack_from('<II', data, offset)
    assert kind == 0x004E4942, path
    return document, data[offset + 8:offset + 8 + binary_length]


def encode_glb(document, binary):
    document['buffers'][0]['byteLength'] = len(binary)
    text = json.dumps(document, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    text += b' ' * (-len(text) % 4)
    binary += b'\0' * (-len(binary) % 4)
    length = 12 + 8 + len(text) + 8 + len(binary)
    return (struct.pack('<III', 0x46546C67, 2, length)
            + struct.pack('<II', len(text), 0x4E4F534A) + text
            + struct.pack('<II', len(binary), 0x004E4942) + binary)


def bake(path, selection):
    document, source_binary = read_glb(path)
    original = deepcopy(document)
    binary = bytearray(source_binary)
    changed = set()
    found = set()
    luminance = np.array([.2126, .7152, .0722], dtype=np.float32)
    for index, material in enumerate(document['materials']):
        role = selection['materials'].get(material.get('name'))
        if role is None:
            continue
        found.add(material['name'])
        changed.add(index)
        color = selection['palette'][role].lstrip('#')
        target = linear(np.array([int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32))
        pbr = material.setdefault('pbrMetallicRoughness', {})
        factor = pbr.get('baseColorFactor', [1, 1, 1, 1])
        info = pbr.get('baseColorTexture')
        if info is None:
            pbr['baseColorFactor'] = [*map(float, target), factor[3]]
            continue
        texture = document['textures'][info['index']]
        image_id = texture.get('extensions', {}).get('EXT_texture_webp', {}).get('source', texture.get('source'))
        image = document['images'][image_id]
        view = document['bufferViews'][image['bufferView']]
        assert view.get('buffer', 0) == 0
        offset = view.get('byteOffset', 0)
        with Image.open(BytesIO(source_binary[offset:offset + view['byteLength']])) as source:
            rgba = np.asarray(source.convert('RGBA')).copy()
        rgb = linear(rgba[..., :3].astype(np.float32) / 255) * np.array(factor[:3])
        lightness = rgb @ luminance
        alpha = rgba[..., 3].astype(np.float32) / 255
        reference = max(.025, float(np.sum(lightness * alpha) / max(float(alpha.sum()), 1)))
        relief = np.clip(lightness / reference, .18, 1.8)
        result = np.clip(srgb(target * relief[..., None]), 0, 1)
        rgba[..., :3] = np.rint(result * 255).astype(np.uint8)
        encoded = BytesIO()
        Image.fromarray(rgba).save(encoded, 'WEBP', quality=95, method=6, exact=True)
        pixels = encoded.getvalue()
        with Image.open(BytesIO(pixels)) as decoded:
            assert np.array_equal(np.asarray(decoded.convert('RGBA'))[..., 3], rgba[..., 3]), 'Alpha changed'
        binary.extend(b'\0' * (-len(binary) % 4))
        new_view = len(document['bufferViews'])
        document['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(pixels)})
        binary.extend(pixels)
        name = 'game-tex-' + sha256(pixels).hexdigest()[:20]
        new_image = len(document['images'])
        document['images'].append({'name': name, 'bufferView': new_view, 'mimeType': 'image/webp'})
        new_texture = deepcopy(texture)
        new_texture['name'] = name  # MapModelPool deduplicates textures by content name.
        new_texture.pop('source', None)
        new_texture['extensions'] = {'EXT_texture_webp': {'source': new_image}}
        document.setdefault('extensionsUsed', [])
        if 'EXT_texture_webp' not in document['extensionsUsed']:
            document['extensionsUsed'].append('EXT_texture_webp')
        info['index'] = len(document['textures'])
        document['textures'].append(new_texture)
        pbr['baseColorFactor'] = [1, 1, 1, factor[3]]
    assert found == set(selection['materials']), f"Roof material mismatch in {path}: {set(selection['materials']) - found}"
    # Geometry/accessor/node definitions and all original binary bytes are untouched.
    for field in ('meshes', 'accessors', 'nodes', 'scenes'):
        assert document.get(field) == original.get(field), f'{field} changed in {path}'
    assert binary[:len(source_binary)] == source_binary
    for index, material in enumerate(document['materials']):
        if index not in changed:
            assert material == original['materials'][index], f'Non-roof material changed: {path}'
    return encode_glb(document, bytes(binary)), len(changed)


def main():
    selections = json.loads(SELECTION.read_text(encoding='utf-8'))['selections']
    manifest_path = RUNTIME / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    report = []
    for selection in selections:
        if selection['variant'] == 'original':
            continue
        key = selection['key']
        for lod, source in enumerate(selection['runtimeSourceFiles']):
            result, count = bake(RUNTIME / source, selection)
            digest = sha256(result).hexdigest()
            filename = f'{key}-lod{lod}-{digest[:12]}.glb'
            (RUNTIME / filename).write_bytes(result)
            entry = manifest[key]['lods'][lod]
            entry['file'] = filename
            entry['bytes'] = len(result)
            report.append({'key': key, 'lod': lod, 'file': filename, 'source': source,
                           'sha256': digest, 'materialsChanged': count,
                           'geometryUnchanged': True, 'nonRoofMaterialsUnchanged': True})
        manifest[key]['roofColor'] = {'variant': selection['variant'], 'palette': selection['palette']['name'],
                                      'sourceFiles': selection['runtimeSourceFiles']}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    urls = {key: ['art/map-runtime/' + lod['file'] for lod in value['lods']] for key, value in manifest.items()}
    data = ("import {assetUrl} from './assetUrl';\nexport const MAP_RUNTIME_MODELS="
            + json.dumps(urls, ensure_ascii=False, indent=2) + ' as const;\n'
            + 'export const runtimeModelUrl=(key:keyof typeof MAP_RUNTIME_MODELS,lod:number)=>assetUrl(MAP_RUNTIME_MODELS[key][lod]);\n')
    (ROOT / 'src/data/mapRuntimeModels.ts').write_text(data, encoding='utf-8')
    report_path = ROOT / 'outputs/roof-color-review-20261104/applied-runtime-report.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Applied {sum(s["variant"] != "original" for s in selections)} selected palettes to {len(report)} runtime GLBs; geometry and non-roof materials verified unchanged.')


if __name__ == '__main__':
    main()
