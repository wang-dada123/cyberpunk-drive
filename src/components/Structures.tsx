import { useMemo } from 'react'
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier'
import { TriMeshFlags } from '@dimforge/rapier3d-compat'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { colors } from '../theme/colors'
import { BRIDGE, TUNNEL, TUNNEL_R1, bridgeHeight, tunnelDepth, eggs, GARAGE, garageRampA, garageRampB, SPIRAL, spiralH, spiralFrame } from '../data/mapLayout'

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
const mergeG = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs)!
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


/** 焊接重复顶点 → 相邻条带共享边，FIX_INTERNAL_EDGES 才能把拼缝当内部边处理（不磕） */
function weld(st: Strip) {
  const map = new Map<string, number>(), pos: number[] = [], remap: number[] = []
  for (let i = 0; i < st.pos.length / 3; i++) {
    const k = st.pos.slice(i * 3, i * 3 + 3).map((v) => Math.round(v * 1000)).join(',')
    let j = map.get(k)
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(st.pos[i * 3], st.pos[i * 3 + 1], st.pos[i * 3 + 2]) }
    remap.push(j)
  }
  return { v: new Float32Array(pos), i: new Uint32Array(flipTri(st.idx.map((k) => remap[k]))) }
}
const range = (a: number, b: number, step = 1) => { const o: number[] = []; const n = Math.max(1, Math.round(Math.abs(b - a) / step)); for (let i = 0; i <= n; i++) o.push(a + (b - a) * i / n); return o }
/** 板底：顶面 ribbon 下移 0.3m（翻面） */
const under = (st: Strip, dst: Strip) => { const b = dst.pos.length / 3; for (let i = 0; i < st.pos.length; i += 3) dst.pos.push(st.pos[i], st.pos[i + 1] - 0.3, st.pos[i + 2]); dst.idx.push(...flipTri(st.idx).map((k) => k + b)) }
const amberGlow = new THREE.MeshBasicMaterial({ color: dim('#FFB74D', 1.0), toneMapped: false, side: THREE.DoubleSide })
const mintGlow = new THREE.MeshBasicMaterial({ color: dim('#64FFDA', 0.85), toneMapped: false, side: THREE.DoubleSide })
const garageDeckMat = deckMat.clone()
// 螺旋：俯视时用裁剪面切掉车上方的环（常数 1e4 = 不裁剪，避免切换重编译）
export const spiralClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4)
const spiralDeckMat = deckMat.clone(), spiralWallMat = wallMat.clone(), spiralGlow = mintGlow.clone()
for (const m of [spiralDeckMat, spiralWallMat, spiralGlow]) m.clippingPlanes = [spiralClip]
/** 停车场楼层可见性（俯视档：车在下层时隐藏上层楼板，FollowCamera 控制） */
export const garageLevels: { l1: THREE.Object3D | null; l2: THREE.Object3D | null } = { l1: null, l2: null }

