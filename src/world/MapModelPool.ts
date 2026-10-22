import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_MODELS } from '../data/mapModels';
import { CELL_SIZE } from '../data/selectedBoard';

const CACHE='xiantu-map-models';
/** 模型網址帶有內容版本（?v=雜湊），同一個網址內容不變：存進瀏覽器快取，下次開遊戲直接讀取；換版本時清掉舊檔 */
async function fetchCached(url:string){
  const cache=typeof caches==='undefined'?null:await caches.open(CACHE).catch(()=>null);
  const hit=await cache?.match(url).catch(()=>undefined);if(hit)return hit.arrayBuffer();
  const r=await fetch(url);if(!r.ok)throw Error(`HTTP ${r.status}`);
  if(cache){
    const copy=r.clone(),full=new URL(url,location.href);
    void (async()=>{for(const old of await cache.keys())if(new URL(old.url).pathname===full.pathname&&old.url!==full.href)await cache.delete(old);await cache.put(url,copy);})().catch(()=>{});
  }
  return r.arrayBuffer();
}
interface Placement {id:string;key:keyof typeof MAP_MODELS;x:number;z:number;rotation:number;color:number;}
/** One load per model, one instanced draw per material. Repeated shops share their geometry. */
export class MapModelPool {
  group=new THREE.Group();
  private placements:Placement[]=[];
  private cache=new Map<string,Promise<{geometry:THREE.BufferGeometry;material:THREE.Material;recolor:boolean}[]>>();
  private downloads=new Map<string,Promise<ArrayBuffer>>();
  private loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private generation=0;
  private status=document.createElement('div');
  constructor(private onChange:()=>void){this.status.className='map-loading';this.status.setAttribute('role','status');document.body.append(this.status);
    // 選陣營的畫面就先在背景下載模型，開局時多半已經下載好了
    const prefetch=()=>{for(const key of Object.keys(MAP_MODELS) as (keyof typeof MAP_MODELS)[])if(!this.cache.has(key))this.download(key).catch(()=>{});};
    if(document.readyState==='complete')setTimeout(prefetch,500);else addEventListener('load',()=>setTimeout(prefetch,500),{once:true});}
  /** focus：目前鏡頭附近的位置，離它近的建築先顯示 */
  async sync(placements:Placement[],focus?:{x:number;z:number}) {
    if(JSON.stringify(this.placements)===JSON.stringify(placements))return;
    this.placements=placements;const generation=++this.generation;
    for(const mesh of this.group.children) if(mesh instanceof THREE.InstancedMesh) mesh.dispose();
    this.group.clear();let completed=0,failed=0;
    const dist=(k:string)=>focus?Math.min(...placements.filter(p=>p.key===k).map(p=>Math.hypot(p.x-focus.x,p.z-focus.z))):0;
    const keys=[...new Set(placements.map(p=>p.key))].sort((a,b)=>dist(a)-dist(b));
    this.status.hidden=false;
    // Download every model at once, but decode one at a time to avoid a main-thread spike.
    for(const key of keys)this.download(key).catch(()=>{});
    for(const key of keys){
      this.status.textContent=`山河建築載入 ${completed}/${keys.length}`;
      try{
        const parts=await this.load(key);if(generation!==this.generation)return;
        const list=placements.filter(p=>p.key===key);
        for(const part of parts){
          const mesh=new THREE.InstancedMesh(part.geometry,part.material,list.length);
          for(const[pIndex,p]of list.entries()){
            const matrix=new THREE.Matrix4().compose(new THREE.Vector3(p.x,0,p.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.rotation),new THREE.Vector3().setScalar(CELL_SIZE*2/10));
            mesh.setMatrixAt(pIndex,matrix);
            if(part.recolor)mesh.setColorAt(pIndex,new THREE.Color(p.color));
          }
          mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();this.group.add(mesh);
        }
        this.onChange();
      }catch(e){failed++;console.error(`地圖模型載入失敗 ${key}`,e);}
      completed++;
    }
    if(generation!==this.generation)return;
    this.status.textContent=failed?`有 ${failed} 種建築尚未載入，請重新整理重試`:'建築已就緒';
    this.status.hidden=!failed;
  }
  private download(key:keyof typeof MAP_MODELS){
    let p=this.downloads.get(key);if(p)return p;
    p=fetchCached(MAP_MODELS[key]);
    this.downloads.set(key,p);p.catch(()=>this.downloads.delete(key));return p;
  }
  private load(key:keyof typeof MAP_MODELS){
    let p=this.cache.get(key);if(p)return p;
    p=this.download(key).then(buffer=>this.loader.parseAsync(buffer,MAP_MODELS[key].replace(/[^/]*$/,''))).then(gltf=>{
      gltf.scene.updateMatrixWorld(true);
      const grouped=new Map<THREE.Material,THREE.BufferGeometry[]>();
      gltf.scene.traverse(o=>{
        if(!(o instanceof THREE.Mesh)||!o.visible)return;
        const source=o.geometry as THREE.BufferGeometry;
        const materials=Array.isArray(o.material)?o.material:[o.material];
        const count=source.index?.count??source.attributes.position.count;
        const groups=source.groups.length?source.groups:[{start:0,count,materialIndex:0}];
        for(const g of groups){
          const mat=materials[g.materialIndex??0];if(!mat)continue;
          // Keep the shared-vertex index; copy only the vertices this group uses, dequantized to floats so all parts merge.
          const remap=new Map<number,number>(),index=new Uint32Array(g.count);
          for(let i=0;i<g.count;i++){const v=source.index?source.index.getX(g.start+i):g.start+i;let n=remap.get(v);if(n===undefined){n=remap.size;remap.set(v,n);}index[i]=n;}
          const geo=new THREE.BufferGeometry();
          for(const name of ['position','normal','uv']){
            const a=source.getAttribute(name);if(!a)continue;
            const arr=new Float32Array(remap.size*a.itemSize);
            for(const[v,n]of remap)for(let j=0;j<a.itemSize;j++)arr[n*a.itemSize+j]=a.getComponent(v,j);
            geo.setAttribute(name,new THREE.BufferAttribute(arr,a.itemSize));
          }
          geo.setIndex(new THREE.BufferAttribute(index,1));
          if(!geo.getAttribute('normal'))geo.computeVertexNormals();
          if(!geo.getAttribute('uv'))geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(remap.size*2),2));
          geo.applyMatrix4(o.matrixWorld);
          const a=grouped.get(mat)??[];a.push(geo);grouped.set(mat,a);
        }
        source.dispose();
      });
      const result=[...grouped].map(([material,geometries])=>{
        const geometry=mergeGeometries(geometries,false);if(!geometry)throw Error(`模型材質合批失敗 ${key}`);
        geometries.forEach(g=>g.dispose());
        const recolor=key.startsWith('city-') && (/primary|roof|琉璃|主色/i.test(material.name)||(key==='city-1'&&/stoneedge|edge|trim/i.test(material.name)));
        if(recolor){material=material.clone();if('color' in material)(material as THREE.MeshStandardMaterial).color.setHex(0xffffff);}
        return{geometry,material,recolor};
      });
      // GLB uses a Y-up floor origin. Preserve authored pivots and floating city height.
      this.downloads.delete(key);
      return result;
    });
    this.cache.set(key,p);p.catch(()=>this.cache.delete(key));return p;
  }
}
