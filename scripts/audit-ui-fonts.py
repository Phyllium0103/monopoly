"""Check bundled UI fonts against every Chinese character in game source."""
from pathlib import Path
from fontTools.ttLib import TTFont
import re

root = Path(__file__).resolve().parent.parent
text = ''.join(p.read_text(encoding='utf8') for p in (root / 'src').rglob('*')
               if p.suffix in ('.ts', '.css'))
chars = set(re.findall(r'[\u3400-\u9fff]', text)) | set('課釋')
body = set(map(chr, TTFont(root / 'src/ui/fonts/FolioWenKai-game.woff2').getBestCmap()))
title = set(map(chr, TTFont(root / 'src/ui/fonts/YujiMai-game.woff2').getBestCmap()))
missing = sorted(chars - body)
fallback = sorted(chars - title)
print(f'Chinese characters checked: {len(chars)}; body missing: {len(missing)}; title using body fallback: {len(fallback)}')
if missing:
    print('Missing codepoints: ' + ', '.join(f'U+{ord(c):04X}' for c in missing))
    raise SystemExit(1)
print('PASS all Chinese characters covered by the bundled UI font stack')
