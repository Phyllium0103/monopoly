import * as THREE from 'three';
import { BOARD_SIDE, CELL_SIZE } from '../data/selectedBoard';
import { BOARD } from '../data/board';

/** A square world plane becomes the required diamond at the fixed 45° azimuth. */
export class SelectedTerrain {
  group=new THREE.Group();
  private road: THREE.InstancedMesh;
  private faces: THREE.InstancedMesh;
  private occupied: THREE.InstancedMesh;
  private active=new Set<number>();
  private marker=new THREE.Object3D();
  private pulseTime=0;
  constructor() {
    const load=(name:string,rect?:number[])=>{
      const t=new THREE.TextureLoader().load(`/art/map-selected/${name}`);
      t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;
      if(rect){t.offset.set(rect[0]/1254,1-rect[3]/1254);t.repeat.set((rect[2]-rect[0])/1254,(rect[3]-rect[1])/1254);}
      return t;
    };
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(BOARD_SIDE,BOARD_SIDE),new THREE.MeshPhongMaterial({map:load('selected-terrain.png'),color:0xffffff,shininess:0}));
    ground.rotation.x=-Math.PI/2;ground.position.y=-.08;ground.receiveShadow=true;this.group.add(ground);
    const edge=new THREE.Mesh(new THREE.BoxGeometry(BOARD_SIDE,.6,BOARD_SIDE),new THREE.MeshPhongMaterial({color:0x536851,shininess:5}));
    edge.position.y=-.4;this.group.add(edge);
    const shape=new THREE.Shape().moveTo(-.445,-.445).lineTo(.445,-.445).lineTo(.445,.445).lineTo(-.445,.445).closePath();
    const body=new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:true,bevelThickness:.02,bevelSize:.025,bevelSegments:3,steps:1});
    body.rotateX(-Math.PI/2);body.translate(0,.025,0);body.scale(CELL_SIZE,CELL_SIZE,CELL_SIZE);
    const top=new THREE.PlaneGeometry(.89*CELL_SIZE,.89*CELL_SIZE).rotateX(-Math.PI/2);
    this.road=new THREE.InstancedMesh(body,new THREE.MeshPhongMaterial({color:0xd1d7db,shininess:18}),BOARD.tiles.length);
    this.faces=new THREE.InstancedMesh(top,new THREE.MeshPhongMaterial({map:load('white-normal.png',[79,81,1176,1166]),shininess:18}),BOARD.tiles.length);
    this.occupied=new THREE.InstancedMesh(top,new THREE.MeshPhongMaterial({map:load('cyan-occupied.png',[74,78,1182,1169]),emissive:0x19434a,emissiveIntensity:.15,shininess:28}),BOARD.tiles.length);
    for(const t of BOARD.tiles){this.marker.position.set(t.pos.x,0,t.pos.z);this.marker.updateMatrix();this.road.setMatrixAt(t.index,this.marker.matrix);
      this.marker.position.y=.166*CELL_SIZE;this.marker.updateMatrix();this.faces.setMatrixAt(t.index,this.marker.matrix);
      this.marker.position.y=-5;this.marker.updateMatrix();this.occupied.setMatrixAt(t.index,this.marker.matrix);
    }
    this.road.castShadow=this.road.receiveShadow=this.faces.receiveShadow=true;
    this.occupied.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.road,this.faces,this.occupied);
  }
  heightAt(_x:number,_z:number){return .166*CELL_SIZE;}
  setOccupied(indices:number[]) {
    const next=new Set(indices);
    if(next.size===this.active.size&&[...next].every(i=>this.active.has(i)))return;
    for(const i of new Set([...this.active,...next])){
      const t=BOARD.tiles[i];if(!t)continue;
      this.marker.position.set(t.pos.x,next.has(i)? .166*CELL_SIZE+.012:-5,t.pos.z);this.marker.updateMatrix();this.occupied.setMatrixAt(i,this.marker.matrix);
      this.road.setColorAt(i,new THREE.Color(next.has(i)?0x84c4d0:0xffffff));
    }
    this.occupied.instanceMatrix.needsUpdate=true;this.occupied.computeBoundingSphere();
    if(this.road.instanceColor)this.road.instanceColor.needsUpdate=true;
    this.active=next;
    if(import.meta.env.DEV) document.documentElement.dataset.mapOccupied=JSON.stringify([...next]);
  }
  update(t:number){this.pulseTime=t;(this.occupied.material as THREE.MeshPhongMaterial).emissiveIntensity=.12+.05*Math.sin(this.pulseTime*3);}
}
