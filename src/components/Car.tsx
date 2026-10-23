import { SPAWN } from '../data/mapLayout'
import { Suspense, useRef } from 'react'
import { CarModel } from './CarModel'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { getDriveInput } from '../hooks/useControls'

const FORCE = 28
const TURN = 3.2
const MAX_SPEED = 18

/** 供相机读取的车体世界坐标 */
/** 插值后的可视对象（相机读它，避免物理步与渲染不同步抖动） */
export const carVisual: { current: THREE.Object3D | null } = { current: null }

export const carPose = {
  position: new THREE.Vector3(0, 1, 0),
  quaternion: new THREE.Quaternion(),
}

/**
 * 方块灰模小车：品红车身 + 青色车灯。
 * 显式 collider + CCD + 掉落拉回，防止穿地后相机掉进虚空。
 */
export function Car() {
  const body = useRef<RapierRigidBody>(null)
  const forward = useRef(new THREE.Vector3())
  const quat = useRef(new THREE.Quaternion())
  const euler = useRef(new THREE.Euler())

  useFrame((_, dt) => {
    const rb = body.current
    if (!rb) return

    if (import.meta.env.DEV) (window as unknown as { __car?: RapierRigidBody }).__car = rb // 调试/截图用
    let t = rb.translation()

    // 防穿模兜底：掉到地面以下则拉回并清零纵向速度
    if (t.y < 0.3) {
      rb.setTranslation({ x: t.x, y: 0.6, z: t.z }, true)
      const lv0 = rb.linvel()
      rb.setLinvel({ x: lv0.x, y: 0, z: lv0.z }, true)
      t = rb.translation()
    }

    const rot = rb.rotation()
    quat.current.set(rot.x, rot.y, rot.z, rot.w)

    carPose.position.set(t.x, t.y, t.z)
    carPose.quaternion.copy(quat.current)

    const { forward: f, turn: turnInput } = getDriveInput()
    forward.current.set(0, 0, -1).applyQuaternion(quat.current)

    const lv = rb.linvel()
    const speed = Math.hypot(lv.x, lv.z)
    if (f !== 0 && speed < MAX_SPEED) {
      rb.applyImpulse(
        {
          x: forward.current.x * FORCE * f * dt,
          y: 0,
          z: forward.current.z * FORCE * f * dt,
        },
        true,
      )
    }

    const moving = Math.abs(f) > 0.05 || speed > 0.4
    if (moving && turnInput !== 0) {
      const reversing = f < -0.05
      const sign = reversing ? -1 : 1
      rb.setAngvel({ x: 0, y: TURN * turnInput * sign, z: 0 }, true)
    } else {
      const av = rb.angvel()
      rb.setAngvel({ x: 0, y: av.y * Math.pow(0.85, dt * 60), z: 0 }, true)
    }

    // 锁俯仰/侧倾
    euler.current.setFromQuaternion(quat.current, 'YXZ')
    euler.current.x = 0
    euler.current.z = 0
    quat.current.setFromEuler(euler.current)
    rb.setRotation(
      { x: quat.current.x, y: quat.current.y, z: quat.current.z, w: quat.current.w },
      true,
    )
  }, -60) // 先于物理步（Physics updatePriority=-50）施力

  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={SPAWN}
      mass={1.2}
      linearDamping={1.2}
      angularDamping={4}
      enabledRotations={[false, true, false]}
      friction={1.6}
      restitution={0}
      ccd
      canSleep={false}
    >
      {/* 半尺寸：约 1.1 × 0.7 × 2 的车体包围盒 */}
      <CuboidCollider args={[0.55, 0.35, 1]} position={[0, 0.15, 0]} friction={1.6} />
      <group ref={(o) => { carVisual.current = o }}>
        <Suspense fallback={null}>
          <CarModel />
        </Suspense>
      </group>
    </RigidBody>
  )
}
