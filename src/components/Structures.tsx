import { useMemo } from 'react'
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier'
import { TriMeshFlags } from '@dimforge/rapier3d-compat'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { colors } from '../theme/colors'
import { BRIDGE, TUNNEL, TUNNEL_R1, bridgeHeight, tunnelDepth, eggs } from '../data/mapLayout'

/**
 * 第一批过渡带结构：A 东北天桥、C 西南下沉隧道 + 彩蛋占位。
 * 坡面 = 1m 采样的余弦曲线（坡脚/坡顶切线水平 = 过渡圆弧），整条连续 trimesh，无拼缝；
 * 两侧护栏/侧墙同属一个 trimesh，车不会卡边或钻到坡下。
 */
type Strip = { pos: number[]; idx: number[] }
const newStrip = (): Strip => ({ pos: [], idx: [] })
/** 在两条等长折线 a、b 之间铺四边形带 */
function ribbon(out: Strip, a: number[][], b: number[][]) {
  const base = out.pos.length / 3
  for (let i = 0; i < a.length; i++) out.pos.push(...a[i], ...b[i])
  for (let i = 0; i < a.length - 1; i++) {
    const k = base + i * 2
    out.idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
  }
}
const flipTri = (idx: number[]) => idx.map((_, i, a) => a[i - (i % 3) + [0, 2, 1][i % 3]])
function toGeo(s: Strip) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3))
  g.setIndex(s.idx)
  g.computeVertexNormals()
  return g
}
const dim = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k)
const deckMat = new THREE.MeshStandardMaterial({ color: '#0F1826', roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide })
const wallMat = new THREE.MeshStandardMaterial({ color: '#0B1420', roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide })
const bridgeGlow = new THREE.MeshBasicMaterial({ color: dim('#00B0FF', 0.9), toneMapped: false, side: THREE.DoubleSide })
const tunnelGlow = new THREE.MeshBasicMaterial({ color: dim(colors.iceBlue, 1.1), toneMapped: false, side: THREE.DoubleSide })
/** 隧道顶板：俯视档隐藏，其余档半透明（FollowCamera 控制） */
export const tunnelRoofMat = new THREE.MeshStandardMaterial({ color: '#0A1220', roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.92, side: THREE.DoubleSide })
export const tunnelRoof: { current: THREE.Object3D | null } = { current: null }

