import * as THREE from 'three';
export interface CityVisual {
  group: THREE.Group;
  animated: THREE.Object3D[];
  flags: THREE.Object3D[];
}

/** 更新城池視覺動畫。 */
export function animateCity(v: CityVisual, time: number) {
  for (const o of v.animated) {
    if (o.userData.spin) o.rotation.y = time * o.userData.spin;
    if (o.userData.bob !== undefined) o.position.y = o.userData.bob + Math.sin(time * 2) * 0.15;
    if (o.userData.float !== undefined) o.position.y = o.userData.float + Math.sin(time * 1.6) * 0.05;
    if (o.userData.pulse) o.scale.setScalar(1 + Math.sin(time * 6) * 0.15);
  }
  for (const f of v.flags) {
    const cloth = f.userData.wave as THREE.Object3D;
    cloth.rotation.y = Math.sin(time * 3 + f.position.x) * 0.3;
  }
}
