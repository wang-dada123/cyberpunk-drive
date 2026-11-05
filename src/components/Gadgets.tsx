import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useAfterPhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { carPose } from './Car'
import { portPool, restorePortProps, shovePortProps } from './PortDistrict'
import {
  COLD, DECK, DIM, DOOR, DYNAMIC_TOTAL, FEST_AT, FEST_PORT_FROM, GARAGE_N, GATE, ICE, JUMP, LIGHTS, LIGHT_N,
  PIPES, SHOWCASE, STALLS, STALL_HIT, STALL_N, STEEL,
  bitCount, e8Beacon, garageBoxPos, garageSector, inGate, lightIndexNear, onE8, onS2, roofPoint, s1Points, s2Marks,
  stallSector, withFlag, withLight, withStall,
} from '../data/gadgets'
import { getProgress, resetProgress, setProgress } from '../utils/progressStore'
import { tickCard } from '../utils/lightCard'

/**
 * C8 机关 / 收集灰模。触发看车体位置，键盘和摇杆都能开。
 * 动态刚体只在所在扇区启用。不改高架护栏、复位、匝道，也不开 Bloom。
 */
export const gadgetStats = { dynamic: DYNAMIC_TOTAL, awake: 1, sector: 'idle' }

const stallBodies: (RapierRigidBody | null)[] = []
const garageBodies: (RapierRigidBody | null)[] = []
let stallOn = true
let garageOn = true
let festLeft = 0
let portLeft = 0
let festPlayed = bitCount(getProgress().stalls, STALL_N) === STALL_N
let portPlayed = getProgress().port === 1
const GARAGE_POS = Array.from({ length: GARAGE_N }, (_, i) => garageBoxPos(i))

const vcMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
const iceMat = new THREE.MeshBasicMaterial({ color: ICE, toneMapped: false })
const dimMat = new THREE.MeshBasicMaterial({ color: DIM, toneMapped: false })
const ringMat = new THREE.MeshBasicMaterial({ color: DIM, toneMapped: false })
const doorMat = new THREE.MeshBasicMaterial({ color: STEEL, toneMapped: false })
const festMat = new THREE.MeshBasicMaterial({ color: ICE, toneMapped: false })
const offCol = new THREE.Color(DIM)
const onCol = new THREE.Color(COLD)
const iceCol = new THREE.Color(ICE)

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

function pushBox(pos: number[], col: number[], idx: number[], c: [number, number, number], size: [number, number, number], ry: number, hex: string, rz = 0) {
  const color = new THREE.Color(hex)
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2]
  const base = pos.length / 3
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const cz = Math.cos(rz)
  const sz = Math.sin(rz)
  for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) {
    const x1 = x * cz + y * sz
    const y1 = y * cz - x * sz
    const x2 = x1 * cy + z * sy
    const z2 = z * cy - x1 * sy
    pos.push(c[0] + x2, c[1] + y1, c[2] + z2)
    col.push(color.r, color.g, color.b)
  }
  const faces = [[0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5], [0, 2, 6, 4], [1, 5, 7, 3]]
  for (const f of faces) idx.push(base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3])
}

function rampPose() {
  const { x0, x1, y0, y1, z, w } = JUMP
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const nx = dy / len
  const ny = -dx / len
  return {
    len,
    ang: Math.atan2(dy, dx),
    w,
    cx: (x0 + x1) / 2 - nx * 0.14,
    cy: (y0 + y1) / 2 - ny * 0.14,
    cz: z,
  }
}

