import { S2_BRIDGE } from '../data/s2Bridge'
import { SPIRAL, spiralFrame, spiralH } from '../data/mapLayout'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import { TriMeshFlags } from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { carPose } from './Car'
import { expansionStats, resetExpansionDrive } from './expansionDrive'
import {
  ELEV_W, J2_DEG, RAMPS, RING_FRAMES, RING_PER, SECTORS,
  angDist, angOf, frameAt, nearRampJoin, nearSpur, portWorld, underRampMesh, yawOf,
  type RoadFrame,
} from '../data/expansionLayout'
import { GUIDE_HEX, allRampColliders, laneEdges, rampCollider, rampGuideMesh } from '../data/rampSurface'
import { RING_LIFT, deckArrays, rampKeep } from '../data/deckGeom'
import { J2_WALL_UP, RAIL_LINES, railWallMesh, type RailLine } from '../data/railLines'

if (import.meta.env.DEV) Object.assign(window, { __expansion: { resetDrive: resetExpansionDrive, RAIL_LINES, laneEdges, frameAt, yawOf, portWorld, angOf, RAMPS, RING_FRAMES, stats: expansionStats, S2: S2_BRIDGE, J2_DEG, spiral: () => { const o = []; for (let q = -SPIRAL.LEAD; q <= SPIRAL.L + SPIRAL.ROOF * 0.7; q += 1.2) { const f = spiralFrame(q); o.push({ x: f.p[0], y: Math.max(0.05, spiralH(Math.max(0, q))) + 0.02, z: f.p[1] }) } return o } } })

/**
 * C6 环城高架：8 扇区，对侧半环 visible=false。
 * 路面 / 护栏各 1 次 draw（扇区内）。栏杆上沿冰蓝 #4FC3F7，不是别的霓虹。
 * J1 路面留 15m 缺口；J2 只放一块标记。
 */
const DEG = Math.PI / 180
const SHOW = 88 * DEG
const HW = ELEV_W / 2

const deckMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
/** 匝道桥面已在环线外沿收住、不与环线桥面重叠，不再用 polygonOffset */
const rampMat = deckMat
const railMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide })
const iceMat = new THREE.MeshBasicMaterial({ color: '#4FC3F7', toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })

const ICE = new THREE.Color('#4FC3F7')
const STEEL = new THREE.Color('#1A2834')
const EDGE = new THREE.Color('#1A2836')
const MID = new THREE.Color('#3C5062')

function geo(pos: number[], idx: number[], col?: number[]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function buildDeck(frames: RoadFrame[], halfW?: number[], yLift = RING_LIFT, edges?: number[][][], keep?: (x: number, z: number) => number) {
  const { pos, meta, idx } = deckArrays(frames, halfW, yLift, edges, keep)
  const col: number[] = []
  const c = new THREE.Color()
  for (let k = 0; k < meta.length; k += 2) {
    const s = meta[k], lip = meta[k + 1]
    c.copy(s === 0 ? MID : EDGE).lerp(ICE, s === 0 ? lip * 0.8 : lip * 0.35)
    col.push(c.r, c.g, c.b)
  }
  return geo(pos, idx, col)
}

/** 护栏：沿 RAIL_LINES 折线，离路面恒定 0.06→0.9m，等高、连续、跟着弯道走。 */
function buildRails(lines: RailLine[], pillarFrames: RoadFrame[] | null) {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  for (const line of lines) {
    const base = pos.length / 3
    const n = line.pts.length
    const arc = [0]
    for (let i = 1; i < n; i++) arc.push(arc[i - 1] + Math.hypot(line.pts[i].x - line.pts[i - 1].x, line.pts[i].z - line.pts[i - 1].z))
    const total = arc[n - 1] || 1
    for (let i = 0; i < n; i++) {
      const p = line.pts[i]
      const k0 = line.fade0 ? Math.min(1, arc[i] / line.fade0) : 1
      const k1 = line.fade1 ? Math.min(1, (total - arc[i]) / line.fade1) : 1
      const k = Math.max(0.04, Math.min(k0, k1))
      pos.push(p.x, p.y + 0.06, p.z, p.x, p.y + 0.06 + 0.84 * k + (p.up ?? 0) * J2_WALL_UP * k, p.z)
      col.push(STEEL.r, STEEL.g, STEEL.b, ICE.r, ICE.g, ICE.b)
    }
    for (let i = 0; i < line.pts.length - 1; i++) {
      const a = base + i * 2, b = a + 2
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  if (pillarFrames) {
    for (let i = 6; i < pillarFrames.length; i += 12) {
      const f = pillarFrames[i]
      if (f.base < 2.2 || nearSpur(f.x, f.z, 9) || nearRampJoin(f.x, f.z, 14) || underRampMesh(f.x, f.z)) continue
      for (const side of [-1, 1]) {
        addBox(pos, col, idx, [f.x + f.px * side * (HW + 0.95), f.base * 0.5, f.z + f.pz * side * (HW + 0.95)], [0.65, f.base, 0.65])
      }
    }
  }
  return geo(pos, idx, col)
}

function addBox(pos: number[], col: number[], idx: number[], c: [number, number, number], s: [number, number, number]) {
  const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2]
  const base = pos.length / 3
  // x 外层、y 中层、z 内层：0(- - -) 1(- - +) 2(- + -) 3(- + +) 4(+ - -) 5(+ - +) 6(+ + -) 7(+ + +)
  for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) {
    pos.push(c[0] + x, c[1] + y, c[2] + z)
    col.push(STEEL.r, STEEL.g, STEEL.b)
  }
  const faces = [[0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5], [0, 2, 6, 4], [1, 5, 7, 3]]
  for (const f of faces) idx.push(base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3])
}

