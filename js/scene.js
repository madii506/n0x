/* n0x hero: a corridor of app windows floating over black glass. The camera flies in on the intro, drifts with the
   mouse, and walks down the corridor as you scroll. */
import * as THREE from '/vendor/three.module.min.js';

const LAYOUT = [ // texture, x, depth, bottom, width, side (-1 left wall, 1 right wall)
  ['order', -1.42, 0.25, 0.05, 0.60, -1], ['positions', -1.50, 0.95, 0.62, 1.05, -1], ['pos_eth', -1.60, 2.15, 0.06, 0.92, -1], ['tracker', -1.30, 3.45, 0.74, 0.95, -1],
  ['pos_btc', 1.42, 0.25, 0.06, 0.92, 1], ['chart', 1.54, 0.95, 0.62, 1.10, 1], ['route', 1.60, 2.25, 0.06, 1.00, 1], ['account', 1.30, 3.45, 0.74, 0.92, 1],
];
const ASPECT = { order: 980 / 760, positions: 720 / 1150, pos_eth: 600 / 1000, tracker: 640 / 900, pos_btc: 600 / 1000, chart: 760 / 1200, route: 700 / 1100, account: 640 / 900 };

export async function createScene(canvas, { mobile }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.setSize(innerWidth, innerHeight, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050506); scene.fog = new THREE.FogExp2(0x050506, 0.085);
  const cam = new THREE.PerspectiveCamera(mobile ? 58 : 40, innerWidth / innerHeight, 0.05, 90);
  const loader = new THREE.TextureLoader();
  const names = [...new Set(LAYOUT.map(l => l[0]))];
  const tex = {};
  await Promise.all(names.map(n => new Promise(r => loader.load(`/img/w-${n}.webp`, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; tex[n] = t; r(); }, undefined, () => r()))));

  const wins = [];
  const reps = mobile ? 2 : 4;
  for (let rep = 0; rep < reps; rep++) {
    LAYOUT.forEach(([n, x, d, b, w, side], i) => {
      if (!tex[n]) return;
      const h = w * ASPECT[n];
      const geo = new THREE.PlaneGeometry(w, h);
      const m = new THREE.MeshBasicMaterial({ map: tex[n], transparent: true, fog: true });
      const mesh = new THREE.Mesh(geo, m);
      const z = -(d + rep * 4.6) + 0.0, xx = x * (mobile ? 0.72 : Math.max(1, Math.min(1.45, innerWidth / innerHeight / 1.2))) + (rep % 2 ? side * 0.12 : 0);
      mesh.position.set(xx, b + h / 2, z); mesh.rotation.y = -side * 0.52; mesh.renderOrder = 3;
      const rm = new THREE.MeshBasicMaterial({ map: tex[n], transparent: true, opacity: 0.16, depthWrite: false, fog: true });
      const ref = new THREE.Mesh(geo, rm); ref.scale.y = -1; ref.position.set(xx, -(b + h / 2), z); ref.rotation.y = mesh.rotation.y; ref.renderOrder = 1;
      scene.add(mesh, ref); wins.push({ mesh, ref, y: b + h / 2, ph: i * 1.7 + rep });
    });
  }
  // black glass with a grid of hairlines that fades into the fog
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uCam: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uCam; varying vec3 vW;
      float ln(float c){ float f = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-4); return 1.0 - min(f, 1.0); }
      void main(){ vec2 p = vW.xz * 2.0; float g = max(ln(p.x), ln(p.y)); float d = length(vW.xz - uCam.xz);
        float fade = exp(-d * 0.11); vec3 col = vec3(0.72, 0.78, 0.9) * g * 0.16 * fade;
        gl_FragColor = vec4(col + vec3(0.0196, 0.0196, 0.0235) * 0.0, 0.86); }`,
  }));
  floor.rotation.x = -Math.PI / 2; floor.renderOrder = 2; scene.add(floor);

  // camera: intro flight, hero pose, scroll walk, mouse drift
  const HERO = new THREE.Vector3(0, 0.56, mobile ? 6.2 : 5.0), START = new THREE.Vector3(0, 2.4, 16);
  let introK = 0, introT0 = -1, scrollK = 0, mx = 0, my = 0, sx = 0, sy = 0, running = true, last = performance.now(), time = 0;
  const look = new THREE.Vector3();
  cam.position.copy(START);
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth * 2 - 1; my = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
  const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    if (introT0 >= 0) introK = Math.min(1, (now - introT0) / 2600);
    sx += (mx - sx) * 0.04; sy += (my - sy) * 0.04;
    const k = ease(introK);
    cam.position.lerpVectors(START, HERO, k);
    cam.position.z -= scrollK * 3.2; cam.position.y += scrollK * 0.25;
    cam.position.x += sx * 0.22 * k; cam.position.y += -sy * 0.1 * k;
    look.set(sx * 0.1, 0.56 - (1 - k) * 0.3 + scrollK * 0.1, cam.position.z - 6);
    cam.lookAt(look);
    for (const w of wins) { const o = Math.sin(time * 0.6 + w.ph) * 0.018; w.mesh.position.y = w.y + o; w.ref.position.y = -(w.y + o); }
    floor.material.uniforms.uCam.value.copy(cam.position);
    renderer.render(scene, cam);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    intro() { if (introT0 < 0) introT0 = performance.now(); },
    get cam() { return [cam.position.x, cam.position.y, cam.position.z, introK, scrollK]; },
    setScroll(k) { scrollK = Math.max(0, Math.min(1.2, k)); },
    pause(p) { if (p && running) { running = false; } else if (!p && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); } },
  };
}
