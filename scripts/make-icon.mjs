/**
 * Draws build/icon.png — the app icon, from nothing.
 *
 * Hand-rolled rather than exported from a design tool so the mark stays in the
 * repository as code: it is the same glyph the sidebar draws, and the same two
 * colours the app is built from. Run it with `npm run icon` after changing
 * either.
 *
 * Everything is axis-aligned rectangles and one triangle, supersampled 4× for
 * clean edges, then deflated into a PNG by hand — no image library, no build
 * step, nothing to install.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const SIZE = 1024
const SS = 4 // supersampling factor
const W = SIZE * SS

const INK = [0x05, 0x08, 0x0c]
const NEON = [0x35, 0xe7, 0xff]
const LINE = [0x1b, 0x2a, 0x38]

/** RGBA canvas, transparent to begin with. */
const pixels = new Uint8Array(W * W * 4)

function blend(x, y, [r, g, b], alpha) {
  if (x < 0 || y < 0 || x >= W || y >= W || alpha <= 0) return
  const at = (y * W + x) * 4
  const was = pixels[at + 3] / 255
  const now = alpha + was * (1 - alpha)
  if (now <= 0) return
  for (let i = 0; i < 3; i += 1) {
    pixels[at + i] = Math.round((pixels[at + i] * was * (1 - alpha) + [r, g, b][i] * alpha) / now)
  }
  pixels[at + 3] = Math.round(now * 255)
}

/** `clip` keeps a fill inside the rounded ground — the grid must not spill. */
function rect(x0, y0, w, h, colour, alpha = 1, clip = false) {
  for (let y = Math.round(y0); y < Math.round(y0 + h); y += 1) {
    for (let x = Math.round(x0); x < Math.round(x0 + w); x += 1) {
      if (clip && pixels[(y * W + x) * 4 + 3] === 0) continue
      blend(x, y, colour, alpha)
    }
  }
}

/** A rounded rectangle — the macOS icon ground. */
function roundedRect(x0, y0, w, h, radius, colour) {
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = Math.max(radius - x, x - (w - radius - 1), 0)
      const dy = Math.max(radius - y, y - (h - radius - 1), 0)
      if (dx * dx + dy * dy <= radius * radius) blend(x0 + x, y0 + y, colour, 1)
    }
  }
}

/** The arrowhead: a solid triangle pointing right. */
function triangle(tipX, midY, height, colour) {
  const halfHeight = height / 2
  for (let y = -halfHeight; y <= halfHeight; y += 1) {
    const inset = (Math.abs(y) / halfHeight) * height
    for (let x = tipX - height; x <= tipX - inset; x += 1) {
      blend(Math.round(x), Math.round(midY + y), colour, 1)
    }
  }
}

// --- the mark -------------------------------------------------------------
roundedRect(0, 0, W, W, W * 0.22, INK)

// A faint grid, the same one the app's background carries.
const pitch = W / 12
for (let i = 1; i < 12; i += 1) {
  rect(Math.round(i * pitch), 0, SS, W, LINE, 0.55, true)
  rect(0, Math.round(i * pitch), W, SS, LINE, 0.55, true)
}

const stroke = W * 0.045
const inset = W * 0.2
const arm = W * 0.13
const far = W - inset

// Four corner brackets: the frame a stream passes through.
for (const [cx, cy, sx, sy] of [
  [inset, inset, 1, 1],
  [far, inset, -1, 1],
  [inset, far, 1, -1],
  [far, far, -1, -1]
]) {
  const x = sx > 0 ? cx : cx - arm
  const y = sy > 0 ? cy : cy - stroke
  rect(x, y, arm, stroke, NEON)
  rect(sx > 0 ? cx : cx - stroke, sy > 0 ? cy : cy - arm, stroke, arm, NEON)
}

// The stream itself, ending in an arrowhead.
const mid = W / 2
const barLeft = inset + arm * 0.55
const head = W * 0.115
rect(barLeft, mid - stroke / 2, far - arm * 0.55 - barLeft - head * 0.55, stroke, NEON)
triangle(far - arm * 0.4, mid, head, NEON)

// --- downsample and encode ------------------------------------------------
const out = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const totals = [0, 0, 0, 0]
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const at = ((y * SS + sy) * W + (x * SS + sx)) * 4
        for (let i = 0; i < 4; i += 1) totals[i] += pixels[at + i]
      }
    }
    const at = (y * SIZE + x) * 4
    for (let i = 0; i < 4; i += 1) out[at + i] = Math.round(totals[i] / (SS * SS))
  }
}

/** PNG wants each row prefixed with a filter byte; 0 means "none". */
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0
  out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // colour type: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', png)
console.log(
  `build/icon.png — ${SIZE}×${SIZE}, ${(png.length / 1024).toFixed(0)} KB, ` +
    `sha256 ${createHash('sha256').update(png).digest('hex').slice(0, 12)}`
)