function buildStatic() {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const gateY = 2.7
  for (const side of [-1, 1]) {
    pushBox(pos, col, idx, [side * (GATE.halfGap + 0.45), gateY, GATE.z], [0.7, 5.4, 0.7], 0, STEEL)
  }
  pushBox(pos, col, idx, [0, 5.25, GATE.z], [GATE.halfGap * 2 + 1.8, 0.28, 0.5], 0, ICE)
  for (const pipe of PIPES) pushBox(pos, col, idx, [pipe.x, 3.25, pipe.z], [0.22, 0.22, pipe.len], pipe.ry, STEEL)
  const ramp = rampPose()
  pushBox(pos, col, idx, [ramp.cx, ramp.cy, ramp.cz], [ramp.len, 0.28, ramp.w], 0, DECK, ramp.ang)
  const d = JUMP.deck
  const dx0 = Math.min(d.x0, d.x1)
  const dx1 = Math.max(d.x0, d.x1)
  const dz0 = Math.min(d.z0, d.z1)
  const dz1 = Math.max(d.z0, d.z1)
  pushBox(pos, col, idx, [(dx0 + dx1) / 2, d.y - 0.14, (dz0 + dz1) / 2], [dx1 - dx0, 0.28, dz1 - dz0], 0, DECK)
  for (const [x, z] of [[dx0 + 0.5, dz0 + 0.45], [dx0 + 0.5, dz1 - 0.45]] as const) {
    pushBox(pos, col, idx, [x, d.y / 2, z], [0.42, d.y, 0.42], 0, STEEL)
  }
  const s1 = s1Points()
  for (let i = 0; i < s1.length - 1; i++) {
    const a = s1[i]
    const b = s1[i + 1]
    const sx = b[0] - a[0]
    const sz = b[1] - a[1]
    const len = Math.hypot(sx, sz)
    if (len < 0.2) continue
    const ry = Math.atan2(sx, sz)
    pushBox(pos, col, idx, [(a[0] + b[0]) / 2, 0.06, (a[1] + b[1]) / 2], [7.2, 0.08, len], ry, DECK)
    if (i % 5 === 0) pushBox(pos, col, idx, [(a[0] + b[0]) / 2, 2.65, (a[1] + b[1]) / 2], [7.6, 0.16, 0.4], ry, ICE)
  }
  const mouth = s1[0]
  const nxt = s1[1]
  const mx = nxt[0] - mouth[0]
  const mz = nxt[1] - mouth[1]
  const ml = Math.hypot(mx, mz) || 1
  const mry = Math.atan2(mx, mz)
  const px = mz / ml
  const pz = -mx / ml
  for (const side of [-1, 1]) {
    pushBox(pos, col, idx, [mouth[0] + px * side * 4.2, 1.7, mouth[1] + pz * side * 4.2], [0.45, 3.4, 0.45], mry, ICE)
  }
  pushBox(pos, col, idx, [mouth[0], 3.35, mouth[1]], [8.6, 0.22, 0.4], mry, ICE)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

function live(b: RapierRigidBody | null) {
  if (!b) return false
  try { return b.isValid() } catch { return false }
}

function setBodies(list: (RapierRigidBody | null)[], on: boolean) {
  for (const b of list) {
    if (!live(b) || !b) continue
    if (b.isEnabled() !== on) b.setEnabled(on)
  }
}

function awakeCount(list: (RapierRigidBody | null)[]) {
  let n = 0
  for (const b of list) {
    if (!live(b) || !b || !b.isEnabled() || b.isSleeping()) continue
    n++
  }
  return n
}

function parkBody(b: RapierRigidBody | null, x: number, y: number, z: number) {
  if (!live(b) || !b) return
  b.setTranslation({ x, y, z }, true)
  b.setLinvel({ x: 0, y: 0, z: 0 }, true)
  b.setAngvel({ x: 0, y: 0, z: 0 }, true)
  b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
}

function restoreGadgets() {
  resetProgress()
  festPlayed = false
  portPlayed = false
  festLeft = 0
  portLeft = 0
  STALLS.forEach((s, i) => parkBody(stallBodies[i], s.x, s.y, s.z))
  GARAGE_POS.forEach((s, i) => parkBody(garageBodies[i], s.x, s.y, s.z))
  restorePortProps()
}

function shoveBody(b: RapierRigidBody | null, x: number, y: number, z: number) {
  if (!live(b) || !b) return
  b.setEnabled(true)
  b.setTranslation({ x, y, z }, true)
  b.setLinvel({ x: 0.4, y: 0.8, z: 0.2 }, true)
  b.setAngvel({ x: 1.6, y: 0.3, z: 0.4 }, true)
}

export function Gadgets() {
  const staticGeo = useMemo(buildStatic, [])
  const ramp = useMemo(rampPose, [])
  const deck = JUMP.deck
  const dx0 = Math.min(deck.x0, deck.x1)
  const dx1 = Math.max(deck.x0, deck.x1)
  const dz0 = Math.min(deck.z0, deck.z1)
  const dz1 = Math.max(deck.z0, deck.z1)
  const beacon = e8Beacon()
  const dashes = useMemo(s2Marks, [])
  const orbRef = useRef<THREE.InstancedMesh>(null)
  const stallRef = useRef<THREE.InstancedMesh>(null)
  const lanternRef = useRef<THREE.InstancedMesh>(null)
  const garageRef = useRef<THREE.InstancedMesh>(null)
  const festRef = useRef<THREE.InstancedMesh>(null)
  const markRef = useRef<THREE.InstancedMesh>(null)
  const doorRef = useRef<THREE.Mesh>(null)
  const doorBody = useRef<RapierRigidBody>(null)

  useLayoutEffect(() => {
    const paint = (im: THREE.InstancedMesh | null, n: number, at: (i: number) => { x: number; y: number; z: number; s?: number }) => {
      if (!im) return
      for (let i = 0; i < n; i++) {
        const p = at(i)
        _s.set(p.s ?? 1, p.s ?? 1, p.s ?? 1)
        _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s)
        im.setMatrixAt(i, _m)
        im.setColorAt(i, iceCol)
      }
      im.instanceMatrix.needsUpdate = true
      if (im.instanceColor) im.instanceColor.needsUpdate = true
      im.computeBoundingSphere()
    }
    paint(orbRef.current, LIGHT_N, (i) => LIGHTS[i])
    paint(stallRef.current, STALL_N, (i) => ({ ...STALLS[i], s: 1 }))
    paint(lanternRef.current, STALL_N, (i) => ({ x: STALLS[i].x, y: STALLS[i].y + 0.85, z: STALLS[i].z }))
    paint(garageRef.current, GARAGE_N, (i) => garageBoxPos(i))
    paint(festRef.current, FEST_AT.length, (i) => FEST_AT[i])
    paint(markRef.current, 1 + dashes.length, (i) => (i === 0 ? beacon : dashes[i - 1]))
  }, [beacon, dashes])

  // 扇区开关放在渲染帧。物理步回调里 setEnabled 会锁死车的转向轴。
  useFrame(() => {
    const { x, z } = carPose.position
    const stallWant = stallSector(x, z)
    if (stallWant !== stallOn) { stallOn = stallWant; setBodies(stallBodies, stallWant) }
    const garageWant = garageSector(x, z)
    if (garageWant !== garageOn) { garageOn = garageWant; setBodies(garageBodies, garageWant) }
  })
  useAfterPhysicsStep(() => {
    const { x, y, z } = carPose.position
    let next = getProgress()
    const li = lightIndexNear(x, y, z)
    if (li >= 0) next = withLight(next, li)
    tickCard(li, (i) => (LIGHTS[i].x - x) ** 2 + (LIGHTS[i].z - z) ** 2)
    if (inGate(x, y, z)) next = withFlag(next, 'gate')
    if (onE8(x, y, z)) next = withFlag(next, 'e8')
    if (onS2(x, y, z)) next = withFlag(next, 's2')
    for (let i = 0; i < STALL_N; i++) {
      const b = stallBodies[i]
      if (!live(b) || !b) continue
      const t = b.translation()
      const s = STALLS[i]
      if ((t.x - s.x) ** 2 + (t.z - s.z) ** 2 > STALL_HIT * STALL_HIT) next = withStall(next, i)
    }
    if (portPool.total > 0 && portPool.displaced >= portPool.total) next = withFlag(next, 'port')
    if (next !== getProgress()) setProgress(next)

    const stallWant = stallSector(x, z)
    const garageWant = garageSector(x, z)
    const sector = stallWant ? 'ai' : garageWant ? 'garage' : Math.hypot(x, z) > 200 ? 'outer' : 'city'
    gadgetStats.sector = sector
    gadgetStats.awake = 1 + portPool.awake + awakeCount(stallBodies) + awakeCount(garageBodies)
    gadgetStats.dynamic = DYNAMIC_TOTAL
  })

  useFrame((_, dt) => {
    const p = getProgress()
    const lit = bitCount(p.lights, LIGHT_N) === LIGHT_N
    ringMat.color.copy(lit ? onCol : offCol)
    if (lit) ringMat.color.lerp(iceCol, 0.25)
    doorMat.color.copy(p.gate ? iceCol : offCol)
    const door = doorRef.current
    if (door) {
      const target = p.gate ? DOOR.x + 3.3 : DOOR.x
      door.position.x = THREE.MathUtils.damp(door.position.x, target, 8, dt)
    }
    const body = doorBody.current
    if (live(body) && body) {
      const want = p.gate !== 1
      if (body.isEnabled() !== want) body.setEnabled(want)
    }

    const stallDone = bitCount(p.stalls, STALL_N) === STALL_N
    if (stallDone && !festPlayed) { festPlayed = true; festLeft = 8 }
    if (!stallDone) { festPlayed = false; festLeft = 0 }
    if (p.port && !portPlayed) { portPlayed = true; portLeft = 8 }
    if (!p.port) { portPlayed = false; portLeft = 0 }
    if (festLeft > 0) festLeft = Math.max(0, festLeft - dt)
    if (portLeft > 0) portLeft = Math.max(0, portLeft - dt)

    const orbs = orbRef.current
    if (orbs) {
      const t = performance.now() * 0.001
      for (let i = 0; i < LIGHT_N; i++) {
        const got = (p.lights & (1 << i)) !== 0
        const src = LIGHTS[i]
        const bob = got ? 0 : Math.sin(t * 2 + i) * 0.12
        _s.setScalar(got ? 0.001 : 1)
        _m.compose(_p.set(src.x, src.y + bob, src.z), _q.identity(), _s)
        orbs.setMatrixAt(i, _m)
      }
      orbs.instanceMatrix.needsUpdate = true
    }

    const paintDyn = (im: THREE.InstancedMesh | null, list: (RapierRigidBody | null)[], fallback: { x: number; y: number; z: number }[], sc: number) => {
      if (!im) return
      for (let i = 0; i < list.length; i++) {
        const b = list[i]
        const src = fallback[i]
        if (live(b) && b) {
          const t = b.translation()
          const r = b.rotation()
          _q.set(r.x, r.y, r.z, r.w)
          _p.set(t.x, t.y, t.z)
        } else {
          _q.identity()
          _p.set(src.x, src.y, src.z)
        }
        _s.setScalar(sc)
        _m.compose(_p, _q, _s)
        im.setMatrixAt(i, _m)
      }
      im.instanceMatrix.needsUpdate = true
    }
    paintDyn(stallRef.current, stallBodies, STALLS, 1)
    const lantern = lanternRef.current
    if (lantern) {
      for (let i = 0; i < STALL_N; i++) {
        const b = stallBodies[i]
        const src = STALLS[i]
        if (live(b) && b) {
          const t = b.translation()
          const r = b.rotation()
          _q.set(r.x, r.y, r.z, r.w)
          _p.set(0, 0.85, 0).applyQuaternion(_q)
          _p.x += t.x
          _p.y += t.y
          _p.z += t.z
        } else {
          _q.identity()
          _p.set(src.x, src.y + 0.85, src.z)
        }
        _s.set(0.32, 0.42, 0.32)
        _m.compose(_p, _q, _s)
        lantern.setMatrixAt(i, _m)
      }
      lantern.instanceMatrix.needsUpdate = true
    }
    paintDyn(garageRef.current, garageBodies, GARAGE_POS, 0.72)

    const fest = festRef.current
    if (fest) {
      const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.008)
      for (let i = 0; i < FEST_AT.length; i++) {
        const src = FEST_AT[i]
        const carnival = i < FEST_PORT_FROM
        const on = carnival ? stallDone : p.port === 1
        const hot = carnival ? festLeft > 0 : portLeft > 0
        const sc = on ? src.s * (hot ? pulse : 0.8) : 0.001
        _s.setScalar(sc)
        _m.compose(_p.set(src.x, src.y, src.z), _q.identity(), _s)
        fest.setMatrixAt(i, _m)
        fest.setColorAt(i, hot ? onCol : iceCol)
      }
      fest.instanceMatrix.needsUpdate = true
      if (fest.instanceColor) fest.instanceColor.needsUpdate = true
    }

    const marks = markRef.current
    if (marks) {
      const spots = [beacon, ...dashes]
      for (let i = 0; i < spots.length; i++) {
        const src = spots[i]
        const unlocked = i === 0 ? p.e8 === 1 : p.s2 === 1
        if (i === 0) _s.set(0.7, 1.4, 0.7)
        else _s.set(1.8, 0.22, 0.55)
        _m.compose(_p.set(src.x, src.y, src.z), _q.identity(), _s)
        marks.setMatrixAt(i, _m)
        marks.setColorAt(i, unlocked ? onCol : offCol)
      }
      marks.instanceMatrix.needsUpdate = true
      if (marks.instanceColor) marks.instanceColor.needsUpdate = true
    }
  })

  useLayoutEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as Window & {
      __car?: RapierRigidBody
      __gadget?: Record<string, unknown>
    }
    w.__gadget = {
      reset: restoreGadgets,
      progress: getProgress,
      stats: gadgetStats,
      place(x: number, y: number, z: number, yaw = 0) {
        const rb = w.__car
        if (!rb) return false
        rb.setTranslation({ x, y, z }, true)
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
        const h = yaw * 0.5
        rb.setRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) }, true)
        return true
      },
      shoveStall(i: number) {
        const s = STALLS[i]
        shoveBody(stallBodies[i], s.x, s.y + 0.4, s.z - 2.4)
      },
      shoveGarage(i: number) {
        const s = garageBoxPos(i)
        shoveBody(garageBodies[i], s.x + 1.6, s.y + 0.3, s.z)
      },
      shovePort: shovePortProps,
      anchors: {
        lights: LIGHTS,
        stalls: STALLS,
        gate: GATE,
        door: DOOR,
        jump: JUMP,
        showcase: SHOWCASE,
        roof: roofPoint(),
        beacon: e8Beacon(),
        s1: s1Points(),
        garage: GARAGE_POS,
        portLight: FEST_AT[FEST_PORT_FROM],
      },
    }
  }, [])

  const cols: [number, number][] = [[dx0 + 0.5, dz0 + 0.45], [dx0 + 0.5, dz1 - 0.45]]
  return (
    <group name="c8-gadgets" userData={{ dynamic: true }}>
      <mesh geometry={staticGeo} material={vcMat} />
      <mesh position={[SHOWCASE.x, SHOWCASE.y, SHOWCASE.z]} material={ringMat}>
        <torusGeometry args={[SHOWCASE.r, SHOWCASE.tube, 6, 24]} />
      </mesh>
      <instancedMesh ref={orbRef} args={[undefined, undefined, LIGHT_N]} material={iceMat} frustumCulled={false}>
        <octahedronGeometry args={[0.42]} />
      </instancedMesh>
      <instancedMesh ref={stallRef} args={[undefined, undefined, STALL_N]} material={dimMat} frustumCulled={false}>
        <boxGeometry args={[1.35, 0.85, 1.05]} />
      </instancedMesh>
      <instancedMesh ref={lanternRef} args={[undefined, undefined, STALL_N]} material={iceMat} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={garageRef} args={[undefined, undefined, GARAGE_N]} material={dimMat} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={festRef} args={[undefined, undefined, FEST_AT.length]} material={festMat} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={markRef} args={[undefined, undefined, 1 + dashes.length]} material={festMat} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <mesh ref={doorRef} position={[DOOR.x, DOOR.y, DOOR.z]} material={doorMat}>
        <boxGeometry args={[DOOR.w, DOOR.h, DOOR.d]} />
      </mesh>

      <RigidBody type="fixed" colliders={false}>
        {[-1, 1].map((side) => (
          <CuboidCollider key={side} args={[0.35, 2.7, 0.35]} position={[side * (GATE.halfGap + 0.45), 2.7, GATE.z]} />
        ))}
        <CuboidCollider args={[ramp.len / 2, 0.14, ramp.w / 2]} position={[ramp.cx, ramp.cy, ramp.cz]} rotation={[0, 0, ramp.ang]} />
        <CuboidCollider args={[(dx1 - dx0) / 2, 0.14, (dz1 - dz0) / 2]} position={[(dx0 + dx1) / 2, deck.y - 0.14, (dz0 + dz1) / 2]} />
        {cols.map(([x, z]) => <CuboidCollider key={`${x},${z}`} args={[0.21, deck.y / 2, 0.21]} position={[x, deck.y / 2, z]} />)}
      </RigidBody>
      <RigidBody ref={doorBody} type="fixed" colliders={false} position={[DOOR.x, DOOR.y, DOOR.z]}>
        <CuboidCollider args={[DOOR.w / 2, DOOR.h / 2, DOOR.d / 2]} />
      </RigidBody>
      {STALLS.map((s, i) => (
        <RigidBody
          key={`stall${i}`}
          ref={(b) => { stallBodies[i] = b }}
          position={[s.x, s.y, s.z]}
          colliders={false}
          mass={0.42}
          linearDamping={1.6}
          angularDamping={2.2}
          canSleep
        >
          <CuboidCollider args={[0.68, 0.42, 0.52]} friction={0.6} />
        </RigidBody>
      ))}
      {Array.from({ length: GARAGE_N }, (_, i) => garageBoxPos(i)).map((s, i) => (
        <RigidBody
          key={`gbox${i}`}
          ref={(b) => { garageBodies[i] = b }}
          position={[s.x, s.y, s.z]}
          colliders={false}
          mass={0.36}
          linearDamping={1.8}
          angularDamping={2.2}
          canSleep
        >
          <CuboidCollider args={[0.36, 0.36, 0.36]} friction={0.65} />
        </RigidBody>
      ))}
    </group>
  )
}
