import { useLayoutEffect, useMemo, useRef } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { makeAsphalt, makePlazaStone, SpawnArrows } from './GroundFX'
import { Signposts, LandmarkBeacons } from './Nav'
import { NAV, SPAWN_PATHS } from '../data/nav'
const SPAWN_ARROW_PATHS = SPAWN_PATHS.map((p) => ({ pts: p.pts, color: NAV[p.id].color }))
import { colors, districts, type DistrictId } from '../theme/colors'
import { PLAZA_R, WORLD_HALF, rings, segs, roadClearance, districtAt, distSeg, ringDim, TUNNEL, TUNNEL_R1, type Seg } from '../data/mapLayout'
import { Structures } from './Structures'
import { PortfolioStreet, STREET_ORIGIN_Z, SHOWCASE_RING_R, showcaseRingsWorld } from './PortfolioStreet'

/** 一个盒子实例：位置 / 尺寸 / 绕 Y 旋转 / 颜色 */
type Box = { p: [number, number, number]; s: [number, number, number]; ry?: number; c?: THREE.Color }

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const unitBox = new THREE.BoxGeometry(1, 1, 1)

/** 静态实例化盒子：矩阵只写一次，1 次 draw call */
function Boxes({ items, material }: { items: Box[]; material: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const im = ref.current!
    items.forEach((b, i) => {
      _q.setFromEuler(_e.set(0, b.ry ?? 0, 0))
      _m.compose(_p.set(...b.p), _q, _s.set(...b.s))
      im.setMatrixAt(i, _m)
      if (b.c) im.setColorAt(i, b.c)
    })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.computeBoundingSphere()
  }, [items])
  return <instancedMesh ref={ref} args={[unitBox, material, items.length]} />
}

// ---------- 材质（模块级共享） ----------
// 沥青：程序化（噪声粗糙度 / 不规则拼缝 / 积水假反射），见 GroundFX
const roadMat = makeAsphalt('#1A2029', { mode: 0 })
export const roadDimMat = makeAsphalt('#141920', { mode: 0 }) // 新路/小巷/外环压暗一档
const plazaMat = makePlazaStone(PLAZA_R)
const ringMats = new Map<number, THREE.Material>()
const ringMat = (r: number, w: number, dimmed: boolean) => {
  if (!ringMats.has(r)) ringMats.set(r, makeAsphalt(dimmed ? '#141920' : '#1A2029', { mode: 1, R: r, W: w }))
  return ringMats.get(r)!
}
const groundMat = new THREE.MeshStandardMaterial({ color: '#03060C', roughness: 0.95 })
const bodyMat = new THREE.MeshStandardMaterial({ color: colors.building ?? '#0E1824', roughness: 0.7, metalness: 0.3, emissive: '#0A1A2E', emissiveIntensity: 0.35 })
const glowMat = new THREE.MeshBasicMaterial({ toneMapped: false }) // 颜色走 instanceColor
const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.iceBlue).multiplyScalar(0.18), toneMapped: false })

const dim = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k)

// ---------- 程序化生成（确定性随机） ----------
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

