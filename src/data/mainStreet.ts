/**
 * 主街（雨夜窄巷）三段精修布局。车道宽、路缘、地面网格不动：
 * A 出生段实际路宽 14m（规格草案写 7m，改路宽会挡住现有车道），楼面退在路缘外 1.5m；
 * B 贴在 r75 环岛南侧，路口本身就是开阔交叉；
 * C 在 z>105 的 8m 窄巷上，尽端 T5 落在直道视线轴、弯道外侧，不压路。
 */
import { roadClearance } from './mapLayout'
import type { Poly } from './outerLayout'

export type SegId = 'A' | 'B' | 'C'
export type BType = 'T1' | 'T2' | 'T3' | 'T4' | 'T5'
export type ShopKind = 'noodle' | 'repair' | 'tea' | 'mart' | 'cafe' | 'books' | 'flora' | 'shutter'

export type Shop = { word: string; zh?: string; kind: ShopKind }
export type Bld = {
  id: string
  seg: SegId
  type: BType
  /** -1 西（-X），+1 东（+X），0 居中（塔） */
  side: -1 | 0 | 1
  /** 朝街一面的 x。塔不用。 */
  face: number
  z0: number
  z1: number
  depth: number
  h: number
  shop?: Shop
  balcony?: boolean
  laundry?: boolean
  /** 玻璃盒子：混凝土只留 4m，上面全是幕墙（B 段亭子） */
  glass?: boolean
  /** 朝路口的 45° 切角 */
  chamfer?: boolean
  shutter?: boolean
}

const WORDS = new Set(['NOODLE', 'REPAIR', 'TEA', '24H', 'CAFE', 'BOOKS', 'FLORA', 'PARTS', 'RADIO', 'CHIPS', 'FIX', 'EAVES LANE'])
const ZH = new Set(['面', '修', '茶', '雨巷'])

/** A 楼面收到 |x|=6.5：路缘仍在 7，可开的中线通道约 13m，车宽 1.1m。路网本身不改。 */
const FACE_A = 6.5
const FACE_W = 8.5
const FACE_N = 5.5

export const ICE = '#4FC3F7'
export const COLD = '#E8F4FF'
export const WARM = '#FFE6C4'
/** 天桥放在巷中段，薄桥面，追车机位不会贴着一块板。梁底约 6.5m。 */
export const BRIDGE_Z = 55.2
/**
 * 斜穿高架：街左前方 → 右中景。墩心落在 C 段人行道（路缘 |x|=4 之外），
 * 不压灭点，桥面在 z≈133 结束，尽端塔在 z≈157。
 */
export const VIADUCT = { a: [-5.45, 119.0] as [number, number], b: [5.45, 133.2] as [number, number] }
export const CLOCK = { x: 6.15, z: 86.4 }
export const TOWER_AT: [number, number, number] = [0, 0, 156.9]
/** 路灯灯头位置。A 的三根贴楼面，肩宽仍让中线车道过车。 */
export const STREET_LAMPS: Array<{ id: string; p: [number, number, number]; solid: boolean }> = [
  { id: 'a-lamp-w1', p: [-6.35, 5.32, 36.4], solid: true },
  { id: 'a-lamp-e1', p: [6.35, 5.32, 44.8], solid: true },
  { id: 'a-lamp-w2', p: [-6.35, 5.32, 58.2], solid: true },
  { id: 'b-lamp-e', p: [7.55, 5.15, 90.4], solid: false },
]

function b(p: Bld): Bld { return p }

