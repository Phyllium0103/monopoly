import { Camera, Sprite, Vector3, Vector4 } from 'three';

export interface EyeRegion {
  /** Normalized inside the frame's source rect, measured from its top-left. */
  center: [number, number];
  radius: [number, number];
}
export interface SpritePose {
  rect: [number, number, number, number];
  anchor: [number, number];
  heightScale?: number;
  displayScale?: number;
  /** Measured crown-top point in source pixels; raised hands are not body height. */
  bodyTop?: [number, number];
  eyes?: [number, number][];
  eyeRegions?: EyeRegion[];
  eyesClosed?: boolean;
}
export interface SpriteAtlas {
  width: number; height: number; pixelsPerUnit: number;
  frames: SpritePose[];
  targetBodyHeight?: number;
  release?: { frame: number; point: [number, number] };
}
export function eyeSourcePoint(frame: SpritePose, eye: EyeRegion): [number, number] {
  const [l, t, r, b] = frame.rect;
  return [l + eye.center[0] * (r - l), t + eye.center[1] * (b - t)];
}
export function eyeAtlasRegion(atlas: SpriteAtlas, frame: SpritePose, eye: EyeRegion): Vector4 {
  const [x, y] = eyeSourcePoint(frame, eye);
  return new Vector4(x / atlas.width, 1 - y / atlas.height,
    eye.radius[0] * (frame.rect[2] - frame.rect[0]) / atlas.width,
    eye.radius[1] * (frame.rect[3] - frame.rect[1]) / atlas.height);
}
/** Matches Three's Sprite vertex shader, including parent transforms, billboard
 * axes, Sprite.center, material.rotation and non-uniform world scale. */
export function spriteSourceToWorld(sprite: Sprite, camera: Camera, frame: SpritePose, point: [number, number]): Vector3 {
  sprite.updateWorldMatrix(true, false); camera.updateWorldMatrix(true, false);
  const [l, t, r, b] = frame.rect;
  const sx = new Vector3().setFromMatrixColumn(sprite.matrixWorld, 0).length();
  const sy = new Vector3().setFromMatrixColumn(sprite.matrixWorld, 1).length();
  const x = ((point[0] - l) / (r - l) - sprite.center.x) * sx;
  const y = ((b - point[1]) / (b - t) - sprite.center.y) * sy;
  const angle = sprite.material.rotation, c = Math.cos(angle), s = Math.sin(angle);
  return new Vector3().setFromMatrixPosition(sprite.matrixWorld)
    .addScaledVector(new Vector3().setFromMatrixColumn(camera.matrixWorld, 0), c * x - s * y)
    .addScaledVector(new Vector3().setFromMatrixColumn(camera.matrixWorld, 1), s * x + c * y);
}
