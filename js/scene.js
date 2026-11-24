/* n0x world: a long corridor of app windows floating over black glass. The camera flies in on the intro, then walks the
   whole corridor as you scroll the page; windows lean with your scroll speed and dust drifts through the light. */
import * as THREE from '/vendor/three.module.min.js';

const LAYOUT = [ // texture, x, depth, bottom, width, side (-1 left wall, 1 right wall)
  ['order', -1.42, 0.25, 0.05, 0.60, -1], ['positions', -1.50, 0.95, 0.62, 1.05, -1], ['pos_eth', -1.60, 2.15, 0.06, 0.92, -1], ['tracker', -1.30, 3.45, 0.74, 0.95, -1],
  ['pos_btc', 1.42, 0.25, 0.06, 0.92, 1], ['chart', 1.54, 0.95, 0.62, 1.10, 1], ['route', 1.60, 2.25, 0.06, 1.00, 1], ['account', 1.30, 3.45, 0.74, 0.92, 1],
];
const ASPECT = { order: 980 / 760, positions: 720 / 1150, pos_eth: 600 / 1000, tracker: 640 / 900, pos_btc: 600 / 1000, chart: 760 / 1200, route: 700 / 1100, account: 640 / 900 };
const SPAN = 4.6;

export async function createScene(canvas, { mobile }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.setSize(innerWidth, innerHeight, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050506); scene.fog = new THREE.FogExp2(0x050506, 0.085);
  const FOV = mobile ? 58 : 40;
  const cam = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.05, 90);
  const loader = new THREE.TextureLoader(), tex = {};
  await Promise.all([...new Set(LAYOUT.map(l => l[0]))].map(n => new Promise(r => loader.load(`/img/w-${n}.webp?v=2`, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; tex[n] = t; r(); }, undefined, () => r()))));

  const wins = [], reps = mobile ? 5 : 10;
  const spread = () => mobile ? 0.72 : Math.max(1, Math.min(1.45, innerWidth / innerHeight / 1.2));
  for (let rep = 0; rep < reps; rep++) {
    LAYOUT.forEach(([n, x, d, b, w, side], i) => {
      if (!tex[n]) return;
      const k = (rep * 8 + i) * 0.618, h = w * ASPECT[n];
      const geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex[n], transparent: true, fog: true }));
      const ref = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex[n], transparent: true, opacity: 0.16, depthWrite: false, fog: true }));
      const bx = x + (rep % 2 ? side * 0.14 : 0) + Math.sin(k * 7) * 0.08, y = b + h / 2 + (rep % 3 === 2 ? 0.12 : 0), z = -(d + rep * SPAN);
      const ry = -side * (0.52 + Math.sin(k * 3) * 0.08);
      mesh.renderOrder = 3; ref.renderOrder = 1; ref.scale.y = -1;
      scene.add(mesh, ref); wins.push({ mesh, ref, bx, y, z, ry, side, ph: k * 5 });
    });
  }
  // dust in the light
  const N = mobile ? 380 : 900, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 7; pos[i * 3 + 1] = Math.random() * 2.6; pos[i * 3 + 2] = 6 - Math.random() * (reps * SPAN + 12); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xc9d2e0, size: mobile ? 0.018 : 0.012, transparent: true, opacity: 0.55, depthWrite: false, fog: true }));
  scene.add(dust);
  // black glass with a grid of hairlines
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uCam: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uCam; varying vec3 vW;
      float ln(float c){ float f = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-4); return 1.0 - min(f, 1.0); }
      void main(){ vec2 p = vW.xz * 2.0; float g = max(ln(p.x), ln(p.y)); float d = length(vW.xz - uCam.xz);
        gl_FragColor = vec4(vec3(0.72, 0.78, 0.9) * g * 0.16 * exp(-d * 0.11), 0.86); }`,
  }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -60; floor.renderOrder = 2; scene.add(floor);

  const HERO = new THREE.Vector3(0, 0.56, mobile ? 6.2 : 5.0), START = new THREE.Vector3(0, 0.9, 13.5);
  const TRAVEL = reps * SPAN - 6;
  let introK = 0, introT0 = -1, prog = 0, progS = 0, vel = 0, velS = 0, mx = 0, my = 0, sx = 0, sy = 0, last = performance.now(), time = 0;
  const look = new THREE.Vector3();
  cam.position.copy(START);
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth * 2 - 1; my = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
  const ease = x => 1 - Math.pow(1 - x, 4);
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    if (introT0 >= 0) introK = Math.min(1, (now - introT0) / 2400);
    sx += (mx - sx) * 0.04; sy += (my - sy) * 0.04;
    progS += (prog - progS) * 0.08; velS += (vel - velS) * 0.1; vel *= 0.9;
    const k = ease(introK), walk = progS * TRAVEL;
    cam.position.lerpVectors(START, HERO, k);
    cam.position.z -= walk; cam.position.x += Math.sin(walk * 0.22) * 0.35 * progS + sx * 0.22 * k; cam.position.y += -sy * 0.1 * k + Math.sin(walk * 0.31) * 0.08;
    look.set(sx * 0.1 + Math.sin(walk * 0.22 + 0.6) * 0.3 * progS, 0.56 - (1 - k) * 0.2, cam.position.z - 6);
    cam.lookAt(look); cam.rotation.z += Math.sin(walk * 0.17) * 0.02 * progS;
    const f = FOV + Math.min(12, Math.abs(velS) * 0.25); if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
    const sp = spread(), lean = Math.max(-0.5, Math.min(0.5, velS * 0.012));
    for (const w of wins) {
      const o = Math.sin(time * 0.6 + w.ph) * 0.018;
      w.mesh.position.set(w.bx * sp, w.y + o, w.z); w.mesh.rotation.set(lean * 0.4, w.ry - w.side * lean, 0);
      w.ref.position.set(w.bx * sp, -(w.y + o), w.z); w.ref.rotation.set(-lean * 0.4, w.ry - w.side * lean, 0);
    }
    dust.position.z = (time * 0.12) % 2; dust.rotation.y = Math.sin(time * 0.05) * 0.04;
    floor.material.uniforms.uCam.value.copy(cam.position);
    renderer.render(scene, cam);
  }
  requestAnimationFrame(frame);
  return {
    intro() { if (introT0 < 0) introT0 = performance.now(); },
    setScroll(p) { prog = Math.max(0, Math.min(1, p)); },
    setVel(v) { vel = v; },
    get cam() { return [cam.position.x, cam.position.y, cam.position.z, introK, prog]; },
    pause() { },
  };
}
