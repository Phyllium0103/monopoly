const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const {pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const THREE=require('three'),{createGameState}=require('../src/game/GameState.ts');
const {nextMovementTile}=require('../src/systems/MovementSystem.ts');
const {World}=require('../src/world/World.ts'),{CELL_SIZE}=require('../src/data/selectedBoard.ts');
const state=createGameState('liu');
for(const lord of Object.values(state.lords)){
 const tile=state.tiles[lord.position];assert.ok(tile.links.includes(lord.forkExit),lord.id+' faces a connected road');
 assert.equal(nextMovementTile(state,lord),lord.forkExit,lord.id+' starts in the displayed direction');
}
const oldRandom=Math.random;
try{
 Math.random=()=>0;const first=createGameState('liu');
 Math.random=()=>.999999;const last=createGameState('liu');
 for(const id of Object.keys(first.lords))if(first.tiles[first.lords[id].position].links.length>1)
  assert.notEqual(first.lords[id].forkExit,last.lords[id].forkExit,id+' can face different connected roads');
}finally{Math.random=oldRandom;}
const root=new THREE.Group(),world={root,facing:new Map(),tilePosition:()=>new THREE.Vector3(4,1,8)};
World.prototype.setFacing.call(world,'liu',0x118833,0,{x:1,z:0},0);
const marker=world.facing.get('liu');assert.equal(marker.visible,true);assert.ok(Math.abs(marker.position.x-(4+CELL_SIZE*.44))<1e-8);assert.equal(marker.position.z,8);
World.prototype.setFacing.call(world,'liu',0x118833,0,null,0);assert.equal(marker.visible,false);
console.log('PASS four starting directions lead to connected roads and match the first move; facing marker is on the selected cell edge');
