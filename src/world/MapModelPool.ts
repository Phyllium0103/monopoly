import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {MAP_MODELS} from '../data/mapModels';
import {MAP_RUNTIME_MODELS,runtimeModelUrl} from '../data/mapRuntimeModels';
import {CELL_SIZE} from '../data/selectedBoard';
type Key=keyof typeof MAP_MODELS;
export interface Placement{id:string;key:Key;x:number;z:number;rotation:number;color:number}
interface Part{geometry:THREE.BufferGeometry;material:THREE.Material;recolor:boolean;transform:THREE.Matrix4}
interface Batch{meshes:THREE.InstancedMesh[];signature:string}
// LOD1 is ~40% of LOD0's download with no visible loss at board camera distance.
export const ACTIVE_MAP_LOD=1;
const CACHE='xiantu-map-runtime-v1';
async function fetchCached(url:string){
 const cache=typeof caches==='undefined'?null:await caches.open(CACHE).catch(()=>null);
 const hit=await cache?.match(url).catch(()=>undefined);if(hit)return hit.arrayBuffer();
 const r=await fetch(url);if(!r.ok)throw Error(`HTTP ${r.status}: ${url}`);
 if(cache){const copy=r.clone();void cache.put(url,copy).catch(()=>{});}return r.arrayBuffer();
}
/** One compressed detail-preserving model per type, with individual visibility culling. */
export class MapModelPool{
 group=new THREE.Group();
 private placements:Placement[]=[];
 private cache=new Map<string,Promise<Part[]>>();
 private ready=new Map<string,Part[]>();
 private bounds=new Map<Key,THREE.Box3>();
 private materials=new Map<string,THREE.Material>();
 private textures=new Map<string,THREE.Texture>();
 private batches=new Map<string,Batch>();
 private loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 private revision=0;private viewKey='';
 private frustum=new THREE.Frustum();private vp=new THREE.Matrix4();private instance=new THREE.Matrix4();private dummy=new THREE.Object3D();
 private status=document.createElement('div');private pending:Promise<void>=Promise.resolve();
 constructor(private onChange:()=>void){this.status.className='map-loading';this.status.hidden=true;this.status.setAttribute('role','status');document.body.append(this.status);}
 async prepare(progress:(done:number,total:number)=>void){
  const keys=Object.keys(MAP_RUNTIME_MODELS) as Key[],total=keys.length;let done=0,next=0;progress(0,total);
  await Promise.all(Array.from({length:3},async()=>{while(next<keys.length){const key=keys[next++];await this.load(key,ACTIVE_MAP_LOD);progress(++done,total);await new Promise<void>(resolve=>setTimeout(resolve,0));}}));
 }
 async warmup(renderer:THREE.WebGLRenderer){
  for(const texture of this.textures.values())renderer.initTexture(texture);
  // Upload only the single selected compressed model for each building type.
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-20,20,20,-20,.1,200);
  camera.position.set(20,20,20);camera.lookAt(0,3,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x555555,1),new THREE.DirectionalLight(0xffffff,2));
  for(const parts of this.ready.values())for(const p of parts){const mesh=new THREE.Mesh(p.geometry,p.material);mesh.matrix.copy(p.transform);mesh.matrixAutoUpdate=false;mesh.frustumCulled=false;scene.add(mesh);}
  const target=new THREE.WebGLRenderTarget(4,4),previous=renderer.getRenderTarget(),shadows=renderer.shadowMap.enabled;
  try{renderer.shadowMap.enabled=false;await renderer.compileAsync(scene,camera);renderer.setRenderTarget(target);renderer.render(scene,camera);}
  finally{renderer.setRenderTarget(previous);renderer.shadowMap.enabled=shadows;target.dispose();}
 }
 sync(placements:Placement[],_focus?:{x:number;z:number}):Promise<void>{
  if(JSON.stringify(placements)===JSON.stringify(this.placements))return this.pending;
  this.placements=placements;const revision=++this.revision;this.viewKey='';
  this.pending=(async()=>{const missing=[...new Set(placements.map(p=>p.key))].filter(key=>!this.ready.has(key+':'+ACTIVE_MAP_LOD));
   if(!missing.length)return;this.status.hidden=false;
   try{for(const key of missing){this.status.textContent='準備建築…';await this.load(key,ACTIVE_MAP_LOD);}}
   finally{if(revision===this.revision)this.status.hidden=true;}
  })();return this.pending;
 }
 update(camera:THREE.OrthographicCamera,height:number){
  const viewKey=[...camera.matrixWorld.elements,...camera.projectionMatrix.elements,height,this.revision].join(',');
  if(viewKey===this.viewKey)return;this.viewKey=viewKey;
  this.vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.vp);
  const lod=ACTIVE_MAP_LOD;
  const visible=new Map<string,Placement[]>();
  for(const p of this.placements){if(!this.ready.has(p.key+':'+lod))continue;
   const box=(this.bounds.get(p.key)??new THREE.Box3(new THREE.Vector3(-5,0,-5),new THREE.Vector3(5,25,5))).clone().applyMatrix4(this.matrix(p));
   if(!this.frustum.intersectsBox(box))continue;const key=p.key+':'+lod,list=visible.get(key)??[];list.push(p);visible.set(key,list);
  }
  let changed=false;
  for(const [key,list]of visible){let batch=this.batches.get(key);
   if(!batch){batch={signature:'',meshes:this.ready.get(key)!.map(part=>{
    const mesh=new THREE.InstancedMesh(part.geometry,part.material,128);mesh.count=0;mesh.castShadow=mesh.receiveShadow=true;mesh.userData.recolor=part.recolor;mesh.userData.partMatrix=part.transform;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);return mesh;
   })};this.batches.set(key,batch);}
   const signature=list.map(p=>`${p.id}:${p.x}:${p.z}:${p.rotation}:${p.color}`).join('|');
   if(batch.signature===signature)continue;batch.signature=signature;changed=true;
   for(const mesh of batch.meshes){mesh.visible=true;mesh.count=list.length;list.forEach((p,i)=>{mesh.setMatrixAt(i,this.instance.multiplyMatrices(this.matrix(p),mesh.userData.partMatrix));if(mesh.userData.recolor)mesh.setColorAt(i,new THREE.Color(p.color));});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();}
  }
  for(const [key,batch]of this.batches)if(!visible.has(key)&&batch.signature!==''){batch.signature='';for(const mesh of batch.meshes){mesh.visible=false;mesh.count=0;}changed=true;}
  if(changed)this.onChange();
 }
 private matrix(p:Placement){this.dummy.position.set(p.x,0,p.z);this.dummy.rotation.set(0,p.rotation,0);this.dummy.scale.setScalar(CELL_SIZE*2/10);this.dummy.updateMatrix();return this.dummy.matrix;}
 private load(key:Key,lod:number){const id=key+':'+lod;let promise=this.cache.get(id);if(promise)return promise;
  const url=runtimeModelUrl(key,Math.min(lod,MAP_RUNTIME_MODELS[key].length-1));promise=(async()=>{
   const gltf=await this.loader.parseAsync(await fetchCached(url),url.replace(/[^/]*$/,''));gltf.scene.updateMatrixWorld(true);
   if(lod===0||!this.bounds.has(key))this.bounds.set(key,new THREE.Box3().setFromObject(gltf.scene));
   const parts:Part[]=[],unusedImages=new Set<ImageBitmap>();
   gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;if(Array.isArray(o.material))throw Error(`Runtime model must be prejoined by material: ${key}`);
    const original=o.material as THREE.MeshStandardMaterial;if('transmission'in original)(original as THREE.MeshPhysicalMaterial).transmission=0;original.forceSinglePass=true;
    for(const prop of Object.keys(original)){const t=(original as unknown as Record<string,unknown>)[prop];if(!(t instanceof THREE.Texture))continue;const tid=[t.name||t.uuid,t.colorSpace,t.channel,t.wrapS,t.wrapT,...t.offset.toArray(),...t.repeat.toArray(),t.rotation,t.flipY].join(':'),shared=this.textures.get(tid);if(shared&&shared!==t){(original as unknown as Record<string,unknown>)[prop]=shared;if(typeof ImageBitmap!=='undefined'&&t.image instanceof ImageBitmap)unusedImages.add(t.image);t.dispose();}else this.textures.set(tid,t);}
    const mid=[key,original.name,original.type,original.opacity,original.transparent,original.side,original.color?.getHex(),original.roughness,original.metalness,original.userData.gameRecolor,original.emissive?.getHex(),original.emissiveIntensity,original.alphaTest,original.depthWrite,original.normalScale?.toArray().join(','),...Object.keys(original).filter(k=>(original as unknown as Record<string,unknown>)[k] instanceof THREE.Texture).sort().map(k=>k+'='+((original as unknown as Record<string,unknown>)[k] as THREE.Texture).uuid)].join(':');let material=this.materials.get(mid);if(!material){material=original;this.materials.set(mid,material);}else if(material!==original)original.dispose();
    const recolor=material.userData.gameRecolor===true;if(recolor&&'color'in material)(material as THREE.MeshStandardMaterial).color.setHex(0xffffff);
    // Meshopt positions may be normalized integers. Preserve their authored node
    // transform in the instance matrix; baking into integer buffers clips them.
    const geometry=o.geometry;geometry.computeBoundingSphere();parts.push({geometry,material,recolor,transform:o.matrixWorld.clone()});
   });
   for(const image of unusedImages)if(![...this.textures.values()].some(t=>t.image===image))image.close();
   this.ready.set(id,parts);this.viewKey='';return parts;
  })();this.cache.set(id,promise);promise.catch(()=>this.cache.delete(id));return promise;
 }
}
