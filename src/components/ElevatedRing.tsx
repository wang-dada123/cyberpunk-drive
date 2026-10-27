import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier'
import { TriMeshFlags } from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { carPose } from './Car'
import { expansionStats } from './expansionDrive'
import {
  ELEV_W, J2_DEG, RAMPS, RING_FRAMES, RING_PER, SECTORS,
  angDist, angOf, frameAt, nearRampJoin, nearSpur, portWorld, yawOf,
  type RoadFrame,
} from '../data/expansionLayout'
import { GUIDE_HEX, allRampColliders, rampGuideMesh } from '../data/rampSurface'

if (import.meta.env.DEV) Object.assign(window, { __expansion: { frameAt, yawOf, portWorld, angOf, RAMPS, RING_FRAMES, stats: expansionStats } })

/**
 * C6 环城高架：8 扇区，对侧半环 visible=false。
 * 路面 / 护栏各 1 次 draw（扇区内）。栏杆上沿冰蓝 #4FC3F7，不是别的霓虹。
 * J1 路面留 15m 缺口；J2 只放一块标记。
 */
const DEG = Math.PI / 180
const SHOW = 88 * DEG
const HW = ELEV_W / 2

const deckMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
const rampMat = deckMat.clone()
rampMat.polygonOffset = true
rampMat.polygonOffsetFactor = -1
rampMat.polygonOffsetUnits = -1
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

function buildDeck(frames: RoadFrame[], halfW?: number[], yLift = 0.04) {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const rowAt: number[] = []
  const c = new THREE.Color()
  frames.forEach((f, i) => {
    rowAt.push(pos.length / 3)
    const prevGap = i > 0 && frames[i - 1].gap
    const lip = f.kick ? Math.min(1, (f.y - f.base) / 1.15) : prevGap ? 0.65 : 0
    const hw = halfW ? halfW[i] : HW
    for (const s of [-1, 0, 1]) {
      pos.push(f.x + f.px * s * hw, Math.max(0.02, f.y) + yLift, f.z + f.pz * s * hw)
      c.copy(s === 0 ? MID : EDGE).lerp(ICE, s === 0 ? lip * 0.8 : lip * 0.35)
      col.push(c.r, c.g, c.b)
    }
  })
  for (let i = 0; i < frames.length - 1; i++) {
    if (frames[i].gap || frames[i + 1].gap) continue
    const a = rowAt[i], b = rowAt[i + 1]
    idx.push(a, b, a + 1, b, b + 1, a + 1)
    idx.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2)
  }
  return geo(pos, idx, col)
}

