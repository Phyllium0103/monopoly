import './portrait-flames.css';

export interface FlameSource {
  id: string;
  /** 火焰層數：1 主火舌、2 加後層暗焰、3 再加高溫內焰 */
  layers: number;
  /** 頭像圖片，用來取得火焰的位置與大小 */
  img: HTMLElement;
  /** 頭像右上角有 ✨：火焰要避開，否則神通提示會被蓋住 */
  badge: boolean;
}

interface Flame extends FlameSource {
  offset: number;
  speed: number;
  x: number;
  y: number;
  radius: number;
}

/** 畫質上限：火焰本身很柔，高解析度看不出差別，只會增加負擔 */
const MAX_PIXEL_RATIO = 1.5;
const NORMAL_INTERVAL = 1000 / 30;
const SLOW_INTERVAL = 1000 / 15;
/** 瀏覽器平均每幀超過這個時間就代表電腦吃緊，火焰主動降到 15 fps */
const SLOW_FRAME_MS = 28;

/** 每個頭像只畫這個範圍（單位：頭像直徑），其餘像素完全不用計算 */
const QUAD_LOW = [-0.72, -0.62];
const QUAD_HIGH = [0.72, 1];

const VERTEX = `
attribute vec2 corner;
uniform vec2 center, unit;
varying vec2 p;
void main(){
  p = mix(vec2(${QUAD_LOW.join(',')}), vec2(${QUAD_HIGH.join(',')}), corner);
  gl_Position = vec4(center + p * unit, 0., 1.);
}`;

