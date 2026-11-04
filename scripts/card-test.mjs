import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173/cyberpunk-drive/'
const MOB = process.env.MOB === '1'
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext(MOB ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
  : { viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
await page.goto(BASE + '?debug', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForFunction(() => window.__car && window.__expansion, { timeout: 90000 })
await page.waitForTimeout(6000)
const put = (z) => page.evaluate((z) => { const c = window.__car
  c.setTranslation({ x: 0, y: 1.6, z }, true); c.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
  c.setLinvel({ x: 0, y: 0, z: 0 }, true); c.setAngvel({ x: 0, y: 0, z: 0 }, true) }, z)
const st = () => page.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return q.width > 0 ? [q.left, q.top, q.right, q.bottom].map(Math.round) : null }
  const v = window.__car.linvel()
  return { card: r('#light-card'), title: document.querySelector('#light-card .pf-title')?.textContent, hud: document.querySelector('#collect-hud')?.textContent,
    joy: r('.joystick-base'), mini: r('#minimap'), fps: r('#debug-panel'), fpsBtn: r('#debug-toggle'), title1: r('.hud'),
    ls: localStorage.getItem('cyberpunk-drive.v4.progress'), speed: Math.hypot(v.x, v.z).toFixed(2), z: window.__car.translation().z.toFixed(1) } })
const log = (k, o) => console.log(k, JSON.stringify(o))
await put(-88); await page.waitForTimeout(2500); log('at-light0', await st())
await page.screenshot({ path: `screenshots/1104-card-${MOB ? 'mobile' : 'desktop'}.png` })
await page.screenshot({ path: `/workspace/cyberpunk-art/send-shots/1104/1104-card-${MOB ? 'mobile' : 'desktop'}.png` })
if (!MOB) {
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1500); log('arrow-while-open', await st()); await page.keyboard.up('ArrowUp')
  await page.keyboard.press('Escape'); await page.waitForTimeout(500); log('after-esc', await st())
  await put(-104); await page.waitForTimeout(2500); log('at-light1', await st())
  await page.keyboard.press('KeyE'); await page.waitForTimeout(500); log('after-E', await st())
} else {
  await page.tap('.lc-close'); await page.waitForTimeout(500); log('after-tap-close', await st())
  await put(-104); await page.waitForTimeout(2500); log('at-light1', await st())
}
await b.close()
