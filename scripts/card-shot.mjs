import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://127.0.0.1:5175/cyberpunk-drive/'
const MOB = process.env.MOB === '1', W = +process.env.W, H = +process.env.H, NAME = process.env.NAME
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext(MOB ? { viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
  : { viewport: { width: W, height: H } })
const page = await ctx.newPage()
await page.goto(BASE + '?debug', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForFunction(() => window.__car && window.__expansion, { timeout: 90000 })
await page.waitForTimeout(6000)
// 关掉 SwiftShader 软渲染提示（只影响无头环境）
await page.evaluate(() => document.querySelectorAll('button').forEach((x) => { if (x.textContent?.trim() === '×' && x.closest('[class*=warn],[class*=toast],[class*=gpu]')) x.click() }))
await page.evaluate(() => { const c = window.__car
  c.setTranslation({ x: 0, y: 1.6, z: -88 }, true); c.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
  c.setLinvel({ x: 0, y: 0, z: 0 }, true); c.setAngvel({ x: 0, y: 0, z: 0 }, true) })
await page.waitForTimeout(3000)
const r = await page.evaluate(() => {
  const g = (s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return q.width > 0 ? [q.left, q.top, q.right, q.bottom].map(Math.round) : null }
  return { card: g('#light-card'), title: document.querySelector('#light-card .pf-title')?.textContent, joystick: g('.joystick-base'), minimap: g('#minimap'), fps: g('#debug-panel'), hud: g('.hud'), counter: document.querySelector('#collect-hud')?.textContent }
})
const ov = (a, c) => !!(a && c) && a[0] < c[2] && a[2] > c[0] && a[1] < c[3] && a[3] > c[1]
console.log(JSON.stringify({ ...r, overlap: { joystick: ov(r.card, r.joystick), minimap: ov(r.card, r.minimap), fps: ov(r.card, r.fps) } }))
await page.screenshot({ path: `/workspace/cyberpunk-art/send-shots/1104-cards/${NAME}.png` })
await b.close()
