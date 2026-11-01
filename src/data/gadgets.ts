/**
 * 扩建 v4 机关 / 收集灰模的位置和规则。
 * 只读地图数据。不改高架护栏、复位、匝道。
 * 计时赛、吊桥、港区满密度已砍，这里没有入口。
 *
 * 3D 用色饱和度 ≤0.5（与匝道导视同一套算法）。界面仍沿用既有冰蓝字色。
 */
import { YARD_PROPS, frameAt, portWorld, type XZ } from './expansionLayout'
import { garageLocal, garageW, spiralFrame, spiralH, SPIRAL } from './mapLayout'

export const ICE = '#7EC8E8'
export const COLD = '#E8F4FF'
export const STEEL = '#243240'
export const DECK = '#3A4C5C'
export const DIM = '#1C2A36'

export function hexSat(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const max = Math.max(r, g, b)
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max
}

export const GRAY_HEX = [ICE, COLD, STEEL, DECK, DIM] as const

/** 作品街中线 8 个光点。世界 z 为北负；草案 y=70–196 → z=-88…-196（让开 r75 环路）。 */
export const LIGHT_ZS = [-88, -104, -120, -136, -152, -168, -184, -196] as const
export const LIGHT_R = 2.5
export const LIGHTS = LIGHT_ZS.map((z) => ({ x: 0, y: 1.35, z }))
export const SHOWCASE = { x: 0, y: 7.4, z: -188, r: 3.5, tube: 0.16 }

/** 东街北侧灯笼摊，x=108–143，放在路面北缘，不和原静态摊位盒子重叠。 */
export const STALL_XS = [108, 115, 122, 129, 136, 143] as const
export const STALLS = STALL_XS.map((x) => ({ x, y: 0.58, z: -5.2 }))
export const STALL_HIT = 1.05

export const GATE = { x: 0, z: 125, halfGap: 3.65, z0: 122.4, z1: 128.0 }
export const DOOR = { x: 7.2, y: 1.4, z: 136.2, w: 2.6, h: 2.6, d: 0.28 }

/** 西街北缘跳台。南半车道留出，不封死彩蛋区主路。 */
export const JUMP = {
  x0: -104,
  x1: -122,
  z: -4.35,
  w: 3.1,
  y0: 0.08,
  y1: 3.2,
  deck: { x0: -122, x1: -156, z0: -6.05, z1: -2.55, y: 3.2 },
}

export const PIPES: { x: number; z: number; len: number; ry: number }[] = [
  { x: 0, z: 144, len: 7.2, ry: Math.PI / 2 },
  { x: 10, z: 160, len: 7.2, ry: Math.PI / 2 },
  { x: 14, z: 172, len: 7.2, ry: Math.PI / 2 },
  { x: 6, z: 186, len: 7.2, ry: Math.PI / 2 },
  { x: 0, z: 202, len: 7.2, ry: Math.PI / 2 },
]

export function lightIndexNear(x: number, y: number, z: number) {
  if (y > 5 || y < -1) return -1
  const r2 = LIGHT_R * LIGHT_R
  for (let i = 0; i < LIGHTS.length; i++) {
    const p = LIGHTS[i]
    const dx = x - p.x
    const dy = y - p.y
    const dz = z - p.z
    if (dx * dx + dy * dy + dz * dz < r2) return i
  }
  return -1
}

export function inGate(x: number, y: number, z: number) {
  return y < 3.2 && y > -1 && Math.abs(x - GATE.x) < GATE.halfGap - 0.35 && z > GATE.z0 && z < GATE.z1
}

export function onE8(x: number, y: number, z: number) {
  const d = JUMP.deck
  const xLo = Math.min(d.x0, d.x1)
  const xHi = Math.max(d.x0, d.x1)
  const zLo = Math.min(d.z0, d.z1)
  const zHi = Math.max(d.z0, d.z1)
  return y > d.y - 0.4 && y < d.y + 2.6 && x > xLo + 0.6 && x < xHi - 0.4 && z > zLo + 0.25 && z < zHi - 0.25
}

export function e8Beacon() {
  const d = JUMP.deck
  return { x: Math.min(d.x0, d.x1) + 2.4, y: d.y + 1.35, z: (d.z0 + d.z1) / 2 }
}

