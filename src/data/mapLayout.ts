/** 地图 v2（Carroll 已批准）+ 扩展路网。单位 m，北 = -Z，东 = +X */
import { districts, type DistrictId } from '../theme/colors'

export type Ring = { r: number; w: number }

export const PLAZA_R = 28
export const WORLD_HALF = 235
export const SPAWN: [number, number, number] = [0, 1, 20] // 广场南侧，车头朝北

export type Seg = { a: [number, number]; b: [number, number]; w: number; guide?: DistrictId; dim?: boolean; virtual?: boolean }
// dim：新路/小巷/外环压暗一档；virtual：仅用于建筑避让与路口判断，不渲染（天桥/隧道段由结构体自己画）

export const rings: Ring[] = [
  { r: 75, w: 14 },
  { r: 220, w: 12 }, // v3 外环（压暗回头路）
]
export const ringDim = (r: Ring) => r.r > 100

const D = 45 * (Math.PI / 180)
const at = (sx: number, sz: number, r: number): [number, number] => [sx * Math.sin(D) * r, sz * Math.cos(D) * r]
const diag = (sx: number, sz: number, r0 = PLAZA_R, r1 = 222): Seg => ({ a: at(sx, sz, r0), b: at(sx, sz, r1), w: 12 })

/* ---------- 过渡带结构（第一批：A 天桥 / C 隧道） ---------- */
/** A 东北天桥：横跨东北斜向大道（r=150 处），沿 (1,1)/√2 方向，甲板 8m 宽、高 6m */
export const BRIDGE = {
  c: at(1, -1, 150), dir: [Math.SQRT1_2, Math.SQRT1_2] as [number, number],
  H: 6, W: 8, FLAT: 16, RAMP: 55, // 余弦坡：最大坡度 = H·π/(2·RAMP) ≈ 9.7°
}
/** b4 补：平行巷外移，让内圈街坊最短边 ≥30m */
export const LX = 46, LZE = 48, LZW = 44, XW = -157, XE = 152, ZC = -117
export const bridgeEnd = (k: -1 | 1): [number, number] => {
  const L = BRIDGE.FLAT / 2 + BRIDGE.RAMP
  return [BRIDGE.c[0] + BRIDGE.dir[0] * L * k, BRIDGE.c[1] + BRIDGE.dir[1] * L * k]
}
/** C 西南下沉隧道：西南斜向大道 r∈[R0,R1]，下沉 5m，平段 24m，坡长各 46m（≈9.7°） */
export const TUNNEL = { dir: [-Math.SQRT1_2, Math.SQRT1_2] as [number, number], R0: 92, RAMP: 46, FLAT: 24, DEPTH: 5, W: 10 }
export const TUNNEL_R1 = TUNNEL.R0 + TUNNEL.RAMP * 2 + TUNNEL.FLAT
/** 隧道地面高度（r 为沿斜向大道离中心距离） */
export function tunnelDepth(r: number) {
  const { R0, RAMP, FLAT, DEPTH } = TUNNEL
  const u = r - R0
  if (u <= 0 || r >= TUNNEL_R1) return 0
  if (u < RAMP) return -DEPTH * (1 - Math.cos(Math.PI * u / RAMP)) / 2
  if (u < RAMP + FLAT) return -DEPTH
  return -DEPTH * (1 + Math.cos(Math.PI * (u - RAMP - FLAT) / RAMP)) / 2
}
/** 天桥甲板高度（s 为沿桥轴离桥中心距离） */
export function bridgeHeight(s: number) {
  const { H, FLAT, RAMP } = BRIDGE
  const a = Math.abs(s) - FLAT / 2
  if (a <= 0) return H
  if (a >= RAMP) return 0
  return H * (1 + Math.cos(Math.PI * a / RAMP)) / 2
}


/* ---------- 过渡带结构（第二批：B 立体停车场 / D 屋顶螺旋坡道） ---------- */
const Q2 = Math.SQRT1_2
/** B 东南立体停车场：沿东南斜向大道（d），向外侧（n）偏 22m；局部 u∈[-32,32] 沿 d，v∈[-12,12] 沿 n。
 *  三层 0/4/8m；A 道 v∈[-12,-4]：地面→4m（u -27→12）；B 道 v∈[4,12]：4m→8m（u 26→-12）；中间 v∈[-4,4] 为 1 层平台。 */
