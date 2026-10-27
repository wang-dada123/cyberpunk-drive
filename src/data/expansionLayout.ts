/**
 * 扩建 v4 首发几何（Carroll 已批准，性能选项 A）。
 * 本文件只提供路形 / 分块 / 查询，不碰湿路材质、Bloom、立面。
 *
 * 环城高架 r=255、宽 10。西南 150°–300° 路面 +8m；其余高架巡航 +6m
 * （东南支路要从桥下进港，第三人称相机约 4m，+4m 净空不够）。
 * 4 匝道接外环：20° / 160° / 250° / 340°。坡口贴在外环路面上（y≈0），
 * 过了外环外缘才爬升，两侧都能拐上去。北段 60°–120° 五个 S 弯，
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

/** 坡口贴地高度。外环路面碰撞顶面是 y=0，这里只抬 2cm，边缘再埋进地里。 */
export const RAMP_FLAT_Y = 0.02
const RAMP_R0 = 206
const RAMP_FLAT_R = 230
const RAMP_SWEEP = 9 * DEG

export type Ramp = {
  deg: number
  sector: number
  frames: RoadFrame[]
  halfW: number[]
  /** 贴地段最后一帧。此前没有护栏，外环两个方向都能拐进来。 */
  mouth: number
  /** 爬到桥面高度的第一帧，还在桥面内边缘外侧。 */
  lip: number
  /** 汇入高架中线的那一帧。 */
  join: number
  /**
   * 贴着桥面中线、高度与桥面一致的最后一帧。
   * 这之前桥面碰撞盒让开，只留这一条坡面；之后坡面埋进桥面盒子下面。
   */
  deckOwn: number
  landAng: number
}

/** 往远离最近对角街坊的方向甩，避免爬升段扫进环外地块。 */
function sweepSign(deg: number) {
  let best = 1e9
  let sign = 1
  for (const c of [45, 135, 225, 315]) {
    const d = ((deg - c + 540) % 360) - 180
    if (Math.abs(d) < best) { best = Math.abs(d); sign = d >= 0 ? 1 : -1 }
  }
  return sign
}

function buildRamp(deg: number): Omit<Ramp, 'deg' | 'sector'> {
  const A = deg * DEG
  const sweep = RAMP_SWEEP * sweepSign(deg)
  const landAng = wrapAng(A + sweep)
  const land = frameAt(landAng)
  const landR = Math.hypot(land.x, land.z)
  // 在桥面内边缘之前 2.5m 就抬到桥面高度，后面一段是平的，不会顶到甲板立面。
  const crestR = landR - ELEV_W / 2 - 2.5
  const raw: { x: number; y: number; z: number; w: number }[] = []
  const push = (x: number, y: number, z: number, w: number) => raw.push({ x, y, z, w })
  const nFlat = 16
  for (let i = 0; i <= nFlat; i++) {
    const u = i / nFlat
    const r = RAMP_R0 + (RAMP_FLAT_R - RAMP_R0) * u
    const y = r < 213 ? -0.16 + (RAMP_FLAT_Y + 0.16) * ((r - RAMP_R0) / (213 - RAMP_R0)) : RAMP_FLAT_Y
    push(r * Math.cos(A), y, -r * Math.sin(A), 30 - 10 * u)
  }
  const mouth = raw.length - 1
  const nClimb = 36
  for (let i = 1; i <= nClimb; i++) {
    const u = i / nClimb
    const ease = (1 - Math.cos(Math.PI * u)) / 2
    const ang = A + sweep * ease
    const rad = RAMP_FLAT_R + (crestR - RAMP_FLAT_R) * u
    const y = RAMP_FLAT_Y + (land.y - RAMP_FLAT_Y) * ease
    push(rad * Math.cos(ang), y, -rad * Math.sin(ang), 20 - 10 * ease)
  }
  const lip = raw.length - 1
  // 汇入方向避开飞台和缺口。唇部车头朝外：角度用 u²（起点角速度 0），内侧偏移用 (1-u)²（终点径向速度 0）。
  const prefer = Math.sign(sweep) || 1
  const roomOf = (s: number) => {
    let room = 0
    for (let d = 4; d <= 210; d += 4) {
      const f = frameAt(wrapAng(landAng + s * (d / Math.max(40, landR))))
      if (f.gap || f.kick) return room
      room = d
    }
    return room
  }
  const roomP = roomOf(prefer)
  const roomN = roomOf(-prefer)
  const bury = 6
  const layout = (room: number) => {
    const mergeLen = Math.min(0.34 * landR, Math.max(0.18 * landR, room * 0.42))
    const own = Math.min(48, room - mergeLen - bury - 4)
    const used = mergeLen + own + bury
    return { merge: mergeLen / Math.max(40, landR), own, ok: own >= 26 && used <= room - 1 }
  }
  const fitP = layout(roomP)
  const fitN = layout(roomN)
  // 爬升方向只要还放得下汇入，就顺着走。折回坡面会和爬升段叠在一起，车顶到自己的汇入面。
  const sign = fitP.ok ? prefer : -prefer
  const chosen = fitP.ok ? fitP : fitN.ok ? fitN : layout(Math.max(roomP, roomN))
  const merge = chosen.merge
  const own = chosen.own
  const nMerge = 32
  for (let i = 1; i <= nMerge; i++) {
    const u = i / nMerge
    const ang = wrapAng(landAng + sign * merge * u * u)
    const f = frameAt(ang)
    const inset = (landR - crestR) * (1 - u) * (1 - u)
    // 唇部宽度 10，弯中稍加宽，汇入桥面时回到 10。两端和相邻段对齐，没有宽度台阶。
    const w = 10 + 4 * Math.sin(Math.PI * u)
    push(f.x + f.px * inset, f.y, f.z + f.pz * inset, w)
  }
  const join = raw.length - 1
  // 顺着汇入方向再铺桥面。末尾 bury 米埋到桥面盒子下面，这一段之前不放桥面盒子。
  const nRun = 32
  let deckOwn = join
  for (let i = 1; i <= nRun; i++) {
    const s = ((own + bury) * i) / nRun
    const ang = wrapAng(landAng + sign * merge + sign * (s / Math.max(40, landR)))
    const f = frameAt(ang)
    let y = f.y
    if (s > own) {
      const uu = (s - own) / bury
      const e = uu * uu * (3 - 2 * uu)
      y = f.y - 0.45 * e
    } else y = f.y
    push(f.x, y, f.z, ELEV_W)
    if (s <= own + 1e-4) deckOwn = raw.length - 1
  }
  const frames = framesFromPolyline(raw.map((p) => ({ x: p.x, y: p.y, z: p.z })))
  return { frames, halfW: raw.map((p) => p.w / 2), mouth, lip, join, deckOwn, landAng }
}