function buildCity() {
  const r = rng(7)
  const bodies: Box[] = []
  const roofs: Box[] = []
  const strips: Box[] = []
  const STEP = 11
  for (let gx = -WORLD_HALF + 8; gx <= WORLD_HALF - 8; gx += STEP) {
    for (let gz = -WORLD_HALF + 8; gz <= WORLD_HALF - 8; gz += STEP) {
      const x = gx + (r() - 0.5) * 3
      const z = gz + (r() - 0.5) * 3
      const w = 5 + r() * 4
      const d = 5 + r() * 4
      const half = Math.hypot(w, d) / 2
      if (x > 25 && Math.abs(z) - half < 11.5 && Math.abs(z) < 25) continue // 让出 AI 摊位带
      if (roadClearance(x, z) < half + 1.6) {
        // 太挤：试更小一号
        const w2 = 3.6, d2 = 3.6
        if (roadClearance(x, z) < Math.hypot(w2, d2) / 2 + 1.6) continue
        pushB(x, z, w2, d2)
        continue
      }
      pushB(x, z, w, d)
    }
  }
  function pushB(x: number, z: number, w: number, d: number) {
    const dist = Math.hypot(x, z)
    const h = 8 + r() * 14 + Math.min(dist / 8, 14) * r()
    const did = districtAt(x, z)
    const acc = districts[did].accent
    bodies.push({ p: [x, h / 2, z], s: [w, h, d] })
    roofs.push({ p: [x, h + 0.08, z], s: [w * 0.96, 0.16, d * 0.96], c: dim(acc, 0.22) })
    if (r() < 0.4) {
      // 朝广场方向的立面竖向灯带
      const alongX = Math.abs(x) < Math.abs(z)
      const sx = alongX ? 0 : -Math.sign(x) * (w / 2 + 0.03)
      const sz = alongX ? -Math.sign(z) * (d / 2 + 0.03) : 0
      const off = (r() - 0.5) * (alongX ? w : d) * 0.6
      strips.push({ p: [x + sx + (alongX ? off : 0), h * 0.55, z + sz + (alongX ? 0 : off)], s: alongX ? [0.18, h * 0.8, 0.06] : [0.06, h * 0.8, 0.18], c: dim(acc, 0.6) })
    }
  }
  // 路面导向光带：沿有 guide 的街道中线
  for (const s of segs) {
    if (!s.guide) continue
    const [ax, az] = s.a, [bx, bz] = s.b
    const len = Math.hypot(bx - ax, bz - az)
    const ry = Math.atan2(bx - ax, bz - az)
    strips.push({ p: [(ax + bx) / 2, 0.06, (az + bz) / 2], s: [0.16, 0.04, len], ry, c: dim(districts[s.guide].accent, 0.35) })
  }
  return { bodies, roofs, strips }
}

// ---------- 路面标线（全部实例化） ----------
/** 点是否落在“别的”路面上（用于路口处断开边线） */
function onOther(x: number, z: number, self: number) {
  const rr = Math.hypot(x, z)
  if (rr < PLAZA_R + 0.3) return true
  for (let i = 0; i < rings.length; i++) if (i !== self - 1000 && Math.abs(rr - rings[i].r) < rings[i].w / 2 + 0.3) return true
  for (let i = 0; i < segs.length; i++) if (i !== self && distSeg(x, z, segs[i]) < segs[i].w / 2 + 0.3) return true
  return false
}
const DASH_LEN = 3, DASH_GAP = 3, JUNCTION_CLEAR = 2
/** 虚线可生成：不在广场、展示光环(半径+1m)、及其他路面(+2m 路口留白)内 */
function dashOk(x: number, z: number, self: number) {
  const rr = Math.hypot(x, z)
  if (rr < PLAZA_R + JUNCTION_CLEAR) return false
  for (const [cx, cz] of showcaseRingsWorld) if (Math.hypot(x - cx, z - cz) < SHOWCASE_RING_R + 1) return false
  for (let i = 0; i < rings.length; i++) if (i !== self - 1000 && Math.abs(rr - rings[i].r) < rings[i].w / 2 + JUNCTION_CLEAR) return false
  for (let i = 0; i < segs.length; i++) if (i !== self && distSeg(x, z, segs[i]) < segs[i].w / 2 + JUNCTION_CLEAR) return false
  return true
}
function buildMarkings() {
  const edges: Box[] = [], dashes: Box[] = [], edgesDim: Box[] = []
  const E = 2 // 边线分段长度
  segs.forEach((s, i) => {
    if (s.virtual) return
    const [ax, az] = s.a, [bx, bz] = s.b
    const len = Math.hypot(bx - ax, bz - az)
    const ux = (bx - ax) / len, uz = (bz - az) / len
    const ry = Math.atan2(ux, uz)
    for (let t = E / 2; t < len; t += E) {
      for (const k of [-1, 1]) {
        const x = ax + ux * t + uz * k * (s.w / 2 - 0.25), z = az + uz * t - ux * k * (s.w / 2 - 0.25)
        if (!onOther(x, z, i)) (s.dim ? edgesDim : edges).push({ p: [x, 0.055, z], s: [0.12, 0.03, E], ry })
      }
    }
  })
  // 虚线：统一 3m 实 / 3m 空，按整段生成；段的两端与中点都需通过 dashOk 才生成
  segs.forEach((s, i) => {
    if (s.virtual) return
    const [ax, az] = s.a, [bx, bz] = s.b
    const len = Math.hypot(bx - ax, bz - az)
    const ux = (bx - ax) / len, uz = (bz - az) / len
    const ry = Math.atan2(ux, uz)
    const offs = s.w >= 10 && !s.guide ? [0] : s.guide && s.w >= 12 ? [-s.w / 4, s.w / 4] : []
    for (const o of offs) {
      for (let t = DASH_GAP / 2 + DASH_LEN / 2; t + DASH_LEN / 2 < len; t += DASH_LEN + DASH_GAP) {
        const pt = (d: number): [number, number] => [ax + ux * (t + d) + uz * o, az + uz * (t + d) - ux * o]
        if (![pt(-DASH_LEN / 2), pt(0), pt(DASH_LEN / 2)].every(([x, z]) => dashOk(x, z, i))) continue
        const [x, z] = pt(0)
        dashes.push({ p: [x, 0.055, z], s: [o ? 0.14 : 0.18, 0.03, DASH_LEN], ry })
      }
    }
  })
  rings.forEach((rg, ri) => {
    const rad = rg.r, step = DASH_LEN + DASH_GAP
    const n = Math.floor((2 * Math.PI * rad) / step)
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2, da = DASH_LEN / 2 / rad
      if (![a - da, a, a + da].every((b) => dashOk(Math.sin(b) * rad, Math.cos(b) * rad, 1000 + ri))) continue
      dashes.push({ p: [Math.sin(a) * rad, 0.055, Math.cos(a) * rad], s: [0.18, 0.03, DASH_LEN], ry: a + Math.PI / 2 })
    }
  })
  rings.forEach((rg, ri) => {
    for (const rad of [rg.r - rg.w / 2 + 0.25, rg.r + rg.w / 2 - 0.25]) {
      const n = Math.round((2 * Math.PI * rad) / E)
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2
        const x = Math.sin(a) * rad, z = Math.cos(a) * rad
        if (onOther(x, z, 1000 + ri)) continue
        (ringDim(rg) ? edgesDim : edges).push({ p: [x, 0.055, z], s: [0.12, 0.03, E * 1.02], ry: a + Math.PI / 2 })
      }
    }
  })
  return { edges, dashes, edgesDim }
}
const edgeLineMat = new THREE.MeshBasicMaterial({ color: dim(colors.iceBlue, 0.55), toneMapped: false })
const dashMat = new THREE.MeshBasicMaterial({ color: dim(colors.coldWhite, 0.45), toneMapped: false })
const edgeLineDimMat = new THREE.MeshBasicMaterial({ color: dim(colors.iceBlue, 0.28), toneMapped: false }) // 小巷冰蓝，暗一档

