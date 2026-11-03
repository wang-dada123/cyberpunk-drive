import { ELEV_W, EXTRA_RAMPS, angOf, frameAt, sectorOf, type Ramp, type RoadFrame } from './expansionLayout'
import { SPIRAL, spiralFrame, spiralH } from './mapLayout'

/**
 * S2 实体桥：螺旋楼屋顶 → 高架内侧汇入（角度减小方向）。
 * 三次贝塞尔 + 环上五次平滑汇入；结构与匝道一致，护栏走 railLines。
 */
export const S2_HALF = 4
const HW = ELEV_W / 2
const STEP = 2
const MERGE = 64

function roofStart() {
  const s = SPIRAL.L + SPIRAL.ROOF * 0.55
  const f = spiralFrame(s)
  return { x: f.p[0], z: f.p[1], y: spiralH(SPIRAL.L) + 0.02, tx: f.T[0], tz: f.T[1] }
}

type P = { x: number; z: number }
const bez = (a: P, b: P, c: P, d: P, t: number): P => {
  const u = 1 - t
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    z: u * u * u * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t * t * t * d.z,
  }
}

function resample(dense: P[]): P[] {
  const pts: P[] = [dense[0]]
  let acc = 0
  for (let i = 1; i < dense.length; i++) {
    acc += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z)
    if (acc >= STEP) { pts.push(dense[i]); acc = 0 }
  }
  const last = dense[dense.length - 1]
  if (Math.hypot(pts[pts.length - 1].x - last.x, pts[pts.length - 1].z - last.z) > 0.4) pts.push(last)
  else pts[pts.length - 1] = last
  return pts
}

function minROf(pts: P[]): number {
  let minR = 1e9
  for (let i = 1; i < pts.length - 1; i++) {
    const a0 = Math.atan2(pts[i].z - pts[i - 1].z, pts[i].x - pts[i - 1].x)
    const a1 = Math.atan2(pts[i + 1].z - pts[i].z, pts[i + 1].x - pts[i].x)
    const d = Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)))
    const step = (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
      + Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)) / 2
    if (d > 1e-4) minR = Math.min(minR, step / d)
  }
  return minR
}

function mergePts(thM: number, latM: number): P[] {
  const dTh = STEP / 255
  const nM = Math.round(MERGE / STEP)
  const out: P[] = []
  for (let k = 1; k <= nM + 4; k++) {
    const u = Math.min(1, k / nM)
    const s = u * u * u * (u * (u * 6 - 15) + 10)
    const lat = latM + (1 - latM) * s
    const f = frameAt(thM - k * dTh)
    out.push({ x: f.x + f.px * lat, z: f.z + f.pz * lat })
  }
  return out
}

