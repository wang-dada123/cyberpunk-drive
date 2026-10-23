import { Suspense, useState } from 'react'
import { PerformanceMonitor } from '@react-three/drei'
import { PerfOverlay } from './PerfOverlay'
import { DEBUG } from '../utils/quality'
import { Canvas, advance } from '@react-three/fiber'

// 仅开发自测：?manual → frameloop=never，由 Playwright 调 window.__advance(ts) 以固定节奏（如 144Hz）推进帧
const MANUAL = import.meta.env.DEV && new URLSearchParams(location.search).has('manual')
if (MANUAL) Object.assign(window, { __advance: advance })
import { Physics } from '@react-three/rapier'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { colors, bloom, fogDensity, districts } from '../theme/colors'
import { City } from './City'
import { StaticBatch } from './StaticBatch'
import { Car } from './Car'
import { FollowCamera } from './FollowCamera'
import { DistrictAtmosphere } from './DistrictAtmosphere'
import { Rain } from './Rain'
import { isMobile } from '../utils/isMobile'
import { detectRenderer } from '../utils/rendererCheck'

function Lights() {
  // 预算：全场 pointLight = 6（广场 1 + 四区各 1 + 窄巷门 1），桌面/手机一致
  const pl: Array<[number, number, number, string, number, number]> = [
    [0, 6, 14, colors.iceBlue, 1.0, 22], // 广场 / 出生点
    [0, 5, -50, districts.portfolio.accent2, 0.9, 20], // 作品街
    [60, 4, 0, districts.aiStall.accent, 1.0, 20], // AI 摊位
    [-60, 4, 0, districts.hidden.accent, 0.8, 18], // 彩蛋区
    [0, 4, 112, colors.iceBlue, 0.9, 14], // 雨夜窄巷
    [0, 8, 140, colors.iceBlue, 1.2, 18], // 窄巷尽头门
  ]
  return (
    <>
      <DistrictAtmosphere />
      <directionalLight position={[0, 25, -60]} intensity={0.25} color="#9FC9FF" />
      {pl.map(([x, y, z, c, i, d]) => <pointLight key={x + ',' + z} position={[x, y, z]} color={c} intensity={i} distance={d} />)}
    </>
  )
}

const MAX_DPR = isMobile ? 1.25 : 1.5

export function Scene() {
  const [dpr, setDpr] = useState(Math.min(MAX_DPR, window.devicePixelRatio || 1))
  return (
    <Canvas
      dpr={dpr}
      frameloop={MANUAL ? 'never' : 'always'}
      camera={{ position: [0, 6, 12], fov: 50, near: 0.5, far: 170 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, camera }) => { detectRenderer(gl); if (import.meta.env.DEV || DEBUG) Object.assign(window, { __gl: gl, __cam: camera }) }}
      style={{ width: '100%', height: '100%', background: colors.bg }}
    >
      {/* 持续低帧时 DPR 只降一次到 1，不再回升 */}
      <PerformanceMonitor
        // 单向降级一次：原先 incline/decline 来回切 DPR → Canvas resize + 后处理 FBO 重建 → 周期性尖峰
        flipflops={1}
        onDecline={() => setDpr((d) => (d > 1 ? 1 : d))}
      />
      {DEBUG && <PerfOverlay />}
      <color attach="background" args={[colors.bg]} />
      <fogExp2 attach="fog" args={[colors.fog, fogDensity]} />
      <Lights />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} interpolate updatePriority={-50}>
          <StaticBatch><City /></StaticBatch>
          <Car />
        </Physics>
        <FollowCamera />
        <Rain />
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={bloom.intensity}
            luminanceThreshold={bloom.threshold}
            luminanceSmoothing={0.3}
            mipmapBlur
            resolutionScale={0.5}
          />
        </EffectComposer>
      </Suspense>
    </Canvas>
  )
}
