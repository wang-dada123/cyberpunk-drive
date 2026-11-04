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
  const px = (q) => parseFloat(getComputedStyle(document.querySelector(q) ?? document.body).fontSize)
  return { title: document.querySelector('#light-card .fx-title')?.textContent ?? null, tag: document.querySelector('#light-card .fx-tag')?.textContent, tagPx: px('#light-card .fx-tag'), descPx: px('#light-card .fx-desc'), copy: document.querySelector('#light-card .fx-copy')?.textContent,
    bad: /待核实|占位|了解更多/.test(document.querySelector('#light-card')?.textContent ?? ''),
    over: c ? { joy: ov(r('.joystick-base')), mini: ov(r('#minimap')), fps: ov(r('#debug-panel') || r('#debug-toggle')) } : null, speed: +Math.hypot(v.x, v.z).toFixed(2) } })
const res = []
const check = async (k, want) => { const s = await st(); const ok = want(s); res.push(ok); console.log(ok ? 'OK ' : 'FAIL', k, JSON.stringify(s)) }
const W = (ms) => page.waitForTimeout(ms)
const TITLES = ['韩立·青竹蜂云剑', '万剑归宗', '风雷翅', '静座问道', '山间读经', '御风而行', '寒夜持矛', '一剑开天']
const LZ = [-88, -104, -120, -136, -152, -168, -184, -196]
// 8 个光点依次：弹对卡、页眉 i/8 与计数 i+1/8 正确、页眉字号 ≥ 简介、不压摇杆/小地图/FPS、能关
for (let i = 0; i < 8; i++) {
  await put(LZ[i]); await W(2500)
  await check(`light${i}-open`, (s) => s.title === TITLES[i] && !s.bad && s.copy === '图片版权归原作者' && s.tag === `国漫展厅 · ${i + 1}/8 · 光点 ${i + 1}/8` && s.tagPx >= s.descPx && !Object.values(s.over).some(Boolean))
  if (i === 0 && !MOB) {
    await page.keyboard.down('ArrowDown'); await W(1000); await check('drive-while-open', (s) => s.speed > 0.5 && s.title === TITLES[0]); await page.keyboard.up('ArrowDown')
  }
  if (MOB) await page.tap('.lc-close'); else await page.keyboard.press(i % 2 ? 'KeyE' : 'Escape')
  await W(500); await check(`light${i}-close(${MOB ? 'tap' : i % 2 ? 'E' : 'Esc'})`, (s) => s.title === null)
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