export const MAIN_BUILDINGS: Bld[] = [
  // —— A 檐下巷。西：面馆 / 修理 / 茶，东：24H。高差 9/16/12/19 与 16/9/19/12 ——
  // 追车朝 +Z 时，画面左侧是 +X。面馆/修理/茶放在 +X，24H 放在 -X。
  b({ id: 'a-w-mart', seg: 'A', type: 'T4', side: -1, face: -FACE_A, z0: 37.4, z1: 45.2, depth: 8, h: 9, shop: { word: '24H', kind: 'mart' }, balcony: true }),
  b({ id: 'a-w-t1a', seg: 'A', type: 'T1', side: -1, face: -FACE_A, z0: 45.5, z1: 51.5, depth: 10, h: 16, balcony: true, laundry: true }),
  b({ id: 'a-w-t4', seg: 'A', type: 'T4', side: -1, face: -FACE_A, z0: 51.8, z1: 59.6, depth: 8, h: 12, balcony: true }),
  b({ id: 'a-w-t1b', seg: 'A', type: 'T1', side: -1, face: -FACE_A, z0: 59.9, z1: 66.2, depth: 10, h: 19, balcony: true, laundry: true, shutter: true }),
  b({ id: 'a-e-noodle', seg: 'A', type: 'T1', side: 1, face: FACE_A, z0: 37.4, z1: 43.4, depth: 10, h: 16, shop: { word: 'NOODLE', zh: '面', kind: 'noodle' }, balcony: true, laundry: true }),
  b({ id: 'a-e-repair', seg: 'A', type: 'T4', side: 1, face: FACE_A, z0: 43.7, z1: 51.7, depth: 8, h: 9, shop: { word: 'REPAIR', zh: '修', kind: 'repair' }, balcony: true }),
  b({ id: 'a-e-t2', seg: 'A', type: 'T2', side: 1, face: FACE_A, z0: 52.0, z1: 60.4, depth: 11, h: 19 }),
  b({ id: 'a-e-tea', seg: 'A', type: 'T1', side: 1, face: FACE_A, z0: 60.7, z1: 66.2, depth: 8, h: 12, shop: { word: 'TEA', zh: '茶', kind: 'tea' }, balcony: true }),

  // —— B 玻璃街。西转角 24m，东近处玻璃亭 8m（高差 16m），远处 16m 把天际线拉开 ——
  b({ id: 'b-w-cafe', seg: 'B', type: 'T3', side: -1, face: -FACE_W, z0: 86.2, z1: 96.0, depth: 8, h: 24, glass: true, chamfer: true, shop: { word: 'CAFE', kind: 'cafe' } }),
  b({ id: 'b-w-flora', seg: 'B', type: 'T4', side: -1, face: -FACE_W, z0: 97.6, z1: 105.2, depth: 8, h: 9, glass: true, shop: { word: 'FLORA', kind: 'flora' } }),
  b({ id: 'b-e-books', seg: 'B', type: 'T4', side: 1, face: FACE_W, z0: 86.2, z1: 95.4, depth: 8, h: 8, glass: true, shop: { word: 'BOOKS', kind: 'books' } }),
  b({ id: 'b-e-shut', seg: 'B', type: 'T4', side: 1, face: FACE_W, z0: 97.4, z1: 105.2, depth: 8, h: 16, glass: true, shutter: true }),

  // —— C 轨下市。西 10/22，东 14/26 ——
  b({ id: 'c-w-stall', seg: 'C', type: 'T4', side: -1, face: -FACE_N, z0: 116.5, z1: 124.2, depth: 5.2, h: 10, shop: { word: 'PARTS', kind: 'repair' } }),
  b({ id: 'c-w-t1', seg: 'C', type: 'T1', side: -1, face: -FACE_N, z0: 125.6, z1: 131.6, depth: 10, h: 22, balcony: true, shutter: true }),
  b({ id: 'c-e-hall', seg: 'C', type: 'T4', side: 1, face: FACE_N, z0: 116.5, z1: 124.8, depth: 6, h: 14, shop: { word: 'CHIPS', kind: 'mart' } }),
  b({ id: 'c-e-t2', seg: 'C', type: 'T2', side: 1, face: FACE_N, z0: 126.4, z1: 133.6, depth: 11, h: 26 }),

  // 尽端塔：直道消失点上的细塔，3.4×3.4×38。弯道在 x=14，塔不压路。
  b({ id: 't5', seg: 'C', type: 'T5', side: 0, face: 0, z0: TOWER_AT[2] - 2.1, z1: TOWER_AT[2] + 2.1, depth: 4.2, h: 38 }),
]

