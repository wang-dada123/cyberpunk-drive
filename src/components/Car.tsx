import { SPAWN } from '../data/mapLayout'
import { Suspense, useRef } from 'react'
import { CarModel } from './CarModel'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useAfterPhysicsStep, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { getDriveInput } from '../hooks/useControls'

const FORCE = 32 // 贴地后补偿，加速手感≈原来
const TURN = 3.2
const MAX_SPEED = 18
const STEP = 1 / 60

/** 每帧物理步数 / 插值 alpha（debug 面板读） */
export const physStats = { stepsThisFrame: 0, alpha: 0 }

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

  const prevP = useRef(new THREE.Vector3())
  const currP = useRef(new THREE.Vector3())
  const prevQ = useRef(new THREE.Quaternion())
  const currQ = useRef(new THREE.Quaternion())
  const acc = useRef(0)
  const inited = useRef(false)
  const visual = useRef<THREE.Group>(null)

  const snap = (rb: RapierRigidBody) => {
    const t = rb.translation(), r = rb.rotation()
    currP.current.set(t.x, t.y, t.z)
    currQ.current.set(r.x, r.y, r.z, r.w)
  }

  // 渲染帧开头：累加器（与 rapier 相同的 clamp 0.5 不精确也无妨，只用于 alpha）
  useFrame((_, rawDt) => {
    acc.current += Math.min(rawDt, 0.1)
    physStats.stepsThisFrame = 0
  }, -61)

  // 物理步前：以固定步长施力（与渲染帧率无关）
  useBeforePhysicsStep(() => {
    const rb = body.current
    if (!rb) return
    if (!inited.current) { snap(rb); inited.current = true }
    prevP.current.copy(currP.current)
    prevQ.current.copy(currQ.current)
    control(rb, STEP)
  })
  useAfterPhysicsStep(() => {
    const rb = body.current
    if (!rb) return
    snap(rb)
    carPose.position.copy(currP.current)
    carPose.quaternion.copy(currQ.current)
    acc.current = Math.max(0, acc.current - STEP)
    physStats.stepsThisFrame++
  })

  // 物理之后：prev→curr 按 alpha 插值可视车体（相机跟它）
  useFrame(() => {
    const v = visual.current
    if (!v || !inited.current) return
    if (acc.current > STEP) acc.current = STEP // 物理丢步时防外推
    const a = acc.current / STEP
    physStats.alpha = a
    v.position.lerpVectors(prevP.current, currP.current, a)
    v.quaternion.slerpQuaternions(prevQ.current, currQ.current, a)
    v.updateMatrixWorld()
  }, -40)

  const control = (rb: RapierRigidBody, dt: number) => {

    if (import.meta.env.DEV) (window as unknown as { __car?: RapierRigidBody }).__car = rb // 调试/截图用
    let t = rb.translation()

    // 防穿模兜底：掉到地面以下则拉回并清零纵向速度
    if (t.y < -0.5) { // 原阈值 0.3 高于车静止高度(≈0.2)，导致每 ~0.27s 被拉回 0.6 再自由落体 = "一跳一跳"
      rb.setTranslation({ x: t.x, y: 0.6, z: t.z }, true)
      const lv0 = rb.linvel()
      rb.setLinvel({ x: lv0.x, y: 0, z: lv0.z }, true)
      t = rb.translation()
    }

    const rot = rb.rotation()
    quat.current.set(rot.x, rot.y, rot.z, rot.w)


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
  }

  return (
    <>
    <RigidBody
      ref={body}
      colliders={false}
      position={SPAWN}
      mass={1.2}
      linearDamping={1.2}
      angularDamping={4}
      enabledRotations={[false, true, false]}
      friction={0} /* 原来车大多悬空，操控实际无摩擦；贴地后保持同手感 */
      restitution={0}
      ccd
      canSleep={false}
    >
      {/* 半尺寸：约 1.1 × 0.7 × 2 的车体包围盒 */}
      <CuboidCollider args={[0.55, 0.35, 1]} position={[0, 0.15, 0]} friction={0} /* 原来车大多悬空，操控实际无摩擦；贴地后保持同手感 */ />
    </RigidBody>
    {/* 可视车体不挂在 RigidBody 下：由上面自做的 prev/curr 插值驱动 */}
    <group ref={(o) => { visual.current = o; carVisual.current = o; if (import.meta.env.DEV) Object.assign(window, { __carVis: o }) }} position={SPAWN}>
      <Suspense fallback={null}>
        <CarModel />
      </Suspense>
    </group>
    </>
  )
}
