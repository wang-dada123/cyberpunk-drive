import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://127.0.0.1:5173/cyberpunk-drive/'
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' })
const page = await ctx.newPage()
await page.goto(BASE + '?debug', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForFunction(() => window.__car && window.__expansion, { timeout: 90000 })
await page.waitForTimeout(6000)
const put = (f, back) => page.evaluate(([f, back]) => {
  const c = window.__car, yaw = Math.atan2(-f.tx, -f.tz)
  window.__expansion.resetDrive?.()
  c.setTranslation({ x: f.x - f.tx * back, y: f.y + 0.8, z: f.z - f.tz * back }, true)
  c.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
  c.setLinvel({ x: 0, y: 0, z: 0 }, true); c.setAngvel({ x: 0, y: 0, z: 0 }, true)
}, [f, back])
const TAG = process.env.TAG || 'after'
const frames = await page.evaluate(() => {
  const E = window.__expansion, c = E.J2_DEG * Math.PI / 180, F = (j, s = 1) => ({ x: j.x, y: j.y, z: j.z, tx: -j.tx * s, tz: -j.tz * s })
  const sp = E.spiral(), a = sp[Math.floor(sp.length * 0.3)], b2 = sp[Math.floor(sp.length * 0.3) + 1], L = Math.hypot(b2.x - a.x, b2.z - a.z)
  const R = E.RAMPS[0], rf = R.frames[Math.floor(R.join * 0.5)]
  return { s2: E.S2.frames[Math.floor(E.S2.join * 0.55)], ring: F(E.frameAt(1.0)), ramp: rf,
    s1: { x: a.x, y: a.y, z: a.z, tx: (b2.x - a.x) / L, tz: (b2.z - a.z) / L }, j2: F(E.frameAt(c - 20 * 2 / 255)) }
})
const outs = ['screenshots', '/workspace/cyberpunk-art/send-shots/1104']
const snap = async (n) => { for (const o of outs) await page.screenshot({ path: `${o}/1104-${n}-${TAG}.png` }) }
for (const k of ['s2', 'ring', 'ramp', 's1', 'j2']) { await put(frames[k], 0); await page.waitForTimeout(4000); await snap(k) }
await page.click('#debug-toggle, [aria-label="展开帧率面板"]').catch(() => {}); await page.waitForTimeout(1500)
console.log(await page.evaluate(() => document.querySelector('#debug-panel')?.innerText))
await b.close()
