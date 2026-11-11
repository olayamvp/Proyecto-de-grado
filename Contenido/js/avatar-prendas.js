// Prendas del avatar a partir de la foto real del producto: se quita el fondo, se toma el
// color dominante, una muestra de la tela (para estampados, denim, camuflado…) y el diseño
// frontal, y se cosen sobre una forma 3D que sigue las medidas del cuerpo.
import * as THREE from 'three';
import { loftGeometry, tubeGeometry, sliceSamples, densify, clamp, lerp, smoothstep } from './avatar-cuerpo.js';

const imageCache = new Map();
const lookCache = new Map();
const normalize = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');

// ---------- Color fallback from the product text (when the photo cannot be read) ----------
const PALETTE = [
  { words: ['negro', 'black'], color: '#2e2f2d' }, { words: ['blanco', 'marfil', 'crudo', 'ivory', 'off white', 'hueso'], color: '#f0eee8' },
  { words: ['rojo', 'red', 'vino', 'granate', 'burgundy'], color: '#b83f43' }, { words: ['azul', 'blue', 'navy', 'marino', 'denim'], color: '#4f6d8c' },
  { words: ['verde', 'green', 'oliva'], color: '#687852' }, { words: ['amarillo', 'yellow', 'mostaza'], color: '#d1b648' },
  { words: ['naranja', 'orange', 'terracota'], color: '#c66d42' }, { words: ['rosado', 'rosa', 'pink', 'fucsia'], color: '#c7798d' },
  { words: ['morado', 'purpura', 'violeta', 'lila', 'purple'], color: '#806b91' }, { words: ['gris', 'gray', 'grey'], color: '#858780' },
  { words: ['cafe', 'chocolate', 'marron', 'camel', 'brown'], color: '#795844' }, { words: ['beige', 'arena', 'khaki', 'taupe'], color: '#c8b894' },
];
function colorFromText(product) {
  const text = normalize(`${product.color} ${product.name}`);
  const hex = text.match(/#[0-9a-f]{6}\b/i);
  if (hex) return hex[0];
  const match = PALETTE.flatMap(entry => entry.words.map(word => ({ index: text.indexOf(word), color: entry.color })))
    .filter(entry => entry.index >= 0).sort((a, b) => a.index - b.index)[0];
  return match?.color || '#8b8c86';
}
function solidSwatch(color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 64, 64);
  // A faint knit so plain fabric does not look like plastic.
  for (let y = 0; y < 64; y += 2) { ctx.fillStyle = y % 4 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)'; ctx.fillRect(0, y, 64, 1); }
  return canvas;
}
export function fallbackLook(product) {
  const color = colorFromText(product);
  return { color, swatch: solidSwatch(color), decal: null, decalAspect: 1, source: 'texto' };
}

// ---------- Photo loading and analysis ----------
function loadImage(url, cors) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (cors) image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}
async function fetchImage(src) {
  const absolute = new URL(src, location.href);
  if (absolute.origin === location.origin) return loadImage(absolute.href, false);
  try { return await loadImage(absolute.href, true); }
  catch { return loadImage(`/api/imagen?url=${encodeURIComponent(absolute.href)}`, false); }
}
const isSkin = (r, g, b) => r > 95 && g > 40 && b > 20 && r > g && r > b && r - g > 15 && Math.max(r, g, b) - Math.min(r, g, b) > 15;

