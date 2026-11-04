import { AB } from '../utils/tier'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { districts } from '../theme/colors'
const D = districts.portfolio
import { EXHIBITS, type Exhibit } from '../data/exhibits'
import { BRUSH, loadBrushFont } from '../utils/brushFont'
import { ExhibitView } from './ExhibitView'
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

type Slot = { x: number; z: number; side: 1 | -1; p: Exhibit }
const slots: Slot[] = ZS.flatMap((z, k) =>
  ([-1, 1] as const).map((side, s) => ({ x: side * BOARD_X, z, side, p: EXHIBITS[(k * 2 + s) % EXHIBITS.length] })),
)

// 共享材质
const frameMat = new THREE.MeshStandardMaterial({ color: '#08161A', emissive: '#3DD9B0', emissiveIntensity: 0.06, metalness: 0.5, roughness: 0.4 })
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#64FFDA').multiplyScalar(0.8), toneMapped: false }) // 低于 Bloom 阈值
// 细虚线圈（视觉半径 0.9m，触发半径仍为 RING_R）：20 段弧合并为一个几何
const ringGeo = mergeGeometries(Array.from({ length: 20 }, (_, i) => new THREE.RingGeometry(0.87, 0.9, 4, 1, (i / 20) * Math.PI * 2, (Math.PI * 2) / 20 * 0.55)))!

/* 12 块凡人灯箱的正面（缩略图/渐变/青玉框/云纹角/书法片名）全部预绘到一张 Canvas 图集 → 1 个合并网格 1 次 draw call；
   边框合并 1 次；激活高亮为 1 个加色叠片。缩略图（256×384 webp）靠近作品街才加载，到齐后重绘一次图集。 */
