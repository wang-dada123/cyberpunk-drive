import { ELEV_W, RAMPS, RING_FRAMES, RING_PER, frameAt, type Ramp } from './expansionLayout'
import { laneEdges, rampRailSpan } from './rampSurface'
import { S2_BRIDGE } from './s2Bridge'
import { SPIRAL, spiralFrame } from './mapLayout'
import { J2_H, j2Guard } from './expansionLayout'

/**
 * 护栏中线：视觉护栏和看不见的碰撞墙都从这里取同一批折线，平面位置完全一致。
 * 高架：外侧整圈不断；内侧只在匝道汇入口让开。匝道：护栏走到桥面边缘就收住，不斜插进桥面。
 */
export type RailPt = { x: number; y: number; z: number; f: number; up?: number }
export type RailLine = { pts: RailPt[]; sector: number; lane?: number; side?: number }

const HW = ELEV_W / 2
/** 护栏中线离路面中线 */
export const RING_RAIL_OFF = HW + 0.25
export const RAMP_RAIL_PAD = 0.45

/** 点到高架中线的横向距离和该处路面高度（局部搜索，返回最近帧） */
function ringLat(x: number, z: number) {
  const th = Math.atan2(-z, x)
  const f = frameAt(th)
  const lat = (x - f.x) * f.px + (z - f.z) * f.pz
  return { lat, y: f.y }
}

/** 点是否在某条匝道 lip 之后、到 stopAt 之前的车道里 */
const LANES = [...RAMPS, S2_BRIDGE]
function inRampLane(x: number, z: number, y: number, pad: number) {
  for (let r = 0; r < LANES.length; r++) {
    const ramp = LANES[r]
    const fs = ramp.frames
    const end = rampStop[r] ?? ramp.deckOwn
    for (let i = Math.max(0, ramp.lip - 6); i < end; i++) {
      const a = fs[i], b = fs[i + 1]
      const abx = b.x - a.x, abz = b.z - a.z
      const l2 = abx * abx + abz * abz || 1
      let t = ((x - a.x) * abx + (z - a.z) * abz) / l2
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const half = ramp.halfW[i] + (ramp.halfW[i + 1] - ramp.halfW[i]) * t
      const fy = a.y + (b.y - a.y) * t
      if (Math.abs(y - fy) > 2.2) continue
      if (Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)) < half + pad) return true
    }
  }
  return false
}

/** 每条匝道远侧护栏收住的帧（护栏在这之后已经贴到高架护栏线上）。 */
const rampStop: number[] = []

function rampLines(ramp: Ramp, r: number, skip?: (x: number, z: number) => boolean): RailLine[] {
  const { frames, halfW, deckOwn } = ramp
  const [w0] = rampRailSpan(ramp)
  const out: RailLine[] = []
  let stopMax = w0
  for (const side of [-1, 1]) {
    let cur: RailPt[] = []
    for (let i = w0; i <= deckOwn; i++) {
      const f = frames[i]
      const off = halfW[i] + RAMP_RAIL_PAD
      const x = f.x + f.px * side * off
      const z = f.z + f.pz * side * off
      const ring = ringLat(x, z)
      // 进到高架护栏线以内（含护栏本身）就收住：不在桥面上斜插
      const onDeck = Math.abs(ring.lat) < RING_RAIL_OFF + 0.35 && Math.abs(f.y - ring.y) < 1.6
      if (skip && skip(x, z)) {
        if (cur.length > 1) out.push({ pts: cur, sector: ramp.sector, side })
        cur = []
        continue
      }
      if (f.y < 0.9 || onDeck) {
        if (cur.length > 1) { out.push({ pts: cur, sector: ramp.sector, side }); stopMax = Math.max(stopMax, i) }
        cur = []
        if (onDeck) break
        continue
      }
      // 急弯内侧偏移会折返：沿该帧切向不前进的点丢掉
      const last = cur[cur.length - 1]
      if (last && (x - last.x) * f.tx + (z - last.z) * f.tz < 0.3) continue
      cur.push({ x, y: f.y, z, f: i })
    }
    if (cur.length > 1) { out.push({ pts: cur, sector: ramp.sector, side }); stopMax = deckOwn }
  }
  rampStop[r] = Math.min(deckOwn, stopMax + 2)
  return out
}

function ringLines(): RailLine[] {
  const out: RailLine[] = []
  const N = RING_FRAMES.length - 1
  for (const side of [-1, 1]) {
    const keep: boolean[] = []
    for (let i = 0; i < N; i++) {
      const f = RING_FRAMES[i]
      const x = f.x + f.px * side * RING_RAIL_OFF
      const z = f.z + f.pz * side * RING_RAIL_OFF
      keep.push(side === -1 || !inRampLane(x, z, f.y, 0.6))
    }
    // 按扇区切开（便于视觉按扇区显隐），段与段共享端点，所以没有缝
    for (let s = 0; s * RING_PER < N; s++) {
      let cur: RailPt[] = []
      for (let i = s * RING_PER; i <= Math.min(N, (s + 1) * RING_PER); i++) {
        const k = i % N
        if (!keep[k]) { if (cur.length > 1) out.push({ pts: cur, sector: s }); cur = []; continue }
        const f = RING_FRAMES[k]
        cur.push({ x: f.x + f.px * side * RING_RAIL_OFF, y: f.y, z: f.z + f.pz * side * RING_RAIL_OFF, f: k, up: j2Guard(f.theta) })
      }
      if (cur.length > 1) out.push({ pts: cur, sector: s })
    }
  }
  return out
}

