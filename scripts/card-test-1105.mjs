/** 1105 凡人卡片交互回归：开卡可开车、Esc/E 关、手机点「关闭」、静音 12m 后重弹、超 25m 自动关、不压摇杆/小地图/FPS。
 *  BASE=http://127.0.0.1:5176/cyberpunk-drive/ [MOB=1] node scripts/card-test-1105.mjs */
import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://127.0.0.1:5176/cyberpunk-drive/'
const MOB = process.env.MOB === '1'
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext(MOB ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
  : { viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
await page.goto(BASE + '?debug&shot', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForFunction(() => window.__car && window.__expansion, null, { timeout: 120000 })
await page.waitForTimeout(5000)
const put = (z) => page.evaluate((z) => { const c = window.__car; window.__expansion.resetDrive?.()
  c.setTranslation({ x: 0, y: 1.6, z }, true); c.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
  c.setLinvel({ x: 0, y: 0, z: 0 }, true); c.setAngvel({ x: 0, y: 0, z: 0 }, true) }, z)
const st = () => page.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return q.width > 0 ? [q.left, q.top, q.right, q.bottom].map(Math.round) : null }
  const v = window.__car.linvel(), c = r('#light-card')
  const ov = (o) => !!(c && o) && c[0] < o[2] && c[2] > o[0] && c[1] < o[3] && c[3] > o[1]
  return { title: document.querySelector('#light-card .fx-title')?.textContent ?? null, copy: document.querySelector('#light-card .fx-copy')?.textContent,
    bad: /待核实|占位|了解更多/.test(document.querySelector('#light-card')?.textContent ?? ''),
    over: c ? { joy: ov(r('.joystick-base')), mini: ov(r('#minimap')), fps: ov(r('#debug-panel') || r('#debug-toggle')) } : null, speed: +Math.hypot(v.x, v.z).toFixed(2) } })
const res = []
const check = async (k, want) => { const s = await st(); const ok = want(s); res.push(ok); console.log(ok ? 'OK ' : 'FAIL', k, JSON.stringify(s)) }
const W = (ms) => page.waitForTimeout(ms)
await put(-88); await W(2500); await check('light0-open', (s) => s.title === '韩立·青竹蜂云剑' && !s.bad && s.copy === '图片版权归原作者' && !Object.values(s.over).some(Boolean))
if (!MOB) {
  await page.keyboard.down('ArrowDown'); await W(1000); await check('drive-while-open', (s) => s.speed > 0.5 && s.title === '韩立·青竹蜂云剑'); await page.keyboard.up('ArrowDown')
  await page.keyboard.press('Escape'); await W(500); await check('esc-close', (s) => s.title === null)
} else {
  await page.tap('.lc-close'); await W(500); await check('tap-close', (s) => s.title === null)
}
await put(-104); await W(2500); await check('light1-open', (s) => s.title === '万剑归宗')
if (!MOB) { await page.keyboard.press('KeyE'); await W(500) } else { await page.tap('.lc-close'); await W(500) }
await check('light1-closed', (s) => s.title === null)
await put(-110); await W(1200); await put(-104); await W(2000); await check('muted-within-12m', (s) => s.title === null)
await put(-120); await W(2500); await check('light2-open(unmute 1)', (s) => s.title === '风雷翅')
await put(-120 + 26); await W(1500); await check('auto-close>25m', (s) => s.title === null)
await put(-104); await W(2500); await check('light1-repop', (s) => s.title === '万剑归宗')
console.log(res.every(Boolean) ? 'ALL OK' : 'SOME FAIL')
await b.close()