function analyze(image) {
  const MAX = 480;
  const scale = Math.min(1, MAX / Math.max(image.naturalWidth, image.naturalHeight));
  const w = Math.max(8, Math.round(image.naturalWidth * scale)), h = Math.max(8, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  let data;
  try { data = ctx.getImageData(0, 0, w, h).data; } catch { return null; }
  const N = w * h;
  const background = new Uint8Array(N);
  const borderIndexes = [];
  for (let x = 0; x < w; x++) borderIndexes.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) borderIndexes.push(y * w, y * w + w - 1);
  const transparentBorder = borderIndexes.filter(i => data[i * 4 + 3] < 24).length;
  let mode = 'flat';
  if (transparentBorder > borderIndexes.length * 0.5) {
    for (let i = 0; i < N; i++) background[i] = data[i * 4 + 3] < 40 ? 1 : 0;
  } else {
    const channel = k => borderIndexes.map(i => data[i * 4 + k]).sort((a, b) => a - b)[borderIndexes.length >> 1];
    const bg = [channel(0), channel(1), channel(2)];
    const distance = i => Math.abs(data[i * 4] - bg[0]) + Math.abs(data[i * 4 + 1] - bg[1]) + Math.abs(data[i * 4 + 2] - bg[2]);
    const spread = borderIndexes.reduce((sum, i) => sum + distance(i), 0) / borderIndexes.length;
    if (spread < 40) {
      // Flood fill the studio background from the borders.
      const tolerance = 40 + spread * 1.5;
      const queue = new Int32Array(N);
      let head = 0, tail = 0;
      for (const i of borderIndexes) if (!background[i] && (data[i * 4 + 3] < 40 || distance(i) < tolerance)) { background[i] = 1; queue[tail++] = i; }
      while (head < tail) {
        const i = queue[head++], x = i % w;
        for (const n of [i - 1, i + 1, i - w, i + w]) {
          if (n < 0 || n >= N || background[n] || (n === i - 1 && x === 0) || (n === i + 1 && x === w - 1)) continue;
          if (data[n * 4 + 3] < 40 || distance(n) < tolerance) { background[n] = 1; queue[tail++] = n; }
        }
      }
    } else mode = 'scene';
  }
  // Keep the biggest garment when the photo shows front and back side by side.
  const columns = new Float32Array(w);
  let foreground = 0;
  for (let i = 0; i < N; i++) if (!background[i]) { columns[i % w]++; foreground++; }
  if (mode === 'flat' && foreground < N * 0.03) mode = 'scene';
  let bbox = { x: 0, y: 0, w, h };
  if (mode === 'flat') {
    const runs = [];
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const filled = x < w && columns[x] > h * 0.01;
      if (filled && start < 0) start = x;
      if (!filled && start >= 0) {
        const last = runs[runs.length - 1];
        if (last && start - last.end < w * 0.02) last.end = x; else runs.push({ start, end: x });
        start = -1;
      }
    }
    runs.forEach(run => { run.mass = 0; for (let x = run.start; x < run.end; x++) run.mass += columns[x]; });
    const best = runs.sort((a, b) => b.mass - a.mass)[0] || { start: 0, end: w };
    let top = h, bottom = 0;
    for (let y = 0; y < h; y++) for (let x = best.start; x < best.end; x++) if (!background[y * w + x]) { if (y < top) top = y; if (y > bottom) bottom = y; }
    bbox = { x: best.start, y: top, w: best.end - best.start, h: Math.max(1, bottom - top + 1) };
  }
  // A model photo has skin at the top of the figure (face, neck).
  let topSkin = 0, topFg = 0, skin = 0, fg = 0;
  for (let y = bbox.y; y < bbox.y + bbox.h; y++) {
    for (let x = bbox.x; x < bbox.x + bbox.w; x++) {
      const i = y * w + x;
      if (background[i]) continue;
      const s = isSkin(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      fg++; if (s) skin++;
      if (y < bbox.y + bbox.h * 0.2) { topFg++; if (s) topSkin++; }
    }
  }
  const model = mode === 'flat' && topFg > 0 && topSkin / topFg > 0.22 && skin / fg > 0.03 && skin / fg < 0.55;
  return { image, canvas, data, w, h, scale, background, bbox, mode, model };
}

function regionFor(analysis, role) {
  const { bbox, w, h, mode, model, background } = analysis;
  if (mode === 'scene') return { x: w * 0.3, y: h * 0.28, w: w * 0.4, h: h * 0.44, decal: false, dropSkin: true, swatch: [0.3, 0.3, 0.4, 0.4] };
  const cx = bbox.x + bbox.w / 2;
  if (model) {
    const box = (fx, fy, fw, fh, decal) => ({ x: cx + bbox.w * fx, y: bbox.y + bbox.h * fy, w: bbox.w * fw, h: bbox.h * fh, decal, dropSkin: true, swatch: [0.3, 0.35, 0.4, 0.3] });
    if (role === 'top' || role === 'setTop') return box(-0.22, 0.2, 0.44, 0.27, true);
    if (role === 'bottom' || role === 'setBottom') return box(-0.2, 0.52, 0.4, 0.3, false);
    return box(-0.21, 0.2, 0.42, 0.5, true);
  }
  if (role === 'setTop') return { ...bbox, h: bbox.h * 0.5, decal: true, swatch: [0.1, 0.7, 0.2, 0.2] };
  if (role === 'setBottom') return { ...bbox, y: bbox.y + bbox.h * 0.5, h: bbox.h * 0.5, decal: false, swatch: [0.15, 0.3, 0.25, 0.3] };
  if (role === 'top') {
    // Torso columns measured below the sleeves; the top row skips a hood.
    let left = 0, right = 0, samples = 0;
    for (let fy = 0.72; fy <= 0.88; fy += 0.04) {
      const y = Math.round(bbox.y + bbox.h * fy);
      let l = -1, r = -1;
      for (let x = bbox.x; x < bbox.x + bbox.w; x++) if (!background[y * w + x]) { if (l < 0) l = x; r = x; }
      if (l >= 0) { left += l; right += r; samples++; }
    }
    if (!samples) return { ...bbox, decal: true, swatch: [0.1, 0.72, 0.2, 0.18] };
    left /= samples; right /= samples;
    const torsoWidth = right - left;
    let shoulder = bbox.y;
    for (let y = bbox.y; y < bbox.y + bbox.h * 0.45; y++) {
      let l = -1, r = -1;
      for (let x = bbox.x; x < bbox.x + bbox.w; x++) if (!background[y * w + x]) { if (l < 0) l = x; r = x; }
      if (r - l >= torsoWidth * 0.75) { shoulder = y; break; }
    }
    return { x: left, y: shoulder, w: torsoWidth, h: bbox.y + bbox.h - shoulder, decal: true, swatch: [0.1, 0.72, 0.2, 0.18] };
  }
  if (role === 'bottom') return { ...bbox, decal: false, swatch: [0.14, 0.3, 0.24, 0.28] };
  return { ...bbox, decal: true, swatch: [0.1, 0.45, 0.22, 0.2] };
}

