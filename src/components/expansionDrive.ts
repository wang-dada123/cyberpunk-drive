import type { RapierRigidBody } from '@react-three/rapier'
import type { World } from '@dimforge/rapier3d-compat'
import { getDriveInput } from '../hooks/useControls'
import RAPIER from '@dimforge/rapier3d-compat'
import { rings, segs, tunnelDepth, TUNNEL, TUNNEL_R1, SPAWN } from '../data/mapLayout'
import {
  H_HI, PORT_BASIS, PORT_LEN, PORT_Y, RAMPS, RING_FRAMES, SPUR, angOf, inBoostLip, inGap, inJumpAir,
  inKicker, onSurface, portWorld, sampleSurface, sectorOf, yawOf, type SurfKind,
} from '../data/expansionLayout'

/**
 * 飞台 J1：唇部给一次向上速度。出界或掉出路面时拉回上次合法路面。
 * 另外：油门顶住不动超过 2s（或车体歪了 / 贴着墙不动）复位到最近路面中线。
 * 坡脚卡住时车往往还没上过扩建路面，不能依赖 last。
 */
type Mem = {
  x: number
  y: number
  z: number
  qx: number
  qy: number
  qz: number
  qw: number
  kind: SurfKind
}

export const expansionStats = { resets: 0, jumps: 0, sectors: -1, why: '' }

export type StuckMem = { t: number; x: number; z: number; grace: number }
export const freshStuck = (): StuckMem => ({ t: 0, x: 0, z: 0, grace: 0 })

let last: Mem | null = null
let cool = 0
let stuckMem = freshStuck()
let armed = true
let offT = 0
let wallTick = 0
let wallCache = false
let burst = 0
let freeT = 0

/** 测试换一条坡之前清掉上次路面，避免旧的 last 把车拉走。 */
export function resetExpansionDrive() {
  last = null
  cool = 0
  stuckMem = freshStuck()
  armed = true
  offT = 0
  wallTick = 0
  wallCache = false
  burst = 0
  freeT = 0
  expansionStats.resets = 0
  expansionStats.jumps = 0
  expansionStats.sectors = -1
  expansionStats.why = ''
}

export type StuckSample = { push: boolean; crawl: boolean; tilted: boolean; wall: boolean; x: number; z: number }

/**
 * 油门且几乎不动，或车体已经歪了，持续 2s 且位移 < 1.6m → 复位。
 * 松一口气只缓慢减计时，不立刻清零：颠一下不会误复位，也不会把真卡住洗掉。
 */
export function stepStuck(m: StuckMem, s: StuckSample, dt: number) {
  const hot = (s.push && s.crawl) || (s.tilted && s.crawl)
  if (hot) {
    if (m.t <= 0) { m.x = s.x; m.z = s.z; m.grace = 0 }
    m.t += dt
  } else if (m.t > 0) {
    m.t = Math.max(0, m.t - dt * 0.35)
    m.grace = 0
  }
  return m.t >= 2 - 1e-3 && Math.hypot(s.x - m.x, s.z - m.z) < 1.6
}

function roadY(x: number, z: number) {
  const { dir, R0, W } = TUNNEL
  const u = x * dir[0] + z * dir[1]
  const v = x * -dir[1] + z * dir[0]
  if (Math.abs(v) < W / 2 + 0.8 && u >= R0 - 1 && u <= TUNNEL_R1 + 1) return tunnelDepth(u)
  return 0
}

export type DriveSpot = { x: number; y: number; z: number; yaw: number; kind: SurfKind }

