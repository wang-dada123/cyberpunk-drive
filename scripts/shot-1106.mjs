/**
 * 1106 S2 窄巷门汇入段护栏/路面同机位截图。TAG=before|after，BASE 指 dev server（默认 5178）。
 * 输出 /workspace/cyberpunk-art/send-shots/1106-rail-overlap/s2-gate-<TAG>.png（844×390 手机横屏）、
 *      s2-gate-<TAG>-ring.png（汇入后环线弯道中央）、s2-gate-<TAG>-desktop.png（1440×900）
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const OUT = process.env.OUT || '/workspace/cyberpunk-art/send-shots/1106-rail-overlap'
const TAG = process.env.TAG || 'before'
const BASE = process.env.BASE || 'http://127.0.0.1:5178/cyberpunk-drive/'
mkdirSync(OUT, { recursive: true })
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
async function shoot(mobile, W, H, spots) {
  const ctx = await b.newContext(mobile ? { viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: IOS } : { viewport: { width: W, height: H } })
  const page = await ctx.newPage()
  await page.goto(BASE + '?shot', { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => window.__car && window.__expansion, null, { timeout: 120000 })
  await page.waitForTimeout(4000)
  for (const [name, spot] of spots) {
    await page.evaluate((spot) => {
      document.getElementById('hw-accel-tip')?.remove()
      const E = window.__expansion, S = E.S2
      let f
      if (spot.s2 != null) f = S.frames[spot.s2]
      else { const g = E.frameAt(spot.th * Math.PI / 180); f = { x: g.x + g.px * (spot.lat ?? 0), y: g.y, z: g.z + g.pz * (spot.lat ?? 0), tx: -g.tx, tz: -g.tz } }
      const yaw = Math.atan2(-f.tx, -f.tz), c = window.__car
      E.resetDrive?.()
      c.setTranslation({ x: f.x, y: f.y + 1.2, z: f.z }, true); c.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
      c.setLinvel({ x: 0, y: 0, z: 0 }, true); c.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }, spot)
    await page.waitForTimeout(9000)
    await page.evaluate(() => document.getElementById('hw-accel-tip')?.remove())
    await page.screenshot({ path: `${OUT}/${name}` })
    console.log('shot', name, JSON.stringify(await page.evaluate(() => { const p = window.__car.translation(); return [p.x, p.y, p.z].map((v) => +v.toFixed(1)) })))
  }
  await ctx.close()
}
try {
  await shoot(true, 844, 390, [[`s2-gate-${TAG}.png`, { s2: 52 }], [`s2-gate-${TAG}-ring.png`, { th: 112, lat: 2 }]])
  await shoot(false, 1440, 900, [[`s2-gate-${TAG}-desktop.png`, { s2: 52 }]])
} finally { await b.close() }