export function bands(bd: Bld) {
  if (bd.glass || bd.type === 'T3') return { conc: 4, glass: 4 }
  if (bd.type === 'T5') return { conc: 5, glass: 34 }
  if (bd.type === 'T4') return { conc: 4, glass: Math.max(4.2, bd.h - 0.7) }
  if (bd.type === 'T2') return { conc: 4.5, glass: bd.h - 3 }
  return { conc: 4, glass: Math.max(4.2, bd.h - 2) }
}

/** 占地矩形。side 0 的塔：x ∈ [-depth/2, depth/2] */
export function footprint(bd: Bld): [number, number, number, number] {
  if (bd.side === 0) return [-bd.depth / 2, bd.depth / 2, bd.z0, bd.z1]
  if (bd.side < 0) return [bd.face - bd.depth, bd.face, bd.z0, bd.z1]
  return [bd.face, bd.face + bd.depth, bd.z0, bd.z1]
}

export type Solid = { id: string; c: [number, number, number]; h: [number, number, number] }

/** 碰撞盒：半尺寸。只包楼体、塔、时钟柱、高架墩、摊位柜台。雨棚和道具不进碰撞。 */
export function solids(): Solid[] {
  const out: Solid[] = []
  for (const bd of MAIN_BUILDINGS) {
    const [x0, x1, z0, z1] = footprint(bd)
    out.push({ id: bd.id, c: [(x0 + x1) / 2, bd.h / 2, (z0 + z1) / 2], h: [(x1 - x0) / 2, bd.h / 2, (z1 - z0) / 2] })
  }
  out.push({ id: 'clock', c: [CLOCK.x, 4, CLOCK.z], h: [0.5, 4, 0.5] })
  // 高架细墩，半宽 0.2，人行道上
  out.push({ id: 'pier-w', c: [VIADUCT.a[0], 3.7, VIADUCT.a[1]], h: [0.2, 3.7, 0.2] })
  out.push({ id: 'pier-e', c: [VIADUCT.b[0], 3.7, VIADUCT.b[1]], h: [0.2, 3.7, 0.2] })
  for (const lamp of STREET_LAMPS) {
    if (!lamp.solid) continue
    const [x, , z] = lamp.p
    out.push({ id: lamp.id, c: [x, 2.6, z], h: [0.08, 2.6, 0.08] })
  }
  return out
}

export type StreetSign = {
  text: string
  font: 'en' | 'zh'
  p: [number, number, number]
  ry: number
  size: number
  ice: boolean
  vertical: boolean
  /** 绕 X 转。地面字用 -π/2，让字躺平朝上 */
  rx?: number
}

/** 灯箱中心的 x。朝 +Z 看时词首伸向 +X，东侧店要多往街心拉，否则楼体会吃掉开头。 */
export function shopSignY(bd: Bld) {
  if (bd.seg !== 'A') return 3.85
  const z = (bd.z0 + bd.z1) / 2
  return 2.85 + Math.max(0, z - 34) * 0.1
}

export function shopSignX(bd: Bld) {
  const word = bd.shop?.word ?? ''
  const pull = bd.side > 0 ? 1.7 + word.length * 0.36 : bd.seg === 'B' ? 1.35 : 1.05
  return bd.face - bd.side * pull
}

