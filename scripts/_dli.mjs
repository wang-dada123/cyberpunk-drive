/**
 * 高架 / 匝道 / J2 / S1 / S2 / 天桥：正常速度与最高速度各一遍。
 * ONLY=regex MODES=normal,max OUT=file node scripts/drive-laps.mjs
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:5173/cyberpunk-drive/'
const FILTER = process.env.ONLY || ''
const MODES = process.env.MODES || 'normal,max'
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ viewport: { width: 320, height: 240 } })
const page = await ctx.newPage()
await page.addInitScript(() => { window.__tx = []; for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) for (const fn of ['texImage2D', 'texSubImage2D', 'texStorage2D', 'generateMipmap', 'compressedTexImage2D']) { const o = C.prototype[fn]; C.prototype[fn] = function (...a) { const t = performance.now(); const r = o.apply(this, a); const d = performance.now() - t; const src = a.find((x) => x && typeof x === 'object' && 'width' in x); const w = src ? src.width : a[3], h = src ? src.height : a[4]; if (d > 15) window.__tx.push([Math.round(t), Math.round(d), fn, w, h]); return r } } })
await page.addInitScript(() => { window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: "longtask", buffered: true }) } catch {} ; window.__res = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__res.push([e.name.split("/").pop(), Math.round(e.responseEnd)]) }).observe({ type: "resource", buffered: true }) } catch {} })
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(BASE + '?shot', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__car && window.__expansion && window.__drive, { timeout: 60000 })
await page.waitForTimeout(1500)
if (process.env.CAP_MS) await page.evaluate((c) => { window.__capMs = c }, +process.env.CAP_MS)
await page.exposeFunction('__report', (r) => console.log(JSON.stringify(r)))

const result = await page.evaluate(async ([FILTER, MODES]) => {
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
    const r0 = E.stats.resets
    let idx = 0, falls = 0, below = false, maxSpeed = 0, stuckT = 0, stuck = 0, minClear = 99
    const events = []
    let lastT = performance.now(), simT = 0
    const t0 = performance.now()
    const fd = []; const smp = []; let pp = null, dist = 0, vint = 0, nextS = 2000; const rstEv = []; let rPrev = E.stats.resets; const lt0 = window.__lt.length
    const steerK = path.steer || 2.2
    const look = path.look || 4
    while (idx < pts.length - 3) {
      await new Promise((r) => requestAnimationFrame(r))
      const now = performance.now(); fd.push([Math.round(now - t0), Math.round(now - lastT), idx]); const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; simT += dt
      if (now - t0 > (window.__capMs || 180000)) { events.push('timeout'); break }
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
      if (pp) { dist += Math.hypot(t.x - pp.x, t.z - pp.z); vint += sp * (fd[fd.length - 1][1] / 1000) } pp = { x: t.x, z: t.z }
      if (E.stats.resets !== rPrev) { rPrev = E.stats.resets; const rec = fd.slice(-12).map((f) => f[1]); rstEv.push({ t: Math.round(now - t0), idx, why: E.stats.why, pos: [t.x, t.y, t.z].map((v) => +v.toFixed(1)), sp: +sp.toFixed(1), dts: rec }) }
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
      if (now - t0 > nextS) { nextS += 2000; smp.push([Math.round((now - t0) / 1000), idx, +sp.toFixed(1), +t.x.toFixed(0), +t.y.toFixed(1), +t.z.toFixed(0), +(dist / Math.max(0.01, vint)).toFixed(2), +D.turn.toFixed(2), +yawNow.toFixed(2), +want.toFixed(2), +rb.angvel().y.toFixed(2), [pts[Math.min(pts.length-1, idx+look)]].map(o=>[+o.x.toFixed(0),+o.y.toFixed(1),+o.z.toFixed(0)])[0], (()=>{const W=window.__rapier?.world; const out=[]; try{ const c=rb.collider(0); W.contactPairsWith(c,(o)=>{const b=o.parent(); const tt=b?b.translation():o.translation(); out.push([o.handle, b?b.bodyType():-1, +tt.x.toFixed(1),+tt.y.toFixed(1),+tt.z.toFixed(1), o.shape?.type])}) }catch(e){out.push(String(e).slice(0,60))} return out.slice(0,6)})()]); dist = 0; vint = 0 }
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
      frames: fd.length, meanDt: Math.round(fd.reduce((a, f) => a + f[1], 0) / Math.max(1, fd.length)), maxDt: Math.max(...fd.map((f) => f[1])),
      n150: fd.filter((f) => f[1] > 150).length, n300: fd.filter((f) => f[1] > 300).length,
      spikes: fd.filter((f) => f[1] > 250).slice(0, 10), tx: window.__tx.map((e) => [e[0] - Math.round(t0), e[1], e[2], e[3], e[4]]), fdBig: fd.filter((f) => f[1] > 140).slice(0, 30), fd0: fd.slice(0, 60).map((f) => f[1]), rstEv, smp, npts: pts.length, longtasks: window.__lt.slice(lt0).filter((e) => e[1] > 100).slice(0, 10), pathT0: Math.round(t0),
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
}, [FILTER, MODES])

console.log("RES", JSON.stringify(await page.evaluate(() => [Math.round(performance.now()), window.__res.filter((r) => /webp|woff2/.test(r[0]))])))
writeFileSync(process.env.OUT || '/tmp/drive-laps.json', JSON.stringify(result, null, 1))
await browser.close()