/** 最近可开路面中线。车头朝向用来决定沿路的哪一头。 */
export function nearestDriveSpot(px: number, pz: number, py: number, fx: number, fz: number): DriveSpot {
  let best: DriveSpot | null = null
  let bestD = Infinity
  const take = (x: number, y: number, z: number, tx: number, tz: number, kind: SurfKind) => {
    const d = (x - px) ** 2 + (z - pz) ** 2 + ((y - py) * 1.15) ** 2
    if (d >= bestD) return
    const flip = tx * fx + tz * fz < 0
    bestD = d
    best = { x, y, z, yaw: yawOf(flip ? -tx : tx, flip ? -tz : tz), kind }
  }
  for (const ring of rings) {
    const rr = Math.hypot(px, pz) || 1
    const x = px / rr * ring.r
    const z = pz / rr * ring.r
    take(x, roadY(x, z) + 0.5, z, z / ring.r, -x / ring.r, 'spur')
  }
  for (const s of segs) {
    if (s.virtual) continue
    const [ax, az] = s.a, [bx, bz] = s.b
    const dx = bx - ax, dz = bz - az
    const l2 = dx * dx + dz * dz || 1
    let t = ((px - ax) * dx + (pz - az) * dz) / l2
    t = Math.max(0, Math.min(1, t))
    const x = ax + dx * t, z = az + dz * t
    const l = Math.hypot(dx, dz) || 1
    take(x, roadY(x, z) + 0.5, z, dx / l, dz / l, 'spur')
  }
  for (let i = 0; i < RING_FRAMES.length; i += 3) {
    const f = RING_FRAMES[i]
    if (f.gap) continue
    take(f.x, f.y + 0.5, f.z, f.tx, f.tz, 'elev')
  }
  for (const ramp of RAMPS) {
    const fs = ramp.frames
    for (let i = 0; i < fs.length; i += 2) {
      const f = fs[i]
      if (f.y < -0.05) continue
      take(f.x, f.y + 0.5, f.z, f.tx, f.tz, 'ramp')
    }
  }
  const [sax, saz] = SPUR.a, [sbx, sbz] = SPUR.b
  const sl = Math.hypot(sbx - sax, sbz - saz) || 1
  for (const t of [0.15, 0.5, 0.85]) take(sax + (sbx - sax) * t, 0.5, saz + (sbz - saz) * t, (sbx - sax) / sl, (sbz - saz) / sl, 'spur')
  for (let u = 16; u < PORT_LEN; u += 28) {
    const [x, z] = portWorld(u, 0)
    take(x, PORT_Y + 0.5, z, PORT_BASIS.ox, PORT_BASIS.oz, 'port')
  }
  return best ?? { x: 0, y: 1, z: 20, yaw: 0, kind: 'spur' }
}

/** 往车头反方向退一截再贴回路面，避免复位回刚顶住的那一点。 */
export function retreatSpot(px: number, pz: number, py: number, fx: number, fz: number): DriveSpot {
  const l = Math.hypot(fx, fz) || 1
  const back = (m: number) => nearestDriveSpot(px - fx / l * m, pz - fz / l * m, py, fx, fz)
  const near = back(6)
  if (Math.hypot(near.x - px, near.z - pz) < 2.5) return back(14)
  return near
}

function yawQuat(yaw: number) {
  const h = yaw * 0.5
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) }
}

const ELEV_SAFE: DriveSpot[] = []
const GROUND_SAFE: DriveSpot[] = []
for (let i = 0; i < RING_FRAMES.length; i += 6) {
  const f = RING_FRAMES[i]
  if (f.gap || f.kick) continue
  ELEV_SAFE.push({ x: f.x, y: f.y + 0.55, z: f.z, yaw: yawOf(f.tx, f.tz), kind: 'elev' })
}
for (let r = 0; r < RAMPS.length; r++) {
  const ramp = RAMPS[r]
  const mouth = ramp.frames[ramp.mouth]
  GROUND_SAFE.push({ x: mouth.x, y: 0.9, z: mouth.z, yaw: yawOf(mouth.tx, mouth.tz), kind: 'ramp' })
  for (let i = ramp.lip; i <= ramp.deckOwn; i += 5) {
    const f = ramp.frames[i]
    if (f.y < 2) continue
    ELEV_SAFE.push({ x: f.x, y: f.y + 0.55, z: f.z, yaw: yawOf(f.tx, f.tz), kind: 'ramp' })
  }
}
for (let i = 0; i < 24; i++) {
  const th = (i / 24) * Math.PI * 2
  const x = 220 * Math.cos(th)
  const z = -220 * Math.sin(th)
  GROUND_SAFE.push({ x, y: 0.75, z, yaw: yawOf(-Math.sin(th), -Math.cos(th)), kind: 'spur' })
}
const SPAWN_SPOT: DriveSpot = { x: SPAWN[0], y: SPAWN[1], z: SPAWN[2], yaw: 0, kind: 'spur' }
GROUND_SAFE.push(SPAWN_SPOT)