export function streetSigns(): StreetSign[] {
  const out: StreetSign[] = []
  const faceCam = Math.PI
  for (const bd of MAIN_BUILDINGS) {
    if (!bd.shop || bd.side === 0) continue
    const z = (bd.z0 + bd.z1) / 2
    if (bd.seg === 'A') {
      const ry = bd.side > 0 ? -Math.PI / 2 : Math.PI / 2
      const x = bd.face - bd.side * 0.58
      const y = 3.58
      out.push({ text: bd.shop.word, font: 'en', p: [x, y, z], ry, size: 0.34, ice: false, vertical: false })
      if (bd.shop.zh) out.push({ text: bd.shop.zh, font: 'zh', p: [x, y, z + 1.2], ry, size: 0.3, ice: true, vertical: false })
    } else if (bd.seg === 'B') {
      const x = shopSignX(bd)
      const y = shopSignY(bd)
      out.push({ text: bd.shop.word, font: 'en', p: [x, y, z - 0.42], ry: faceCam, size: 0.46, ice: false, vertical: false })
    }
  }
  out.push({ text: 'EAVES LANE', font: 'en', p: [0.85, 7.15, BRIDGE_Z - 0.95], ry: faceCam, size: 0.36, ice: false, vertical: false })
  out.push({ text: '雨巷', font: 'zh', p: [-1.7, 7.15, BRIDGE_Z - 0.95], ry: faceCam, size: 0.44, ice: true, vertical: false })
  // 钟面用冷白，1.6 以内仍能越过 Bloom 阈值；冰蓝在这个封顶下过不了阈值
  out.push({ text: '21:47', font: 'en', p: [CLOCK.x - 0.72, 7.55, CLOCK.z], ry: -Math.PI / 2, size: 0.3, ice: false, vertical: false })
  out.push({ text: '21:47', font: 'en', p: [CLOCK.x, 7.55, CLOCK.z - 0.72], ry: faceCam, size: 0.3, ice: false, vertical: false })
  // 地面投影字，躺平。追车从上方能读到 CAFE / FLORA
  for (const id of ['b-w-cafe', 'b-w-flora']) {
    const bd = MAIN_BUILDINGS.find((x) => x.id === id)!
    const x = bd.face - bd.side * 2.05
    const z = (bd.z0 + bd.z1) / 2
    out.push({ text: bd.shop!.word, font: 'en', p: [x, 0.1, z], ry: 0, rx: Math.PI / 2, size: 0.62, ice: false, vertical: false })
  }
  // C 竖招成林，全部朝来车。FIX 最大。亮度由文字材质封在 1.6。
  const hang: Array<[string, number, number, number, number]> = [
    ['PARTS', -4.55, 6.5, 117.6, 0.4],
    ['RADIO', -4.25, 8.05, 122.2, 0.38],
    ['CHIPS', -4.7, 5.45, 126.4, 0.36],
    ['FIX', 4.45, 7.15, 120.2, 0.62],
    ['PARTS', 4.2, 5.35, 125.4, 0.4],
    ['RADIO', 4.55, 6.7, 130.2, 0.36],
    ['CHIPS', -3.9, 7.35, 131.6, 0.34],
  ]
  for (const [text, x, y, z, size] of hang) {
    out.push({ text, font: 'en', p: [x, y, z], ry: faceCam, size, ice: false, vertical: true })
  }
  return out
}

/** 手机假辉光的锚点。每个光源一张，店内不挂片。 */
export function glowAnchors(): { p: [number, number, number]; s: number }[] {
  // 字本身已经是冷白自发光。光晕片如果罩住字，竖屏会把 NOODLE / 雨巷盖住，所以只挂在路灯和塔环上。
  const out: { p: [number, number, number]; s: number }[] = []
  for (const lamp of STREET_LAMPS) out.push({ p: lamp.p, s: 1.15 })
  out.push({ p: [TOWER_AT[0], 16.4, TOWER_AT[2]], s: 2.2 })
  out.push({ p: [TOWER_AT[0], 21.5, TOWER_AT[2]], s: 1.5 })
  return out
}

