// Cuerpo, cara y cabello del avatar. Las medidas salen de proporciones antropométricas
// (fracciones de la estatura) y el IMC reparte la grasa por zonas, como en un cuerpo real.
import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (x, center, sigma) => Math.exp(-((x - center) ** 2) / (2 * sigma * sigma));
const signedPow = (value, exponent) => Math.sign(value) * Math.abs(value) ** exponent;

export const LIMITS = { height: [140, 210], weight: [40, 160] };
const HEX = /^#[0-9a-f]{6}$/i;
const HAIR_STYLES = ['corto', 'rapado', 'rizado', 'afro', 'bob', 'largo', 'cola', 'mono', 'calvo'];
const DEFAULTS = {
  mujer: { gender: 'mujer', height: 163, weight: 58, skin: '#e0a982', hairStyle: 'largo', hairColor: '#3b2a20', eyeColor: '#6b4423', eyeShape: 'almendrados', brows: 'normales', beard: 'ninguna' },
  hombre: { gender: 'hombre', height: 175, weight: 72, skin: '#c98e65', hairStyle: 'corto', hairColor: '#1f1a17', eyeColor: '#3b2416', eyeShape: 'almendrados', brows: 'normales', beard: 'ninguna' },
};

export function normalizeProfile(raw = {}) {
  const gender = raw.gender === 'hombre' ? 'hombre' : 'mujer';
  const base = DEFAULTS[gender];
  const pick = (value, options, fallback) => options.includes(value) ? value : fallback;
  const hex = (value, fallback) => HEX.test(String(value)) ? value : fallback;
  return {
    gender,
    height: clamp(Number(raw.height) || base.height, ...LIMITS.height),
    weight: clamp(Number(raw.weight) || base.weight, ...LIMITS.weight),
    skin: hex(raw.skin, base.skin),
    hairStyle: pick(raw.hairStyle, HAIR_STYLES, base.hairStyle),
    hairColor: hex(raw.hairColor, base.hairColor),
    eyeColor: hex(raw.eyeColor, base.eyeColor),
    eyeShape: pick(raw.eyeShape, ['redondos', 'almendrados', 'rasgados'], base.eyeShape),
    brows: pick(raw.brows, ['finas', 'normales', 'gruesas'], base.brows),
    beard: gender === 'hombre' ? pick(raw.beard, ['ninguna', 'corta', 'completa', 'bigote', 'candado'], 'ninguna') : 'ninguna',
  };
}

// Torso cross-sections as fractions of the height: [y, half width, front depth, back depth].
const TORSO = {
  hombre: [
    [0.432, 0.030, 0.022, 0.026], [0.445, 0.066, 0.042, 0.050], [0.455, 0.084, 0.052, 0.060], [0.480, 0.094, 0.056, 0.068], [0.510, 0.099, 0.058, 0.070],
    [0.545, 0.097, 0.057, 0.062], [0.585, 0.090, 0.056, 0.056], [0.625, 0.086, 0.057, 0.054],
    [0.670, 0.090, 0.060, 0.056], [0.715, 0.098, 0.066, 0.059], [0.760, 0.104, 0.066, 0.061],
    [0.795, 0.108, 0.058, 0.060], [0.815, 0.100, 0.048, 0.052], [0.832, 0.062, 0.038, 0.042],
    [0.842, 0.036, 0.030, 0.033],
  ],
  mujer: [
    [0.432, 0.032, 0.022, 0.028], [0.445, 0.070, 0.042, 0.056], [0.455, 0.090, 0.052, 0.066], [0.480, 0.104, 0.057, 0.080], [0.510, 0.110, 0.058, 0.080],
    [0.545, 0.104, 0.055, 0.066], [0.585, 0.088, 0.051, 0.055], [0.625, 0.077, 0.049, 0.050],
    [0.665, 0.080, 0.051, 0.051], [0.705, 0.085, 0.054, 0.053], [0.745, 0.091, 0.054, 0.055],
    [0.785, 0.100, 0.050, 0.055], [0.812, 0.096, 0.043, 0.048], [0.830, 0.057, 0.034, 0.038],
    [0.840, 0.032, 0.028, 0.030],
  ],
};
// Leg radius along the height: [y, radius, forward offset of the center].
const LEG = {
  hombre: [[0.50, 0.053, 0], [0.47, 0.052, 0], [0.42, 0.048, 0.002], [0.36, 0.043, 0.004], [0.31, 0.036, 0.004], [0.285, 0.034, 0.006],
    [0.255, 0.035, 0.002], [0.205, 0.037, -0.006], [0.15, 0.030, -0.004], [0.095, 0.022, 0], [0.06, 0.019, 0], [0.045, 0.018, 0]],
  mujer: [[0.50, 0.056, 0], [0.47, 0.055, 0], [0.42, 0.050, 0.002], [0.36, 0.044, 0.004], [0.31, 0.036, 0.004], [0.285, 0.033, 0.006],
    [0.255, 0.033, 0.002], [0.205, 0.035, -0.006], [0.15, 0.028, -0.004], [0.095, 0.020, 0], [0.06, 0.017, 0], [0.045, 0.016, 0]],
};

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
// Smoothly resample rows of numbers so the silhouette has no visible kinks.
function resampleRows(rows, steps = 6) {
  const out = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const p0 = rows[Math.max(0, i - 1)], p1 = rows[i], p2 = rows[i + 1], p3 = rows[Math.min(rows.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) out.push(p1.map((_, k) => catmull(p0[k], p1[k], p2[k], p3[k], s / steps)));
  }
  out.push([...rows[rows.length - 1]]);
  return out;
}