// ---------- 广场 ----------
function buildPlaza() {
  const props: Box[] = [], glows: Box[] = []
  // 边缘：花坛 / 长椅 / 全息亭交替，放在 22.5°+45k（避开四条主街和斜向大道）
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4
    const x = Math.sin(a) * 23.5, z = Math.cos(a) * 23.5
    const kind = k % 3
    if (kind === 0) { // 花坛
      props.push({ p: [x, 0.4, z], s: [4, 0.8, 1.6], ry: a })
      glows.push({ p: [x, 0.82, z], s: [3.7, 0.05, 1.3], ry: a, c: dim('#64FFDA', 0.35) })
    } else if (kind === 1) { // 长椅 ×2
      for (const o of [-1.4, 1.4]) {
        const bx = x + Math.cos(a) * o, bz = z - Math.sin(a) * o
        props.push({ p: [bx, 0.25, bz], s: [2.2, 0.5, 0.7], ry: a })
        glows.push({ p: [bx, 0.52, bz], s: [2.0, 0.03, 0.08], ry: a, c: dim(colors.iceBlue, 0.8) })
      }
    } else { // 全息亭
      props.push({ p: [x, 1.4, z], s: [1.4, 2.8, 1.4], ry: a })
      glows.push({ p: [x, 2.0, z], s: [1.5, 1.2, 1.5], ry: a, c: dim(colors.deepBlue, 0.55) })
      glows.push({ p: [x, 2.85, z], s: [1.6, 0.08, 1.6], ry: a, c: dim(colors.iceBlue, 1.3) })
    }
  }
  return { props, glows }
}

// ---------- 路面 ----------
function SegRoad({ s, y }: { s: Seg; y: number }) {
  const [ax, az] = s.a, [bx, bz] = s.b
  const len = Math.hypot(bx - ax, bz - az) + s.w * 0.5
  const ry = Math.atan2(bx - ax, bz - az)
  return (
    <mesh position={[(ax + bx) / 2, y, (az + bz) / 2]} rotation={[-Math.PI / 2, 0, ry]} material={s.dim ? roadDimMat : roadMat}>
      <planeGeometry args={[s.w, len]} />
    </mesh>
  )
}

