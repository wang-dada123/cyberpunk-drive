/**
 * 匝道几何 + 无头物理：四条坡从坡脚（含外环两个方向）能开上桥，卡住计时满 2s 才复位。
 * 不进正式构建。运行：npx esbuild scripts/ramp-climb.ts --bundle --platform=node --format=esm --external:@dimforge/rapier3d-compat --outfile=node_modules/.cache/ramp-climb.mjs && node node_modules/.cache/ramp-climb.mjs
 */
import RAPIER from '@dimforge/rapier3d-compat'
import { RAMPS, frameAt, yawOf, type Ramp } from '../src/data/expansionLayout'
import { roadClearance } from '../src/data/mapLayout'
import { GUIDE_HEX, rampCollider, rampGuideMesh } from '../src/data/rampSurface'
import { freshStuck, nearestDriveSpot, retreatSpot, stepStuck } from '../src/components/expansionDrive'

const fail: string[] = []
const ok = (c: boolean, m: string) => { if (!c) fail.push(m) }

function sat(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b)
}

function maxSlope(ramp: Ramp) {
  let m = 0
  for (let i = 1; i < ramp.frames.length; i++) {
    const a = ramp.frames[i - 1], b = ramp.frames[i]
    const ds = Math.hypot(b.x - a.x, b.z - a.z)
    m = Math.max(m, Math.atan2(Math.max(0, b.y - a.y), ds) * 180 / Math.PI)
  }
  return m
}

ok(sat(GUIDE_HEX) <= 0.5, `guide sat ${sat(GUIDE_HEX)}`)
const guide = rampGuideMesh()
ok(guide.idx.length / 3 < 400, `guide tris ${guide.idx.length / 3}`)
ok(guide.pos.length > 0, 'guide empty')

for (const ramp of RAMPS) {
  const A = ramp.deg * Math.PI / 180
  for (const R of [214, 220, 226]) {
    let best = ramp.frames[0], bd = 1e9
    for (const f of ramp.frames) {
      const d = Math.abs(Math.hypot(f.x, f.z) - R)
      if (d < bd) { bd = d; best = f }
    }
    ok(best.y < 0.08, `ramp ${ramp.deg}° r≈${R} y=${best.y.toFixed(2)} 还在拱起`)
  }
  const slope = maxSlope(ramp)
  ok(slope < 16, `ramp ${ramp.deg}° max slope ${slope.toFixed(1)}°`)
  const lip = ramp.frames[ramp.lip]
  const land = frameAt(ramp.landAng)
  const inner = Math.hypot(land.x, land.z) - 5
  ok(Math.hypot(lip.x, lip.z) < inner - 1, `ramp ${ramp.deg}° lip r=${Math.hypot(lip.x, lip.z).toFixed(1)} inner ${inner.toFixed(1)}`)
  ok(Math.abs(lip.y - land.y) < 0.25, `ramp ${ramp.deg}° lip y ${lip.y.toFixed(2)} deck ${land.y.toFixed(2)}`)
  ok(ramp.halfW[ramp.mouth] >= 6.5, `ramp ${ramp.deg}° mouth half ${ramp.halfW[ramp.mouth]}`)
  for (const side of [-1, 1]) {
    const ang = A + side * 8 / 220
    const x = 220 * Math.cos(ang), z = -220 * Math.sin(ang)
    let lat = 1e9, half = 0
    for (let i = 0; i < ramp.frames.length; i++) {
      const f = ramp.frames[i]
      if (f.y > 0.15) continue
      const dx = x - f.x, dz = z - f.z
      const along = Math.abs(dx * f.tx + dz * f.tz)
      const l = Math.abs(dx * f.px + dz * f.pz)
      if (along < 4 && l < lat) { lat = l; half = ramp.halfW[i] }
    }
    ok(lat < half - 1, `ramp ${ramp.deg}° side ${side} lat ${lat.toFixed(1)} half ${half.toFixed(1)}`)
  }
  for (let i = 0; i < ramp.frames.length; i += 2) {
    const f = ramp.frames[i]
    if (f.y < 0) continue
    const c = roadClearance(f.x, f.z)
    ok(c < 1, `ramp ${ramp.deg}° center clearance ${c.toFixed(1)} at y=${f.y.toFixed(1)}`)
  }
  const col = rampCollider(ramp)
  ok(col.deck.i.length > 30, `ramp ${ramp.deg}° deck tris`)
  ok(col.wall.i.length > 10, `ramp ${ramp.deg}° wall tris`)
  console.log(`ramp ${ramp.deg}° slope ${slope.toFixed(1)}° lip y ${lip.y.toFixed(2)} mouthW ${(ramp.halfW[ramp.mouth] * 2).toFixed(1)} deckTris ${col.deck.i.length / 3}`)
}

