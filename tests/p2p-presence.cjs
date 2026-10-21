const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const {pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const f=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(f))return next(pathToFileURL(f).href,c);}return next(s,c);},load(u,c,next){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:next(u,c);}});
const {RoomPresence}=require('../src/net/p2p/presence.ts');
const {LocalDirectory,SupabaseDirectory}=require('../src/net/p2p/signaling.ts');
(async()=>{
 const oldInterval=global.setInterval,oldClear=global.clearInterval;
 const timers=new Map(),calls=[];let serial=0;
 global.setInterval=(fn,ms)=>{assert.equal(ms,20_000);timers.set(++serial,fn);return serial;};
 global.clearInterval=(id)=>timers.delete(id);
 try{
  const presence=new RoomPresence(async code=>{calls.push(code);});
  presence.start('00001');presence.start('00001');
  assert.equal(timers.size,1);assert.deepEqual(calls,['00001']);
  [...timers.values()][0]();await Promise.resolve();assert.equal(calls.length,2);
  presence.start('00002');assert.equal(timers.size,1);assert.deepEqual(calls.slice(-2),['00001','00002']);
  await presence.stop();assert.equal(timers.size,0);assert.equal(calls.at(-1),'00002');
  const count=calls.length;await presence.ping();await presence.stop();assert.equal(calls.length,count);
  const offline=new RoomPresence(async()=>{throw Error('network');});
  offline.start('00003');await offline.ping();await offline.stop();assert.equal(timers.size,0);
 }finally{global.setInterval=oldInterval;global.clearInterval=oldClear;}
 console.log('PASS presence reports every20s, avoids duplicate timers, refreshes leave grace, stops on exit and tolerates network failure');
 const oldStorage=global.localStorage,oldNow=Date.now;const values=new Map();let now=1_000_000;
 global.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 Date.now=()=>now;
 try{
  const host=new LocalDirectory(()=> 'host'),guest=new LocalDirectory(()=> 'guest');
  const code=await host.create('host-peer','waiting');
  now+=240_000;
  assert.equal((await guest.lookup(code)).online,false);
  await guest.present(code);now+=240_000;
  assert.ok(await guest.lookup(code),'guest keeps room while the host is absent');
  assert.equal((await guest.lookup(code)).online,false,'guest presence must not impersonate host heartbeat');
  await guest.present(code);now+=300_000;
  assert.ok(await guest.lookup(code),'exactly five minutes does not expire');
  now+=1;assert.equal(await guest.lookup(code),null,'more than five minutes expires');
 }finally{Date.now=oldNow;global.localStorage=oldStorage;}
 console.log('PASS remaining guest prevents empty-room deletion without faking host online; strict five-minute expiry boundary');
 let rpc;
 const directory=new SupabaseDirectory({rpc:async(fn,args)=>{rpc={fn,args};return{data:null,error:null};}});
 await directory.present('00123');assert.deepEqual(rpc,{fn:'p2p_present',args:{p_code:'00123'}});
 console.log('PASS occupancy RPC sends only the room code, with no game state or player identity payload');
})().catch(e=>{console.error(e);process.exitCode=1;});
