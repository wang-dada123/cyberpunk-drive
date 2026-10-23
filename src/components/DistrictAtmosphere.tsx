import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { districts, type DistrictId } from '../theme/colors'
import { carPose } from './Car'

// 巷子方向（与 City.tsx 中 group 旋转一致）
const dir = (rot: number) => new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot)
const AXES: Array<[DistrictId, THREE.Vector3]> = [
  ['alley', dir(0)],
  ['portfolio', dir((-Math.PI * 2) / 3)],
  ['aiStall', dir((Math.PI * 2) / 3)],
]
const PLAZA_R = 6
const _v = new THREE.Vector3()

export let currentDistrict: DistrictId = 'alley'

export function districtAt(x: number, z: number): DistrictId {
  if (Math.hypot(x, z) < PLAZA_R) return 'alley'
  const v = _v.set(x, 0, z).normalize()
  let best: DistrictId = 'alley'
  let bd = -Infinity
  for (const [id, a] of AXES) {
    const d = v.dot(a)
    if (d > bd) { bd = d; best = id }
  }
  return best
}

/** 按车位置切换街区：雾色 + 环境/半球光颜色 ~1.5s 渐变 */
export function DistrictAtmosphere() {
  const scene = useThree((s) => s.scene)
  const amb = useRef<THREE.AmbientLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const tFog = useRef(new THREE.Color())
  const tAmb = useRef(new THREE.Color())
  const tSky = useRef(new THREE.Color())
  useFrame((_, dt) => {
    currentDistrict = districtAt(carPose.position.x, carPose.position.z)
    const d = districts[currentDistrict]
    tFog.current.set(d.fog); tAmb.current.set(d.ambient); tSky.current.set(d.hemiSky)
    const k = 1 - Math.exp(-dt * 3) // ≈95% in ~1s, settles ~1.5s
    if (scene.fog) scene.fog.color.lerp(tFog.current, k)
    amb.current?.color.lerp(tAmb.current, k)
    hemi.current?.color.lerp(tSky.current, k)
  })
  return (
    <>
      <ambientLight ref={amb} intensity={0.08} color={districts.alley.ambient} />
      <hemisphereLight ref={hemi} args={[districts.alley.hemiSky, '#050A14', 0.2]} />
    </>
  )
}
