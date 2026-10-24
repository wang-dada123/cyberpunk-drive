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
const diag = (sx: number, sz: number, r0 = PLAZA_R, r1 = 222): Seg => ({ a: at(sx, sz, r0), b: at(sx, sz, r1), w: 10 })

/* ---------- 过渡带结构（第一批：A 天桥 / C 隧道） ---------- */
/** A 东北天桥：横跨东北斜向大道（r=150 处），沿 (1,1)/√2 方向，甲板 8m 宽、高 6m */
export const BRIDGE = {
  c: at(1, -1, 150), dir: [Math.SQRT1_2, Math.SQRT1_2] as [number, number],
  H: 6, W: 8, FLAT: 16, RAMP: 55, // 余弦坡：最大坡度 = H·π/(2·RAMP) ≈ 9.7°
}
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

export const segs: Seg[] = [
  // 四条放射主街（v3：各约 190m，接 r220 外环）
  { a: [0, -PLAZA_R], b: [0, -216], w: 14, guide: 'portfolio' }, // 北 作品展示街
  { a: [PLAZA_R, 0], b: [216, 0], w: 14, guide: 'aiStall' }, // 东 AI 摆摊
  { a: [-PLAZA_R, 0], b: [-216, 0], w: 12, guide: 'hidden' }, // 西 彩蛋区
  { a: [0, PLAZA_R], b: [0, 105], w: 14, guide: 'alley' }, // 南 主路到 r105
  // 南 7m 雨夜窄巷：之字折线（两次 14m 横移）
  { a: [0, 105], b: [0, 138], w: 7, guide: 'alley' },
  { a: [0, 138], b: [14, 150], w: 7, guide: 'alley' },
  { a: [14, 150], b: [14, 176], w: 7, guide: 'alley' },
  { a: [14, 176], b: [0, 188], w: 7, guide: 'alley' },
  { a: [0, 188], b: [0, 216], w: 7, guide: 'alley' },
  // 北：±40m 后巷 + z=-120/-170 横街
  { a: [40, -64], b: [40, -214], w: 7, dim: true },
  { a: [-40, -64], b: [-40, -214], w: 7, dim: true },
  { a: [-40, -120], b: [40, -120], w: 7, dim: true },
  { a: [-40, -170], b: [40, -170], w: 7, dim: true },
  // 东：z=±40 平行巷 + x=130/180 横街（夜市格网）
  { a: [64, -40], b: [214, -40], w: 7, dim: true },
  { a: [64, 40], b: [214, 40], w: 7, dim: true },
  { a: [130, -40], b: [130, 40], w: 7, dim: true },
  { a: [180, -40], b: [180, 40], w: 7, dim: true },
  // 西：z=±36 6m 巷 + x=-150 横街
  { a: [-66, -36], b: [-215, -36], w: 6, dim: true },
  { a: [-66, 36], b: [-215, 36], w: 6, dim: true },
  { a: [-150, -36], b: [-150, 36], w: 6, dim: true },
  // 四条斜向大道 10m（西南段在隧道处断开，由隧道结构接上）
  diag(1, -1), diag(-1, -1), diag(1, 1),
  diag(-1, 1, PLAZA_R, TUNNEL.R0), diag(-1, 1, TUNNEL_R1, 222),
  { ...diag(-1, 1, TUNNEL.R0, TUNNEL_R1), virtual: true },
  // A 天桥：虚拟避让带 + 两端接到后巷的引道
  { a: bridgeEnd(-1), b: bridgeEnd(1), w: 12, virtual: true },
  { a: bridgeEnd(1), b: [bridgeEnd(1)[0], -40], w: 8, dim: true },
  { a: bridgeEnd(-1), b: [40, bridgeEnd(-1)[1]], w: 8, dim: true },
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
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
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
