import { useLayoutEffect, useMemo, useRef } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { MAIN_BUILDINGS, STREET_LAMPS } from '../data/mainStreet'
import { isMobile } from '../utils/isMobile'
import { REFLECT } from '../utils/quality'
import { rendererInfo } from '../utils/rendererCheck'
import { tierState } from '../utils/tier'

/** 桌面真 GPU 开实时反射。手机、低档、软件渲染、?reflect=0 用假倒影条。?reflect=1 强制开。 */
export function alleyReflectOn() {
  if (REFLECT === 'off') return false
  if (REFLECT === 'on') return true
  if (isMobile || tierState.tier === 'low' || rendererInfo.software) return false
  return true
}

const STRIPS: { x: number; z: number; color: string }[] = []
for (const bd of MAIN_BUILDINGS) {
  if (bd.seg !== 'A' || !bd.shop || bd.side === 0) continue
  const warm = bd.shop.kind === 'noodle' || bd.shop.kind === 'mart' || bd.shop.kind === 'tea'
  STRIPS.push({ x: bd.face - bd.side * 1.15, z: (bd.z0 + bd.z1) / 2 - 2.4, color: warm ? '#FFE6C4' : '#4FC3F7' })
}
for (const lamp of STREET_LAMPS) {
  if (!lamp.id.startsWith('a-')) continue
  STRIPS.push({ x: lamp.p[0], z: lamp.p[2] - 2.6, color: '#E8F4FF' })
}

/**
 * A 段车行道盖在旧积水路面上。
 * 黑斑排查：场景里没有 ContactShadows。车底有一张辉光片，A 段已压到几乎看不见。
 * 车前那团黑是旧路面着色器在车头强制铺的深色水洼（只改了颜色、没给光），这层新路面把它盖住。
 */
export function AlleyRoad() {
  const reflect = alleyReflectOn()
  const flat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#161B22', roughness: 0.72, metalness: 0.05, emissive: '#000000', emissiveIntensity: 0,
  }), [])
  const glow = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }), [])
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const c = new THREE.Color()
    STRIPS.forEach((s, i) => {
      dummy.position.set(s.x, 0.1, s.z)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, c.set(s.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [reflect])
  return (
    <group>
      <mesh position={[0, 0.09, 48]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
        <planeGeometry args={[14, 52, 1, 10]} />
        {reflect ? (
          <MeshReflectorMaterial
            resolution={512}
            mirror={0.55}
            mixStrength={1}
            blur={[300, 80]}
            mixBlur={0.8}
            depthScale={0.6}
            minDepthThreshold={0.6}
            maxDepthThreshold={1.2}
            color="#161B22"
            roughness={0.28}
            metalness={0.05}
          />
        ) : (
          <primitive object={flat} attach="material" />
        )}
      </mesh>
      {!reflect && (
        <instancedMesh ref={ref} args={[undefined, undefined, STRIPS.length]} frustumCulled={false}>
          <planeGeometry args={[0.4, 6]} />
          <primitive object={glow} attach="material" />
        </instancedMesh>
      )}
    </group>
  )
}
