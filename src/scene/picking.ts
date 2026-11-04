import type * as THREE from 'three';

export type PickMode = 'inspect' | 'tile' | 'city' | 'lord' | 'none';
/** Resolve semantic pick surfaces before considering distance; never coerce a lord into a tile. */
export function resolvePick(hits: readonly THREE.Intersection[], mode: PickMode): THREE.Object3D | null {
  if (mode === 'none') return null;
  for (const hit of hits) {
    let object: THREE.Object3D | null = hit.object;
    while (object && !object.userData.pick) object = object.parent;
    if (!object) continue;
    let visible = true;
    for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) visible = false;
    if (visible && (mode === 'inspect' || object.userData.pickKind === mode)) return object;
  }
  return null;
}