function Garage() {
  const { HU, HV, LANE, A0 } = GARAGE
  const g = useMemo(() => {
    const L1 = newStrip(), L2 = newStrip(), col = newStrip(), walls = newStrip(), rails = newStrip(), u1 = newStrip(), u2 = newStrip()
    const deck = (dst: Strip, u: number[], v0: number, v1: number, h: (u: number) => number) => {
      const a = u.map((x) => [v0, h(x) + 0.02, x]), b = u.map((x) => [v1, h(x) + 0.02, x])
      ribbon(dst, a, b); ribbon(col, a, b)
    }
    const U = range(-HU, HU)
    deck(L1, U, -LANE, LANE, () => 4)
    deck(L1, range(A0 - 6, HU), -HV, -LANE, garageRampA)
    deck(L2, U, LANE, HV, garageRampB)
    deck(L2, U, -HV, -LANE, () => 8); deck(L2, U, -LANE, LANE, () => 8)
    under(L1, u1); under(L2, u2)
    // 墙：沿 u 或 v 的折线，bot/top 为参数函数；顶边加发光护栏线
    const wallU = (v: number, u0: number, u1_: number, bot: (u: number) => number, top: (u: number) => number, glow = true) => {
      const us = range(u0, u1_)
      ribbon(walls, us.map((u) => [v, bot(u), u]), us.map((u) => [v, top(u), u]))
      if (glow) ribbon(rails, us.map((u) => [v * 0.998, top(u) - 0.1, u]), us.map((u) => [v * 0.998, top(u), u]))
    }
    const wallV = (u: number, v0: number, v1: number, bot: number, top: number, glow = true) => {
      ribbon(walls, [[v0, bot, u], [v1, bot, u]], [[v0, top, u], [v1, top, u]])
      if (glow) ribbon(rails, [[v0, top - 0.1, u * 0.999], [v1, top - 0.1, u * 0.999]], [[v0, top, u * 0.999], [v1, top, u * 0.999]])
    }
    const c = (k: number) => () => k
    // A 道（地面→1 层）
    wallU(-HV, A0, GARAGE.A1, c(-0.1), (u) => garageRampA(u) + 1.1)
    wallU(-LANE, A0, GARAGE.A1, c(-0.1), c(5.1))
    wallV(GARAGE.A1, -HV, -LANE, -0.1, 3.7, false)
    wallU(-HV, GARAGE.A1, HU, c(3.7), c(5.1))
    // 1 层周边
    wallV(HU, -HV, HV, 3.7, 5.1); wallV(-HU, -LANE, LANE, 3.7, 5.1)
    // B 道（1 层→2 层）
    wallU(LANE, GARAGE.B1, GARAGE.B0, c(3.7), c(9.1))
    wallU(HV, GARAGE.B1, GARAGE.B0, c(3.7), (u) => garageRampB(u) + 1.1)
    wallU(HV, GARAGE.B0, HU, c(3.7), c(5.1)); wallU(HV, -HU, GARAGE.B1, c(7.7), c(9.1))
    // 2 层（屋顶）周边
    wallU(-HV, -HU, HU, c(7.7), c(9.1)); wallV(HU, -HV, LANE, 7.7, 9.1); wallV(-HU, -HV, HV, 7.7, 9.1)
    wallU(LANE, GARAGE.B0, HU, c(7.7), c(9.1))
    const cw = weld(col)
    const wv = new Float32Array(walls.pos), wi = new Uint32Array(walls.idx)
    const m1 = toGeo(L1), m2 = toGeo(L2)
    const mg1 = mergeG([m1, toGeo(u1)]), mg2 = mergeG([m2, toGeo(u2)])
    return { cw, wv, wi, l1: mg1, l2: mg2, walls: toGeo(walls), rails: toGeo(rails) }
  }, [HU, HV, LANE, A0])
  const ry = Math.atan2(GARAGE.d[0], GARAGE.d[1])
  // 局部轴：three 的 group 旋转 ry 后，本地 +Z → d，本地 +X → (cos ry, -sin ry)；需 = n
  const cols: [number, number][] = [[-31.6, 4.4], [31.6, -4], [31.6, 4], [31.6, -12], [31.6, 12], [-31.6, 12], [0, 12], [0, -12], [-31.5, -12.5]]
  return (
    <group position={[GARAGE.c[0], 0, GARAGE.c[1]]} rotation={[0, ry, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider args={[g.cw.v, g.cw.i, TriMeshFlags.FIX_INTERNAL_EDGES] as never} /><TrimeshCollider args={[g.wv, g.wi]} />
        {cols.map(([u, v]) => <CuboidCollider key={`${u},${v}`} args={[0.4, 3.85, 0.4]} position={[v, 3.85, u]} />)}
      </RigidBody>
      <group userData={{ dynamic: true }}>
        <mesh ref={(o) => { garageLevels.l1 = o }} geometry={g.l1} material={garageDeckMat} />
        <mesh ref={(o) => { garageLevels.l2 = o }} geometry={g.l2} material={garageDeckMat} />
      </group>
      <mesh geometry={g.walls} material={wallMat} />
      <mesh geometry={g.rails} material={bridgeGlow} />
      {cols.map(([u, v]) => <mesh key={`${u},${v}`} position={[v, 3.85, u]} material={wallMat}><boxGeometry args={[0.8, 7.7, 0.8]} /></mesh>)}
      {/* 琥珀色只点在出入口：A 道入口门楣 + 屋顶出口 */}
      <mesh position={[-(HV + LANE) / 2, 3.3, -HU]} material={amberGlow}><boxGeometry args={[HV - LANE, 0.12, 0.12]} /></mesh>
      <mesh position={[-(HV + LANE) / 2, 0.03, A0 - 4]} rotation={[-Math.PI / 2, 0, 0]} material={amberGlow}><planeGeometry args={[HV - LANE - 1, 0.25]} /></mesh>
      <mesh position={[(HV + LANE) / 2, 8.05, GARAGE.B1 - 2]} rotation={[-Math.PI / 2, 0, 0]} material={amberGlow}><planeGeometry args={[HV - LANE - 1, 0.25]} /></mesh>
    </group>
  )
}

function Spiral() {
  const { L, W, ROOF, ROOF_W, LEAD, c } = SPIRAL
  const g = useMemo(() => {
    const deck = newStrip(), walls = newStrip(), rails = newStrip(), und = newStrip()
    const ss = range(-LEAD, L + ROOF, 0.4)
    const hw = (s: number) => s <= L ? W / 2 : W / 2 + (ROOF_W - W) / 2 * Math.min(1, (1 - Math.cos(Math.PI * Math.min(1, (s - L) / 6))) / 2)
    const P = (s: number, off: number, y: number) => { const f = spiralFrame(s); return [f.p[0] + f.N[0] * off, y, f.p[1] + f.N[1] * off] }
    const h = (s: number) => spiralH(s) + 0.02
    // 径向 4 分：相邻条带共享顶点（weld），减小螺旋面扭曲带来的折痕（上行颠簸）
    const RK = [1, 0.5, 0, -0.5, -1]
    for (let k = 0; k < RK.length - 1; k++) ribbon(deck, ss.map((s) => P(s, RK[k] * hw(s), h(s))), ss.map((s) => P(s, RK[k + 1] * hw(s), h(s))))
    under(deck, und)
    const twoPi = 2 * Math.PI * SPIRAL.R
    const ws = ss.filter((s) => s >= 0)
    // 内侧墙：螺旋段落到地面（中心芯筒封死）；屋顶段只做护栏。外侧：有上一圈覆盖/高处时离地 ≥3.5m 留净空（引道从下穿过）
    const innerBot = (s: number) => s <= L ? -0.1 : spiralH(s) - 1.2
    const outerBot = (s: number) => (s > L || spiralH(s) > 7 || s > twoPi) ? spiralH(s) - 3.5 : -0.1
    ribbon(walls, ws.map((s) => P(s, -hw(s), innerBot(s))), ws.map((s) => P(s, -hw(s), h(s) + 1.1)))
    ribbon(walls, ws.map((s) => P(s, hw(s), outerBot(s))), ws.map((s) => P(s, hw(s), h(s) + 1.1)))
    for (const k of [-1, 1]) ribbon(rails, ws.map((s) => P(s, k * hw(s) * 0.995, h(s) + 1.0)), ws.map((s) => P(s, k * hw(s) * 0.995, h(s) + 1.12)))
    // 径向挡墙：h=7 处，防止从外侧净空钻到低处坡底
    const s7 = ss.find((s) => spiralH(s) >= 7)!
    ribbon(walls, [P(s7, -W / 2, -0.1), P(s7, W / 2, -0.1)], [P(s7, -W / 2, spiralH(s7) - 0.3), P(s7, W / 2, spiralH(s7) - 0.3)])
    // 屋顶尽端护栏
    const e = L + ROOF
    ribbon(walls, [P(e, -ROOF_W / 2, 11), P(e, ROOF_W / 2, 11)], [P(e, -ROOF_W / 2, 13.1), P(e, ROOF_W / 2, 13.1)])
    ribbon(rails, [P(e - 0.05, -ROOF_W / 2, 13.0), P(e - 0.05, ROOF_W / 2, 13.0)], [P(e - 0.05, -ROOF_W / 2, 13.12), P(e - 0.05, ROOF_W / 2, 13.12)])
    const cw = weld(deck)
    const cols = [L + 9, L + 19].flatMap((s) => [-1, 1].map((k) => P(s, k * (ROOF_W / 2 - 0.6), 0)))
    return { cw, wv: new Float32Array(walls.pos), wi: new Uint32Array(walls.idx), deck: mergeG([toGeo(deck), toGeo(und)]), walls: toGeo(walls), rails: toGeo(rails), cols }
  }, [L, W, ROOF, ROOF_W, LEAD])
  const coreR = SPIRAL.R - W / 2 - 0.15
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider args={[g.cw.v, g.cw.i, TriMeshFlags.FIX_INTERNAL_EDGES] as never} /><TrimeshCollider args={[g.wv, g.wi]} />
        {g.cols.map((p, i) => <CuboidCollider key={i} args={[0.45, 5.85, 0.45]} position={[p[0], 5.85, p[2]]} />)}
      </RigidBody>
      <mesh geometry={g.deck} material={spiralDeckMat} />
      <mesh geometry={g.walls} material={spiralWallMat} />
      <mesh geometry={g.rails} material={spiralGlow} />
      {g.cols.map((p, i) => <mesh key={i} position={[p[0], 5.85, p[2]]} material={spiralWallMat}><boxGeometry args={[0.9, 11.7, 0.9]} /></mesh>)}
      <mesh position={[c[0], 6.6, c[1]]} material={spiralWallMat}><cylinderGeometry args={[coreR, coreR, 13.2, 20, 1, true]} /></mesh>
      <mesh position={[c[0], 13.2, c[1]]} rotation={[-Math.PI / 2, 0, 0]} material={spiralWallMat}><circleGeometry args={[coreR, 20]} /></mesh>
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
      <Garage />
      <Spiral />
      <Eggs />
    </>
  )
}