// 卡住：不到 2s 不复位；满 2s 且几乎没动才复位；速度起来了就清零
{
  const m = freshStuck()
  let fired = false
  for (let i = 0; i < 119; i++) fired = stepStuck(m, { push: true, crawl: true, tilted: false, wall: false, x: 0, z: 0 }, 1 / 60) || fired
  ok(!fired && m.t < 2, `stuck early t=${m.t.toFixed(2)}`)
  fired = stepStuck(m, { push: true, crawl: true, tilted: false, wall: false, x: 0.2, z: 0 }, 1 / 60)
  ok(fired, 'stuck at 2s')
  const moving = freshStuck()
  for (let i = 0; i < 180; i++) stepStuck(moving, { push: true, crawl: false, tilted: false, wall: false, x: i * 0.2, z: 0 }, 1 / 60)
  ok(moving.t < 0.5, `moving should not stick t=${moving.t.toFixed(2)}`)
  const tilt = freshStuck()
  let tf = false
  for (let i = 0; i < 130; i++) tf = stepStuck(tilt, { push: false, crawl: true, tilted: true, wall: false, x: 1, z: 1 }, 1 / 60) || tf
  ok(tf, 'tilt stuck')
}

{
  const spot = nearestDriveSpot(220 * Math.cos(20 * Math.PI / 180) + 4, -220 * Math.sin(20 * Math.PI / 180), 0.6, 1, 0)
  ok(spot.y < 2, `foot reset y ${spot.y.toFixed(2)} should stay on the ground`)
  const back = retreatSpot(spot.x, spot.z, spot.y, Math.cos(20 * Math.PI / 180), -Math.sin(20 * Math.PI / 180))
  ok(Math.hypot(back.x - spot.x, back.z - spot.z) > 2, 'retreat leaves the contact point')
}

await RAPIER.init()

