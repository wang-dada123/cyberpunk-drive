import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colors } from '../theme/colors'
import { isMobile } from '../utils/isMobile'
import { BRIDGE, TUNNEL, TUNNEL_R1 } from '../data/mapLayout'

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
        {
          // 遮雨区（世界 XZ，沿轴 u / 横向 v）：隧道全段，天桥桥面下方
          uTunDir: { value: new THREE.Vector2(TUNNEL.dir[0], TUNNEL.dir[1]) }, uTunU: { value: new THREE.Vector3(TUNNEL.R0 + 30, TUNNEL_R1 - 30, TUNNEL.W / 2 + 0.5) /* 顶板范围 */ },
          uBrC: { value: new THREE.Vector2(BRIDGE.c[0], BRIDGE.c[1]) }, uBrDir: { value: new THREE.Vector2(BRIDGE.dir[0], BRIDGE.dir[1]) },
          uBr: { value: new THREE.Vector3(BRIDGE.FLAT / 2 + BRIDGE.RAMP * 0.6, BRIDGE.W / 2 + 0.3, BRIDGE.H) },
          uTime: { value: 0 }, uColor: { value: new THREE.Color(colors.coldWhite) }, uOpacity: { value: 0.3 } },
      ]),
      vertexShader: /* glsl */ `
        uniform float uTime; attribute float aEnd;
        uniform vec2 uTunDir, uBrC, uBrDir; uniform vec3 uTunU, uBr;
        varying float vHide;
        #include <fog_pars_vertex>
        void main(){
          vec3 p = position;
          p.y = mod(p.y - uTime * ${SPEED.toFixed(1)}, ${H.toFixed(1)}) - aEnd * 0.5;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vec2 tn = vec2(-uTunDir.y, uTunDir.x);
          float tu = dot(wp.xz, uTunDir), tv = dot(wp.xz, tn);
          float inTun = step(uTunU.x, tu) * step(tu, uTunU.y) * step(abs(tv), uTunU.z);
          vec2 bq = wp.xz - uBrC; vec2 bn = vec2(-uBrDir.y, uBrDir.x);
          float underBr = step(abs(dot(bq, uBrDir)), uBr.x) * step(abs(dot(bq, bn)), uBr.y) * step(wp.y, uBr.z);
          vHide = max(max(inTun, underBr), step(wp.y, -0.6));
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity; varying float vHide;
        #include <fog_pars_fragment>
        void main(){
          if (vHide > 0.5) discard;
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