function extractLook(analysis, role, product) {
  const { data, w, background } = analysis;
  const region = regionFor(analysis, role);
  const x0 = Math.max(0, Math.floor(region.x)), y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(analysis.w, Math.ceil(region.x + region.w)), y1 = Math.min(analysis.h, Math.ceil(region.y + region.h));
  const usable = i => !background[i] && !(region.dropSkin && isSkin(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]));
  // Dominant color: the most populated 4-bit bin, then the mean inside it.
  const bins = new Map();
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
    const i = y * w + x;
    if (!usable(i)) continue;
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    bin.n++; bin.r += r; bin.g += g; bin.b += b;
    bins.set(key, bin);
  }
  const best = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  if (!best || best.n < 20) return fallbackLook(product);
  const color = `#${new THREE.Color(best.r / best.n / 255, best.g / best.n / 255, best.b / best.n / 255).getHexString()}`;

  // Fabric sample, mirrored into a seamless tile.
  const [sx, sy, sw, sh] = region.swatch;
  const tile = document.createElement('canvas');
  tile.width = tile.height = 96;
  const tctx = tile.getContext('2d');
  const sampleRect = [x0 + (x1 - x0) * sx, y0 + (y1 - y0) * sy, Math.max(4, (x1 - x0) * sw), Math.max(4, (y1 - y0) * sh)];
  tctx.drawImage(analysis.canvas, ...sampleRect, 0, 0, 96, 96);
  const pixels = tctx.getImageData(0, 0, 96, 96);
  const fill = new THREE.Color(color);
  for (let ty = 0; ty < 96; ty++) for (let tx = 0; tx < 96; tx++) {
    const ox = Math.min(analysis.w - 1, Math.floor(sampleRect[0] + (tx / 96) * sampleRect[2]));
    const oy = Math.min(analysis.h - 1, Math.floor(sampleRect[1] + (ty / 96) * sampleRect[3]));
    if (usable(oy * w + ox)) continue;
    const k = (ty * 96 + tx) * 4;
    pixels.data[k] = fill.r * 255; pixels.data[k + 1] = fill.g * 255; pixels.data[k + 2] = fill.b * 255; pixels.data[k + 3] = 255;
  }
  tctx.putImageData(pixels, 0, 0);
  const swatch = document.createElement('canvas');
  swatch.width = swatch.height = 192;
  const sctx = swatch.getContext('2d');
  sctx.drawImage(tile, 0, 0);
  sctx.save(); sctx.translate(192, 0); sctx.scale(-1, 1); sctx.drawImage(tile, 0, 0); sctx.restore();
  sctx.save(); sctx.translate(0, 192); sctx.scale(1, -1); sctx.drawImage(tile, 0, 0); sctx.restore();
  sctx.save(); sctx.translate(192, 192); sctx.scale(-1, -1); sctx.drawImage(tile, 0, 0); sctx.restore();

  // Front design, cut from the full-resolution photo with the background removed.
  let decal = null, decalAspect = 1;
  if (region.decal) {
    const s = analysis.scale;
    const width = x1 - x0, height = y1 - y0;
    const outW = Math.min(640, Math.round(width / s)), outH = Math.round(outW * height / width);
    decal = document.createElement('canvas');
    decal.width = outW; decal.height = outH;
    const dctx = decal.getContext('2d');
    dctx.drawImage(analysis.image, x0 / s, y0 / s, width / s, height / s, 0, 0, outW, outH);
    const mask = document.createElement('canvas');
    mask.width = width; mask.height = height;
    const mctx = mask.getContext('2d');
    const maskPixels = mctx.createImageData(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) maskPixels.data[(y * width + x) * 4 + 3] = usable((y + y0) * w + x + x0) ? 255 : 0;
    mctx.putImageData(maskPixels, 0, 0);
    dctx.globalCompositeOperation = 'destination-in';
    dctx.imageSmoothingEnabled = true;
    dctx.drawImage(mask, 0, 0, outW, outH);
    decalAspect = outH / outW;
  }
  return { color, swatch, decal, decalAspect, source: analysis.model ? 'modelo' : analysis.mode === 'scene' ? 'escena' : 'foto' };
}

const lookKey = (product, role) => `${product.id}|${role}`;
export function cachedLook(product, role) { return lookCache.get(lookKey(product, role)) || null; }
export async function loadLook(product, role) {
  const key = lookKey(product, role);
  if (lookCache.has(key)) return lookCache.get(key);
  if (!imageCache.has(product.image)) {
    imageCache.set(product.image, product.image ? fetchImage(product.image).then(analyze).catch(() => null) : Promise.resolve(null));
  }
  const analysis = await imageCache.get(product.image);
  let look;
  try { look = analysis ? extractLook(analysis, role, product) : fallbackLook(product); } catch { look = fallbackLook(product); }
  lookCache.set(key, look);
  return look;
}