function j2Geo() {
  const f = frameAt(J2_DEG * DEG)
  const pos: number[] = []
  const idx: number[] = []
  const y = f.y + 0.08
  const push = (along: number, side: number) => {
    pos.push(f.x + f.tx * along + f.px * side, y, f.z + f.tz * along + f.pz * side)
  }
  // 两道横条 + 一个尖角，只占位，没有缺口也没有加速
  push(-2.2, -2.4); push(-2.2, 2.4); push(-1.5, 2.4); push(-1.5, -2.4)
  push(1.5, -1.6); push(1.5, 1.6); push(2.3, 0)
  idx.push(0, 1, 2, 0, 2, 3, 4, 5, 6)
  return geo(pos, idx)
}

type Built = {
  deck: THREE.BufferGeometry
  rails: THREE.BufferGeometry
  ramp: { deck: THREE.BufferGeometry } | null
  j2: boolean
}

function buildAll(): Built[] {
  return Array.from({ length: SECTORS }, (_, i) => {
    const frames = RING_FRAMES.slice(i * RING_PER, i * RING_PER + RING_PER + 1)
    const deck = buildDeck(frames)
    const rails = buildRails(RAIL_LINES.filter((l) => l.sector === i), frames)
    const rampSrc = RAMPS.find((r) => r.sector === i) ?? null
    const ramp: Built['ramp'] = rampSrc
      ? { deck: buildDeck(rampSrc.frames.slice(0, rampSrc.deckOwn + 1), rampSrc.halfW.slice(0, rampSrc.deckOwn + 1), 0.06, laneEdges(rampSrc.frames, rampSrc.halfW), rampKeep(rampSrc.deg)) }
      : null
    const j2 = frames.some((f, k) => k < frames.length - 1 && !f.gap && Math.abs(angDist(f.theta, J2_DEG * DEG)) < 0.04)
    return { deck, rails, ramp, j2 }
  })
}

