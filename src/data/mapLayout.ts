/** 地图 v2（Carroll 已批准）+ 扩展路网。单位 m，北 = -Z，东 = +X */
import { districts, type DistrictId } from '../theme/colors'

export type Seg = { a: [number, number]; b: [number, number]; w: number; guide?: DistrictId }
export type Ring = { r: number; w: number }

export const PLAZA_R = 28
export const WORLD_HALF = 175
export const SPAWN: [number, number, number] = [0, 1, 20] // 广场南侧，车头朝北

export const rings: Ring[] = [
  { r: 75, w: 14 },
  { r: 130, w: 10 }, // 外环：串起各街尽头
]

const D = 45 * (Math.PI / 180)
const diag = (sx: number, sz: number): Seg => ({
  a: [sx * Math.sin(D) * PLAZA_R, sz * Math.cos(D) * PLAZA_R],
  b: [sx * Math.sin(D) * 134, sz * Math.cos(D) * 134],
  w: 10,
})

export const segs: Seg[] = [
  // 四条放射主街
  { a: [0, -PLAZA_R], b: [0, -152], w: 14, guide: 'portfolio' }, // 北 作品展示街
  { a: [PLAZA_R, 0], b: [150, 0], w: 14, guide: 'aiStall' }, // 东 AI 摆摊
  { a: [-PLAZA_R, 0], b: [-150, 0], w: 12, guide: 'hidden' }, // 西 彩蛋区
  { a: [0, PLAZA_R], b: [0, 86], w: 14, guide: 'alley' }, // 南 主路到环外
  { a: [0, 86], b: [0, 146], w: 7, guide: 'alley' }, // 南 7m 雨夜窄巷
  // 岔路 / 小环
  { a: [7, -104], b: [75, -104], w: 8 }, // 作品后巷
  { a: [75, -104], b: [75, -36], w: 8 },
  { a: [-102, 0], b: [-102, -66], w: 8 }, // 彩蛋岔路 → 隐藏关卡入口
  { a: [-102, -66], b: [-52, -66], w: 8 },
  { a: [102, 0], b: [102, 46], w: 8 }, // AI 区小环
  { a: [102, 46], b: [58, 46], w: 8 },
  { a: [-55, 52], b: [-55, 112], w: 8 }, // 窄巷出口接回环路
  { a: [-55, 112], b: [-3.5, 112], w: 8 },
  // 扩展：四条斜向大道（广场 → 外环）
  diag(1, -1), diag(-1, -1), diag(1, 1), diag(-1, 1),
  // 扩展：街区间小巷（环路之间的横街）
  { a: [30, -112], b: [30, -150], w: 6 },
  { a: [-35, -100], b: [-35, -150], w: 6 },
  { a: [112, -40], b: [150, -40], w: 6 },
  { a: [112, 40], b: [150, 40], w: 6 },
  { a: [-112, 40], b: [-150, 40], w: 6 },
  { a: [-112, -40], b: [-150, -40], w: 6 },
  { a: [40, 112], b: [40, 150], w: 6 },
  { a: [-40, 100], b: [-40, 150], w: 6 },
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
