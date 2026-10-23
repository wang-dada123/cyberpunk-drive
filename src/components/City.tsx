import type { ReactNode } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { colors } from '../theme/colors'
import { MeshReflectorMaterial, createInstances } from '@react-three/drei'
import * as THREE from 'three'

// 单次 draw call 的实例化装饰（无碰撞）
const [StripInstances, Strip] = createInstances()
const [DashInstances, Dash] = createInstances()
const [WireInstances, Wire] = createInstances()
const [SignInstances, Sign] = createInstances()
const STRIP_COLOR = new THREE.Color(colors.iceBlue).multiplyScalar(1.0)
const SIGN_ICE = new THREE.Color(colors.iceBlue).multiplyScalar(1.0)
const SIGN_WHITE = new THREE.Color(colors.coldWhite).multiplyScalar(0.8)
import { isMobile } from '../utils/isMobile'
import { PortfolioStreet } from './PortfolioStreet'

type NeonBoxProps = {
  position: [number, number, number]
  size: [number, number, number]
  emissive?: string
  intensity?: number
  strips?: boolean
}

function NeonBuilding({
  position,
  size,
  emissive = colors.iceBlue,
  intensity = 1.55,
  strips = true,
}: NeonBoxProps) {
  const [w, h, d] = size
  return (
    <RigidBody type="fixed" colliders={false} position={position} restitution={0.05}>
      <CuboidCollider args={[w / 2, h / 2, d / 2]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={colors.building}
          emissive={emissive}
          emissiveIntensity={strips ? 0.06 : intensity}
          metalness={0.45}
          roughness={0.45}
        />
      </mesh>
      <mesh position={[0, h / 2 + 0.08, 0]}>
        <boxGeometry args={[w * 0.9, 0.12, d * 0.9]} />
        <meshStandardMaterial color={emissive} emissive={emissive} emissiveIntensity={1.5} />
      </mesh>
      {strips &&
        [-1, 1].flatMap((sx) =>
          [-0.28, 0.28].map((fz) => (
            <Strip
              key={`${sx}${fz}`}
              position={[sx * (w / 2 + 0.03), 0, fz * d]}
              scale={[0.04, h * 0.85, 0.04]}
              color={STRIP_COLOR}
            />
          )),
        )}
    </RigidBody>
  )
}

/** 路尽头发光地标：双柱 + 横梁门框，加粗有体量 */
function NeonGate({
  position,
  rotationY = 0,
  emissive,
}: {
  position: [number, number, number]
  rotationY?: number
  emissive: string
}) {
  const pillarH = 14
  const pillarW = 2.2
  const pillarD = 2.4
  const gap = 7.6
  const lintelH = 1.6
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <NeonBuilding
        position={[-gap / 2 - pillarW / 2, pillarH / 2, 0]}
        size={[pillarW, pillarH, pillarD]}
        emissive={emissive}
        intensity={0.9}
        strips={false}
      />
      <NeonBuilding
        position={[gap / 2 + pillarW / 2, pillarH / 2, 0]}
        size={[pillarW, pillarH, pillarD]}
        emissive={emissive}
        intensity={0.9}
        strips={false}
      />
      <NeonBuilding
        position={[0, pillarH + lintelH / 2, 0]}
        size={[gap + pillarW * 2, lintelH, pillarD * 0.85]}
        emissive={emissive}
        intensity={0.8}
        strips={false}
      />
      {/* 门框后方一块挡板，增加纵深 */}
      <NeonBuilding
        position={[0, 4, 2.2]}
        size={[gap + 1.5, 10, 1.2]}
        emissive={emissive}
        intensity={0.04}
        strips={false}
      />
      {/* 背板细发光内框（开口轮廓） */}
      <Strip position={[0, 4, 1.55]} scale={[gap, 0.08, 0.05]} color={SIGN_ICE} />
      <Strip position={[0, 8.6, 1.55]} scale={[gap, 0.08, 0.05]} color={SIGN_ICE} />
    </group>
  )
}

