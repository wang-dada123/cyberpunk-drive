import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { carPose, carVisual } from './Car'
import { tunnelRoof, garageLevels, spiralClip } from './Structures'
import { TUNNEL, TUNNEL_R1, structCeil, garageLocal, GARAGE, SPIRAL } from '../data/mapLayout'
import { isMobile } from '../utils/isMobile'

/**
 * v3 三档相机（C 键 / 手机右上按钮循环）：third 追尾 → first 引擎盖 → top 45° 俯视。
 * 全部帧率无关指数阻尼 1-exp(-k·dt)；三档状态每帧都更新，切换时 0.3s smoothstep 混合位置/朝向/FOV。
 * useFrame 内零分配。车前向为局部 -Z。
 */
export type CamMode = 'third' | 'first' | 'top'
const MODES: CamMode[] = ['third', 'first', 'top']
export const camState = { mode: 'third' as CamMode }
if (import.meta.env.DEV) Object.assign(window, { __camState: camState })

// —— 通用 ——
const TRANSITION = 0.3
const MAX_ACCEL = 250         // 跟随点加速度上限 m/s²：正常行驶/转弯(<~60)不触发，仅碰撞/急停瞬变
const K_VEL = 2.5             // 速度向量阻尼
const K_ZOOM = 5              // 缩放阻尼
// —— 第三人称 ——
const T_BACK = 8, T_HEIGHT = 3, T_SPEED_EXTRA = 2, T_SPEED_REF = 30 // m, m, m, m/s
const T_K_POS = 4, T_K_YAW = 2.5, T_FOV = 60
const T_LOOK_AHEAD = 4, T_LOOK_H = 1.0
const T_MIN = 5, T_MAX = 14
// —— 第一人称 ——
const F_OFFSET = new THREE.Vector3(0, 1.1, -0.6) // 车局部：上 1.1m、前 0.6m
const F_LOOK_DIST = 20, F_K_YAW = 8, F_FOV = 72, F_FOV_EXTRA = 6, F_K_FOV = 3
// —— 俯视 ——
const P_PITCH = THREE.MathUtils.degToRad(45), P_K_POS = 3.5, P_K_LOOK = 4, P_FOV = 50
const P_LOOKAHEAD_T = 0.25, P_LOOKAHEAD_MAX = 3, P_MIN = 12, P_MAX = 32
// —— 输入 ——
const WHEEL_K_TOP = 0.005, WHEEL_K_THIRD = 0.002, WHEEL_STEP_MAX = 2, PINCH_K = 0.5

let topDist = 20, topDistT = 20, thirdExtra = 0, thirdExtraT = 0 // thirdExtra: 用户缩放偏移
const _pos = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')
const _filt = new THREE.Vector3(), _prevFilt = new THREE.Vector3()
const _vel = new THREE.Vector3(), _rawVel = new THREE.Vector3()
const _focus = new THREE.Vector3(), _focusVel = new THREE.Vector3(), _goal = new THREE.Vector3(), _dv = new THREE.Vector3()
const _tmp = new THREE.Vector3(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0)
const _topDir = new THREE.Vector3(0, Math.sin(P_PITCH), Math.cos(P_PITCH))
const _topDirV = new THREE.Vector3(0, 1, 0.12)
let spTopK = 0
// 每档输出
type Pose = { pos: THREE.Vector3; look: THREE.Vector3; quat: THREE.Quaternion; fov: number }
const mk = (fov: number): Pose => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), quat: new THREE.Quaternion(), fov })
const third = mk(T_FOV), first = mk(F_FOV), top = mk(P_FOV), from = mk(T_FOV)
const poses: Record<CamMode, Pose> = { third, first, top }
let tYaw = 0, fYaw = 0, transT = 1, inited = false
let rideY = 0, rideReady = false

