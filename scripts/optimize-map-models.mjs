// 地圖建築模型壓縮：art-src/map-models 的原始 Blender 匯出檔 → public/art/map-selected（實際部署的檔案）
// 只做不改變外觀的處理：合併重複頂點、移除沒用到的資料、貼圖轉 WebP、網格 Meshopt 壓縮。
// 不合併網格／材質（城池換色依材質名稱判斷）、不做 GPU instancing（MapModelPool 自己做）、不減面、不縮貼圖。
// 用法：npm run optimize:models
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'public/art/map-selected/model-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const only = process.argv.slice(2);

for (const [key, m] of Object.entries(manifest)) {
  if (only.length && !only.includes(key)) continue;
  const file = path.basename(m.url);
  m.original = `art-src/map-models/${file}`;
  const input = path.join(root, m.original), output = path.join(root, 'public', m.url);
  m.originalSha256 ??= sha256(input);
  execFileSync('npx', ['--yes', '@gltf-transform/cli@4.5.1', 'optimize', input, output,
    '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '8192',
    '--flatten', 'false', '--join', 'false', '--instance', 'false', '--palette', 'false', '--simplify', 'false'],
  { stdio: 'inherit', shell: process.platform === 'win32' });
  m.sha256 = sha256(output);
  console.log(`${key}: ${(fs.statSync(input).size / 1e6).toFixed(1)}MB → ${(fs.statSync(output).size / 1e6).toFixed(1)}MB`);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
// 網址帶上內容版本，瀏覽器快取（MapModelPool）才知道模型換過了
const entries = Object.entries(manifest).map(([key, m]) => `  ${JSON.stringify(key)}: assetUrl(${JSON.stringify(`${m.url}?v=${m.sha256.slice(0, 12)}`)})`);
fs.writeFileSync(path.join(root, 'src/data/mapModels.ts'),
  `import { assetUrl } from './assetUrl';\n// 由 scripts/optimize-map-models.mjs 產生\nexport const MAP_MODELS = {\n${entries.join(',\n')}\n} as const;\n`);