const ATL_S = 112 // px / m（低分辨率图集：336×504 / 块，4×3 块 = 1344×1512）
const CW = Math.ceil(BOARD_W * ATL_S), CH = Math.ceil(BOARD_H * ATL_S), COLS = 4
const JADE = '#8FE3C8', GLOW = '#3DF5C8'
function drawFace(g: CanvasRenderingContext2D, ox: number, oy: number, p: Exhibit, img: HTMLImageElement | undefined, brush: boolean) {
  const S = ATL_S, W = CW, H = CH
  g.save(); g.translate(ox, oy)
  g.beginPath(); g.rect(0, 0, W, H); g.clip()
  const m = 0.07 * S // 外框留边
  if (img && img.naturalWidth) {
    const r = Math.max((W - 2 * m) / img.naturalWidth, (H - 2 * m) / img.naturalHeight)
    const iw = img.naturalWidth * r, ih = img.naturalHeight * r
    g.fillStyle = '#05151a'; g.fillRect(0, 0, W, H)
    g.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih) // 缩略图已按 focus 裁好
  } else {
    const bg = g.createLinearGradient(0, 0, W * 0.4, H)
    bg.addColorStop(0, '#1F7A68'); bg.addColorStop(0.55, '#0C3332'); bg.addColorStop(1, '#05151A')
    g.fillStyle = bg; g.fillRect(0, 0, W, H)
  }
  // 暗色渐变：上浅下深，保证片名可读
  const sh = g.createLinearGradient(0, 0, 0, H)
  const L = p.light ? 1 : 0 // 白底水墨压得更重
  sh.addColorStop(0, `rgba(3,12,14,${0.35 + L * 0.25})`); sh.addColorStop(0.45, `rgba(3,12,14,${0.05 + L * 0.2})`); sh.addColorStop(0.66, `rgba(4,14,18,${0.75 + L * 0.15})`); sh.addColorStop(1, 'rgba(4,14,18,0.97)')
  g.fillStyle = sh; g.fillRect(0, 0, W, H)
  // 青玉双框
  g.strokeStyle = JADE; g.shadowColor = GLOW; g.shadowBlur = 8
  g.lineWidth = 0.045 * S; g.strokeRect(m * 0.5, m * 0.5, W - m, H - m)
  g.shadowBlur = 0; g.lineWidth = 0.014 * S; g.globalAlpha = 0.7
  g.strokeRect(m * 1.6, m * 1.6, W - m * 3.2, H - m * 3.2); g.globalAlpha = 1
  // 云纹角
  const curl = (sx: number, sy: number) => {
    g.save(); g.translate(sx < 0 ? W : 0, sy < 0 ? H : 0); g.scale(sx, sy)
    const u = 0.42 * S / 40
    g.scale(u, u); g.lineWidth = 2.4; g.strokeStyle = JADE; g.lineCap = 'round'
    g.beginPath(); g.moveTo(6, 52); g.lineTo(6, 16); g.quadraticCurveTo(6, 6, 16, 6); g.lineTo(52, 6); g.stroke()
    g.beginPath(); g.arc(20, 20, 6, Math.PI * 0.5, Math.PI * 2.1); g.stroke()
    g.beginPath(); g.arc(22, 19, 2.6, 0, Math.PI * 1.4); g.stroke()
    g.restore()
  }
  curl(1, 1); curl(-1, 1); curl(1, -1); curl(-1, -1)
  // 片名（书法）+ 系列名
  const font = (px: number) => `${Math.round(px)}px ${brush ? `'${BRUSH}', ` : ''}'STKaiti', 'KaiTi', serif`
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = JADE; g.font = font(0.2 * S); g.shadowColor = GLOW; g.shadowBlur = 6
  g.fillText(`《${p.series}》`, W / 2, H - 1.28 * S)
  const n = [...p.title].length, size = Math.min(0.62, 2.5 / n) * S
  g.font = font(size); g.fillStyle = '#F2FFF9'; g.shadowBlur = 14
  g.fillText(p.title, W / 2, H - 0.72 * S)
  g.shadowBlur = 0
  // 底部细线
  const ln = g.createLinearGradient(m * 3, 0, W - m * 3, 0)
  ln.addColorStop(0, 'rgba(143,227,200,0)'); ln.addColorStop(0.5, 'rgba(143,227,200,0.8)'); ln.addColorStop(1, 'rgba(143,227,200,0)')
  g.fillStyle = ln; g.fillRect(m * 3, H - 0.32 * S, W - m * 6, 0.012 * S)
  g.restore()
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
    const pg = new THREE.PlaneGeometry(BOARD_W, BOARD_H), uv = pg.attributes.uv
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (c + uv.getX(k) * (CW - 1) / CW + 0.5 / CW) / COLS, 1 - (r + (1 - uv.getY(k)) * (CH - 1) / CH + 0.5 / CH) / rows)
    pg.applyMatrix4(boardMatrix(s, FACE_Z)); faces.push(pg)
    const bg = new THREE.BoxGeometry(BOARD_W, BOARD_H, BOARD_T); bg.applyMatrix4(boardMatrix(s)); frames.push(bg)
  })
  const imgs = new Map<string, HTMLImageElement>()
  let brush = false
  const paint = () => { slots.forEach((s, i) => drawFace(g, (i % COLS) * CW, Math.floor(i / COLS) * CH, s.p, imgs.get(s.p.thumb), brush)); tex.needsUpdate = true }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  paint()
  loadBrushFont().then((ok) => { if (ok) { brush = true; paint() } })
  /** 靠近作品街时调用一次：低优先级拉 8 张缩略图，到齐（或失败）后重绘图集 */
  let started = false
  const loadThumbs = () => {
    if (started) return; started = true
    Promise.all(EXHIBITS.map((e) => new Promise<void>((res) => {
      const im = new Image(); im.decoding = 'async'
      ;(im as unknown as { fetchPriority: string }).fetchPriority = 'low'
      im.onload = () => { imgs.set(e.thumb, im); res() }; im.onerror = () => res(); im.src = e.thumb
    }))).then(paint)
  }
  const faceMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  const rings = mergeGeometries(slots.map((s) => ringGeo.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(s.side * RING_X, 0.06, s.z).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)))))!
  return { rings, face: mergeGeometries(faces)!, frame: mergeGeometries(frames)!, faceMat, loadThumbs }
}
const glowMat = new THREE.MeshBasicMaterial({ color: D.accent2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
const glowGeo = new THREE.PlaneGeometry(BOARD_W - 0.12, BOARD_H - 0.12)

function Boards() {
  const b = useMemo(buildBoards, [])
  useEffect(() => {
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: object) => number }).requestIdleCallback
    const id = window.setTimeout(() => (ric ? ric(b.loadThumbs, { timeout: 4000 }) : b.loadThumbs()), 8000)
    return () => window.clearTimeout(id)
  }, [b])
  const act = useActive()
  const glow = useRef<THREE.Mesh>(null)
  const last = useRef(0)
  if (act !== null) last.current = act
  useFrame((_, dt) => {
    // 车进入作品街 120m 范围（或开局 8s 后空闲）才拉缩略图，不阻塞首屏
    const cz = carPose.position.z - STREET_ORIGIN_Z, cx = carPose.position.x
    if (Math.abs(cx) < 120 && cz < 120 && cz > -240) b.loadThumbs()
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
  if (!p) return null
  return (
    <>
      {!isOpen && (
        <div className="fx-card fx-mini" onClick={() => setOpen(true)} role="button">
          <div className="fx-tag">凡人灯箱</div>
          <div className="fx-title" style={{ ['--n' as string]: [...p.title].length }}>{p.title}</div>
          <div className="fx-hint" style={{ display: 'block' }}>按 E / 点按查看</div>
        </div>
      )}
      {isOpen && (
        <div className="pf-modal-bg" onClick={() => setOpen(false)}>
          <div className="fx-card fx-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="凡人灯箱">
            <ExhibitView key={p.lightId} ex={p} onClose={() => setOpen(false)} head="国漫展厅 · 凡人灯箱">
              <div className="fx-hint">按 E / Esc 关闭</div>
            </ExhibitView>
          </div>
        </div>
      )}
    </>
  )
}
