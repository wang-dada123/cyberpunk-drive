import { ELEV_W, RAMPS, RING_FRAMES, RING_PER, frameAt, type Ramp } from './expansionLayout'
import { rampRailSpan } from './rampSurface'

/**
 * 护栏中线：视觉护栏和看不见的碰撞墙都从这里取同一批折线，平面位置完全一致。
 * 高架：外侧整圈不断；内侧只在匝道汇入口让开。匝道：护栏走到桥面边缘就收住，不斜插进桥面。
 */
export type RailPt = { x: number; y: number; z: number; f: number }
export type RailLine = { pts: RailPt[]; sector: number }

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
function inRampLane(x: number, z: number, y: number, pad: number) {
  for (let r = 0; r < RAMPS.length; r++) {
    const ramp = RAMPS[r]
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

function rampLines(ramp: Ramp, r: number): RailLine[] {
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
      if (f.y < 0.9 || onDeck) {
        if (cur.length > 1) { out.push({ pts: cur, sector: ramp.sector }); stopMax = Math.max(stopMax, i) }
        cur = []
        if (onDeck) break
        continue
      }
      cur.push({ x, y: f.y, z, f: i })
    }
    if (cur.length > 1) { out.push({ pts: cur, sector: ramp.sector }); stopMax = deckOwn }
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
        cur.push({ x: f.x + f.px * side * RING_RAIL_OFF, y: f.y, z: f.z + f.pz * side * RING_RAIL_OFF, f: k })
      }
      if (cur.length > 1) out.push({ pts: cur, sector: s })
    }
  }
  return out
}

const rampAll = RAMPS.flatMap((r, i) => rampLines(r, i))
export const RAIL_LINES: RailLine[] = [...ringLines(), ...rampAll]

/** 看不见的墙：同一折线竖起一面 2.3m 高、两面都挡的墙（trimesh）。 */
export const WALL_H = 2.3
export function railWallMesh() {
  const v: number[] = []
  const idx: number[] = []
  for (const line of RAIL_LINES) {
    const base = v.length / 3
    for (const p of line.pts) v.push(p.x, p.y - 0.3, p.z, p.x, p.y + WALL_H, p.z)
    for (let i = 0; i < line.pts.length - 1; i++) {
      const k = base + i * 2
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }
  return { v: new Float32Array(v), i: new Uint32Array(idx) }
}
