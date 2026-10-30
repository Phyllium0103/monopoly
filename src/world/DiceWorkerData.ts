import {Quaternion,Vector3} from 'three';
import type {PhysicalDiceRoll} from './DicePhysics';
export interface DiceWorkerData extends Omit<PhysicalDiceRoll,'frames'|'labelRotations'> {
  frameCount:number;poses:Float64Array;labelRotations:number[][];
}
export function packDiceRoll(roll:PhysicalDiceRoll):DiceWorkerData {
  const {frames,labelRotations,...rest}=roll;
  const poses=new Float64Array(frames.length*roll.values.length*14);let i=0;
  for(const frame of frames)for(const p of frame){
    poses.set([...p.position.toArray(),...p.rotation.toArray(),...p.linearVelocity.toArray(),...p.angularVelocity.toArray(),Number(p.sleeping)],i);i+=14;
  }
  return {...rest,frameCount:frames.length,poses,labelRotations:labelRotations.map(q=>q.toArray())};
}
export function unpackDiceRoll(data:DiceWorkerData):PhysicalDiceRoll {
  const {frameCount,poses,labelRotations,...rest}=data;let i=0;
  const frames=Array.from({length:frameCount},()=>rest.values.map(()=>{
    const p={position:new Vector3().fromArray(poses,i),rotation:new Quaternion().fromArray(poses,i+3),linearVelocity:new Vector3().fromArray(poses,i+7),angularVelocity:new Vector3().fromArray(poses,i+10),sleeping:!!poses[i+13]};i+=14;return p;
  }));
  return {...rest,frames,labelRotations:labelRotations.map(q=>new Quaternion().fromArray(q))};
}
