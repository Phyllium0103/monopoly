import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {NodeIO,Logger,PropertyType} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {flatten,dequantize,weld,join,dedup,prune,simplify,textureCompress,meshopt} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=path.join(root,'public/art/map-runtime');
await fs.mkdir(out,{recursive:true});await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const manifest=JSON.parse(await fs.readFile(path.join(root,'public/art/map-selected/model-manifest.json'),'utf8')), report={}, urls={};
const sha=b=>createHash('sha256').update(b).digest('hex');
function count(d){return d.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);}
// Conservative watertightness check. Shared boundaries across different materials
// are retained as double sided; thin paper/foliage is never blindly backface-culled.
function closed(p){const a=p.getAttribute('POSITION'),idx=p.getIndices(),keys=new Map(),v=[];for(let i=0;i<a.getCount();i++){const x=a.getElement(i,[]).map(n=>Math.round(n*1e5)).join(',');if(!keys.has(x))keys.set(x,keys.size);v.push(keys.get(x));}const edges=new Map();for(let i=0;i<(idx?.getCount()??a.getCount());i+=3){const tri=[0,1,2].map(j=>v[idx?idx.getScalar(i+j):i+j]);for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3];if(a===b)continue;const k=a<b?`${a},${b}`:`${b},${a}`;edges.set(k,(edges.get(k)??0)+1);}}return edges.size>0&&[...edges.values()].every(n=>n===2);}
for(const [key,entry] of Object.entries(manifest)){
 urls[key]=[];report[key]={sourceSha:entry.sha256,lods:[]};
 for(let lod=0;lod<3;lod++){
  const d=await io.read(path.join(root,'public',entry.url.replace(/^\//,'')));d.setLogger(new Logger(Logger.Verbosity.SILENT));const original=count(d),materials=d.getRoot().listMaterials();
  for(const mat of materials){const recolor=key.startsWith('city-')&&(/primary|roof|琉璃|主色/i.test(mat.getName())||(key==='city-1'&&/stoneedge|edge|trim/i.test(mat.getName())));mat.setExtras({gameRecolor:recolor});
   const tr=mat.getExtension('KHR_materials_transmission');if(tr){if(tr.getTransmissionFactor()>.15){const c=mat.getBaseColorFactor();mat.setBaseColorFactor([c[0],c[1],c[2],Math.min(c[3],.32)]).setAlphaMode('BLEND');}mat.setExtension('KHR_materials_transmission',null);}
   for(const ext of ['KHR_materials_volume','KHR_materials_clearcoat','KHR_materials_ior','KHR_materials_specular','KHR_materials_sheen'])mat.setExtension(ext,null);
   const ps=d.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).filter(p=>p.getMaterial()===mat);
   if(mat.getAlphaMode()==='OPAQUE'&&ps.length&&ps.every(closed))mat.setDoubleSided(false);
  }
  await d.transform(flatten({cleanup:false}),dequantize(),weld(),dedup({propertyTypes:[PropertyType.ACCESSOR,PropertyType.TEXTURE,PropertyType.MATERIAL]}),join({keepNamed:false,cleanup:false}),prune(),simplify({simplifier:{...MeshoptSimplifier,simplify:(i,p,s,t,e,f)=>MeshoptSimplifier.simplify(i,p,s,t,e,[...f,'Permissive'])},ratio:[.65,.25,.1][lod],error:[.002,.01,.025][lod],lockBorder:false}),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],quality:85}));
  for(const t of d.getRoot().listTextures())t.setName('game-tex-'+sha(t.getImage()).slice(0,20));
  await d.transform(meshopt({encoder:MeshoptEncoder,level:'medium'}));
  const b=await io.writeBinary(d),file=`${key}-lod${lod}-${sha(b).slice(0,12)}.glb`;await fs.writeFile(path.join(out,file),b);urls[key].push(`art/map-runtime/${file}`);
  report[key].lods.push({file,triangles:count(d),originalTriangles:original,materials:d.getRoot().listMaterials().length,bytes:b.length});
 }
 console.log(key,report[key].lods.map(l=>`${l.triangles}t/${l.materials}m/${(l.bytes/1e6).toFixed(2)}MB`).join(' | '));
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(report,null,2));
const data=`import {assetUrl} from './assetUrl';\nexport const MAP_RUNTIME_MODELS=${JSON.stringify(urls,null,2)} as const;\nexport const runtimeModelUrl=(key:keyof typeof MAP_RUNTIME_MODELS,lod:number)=>assetUrl(MAP_RUNTIME_MODELS[key][lod]);\n`;
await fs.writeFile(path.join(root,'src/data/mapRuntimeModels.ts'),data);
// Use small web textures while retaining the original art files.
for(const name of ['terrain-jade-clear-20261020','white-normal','cyan-occupied','road-arrow-north','road-arrow-east','road-arrow-south','road-arrow-west']){const size=name.startsWith('terrain')?1254:384;await sharp(path.join(root,'public/art/map-selected',name+'.png')).resize({width:size,height:size,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toFile(path.join(out,name+'.webp'));}
