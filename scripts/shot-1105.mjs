/**
 * 1105 凡人卡片样式截图（可重复跑；换图先跑 prep-exhibits，再跑本脚本）
 * 输出 /workspace/cyberpunk-art/send-shots/1105-fanren-cards/：
 *   1105-phone-land-card.png（844×390）  1105-phone-land-street.png（844×390）  1105-desktop-card.png（1440×900）
 * 默认自起 vite dev server 于 5176（window.__car 只在 DEV 暴露）；也可 BASE=http://127.0.0.1:5173/cyberpunk-drive/ 指向 dev server。
 * ?shot 关掉 SwiftShader 软件渲染提示条；脚本再兜底删除 #hw-accel-tip。
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const OUT = process.env.OUT || '/workspace/cyberpunk-art/send-shots/1105-fanren-cards'
mkdirSync(OUT, { recursive: true })
let srv = null, BASE = process.env.BASE
if (!BASE) {
  srv = spawn('npx', ['vite', '--port', '5176', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true })
  BASE = 'http://127.0.0.1:5176/cyberpunk-drive/'
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break } catch { /* wait */ } await new Promise((r) => setTimeout(r, 500)) }
}
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })

async function open(mobile, W, H) {
  const ctx = await b.newContext(mobile ? { viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: IOS } : { viewport: { width: W, height: H } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  await page.goto(BASE + '?debug&shot', { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => window.__car && window.__expansion, null, { timeout: 120000 })
  await page.waitForTimeout(5000)
  return { ctx, page }
}
/** 车放到 (x,z)，朝向 yaw（0 = 朝 -Z 北），停稳 */
const put = (page, x, z, yaw = 0) => page.evaluate(([x, z, yaw]) => {
  const c = window.__car
  window.__expansion.resetDrive?.()
  c.setTranslation({ x, y: 1.6, z }, true); c.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
  c.setLinvel({ x: 0, y: 0, z: 0 }, true); c.setAngvel({ x: 0, y: 0, z: 0 }, true)
}, [x, z, yaw])
const info = (page) => page.evaluate(() => {
  document.getElementById('hw-accel-tip')?.remove()
  const g = (s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return q.width > 0 ? [q.left, q.top, q.right, q.bottom].map(Math.round) : null }
  const img = document.querySelector('#light-card img')
  return { card: g('#light-card'), title: document.querySelector('#light-card .fx-title')?.textContent, img: img ? img.complete && img.naturalWidth > 0 : null,
    font: document.fonts.check("20px FanrenBrush", '韩'), joystick: g('.joystick-base'), minimap: g('#minimap'), fps: g('#debug-panel') || g('[aria-label="展开帧率面板"]') }
})
const ov = (a, c) => !!(a && c) && a[0] < c[2] && a[2] > c[0] && a[1] < c[3] && a[3] > c[1]
const report = (n, r) => console.log(n, JSON.stringify({ ...r, overlap: { joystick: ov(r.card, r.joystick), minimap: ov(r.card, r.minimap), fps: ov(r.card, r.fps) } }))
const LZ = [-88, -104, -120, -136, -152, -168, -184, -196] // gadgets.ts LIGHT_ZS

try {
  { // 手机横屏：卡片弹出（光点 0 · 韩立）
    const { ctx, page } = await open(true, 844, 390)
    await put(page, 0, LZ[0]); await page.waitForTimeout(3500)
    const r = await info(page); report('phone-card', r)
    await page.screenshot({ path: `${OUT}/1105-phone-land-card.png` })
    // 街景：作品街南口朝北，看两侧凡人灯箱（等缩略图懒加载到齐）
    await page.keyboard.press('Escape')
    await put(page, 0, -27, 0); await page.waitForTimeout(5000)
    report('phone-street', await info(page))
    await page.screenshot({ path: `${OUT}/1105-phone-land-street.png` })
    await ctx.close()
  }
  { // 电脑端：卡片弹出（光点 2 · 黄枫谷）
    const { ctx, page } = await open(false, 1440, 900)
    await put(page, 0, LZ[2]); await page.waitForTimeout(3500)
    report('desktop-card', await info(page))
    await page.screenshot({ path: `${OUT}/1105-desktop-card.png` })
    await ctx.close()
  }
} finally {
  await b.close()
  if (srv) try { process.kill(-srv.pid) } catch { /* gone */ }
}
