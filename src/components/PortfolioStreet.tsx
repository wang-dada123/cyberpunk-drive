import { AB } from '../utils/tier'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { districts } from '../theme/colors'
const D = districts.portfolio
import { projects, type Project } from '../data/projects'
import { carPose } from './Car'

/* ---------- 共享状态（3D ↔ HTML） ---------- */
let active: number | null = null
let open = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const subscribe = (f: () => void) => (subs.add(f), () => subs.delete(f))
const setActive = (i: number | null) => {
  if (i !== active) {
    active = i
    if (i === null) open = false
    emit()
  }
}
const setOpen = (v: boolean) => {
  open = v && active !== null
  emit()
}
const useActive = () => useSyncExternalStore(subscribe, () => active)
const useOpen = () => useSyncExternalStore(subscribe, () => open)

/* ---------- 布局（本地坐标：巷子朝 -Z，路宽 7，楼内侧 ≥3.85） ---------- */
export const STREET_ROT_Y = 0 // v2：北向作品展示街
export const STREET_ORIGIN_Z = -30 // 局部原点（广场北缘外）
const BOARD_W = 3
const BOARD_H = 4.5
const BOARD_T = 0.16
const BOARD_X = 7.45 // 路缘 3.5 与楼面 3.85 之间，不压路
const BOARD_Y = 0.5 + BOARD_H / 2
const RING_X = 3.8
const RING_R = 1.4
const ZS = [-4, -16, -28, -58, -84, -92] // 世界 z -34…-122，避开环路(-75)与后巷(-104)路口

type Slot = { x: number; z: number; side: 1 | -1; p: Project }
const slots: Slot[] = ZS.flatMap((z, k) =>
  ([-1, 1] as const).map((side, s) => ({ x: side * BOARD_X, z, side, p: projects[(k * 2 + s) % projects.length] })),
)

// 共享材质
const frameMat = new THREE.MeshStandardMaterial({ color: '#0A111C', emissive: D.accent2, emissiveIntensity: 0.05, metalness: 0.5, roughness: 0.4 })
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#64FFDA').multiplyScalar(0.8), toneMapped: false }) // 低于 Bloom 阈值
// 细虚线圈（视觉半径 0.9m，触发半径仍为 RING_R）：20 段弧合并为一个几何
const ringGeo = mergeGeometries(Array.from({ length: 20 }, (_, i) => new THREE.RingGeometry(0.87, 0.9, 4, 1, (i / 20) * Math.PI * 2, (Math.PI * 2) / 20 * 0.55)))!

const THUMB_W = 2.6
const THUMB_H = THUMB_W * (9 / 16)

/* 12 块展板的正面（文字/描边/缩略图/标签）全部预绘到一张 Canvas 图集 → 1 个合并网格 1 次 draw call；
   边框合并 1 次；激活高亮为 1 个加色叠片。原实现约 18 draw/块（troika 文字每段 1 次）。 */
