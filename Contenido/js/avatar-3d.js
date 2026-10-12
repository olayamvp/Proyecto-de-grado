import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const host = document.getElementById('avatarCanvas');
if (!host) throw new Error('No se encontró el área del avatar.');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf9f9f8);
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
camera.position.set(0, 1.8, 6.2);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
host.replaceChildren(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Avatar 3D. Arrastra para rotarlo y usa la rueda o el gesto de pellizco para acercarlo.');

scene.add(new THREE.HemisphereLight(0xffffff, 0x969184, 2.1));
const keyLight = new THREE.DirectionalLight(0xfff3df, 3.1);
keyLight.position.set(-3.5, 5, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xdbe8ff, 1.4);
fillLight.position.set(3, 2.5, -2);
scene.add(fillLight);
const ground = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), new THREE.MeshStandardMaterial({ color: 0xd2d4c9, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.025;
ground.receiveShadow = true;
scene.add(ground);
const pivot = new THREE.Group();
scene.add(pivot);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.65, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = false;
controls.minDistance = 3.2;
controls.maxDistance = 8;
controls.minPolarAngle = 0.2;
controls.maxPolarAngle = Math.PI * 0.86;
controls.update();

const material = (color, roughness = 0.7) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
function mesh(geometry, mat, parent, position, scale) {
  const obj = new THREE.Mesh(geometry, mat);
  obj.position.set(...position);
  if (scale) obj.scale.set(...scale);
  obj.castShadow = true;
  obj.receiveShadow = true;
  parent.add(obj);
  return obj;
}
function sphere(parent, mat, pos, scale) { return mesh(new THREE.SphereGeometry(1, 32, 24), mat, parent, pos, scale); }
function segment(parent, mat, a, b, radiusA, radiusB = radiusA, caps = true) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
  const obj = mesh(new THREE.CylinderGeometry(radiusB, radiusA, direction.length(), 20, 1), mat, parent, start.clone().add(end).multiplyScalar(0.5).toArray());
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  if (caps === true) {
    sphere(parent, mat, a, [radiusA, radiusA, radiusA]);
    sphere(parent, mat, b, [radiusB, radiusB, radiusB]);
  } else if (caps === 'end') sphere(parent, mat, b, [radiusB, radiusB, radiusB]);
  else if (caps === 'start') sphere(parent, mat, a, [radiusA, radiusA, radiusA]);
  return obj;
}
// Elliptical ring mesh for a smooth torso silhouette. Each station is [height, halfWidth, depth].
function loft(parent, mat, stations, sides = 32) {
  // Interpolate between profile measurements to avoid the segmented, toy-like look.
  const profile = new THREE.CatmullRomCurve3(stations.map(([y, rx, rz]) => new THREE.Vector3(rx, y, rz)), false, 'catmullrom', 0.18);
  const smoothStations = Array.from({ length: (stations.length - 1) * 5 + 1 }, (_, index) => {
    const point = profile.getPoint(index / ((stations.length - 1) * 5));
    return [point.y, Math.max(0.06, point.x), Math.max(0.06, point.z)];
  });
  const vertices = [], indices = [];
  for (const [y, rx, rz] of smoothStations) {
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      vertices.push(Math.cos(angle) * rx, y, Math.sin(angle) * rz);
    }
  }
  for (let ring = 0; ring < smoothStations.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * sides + side;
      const b = ring * sides + (side + 1) % sides;
      const c = (ring + 1) * sides + side;
      const d = (ring + 1) * sides + (side + 1) % sides;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mesh(geometry, mat, parent, [0, 0, 0]);
}
function normalizedText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}
function colorFor(...labels) {
  const source = labels.map(value => String(value || '')).join(' ');
  const hex = source.match(/#[0-9a-f]{6}\b/i);
  if (hex) return hex[0];
  const text = normalizedText(source);
  const palette = [
    { words: ['negro', 'black'], color: '#30312f' },
    { words: ['blanco', 'marfil', 'crudo', 'ivory', 'off white'], color: '#f0eee8' },
    { words: ['rojo', 'red', 'vino', 'granate', 'burgundy'], color: '#b83f43' },
    { words: ['azul', 'blue', 'navy', 'marino'], color: '#526f8b' },
    { words: ['verde', 'green', 'oliva'], color: '#687852' },
    { words: ['amarillo', 'yellow', 'mostaza'], color: '#d1b648' },
    { words: ['naranja', 'orange', 'terracota'], color: '#c66d42' },
    { words: ['rosado', 'rosa', 'pink', 'fucsia'], color: '#c7798d' },
    { words: ['morado', 'purpura', 'violeta', 'lila', 'purple'], color: '#806b91' },
    { words: ['gris', 'gray', 'grey'], color: '#858780' },
    { words: ['cafe', 'chocolate', 'marron', 'camel', 'brown'], color: '#795844' },
    { words: ['beige', 'arena', 'khaki', 'taupe'], color: '#c8b894' },
    { words: ['multicolor', 'estampado'], color: '#c36e80' },
  ];
  const matches = palette.flatMap(entry => entry.words.map(word => ({ index: text.indexOf(word), color: entry.color })))
    .filter(match => match.index >= 0)
    .sort((a, b) => a.index - b.index);
  // Neutral fallback for reference/sample items without a stated color.
  return matches[0]?.color || '#898984';
}
const TOP_CATEGORIES = ['camisetas', 'hoodies', 'chaquetas', 'tops', 'camisas', 'sacos', 'buzos', 'sueteres', 'cardigans', 'blusas', 'bras', 'tops de bikini', 'top de bikini', 'ruanas', 'kimonos', 'chalecos'];
const BOTTOM_CATEGORIES = ['pantalones', 'jeans', 'shorts', 'bermudas', 'faldas', 'bottom de bikini', 'bottoms de bikini', 'pareos'];
const ONE_PIECE_CATEGORIES = ['vestidos', 'vestido', 'enterizos', 'jumpsuits', 'traje de bano entero', 'one piece', 'bodydress', 'bodies', 'body'];
const isTop = item => TOP_CATEGORIES.includes(normalizedText(item?.category));
const isBottom = item => BOTTOM_CATEGORIES.includes(normalizedText(item?.category));
const isOnePiece = item => ONE_PIECE_CATEGORIES.includes(normalizedText(item?.category));
function clearModel() {
  while (pivot.children.length) {
    const child = pivot.children[0];
    pivot.remove(child);
    child.traverse(object => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(item => item.dispose());
      else object.material?.dispose();
    });
  }
}
function addMannequinHand(parent, finish, side) {
  sphere(parent, finish, [side * 0.735, 1.02, 0.035], [0.075, 0.125, 0.055]);
  const fingerLengths = [0.125, 0.16, 0.15, 0.12];
  fingerLengths.forEach((length, fingerIndex) => {
    const offset = (fingerIndex - 1.5) * 0.036;
    const x = side * (0.72 + offset);
    const middleY = 0.955 - length * 0.52;
    const tipY = 0.955 - length;
    segment(parent, finish, [x, 0.955, 0.07], [x + side * 0.005, middleY, 0.08], 0.021, 0.018);
    segment(parent, finish, [x + side * 0.005, middleY, 0.08], [x + side * 0.008, tipY, 0.075], 0.018, 0.012);
  });
  segment(parent, finish, [side * 0.68, 1.045, 0.07], [side * 0.625, 0.94, 0.09], 0.027, 0.019);
  segment(parent, finish, [side * 0.625, 0.94, 0.09], [side * 0.61, 0.89, 0.085], 0.019, 0.012);
}

