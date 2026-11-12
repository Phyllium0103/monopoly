import { Box3, Group, Mesh, type BufferGeometry, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Keep every recessed pip, but draw the shared ivory/red/black materials once each. */
export function batchDiceModel(source: Object3D): Group {
  source.updateMatrixWorld(true);
  const parts = new Map<Material, BufferGeometry[]>();
  source.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.length !== 1) throw new Error('Dice primitive must have one material');
    const list = parts.get(materials[0]) ?? [];
    list.push(object.geometry.clone().applyMatrix4(object.matrixWorld));
    parts.set(materials[0], list);
  });
  const model = new Group();
  for (const [material, geometries] of parts) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error('Cannot batch dice geometry');
    model.add(new Mesh(geometry, material));
    for (const part of geometries) part.dispose();
  }
  const bounds = new Box3().setFromObject(model);
  model.position.sub(bounds.getCenter(model.position.clone()));
  return model;
}