// ---------- 地标 ----------
function GateFrame({ position, rotationY, color, gap = 7.6, h = 12 }: { position: [number, number, number]; rotationY: number; color: string; gap?: number; h?: number }) {
  const pw = 2, pd = 2.2
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: dim(color, 2), toneMapped: false }), [color])
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0E1824', emissive: color, emissiveIntensity: 0.5 }), [color])
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[pw / 2, h / 2, pd / 2]} position={[-gap / 2 - pw / 2, h / 2, 0]} />
        <CuboidCollider args={[pw / 2, h / 2, pd / 2]} position={[gap / 2 + pw / 2, h / 2, 0]} />
      </RigidBody>
      <mesh position={[-gap / 2 - pw / 2, h / 2, 0]} material={body}><boxGeometry args={[pw, h, pd]} /></mesh>
      <mesh position={[gap / 2 + pw / 2, h / 2, 0]} material={body}><boxGeometry args={[pw, h, pd]} /></mesh>
      <mesh position={[0, h + 0.7, 0]} material={body}><boxGeometry args={[gap + pw * 2, 1.4, pd]} /></mesh>
      {/* 门洞发光细框（朝 +Z） */}
      <mesh position={[-gap / 2, h / 2, pd / 2 + 0.04]} material={glow}><boxGeometry args={[0.14, h, 0.05]} /></mesh>
      <mesh position={[gap / 2, h / 2, pd / 2 + 0.04]} material={glow}><boxGeometry args={[0.14, h, 0.05]} /></mesh>
      <mesh position={[0, h, pd / 2 + 0.04]} material={glow}><boxGeometry args={[gap, 0.14, 0.05]} /></mesh>
    </group>
  )
}

const towerGlow = new THREE.MeshBasicMaterial({ color: dim(colors.iceBlue, 1.6), toneMapped: false })
const towerBody = new THREE.MeshStandardMaterial({ color: '#08121F', emissive: colors.deepBlue, emissiveIntensity: 0.35, transparent: true, opacity: 0.85 })
/** 中央全息高塔 60m：细柱 + 发光环，全部便宜的自发光 */
function HoloTower() {
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[30, 3.2]} position={[0, 30, 0]} />
        <CylinderCollider args={[1.5, 6]} position={[0, 1.5, 0]} />
      </RigidBody>
      {/* 粗壮底座：两级台座 + 发光腰线 */}
      <mesh position={[0, 0.75, 0]}><cylinderGeometry args={[6, 6.4, 1.5, 24]} /><meshStandardMaterial color="#16253A" emissive={colors.deepBlue} emissiveIntensity={0.12} roughness={0.5} metalness={0.6} /></mesh>
      <mesh position={[0, 2.2, 0]}><cylinderGeometry args={[4.2, 5, 1.4, 24]} /><meshStandardMaterial color="#1A2C44" emissive={colors.deepBlue} emissiveIntensity={0.18} roughness={0.5} metalness={0.6} /></mesh>
      <mesh position={[0, 1.52, 0]} rotation={[Math.PI / 2, 0, 0]} material={towerGlow}><torusGeometry args={[6.05, 0.07, 6, 48]} /></mesh>
      <mesh position={[0, 2.92, 0]} rotation={[Math.PI / 2, 0, 0]} material={towerGlow}><torusGeometry args={[4.25, 0.07, 6, 48]} /></mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} position={[Math.sin(k * Math.PI / 2 + Math.PI / 4) * 3.3, 9, Math.cos(k * Math.PI / 2 + Math.PI / 4) * 3.3]} material={towerGlow}>
          <boxGeometry args={[0.25, 14, 0.25]} />
        </mesh>
      ))}
      <mesh position={[0, 30, 0]} material={towerBody}><cylinderGeometry args={[1.6, 3.2, 60, 12, 1, true]} /></mesh>
      {[4, 14, 26, 38, 50, 59].map((y, i) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={towerGlow}>
          <torusGeometry args={[3.4 - i * 0.3, 0.08, 6, 32]} />
        </mesh>
      ))}
      <mesh position={[0, 63, 0]} material={towerGlow}><octahedronGeometry args={[2.2]} /></mesh>
    </group>
  )
}

