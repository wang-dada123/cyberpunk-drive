import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { districts, type DistrictId } from '../theme/colors'
import { districtAt } from '../data/mapLayout'
import { carPose } from './Car'

export { districtAt }
export let currentDistrict: DistrictId = 'alley'

// 预构建颜色，useFrame 内零分配
const targets = Object.fromEntries(
  (Object.keys(districts) as DistrictId[]).map((k) => [k, {
    fog: new THREE.Color(districts[k].fog), amb: new THREE.Color(districts[k].ambient), sky: new THREE.Color(districts[k].hemiSky),
  }]),
) as Record<DistrictId, { fog: THREE.Color; amb: THREE.Color; sky: THREE.Color }>

/** 按车位置切换街区：雾色 + 环境/半球光颜色 ~1.5s 渐变 */
export function DistrictAtmosphere() {
  const scene = useThree((s) => s.scene)
  const amb = useRef<THREE.AmbientLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  useFrame((_, dt) => {
    currentDistrict = districtAt(carPose.position.x, carPose.position.z)
    const t = targets[currentDistrict]
    const k = 1 - Math.exp(-dt * 3)
    if (scene.fog) scene.fog.color.lerp(t.fog, k)
    amb.current?.color.lerp(t.amb, k)
    hemi.current?.color.lerp(t.sky, k)
  })
  return (
    <>
      <ambientLight ref={amb} intensity={0.1} color={districts.alley.ambient} />
      <hemisphereLight ref={hemi} args={[districts.alley.hemiSky, '#050A14', 0.25]} />
    </>
  )
}