// Closed ring surface: rings are {y, rx, rf, rb, cz}. The seam sits on the left side so the
// front half of the texture (u 0..0.5) is one continuous panel facing the camera.
export function loftGeometry(rings, { sides = 48, deform, exponent = 0.82, capBottom = false, capTop = false } = {}) {
  const positions = [], uvs = [], indices = [];
  const y0 = rings[0].y, y1 = rings[rings.length - 1].y;
  const half = sides / 2;
  for (const ring of rings) {
    const ringPoints = [];
    for (let i = 0; i <= sides; i++) {
      const angle = Math.PI + (i / sides) * Math.PI * 2;
      const c = Math.cos(angle), s = Math.sin(angle);
      const x = signedPow(c, exponent) * ring.rx;
      let z = (s < 0 ? signedPow(s, exponent) * ring.rb : signedPow(s, exponent) * ring.rf) + (ring.cz || 0);
      if (deform) z = deform(x, ring.y, z, ring);
      ringPoints.push([x, ring.y, z]);
    }
    // Arc length per half keeps prints undistorted around the body.
    const arc = [0];
    for (let i = 1; i <= sides; i++) {
      const [ax, , az] = ringPoints[i - 1], [bx, , bz] = ringPoints[i];
      arc.push(arc[i - 1] + Math.hypot(bx - ax, bz - az));
    }
    const backLength = arc[half] || 1, frontLength = (arc[sides] - arc[half]) || 1;
    ringPoints.forEach((point, i) => {
      positions.push(...point);
      const u = i <= half ? 1 - 0.5 * (arc[i] / backLength) : 0.5 - 0.5 * ((arc[i] - arc[half]) / frontLength);
      uvs.push(u, (ring.y - y0) / ((y1 - y0) || 1));
    });
  }
  const row = sides + 1;
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const addCap = (ringIndex, offset, flip) => {
    const ring = rings[ringIndex];
    const center = positions.length / 3;
    let cz = 0;
    for (let i = 0; i < sides; i++) cz += positions[(ringIndex * row + i) * 3 + 2];
    positions.push(0, ring.y + offset, cz / sides);
    uvs.push(0.25, ringIndex === 0 ? 0 : 1);
    for (let i = 0; i < sides; i++) {
      const a = ringIndex * row + i, b = a + 1;
      if (flip) indices.push(center, a, b); else indices.push(center, b, a);
    }
  };
  if (capBottom) addCap(0, -0.004, true);
  if (capTop) addCap(rings.length - 1, 0.004, false);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  weldSeamNormals(geometry, rings.length, row);
  return geometry;
}
function weldSeamNormals(geometry, ringCount, row) {
  const normal = geometry.getAttribute('normal');
  for (let j = 0; j < ringCount; j++) {
    const a = j * row, b = j * row + row - 1;
    const x = normal.getX(a) + normal.getX(b), y = normal.getY(a) + normal.getY(b), z = normal.getZ(a) + normal.getZ(b);
    const length = Math.hypot(x, y, z) || 1;
    normal.setXYZ(a, x / length, y / length, z / length);
    normal.setXYZ(b, x / length, y / length, z / length);
  }
}

// Tube along a path. samples: [{p: Vector3, rx, rz}], already dense.
export function tubeGeometry(samples, { sides = 28, capStart = false, capEnd = false, flatten = 1 } = {}) {
  const positions = [], uvs = [], indices = [];
  const row = sides + 1;
  let length = 0;
  const along = samples.map((sample, i) => (i ? (length += sample.p.distanceTo(samples[i - 1].p)) : 0));
  const tangent = new THREE.Vector3(), side = new THREE.Vector3(), forward = new THREE.Vector3();
  const frames = samples.map((sample, i) => {
    const prev = samples[Math.max(0, i - 1)].p, next = samples[Math.min(samples.length - 1, i + 1)].p;
    tangent.subVectors(next, prev).normalize();
    const reference = Math.abs(tangent.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    side.crossVectors(tangent, reference).normalize();
    forward.crossVectors(side, tangent).normalize();
    return { t: tangent.clone(), x: side.clone(), f: forward.clone() };
  });
  samples.forEach((sample, j) => {
    const { x, f } = frames[j];
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const point = sample.p.clone().addScaledVector(x, Math.cos(angle) * sample.rx).addScaledVector(f, Math.sin(angle) * sample.rz * flatten);
      positions.push(point.x, point.y, point.z);
      uvs.push(i / sides, along[j] / (length || 1));
    }
  });
  for (let j = 0; j < samples.length - 1; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const cap = (j, direction) => {
    const sample = samples[j];
    const tip = sample.p.clone().addScaledVector(frames[j].t, direction * Math.min(sample.rx, sample.rz) * 0.55);
    const center = positions.length / 3;
    positions.push(tip.x, tip.y, tip.z);
    uvs.push(0.5, j ? 1 : 0);
    for (let i = 0; i < sides; i++) {
      const a = j * row + i, b = a + 1;
      if (direction > 0) indices.push(center, b, a); else indices.push(center, a, b);
    }
  };
  if (capStart) cap(0, -1);
  if (capEnd) cap(samples.length - 1, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  for (let j = 0; j < samples.length; j++) {
    const normal = geometry.getAttribute('normal'), a = j * row, b = a + sides;
    normal.setXYZ(b, normal.getX(a), normal.getY(a), normal.getZ(a));
  }
  return geometry;
}
// Dense samples from control points: [{p, rx, rz}] → smooth Catmull-Rom path.
export function densify(controls, steps = 6) {
  const rows = resampleRows(controls.map(c => [c.p.x, c.p.y, c.p.z, c.rx, c.rz, c.t ?? 0]), steps);
  return rows.map(([x, y, z, rx, rz, t]) => ({ p: new THREE.Vector3(x, y, z), rx, rz, t }));
}
// Cut a dense sample list at parameter t (0 = start, 1 = end).
export function sliceSamples(samples, tEnd, tStart = 0) {
  const result = [];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (sample.t >= tStart && sample.t <= tEnd) result.push({ ...sample, p: sample.p.clone() });
    const next = samples[i + 1];
    if (next && sample.t < tEnd && next.t > tEnd) {
      const k = (tEnd - sample.t) / (next.t - sample.t);
      result.push({ p: sample.p.clone().lerp(next.p, k), rx: lerp(sample.rx, next.rx, k), rz: lerp(sample.rz, next.rz, k), t: tEnd });
    }
    if (next && sample.t < tStart && next.t > tStart) {
      const k = (tStart - sample.t) / (next.t - sample.t);
      result.push({ p: sample.p.clone().lerp(next.p, k), rx: lerp(sample.rx, next.rx, k), rz: lerp(sample.rz, next.rz, k), t: tStart });
    }
  }
  return result.sort((a, b) => a.t - b.t);
}

// Parametric geometries come out with either winding; make them face away from `center`.
function faceOutward(geometry, center) {
  const position = geometry.getAttribute('position'), index = geometry.getIndex();
  if (!index) return geometry;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  let score = 0;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i)); b.fromBufferAttribute(position, index.getX(i + 1)); c.fromBufferAttribute(position, index.getX(i + 2));
    n.subVectors(c, b).cross(a.clone().sub(b));
    score += n.dot(a.add(b).add(c).multiplyScalar(1 / 3).sub(center));
  }
  if (score < 0) {
    const array = index.array;
    for (let i = 0; i < array.length; i += 3) [array[i + 1], array[i + 2]] = [array[i + 2], array[i + 1]];
    index.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  return geometry;
}