function HoloAd() {
  // 作品街尽头巨型全息广告（面朝南）
  const c = districts.portfolio
  return (
    <group position={[0, 0, -229]}>
      <RigidBody type="fixed" colliders={false}><CuboidCollider args={[9, 15, 0.8]} position={[0, 15, 0]} /></RigidBody>
      <mesh position={[0, 15, 0]}><boxGeometry args={[18, 30, 1.2]} /><meshStandardMaterial color="#0A1626" emissive={c.accent2} emissiveIntensity={0.18} /></mesh>
      <mesh position={[0, 16, 0.65]}><planeGeometry args={[16, 26]} /><meshBasicMaterial color={dim(c.accent2, 0.5)} toneMapped={false} transparent opacity={0.6} /></mesh>
      <Text position={[0, 22, 0.7]} fontSize={3.2} color={c.accent} anchorX="center">CARROLL</Text>
      <Text position={[0, 17, 0.7]} fontSize={1.6} color={c.accent} anchorX="center">PORTFOLIO</Text>
    </group>
  )
}

/** AI 摆摊区：路两侧占位摊位 + 灯笼（实例化） */
function makeStalls() {
  const stalls: Box[] = [], canopies: Box[] = [], lanterns: Box[] = []
  const amber = districts.aiStall.accent
  for (let x = 36; x <= 200; x += 9) {
    if (Math.abs(x - 75) < 12 || Math.abs(x - 130) < 8 || Math.abs(x - 180) < 8) continue // 让出路口
    for (const side of [-1, 1]) {
      const z = side * 8.6
      stalls.push({ p: [x, 1.1, z], s: [3.2, 2.2, 2.2] })
      canopies.push({ p: [x, 2.45, z - side * 0.3], s: [3.6, 0.12, 2.8], c: dim(amber, 0.55) })
      lanterns.push({ p: [x - 1.2, 2.1, z - side * 1.2], s: [0.35, 0.5, 0.35], c: dim(amber, 1.6) })
      lanterns.push({ p: [x + 1.2, 2.1, z - side * 1.2], s: [0.35, 0.5, 0.35], c: dim(amber, 1.6) })
    }
  }
  return { stalls, canopies, lanterns }
}

/** 地面：西南隧道处挖洞（视觉 Shape 带洞 + 碰撞体用隧道坐标系下 4 块旋转长方体拼接） */
function Ground({ G }: { G: number }) {
  const { dir, R0, W } = TUNNEL
  const R1 = TUNNEL_R1, hw = W / 2
  const geo = useMemo(() => {
    const S = G + 10
    const sh = new THREE.Shape([new THREE.Vector2(-S, -S), new THREE.Vector2(S, -S), new THREE.Vector2(S, S), new THREE.Vector2(-S, S)])
    const nx = -dir[1], nz = dir[0] // 隧道横向
    const pt = (u: number, v: number) => new THREE.Vector2(dir[0] * u + nx * v, -(dir[1] * u + nz * v)) // shape(x,y) → world(x, -z)
    sh.holes.push(new THREE.Path([pt(R0, -hw), pt(R0, hw), pt(R1, hw), pt(R1, -hw)]))
    return new THREE.ShapeGeometry(sh)
  }, [G, dir, R0, R1, hw])
  // 隧道坐标系：u 沿大道、v 横向；旋转使局部 +Z = dir
  const ry = Math.atan2(dir[0], dir[1])
  const E = 360
  return (
    <>
      <RigidBody type="fixed" colliders={false} rotation={[0, ry, 0]}>
        <CuboidCollider args={[(E - hw) / 2, 0.5, E]} position={[-(hw + (E - hw) / 2), -0.5, 0]} />
        <CuboidCollider args={[(E - hw) / 2, 0.5, E]} position={[hw + (E - hw) / 2, -0.5, 0]} />
        <CuboidCollider args={[hw, 0.5, (R0 + E) / 2]} position={[0, -0.5, (R0 - E) / 2]} />
        <CuboidCollider args={[hw, 0.5, (E - R1) / 2]} position={[0, -0.5, (R1 + E) / 2]} />
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={geo} material={groundMat} />
    </>
  )
}

