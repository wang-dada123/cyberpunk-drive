/**
 * 扩建 v4 首发几何（Carroll 已批准，性能选项 A）。
 * 本文件只提供路形 / 分块 / 查询，不碰湿路材质、Bloom、立面。
 *
 * 环城高架 r=255、宽 10。西南 150°–300° 路面 +8m；其余高架巡航 +6m
 * （东南支路要从桥下进港，第三人称相机约 4m，+4m 净空不够）。
 * 4 匝道接外环：20° / 160° / 250° / 340°。北段 60°–120° 五个 S 弯，
 * 35° 与 150° 外漂弯（路形，半径约 35）。飞台 J1 在 200°，J2 仅占位。
 * 工业港区东南 150×170，入口外环 -40°、10m 支路。集装箱约 30%（相对 8m 满铺）。
 * 不做计时赛、不做吊桥缺口。
 *
 * 角度：0° = 东(+X)，90° = 北(-Z)。x = r·cosθ，z = -r·sinθ。
 */
export type XZ = [number, number]

const DEG = Math.PI / 180

export const ELEV_R = 255
export const ELEV_W = 10
/** 高架巡航高度。西南段才是规格里的 +8m。 */
export const H_LO = 6
export const H_HI = 8
export const SECTORS = 8
export const RING_PER = 96
export const PLAY_HALF = 470
export const MAP_R = 410

export const J1_DEG = 200
export const J2_DEG = 275
export const GAP_M = 15
export const KICK_M = 10
export const KICK_H = 1.15

export const PORT_ANG = -40 * DEG
export const PORT_INNER = 272
export const PORT_LEN = 170
export const PORT_WID = 150
export const PORT_Y = 0.12

const UP0 = 130 * DEG
const UP1 = 150 * DEG
const DN0 = 300 * DEG
const DN1 = 320 * DEG
const J1 = J1_DEG * DEG
const GAP_A = GAP_M / ELEV_R
const KICK_A = KICK_M / ELEV_R

export function wrapAng(a: number) {
  const t = a % (Math.PI * 2)
  return t < 0 ? t + Math.PI * 2 : t
}