function skinMaterial(color) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.52, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffd9c7'), 0.4), clearcoat: 0.08 });
}
function hairTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 256, 64);
  const base = new THREE.Color(color);
  for (let i = 0; i < 420; i++) {
    const shade = base.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.07);
    ctx.strokeStyle = `#${shade.getHexString()}`;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 0.6 + Math.random() * 1.2;
    const x = Math.random() * 256;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (Math.random() - 0.5) * 6, 64); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Strands run along v (crown → tips) in every hair geometry.
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function buildBody(rawProfile, { armClearance = 0 } = {}) {
  const profile = normalizeProfile(rawProfile);
  const woman = profile.gender === 'mujer';
  const H = profile.height / 100;
  const bmi = clamp(profile.weight / (H * H), 15, 50);
  const f = bmi - 22;
  const fat = rate => Math.max(0.7, 1 + rate * (f >= 0 ? f : f * 0.7));
  const group = new THREE.Group();
  group.name = 'cuerpo';
  const skin = skinMaterial(profile.skin);
  const add = (geometry, material, name) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (name) mesh.name = name;
    group.add(mesh);
    return mesh;
  };

  // ---- Torso ----
  const stations = TORSO[profile.gender].map(([y, rx, rf, rb]) => {
    const belly = gauss(y, 0.615, 0.055), hip = gauss(y, 0.50, 0.04), chest = gauss(y, 0.73, 0.045), top = smoothstep(0.80, 0.84, y);
    const damp = 1 - top * 0.6;
    const rateX = (0.006 + (woman ? 0.014 : 0.02) * belly + (woman ? 0.022 : 0.015) * hip + 0.012 * chest) * damp;
    const rateF = (0.006 + (woman ? 0.026 : 0.042) * belly + 0.010 * hip + 0.016 * chest) * damp;
    const rateB = (0.006 + 0.012 * belly + (woman ? 0.024 : 0.016) * hip + 0.012 * chest) * damp;
    return [y * H, rx * H * fat(rateX), rf * H * fat(rateF), rb * H * fat(rateB)];
  });
  const torsoRows = resampleRows(stations, 6);
  const torsoAt = y => {
    if (y <= torsoRows[0][0]) return { rx: torsoRows[0][1], rf: torsoRows[0][2], rb: torsoRows[0][3] };
    for (let i = 1; i < torsoRows.length; i++) {
      if (y <= torsoRows[i][0]) {
        const [y0, ...a] = torsoRows[i - 1], [y1, ...b] = torsoRows[i];
        const k = (y - y0) / (y1 - y0);
        return { rx: lerp(a[0], b[0], k), rf: lerp(a[1], b[1], k), rb: lerp(a[2], b[2], k) };
      }
    }
    const last = torsoRows[torsoRows.length - 1];
    return { rx: last[1], rf: last[2], rb: last[3] };
  };
  const chestScale = torsoAt(0.73 * H).rx / (TORSO[profile.gender][9][1] * H);
  const bust = woman
    ? { amount: clamp(0.03 * H * fat(0.03), 0.02 * H, 0.06 * H), cx: 0.05 * H * chestScale, cy: (0.728 - Math.max(0, f) * 0.0006) * H, sx: 0.034 * H * Math.sqrt(chestScale), sy: 0.03 * H }
    : { amount: (0.004 + Math.max(0, f) * 0.0011) * H, cx: 0.05 * H * chestScale, cy: 0.735 * H, sx: 0.045 * H, sy: 0.03 * H };
  const glute = { amount: (woman ? 0.014 : 0.009) * H * fat(0.02), cx: 0.045 * H, cy: 0.49 * H, sx: 0.04 * H, sy: 0.035 * H };
  // Bust and glutes are added on top of the elliptical sections. Clothing passes
  // drape=true so fabric bridges under and between the bust instead of clinging.
  const torsoDeform = (drape = false, extra = 0) => (x, y, z, ring) => {
    if (z > 0) {
      const frontness = clamp(z / (ring.rf || 1), 0, 1);
      let add = 0;
      for (const side of [-1, 1]) {
        let dx = x - side * bust.cx;
        if (drape && Math.abs(x) < bust.cx) dx = 0;
        const dy = y - bust.cy;
        const sy = drape && dy < 0 ? bust.sy * 2.6 : bust.sy;
        const value = bust.amount * Math.exp(-(dx * dx) / (2 * (drape ? bust.sx * 1.2 : bust.sx) ** 2) - (dy * dy) / (2 * sy * sy));
        add = drape ? Math.max(add, value) : add + value;
      }
      return z + (add + (add > 0.001 ? extra * 0.3 : 0)) * frontness;
    }
    const backness = clamp(-z / (ring.rb || 1), 0, 1);
    let add = 0;
    for (const side of [-1, 1]) {
      let dx = x - side * glute.cx;
      if (drape && Math.abs(x) < glute.cx) dx = 0;
      const dy = y - glute.cy;
      const sy = drape && dy < 0 ? glute.sy * 1.8 : glute.sy;
      const value = glute.amount * Math.exp(-(dx * dx) / (2 * glute.sx ** 2) - (dy * dy) / (2 * sy * sy));
      add = drape ? Math.max(add, value) : add + value;
    }
    return z - add * backness;
  };
  const torsoRings = torsoRows.map(([y, rx, rf, rb]) => ({ y, rx, rf, rb }));
  add(loftGeometry(torsoRings, { sides: 56, deform: torsoDeform(false), capBottom: true }), skin, 'torso');

  // ---- Legs ----
  const hipX = (woman ? 0.058 : 0.052) * H * fat(0.008);
  const legs = [-1, 1].map(side => {
    const controls = LEG[profile.gender].map(([y, r, dz]) => {
      const yH = y * H;
      const thigh = smoothstep(0.30, 0.42, y), knee = gauss(y, 0.285, 0.03), calf = gauss(y, 0.2, 0.05);
      const rate = thigh * (woman ? 0.026 : 0.02) + knee * 0.012 + calf * 0.015 + 0.005;
      const x = y > 0.285 ? lerp(hipX * 0.84, hipX, (y - 0.285) / (0.5 - 0.285)) : lerp(hipX * 0.86, hipX * 0.84, (y - 0.045) / (0.285 - 0.045));
      return { p: new THREE.Vector3(side * x, yH, dz * H), rx: r * H * fat(rate), rz: r * H * fat(rate) * 0.97, t: (0.5 - y) / (0.5 - 0.045) };
    });
    const samples = densify(controls, 5);
    add(tubeGeometry(samples, { sides: 32 }), skin, 'pierna');
    return { side, samples, ankle: controls[controls.length - 1].p.clone() };
  });

  // ---- Arms ----
  const shoulderY = 0.805 * H;
  const shoulderX = torsoAt(0.795 * H).rx * 0.93;
  const armScale = woman ? 0.86 : 1;
  const armRadius = t => {
    // t: 0 shoulder → 1 wrist; [t, radius fraction of H, fat rate]
    const table = [[0, 0.036, 0.02], [0.18, 0.033, 0.026], [0.42, 0.029, 0.026], [0.56, 0.022, 0.015], [0.68, 0.024, 0.016], [0.86, 0.019, 0.01], [1, 0.0155, 0.007]];
    for (let i = 1; i < table.length; i++) {
      if (t <= table[i][0]) {
        const k = (t - table[i - 1][0]) / (table[i][0] - table[i - 1][0]);
        return lerp(table[i - 1][1], table[i][1], k) * H * armScale * fat(lerp(table[i - 1][2], table[i][2], k));
      }
    }
    return 0.0155 * H * armScale;
  };
  const upperLength = 0.186 * H, foreLength = 0.146 * H;
  // Open the arms just enough to clear the torso (and clothes) at every height.
  let tanAngle = Math.tan(THREE.MathUtils.degToRad(7));
  for (let t = 0.15; t <= 1; t += 0.05) {
    const y = shoulderY - t * (upperLength + foreLength) * 0.98;
    const needed = (torsoAt(y).rx + armRadius(t) + 0.006 * H + armClearance - shoulderX) / (shoulderY - y);
    if (y < 0.53 * H) {
      const legOuter = hipX + 0.056 * H * fat(0.026) * 0.8;
      tanAngle = Math.max(tanAngle, (legOuter + armRadius(t) + armClearance - shoulderX) / (shoulderY - y));
    }
    tanAngle = Math.max(tanAngle, needed);
  }
  const angle = Math.min(Math.atan(tanAngle), THREE.MathUtils.degToRad(38));
  const arms = [-1, 1].map(side => {
    const shoulder = new THREE.Vector3(side * shoulderX, shoulderY, -0.004 * H);
    const upperDir = new THREE.Vector3(side * Math.sin(angle), -Math.cos(angle), 0).normalize();
    const elbow = shoulder.clone().addScaledVector(upperDir, upperLength);
    const foreDir = new THREE.Vector3(side * Math.sin(angle * 0.85), -Math.cos(angle * 0.85), 0.16).normalize();
    const wrist = elbow.clone().addScaledVector(foreDir, foreLength);
    const total = upperLength + foreLength;
    const controls = [0, 0.18, 0.42, 0.56, 0.68, 0.86, 1].map(t => {
      const distance = t * total;
      const p = distance <= upperLength ? shoulder.clone().addScaledVector(upperDir, distance) : elbow.clone().addScaledVector(foreDir, distance - upperLength);
      const r = armRadius(t);
      return { p, rx: r, rz: r * (t > 0.56 ? 0.88 : 0.96), t };
    });
    const samples = densify(controls, 5);
    add(tubeGeometry(samples, { sides: 28 }), skin, 'brazo');
    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), skin);
    deltoid.scale.set(armRadius(0) * 1.02, armRadius(0) * 1.12, armRadius(0) * 1.05);
    deltoid.position.copy(shoulder).addScaledVector(upperDir, 0.012 * H);
    deltoid.castShadow = true;
    group.add(deltoid);
    group.add(buildHand(side, wrist, foreDir, H * armScale, skin));
    return { side, samples, shoulder, wrist, dir: foreDir, deltoid: { position: deltoid.position.clone(), scale: deltoid.scale.clone() } };
  });

  // ---- Neck ----
  const neckRadius = (woman ? 0.03 : 0.034) * H * fat(0.012);
  const chinY = 0.858 * H;
  const neckSamples = densify([
    { p: new THREE.Vector3(0, 0.80 * H, -0.006 * H), rx: neckRadius * 1.15, rz: neckRadius * 1.05, t: 0 },
    { p: new THREE.Vector3(0, 0.84 * H, -0.002 * H), rx: neckRadius, rz: neckRadius * 0.98, t: 0.5 },
    { p: new THREE.Vector3(0, chinY + 0.02 * H, 0.004 * H), rx: neckRadius * 0.96, rz: neckRadius * 0.96, t: 1 },
  ], 6);
  add(tubeGeometry(neckSamples, { sides: 28 }), skin, 'cuello');

  // ---- Shoes ----
  for (const leg of legs) group.add(buildShoe(leg.ankle, H, leg.side));

  // ---- Head ----
  const head = buildHead(profile, { H, chinY, fat, skin });
  group.add(head.group);

  const rig = {
    H, woman, bmi, fat, profile,
    torso: { rows: torsoRows, at: torsoAt, deform: torsoDeform },
    legs, arms, neckRadius,
    head: head.info,
    eyes: head.eyes,
    top: head.info.top,
  };
  return { group, rig };
}

