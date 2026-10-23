import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colors } from '../theme/colors'
import { isMobile } from '../utils/isMobile'

const H = 20
const SPEED = 18

/** 雨丝：GPU 顶点着色器下落（uniform 时间），CPU 每帧零缓冲更新。冷白 30%，斜 10°，手机 1000 / 桌面 3000 */
export function Rain() {
  const count = isMobile ? 1000 : 3000
  const { geo, mat } = useMemo(() => {
    const pos = new Float32Array(count * 6)
    const end = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 60, y = Math.random() * H, z = (Math.random() - 0.5) * 100
      pos.set([x, y, z, x, y, z], i * 6)
      end[i * 2 + 1] = 1
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H / 2, 0), 70)
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uColor: { value: new THREE.Color(colors.coldWhite) }, uOpacity: { value: 0.3 } },
      ]),
      vertexShader: /* glsl */ `
        uniform float uTime; attribute float aEnd;
        #include <fog_pars_vertex>
        void main(){
          vec3 p = position;
          p.y = mod(p.y - uTime * ${SPEED.toFixed(1)}, ${H.toFixed(1)}) - aEnd * 0.5;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity;
        #include <fog_pars_fragment>
        void main(){
          gl_FragColor = vec4(uColor, uOpacity);
          #include <fog_fragment>
        }`,
    })
    return { geo: g, mat: m }
  }, [count])
  const ref = useRef<THREE.LineSegments>(null)
  useFrame(({ camera }, dt) => {
    // 雨区跟随镜头（大地图下不用铺满全城）
    if (ref.current) ref.current.position.set(Math.round(camera.position.x), 0, Math.round(camera.position.z))
    mat.uniforms.uTime.value = (mat.uniforms.uTime.value + Math.min(dt, 0.1)) % 1000
  })
  return <lineSegments ref={ref} geometry={geo} material={mat} rotation={[0, 0, THREE.MathUtils.degToRad(10)]} frustumCulled={false} />
}