const FRAGMENT = `precision highp float;
uniform float t;
uniform int layers;
uniform float badge;
varying vec2 p;
const float R = .5;
const vec3 C0 = vec3(.478, .078, .031), C1 = vec3(.878, .251, .047), C2 = vec3(1., .604, .122), C3 = vec3(1., .914, .627);

float hash(vec3 q){ q = fract(q * .3183099 + .1); q *= 17.; return fract(q.x * q.y * q.z * (q.x + q.y + q.z)); }
float noise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 q){ float a = .5, s = 0.; for (int i = 0; i < 3; i++) { s += a * noise(q); q = q * 2.03 + 7.1; a *= .5; } return s; }
vec4 ramp(float k){
  vec3 c = k < .33 ? mix(C0, C1, k / .33) : k < .66 ? mix(C1, C2, (k - .33) / .33) : mix(C2, C3, (k - .66) / .34);
  float a = smoothstep(.03, .11, k);
  return vec4(c * a, a);
}
vec4 over(vec4 top, vec4 under){ return top + under * (1. - top.a); }

// 一層火舌：一律往上流，長度集中在頭頂，兩側只留貼邊短焰
float tongues(float up, float freq, float speed, float len, float stretch, float seed){
  float sway = (noise(vec3(p * 1.6, t * .55 + seed)) - .5) * .16 * clamp(p.y + .2, 0., 1.);
  float x = p.x + sway;
  float dome = length(vec2(x * 1.03, p.y > 0. ? p.y * stretch : p.y)) - R;
  vec2 s = vec2(x * freq, p.y * freq * .24 - t * speed);
  float f = fbm(vec3(s, seed));
  float ridge = 1. - abs(2. * noise(vec3(s * vec2(1.7, 1.), seed + 3.)) - 1.);
  float reach = (.02 + .022 * up + len * up * up * up) * (.3 + 2.2 * f * f + 1.3 * ridge * ridge * ridge);
  return clamp(1. - dome / reach, 0., 1.);
}
vec4 fire(float up){
  float top = 1. - smoothstep(.88, .98, p.y);
  float km = tongues(up, 7.6, 1.9, .105, .95, 0.) * top;
  float grain = noise(vec3(p.x * 15., p.y * 3.2 - t * 2.5, 5.));
  float fiber = 1. - abs(2. * grain - 1.);
  vec4 c = ramp(clamp(pow(km, 1.4) + (fiber - .55) * .3 * km, 0., 1.));
  if (layers >= 2) {
    float kb = tongues(up, 6.4, 1.2, .165, .85, 11.) * top;
    vec3 cb = mix(C0, mix(C0, C1, .72), smoothstep(.08, .6, kb));
    float ab = smoothstep(.02, .09, kb) * .92;
    c = over(c, vec4(cb * ab, ab));
  }
  if (layers >= 3) {
    float ki = tongues(up, 10., 3., .085, .98, 23.);
    float ai = smoothstep(.06, .3, ki);
    c = over(vec4(mix(C2, C3, smoothstep(.3, .85, ki)) * ai, ai), c);
  }
  return c;
}
// 熔金邊框，加上繞到頭像邊緣前方的火苗（越靠下越長，不會遮到臉）
vec4 rim(vec2 n, float d, float up){
  float flow = fbm(vec3(n * 1.7, t * .9));
  float band = 1. - smoothstep(.017, .024, abs(d + .018));
  vec4 border = vec4(mix(C2, C3, smoothstep(.34, .62, flow) * .75) * band, band);
  float f = fbm(vec3(n * 5.2 + 40., d * 2. - t * 2.1));
  float g = noise(vec3(n * 12., t * 2.6));
  float reach = (.01 + .055 * (1. - up) * (1. - up)) * (.2 + 3. * f * f + g);
  float k = clamp(1. + d / reach, 0., 1.) * (1. - smoothstep(-.02, 0., d));
  float a = smoothstep(.08, .42, k);
  return over(border, vec4(mix(C1, C3, smoothstep(.3, 1., k)) * a, a));
}
float sparks(){
  float s = 0.;
  for (int i = 0; i < 5; i++) {
    float fi = float(i), clock = t * (.55 + .09 * fi) + fi * .37;
    float life = fract(clock);
    float x = (hash(vec3(floor(clock), fi, 2.)) - .5) * .62 + sin(t * 4. + fi) * .02 * life;
    float size = mix(.02, .008, life);
    s += (1. - smoothstep(size * .4, size, length(p - vec2(x, .55 + .38 * life)))) * (1. - life * life);
  }
  return min(s, 1.);
}
void main(){
  float r = length(p), d = r - R;
  // 頭像中央沒有任何東西，直接跳過，大部分像素在這裡就結束
  if (d < -.14) { gl_FragColor = vec4(0.); return; }
  vec2 n = p / r;
  float up = .5 + .5 * n.y;
  vec4 c = vec4(0.);
  if (d > -.012) {
    c = fire(up) * smoothstep(-.012, 0., d);
    float halo = exp(-max(d, 0.) * 15.) * .3 * (.35 + .65 * up) * (1. - smoothstep(.06, .12, d));
    c = over(c, vec4(C1 * halo, halo));
    if (p.y > .4) { float s = sparks(); c = over(vec4(C2 * s, s), c); }
  }
  c = over(rim(n, d, up), c);
  if (badge > 0.) c *= smoothstep(.1, .16, length(p - vec2(.41, .41)));   // 神通 ✨ 的位置
  gl_FragColor = c;
}`;

/**
 * 頭像火焰：整排頭像共用一張畫布與一個 WebGL context，每位武將只畫一小塊範圍。
 * 畫布掛在不捲動的外層，火焰才不會被頭像列裁掉；捲動時跟著頭像移動，並在頭像列邊緣裁切。
 * 沒有火焰時完全停止繪製；每位武將有自己的起始時間與流速，不會一起動。
 */
export class PortraitFlames {
  private readonly canvas = document.createElement('canvas');
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** 依武將記住起始時間，頭像重建時火焰才不會跳動 */
  private readonly timing = new Map<string, { offset: number; speed: number }>();
  private flames: Flame[] = [];
  private gl: WebGLRenderingContext | null = null;
  private glFailed = false;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private handle = 0;
  private lastTick = 0;
  private lastDraw = 0;
  private averageGap = NORMAL_INTERVAL / 2;
  private clipLeft = 0;
  private clipRight = 0;

  constructor(private readonly shell: HTMLElement, private readonly dock: HTMLElement) {
    this.canvas.className = 'pd-flames';
    this.canvas.hidden = true;
    shell.append(this.canvas);
    const resize = new ResizeObserver(() => this.relayout());
    resize.observe(shell);
    resize.observe(dock);
    dock.addEventListener('scroll', () => this.relayout(), { passive: true });
    addEventListener('resize', () => this.relayout(), { passive: true });
  }