const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt)
const clamp = THREE.MathUtils.clamp
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export const camStats = { switches: 0, lastSource: '-' as string, nan: 0, transT: 1 }
let lastSwitch = -1e9, useVelHead = false
const MODE_NAME: Record<CamMode, string> = { third: '第三人称', first: '第一人称', top: '俯视' }
let hintEl: HTMLDivElement | null = null, hintTimer = 0
function showHint() {
  if (!hintEl) {
    hintEl = document.createElement('div')
    Object.assign(hintEl.style, { position: 'fixed', top: isMobile ? '96px' : '64px', left: '50%', transform: 'translateX(-50%)', zIndex: '20',
      padding: '6px 12px', borderRadius: '8px', background: 'rgba(8,16,28,0.7)', color: '#bfeaff', font: '13px system-ui',
      border: '1px solid #5fd4ff', pointerEvents: 'none', transition: 'opacity .3s', opacity: '0' })
    document.body.appendChild(hintEl)
  }
  hintEl.textContent = `视角：${MODE_NAME[camState.mode]} · ${isMobile ? '点 🎥' : '按 C'} 切换`
  hintEl.style.opacity = '1'
  clearTimeout(hintTimer); hintTimer = window.setTimeout(() => { if (hintEl) hintEl.style.opacity = '0' }, 1500)
}

function cycle(camera: THREE.PerspectiveCamera, source = 'key') {
  const now = performance.now()
  if (now - lastSwitch < 250) return // 250ms 防抖
  lastSwitch = now
  camStats.switches++; camStats.lastSource = source
  // 快照相机当前实际位姿（若正在过渡中也是当前插值结果），从这里插到新档
  from.pos.copy(camera.position); from.quat.copy(camera.quaternion); from.fov = camera.fov
  camState.mode = MODES[(MODES.indexOf(camState.mode) + 1) % MODES.length]
  transT = 0
  showHint()
}

function useCamInput(camera: THREE.PerspectiveCamera) {
  useEffect(() => {
    const zoom = (d: number) => { // d: 正=拉远（米，按档位系数换算后）
      if (camState.mode === 'top') topDistT = clamp(topDistT + d, P_MIN, P_MAX)
      else if (camState.mode === 'third') thirdExtraT = clamp(thirdExtraT + d, T_MIN - T_BACK, T_MAX - T_BACK)
    }
    const wheel = (e: WheelEvent) => {
      const k = camState.mode === 'top' ? WHEEL_K_TOP : WHEEL_K_THIRD
      zoom(clamp(e.deltaY * k, -WHEEL_STEP_MAX, WHEEL_STEP_MAX))
    }
    const key = (e: KeyboardEvent) => { if (e.code === 'KeyC' && !e.repeat) cycle(camera) }
    let pinch0 = 0, last = 0
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const ts = (e: TouchEvent) => { if (e.touches.length === 2) { pinch0 = last = dist(e.touches) } }
    const tm = (e: TouchEvent) => {
      if (e.touches.length !== 2 || pinch0 <= 0) return
      const d = dist(e.touches), ratio = last / Math.max(1, d); last = d
      const base = camState.mode === 'top' ? topDistT : T_BACK + thirdExtraT
      zoom(base * (Math.pow(ratio, PINCH_K) - 1))
    }
    const te = (e: TouchEvent) => { if (e.touches.length < 2) pinch0 = 0 }
    let btn: HTMLButtonElement | null = null
    if (isMobile) {
      btn = document.createElement('button')
      btn.textContent = '🎥'
      btn.setAttribute('aria-label', '切换视角')
      Object.assign(btn.style, { position: 'fixed', top: '12px', right: '12px', zIndex: '20', width: '44px', height: '44px',
        borderRadius: '10px', border: '1px solid #5fd4ff', background: 'rgba(8,16,28,0.7)', color: '#bfeaff', fontSize: '20px' })
      btn.addEventListener('pointerup', (e) => { e.preventDefault(); cycle(camera, 'button'); btn?.blur() })
      document.body.appendChild(btn)
    }
    window.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('keydown', key)
    window.addEventListener('touchstart', ts, { passive: true })
    window.addEventListener('touchmove', tm, { passive: true })
    window.addEventListener('touchend', te, { passive: true })
    return () => {
      btn?.remove(); hintEl?.remove(); hintEl = null
      window.removeEventListener('wheel', wheel); window.removeEventListener('keydown', key)
      window.removeEventListener('touchstart', ts); window.removeEventListener('touchmove', tm); window.removeEventListener('touchend', te)
    }
  }, [camera])
}

