import { Suspense, useState } from 'react'
import { PerformanceMonitor, StatsGl } from '@react-three/drei'
import { DEBUG } from '../utils/quality'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { colors, bloom, fogDensity } from '../theme/colors'
import { City } from './City'
import { Car } from './Car'
import { FollowCamera } from './FollowCamera'
import { DistrictAtmosphere } from './DistrictAtmosphere'
import { Rain } from './Rain'
import { isMobile } from '../utils/isMobile'

function Lights() {
  // 冰蓝地面光池：每 ~10m 一个，手机端限量
  const zs = [-6, -26, -46] // 预算：全场 pointLight ≤ 6（巷 3 + 作品街 ≤2 + 门 1）
  return (
    <>
      <DistrictAtmosphere />
      {/* 弱月光，从巷尾上方打轮廓 */}
      <directionalLight position={[0, 25, -60]} intensity={0.25} color="#9FC9FF" />
      {zs.map((z) => (
        <pointLight key={z} position={[0, 4, z]} intensity={0.8} color={colors.iceBlue} distance={10} />
      ))}
      {/* 作品街光池（亮蓝） */}
      {(isMobile ? [-20] : [-12, -28]).map((lz) => {
        const th = (-Math.PI * 2) / 3
        return <pointLight key={'pf' + lz} position={[lz * Math.sin(th), 4, lz * Math.cos(th)]} intensity={0.9} color={colors.deepBlue} distance={12} />
      })}
      <pointLight position={[0, 8, -48]} intensity={1.2} color={colors.deepBlue} distance={20} />
    </>
  )
}

const MAX_DPR = isMobile ? 1.25 : 1.5

export function Scene() {
  const [dpr, setDpr] = useState(Math.min(MAX_DPR, window.devicePixelRatio || 1))
  return (
    <Canvas
      dpr={dpr}
      camera={{ position: [0, 6, 12], fov: 50, near: 0.5, far: 200 }}
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
