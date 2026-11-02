import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://127.0.0.1:5173/cyberpunk-drive/'
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' })
const page = await ctx.newPage()
await page.goto(BASE + '?debug', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForFunction(() => window.__car && window.__expansion, { timeout: 90000 })
await page.waitForTimeout(6000)
const put = (sel) => page.evaluate((sel) => {
  const E = window.__expansion, c = window.__car
  let f, yaw
  if (sel.ring != null) { const r = E.RAMPS.find((r) => r.deg === sel.ring) ?? E.RAMPS[0]; f = r.frames[r.deckOwn]; yaw = Math.atan2(-f.tx, -f.tz) }
  else { const B = window.__bridge; f = { x: B.c[0] - B.dir[0] * 4, y: B.H + 0.6, z: B.c[1] - B.dir[1] * 4 }; yaw = Math.atan2(-B.dir[0], -B.dir[1]) }
  c.setTranslation({ x: f.x, y: f.y + 0.8, z: f.z }, true)
  c.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
  c.setLinvel({ x: 0, y: 0, z: 0 }, true); c.setAngvel({ x: 0, y: 0, z: 0 }, true)
}, sel)
const outs = ['screenshots', '/workspace/cyberpunk-art/send-shots/1102']
const snap = async (n) => { for (const o of outs) await page.screenshot({ path: `${o}/${n}.png` }) }
await put({ ring: 20 }); await page.waitForTimeout(4000); await snap('1102-guardrail-arc')
await put({ bridge: 1 }); await page.waitForTimeout(4000); await snap('1102-bridge-deck')
await snap('1102-debug-collapsed')
await page.click('#debug-toggle, [aria-label="展开帧率面板"]'); await page.waitForTimeout(800); await snap('1102-debug-expanded')
const rep = await page.evaluate(() => {
  const r = (e) => e && e.getBoundingClientRect().toJSON()
  const box = document.querySelector('#debug-panel')
  return { panel: r(box), minimap: r(document.querySelector('#minimap')), joy: r(document.querySelector('.joystick-base')), buttons: [...document.querySelectorAll('button')].map(r) }
})
console.log(JSON.stringify(rep))
await b.close()
