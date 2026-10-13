const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { registerHooks, stripTypeScriptTypes } = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL) {
      const file = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier + '.ts');
      if (fs.existsSync(file)) return nextResolve(pathToFileURL(file).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url), 'utf8'), { mode: 'transform' }) };
    return nextLoad(url, context);
  }
});
const { REALMS } = require('../src/data/generals.ts');
const { REALM_FRAME_STYLE, REALM_FRAME_WINDOWS, realmFrameFor } = require('../src/data/realmFrames.ts');
const { realmFrameHtml } = require('../src/ui/RealmFrame.ts');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/realm-frames.json'), 'utf8'));

assert.equal(REALM_FRAME_STYLE, manifest.styleId);
assert.equal(REALM_FRAME_WINDOWS.length, REALMS.length);
assert.equal(manifest.frames.length, REALMS.length);
const unique = new Set();
for (const [index, name] of REALMS.entries()) {
  const frame = realmFrameFor(index);
  assert.equal(frame.name, name);
  assert.deepEqual(frame.window, manifest.frames[index].viewBox);
  const [x, y, width, height] = frame.window;
  assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
  assert.ok(x + width <= manifest.atlas.width && y + height <= manifest.atlas.height);
  unique.add(frame.window.join(' '));
  const html = realmFrameHtml(index);
  assert.ok(html.includes('data-frame-realm="' + index + '"'));
  assert.ok(html.includes('data-frame-name="' + name + '"'));
  assert.ok(html.includes('aria-hidden="true"'));
}
assert.equal(unique.size, 11);
console.log('PASS All 11 game realms map to unique, correctly ordered frame windows');

for (const [value, index] of [[-1,0],[99,10],[3.9,3],[NaN,0],[Infinity,0]]) {
  assert.equal(realmFrameFor(value).index,index);
}
const transition = [0,1,2,10,9,0].map(realm => realmFrameFor(realm).index);
assert.deepEqual(transition,[0,1,2,10,9,0]);
console.log('PASS Realm upgrades, downgrades and invalid indices select safe frame bounds');

const atlas = fs.readFileSync(path.join(__dirname, '..', manifest.atlas.file));
assert.equal(crypto.createHash('sha256').update(atlas).digest('hex'),manifest.atlas.sha256);
assert.equal(atlas.readUInt32BE(16),1536);
assert.equal(atlas.readUInt32BE(20),1024);
assert.equal(atlas[25],6); // PNG RGBA，不能用有底色的預覽總圖覆蓋人物。
assert.ok(manifest.frames.every(frame => frame.centerMaxAlpha <= 1));
console.log('PASS Production frame atlas is the verified RGBA asset with clear centers');

