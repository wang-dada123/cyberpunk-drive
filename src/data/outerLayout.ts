/** 外圈（r>150）街坊排布 v3：
 *  8 个 45° 扇区 × 3 个 15° 子扇区为凸多边形（内边弦 158、外边内接 r212.5 的弧），
 *  逐条道路/结构的避让矩形（半宽 = 路宽/2 + 1.5m 退线）做凸多边形差集 → 每块 = 一个街坊；
 *  街坊沿主方向按 3 种标准地块（24/32/40m 面宽）切分，地块间 8m 通道；碎片（最窄 <10m 或 <220m²）丢弃。
 *  所有边都是直线 → 扇区边缘（放射路）立面笔直无锯齿；只出现 0 贴死或 ≥8m 的缝。 */
import { segs, rings, WORLD_HALF, roadClearance } from './mapLayout'

export type V2 = [number, number]
export type Poly = V2[]
export const OUTER_R0 = 150, OUTER_CHORD = 158, PLOT_W = [24, 32, 40], PASSAGE = 8, SETBACK_O = 1.5

const dot = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1]
export function area(P: Poly) { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1] } return Math.abs(s) / 2 }
/** 保留 n·p <= c 的部分 */
function clip(P: Poly, n: V2, c: number): Poly {
  const out: Poly = []
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], da = dot(n, a) - c, db = dot(n, b) - c
    if (da <= 0) out.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) }
  }
  // 去重
  return out.filter((p, i) => { const q = out[(i + 1) % out.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4 })
}
type HP = [V2, number]
const PERMS: number[][] = []
;(function perm(a: number[], r: number[]) { if (!a.length) { PERMS.push(r); return } a.forEach((x, i) => perm(a.filter((_, j) => j !== i), [...r, x])) })([0, 1, 2, 3], [])
const good = (P: Poly) => minWidth(P) >= 14 && area(P) >= 400
function subtractRect(P: Poly, H0: HP[]): Poly[] {
  let inside = P
  for (const [n, c] of H0) { inside = clip(inside, n, c); if (inside.length < 3) return [P] }
  if (area(inside) < 1e-4) return [P]
  // 选分解顺序：保留的有效面积最大、块数最少（避免延长线把街坊切碎）
  let best: Poly[] = [], bs = -Infinity
  for (const pm of PERMS) {
    const H = pm.map((i) => H0[i]), out: Poly[] = []; let cur = P
    for (const [n, c] of H) {
      const o = clip(cur, [-n[0], -n[1]], -c); if (o.length >= 3 && area(o) > 1e-3) out.push(o)
      cur = clip(cur, n, c); if (cur.length < 3) break
    }
    const sc = out.reduce((a, q) => a + (good(q) ? area(q) : 0), 0) - out.length * 150
    if (sc > bs) { bs = sc; best = out }
  }
  return best
}
function segRect(a: V2, b: V2, hw: number): HP[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  const d: V2 = L > 1e-3 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : [1, 0], n: V2 = [-d[1], d[0]]
  return [[d, dot(d, b) + hw], [[-d[0], -d[1]], -dot(d, a) + hw], [n, dot(n, a) + hw], [[-n[0], -n[1]], -dot(n, a) + hw]]
}
/** 最窄宽度（凸多边形：各边法向投影宽度的最小值） */
export function minWidth(P: Poly) {
  let m = Infinity
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-3) continue
    const n: V2 = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]; let lo = Infinity, hi = -Infinity
    for (const p of P) { const v = dot(n, p); lo = Math.min(lo, v); hi = Math.max(hi, v) }
    m = Math.min(m, hi - lo)
  }
  return m
}
function polyGap(A: Poly, B: Poly) {
  // 凸多边形间最小距离（相交 → 0，用分离轴判断是否重叠）
  const segD = (p: V2, a: V2, b: V2) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
  let m = Infinity
  for (const [X, Y] of [[A, B], [B, A]]) for (const p of X) for (let i = 0; i < Y.length; i++) m = Math.min(m, segD(p, Y[i], Y[(i + 1) % Y.length]))
  return m
}
export function polyOverlap(A: Poly, B: Poly) {
  for (const [X] of [[A], [B]]) for (let i = 0; i < X.length; i++) {
    const a = X[i], b = X[(i + 1) % X.length], n: V2 = [-(b[1] - a[1]), b[0] - a[0]], L = Math.hypot(n[0], n[1]); n[0] /= L; n[1] /= L
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
    for (const p of A) { const v = dot(n, p); a0 = Math.min(a0, v); a1 = Math.max(a1, v) }
    for (const p of B) { const v = dot(n, p); b0 = Math.min(b0, v); b1 = Math.max(b1, v) }
    if (a1 <= b0 + 0.02 || b1 <= a0 + 0.02) return false
  }
  return true
}
export { polyGap }

