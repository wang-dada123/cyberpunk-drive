// 1106 全图重叠扫描：①护栏重复段（XZ 近距<0.35m、高差<0.5m、连续>1m）②护栏伸进路面（点在任一桥面内、离边>0.3m）
// ③桥面三角共面叠面（XZ 重叠且 y 差<5cm，面积>0.01m²）。桥面三角与 ElevatedRing.buildDeck 同算法。
// 用法：node scripts/scan-overlap-1106.mjs [out.json]
import { createServer } from 'vite'
import fs from 'node:fs'
const s = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const R = await s.ssrLoadModule('/src/data/railLines.ts')
const E = await s.ssrLoadModule('/src/data/expansionLayout.ts')
const S = await s.ssrLoadModule('/src/data/s2Bridge.ts')
const RS = await s.ssrLoadModule('/src/data/rampSurface.ts')
const HW = E.ELEV_W / 2
const S2 = S.S2_BRIDGE
const LANES = [...E.RAMPS, S2]
const laneName = (l) => l.lane == null ? `ring s${l.sector}` : l.lane === E.RAMPS.length ? `S2 side${l.side}` : `ramp${E.RAMPS[l.lane].deg} side${l.side}`
const deg = (x, z) => +(E.angOf(x, z) * 180 / Math.PI).toFixed(1)
const tag = (x, z) => {
  const t = []
  if (S.s2Dist(x, z, S2.deckOwn) < 14) t.push('S2窄巷门/汇入')
  const d = deg(x, z); if (Math.abs(d - S2.deg) < 25) t.push('S2扇区')
  return t
}
// ---------- 护栏 ----------
const L = R.RAIL_LINES
const samp = L.map((l) => { const o = []; const P = l.pts
  for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], d = Math.hypot(b.x - a.x, b.z - a.z), k = Math.max(1, Math.ceil(d / 0.25))
    for (let j = 0; j < k; j++) { const t = j / k; o.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }) } }
  o.push(P.at(-1)); return o })
const segDist = (p, P) => { let m = Infinity, y = 0
  for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], ax = b.x - a.x, az = b.z - a.z, l2 = ax * ax + az * az || 1e-9
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * ax + (p.z - a.z) * az) / l2)), d = Math.hypot(p.x - a.x - ax * t, p.z - a.z - az * t)
    if (d < m) { m = d; y = a.y + (b.y - a.y) * t } }
  return { d: m, y } }
const railDup = []
for (let i = 0; i < L.length; i++) for (let j = 0; j < L.length; j++) {
  if (i === j) continue
  // 同一侧同一线路按扇区切开的相邻段共享端点，不算
  let run = null
  const flush = () => { if (run && run.len > 1) railDup.push(run); run = null }
  const S_ = samp[i]
  for (let k = 0; k < S_.length; k++) {
    const p = S_[k], q = segDist(p, L[j].pts)
    if (q.d < 0.35 && Math.abs(q.y - p.y) < 0.5) {
      if (!run) run = { a: i, b: j, lineA: laneName(L[i]), lineB: laneName(L[j]), from: [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)], len: 0, minD: q.d, tags: tag(p.x, p.z), deg: deg(p.x, p.z) }
      else run.len += Math.hypot(p.x - S_[k - 1].x, p.z - S_[k - 1].z)
      run.minD = Math.min(run.minD, q.d); run.to = [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)]
    } else flush()
  }
  flush()
}
// 成对去重（a<b 保留较长）
const dupKey = new Map()
for (const r of railDup) { const k = Math.min(r.a, r.b) + '-' + Math.max(r.a, r.b) + '@' + Math.round(r.deg); const o = dupKey.get(k); if (!o || r.len > o.len) dupKey.set(k, r) }
const railDups = [...dupKey.values()].map((r) => ({ ...r, len: +r.len.toFixed(1), minD: +r.minD.toFixed(3) }))
// ---------- 桥面三角（与 buildDeck 同源） ----------
const DG = await s.ssrLoadModule('/src/data/deckGeom.ts')
function deckTris(frames, halfW, yLift, edges, src, keep) {
  const { pos, idx } = DG.deckArrays(frames, halfW ?? undefined, yLift, edges ?? undefined, keep), T = []
  const V = (k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]]
  for (let t = 0; t < idx.length; t += 3) T.push([V(idx[t]), V(idx[t + 1]), V(idx[t + 2]), src, Math.floor(idx[t] / 3)])
  return T
}
const TR = await (async () => {
  const T = []
  for (let sct = 0; sct < E.SECTORS; sct++) T.push(...deckTris(E.RING_FRAMES.slice(sct * E.RING_PER, sct * E.RING_PER + E.RING_PER + 1), null, 0.04, null, `ring-deck s${sct}`))
  for (const r of E.RAMPS) T.push(...deckTris(r.frames.slice(0, r.deckOwn + 1), r.halfW.slice(0, r.deckOwn + 1), 0.06, RS.laneEdges(r.frames, r.halfW), `ramp${r.deg}-deck`, DG.rampKeep(r.deg)))
  T.push(...deckTris(S2.frames.slice(0, S2.deckOwn + 1), S2.halfW.slice(0, S2.deckOwn + 1), 0.06, RS.laneEdges(S2.frames, S2.halfW), 'S2-deck'))
  return T })()
