import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colors } from '../theme/colors'

/** 纵深雾面片（materials-v2 §6）：跟随相机的 3 张半透明面片，30/60/100m，opacity .06/.09/.12，普通混合（非 additive），深度测试 → 只盖住更远的物体 */
const LAYERS: [number, number][] = [[30, 0.06], [60, 0.09], [100, 0.12]]
const geo = new THREE.PlaneGeometry(1, 1)
export function FogPlanes() {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  useFrame(({ camera, scene }) => {
    const cam = camera as THREE.PerspectiveCamera
    const k = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const arr = refs.current
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i]
      if (!m) continue
      m.visible = !!scene.fog
      const d = LAYERS[i][0]
      m.position.copy(cam.position); m.quaternion.copy(cam.quaternion); m.translateZ(-d)
      m.scale.set(2 * d * k * cam.aspect * 1.1, 2 * d * k * 1.1, 1)
    }
  })
  return <group userData={{ dynamic: true }}>{LAYERS.map(([, o], i) => (
    <mesh key={i} ref={(m) => { refs.current[i] = m }} geometry={geo} renderOrder={10} frustumCulled={false}>
      <meshBasicMaterial color={colors.fog} transparent opacity={o} depthWrite={false} fog={false} />
    </mesh>
  ))}</group>
}
