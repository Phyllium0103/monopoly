// Import reviewed transparent material art; never alter original PNG files.
// node scripts/import-material-icons.mjs <reviewed-folder> [sharp-module-url]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const source=process.argv[2];
if(!source)throw Error('Provide the reviewed material-art folder.');
const {default:sharp}=await import(process.argv[3]??'sharp');
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'));
if(manifest.assets.length!==18)throw Error('Expected six groups with three grades.');
const groups={iron:'魄',ice:'髓',copper:'銅',sand:'砂',silk:'絲',jade:'玉'};
const sha=b=>createHash('sha256').update(b).digest('hex');
const target=path.join(root,'public/art/icons/materials');await fs.mkdir(target,{recursive:true});
const assets=[],definitions={};
for(const [key,group] of Object.entries(groups)){
 definitions[group]=[];
 for(let tier=1;tier<=3;tier++){
  const a=manifest.assets.find(x=>x.id===key+'-'+tier);
  if(!a)throw Error('Missing '+key+'-'+tier);
  const png=await fs.readFile(path.join(source,a.file));
  if(sha(png)!==a.sha256)throw Error('Source SHA mismatch '+a.id);
  const size=256;
  const expected=await sharp(png).resize(size,size,{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer();
  const packed=await sharp(expected,{raw:{width:size,height:size,channels:4}}).webp({quality:80,alphaQuality:100,effort:6}).toBuffer();
  const decoded=await sharp(packed).ensureAlpha().raw().toBuffer();
  for(let i=3;i<expected.length;i+=4)if(expected[i]!==decoded[i])throw Error('Alpha changed '+a.id);
  const file='art/icons/materials/'+a.id+'.webp';
  await fs.writeFile(path.join(root,'public',file),packed);
  definitions[group].push(file);
  assets.push({id:a.id,group,tier,name:a.name,sourceFile:a.file,sourceSHA256:a.sha256,sourceBytes:png.length,file,width:size,height:size,bytes:packed.length,sha256:sha(packed),alphaPreservedExactly:true});
 }
}
await fs.writeFile(path.join(root,'src/data/materialIcons.ts'),"import { assetUrl } from './assetUrl';\nimport type { MaterialGroup } from './weaponCatalog';\n\n// Generated from the selected six-family / three-tier flat illustration set.\nexport const MATERIAL_ICON_FILES: Record<MaterialGroup, readonly [string, string, string]> = "+JSON.stringify(definitions,null,2)+";\n\nexport function materialIconUrl(group: MaterialGroup, stage: number, base?: string): string {\n  const file = MATERIAL_ICON_FILES[group]?.[stage];\n  return file ? assetUrl(file, base) : '';\n}\n");
const sourceBytes=assets.reduce((n,a)=>n+a.sourceBytes,0),gameBytes=assets.reduce((n,a)=>n+a.bytes,0);
const report={style:'01 極簡平面',count:18,compression:{format:'WEBP',size:256,quality:80,alphaQuality:100,effort:6,resampling:'LANCZOS3'},sourceBytes,gameBytes,reductionPercent:100*(1-gameBytes/sourceBytes),assets};
await fs.writeFile(path.join(root,'docs/material-icon-assets.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({count:18,sourceBytes,gameBytes,reductionPercent:report.reductionPercent,alphaPreservedExactly:true}));