/** 螺旋楼屋顶范围内不立 S2 桥护栏（屋顶自己的护栏在这里开口） */
const spEnd = spiralFrame(SPIRAL.L)
function onRoof(x: number, z: number) {
  const dx = x - spEnd.p[0], dz = z - spEnd.p[1]
  const along = dx * spEnd.T[0] + dz * spEnd.T[1]
  const off = dx * spEnd.N[0] + dz * spEnd.N[1]
  return along > -1 && along < SPIRAL.ROOF + 0.5 && Math.abs(off) < SPIRAL.ROOF_W / 2 - 0.02
}
/** 路面高度 = 护栏脚下同侧桥面边线（去折返、与视觉桥面同源）在几何最近点的高度，沿边线线性插值；不用射线、不逐段采样 */
function edgeY(edge: number[][], x: number, z: number, f: number) {
  let best = Infinity, y = edge[Math.min(edge.length - 1, Math.round(f))][1]
  for (let i = Math.max(0, Math.floor(f) - 12); i < Math.min(edge.length - 1, Math.floor(f) + 12); i++) {
    const a = edge[i], b = edge[i + 1], ax = b[0] - a[0], az = b[2] - a[2], l2 = ax * ax + az * az
    if (l2 < 1e-8) continue
    const t = Math.min(1, Math.max(0, ((x - a[0]) * ax + (z - a[2]) * az) / l2))
    const d = Math.hypot(x - a[0] - ax * t, z - a[2] - az * t)
    if (d < best) { best = d; y = a[1] + (b[1] - a[1]) * t }
  }
  return y
}
function smoothRamp(r: Ramp, lane: number, lines: RailLine[]) {
  const E = laneEdges(r.frames, r.halfW)
  return lines.map((l) => ({ ...smoothLine(l, (x, z, f) => edgeY(E[l.side === 1 ? 1 : 0], x, z, f), 2.5, 0.25), lane }))
}
const rampAll = [...RAMPS.flatMap((r, i) => smoothRamp(r, i, rampLines(r, i))), ...smoothRamp(S2_BRIDGE, RAMPS.length, rampLines(S2_BRIDGE, RAMPS.length, onRoof))]
/**
 * 护栏折线后处理（1104）：
 * 1) 去折返：内侧偏移在急弯处会往回走（相邻点前进量≤0），这些点直接丢掉；
 * 2) 平面坐标按弧长做高斯平滑（σ≈1.2m），去掉 2m 帧距带来的锯齿；
 * 3) 按 0.5m 密采样；高度取平滑后的路面高度（环线不平滑高度，保持与桥面同源）。
 * 视觉护栏和护栏墙碰撞都用这一份。
 */
function smoothLine(line: RailLine, yOf: ((x: number, z: number, f: number) => number) | null, SIG = 1.2, STEP = 0.5): RailLine {
  const src = line.pts
  const P: RailPt[] = [src[0]]
  for (let i = 1; i < src.length; i++) {
    const a = P[P.length - 1], b = src[i]
    const n = src[Math.min(src.length - 1, i + 1)], p0 = src[Math.max(0, i - 1)]
    const tx = n.x - p0.x, tz = n.z - p0.z, tl = Math.hypot(tx, tz) || 1
    if (((b.x - a.x) * tx + (b.z - a.z) * tz) / tl > 0.15) P.push(b)
  }
  if (P.length < 3) return { ...line, pts: P }
  const s = [0]
  for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z))
  const sm = P.map((p, i) => {
    if (i === 0 || i === P.length - 1) return { ...p }
    let w = 0, x = 0, y = 0, z = 0
    for (let j = 0; j < P.length; j++) {
      const d = s[j] - s[i]
      if (Math.abs(d) > SIG * 3) continue
      // 端点附近窗口对称截断，避免端点被拉偏
      const lim = Math.min(s[i], s[P.length - 1] - s[i])
      if (Math.abs(d) > lim + 1e-6) continue
      const k = Math.exp(-(d * d) / (2 * SIG * SIG))
      w += k; x += P[j].x * k; y += P[j].y * k; z += P[j].z * k
    }
    return { ...p, x: x / w, y: p.y, z: z / w }
  })
  const out: RailPt[] = []
  for (let i = 0; i < sm.length - 1; i++) {
    const a = sm[i], b = sm[i + 1]
    const k = Math.max(1, Math.ceil((s[i + 1] - s[i]) / STEP))
    for (let j = 0; j < k; j++) {
      const t = j / k
      const pt: RailPt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, f: a.f + (b.f - a.f) * t }
      if (a.up !== undefined) pt.up = a.up + ((b.up ?? 0) - a.up) * t
      out.push(pt)
    }
  }
  out.push(sm[sm.length - 1])
  // 高度与路面同源：按（插值后的）帧号取路面高度，不用射线、不逐段采样
  if (yOf) for (const p of out) p.y = yOf(p.x, p.z, p.f)
  return { ...line, pts: out }
}

export const RAIL_LINES: RailLine[] = [...ringLines().map((l) => smoothLine(l, null)), ...rampAll]

/** 看不见的墙：同一折线竖起一面 2.3m 高、两面都挡的墙（trimesh）。 */
export const WALL_H = 2.3
/** J2 落地区：墙（和看得见的护栏）加高这么多，车跳起最高点也翻不过去 */
export const J2_WALL_UP = 1.6 + J2_H
export function railWallMesh() {
  const v: number[] = []
  const idx: number[] = []
  for (const line of RAIL_LINES) {
    const base = v.length / 3
    for (const p of line.pts) v.push(p.x, p.y - 0.3, p.z, p.x, p.y + WALL_H + (p.up ?? 0) * J2_WALL_UP, p.z)
    for (let i = 0; i < line.pts.length - 1; i++) {
      const k = base + i * 2
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }
  return { v: new Float32Array(v), i: new Uint32Array(idx) }
}
