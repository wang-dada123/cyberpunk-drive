/**
 * 高架 / 匝道 / J2 / S1 / S2 / 天桥：正常速度与最高速度各一遍。
 * ONLY=regex MODES=normal,max OUT=file node scripts/drive-laps.mjs
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:5173/cyberpunk-drive/'
const FILTER = process.env.ONLY || ''
const MODES = process.env.MODES || 'normal,max'
const SETTLE = process.env.SETTLE !== "0"
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ viewport: { width: 320, height: 240 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(BASE + '?shot', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__car && window.__expansion && window.__drive, { timeout: 60000 })
await page.waitForTimeout(1500)
await page.exposeFunction('__report', (r) => console.log(JSON.stringify(r)))

const result = await page.evaluate(async ([FILTER, MODES, SETTLE]) => {
  const E = window.__expansion
  const car = () => window.__car
  const D = window.__drive
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const P = (f) => ({ x: f.x, y: f.y, z: f.z })
  const paths = []
  const ring = E.RING_FRAMES.map(P)
  paths.push({ name: 'ring-lap', pts: [...ring, ...ring.slice(1, 12)], capN: 13, capM: 21 })
  for (const r of E.RAMPS) {
    const up = r.frames.slice(0, r.deckOwn + 1).map(P)
    const end = r.frames[r.deckOwn]
    const th = E.angOf(end.x, end.z)
    const last = r.frames[r.deckOwn - 1]
    const dirSign = Math.sign((E.angOf(end.x, end.z) - E.angOf(last.x, last.z) + 9.42) % 6.283 - 3.14) || 1
    for (let k = 1; k <= 20; k++) up.push(P(E.frameAt(th + dirSign * k * 2 / 255)))
    paths.push({ name: `ramp${r.deg}-up`, pts: up, capN: 12, capM: 18 })
    paths.push({ name: `ramp${r.deg}-down`, pts: [...up].reverse(), capN: 12, capM: 18 })
  }
  {
    const c = E.J2_DEG * Math.PI / 180
    const j2 = []
    for (let k = -40; k <= 40; k++) j2.push(P(E.frameAt(c + k * 2 / 255)))
    paths.push({ name: 'J2-ccw', pts: j2, capN: 13, capM: 21 })
    paths.push({ name: 'J2-cw', pts: [...j2].reverse(), capN: 13, capM: 21 })
    const sp = E.spiral()
    paths.push({ name: 'S1-spiral-up', pts: sp, capN: 7, capM: 9, steer: 3.4, look: 3 })
    const s2 = E.S2.frames.slice(0, E.S2.deckOwn + 1).map(P)
    const e = E.S2.frames[E.S2.deckOwn]
    const th = E.angOf(e.x, e.z)
    for (let k = 1; k <= 24; k++) s2.push(P(E.frameAt(th - k * 2 / 255)))
    paths.push({ name: 'S2-down', pts: s2, capN: 12, capM: 18 })
    paths.push({ name: 'S2-up', pts: [...s2].reverse(), capN: 12, capM: 18 })
    // 螺旋接到 S2：裁到桥口，并在屋顶插一段缓转，抹平约 100° 航向差
    const s0 = E.S2.frames[0]
    let bi = 0, bd = 1e9
    for (let i = 0; i < sp.length; i++) {
      const d = (sp[i].x - s0.x) ** 2 + (sp[i].z - s0.z) ** 2
      if (d < bd) { bd = d; bi = i }
    }
    const aSp = sp[Math.max(0, bi - 1)], bSp = sp[bi]
    const tSpx = bSp.x - aSp.x, tSpz = bSp.z - aSp.z
    const tSpl = Math.hypot(tSpx, tSpz) || 1
    const h0 = Math.atan2(tSpz / tSpl, tSpx / tSpl)
    const h1 = Math.atan2(s0.tz ?? (E.S2.frames[1].z - s0.z), s0.tx ?? (E.S2.frames[1].x - s0.x))
    let dh = h1 - h0
    while (dh > Math.PI) dh -= Math.PI * 2
    while (dh < -Math.PI) dh += Math.PI * 2
    const blend = []
    const N = 14
    for (let i = 1; i <= N; i++) {
      const u = i / (N + 1)
      const e = u * u * (3 - 2 * u) // smoothstep
      const h = h0 + dh * e
      // 沿开口外侧微偏，避免蹭螺旋内墙
      const lat = 1.2 * Math.sin(Math.PI * u)
      const nx = -Math.sin(h), nz = Math.cos(h)
      blend.push({
        x: bSp.x * (1 - e) + s0.x * e + nx * lat,
        y: bSp.y * (1 - e) + s0.y * e,
        z: bSp.z * (1 - e) + s0.z * e + nz * lat,
      })
    }
    paths.push({ name: 'S1-S2-chain', pts: [...sp.slice(0, bi + 1), ...blend, ...s2], capN: 7, capM: 9, steer: 3.4, look: 3 })
  }
  if (window.__bridge) {
    const B = window.__bridge
    const L = B.FLAT / 2 + B.RAMP + 10
    const pts = []
    for (let s = -L; s <= L; s += 2) {
      const y = typeof B.height === 'function' ? B.height(s) : (B.H || 4)
      pts.push({ x: B.c[0] + B.dir[0] * s, y, z: B.c[1] + B.dir[1] * s })
    }
    paths.push({ name: 'skybridge', pts, ground: true, capN: 11, capM: 14 })
  }

  const yawOf = (tx, tz) => Math.atan2(-tx, -tz)
  async function run(path, throttle, speedCap) {
    const pts = path.pts
    const rb = car()
    const a = pts[0], b = pts[Math.min(3, pts.length - 1)]
    const yaw = yawOf(b.x - a.x, b.z - a.z)
    rb.setTranslation({ x: a.x, y: a.y + 0.75, z: a.z }, true)
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true); rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
    rb.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
    E.resetDrive?.() // 传送后清掉上一段的 last/burst，否则会误判掉落
    E.stats.resets = 0; E.stats.jumps = 0; E.stats.why = ''
    await sleep(500)
    // 传送后等车真正落地静止再开始控制：物理时间可能落后墙钟（长帧被 rapier 0.5s 夹断 /
    // PhysicsClock 长帧补步上限），只睡固定 500ms 时车可能还在下落，起点状态就和 main 不同。
    const st0 = (() => { const t = rb.translation(), v = rb.linvel(); return [+t.y.toFixed(2), +v.y.toFixed(2)] })()
    let settleF = 0
    if (SETTLE) for (let ok = 0; ok < 6 && settleF < 600; settleF++) {
      await new Promise((r) => requestAnimationFrame(r))
      const v = rb.linvel()
      ok = Math.abs(v.y) < 0.05 && Math.hypot(v.x, v.z) < 0.05 ? ok + 1 : 0
    }
    const r0 = E.stats.resets
    let idx = 0, falls = 0, below = false, maxSpeed = 0, stuckT = 0, stuck = 0, minClear = 99
    const events = []
    let lastT = performance.now(), simT = 0, maxFrame = 0
    const t0 = performance.now()
    const steerK = path.steer || 2.2
    const look = path.look || 4
    while (idx < pts.length - 3) {
      await new Promise((r) => requestAnimationFrame(r))
      const now = performance.now(); maxFrame = Math.max(maxFrame, now - lastT); const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; simT += dt
      if (now - t0 > 180000) { events.push('timeout'); break }
      const t = rb.translation(), q = rb.rotation(), v = rb.linvel()
      const sp = Math.hypot(v.x, v.z); maxSpeed = Math.max(maxSpeed, sp)
      let best = idx, bd = 1e9
      for (let k = idx; k < Math.min(pts.length, idx + 18); k++) {
        const d = (pts[k].x - t.x) ** 2 + (pts[k].z - t.z) ** 2
        if (d < bd) { bd = d; best = k }
      }
      if (Math.sqrt(bd) > 22) {
        bd = 1e9
        for (let k = 0; k < pts.length; k++) {
          const d = (pts[k].x - t.x) ** 2 + (pts[k].z - t.z) ** 2 + ((pts[k].y - t.y) * 3) ** 2
          if (d < bd) { bd = d; best = k }
        }
        if (best < idx) best = idx
      }
      idx = best
      const ref = pts[idx]
      if (!path.ground) {
        const clr = t.y - ref.y
        minClear = Math.min(minClear, clr)
        // 跳台腾空允许短时低于参考面；只有明显掉下去才算 fall
        if (clr < -2.4 && !below) { below = true; falls++; events.push(`fall@${idx} y=${t.y.toFixed(1)} ref=${ref.y.toFixed(1)}`) }
        if (clr > -0.5) below = false
      }
      const tg = pts[Math.min(pts.length - 1, idx + look)]
      const want = Math.atan2(-(tg.x - t.x), -(tg.z - t.z))
      const yawNow = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x))
      let err = want - yawNow; err = Math.atan2(Math.sin(err), Math.cos(err))
      D.turn = Math.max(-1, Math.min(1, err * steerK))
      // 弯大就收油
      const slow = Math.abs(err) > 0.55 ? 0.45 : Math.abs(err) > 0.3 ? 0.7 : 1
      D.forward = sp > speedCap ? 0 : throttle * slow
      if (sp < 0.35 && simT > 2.5) {
        stuckT += dt
        if (stuckT > 2.2) { stuck++; stuckT = 0; events.push(`stuck@${idx} (${t.x.toFixed(1)},${t.y.toFixed(1)},${t.z.toFixed(1)})`) }
      } else stuckT = 0
    }
    D.forward = 0; D.turn = 0
    const resets = E.stats.resets - r0
    return {
      name: path.name, resets, falls, stuck,
      maxSpeed: +maxSpeed.toFixed(1), minClear: +minClear.toFixed(2),
      reached: idx >= pts.length - 4, jumps: E.stats.jumps,
      events: events.slice(0, 8), why: E.stats.why,
      maxFrameMs: Math.round(maxFrame), st0, settleF,
    }
  }

  // spiral path: LEAD 起，步长更密
  if (E.spiral) {
    /* already built above via E.spiral() — patched in ElevatedRing */
  }

  const out = []
  for (const mode of [{ m: 'normal', th: 1, key: 'capN' }, { m: 'max', th: 1, key: 'capM' }]) {
    if (!MODES.split(',').includes(mode.m)) continue
    for (const p of paths) {
      if (FILTER && !new RegExp(FILTER).test(p.name)) continue
      const cap = p[mode.key] ?? (mode.m === 'normal' ? 13 : 20)
      const r = await run(p, mode.th, cap)
      r.mode = mode.m
      out.push(r)
      window.__report(r)
    }
  }
  return out
}, [FILTER, MODES, SETTLE])

writeFileSync(process.env.OUT || '/tmp/drive-laps.json', JSON.stringify(result, null, 1))
await browser.close()