await s.close()
// 三角 XZ 交集（凸多边形裁剪）
const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[2] - q[0] * p[2] } return a / 2 }
function clip(subj, tri) {
  const sgn = Math.sign(area(tri)) || 1; let out = subj
  for (let i = 0; i < 3 && out.length; i++) { const A = tri[i], B = tri[(i + 1) % 3], inp = out; out = []
    const side = (p) => sgn * ((B[0] - A[0]) * (p[2] - A[2]) - (B[2] - A[2]) * (p[0] - A[0]))
    for (let k = 0; k < inp.length; k++) { const P = inp[k], Q = inp[(k + 1) % inp.length], sp = side(P), sq = side(Q)
      if (sp >= 0) out.push(P)
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t, P[2] + (Q[2] - P[2]) * t]) } } }
  return out
}
function yAt(tri, x, z) { const [a, b, c] = tri, d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) return null
  const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d
  return u * a[1] + v * b[1] + (1 - u - v) * c[1] }
const G = new Map(), CS = 4
TR.forEach((t, i) => { const xs = t.slice(0, 3).map((p) => p[0]), zs = t.slice(0, 3).map((p) => p[2])
  for (let gx = Math.floor(Math.min(...xs) / CS); gx <= Math.floor(Math.max(...xs) / CS); gx++) for (let gz = Math.floor(Math.min(...zs) / CS); gz <= Math.floor(Math.max(...zs) / CS); gz++) { const k = gx + ',' + gz; (G.get(k) ?? G.set(k, []).get(k)).push(i) } })
const seen = new Set(), deckOv = []
for (const ids of G.values()) for (let p = 0; p < ids.length; p++) for (let q = p + 1; q < ids.length; q++) {
  const i = ids[p], j = ids[q], k = i + ':' + j; if (seen.has(k)) continue; seen.add(k)
  const A = TR[i], B = TR[j]
  if (Math.abs(area(A.slice(0, 3))) < 1e-6 || Math.abs(area(B.slice(0, 3))) < 1e-6) continue
  const P = clip(A.slice(0, 3), B.slice(0, 3)); if (P.length < 3) continue
  const ar = Math.abs(area(P)); if (ar < 0.01) continue
  const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cz = P.reduce((s, p) => s + p[2], 0) / P.length
  const ya = yAt(A, cx, cz), yb = yAt(B, cx, cz); if (ya == null || yb == null) continue
  const dy = Math.abs(ya - yb); if (dy >= 0.05) continue
  deckOv.push({ a: A[3], b: B[3], fa: A[4], fb: B[4], at: [+cx.toFixed(1), +ya.toFixed(2), +cz.toFixed(1)], deg: deg(cx, cz), area: +ar.toFixed(3), dyCm: +(dy * 100).toFixed(1), tags: tag(cx, cz) })
}
// 按来源对 + 5° 聚合
const agg = new Map()
for (const o of deckOv) { const k = o.a + ' × ' + o.b + ' @' + Math.round(o.deg / 5) * 5; const g = agg.get(k) ?? { pair: o.a + ' × ' + o.b, deg: Math.round(o.deg / 5) * 5, at: o.at, tris: 0, area: 0, maxDyCm: 0, tags: o.tags }; g.tris++; g.area += o.area; g.maxDyCm = Math.max(g.maxDyCm, o.dyCm); agg.set(k, g) }
const deckGroups = [...agg.values()].map((g) => ({ ...g, area: +g.area.toFixed(2) })).sort((a, b) => b.area - a.area)
// ---------- 护栏伸进路面：护栏点及其四周 0.3m 都落在某块桥面内（|dy|<1m） ----------
const inDeck = (x, z, y) => { const c = G.get(Math.floor(x / CS) + ',' + Math.floor(z / CS)); if (!c) return false
  for (const i of c) { const t = TR[i], [a, b, d] = t, s1 = (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]), s2 = (d[0] - b[0]) * (z - b[2]) - (d[2] - b[2]) * (x - b[0]), s3 = (a[0] - d[0]) * (z - d[2]) - (a[2] - d[2]) * (x - d[0])
    if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) { const yy = yAt(t, x, z); if (yy != null && Math.abs(yy - y) < 1) return true } }
  return false }
