const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
let checked=0;
for(const file of files(path.join(root,'src'))){
 if(!/\.(css|ts)$/.test(file))continue;
 const text=fs.readFileSync(file,'utf8');
 const refs=file.endsWith('.css')?[...text.matchAll(/url\(['"]?([^'"()]+)['"]?\)/g)].map(m=>m[1]):[...text.matchAll(/assetUrl\(['"]([^'"]+)['"]\)/g)].map(m=>'/'+m[1]);
 for(const raw of refs){
  if(/^(https?:|data:|#)/.test(raw))continue;
  const ref=raw.split(/[?#]/)[0].replace(/^\/+/, '/');
  const target=ref.startsWith('/src/')?path.join(root,ref.slice(1)):ref.startsWith('/')?path.join(root,'public',ref.slice(1)):path.resolve(path.dirname(file),ref);
  assert(fs.existsSync(target),`Missing UI asset in ${path.relative(root,file)}: ${ref}`);checked++;
 }
}
console.log(`PASS ${checked} static UI asset references resolve after cleanup`);
