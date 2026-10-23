import { useLayoutEffect, useMemo, useRef } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { colors, districts, type DistrictId } from '../theme/colors'
import { PLAZA_R, WORLD_HALF, rings, segs, signs, roadClearance, districtAt, distSeg, type Seg } from '../data/mapLayout'
import { PortfolioStreet, STREET_ORIGIN_Z } from './PortfolioStreet'

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
const roadMat = new THREE.MeshStandardMaterial({ color: '#121C2A', roughness: 0.5, metalness: 0.6 })
const plazaMat = new THREE.MeshStandardMaterial({ color: '#0C1624', roughness: 0.4, metalness: 0.5 })
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
function buildMarkings() {
  const edges: Box[] = [], dashes: Box[] = []
  const E = 2 // 边线分段长度
  segs.forEach((s, i) => {
    const [ax, az] = s.a, [bx, bz] = s.b
    const len = Math.hypot(bx - ax, bz - az)
    const ux = (bx - ax) / len, uz = (bz - az) / len
    const ry = Math.atan2(ux, uz)
    for (let t = E / 2; t < len; t += E) {
      for (const k of [-1, 1]) {
        const x = ax + ux * t + uz * k * (s.w / 2 - 0.25), z = az + uz * t - ux * k * (s.w / 2 - 0.25)
        if (!onOther(x, z, i)) edges.push({ p: [x, 0.055, z], s: [0.12, 0.03, E], ry })
      }
      // 主路（≥10m）中心虚线：3m 实 / 3m 空
      if (s.w >= 10 && !s.guide && Math.floor(t / 3) % 2 === 0) {
        const x = ax + ux * t, z = az + uz * t
        if (!onOther(x, z, i)) dashes.push({ p: [x, 0.055, z], s: [0.18, 0.03, E * 0.9], ry })
      }
      if (s.guide && s.w >= 12 && Math.floor(t / 3) % 2 === 0) {
        for (const k of [-1, 1]) { // 有导向带的主街：两条车道虚线
          const x = ax + ux * t + uz * k * s.w / 4, z = az + uz * t - ux * k * s.w / 4
          if (!onOther(x, z, i)) dashes.push({ p: [x, 0.055, z], s: [0.14, 0.03, E * 0.9], ry })
        }
      }
    }
  })
  rings.forEach((rg, ri) => {
    for (const rad of [rg.r - rg.w / 2 + 0.25, rg.r + rg.w / 2 - 0.25, rg.r]) {
      const center = rad === rg.r
      const n = Math.round((2 * Math.PI * rad) / E)
      for (let j = 0; j < n; j++) {
        if (center && j % 3 !== 0) continue
        const a = (j / n) * Math.PI * 2
        const x = Math.sin(a) * rad, z = Math.cos(a) * rad
        if (onOther(x, z, 1000 + ri)) continue
        ;(center ? dashes : edges).push({ p: [x, 0.055, z], s: [center ? 0.18 : 0.12, 0.03, E * (center ? 0.9 : 1.02)], ry: a + Math.PI / 2 })
      }
    }
  })
  return { edges, dashes }
}
const edgeLineMat = new THREE.MeshBasicMaterial({ color: dim(colors.iceBlue, 0.55), toneMapped: false })
const dashMat = new THREE.MeshBasicMaterial({ color: dim(colors.coldWhite, 0.45), toneMapped: false })

// ---------- 广场 ----------
const plazaLineMat = new THREE.MeshBasicMaterial({ color: dim(colors.iceBlue, 0.3), toneMapped: false })
function buildPlaza() {
  const tiles: Box[] = [], props: Box[] = [], glows: Box[] = []
  // 放射分格线（避开出生点车道）
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2
    const r0 = 7, r1 = PLAZA_R - 1
    const m = (r0 + r1) / 2
    tiles.push({ p: [Math.sin(a) * m, 0.05, Math.cos(a) * m], s: [0.08, 0.02, r1 - r0], ry: a })
  }
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
  return { tiles, props, glows }
}
function PlazaFloor() {
  return (
    <>
      {[7, 13, 19.5].map((r) => (
        <mesh key={r} position={[0, 0.048, 0]} rotation={[-Math.PI / 2, 0, 0]} material={plazaLineMat}>
          <ringGeometry args={[r - 0.12, r + 0.12, 96]} />
        </mesh>
      ))}
      {/* 内圈深色石材 + 外圈拼砖色差 */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[13, 19.5, 96]} />
        <meshStandardMaterial color="#17243A" roughness={0.45} metalness={0.5} />
      </mesh>
    </>
  )
}