const railIn = []
samp.forEach((S_, i) => { let run = null
  const flush = () => { if (run && run.len > 1) railIn.push({ ...run, len: +run.len.toFixed(1) }); run = null }
  for (let k = 0; k < S_.length; k++) { const p = S_[k], D = 0.3
    const deep = [[0, 0], [D, 0], [-D, 0], [0, D], [0, -D]].every(([dx, dz]) => inDeck(p.x + dx, p.z + dz, p.y))
    if (deep) { if (!run) run = { line: laneName(L[i]), li: i, from: [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)], len: 0, deg: deg(p.x, p.z), tags: tag(p.x, p.z) }; else run.len += Math.hypot(p.x - S_[k - 1].x, p.z - S_[k - 1].z); run.to = [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)] }
    else flush() }
  flush() })
// 平行近距护栏（0.35~1.6m，可能是视觉上"两条并排"），只报告不计超阈值
const railPar = []
for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { let run = null
  const flush = () => { if (run && run.len > 2) railPar.push({ ...run, len: +run.len.toFixed(1), minD: +run.minD.toFixed(2) }); run = null }
  const S_ = samp[i]
  for (let k = 0; k < S_.length; k++) { const p = S_[k], q = segDist(p, L[j].pts)
    if (q.d < 1.6 && Math.abs(q.y - p.y) < 0.5) { if (!run) run = { lineA: laneName(L[i]), lineB: laneName(L[j]), from: [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)], len: 0, minD: q.d, deg: deg(p.x, p.z), tags: tag(p.x, p.z) }; else run.len += Math.hypot(p.x - S_[k - 1].x, p.z - S_[k - 1].z); run.minD = Math.min(run.minD, q.d); run.to = [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)] } else flush() }
  flush() }
const res = { railDup: { n: railDups.length, totalLen: +railDups.reduce((s, r) => s + r.len, 0).toFixed(1), list: railDups.sort((a, b) => b.len - a.len) },
  railInRoad: { n: railIn.length, totalLen: +railIn.reduce((s, r) => s + r.len, 0).toFixed(1), list: railIn }, railNear: railPar, deck: { pairs: deckOv.length, area: +deckOv.reduce((s, o) => s + o.area, 0).toFixed(2), groups: deckGroups }, tris: TR.length }
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(res, null, 1))
console.log(`护栏重复段 ${res.railDup.n} 处，共 ${res.railDup.totalLen}m`)
for (const r of res.railDup.list) console.log(`  ${r.lineA} ↔ ${r.lineB}  ${r.len}m  minD=${r.minD}  ${r.from}→${r.to}  θ=${r.deg}° ${r.tags.join(',')}`)
console.log(`护栏伸进路面 ${res.railInRoad.n} 处，共 ${res.railInRoad.totalLen}m`)
for (const r of railIn) console.log(`  ${r.line} ${r.len}m ${r.from}→${r.to} θ=${r.deg}° ${r.tags.join(',')}`)
console.log(`近距并排护栏(0.35~1.6m,仅提示) ${railPar.length} 处`)
for (const r of railPar) console.log(`  ${r.lineA} ↔ ${r.lineB} ${r.len}m minD=${r.minD} ${r.from}→${r.to} θ=${r.deg}° ${r.tags.join(',')}`)
console.log(`超阈值合计 ${res.railDup.n + res.railInRoad.n + res.deck.pairs}`)
console.log(`桥面共面叠面 ${res.deck.pairs} 对三角，共 ${res.deck.area}m²（${res.tris} tris）`)
for (const g of deckGroups) console.log(`  ${g.pair}  θ≈${g.deg}°  ${g.tris}对 ${g.area}m² maxDy=${g.maxDyCm}cm @${g.at} ${g.tags.join(',')}`)