function buildHand(side, wrist, direction, scale, material) {
  const hand = new THREE.Group();
  hand.position.copy(wrist);
  // Local -y follows the forearm; the palm faces the thigh.
  hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);
  const part = (geometry, position, scaleXYZ, rotation) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (scaleXYZ) mesh.scale.set(...scaleXYZ);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    hand.add(mesh);
  };
  const s = scale;
  part(new THREE.SphereGeometry(1, 24, 16), [0, -0.03 * s, 0.002 * s], [0.012 * s, 0.034 * s, 0.027 * s]);
  const fingerLengths = [0.031, 0.036, 0.034, 0.027];
  fingerLengths.forEach((length, index) => {
    const z = (index - 1.5) * 0.0125 * s;
    const finger = new THREE.CapsuleGeometry(0.0055 * s, length * s, 6, 10);
    part(finger, [-side * 0.003 * s, -0.058 * s - length * s * 0.45, z], null, [0, 0, side * 0.12]);
  });
  part(new THREE.CapsuleGeometry(0.0062 * s, 0.024 * s, 6, 10), [-side * 0.004 * s, -0.034 * s, 0.026 * s], null, [-0.55, 0, side * 0.25]);
  return hand;
}

function buildShoe(ankle, H, side) {
  const shoe = new THREE.Group();
  shoe.position.set(ankle.x, 0, ankle.z);
  shoe.rotation.y = side * 0.08;
  const L = 0.152 * H, W = 0.058 * H;
  const outline = new THREE.Shape();
  outline.moveTo(0, -0.30 * L);
  outline.bezierCurveTo(0.42 * W, -0.30 * L, 0.42 * W, -0.05 * L, 0.48 * W, 0.25 * L);
  outline.bezierCurveTo(0.55 * W, 0.55 * L, 0.25 * W, 0.72 * L, 0, 0.72 * L);
  outline.bezierCurveTo(-0.28 * W, 0.72 * L, -0.5 * W, 0.5 * L, -0.45 * W, 0.2 * L);
  outline.bezierCurveTo(-0.4 * W, -0.05 * L, -0.42 * W, -0.30 * L, 0, -0.30 * L);
  const soleHeight = 0.014 * H;
  const sole = new THREE.ExtrudeGeometry(outline, { depth: soleHeight, bevelEnabled: true, bevelThickness: 0.003 * H, bevelSize: 0.003 * H, bevelSegments: 3, curveSegments: 24 });
  sole.rotateX(Math.PI / 2);
  sole.translate(0, soleHeight + 0.003 * H, 0);
  const soleMesh = new THREE.Mesh(sole, new THREE.MeshStandardMaterial({ color: '#ece8de', roughness: 0.7 }));
  const upperMaterial = new THREE.MeshStandardMaterial({ color: '#f6f5f1', roughness: 0.62 });
  const upper = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), upperMaterial);
  upper.scale.set(0.46 * W, 0.05 * H, 0.52 * L);
  upper.position.set(0, soleHeight, 0.16 * L);
  const toe = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), upperMaterial);
  toe.scale.set(0.44 * W, 0.028 * H, 0.2 * L);
  toe.position.set(0, soleHeight, 0.5 * L);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.021 * H, 0.0045 * H, 10, 28), new THREE.MeshStandardMaterial({ color: '#2b2b2a', roughness: 0.7 }));
  collar.rotation.x = Math.PI / 2 - 0.25;
  collar.position.set(0, 0.062 * H, -0.06 * L);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40, Math.PI * 0.9), new THREE.MeshStandardMaterial({ color: '#7a885e', roughness: 0.55 }));
  stripe.scale.set(0.47 * W, 0.47 * W, 0.4 * L);
  stripe.rotation.set(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
  stripe.position.set(0, soleHeight + 0.018 * H, 0.15 * L);
  for (const mesh of [soleMesh, upper, toe, collar, stripe]) { mesh.castShadow = true; shoe.add(mesh); }
  return shoe;
}

