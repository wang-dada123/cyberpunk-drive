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
  plots = plots.flatMap((P) => subtractRect(P, segRect([25, 0], [66, 0], 8.7))).flatMap((P) => subtractRect(P, segRect([76, 0], [240, 0], 10))) // AI 摊位带
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

/** 路口 3m 倒角：顶点两侧邻边都贴着道路退线（净距≈1.5m）→ 用过两边各 3m 处的直线切掉该角 */
export function chamferPoly(P: Poly, ch = 3): Poly {
  let Q = P
  for (let i = 0; i < P.length; i++) {
    const v = P[i], a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length]
    const la = Math.hypot(a[0] - v[0], a[1] - v[1]), lb = Math.hypot(b[0] - v[0], b[1] - v[1])
    if (la < ch * 2.5 || lb < ch * 2.5) continue
    const da: V2 = [(a[0] - v[0]) / la, (a[1] - v[1]) / la], db: V2 = [(b[0] - v[0]) / lb, (b[1] - v[1]) / lb]
    if (Math.abs(dot(da, db)) > 0.3) continue // 只切近直角
    const near = (d: V2) => roadClearance(v[0] + d[0] * 2, v[1] + d[1] * 2) < SETBACK_O + 0.4
    if (!near(da) || !near(db)) continue
    const p1: V2 = [v[0] + da[0] * ch, v[1] + da[1] * ch], p2: V2 = [v[0] + db[0] * ch, v[1] + db[1] * ch]
    let n: V2 = [-(p2[1] - p1[1]), p2[0] - p1[0]]; const L = Math.hypot(n[0], n[1]); n = [n[0] / L, n[1] / L]
    if (dot(n, v) < dot(n, p1)) n = [-n[0], -n[1]]
    Q = clip(Q, n, dot(n, p1))
  }
  return Q
}

/** 内圈（r≤150）街坊 v4：与外圈同一套 45° 扇区 + gridPlots 网格；
 *  行（沿扇区平分线）避开 r75 环：内排 u∈[29.5,61]、外排 u∈[83.5,115]/[123,150]；列宽 40m、通道 8m；
 *  再按路网（含窄巷折线、结构避让）做差集 → 两侧自然成整面长楼；碎块（最窄<14 或 <400m²）丢弃。 */
export const INNER_ROWS: [number, number][] = [[29.5, 61], [83.5, INNER_APOTHEM]]
/** 超过 maxL 的街坊沿最长边方向等分，块间 8m 通道 */
export const MIN_SIDE = 30
/** 平均宽度 = 面积 / 最长方向跨度 */
export function avgWidth(P: Poly) { let bi = 0, bl = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > bl) { bl = L; bi = i } }
  const a = P[bi], b = P[(bi + 1) % P.length], d: V2 = [(b[0] - a[0]) / bl, (b[1] - a[1]) / bl]; let lo = Infinity, hi = -Infinity; for (const p of P) { const t = dot(d, p); lo = Math.min(lo, t); hi = Math.max(hi, t) }
  return area(P) / (hi - lo) }
/** 广场旁楔形块：有顶点落在内排(u<61)范围内 → 允许最窄 <30，但平均宽 ≥30 */
const nearPlaza = (P: Poly) => P.some((p) => Math.hypot(p[0], p[1]) < 66)
/** 楔形平均宽 = 面积 / 径向进深（沿质心方向的跨度） */
export function wedgeAvgWidth(P: Poly) { let cx = 0, cz = 0; for (const p of P) { cx += p[0] / P.length; cz += p[1] / P.length } const L = Math.hypot(cx, cz), d: V2 = [cx / L, cz / L]
  let lo = Infinity, hi = -Infinity; for (const p of P) { const t = dot(d, p); lo = Math.min(lo, t); hi = Math.max(hi, t) } return area(P) / (hi - lo) }