export const DBG: any = {}
/** 凸区域 P 按行列切成地块：u = 行法向（行沿 v 延伸），行 = [o, o+depth]，行间/列间 8m 通道 */
function gridPlots(P: Poly, u: V2, rows: [number, number][], colW: number, colOff: number): Poly[] {
  const v: V2 = [-u[1], u[0]], out: Poly[] = []
  let vlo = Infinity, vhi = -Infinity
  for (const p of P) { const t = dot(v, p); vlo = Math.min(vlo, t); vhi = Math.max(vhi, t) }
  for (const [r0, r1] of rows) {
    let R = clip(P, [-u[0], -u[1]], -r0); R = clip(R, u, r1); if (R.length < 3) continue
    const k0 = Math.floor((vlo - colOff) / (colW + PASSAGE)) - 1
    for (let k = k0; colOff + k * (colW + PASSAGE) < vhi; k++) {
      const s0 = colOff + k * (colW + PASSAGE) + PASSAGE / 2, s1 = s0 + colW
      let Q = clip(R, [-v[0], -v[1]], -s0); Q = clip(Q, v, s1)
      if (Q.length >= 3 && area(Q) > 1) out.push(Q)
    }
  }
  return out
}

export const INNER_APOTHEM = OUTER_CHORD - PASSAGE // 内圈方格楼须落在这个正八边形内
export function outerLayout(): Poly[] {
  const RO = rings.find((r) => r.r > 200)!, R1 = RO.r - RO.w / 2 - SETBACK_O, R2 = RO.r + RO.w / 2 + SETBACK_O, G = WORLD_HALF - 1.5
  let plots: Poly[] = []
  for (let k = 0; k < 8; k++) {
    const a0 = (k * Math.PI) / 4, a1 = a0 + Math.PI / 4, am = (a0 + a1) / 2, u: V2 = [Math.cos(am), Math.sin(am)]
    // 环内扇区：两条放射边 + 内接弧
    const P: Poly = [[0, 0]]
    for (let j = 0; j <= 12; j++) { const a = a0 + ((a1 - a0) * j) / 12; P.push([Math.cos(a) * R1, Math.sin(a) * R1]) }
    // 标准地块 A：深 24 × 面宽 32；B：深 22 × 面宽 32（外排）
    plots.push(...gridPlots(P, u, [[OUTER_CHORD, OUTER_CHORD + 24], [OUTER_CHORD + 32, R1]], 32, 0))
    // 环外四角（只在对角扇区之间：以 45° 方向为中心的角块）
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const u: V2 = [sx * Math.SQRT1_2, sz * Math.SQRT1_2]
    let Q: Poly = [[-G, -G], [G, -G], [G, G], [-G, G]]
    Q = clip(Q, [-u[0], -u[1]], -R2)
    plots.push(...gridPlots(Q, u, [[R2, R2 + 24], [R2 + 32, R2 + 56], [R2 + 64, 400]], 24, 0))
  }
  for (const s of segs) plots = plots.flatMap((P) => subtractRect(P, segRect(s.a, s.b, s.w / 2 + SETBACK_O)))
  plots = plots.flatMap((P) => subtractRect(P, segRect([25, 0], [240, 0], 11.5))) // AI 摊位带
  const ok = (P: Poly) => {
    if (minWidth(P) < 10 || area(P) < 220) return false
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; for (let t = 0; t <= 1; t += 0.1) if (roadClearance(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) < SETBACK_O - 0.1) return false }
    return true
  }
  plots = plots.filter(ok)
  for (let changed = true; changed;) {
    changed = false
    for (let i = 0; i < plots.length && !changed; i++) for (let j = i + 1; j < plots.length; j++) {
      const g = polyGap(plots[i], plots[j])
      if ((g > 0.05 && g < PASSAGE - 0.01) || polyOverlap(plots[i], plots[j])) { plots.splice(area(plots[i]) < area(plots[j]) ? i : j, 1); changed = true; break }
    }
  }
  return plots
}