// ---- Head, face and hair ----
function buildHead(profile, { H, chinY, fat, skin }) {
  const woman = profile.gender === 'mujer';
  const hs = (H / 1.7) ** 0.35 * (woman ? 0.96 : 1);
  const hx = (woman ? 0.090 : 0.094) * hs * fat(0.006), hy = 0.128 * hs, hz = 0.104 * hs;
  const jawTaper = woman ? 0.38 : 0.27;
  const center = new THREE.Vector3(0, chinY + hy * 0.9, 0.008 * H);
  const group = new THREE.Group();
  group.name = 'cabeza';

  // Point on the (deformed) head surface. theta: 0 top → π chin; phi: 0 front, ±π/2 sides.
  const surface = (theta, phi, inflate = 0, target = new THREE.Vector3()) => {
    const st = Math.sin(theta), y = Math.cos(theta);
    let x = st * Math.sin(phi), z = st * Math.cos(phi);
    const lower = Math.max(0, -y);
    x *= 1 - jawTaper * lower ** 1.5;
    z *= 1 - 0.1 * lower ** 1.5;
    if (z > 0) z *= 1 - 0.06 * (1 - lower);
    const k = 1 + inflate;
    return target.set(x * hx * k, y * hy * k, z * hz * k).add(center);
  };
  const normalAt = (theta, phi) => {
    const a = surface(theta, phi), b = surface(theta + 0.01, phi), c = surface(theta, phi + 0.01);
    return b.sub(a).cross(c.sub(a)).normalize().multiplyScalar(-1);
  };
  const addMesh = (geometry, material, cast = true) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const headGeometry = faceOutward(new ParametricGeometry((u, v, target) => surface(v * Math.PI, u * Math.PI * 2, 0, target), 64, 48), center);
  addMesh(headGeometry, skin);
  // Ensure the normal points out of the head regardless of the derivative direction.
  const outward = (theta, phi) => {
    const n = normalAt(theta, phi);
    return n.dot(surface(theta, phi).sub(center)) < 0 ? n.negate() : n;
  };

  // Ears
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin);
    ear.scale.set(0.011 * hs, 0.03 * hs, 0.02 * hs);
    ear.position.copy(surface(Math.PI / 2 + 0.06, side * (Math.PI / 2 - 0.04)));
    ear.rotation.y = side * 0.25;
    ear.castShadow = true;
    group.add(ear);
  }
  // Nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin);
  nose.scale.set(0.014 * hs, 0.016 * hs, 0.012 * hs);
  nose.position.copy(surface(Math.PI / 2 + 0.17, 0)).addScaledVector(outward(Math.PI / 2 + 0.17, 0), -0.002);
  group.add(nose);

  // Eyes: big, glossy, cartoon proportions.
  const eyeShape = { redondos: 1.05, almendrados: 0.8, rasgados: 0.6 }[profile.eyeShape] || 0.8;
  const re = 0.024 * hs;
  const eyes = [];
  const white = new THREE.MeshPhysicalMaterial({ color: '#fbfbf8', roughness: 0.2, clearcoat: 0.6 });
  const iris = new THREE.MeshPhysicalMaterial({ color: profile.eyeColor, roughness: 0.25, clearcoat: 1 });
  const pupil = new THREE.MeshStandardMaterial({ color: '#0d0b0a', roughness: 0.2 });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const lash = new THREE.MeshStandardMaterial({ color: '#241a15', roughness: 0.6 });
  for (const side of [-1, 1]) {
    const theta = Math.PI / 2 + 0.03, phi = side * 0.37;
    const n = outward(theta, phi);
    const eye = new THREE.Group();
    eye.position.copy(surface(theta, phi)).addScaledVector(n, -re * 0.32);
    eye.lookAt(eye.position.clone().add(n.clone().lerp(new THREE.Vector3(0, 0, 1), 0.55)));
    eye.rotateZ(profile.eyeShape === 'rasgados' ? -side * 0.16 : -side * 0.04);
    const inner = new THREE.Group();
    inner.scale.y = eyeShape;
    eye.add(inner);
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(re, 28, 20), white);
    sclera.scale.z = 0.62;
    inner.add(sclera);
    const irisMesh = new THREE.Mesh(new THREE.SphereGeometry(re * 0.62, 24, 18), iris);
    irisMesh.scale.set(1, Math.min(1, 1 / eyeShape) * 0.98, 0.34);
    irisMesh.position.z = re * 0.48;
    inner.add(irisMesh);
    const pupilMesh = new THREE.Mesh(new THREE.SphereGeometry(re * 0.3, 18, 12), pupil);
    pupilMesh.scale.set(1, Math.min(1, 1 / eyeShape), 0.3);
    pupilMesh.position.z = re * 0.62;
    inner.add(pupilMesh);
    const highlight = new THREE.Mesh(new THREE.SphereGeometry(re * 0.12, 12, 8), shine);
    highlight.position.set(re * 0.2, re * 0.22, re * 0.7);
    inner.add(highlight);
    const lid = new THREE.Mesh(new THREE.TorusGeometry(re * 1.02, re * (woman ? 0.11 : 0.075), 8, 28, Math.PI * 0.86), lash);
    lid.rotation.z = Math.PI * 0.07;
    lid.scale.y = eyeShape;
    lid.position.z = re * 0.22;
    eye.add(lid);
    if (woman) {
      const flick = new THREE.Mesh(new THREE.CapsuleGeometry(re * 0.08, re * 0.32, 4, 8), lash);
      flick.position.set(side * re * 1.02, re * 0.18 * eyeShape, re * 0.2);
      flick.rotation.z = side * -1.1;
      eye.add(flick);
    }
    group.add(eye);
    eyes.push(inner);
  }

  // Brows
  const hairColor = new THREE.Color(profile.hairColor);
  const browColor = hairColor.clone().multiplyScalar(hairColor.getHSL({}).l > 0.45 ? 0.62 : 0.9);
  const browMaterial = new THREE.MeshStandardMaterial({ color: browColor, roughness: 0.8 });
  const browRadius = { finas: 0.0027, normales: 0.0042, gruesas: 0.0062 }[profile.brows] * hs;
  for (const side of [-1, 1]) {
    const points = [[0.16, -0.27], [0.36, -0.33], [0.56, -0.28]].map(([phi, dTheta]) => surface(Math.PI / 2 + dTheta - (eyeShape - 0.8) * 0.1, side * phi, 0.015));
    const curve = new THREE.CatmullRomCurve3(points);
    addMesh(new THREE.TubeGeometry(curve, 20, browRadius, 8, false), browMaterial, false);
  }

  // Mouth: a soft smile.
  const beardInflate = { completa: 0.055, candado: 0.04, corta: 0.014 }[profile.beard] || 0;
  const mouthInflate = beardInflate + 0.012;
  const mouthCurve = new THREE.CatmullRomCurve3([
    surface(Math.PI / 2 + 0.375, -0.2, mouthInflate), surface(Math.PI / 2 + 0.42, -0.1, mouthInflate),
    surface(Math.PI / 2 + 0.43, 0, mouthInflate), surface(Math.PI / 2 + 0.42, 0.1, mouthInflate), surface(Math.PI / 2 + 0.375, 0.2, mouthInflate),
  ]);
  const lipColor = new THREE.Color(profile.skin).lerp(new THREE.Color(woman ? '#a53d4d' : '#7c3a32'), woman ? 0.6 : 0.5);
  addMesh(new THREE.TubeGeometry(mouthCurve, 24, (woman ? 0.0046 : 0.0034) * hs, 8, false), new THREE.MeshStandardMaterial({ color: lipColor, roughness: 0.45 }), false);

  // Beard
  const facialHair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.95, transparent: profile.beard === 'corta', opacity: profile.beard === 'corta' ? 0.55 : 1, side: THREE.DoubleSide });
  const shell = (phiMax, thetaTop, thetaBottom, inflate) => new ParametricGeometry((u, v, target) => {
    const phi = (u - 0.5) * 2 * phiMax;
    const top = thetaTop(phi);
    return surface(lerp(top, thetaBottom, v), phi, inflate, target);
  }, 40, 18);
  if (profile.beard === 'corta' || profile.beard === 'completa') {
    const thetaTop = phi => lerp(Math.PI / 2 + 0.25, Math.PI / 2 - 0.12, smoothstep(0.28, 1.45, Math.abs(phi)));
    addMesh(faceOutward(shell(1.6, thetaTop, 2.68, beardInflate), center), facialHair, false);
  }
  if (profile.beard === 'candado') addMesh(faceOutward(shell(0.42, () => Math.PI / 2 + 0.48, 2.62, beardInflate), center), facialHair, false);
  if (['bigote', 'candado', 'completa'].includes(profile.beard)) {
    const lift = profile.beard === 'completa' ? beardInflate + 0.008 : beardInflate * 0.5 + 0.012;
    const stache = new THREE.CatmullRomCurve3([-0.22, -0.11, 0, 0.11, 0.22].map((phi, i) => surface(Math.PI / 2 + (i === 2 ? 0.315 : 0.33 + Math.abs(phi) * 0.25), phi, lift)));
    addMesh(new THREE.TubeGeometry(stache, 20, 0.0065 * hs, 8, false), new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.95 }), false);
  }

  buildHair(profile, { group, surface, center, hx, hy, hz, hs, H });
  return { group, eyes, info: { center, hx, hy, hz, surface, top: center.y + hy * 1.1 } };
}

