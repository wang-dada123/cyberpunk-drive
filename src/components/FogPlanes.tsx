import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colors } from '../theme/colors'

/** 纵深雾面片：跟随相机的 3 张半透明面片，30/60/100m，opacity .06/.09/.12。
 *  朝作品街尽端（-Z）看时，第三层 0.12→0.08，避免塔被雾片吞掉。FogExp2 密度不在这里改。 */
const LAYERS: [number, number][] = [[30, 0.06], [60, 0.09], [100, 0.12]]
const geo = new THREE.PlaneGeometry(1, 1)
const _dir = new THREE.Vector3()
export function FogPlanes() {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  useFrame(({ camera, scene }) => {
    const cam = camera as THREE.PerspectiveCamera
    const k = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    cam.getWorldDirection(_dir)
    const downMain = _dir.z < -0.5 && Math.abs(_dir.x) < 0.45
    const arr = refs.current
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i]
      if (!m) continue
      m.visible = !!scene.fog
      const d = LAYERS[i][0]
      m.position.copy(cam.position); m.quaternion.copy(cam.quaternion); m.translateZ(-d)
      m.scale.set(2 * d * k * cam.aspect * 1.1, 2 * d * k * 1.1, 1)
      if (i === 2 && mats.current[2]) mats.current[2]!.opacity = downMain ? 0.08 : 0.12
    }
  })
  return <group userData={{ dynamic: true }}>{LAYERS.map(([, o], i) => (
    <mesh key={i} ref={(m) => { refs.current[i] = m }} geometry={geo} renderOrder={10} frustumCulled={false}>
      <meshBasicMaterial ref={(mat) => { mats.current[i] = mat }} color={colors.fog} transparent opacity={o} depthWrite={false} fog={false} />
    </mesh>
  ))}</group>
}
