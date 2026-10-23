import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { carPose } from './Car'

const OFFSET = new THREE.Vector3(0, 5, 9)
const LOOK_AHEAD = new THREE.Vector3(0, 0.8, -3)

/**
 * 第三人称跟随。若车短暂穿地，用 floorY 夹住跟随高度，避免镜头永远对着虚空。
 */
export function FollowCamera() {
  const { camera } = useThree()
  const desired = useRef(new THREE.Vector3())
  const look = useRef(new THREE.Vector3())
  const safePos = useRef(new THREE.Vector3())

  useFrame((_, dt) => {
    const floorY = 0.5
    safePos.current.set(
      carPose.position.x,
      Math.max(carPose.position.y, floorY),
      carPose.position.z,
    )
    desired.current.copy(OFFSET).applyQuaternion(carPose.quaternion).add(safePos.current)
    // 相机自身也别落到地下
    if (desired.current.y < 3) desired.current.y = 3

    look.current.copy(LOOK_AHEAD).applyQuaternion(carPose.quaternion).add(safePos.current)
    if (look.current.y < 0.5) look.current.y = 0.5

    const k = 1 - Math.exp(-5 * dt)
    camera.position.lerp(desired.current, k)
    camera.lookAt(look.current)
  })

  return null
}