function Bridge() {
  const { c, dir, H, W, FLAT, RAMP } = BRIDGE
  const L = FLAT / 2 + RAMP
  const { deck, walls, rails, colV, colI, wallV, wallI } = useMemo(() => {
    const deck = newStrip(), walls = newStrip(), rails = newStrip()
    const hw = W / 2, ss: number[] = []
    for (let s = -L - 3; s <= L + 3 + 1e-6; s += 1) ss.push(s)
    const h = ss.map((s) => bridgeHeight(s) + 0.02)
    ribbon(deck, ss.map((s, i) => [-hw, h[i], s]), ss.map((s, i) => [hw, h[i], s]))
    // 侧墙：桥下跨大道处（|s|<9）只做 1.1m 护栏，其余一直落到地面（不让车钻进坡下）
    const ws = ss.filter((s) => Math.abs(s) <= L)
    for (const x of [-hw, hw]) {
      const top = ws.map((s) => [x, bridgeHeight(s) + 1.1, s])
      const bot = ws.map((s) => [x, Math.abs(s) < 9 ? bridgeHeight(s) - 0.6 : -0.1, s])
      ribbon(walls, bot, top)
      ribbon(rails, ws.map((s) => [x * 0.985, bridgeHeight(s) + 1.0, s]), ws.map((s) => [x * 0.985, bridgeHeight(s) + 1.12, s]))
    }
    const colV = new Float32Array(deck.pos)
    const colI = new Uint32Array(flipTri(deck.idx)) // 接地面单独一条：法线朝上 + FIX_INTERNAL_EDGES，防三角边缘磕碰
    const wallV = new Float32Array(walls.pos), wallI = new Uint32Array(walls.idx)
    return { deck: toGeo(deck), walls: toGeo(walls), rails: toGeo(rails), colV, colI, wallV, wallI }
  }, [W, L])
  const ry = Math.atan2(dir[0], dir[1])
  const PH = H - 0.6
  return (
    <group position={[c[0], 0, c[1]]} rotation={[0, ry, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider args={[colV, colI, TriMeshFlags.FIX_INTERNAL_EDGES] as never /* r3-rapier 类型未声明第三参 flags，运行时透传 */} /><TrimeshCollider args={[wallV, wallI]} />
        {[-1, 1].flatMap((a) => [-1, 1].map((b) => (
          <CuboidCollider key={`${a}${b}`} args={[0.5, PH / 2, 0.5]} position={[a * 2.8, PH / 2, b * 7]} />
        )))}
      </RigidBody>
      <mesh geometry={deck} material={deckMat} />
      <mesh geometry={walls} material={wallMat} />
      <mesh geometry={rails} material={bridgeGlow} />
      <mesh position={[0, H - 0.3, 0]} material={wallMat}><boxGeometry args={[W, 0.56, FLAT + 2]} /></mesh>
      {[-1, 1].flatMap((a) => [-1, 1].map((b) => (
        <mesh key={`${a}${b}`} position={[a * 2.8, PH / 2, b * 7]} material={wallMat}><boxGeometry args={[1, PH, 1]} /></mesh>
      )))}
      {/* 桥腹冰蓝灯线，给桥下大道一点节奏 */}
      <mesh position={[0, H - 0.62, 0]} rotation={[Math.PI / 2, 0, 0]} material={bridgeGlow}><planeGeometry args={[0.2, FLAT]} /></mesh>
    </group>
  )
}

function Tunnel() {
  const { dir, R0, W, DEPTH } = TUNNEL
  const R1 = TUNNEL_R1
  const { floor, walls, colV, colI, wallV, wallI, roofU, lights } = useMemo(() => {
    const floor = newStrip(), walls = newStrip()
    const hw = W / 2, us: number[] = []
    for (let u = R0 - 3; u <= R1 + 3 + 1e-6; u += 1) us.push(u)
    ribbon(floor, us.map((u) => [-hw, tunnelDepth(u) + 0.02, u]), us.map((u) => [hw, tunnelDepth(u) + 0.02, u]))
    const ws = us.filter((u) => u >= R0 && u <= R1)
    for (const x of [-hw, hw]) ribbon(walls, ws.map((u) => [x, tunnelDepth(u) - 0.1, u]), ws.map((u) => [x, 1.0, u]))
    const colV = new Float32Array(floor.pos)
    const colI = new Uint32Array(flipTri(floor.idx)) // 接地面单独一条：法线朝上 + FIX_INTERNAL_EDGES，防三角边缘磕碰
    const wallV = new Float32Array(walls.pos), wallI = new Uint32Array(walls.idx)
    // 顶板只盖净高不足处（地面以下 ≥3.6m 的区段）
    const roofU: [number, number] = [R0 + 30, R1 - 30]
    const lights: number[] = []
    for (let u = roofU[0] + 2; u < roofU[1]; u += 4) lights.push(u)
    return { floor: toGeo(floor), walls: toGeo(walls), colV, colI, wallV, wallI, roofU, lights }
  }, [R0, R1, W])
  const ry = Math.atan2(dir[0], dir[1])
  const rl = roofU[1] - roofU[0], rm = (roofU[0] + roofU[1]) / 2
  return (
    <group rotation={[0, ry, 0]}>
      <RigidBody type="fixed" colliders={false}><TrimeshCollider args={[colV, colI, TriMeshFlags.FIX_INTERNAL_EDGES] as never /* r3-rapier 类型未声明第三参 flags，运行时透传 */} /><TrimeshCollider args={[wallV, wallI]} /></RigidBody>
      <mesh geometry={floor} material={deckMat} />
      <mesh geometry={walls} material={wallMat} />
      {/* 地面上的护栏发光边 */}
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * W / 2, 1.02, (R0 + R1) / 2]} material={tunnelGlow}><boxGeometry args={[0.1, 0.06, R1 - R0]} /></mesh>
      ))}
      <group ref={(o) => { tunnelRoof.current = o }}>
        <mesh position={[0, 0.06, rm]} rotation={[-Math.PI / 2, 0, 0]} material={tunnelRoofMat}><planeGeometry args={[W, rl]} /></mesh>
        {lights.map((u) => (
          <mesh key={u} position={[0, -0.05, u]} material={tunnelGlow}><boxGeometry args={[W * 0.6, 0.06, 0.25]} /></mesh>
        ))}
      </group>
      {/* 隧道底部中线冰蓝点 */}
      <mesh position={[0, -DEPTH + 0.04, rm]} rotation={[-Math.PI / 2, 0, 0]} material={tunnelGlow}><planeGeometry args={[0.12, rl + 20]} /></mesh>
    </group>
  )
}

function Eggs() {
  return (
    <>
      {eggs.map((e) => (
        <group key={e.id} position={e.p}>
          <mesh><octahedronGeometry args={[0.45]} /><meshBasicMaterial color={dim(e.color, 1.4)} toneMapped={false} wireframe /></mesh>
          <Text position={[0, 0.9, 0]} fontSize={0.35} color={e.color} anchorX="center" visible={false} onSync={(t: { visible: boolean }) => { t.visible = true }} /* 未排版完成前 instanceCount=Infinity，会让 info.triangles 变 Infinity */>{e.label}</Text>
        </group>
      ))}
    </>
  )
}

export function Structures() {
  return (
    <>
      <Bridge />
      <Tunnel />
      <Eggs />
    </>
  )
}
