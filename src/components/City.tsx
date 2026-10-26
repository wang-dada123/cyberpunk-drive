import { useLayoutEffect, useMemo, useRef } from 'react'
import { ConvexHullCollider, CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { makeAsphalt, makePlazaStone, SpawnArrows } from './GroundFX'
import { Signposts, LandmarkBeacons } from './Nav'
import { NAV, SPAWN_PATHS, END_TOWER } from '../data/nav'
const SPAWN_ARROW_PATHS = SPAWN_PATHS.map((p) => ({ pts: p.pts, color: NAV[p.id].color }))
import { colors, districts, type DistrictId } from '../theme/colors'
import { PLAZA_R, WORLD_HALF, rings, segs, roadClearance, districtAt, distSeg, ringDim, TUNNEL, TUNNEL_R1, type Seg } from '../data/mapLayout'
import { Structures } from './Structures'
import { Buildings, TrimStrips, measureFacades, type Prism, type Trim } from './Buildings'
import { neonEnvTex } from '../utils/look'
import { outerLayout, innerLayout, area as polyArea, type Poly } from '../data/outerLayout'
const cen = (P: Poly): [number, number] => { let x = 0, z = 0; for (const [a, b] of P) { x += a / P.length; z += b / P.length } return [x, z] }
import { Signs, type SignSpec } from './Signs'
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

/** 建筑排布 v2（硬规则）：11m 方格无抖动、只 0/90°；沿轴向道路统一退线 1.5m；
 *  楼间缝只允许 0（贴死）或 ≥8m；路口楼切 3m 角（L 形两盒）；碎块(<4m)直接去掉 */
export const SETBACK = 1.5, MIN_GAP = 8, CHAMFER = 3
type Rect = [number, number, number, number] // x0 x1 z0 z1
export function layoutBlocks() {
  const cells: { r: Rect; cut: [number, number] }[] = []
  const H = 5.5, STEP = 11
  const axis = segs.filter((s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 1 && (Math.abs(s.a[0] - s.b[0]) < 1e-3 || Math.abs(s.a[1] - s.b[1]) < 1e-3))
  for (let gx = -WORLD_HALF + 8; gx <= WORLD_HALF - 8; gx += STEP) {
    for (let gz = -WORLD_HALF + 8; gz <= WORLD_HALF - 8; gz += STEP) {
      const r: Rect = [gx - H, gx + H, gz - H, gz + H]
      if (gx > 25 && Math.abs(gz) - H < 11.5 && Math.abs(gz) < 25) continue // 让出 AI 摊位带
      let ok = true, cx = 0, cz = 0
      for (const sg of axis) {
        const vert = Math.abs(sg.a[0] - sg.b[0]) < 1e-3 // 沿 z 走
        const c = vert ? sg.a[0] : sg.a[1], half = sg.w / 2 + SETBACK
        const lo = Math.min(vert ? sg.a[1] : sg.a[0], vert ? sg.b[1] : sg.b[0]) - sg.w / 2 - SETBACK
        const hi = Math.max(vert ? sg.a[1] : sg.a[0], vert ? sg.b[1] : sg.b[0]) + sg.w / 2 + SETBACK
        const [a0, a1, b0, b1] = vert ? [r[0], r[1], r[2], r[3]] : [r[2], r[3], r[0], r[1]]
        if (b1 <= lo || b0 >= hi || a1 <= c - half || a0 >= c + half) continue
        const mid = (a0 + a1) / 2
        if (Math.abs(mid - c) < half) { ok = false; break }
        if (mid > c) { if (vert) { r[0] = c + half; cx = -1 } else { r[2] = c + half; cz = -1 } }
        else { if (vert) { r[1] = c - half; cx = 1 } else { r[3] = c - half; cz = 1 } }
      }
      if (!ok || r[1] - r[0] < 4 || r[3] - r[2] < 4) continue
      // 斜路/环路/结构区：边界采样净距 ≥ 退线
      let clear = true
      for (let t = 0; t <= 1.0001 && clear; t += 1 / 11) for (const [x, z] of [[r[0] + (r[1] - r[0]) * t, r[2]], [r[0] + (r[1] - r[0]) * t, r[3]], [r[0], r[2] + (r[3] - r[2]) * t], [r[1], r[2] + (r[3] - r[2]) * t]]) if (roadClearance(x, z) < SETBACK - 0.05) { clear = false; break }
      if (clear) cells.push({ r, cut: [cx, cz] })
    }
  }
  const out = cells.flatMap((c, g) => chamferBoxes(c.r, c.cut).map((r, k) => ({ r, g, main: k === 0 })))
  // 缝修正（切角后）：任意两楼 0<间距<8 → 去掉面积小的，直到没有
  const gap = (a: Rect, b: Rect) => Math.hypot(Math.max(0, a[0] - b[1], b[0] - a[1]), Math.max(0, a[2] - b[3], b[2] - a[3]))
  const area = (a: Rect) => (a[1] - a[0]) * (a[3] - a[2])
  for (let changed = true; changed;) {
    changed = false
    for (let i = 0; i < out.length && !changed; i++) for (let j = i + 1; j < out.length; j++) {
      const g = gap(out[i].r, out[j].r)
      if (g > 0.01 && g < MIN_GAP) { out.splice(area(out[i].r) < area(out[j].r) ? i : j, 1); changed = true; break }
    }
  }
  return out
}
/** 路口切角：两侧都退线的楼拆成 L 形两盒（缺 3×3 角） */
export function chamferBoxes(r: Rect, cut: [number, number]): Rect[] {
  const [cx, cz] = cut
  if (!cx || !cz || r[1] - r[0] < CHAMFER + 3 || r[3] - r[2] < CHAMFER + 3) return [r]
  const zc = cz > 0 ? r[3] - CHAMFER : r[2] + CHAMFER, xc = cx > 0 ? r[1] - CHAMFER : r[0] + CHAMFER
  const A: Rect = cz > 0 ? [r[0], r[1], r[2], zc] : [r[0], r[1], zc, r[3]]
  const B: Rect = cx > 0 ? [r[0], xc, cz > 0 ? zc : r[2], cz > 0 ? r[3] : zc] : [xc, r[1], cz > 0 ? zc : r[2], cz > 0 ? r[3] : zc]
  return [A, B]
}

const WIN: Record<string, [string, number]> = { alley: ['#4FC3F7', 0.55], portfolio: ['#00B0FF', 0.7], hidden: ['#64FFDA', 0.6], aiStall: ['#4FC3F7', 0.5] }
const winCol = (x: number, z: number) => { const [c, k] = WIN[districtAt(x, z)] ?? WIN.alley; return new THREE.Color(c).multiplyScalar(k) }
const pickMat = (u: number) => (u < 0.35 ? 0 : u < 0.75 ? 1 : 2) // 金属 35% / 混凝土 40% / 玻璃 25%
function buildCity() {
  const r = rng(7)
  const bodies: Box[] = []
  const roofs: Box[] = []
  const strips: Box[] = []
  const trims: Trim[] = []
  const prisms: Prism[] = []
  const signs: SignSpec[] = []
  const signN = new Map<string, number>()
  const WORDS = ['NEON', 'RAMEN', 'HOTEL', 'DATA', 'BAR', 'CYBER', 'NOODLE', 'ARCADE', 'SYNC', 'MOTEL']
  const plots: { poly: [number, number][]; h: number }[] = []
  // v4：内圈也按街坊整块（innerLayout，与外圈同一套扇区网格），每区 ≤8 块；外圈 outerLayout
  const inner = innerLayout()
  const byD = new Map<string, Poly[]>()
  for (const P of inner) { const [cx, cz] = cen(P), d = districtAt(cx, cz); if (!byD.has(d)) byD.set(d, []); byD.get(d)!.push(P) }
  const innerKeep: Poly[] = []
  for (const L of byD.values()) innerKeep.push(...L.sort((p, q) => polyArea(q) - polyArea(p)).slice(0, 8))
  const EAVE = ['#E8F4FF', '#4FC3F7']
  const addBlock = (poly: Poly, h: number, seed: number, isInner: boolean) => {
    const [cx, cz] = cen(poly), did = districtAt(cx, cz)
    prisms.push({ poly, h, mat: pickMat(r()), win: winCol(cx, cz), seed })
    plots.push({ poly, h })
    // 屋顶檐线 + 离地 4.6m 腰线，截面 4×4cm，转角各伸 2cm 接上。强度在 TrimStrips 里按距离 2.2→1.4
    const c = EAVE[r() < 0.5 ? 0 : 1]
    const ys = [h - 0.02]
    if (h > 5.2) ys.push(4.6)
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue
      let nx = b[1] - a[1], nz = -(b[0] - a[0]); nx /= L; nz /= L
      if (nx * ((a[0] + b[0]) / 2 - cx) + nz * ((a[1] + b[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz }
      for (const y of ys) trims.push({ p: [(a[0] + b[0]) / 2 + nx * 0.04, y, (a[1] + b[1]) / 2 + nz * 0.04], s: [0.04, 0.04, L + 0.04], ry: Math.atan2(b[0] - a[0], b[1] - a[1]), color: c, k: 2.2, fade: true })
    }
    // 内圈：最长边朝路一侧挂招牌（每区 ≤6）
    const n = signN.get(did) ?? 0
    if (isInner && n < 3 && h > 9) {
      let bi = 0, bl = 0
      for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > bl) { bl = L; bi = k } }
      const a = poly[bi], b = poly[(bi + 1) % poly.length]
      let nx = b[1] - a[1], nz = -(b[0] - a[0]); nx /= bl; nz /= bl
      if (nx * ((a[0] + b[0]) / 2 - cx) + nz * ((a[1] + b[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz }
      signN.set(did, n + 1)
      const word = WORDS[(signs.length * 3 + 1) % WORDS.length], t = 0.3 + 0.4 * r()
      signs.push({ p: [a[0] + (b[0] - a[0]) * t + nx * 0.35, Math.min(h - 1.5, 3.2 + word.length * 0.31), a[1] + (b[1] - a[1]) * t + nz * 0.35], ry: Math.atan2(nx, nz), text: word })
    }
  }
  innerKeep.forEach((P, i) => { const [cx, cz] = cen(P); addBlock(P, 10 + r() * 14 + Math.min(Math.hypot(cx, cz) / 8, 14) * r(), 300 + i, true) })
  outerLayout().forEach((P, i) => addBlock(P, 14 + r() * 16 + r() * 10, 500 + i, false))
  { // 作品街尽端实体塔 ≥80m：与其它楼同一套三段立面 + 竖窗（作品街 #00B0FF ×0.70）。腰线每 12m，#00B0FF ×1.8，不随近距离压暗
    const T = END_TOWER, poly: Poly = [[T.x0, T.z1], [T.x1, T.z1], [T.x1, T.z0], [T.x0, T.z0]]
    addBlock(poly, T.h, 990, false)
    const midZ = (T.z0 + T.z1) / 2
    for (let y = 12; y < T.h - 4; y += 12) for (let k = 0; k < 4; k++) {
      const a = poly[k], b = poly[(k + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1])
      let nx = b[1] - a[1], nz = -(b[0] - a[0]); nx /= L; nz /= L
      if (nx * ((a[0] + b[0]) / 2) + nz * ((a[1] + b[1]) / 2 - midZ) < 0) { nx = -nx; nz = -nz }
      trims.push({ p: [(a[0] + b[0]) / 2 + nx * 0.04, y, (a[1] + b[1]) / 2 + nz * 0.04], s: [0.04, 0.04, L + 0.04], ry: Math.atan2(b[0] - a[0], b[1] - a[1]), color: '#00B0FF', k: 1.8, fade: false })
    }
  }
  if (import.meta.env.DEV) Object.assign(window, { __bodies: bodies, __segs: segs, __plots: plots, __facadeMix: measureFacades(prisms), __trimN: trims.length })
  // 路面导向光带：沿有 guide 的街道中线
  for (const s of segs) {
    if (!s.guide) continue
    const [ax, az] = s.a, [bx, bz] = s.b
    const len = Math.hypot(bx - ax, bz - az)
    const ry = Math.atan2(bx - ax, bz - az)
    strips.push({ p: [(ax + bx) / 2, 0.06, (az + bz) / 2], s: [0.16, 0.04, len], ry, c: dim(districts[s.guide].accent, 0.35) })
  }
  return { bodies, roofs, strips, trims, prisms, plots, signs }
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
        dashes.push({ p: [x, 0.055, z], s: [0.12, 0.03, DASH_LEN], ry })
      }
    }
  })
  rings.forEach((rg, ri) => {
    const rad = rg.r, step = DASH_LEN + DASH_GAP
    const n = Math.floor((2 * Math.PI * rad) / step)
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2, da = DASH_LEN / 2 / rad
      if (![a - da, a, a + da].every((b) => dashOk(Math.sin(b) * rad, Math.cos(b) * rad, 1000 + ri))) continue
      dashes.push({ p: [Math.sin(a) * rad, 0.055, Math.cos(a) * rad], s: [0.12, 0.03, DASH_LEN], ry: a + Math.PI / 2 })
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
const dashMat = new THREE.MeshStandardMaterial({ color: '#E8F4FF', emissive: '#E8F4FF', emissiveIntensity: 0.3, roughness: 0.6, metalness: 0 }) // b4 车道白线 #E8F4FF / emissive 0.3 / 宽 12cm
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

// b4：塔身改回不透明深色体 + 窗格（emissiveMap），腰线 ×1.8，光柱透明度 0.35
const towerGlow = new THREE.MeshBasicMaterial({ color: dim(colors.iceBlue, 1.8), toneMapped: false })
const towerBeam = new THREE.MeshBasicMaterial({ color: dim(colors.iceBlue, 1.2), toneMapped: false, transparent: true, opacity: 0.35, depthWrite: false })
const towerWin = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d')!
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128); let s = 3; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) { const on = rnd() < 0.35; g.fillStyle = on ? '#9FD8F5' : '#0A1420'; g.fillRect(x * 8 + 2, y * 8 + 1, 5, 6) }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace; return t
})()
const towerBody = new THREE.MeshStandardMaterial({ color: '#0C1826', roughness: 0.35, metalness: 0.7, envMap: neonEnvTex, envMapIntensity: 1.0, emissive: '#ffffff', emissiveMap: towerWin, emissiveIntensity: 0.6 })
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
        <mesh key={k} position={[Math.sin(k * Math.PI / 2 + Math.PI / 4) * 3.3, 9, Math.cos(k * Math.PI / 2 + Math.PI / 4) * 3.3]} material={towerBeam}>
          <boxGeometry args={[0.25, 14, 0.25]} />
        </mesh>
      ))}
      <mesh position={[0, 30, 0]} material={towerBody}><cylinderGeometry args={[1.6, 3.2, 60, 12, 1, false]} /></mesh>
      {[4, 14, 26, 38, 50, 59].map((y, i) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={towerGlow}>
          <torusGeometry args={[3.45 - i * 0.3, 0.16, 6, 32]} />
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
    <group position={[-17, 0, -229]}>{/* b4 补：左移 17m，让开尽端塔 */}
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
    if (Math.abs(x - 75) < 12 || Math.abs(x - 152) < 8 || Math.abs(x - 180) < 8) continue // 让出路口
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
  const { bodies, strips, trims, prisms, plots, signs } = useMemo(buildCity, [])
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
        {plots.map((pl, i) => <ConvexHullCollider key={'o' + i} args={[new Float32Array(pl.poly.flatMap(([x, z]) => [x, 0, z, x, pl.h, z]))]} />)}
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
      <Buildings list={prisms} />
      <Signs list={signs} />
      <TrimStrips items={trims} />
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
