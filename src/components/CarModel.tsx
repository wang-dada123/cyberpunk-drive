import { useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LOOK, neonEnvPMREM, carSpotUniform } from '../utils/look'

/** Kenney Car Kit race-future.glb（CC0）。模型朝 +Z，长 2.66 宽 1.2 底 y=0 */
const URL = `${import.meta.env.BASE_URL}models/race-future.glb`
const SCALE = 0.8 // → 长 ~2.13 宽 ~0.96，贴合 0.55×0.35×1 半尺寸碰撞体
const L = LOOK.car

const bodyMat = new THREE.MeshStandardMaterial({ color: L.paint, metalness: L.metalness, roughness: L.roughness, envMapIntensity: L.envMapIntensity })
const wheelMat = new THREE.MeshStandardMaterial({ color: '#0B0E13', roughness: 0.8 })
const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.waist).multiplyScalar(L.waistK), toneMapped: false })
const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.front).multiplyScalar(L.frontK), toneMapped: false })
const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.tail).multiplyScalar(L.tailK), toneMapped: false })

/** 头灯光束：开口锥体，车头 a0 → 末端 0，additive、不写深度；边缘按视角柔化 */
const beamGeo = (() => {
  const g = new THREE.CylinderGeometry(L.beam.r1, L.beam.r0, L.beam.len, 24, 1, true) // top=末端
  g.translate(0, L.beam.len / 2, 0); g.rotateX(-Math.PI / 2 - 0.09) // 轴朝 -Z，微微下压
  return g
})()
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(L.beam.color) }, uA: { value: L.beam.a0 } },
  vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV;
    void main(){ vT = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uA; varying float vT; varying vec3 vN; varying vec3 vV;
    void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 3.0); float a = uA * (1.0 - vT) * (1.0 - vT) * edge; gl_FragColor = vec4(uColor * a, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, toneMapped: false,
})
/** 车底辉光：椭圆径向渐变贴片 */
const underGeo = new THREE.PlaneGeometry(L.under.w, L.under.l).rotateX(-Math.PI / 2)
const underMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(L.under.color) }, uA: { value: L.under.a } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec2 vUv;
    void main(){ float r = length((vUv - 0.5) * 2.0); float a = uA * pow(1.0 - smoothstep(0.0, 1.0, r), 1.6); gl_FragColor = vec4(uColor * a, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
})

if (import.meta.env.DEV) Object.assign(window, { __beamMat: beamMat, __underMat: underMat })
const _p = new THREE.Vector3(), _f = new THREE.Vector3()
export function CarModel() {
  const { scene } = useGLTF(URL)
  const gl = useThree((s) => s.gl)
  useMemo(() => { bodyMat.envMap = neonEnvPMREM(gl); bodyMat.needsUpdate = true }, [gl])
  const model = useMemo(() => {
    const s = scene.clone(true)
    s.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.material = /wheel/i.test(m.name) || /wheel/i.test(m.parent?.name ?? '') ? wheelMat : bodyMat
    })
    return s
  }, [scene])
  const root = useRef<THREE.Group>(null)
  useFrame(() => {
    const r = root.current; if (!r) return
    r.getWorldPosition(_p); _f.set(0, 0, -1).transformDirection(r.matrixWorld)
    const n = Math.hypot(_f.x, _f.z) || 1
    carSpotUniform.value.set(_p.x, _p.z, _f.x / n, _f.z / n)
  })
  const h = L.waistH
  // 灯条坐标为 Car 本地（车头 -Z），模型底贴碰撞体底 y=-0.2
  return (
    <group ref={root} position={[0, -0.2, 0]}>
      <primitive object={model} scale={SCALE} rotation={[0, Math.PI, 0]} />
      {/* 腰线 #4FC3F7 ×1.5 */}
      <mesh material={stripMat} position={[-0.49, 0.2, 0]}><boxGeometry args={[0.02, h, 1.5]} /></mesh>
      <mesh material={stripMat} position={[0.49, 0.2, 0]}><boxGeometry args={[0.02, h, 1.5]} /></mesh>
      {/* 前脸冷白 ×2.0 */}
      <mesh material={headMat} position={[-0.3, 0.3, -1.07]}><boxGeometry args={[0.18, 0.04, 0.02]} /></mesh>
      <mesh material={headMat} position={[0.3, 0.3, -1.07]}><boxGeometry args={[0.18, 0.04, 0.02]} /></mesh>
      {/* 尾线 #00B0FF ×1.5（不用红） */}
      <mesh material={tailMat} position={[0, 0.38, 1.07]}><boxGeometry args={[0.7, 0.04, 0.02]} /></mesh>
      {/* 新增 2 draw：光束 + 车底辉光；地面光斑走地面着色器（0 draw） */}
      <mesh geometry={beamGeo} material={beamMat} position={[0, 0.3, -1.08]} renderOrder={3} frustumCulled={false} />
      <mesh geometry={underGeo} material={underMat} position={[0, 0.03, 0]} renderOrder={2} />
    </group>
  )
}
useGLTF.preload(URL)
