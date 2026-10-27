/**
 * 匝道几何 + 无头物理：四条坡从坡脚（含外环两个方向）能开上桥，卡住计时满 2s 才复位。
 * 不进正式构建。运行：npx esbuild scripts/ramp-climb.ts --bundle --platform=node --format=esm --external:@dimforge/rapier3d-compat --outfile=node_modules/.cache/ramp-climb.mjs && node node_modules/.cache/ramp-climb.mjs
 */
import RAPIER from '@dimforge/rapier3d-compat'
import { ELEV_W, RAMPS, RING_FRAMES, frameAt, onSurface, sampleSurface, sectorOf, underRampMesh, yawOf, type Ramp } from '../src/data/expansionLayout'
import { roadClearance } from '../src/data/mapLayout'
import { GUIDE_HEX, rampCollider, rampGuideMesh } from '../src/data/rampSurface'
import { expansionStats, freshStuck, nearestDriveSpot, resetExpansionDrive, retreatSpot, stepStuck, expansionDriveStep } from '../src/components/expansionDrive'
import { setMobileInput } from '../src/hooks/useControls'
import * as THREE from 'three'

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
  const own = ramp.frames[ramp.deckOwn]
  const deckH = frameAt(own.theta).y
  ok(Math.abs(own.y - deckH) < 0.08, `ramp ${ramp.deg}° deckOwn y ${own.y.toFixed(3)} ring ${deckH.toFixed(3)}`)
  ok(underRampMesh(own.x, own.z), `ramp ${ramp.deg}° mesh should own the join`)
  let prevSl = 0
  let maxStep = 0
  for (let i = ramp.mouth + 1; i <= ramp.deckOwn; i++) {
    const a = ramp.frames[i - 1], b = ramp.frames[i]
    const ds = Math.hypot(b.x - a.x, b.z - a.z)
    const sl = Math.atan2(b.y - a.y, ds) * 180 / Math.PI
    if (i > ramp.mouth + 1) maxStep = Math.max(maxStep, Math.abs(sl - prevSl))
    prevSl = sl
  }
  ok(maxStep < 4, `ramp ${ramp.deg}° slope step ${maxStep.toFixed(2)}°`)
  if (maxStep >= 4) {
    for (let i = ramp.mouth + 2; i <= ramp.deckOwn; i++) {
      const a = ramp.frames[i - 1], b = ramp.frames[i]
      const ds = Math.hypot(b.x - a.x, b.z - a.z)
      const sl = Math.atan2(b.y - a.y, ds) * 180 / Math.PI
      const pa = ramp.frames[i - 2]
      const pds = Math.hypot(a.x - pa.x, a.z - pa.z)
      const psl = Math.atan2(a.y - pa.y, pds) * 180 / Math.PI
      if (Math.abs(sl - psl) > 10) console.log(`  kink ${ramp.deg}° i=${i} sl ${psl.toFixed(1)}→${sl.toFixed(1)} dy ${(b.y - a.y).toFixed(2)} ds ${ds.toFixed(2)} y ${a.y.toFixed(2)}→${b.y.toFixed(2)}`)
    }
  }
  for (let i = ramp.mouth; i <= ramp.deckOwn; i += 3) {
    const f = ramp.frames[i]
    const surf = sampleSurface(f.x, f.z, f.y + 0.25)
    ok(!!surf && onSurface(surf!, f.y + 0.25), `ramp ${ramp.deg}° not legal at i=${i} y=${f.y.toFixed(2)}`)
    ok(sectorOf(f.theta) >= 0 && sectorOf(f.theta) <= 7, `ramp ${ramp.deg}° sector`)
  }
  let wallIn = false
  let worst = 1e9
  let worstInfo = ''
  for (let i = 0; i < col.wall.v.length; i += 3) {
    const x = col.wall.v[i], y = col.wall.v[i + 1], z = col.wall.v[i + 2]
    let nearest = 1e9
    let half = 0
    let fy = 0
    let nk = -1
    for (let k = 0; k < ramp.frames.length - 1; k++) {
      const a = ramp.frames[k], b = ramp.frames[k + 1]
      const abx = b.x - a.x, abz = b.z - a.z
      const l2 = abx * abx + abz * abz || 1
      let t = ((x - a.x) * abx + (z - a.z) * abz) / l2
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t))
      if (d >= nearest) continue
      nearest = d
      half = ramp.halfW[k] + (ramp.halfW[k + 1] - ramp.halfW[k]) * t
      fy = a.y + (b.y - a.y) * t
      nk = k
    }
    const clearance = nearest - half
    // 只算会碰到车上的高度。高架护栏在平面上扫过贴地坡口，但底缘在车顶以上，不算侵入车道。
    const inTraffic = y > fy - 0.05 && y < fy + 1.15
    if (inTraffic && clearance < worst) {
      worst = clearance
      worstInfo = `k=${nk} d=${nearest.toFixed(2)} half=${half.toFixed(2)} wy=${y.toFixed(2)} fy=${fy.toFixed(2)} r=${Math.hypot(x, z).toFixed(1)}`
    }
    if (inTraffic && clearance < 0.45) wallIn = true
  }
  if (wallIn) console.log(`  rail ${ramp.deg}° clearance ${worst.toFixed(2)} ${worstInfo}`)
  ok(!wallIn, `ramp ${ramp.deg}° rail intrudes into the lane`)
  console.log(`ramp ${ramp.deg}° slope ${slope.toFixed(1)}° lip y ${lip.y.toFixed(2)} mouthW ${(ramp.halfW[ramp.mouth] * 2).toFixed(1)} step ${maxStep.toFixed(2)}° sector ${ramp.sector} deckTris ${col.deck.i.length / 3}`)
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

