import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../public/art/', import.meta.url));
async function collect(dir) {
  const files = [];
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    // Old broad-category weapon art remains archived as files, never in the active pack.
    if (relative === 'icons/兵器') continue;
    if (entry.isDirectory()) files.push(...await collect(relative));
    else if (entry.name.endsWith('.webp')) files.push(relative);
  }
  return files;
}
const index = {};
const chunks = [];
let offset = 0;
for (const file of (await collect('icons')).sort()) {
  const data = await readFile(path.join(root, file));
  if (data.toString('ascii', 8, 12) !== 'WEBP') throw new Error('Invalid WebP: ' + file);
  index[file.slice(0, -5)] = [offset, data.length];
  chunks.push(data);
  offset += data.length;
}
await writeFile(path.join(root, 'pack.bin'), Buffer.concat(chunks));
await writeFile(path.join(root, 'pack.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`Art pack: ${chunks.length} images, ${offset.toLocaleString()} bytes`);
