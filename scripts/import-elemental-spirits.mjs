// Re-encode the reviewed sprite sheets for 80px map icons. Never edits source PNGs.
// node scripts/import-elemental-spirits.mjs <reviewed-folder> [sharp module URL]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const source=process.argv[2];
if(!source)throw Error('Provide the reviewed four-action sprite folder.');
const {default:sharp}=await import(process.argv[3]??'sharp');
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target=path.join(root,'public/art/spirits');
await fs.mkdir(target,{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'));
if(manifest.length!==20)throw Error('Expected five elements with four reviewed actions.');
const sha=b=>createHash('sha256').update(b).digest('hex');
const assets=[],definitions={};let sourceBytes=0;
async function encode(from,file,size){
 const rawSource=await fs.readFile(path.join(source,from));
 const expected=await sharp(rawSource).resize(size,size,{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer();
 const packed=await sharp(expected,{raw:{width:size,height:size,channels:4}}).webp({quality:80,alphaQuality:100,effort:6}).toBuffer();
 const decoded=await sharp(packed).ensureAlpha().raw().toBuffer();
 for(let i=3;i<expected.length;i+=4)if(expected[i]!==decoded[i])throw Error('Alpha changed: '+file);
 await fs.writeFile(path.join(target,file),packed);
 sourceBytes+=rawSource.length;
 assets.push({file:'art/spirits/'+file,width:size,height:size,sourceFile:from,sourceBytes:rawSource.length,sourceSHA256:sha(rawSource),bytes:packed.length,sha256:sha(packed),alphaPreservedExactly:true});
 return 'art/spirits/'+file;
}
for(const element of ['metal','wood','water','fire','earth']){
 const group=manifest.filter(e=>e.id===element).sort((a,b)=>a.letter.localeCompare(b.letter));
 if(group.length!==4||new Set(group.map(e=>e.letter)).size!==4)throw Error('Missing actions: '+element);
 const idle=await encode(group[0].poster,element+'-idle.webp',160);
 // Keep both the silhouette centre and bottom contact point. A fixed resting
 // foot anchor across all actions preserves the intended jumps and rolls.
 const idlePixels=await sharp(path.join(target,element+'-idle.webp')).ensureAlpha().raw().toBuffer();
 let left=160,top=160,right=-1,bottom=-1;
 for(let y=0;y<160;y++)for(let x=0;x<160;x++)if(idlePixels[(y*160+x)*4+3]>=96){
  left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
 }
 if(right<left)throw Error('Empty idle silhouette: '+element);
 const center={x:(left+right+1)/320,y:(top+bottom+1)/320};
 // Use the whole resting footprint's centre, not the lower of two tiny feet.
 const foot={x:center.x,y:(bottom+1)/160};
 const actions=[];
 for(const e of group){
  if(e.frames!==16||e.columns!==4||e.rows!==4||e.durationsMs.length!==16)throw Error('Invalid 16-frame sheet.');
  const url=await encode(e.atlas,element+'-'+e.letter+'.webp',640);
  actions.push({letter:e.letter,url,columns:4,rows:4,frames:16,durationsMs:e.durationsMs});
 }
 definitions[element]={idle,center,foot,actions};
}
const header="import { assetUrl } from './assetUrl';\nimport type { Element } from '../game/types';\n\n// Generated from the reviewed 08 sprites by scripts/import-elemental-spirits.mjs.\nexport const SPIRIT_ICON_SIZE = 80;\nexport const SPIRIT_IDLE_INTERVAL_MS = 30_000;\nexport interface SpiritAnimationAsset { letter: string; url: string; columns: number; rows: number; frames: number; durationsMs: readonly number[]; }\nexport interface SpiritArt { idle: string; center: { x: number; y: number }; foot: { x: number; y: number }; actions: readonly SpiritAnimationAsset[]; }\nconst sources = ";
const footer=";\nconst resolveArt = (art: SpiritArt): SpiritArt => ({ ...art, idle: assetUrl(art.idle), actions: art.actions.map(action => ({ ...action, url: assetUrl(action.url) })) });\nexport const ELEMENTAL_SPIRIT_ART: Record<Element, SpiritArt> = {\n  metal: resolveArt(sources.metal), wood: resolveArt(sources.wood), water: resolveArt(sources.water),\n  fire: resolveArt(sources.fire), earth: resolveArt(sources.earth),\n};\n";
await fs.writeFile(path.join(root,'src/data/elementalSpirits.ts'),header+JSON.stringify(definitions,null,2)+footer);
const report={selectedStyle:'08 軟萌元素靈',elements:5,actionsPerElement:4,framesPerAction:16,compression:{format:'WEBP',quality:80,method:6,alphaQuality:100,frameSize:160,atlasSize:640,displaySize:80,resampling:'LANCZOS3'},sourceBytes,gameBytes:assets.reduce((n,a)=>n+a.bytes,0),assets};
await fs.writeFile(path.join(root,'docs/elemental-spirit-assets.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({files:assets.length,sourceBytes,gameBytes:report.gameBytes,reductionPercent:(100*(1-report.gameBytes/sourceBytes)).toFixed(1),alphaPreservedExactly:true}));