// ---------- Textures ----------
const TILE = 0.2; // meters covered by one mirrored swatch
function tiledTexture(look, repeatU, repeatV) {
  const texture = new THREE.CanvasTexture(look.swatch);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1, repeatU), Math.max(1, repeatV));
  texture.anisotropy = 4;
  return texture;
}
// Wrap texture for a loft: u 0..0.5 front panel, 0.5..1 back. The photo design goes on the front.
function panelTexture(look, { frontArc, length, decal = true, stretch = false, offsetTop = 0 }) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = look.color; ctx.fillRect(0, 0, 1024, 1024);
  const pxPerMx = 512 / frontArc, pxPerMy = 1024 / length;
  const pattern = ctx.createPattern(look.swatch, 'repeat');
  pattern.setTransform(new DOMMatrix().scale((TILE * pxPerMx) / look.swatch.width, (TILE * pxPerMy) / look.swatch.height));
  ctx.fillStyle = pattern; ctx.fillRect(0, 0, 1024, 1024);
  if (decal && look.decal) {
    const height = stretch ? 1024 : frontArc * look.decalAspect * pxPerMy;
    const art = document.createElement('canvas');
    art.width = look.decal.width; art.height = look.decal.height;
    const actx = art.getContext('2d');
    actx.drawImage(look.decal, 0, 0);
    actx.globalCompositeOperation = 'destination-in';
    const across = actx.createLinearGradient(0, 0, art.width, 0);
    across.addColorStop(0, 'rgba(0,0,0,0)'); across.addColorStop(0.05, 'rgba(0,0,0,1)'); across.addColorStop(0.95, 'rgba(0,0,0,1)'); across.addColorStop(1, 'rgba(0,0,0,0)');
    actx.fillStyle = across; actx.fillRect(0, 0, art.width, art.height);
    const down = actx.createLinearGradient(0, 0, 0, art.height);
    down.addColorStop(0, 'rgba(0,0,0,1)'); down.addColorStop(0.93, 'rgba(0,0,0,1)'); down.addColorStop(1, 'rgba(0,0,0,0)');
    actx.fillStyle = down; actx.fillRect(0, 0, art.width, art.height);
    ctx.drawImage(art, 0, offsetTop * pxPerMy, 512, height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
const fabric = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, color: '#ffffff', roughness: 0.86, metalness: 0, side: THREE.DoubleSide, ...extra });
const trim = (look, shade = 0.86) => new THREE.MeshStandardMaterial({ color: new THREE.Color(look.color).multiplyScalar(shade), roughness: 0.9 });

// ---------- Geometry helpers ----------
function maxAbove(rows, y, span, index) {
  let best = 0;
  for (const row of rows) if (row[0] >= y && row[0] <= y + span) best = Math.max(best, row[index]);
  return best;
}
function ringYs(rig, from, to, extra = []) {
  const ys = rig.torso.rows.map(row => row[0]).filter(y => y > from && y < to);
  const step = rig.H * 0.012;
  const all = [from, ...ys, to, ...extra];
  for (let y = from; y < to; y += step) all.push(y);
  return [...new Set(all.map(y => Math.round(y * 10000) / 10000))].sort((a, b) => a - b);
}
function frontArcAt(rx, rf) { return Math.PI * Math.sqrt((rx * rx + rf * rf) / 2); }

// Upper-body shell that follows the torso with ease, hanging straight below the chest.
function upperRings(rig, from, to, { ease, loose }) {
  const H = rig.H;
  return ringYs(rig, from, to).map(y => {
    const b = rig.torso.at(y);
    const neck = smoothstep(0.822 * H, 0.842 * H, y);
    const e = lerp(ease, 0.004 * H, neck);
    const k = y < 0.66 * H ? loose : loose * 0.4;
    const span = 0.2 * H;
    return {
      y,
      rx: b.rx + e + k * Math.max(0, maxAbove(rig.torso.rows, y, span, 1) - b.rx),
      rf: b.rf + e + k * 0.7 * Math.max(0, maxAbove(rig.torso.rows, y, span, 2) - b.rf),
      rb: b.rb + e * 0.9 + k * 0.6 * Math.max(0, maxAbove(rig.torso.rows, y, span, 3) - b.rb),
    };
  });
}
function meshOf(geometry, material, group) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
// Point on the front surface of a ring set (for zippers, buttons, drawstrings).
function frontPoint(rings, deform, x, y) {
  const ring = rings.reduce((best, r) => Math.abs(r.y - y) < Math.abs(best.y - y) ? r : best, rings[0]);
  const s = Math.sqrt(Math.max(0, 1 - (x / ring.rx) ** 2));
  return new THREE.Vector3(x, y, deform(x, y, s ** 0.82 * ring.rf, ring));
}

