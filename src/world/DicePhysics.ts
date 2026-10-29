import { Euler, Quaternion, Vector3 } from 'three';
import { DICE_FACE_NORMALS, resultQuaternion } from './DiceMotion';

export const DICE_PHYSICS_STEP = 1 / 480;
export const DICE_GRAVITY = -9.81;
export const DICE_ROUND_RADIUS = .075;
export const DICE_CORE_HALF = .5 - DICE_ROUND_RADIUS;
const MAX_STEPS = 480 * 9;
let initialization: Promise<typeof import('@dimforge/rapier3d-compat')> | null = null;

/** Loaded only on the first roll, not as part of the game's initial JS bundle. */
export function prepareDicePhysics(): Promise<typeof import('@dimforge/rapier3d-compat')> {
  if (!initialization) {
    let timeout: ReturnType<typeof setTimeout>;
    initialization = Promise.race([
      import('@dimforge/rapier3d-compat').then(async rapier => { await rapier.init(); return rapier; }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Dice physics load timeout')), 9000); }),
    ]).finally(() => clearTimeout(timeout));
  }
  return initialization;
}

export interface PhysicsDiePose {
  position: Vector3;
  rotation: Quaternion;
  linearVelocity: Vector3;
  angularVelocity: Vector3;
  sleeping: boolean;
}
export interface PhysicalDiceRoll {
  frames: PhysicsDiePose[][];
  duration: number;
  /** Omit only the verified stationary tail while Rapier waits to flag sleep. */
  playbackDuration: number;
  /** One constant cube symmetry per die, applied before any frame is shown. */
  labelRotations: Quaternion[];
  values: readonly number[];
  groundContacts: number;
  dieContacts: number;
  firstGroundContact: number;
  firstContact: number;
  attempts: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface DiceLaunch {
  position: readonly [number, number, number];
  velocity: readonly [number, number, number];
  size: number;
  /** A low-rebound tabletop surface for HUD throws; the game default stays unchanged. */
  surface?: 'standard' | 'soft';
  /** Explicit viewport allowance for a HUD hand-to-centre launch; default limits are unchanged. */
  maxTravel?: readonly [number,number];
}

export function upperDiceFace(rotation: Quaternion): { value: number; alignment: number } {
  let value = 1, alignment = -Infinity;
  for (const [face, normal] of Object.entries(DICE_FACE_NORMALS)) {
    const y = new Vector3(...normal).applyQuaternion(rotation).y;
    if (y > alignment) { alignment = y; value = +face; }
  }
  return { value, alignment };
}

export function roundedDiceSupport(rotation: Quaternion): number {
  return DICE_ROUND_RADIUS + DICE_CORE_HALF * [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]
    .reduce((sum, v) => sum + Math.abs(v.applyQuaternion(rotation).y), 0);
}

/**
 * Run actual dynamic bodies to sleep. No position, rotation, velocity, gravity or
 * damping is changed after launch. A symmetric collider lets us choose which
 * printed face corresponds to its initial local axes BEFORE playing the roll.
 * This preserves the game's authoritative values without steering a moving die.
 */
export async function simulateDiceRoll(values: readonly number[], random: () => number, launch?: DiceLaunch): Promise<PhysicalDiceRoll> {
  if (values.length < 1 || values.length > 2 || values.some(v => !Number.isInteger(v) || !DICE_FACE_NORMALS[v])) {
    throw new RangeError('Expected one or two dice with values 1..6');
  }
  const R = await prepareDicePhysics();
  const size = launch?.size ?? 1;
  if (!Number.isFinite(size) || size < .1 || size > 2) throw new RangeError('Invalid die size');
  const soft = launch?.surface === 'soft';
  const restitution = soft ? .055 : .32, friction = soft ? .88 : .65;
  const spin = soft ? .58 : 1;
  const failures: string[] = [];
  for (let attempt = 1; attempt <= 12; attempt++) {
    const world = new R.World({ x: 0, y: DICE_GRAVITY, z: 0 });
    const events = new R.EventQueue(true);
    try {
      world.timestep = DICE_PHYSICS_STEP;
      world.numSolverIterations = 12;
      world.integrationParameters.maxCcdSubsteps = 4;
      world.integrationParameters.normalizedAllowedLinearError = .0001;
      const ground = world.createCollider(R.ColliderDesc.cuboid(20, .1, 20).setTranslation(0, -.1, 0)
        .setFriction(friction).setRestitution(restitution));
      const bodies = values.map((_, i) => {
        const side = i ? 1 : -1;
        const rotation = new Quaternion().setFromEuler(new Euler(random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2));
        const x = launch ? launch.position[0] + i * size * 1.5 : values.length === 1 ? (random() - .5) * .4 : side * (.76 + random() * .12);
        const y = launch?.position[1] ?? 7.2 + i * .5, z = launch?.position[2] ?? (random() - .5) * .35;
        const vx = launch?.velocity[0] ?? (values.length === 1 ? (random() - .5) * .4 : -side * (.15 + random() * .2));
        const vy = launch?.velocity[1] ?? -.4, vz = launch?.velocity[2] ?? (random() - .5) * .3;
        const body = world.createRigidBody(R.RigidBodyDesc.dynamic()
          .setTranslation(x, y, z)
          .setRotation(rotation).setLinvel(vx, vy, vz)
          .setAngvel({ x: (3 + random() * 4) * side * spin, y: (random() - .5) * 3 * spin, z: (3 + random() * 4) * -side * spin })
          .setLinearDamping(.08).setAngularDamping(soft ? .7 : .12).setCcdEnabled(true).setCanSleep(true)
          .setAdditionalSolverIterations(4));
        world.createCollider(R.ColliderDesc.roundCuboid(DICE_CORE_HALF * size, DICE_CORE_HALF * size, DICE_CORE_HALF * size, DICE_ROUND_RADIUS * size)
          .setMass(.0062 * size ** 3).setFriction(friction).setRestitution(restitution).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), body);
        return body;
      });
      const frames: PhysicsDiePose[][] = [];
      const snapshot = () => bodies.map(body => {
        const p = body.translation(), q = body.rotation(), v = body.linvel(), w = body.angvel();
        return { position: new Vector3(p.x, p.y, p.z), rotation: new Quaternion(q.x, q.y, q.z, q.w).normalize(),
          linearVelocity: new Vector3(v.x, v.y, v.z), angularVelocity: new Vector3(w.x, w.y, w.z), sleeping: body.isSleeping() };
      });
      frames.push(snapshot());
      let groundContacts = 0, dieContacts = 0, firstGroundContact = -1, firstContact = -1;
      for (let step = 1; step <= MAX_STEPS; step++) {
        world.step(events);
        events.drainCollisionEvents((a, b, started) => {
          if (!started) return;
          if (firstContact < 0) firstContact = step;
          if (a === ground.handle || b === ground.handle) {
            groundContacts++; if (firstGroundContact < 0) firstGroundContact = step;
          } else dieContacts++;
        });
        frames.push(snapshot());
        if (bodies.every(body => body.isSleeping())) break;
      }
      const end = frames[frames.length - 1];
      // Reject cocked/stacked or out-of-view rolls; never move them into place.
      if (!end.every(p => p.sleeping && p.position.y < .53 * size && upperDiceFace(p.rotation).alignment > .9995)) {
        failures.push(`rest:${end.map(p => `${p.sleeping}/${p.position.y.toFixed(3)}/${upperDiceFace(p.rotation).alignment.toFixed(5)}`).join(',')}`); continue;
      }
      const poses = frames.flat();
      const bounds = {
        minX: Math.min(...poses.map(p=>p.position.x)), maxX: Math.max(...poses.map(p=>p.position.x)),
        minZ: Math.min(...poses.map(p=>p.position.z)), maxZ: Math.max(...poses.map(p=>p.position.z)),
      };
      if (bounds.maxX - bounds.minX > (launch?.maxTravel?.[0]??4.8) || bounds.maxZ - bounds.minZ > (launch?.maxTravel?.[1]??4)) { failures.push('outside'); continue; }
      const labelRotations = end.map((pose, i) => resultQuaternion(upperDiceFace(pose.rotation).value).invert().multiply(resultQuaternion(values[i])));
      let stationaryStart = frames.length - 1;
      for (let i = frames.length - 2; i >= 0; i--) {
        const stationary = frames[i].every((pose, die) => pose.linearVelocity.length() < .025 && pose.angularVelocity.length() < .06
          && pose.position.distanceTo(end[die].position) < .002 && pose.rotation.angleTo(end[die].rotation) < .01
          && upperDiceFace(pose.rotation).alignment > .9995);
        if (!stationary) break;
        stationaryStart = i;
      }
      const playbackEnd = Math.min(frames.length - 1, stationaryStart + Math.ceil(.1 / DICE_PHYSICS_STEP));
      return { frames, duration: (frames.length - 1) * DICE_PHYSICS_STEP, playbackDuration: playbackEnd * DICE_PHYSICS_STEP, values: [...values], labelRotations,
        groundContacts, dieContacts, firstGroundContact, firstContact, attempts: attempt, bounds };
    } finally { events.free(); world.free(); }
  }
  throw new Error(`Physics roll did not settle flat inside the presentation area (${failures.join(';')})`);
}

/** Interpolate only between adjacent fixed simulation ticks, never toward a forced result. */
export function sampleDicePhysics(roll: PhysicalDiceRoll, seconds: number): { position: Vector3; rotation: Quaternion }[] {
  const step = Math.max(0, Math.min(roll.frames.length - 1, seconds / DICE_PHYSICS_STEP));
  const i = Math.floor(step), next = Math.min(i + 1, roll.frames.length - 1), alpha = step - i;
  return roll.frames[i].map((pose, die) => ({
    position: pose.position.clone().lerp(roll.frames[next][die].position, alpha),
    rotation: pose.rotation.clone().slerp(roll.frames[next][die].rotation, alpha).multiply(roll.labelRotations[die]),
  }));
}
