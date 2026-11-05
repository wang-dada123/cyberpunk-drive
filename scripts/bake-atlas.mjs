/**
 * 预烘凡人灯箱正面图集 → public/exhibits/fanren-atlas.webp（8 格 4×2，1344×1008）。
 * 换壁纸 / 改片名 / 改灯箱样式后重跑：先起 dev server，再
 *   BASE=http://127.0.0.1:5173/cyberpunk-drive/ node scripts/bake-atlas.mjs
 * 绘制代码在 src/utils/boardAtlasPaint.ts（运行时不导入，避免行驶中 Canvas 光栅化/上传长帧）。
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:5173/cyberpunk-drive/'
const Q = Number(process.env.Q || 0.9)
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.goto(BASE + 'favicon.svg')
const r = await page.evaluate(async ([base, q]) => {
  const P = await import(base + 'src/utils/boardAtlasPaint.ts')
  const { EXHIBITS } = await import(base + 'src/data/exhibits.ts')
  const { loadBrushFont } = await import(base + 'src/utils/brushFont.ts')
  const brush = await loadBrushFont()
  const imgs = new Map()
  await Promise.all(EXHIBITS.map((e) => new Promise((res, rej) => {
    const im = new Image(); im.onload = () => { imgs.set(e.thumb, im); res() }; im.onerror = () => rej(new Error('thumb ' + e.thumb)); im.src = e.thumb
  })))
  const cv = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas') // favicon.svg 文档里要用 XHTML 命名空间
  P.paintAtlas(cv, EXHIBITS, imgs, brush)
  return { brush, n: imgs.size, w: cv.width, h: cv.height, url: cv.toDataURL('image/webp', q) }
}, [BASE, Q])
if (!r.brush || r.n !== 8) throw new Error(`字体或缩略图未就绪 brush=${r.brush} thumbs=${r.n}`)
const buf = Buffer.from(r.url.split(',')[1], 'base64')
writeFileSync('public/exhibits/fanren-atlas.webp', buf)
console.log(`fanren-atlas.webp ${r.w}×${r.h} ${(buf.length / 1024).toFixed(0)}KB q=${Q}`)
await browser.close()
