const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{registerHooks,stripTypeScriptTypes}=require('node:module');const{pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const {createGameState}=require('../src/game/GameState.ts');
const {BOARD}=require('../src/data/board.ts');
const {Engine}=require('../src/engine/Engine.ts'),{RecordingView}=require('../src/engine/view.ts');
const {defaultAnswer}=require('../src/engine/prompts.ts');
const S=require('../src/game/SoloSave.ts');

const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>void store.set(k,String(v)),removeItem:k=>void store.delete(k)};
const engineFor=state=>new Engine(state,{view:new RecordingView(),send:async(_lord,prompt)=>defaultAnswer(prompt),isAuto:()=>true,multiplayer:false});
const steps=async(state,count)=>{const engine=engineFor(state);for(let i=0;i<count&&!state.over;i++)if(!(await engine.step()))break;};

(async()=>{
 // 沒有存檔
 assert.equal(S.loadSoloSave(),null);

 // 跑幾輪後存檔，讀回來的狀態與存檔當下完全相同
 const state=createGameState('sun',60);
 await steps(state,24);
 assert.ok(!state.over&&state.round>1,'game still running after a few rounds');
 assert.ok(S.writeSoloSave(state));
 const raw=[...store.values()][0];
 assert.ok(!raw.includes('"tiles"'),'fixed map tiles are not stored');
 const expected=JSON.parse(JSON.stringify(state,(k,v)=>k==='tiles'?undefined:v));
 const loaded=S.loadSoloSave();
 assert.ok(loaded&&loaded.savedAt>0);
 assert.equal(loaded.state.tiles,BOARD.tiles,'tiles restored from the current board');
 assert.deepEqual(JSON.parse(JSON.stringify(loaded.state,(k,v)=>k==='tiles'?undefined:v)),expected);
 assert.equal(loaded.state.player,'sun');assert.equal(loaded.state.maxRounds,60);

 // 讀回來的對局可以接著跑下去
 const round=loaded.state.round;
 await steps(loaded.state,24);
 assert.ok(loaded.state.over||loaded.state.round>round,'resumed game keeps advancing');

 // 無效的存檔一律當作沒有
 assert.equal(S.decodeSoloSave('{not json'),null);
 assert.equal(S.decodeSoloSave('{}'),null);
 assert.equal(S.decodeSoloSave(S.encodeSoloSave({...state,rulesVersion:'old-map'})),null,'other map version rejected');
 assert.equal(S.decodeSoloSave(S.encodeSoloSave({...state,over:true})),null,'finished game rejected');

 // 清除
 S.clearSoloSave();assert.equal(S.loadSoloSave(),null);

 // 寫入失敗不會丟例外
 const warn=console.warn;console.warn=()=>{};
 globalThis.localStorage.setItem=()=>{throw new Error('quota');};
 assert.equal(S.writeSoloSave(state),false);console.warn=warn;
 console.log('solo-save: ok');
})().catch(e=>{console.error(e);process.exit(1);});
