/**
 * 1107 回归：S2 汇入口不再并排插护栏；桥面没有伸出去的大三角；展示环未集齐不亮。
 * node scripts/check-1107.mjs
 */
import { createServer } from 'vite'

const s = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const R = await s.ssrLoadModule('/src/data/railLines.ts')
const E = await s.ssrLoadModule('/src/data/expansionLayout.ts')
const S = await s.ssrLoadModule('/src/data/s2Bridge.ts')
const DG = await s.ssrLoadModule('/src/data/deckGeom.ts')
const RS = await s.ssrLoadModule('/src/data/rampSurface.ts')
const G = await s.ssrLoadModule('/src/data/gadgets.ts')
const S2 = S.S2_BRIDGE
const fail = []
const ok = (c, m) => { if (!c) fail.push(m) }

function latOf(x, z) {
  const g = E.frameAt(E.angOf(x, z))
  return (x - g.x) * g.px + (z - g.z) * g.pz
}
function segDist(p, P) {
  let m = Infinity
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], ax = b.x - a.x, az = b.z - a.z, l2 = ax * ax + az * az || 1
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * ax + (p.z - a.z) * az) / l2))
    m = Math.min(m, Math.hypot(p.x - (a.x + ax * t), p.z - (a.z + az * t)))
  }
  return m
}
function edgeDist(p, edge) {
  let m = Infinity
  for (let i = 0; i < edge.length - 1; i++) {
    const a = edge[i], b = edge[i + 1], ax = b[0] - a[0], az = b[2] - a[2], l2 = ax * ax + az * az || 1
    const t = Math.min(1, Math.max(0, ((p.x - a[0]) * ax + (p.z - a[2]) * az) / l2))
    m = Math.min(m, Math.hypot(p.x - (a[0] + ax * t), p.z - (a[2] + az * t)))
  }
  return m
}

const lines = R.RAIL_LINES
const rings = lines.filter((l) => l.lane == null)
const s2 = lines.filter((l) => l.lane === E.RAMPS.length)
const near = s2.find((l) => l.side === 1)
const far = s2.find((l) => l.side === -1)
ok(near && far, 'S2 两侧护栏都在')

let nearMin = Infinity
for (const p of near.pts) for (const r of rings) nearMin = Math.min(nearMin, segDist(p, r.pts))
ok(nearMin >= 1.2, `S2 近侧和还留着的环线护栏最近 ${nearMin.toFixed(2)}m，并排重复应已去掉`)

const end = near.pts.at(-1)
const gEnd = E.frameAt(E.angOf(end.x, end.z))
const ringX = gEnd.x + gEnd.px * R.RING_RAIL_OFF
const ringZ = gEnd.z + gEnd.pz * R.RING_RAIL_OFF
const joinD = Math.hypot(end.x - ringX, end.z - ringZ)
const endDeg = E.angOf(end.x, end.z) * 180 / Math.PI
ok(joinD < 0.8, `近侧终点应接到环线内侧护栏上，实际相距 ${joinD.toFixed(2)}m`)
ok(endDeg > 117 && endDeg < 120, `近侧在缺口起点平头结束，θ=${endDeg.toFixed(2)}°`)
ok(!near.fade0 && !near.fade1, '近侧不再收成尖头')

const edges = RS.laneEdges(S2.frames, S2.halfW)
let farOff = 0
for (const p of far.pts) farOff = Math.max(farOff, edgeDist(p, edges[0]))
ok(farOff < 1.2, `远侧护栏离桥面外缘最大 ${farOff.toFixed(2)}m，外缘要有护栏`)
ok(latOf(far.pts.at(-1).x, far.pts.at(-1).z) > 5.1, '远侧护栏不骑进环线路面')