function wrap(a: number) {
  let d = a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

type Run = { name: string; x: number; z: number; yaw: number; steer: boolean; target: (x: number, z: number) => { x: number; z: number } }

function makeRuns(ramp: Ramp): Run[] {
  const A = ramp.deg * Math.PI / 180
  const mouth = ramp.frames[ramp.mouth]
  const lip = ramp.frames[ramp.lip]
  const aim = (x: number, z: number) => Math.hypot(x - mouth.x, z - mouth.z) > 8 ? mouth : lip
  const outYaw = yawOf(mouth.tx, mouth.tz)
  const runs: Run[] = [{ name: 'center', x: mouth.x, z: mouth.z, yaw: outYaw, steer: false, target: aim }]
  for (const side of [-1, 1] as const) {
    const ang = A + side * 12 / 220
    const x = 220 * Math.cos(ang), z = -220 * Math.sin(ang)
    const tanX = -Math.sin(ang) * -side, tanZ = -Math.cos(ang) * -side
    // side>0 停在角度更大的一侧，要往角度减小的方向开，切向取负
    runs.push({ name: side > 0 ? 'ccw' : 'cw', x, z, yaw: yawOf(tanX, tanZ), steer: true, target: aim })
  }
  return runs
}

function ahead(ramp: Ramp, x: number, z: number) {
  const fs = ramp.frames
  let bestI = 0, bd = 1e9
  for (let i = 0; i < fs.length; i++) {
    const d = (fs[i].x - x) ** 2 + (fs[i].z - z) ** 2
    if (d < bd) { bd = d; bestI = i }
  }
  const f = fs[Math.min(fs.length - 1, bestI + 4)]
  return f
}

function drive(ramp: Ramp, run: Run) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.createCollider(RAPIER.ColliderDesc.cuboid(600, 0.5, 600).setTranslation(0, -0.5, 0).setFriction(0.5))
  const col = rampCollider(ramp)
  const deck = RAPIER.ColliderDesc.trimesh(col.deck.v, col.deck.i, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
  if (!deck) return { ok: false, why: 'trimesh rejected' }
  deck.setFriction(0.85).setRestitution(0)
  world.createCollider(deck)
  if (col.wall.i.length) {
    const w = RAPIER.ColliderDesc.trimesh(col.wall.v, col.wall.i)
    if (w) world.createCollider(w.setFriction(0.15).setRestitution(0))
  }
  const land = ramp.frames[ramp.join]
  const yaw = Math.atan2(land.tx, land.tz)
  const q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(5, 0.16, 14).setTranslation(land.x, land.y - 0.16, land.z).setRotation(q).setFriction(0),
  )
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(run.x, 0.7, run.z).setRotation({ x: 0, y: Math.sin(run.yaw / 2), z: 0, w: Math.cos(run.yaw / 2) })
      .setLinearDamping(1.2).setAngularDamping(4).setCanSleep(false),
  )
  body.setEnabledRotations(false, true, false, true)
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.55, 0.25, 1).setTranslation(0, 0.27, 0).setFriction(0).setDensity(0), body)
  world.createCollider(
    RAPIER.ColliderDesc.capsule(0.62, 0.35).setTranslation(0, 0.15, 0).setRotation({ x: Math.sin(Math.PI / 4), y: 0, z: 0, w: Math.cos(Math.PI / 4) }).setFriction(0).setDensity(0),
    body,
  )
  body.setAdditionalMass(1.2, true)
  let slow = 0
  let peak = 0
  let end = body.translation()
  for (let s = 0; s < 60 * 14; s++) {
    const t = body.translation()
    const r = body.rotation()
    const yawNow = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.z * r.z))
    const fx = -Math.sin(yawNow), fz = -Math.cos(yawNow)
    const lv = body.linvel()
    const speed = Math.hypot(lv.x, lv.z)
    peak = Math.max(peak, t.y)
    if (s > 30 && speed < 0.4) slow += 1 / 60
    else slow = 0
    if (speed < 18) body.applyImpulse({ x: fx * 32 / 60, y: 0, z: fz * 32 / 60 }, true)
    const g = ahead(ramp, t.x, t.z)
    const diff = wrap(yawOf(g.x - t.x, g.z - t.z) - yawNow)
    body.setAngvel({ x: 0, y: 3.2 * Math.max(-1, Math.min(1, diff / 0.4)), z: 0 }, true)
    world.step()
    end = body.translation()
    if (slow > 2.2 && end.y < land.y - 1.5) return { ok: false, why: `stuck y=${end.y.toFixed(2)} r=${Math.hypot(end.x, end.z).toFixed(0)} slow ${slow.toFixed(1)}s` }
    if (end.y > land.y - 0.8 && Math.hypot(end.x - land.x, end.z - land.z) < 16) return { ok: true, why: `y=${end.y.toFixed(2)} peak ${peak.toFixed(2)}` }
  }
  return { ok: false, why: `timeout y=${end.y.toFixed(2)} r=${Math.hypot(end.x, end.z).toFixed(0)} peak ${peak.toFixed(2)}` }
}

for (const ramp of RAMPS) {
  for (const run of makeRuns(ramp)) {
    const r = drive(ramp, run)
    console.log(`drive ${ramp.deg}° ${run.name}: ${r.ok ? 'up' : 'FAIL'} ${r.why}`)
    ok(r.ok, `drive ${ramp.deg}° ${run.name} ${r.why}`)
  }
}

if (fail.length) {
  console.error(`\n${fail.length} failed`)
  for (const f of fail) console.error(' - ' + f)
  process.exit(1)
}
console.log('\nall ramp checks passed')