const HAIR = {
  corto: { front: 0.95, side: 1.45, back: 1.98, a0: 0.5, a1: 1.3, crown: 0.13, edge: 0.03, p: 2 },
  rapado: { front: 1.0, side: 1.5, back: 2.0, a0: 0.5, a1: 1.3, crown: 0.022, edge: 0.012, p: 2, scalp: 0.3 },
  rizado: { front: 0.95, side: 1.45, back: 1.98, a0: 0.5, a1: 1.3, crown: 0.24, edge: 0.07, p: 1.6, noise: 0.05, freq: 9 },
  afro: { front: 0.98, side: 1.55, back: 2.08, a0: 0.5, a1: 1.3, crown: 0.62, edge: 0.13, p: 1.4, noise: 0.06, freq: 11 },
  bob: { front: 0.95, side: 2.25, back: 2.32, a0: 0.55, a1: 1.0, crown: 0.12, edge: 0.09, p: 2, hang: 0.85 },
  largo: { front: 0.92, side: 2.15, back: 2.25, a0: 0.5, a1: 0.95, crown: 0.1, edge: 0.07, p: 2, hang: 0.9, curtain: true },
  cola: { front: 0.95, side: 1.5, back: 2.0, a0: 0.5, a1: 1.3, crown: 0.035, edge: 0.02, p: 2, ponytail: true },
  mono: { front: 0.95, side: 1.5, back: 2.0, a0: 0.5, a1: 1.3, crown: 0.035, edge: 0.02, p: 2, bun: true },
};

