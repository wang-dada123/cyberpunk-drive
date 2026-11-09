import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mainStreetDrive, solids, streetSigns, type StreetSign } from '../data/mainStreet'
import { facadeEnvPMREM } from '../utils/look'
import { getMainStreet, makeStreetMat, streetTime } from './mainStreetBuild'

const FONT_EN = `${import.meta.env.BASE_URL}fonts/orbitron-main.woff`
const FONT_ZH = `${import.meta.env.BASE_URL}fonts/noto-sc-main.woff`
const CHARS_EN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789: '
const CHARS_ZH = '面修茶雨巷'
const WHITE = new THREE.Color('#E8F4FF').multiplyScalar(1.6)
const ICE = new THREE.Color('#4FC3F7').multiplyScalar(1.4)

type RenderInfo = {
  glyphBounds: ArrayLike<number>
  glyphAtlasIndices: ArrayLike<number>
  sdfTexture: THREE.Texture
  sdfGlyphSize: number
  sdfExponent: number
}
type Troika = { textRenderInfo?: RenderInfo | null }

if (import.meta.env.DEV) {
  const built = getMainStreet()
  Object.assign(window, { __mainStreet: { pts: mainStreetDrive(), tris: built.tris, trims: built.trims.length } })
}

function bakeSigns(list: { sign: StreetSign; info: Troika }[]) {
  const pos: number[] = []
  const uv: number[] = []
  const index: number[] = []
  const dim: number[] = []
  const col: number[] = []
  const anc: number[] = []
  let tex: THREE.Texture | null = null
  let glyph = 64
  let exp = 9
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()
  for (const { sign, info } of list) {
    const tr = info.textRenderInfo
    if (!tr || !tr.glyphAtlasIndices?.length) continue
    tex = tr.sdfTexture
    glyph = tr.sdfGlyphSize
    exp = tr.sdfExponent
    m4.compose(new THREE.Vector3(sign.p[0], sign.p[1], sign.p[2]), q.setFromEuler(e.set(0, sign.ry, 0)), new THREE.Vector3(1, 1, 1))
    const tint = sign.ice ? ICE : WHITE
    const bounds = tr.glyphBounds
    const ids = tr.glyphAtlasIndices
    for (let i = 0; i < ids.length; i++) {
      const x0 = bounds[i * 4], y0 = bounds[i * 4 + 1], x1 = bounds[i * 4 + 2], y1 = bounds[i * 4 + 3]
      const corners: [number, number, number, number][] = [[x0, y0, 0, 0], [x1, y0, 1, 0], [x1, y1, 1, 1], [x0, y1, 0, 1]]
      const world = corners.map(([x, y]) => v.set(x, y, 0).applyMatrix4(m4).clone())
      const push = (k: number) => {
        const w = world[k]
        pos.push(w.x, w.y, w.z)
        uv.push(corners[k][2], corners[k][3])
        index.push(ids[i])
        dim.push(Math.max(0.001, x1 - x0), Math.max(0.001, y1 - y0))
        col.push(tint.r, tint.g, tint.b)
        anc.push(sign.p[0], sign.p[1], sign.p[2])
      }
      for (const k of [0, 1, 2, 0, 2, 3]) push(k)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('aIndex', new THREE.Float32BufferAttribute(index, 1))
  g.setAttribute('aDim', new THREE.Float32BufferAttribute(dim, 2))
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('aAnchor', new THREE.Float32BufferAttribute(anc, 3))
  g.computeBoundingSphere()
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: true,
    side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uMap: { value: tex },
        uSize: { value: new THREE.Vector2((tex?.image as { width?: number } | undefined)?.width || 1, (tex?.image as { height?: number } | undefined)?.height || 1) },
        uGlyph: { value: glyph },
        uExp: { value: exp },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute float aIndex;
      attribute vec2 aDim;
      attribute vec3 aColor;
      attribute vec3 aAnchor;
      varying vec2 vUv;
      varying float vIndex;
      varying vec2 vDim;
      varying vec3 vColor;
      varying float vHide;
      void main() {
        vUv = uv; vIndex = aIndex; vDim = aDim; vColor = aColor;
        vHide = step(60.0, distance(cameraPosition, aAnchor));
        vec3 pos = vHide > 0.5 ? aAnchor : position;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uMap;
      uniform vec2 uSize;
      uniform float uGlyph;
      uniform float uExp;
      varying vec2 vUv;
      varying float vIndex;
      varying vec2 vDim;
      varying vec3 vColor;
      varying float vHide;
      void main() {
        if (vHide > 0.5) discard;
        float cols = uSize.x / uGlyph;
        float cell = floor(vIndex / 4.0);
        vec2 cellUv = uGlyph / uSize;
        vec2 start = cellUv * vec2(mod(cell, cols), floor(cell / cols));
        vec2 tuv = mix(start, start + cellUv, clamp(vUv, 0.001, 0.999));
        vec4 rgba = texture2D(uMap, tuv);
        float ch = mod(vIndex, 4.0);
        float a = ch < 0.5 ? rgba.r : ch < 1.5 ? rgba.g : ch < 2.5 ? rgba.b : rgba.a;
        float maxDim = max(vDim.x, vDim.y);
        float absDist = (1.0 - pow(2.0 * (a > 0.5 ? 1.0 - a : a), 1.0 / uExp)) * maxDim;
        float dist = absDist * (a > 0.5 ? -1.0 : 1.0);
        float aa = length(fwidth(vUv * vDim)) * 0.5;
        float alpha = smoothstep(aa, -aa, dist);
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(vColor, alpha);
        #include <fog_fragment>
      }`,
  })
  const mesh = new THREE.Mesh(g, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  return mesh
}

function SignBake({ signs }: { signs: StreetSign[] }) {
  const [mesh, setMesh] = useState<THREE.Mesh | null>(null)
  const got = useRef<Troika[]>([])
  const done = useRef(false)
  if (mesh) return <primitive object={mesh} />
  return (
    <group visible={false}>
      {signs.map((s, i) => (
        <Text
          key={i}
          font={s.font === 'zh' ? FONT_ZH : FONT_EN}
          characters={s.font === 'zh' ? CHARS_ZH : CHARS_EN}
          fontSize={s.size}
          letterSpacing={0.15}
          lineHeight={0.96}
          anchorX="center"
          anchorY="middle"
          onSync={(troika) => {
            got.current[i] = troika as Troika
            if (done.current || got.current.filter(Boolean).length < signs.length) return
            done.current = true
            setMesh(bakeSigns(signs.map((sign, k) => ({ sign, info: got.current[k] }))))
          }}
        >
          {s.vertical ? s.text.split('').join('\n') : s.text}
        </Text>
      ))}
    </group>
  )
}

export function MainStreet() {
  const gl = useThree((s) => s.gl)
  const geo = useMemo(() => getMainStreet().geo, [])
  const mat = useMemo(() => {
    const m = makeStreetMat()
    m.envMap = facadeEnvPMREM(gl)
    return m
  }, [gl])
  const signs = useMemo(() => streetSigns(), [])
  const boxes = useMemo(() => solids(), [])
  useFrame((_, dt) => { streetTime.value += dt })
  return (
    <group>
      <mesh geometry={geo} material={mat} frustumCulled={false} />
      <SignBake signs={signs} />
      <RigidBody type="fixed" colliders={false}>
        {boxes.map((b) => <CuboidCollider key={b.id} args={b.h} position={b.c} />)}
      </RigidBody>
    </group>
  )
}