function ahead(ramp: Ramp, x: number, z: number, dir = 1) {
  const fs = ramp.frames
  let bestI = 0, bd = 1e9
  for (let i = 0; i < fs.length; i++) {
    const d = (fs[i].x - x) ** 2 + (fs[i].z - z) ** 2
    if (d < bd) { bd = d; bestI = i }
  }
  return fs[Math.max(0, Math.min(fs.length - 1, bestI + 4 * dir))]
}

const _dir = new THREE.Vector3()
const _aim = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _m = new THREE.Matrix4()
const _uy = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

function addDeckBoxes(world: RAPIER.World, around: number) {
  const hw = ELEV_W / 2
  for (let i = 0; i < RING_FRAMES.length - 1; i += 3) {
    const a = RING_FRAMES[i]
    const b = RING_FRAMES[Math.min(RING_FRAMES.length - 1, i + 3)]
    if (a.gap || b.gap) continue
    if (Math.abs(Math.atan2(Math.sin(a.theta - around), Math.cos(a.theta - around))) > 0.7) continue
    if (underRampMesh(a.x, a.z) || underRampMesh(b.x, b.z) || underRampMesh((a.x + b.x) / 2, (a.z + b.z) / 2)) continue
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
    const len = Math.hypot(dx, dy, dz)
    if (len < 0.35) continue
    _dir.set(dx, dy, dz).normalize()
    _aim.copy(_dir).negate()
    _m.lookAt(_aim, _dir, _up)
    _q.setFromRotationMatrix(_m)
    _uy.set(0, 1, 0).applyQuaternion(_q)
    const th = 0.16
    world.createCollider(RAPIER.ColliderDesc.cuboid(hw, th, len / 2 + 0.5).setTranslation(
      (a.x + b.x) / 2 - _uy.x * th, (a.y + b.y) / 2 - _uy.y * th, (a.z + b.z) / 2 - _uy.z * th,
    ).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }).setFriction(0))
  }
}

function makeCar(world: RAPIER.World, x: number, y: number, z: number, yaw: number) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setLinearDamping(1.2).setAngularDamping(4).setCanSleep(false),
  )
  body.setEnabledRotations(false, true, false, true)
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.55, 0.25, 1).setTranslation(0, 0.27, 0).setFriction(0).setDensity(0), body)
  world.createCollider(
    RAPIER.ColliderDesc.capsule(0.62, 0.35).setTranslation(0, 0.15, 0).setRotation({ x: Math.sin(Math.PI / 4), y: 0, z: 0, w: Math.cos(Math.PI / 4) }).setFriction(0).setDensity(0),
    body,
  )
  body.setAdditionalMass(1.2, true)
  return body
}

function worldFor(ramp: Ramp) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.createCollider(RAPIER.ColliderDesc.cuboid(600, 0.5, 600).setTranslation(0, -0.5, 0).setFriction(0.5))
  const col = rampCollider(ramp)
  const deck = RAPIER.ColliderDesc.trimesh(col.deck.v, col.deck.i, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
  if (!deck) return null
  deck.setFriction(0.85).setRestitution(0)
  world.createCollider(deck)
  if (col.wall.i.length) {
    const w = RAPIER.ColliderDesc.trimesh(col.wall.v, col.wall.i)
    if (w) world.createCollider(w.setFriction(0.15).setRestitution(0))
  }
  addDeckBoxes(world, ramp.landAng)
  return world
}

