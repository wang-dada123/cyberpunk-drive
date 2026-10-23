import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { colors } from '../theme/colors'

/** Kenney Car Kit race-future.glb（CC0）。模型朝 +Z，长 2.66 宽 1.2 底 y=0 */
const URL = `${import.meta.env.BASE_URL}models/race-future.glb`
const SCALE = 0.8 // → 长 ~2.13 宽 ~0.96，贴合 0.55×0.35×1 半尺寸碰撞体

const bodyMat = new THREE.MeshStandardMaterial({ color: colors.carBody, metalness: 0.55, roughness: 0.45 })
const wheelMat = new THREE.MeshStandardMaterial({ color: '#0B0E13', roughness: 0.8 })
const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.iceBlue).multiplyScalar(1.3), toneMapped: false })
const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.coldWhite).multiplyScalar(1.1), toneMapped: false })
const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.tail).multiplyScalar(1.2), toneMapped: false })

export function CarModel() {
  const { scene } = useGLTF(URL)
  const model = useMemo(() => {
    const s = scene.clone(true)
    s.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.material = /wheel/i.test(m.name) || /wheel/i.test(m.parent?.name ?? '') ? wheelMat : bodyMat
        m.castShadow = true
      }
    })
    return s
  }, [scene])
  // 灯条坐标为 Car 本地（车头 -Z），模型底贴碰撞体底 y=-0.2
  return (
    <group position={[0, -0.2, 0]}>
      <primitive object={model} scale={SCALE} rotation={[0, Math.PI, 0]} />
      {/* 侧裙冰蓝灯带 */}
      <mesh material={stripMat} position={[-0.49, 0.2, 0]}><boxGeometry args={[0.02, 0.03, 1.5]} /></mesh>
      <mesh material={stripMat} position={[0.49, 0.2, 0]}><boxGeometry args={[0.02, 0.03, 1.5]} /></mesh>
      {/* 冷白前灯 */}
      <mesh material={headMat} position={[-0.3, 0.3, -1.07]}><boxGeometry args={[0.18, 0.04, 0.02]} /></mesh>
      <mesh material={headMat} position={[0.3, 0.3, -1.07]}><boxGeometry args={[0.18, 0.04, 0.02]} /></mesh>
      {/* 红尾灯条 */}
      <mesh material={tailMat} position={[0, 0.38, 1.07]}><boxGeometry args={[0.7, 0.04, 0.02]} /></mesh>
    </group>
  )
}
useGLTF.preload(URL)
