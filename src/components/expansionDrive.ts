import type { RapierRigidBody } from '@react-three/rapier'
import { getDriveInput } from '../hooks/useControls'
import {
  H_HI, angOf, inBoostLip, inGap, inJumpAir, inKicker, onSurface, sampleSurface,
  type SurfKind,
} from '../data/expansionLayout'

/**
 * 飞台 J1：唇部给一次向上速度。出界、掉出路面或卡缝时拉回上次合法路面。
 * 只在扩建路面附近生效，避免把隧道 / 主城误判成掉落。
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

let last: Mem | null = null
let cool = 0
let stuck = 0
let armed = true

export function expansionDriveStep(rb: RapierRigidBody, dt: number) {
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
    stuck = 0
  }

  if (legal && forward > 0.55 && speed < 0.35) stuck += dt
  else stuck = 0

  if (!last) return
  const near = !!surf || inJumpAir(t.x, t.z)
  if (!near) return

  t = rb.translation()
  const fell = !legal && t.y < last.y - 2.45
  const elevOut = !legal && surf?.kind === 'elev' && surf.lat > surf.half + 1.8 && t.y < surf.y + 2.6 && (last.kind === 'elev' || last.kind === 'ramp')
  const portOut = !legal && last.kind === 'port' && surf?.kind === 'port' && surf.lat > 1.2 && t.y < last.y - 0.3
  const airOut = inJumpAir(t.x, t.z) && t.y < H_HI + 1 - 2.45
  const jammed = legal && stuck > 1.35
  if (!(fell || elevOut || portOut || airOut || jammed)) return

  rb.setTranslation({ x: last.x, y: last.y + 0.25, z: last.z }, true)
  rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
  rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
  rb.setRotation({ x: last.qx, y: last.qy, z: last.qz, w: last.qw }, true)
  expansionStats.resets++
  stuck = 0
  cool = 0.4
  armed = true
}
