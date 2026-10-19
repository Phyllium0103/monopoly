import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_MODELS } from '../data/mapModels';
import { CELL_SIZE } from '../data/selectedBoard';

interface Placement {id:string;key:keyof typeof MAP_MODELS;x:number;z:number;rotation:number;color:number;}
/** One load per model, one instanced draw per material. Repeated shops share their geometry. */
export class MapModelPool {
  group=new THREE.Group();
  private placements:Placement[]=[];
  private cache=new Map<string,Promise<{geometry:THREE.BufferGeometry;material:THREE.Material;recolor:boolean}[]>>();
  private generation=0;
  private status=document.createElement('div');
  constructor(private onChange:()=>void){this.status.className='map-loading';this.status.setAttribute('role','status');document.body.append(this.status);}
  async sync(placements:Placement[]) {
    if(JSON.stringify(this.placements)===JSON.stringify(placements))return;
    this.placements=placements;const generation=++this.generation;
    for(const mesh of this.group.children) if(mesh instanceof THREE.InstancedMesh) mesh.dispose();
    this.group.clear();let completed=0,failed=0;
    const keys=[...new Set(placements.map(p=>p.key))];
    this.status.hidden=false;
    // Sequential decoding prevents a simultaneous spike from thirteen detailed Blender models.
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
  private load(key:keyof typeof MAP_MODELS){
    let p=this.cache.get(key);if(p)return p;
    p=new GLTFLoader().loadAsync(MAP_MODELS[key]).then(gltf=>{
      gltf.scene.updateMatrixWorld(true);
      const grouped=new Map<THREE.Material,THREE.BufferGeometry[]>();
      gltf.scene.traverse(o=>{
        if(!(o instanceof THREE.Mesh)||!o.visible)return;
        const source=o.geometry as THREE.BufferGeometry;
        const materials=Array.isArray(o.material)?o.material:[o.material];
        const groups=source.groups.length?source.groups:[{start:0,count:source.index?.count??source.attributes.position.count,materialIndex:0}];
        for(const g of groups){
          const mat=materials[g.materialIndex??0];if(!mat)continue;
          const raw=source.index?source.toNonIndexed():source.clone();
          const geo=new THREE.BufferGeometry();
          for(const name of ['position','normal','uv']){
            const a=raw.getAttribute(name);if(!a)continue;
            const arr=new Float32Array(g.count*a.itemSize);
            for(let i=0;i<g.count;i++)for(let j=0;j<a.itemSize;j++)arr[i*a.itemSize+j]=a.getComponent(g.start+i,j);
            geo.setAttribute(name,new THREE.BufferAttribute(arr,a.itemSize));
          }
          if(!geo.getAttribute('normal'))geo.computeVertexNormals();
          if(!geo.getAttribute('uv'))geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.count*2),2));
          geo.applyMatrix4(o.matrixWorld);raw.dispose();
          const a=grouped.get(mat)??[];a.push(geo);grouped.set(mat,a);
        }
      });
      const result=[...grouped].map(([material,geometries])=>{
        const geometry=mergeGeometries(geometries,false);if(!geometry)throw Error(`模型材質合批失敗 ${key}`);
        geometries.forEach(g=>g.dispose());
        return{geometry,material,recolor:/roof|accent|primary|tile.*blue|琉璃|主色/i.test(material.name)};
      });
      // GLB uses a Y-up floor origin. Preserve authored pivots and floating city height.
      return result;
    });
    this.cache.set(key,p);p.catch(()=>this.cache.delete(key));return p;
  }
}
