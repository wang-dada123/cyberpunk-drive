import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody, useAfterPhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import {
  CRATES, CRATE_SIZE, PORT_BASIS, PORT_LEN, PORT_RY, PORT_WID, PORT_Y, YARD_PROPS,
  dockLocal, portWorld,
} from '../data/expansionLayout'

/**
 * C7 工业港区白模。冷灰钢蓝，不做吊桥。
 * 集装箱 4 种 InstancedMesh，相机距堆场中心 >80m 整组关掉。
 * 可撞纸箱 / 油桶对象池（本场景 28 个，上限 40），睡着不算持续活跃。
 */
// 白模走不受夜光压黑的冷灰钢蓝。冰蓝只留在门梁和吊灯，不当成另一套霓虹。
const padMat = new THREE.MeshBasicMaterial({ color: '#3A4C5C' })
const dockMat = new THREE.MeshBasicMaterial({ color: '#465A6C' })
const steelMat = new THREE.MeshBasicMaterial({ color: '#5A6E80' })
const waterMat = new THREE.MeshStandardMaterial({ color: '#0C141C', roughness: 0.35, metalness: 0.4 })
const crateMat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true })
const boxMat = new THREE.MeshBasicMaterial({ color: '#6E675C' })
const barrelMat = new THREE.MeshBasicMaterial({ color: '#4A5966' })
const iceMat = new THREE.MeshBasicMaterial({ color: '#4FC3F7', toneMapped: false })

const CRATE_COLOR = ['#3E5160', '#4A6072', '#354858', '#516474'].map((h) => new THREE.Color(h))
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3(1, 1, 1)
const _e = new THREE.Euler()

const center = portWorld(PORT_LEN / 2, 0)
const mazeCenter = portWorld(62, 46)

type Placed = { x: number; y: number; z: number; ry: number; sx: number; sy: number; sz: number; k: number }

function placedCrates(): Placed[] {
  return CRATES.map((c) => {
    const [sx, sy, sz] = CRATE_SIZE[c.k]
    const [x, z] = portWorld(c.u, c.v)
    return { x, y: PORT_Y + sy / 2, z, ry: PORT_RY + c.ry, sx, sy, sz, k: c.k }
  })
}

