import type { MaterialGroup } from '../data/weaponCatalog';

type Pose = { x: number; y: number; width: number; angle: number };

export const forgeHits = [1.58, 2.32, 3.31] as const;
export const forgeDuration = 5.45;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const range = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const ease = (t: number, a: number, b: number) => {
  const n = range(t, a, b);
  return n * n * (3 - 2 * n);
};
export const mix = (a: number, b: number, n: number) => a + (b - a) * n;

const palettes: Record<MaterialGroup, readonly (readonly [number, number])[]> = {
  魄: [[215, 37], [202, 31], [45, 76]],
  髓: [[192, 89], [210, 91], [237, 87]],
  銅: [[22, 95], [7, 94], [14, 98]],
  砂: [[43, 67], [36, 98], [48, 94]],
  絲: [[77, 64], [272, 91], [156, 86]],
  玉: [[136, 53], [151, 91], [164, 82]],
};

export function drawForgeArt(layer: CanvasRenderingContext2D, image: CanvasImageSource, aspect: number, pose: Pose, opacity = 1) {
  const height = pose.width / aspect;
  layer.save();
  layer.globalAlpha = opacity;
  layer.translate(pose.x, pose.y);
  layer.rotate(pose.angle);
  layer.drawImage(image, -pose.width / 2, -height / 2, pose.width, height);
  layer.restore();
}

let seed = 44307;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
const bursts = [28, 64, 124].map((count, hit) => Array.from({length:count}, (_, j) => {
  const side = hit === 0 ? (j%5===0?-1:1) : j % (hit === 2 ? 2 : 3) === 0 ? -1 : 1;
  const chip = j % 5 === 0;
  const ricochet = hit === 2 && j >= 88;
  const angle = ricochet ? mix(.16,.42,random()) : mix(.24, hit === 2 ? 1.44 : 1.14, random());
  const speed = mix(220, 545, random()) * [0.99, 1.46, 1.96][hit];
  const delay = ricochet ? mix(.075,.19,random()) : j < 14 ? 0 : random() * .052;
  return {
    vx: side * Math.cos(angle) * speed, vy: -Math.sin(angle) * speed,
    drag: mix(1.85, 3.75, random()), gravity: mix(185, 510, random()),
    delay,
    life: mix(.24, chip ? 1.05 : .78, random()) * [.72,.90,1][hit],
    width: chip ? mix(1.8, 4.3, random()) : mix(.8, 3.2, random()),
    trail: mix(.034, .122, random()), offset: ricochet ? side*delay*430 : mix(-5,5,random()),
    turn: mix(-27, 24, random()), chip, ricochet
  };
}));
type Spark = (typeof bursts)[number][number];

