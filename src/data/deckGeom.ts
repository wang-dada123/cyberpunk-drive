import { ELEV_W, frameAt, type RoadFrame } from './expansionLayout'

const HW = ELEV_W / 2
/** 视觉环线桥面抬高（匝道并入后贴着它收边） */
export const RING_LIFT = 0.04

/**
 * 视觉桥面顶点/三角（纯数据，ElevatedRing 上色、scan-overlap-1106 同源扫描）。
 * 匝道/S2（带 edges）：落在环线桥面带内或越过内沿≤3m（-HW-3<lat<HW、高差<0.3m）的顶点推到环线外沿（lat=+HW，所有匝道都从 +侧汇入），
 * 高度取环线视觉桥面高；整行都推到外沿的三角面积为 0，直接不出。环线桥面只此一层，不再两层抢深度。
 * keep(x,z)<0 的部分裁掉：20°/340° 两条匝道镜像对称、在 θ=0 互相覆盖，各留自己那一半。
 */
export function deckArrays(frames: RoadFrame[], halfW?: number[], yLift = RING_LIFT, edges?: number[][][], keep?: (x: number, z: number) => number) {
  const pos: number[] = []
  const meta: number[] = [] // 每顶点 [s, lip]
  const idx: number[] = []
  const rowAt: number[] = []
  const onRing: boolean[] = []
  frames.forEach((f, i) => {
    rowAt.push(pos.length / 3)
    const prevGap = i > 0 && frames[i - 1].gap
    const lip = f.kick ? Math.min(1, (f.y - f.base) / 1.15) : prevGap ? 0.65 : 0
    const hw = halfW ? halfW[i] : HW
    for (const s of [-1, 0, 1]) {
      const e = edges && s !== 0 ? edges[s < 0 ? 0 : 1][i] : null
      let x = e ? e[0] : f.x + f.px * s * hw, y = Math.max(0.02, e ? e[1] : f.y) + yLift, z = e ? e[2] : f.z + f.pz * s * hw
      let clamped = false
      if (edges) {
        const g = frameAt(Math.atan2(-z, x))
        const lat = (x - g.x) * g.px + (z - g.z) * g.pz
        if (!g.gap && lat < HW && lat > -HW - 3 && Math.abs(y - yLift - g.y) < 0.3) {
          x = g.x + g.px * HW; z = g.z + g.pz * HW; y = g.y + RING_LIFT; clamped = true
        }
      }
      onRing.push(clamped)
      pos.push(x, y, z)
      meta.push(s, lip)
    }
  })
  const sArea = (a: number, b: number, c: number) => (pos[b * 3] - pos[a * 3]) * (pos[c * 3 + 2] - pos[a * 3 + 2]) - (pos[b * 3 + 2] - pos[a * 3 + 2]) * (pos[c * 3] - pos[a * 3])
  const cand: number[][] = []
  for (let i = 0; i < frames.length - 1; i++) {
    if (frames[i].gap || frames[i + 1].gap) continue
    const a = rowAt[i], b = rowAt[i + 1]
    cand.push([a, b, a + 1], [b, b + 1, a + 1], [a + 1, b + 1, a + 2], [b + 1, b + 2, a + 2])
  }
  // 急弯内侧折返的三角在平面上是翻面的（与多数绕序相反），它盖住的地方相邻正向三角已经铺了：翻面的不出
  let sum = 0
  for (const [a, b, c] of cand) sum += Math.sign(sArea(a, b, c))
  const dir = sum >= 0 ? 1 : -1
  // 1) 候选三角（翻面的不出；两条匝道交叠处按 keep 半平面裁开）→ XZ 凸多边形，记住来源三角
  type Piece = { poly: number[][]; src: number[]; row: number }
  const pieces: Piece[] = []
  const P2 = (v: number) => [pos[v * 3], pos[v * 3 + 2]]
  const rowOf = (v: number) => { let r = 0; while (r + 1 < rowAt.length && rowAt[r + 1] <= v) r++; return r }
  for (const [a, b, c] of cand) {
    if (onRing[a] && onRing[b] && onRing[c]) continue
    const ar = sArea(a, b, c)
    if (Math.abs(ar) < 1e-4 || Math.sign(ar) !== dir) continue
    let poly = [P2(a), P2(b), P2(c)]
    if (keep) poly = clipHalf(poly, (q) => keep(q[0], q[1]))
    if (poly.length >= 3) pieces.push({ poly, src: [a, b, c], row: rowOf(a) })
  }
  // 2) 同一网格内自叠（急弯内侧边点挤成一团，相邻行的细长三角互相盖住）：后出的减掉先出的（凸多边形差，精确切开），每处只留一层
  const out: Piece[] = []
  for (const pc of pieces) {
    let parts = [pc.poly]
    const y0 = pos[pc.src[0] * 3 + 1]
    for (const o of edges ? out : []) {
      if (pc.row - o.row > 12 || Math.abs(pos[o.src[0] * 3 + 1] - y0) > 0.6) continue
      const next: number[][][] = []
      for (const q of parts) next.push(...subtract(q, o.poly))
      parts = next
      if (!parts.length) break
    }
    for (const q of parts) if (polyArea(q) > 1e-4) out.push({ poly: q, src: pc.src, row: pc.row })
  }
  // 3) 落顶点：y 与颜色按来源三角重心插值
  const nPos: number[] = [], nMeta: number[] = []
  for (const o of out) {
    const [a, b, c] = o.src
    const ax = pos[a * 3], az = pos[a * 3 + 2], bx = pos[b * 3], bz = pos[b * 3 + 2], cx = pos[c * 3], cz = pos[c * 3 + 2]
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    const base = nPos.length / 3
    for (const [x, z] of o.poly) {
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v
      nPos.push(x, u * pos[a * 3 + 1] + v * pos[b * 3 + 1] + w * pos[c * 3 + 1], z)
      const near = u >= v && u >= w ? a : v >= w ? b : c
      nMeta.push(meta[near * 2], u * meta[a * 2 + 1] + v * meta[b * 2 + 1] + w * meta[c * 2 + 1])
    }
    // 保持原绕序
    const flip = Math.sign(polyArea2(o.poly)) !== dir
    for (let k = 1; k < o.poly.length - 1; k++) {
      if (flip) idx.push(base, base + k + 1, base + k); else idx.push(base, base + k, base + k + 1)
    }
  }
  return { pos: nPos, meta: nMeta, idx }
}