type Trace = { ok: boolean; why: string; min: number; drop: number; resets: number }

function steer(body: RAPIER.RigidBody, ramp: Ramp, world: RAPIER.World, dir = 1) {
  expansionDriveStep(body as never, 1 / 60, world as never)
  const t = body.translation()
  const r = body.rotation()
  const yawNow = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.z * r.z))
  const fx = -Math.sin(yawNow), fz = -Math.cos(yawNow)
  const lv = body.linvel()
  const speed = Math.hypot(lv.x, lv.z)
  if (speed < 18) body.applyImpulse({ x: fx * 32 / 60, y: 0, z: fz * 32 / 60 }, true)
  const g = ahead(ramp, t.x, t.z, dir)
  const diff = wrap(yawOf(g.x - t.x, g.z - t.z) - yawNow)
  body.setAngvel({ x: 0, y: 3.2 * Math.max(-1, Math.min(1, diff / 0.4)), z: 0 }, true)
  world.step()
  return { ...body.translation(), speed }
}

function drive(ramp: Ramp, run: Run): Trace {
  resetExpansionDrive()
  setMobileInput(1, 0)
  const world = worldFor(ramp)
  if (!world) return { ok: false, why: 'trimesh rejected', min: 0, drop: 0, resets: 0 }
  const land = ramp.frames[ramp.join]
  const body = makeCar(world, run.x, 0.7, run.z, run.yaw)
  let slow = 0
  let end = body.translation()
  const speeds: number[] = []
  let climbing = false
  for (let s = 0; s < 60 * 16; s++) {
    const p = steer(body, ramp, world)
    end = p
    if (s > 20 && p.speed < 0.4 && p.y < land.y - 1.5) slow += 1 / 60
    else slow = 0
    if (p.y > 1.2 && p.y < land.y - 0.6) {
      climbing = true
      if (s % 6 === 0) speeds.push(p.speed)
    }
    if (expansionStats.resets > 0) return { ok: false, why: `false reset y=${end.y.toFixed(2)} r=${Math.hypot(end.x, end.z).toFixed(0)} sector ${expansionStats.sectors} ${expansionStats.why}`, min: 0, drop: 0, resets: expansionStats.resets }
    if (slow > 2.2) return { ok: false, why: `stuck y=${end.y.toFixed(2)} r=${Math.hypot(end.x, end.z).toFixed(0)}`, min: 0, drop: 0, resets: 0 }
    if (end.y > land.y - 0.8 && Math.hypot(end.x - land.x, end.z - land.z) < 16) {
      const min = speeds.length ? Math.min(...speeds) : 0
      let drop = 0
      for (let i = 1; i < speeds.length; i++) drop = Math.max(drop, speeds[i - 1] - speeds[i])
      return { ok: true, why: `y=${end.y.toFixed(2)} vmin ${min.toFixed(1)} drop ${drop.toFixed(1)} sector ${expansionStats.sectors}`, min, drop, resets: 0 }
    }
  }
  return { ok: false, why: `timeout y=${end.y.toFixed(2)} r=${Math.hypot(end.x, end.z).toFixed(0)}`, min: 0, drop: 0, resets: expansionStats.resets }
}

function driveOnDeck(ramp: Ramp): Trace {
  resetExpansionDrive()
  setMobileInput(1, 0)
  const world = worldFor(ramp)
  if (!world) return { ok: false, why: 'trimesh rejected', min: 0, drop: 0, resets: 0 }
  const mouth = ramp.frames[ramp.mouth]
  const body = makeCar(world, mouth.x, 0.85, mouth.z, yawOf(mouth.tx, mouth.tz))
  const land = ramp.frames[ramp.join]
  const own = ramp.frames[ramp.deckOwn]
  let phase: 'up' | 'along' = 'up'
  let along = 0
  let prev = { x: mouth.x, z: mouth.z }
  const speeds: number[] = []
  for (let s = 0; s < 60 * 22; s++) {
    const p = steer(body, ramp, world)
    if (expansionStats.resets > 0) return { ok: false, why: `false reset at y=${p.y.toFixed(2)} phase ${phase} sector ${expansionStats.sectors}`, min: 0, drop: 0, resets: expansionStats.resets }
    if (phase === 'up' && p.y > land.y - 0.8 && Math.hypot(p.x - land.x, p.z - land.z) < 18) {
      phase = 'along'
      if (expansionStats.sectors < 0) return { ok: false, why: `sector ${expansionStats.sectors}`, min: 0, drop: 0, resets: expansionStats.resets }
    }
    if (phase === 'along') {
      along += Math.hypot(p.x - prev.x, p.z - prev.z)
      if (s % 6 === 0) speeds.push(p.speed)
      if (along > 52 && p.y > own.y - 0.8 && expansionStats.sectors >= 0) {
        const min = speeds.length ? Math.min(...speeds) : 0
        let drop = 0
        for (let i = 1; i < speeds.length; i++) drop = Math.max(drop, speeds[i - 1] - speeds[i])
        return { ok: true, why: `along ${along.toFixed(0)}m y=${p.y.toFixed(2)} sector ${expansionStats.sectors} vmin ${min.toFixed(1)} drop ${drop.toFixed(1)}`, min, drop, resets: 0 }
      }
    }
    prev = p
  }
  return { ok: false, why: `timeout phase ${phase} along ${along.toFixed(0)} y=${body.translation().y.toFixed(2)} sector ${expansionStats.sectors}`, min: 0, drop: 0, resets: expansionStats.resets }
}