function RoadStrip({
  position,
  width,
  length,
  rotationY = 0,
  emissive = colors.iceBlue,
}: {
  position: [number, number, number]
  width: number
  length: number
  rotationY?: number
  emissive?: string
}) {
  const curbW = 0.28
  const half = width / 2
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 路面 */}
      <mesh position={[0, 0.02, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, length]} />
        {isMobile ? (
          <meshStandardMaterial color={colors.road} metalness={0.6} roughness={0.35} />
        ) : (
          <MeshReflectorMaterial
            color={colors.road}
            metalness={0.6}
            roughness={0.35}
            resolution={512}
            blur={[200, 60]}
            mixBlur={1}
            mixStrength={1.2}
            mirror={0.75}
            depthScale={0}
          />
        )}
      </mesh>
      {/* 冷白虚线中线（实例化） */}
      {Array.from({ length: Math.floor(length / 3.2) }, (_, k) => (
        <Dash key={k} position={[0, 0.035, -length / 2 + 1.6 + k * 3.2]} />
      ))}
      {/* 左右路缘 */}
      <mesh position={[-half + curbW / 2, 0.06, 0]}>
        <boxGeometry args={[curbW, 0.12, length]} />
        <meshStandardMaterial
          color="#1A1F27"
          emissive={emissive}
          emissiveIntensity={0.9}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[half - curbW / 2, 0.06, 0]}>
        <boxGeometry args={[curbW, 0.12, length]} />
        <meshStandardMaterial
          color="#1A1F27"
          emissive={emissive}
          emissiveIntensity={0.9}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
    </group>
  )
}

type RowSpec = {
  /** 沿路本地 z（路朝 -Z 时为负方向的正长度偏移用负值） */
  z: number
  h: number
  w?: number
  d?: number
  side: 'L' | 'R' | 'both'
  color: 'deepBlue' | 'iceBlue' | 'coldWhite'
}

const PALETTE = {
  deepBlue: colors.deepBlue,
  iceBlue: colors.iceBlue,
  coldWhite: colors.coldWhite,
} as const

/** 沿一条朝本地 -Z 的路两侧密排建筑（本地坐标，外层 group 负责旋转） */
function AlleyBuildings({
  rows,
  setback = 4.4,
}: {
  rows: RowSpec[]
  setback?: number
}) {
  const nodes: ReactNode[] = []
  rows.forEach((row, i) => {
    const w = row.w ?? 2.8 + (i % 3) * 0.35
    const d = row.d ?? 2.6 + (i % 2) * 0.4
    const em = PALETTE[row.color]
    const intensity = 1.25 + (i % 4) * 0.15
    const mk = (x: number, key: string) => (
      <NeonBuilding
        key={key}
        position={[x, row.h / 2, row.z]}
        size={[w, row.h, d]}
        emissive={em}
        intensity={intensity}
      />
    )
    if (row.side === 'L' || row.side === 'both') {
      nodes.push(mk(-setback, `L-${i}-${row.z}`))
    }
    if (row.side === 'R' || row.side === 'both') {
      nodes.push(mk(setback, `R-${i}-${row.z}`))
    }
  })
  // 头顶电线 + 横跨招牌（无碰撞，均在车顶以上）
  const span = setback * 2
  for (let z = -10, k = 0; z >= -42; z -= 8, k++) {
    nodes.push(<Wire key={`w${z}`} position={[0, 9 + (k % 3) * 1.3, z]} scale={[span, 0.04, 0.04]} />)
    nodes.push(<Wire key={`w2${z}`} position={[0, 11.5 + (k % 2), z - 3]} scale={[span, 0.03, 0.03]} />)
    if (k % 2 === 1) {
      nodes.push(
        <Sign key={`s${z}`} position={[(k % 4 === 1 ? -1 : 1) * 1.2, 6.5, z + 1]} scale={[3.2, 0.9, 0.12]} color={k % 4 === 1 ? SIGN_ICE : SIGN_WHITE} />,
      )
    }
  }
  return <group>{nodes}</group>
}

function makeDenseRows(startZ: number, endZ: number, step: number): RowSpec[] {
  const rows: RowSpec[] = []
  let i = 0
  for (let z = startZ; z >= endZ; z -= step) {
    const colorsCycle: Array<RowSpec['color']> = ['iceBlue', 'deepBlue', 'iceBlue', 'coldWhite']
    rows.push({
      z,
      h: 8 + ((i * 7) % 13),
      w: 2.6 + (i % 3) * 0.45,
      d: 2.4 + (i % 2) * 0.5,
      side: 'both',
      color: colorsCycle[i % colorsCycle.length],
    })
    i++
  }
  return rows
}

/**
 * 雨夜夹道感灰模：小广场被建筑围住，三条窄主路（约 5.5）两侧密排楼。
 * 地面 / 建筑均显式 CuboidCollider。
 */
