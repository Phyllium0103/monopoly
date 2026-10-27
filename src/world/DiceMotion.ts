import { Quaternion, Vector3 } from 'three';

/** GLB is Y-up. Opposite faces add to seven; this is also checked against the asset. */
export const DICE_FACE_NORMALS: Readonly<Record<number, readonly [number, number, number]>> = {
  1: [0, 1, 0], 6: [0, -1, 0], 3: [1, 0, 0], 4: [-1, 0, 0], 2: [0, 0, 1], 5: [0, 0, -1],
};
const UP = new Vector3(0, 1, 0);
export function resultQuaternion(value: number, yaw = 0): Quaternion {
  const normal = DICE_FACE_NORMALS[value];
  if (!normal) throw new RangeError('Dice value must be 1..6');
  return new Quaternion().setFromAxisAngle(UP, yaw).multiply(
    new Quaternion().setFromUnitVectors(new Vector3(...normal), UP),
  );
}

export function diceRollResult(values: readonly number[], bonus: number, multiplier: number): { total: number; detail: string } {
  const total = (values.reduce((a, b) => a + b, 0) + bonus) * multiplier;
  const modifiers = [bonus ? `額外 +${bonus}` : '', multiplier > 1 ? `遁地梭 ×${multiplier}` : ''].filter(Boolean);
  return { total, detail: `${values.join(' + ')}${modifiers.length ? ` · ${modifiers.join(' · ')}` : ''}` };
}

/** UI 1×/2×/4× plays the same fixed-step physics at 2×/4×/8×. */
export function dicePlaybackRate(speed = 1): number {
  return 2 * Math.max(.25, Number.isFinite(speed) ? speed : 1);
}
