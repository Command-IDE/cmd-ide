/**
 * gen.mjs  —  Renders logo-dark.svg at multiple sizes, writes:
 *   • appicon.png          (512×512 PNG — used by Wails)
 *   • icon.ico             (multi-size: 256, 48, 32, 16  — Windows executable icon)
 *
 * Usage:  node gen.mjs <svg-path> <out-dir>
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const [,, svgPath, outDir] = process.argv
if (!svgPath || !outDir) {
  console.error('Usage: node gen.mjs <svg-path> <out-dir>')
  process.exit(1)
}

const svg = readFileSync(svgPath, 'utf8')

// ── Render one PNG at a given pixel width ─────────────────────────────────────
function renderPng(width) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } })
  return Buffer.from(resvg.render().asPng())
}

// ── Wrap multiple PNGs into an ICO file ───────────────────────────────────────
function buildIco(pngSizes) {
  const pngs = pngSizes.map(s => ({ size: s, data: renderPng(s) }))
  const count = pngs.length

  // ICONDIR header: reserved(2), type=1(2), count(2)
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)   // reserved
  header.writeUInt16LE(1, 2)   // type: 1 = ICO
  header.writeUInt16LE(count, 4)

  // Directory entries: 16 bytes each
  const dirSize    = count * 16
  let   dataOffset = 6 + dirSize

  const dirs = []
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16)
    // width/height: 0 encodes 256; otherwise direct value
    entry.writeUInt8(size >= 256 ? 0 : size, 0)   // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1)   // height
    entry.writeUInt8(0, 2)                         // color count (0 = no palette)
    entry.writeUInt8(0, 3)                         // reserved
    entry.writeUInt16LE(1, 4)                      // planes
    entry.writeUInt16LE(32, 6)                     // bit count
    entry.writeUInt32LE(data.length, 8)            // image data size
    entry.writeUInt32LE(dataOffset, 12)            // offset to image data
    dirs.push(entry)
    dataOffset += data.length
  }

  return Buffer.concat([header, ...dirs, ...pngs.map(p => p.data)])
}

// ── Generate files ────────────────────────────────────────────────────────────
console.log('Rendering appicon.png (512×512)…')
const appiconPng = renderPng(512)
writeFileSync(join(outDir, 'appicon.png'), appiconPng)
console.log(`  Written: ${join(outDir, 'appicon.png')} (${appiconPng.length} bytes)`)

console.log('Rendering icon.ico (256, 128, 48, 32, 16)…')
const ico = buildIco([256, 128, 48, 32, 16])
writeFileSync(join(outDir, 'icon.ico'), ico)
console.log(`  Written: ${join(outDir, 'icon.ico')} (${ico.length} bytes)`)