export const GARAGE = {
  c: [at(1, 1, 150)[0] + Q2 * 22, at(1, 1, 150)[1] - Q2 * 22] as [number, number],
  d: [Q2, Q2] as [number, number], n: [Q2, -Q2] as [number, number],
  HU: 32, HV: 12, LANE: 4, A0: -27, A1: 12, B0: 26, B1: -12, // 余弦坡 39m/38m 升 4m → 最大 ≈9.4°
}
const cosRamp = (x: number, x0: number, x1: number, h0: number, h1: number) => {
  const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)))
  return h0 + (h1 - h0) * (1 - Math.cos(Math.PI * t)) / 2
}
export const garageRampA = (u: number) => cosRamp(u, GARAGE.A0, GARAGE.A1, 0, 4)
export const garageRampB = (u: number) => cosRamp(u, GARAGE.B0, GARAGE.B1, 4, 8)
export const garageW = (u: number, v: number): [number, number] => [GARAGE.c[0] + GARAGE.d[0] * u + GARAGE.n[0] * v, GARAGE.c[1] + GARAGE.d[1] * u + GARAGE.n[1] * v]
export const garageLocal = (x: number, z: number): [number, number] => {
  const dx = x - GARAGE.c[0], dz = z - GARAGE.c[1]
  return [dx * GARAGE.d[0] + dz * GARAGE.d[1], dx * GARAGE.n[0] + dz * GARAGE.n[1]]
}
/** 该点上方所有楼板顶面高度（不含地面） */
function garageDecks(u: number, v: number): number[] {
  const { HU, HV, LANE } = GARAGE
  if (Math.abs(u) > HU + 0.5 || Math.abs(v) > HV + 0.5) return []
  if (v < -LANE) return u >= GARAGE.A0 ? [garageRampA(u), 8] : [8]
  if (v > LANE) return [garageRampB(u)]
  return [4, 8]
}

/** D 西北屋顶螺旋坡道：中心在西北大道 r140 外侧 18m；车道中线半径 12、宽 7，升至 12m，终点接 20m 屋顶跑道。
 *  坡度曲线：两端 10m 线性过渡（坡脚/坡顶切线水平），中段恒定 9°。 */
const SP_K = Math.tan(9 * Math.PI / 180), SP_B = 10, SP_H = 12
export const SPIRAL = {
  c: [at(-1, -1, 140)[0] - Q2 * 18, at(-1, -1, 140)[1] + Q2 * 18] as [number, number],
  R: 12, W: 7, H: SP_H, L: SP_H / SP_K + SP_B, ROOF: 20, ROOF_W: 12, LEAD: 8,
  th0: -Math.PI / 4, sg: -1, // 起点在中心朝大道一侧，顺时针（俯视）上升，切线 = 大道外向
}
export const spiralH = (s: number) => {
  const L = SPIRAL.L
  if (s <= 0) return 0
  if (s < SP_B) return SP_K * s * s / (2 * SP_B)
  if (s < L - SP_B) return SP_K * (s - SP_B / 2)
  if (s < L) return SP_H - SP_K * (L - s) ** 2 / (2 * SP_B)
  return SP_H
}
/** 中线点 + 切线 + 外法线（s<0 / s>L 为直线延长） */
export function spiralFrame(s: number) {
  const { c, R, th0, sg, L } = SPIRAL
  const ss = Math.min(L, Math.max(0, s)), th = th0 + sg * ss / R
  const N: [number, number] = [Math.cos(th), Math.sin(th)], T: [number, number] = [-sg * Math.sin(th), sg * Math.cos(th)]
  const e = s - ss
  return { p: [c[0] + R * N[0] + T[0] * e, c[1] + R * N[1] + T[1] * e] as [number, number], T, N }
}
/** 螺旋段：该点上方各圈车道顶面高度 */
function spiralDecks(x: number, z: number): number[] {
  const { c, R, W, th0, sg, L } = SPIRAL
  const dx = x - c[0], dz = z - c[1], r = Math.hypot(dx, dz)
  if (Math.abs(r - R) > W / 2 + 0.5) return []
  let a = (Math.atan2(dz, dx) - th0) * sg
  a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const out: number[] = []
  for (let s = a * R; s <= L; s += 2 * Math.PI * R) out.push(spiralH(s))
  return out
}
/** 结构顶棚：(x,z) 处高于 y 的最低楼板底面（无则 Infinity）—— 相机防穿顶 */
export function structCeil(x: number, z: number, y: number) {
  const [u, v] = garageLocal(x, z)
  let m = Infinity
  for (const h of [...garageDecks(u, v), ...spiralDecks(x, z)]) if (h - 0.35 > y + 0.6) m = Math.min(m, h - 0.35)
  return m
}
const spEnd = spiralFrame(SPIRAL.L), sp0 = spiralFrame(0)