/** 有符号最短角差 a-b，范围 (-π, π] */
export function angDist(a: number, b: number) {
  let d = wrapAng(a) - wrapAng(b)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function angOf(x: number, z: number) {
  return wrapAng(Math.atan2(-z, x))
}

function bump(theta: number, center: number, half: number) {
  const d = angDist(theta, center)
  if (Math.abs(d) >= half) return 0
  const u = (d / half + 1) / 2
  return (1 - Math.cos(Math.PI * 2 * u)) / 2
}

/** 中线半径：北段 S 弯 + 两处外漂 */
export function elevRadius(theta: number) {
  const t = wrapAng(theta)
  let r = ELEV_R
  const a0 = 60 * DEG
  const a1 = 120 * DEG
  if (t >= a0 && t <= a1) {
    const u = (t - a0) / (a1 - a0)
    r += 7.5 * Math.sin(5 * Math.PI * u) * Math.sin(Math.PI * u)
  }
  r += 16 * bump(t, 35 * DEG, 13 * DEG)
  r += 16 * bump(t, 150 * DEG, 13 * DEG)
  return r
}

export function elevHeight(theta: number) {
  const t = wrapAng(theta)
  const ease = (u: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2
  if (t >= UP1 && t <= DN0) return H_HI
  if (t >= UP0 && t < UP1) return H_LO + (H_HI - H_LO) * ease((t - UP0) / (UP1 - UP0))
  if (t > DN0 && t <= DN1) return H_HI + (H_LO - H_HI) * ease((t - DN0) / (DN1 - DN0))
  return H_LO
}

export function inGap(theta: number) {
  return Math.abs(angDist(theta, J1)) < GAP_A / 2
}

/** 缺口前 10m 起跳坡，沿角度增加方向 */
export function inKicker(theta: number) {
  const d = angDist(theta, J1)
  return d >= -GAP_A / 2 - KICK_A && d < -GAP_A / 2
}

export function kickExtra(theta: number) {
  if (!inKicker(theta)) return 0
  const d = angDist(theta, J1)
  const u = (d - (-GAP_A / 2 - KICK_A)) / KICK_A
  return KICK_H * (1 - Math.cos(Math.PI * u)) / 2
}

export function inBoostLip(theta: number) {
  const d = angDist(theta, J1)
  return d >= -GAP_A / 2 - 4 / ELEV_R && d < -GAP_A / 2
}

export function inJumpAir(x: number, z: number) {
  const th = angOf(x, z)
  const d = angDist(th, J1)
  if (d < -GAP_A / 2 - 0.01 || d > GAP_A / 2 + 10 / ELEV_R) return false
  const f = frameAt(th)
  const lat = Math.abs((x - f.x) * f.px + (z - f.z) * f.pz)
  return lat < ELEV_W / 2 + 1.6
}

export type RoadFrame = {
  x: number
  y: number
  z: number
  base: number
  tx: number
  tz: number
  px: number
  pz: number
  theta: number
  gap: boolean
  kick: boolean
}

export function frameAt(theta: number): RoadFrame {
  const t = wrapAng(theta)
  const r = elevRadius(t)
  const eps = 0.002
  const dr = (elevRadius(t + eps) - elevRadius(t - eps)) / (2 * eps)
  const x = r * Math.cos(t)
  const z = -r * Math.sin(t)
  let tx = dr * Math.cos(t) - r * Math.sin(t)
  let tz = -dr * Math.sin(t) - r * Math.cos(t)
  const tl = Math.hypot(tx, tz) || 1
  tx /= tl
  tz /= tl
  // 面向行驶方向时的左侧（纯圆上即朝内）
  const px = tz
  const pz = -tx
  const base = elevHeight(t)
  return { x, y: base + kickExtra(t), z, base, tx, tz, px, pz, theta: t, gap: inGap(t), kick: inKicker(t) }
}

export function yawOf(tx: number, tz: number) {
  return Math.atan2(-tx, -tz)
}

const RING_N = RING_PER * SECTORS
export const RING_FRAMES: RoadFrame[] = Array.from({ length: RING_N + 1 }, (_, i) => frameAt((i / RING_N) * Math.PI * 2))

export function sectorOf(theta: number) {
  return Math.min(SECTORS - 1, Math.floor(wrapAng(theta) / (Math.PI * 2) * SECTORS))
}

function framesFromPolyline(raw: { x: number; y: number; z: number }[]): RoadFrame[] {
  return raw.map((p, i) => {
    const a = raw[Math.max(0, i - 1)]
    const b = raw[Math.min(raw.length - 1, i + 1)]
    let tx = b.x - a.x
    let tz = b.z - a.z
    const l = Math.hypot(tx, tz) || 1
    tx /= l
    tz /= l
    return {
      x: p.x, y: p.y, z: p.z, base: p.y, tx, tz, px: tz, pz: -tx,
      theta: angOf(p.x, p.z), gap: false, kick: false,
    }
  })
}

export const RAMP_DEGS = [20, 160, 250, 340] as const

function buildRamp(deg: number) {
  const A = deg * DEG
  const end = frameAt(A)
  const endH = end.base
  const swept = endH > H_LO + 0.4
  const dAng = swept ? -16 * DEG : 0
  const startR = 208
  const steps = 28
  const raw: { x: number; y: number; z: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const ang = A + dAng * (1 - t)
    const rad = startR + (elevRadius(A) - startR) * t
    const y = 0.04 + (endH - 0.04) * (1 - Math.cos(Math.PI * t)) / 2
    raw.push({ x: rad * Math.cos(ang), y, z: -rad * Math.sin(ang) })
  }
  // 内边缘之前就停，避免末端被收到内侧时折返，护栏盒子横在车道上。
  const hw = ELEV_W / 2
  const inner = elevRadius(A) - hw
  let cut = raw.length
  for (let i = 1; i < raw.length; i++) {
    if (Math.hypot(raw[i].x, raw[i].z) >= inner) { cut = i; break }
  }
  raw.length = Math.max(2, cut)
  const tail = raw[raw.length - 1]
  const prev = raw[raw.length - 2]
  let dx = tail.x - prev.x
  let dz = tail.z - prev.z
  const dl = Math.hypot(dx, dz) || 1
  dx /= dl
  dz /= dl
  // 顺着匝道爬上桥面，盖过内边缘立面。最后 2m 只给视觉，碰撞体丢掉，避免和甲板叠成坎。
  raw.push({ x: tail.x + dx * 3.5, y: end.base, z: tail.z + dz * 3.5 })
  raw.push({ x: tail.x + dx * 5.5, y: end.base, z: tail.z + dz * 5.5 })
  return framesFromPolyline(raw)
}

export const RAMPS: { deg: number; sector: number; frames: RoadFrame[] }[] = RAMP_DEGS.map((deg) => ({
  deg,
  sector: sectorOf(deg * DEG),
  frames: buildRamp(deg),
}))

const ox = Math.cos(PORT_ANG)
const oz = -Math.sin(PORT_ANG)
const tx = -oz
const tz = ox
export const PORT_BASIS = { ox, oz, tx, tz }
export const PORT_RY = Math.atan2(ox, oz)

/** u 沿东南向外，v 切向（+v ≈ 西南，港区西半） */
export function portWorld(u: number, v: number): XZ {
  const r = PORT_INNER + u
  return [ox * r + tx * v, oz * r + tz * v]
}

export function portLocal(x: number, z: number) {
  const r = ox * x + oz * z
  const v = tx * x + tz * z
  return { u: r - PORT_INNER, v }
}

export const SPUR = {
  a: [220 * ox, 220 * oz] as XZ,
  b: portWorld(-2, 0),
  w: 10,
}

/** 建筑避让：高架按真实中线折线，港区矩形，匝道一条。全是 virtual，不画进主路网。 */
export function expansionVirtualSegs(): { a: XZ; b: XZ; w: number; virtual: true }[] {
  const out: { a: XZ; b: XZ; w: number; virtual: true }[] = []
  const n = 24
  for (let i = 0; i < n; i++) {
    const f0 = frameAt((i / n) * Math.PI * 2)
    const f1 = frameAt(((i + 1) / n) * Math.PI * 2)
    out.push({ a: [f0.x, f0.z], b: [f1.x, f1.z], w: 28, virtual: true })
  }
  for (const ramp of RAMPS) {
    const a = ramp.frames[0]
    const b = ramp.frames[ramp.frames.length - 1]
    out.push({ a: [a.x, a.z], b: [b.x, b.z], w: 16, virtual: true })
  }
  const w = PORT_WID + 10
  const hw = w / 2
  const inset = hw - 2
  out.push({ a: portWorld(inset, 0), b: portWorld(PORT_LEN - inset, 0), w, virtual: true })
  return out
}

export type SurfKind = 'elev' | 'ramp' | 'port' | 'spur'
export type Surf = {
  kind: SurfKind
  y: number
  lat: number
  half: number
  x: number
  z: number
  yaw: number
}

function elevHit(x: number, z: number): Surf | null {
  const th = angOf(x, z)
  let best: Surf | null = null
  for (const d of [0, -0.025, 0.025, -0.05, 0.05]) {
    const f = frameAt(th + d)
    if (f.gap) continue
    const dx = x - f.x
    const dz = z - f.z
    const lat = Math.abs(dx * f.px + dz * f.pz)
    const along = Math.abs(dx * f.tx + dz * f.tz)
    if (along > 5) continue
    if (!best || lat < best.lat) best = { kind: 'elev', y: f.y, lat, half: ELEV_W / 2, x: f.x, z: f.z, yaw: yawOf(f.tx, f.tz) }
  }
  if (best && best.lat < ELEV_W / 2 + 22) return best
  return null
}

function rampHit(x: number, z: number): Surf | null {
  let best: Surf | null = null
  for (const ramp of RAMPS) {
    const fs = ramp.frames
    for (let i = 0; i < fs.length - 1; i++) {
      const f = fs[i]
      const dx = x - f.x
      const dz = z - f.z
      const lat = Math.abs(dx * f.px + dz * f.pz)
      const along = Math.abs(dx * f.tx + dz * f.tz)
      if (along > 3.2) continue
      if (!best || lat < best.lat) best = { kind: 'ramp', y: f.y, lat, half: ELEV_W / 2, x: f.x, z: f.z, yaw: yawOf(f.tx, f.tz) }
    }
  }
  if (best && best.lat < ELEV_W / 2 + 8) return best
  return null
}

function portHit(x: number, z: number): Surf | null {
  const { u, v } = portLocal(x, z)
  const du = u < 0 ? -u : u > PORT_LEN ? u - PORT_LEN : 0
  const dv = v < -PORT_WID / 2 ? -PORT_WID / 2 - v : v > PORT_WID / 2 ? v - PORT_WID / 2 : 0
  const lat = Math.hypot(du, dv)
  if (lat > 24) return null
  return { kind: 'port', y: PORT_Y, lat, half: 0.4, x, z, yaw: yawOf(ox, oz) }
}

function spurHit(x: number, z: number): Surf | null {
  const [ax, az] = SPUR.a
  const [bx, bz] = SPUR.b
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz || 1
  let t = ((x - ax) * dx + (z - az) * dz) / l2
  t = Math.max(0, Math.min(1, t))
  const px = ax + dx * t
  const pz = az + dz * t
  const lat = Math.hypot(x - px, z - pz)
  if (lat > SPUR.w / 2 + 8) return null
  const tl = Math.hypot(dx, dz) || 1
  return { kind: 'spur', y: 0.03, lat, half: SPUR.w / 2, x: px, z: pz, yaw: yawOf(dx / tl, dz / tl) }
}

export function sampleSurface(x: number, z: number, carY: number): Surf | null {
  const hits = [elevHit(x, z), rampHit(x, z), portHit(x, z), spurHit(x, z)].filter((h): h is Surf => !!h)
  if (!hits.length) return null
  hits.sort((a, b) => Math.abs(carY - (a.y + 1)) + a.lat * 0.12 - (Math.abs(carY - (b.y + 1)) + b.lat * 0.12))
  return hits[0]
}

export function onSurface(s: Surf, carY: number) {
  if (Math.abs(carY - (s.y + 1)) > 1.65 || carY < s.y - 0.15) return false
  if (s.kind === 'port') return s.lat < 0.45
  return s.lat < s.half + 0.35
}

/** 箱型：长 / 短 / 叠箱 / 方箱。本地 [切向宽, 高, 向外长]，旋转 PORT_RY 后长轴沿 u。约 8m 满铺 ~77 个的 30%。 */
export const CRATE_SIZE: readonly [number, number, number][] = [
  [2.6, 2.6, 12],
  [2.6, 2.6, 6.2],
  [2.6, 5.2, 6.2],
  [2.8, 2.8, 2.8],
]

export type CrateKind = 0 | 1 | 2 | 3
export type Crate = { u: number; v: number; ry: number; k: CrateKind }

function buildCrates(): Crate[] {
  const out: Crate[] = []
  // 西半疏网格。长轴沿 u，行距留 ≥9m 车道。错列，避免看起来像停车场。
  let n = 0
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const u = 30 + i * 15
      const v = 18 + j * 13 + (i % 2) * 2
      if (v > 74) continue
      out.push({ u, v, ry: 0, k: (n % 4) as CrateKind })
      n++
    }
  }
  return out
}

