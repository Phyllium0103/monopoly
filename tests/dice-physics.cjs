const fs=require('node:fs'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
registerHooks({
 resolve(s,c,n){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))return n(s+'.ts',c);return n(s,c)},
 load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(new URL(u),'utf8'),{mode:'transform'})}:n(u,c)}
});
const {simulateDiceRoll,sampleDicePhysics,upperDiceFace,roundedDiceSupport,DICE_PHYSICS_STEP,DICE_GRAVITY}=require('../src/world/DicePhysics.ts');
function rng(seed){return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/0x100000000)}
(async()=>{
 let contacts=0,maxAttempts=0,minDuration=Infinity,maxDuration=0;
 for(let seed=1;seed<=24;seed++){
  const values=seed<=6?[seed]:[1+seed%6,1+(seed*5)%6];
  const roll=await simulateDiceRoll(values,rng(seed));
  assert.ok(roll.firstGroundContact>0);assert.ok(roll.groundContacts>=values.length);
  contacts+=roll.dieContacts;maxAttempts=Math.max(maxAttempts,roll.attempts);
  minDuration=Math.min(minDuration,roll.duration);maxDuration=Math.max(maxDuration,roll.duration);
  const end=sampleDicePhysics(roll,roll.duration);
  for(const q of roll.labelRotations)for(const axis of [[1,0,0],[0,1,0],[0,0,1]]){
   const {Vector3}=require('three');const p=new Vector3(...axis).applyQuaternion(q);
   assert.ok(Math.abs(Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))-1)<1e-6,'label orientation must be a constant symmetry of the cube collider');
  }
  end.forEach((p,i)=>{assert.equal(upperDiceFace(p.rotation).value,values[i]);assert.ok(upperDiceFace(p.rotation).alignment>.9995)});
  assert.ok(roll.frames.at(-1).every(p=>p.sleeping),'physics bodies must actually sleep');
  // Before first contact, acceleration is gravity + constant air damping, not a hand-drawn bounce.
  for(let step=2;step<roll.firstContact-2;step++){
   for(let die=0;die<values.length;die++){
    const a=roll.frames[step-1][die],b=roll.frames[step][die];
    const predicted=(a.linearVelocity.y+DICE_GRAVITY*DICE_PHYSICS_STEP)/(1+.08*DICE_PHYSICS_STEP);
    assert.ok(Math.abs(b.linearVelocity.y-predicted)<.025,'free fall is not gravity integration');
   }
  }
  for(const frame of roll.frames)for(const p of frame){
   assert.ok(p.position.y-roundedDiceSupport(p.rotation)>-.015,`collider penetrated floor: seed=${seed} bottom=${p.position.y-roundedDiceSupport(p.rotation)} y=${p.position.y} support=${roundedDiceSupport(p.rotation)}`);
   assert.ok(Math.abs(p.rotation.length()-1)<1e-5);
  }
  // Sampled presentation always equals the engine pose times ONE constant cube
  // symmetry, even at impact: no late result-facing rotation or position correction.
  for(let i=0;i<roll.frames.length;i+=7){
   sampleDicePhysics(roll,i*DICE_PHYSICS_STEP).forEach((p,die)=>{
    assert.ok(p.position.distanceTo(roll.frames[i][die].position)<1e-5);
    const expected=roll.frames[i][die].rotation.clone().multiply(roll.labelRotations[die]);
    assert.ok(p.rotation.angleTo(expected)<1e-5);
   });
  }
 }
 assert.ok(contacts>0,'two actual dice must collide in the test batch');
 console.log(`PASS 24 actual Rapier rolls, six authoritative faces, gravity, ground contacts, ${contacts} die contacts, sleep and no steering; duration ${minDuration.toFixed(2)}..${maxDuration.toFixed(2)}s, max attempts ${maxAttempts}`);
 await assert.rejects(()=>simulateDiceRoll([7],rng(1)),RangeError);
})().catch(error=>{console.error(error);process.exitCode=1});
