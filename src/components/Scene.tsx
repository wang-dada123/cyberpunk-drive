import { Suspense, useState } from 'react'
import { PerformanceMonitor } from '@react-three/drei'
import { PerfOverlay } from './PerfOverlay'
import { DEBUG } from '../utils/quality'
import { Canvas, advance } from '@react-three/fiber'

// 仅开发自测：?manual → frameloop=never，由 Playwright 调 window.__advance(ts) 以固定节奏（如 144Hz）推进帧
const MANUAL = import.meta.env.DEV && new URLSearchParams(location.search).has('manual')
if (MANUAL) Object.assign(window, { __advance: advance })
import { Physics } from '@react-three/rapier'
import { FogPlanes } from './FogPlanes'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { colors, bloom, fogDensity } from '../theme/colors'
import { City } from './City'
import { StaticBatch } from './StaticBatch'
import { Car } from './Car'
import { FollowCamera } from './FollowCamera'
import { DistrictAtmosphere } from './DistrictAtmosphere'
import { Rain } from './Rain'
import { isMobile } from '../utils/isMobile'
import { detectRenderer, rendererInfo } from '../utils/rendererCheck'
import { AB, tierState, onTier, tierFromRenderer, demote, displayHz } from '../utils/tier'
import { GroundBake } from './GroundFX'
import { LAMPS, REAL_LIGHTS } from '../utils/fakeLights'
import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'

/** 运行中单向降档：预热 4s 后，3s 窗口平均帧时 > 24ms 且不像 30Hz 节流（帧间隔不贴 33.3ms 且显示器探测 >40Hz）→ low。软件渲染/手动推进不触发 */
function AutoTier() {
  useFrame((_, dt) => {
    const a = AutoTier as unknown as { t: number; acc: number; n: number }
    a.t = (a.t ?? 0) + dt
    if (tierState.tier === 'low' || MANUAL || rendererInfo.software || a.t < 4) return
    a.acc = (a.acc ?? 0) + dt; a.n = (a.n ?? 0) + 1
    if (a.acc < 3) return
    const avg = (a.acc / a.n) * 1000; a.acc = 0; a.n = 0
    const throttled = displayHz.probe > 0 && displayHz.probe < 40
    if (avg > 24 && !throttled) demote(`实测平均 ${avg.toFixed(1)}ms`)
  })
  return null
}
function useTier() { const [t, setT] = useState(tierState.tier); useEffect(() => onTier(setT), []); return t }

function Lights() {
  // 6 盏点光源已编译为着色器常量假光（utils/fakeLights.ts）；?ab=reallights 对照
  return (
    <>
      <DistrictAtmosphere />
      <directionalLight position={[0, 25, -60]} intensity={0.25} color="#9FC9FF" />
      {REAL_LIGHTS && !AB.has('lights') && LAMPS.map(([x, y, z, c, i, d]) => <pointLight key={x + ',' + z} position={[x, y, z]} color={c} intensity={i} distance={d} />)}
    </>
  )
}

const MAX_DPR = isMobile ? 1.25 : 1.5

export function Scene() {
  const tier = useTier()
  const [dprHi] = useState(Math.min(MAX_DPR, window.devicePixelRatio || 1))
  const dpr = tier === 'low' ? Math.min(1, dprHi) : dprHi
  return (
    <Canvas
      dpr={dpr}
      frameloop={MANUAL ? 'never' : 'always'}
      camera={{ position: [0, 6, 12], fov: 50, near: 0.5, far: 180 }}
      gl={{ antialias: AB.has('bloom'), /* 场景走 EffectComposer（RT 无 MSAA），默认帧缓冲 MSAA 只浪费一次全屏 resolve */ powerPreference: 'high-performance' }}
      onCreated={({ gl, camera }) => { detectRenderer(gl); tierFromRenderer(rendererInfo.name); if (import.meta.env.DEV || DEBUG) Object.assign(window, { __gl: gl, __cam: camera }) }}
      style={{ width: '100%', height: '100%', background: colors.bg }}
    >
      {/* 持续低帧时 DPR 只降一次到 1，不再回升 */}
      <PerformanceMonitor
        // 单向降级一次：原先 incline/decline 来回切 DPR → Canvas resize + 后处理 FBO 重建 → 周期性尖峰
        flipflops={1}
        onDecline={() => demote('PerformanceMonitor 持续低帧')}
      />
      {DEBUG && <PerfOverlay />}
      <AutoTier />
      <GroundBake />
      <color attach="background" args={[colors.bg]} />
      <fogExp2 attach="fog" args={[colors.fog, fogDensity]} />
      <Lights />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} interpolate={false} updatePriority={-50}>
          <StaticBatch><City /></StaticBatch>
          <Car />
        </Physics>
        <FollowCamera />
        <FogPlanes />
        {!AB.has('rain') && <Rain half={tier === 'low'} />}
        {!AB.has('bloom') && <EffectComposer multisampling={0}>
          <Bloom
            key={tier}
            levels={tier === 'low' ? 4 : 8}
            intensity={bloom.intensity}
            luminanceThreshold={bloom.threshold}
            luminanceSmoothing={0.3}
            mipmapBlur
            radius={0.6}
            resolutionScale={tier === 'low' ? 0.35 : 0.5}
          />
        </EffectComposer>}
      </Suspense>
    </Canvas>
  )
}