export const RAMPS: Ramp[] = RAMP_DEGS.map((deg) => ({
  deg,
  sector: sectorOf(deg * DEG),
  ...buildRamp(deg),
}))

/** 高架内侧护栏在汇入点附近让开，否则坡顶正对着一堵墙。 */
export function nearRampJoin(x: number, z: number, pad = 12) {
  for (const ramp of RAMPS) {
    for (const k of [ramp.lip, ramp.join]) {
      const f = ramp.frames[k]
      if (Math.hypot(x - f.x, z - f.z) < pad) return true
    }
  }
  return false
}

/** 坡面网格自己当路的那一段（唇部到贴桥全高段）。这里不要再放桥面盒子或护栏。 */
export function underRampMesh(x: number, z: number) {
  for (const ramp of RAMPS) {
    const fs = ramp.frames
    const end = ramp.deckOwn
    const begin = Math.max(0, ramp.lip - 2)
    for (let i = begin; i < end; i++) {
      const a = fs[i]
      const b = fs[i + 1]
      const abx = b.x - a.x
      const abz = b.z - a.z
      const l2 = abx * abx + abz * abz || 1
      let t = ((x - a.x) * abx + (z - a.z) * abz) / l2
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const px = a.x + abx * t
      const pz = a.z + abz * t
      const half = ramp.halfW[i] + (ramp.halfW[i + 1] - ramp.halfW[i]) * t
      if (Math.hypot(x - px, z - pz) < half + 1.4) return true
    }
  }
  return false
}

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
    const fs = ramp.frames
    for (let i = 0; i < fs.length - 1; i += 2) {
      const j = Math.min(fs.length - 1, i + 2)
      const w = Math.max(ramp.halfW[i], ramp.halfW[j]) * 2 + 8
      out.push({ a: [fs[i].x, fs[i].z], b: [fs[j].x, fs[j].z], w, virtual: true })
    }
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

const elevBest: Surf = { kind: 'elev', y: 0, lat: 0, half: ELEV_W / 2, x: 0, z: 0, yaw: 0 }