function sleeves(rig, look, group, { sleeve, ease, oversize = false, cuff = false }) {
  if (sleeve === 'none' || sleeve === 'straps' || sleeve === 'strapless') return;
  const H = rig.H;
  const tEnd = sleeve === 'long' ? 1.0 : oversize ? 0.5 : 0.26;
  for (const arm of rig.arms) {
    const samples = sliceSamples(arm.samples, tEnd);
    const r0 = samples[0].rx + ease;
    const fitted = samples.map(sample => {
      const k = sample.t / tEnd;
      const minimum = sleeve === 'long' ? r0 * lerp(1, 0.62, k) : r0 * lerp(1, oversize ? 0.95 : 0.88, k);
      const r = Math.max(sample.rx + ease * 0.9, minimum);
      return { ...sample, rx: r, rz: Math.max(sample.rz + ease * 0.9, minimum * 0.96) };
    });
    if (sleeve === 'long') {
      const last = fitted[fitted.length - 1];
      last.p = last.p.clone().addScaledVector(arm.dir, 0.012 * H);
    }
    const length = fitted.reduce((sum, s, i) => i ? sum + s.p.distanceTo(fitted[i - 1].p) : 0, 0);
    const circumference = 2 * Math.PI * r0;
    meshOf(tubeGeometry(fitted, { sides: 28 }), fabric(tiledTexture(look, circumference / TILE, length / TILE)), group);
    // Shoulder cap over the deltoid.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), fabric(tiledTexture(look, 1, 1)));
    cap.position.copy(arm.deltoid.position);
    cap.scale.copy(arm.deltoid.scale).addScalar(ease * 0.95);
    cap.castShadow = true;
    group.add(cap);
    if (cuff) {
      const band = fitted.slice(-Math.max(2, Math.round(fitted.length * 0.1)));
      meshOf(tubeGeometry(band.map(sample => ({ ...sample, rx: sample.rx * 1.02, rz: sample.rz * 1.02 })), { sides: 24 }), trim(look), group);
    }
  }
}

function straps(rig, rings, deform, look, group, { width = 0.006, spread = 0.055 } = {}) {
  const H = rig.H;
  const topRing = rings[rings.length - 1];
  for (const side of [-1, 1]) {
    const x = side * spread * H;
    const front = frontPoint(rings, deform, x, topRing.y - 0.004 * H);
    const shoulderTop = rig.torso.at(0.83 * H);
    const over = new THREE.Vector3(side * (spread + 0.008) * H, 0.835 * H + 0.004 * H, 0);
    const back = new THREE.Vector3(x, topRing.y - 0.004 * H, -topRing.rb * 0.95);
    const curve = new THREE.CatmullRomCurve3([front, new THREE.Vector3(x * 1.02, lerp(front.y, over.y, 0.6), shoulderTop.rf + 0.004 * H), over, new THREE.Vector3(x * 1.02, lerp(back.y, over.y, 0.6), -shoulderTop.rb - 0.004 * H), back]);
    meshOf(new THREE.TubeGeometry(curve, 40, width * H, 8, false), trim(look, 0.95), group);
  }
}

// ---------- Garments ----------
const EASE = { tee: 0.009, hoodie: 0.019, sweater: 0.016, jacket: 0.023, shirt: 0.011, bikini: 0.003 };
export function armClearance(specs, H) {
  let clearance = 0;
  for (const spec of specs) {
    const top = spec.slot === 'set' ? spec.top : spec.slot === 'top' ? spec : spec.slot === 'onePiece' ? spec : null;
    if (!top) continue;
    const base = top.kind === 'dress' ? 0.012 : top.kind === 'body' || top.kind === 'swimsuit' ? 0.004 : EASE[top.kind] ?? 0.01;
    clearance = Math.max(clearance, (base + (top.oversize ? 0.012 : 0)) * H);
  }
  return clearance;
}

