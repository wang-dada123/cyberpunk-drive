import { AB } from '../utils/tier'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { districts } from '../theme/colors'
const D = districts.portfolio
import { EXHIBITS, type Exhibit } from '../data/exhibits'
import { ATLAS_URL, CW, CH, COLS, ROWS } from '../utils/boardAtlas'
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
// 世界 z -34…-125，避开环路(-75)与后巷(-104)路口。
// 北三排错开光点触发位：手机横屏 844×390 下 8 个光点处灯箱投影离摇杆 / 小地图 ≥53px（原 -88/-122 两排压在摇杆、小地图上）
const ZS = [-4, -16, -28, -63, -84, -95]

type Slot = { x: number; z: number; side: 1 | -1; p: Exhibit }
const slots: Slot[] = ZS.flatMap((z, k) =>
  ([-1, 1] as const).map((side, s) => ({ x: side * BOARD_X, z, side, p: EXHIBITS[(k * 2 + s) % EXHIBITS.length] })),
)

// 共享材质
const frameMat = new THREE.MeshStandardMaterial({ color: '#08161A', emissive: '#3DD9B0', emissiveIntensity: 0.06, metalness: 0.5, roughness: 0.4 })
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#64FFDA').multiplyScalar(0.8), toneMapped: false }) // 低于 Bloom 阈值
// 细虚线圈（视觉半径 0.9m，触发半径仍为 RING_R）：20 段弧合并为一个几何
const ringGeo = mergeGeometries(Array.from({ length: 20 }, (_, i) => new THREE.RingGeometry(0.87, 0.9, 4, 1, (i / 20) * Math.PI * 2, (Math.PI * 2) / 20 * 0.55)))!

/* 12 块凡人灯箱的正面（缩略图/渐变/青玉框/云纹角/书法片名）离线预烘成一张 webp 图集（scripts/bake-atlas.mjs，8 格 4×2），
   12 块按 i % 8 取格 → 1 个合并网格 1 次 draw call；边框合并 1 次；激活高亮为 1 个加色叠片。
   运行时不再画 Canvas / 不再加载缩略图：图集在启动时 createImageBitmap 解码（不占主线程），到达后立即 initTexture 上传一次。 */
const FACE_Z = BOARD_T / 2 + 0.01
function boardMatrix(s: Slot, z = 0) {
  const rotY = s.side === -1 ? Math.PI / 2 : -Math.PI / 2 // 面朝路中
  return new THREE.Matrix4().compose(new THREE.Vector3(s.x, BOARD_Y, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, z))
}
/** upload：每次重绘后立刻把图集传到 GPU。Canvas 2D 的绘制是延迟光栅化的（书法字形 + shadowBlur 很重），
   若等网格首次进视野才上传，这笔开销会落在行驶中的某一帧（实测 0.4–0.7s 长帧），物理按固定步长补帧、输入却停在旧值，车被甩上墙卡住。 */
function buildBoards(gl: THREE.WebGLRenderer) {
  const faces: THREE.BufferGeometry[] = [], frames: THREE.BufferGeometry[] = []
  slots.forEach((s, i) => {
    const j = i % (COLS * ROWS), c = j % COLS, r = Math.floor(j / COLS)
    const pg = new THREE.PlaneGeometry(BOARD_W, BOARD_H), uv = pg.attributes.uv
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (c + uv.getX(k) * (CW - 1) / CW + 0.5 / CW) / COLS, 1 - (r + (1 - uv.getY(k)) * (CH - 1) / CH + 0.5 / CH) / ROWS)
    pg.applyMatrix4(boardMatrix(s, FACE_Z)); faces.push(pg)
    const bg = new THREE.BoxGeometry(BOARD_W, BOARD_H, BOARD_T); bg.applyMatrix4(boardMatrix(s)); frames.push(bg)
  })
  // 图集到达前先显示青玉底色（与图集渐变底一致），到达后换贴图
  const faceMat = new THREE.MeshBasicMaterial({ color: '#0C3332', toneMapped: false })
  const loader = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' })
  loader.load(ATLAS_URL, (bmp) => {
    const tex = new THREE.Texture(bmp); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true
    gl.initTexture(tex) // 立刻上传（含 mipmap），不留到灯箱首次进视野的那一帧
    faceMat.map = tex; faceMat.color.set('#ffffff'); faceMat.needsUpdate = true
  })
  const rings = mergeGeometries(slots.map((s) => ringGeo.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(s.side * RING_X, 0.06, s.z).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)))))!
  return { rings, face: mergeGeometries(faces)!, frame: mergeGeometries(frames)!, faceMat }
}
const glowMat = new THREE.MeshBasicMaterial({ color: D.accent2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
const glowGeo = new THREE.PlaneGeometry(BOARD_W - 0.12, BOARD_H - 0.12)

function Boards() {
  const gl = useThree((s) => s.gl)
  const b = useMemo(() => buildBoards(gl), [gl])
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
  useFrame((st) => {
    if (import.meta.env.DEV) (window as unknown as { __cam?: THREE.Camera }).__cam = st.camera // 截图/避让脚本读相机
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
