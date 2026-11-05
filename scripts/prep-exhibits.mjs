/**
 * 凡人展厅壁纸 → public/exhibits/fanren-01..08.webp（卡片，≤960px 宽，≤200KB）
 *                + fanren-0N-thumb.webp（灯箱，256×384 竖幅裁切，≤30KB）
 * 用法：node scripts/prep-exhibits.mjs a.jpg b.png ... （8 张，按光点 0–7 顺序）
 *       node scripts/prep-exhibits.mjs --dir /workspace/cyberpunk-art/fanren-src   （读 fanren-01..08.png/jpg/webp）
 * 灯箱缩略图按 src/data/exhibits.ts 里每张的 focus（object-position）裁切，和卡片焦点一致。
 *       node scripts/prep-exhibits.mjs --placeholder   （生成青绿渐变占位图）
 */
import sharp from 'sharp'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../public/exhibits/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const CARD_MAX = 200 * 1024, THUMB_MAX = 30 * 1024

async function fit(pipe, max, path) {
  for (let q = 82; q >= 30; q -= 6) {
    const buf = await pipe.clone().webp({ quality: q, effort: 6 }).toBuffer()
    if (buf.length <= max || q <= 30) { await sharp(buf).toFile(path); return { q, kb: +(buf.length / 1024).toFixed(1) } }
  }
}

function placeholderSvg(i) {
  const h = 160 + i * 6, W = 1280, H = 720
  const peaks = Array.from({ length: 3 }, (_, k) => {
    const y0 = 430 + k * 70, a = 120 - k * 30
    let d = `M0 ${H} L0 ${y0}`
    for (let x = 0; x <= W; x += 80) d += ` L${x} ${y0 - Math.abs(Math.sin((x + i * 137 + k * 311) / 170)) * a}`
    return `<path d="${d} L${W} ${H} Z" fill="hsl(${h + k * 8},55%,${14 - k * 3}%)" opacity="${0.75 + k * 0.08}"/>`
  }).join('')
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="hsl(${h},70%,38%)"/><stop offset="0.55" stop-color="hsl(${h + 14},60%,18%)"/><stop offset="1" stop-color="hsl(${h + 20},55%,7%)"/></linearGradient>
<radialGradient id="m" cx="${0.25 + (i % 4) * 0.17}" cy="0.28" r="0.22"><stop offset="0" stop-color="#E8FFF6" stop-opacity="0.85"/><stop offset="0.25" stop-color="#9FF5D8" stop-opacity="0.35"/><stop offset="1" stop-color="#9FF5D8" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#m)"/>${peaks}</svg>`)
}

let args = process.argv.slice(2)
const ph = args[0] === '--placeholder'
if (args[0] === '--dir') {
  const d = args[1]
  args = Array.from({ length: 8 }, (_, i) => ['png', 'jpg', 'jpeg', 'webp'].map((e) => `${d}/fanren-0${i + 1}.${e}`).find(existsSync) ?? `${d}/fanren-0${i + 1}.png`)
}
// 焦点：exhibits.ts 里 ex(..., 'X% Y%')
const FOCUS = [...readFileSync(new URL('../src/data/exhibits.ts', import.meta.url), 'utf8').matchAll(/ex\((\d+),[^\n]*'(\d+)% (\d+)%'/g)]
  .reduce((o, m) => (o[+m[1]] = [+m[2] / 100, +m[3] / 100], o), {})
async function focusThumb(src, i, W = 256, H = 384) {
  const m = await src.clone().metadata()
  const r = Math.max(W / m.width, H / m.height), sw = Math.round(m.width * r), sh = Math.round(m.height * r)
  const [fx, fy] = FOCUS[i] ?? [0.5, 0.5]
  return sharp(await src.clone().resize(sw, sh).toBuffer()).extract({ left: Math.round((sw - W) * fx), top: Math.round((sh - H) * fy), width: W, height: H })
}
if (!ph && args.length !== 8) { console.error('需要 8 张图（按光点 0–7 顺序），或 --placeholder'); process.exit(1) }
for (let i = 0; i < 8; i++) {
  const n = String(i + 1).padStart(2, '0')
  const src = sharp(ph ? placeholderSvg(i) : args[i]).rotate()
  const card = src.clone().resize({ width: 960, height: 1280, fit: 'inside', withoutEnlargement: true })
  const thumb = await focusThumb(src, i)
  const a = await fit(card, CARD_MAX, `${OUT}fanren-${n}.webp`)
  const b = await fit(thumb, THUMB_MAX, `${OUT}fanren-${n}-thumb.webp`)
  const m = await sharp(`${OUT}fanren-${n}.webp`).metadata()
  console.log(`fanren-${n}: card ${m.width}×${m.height} ${a.kb}KB q${a.q} | thumb ${b.kb}KB q${b.q}`)
  if (statSync(`${OUT}fanren-${n}.webp`).size > CARD_MAX || statSync(`${OUT}fanren-${n}-thumb.webp`).size > THUMB_MAX) console.warn('  ⚠️ 超出体积上限')
}
