import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * 地面程序化材质（美术总监定稿参数）：
 * - 沥青：深灰 + 噪声粗糙度 0.6–0.8 + 不规则拼缝/细裂缝；
 * - 积水：覆盖约 15–20%，直径 0.5–4m，粗糙度 0.05，边缘渐变；路边/灯下多、路中少；假反射＝低粗糙度 + 冷色涂抹（不用 Reflector）；
 * - 广场：2m 石材分格 #141C26 + 轻微色差，每 4 块一条冰蓝细线槽（4cm），从塔脚放射。
 * 全部在已有 mesh 的着色器里完成：不增加 draw call / 三角面。
 */
const NOISE = /* glsl */ `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ return 0.5 * vn(p) + 0.3 * vn(p * 2.03 + 7.1) + 0.2 * vn(p * 4.11 + 3.7); }
`
/** 6 盏 pointLight 的 XZ（灯下多积水） */
export const LAMPS_XZ: [number, number][] = [[0, 14], [0, -50], [60, 0], [-60, 0], [0, 112], [0, 140]] // 与 Scene.tsx 的 pointLight 一致

type Edge = { mode: 0 | 1; R?: number; W?: number }
export function makeAsphalt(color: string, edge: Edge) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.25 })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMode = { value: edge.mode }
    sh.uniforms.uRing = { value: new THREE.Vector2(edge.R ?? 0, (edge.W ?? 1) / 2) }
    sh.uniforms.uLamps = { value: LAMPS_XZ.slice(0, 6).concat(Array(Math.max(0, 6 - LAMPS_XZ.length)).fill([9999, 9999])).map(([x, z]) => new THREE.Vector2(x, z)) }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec2 vUv0;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vUv0 = uv;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWp; varying vec2 vUv0; uniform float uMode; uniform vec2 uRing; uniform vec2 uLamps[6];
float gPud; ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 w = vWp.xz;
  // 路边因子：0 路中 → 1 路缘
  float edge = uMode < 0.5 ? abs(vUv0.x - 0.5) * 2.0 : clamp(abs(length(w) - uRing.x) / uRing.y, 0.0, 1.0);
  float lamp = 0.0;
  for (int i = 0; i < 6; i++) { vec2 d = w - uLamps[i]; lamp = max(lamp, exp(-dot(d, d) / 90.0)); }
  // 积水：两档尺度噪声（0.5–4m），路中阈值高、路边/灯下阈值低
  float pn = 0.62 * vn(w * 0.8 + 11.3) + 0.38 * vn(w * 2.4 + 3.1);
  float thr = 0.71 - 0.14 * smoothstep(0.45, 1.0, edge) - 0.04 * lamp;
  gPud = smoothstep(thr - 0.01, thr + 0.02, pn);
  // 沥青颗粒 + 大块色差
  float g = vn(w * 7.0), big = fbm(w * 0.12);
  diffuseColor.rgb *= 0.86 + 0.14 * g + 0.18 * (big - 0.5);
  // 不规则拼缝：噪声扭曲后的错缝板块（行高 4.7m、板长 6.3m、每行随机错位）
  vec2 q = w + (vec2(fbm(w * 0.07), fbm(w * 0.07 + 5.0)) - 0.5) * 5.0;
  float row = floor(q.y / 4.7);
  float sx = abs(fract((q.x + h21(vec2(row, 3.0)) * 6.3) / 6.3) - 0.5) * 6.3;
  float sy = abs(fract(q.y / 4.7) - 0.5) * 4.7;
  float seam;
  float sd = min(3.15 - sx, 2.35 - sy);
  seam = 1.0 - (1.0 - smoothstep(0.012, 0.045, sd)) * (0.35 + 0.3 * vn(w * 0.8));
  // 细裂缝：噪声等值线
  float cr = abs(vn(w * 0.9 + 21.0) - 0.5);
  seam *= 1.0 - (1.0 - smoothstep(0.004, 0.012, cr)) * 0.35 * step(0.55, vn(w * 0.2));
  diffuseColor.rgb *= seam;
  // 积水更暗更深（湿）
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.35, gPud);
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(0.6 + 0.2 * fbm(vWp.xz * 0.5), 0.1, gPud);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(0.25, 0.35, gPud);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// 假反射：水洼里一层很淡的冷色涂抹（纵向拉长的噪声，像街灯/招牌倒影）
{ float st = vn(vec2(vWp.x * 0.45, vWp.z * 0.06) + 2.0);
  totalEmissiveRadiance += gPud * (vec3(0.006, 0.02, 0.035) * (0.4 + st) + vec3(0.03, 0.005, 0.025) * smoothstep(0.7, 0.95, st)); }`)
  }
  m.customProgramCacheKey = () => 'asphalt'
  return m
}

/** 广场石材：极坐标 2m 分格（随半径自适应块数）+ 冰蓝线槽（每 4 块：r=8/16/24 环 + 16 条放射） */
export function makePlazaStone(R: number) {
  const m = new THREE.MeshStandardMaterial({ color: '#141C26', roughness: 0.55, metalness: 0.3 })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uR = { value: R }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWp; uniform float uR; float gGroove; ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 w = vWp.xz; float r = length(w); float th = atan(w.x, w.y); // 0 = +Z（出生点方向）
  float band = floor(r / 2.0);
  float n = max(4.0, floor(6.2832 * (band * 2.0 + 1.0) / 2.0));
  float a = (th / 6.2832 + 0.5) * n; float ai = floor(a);
  float fw = max(fwidth(r), 1e-4);
  // 板缝（暗，约 1.5cm）
  float dr = abs(fract(r / 2.0 + 0.5) - 0.5) * 2.0;
  float da = abs(fract(a + 0.5) - 0.5) * (6.2832 * r / n);
  float seamD = min(dr, da);
  float seam = mix(1.0, smoothstep(0.0075 - fw * 0.5, 0.0075 + fw * 0.5, seamD), clamp(0.03 / (2.0 * fw), 0.25, 1.0));
  // 每块轻微色差（冷暖 ±）
  float hv = h21(vec2(band, ai));
  diffuseColor.rgb *= 0.9 + 0.2 * hv;
  diffuseColor.rgb += vec3(-0.004, 0.0, 0.006) * (h21(vec2(ai, band) + 3.0) - 0.5) * 4.0;
  diffuseColor.rgb *= 0.92 + 0.08 * vn(w * 3.0);
  diffuseColor.rgb *= mix(0.45, 1.0, seam);
  // 冰蓝线槽（宽 4cm）：每 4 块一条
  float ringD = abs(fract(r / 8.0 + 0.5) - 0.5) * 8.0;
  float radA = abs(fract(th / 6.2832 * 16.0 + 0.5) - 0.5) * (6.2832 * r / 16.0);
  float gd = min(ringD, radA);
  gGroove = (1.0 - smoothstep(0.02 - fw * 0.5, 0.02 + fw * 0.5, gd)) * clamp(0.04 / (2.0 * fw), 0.0, 1.0) * step(6.5, r) * step(r, uR - 0.8);
  diffuseColor.rgb *= 1.0 - gGroove * 0.6;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = 0.45 + 0.2 * vn(vWp.xz * 1.3);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += gGroove * vec3(0.31, 0.76, 0.97) * 0.38; // 比导向箭头低一档`)
  }
  m.customProgramCacheKey = () => 'plazaStone'
  return m
}

