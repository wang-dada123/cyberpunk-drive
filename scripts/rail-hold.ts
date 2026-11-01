/**
 * 高架护栏：四段弯道外侧顶不住、撇出去、摇杆往外打，都不能掉下桥。
 * 把车放到弯道外侧的卡位里，复位最多两次，而且不会再落回桥边。
 *
 * npx esbuild scripts/rail-hold.ts --bundle --platform=node --format=esm --external:@dimforge/rapier3d-compat --define:import.meta.env.DEV=false --outfile=node_modules/.cache/rail-hold.mjs && node node_modules/.cache/rail-hold.mjs
 */
import RAPIER from '@dimforge/rapier3d-compat'
import { ELEV_W, RING_FRAMES, frameAt, yawOf } from '../src/data/expansionLayout'
import { ringGuardBoxes, type GuardBox } from '../src/data/guardWalls'
import { expansionStats, resetExpansionDrive, expansionDriveStep } from '../src/components/expansionDrive'
import { setMobileInput } from '../src/hooks/useControls'

const fail: string[] = []
const ok = (c: boolean, m: string) => { if (!c) fail.push(m) }

const CURVES = [35, 90, 150, 250]

function angDiff(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b))
}

function around(deg: number) {
  const ang = deg * Math.PI / 180
  const frames = RING_FRAMES.slice(0, -1).filter((f) => Math.abs(angDiff(f.theta, ang)) < 0.45)
  frames.sort((a, b) => angDiff(a.theta, ang) - angDiff(b.theta, ang))
  return frames
}

await RAPIER.init()

function addBox(world: RAPIER.World, b: GuardBox) {
  const yaw = b.rotation[1]
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(b.args[0], b.args[1], b.args[2])
      .setTranslation(b.position[0], b.position[1], b.position[2])
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setFriction(0.05)
      .setRestitution(0),
  )
}

function makeWorld(deg: number) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.createCollider(RAPIER.ColliderDesc.cuboid(800, 0.5, 800).setTranslation(0, -0.5, 0).setFriction(0.6))
  const frames = around(deg)
  ok(frames.length > 8, `${deg}° frames ${frames.length}`)
  const guards = ringGuardBoxes(frames)
  ok(guards.length > 8, `${deg}° guards ${guards.length}`)
  for (const g of guards) ok(g.args[1] * 2 >= 2, `${deg}° wall height ${(g.args[1] * 2).toFixed(2)}`)
  for (const g of guards) addBox(world, g)
  const hw = ELEV_W / 2
  for (let i = 0; i < frames.length - 1; i += 2) {
    const a = frames[i]
    const b = frames[Math.min(frames.length - 1, i + 2)]
    if (a.gap || b.gap) continue
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    if (len < 0.3) continue
    const yaw = Math.atan2(dx, dz)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, 0.16, len / 2 + 0.4)
        .setTranslation((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.16, (a.z + b.z) / 2)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
        .setFriction(0),
    )
  }
  return { world, frames, guards }
}

function makeCar(world: RAPIER.World, x: number, y: number, z: number, yaw: number, speed: { x: number; y: number; z: number }) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setLinearDamping(1.2).setAngularDamping(4).setCanSleep(false).setCcdEnabled(true),
  )
  body.setEnabledRotations(false, true, false, true)
  body.enableCcd(true)
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.55, 0.25, 1).setTranslation(0, 0.27, 0).setFriction(0).setDensity(0), body)
  world.createCollider(
    RAPIER.ColliderDesc.capsule(0.62, 0.35).setTranslation(0, 0.15, 0).setRotation({ x: Math.sin(Math.PI / 4), y: 0, z: 0, w: Math.cos(Math.PI / 4) }).setFriction(0).setDensity(0),
    body,
  )
  body.setAdditionalMass(1.2, true)
  body.setLinvel(speed, true)
  return body
}

function outward(deg: number) {
  const th = deg * Math.PI / 180
  return { x: Math.cos(th), z: -Math.sin(th) }
}

type RunKind = 'speed' | 'push' | 'stick'

