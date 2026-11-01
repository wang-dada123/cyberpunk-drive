import { ELEV_W, RAMPS, nearRampJoin, type Ramp, type RoadFrame } from './expansionLayout'

/** 看不见的护栏：厚 0.56m、高 2.3m，每段在接头上重叠，弯道外侧不会留缝。 */
export type GuardBox = {
  position: [number, number, number]
  rotation: [number, number, number]
  args: [number, number, number]
}

const HALF_T = 0.28
const HALF_H = 1.15
const OVER = 0.5

function pushSeg(
  out: GuardBox[],
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  px: number, pz: number,
  side: number,
  inset: number,
) {
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  if (len < 0.2) return
  const y = (ay + by) * 0.5
  out.push({
    position: [(ax + bx) / 2 + px * side * inset, y + HALF_H - 0.25, (az + bz) / 2 + pz * side * inset],
    rotation: [0, Math.atan2(dx, dz), 0],
    args: [HALF_T, HALF_H, len / 2 + OVER],
  })
}

/** 这点若落在某条匝道的路面里，高架自己的护栏就不能挡在这儿。 */
function inRampLane(x: number, z: number, y: number) {
  for (let r = 0; r < RAMPS.length; r++) {
    const ramp = RAMPS[r]
    const fs = ramp.frames
    const end = ramp.deckOwn
    for (let i = 0; i < end; i++) {
      const a = fs[i]
      const b = fs[i + 1]
      if (a.y < 0.5 && b.y < 0.5) continue
      const abx = b.x - a.x
      const abz = b.z - a.z
      const l2 = abx * abx + abz * abz || 1
      let t = ((x - a.x) * abx + (z - a.z) * abz) / l2
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const half = ramp.halfW[i] + (ramp.halfW[i + 1] - ramp.halfW[i]) * t
      const fy = a.y + (b.y - a.y) * t
      if (Math.abs(y - fy) > 2.2) continue
      if (Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)) < half - 0.05) return true
    }
  }
  return false
}

/** 高架两侧。内侧只在匝道汇入口断开；外侧全程不断。飞台缺口不封。 */
export function ringGuardBoxes(frames: RoadFrame[]): GuardBox[] {
  const out: GuardBox[] = []
  const inset = ELEV_W / 2 + 0.12 + HALF_T
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i]
    const b = frames[i + 1]
    if (a.gap || b.gap) continue
    const px = a.px
    const pz = a.pz
    const mx = (a.x + b.x) / 2
    const mz = (a.z + b.z) / 2
    const my = (a.y + b.y) / 2
    for (const side of [-1, 1]) {
      if (side === 1 && (nearRampJoin(a.x, a.z, 9) || nearRampJoin(b.x, b.z, 9))) continue
      const wx = mx + px * side * inset
      const wz = mz + pz * side * inset
      if (inRampLane(wx, wz, my)) continue
      pushSeg(out, a.x, a.y, a.z, b.x, b.y, b.z, px, pz, side, inset)
    }
  }
  return out
}

function stationClear(ramp: Ramp, i: number, inset: number) {
  const { frames, halfW } = ramp
  const f = frames[i]
  for (const side of [-1, 1]) {
    const x = f.x + f.px * side * inset
    const z = f.z + f.pz * side * inset
    const y = f.y
    for (let k = 0; k < frames.length - 1; k++) {
      if (Math.abs(k - i) <= 3) continue
      const a = frames[k]
      const b = frames[k + 1]
      const abx = b.x - a.x
      const abz = b.z - a.z
      const l2 = abx * abx + abz * abz || 1
      let t = ((x - a.x) * abx + (z - a.z) * abz) / l2
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t))
      const half = halfW[k] + (halfW[k + 1] - halfW[k]) * t
      const fy = a.y + (b.y - a.y) * t
      if (d < half + 0.15 && y < fy + 1.3) return false
    }
  }
  return true
}

/** 匝道抬起来之后的两侧。贴地坡口留空，外环两个方向还能拐进来。 */
export function rampGuardBoxes(ramp: Ramp): GuardBox[] {
  const out: GuardBox[] = []
  const { frames, halfW, deckOwn } = ramp
  for (let i = 0; i < deckOwn; i++) {
    const a = frames[i]
    const b = frames[i + 1]
    if (a.y < 1.2 || b.y < 1.2) continue
    const inset = (halfW[i] + halfW[i + 1]) * 0.5 + 0.22 + HALF_T
    if (!stationClear(ramp, i, inset) || !stationClear(ramp, i + 1, inset)) continue
    for (const side of [-1, 1]) {
      pushSeg(out, a.x, a.y, a.z, b.x, b.y, b.z, a.px, a.pz, side, inset)
    }
  }
  return out
}