function buildRails(frames: RoadFrame[], withPillars: boolean, halfW?: number[], taperN = 0) {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  for (const side of [-1, 1]) {
    const map: number[] = []
    frames.forEach((f, i) => {
      const hw = (halfW ? halfW[i] : HW) + 0.2
      const grow = taperN > 0 ? Math.min(1, (i + 1) / taperN) : 1
      const x = f.x + f.px * side * hw
      const z = f.z + f.pz * side * hw
      const y0 = f.base + 0.06
      const y1 = y0 + 0.84 * grow
      map.push(pos.length / 3)
      pos.push(x, y0, z, x, y1, z)
      col.push(STEEL.r, STEEL.g, STEEL.b, ICE.r, ICE.g, ICE.b)
    })
    for (let i = 0; i < frames.length - 1; i++) {
      if (frames[i].gap || frames[i + 1].gap || frames[i].kick || frames[i + 1].kick) continue
      const a = map[i], b = map[i + 1]
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  if (withPillars) {
    for (let i = 6; i < frames.length; i += 12) {
      const f = frames[i]
      if (f.gap || f.kick || f.base < 2.2 || nearSpur(f.x, f.z, 9) || nearRampJoin(f.x, f.z, 14)) continue
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
  const y = f.base + 0.08
  const push = (along: number, side: number) => {
    pos.push(f.x + f.tx * along + f.px * side, y, f.z + f.tz * along + f.pz * side)
  }
  // 两道横条 + 一个尖角，只占位，没有缺口也没有加速
  push(-2.2, -2.4); push(-2.2, 2.4); push(-1.5, 2.4); push(-1.5, -2.4)
  push(1.5, -1.6); push(1.5, 1.6); push(2.3, 0)
  idx.push(0, 1, 2, 0, 2, 3, 4, 5, 6)
  return geo(pos, idx)
}

type ColBox = { position: [number, number, number]; rotation: [number, number, number]; args: [number, number, number] }

const _dir = new THREE.Vector3()
const _aim = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _m = new THREE.Matrix4()
const _uy = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

/** 盒子本地 +Z 沿弦，顶面贴在路面弦上。坡度写进朝向，避免平盒在匝道上台阶。 */
function deckBox(a: RoadFrame, b: RoadFrame): ColBox | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  const len = Math.hypot(dx, dy, dz)
  if (len < 0.35) return null
  _dir.set(dx, dy, dz).normalize()
  _aim.copy(_dir).negate()
  _m.lookAt(_aim, _dir, _up)
  _q.setFromRotationMatrix(_m)
  _e.setFromQuaternion(_q, 'XYZ')
  _uy.set(0, 1, 0).applyQuaternion(_q)
  const th = 0.16
  return {
    position: [(a.x + b.x) / 2 - _uy.x * th, (a.y + b.y) / 2 - _uy.y * th, (a.z + b.z) / 2 - _uy.z * th],
    rotation: [_e.x, _e.y, _e.z],
    args: [HW, th, len / 2 + 0.5],
  }
}

function walk(frames: RoadFrame[], maxStep: number, blocked: (f: RoadFrame, n: RoadFrame) => boolean) {
  const spans: [number, number][] = []
  let i = 0
  while (i < frames.length - 1) {
    if (blocked(frames[i], frames[i + 1])) { i++; continue }
    let end = i + 1
    while (end < frames.length - 1 && end - i < maxStep && !blocked(frames[end], frames[end + 1])) {
      const stepDot = frames[end].tx * frames[end + 1].tx + frames[end].tz * frames[end + 1].tz
      if (stepDot < 0.2) break
      const dot = frames[i].tx * frames[end + 1].tx + frames[i].tz * frames[end + 1].tz
      if (dot < 0.992 && end - i >= 2) break
      end++
    }
    spans.push([i, end])
    i = end
  }
  return spans
}

function deckBoxes(frames: RoadFrame[]) {
  const out: ColBox[] = []
  const gap = (a: RoadFrame, b: RoadFrame) => a.gap || b.gap
  for (const [i, end] of walk(frames, 4, gap)) {
    const kick = frames[i].kick || frames[end].kick
    if (kick && end - i > 1) {
      for (let k = i; k < end; k++) {
        const box = deckBox(frames[k], frames[k + 1])
        if (box) out.push(box)
      }
    } else {
      const box = deckBox(frames[i], frames[end])
      if (box) out.push(box)
    }
  }
  return out
}

function wallBoxes(frames: RoadFrame[]) {
  const out: ColBox[] = []
  for (const side of [-1, 1]) {
    // 内侧（side 1，px 朝圆心）在匝道汇入处断开，坡面才能开上桥。
    const skip = (a: RoadFrame, b: RoadFrame) => a.gap || b.gap || a.kick || b.kick || (side === 1 && (nearRampJoin(a.x, a.z) || nearRampJoin(b.x, b.z)))
    for (const [i, end] of walk(frames, 6, skip)) {
      const a = frames[i]
      const b = frames[end]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      if (len < 0.35) continue
      const px = (a.px + b.px) * 0.5
      const pz = (a.pz + b.pz) * 0.5
      const pl = Math.hypot(px, pz) || 1
      const ox = (px / pl) * side * (HW + 0.22)
      const oz = (pz / pl) * side * (HW + 0.22)
      const base = (a.base + b.base) * 0.5
      out.push({
        position: [(a.x + b.x) / 2 + ox, base + 0.48, (a.z + b.z) / 2 + oz],
        rotation: [0, Math.atan2(dx, dz), 0],
        args: [0.18, 0.42, len / 2 + 0.3],
      })
    }
  }
  return out
}

type Built = {
  deck: THREE.BufferGeometry
  rails: THREE.BufferGeometry
  cols: ColBox[]
  ramp: { deck: THREE.BufferGeometry; rails: THREE.BufferGeometry } | null
  j2: boolean
}

function buildAll(): Built[] {
  return Array.from({ length: SECTORS }, (_, i) => {
    const frames = RING_FRAMES.slice(i * RING_PER, i * RING_PER + RING_PER + 1)
    const deck = buildDeck(frames)
    const rails = buildRails(frames, true)
    const cols = [...deckBoxes(frames), ...wallBoxes(frames)]
    const rampSrc = RAMPS.find((r) => r.sector === i) ?? null
    let ramp: Built['ramp'] = null
    if (rampSrc) {
      const vis = rampSrc.frames.slice(0, rampSrc.join + 1)
      const w0 = rampSrc.frames.findIndex((f) => f.y > 0.45)
      const railF = rampSrc.frames.slice(w0, rampSrc.lip + 1)
      ramp = {
        deck: buildDeck(vis, rampSrc.halfW.slice(0, rampSrc.join + 1), 0.06),
        rails: buildRails(railF, false, rampSrc.halfW.slice(w0, rampSrc.lip + 1), 5),
      }
    }
    const j2 = frames.some((f, k) => k < frames.length - 1 && !f.gap && Math.abs(angDist(f.theta, J2_DEG * DEG)) < 0.04)
    return { deck, rails, cols, ramp, j2 }
  })
}

const J2 = j2Geo()
const rampCols = allRampColliders()
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
    let n = 0
    for (let i = 0; i < SECTORS; i++) {
      const g = groups.current[i]
      if (!g) continue
      const mid = ((i + 0.5) / SECTORS) * Math.PI * 2
      const on = Math.abs(angDist(a, mid)) <= SHOW
      g.visible = on
      if (on) n++
    }
    expansionStats.sectors = n
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
              <mesh geometry={s.ramp.rails} material={railMat} />
            </>
          )}
          <RigidBody type="fixed" colliders={false}>
            {s.cols.map((c, k) => (
              <CuboidCollider key={k} args={c.args} position={c.position} rotation={c.rotation} friction={0} restitution={0} />
            ))}
          </RigidBody>
        </group>
      ))}
      {/* 坡面碰撞不跟扇区显隐走：对侧扇区隐藏时车还在坡上也要有地面。 */}
      <RigidBody type="fixed" colliders={false} name="ramp-cols">
        {rampCols.map((c, i) => (
          <group key={i}>
            <TrimeshCollider args={[c.deck.v, c.deck.i, TriMeshFlags.FIX_INTERNAL_EDGES] as never} friction={0.85} restitution={0} />
            {c.wall.i.length > 0 && <TrimeshCollider args={[c.wall.v, c.wall.i]} friction={0.15} restitution={0} />}
          </group>
        ))}
      </RigidBody>
      <mesh geometry={guideGeo} material={guideMat} name="ramp-guides" />
    </>
  )
}
