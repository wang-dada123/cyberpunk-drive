import { Suspense, useState } from 'react'
import { PerformanceMonitor, StatsGl } from '@react-three/drei'
import { DEBUG } from '../utils/quality'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { colors, bloom, fogDensity, districts } from '../theme/colors'
import { City } from './City'
import { Car } from './Car'
import { FollowCamera } from './FollowCamera'
import { DistrictAtmosphere } from './DistrictAtmosphere'
import { Rain } from './Rain'
import { isMobile } from '../utils/isMobile'

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
      camera={{ position: [0, 6, 12], fov: 50, near: 0.5, far: 260 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%', background: colors.bg }}
    >
      {/* FPS 低时自动降 DPR（只在跨阈值时 setState，非每帧） */}
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(0.75, +(d - 0.25).toFixed(2)))}
        onIncline={() => setDpr((d) => Math.min(MAX_DPR, +(d + 0.25).toFixed(2)))}
      />
      {DEBUG && <StatsGl className="stats-gl" />}
      <color attach="background" args={[colors.bg]} />
      <fogExp2 attach="fog" args={[colors.fog, fogDensity]} />
      <Lights />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} interpolate>
          <City />
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
