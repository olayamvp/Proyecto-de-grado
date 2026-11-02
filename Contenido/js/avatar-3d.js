import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildBody, normalizeProfile } from './avatar-cuerpo.js';
import { buildGarments, armClearance, rolesFor, cachedLook, loadLook, fallbackLook } from './avatar-prendas.js';

const host = document.getElementById('avatarCanvas');
if (!host) throw new Error('No se encontró el área del avatar.');
const status = document.getElementById('avatarStatus');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
host.replaceChildren(renderer.domElement);
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.setAttribute('aria-label', 'Avatar 3D. Arrastra para girarlo y usa la rueda o el gesto de pellizco para acercarlo.');

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b3a6, 0.55));
const keyLight = new THREE.DirectionalLight(0xfff1e0, 1.9);
keyLight.position.set(-1.6, 3.2, 2.4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -1.2; keyLight.shadow.camera.right = 1.2;
keyLight.shadow.camera.top = 2.4; keyLight.shadow.camera.bottom = -0.2;
keyLight.shadow.normalBias = 0.02;
keyLight.shadow.radius = 4;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xdfe9ff, 1.1);
rimLight.position.set(2, 2.2, -2.4);
scene.add(rimLight);

// Soft contact shadow under the feet plus a light-only floor for the key shadow.
const blob = document.createElement('canvas');
blob.width = blob.height = 128;
const blobCtx = blob.getContext('2d');
const gradient = blobCtx.createRadialGradient(64, 64, 4, 64, 64, 64);
gradient.addColorStop(0, 'rgba(30,32,26,0.42)'); gradient.addColorStop(1, 'rgba(30,32,26,0)');
blobCtx.fillStyle = gradient; blobCtx.fillRect(0, 0, 128, 128);
const contact = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blob), transparent: true, depthWrite: false }));
contact.rotation.x = -Math.PI / 2;
contact.position.y = 0.001;
scene.add(contact);
const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.ShadowMaterial({ opacity: 0.12 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const avatar = new THREE.Group();
scene.add(avatar);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 0.45;
controls.maxDistance = 6;
controls.minPolarAngle = 0.25;
controls.maxPolarAngle = Math.PI * 0.82;

// ---- Camera framing: whole body or close-up of the face ----
let rig = null;
let focus = 'body';
let tween = null;
function framing(mode) {
  if (!rig) return null;
  if (mode === 'face') {
    const center = rig.head.center;
    return { target: new THREE.Vector3(0, center.y - 0.01, 0), position: new THREE.Vector3(0, center.y + 0.02, 0.85) };
  }
  const fitDistance = (rig.top * 0.58) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect * 1.6);
  return { target: new THREE.Vector3(0, rig.top * 0.5, 0), position: new THREE.Vector3(0, rig.top * 0.56, Math.max(2.2, fitDistance)) };
}
function moveCamera(mode, instant = false) {
  focus = mode;
  const goal = framing(mode);
  if (!goal) return;
  // Keep the angle the user chose, only change distance and height.
  const direction = camera.position.clone().sub(controls.target).setY(0);
  if (direction.lengthSq() > 1e-4 && !instant) {
    direction.normalize();
    const flat = Math.hypot(goal.position.z - goal.target.z, 0);
    goal.position.set(goal.target.x + direction.x * flat, goal.position.y, goal.target.z + direction.z * flat);
  }
  if (instant) { controls.target.copy(goal.target); camera.position.copy(goal.position); controls.update(); tween = null; return; }
  tween = { from: { target: controls.target.clone(), position: camera.position.clone() }, to: goal, start: performance.now(), duration: 650 };
}
controls.addEventListener('start', () => { tween = null; });
window.addEventListener('clothes:avatar-focus', event => moveCamera(event.detail === 'face' ? 'face' : 'body'));

// ---- Building ----
let current = { profile: normalizeProfile(), garments: [] };
let buildToken = 0;
function dispose(object) {
  object.traverse(child => {
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    for (const material of materials) { material.map?.dispose(); material.dispose(); }
  });
}
function garmentItems(products) {
  const describe = window.NOVUM_PRENDAS?.spec || (() => null);
  return products.map(product => ({ product, spec: describe(product) })).filter(item => item.spec);
}
function render(state) {
  const items = garmentItems(state.garments).map(item => ({
    ...item,
    looks: Object.fromEntries(rolesFor(item.spec).map(role => [role, cachedLook(item.product, role) || fallbackLook(item.product)])),
  }));
  const profile = normalizeProfile(state.profile);
  const H = profile.height / 100;
  const built = buildBody(profile, { armClearance: armClearance(items.map(item => item.spec), H) });
  const clothes = buildGarments(built.rig, items);
  const previous = [...avatar.children];
  for (const child of previous) { avatar.remove(child); dispose(child); }
  avatar.add(built.group, clothes);
  const firstBuild = !rig;
  const heightChanged = rig && Math.abs(rig.top - built.rig.top) > 0.005;
  rig = built.rig;
  contact.scale.set(1 + (rig.bmi - 22) * 0.02, 1, 1 + (rig.bmi - 22) * 0.025);
  if (firstBuild) moveCamera('body', true);
  else if (heightChanged && focus === 'body' && !tween) moveCamera('body');
}
async function update(state) {
  current = state;
  const token = ++buildToken;
  render(state);
  const pending = garmentItems(state.garments).flatMap(item => rolesFor(item.spec).filter(role => !cachedLook(item.product, role)).map(role => loadLook(item.product, role)));
  if (!pending.length) { if (status) status.textContent = ''; return; }
  if (status) status.textContent = 'Cargando la foto de la prenda…';
  await Promise.allSettled(pending);
  if (token !== buildToken) return;
  render(current);
  if (status) status.textContent = '';
}

function resize() {
  const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);
resize();

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
window.addEventListener('clothes:avatar-updated', event => update({ profile: event.detail?.profile, garments: event.detail?.garments || [] }));
update({ profile: read('clothes.profile', {}), garments: [] });

// ---- Idle life: blinking and a slight sway ----
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let nextBlink = performance.now() + 2500;
function animate(now) {
  requestAnimationFrame(animate);
  if (tween) {
    const k = Math.min(1, (now - tween.start) / tween.duration);
    const ease = 1 - (1 - k) ** 3;
    controls.target.lerpVectors(tween.from.target, tween.to.target, ease);
    camera.position.lerpVectors(tween.from.position, tween.to.position, ease);
    if (k >= 1) tween = null;
  }
  if (rig && !reduceMotion) {
    const blinkTime = now - nextBlink;
    const closed = blinkTime > 0 && blinkTime < 140 ? Math.sin((blinkTime / 140) * Math.PI) : 0;
    for (const eye of rig.eyes) eye.scale.y = Math.max(0.08, (eye.userData.open ??= eye.scale.y) * (1 - closed));
    if (blinkTime > 140) nextBlink = now + 2200 + Math.random() * 3200;
    avatar.rotation.y = Math.sin(now / 2600) * 0.025;
  }
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
