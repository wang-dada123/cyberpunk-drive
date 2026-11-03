// 护栏上沿相对路面高差：逐条护栏密采样（0.1m），对比"该处路面高度+0.9"，输出最大偏差和波动(二阶差分)
import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://127.0.0.1:5173/cyberpunk-drive/'
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForFunction(() => window.__expansion, { timeout: 90000 })
const r = await page.evaluate(() => {
  const E = window.__expansion, LANES = [...E.RAMPS, E.S2]
  // 参照 = 视觉桥面在护栏脚下那条边线的高度：取护栏点到同侧桥面边线（去折返后的视觉边，环线为 ±HW 边）的几何最近点，按边线插值。
  // 不用护栏自己的帧号，所以不是自证。
  const ringEdge = [-1, 1].map((s) => E.RING_FRAMES.map((f) => [f.x + f.px * s * 5, f.y, f.z + f.pz * s * 5, f.gap]))
  const laneEdge = LANES.map((R) => E.laneEdges(R.frames, R.halfW))
  const roadY = (x, z, l, fi) => {
    const cands = l.lane == null ? ringEdge : [laneEdge[l.lane][l.side === 1 ? 1 : 0]]
    let best = null
    for (const ed of cands) for (let i = 0; i < ed.length - 1; i++) {
      if (fi != null && Math.abs(i - fi) > 12) continue
      const a = ed[i], c = ed[i + 1]; if (a[3] || c[3]) continue
      const ax = c[0] - a[0], az = c[2] - a[2], l2 = ax * ax + az * az; if (l2 < 1e-8) continue
      const t = Math.min(1, Math.max(0, ((x - a[0]) * ax + (z - a[2]) * az) / l2)), d = Math.hypot(x - a[0] - ax * t, z - a[2] - az * t)
      if (!best || d < best.d) best = { d, y: a[1] + (c[1] - a[1]) * t } }
    return best && best.d < 1.5 ? best.y : null
  }
  const out = [], ALL = []
  E.RAIL_LINES.forEach((l, li) => {
    let maxDev = 0, maxWave = 0, n = 0, prev = []
    const P = l.pts
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], c = P[i + 1], L = Math.hypot(c.x - a.x, c.z - a.z), k = Math.max(1, Math.ceil(L / 0.1))
      for (let j = 0; j < k; j++) { const t = j / k, x = a.x + (c.x - a.x) * t, z = a.z + (c.z - a.z) * t, y = a.y + (c.y - a.y) * t
        const up = (a.up ?? 0) + ((c.up ?? 0) - (a.up ?? 0)) * t
        if (up > 0.001) continue
        const ry = roadY(x, z, l, l.lane == null ? null : a.f + (c.f - a.f) * t); if (ry == null) continue
        const dev = Math.abs(y - ry); ALL.push(dev); if (dev > maxDev) l.__at = [i, +x.toFixed(1), +z.toFixed(1), +y.toFixed(2), +ry.toFixed(2)]; maxDev = Math.max(maxDev, dev); n++
        prev.push(y - ry); if (prev.length >= 3) { maxWave = Math.max(maxWave, Math.abs(prev.at(-1) - 2 * prev.at(-2) + prev.at(-3))) }
      } }
    out.push({ li, sector: l.sector, ramp: l.up === undefined && P[0].up === undefined, n, at: l.__at, maxDev: +(maxDev * 100).toFixed(2), wave: +(maxWave * 100).toFixed(2) })
  })
  ALL.sort((a, b) => a - b)
  out.stats = { n: ALL.length, p50: +(ALL[ALL.length >> 1] * 100).toFixed(2), p99: +(ALL[Math.floor(ALL.length * 0.99)] * 100).toFixed(2), over2cm: ALL.filter((d) => d > 0.02).length }
  return { out, stats: out.stats }
})
console.log('stats', JSON.stringify(r.stats)); const worst = [...r.out].sort((a, c) => c.maxDev - a.maxDev)
console.log('lines', r.out.length, 'worst maxDev(cm):', JSON.stringify(worst.slice(0, 8)))
console.log('overall maxDev cm', worst[0].maxDev, 'max wave cm', Math.max(...r.out.map((x) => x.wave)))
await b.close()
