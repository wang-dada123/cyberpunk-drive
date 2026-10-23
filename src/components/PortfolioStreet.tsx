import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
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
const outlineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(D.accent2).multiplyScalar(1.4), toneMapped: false })
const thumbMat = new THREE.MeshBasicMaterial({ color: '#13304A', toneMapped: false })
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(D.accent).multiplyScalar(1.1), toneMapped: false, transparent: true, opacity: 0.85 })
const chipMat = new THREE.MeshBasicMaterial({ color: '#0F1E2E', toneMapped: false })
const boxGeo = new THREE.BoxGeometry(1, 1, 1)
const planeGeo = new THREE.PlaneGeometry(1, 1)
const ringGeo = new THREE.RingGeometry(RING_R - 0.07, RING_R, 48)

const THUMB_W = 2.6
const THUMB_H = THUMB_W * (9 / 16)

function Board({ slot, idx }: { slot: Slot; idx: number }) {
  const act = useActive() === idx
  // 每块板一个面板材质（仅它需要亮度变化）
  const panelMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0C1624', emissive: D.accent2, emissiveIntensity: 0.08, roughness: 0.5 }), [])
  useEffect(() => () => panelMat.dispose(), [panelMat])
  useFrame((_, dt) => {
    const target = act ? 0.55 : 0.08
    panelMat.emissiveIntensity += (target - panelMat.emissiveIntensity) * (1 - Math.exp(-dt * 9))
  })
  const rotY = slot.side === -1 ? Math.PI / 2 : -Math.PI / 2 // 面朝路中
  const ow = 0.04
  return (
    <group>
      <RigidBody type="fixed" colliders={false} position={[slot.x, BOARD_Y, slot.z]} rotation={[0, rotY, 0]}>
        <CuboidCollider args={[BOARD_W / 2, BOARD_H / 2, BOARD_T / 2]} />
        <mesh geometry={boxGeo} material={frameMat} scale={[BOARD_W, BOARD_H, BOARD_T]} />
        <group position={[0, 0, BOARD_T / 2 + 0.005]}>
          <mesh geometry={planeGeo} material={panelMat} scale={[BOARD_W - 0.12, BOARD_H - 0.12, 1]} />
          {/* 外框冰蓝描边 */}
          {[[0, BOARD_H / 2 - ow / 2, BOARD_W, ow], [0, -BOARD_H / 2 + ow / 2, BOARD_W, ow], [-BOARD_W / 2 + ow / 2, 0, ow, BOARD_H], [BOARD_W / 2 - ow / 2, 0, ow, BOARD_H]].map(([x, y, w, h], i) => (
            <mesh key={i} geometry={planeGeo} material={outlineMat} position={[x, y, 0.002]} scale={[w, h, 1]} />
          ))}
          <Text position={[0, 1.75, 0.01]} fontSize={0.34} maxWidth={2.7} anchorY="middle" textAlign="center" color={D.accent} outlineWidth={0} letterSpacing={0.04}>
            {slot.p.title.replace(' (placeholder)', '').toUpperCase()}
          </Text>
          <Text position={[0, 1.38, 0.01]} fontSize={0.11} color={D.accent2}>PLACEHOLDER</Text>
          {/* 16:9 缩略图区 + 冰蓝描边 */}
          <group position={[0, 0.15, 0.004]}>
            <mesh geometry={planeGeo} material={outlineMat} scale={[THUMB_W + 0.06, THUMB_H + 0.06, 1]} />
            <mesh geometry={planeGeo} material={thumbMat} position={[0, 0, 0.002]} scale={[THUMB_W, THUMB_H, 1]} />
            <Text position={[0, 0, 0.01]} fontSize={0.14} color={D.accent2}>THUMBNAIL 16:9</Text>
          </group>
          {/* 技术标签 */}
          {slot.p.tags.map((t, i) => {
            const x = (i - (slot.p.tags.length - 1) / 2) * 1.0
            return (
              <group key={t} position={[x, -1.6, 0.004]}>
                <mesh geometry={planeGeo} material={outlineMat} scale={[0.9, 0.36, 1]} />
                <mesh geometry={planeGeo} material={chipMat} position={[0, 0, 0.002]} scale={[0.86, 0.32, 1]} />
                <Text position={[0, 0, 0.01]} fontSize={0.15} color={D.accent}>{t.toUpperCase()}</Text>
              </group>
            )
          })}
        </group>
      </RigidBody>
      {/* 地面光环触发区（路面上、板前） */}
      <mesh geometry={ringGeo} material={ringMat} position={[slot.side * RING_X, 0.06, slot.z]} rotation={[-Math.PI / 2, 0, 0]} scale={act ? 1.08 : 1} />
    </group>
  )
}

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
    worldRings.forEach((v, i) => {
      const d = (v.x - x) ** 2 + (v.z - z) ** 2
      if (d < best) { best = d; hit = i }
    })
    setActive(hit)
  })
  return <group>{slots.map((s, i) => <Board key={s.p.id + i} slot={s} idx={i} />)}</group>
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
