/**
 * Generates the PWA icon set as real PNG files.
 *
 * The logo is drawn procedurally into a pixel buffer and encoded with Node's
 * built-in zlib, so no image library or design tool is needed. Run this again
 * after editing the shape constants below:
 *
 *   node scripts/generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------------- PNG encoding ---------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Encodes an RGBA pixel buffer as a PNG. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Each scanline is prefixed with a filter byte. 0 means "no filter".
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- Drawing ---------------- */

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

// Plate gradient stops.
const C1 = [99, 102, 241]; // indigo
const C2 = [139, 92, 246]; // violet
const C3 = [236, 72, 153]; // pink
const AMBER = [253, 230, 138];

/** Signed test: is point inside the rounded plate? */
function inRoundedRect(x, y, r) {
  const qx = Math.abs(x - 0.5) - (0.5 - r);
  const qy = Math.abs(y - 0.5) - (0.5 - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) <= r;
}

/** Convex polygon test via consistent-sign cross products. */
function inPoly(px, py, pts) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// The two open pages of the book, in unit coordinates.
const LEFT_PAGE = [
  [0.215, 0.355],
  [0.478, 0.318],
  [0.478, 0.702],
  [0.243, 0.735],
];
const RIGHT_PAGE = [
  [0.785, 0.355],
  [0.522, 0.318],
  [0.522, 0.702],
  [0.757, 0.735],
];

const DOT = { x: 0.71, y: 0.325, r: 0.062 };

/**
 * Samples the logo at one point.
 * maskable pads the artwork so Android can crop it to any shape safely.
 */
function sample(x, y, { maskable }) {
  const scale = maskable ? 0.72 : 1;
  const px = (x - 0.5) / scale + 0.5;
  const py = (y - 0.5) / scale + 0.5;

  const radius = maskable ? 0.5 : 0.28;

  if (!inRoundedRect(px, py, radius)) return [0, 0, 0, 0];

  // Diagonal gradient across the plate.
  const t = clamp((px + py) / 2, 0, 1);
  let base = t < 0.55 ? mix(C1, C2, t / 0.55) : mix(C2, C3, (t - 0.55) / 0.45);

  // Soft sheen across the top half.
  const sheen = clamp(1 - py / 0.55, 0, 1) * 0.22;
  base = mix(base, [255, 255, 255], sheen);

  let colour = base;
  let alpha = 255;

  if (inPoly(px, py, LEFT_PAGE)) {
    colour = [255, 255, 255];
  } else if (inPoly(px, py, RIGHT_PAGE)) {
    colour = [237, 233, 254];
  } else {
    const d = Math.hypot(px - DOT.x, py - DOT.y);
    if (d <= DOT.r) colour = AMBER;
    else if (d <= DOT.r + 0.02) colour = mix(base, AMBER, 0.55);
  }

  return [Math.round(colour[0]), Math.round(colour[1]), Math.round(colour[2]), alpha];
}

function renderIcon(size, opts = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3; // supersampling per axis for smooth edges

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x + (sx + 0.5) / SS) / size;
          const uy = (y + (sy + 0.5) / SS) / size;
          const c = sample(ux, uy, opts);
          r += c[0];
          g += c[1];
          b += c[2];
          a += c[3];
        }
      }

      const n = SS * SS;
      const i = (y * size + x) * 4;
      buf[i] = Math.round(r / n);
      buf[i + 1] = Math.round(g / n);
      buf[i + 2] = Math.round(b / n);
      buf[i + 3] = Math.round(a / n);
    }
  }

  return encodePng(size, size, buf);
}

/* ---------------- Write the set ---------------- */

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-180.png', 180, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
];

for (const [name, size, opts] of jobs) {
  const png = renderIcon(size, opts);
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`${name.padEnd(26)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log('\nIcons written to public/icons/');