function elevHit(x: number, z: number): Surf | null {
  const th = angOf(x, z)
  let lat = Infinity
  let y = 0
  let fx = 0
  let fz = 0
  let tx = 0
  let tz = 1
  for (const d of [0, -0.025, 0.025, -0.05, 0.05]) {
    const f = frameAt(th + d)
    if (f.gap) continue
    const dx = x - f.x
    const dz = z - f.z
    const l = Math.abs(dx * f.px + dz * f.pz)
    const along = Math.abs(dx * f.tx + dz * f.tz)
    if (along > 5 || l >= lat) continue
    lat = l
    y = f.y
    fx = f.x
    fz = f.z
    tx = f.tx
    tz = f.tz
  }
  if (lat > ELEV_W / 2 + 22) return null
  elevBest.y = y
  elevBest.lat = lat
  elevBest.x = fx
  elevBest.z = fz
  elevBest.yaw = yawOf(tx, tz)
  return elevBest
}

const rampBest: Surf = { kind: 'ramp', y: 0, lat: 0, half: 0, x: 0, z: 0, yaw: 0 }

function rampHit(x: number, z: number): Surf | null {
  let lat = Infinity
  let half = 0
  let y = 0
  let px = 0
  let pz = 0
  let tx = 0
  let tz = 1
  for (const ramp of RAMPS) {
    const fs = ramp.frames
    for (let i = 0; i < fs.length - 1; i++) {
      const a = fs[i]
      const b = fs[i + 1]
      const abx = b.x - a.x
      const abz = b.z - a.z
      const l2 = abx * abx + abz * abz || 1
      const t = ((x - a.x) * abx + (z - a.z) * abz) / l2
      if (t < 0 || t > 1) continue
      const qx = a.x + abx * t
      const qz = a.z + abz * t
      const d = Math.hypot(x - qx, z - qz)
      if (d >= lat) continue
      lat = d
      half = ramp.halfW[i] + (ramp.halfW[i + 1] - ramp.halfW[i]) * t
      y = a.y + (b.y - a.y) * t
      px = qx
      pz = qz
      tx = abx
      tz = abz
    }
  }
  if (lat > half + 3 || !Number.isFinite(lat)) return null
  const l = Math.hypot(tx, tz) || 1
  rampBest.y = y
  rampBest.lat = lat
  rampBest.half = half
  rampBest.x = px
  rampBest.z = pz
  rampBest.yaw = yawOf(tx / l, tz / l)
  return rampBest
}

const portBest: Surf = { kind: 'port', y: PORT_Y, lat: 0, half: 0.4, x: 0, z: 0, yaw: 0 }

function portHit(x: number, z: number): Surf | null {
  const { u, v } = portLocal(x, z)
  const du = u < 0 ? -u : u > PORT_LEN ? u - PORT_LEN : 0
  const dv = v < -PORT_WID / 2 ? -PORT_WID / 2 - v : v > PORT_WID / 2 ? v - PORT_WID / 2 : 0
  const lat = Math.hypot(du, dv)
  if (lat > 24) return null
  portBest.lat = lat
  portBest.x = x
  portBest.z = z
  portBest.yaw = yawOf(ox, oz)
  return portBest
}

const spurBest: Surf = { kind: 'spur', y: 0.03, lat: 0, half: SPUR.w / 2, x: 0, z: 0, yaw: 0 }

function spurHit(x: number, z: number): Surf | null {
  const [ax, az] = SPUR.a
  const [bx, bz] = SPUR.b
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz || 1
  let t = ((x - ax) * dx + (z - az) * dz) / l2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const px = ax + dx * t
  const pz = az + dz * t
  const lat = Math.hypot(x - px, z - pz)
  if (lat > SPUR.w / 2 + 8) return null
  const tl = Math.hypot(dx, dz) || 1
  spurBest.lat = lat
  spurBest.x = px
  spurBest.z = pz
  spurBest.yaw = yawOf(dx / tl, dz / tl)
  return spurBest
}

const hitBuf: Surf[] = []

export function sampleSurface(x: number, z: number, carY: number): Surf | null {
  hitBuf.length = 0
  const e = elevHit(x, z)
  const r = rampHit(x, z)
  const p = portHit(x, z)
  const s = spurHit(x, z)
  if (e) hitBuf.push(e)
  if (r) hitBuf.push(r)
  if (p) hitBuf.push(p)
  if (s) hitBuf.push(s)
  if (!hitBuf.length) return null
  let best = hitBuf[0]
  let bestS = Math.abs(carY - (best.y + 0.25)) + best.lat * 0.35
  for (let i = 1; i < hitBuf.length; i++) {
    const h = hitBuf[i]
    const sc = Math.abs(carY - (h.y + 0.25)) + h.lat * 0.35
    if (sc < bestS) { best = h; bestS = sc }
  }
  return best
}

export function onSurface(s: Surf, carY: number) {
  if (carY < s.y - 0.55 || carY > s.y + 2.5) return false
  if (s.kind === 'port') return s.lat < 0.7
  return s.lat < s.half + 1.5
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