export function City() {
  const { bodies, roofs, strips } = useMemo(buildCity, [])
  const { stalls, canopies, lanterns } = useMemo(makeStalls, [])
  const { edges, dashes, edgesDim } = useMemo(buildMarkings, [])
  const { props, glows } = useMemo(buildPlaza, []) // 旧放射分格线 tiles 已由石材 shader 取代
  const G = WORLD_HALF
  return (
    <group>
      {/* 地面 + 边界墙（车不会掉出世界） */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[G, 4, 1]} position={[0, 4, -G]} />
        <CuboidCollider args={[G, 4, 1]} position={[0, 4, G]} />
        <CuboidCollider args={[1, 4, G]} position={[-G, 4, 0]} />
        <CuboidCollider args={[1, 4, G]} position={[G, 4, 0]} />
        {/* 建筑 / 摊位碰撞体（显式盒子） */}
        {bodies.map((b, i) => <CuboidCollider key={i} args={[b.s[0] / 2, b.s[1] / 2, b.s[2] / 2]} position={b.p} />)}
        {props.map((b, i) => <CuboidCollider key={'p' + i} args={[b.s[0] / 2, b.s[1] / 2, b.s[2] / 2]} position={b.p} rotation={[0, b.ry ?? 0, 0]} />)}
        {stalls.map((b, i) => <CuboidCollider key={'s' + i} args={[b.s[0] / 2, b.s[1] / 2, b.s[2] / 2]} position={b.p} />)}
      </RigidBody>
      <Ground G={G} />
      <Boxes items={[
        { p: [0, 1.5, -G], s: [G * 2, 3, 0.6] }, { p: [0, 1.5, G], s: [G * 2, 3, 0.6] },
        { p: [-G, 1.5, 0], s: [0.6, 3, G * 2] }, { p: [G, 1.5, 0], s: [0.6, 3, G * 2] },
      ]} material={edgeMat} />

      {/* 路网 */}
      {rings.map((rg) => (
        <mesh key={rg.r} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat(rg.r, rg.w, ringDim(rg))}>
          <ringGeometry args={[rg.r - rg.w / 2, rg.r + rg.w / 2, ringDim(rg) ? 256 : 128]} />
        </mesh>
      ))}
      {segs.map((s, i) => s.virtual ? null : <SegRoad key={i} s={s} y={0.025 + (s.w < 9 ? 0.003 : 0)} />)}
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} material={plazaMat}><circleGeometry args={[PLAZA_R, 64]} /></mesh>
      <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[PLAZA_R - 0.5, PLAZA_R - 0.25, 96]} />
        <meshBasicMaterial color={dim(colors.iceBlue, 0.32)} toneMapped={false} /> // 广场外圈压暗，减同心圆抢眼
      </mesh>
      {/* 环路内侧虚线感的细光圈 */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[74.9, 75.1, 160]} />
        <meshBasicMaterial color={dim(colors.iceBlue, 0.45)} toneMapped={false} />
      </mesh>

      <Boxes items={edges} material={edgeLineMat} />
      <Boxes items={dashes} material={dashMat} />
      <Boxes items={edgesDim} material={edgeLineDimMat} />
      <Boxes items={props} material={bodyMat} />
      <Boxes items={glows} material={glowMat} />
      {/* 建筑（实例化）+ 灯带 + 导向带 + 箭头 */}
      <Boxes items={bodies} material={bodyMat} />
      <Boxes items={roofs} material={glowMat} />
      <Boxes items={strips} material={glowMat} />
      {/* 出生点前方流光小箭头（替换原白色大 V 箭头） */}
      <SpawnArrows paths={SPAWN_ARROW_PATHS} />
      <Signposts />
      <LandmarkBeacons />
      <Boxes items={stalls} material={bodyMat} />
      <Boxes items={canopies} material={glowMat} />
      <Boxes items={lanterns} material={glowMat} />


      <HoloTower />
      <HoloAd />
      <GateFrame position={[208, 0, 0]} rotationY={-Math.PI / 2} color={districts.aiStall.accent} gap={13} h={9} />
      <GateFrame position={[-208, 0, 0]} rotationY={Math.PI / 2} color={districts.hidden.accent} gap={11} h={11} />
      <GateFrame position={[0, 0, 208]} rotationY={Math.PI} color={colors.iceBlue} gap={7.4} h={14} />
      {/* 隐藏关卡入口：彩蛋岔路尽头的小薄荷门 */}
      <GateFrame position={[-48, 0, -66]} rotationY={-Math.PI / 2} color={districts.hidden.accent} gap={7} h={6} />

      <Structures />
      <group position={[0, 0, STREET_ORIGIN_Z]}>
        <PortfolioStreet />
      </group>
    </group>
  )
}

export type { DistrictId }