function driveDown(ramp: Ramp): Trace {
  resetExpansionDrive()
  setMobileInput(1, 0)
  const world = worldFor(ramp)
  if (!world) return { ok: false, why: 'trimesh rejected', min: 0, drop: 0, resets: 0 }
  const own = ramp.frames[Math.min(ramp.frames.length - 1, ramp.deckOwn - 4)]
  const back = yawOf(-own.tx, -own.tz)
  const body = makeCar(world, own.x, own.y + 0.45, own.z, back)
  const speeds: number[] = []
  let end = body.translation()
  for (let s = 0; s < 60 * 18; s++) {
    const p = steer(body, ramp, world, -1)
    end = p
    if (expansionStats.resets > 0) return { ok: false, why: `false reset y=${p.y.toFixed(2)} r=${Math.hypot(p.x, p.z).toFixed(0)} ${expansionStats.why}`, min: 0, drop: 0, resets: expansionStats.resets }
    if (p.y < own.y - 0.4 && p.y > 1.2 && s % 6 === 0) speeds.push(p.speed)
    if (p.y < 1.1 && Math.hypot(p.x, p.z) < 236) {
      const min = speeds.length ? Math.min(...speeds) : 0
      let drop = 0
      for (let i = 1; i < speeds.length; i++) drop = Math.max(drop, speeds[i - 1] - speeds[i])
      return { ok: true, why: `down y=${p.y.toFixed(2)} vmin ${min.toFixed(1)} drop ${drop.toFixed(1)} sector ${expansionStats.sectors}`, min, drop, resets: 0 }
    }
  }
  return { ok: false, why: `timeout y=${end.y.toFixed(2)} r=${Math.hypot(end.x, end.z).toFixed(0)}`, min: 0, drop: 0, resets: expansionStats.resets }
}

for (const ramp of RAMPS) {
  for (const run of makeRuns(ramp)) {
    const r = drive(ramp, run)
    console.log(`drive ${ramp.deg}° ${run.name}: ${r.ok ? 'up' : 'FAIL'} ${r.why}`)
    ok(r.ok, `drive ${ramp.deg}° ${run.name} ${r.why}`)
    if (r.ok && run.name === 'center') ok(r.min > 6 && r.drop < 4, `up speed ${ramp.deg}° min ${r.min.toFixed(1)} drop ${r.drop.toFixed(1)}`)
  }
  const along = driveOnDeck(ramp)
  console.log(`deck ${ramp.deg}°: ${along.ok ? '50m' : 'FAIL'} ${along.why}`)
  ok(along.ok, `deck ${ramp.deg}° ${along.why}`)
  if (along.ok) ok(along.min > 8 && along.drop < 3.5, `deck speed ${ramp.deg}° min ${along.min.toFixed(1)} drop ${along.drop.toFixed(1)}`)
  const down = driveDown(ramp)
  console.log(`down ${ramp.deg}°: ${down.ok ? 'down' : 'FAIL'} ${down.why}`)
  ok(down.ok, `down ${ramp.deg}° ${down.why}`)
  if (down.ok) ok(down.min > 6 && down.drop < 4, `down speed ${ramp.deg}° min ${down.min.toFixed(1)} drop ${down.drop.toFixed(1)}`)
}

if (fail.length) {
  console.error(`\n${fail.length} failed`)
  for (const f of fail) console.error(' - ' + f)
  process.exit(1)
}
console.log('\nall ramp checks passed')
