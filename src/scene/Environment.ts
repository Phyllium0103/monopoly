import * as THREE from 'three';

/** 天空、光照、霧、雲 */
export class Environment {
  private clouds: THREE.Group[] = [];

  constructor(private scene: THREE.Scene) {
    scene.background = new THREE.Color(0xc9dde8);
    scene.fog = new THREE.Fog(0xc9dde8, 90, 190);

    const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x6b5a3a, 1.3);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    sun.position.set(-40, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -75;
    s.right = 75;
    s.top = 65;
    s.bottom = -65;
    s.near = 10;
    s.far = 200;
    sun.shadow.bias = -0.0008;
    scene.add(sun);

    this.addSky();
    this.addClouds();
  }

  private addSky() {
    const geo = new THREE.SphereGeometry(400, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x7fb2d9) },
        bottom: { value: new THREE.Color(0xe8eef0) },
      },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
        void main(){ float h = clamp(normalize(vPos).y * 1.6 + 0.1, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }`,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
  }

  private addClouds() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, roughness: 1, flatShading: true });
    const geo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const puffs = 4 + Math.floor(Math.random() * 4);
      for (let j = 0; j < puffs; j++) {
        const m = new THREE.Mesh(geo, mat);
        const r = 1.5 + Math.random() * 2;
        m.scale.set(r * 1.4, r * 0.7, r);
        m.position.set((j - puffs / 2) * 2 + Math.random(), Math.random() * 0.8, Math.random() * 2 - 1);
        g.add(m);
      }
      g.position.set(Math.random() * 140 - 70, 24 + Math.random() * 8, Math.random() * 110 - 55);
      g.userData.speed = 0.6 + Math.random() * 0.8;
      this.clouds.push(g);
      this.scene.add(g);
    }
  }

  update(dt: number) {
    for (const c of this.clouds) {
      c.position.x += dt * c.userData.speed;
      if (c.position.x > 80) c.position.x = -80;
    }
  }
}
