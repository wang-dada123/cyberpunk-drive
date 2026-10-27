import type { RapierRigidBody } from '@react-three/rapier'
import type { World } from '@dimforge/rapier3d-compat'
import { getDriveInput } from '../hooks/useControls'
import { rings, segs, tunnelDepth, TUNNEL, TUNNEL_R1 } from '../data/mapLayout'
import {
  H_HI, PORT_BASIS, PORT_LEN, PORT_Y, RAMPS, RING_FRAMES, SPUR, angOf, inBoostLip, inGap, inJumpAir,
  inKicker, onSurface, portWorld, sampleSurface, yawOf, type SurfKind,
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

export const expansionStats = { resets: 0, jumps: 0, sectors: 0 }

export type StuckMem = { t: number; x: number; z: number; grace: number }
export const freshStuck = (): StuckMem => ({ t: 0, x: 0, z: 0, grace: 0 })

let last: Mem | null = null
let cool = 0
let stuckMem = freshStuck()
let armed = true

export type StuckSample = { push: boolean; crawl: boolean; tilted: boolean; wall: boolean; x: number; z: number }

/** 油门且几乎不动、贴墙顶着、或车体已经歪了，持续 2s 且位移 < 2.2m → 该复位。 */
export function stepStuck(m: StuckMem, s: StuckSample, dt: number) {
  const hot = (s.push && s.crawl) || (s.tilted && s.crawl) || (s.wall && s.push && s.crawl)
  if (hot) {
    if (m.t <= 0) { m.x = s.x; m.z = s.z }
    m.t += dt
    m.grace = 0.45
  } else if (m.grace > 0 && (s.push || s.tilted) && Math.hypot(s.x - m.x, s.z - m.z) < 1.8) {
    m.grace -= dt
    m.t += dt
  } else {
    m.t = 0
    m.grace = 0
  }
  return m.t >= 2 - 1e-3 && Math.hypot(s.x - m.x, s.z - m.z) < 2.2
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

function place(rb: RapierRigidBody, spot: DriveSpot) {
  const q = yawQuat(spot.yaw)
  rb.setTranslation({ x: spot.x, y: spot.y, z: spot.z }, true)
  rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
  rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
  rb.setRotation(q, true)
  last = { x: spot.x, y: spot.y, z: spot.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, kind: spot.kind }
  expansionStats.resets++
  stuckMem = freshStuck()
  cool = 1.1
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

function carForward(rot: { x: number; y: number; z: number; w: number }) {
  const { x: qx, y: qy, z: qz, w: qw } = rot
  return { x: -2 * (qx * qz + qw * qy), z: 2 * (qx * qx + qy * qy) - 1 }
}

export function expansionDriveStep(rb: RapierRigidBody, dt: number, world?: World) {
  let t = rb.translation()
  const lv = rb.linvel()
  const speed = Math.hypot(lv.x, lv.z)
  const th = angOf(t.x, t.z)
  const surf = sampleSurface(t.x, t.z, t.y)
  const legal = !!surf && onSurface(surf, t.y)
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
  if (legal && !hold && speed > 0.9 && surf) {
    last = { x: t.x, y: t.y, z: t.z, qx: rot.x, qy: rot.y, qz: rot.z, qw: rot.w, kind: surf.kind }
  }

  const push = Math.abs(forward) > 0.2
  const upY = 1 - 2 * (rot.x * rot.x + rot.z * rot.z)
  const wall = !!(world && push && speed < 1.2 && touchingWall(world, rb))
  if (stepStuck(stuckMem, { push, crawl: speed < 0.45, tilted: upY < 0.82 && speed < 1.1, wall, x: t.x, z: t.z }, dt)) {
    const fwd = carForward(rot)
    place(rb, retreatSpot(t.x, t.z, t.y, fwd.x, fwd.z))
    return
  }

  if (!last) return
  const near = !!surf || inJumpAir(t.x, t.z)
  if (!near) return

  t = rb.translation()
  const fell = !legal && t.y < last.y - 2.45
  const elevOut = !legal && surf?.kind === 'elev' && surf.lat > surf.half + 1.8 && t.y < surf.y + 2.6 && (last.kind === 'elev' || last.kind === 'ramp')
  const portOut = !legal && last.kind === 'port' && surf?.kind === 'port' && surf.lat > 1.2 && t.y < last.y - 0.3
  const airOut = inJumpAir(t.x, t.z) && t.y < H_HI + 1 - 2.45
  if (!(fell || elevOut || portOut || airOut)) return

  rb.setTranslation({ x: last.x, y: last.y + 0.25, z: last.z }, true)
  rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
  rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
  rb.setRotation({ x: last.qx, y: last.qy, z: last.qz, w: last.qw }, true)
  expansionStats.resets++
  stuckMem = freshStuck()
  cool = 0.4
  armed = true
}