  /** 更新正在燃燒的頭像；頭像重建或狀態改變時呼叫 */
  sync(sources: FlameSource[]) {
    this.flames = sources.map((s) => ({ ...s, ...this.timingOf(s.id), x: 0, y: 0, radius: 0 }));
    this.canvas.hidden = !this.flames.length;
    if (!this.flames.length) {
      cancelAnimationFrame(this.handle);
      this.handle = 0;
      return;
    }
    if (!this.ensureGl()) return;
    this.shell.classList.add('flames-on');
    this.relayout();
    if (!this.reducedMotion && !this.handle) {
      this.lastTick = performance.now();
      this.handle = requestAnimationFrame(this.tick);
    }
  }

  private timingOf(id: string) {
    let t = this.timing.get(id);
    if (!t) {
      t = { offset: Math.random() * 600, speed: 0.92 + Math.random() * 0.16 };
      this.timing.set(id, t);
    }
    return t;
  }

  private ensureGl(): boolean {
    if (this.gl) return true;
    if (this.glFailed) return false;
    const gl = this.canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power',
    });
    const program = gl?.createProgram();
    if (!gl || !program) { this.glFailed = true; return false; }
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.bindAttribLocation(program, 0, 'corner');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('頭像火焰 shader 編譯失敗', gl.getProgramInfoLog(program));
      this.glFailed = true;
      return false;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const name of ['t', 'layers', 'badge', 'center', 'unit']) this.uniforms[name] = gl.getUniformLocation(program, name);
    gl.enable(gl.BLEND);
    gl.enable(gl.SCISSOR_TEST);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    this.gl = gl;
    return true;
  }

  /** 位置只在版面改變時量一次，每幀不碰 DOM */
  private relayout() {
    if (!this.gl || !this.flames.length) return;
    const box = this.canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.max(1, Math.round(box.width * ratio));
    const height = Math.max(1, Math.round(box.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
    const dock = this.dock.getBoundingClientRect();
    this.clipLeft = Math.max(0, Math.round((dock.left - box.left) * ratio));
    this.clipRight = Math.min(width, Math.round((dock.right - box.left) * ratio));
    this.gl.scissor(this.clipLeft, 0, Math.max(0, this.clipRight - this.clipLeft), height);
    for (const f of this.flames) {
      const r = f.img.getBoundingClientRect();
      f.x = (r.left + r.width / 2 - box.left) * ratio;
      f.y = (r.top + r.height / 2 - box.top) * ratio;
      f.radius = (r.width / 2) * ratio;
    }
    this.draw(performance.now());
  }

  private tick = (now: number) => {
    this.handle = requestAnimationFrame(this.tick);
    const gap = now - this.lastTick;
    this.lastTick = now;
    if (gap < 250) this.averageGap += (gap - this.averageGap) * 0.05;   // 忽略切換分頁造成的長間隔
    const interval = this.averageGap > SLOW_FRAME_MS ? SLOW_INTERVAL : NORMAL_INTERVAL;
    if (now - this.lastDraw >= interval - 2) this.draw(now);
  };

  private draw(now: number) {
    const gl = this.gl;
    if (!gl) return;
    this.lastDraw = now;
    const { width, height } = this.canvas;
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const f of this.flames) {
      if (f.x + f.radius * 1.5 < this.clipLeft || f.x - f.radius * 1.5 > this.clipRight) continue;   // 捲到畫面外
      gl.uniform1f(this.uniforms.t, ((now / 1000) * f.speed + f.offset) % 3600);
      gl.uniform1i(this.uniforms.layers, f.layers);
      gl.uniform1f(this.uniforms.badge, f.badge ? 1 : 0);
      gl.uniform2f(this.uniforms.center, (f.x / width) * 2 - 1, 1 - (f.y / height) * 2);
      gl.uniform2f(this.uniforms.unit, (f.radius * 4) / width, (f.radius * 4) / height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
}