function buildHair(profile, { group, surface, center, hx, hy, hz, hs, H }) {
  const style = HAIR[profile.hairStyle];
  if (!style) return;
  const color = style.scalp ? new THREE.Color(profile.hairColor).lerp(new THREE.Color(profile.skin), style.scalp).getStyle() : profile.hairColor;
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', map: hairTexture(color), roughness: 0.62, side: THREE.DoubleSide });
  const add = geometry => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const limit = phi => {
    const away = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)));
    const toSide = smoothstep(style.a0, style.a1, away), toBack = smoothstep(Math.PI / 2, Math.PI, away);
    return lerp(lerp(style.front, style.side, toSide), style.back, toBack);
  };
  const noise = (theta, phi) => style.noise ? style.noise * (Math.sin(theta * style.freq) * Math.sin(phi * style.freq * 0.8) * 0.6 + Math.sin(theta * style.freq * 1.7 + phi * 3) * 0.4) : 0;
  const capPoint = (u, v, target) => {
    const phi = u * Math.PI * 2;
    const theta = v * limit(phi);
    const inflate = style.edge + (style.crown - style.edge) * (1 - v ** style.p) + noise(theta, phi);
    surface(theta, phi, inflate, target);
    if (style.hang && theta > Math.PI / 2) {
      // Below the ears the hair falls straight instead of following the jaw.
      const equator = surface(Math.PI / 2, phi, inflate);
      const k = style.hang * smoothstep(Math.PI / 2, Math.PI / 2 + 0.4, theta);
      target.x = lerp(target.x, equator.x, k);
      target.z = lerp(target.z, equator.z, k);
      target.y -= (theta - Math.PI / 2) * hy * 0.25 * style.hang;
    }
    return target;
  };
  add(faceOutward(new ParametricGeometry(capPoint, 72, 28), center));

  if (style.curtain) {
    const length = H * 0.135;
    const curtain = new ParametricGeometry((u, v, target) => {
      const phi = Math.PI + (u - 0.5) * 3.4;
      const top = surface(Math.PI / 2, phi, style.edge + 0.02);
      const width = Math.max(hx * 1.05, H * 0.075);
      const sinP = Math.sin(phi), cosP = Math.cos(phi);
      const bottomX = sinP * width;
      const bottomZ = cosP < 0 ? cosP * (H * 0.075) : cosP * H * 0.02;
      const k = smoothstep(0, 0.55, v);
      const y = top.y - v * (top.y - (center.y - hy * 0.45 - length)) + (v > 0.95 ? Math.sin(phi * 9) * 0.006 * H * (v - 0.95) * 20 : 0);
      return target.set(lerp(top.x, bottomX, k), y, lerp(top.z, bottomZ + center.z * 0.4, k));
    }, 48, 24);
    add(curtain);
  }
  if (style.ponytail) {
    const start = surface(1.35, Math.PI, style.crown);
    const samples = densify([
      { p: start, rx: 0.026 * hs, rz: 0.026 * hs, t: 0 },
      { p: start.clone().add(new THREE.Vector3(0, -0.015, -0.04 * hs)), rx: 0.034 * hs, rz: 0.032 * hs, t: 0.25 },
      { p: start.clone().add(new THREE.Vector3(0, -0.11 * hs, -0.07 * hs)), rx: 0.03 * hs, rz: 0.028 * hs, t: 0.6 },
      { p: start.clone().add(new THREE.Vector3(0, -0.21 * hs, -0.055 * hs)), rx: 0.012 * hs, rz: 0.012 * hs, t: 1 },
    ], 8);
    add(tubeGeometry(samples, { sides: 18, capEnd: true }));
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.024 * hs, 0.005 * hs, 8, 20), new THREE.MeshStandardMaterial({ color: '#2f2f2c', roughness: 0.6 }));
    band.position.copy(start).add(new THREE.Vector3(0, -0.004, -0.012 * hs));
    band.lookAt(start.clone().add(new THREE.Vector3(0, 0.3, -1)));
    group.add(band);
  }
  if (style.bun) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.052 * hs, 28, 20), material);
    bun.position.copy(surface(0.62, Math.PI, 0.32));
    bun.scale.set(1.05, 0.92, 1);
    bun.castShadow = true;
    group.add(bun);
  }
}