function buildTop(rig, spec, look, group) {
  const H = rig.H;
  const ease = ((EASE[spec.kind] ?? 0.01) + (spec.oversize ? 0.012 : 0) - (spec.fitted ? 0.004 : 0)) * H;
  const loose = spec.fitted ? 0.15 : spec.oversize ? 0.85 : spec.kind === 'hoodie' || spec.kind === 'sweater' ? 0.7 : spec.kind === 'jacket' ? 0.75 : 0.45;
  if (spec.kind === 'bikini') {
    const rings = upperRings(rig, 0.695 * H, 0.772 * H, { ease, loose: 0 });
    const deform = rig.torso.deform(false, ease);
    meshOf(loftGeometry(rings, { sides: 56, deform }), fabric(panelTexture(look, { frontArc: frontArcAt(rings[2].rx, rings[2].rf), length: 0.08 * H, decal: false })), group);
    straps(rig, rings, deform, look, group, { width: 0.0045, spread: 0.048 });
    return;
  }
  const ribbed = spec.kind === 'hoodie' || spec.kind === 'sweater';
  const hem = (spec.crop ? 0.635 : spec.oversize ? 0.448 : spec.kind === 'jacket' ? 0.462 : 0.468) * H;
  const top = spec.sleeve === 'none' ? (rig.woman ? 0.778 : 0.785) * H : 0.842 * H;
  const bodyStart = ribbed ? hem + 0.026 * H : hem;
  const rings = upperRings(rig, bodyStart, top, { ease, loose });
  const deform = rig.torso.deform(true, ease);
  const chest = rig.torso.at(0.73 * H);
  const frontArc = frontArcAt(chest.rx + ease, chest.rf + ease);
  // Map the photo from the shoulder line; for sleeveless cuts the shoulders are not on the body.
  const length = top - bodyStart;
  const offsetTop = spec.sleeve === 'none' ? -0.06 * H : 0;
  meshOf(loftGeometry(rings, { sides: 64, deform }), fabric(panelTexture(look, { frontArc, length, offsetTop })), group);
  if (ribbed) {
    const band = upperRings(rig, hem, hem + 0.028 * H, { ease: ease * 0.85, loose: loose * 0.92 });
    meshOf(loftGeometry(band, { sides: 64, deform }), trim(look), group);
  }
  sleeves(rig, look, group, { sleeve: spec.sleeve, ease: ease * 0.9, oversize: spec.oversize, cuff: ribbed || spec.kind === 'jacket' });
  if (spec.sleeve === 'none') straps(rig, rings, deform, look, group, { width: rig.woman ? 0.008 : 0.016, spread: rig.woman ? 0.052 : 0.05 });

  const neckY = 0.836 * H;
  const neckRing = rings[rings.length - 1];
  if (spec.sleeve !== 'none' && (spec.kind === 'tee' || spec.kind === 'sweater')) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(1, 0.11, 10, 40), trim(look, 0.92));
    collar.scale.set(neckRing.rx * 1.02, (neckRing.rf + neckRing.rb) / 2, 0.04 * H);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, neckY + 0.004 * H, (neckRing.rf - neckRing.rb) / 2);
    group.add(collar);
  }
  if (spec.kind === 'hoodie') {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), fabric(tiledTexture(look, 2, 1)));
    const back = rig.torso.at(0.82 * H);
    hood.scale.set(0.085 * H, 0.05 * H, 0.045 * H);
    hood.position.set(0, 0.838 * H, -back.rb - 0.018 * H);
    hood.castShadow = true;
    group.add(hood);
    const roll = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 12, 40), fabric(tiledTexture(look, 3, 1)));
    roll.scale.set(neckRing.rx * 1.25, neckRing.rb * 1.35, 0.06 * H);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(0, neckY + 0.006 * H, -0.004 * H);
    group.add(roll);
    for (const side of [-1, 1]) {
      const points = [0.828, 0.8, 0.775].map(f => frontPoint(rings, deform, side * 0.022 * H, f * H).add(new THREE.Vector3(0, 0, 0.004 * H)));
      meshOf(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.0022 * H, 6, false), new THREE.MeshStandardMaterial({ color: '#efede6', roughness: 0.7 }), group);
    }
  }
  if (spec.kind === 'jacket' || spec.kind === 'shirt') {
    const standRings = [0, 0.5, 1].map(k => ({ y: neckY + k * 0.026 * H, rx: neckRing.rx + (0.006 + k * 0.004) * H, rf: neckRing.rf + (0.006 + k * 0.004) * H, rb: neckRing.rb + (0.006 + k * 0.004) * H }));
    meshOf(loftGeometry(standRings, { sides: 40 }), fabric(tiledTexture(look, 3, 1)), group);
    if (spec.kind === 'jacket') {
      const points = [];
      for (let y = bodyStart; y <= 0.83 * H; y += 0.02 * H) points.push(frontPoint(rings, deform, 0, y).add(new THREE.Vector3(0, 0, 0.0025 * H)));
      meshOf(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 60, 0.0024 * H, 6, false), new THREE.MeshStandardMaterial({ color: '#3a3b38', metalness: 0.6, roughness: 0.35 }), group);
    } else {
      for (let y = bodyStart + 0.03 * H; y < 0.82 * H; y += 0.045 * H) {
        const button = new THREE.Mesh(new THREE.SphereGeometry(0.0045 * H, 12, 8), new THREE.MeshStandardMaterial({ color: '#efece4', roughness: 0.4 }));
        button.position.copy(frontPoint(rings, deform, 0, y)).add(new THREE.Vector3(0, 0, 0.002 * H));
        button.scale.z = 0.45;
        group.add(button);
      }
    }
  }
}