/** 出生点三向导向：每组沿折线每 3m 一个 0.6m 小箭头，1.2s 循环流光；颜色＝目的地主色×0.62（低于 Bloom 阈值），流光峰值略过阈值。全部 1 个 draw call。 */
export type ArrowPath = { pts: [number, number][]; color: string }
export function SpawnArrows({ paths, step = 3 }: { paths: ArrowPath[]; step?: number }) {
  const { geo, mat } = useMemo(() => {
    const s = new THREE.Shape()
    const W = 0.3, D = 0.4, T = 0.1
    s.moveTo(0, D / 2); s.lineTo(W, -D / 2); s.lineTo(W - T, -D / 2); s.lineTo(0, D / 2 - T * 1.4); s.lineTo(-W + T, -D / 2); s.lineTo(-W, -D / 2); s.closePath()
    const base = new THREE.ShapeGeometry(s); base.rotateX(-Math.PI / 2) // 尖朝 -Z
    const off: number[] = [], rot: number[] = [], idx: number[] = [], col: number[] = [], cnt: number[] = []
    const c = new THREE.Color()
    for (const p of paths) {
      c.set(p.color)
      const items: number[][] = []
      for (let k = 0; k < p.pts.length - 1; k++) {
        const [ax, az] = p.pts[k], [bx, bz] = p.pts[k + 1]
        const L = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.round(L / step))
        const yaw = Math.atan2(-(bx - ax), -(bz - az))
        for (let j = 0; j < m; j++) items.push([ax + (bx - ax) * j / m, az + (bz - az) * j / m, yaw])
      }
      items.forEach(([x, z, yaw], i) => { off.push(x, 0.062, z); rot.push(yaw); idx.push(i); col.push(c.r, c.g, c.b); cnt.push(items.length) })
    }
    const g = new THREE.InstancedBufferGeometry()
    g.index = base.index; g.setAttribute('position', base.getAttribute('position'))
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(off), 3))
    g.setAttribute('aRot', new THREE.InstancedBufferAttribute(new Float32Array(rot), 1))
    g.setAttribute('aIdx', new THREE.InstancedBufferAttribute(new Float32Array(idx), 1))
    g.setAttribute('aN', new THREE.InstancedBufferAttribute(new Float32Array(cnt), 1))
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(new Float32Array(col), 3))
    g.instanceCount = rot.length
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 10), 40)
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `attribute vec3 aOff, aCol; attribute float aIdx, aRot, aN; uniform float uTime; varying float vK; varying vec3 vC;
        void main(){ float head = fract(uTime / 1.2) * (aN + 2.0) - 1.0; float d = aIdx - head;
          vK = exp(-d * d * 1.6); vC = aCol;
          float c = cos(aRot), s = sin(aRot); vec3 p = vec3(c * position.x + s * position.z, position.y, -s * position.x + c * position.z);
          gl_Position = projectionMatrix * viewMatrix * vec4(p + aOff, 1.0); }`,
      fragmentShader: `varying float vK; varying vec3 vC;
        void main(){ gl_FragColor = vec4(vC * (0.62 + 0.75 * vK), 0.55 + 0.45 * vK); }`,
    })
    return { geo: g, mat: m }
  }, [paths, step])
  useFrame((_, dt) => { mat.uniforms.uTime.value = (mat.uniforms.uTime.value + Math.min(dt, 0.1)) % 1200 })
  return <mesh geometry={geo} material={mat} />
}