/** 出生点 → 巷尾（闸门前）中线。y=0，车脚本会抬高。 */
export function mainStreetDrive(): { x: number; y: number; z: number }[] {
  const line = (a: [number, number], b: [number, number], step: number) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(1, Math.round(L / step))
    const pts: { x: number; y: number; z: number }[] = []
    for (let i = 0; i <= n; i++) {
      const t = i / n
      pts.push({ x: a[0] + (b[0] - a[0]) * t, y: 0, z: a[1] + (b[1] - a[1]) * t })
    }
    return pts
  }
  const parts = [
    line([0, 20], [0, 138], 4),
    line([0, 138], [14, 150], 3),
    line([14, 150], [14, 176], 4),
    line([14, 176], [0, 188], 3),
    line([0, 188], [0, 205], 4),
  ]
  const out: { x: number; y: number; z: number }[] = []
  for (const p of parts) for (const q of p) {
    const prev = out[out.length - 1]
    if (prev && Math.hypot(prev.x - q.x, prev.z - q.z) < 0.4) continue
    out.push(q)
  }
  return out
}

function pointInPoly(x: number, z: number, P: Poly) {
  let c = false
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi) c = !c
  }
  return c
}
function segHit(a: [number, number], b: [number, number], c: [number, number], d: [number, number]) {
  const cross = (p: [number, number], q: [number, number], r: [number, number]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}
function rectHitsPoly(x0: number, x1: number, z0: number, z1: number, P: Poly) {
  const xs = P.map((p) => p[0]), zs = P.map((p) => p[1])
  if (Math.max(...xs) < x0 || Math.min(...xs) > x1 || Math.max(...zs) < z0 || Math.min(...zs) > z1) {
    // 仍可能多边形包住矩形
  }
  const box: [number, number][] = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
  if (box.some(([x, z]) => pointInPoly(x, z, P))) return true
  if (P.some(([x, z]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) return true
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length]
    for (let k = 0; k < 4; k++) if (segHit(a, b, box[k], box[(k + 1) % 4])) return true
  }
  return false
}

/** 沿街挖掉一条带，只去掉和新楼重叠的临街部分，街坊后身留下。带深到楼后约 8m，9m 铺面的天际线不会被贴脸高楼填上。 */
const CORRIDORS: Array<[number, number, number, number]> = [
  [-30, -6.05, 26, 66],
  [6.05, 30, 26, 66],
  [-28, -8.15, 83, 107],
  [8.15, 28, 83, 107],
  [-24, -5.15, 114, 140],
  [5.15, 24, 114, 140],
  [-6.2, 6.2, 151, 164],
]

function clipHalf(P: Poly, n: [number, number], c: number): Poly {
  const out: Poly = []
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length]
    const da = n[0] * a[0] + n[1] * a[1] - c, db = n[0] * b[0] + n[1] * b[1] - c
    if (da <= 1e-8) out.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out.filter((p, i) => {
    const q = out[(i + 1) % out.length]
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3
  })
}
function polyArea(P: Poly) {
  let s = 0
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1] }
  return Math.abs(s) / 2
}
function outsideRect(P: Poly, x0: number, x1: number, z0: number, z1: number): Poly[] {
  const left = clipHalf(P, [1, 0], x0)
  const right = clipHalf(P, [-1, 0], -x1)
  let mid = clipHalf(P, [-1, 0], -x0)
  mid = clipHalf(mid, [1, 0], x1)
  const below = clipHalf(mid, [0, 1], z0)
  const above = clipHalf(mid, [0, -1], -z1)
  return [left, right, below, above].filter((q) => q.length >= 3 && polyArea(q) > 40)
}
/** 不和走廊相交时返回同一个数组引用，调用方据此保持随机序列。 */
export function clipMainStreet(poly: Poly): Poly[] {
  if (!CORRIDORS.some(([x0, x1, z0, z1]) => rectHitsPoly(x0, x1, z0, z1, poly))) return [poly]
  let parts: Poly[] = [poly]
  for (const [x0, x1, z0, z1] of CORRIDORS) parts = parts.flatMap((p) => outsideRect(p, x0, x1, z0, z1))
  return parts.filter((p) => p.length >= 3 && polyArea(p) > 80)
}

function sampleClear(x0: number, x1: number, z0: number, z1: number) {
  let worst = Infinity
  let at: [number, number] = [x0, z0]
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const x = x0 + (x1 - x0) * (i / 4), z = z0 + (z1 - z0) * (j / 4)
    const c = roadClearance(x, z)
    if (c < worst) { worst = c; at = [x, z] }
  }
  return { worst, at }
}

