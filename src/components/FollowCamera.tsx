import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { carPose, carVisual } from './Car'

/** Bruno Simon 式俯视追随：偏航重阻尼跟随车头（转弯不甩镜头），俯角 ~45°，距离 ~20m，可滚轮/双指缩放 */
const PITCH = THREE.MathUtils.degToRad(45)
const MIN_D = 12
const MAX_D = 32
let distance = 20
let targetDistance = 20

// 模块级复用，useFrame 内零分配
const _pos = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _target = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')
let yaw = 0 // 镜头偏航：重阻尼跟随车头，转弯不甩
let inited = false

function useZoomInput() {
  useEffect(() => {
    const clamp = (v: number) => Math.min(MAX_D, Math.max(MIN_D, v))
    const wheel = (e: WheelEvent) => { targetDistance = clamp(targetDistance * Math.exp(e.deltaY * 0.001)) }
    let pinch0 = 0, d0 = 0
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const ts = (e: TouchEvent) => { if (e.touches.length === 2) { pinch0 = dist(e.touches); d0 = targetDistance } }
    const tm = (e: TouchEvent) => { if (e.touches.length === 2 && pinch0 > 0) targetDistance = clamp(d0 * (pinch0 / dist(e.touches))) }
    const te = (e: TouchEvent) => { if (e.touches.length < 2) pinch0 = 0 }
    window.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('touchstart', ts, { passive: true })
    window.addEventListener('touchmove', tm, { passive: true })
    window.addEventListener('touchend', te, { passive: true })
    return () => {
      window.removeEventListener('wheel', wheel)
      window.removeEventListener('touchstart', ts)
      window.removeEventListener('touchmove', tm)
      window.removeEventListener('touchend', te)
    }
  }, [])
}

/**
 * 读取 rapier 插值后的可视对象位置（避免物理/渲染不同步抖动），
 * 帧率无关阻尼 1-exp(-k·dt)，120/144Hz 下一致。挂在 <Physics> 之后。
 */
export function FollowCamera() {
  const { camera } = useThree()
  useZoomInput()
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const obj = carVisual.current
    if (obj) {
      obj.updateWorldMatrix(true, false)
      obj.matrixWorld.decompose(_pos, _q, _s)
    } else { _pos.copy(carPose.position); _q.copy(carPose.quaternion) }
    const carYaw = _e.setFromQuaternion(_q, 'YXZ').y
    let dy = carYaw - yaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    yaw += dy * (1 - Math.exp(-2.2 * dt))
    _dir.set(Math.cos(PITCH) * Math.sin(yaw), Math.sin(PITCH), Math.cos(PITCH) * Math.cos(yaw))
    _pos.y = 0.5

    distance += (targetDistance - distance) * (1 - Math.exp(-8 * dt))
    if (!inited) { _target.copy(_pos); yaw = carYaw; inited = true }
    else _target.lerp(_pos, 1 - Math.exp(-10 * dt))

    camera.position.copy(_dir).multiplyScalar(distance).add(_target)
    camera.lookAt(_target)
  })
  return null
}