export function s2Marks() {
  const roof = roofPoint()
  const aim = frameAt(128 * (Math.PI / 180))
  const dx = aim.x - roof.x
  const dz = aim.z - roof.z
  const len = Math.hypot(dx, dz) || 1
  const out: { x: number; y: number; z: number }[] = []
  for (let i = 1; i <= 6; i++) {
    const d = 8 + i * 8
    out.push({ x: roof.x + (dx / len) * d, y: roof.y + 0.35, z: roof.z + (dz / len) * d })
  }
  return out
}

export function roofPoint() {
  const s = SPIRAL.L + SPIRAL.ROOF * 0.62
  const f = spiralFrame(s)
  return { x: f.p[0], y: spiralH(SPIRAL.L) + 0.85, z: f.p[1] }
}

export function onS2(x: number, y: number, z: number) {
  const p = roofPoint()
  return y > 9.2 && Math.hypot(x - p.x, z - p.z) < 7.5
}

export function stallSector(x: number, z: number) {
  return x > 55 && x < 215 && z > -40 && z < 40
}

export function garageSector(x: number, z: number) {
  const [u, v] = garageLocal(x, z)
  return Math.abs(u) < 52 && Math.abs(v) < 28
}

export const GARAGE_BOXES = [
  [-14, 1.6],
  [2, -1.4],
  [18, 1.5],
  [-26, -1.2],
] as const

export function garageBoxPos(i: number) {
  const [u, v] = GARAGE_BOXES[i]
  const [x, z] = garageW(u, v)
  return { x, y: 4.62, z }
}

/**
 * S1：外环东侧贴地涵洞，绕开四条匝道，接到港区入口。
 * 不挖高架桥面，所以复位 / 护栏 / 匝道碰撞都保持原样。
 */
export function s1Points(): XZ[] {
  // 贴在高架外缘外侧 r=268 走弧，半径只增不减，弦不会切进桥或匝道。
  const end = portWorld(12, 8)
  const endAng = Math.atan2(-end[1], end[0])
  const startAng = 4 * (Math.PI / 180)
  const R = 268
  const endR = Math.hypot(end[0], end[1])
  const pts: XZ[] = []
  const n = 40
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const ang = startAng + (endAng - startAng) * u
    const rad = R + Math.max(0, endR - R) * u * u
    pts.push([Math.cos(ang) * rad, -Math.sin(ang) * rad])
  }
  return pts
}

export function polyLen(pts: readonly XZ[]) {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return len
}

export type Progress = {
  lights: number
  stalls: number
  gate: 0 | 1
  e8: 0 | 1
  s2: 0 | 1
  port: 0 | 1
}

export const EMPTY_PROGRESS: Progress = { lights: 0, stalls: 0, gate: 0, e8: 0, s2: 0, port: 0 }

export function bitCount(mask: number, n: number) {
  let c = 0
  for (let i = 0; i < n; i++) if ((mask & (1 << i)) !== 0) c++
  return c
}

export function withLight(p: Progress, i: number): Progress {
  const lights = p.lights | (1 << i)
  return lights === p.lights ? p : { ...p, lights }
}

export function withStall(p: Progress, i: number): Progress {
  const stalls = p.stalls | (1 << i)
  return stalls === p.stalls ? p : { ...p, stalls }
}

export function withFlag(p: Progress, key: 'gate' | 'e8' | 's2' | 'port'): Progress {
  if (p[key]) return p
  return { ...p, [key]: 1 }
}

export const LIGHT_N = LIGHTS.length
export const STALL_N = STALLS.length
export const GARAGE_N = GARAGE_BOXES.length
export const PORT_N = YARD_PROPS.length
export const DYNAMIC_TOTAL = PORT_N + STALL_N + GARAGE_N + 1
export const DYNAMIC_CAP = 40

export const FEST_AT: { x: number; y: number; z: number; s: number }[] = []
{
  const ox = 165
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    FEST_AT.push({ x: ox + Math.cos(a) * 4.2, y: 4.4 + (i % 2) * 0.8, z: Math.sin(a) * 3.2, s: 1.15 })
  }
  const gateL = portWorld(1.5, -7)
  const gateR = portWorld(1.5, 7)
  for (let i = 0; i < 5; i++) {
    const t = i / 4
    FEST_AT.push({
      x: gateL[0] + (gateR[0] - gateL[0]) * t,
      y: 4.6,
      z: gateL[1] + (gateR[1] - gateL[1]) * t,
      s: 0.85,
    })
  }
}
export const FEST_PORT_FROM = 8
