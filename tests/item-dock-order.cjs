const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');const {pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const {sortItemStacks}=require('../src/ui/itemDockOrder.ts'),{makeItem}=require('../src/data/items.ts');
const stack=(id,tier,reason='')=>({item:makeItem(id,id,tier),count:1,reason});
const result=sortItemStacks([stack('citadel',0),stack('force',0),stack('shield',0),stack('heal',3),stack('truce',0),stack('heal',0,'不可使用')]);
assert.deepEqual(result.map(x=>x.item.defId),['heal','force','truce','shield','citadel','heal']);
assert.equal(result[0].item.tier,3,'item type uses highest available catalog price, not the owned tier price');
console.log('PASS usability, four-art order and ascending highest-tier prices');