export const segs: Seg[] = [
  // 四条放射主街（v3：各约 190m，接 r220 外环）
  { a: [0, -PLAZA_R], b: [0, -216], w: 14, guide: 'portfolio' }, // 北 作品展示街
  { a: [PLAZA_R, 0], b: [216, 0], w: 14, guide: 'aiStall' }, // 东 AI 摆摊
  { a: [-PLAZA_R, 0], b: [-216, 0], w: 12, guide: 'hidden' }, // 西 彩蛋区
  { a: [0, PLAZA_R], b: [0, 105], w: 14, guide: 'alley' }, // 南 主路到 r105
  // 南 7m 雨夜窄巷：之字折线（两次 14m 横移）
  { a: [0, 105], b: [0, 138], w: 8, guide: 'alley' },
  { a: [0, 138], b: [14, 150], w: 8, guide: 'alley' },
  { a: [14, 150], b: [14, 176], w: 8, guide: 'alley' },
  { a: [14, 176], b: [0, 188], w: 8, guide: 'alley' },
  { a: [0, 188], b: [0, 216], w: 8, guide: 'alley' },
  // 北：±40m 后巷 + z=-120/-170 横街
  { a: [LX, -61.5], b: [LX, -214], w: 8, dim: true },
  { a: [-LX, -61.5], b: [-LX, -214], w: 8, dim: true },
  { a: [-LX, ZC], b: [LX, ZC], w: 8, dim: true },
  { a: [-LX, -170], b: [LX, -170], w: 8, dim: true },
  // 东：z=±40 平行巷 + x=130/180 横街（夜市格网）
  { a: [59.2, -LZE], b: [214, -LZE], w: 8, dim: true },
  { a: [59.2, LZE], b: [214, LZE], w: 8, dim: true },
  { a: [XE, -LZE], b: [XE, LZE], w: 8, dim: true },
  { a: [180, -LZE], b: [180, LZE], w: 8, dim: true },
  // 西：z=±36 6m 巷 + x=-150 横街
  { a: [-62.2, -LZW], b: [-215, -LZW], w: 8, dim: true },
  { a: [-62.2, LZW], b: [-215, LZW], w: 8, dim: true },
  { a: [XW, -LZW], b: [XW, LZW], w: 8, dim: true },
  // 四条斜向大道 10m（西南段在隧道处断开，由隧道结构接上）
  diag(1, -1), diag(-1, -1), diag(1, 1),
  diag(-1, 1, PLAZA_R, TUNNEL.R0), diag(-1, 1, TUNNEL_R1, 222),
  { ...diag(-1, 1, TUNNEL.R0, TUNNEL_R1), virtual: true },
  // A 天桥：虚拟避让带 + 两端接到后巷的引道
  { a: bridgeEnd(-1), b: bridgeEnd(1), w: 12, virtual: true },
  { a: bridgeEnd(1), b: [bridgeEnd(1)[0], -LZE], w: 8, dim: true },
  { a: bridgeEnd(-1), b: [LX, bridgeEnd(-1)[1]], w: 8, dim: true },
  // B 停车场：建筑避让 + 斜向大道→A 道入口的引道
  { a: garageW(-GARAGE.HU - 2, 0), b: garageW(GARAGE.HU + 2, 0), w: GARAGE.HV * 2 + 6, virtual: true },
  { a: garageW(-50, -12), b: garageW(-GARAGE.HU, -8), w: 14, virtual: true },
  { a: garageW(-48, -22), b: garageW(-GARAGE.HU - 1, -8), w: 8, dim: true },
  // D 螺旋坡道：建筑避让（圆盘 + 屋顶跑道）+ 引道
  { a: SPIRAL.c, b: SPIRAL.c, w: (SPIRAL.R + SPIRAL.W / 2) * 2 + 6, virtual: true },
  { a: spEnd.p, b: [spEnd.p[0] + spEnd.T[0] * (SPIRAL.ROOF + 2), spEnd.p[1] + spEnd.T[1] * (SPIRAL.ROOF + 2)], w: SPIRAL.ROOF_W + 4, virtual: true },
  { a: [sp0.p[0] - sp0.T[0] * 30 + sp0.N[0] * 6, sp0.p[1] - sp0.T[1] * 30 + sp0.N[1] * 6], b: [sp0.p[0] - sp0.T[0] * SPIRAL.LEAD, sp0.p[1] - sp0.T[1] * SPIRAL.LEAD], w: 8, dim: true },
]