const ATL_S = 160 // px / m
const CW = Math.ceil(BOARD_W * ATL_S), CH = Math.ceil(BOARD_H * ATL_S), COLS = 4
function drawFace(g: CanvasRenderingContext2D, ox: number, oy: number, p: Project) {
  const S = ATL_S
  const X = (x: number) => ox + (x + BOARD_W / 2) * S, Y = (y: number) => oy + (BOARD_H / 2 - y) * S
  const rect = (cx: number, cy: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(X(cx - w / 2), Y(cy + h / 2), w * S, h * S) }
  const text = (t: string, cx: number, cy: number, size: number, c: string, maxW = 2.8, ls = 0) => {
    g.fillStyle = c; g.font = `600 ${Math.round(size * S)}px Inter, 'Segoe UI', system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
    ;(g as unknown as { letterSpacing: string }).letterSpacing = `${(ls * size * S).toFixed(1)}px`
    // 简单换行
    const words = t.split(' '), lines: string[] = []; let cur = ''
    for (const w of words) { const n = cur ? cur + ' ' + w : w; if (g.measureText(n).width > maxW * S && cur) { lines.push(cur); cur = w } else cur = n }
    lines.push(cur)
    lines.forEach((l, i) => g.fillText(l, X(cx), Y(cy) + (i - (lines.length - 1) / 2) * size * 1.15 * S))
  }
  const out = '#3BC8FF'
  rect(0, 0, BOARD_W, BOARD_H, '#0A111C')
  rect(0, 0, BOARD_W - 0.12, BOARD_H - 0.12, '#0D2236')
  const ow = 0.04
  rect(0, BOARD_H / 2 - ow / 2, BOARD_W, ow, out); rect(0, -BOARD_H / 2 + ow / 2, BOARD_W, ow, out)
  rect(-BOARD_W / 2 + ow / 2, 0, ow, BOARD_H, out); rect(BOARD_W / 2 - ow / 2, 0, ow, BOARD_H, out)
  text(p.title.replace(' (placeholder)', '').toUpperCase(), 0, 1.75, 0.34, D.accent, 2.7, 0.04)
  text('PLACEHOLDER', 0, 1.38, 0.11, D.accent2)
  rect(0, 0.15, THUMB_W + 0.06, THUMB_H + 0.06, out); rect(0, 0.15, THUMB_W, THUMB_H, '#13304A')
  text('THUMBNAIL 16:9', 0, 0.15, 0.14, D.accent2)
  p.tags.forEach((t, i) => {
    const x = (i - (p.tags.length - 1) / 2) * 1.0
    rect(x, -1.6, 0.9, 0.36, out); rect(x, -1.6, 0.86, 0.32, '#0F1E2E')
    text(t.toUpperCase(), x, -1.6, 0.15, D.accent, 0.84)
  })
}
const FACE_Z = BOARD_T / 2 + 0.01
function boardMatrix(s: Slot, z = 0) {
  const rotY = s.side === -1 ? Math.PI / 2 : -Math.PI / 2 // 面朝路中
  return new THREE.Matrix4().compose(new THREE.Vector3(s.x, BOARD_Y, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, z))
}
function buildBoards() {
  const rows = Math.ceil(slots.length / COLS)
  const cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * rows
  const g = cv.getContext('2d')!
  const faces: THREE.BufferGeometry[] = [], frames: THREE.BufferGeometry[] = []
  slots.forEach((s, i) => {
    const c = i % COLS, r = Math.floor(i / COLS)
    drawFace(g, c * CW, r * CH, s.p)
    const pg = new THREE.PlaneGeometry(BOARD_W, BOARD_H), uv = pg.attributes.uv
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (c + uv.getX(k) * (CW - 1) / CW + 0.5 / CW) / COLS, 1 - (r + (1 - uv.getY(k)) * (CH - 1) / CH + 0.5 / CH) / rows)
    pg.applyMatrix4(boardMatrix(s, FACE_Z)); faces.push(pg)
    const bg = new THREE.BoxGeometry(BOARD_W, BOARD_H, BOARD_T); bg.applyMatrix4(boardMatrix(s)); frames.push(bg)
  })
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  const faceMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  const rings = mergeGeometries(slots.map((s) => ringGeo.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(s.side * RING_X, 0.06, s.z).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)))))!
  return { rings, face: mergeGeometries(faces)!, frame: mergeGeometries(frames)!, faceMat }
}
const glowMat = new THREE.MeshBasicMaterial({ color: D.accent2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
const glowGeo = new THREE.PlaneGeometry(BOARD_W - 0.12, BOARD_H - 0.12)

function Boards() {
  const b = useMemo(buildBoards, [])
  const act = useActive()
  const glow = useRef<THREE.Mesh>(null)
  const last = useRef(0)
  if (act !== null) last.current = act
  useFrame((_, dt) => {
    const m = glow.current; if (!m) return
    const target = act !== null ? 0.3 : 0
    glowMat.opacity += (target - glowMat.opacity) * (1 - Math.exp(-dt * 9))
    m.visible = glowMat.opacity > 0.004
    if (m.userData.at !== last.current) { m.userData.at = last.current; m.matrix.copy(boardMatrix(slots[last.current], FACE_Z + 0.004)); m.matrixWorldNeedsUpdate = true }
  })
  return (
    <group>
      <mesh geometry={b.frame} material={frameMat} />
      <mesh geometry={b.face} material={b.faceMat} />
      <mesh ref={glow} geometry={glowGeo} material={glowMat} matrixAutoUpdate={false} visible={false} />
      {slots.map((s, i) => (
        <RigidBody key={i} type="fixed" colliders={false} position={[s.x, BOARD_Y, s.z]} rotation={[0, s.side === -1 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <CuboidCollider args={[BOARD_W / 2, BOARD_H / 2, BOARD_T / 2]} />
        </RigidBody>
      ))}
      {!AB.has('ring') && <mesh geometry={b.rings} material={ringMat} />}
    </group>
  )
}

/** 展示光环世界坐标 + 半径（供 City 生成虚线时避让） */
export const SHOWCASE_RING_R = RING_R
export const showcaseRingsWorld: Array<[number, number]> = slots.map((s) => {
  const v = new THREE.Vector3(s.side * RING_X, 0, s.z).applyMatrix4(new THREE.Matrix4().makeRotationY(STREET_ROT_Y))
  return [v.x, v.z + STREET_ORIGIN_Z]
})

/** 放入东南斜巷 group（已旋转）内部，使用本地坐标 */
export function PortfolioStreet() {
  const worldRings = useMemo(() => {
    const m = new THREE.Matrix4().makeRotationY(STREET_ROT_Y)
    return slots.map((s) => new THREE.Vector3(s.side * RING_X, 0, s.z).applyMatrix4(m).add(new THREE.Vector3(0, 0, STREET_ORIGIN_Z)))
  }, [])
  useFrame(() => {
    const { x, z } = carPose.position
    let hit: number | null = null
    let best = RING_R * RING_R
    for (let i = 0; i < worldRings.length; i++) {
      const v = worldRings[i], d = (v.x - x) ** 2 + (v.z - z) ** 2
      if (d < best) { best = d; hit = i }
    }
    setActive(hit)
  })
  return <Boards />
}

/* ---------- HTML 覆盖层（放在 Canvas 外） ---------- */
export function PortfolioOverlay() {
  const a = useActive()
  const isOpen = useOpen()
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') setOpen(!open)
      if (e.code === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  const p = a !== null ? slots[a].p : null
  const lastP = useRef<Project | null>(null)
  if (p) lastP.current = p
  if (!p) return null
  return (
    <>
      {!isOpen && (
        <div className="pf-card" onClick={() => setOpen(true)} role="button">
          <div className="pf-label">PROJECT:</div>
          <div className="pf-title">{p.title}</div>
          <div className="pf-label">DESCRIPTION</div>
          <div className="pf-desc">{p.description}</div>
          <div className="pf-tags">{p.tags.map((t) => <span key={t}>{t}</span>)}</div>
          <div className="pf-label">HINT</div>
          <div className="pf-hint">按 E / 点按查看</div>
        </div>
      )}
      {isOpen && (
        <div className="pf-modal-bg" onClick={() => setOpen(false)}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
            <button className="pf-close" onClick={() => setOpen(false)} aria-label="关闭">×</button>
            <div className="pf-label">PROJECT · 占位数据</div>
            <div className="pf-title">{p.title}</div>
            <div className="pf-thumb">16:9 缩略图占位</div>
            <div className="pf-desc">{p.description}</div>
            <div className="pf-tags">{p.tags.map((t) => <span key={t}>{t}</span>)}</div>
            <div className="pf-hint">按 E / Esc 关闭</div>
          </div>
        </div>
      )}
    </>
  )
}