function buildBottom(rig, spec, look, group) {
  const H = rig.H;
  if (spec.kind === 'skirt') return buildSkirt(rig, spec, look, group, { waist: (rig.woman ? 0.6 : 0.59) * H });
  const ease = (spec.kind === 'bikini' ? 0.003 : spec.fit === 'skinny' ? 0.006 : spec.fit === 'wide' ? 0.014 : 0.01) * H;
  const waist = (spec.kind === 'bikini' ? 0.53 : rig.woman ? 0.585 : 0.578) * H;
  const deform = rig.torso.deform(true, ease);
  const hipRings = ringYs(rig, 0.445 * H, waist).map(y => {
    const b = rig.torso.at(y);
    return { y, rx: b.rx + ease, rf: b.rf + ease, rb: b.rb + ease };
  });
  const circumference = 2 * Math.PI * Math.sqrt((hipRings[0].rx ** 2 + hipRings[0].rf ** 2) / 2);
  meshOf(loftGeometry(hipRings, { sides: 56, deform, capBottom: true }), fabric(tiledTexture(look, circumference / TILE, (waist - 0.445 * H) / TILE), { roughness: spec.denim ? 0.95 : 0.88 }), group);
  if (spec.kind === 'bikini') return;
  const band = hipRings.filter(ring => ring.y >= waist - 0.024 * H).map(ring => ({ ...ring, rx: ring.rx + 0.0015 * H, rf: ring.rf + 0.0015 * H, rb: ring.rb + 0.0015 * H }));
  if (band.length > 1) meshOf(loftGeometry(band, { sides: 56, deform }), trim(look, 0.9), group);
  if (spec.denim || spec.fit === 'straight' || spec.fit === 'wide' || spec.fit === 'flare') {
    const points = [];
    for (let y = 0.475 * H; y <= waist - 0.02 * H; y += 0.012 * H) points.push(frontPoint(hipRings, deform, 0.006 * H, y).add(new THREE.Vector3(0, 0, 0.0015 * H)));
    if (points.length > 1) meshOf(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.0016 * H, 5, false), trim(look, 0.78), group);
  }
  const endY = spec.length === 'brief' ? 0.43 * H : spec.length === 'short' ? 0.38 * H : spec.length === 'knee' ? 0.262 * H : 0.03 * H;
  const tEnd = clamp((0.5 * H - endY) / (0.455 * H), 0, 1);
  for (const leg of rig.legs) {
    const samples = sliceSamples(leg.samples, tEnd);
    const kneeSample = leg.samples.reduce((best, s) => Math.abs(s.p.y - 0.285 * H) < Math.abs(best.p.y - 0.285 * H) ? s : best);
    const thigh = leg.samples[0].rx;
    const fitted = samples.map(sample => {
      const y = sample.p.y;
      let minimum = 0;
      if (spec.length !== 'full') minimum = Math.max(thigh * 0.82, sample.rx + ease * 1.4) + (spec.fit === 'wide' ? 0.006 * H : 0);
      else if (spec.fit === 'wide') minimum = thigh * 0.9 + ease;
      else if (spec.fit === 'flare') minimum = y < 0.285 * H ? lerp(kneeSample.rx + ease, kneeSample.rx * 1.9, smoothstep(0.285 * H, 0.05 * H, y)) : 0;
      else if (spec.fit === 'straight') minimum = y < 0.3 * H ? kneeSample.rx + ease * 1.5 : 0;
      else if (spec.fit === 'jogger' && sample.t > tEnd - 0.06) minimum = 0;
      const extra = spec.fit === 'skinny' ? ease * 0.5 : ease;
      const r = Math.max(sample.rx + extra, minimum);
      return { ...sample, rx: r, rz: Math.max(sample.rz + extra, minimum * 0.97) };
    });
    if (spec.length === 'full') fitted[fitted.length - 1].p.y = Math.max(0.026 * H, fitted[fitted.length - 1].p.y);
    const length = fitted[0].p.distanceTo(fitted[fitted.length - 1].p);
    const around = 2 * Math.PI * fitted[0].rx;
    meshOf(tubeGeometry(fitted, { sides: 32 }), fabric(tiledTexture(look, around / TILE, length / TILE), { roughness: spec.denim ? 0.95 : 0.88 }), group);
    if (spec.fit === 'jogger' && spec.length === 'full') {
      const ankle = fitted[fitted.length - 1];
      const cuff = densify([
        { p: ankle.p.clone().add(new THREE.Vector3(0, 0.035 * H, 0)), rx: ankle.rx + 0.006 * H, rz: ankle.rz + 0.006 * H, t: 0 },
        { p: ankle.p.clone(), rx: ankle.rx + 0.004 * H, rz: ankle.rz + 0.004 * H, t: 1 },
      ], 2);
      meshOf(tubeGeometry(cuff, { sides: 28 }), trim(look, 0.9), group);
    }
  }
}