/** 把点限制在隧道内：横向 |v|≤3.8，高度 ≤ 顶板下 0.5m（且不低于车 +1） */
function clampTunnel(p: THREE.Vector3, carY: number) {
  const [dx, dz] = TUNNEL.dir, nx = -dz, nz = dx
  const u = p.x * dx + p.z * dz, v = p.x * nx + p.z * nz
  if (u < TUNNEL.R0 - 4 || u > TUNNEL_R1 + 4) return
  const vc = THREE.MathUtils.clamp(v, -3.8, 3.8)
  p.x += (vc - v) * nx; p.z += (vc - v) * nz
  p.y = Math.max(carY + 1, Math.min(p.y, -0.5))
}

const lookQuat = (p: Pose) => { _m.lookAt(p.pos, p.look, _up); p.quat.setFromRotationMatrix(_m) }

export function FollowCamera() {
  const { camera, scene, gl: renderer } = useThree()
  renderer.localClippingEnabled = true
  if (import.meta.env.DEV) Object.assign(window, { __spClip: spiralClip, __cam: camera })
  const cam = camera as THREE.PerspectiveCamera
  useCamInput(cam)
  // priority 0：在 Physics(-50，写入插值后 mesh 位姿) 之后、EffectComposer(1，渲染) 之前
  useFrame((_, rawDt) => {
    const world = import.meta.env.DEV ? (window as unknown as { __worldCam?: { pos: number[]; look: number[]; fov?: number } }).__worldCam : undefined
    if (world) {
      cam.position.set(world.pos[0], world.pos[1], world.pos[2])
      cam.lookAt(world.look[0], world.look[1], world.look[2])
      if (world.fov && Math.abs(cam.fov - world.fov) > 0.1) { cam.fov = world.fov; cam.updateProjectionMatrix() }
      return
    }
    if (import.meta.env.DEV && (window as unknown as { __topdown?: boolean }).__topdown) {
      cam.position.set(0, 330, 0.01); cam.lookAt(0, 0, 0)
      if (scene.fog) (scene.fog as THREE.FogExp2).density = 0.0006
      cam.far = 800; cam.updateProjectionMatrix(); return
    }
    const pin = import.meta.env.DEV ? (window as unknown as { __camPin?: number[] }).__camPin : undefined
    if (pin && carVisual.current) { // 测试用：车本地坐标固定机位
      const o = carVisual.current; o.updateWorldMatrix(true, false)
      cam.position.set(pin[0], pin[1], pin[2]).applyMatrix4(o.matrixWorld)
      const t = new THREE.Vector3(0, pin[3] ?? 0.3, pin[4] ?? 0).applyMatrix4(o.matrixWorld); cam.lookAt(t); return
    }
    const dt = clamp(rawDt, 0, 0.05)
    if (dt <= 0) return
    const obj = carVisual.current
    if (obj) { obj.updateWorldMatrix(true, false); obj.matrixWorld.decompose(_pos, _q, _s) }
    else { _pos.copy(carPose.position); _q.copy(carPose.quaternion) }
    const carYaw = _e.setFromQuaternion(_q, 'YXZ').y // 只取 yaw，忽略 pitch/roll

    // 瞬移（防掉落兜底/调试传送）：整体平移镜头状态，避免加速度限幅的跟随点甩出几百米
    if (inited && _pos.distanceToSquared(_prevFilt) > 100) {
      _tmp.subVectors(_pos, _prevFilt)
      for (const v of [_focus, third.pos, third.look, top.pos, top.look]) v.add(_tmp)
      rideY += _tmp.y
      _prevFilt.copy(_pos); _focusVel.set(0, 0, 0)
    }
    if (!rideReady) { rideY = _pos.y; rideReady = true }
    else {
      const dy = _pos.y - rideY
      // 坡度这种慢变化跟得上；车身在接缝上的几厘米颠簸滤掉，镜头俯仰不再来回抽。
      const k = Math.abs(dy) > 2.5 ? 14 : 7
      rideY += dy * (1 - Math.exp(-k * dt))
    }
    if (!inited) {
      _filt.copy(_pos); _filt.y = rideY; _prevFilt.copy(_pos); _focus.copy(_pos); tYaw = fYaw = carYaw
      inited = true
    }
    // 水平跟车保持原来的阻尼；高度只用平滑后的 rideY，不跟车身微小起伏。
    _filt.copy(_pos)
    _filt.y = rideY
    _rawVel.subVectors(_filt, _prevFilt).divideScalar(Math.min(rawDt, 0.25)) // 速度用真实帧间隔
    _rawVel.y = 0; _prevFilt.copy(_filt) // 修复：此前这两句被注释吞掉，_prevFilt 从不更新
    if (!Number.isFinite(_rawVel.x + _rawVel.z)) { _rawVel.set(0, 0, 0); camStats.nan++ }
    _vel.lerp(_rawVel, damp(K_VEL, dt))
    const speed = _vel.length()
    _goal.copy(_vel).multiplyScalar(P_LOOKAHEAD_T).clampLength(0, P_LOOKAHEAD_MAX).add(_filt)
    _dv.subVectors(_goal, _focus).divideScalar(dt).sub(_focusVel).clampLength(0, MAX_ACCEL * dt)
    _focusVel.add(_dv); _focus.addScaledVector(_focusVel, dt)

    // 第三人称：朝向用平滑速度方向（倒车/低速用车头）
    // 迟滞：<1.5 m/s 用车头，>3 m/s 才切回速度方向；两者间平滑混合（tYaw 阻尼）
    const fwdOk = _vel.dot(_tmp.set(-Math.sin(carYaw), 0, -Math.cos(carYaw))) > 0
    if (useVelHead && (speed < 1.5 || !fwdOk)) useVelHead = false
    else if (!useVelHead && speed > 3 && fwdOk) useVelHead = true
    let headYaw = useVelHead && speed > 1e-3 ? Math.atan2(-_vel.x, -_vel.z) : carYaw
    if (!Number.isFinite(headYaw)) { headYaw = tYaw; camStats.nan++ }
    tYaw += wrap(headYaw - tYaw) * damp(T_K_YAW, dt)
    thirdExtra += (thirdExtraT - thirdExtra) * damp(K_ZOOM, dt)
    const back = T_BACK + thirdExtra + T_SPEED_EXTRA * Math.min(1, speed / T_SPEED_REF)
    _tmp.set(Math.sin(tYaw) * back, T_HEIGHT, Math.cos(tYaw) * back).add(_focus)
    // 隧道：车在地面以下时镜头压到顶板下、并限制在隧道横向宽度内（不穿顶、不穿墙）
    const inTunnel = _pos.y < -0.8
    if (inTunnel) clampTunnel(_tmp, _pos.y)
    const pk = damp(T_K_POS, dt)
    third.pos.x += (_tmp.x - third.pos.x) * pk
    third.pos.z += (_tmp.z - third.pos.z) * pk
    // 高度和注视点用同一套平滑值。y 再滞后一拍的话，坡上注视点先动、镜头后跟，俯仰会来回抽。
    third.pos.y = _tmp.y
    if (inTunnel) clampTunnel(third.pos, _pos.y)
    { // 停车场 / 螺旋坡道：相机压在头顶楼板之下（不穿顶）
      const ce = structCeil(third.pos.x, third.pos.z, _pos.y)
      if (ce < Infinity) third.pos.y = Math.max(_pos.y + 0.9, Math.min(third.pos.y, ce))
    }
    third.look.set(-Math.sin(tYaw) * T_LOOK_AHEAD, T_LOOK_H, -Math.cos(tYaw) * T_LOOK_AHEAD).add(_focus)
    lookQuat(third)

    // 第一人称：刚性挂车（插值后位置），朝向只用平滑 yaw
    fYaw += wrap(carYaw - fYaw) * damp(F_K_YAW, dt)
    const sy = Math.sin(fYaw), cy = Math.cos(fYaw)
    first.pos.set(_pos.x + F_OFFSET.x * cy + F_OFFSET.z * sy, rideY + F_OFFSET.y, _pos.z - F_OFFSET.x * sy + F_OFFSET.z * cy)
    first.look.set(first.pos.x - sy * F_LOOK_DIST, first.pos.y - 0.6, first.pos.z - cy * F_LOOK_DIST)
    lookQuat(first)
    first.fov += (F_FOV + F_FOV_EXTRA * Math.min(1, speed / T_SPEED_REF) - first.fov) * damp(F_K_FOV, dt)

    // 俯视：固定朝向只平移
    topDist += (topDistT - topDist) * damp(K_ZOOM, dt)
    // 螺旋内俯视改为近垂直（45° 斜俯视时相机会落进相邻楼体）
    { const dx = _focus.x - SPIRAL.c[0], dz = _focus.z - SPIRAL.c[1]
      spTopK += ((dx * dx + dz * dz < (SPIRAL.R + 12) ** 2 ? 1 : 0) - spTopK) * damp(3, dt) }
    _tmp.copy(_topDir).lerp(_topDirV, spTopK).normalize().multiplyScalar(topDist).add(_focus); _tmp.y += 0.5
    top.pos.lerp(_tmp, damp(P_K_POS, dt))
    _tmp.copy(_focus); _tmp.y = 0.5
    top.look.lerp(_tmp, damp(P_K_LOOK, dt))
    lookQuat(top)

    if (tunnelRoof.current) tunnelRoof.current.visible = camState.mode !== 'top'
    { const gl = garageLocal(_pos.x, _pos.z), topM = camState.mode === 'top' && Math.abs(gl[0]) < GARAGE.HU + 4 && Math.abs(gl[1]) < GARAGE.HV + 4
      if (garageLevels.l1) garageLevels.l1.visible = !(topM && _pos.y < 3.3)
      if (garageLevels.l2) garageLevels.l2.visible = !(topM && _pos.y < 7.3) }
    { const dx = _pos.x - SPIRAL.c[0], dz = _pos.z - SPIRAL.c[1], inS = camState.mode === 'top' && dx * dx + dz * dz < (SPIRAL.R + 12) ** 2
      spiralClip.constant = inS ? _pos.y + 2.6 : 1e4 }
    // 输出 + 切换过渡
    const p = poses[camState.mode]
    let fov = p.fov
    if (transT < 1) {
      transT = Math.min(1, transT + dt / TRANSITION)
      const s = transT * transT * (3 - 2 * transT)
      cam.position.lerpVectors(from.pos, p.pos, s)
      cam.quaternion.slerpQuaternions(from.quat, p.quat, s)
      fov = from.fov + (p.fov - from.fov) * s
    } else { cam.position.copy(p.pos); cam.quaternion.copy(p.quat) }
    camStats.transT = transT
    if (import.meta.env.DEV && (window as any).__overview) { const o = (window as any).__overview; cam.position.set(o[0], o[2], o[1]); cam.up.set(0, 0, -1); cam.lookAt(o[0], 0, o[1]); cam.up.set(0, 1, 0); scene.fog = null; if (cam.far < 2000) { cam.far = 2000; cam.updateProjectionMatrix() } }
    if (!Number.isFinite(cam.position.x + cam.position.y + cam.position.z + cam.quaternion.w)) {
      cam.position.copy(from.pos); cam.quaternion.copy(from.quat); camStats.nan++; inited = false
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix() }
  })
  return null
}