function nearestSpots(list: DriveSpot[], x: number, z: number, n: number) {
  const scored = list.map((s) => ({ s, d: (s.x - x) ** 2 + (s.z - z) ** 2 }))
  scored.sort((a, b) => a.d - b.d)
  return scored.slice(0, n).map((e) => e.s)
}

let probe: RAPIER.Cuboid | null = null
function spotBlocked(world: World | undefined, s: DriveSpot) {
  if (!world) return false
  try {
    if (!probe) probe = new RAPIER.Cuboid(0.62, 0.4, 1.05)
    const q = yawQuat(s.yaw)
    const hit = world.intersectionWithShape(
      { x: s.x, y: s.y + 0.25, z: s.z },
      q,
      probe,
    )
    return !!hit
  } catch {
    return false
  }
}

function resolveSpot(world: World | undefined, list: DriveSpot[], x: number, z: number) {
  const near = nearestSpots(list, x, z, 8)
  for (let i = 0; i < near.length; i++) if (!spotBlocked(world, near[i])) return near[i]
  if (!spotBlocked(world, SPAWN_SPOT)) return SPAWN_SPOT
  return near[0] ?? SPAWN_SPOT
}

function useGround(py: number, surf: { kind: string; y: number } | null) {
  // 人在桥下，或本来就在地面：不要送回桥面边缘。
  if (py < 2.8) return true
  if (last && last.y > 3.5 && py < last.y - 2.2) return true
  return !!surf && (surf.kind === 'elev' || surf.kind === 'ramp') && py < surf.y - 2.2
}

/** 落到路面中央。掉到桥下只去地面。连续第二次复位直接去最近坡口或出生点。 */
function place(rb: RapierRigidBody, x: number, z: number, y: number, surf: { kind: string; y: number } | null, world?: World) {
  const fallen = useGround(y, surf)
  const list = fallen || burst >= 1 ? GROUND_SAFE : ELEV_SAFE
  const base = resolveSpot(world, list, x, z)
  // 车头朝前：沿路切线，取和原车头同向的那一头
  const r = rb.rotation()
  const fx = -2 * (r.x * r.z + r.w * r.y)
  const fz = -(1 - 2 * (r.x * r.x + r.y * r.y))
  const same = -Math.sin(base.yaw) * fx + -Math.cos(base.yaw) * fz >= 0
  const spot = same ? base : { ...base, yaw: base.yaw + Math.PI }
  const q = yawQuat(spot.yaw)
  rb.setTranslation({ x: spot.x, y: spot.y, z: spot.z }, true)
  rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
  rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
  rb.setRotation(q, true)
  last = { x: spot.x, y: spot.y, z: spot.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, kind: spot.kind }
  expansionStats.resets++
  expansionStats.why = fallen ? 'ground' : burst >= 1 ? 'escape' : 'center'
  stuckMem = freshStuck()
  offT = 0
  freeT = 0
  burst += 1
  cool = 2
  armed = true
}

function touchingWall(world: World, rb: RapierRigidBody) {
  try {
    let hit = false
    const n = rb.numColliders()
    for (let i = 0; i < n && !hit; i++) {
      const col = rb.collider(i)
      world.contactPairsWith(col, (other) => {
        if (hit) return
        world.contactPair(col, other, (mf) => {
          if (hit || mf.numContacts() <= 0) return
          if (Math.abs(mf.normal().y) < 0.42) hit = true
        })
      })
    }
    return hit
  } catch {
    return false
  }
}

