const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const {pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const THREE=require('three');
const {World}=require('../src/world/World.ts');
const {resolvePick}=require('../src/scene/picking.ts');
const {createGameState}=require('../src/game/GameState.ts');
const {CELL_SIZE}=require('../src/data/selectedBoard.ts');
const {ITEM_DEFS}=require('../src/data/items.ts');
const {shortItemName}=require('../src/data/itemLabels.ts');
const {generalHoverInfo}=require('../src/ui/GeneralInfo.ts');
const state=createGameState('liu'),root=new THREE.Group();
const world={root,pickables:[],tiles:state.tiles,tilePosition(i){const p=state.tiles[i].pos;return new THREE.Vector3(p.x,CELL_SIZE*.166,p.z);}};
for(const tile of state.tiles)World.prototype.addPicker.call(world,tile);
root.updateMatrixWorld(true);
const camera=new THREE.OrthographicCamera(-240,240,180,-180,.1,1000);camera.position.set(140,220,160);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const ray=new THREE.Raycaster();
function hitsAt(point){const p=point.clone().project(camera);ray.setFromCamera(new THREE.Vector2(p.x,p.y),camera);return ray.intersectObjects(world.pickables,true);}
for(const tile of state.tiles){const p=world.tilePosition(tile.index);p.y+=.015;assert.equal(resolvePick(hitsAt(p),'tile')?.userData.tile,tile.index,'actual cell '+tile.index);}
const sample=state.tiles.find(t=>t.kind==='road');
for(const [x,z] of [[1.98,0],[-1.98,0],[0,1.98],[0,-1.98],[1.98,1.98],[-1.98,-1.98]]){const p=world.tilePosition(sample.index);p.y+=.015;p.x+=x;p.z+=z;assert.equal(resolvePick(hitsAt(p),'tile')?.userData.tile,sample.index,'cell edges have no dead zone');}
console.log(`PASS ${state.tiles.length} actual tile centers and edge selection through overlapping building pickers`);
const tile=world.pickables.find(o=>o.userData.pickKind==='tile'),city=world.pickables.find(o=>o.userData.pickKind==='city'),lord=new THREE.Sprite(new THREE.SpriteMaterial());
lord.userData={pick:true,pickKind:'lord',lordId:'cao'};
const overlapping=[lord,city,tile].map(object=>({object,distance:1,point:new THREE.Vector3()}));
assert.equal(resolvePick(overlapping,'tile'),tile);assert.equal(resolvePick(overlapping,'city'),city);assert.equal(resolvePick(overlapping,'lord'),lord);assert.equal(resolvePick(overlapping,'none'),null);
const hidden=new THREE.Group();hidden.visible=false;hidden.add(lord);assert.equal(resolvePick(overlapping,'lord'),null);
world.targetFrame=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial());
World.prototype.setTargetHover.call(world,tile,true,camera);assert.equal(world.targetFrame.visible,true);assert.ok(world.targetFrame.position.distanceTo(world.tilePosition(tile.userData.tile))<.07);
World.prototype.setTargetHover.call(world,null,false,camera);assert.equal(world.targetFrame.visible,false);
console.log('PASS tile/city/lord surfaces stay separate; selection frame uses the picked cell and clears');
const labels=Object.keys(ITEM_DEFS).map(shortItemName);assert.ok(labels.every(x=>Array.from(x).length===3));assert.equal(new Set(labels).size,64);
const fields=generalHoverInfo(state.generals.liubei).split('｜').map(line=>line.split('：')[0]);
assert.deepEqual(fields,['名稱','境界','血量','體力','戰力','武力','防禦','煉丹','煉器','畫符','佈陣','被動技能']);
const combatTip=generalHoverInfo(state.generals.liubei,{hp:123,maxHp:600,atk:91,def:44});
for(const value of ['血量：123 / 600','武力：91','防禦：44'])assert.ok(combatTip.includes(value));
console.log('PASS 64 distinct three-character captions and only the requested portrait information');