/** 彩蛋占位（第一批：天桥 E1/E2、隧道 E5/E6、窄巷 E9） */
export const eggs: Array<{ id: string; p: [number, number, number]; color: string; label: string }> = [
  { id: 'E1', p: [BRIDGE.c[0], BRIDGE.H + 1.6, BRIDGE.c[1]], color: '#00B0FF', label: 'E1 全息简历' },
  { id: 'E2', p: [BRIDGE.c[0] + 4, 0.4, BRIDGE.c[1] + 4], color: '#00B0FF', label: 'E2 积水二维码' },
  { id: 'E5', p: [-(TUNNEL.R0 + TUNNEL.RAMP + 8) * Math.SQRT1_2 - 4.4, -TUNNEL.DEPTH + 1.5, (TUNNEL.R0 + TUNNEL.RAMP + 8) * Math.SQRT1_2 - 4.4], color: '#4FC3F7', label: 'E5 暗门' },
  { id: 'E6', p: [-(TUNNEL.R0 + TUNNEL.RAMP + 16) * Math.SQRT1_2, -TUNNEL.DEPTH + 3, (TUNNEL.R0 + TUNNEL.RAMP + 16) * Math.SQRT1_2], color: '#4FC3F7', label: 'E6 鸣笛回声' },
  { id: 'E9', p: [9, 0.6, 150], color: '#4FC3F7', label: 'E9 冰蓝猫' },
]

/** 路口路牌：位置、朝向（看向来车）、文字、颜色 */
export const signs: Array<{ p: [number, number]; rot: number; text: string; color: string }> = [
  { p: [9, -36], rot: 0, text: 'PORTFOLIO ↑', color: districts.portfolio.accent },
  { p: [36, 9], rot: -Math.PI / 2, text: 'AI STALLS →', color: districts.aiStall.accent },
  { p: [-36, -9], rot: Math.PI / 2, text: '← EASTER EGG', color: districts.hidden.accent },
  { p: [-9, 36], rot: Math.PI, text: 'RAIN ALLEY ↓', color: districts.alley.accent },
  { p: [9, -88], rot: 0, text: 'PORTFOLIO', color: districts.portfolio.accent },
  { p: [88, 9], rot: -Math.PI / 2, text: 'AI STALLS', color: districts.aiStall.accent },
  { p: [-88, -9], rot: Math.PI / 2, text: 'EASTER EGG', color: districts.hidden.accent },
  { p: [-9, 88], rot: Math.PI, text: 'RAIN ALLEY', color: districts.alley.accent },
]

export function distSeg(x: number, z: number, s: Seg) {
  const [ax, az] = s.a, [bx, bz] = s.b
  const dx = bx - ax, dz = bz - az
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz))
}

/** 点到最近路面边缘的距离（负 = 在路上） */
export function roadClearance(x: number, z: number) {
  let m = Math.hypot(x, z) - PLAZA_R
  for (const r of rings) m = Math.min(m, Math.abs(Math.hypot(x, z) - r.r) - r.w / 2)
  for (const s of segs) m = Math.min(m, distSeg(x, z, s) - s.w / 2)
  return m
}

/** 街区判定：广场 = 窄巷默认；按主导方向分四区 */
export function districtAt(x: number, z: number): DistrictId {
  if (Math.hypot(x, z) < PLAZA_R) return 'alley'
  if (Math.abs(x) > Math.abs(z)) return x > 0 ? 'aiStall' : 'hidden'
  return z < 0 ? 'portfolio' : 'alley'
}
