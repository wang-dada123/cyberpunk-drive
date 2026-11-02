/**
 * 高架整圈 + 4 条匝道上下 + 天桥：正常速度与最高速度各一遍，统计复位 / 掉落 / 卡住。
 * 开发服务器需已在 5173：node scripts/drive-laps.mjs
 * 自动驾驶：沿路面中线追前方 8m 的点（只写 __drive，不改车的转向逻辑）。
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:5173/cyberpunk-drive/'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 320, height: 240 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(BASE + '?shot', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__car && window.__expansion && window.__drive, { timeout: 60000 })
await page.waitForTimeout(1500)

const result = await page.evaluate(async () => {
  const E = window.__expansion
  const car = () => window.__car
  const D = window.__drive
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const P = (f) => ({ x: f.x, y: f.y, z: f.z })
  const paths = []
  const ring = E.RING_FRAMES.map(P)
  paths.push({ name: 'ring-lap', pts: [...ring, ...ring.slice(1, 12)] })
  for (const r of E.RAMPS) {
    const up = r.frames.slice(0, r.deckOwn + 1).map(P)
    // 汇入后接着沿高架开 40m
    const end = r.frames[r.deckOwn]
    const th = E.angOf(end.x, end.z)
    const last = r.frames[r.deckOwn - 1]
    const dirSign = Math.sign((E.angOf(end.x, end.z) - E.angOf(last.x, last.z) + 9.42) % 6.283 - 3.14) || 1
    for (let k = 1; k <= 20; k++) up.push(P(E.frameAt(th + dirSign * k * 2 / 255)))
    paths.push({ name: `ramp${r.deg}-up`, pts: up })
    paths.push({ name: `ramp${r.deg}-down`, pts: [...up].reverse() })
  }
  if (window.__bridge) {
    const B = window.__bridge
    const L = B.FLAT / 2 + B.RAMP + 10
    const pts = []
    for (let s = -L; s <= L; s += 2) pts.push({ x: B.c[0] + B.dir[0] * s, y: 0, z: B.c[1] + B.dir[1] * s })
    paths.push({ name: 'skybridge', pts, ground: true })
  }

  const yawOf = (tx, tz) => Math.atan2(-tx, -tz)
  async function run(path, throttle, speedCap) {
    const pts = path.pts
    const rb = car()
    const a = pts[0], b = pts[2]
    const yaw = yawOf(b.x - a.x, b.z - a.z)
    rb.setTranslation({ x: a.x, y: a.y + 0.7, z: a.z }, true)
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true); rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
    rb.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
    await sleep(400)
    const r0 = E.stats.resets
    let idx = 0, falls = 0, below = false, maxSpeed = 0, stuckT = 0, stuck = 0, minClear = 99
    const events = []
    let lastT = performance.now(), simT = 0
    const t0 = performance.now()
    while (idx < pts.length - 3) {
      await new Promise((r) => requestAnimationFrame(r))
      const now = performance.now(); const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; simT += dt
      if (now - t0 > 600000) { events.push('timeout'); break }
      const t = rb.translation(), q = rb.rotation(), v = rb.linvel()
      const sp = Math.hypot(v.x, v.z); maxSpeed = Math.max(maxSpeed, sp)
      // 前进 idx：在 idx..idx+15 找最近点
      let best = idx, bd = 1e9
      for (let k = idx; k < Math.min(pts.length, idx + 15); k++) { const d = (pts[k].x - t.x) ** 2 + (pts[k].z - t.z) ** 2; if (d < bd) { bd = d; best = k } }
      if (Math.sqrt(bd) > 25) { // 被复位带走：重新全局找
        bd = 1e9; for (let k = 0; k < pts.length; k++) { const d = (pts[k].x - t.x) ** 2 + (pts[k].z - t.z) ** 2 + ((pts[k].y - t.y) * 3) ** 2; if (d < bd) { bd = d; best = k } }
        if (best < idx) best = idx
      }
      idx = best
      const ref = pts[idx]
      if (!path.ground) {
        const clr = t.y - ref.y
        minClear = Math.min(minClear, clr)
        if (clr < -1.8 && !below) { below = true; falls++; events.push(`fall@${idx} y=${t.y.toFixed(1)} ref=${ref.y.toFixed(1)}`) }
        if (clr > -0.5) below = false
      }
      const tg = pts[Math.min(pts.length - 1, idx + 4)]
      const want = Math.atan2(-(tg.x - t.x), -(tg.z - t.z))
      const yawNow = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x))
      let err = want - yawNow; err = Math.atan2(Math.sin(err), Math.cos(err))
      D.turn = Math.max(-1, Math.min(1, err * 2.2))
      D.forward = sp > speedCap ? 0 : throttle
      if (sp < 0.4 && simT > 2) { stuckT += dt; if (stuckT > 2) { stuck++; stuckT = 0; events.push(`stuck@${idx} (${t.x.toFixed(1)},${t.y.toFixed(1)},${t.z.toFixed(1)})`) } } else stuckT = 0
    }
    D.forward = 0; D.turn = 0
    const resets = E.stats.resets - r0
    return { name: path.name, resets, falls, stuck, maxSpeed: +maxSpeed.toFixed(1), minClear: +minClear.toFixed(2), reached: idx >= pts.length - 4, events: events.slice(0, 8), why: E.stats.why }
  }
  const out = []
  for (const mode of [{ m: 'normal', th: 1, cap: 11 }, { m: 'max', th: 1, cap: 99 }]) {
    for (const p of paths) { const r = await run(p, mode.th, mode.cap); r.mode = mode.m; out.push(r) }
  }
  return out
})
for (const r of result) console.log(JSON.stringify(r))
writeFileSync(process.env.OUT || '/tmp/drive-laps.json', JSON.stringify(result, null, 1))
await browser.close()