export const CRATES: Crate[] = buildCrates()

export type PropKind = 'box' | 'barrel'
export type YardProp = { u: number; v: number; yaw: number; kind: PropKind }

function buildProps(): YardProp[] {
  const out: YardProp[] = []
  let n = 0
  for (const u of [8, 14, 20, 26]) {
    for (const v of [-18, -11, 11, 18]) {
      out.push({ u, v, yaw: ((n * 17) % 50) * DEG, kind: 'box' })
      n++
    }
  }
  for (const u of [11, 17, 23]) {
    for (const v of [-15, 15, -21, 21]) {
      out.push({ u, v: v + (n % 2 ? 0.6 : -0.4), yaw: ((n * 29) % 80) * DEG, kind: 'barrel' })
      n++
    }
  }
  return out
}

/** 入口内侧可撞池：纸箱 16 + 油桶 12，中线留空。上限 40。 */
export const YARD_PROPS: YardProp[] = buildProps()

export function dockLocal(): { u: number; v: number }[] {
  const cU = 102
  const cV = -36
  const R = 35
  const pts: { u: number; v: number }[] = []
  for (let i = 0; i <= 32; i++) {
    const a = (-160 + (160 * i) / 32) * DEG
    const u = cU + Math.cos(a) * R
    const v = cV + Math.sin(a) * R
    if (u < 8 || u > PORT_LEN - 6 || v < -PORT_WID / 2 + 6 || v > -6) continue
    pts.push({ u, v })
  }
  return pts
}

export function nearSpur(x: number, z: number, pad = 8) {
  const [ax, az] = SPUR.a
  const [bx, bz] = SPUR.b
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz || 1
  let t = ((x - ax) * dx + (z - az) * dz) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < pad
}
