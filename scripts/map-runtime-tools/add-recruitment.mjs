// Scoped asset build: only recruitment. Existing models are never rebuilt.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {NodeIO,Logger,PropertyType} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {flatten,dequantize,weld,join,dedup,prune,textureCompress,meshopt} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import sharp from 'sharp';
const root=process.argv[2]?path.resolve(process.argv[2]):fileURLToPath(new URL('../../',import.meta.url));
const source=process.argv[3]?path.resolve(process.argv[3]):path.join(root,'art-src/map-models/recruitment-v20.glb');
const hash=b=>createHash('sha256').update(b).digest('hex');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const count=d=>d.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
const raw=await fs.readFile(source),original='art-src/map-models/recruitment-v20.glb';
await fs.mkdir(path.join(root,'art-src/map-models'),{recursive:true});
if(path.resolve(source)!==path.resolve(root,original))await fs.writeFile(path.join(root,original),raw);
const d=await io.read(source);d.setLogger(new Logger(Logger.Verbosity.SILENT));
const triangles=count(d),primitives=d.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().length,0);
await d.transform(dedup({propertyTypes:[PropertyType.ACCESSOR,PropertyType.TEXTURE,PropertyType.MATERIAL]}),textureCompress({encoder:sharp,targetFormat:'webp',resize:[8192,8192],quality:90}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
if(count(d)!==triangles)throw Error('Selected model triangle preservation failed');
const packed=await io.writeBinary(d),url='/art/map-selected/recruitment-v20.glb';await fs.writeFile(path.join(root,'public',url),packed);
const manifestPath=path.join(root,'public/art/map-selected/model-manifest.json'),manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
manifest.recruitment={url,source:path.join(root,original),version:'v20',name:'募兵司',status:'integrated',visualApproved:false,original,originalSha256:hash(raw),sha256:hash(packed),notes:'User selected v20 for integration; original illustration pixel identity is not claimed.'};
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(root,'src/data/mapModels.ts'),`import { assetUrl } from './assetUrl';\n// 由 scripts/optimize-map-models.mjs 產生\nexport const MAP_MODELS = {\n${Object.entries(manifest).map(([key,m])=>`  ${JSON.stringify(key)}: assetUrl(${JSON.stringify(`${m.url}?v=${m.sha256.slice(0,12)}`)})`).join(',\n')}\n} as const;\n`);
// One prebuilt 512px/WebP/Meshopt model. Preserve tiny tiger inlays: no simplification.
const runtime=await io.read(source);runtime.setLogger(new Logger(Logger.Verbosity.SILENT));
for(const mat of runtime.getRoot().listMaterials()){
 mat.setExtras({gameRecolor:false});
 for(const ext of ['KHR_materials_transmission','KHR_materials_volume','KHR_materials_clearcoat','KHR_materials_ior','KHR_materials_specular','KHR_materials_sheen'])mat.setExtension(ext,null);
}
await runtime.transform(flatten({cleanup:false}),dequantize(),weld(),dedup({propertyTypes:[PropertyType.ACCESSOR,PropertyType.TEXTURE,PropertyType.MATERIAL]}),join({keepNamed:false,cleanup:false}),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],quality:85}));
for(const t of runtime.getRoot().listTextures())t.setName('game-tex-'+hash(t.getImage()).slice(0,20));
if(count(runtime)!==triangles)throw Error('Runtime triangle preservation failed');
await runtime.transform(meshopt({encoder:MeshoptEncoder,level:'medium',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:16}));
const bytes=await io.writeBinary(runtime),file=`recruitment-lod0-${hash(bytes).slice(0,12)}.glb`;
await fs.writeFile(path.join(root,'public/art/map-runtime',file),bytes);
const reportPath=path.join(root,'public/art/map-runtime/manifest.json'),report=JSON.parse(await fs.readFile(reportPath,'utf8'));
report.recruitment={sourceSha:hash(packed),lods:[{file,triangles:count(runtime),originalTriangles:triangles,materials:runtime.getRoot().listMaterials().length,bytes:bytes.length}]};
await fs.writeFile(reportPath,JSON.stringify(report,null,2));
const mapPath=path.join(root,'src/data/mapRuntimeModels.ts'),mapText=await fs.readFile(mapPath,'utf8'),start=mapText.indexOf('{',mapText.indexOf('MAP_RUNTIME_MODELS=')),end=mapText.indexOf('} as const;');
const urls=JSON.parse(mapText.slice(start,end+1));urls.recruitment=[`art/map-runtime/${file}`];
await fs.writeFile(mapPath,`import {assetUrl} from './assetUrl';\nexport const MAP_RUNTIME_MODELS=${JSON.stringify(urls,null,2)} as const;\nexport const runtimeModelUrl=(key:keyof typeof MAP_RUNTIME_MODELS,lod:number)=>assetUrl(MAP_RUNTIME_MODELS[key][lod]);\n`);
console.log(JSON.stringify({sourceBytes:raw.length,selectedBytes:packed.length,runtimeBytes:bytes.length,sourceTriangles:triangles,runtimeTriangles:count(runtime),sourcePrimitives:primitives,runtimeFile:file}));