/** 还在某条匝道旁边（平面 22m、高度 4m 内）时，不能把高架环的远处采样当成出界。 */
function besideRamp(x: number, z: number, y: number) {
  for (let r = 0; r < RAMPS.length; r++) {
    const fs = RAMPS[r].frames
    for (let i = 0; i < fs.length; i += 3) {
      const f = fs[i]
      if (f.y < 0.4) continue
      const dx = x - f.x
      const dz = z - f.z
      if (dx * dx + dz * dz < 484 && Math.abs(y - f.y) < 4) return true
    }
  }
  return false
}

export function expansionDriveStep(rb: RapierRigidBody, dt: number, world?: World) {
  let t = rb.translation()
  const lv = rb.linvel()
  const speed = Math.hypot(lv.x, lv.z)
  const th = angOf(t.x, t.z)
  const surf = sampleSurface(t.x, t.z, t.y)
  const legal = !!surf && onSurface(surf, t.y)
  if (surf && (surf.kind === 'elev' || surf.kind === 'ramp')) expansionStats.sectors = sectorOf(th)
  else if (!surf) expansionStats.sectors = -1
  const forward = getDriveInput().forward

  if (legal && surf!.kind === 'elev' && inBoostLip(th) && speed > 9 && armed) {
    const vy = Math.min(8.2, 4.5 + speed * 0.2)
    rb.setLinvel({ x: lv.x, y: Math.max(lv.y, vy), z: lv.z }, true)
    armed = false
    expansionStats.jumps++
  }
  if (!inKicker(th) && !inGap(th)) armed = true

  if (cool > 0) {
    cool -= dt
    return
  }

  const rot = rb.rotation()
  const hold = !!surf && surf.kind === 'elev' && (inKicker(th) || inGap(th))
  if (legal && !hold && speed > 0.9 && surf && surf.lat < 2) {
    last = { x: t.x, y: t.y, z: t.z, qx: rot.x, qy: rot.y, qz: rot.z, qw: rot.w, kind: surf.kind }
  }
  if (legal && speed > 5 && surf && surf.lat < 2) {
    freeT += dt
    if (freeT > 1.5) burst = 0
  } else freeT = Math.max(0, freeT - dt)

  const push = Math.abs(forward) > 0.2
  const upY = 1 - 2 * (rot.x * rot.x + rot.z * rot.z)
  // 贴墙查询隔几步做一次：每步扫接触对会在顶墙时把这一帧撑满。
  let wall = wallCache
  if (world && push && speed < 0.8) {
    wallTick++
    if (wallTick % 6 === 0) wall = wallCache = touchingWall(world, rb)
  } else if (!push || speed >= 1.1) wall = wallCache = false
  if (stepStuck(stuckMem, { push, crawl: speed < 0.32, tilted: upY < 0.82 && speed < 0.8, wall, x: t.x, z: t.z }, dt)) {
    place(rb, t.x, t.z, t.y, surf, world)
    return
  }

  if (legal) offT = 0
  else offT += dt

  if (!last) return
  const near = !!surf || inJumpAir(t.x, t.z)
  if (!near && offT < 0.35) return

  t = rb.translation()
  // 只有从桥上掉下去才拉走。地面上的低高度是正常行驶，不能当成出界。
  const fell = offT > 0.5 && last.y > 3.5 && t.y < last.y - 2.2
  const elevOut = offT > 0.75 && !!surf && surf.kind === 'elev' && surf.lat > surf.half + 3.2 && !!last && t.y < last.y - 1.5 && t.y < surf.y + 2.2 && (last.kind === 'elev' || last.kind === 'ramp') && !besideRamp(t.x, t.z, t.y)
  const portOut = !!last && offT > 0.5 && last.kind === 'port' && surf?.kind === 'port' && surf.lat > 2.2 && t.y < last.y - 0.6
  const airOut = offT > 0.35 && inJumpAir(t.x, t.z) && t.y < H_HI + 1 - 2.8
  if (!(fell || elevOut || portOut || airOut)) return
  place(rb, t.x, t.z, t.y, surf, world)
}