function build(): Ramp {
  const r0y = roofStart()
  const r0: P = { x: r0y.x, z: r0y.z }
  let best: { curve: P[]; thM: number; latM: number; r: number } | null = null
  for (const deg of [116, 118, 120, 122, 124, 126, 128]) {
    for (const L1 of [40, 50, 60, 70, 80]) {
      for (const L2 of [40, 50, 60, 70, 80]) {
        const thM = deg * Math.PI / 180
        const fm = frameAt(thM)
        const latM = HW + S2_HALF + 0.35
        const pm: P = { x: fm.x + fm.px * latM, z: fm.z + fm.pz * latM }
        let dx = pm.x - r0.x, dz = pm.z - r0.z
        const dl = Math.hypot(dx, dz) || 1
        dx /= dl; dz /= dl
        // 侧向出屋顶（朝汇入点），避开尽端墙
        const c1 = { x: r0.x + dx * L1, z: r0.z + dz * L1 }
        const c2 = { x: pm.x + fm.tx * L2, z: pm.z + fm.tz * L2 }
        const dense: P[] = []
        for (let i = 0; i <= 700; i++) dense.push(bez(r0, c1, c2, pm, i / 700))
        const curve = resample(dense)
        const all = [...curve, ...mergePts(thM, latM)]
        const r = minROf(all)
        const maxRad = Math.max(...curve.map((p) => Math.hypot(p.x, p.z)))
        if (r < 40 || maxRad > 290) continue
        if (!best || r > best.r) best = { curve, thM, latM, r }
      }
    }
  }
  if (!best) {
    for (const deg of [116, 120, 124, 128]) {
      for (const L1 of [40, 55, 70]) {
        for (const L2 of [50, 65, 80]) {
          const thM = deg * Math.PI / 180
          const fm = frameAt(thM)
          const latM = HW + S2_HALF + 0.35
          const pm: P = { x: fm.x + fm.px * latM, z: fm.z + fm.pz * latM }
          let dx = pm.x - r0.x, dz = pm.z - r0.z
          const dl = Math.hypot(dx, dz) || 1
          dx /= dl; dz /= dl
          const dense: P[] = []
          for (let i = 0; i <= 700; i++) dense.push(bez(r0, { x: r0.x + dx * L1, z: r0.z + dz * L1 }, { x: pm.x + fm.tx * L2, z: pm.z + fm.tz * L2 }, pm, i / 700))
          const curve = resample(dense)
          const r = minROf([...curve, ...mergePts(thM, latM)])
          const maxRad = Math.max(...curve.map((p) => Math.hypot(p.x, p.z)))
          if (maxRad > 290) continue
          if (!best || r > best.r) best = { curve, thM, latM, r }
        }
      }
    }
  }
  if (!best) throw new Error('S2: no path')
  const { curve, thM, latM } = best
  const fm = frameAt(thM)
  const mPts = mergePts(thM, latM)
  const curveN = curve.length
  const allP = [...curve, ...mPts]
  const sAt: number[] = [0]
  for (let i = 1; i < allP.length; i++) sAt.push(sAt[i - 1] + Math.hypot(allP[i].x - allP[i - 1].x, allP[i].z - allP[i - 1].z))
  const yTop = r0y.y, yLow = fm.y
  const s0 = 8, s1 = Math.max(s0 + 25, sAt[curveN - 1] - 8)
  const nM = Math.round(MERGE / STEP)
  const frames: RoadFrame[] = allP.map((p, i) => {
    let tx: number, tz: number
    if (i >= curveN) {
      const f = frameAt(angOf(p.x, p.z))
      tx = -f.tx; tz = -f.tz
    } else {
      const a = allP[Math.max(0, i - 1)], b = allP[Math.min(allP.length - 1, i + 1)]
      tx = b.x - a.x; tz = b.z - a.z
      const tl = Math.hypot(tx, tz) || 1
      tx /= tl; tz /= tl
    }
    const s = sAt[i]
    let y: number
    if (i >= curveN) y = frameAt(angOf(p.x, p.z)).y
    else if (s <= s0) y = yTop
    else if (s >= s1) y = yLow
    else y = yLow + (yTop - yLow) * (1 + Math.cos(Math.PI * (s - s0) / (s1 - s0))) / 2
    return { x: p.x, y, z: p.z, base: y, tx, tz, px: tz, pz: -tx, theta: angOf(p.x, p.z), gap: false, kick: false }
  })
  return {
    deg: +(thM * 180 / Math.PI).toFixed(1), sector: sectorOf(thM), frames,
    halfW: frames.map(() => S2_HALF),
    mouth: 0, lip: 0, join: curveN - 1, deckOwn: curveN - 1 + nM, landAng: thM,
  }
}

export const S2_BRIDGE: Ramp = build()
if (!EXTRA_RAMPS.includes(S2_BRIDGE)) EXTRA_RAMPS.push(S2_BRIDGE)

export function s2Dist(x: number, z: number, upto = S2_BRIDGE.join) {
  const fs = S2_BRIDGE.frames
  let m = Infinity
  for (let i = 0; i < Math.min(upto, fs.length - 1); i++) {
    const a = fs[i], b = fs[i + 1]
    const abx = b.x - a.x, abz = b.z - a.z
    const l2 = abx * abx + abz * abz || 1
    let t = ((x - a.x) * abx + (z - a.z) * abz) / l2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    m = Math.min(m, Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)))
  }
  return m
}

export function s2MinR() {
  const f = S2_BRIDGE.frames
  const pts = f.map((p) => ({ x: p.x, z: p.z }))
  let minR = 1e9, at = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const a0 = Math.atan2(pts[i].z - pts[i - 1].z, pts[i].x - pts[i - 1].x)
    const a1 = Math.atan2(pts[i + 1].z - pts[i].z, pts[i + 1].x - pts[i].x)
    const d = Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)))
    const step = (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
      + Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)) / 2
    if (d > 1e-4) {
      const r = step / d
      if (r < minR) { minR = r; at = i }
    }
  }
  return { minR, at, n: f.length, join: S2_BRIDGE.join, deckOwn: S2_BRIDGE.deckOwn, deg: S2_BRIDGE.deg }
}