export function createForgeEffects(ctx: CanvasRenderingContext2D, weapon: HTMLCanvasElement, group: MaterialGroup, stage: number) {
  const [hue, saturation] = palettes[group][stage];
  const paint = (light: number, alpha = 1, offset = 0) =>
    `hsla(${hue + offset}, ${saturation}%, ${light}%, ${alpha})`;

  const haze = document.createElement('canvas');
  haze.width = haze.height = 96;
  const hazeCtx = haze.getContext('2d')!;
  for (let i = 0; i < 9; i++) {
    const x = mix(28, 68, random()), y = mix(24, 72, random()), r = mix(13, 24, random());
    const cloud = hazeCtx.createRadialGradient(x,y,1,x,y,r);
    cloud.addColorStop(0,'#a1826e50');cloud.addColorStop(1,'#a1826e00');
    hazeCtx.fillStyle=cloud;hazeCtx.fillRect(x-r,y-r,r*2,r*2);
  }

  function sparkPoint(s: Spark, t: number, x: number, y: number) {
    const drift = (1 - Math.exp(-s.drag*t))/s.drag;
    const dx = s.offset+s.vx*drift;
    const start = s.ricochet ? 279-y : 0;
    const arc = start+s.vy*drift+s.gravity*t*t+Math.sin(t*20+s.offset)*t*8;
    const front = 286-y;
    const bounce = x+dx>291 && x+dx<667 && arc>front;
    return {x:dx,y:bounce?front-10*Math.sin(Math.min(Math.PI,(arc-front)*.062)):arc};
  }

  const metalLight=document.createElement('canvas');
  metalLight.width=320;metalLight.height=230;
  const metalCtx=metalLight.getContext('2d')!;

  function weaponReflection(age: number, x: number, y: number, pose: Pose, force: number) {
    if (age<0 || age>.48) return;
    const radius=34+age*(220+force*85);
    const originX=x-160,originY=y-115;
    metalCtx.clearRect(0,0,320,230);
    drawForgeArt(metalCtx, weapon, weapon.width / weapon.height, { ...pose, x: pose.x - originX, y: pose.y - originY });
    metalCtx.globalCompositeOperation='source-in';
    const shine=metalCtx.createRadialGradient(160,115,0,160,115,radius);
    shine.addColorStop(0,paint(94,.96));shine.addColorStop(.29,paint(85,.8));
    shine.addColorStop(.67,paint(62,.38));shine.addColorStop(1,paint(60,0));
    metalCtx.fillStyle=shine;metalCtx.fillRect(0,0,320,230);
    metalCtx.globalCompositeOperation='source-over';
    ctx.save();ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=[.5,.71,1][force]*(1-ease(age,.06,.48));
    ctx.drawImage(metalLight,originX,originY);ctx.restore();
  }

  function anvilReflection(i: number, age: number, x: number, y: number) {
    if (age < 0 || age > .43) return;
    const strength = [0.23,0.47,0.78][i] * (1-ease(age,.035,.43));
    const spread = [41,86,140][i] + age*106;
    ctx.save();
    ctx.beginPath();ctx.moveTo(305,258);ctx.lineTo(655,258);
    ctx.lineTo(696,299);ctx.lineTo(264,299);ctx.closePath();ctx.clip();
    ctx.globalCompositeOperation='screen';ctx.translate(x,Math.max(y+8,275));ctx.scale(1,.20);
    const reflection=ctx.createRadialGradient(0,0,2,0,0,spread);
    reflection.addColorStop(0,paint(79));reflection.addColorStop(.22,paint(62,.48));
    reflection.addColorStop(.67,paint(53,.15));reflection.addColorStop(1,paint(52,0));
    ctx.globalAlpha=strength;ctx.fillStyle=reflection;
    ctx.fillRect(-spread,-spread,spread*2,spread*2);
    if (i>0 && age<.34) {
      const reach=14+age*(i===2?560:340);
      const edge=ctx.createLinearGradient(-reach,0,reach,0);
      edge.addColorStop(0,paint(57,0));edge.addColorStop(.23,paint(67,.82));
      edge.addColorStop(.48,paint(82,.16));edge.addColorStop(.78,paint(81,.88));edge.addColorStop(1,paint(57,0));
      ctx.globalAlpha=[0,.66,1][i]*(1-ease(age,.055,.34));
      for (const tilt of [.08,-.10]) {
        ctx.save();ctx.rotate(tilt);ctx.strokeStyle=edge;ctx.lineWidth=i===2?5:3;
        ctx.beginPath();ctx.ellipse(0,0,reach,reach*.52,0,.21,Math.PI-.21);ctx.stroke();ctx.restore();
      }
    }
    ctx.restore();
  }

  function impact(i: number, age: number, x: number, y: number, visibility: number) {
    if (age < 0 || age >= 1.05 || visibility <= 0) return;
    ctx.save();
    ctx.translate(x,y);
    for (let j = 0; j <= i; j++) {
      const drift = Math.max(0, age-j*.06);
      const size = 45+drift*(65+i*20);
      ctx.globalAlpha = visibility * ease(drift,.04,.23) * (1-ease(drift,.31,1.04)) * [.36,.64,.92][i];
      ctx.drawImage(haze, j*19-size/2+drift*(22+j*15), -size/2-drift*(41+j*13),size,size);
    }
    ctx.globalCompositeOperation = 'screen';
    const flash = 1-ease(age,0,.17+i*.045);
    if (flash > 0) {
      ctx.save();ctx.rotate(-.19);ctx.scale(1,.35);
      const radius = [42,74,116][i];
      const glow = ctx.createRadialGradient(0,0,1,0,0,radius);
      glow.addColorStop(0,paint(92));glow.addColorStop(.14,paint(72,.73));
      glow.addColorStop(.46,paint(52,.44,-8));glow.addColorStop(1,paint(50,0));
      ctx.globalAlpha = visibility*flash**2*[.52,.73,.94][i];
      ctx.fillStyle=glow;ctx.fillRect(-radius,-radius,radius*2,radius*2);
      ctx.restore();
    }
    if (i === 2 && age < .14) {
      const width = 47 + 56 * ease(age,0,.11);
      ctx.save();ctx.rotate(-.24);ctx.scale(1,.12);
      const core=ctx.createRadialGradient(0,0,1,0,0,width);
      core.addColorStop(0,paint(98));core.addColorStop(.18,paint(80));
      core.addColorStop(.57,paint(59,.27));core.addColorStop(1,paint(59,0));
      ctx.globalAlpha=visibility*(1-ease(age,.034,.14));
      ctx.fillStyle=core;ctx.fillRect(-width,-width,width*2,width*2);
      ctx.restore();
    }
    if (i > 0 && age < .27) {
      const jet = Math.min(1, age/.065);
      const width = [0,73,134][i] * (.45+jet*.55);
      for (const side of [-1,1]) {
        ctx.save();ctx.scale(side,1);ctx.rotate(side===1?-.12:.09);
        const spill=ctx.createLinearGradient(0,0,width,0);
        spill.addColorStop(0,paint(93));spill.addColorStop(.22,paint(80,.88));
        spill.addColorStop(.54,paint(61,.60,-5));spill.addColorStop(1,paint(54,0));
        ctx.globalAlpha=visibility * (1-ease(age,.035,.27)) * (side===1?.93:.73);
        ctx.fillStyle=spill;ctx.beginPath();ctx.moveTo(-3,2);
        ctx.quadraticCurveTo(width*.18,-10-i*2,width,-5-i*2);
        ctx.quadraticCurveTo(width*.4,-1,-3,3);ctx.fill();ctx.restore();
      }
    }
    if (i===2 && age<.39) {
      const rise=ease(age,0,.16), glow=1-ease(age,.13,.39);
      for (let j=0;j<5;j++) {
        const side=j%2===0?1:-1;
        const endX=side*(53+(j%3)*34)*rise;
        const endY=-(82+(j%4)*27)*rise;
        const trail=ctx.createLinearGradient(0,0,endX,endY-1);
        trail.addColorStop(0,paint(95,.96));trail.addColorStop(.18,paint(83,.85));
        trail.addColorStop(.5,paint(67,.55,j*3-5));trail.addColorStop(1,paint(54,0));
        ctx.globalAlpha=visibility*glow*(.87-j*.09);
        ctx.fillStyle=trail;ctx.beginPath();ctx.moveTo(-side*2,1);
        ctx.bezierCurveTo(endX*.10,endY*.42,endX*.64,endY*.63,endX,endY);
        ctx.bezierCurveTo(endX*.72,endY*.59,endX*.26,endY*.36,side*(7+j),1);
        ctx.fill();
      }
    }
    for (const spark of bursts[i]) {
      const t = age-spark.delay;
      if (t <= 0 || t >= spark.life) continue;
      const progress = t/spark.life, head = sparkPoint(spark,t,x,y);
      const tail = sparkPoint(spark,Math.max(0,t-spark.trail),x,y);
      const mid = sparkPoint(spark,Math.max(0,t-spark.trail*.48),x,y);
      const dx = head.x-tail.x, dy = head.y-tail.y, distance = Math.hypot(dx,dy);
      ctx.globalAlpha = visibility * (1-progress)**.88;
      const hot = progress < .25 ? paint(90) : progress < .57 ? paint(72) : paint(54,1,-8);
      if (distance > 1 && !spark.chip) {
        const wx = -dy/distance*spark.width, wy = dx/distance*spark.width;
        const ribbon = ctx.createLinearGradient(tail.x,tail.y,head.x,head.y);
        ribbon.addColorStop(0,paint(56,0));ribbon.addColorStop(.55,paint(61,.63,-5));ribbon.addColorStop(1,hot);
        ctx.fillStyle=ribbon;ctx.beginPath();ctx.moveTo(tail.x,tail.y);
        ctx.quadraticCurveTo(mid.x+wx*.69,mid.y+wy*.69,head.x+wx*.21,head.y+wy*.21);
        ctx.quadraticCurveTo(head.x+dx/distance*1.8,head.y+dy/distance*1.8,head.x-wx*.27,head.y-wy*.27);
        ctx.quadraticCurveTo(mid.x-wx*.42,mid.y-wy*.42,tail.x,tail.y);ctx.fill();
      } else {
        ctx.save();ctx.translate(head.x,head.y);ctx.rotate(t*spark.turn);
        const size = spark.width*(.63+.37*Math.cos(t*spark.turn*1.9)**2);
        ctx.fillStyle=hot;ctx.beginPath();ctx.moveTo(-size,0);ctx.lineTo(size*.21,-size*.58);
        ctx.lineTo(size,size*.18);ctx.lineTo(0,size*.57);ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  return { impact, anvilReflection, weaponReflection };
}
