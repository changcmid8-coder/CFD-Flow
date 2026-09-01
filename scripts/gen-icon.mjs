// Generates src-tauri/icons/icon.ico — a 32x32 32bpp BMP-format icon
// with the CFD-Flow brand mark (deep-blue tile + light flow bar).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'src-tauri', 'icons')
mkdirSync(outDir, { recursive: true })

const SIZE = 32
const px = new Uint8Array(SIZE * SIZE * 4) // BGRA, bottom-up rows

const setPx = (x, y, r, g, b, a = 255) => {
  // bottom-up: row 0 in buffer is the bottom visual row
  const row = SIZE - 1 - y
  const i = (row * SIZE + x) * 4
  px[i] = b; px[i + 1] = g; px[i + 2] = r; px[i + 3] = a
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // rounded-square mask
    const dx = Math.min(x, SIZE - 1 - x)
    const dy = Math.min(y, SIZE - 1 - y)
    const corner = 6
    if (dx < corner && dy < corner && dx + dy < corner - 1) {
      setPx(x, y, 0, 0, 0, 0)
      continue
    }
    // vertical gradient #1E3A8A -> #0F2461
    const t = y / (SIZE - 1)
    const r = Math.round(30 + (15 - 30) * t)
    const g = Math.round(58 + (36 - 58) * t)
    const b = Math.round(138 + (97 - 138) * t)
    setPx(x, y, r, g, b)
  }
}
// light "flow" bars
const bar = (x0, x1, y, r, g, b) => { for (let x = x0; x <= x1; x++) setPx(x, y, r, g, b) }
bar(7, 24, 11, 226, 240, 255)
bar(7, 18, 16, 147, 197, 253)
bar(13, 24, 21, 96, 165, 250)

const andMask = Buffer.alloc(SIZE * 4) // all opaque
const bih = Buffer.alloc(40)
bih.writeUInt32LE(40, 0)
bih.writeInt32LE(SIZE, 4)
bih.writeInt32LE(SIZE * 2, 8) // double height for ICO
bih.writeUInt16LE(1, 12)
bih.writeUInt16LE(32, 14)
bih.writeUInt32LE(0, 16) // BI_RGB
bih.writeUInt32LE(SIZE * SIZE * 4 + andMask.length, 20)

const img = Buffer.concat([bih, Buffer.from(px), andMask])
const bytesInRes = img.length

const dir = Buffer.alloc(6)
dir.writeUInt16LE(0, 0)
dir.writeUInt16LE(1, 2) // icon
dir.writeUInt16LE(1, 4)

const entry = Buffer.alloc(16)
entry.writeUInt8(SIZE, 0)
entry.writeUInt8(SIZE, 1)
entry.writeUInt8(0, 2)
entry.writeUInt8(0, 3)
entry.writeUInt16LE(1, 4)
entry.writeUInt16LE(32, 6)
entry.writeUInt32LE(bytesInRes, 8)
entry.writeUInt32LE(22, 12) // 6 + 16

writeFileSync(join(outDir, 'icon.ico'), Buffer.concat([dir, entry, img]))
console.log('written', join(outDir, 'icon.ico'))