const polyArea2 = (P: number[][]) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1] } return a }
const polyArea = (P: number[][]) => Math.abs(polyArea2(P)) / 2
/** 凸多边形按 f>=0 半平面裁 */
function clipHalf(P: number[][], f: (p: number[]) => number) {
  const o: number[][] = []
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], fp = f(p), fq = f(q)
    if (fp >= 0) o.push(p)
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); o.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]) }
  }
  return o
}
/** 凸多边形差 A−B（B 凸），返回若干凸块；容差 1mm 避免共边误切 */
function subtract(A: number[][], B: number[][]): number[][][] {
  const bb = (P: number[][]) => [Math.min(...P.map((p) => p[0])), Math.max(...P.map((p) => p[0])), Math.min(...P.map((p) => p[1])), Math.max(...P.map((p) => p[1]))]
  const a = bb(A), b = bb(B)
  if (a[1] <= b[0] || b[1] <= a[0] || a[3] <= b[2] || b[3] <= a[2]) return [A]
  const sg = Math.sign(polyArea2(B)) || 1
  const res: number[][][] = []
  let cur = A
  for (let i = 0; i < B.length && cur.length >= 3; i++) {
    const p = B[i], q = B[(i + 1) % B.length], ex = q[0] - p[0], ez = q[1] - p[1], el = Math.hypot(ex, ez) || 1
    const inside = (r: number[]) => sg * (ex * (r[1] - p[1]) - ez * (r[0] - p[0])) / el - 0.001
    const outPart = clipHalf(cur, (r) => -inside(r))
    if (outPart.length >= 3 && polyArea(outPart) > 1e-6) res.push(outPart)
    cur = clipHalf(cur, inside)
  }
  if (cur.length < 3 || polyArea(cur) < 1e-5) return [A] // 没真正重叠（只擦边）：原样保留
  return res
}

/** 20°/340° 两条匝道在 θ=0（z=0）处镜像交叠：20° 只留 z≤0 半边，340° 只留 z≥0 半边（只作用于 x>150 的东侧汇入段） */
export function rampKeep(deg: number): ((x: number, z: number) => number) | undefined {
  if (deg === 20) return (x, z) => (x > 150 ? -z : 1)
  if (deg === 340) return (x, z) => (x > 150 ? z : 1)
  return undefined
}