// Skirt (or the skirt of a dress): hangs from the hips and opens toward the hem.
function skirtRings(rig, from, to, { ease, flare }) {
  const H = rig.H;
  const hipY = (rig.woman ? 0.51 : 0.5) * H;
  const hip = rig.torso.at(hipY);
  const leg = rig.legs[1];
  return ringYs(rig, from, to).map(y => {
    const b = rig.torso.at(Math.max(y, 0.455 * H));
    if (y >= hipY) return { y, rx: b.rx + ease, rf: b.rf + ease, rb: b.rb + ease };
    const drop = hipY - y;
    const legSample = leg.samples.reduce((best, s) => Math.abs(s.p.y - y) < Math.abs(best.p.y - y) ? s : best);
    const legOuter = Math.abs(legSample.p.x) + legSample.rx + ease;
    return {
      y,
      rx: Math.max(hip.rx + ease + flare * drop * 0.55, legOuter),
      rf: Math.max(hip.rf + ease + flare * drop * 0.4, legSample.rx + ease),
      rb: Math.max(hip.rb + ease + flare * drop * 0.45, legSample.rx + ease),
    };
  });
}
const SKIRT_HEM = { mini: 0.4, knee: 0.3, midi: 0.2, maxi: 0.055 };
function buildSkirt(rig, spec, look, group, { waist }) {
  const H = rig.H;
  const ease = 0.009 * H;
  const rings = skirtRings(rig, SKIRT_HEM[spec.length] * H, waist, { ease, flare: spec.flare ?? 0.3 });
  const circumference = 2 * Math.PI * rings[0].rx;
  meshOf(loftGeometry(rings, { sides: 64, deform: rig.torso.deform(true, ease) }), fabric(tiledTexture(look, circumference / TILE, (waist - rings[0].y) / TILE)), group);
}

function buildOnePiece(rig, spec, look, group) {
  const H = rig.H;
  const fittedBody = spec.kind !== 'dress';
  const ease = (fittedBody ? 0.004 : spec.fitted ? 0.007 : 0.009) * H;
  const top = spec.sleeve === 'straps' || spec.sleeve === 'strapless' ? (rig.woman ? 0.778 : 0.785) * H : 0.842 * H;
  const waist = 0.6 * H;
  const bottom = fittedBody ? 0.452 * H : SKIRT_HEM[spec.length] * H;
  const upper = upperRings(rig, Math.max(bottom, 0.455 * H), top, { ease, loose: fittedBody ? 0 : 0.2 });
  let rings = upper;
  if (!fittedBody) {
    const skirt = skirtRings(rig, bottom, top, { ease, flare: spec.fitted ? 0.12 : 0.45 });
    // Blend from the fitted bodice into the skirt around the waist.
    rings = skirt.map(ring => {
      const bodice = upper.reduce((best, r) => Math.abs(r.y - ring.y) < Math.abs(best.y - ring.y) ? r : best, upper[0]);
      const k = smoothstep(waist - 0.03 * H, waist + 0.03 * H, ring.y);
      return ring.y < 0.455 * H ? ring : { y: ring.y, rx: lerp(ring.rx, bodice.rx, k), rf: lerp(ring.rf, bodice.rf, k), rb: lerp(ring.rb, bodice.rb, k) };
    });
  }
  const deform = rig.torso.deform(true, ease);
  const chest = rig.torso.at(0.73 * H);
  meshOf(loftGeometry(rings, { sides: 64, deform, capBottom: fittedBody }), fabric(panelTexture(look, { frontArc: frontArcAt(chest.rx + ease, chest.rf + ease), length: top - bottom, stretch: !fittedBody })), group);
  if (spec.sleeve === 'straps') straps(rig, rings, deform, look, group, { width: 0.0045, spread: 0.05 });
  sleeves(rig, look, group, { sleeve: spec.sleeve, ease: ease * 0.9 });
}

// Neutral underwear so the avatar is never shown bare when a slot is empty.
const BASE_LOOK = (() => { const color = '#55564f'; return { color, swatch: solidSwatch(color), decal: null, decalAspect: 1, source: 'base' }; })();

export function buildGarments(rig, items) {
  const group = new THREE.Group();
  group.name = 'ropa';
  const covered = new Set(items.flatMap(({ spec }) => spec.slot === 'top' ? ['top'] : spec.slot === 'bottom' ? ['bottom'] : ['top', 'bottom']));
  if (!covered.has('bottom')) buildBottom(rig, rig.woman ? { kind: 'bikini' } : { kind: 'pants', length: 'brief', fit: 'skinny' }, BASE_LOOK, group);
  if (!covered.has('top') && rig.woman) buildTop(rig, { kind: 'bikini', sleeve: 'none' }, BASE_LOOK, group);
  for (const { spec, looks } of items) {
    if (spec.slot === 'top') buildTop(rig, spec, looks.top, group);
    else if (spec.slot === 'bottom') buildBottom(rig, spec, looks.bottom, group);
    else if (spec.slot === 'onePiece') buildOnePiece(rig, spec, looks.onePiece, group);
    else if (spec.slot === 'set') {
      // Bottom first so the top hangs over the waistband.
      buildBottom(rig, { slot: 'bottom', ...spec.bottom }, looks.setBottom, group);
      buildTop(rig, { slot: 'top', ...spec.top }, looks.setTop, group);
    }
  }
  return group;
}

export function rolesFor(spec) {
  if (spec.slot === 'set') return ['setTop', 'setBottom'];
  return [spec.slot];
}