const inner = rings.filter((l) => l.sector === 2 && Math.abs(latOf(l.pts[0].x, l.pts[0].z) - R.RING_RAIL_OFF) < 0.2)
ok(inner.length >= 1, '扇区 2 内侧护栏还在')
const endTh = E.angOf(end.x, end.z)
let gapFrom = null
for (const l of inner) for (const p of [l.pts[0], l.pts.at(-1)]) {
  const th = E.angOf(p.x, p.z)
  if (th < endTh - 0.01 && (gapFrom == null || th > gapFrom)) gapFrom = th
}
const R_IN = 255 - R.RING_RAIL_OFF
const gapArc = (endTh - gapFrom) * R_IN
const gap0 = gapFrom, gap1 = endTh
ok(gapArc > 60 && gapArc < 85, `汇入口没有护栏的弧长 ${gapArc.toFixed(1)}m，应在 60–85m`)
const outer = rings.find((l) => l.sector === 2 && Math.abs(latOf(l.pts[0].x, l.pts[0].z) + R.RING_RAIL_OFF) < 0.2)
const o0 = E.angOf(outer.pts[0].x, outer.pts[0].z), o1 = E.angOf(outer.pts.at(-1).x, outer.pts.at(-1).z)
ok(Math.abs(o1 - o0) > 0.7, '扇区 2 外侧护栏不断')

const anyFade = R.RAIL_LINES.filter((l) => l.fade0 || l.fade1)
ok(anyFade.length === 0, `护栏端头保持全高，不应再收尖（${anyFade.length} 条）`)

const { pos, idx } = DG.deckArrays(S2.frames.slice(0, S2.deckOwn + 1), S2.halfW.slice(0, S2.deckOwn + 1), 0.06, edges)
let maxE = 0, low = 0
for (let t = 0; t < idx.length; t += 3) {
  const V = [0, 1, 2].map((k) => [pos[idx[t + k] * 3], pos[idx[t + k] * 3 + 1], pos[idx[t + k] * 3 + 2]])
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3
    maxE = Math.max(maxE, Math.hypot(V[a][0] - V[b][0], V[a][1] - V[b][1], V[a][2] - V[b][2]))
  }
  if (Math.min(...V.map((v) => v[1])) < 5) low++
}
ok(maxE < 8, `S2 桥面最长边 ${maxE.toFixed(2)}m，不应出现伸出去的大三角`)
ok(low === 0, `S2 桥面有 ${low} 个三角垂到 y<5`)

ok(G.SHOWCASE.x === 0 && G.SHOWCASE.y === 7.4 && G.SHOWCASE.z === -188 && G.SHOWCASE.r === 3.5 && G.SHOWCASE.tube === 0.16, '展示环位置与基线一致')
ok(G.showcaseLit(0) === false && G.showcaseLit(0x7f) === false && G.showcaseLit(0xff) === true, '未集齐 8 个光点不亮，集齐才亮')
ok(G.SHOWCASE_MARK === '完成', '集齐后的字是「完成」')

let railSeg = 0
for (const l of lines) railSeg += Math.max(0, l.pts.length - 1)
const wall = R.railWallMesh()
console.log(JSON.stringify({
  nearMinM: +nearMin.toFixed(2),
  joinD: +joinD.toFixed(3),
  endDeg: +endDeg.toFixed(2),
  nearEnd: [+end.x.toFixed(1), +end.y.toFixed(2), +end.z.toFixed(1)],
  nearLat: +latOf(end.x, end.z).toFixed(2),
  gapArcM: +gapArc.toFixed(2),
  gapDeg: [+(gap0 * 180 / Math.PI).toFixed(2), +(gap1 * 180 / Math.PI).toFixed(2)],
  farOffM: +farOff.toFixed(2),
  deckTris: idx.length / 3,
  deckMaxEdgeM: +maxE.toFixed(2),
  railTris: railSeg * 2,
  wallTris: wall.i.length / 3,
}, null, 1))

await s.close()
if (fail.length) {
  console.error('FAIL')
  for (const m of fail) console.error(' -', m)
  process.exit(1)
}
console.log('check-1107 ok')
