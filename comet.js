const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const canvas = document.getElementById('sky');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function fallback() {
  document.body.classList.add('no-webgl');
}

function glowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,248,220,1)');
  grad.addColorStop(0.25, 'rgba(232,194,106,0.85)');
  grad.addColorStop(1, 'rgba(232,194,106,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeStars(THREE, count) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const white = new THREE.Color('#f5efe4'), gold = new THREE.Color('#e8c26a'), rose = new THREE.Color('#c0394f');
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 900;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 900;
    pos[i * 3 + 2] = -Math.random() * 1200 + 150;
    const r = Math.random();
    const c = r < 0.8 ? white : r < 0.95 ? gold : rose;
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 1.8, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  return new THREE.Points(geo, mat);
}

function makeComet(THREE, tex) {
  const group = new THREE.Group();
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  head.scale.set(28, 28, 1);
  group.add(head);

  const n = 700;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const gold = new THREE.Color('#f6e3a8'), red = new THREE.Color('#8e1b2e');
  for (let i = 0; i < n; i++) {
    const t = Math.pow(Math.random(), 1.6);          // denser near the head
    const len = t * 170;
    const spread = 2 + t * 26;
    pos[i * 3] = len;                                 // tail points along +x, rotated below
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
    const c = gold.clone().lerp(red, t);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tail = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 2.6, map: tex, vertexColors: true, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  group.add(tail);
  group.rotation.z = -0.45;                           // tail streams up-right
  return { group, head };
}

function start(THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);

  const small = window.innerWidth < 700;
  const stars = makeStars(THREE, small ? 1200 : 3000);
  stars.material.size = 1.3;
  stars.material.opacity = 0.7;
  scene.add(stars);
  const comet = makeComet(THREE, glowTexture(THREE));
  comet.group.position.set(-40, 30, -420);
  scene.add(comet.group);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // The comet drifts closer as the audition nears (days elapsed in the plan),
  // with only a small nudge from scrolling so the sky stays calm behind the content.
  const plan = window.PLAN;
  const dayIndex = plan ? Math.max(0, plan.days.findIndex(d => d.date === window.Logic.focusDate(plan, new Date()))) : 0;
  const base = plan ? dayIndex / (plan.days.length - 1) : 0;
  function scrollProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const s = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    return Math.min(1, base * 0.85 + s * 0.15);
  }

  let p = scrollProgress();
  function frame(t) {
    camera.position.set(Math.sin(p * Math.PI) * 12, -p * 20, 120 - p * 420);  // fly toward the comet
    camera.lookAt(comet.group.position.x * 0.3, comet.group.position.y * 0.3, comet.group.position.z);
    const s = 28 + p * 22 + Math.sin(t * 0.002) * 1.5;                          // brighter as audition nears
    comet.head.scale.set(s, s, 1);
    stars.rotation.z = t * 0.00002;
    renderer.render(scene, camera);
  }

  resize();
  window.addEventListener('resize', () => { resize(); if (reduceMotion) frame(0); });

  if (reduceMotion) {
    p = scrollProgress();   // single still frame
    frame(0);
  } else {
    let rafId = 0;
    const loop = t => {
      p += (scrollProgress() - p) * 0.08;
      frame(t);
      rafId = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(rafId);
      if (!document.hidden) rafId = requestAnimationFrame(loop);
    });
    rafId = requestAnimationFrame(loop);
  }
  document.body.classList.add('sky-ready');
}

// Loaded as a classic script: Chrome blocks <script type="module"> on file:// pages,
// but a dynamic import() of the CORS-enabled CDN still works there.
import(THREE_URL)
  .then(start)
  .catch(e => {
    console.warn('Comet sky disabled:', e);
    fallback();
  });