const J2 = j2Geo()
/** S2 桥：桥面 + 桥墩（护栏已在 RAIL_LINES 里，跟着所在扇区画） */
const S2_DECK = (() => {
  const r = S2_BRIDGE
  const n = r.deckOwn + 1
  const deck = buildDeck(r.frames.slice(0, n), r.halfW.slice(0, n), 0.06, laneEdges(r.frames, r.halfW))
  const pos: number[] = [], col: number[] = [], idx: number[] = []
  for (let i = 10; i < r.join - 2; i += 9) {
    const f = r.frames[i]
    if (f.base < 2.5) continue
    addBox(pos, col, idx, [f.x, f.base * 0.5 - 0.2, f.z], [1.1, f.base - 0.4, 1.1])
  }
  return { deck, piers: geo(pos, idx, col) }
})()
const s2Col = rampCollider(S2_BRIDGE)
const rampCols = allRampColliders()
const wallCol = railWallMesh()
/** 桥面碰撞：与 buildDeck 同一套帧、同一宽度，法线朝上（三角绕序翻成从上往下看逆时针）。 */
const ringCol = (() => {
  const v: number[] = []
  const idx: number[] = []
  const N = RING_FRAMES.length - 1
  for (let k = 0; k < N; k++) {
    const f = RING_FRAMES[k]
    for (const s of [-1, 0, 1]) v.push(f.x + f.px * s * HW, f.y, f.z + f.pz * s * HW)
  }
  for (let k = 0; k < N; k++) {
    const a = k * 3, b = ((k + 1) % N) * 3
    idx.push(a, a + 1, b, b, a + 1, b + 1)
    idx.push(a + 1, a + 2, b + 1, b + 1, a + 2, b + 2)
  }
  // 绕序检查：法线 y 要朝上
  const ax = v[3] - v[0], az = v[5] - v[2], bx = v[9] - v[0], bz = v[11] - v[2]
  if (ax * bz - az * bx > 0) for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q }
  return { v: new Float32Array(v), i: new Uint32Array(idx) }
})()
const guideGeo = (() => {
  const g = rampGuideMesh()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3))
  geo.setIndex(new THREE.BufferAttribute(g.idx, 1))
  geo.computeBoundingSphere()
  return geo
})()
const guideMat = new THREE.MeshBasicMaterial({ color: GUIDE_HEX, toneMapped: false, side: THREE.DoubleSide })

export function ElevatedRing() {
  const built = useMemo(buildAll, [])
  const groups = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const a = angOf(carPose.position.x, carPose.position.z)
    for (let i = 0; i < SECTORS; i++) {
      const g = groups.current[i]
      if (!g) continue
      const mid = ((i + 0.5) / SECTORS) * Math.PI * 2
      g.visible = Math.abs(angDist(a, mid)) <= SHOW
    }
  })
  return (
    <>
      {built.map((s, i) => (
        <group key={i} name={`c6-${i}`} ref={(el) => { groups.current[i] = el }} userData={{ dynamic: true }}>
          <mesh geometry={s.deck} material={deckMat} />
          <mesh geometry={s.rails} material={railMat} />
          {s.j2 && <mesh geometry={J2} material={iceMat} />}
          {s.ramp && (
            <>
              <mesh geometry={s.ramp.deck} material={rampMat} />
            </>
          )}
        </group>
      ))}
      <mesh geometry={S2_DECK.deck} material={rampMat} name="s2-deck" />
      <mesh geometry={S2_DECK.piers} material={railMat} name="s2-piers" />
      <RigidBody type="fixed" colliders={false} name="s2-col">
        <TrimeshCollider args={[s2Col.deck.v, s2Col.deck.i, TriMeshFlags.FIX_INTERNAL_EDGES] as never} friction={0.85} restitution={0} />
      </RigidBody>
      {/* 坡面碰撞不跟扇区显隐走：对侧扇区隐藏时车还在坡上也要有地面。 */}
      <RigidBody type="fixed" colliders={false} name="ramp-cols">
        {rampCols.map((c, i) => (
          <group key={i}>
            <TrimeshCollider args={[c.deck.v, c.deck.i, TriMeshFlags.FIX_INTERNAL_EDGES] as never} friction={0.85} restitution={0} />
          </group>
        ))}
        {/* 整圈桥面：一条焊好的 trimesh，顶点与视觉网格同源，无拼缝、无盒子接头台阶 */}
        <TrimeshCollider args={[ringCol.v, ringCol.i, TriMeshFlags.FIX_INTERNAL_EDGES] as never} friction={0.85} restitution={0} />
        {/* 护栏墙：与视觉护栏同一折线，2.3m 高 */}
        <TrimeshCollider args={[wallCol.v, wallCol.i]} friction={0.15} restitution={0} />
      </RigidBody>
      <mesh geometry={guideGeo} material={guideMat} name="ramp-guides" />
    </>
  )
}