function hold(deg: number, kind: RunKind) {
  resetExpansionDrive()
  const { world } = makeWorld(deg)
  const f = frameAt(deg * Math.PI / 180)
  const o = outward(deg)
  const yaw = kind === 'speed' || kind === 'push' ? yawOf(o.x, o.z) : yawOf(f.tx, f.tz)
  const speed = kind === 'speed' ? { x: o.x * 16, y: 0, z: o.z * 16 } : { x: 0, y: 0, z: 0 }
  const body = makeCar(world, f.x, f.y + 0.55, f.z, yaw, speed)
  setMobileInput(1, kind === 'stick' ? 0.85 : 0)
  let minY = 99
  let maxR = 0
  const r0 = Math.hypot(f.x, f.z)
  for (let s = 0; s < 90; s++) {
    expansionDriveStep(body as never, 1 / 60, world as never)
    const t = body.translation()
    const face = kind === 'stick' ? yawOf(o.x, o.z) : yaw
    if (kind !== 'speed') {
      const r = body.rotation()
      const yawNow = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.z * r.z))
      let diff = face - yawNow
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      const turn = Math.max(-1, Math.min(1, diff / 0.45))
      setMobileInput(1, turn)
      body.setAngvel({ x: 0, y: 3.2 * turn, z: 0 }, true)
      const fx = -Math.sin(yawNow)
      const fz = -Math.cos(yawNow)
      const lv = body.linvel()
      if (Math.hypot(lv.x, lv.z) < 18) body.applyImpulse({ x: fx * 32 / 60, y: 0, z: fz * 32 / 60 }, true)
    }
    world.step()
    const p = body.translation()
    minY = Math.min(minY, p.y)
    maxR = Math.max(maxR, Math.hypot(p.x, p.z))
  }
  const end = body.translation()
  ok(minY > f.y - 0.8, `${deg}° ${kind} fell y ${minY.toFixed(2)} road ${f.y.toFixed(2)}`)
  ok(maxR < r0 + 4.6, `${deg}° ${kind} left the deck r +${(maxR - r0).toFixed(2)}`)
  ok(expansionStats.resets === 0, `${deg}° ${kind} reset ${expansionStats.resets}`)
  return { minY, maxR: maxR - r0, y: end.y }
}

for (const deg of CURVES) {
  for (const kind of ['speed', 'push', 'stick'] as const) {
    const r = hold(deg, kind)
    console.log(`${deg}° ${kind}: minY ${r.minY.toFixed(2)} dr ${r.maxR.toFixed(2)}`)
  }
}

// 截图那种卡位：弯道外侧、贴着护栏外面，掉在桥边。复位最多两次，不能再落回桥沿。
{
  resetExpansionDrive()
  const deg = 250
  const { world } = makeWorld(deg)
  const f = frameAt(deg * Math.PI / 180)
  const o = outward(deg)
  const x = f.x + o.x * 7.2
  const z = f.z + o.z * 7.2
  const body = makeCar(world, f.x, f.y + 0.55, f.z, yawOf(f.tx, f.tz), { x: f.tx * 6, y: 0, z: f.tz * 6 })
  setMobileInput(1, 0)
  for (let s = 0; s < 40; s++) {
    expansionDriveStep(body as never, 1 / 60, world as never)
    world.step()
  }
  body.setTranslation({ x, y: f.y - 1.4, z }, true)
  body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  let placed: { y: number; lat: number; n: number } | null = null
  for (let s = 0; s < 60 * 6; s++) {
    const before = expansionStats.resets
    expansionDriveStep(body as never, 1 / 60, world as never)
    const t = body.translation()
    const r = body.rotation()
    const yawNow = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.z * r.z))
    const fx = -Math.sin(yawNow)
    const fz = -Math.cos(yawNow)
    const lv = body.linvel()
    if (Math.hypot(lv.x, lv.z) < 16) body.applyImpulse({ x: fx * 32 / 60, y: 0, z: fz * 32 / 60 }, true)
    world.step()
    if (expansionStats.resets > before) {
      const p = body.translation()
      const lat = Math.abs((p.x - f.x) * f.px + (p.z - f.z) * f.pz)
      placed = { y: p.y, lat, n: expansionStats.resets }
      console.log(`stuck place #${placed.n} y=${p.y.toFixed(2)} lat=${lat.toFixed(2)} why=${expansionStats.why}`)
    }
    if (placed && s > 60) break
  }
  const end = body.translation()
  ok(!!placed, 'stuck never reset')
  ok((placed?.n ?? 9) <= 2, `stuck resets ${placed?.n}`)
  ok(!!placed && (placed.y < 2.4 || placed.lat < 2.2), `stuck landed on the edge y=${placed?.y.toFixed(2)} lat=${placed?.lat.toFixed(2)}`)
  console.log(`stuck end y=${end.y.toFixed(2)} r=${Math.hypot(end.x, end.z).toFixed(1)} resets=${expansionStats.resets} why=${expansionStats.why}`)
}

if (fail.length) {
  console.error(`\n${fail.length} failed`)
  for (const f of fail) console.error(' - ' + f)
  process.exit(1)
}
console.log('\nrail hold passed')