/** 布局自检。返回错误字符串；空数组表示通过。 */
export function auditMainStreet(): string[] {
  const err: string[] = []
  const seen = new Map<SegId, { side: number; h: number; id: string; z: number }[]>()
  for (const bd of MAIN_BUILDINGS) {
    if (bd.z1 - bd.z0 < 4) err.push(`${bd.id} frontage < 4`)
    if (bd.h < 8) err.push(`${bd.id} height`)
    const [x0, x1, z0, z1] = footprint(bd)
    const { worst, at } = sampleClear(x0, x1, z0, z1)
    // A 的楼面收到路肩里约 0.5m，中线仍留 13m。其余楼必须退在路缘外。
    const allow = bd.seg === 'A' ? -0.85 : 1.35
    if (worst < allow) err.push(`${bd.id} clearance ${worst.toFixed(2)} at ${at.map((n) => n.toFixed(1)).join(',')}`)
    if (bd.seg === 'A' && bd.side !== 0 && Math.abs(bd.face) < 6.2) err.push(`${bd.id} face too close`)
    if (bd.shop && !WORDS.has(bd.shop.word)) err.push(`${bd.id} word ${bd.shop.word}`)
    if (bd.shop?.zh && !ZH.has(bd.shop.zh)) err.push(`${bd.id} zh`)
    if (bd.side !== 0) {
      const list = seen.get(bd.seg) ?? []
      list.push({ side: bd.side, h: bd.h, id: bd.id, z: bd.z0 })
      seen.set(bd.seg, list)
    }
  }
  for (const s of solids()) {
    const { worst, at } = sampleClear(s.c[0] - s.h[0], s.c[0] + s.h[0], s.c[2] - s.h[2], s.c[2] + s.h[2])
    const allow = s.id.startsWith('a-') ? -0.85 : s.id === 'clock' ? -1.4 : 1.2
    if (worst < allow) err.push(`solid ${s.id} clearance ${worst.toFixed(2)} at ${at.map((n) => n.toFixed(1)).join(',')}`)
  }
  for (const [seg, list] of seen) {
    for (const side of [-1, 1]) {
      const row = list.filter((e) => e.side === side).sort((a, b) => a.z - b.z)
      for (let i = 1; i < row.length; i++) {
        const d = Math.abs(row[i].h - row[i - 1].h)
        const need = seg === 'B' ? 6 : 3
        if (d < need) err.push(`${seg} ${row[i - 1].id}/${row[i].id} height diff ${d} < ${need}`)
      }
      if (row.length >= 2) {
        const hs = row.map((e) => e.h)
        const gap = hs.some((h, i) => (i > 0 && h + 4 <= hs[i - 1]) || (i + 1 < hs.length && h + 4 <= hs[i + 1]))
        if (!gap && Math.max(...hs) - Math.min(...hs) < 4) err.push(`${seg} side ${side} no skyline gap`)
      }
    }
  }
  const types = MAIN_BUILDINGS.reduce<Record<string, number>>((m, bd) => (m[bd.type] = (m[bd.type] ?? 0) + 1, m), {})
  if ((types.T1 ?? 0) < 4) err.push('need 4× T1 on A, got ' + types.T1)
  for (const sg of streetSigns()) {
    if (sg.font === 'en' && sg.text !== '21:47' && sg.text !== 'EAVES LANE' && !WORDS.has(sg.text)) err.push('sign ' + sg.text)
    if (sg.font === 'zh' && !ZH.has(sg.text)) err.push('zh sign ' + sg.text)
  }
  const shut = { A: 0, B: 0, C: 0 }
  for (const bd of MAIN_BUILDINGS) if (bd.shutter) shut[bd.seg]++
  if (shut.A > 1 || shut.B > 1 || shut.C > 1) err.push('too many shutters ' + JSON.stringify(shut))
  return err
}