function addMannequinFoot(parent, finish, x) {
  sphere(parent, finish, [x, 0.085, 0.105], [0.09, 0.07, 0.19]);
  const toeLengths = [0.055, 0.073, 0.066, 0.058, 0.048];
  toeLengths.forEach((length, toeIndex) => {
    const offset = (toeIndex - 2) * 0.032;
    sphere(parent, finish, [x + offset, 0.052, 0.235 + length * 0.42], [0.021, 0.026, length]);
  });
}
function buildAvatar(state) {
  clearModel();
  const profile = state.profile || {};
  const garments = state.garments || [];
  const height = Math.max(120, Math.min(220, Number(profile.height) || 165));
  const weight = Math.max(30, Math.min(250, Number(profile.weight) || 60));
  const bmi = weight / ((height / 100) ** 2);
  const width = Math.max(0.82, Math.min(1.38, 1 + (bmi - 22) * 0.018));
  const heightScale = Math.max(0.76, Math.min(1.34, height / 165));
  const gender = profile.gender || 'neutro';
  const isWoman = gender === 'mujer';
  const isMan = gender === 'hombre';
  const mannequin = new THREE.MeshPhysicalMaterial({
    color: isWoman ? '#f3f4f2' : isMan ? '#9ca3a8' : '#d5d9db',
    roughness: isWoman ? 0.2 : 0.26,
    metalness: isWoman ? 0.08 : isMan ? 0.62 : 0.28,
    clearcoat: 0.76,
    clearcoatRoughness: 0.14,
  });
  const body = new THREE.Group();
  body.scale.set(width, heightScale, width);
  pivot.add(body);
  // Make shoulder, waist and hip proportions respond visibly to the selected profile.
  const shoulders = isWoman ? 0.405 : isMan ? 0.50 : 0.45;
  const waist = isWoman ? 0.285 : isMan ? 0.355 : 0.33;
  const hips = isWoman ? 0.435 : isMan ? 0.365 : 0.39;
  const torsoStations = [
    [1.18, hips * 0.92, 0.245],
    [1.34, hips, 0.27],
    [1.52, waist, 0.225],
    [1.72, waist * 1.08, 0.235],
    [1.94, shoulders * 0.91, 0.27],
    [2.12, shoulders * 0.94, 0.25],
    [2.28, 0.17, 0.19],
  ];
  const topGarment = garments.find(isTop);
  const bottomGarment = garments.find(isBottom);
  const onePieceGarment = garments.find(isOnePiece);

  // Base mannequin: head, neck, trunk, arms and legs.
  loft(body, mannequin, torsoStations);
  if (isWoman) {
    for (const side of [-1, 1]) sphere(body, mannequin, [side * 0.14, 1.87, 0.20], [0.13, 0.115, 0.075]);
  }
  segment(body, mannequin, [-shoulders + 0.03, 2.16, 0], [-0.65, 1.65, 0], 0.14, 0.105);
  segment(body, mannequin, [-0.65, 1.65, 0], [-0.72, 1.14, 0.01], 0.105, 0.075);
  segment(body, mannequin, [shoulders - 0.03, 2.16, 0], [0.65, 1.65, 0], 0.14, 0.105);
  segment(body, mannequin, [0.65, 1.65, 0], [0.72, 1.14, 0.01], 0.105, 0.075);
  addMannequinHand(body, mannequin, -1);
  addMannequinHand(body, mannequin, 1);
  const legSpread = isWoman ? 0.20 : 0.18;
  for (const side of [-1, 1]) {
    segment(body, mannequin, [side * legSpread, 1.10, 0], [side * legSpread * 1.16, 0.60, 0], 0.16, 0.115);
    segment(body, mannequin, [side * legSpread * 1.16, 0.60, 0], [side * legSpread * 1.2, 0.14, 0], 0.115, 0.075);
    addMannequinFoot(body, mannequin, side * legSpread * 1.2);
  }
  mesh(new THREE.CylinderGeometry(0.115, 0.13, 0.22, 24), mannequin, body, [0, 2.40, 0]);
  const head = new THREE.Group(); head.position.set(0, 2.72, 0); head.scale.setScalar(0.68); body.add(head);
  const faceProfile = isWoman
    ? [[0.10,-0.43],[0.20,-0.36],[0.27,-0.20],[0.31,0.02],[0.30,0.23],[0.25,0.36],[0.15,0.43],[0,0.44]]
    : [[0.12,-0.43],[0.23,-0.36],[0.30,-0.19],[0.33,0.04],[0.32,0.24],[0.26,0.37],[0.15,0.43],[0,0.44]];
  mesh(new THREE.LatheGeometry(faceProfile.map(([radius, y]) => new THREE.Vector2(radius, y)), 48), mannequin, head, [0, 0, 0], [1, 1, 0.88]);

  // Generic clothing meshes use only product type and color; no marks or textures.
  if (topGarment) {
    const cloth = material(colorFor(topGarment.color, topGarment.name), 0.8);
    const topCategory = normalizedText(topGarment.category);
    const topName = normalizedText(topGarment.name);
    const sleeveless = ['tops', 'bras', 'tops de bikini', 'top de bikini'].includes(topCategory);
    const longSleeve = ['hoodies', 'chaquetas', 'sacos', 'buzos', 'sueteres', 'cardigans', 'camisas', 'blusas', 'ruanas', 'kimonos'].includes(topCategory);
    const cropTop = topName.includes('crop');
    const bikiniTop = topCategory.includes('bikini');
    const hemHeight = bikiniTop ? 1.77 : cropTop ? 1.52 : 1.18;
    const garmentStations = torsoStations.filter(([y]) => y >= hemHeight);
    // A small clearance keeps fabric above the skin without creating a floating shell.
    loft(body, cloth, garmentStations.map(([y, rx, rz]) => [y, rx + 0.014, rz + 0.018]));
    for (const side of [-1, 1]) {
      if (sleeveless) {
        segment(body, cloth, [side * shoulders * 0.55, 2.13, 0.05], [side * shoulders * 0.68, 1.93, 0.09], 0.025, 0.025);
      } else {
        const sleeveEnd = longSleeve ? 1.69 : 1.86;
        // Start the sleeve inside the shoulder shell and cap the joint; this closes the
        // skin-colored pinholes that appeared between the torso and sleeve meshes.
        segment(body, cloth, [side * (shoulders - 0.03), 2.16, 0], [side * 0.66, sleeveEnd, 0.015], 0.15, longSleeve ? 0.11 : 0.12, 'end');
        if (longSleeve) segment(body, cloth, [side * 0.66, 1.69, 0.015], [side * 0.72, 1.16, 0.02], 0.11, 0.075, 'end');
      }
    }
    if (['hoodies', 'buzos'].includes(topCategory)) {
      sphere(body, cloth, [0, 2.28, -0.20], [0.27, 0.26, 0.18]);
      for (const side of [-1, 1]) segment(body, material('#e8e5dc', 0.65), [side * 0.045, 2.13, 0.30], [side * 0.045, 1.82, 0.31], 0.008, 0.008);
    }
    if (['chaquetas', 'sacos', 'cardigans'].includes(topCategory)) segment(body, material('#dad8cf', 0.45), [0, 2.35, 0.31], [0, 1.30, 0.30], 0.012, 0.012);
    if (topCategory === 'camisas' || topCategory === 'blusas') {
      const stitch = material(colorFor(topGarment.color, topGarment.name), 0.76);
      for (const y of [1.56, 1.72, 1.88, 2.04]) sphere(body, stitch, [0, y, 0.306], [0.018, 0.018, 0.012]);
    }
    if (['camisetas', 'tops', 'camisas'].includes(topCategory)) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 10, 28), cloth);
      collar.position.set(0, 2.29, 0.24); collar.rotation.x = Math.PI / 2; body.add(collar);
    }
  }
  if (onePieceGarment) {
    const cloth = material(colorFor(onePieceGarment.color, onePieceGarment.name), 0.78);
    const category = normalizedText(onePieceGarment.category);
    if (category.includes('bano') || category.includes('one piece')) {
      loft(body, cloth, [[0.94, hips * 0.70, 0.27], [1.02, hips * 0.85, 0.30], [1.24, hips * 0.91, 0.32], [1.46, waist * 0.97, 0.30], [1.70, shoulders * 0.77, 0.34], [1.98, shoulders * 0.80, 0.33], [2.12, shoulders * 0.70, 0.30]]);
      for (const side of [-1, 1]) segment(body, cloth, [side * 0.26, 2.14, 0.04], [side * 0.20, 1.86, 0.10], 0.035, 0.035);
    } else if (category === 'body' || category === 'bodies') {
      loft(body, cloth, [[0.94, hips * 0.72, 0.26], [1.02, hips * 0.88, 0.285], [1.18, hips * 0.94, 0.295], [1.34, hips, 0.285], [1.48, waist + 0.012, 0.298], [1.72, shoulders * 0.82 + 0.012, 0.338], [1.99, shoulders * 0.82 + 0.012, 0.328], [2.12, shoulders * 0.70 + 0.012, 0.308]]);
      for (const side of [-1, 1]) segment(body, cloth, [side * 0.26, 2.14, 0.04], [side * 0.20, 1.90, 0.10], 0.035, 0.035);
    } else {
      const dressStations = [
        [0.18, hips * 1.12, 0.285], [0.52, hips * 1.10, 0.29], [0.88, hips * 1.05, 0.28],
        [1.18, hips + 0.012, 0.285], ...torsoStations.filter(([y]) => y >= 1.34).map(([y, rx, rz]) => [y, rx + 0.014, rz + 0.018]),
      ];
      loft(body, cloth, dressStations);
      for (const side of [-1, 1]) segment(body, cloth, [side * (shoulders - 0.03), 2.16, 0], [side * 0.66, 1.86, 0.015], 0.145, 0.105, 'end');
    }
  }
  if (bottomGarment) {
    const cloth = material(colorFor(bottomGarment.color, bottomGarment.name), 0.82);
    const bottomCategory = normalizedText(bottomGarment.category);
    if (['faldas', 'pareos'].includes(bottomCategory)) {
      mesh(new THREE.CylinderGeometry(0.31, 0.48, 0.68, 48, 2, false), cloth, body, [0, 1.00, 0]);
      const waistband = mesh(new THREE.TorusGeometry(hips * 0.92, 0.025, 8, 40), cloth, body, [0, 1.34, 0]);
      waistband.rotation.x = Math.PI / 2;
    } else {
      const shortLength = ['shorts', 'bermudas', 'bottom de bikini', 'bottoms de bikini'].includes(bottomCategory);
      const bikiniBottom = bottomCategory.includes('bikini');
      // Keep the shared hip/crotch panel close to the body while bridging the leg tubes.
      loft(body, cloth, [
        [0.97, hips * 0.77, 0.245],
        [1.03, hips * 0.88, 0.265],
        [1.12, hips * 0.92, 0.27],
        [1.19, hips * 0.88, 0.25],
      ]);
      const waistband = mesh(new THREE.TorusGeometry(hips * 0.88, 0.012, 8, 48), cloth, body, [0, 1.18, 0]);
      waistband.rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) {
        const legEnd = shortLength ? (bikiniBottom ? 0.92 : 0.59) : 0.60;
        segment(body, cloth, [side * legSpread, 1.12, 0], [side * legSpread * 1.16, legEnd, 0], 0.16, shortLength ? 0.14 : 0.125);
        if (!shortLength) segment(body, cloth, [side * legSpread * 1.16, 0.60, 0], [side * legSpread * 1.2, 0.14, 0], 0.125, 0.085);
      }
    }
  }
  pivot.position.y = 0;
  // Keep very tall and short avatar proportions inside the preview frame.
  const avatarCenter = 1.58 * heightScale;
  controls.target.y = avatarCenter;
  camera.position.set(0, avatarCenter + 0.15, Math.max(6.2, heightScale * 5.45));
  controls.update();
  document.getElementById('avatarPreviewTitle').textContent = garments.length ? 'Tu conjunto' : 'Avatar 3D';
}

function resize() {
  const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);
resize();
const getStored = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
function fromStorage() {
  const products = window.CLOTHES_PRODUCTS || [];
  let ids = getStored('clothes.worn', []); if (!Array.isArray(ids)) ids = ids ? [ids] : [];
  const garments = ids.map(id => products.find(item => item.id === id)).filter(Boolean).map(item => ({ category: item.category, color: item.color, name: item.name }));
  return { profile: getStored('clothes.profile', { gender: 'neutro', height: 165, weight: 60 }), garments };
}
window.addEventListener('clothes:avatar-updated', event => buildAvatar(event.detail));
buildAvatar(fromStorage());
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
animate();
