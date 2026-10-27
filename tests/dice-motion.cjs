const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { registerHooks, stripTypeScriptTypes } = require('node:module');
registerHooks({ load(u,c,n) { return u.endsWith('.ts') ? {format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(new URL(u),'utf8'),{mode:'transform'})} : n(u,c); } });
const {Vector3} = require('three');
const {DICE_FACE_NORMALS,resultQuaternion,diceRollResult,dicePlaybackRate} = require('../src/world/DiceMotion.ts');
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
for (let value=1;value<=6;value++) {
  for(const yaw of [-2,0,.6,Math.PI]) {
    const q=resultQuaternion(value,yaw);
    close(new Vector3(...DICE_FACE_NORMALS[value]).applyQuaternion(q).y,1);
    close(new Vector3(...DICE_FACE_NORMALS[7-value]).applyQuaternion(q).y,-1);
  }
}
console.log('PASS all six authoritative face mappings and opposite faces');
assert.deepEqual(diceRollResult([2,5],2,2),{total:18,detail:'2 + 5 · 額外 +2 · 遁地梭 ×2'});
assert.equal(diceRollResult([6],0,1).total,6);
assert.throws(()=>resultQuaternion(0),RangeError);
console.log('PASS authoritative totals, combined bonuses, invalid faces');
assert.deepEqual([1,2,4].map(dicePlaybackRate),[2,4,8]);
assert.equal(dicePlaybackRate(NaN),2);
console.log('PASS original/2x/4x dice playback now runs at physics 2x/4x/8x without a minimum-duration speed cap');
// Read actual exported GLB, verify each bowl faces the same normal used by the animation.
const file=fs.readFileSync(path.join(__dirname,'../public/art/dice/ivory-recessed.glb'));
assert.equal(file.toString('ascii',0,4),'glTF'); assert.equal(file.readUInt32LE(4),2);
const gltf=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString());
assert.ok(!gltf.buffers.some(b=>b.uri),'model must be self-contained');
assert.equal(gltf.materials.length,3);
let bowls=0;const counts={};
for(const node of gltf.nodes) {
  const face=node.extras?.pipFace;if(!face) continue;
  bowls++;counts[face]=(counts[face]||0)+1;
  const mesh=gltf.meshes[node.mesh];
  for(const primitive of mesh.primitives) {
    const box=gltf.accessors[primitive.attributes.POSITION], normal=DICE_FACE_NORMALS[face];
    const center=box.min.map((v,i)=>(v+box.max[i])/2);
    const dot=center.reduce((sum,v,i)=>sum+v*normal[i],0);
    assert.ok(dot>.46&&dot<.501,`face ${face} pip is on wrong surface (${dot})`);
    assert.ok(box.max.every((v,i)=>v-box.min[i]>0),'pips must have real depth');
  }
}
assert.equal(bowls,21);for(let face=1;face<=6;face++)assert.equal(counts[face],face);
console.log('PASS actual GLB: 21 recessed bowls, correct six-face contract, three embedded materials');