export const blockOk = (P: Poly) => minWidth(P) >= MIN_SIDE - 0.01 || (nearPlaza(P) && wedgeAvgWidth(P) >= MIN_SIDE)
const span = (P: Poly) => { let m = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue; const d: V2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; let lo = Infinity, hi = -Infinity; for (const p of P) { const t = dot(d, p); lo = Math.min(lo, t); hi = Math.max(hi, t) } m = Math.max(m, hi - lo) } return m }
/** b4 补：沿任一边方向等分 n 段（块间 8m），挑"每块最短边 ≥30（广场楔形看平均宽）"且最大跨度最小的切法 */
function splitLong(P: Poly, maxL = 50): Poly[] {
  let best: Poly[] | null = null, bestS = Infinity
  const consider = (out: Poly[]) => {
    if (!out.length || !out.every((Q) => Q.length >= 3 && blockOk(Q))) return
    const sp = Math.max(...out.map(span)) + (out.length - 1) * 0.5 // 同等跨度时少切
    if (sp < bestS) { bestS = sp; best = out }
  }
  consider([P])
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L0 = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L0 < 1e-6) continue
    const d: V2 = [(b[0] - a[0]) / L0, (b[1] - a[1]) / L0]
    let lo = Infinity, hi = -Infinity; for (const p of P) { const t = dot(d, p); lo = Math.min(lo, t); hi = Math.max(hi, t) }
    const L = hi - lo
    for (let n = 2; n <= 4; n++) {
      const w = (L - (n - 1) * PASSAGE) / n; if (w < MIN_SIDE) break
      const out: Poly[] = []
      for (let k = 0; k < n; k++) { const s0 = lo + k * (w + PASSAGE); let Q = clip(P, [-d[0], -d[1]], -s0); Q = clip(Q, d, s0 + w); out.push(Q) }
      consider(out)
    }
  }
  if (!best) return [P]
  return bestS > maxL && (best as Poly[]).length === 1 ? [P] : best
}
export function innerLayout(maxL = 50, strict = true): Poly[] {
  let plots: Poly[] = []
  const RR = INNER_APOTHEM / Math.cos(Math.PI / 8) + 20
  for (let k = 0; k < 8; k++) {
    const a0 = (k * Math.PI) / 4, a1 = a0 + Math.PI / 4, am = (a0 + a1) / 2, u: V2 = [Math.cos(am), Math.sin(am)]
    const P: Poly = [[0, 0], [Math.cos(a0) * RR, Math.sin(a0) * RR], [Math.cos(a1) * RR, Math.sin(a1) * RR]]
    for (const [r0, r1] of INNER_ROWS) { let R = clip(P, [-u[0], -u[1]], -r0); R = clip(R, u, r1); if (R.length >= 3) plots.push(R) }
  }
  for (const s of segs) plots = plots.flatMap((P) => subtractRect(P, segRect(s.a, s.b, s.w / 2 + SETBACK_O)))
  plots = plots.flatMap((P) => subtractRect(P, segRect([25, 0], [66, 0], 8.7))).flatMap((P) => subtractRect(P, segRect([76, 0], [240, 0], 10)))
  const ok = (P: Poly) => {
    if (minWidth(P) < 14 || area(P) < 400) return false
    for (const p of P) if (Math.hypot(p[0], p[1]) < 1) return false
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; for (let t = 0; t <= 1; t += 0.05) if (roadClearance(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) < SETBACK_O - 0.1) return false }
    return true
  }
  plots = plots.flatMap((P) => splitLong(P, maxL)).filter(ok).map((P) => chamferPoly(P)).filter((P) => !strict || blockOk(P))
  for (let changed = true; changed;) {
    changed = false
    for (let i = 0; i < plots.length && !changed; i++) for (let j = i + 1; j < plots.length; j++) {
      const g = polyGap(plots[i], plots[j])
      if ((g > 0.05 && g < PASSAGE - 0.01) || polyOverlap(plots[i], plots[j])) { plots.splice(area(plots[i]) < area(plots[j]) ? i : j, 1); changed = true; break }
    }
  }
  return plots
}