function ribbon(pts: { x: number; z: number; px: number; pz: number }[], hw: number, y: number) {
  const pos: number[] = []
  const idx: number[] = []
  for (const p of pts) {
    pos.push(p.x + p.px * hw, y, p.z + p.pz * hw, p.x - p.px * hw, y, p.z - p.pz * hw)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function dockGeo() {
  const raw = dockLocal()
  const pts = raw.map((p, i) => {
    const [x, z] = portWorld(p.u, p.v)
    const n = raw[Math.min(raw.length - 1, i + 1)]
    const p0 = raw[Math.max(0, i - 1)]
    const [x1, z1] = portWorld(n.u, n.v)
    const [x0, z0] = portWorld(p0.u, p0.v)
    let tx = x1 - x0
    let tz = z1 - z0
    const l = Math.hypot(tx, tz) || 1
    tx /= l
    tz /= l
    return { x, z, px: tz, pz: -tx }
  })
  return ribbon(pts, 5, PORT_Y + 0.045)
}

function craneGeo() {
  const [x, z] = portWorld(PORT_LEN - 22, -PORT_WID / 2 + 14)
  const yaw = PORT_RY
  const boxes: { c: [number, number, number]; s: [number, number, number] }[] = [
    { c: [0, 16, 0], s: [2.2, 32, 2.2] },
    { c: [0, 31.2, 10], s: [1.6, 1.4, 28] },
    { c: [0, 30.2, -6], s: [2.4, 2.2, 6] },
    { c: [0, 8, 2.2], s: [3.2, 1.2, 3.2] },
    { c: [0, 30.6, 20], s: [0.4, 8, 0.4] },
  ]
  const pos: number[] = []
  const idx: number[] = []
  const cs = Math.cos(yaw)
  const sn = Math.sin(yaw)
  for (const b of boxes) {
    const hx = b.s[0] / 2
    const hy = b.s[1] / 2
    const hz = b.s[2] / 2
    const base = pos.length / 3
    for (const lx of [-hx, hx]) for (const ly of [-hy, hy]) for (const lz of [-hz, hz]) {
      const wx = x + (b.c[0] + lx) * cs + (b.c[2] + lz) * sn
      const wz = z - (b.c[0] + lx) * sn + (b.c[2] + lz) * cs
      pos.push(wx, b.c[1] + ly, wz)
    }
    const faces = [[0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5], [0, 2, 6, 4], [1, 5, 7, 3]]
    for (const f of faces) idx.push(base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return { g, x, z }
}

function Water() {
  const east = portWorld(PORT_LEN * 0.55, -PORT_WID / 2 - 28)
  const out = portWorld(PORT_LEN + 26, -10)
  return (
    <>
      <mesh position={[east[0], -0.35, east[1]]} rotation={[0, PORT_RY, 0]} material={waterMat}>
        <boxGeometry args={[70, 0.4, PORT_LEN * 0.85]} />
      </mesh>
      <mesh position={[out[0], -0.35, out[1]]} rotation={[0, PORT_RY, 0]} material={waterMat}>
        <boxGeometry args={[PORT_WID + 40, 0.4, 48]} />
      </mesh>
    </>
  )
}

function Crates({ list }: { list: Placed[] }) {
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  const buckets = useMemo(() => {
    const b: Placed[][] = [[], [], [], []]
    for (const c of list) b[c.k].push(c)
    return b
  }, [list])
  useLayoutEffect(() => {
    buckets.forEach((items, k) => {
      const im = refs.current[k]
      if (!im) return
      items.forEach((c, i) => {
        _q.setFromEuler(_e.set(0, c.ry, 0))
        _m.compose(_p.set(c.x, c.y, c.z), _q, _s)
        im.setMatrixAt(i, _m)
        im.setColorAt(i, CRATE_COLOR[k])
      })
      im.instanceMatrix.needsUpdate = true
      if (im.instanceColor) im.instanceColor.needsUpdate = true
      im.computeBoundingSphere()
    })
  }, [buckets])
  const shown = useRef(true)
  const root = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    const g = root.current
    if (!g) return
    const d = Math.hypot(camera.position.x - mazeCenter[0], camera.position.z - mazeCenter[1])
    const next = shown.current ? d < 92 : d < 78
    if (next !== shown.current) { shown.current = next; g.visible = next }
  })
  return (
    <group ref={root}>
      {buckets.map((items, k) => items.length > 0 && (
        <instancedMesh key={k} ref={(el) => { refs.current[k] = el }} args={[undefined, undefined, items.length]} material={crateMat} frustumCulled>
          <boxGeometry args={[CRATE_SIZE[k][0], CRATE_SIZE[k][1], CRATE_SIZE[k][2]]} />
        </instancedMesh>
      ))}
    </group>
  )
}

function PropPool() {
  const bodies = useRef<(RapierRigidBody | null)[]>([])
  const boxMesh = useRef<THREE.InstancedMesh>(null)
  const barMesh = useRef<THREE.InstancedMesh>(null)
  const { placed, boxes, barrels, boxCount } = useMemo(() => {
    const all = YARD_PROPS.map((p) => {
      const [x, z] = portWorld(p.u, p.v)
      const h = p.kind === 'box' ? 0.42 : 0.48
      return { x, y: PORT_Y + h, z, yaw: p.yaw, kind: p.kind }
    })
    return {
      placed: all,
      boxes: all.filter((p) => p.kind === 'box'),
      barrels: all.filter((p) => p.kind === 'barrel'),
      boxCount: all.filter((p) => p.kind === 'box').length,
    }
  }, [])
  const paint = (im: THREE.InstancedMesh | null, list: { x: number; y: number; z: number; yaw: number }[], from: number) => {
    if (!im) return
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      const b = bodies.current[from + i]
      // 刚体在 effect 创建、在 cleanup 里摘掉，但 ref 不会被清成 null。
      // layout / 下一步还会读到已释放的句柄，translation() 会直接把 wasm 打崩。
      let live = false
      if (b) {
        try { live = b.isValid() } catch { live = false }
      }
      if (live && b) {
        const t = b.translation()
        const r = b.rotation()
        _q.set(r.x, r.y, r.z, r.w)
        _p.set(t.x, t.y, t.z)
      } else {
        _q.setFromEuler(_e.set(0, p.yaw, 0))
        _p.set(p.x, p.y, p.z)
      }
      _m.compose(_p, _q, _s)
      im.setMatrixAt(i, _m)
    }
    im.instanceMatrix.needsUpdate = true
  }
  useLayoutEffect(() => {
    paint(boxMesh.current, boxes, 0)
    paint(barMesh.current, barrels, boxCount)
  }, [boxes, barrels, boxCount])
  useAfterPhysicsStep(() => {
    paint(boxMesh.current, boxes, 0)
    paint(barMesh.current, barrels, boxCount)
  })
  return (
    <group userData={{ dynamic: true }}>
      {placed.map((p, i) => (
        <RigidBody
          key={i}
          ref={(b) => { bodies.current[i] = b }}
          position={[p.x, p.y, p.z]}
          rotation={[0, p.yaw, 0]}
          colliders={false}
          mass={0.28}
          linearDamping={2.4}
          angularDamping={2.4}
          canSleep
        >
          {p.kind === 'box'
            ? <CuboidCollider args={[0.42, 0.42, 0.42]} friction={0.7} />
            : <CylinderCollider args={[0.48, 0.4]} friction={0.55} />}
        </RigidBody>
      ))}
      <instancedMesh ref={boxMesh} args={[undefined, undefined, boxes.length]} material={boxMat} frustumCulled={false}>
        <boxGeometry args={[0.84, 0.84, 0.84]} />
      </instancedMesh>
      <instancedMesh ref={barMesh} args={[undefined, undefined, barrels.length]} material={barrelMat} frustumCulled={false}>
        <cylinderGeometry args={[0.4, 0.4, 0.96, 8]} />
      </instancedMesh>
    </group>
  )
}

export function PortDistrict() {
  const crates = useMemo(placedCrates, [])
  const dock = useMemo(dockGeo, [])
  const crane = useMemo(craneGeo, [])
  const [gx, gz] = [portWorld(0, -8)[0], portWorld(0, -8)[1]]
  const [hx, hz] = [portWorld(0, 8)[0], portWorld(0, 8)[1]]
  return (
    <group name="c7-port">
      <mesh position={[center[0], PORT_Y - 0.12, center[1]]} rotation={[0, PORT_RY, 0]} material={padMat}>
        <boxGeometry args={[PORT_WID, 0.24, PORT_LEN]} />
      </mesh>
      <mesh geometry={dock} material={dockMat} />
      <mesh geometry={crane.g} material={steelMat} />
      <mesh position={[crane.x + PORT_BASIS.ox * 20, 31.4, crane.z + PORT_BASIS.oz * 20]} material={iceMat}>
        <boxGeometry args={[0.35, 0.35, 0.35]} />
      </mesh>
      <Water />
      <mesh position={[gx, 2.6, gz]} material={steelMat}><boxGeometry args={[1.1, 5.2, 1.1]} /></mesh>
      <mesh position={[hx, 2.6, hz]} material={steelMat}><boxGeometry args={[1.1, 5.2, 1.1]} /></mesh>
      <mesh position={[(gx + hx) / 2, 5.15, (gz + hz) / 2]} rotation={[0, PORT_RY, 0]} material={iceMat}>
        <boxGeometry args={[16, 0.16, 0.16]} />
      </mesh>
      <Crates list={crates} />
      <PropPool />
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[PORT_WID / 2, 0.2, PORT_LEN / 2]} position={[center[0], PORT_Y - 0.2, center[1]]} rotation={[0, PORT_RY, 0]} />
        {crates.map((c, i) => (
          <CuboidCollider key={i} args={[c.sx / 2, c.sy / 2, c.sz / 2]} position={[c.x, c.y, c.z]} rotation={[0, c.ry, 0]} />
        ))}
        <CuboidCollider args={[0.55, 2.6, 0.55]} position={[gx, 2.6, gz]} />
        <CuboidCollider args={[0.55, 2.6, 0.55]} position={[hx, 2.6, hz]} />
      </RigidBody>
    </group>
  )
}