export function City() {
  const ROAD_W = 7
  // 最宽楼 3.5m：5.6 - 1.75 = 3.85 > 3.5 + 路缘，不压路
  const SETBACK = 5.6
  const northRows = makeDenseRows(-8, -44, 3.15)
  const seRows = makeDenseRows(-8, -40, 3.2)
  const swRows = makeDenseRows(-8, -40, 3.2)

  // 广场围合：一圈矮/高错落建筑
  // 广场围合：放在三条巷之间的空隙方向（NE / NW / S），不挡路口
  const gapDirs: Array<[number, number]> = [
    [Math.sqrt(3) / 2, -0.5],
    [-Math.sqrt(3) / 2, -0.5],
    [0, 1],
  ]
  const ringC: Array<keyof typeof PALETTE> = ['iceBlue', 'deepBlue', 'coldWhite']
  const plazaRing: Array<{ pos: [number, number, number]; size: [number, number, number]; c: keyof typeof PALETTE }> = []
  const fillers: Array<{ pos: [number, number, number]; size: [number, number, number]; c: keyof typeof PALETTE }> = []
  gapDirs.forEach(([dx, dz], i) => {
    const h = 9 + i * 2.5
    plazaRing.push({ pos: [dx * 7.2, h / 2, dz * 7.2], size: [3, h, 3], c: ringC[i] })
    const h2 = 14 + i * 2
    fillers.push({ pos: [dx * 20, h2 / 2, dz * 20], size: [3.4, h2, 3.4], c: ringC[(i + 1) % 3] })
  })

  return (
    <StripInstances limit={1000} frames={Infinity} frustumCulled={false}>
      <boxGeometry />
      <meshBasicMaterial toneMapped={false} />
    <DashInstances limit={60} frames={Infinity} frustumCulled={false}>
      <boxGeometry args={[0.16, 0.02, 1.6]} />
      <meshStandardMaterial color={colors.coldWhite} emissive={colors.coldWhite} emissiveIntensity={0.5} />
    <WireInstances limit={60} frames={Infinity} frustumCulled={false}>
      <boxGeometry />
      <meshBasicMaterial color="#1A2636" />
    <SignInstances limit={20} frames={Infinity} frustumCulled={false}>
      <boxGeometry />
      <meshBasicMaterial toneMapped={false} />
    <group>
      {/* 厚地面 */}
      <RigidBody type="fixed" colliders={false} friction={1.8} restitution={0}>
        <CuboidCollider args={[60, 0.5, 60]} position={[0, -0.5, 0]} friction={1.8} />
        <mesh position={[0, -0.5, 0]} receiveShadow>
          <boxGeometry args={[120, 1, 120]} />
          <meshStandardMaterial
            color={colors.ground}
            metalness={0.55}
            roughness={0.3}
            emissive={colors.coldWhite}
            emissiveIntensity={0.06}
          />
        </mesh>
      </RigidBody>

      {/* 缩小中央广场 + 围合感 */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[4.2, 40]} />
        <meshStandardMaterial
          color="#121822"
          emissive={colors.deepBlue}
          emissiveIntensity={0.08}
          metalness={0.55}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.3, 2.42, 48]} />
        <meshStandardMaterial color={colors.iceBlue} emissive={colors.iceBlue} emissiveIntensity={0.7} />
      </mesh>

      {plazaRing.map((b, i) => (
        <NeonBuilding
          key={`plaza-${i}`}
          position={b.pos}
          size={b.size}
          emissive={PALETTE[b.c]}
          intensity={1.45}
        />
      ))}

      {/* 北向窄巷（作品区） */}
      <RoadStrip
        position={[0, 0.03, -26]}
        width={ROAD_W}
        length={42}
        emissive={colors.iceBlue}
      />
      <group>
        <AlleyBuildings rows={northRows} setback={SETBACK} />
      </group>

      {/* 东南斜巷 */}
      <group rotation={[0, (-Math.PI * 2) / 3, 0]}>
        <RoadStrip
          position={[0, 0.03, -24]}
          width={ROAD_W}
          length={40}
          emissive={colors.deepBlue}
        />
        <AlleyBuildings rows={seRows} setback={SETBACK} />
        {/* 作品街（东南斜巷） */}
        <PortfolioStreet />
      </group>

      {/* 西南斜巷 */}
      <group rotation={[0, (Math.PI * 2) / 3, 0]}>
        <RoadStrip
          position={[0, 0.03, -24]}
          width={ROAD_W}
          length={40}
          emissive={colors.iceBlue}
        />
        <AlleyBuildings rows={swRows} setback={SETBACK} />
      </group>

      {/* 路尽头发光门框地标（加粗） */}
      <NeonGate position={[0, 0, -48]} rotationY={0} emissive={colors.deepBlue} />
      <NeonGate position={[38, 0, 22]} rotationY={(-Math.PI * 2) / 3} emissive={colors.iceBlue} />
      <NeonGate position={[-38, 0, 22]} rotationY={(Math.PI * 2) / 3} emissive={colors.coldWhite} />

      {fillers.map((b, i) => (
        <NeonBuilding key={`fill-${i}`} position={b.pos} size={b.size} emissive={PALETTE[b.c]} intensity={1.3} />
      ))}
    </group>
    </SignInstances>
    </WireInstances>
    </DashInstances>
    </StripInstances>
  )
}