// ---------- 路面 ----------
function SegRoad({ s, y }: { s: Seg; y: number }) {
  const [ax, az] = s.a, [bx, bz] = s.b
  const len = Math.hypot(bx - ax, bz - az) + s.w * 0.5
  const ry = Math.atan2(bx - ax, bz - az)
  return (
    <mesh position={[(ax + bx) / 2, y, (az + bz) / 2]} rotation={[-Math.PI / 2, 0, ry]} material={roadMat}>
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
    <group position={[0, 0, -160]}>
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
  for (let x = 36; x <= 140; x += 9) {
    if (Math.abs(x - 75) < 12 || Math.abs(x - 102) < 8 || Math.abs(x - 130) < 8) continue // 让出路口
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

export function City() {
  const { bodies, roofs, strips } = useMemo(buildCity, [])
  const { stalls, canopies, lanterns } = useMemo(makeStalls, [])
  const { edges, dashes } = useMemo(buildMarkings, [])
  const { tiles, props, glows } = useMemo(buildPlaza, [])
  // 冷白地面箭头（V 形，指向各街出口）：广场边缘 + 环路路口
  const arrows = useMemo<Box[]>(() => {
    const out: Box[] = []
    const c = dim(colors.coldWhite, 0.9)
    for (const R of [24, 66]) for (const [dx, dz] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
      const yaw = Math.atan2(dx, dz) // 箭头指向
      for (const k of [-1, 1]) {
        const a = yaw + k * 0.7
        out.push({ p: [dx * R - Math.sin(a) * 0.9 + k * 0 , 0.07, dz * R - Math.cos(a) * 0.9], s: [0.35, 0.04, 2.2], ry: a, c })
      }
    }
    return out
  }, [])
  const G = WORLD_HALF
  return (
    <group>
      {/* 地面 + 边界墙（车不会掉出世界） */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[G + 10, 0.5, G + 10]} position={[0, -0.5, 0]} />
        <CuboidCollider args={[G, 4, 1]} position={[0, 4, -G]} />
        <CuboidCollider args={[G, 4, 1]} position={[0, 4, G]} />
        <CuboidCollider args={[1, 4, G]} position={[-G, 4, 0]} />
        <CuboidCollider args={[1, 4, G]} position={[G, 4, 0]} />
        {/* 建筑 / 摊位碰撞体（显式盒子） */}
        {bodies.map((b, i) => <CuboidCollider key={i} args={[b.s[0] / 2, b.s[1] / 2, b.s[2] / 2]} position={b.p} />)}
        {props.map((b, i) => <CuboidCollider key={'p' + i} args={[b.s[0] / 2, b.s[1] / 2, b.s[2] / 2]} position={b.p} rotation={[0, b.ry ?? 0, 0]} />)}
        {stalls.map((b, i) => <CuboidCollider key={'s' + i} args={[b.s[0] / 2, b.s[1] / 2, b.s[2] / 2]} position={b.p} />)}
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={groundMat}><planeGeometry args={[G * 2 + 20, G * 2 + 20]} /></mesh>
      <Boxes items={[
        { p: [0, 1.5, -G], s: [G * 2, 3, 0.6] }, { p: [0, 1.5, G], s: [G * 2, 3, 0.6] },
        { p: [-G, 1.5, 0], s: [0.6, 3, G * 2] }, { p: [G, 1.5, 0], s: [0.6, 3, G * 2] },
      ]} material={edgeMat} />

      {/* 路网 */}
      {rings.map((rg) => (
        <mesh key={rg.r} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={roadMat}>
          <ringGeometry args={[rg.r - rg.w / 2, rg.r + rg.w / 2, 128]} />
        </mesh>
      ))}
      {segs.map((s, i) => <SegRoad key={i} s={s} y={0.025 + (s.w < 9 ? 0.003 : 0)} />)}
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} material={plazaMat}><circleGeometry args={[PLAZA_R, 64]} /></mesh>
      <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[PLAZA_R - 0.5, PLAZA_R - 0.25, 96]} />
        <meshBasicMaterial color={dim(colors.iceBlue, 1.2)} toneMapped={false} />
      </mesh>
      {/* 环路内侧虚线感的细光圈 */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[74.9, 75.1, 160]} />
        <meshBasicMaterial color={dim(colors.iceBlue, 0.45)} toneMapped={false} />
      </mesh>

      <Boxes items={edges} material={edgeLineMat} />
      <Boxes items={dashes} material={dashMat} />
      <PlazaFloor />
      <Boxes items={tiles} material={plazaLineMat} />
      <Boxes items={props} material={bodyMat} />
      <Boxes items={glows} material={glowMat} />
      {/* 建筑（实例化）+ 灯带 + 导向带 + 箭头 */}
      <Boxes items={bodies} material={bodyMat} />
      <Boxes items={roofs} material={glowMat} />
      <Boxes items={strips} material={glowMat} />
      <Boxes items={arrows} material={glowMat} />
      <Boxes items={stalls} material={bodyMat} />
      <Boxes items={canopies} material={glowMat} />
      <Boxes items={lanterns} material={glowMat} />

      {/* 路口路牌（冷白 + 街区色） */}
      {signs.map((s, i) => (
        <group key={i} position={[s.p[0], 0, s.p[1]]} rotation={[0, s.rot, 0]}>
          <mesh position={[0, 2.5, 0]}><boxGeometry args={[0.15, 5, 0.15]} /><meshBasicMaterial color={dim(colors.coldWhite, 0.4)} /></mesh>
          <Text position={[0, 5.4, 0.1]} fontSize={0.9} color={s.color} anchorX="center" outlineWidth={0.02} outlineColor="#02060C">{s.text}</Text>
        </group>
      ))}

      <HoloTower />
      <HoloAd />
      <GateFrame position={[147, 0, 0]} rotationY={-Math.PI / 2} color={districts.aiStall.accent} gap={13} h={9} />
      <GateFrame position={[-147, 0, 0]} rotationY={Math.PI / 2} color={districts.hidden.accent} gap={11} h={11} />
      <GateFrame position={[0, 0, 147]} rotationY={Math.PI} color={colors.iceBlue} gap={7.4} h={14} />
      {/* 隐藏关卡入口：彩蛋岔路尽头的小薄荷门 */}
      <GateFrame position={[-48, 0, -66]} rotationY={-Math.PI / 2} color={districts.hidden.accent} gap={7} h={6} />

      <group position={[0, 0, STREET_ORIGIN_Z]}>
        <PortfolioStreet />
      </group>
    </group>
  )
}

export type { DistrictId }
