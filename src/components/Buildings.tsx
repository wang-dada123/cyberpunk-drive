import { useMemo } from 'react'
import * as THREE from 'three'
import { neonEnvTex } from '../utils/look'

/**
 * 建筑材质 v2（building-materials-v2.md §1–2）：全部楼体合并成 1 个网格、1 次 draw call。
 * 顶点属性：aMat(0 金属板 / 1 混凝土 / 2 玻璃幕墙)、aWin(亮窗分区色×强度)、aSeed(每栋随机)；uv = 立面米制坐标(u 周长, v 高度)。
 * 亮窗 = 着色器 emissive mask（不加几何），占比 ≈30%，窗内上 70% / 下 100% 竖向渐变；
 * 玻璃只用 envMap 反射(1.4)、竖梃每 1.5m；混凝土底部 1.5m 湿痕(rough .35)；金属面板缝 2cm + 纵向拉丝。
 * 偏差：未用 MeshReflectorMaterial（会整场景重渲染一遍，超三角/帧预算），水洼与玻璃都只用 envMap。
 */
export type Prism = { poly: [number, number][]; h: number; mat: number; win: THREE.Color; seed: number }

export function buildingGeometry(list: Prism[]) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], am: number[] = [], aw: number[] = [], as: number[] = []
  const put = (p: number[], n: number[], u: number[], b: Prism) => { pos.push(...p); nor.push(...n); uv.push(...u); am.push(b.mat); aw.push(b.win.r, b.win.g, b.win.b); as.push(b.seed) }
  for (const b of list) {
    const P = b.poly, n = P.length
    let cx = 0, cz = 0; for (const [x, z] of P) { cx += x / n; cz += z / n }
    let s = 0
    for (let i = 0; i < n; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % n]
      const L = Math.hypot(bx - ax, bz - az); if (L < 1e-3) continue
      let nx = (bz - az) / L, nz = -(bx - ax) / L
      const flip = nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0
      if (flip) { nx = -nx; nz = -nz }
      // 外法线方向下逆时针：从外面看 a→b 需要从左到右
      const [A, B] = flip ? [[bx, bz], [ax, az]] : [[ax, az], [bx, bz]]
      const [u0, u1] = [s, s + L]; s += L
      const q = [[A[0], 0, A[1], u0, 0], [B[0], 0, B[1], u1, 0], [B[0], b.h, B[1], u1, b.h], [A[0], b.h, A[1], u0, b.h]]
      for (const k of [0, 2, 1, 0, 3, 2]) put([q[k][0], q[k][1], q[k][2]], [nx, 0, nz], [q[k][3], q[k][4]], b)
    }
    // 屋顶（凸多边形扇形）
    for (let i = 1; i < n - 1; i++) {
      const tri = [P[0], P[i], P[i + 1]]
      const cr = (tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[1][1] - tri[0][1]) * (tri[2][0] - tri[0][0])
      const ord = cr < 0 ? [0, 1, 2] : [0, 2, 1] // 法线朝 +Y
      for (const k of ord) put([tri[k][0], b.h, tri[k][1]], [0, 1, 0], [tri[k][0], tri[k][1]], b)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(am, 1))
  g.setAttribute('aWin', new THREE.Float32BufferAttribute(aw, 3))
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(as, 1))
  g.computeBoundingSphere()
  return g
}

export const winScale = { value: 1 } // 核显：亮窗 ×0.7

export function makeBuildingMat() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.5, envMap: neonEnvTex, envMapIntensity: 1 })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWinK = winScale
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aMat; attribute vec3 aWin; attribute float aSeed;
varying float vMat; varying vec3 vWin; varying float vSeed; varying vec2 vF; varying float vRoof;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vMat = aMat; vWin = aWin; vSeed = aSeed; vF = uv; vRoof = step(0.5, normal.y);`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWinK; varying float vMat; varying vec3 vWin; varying float vSeed; varying vec2 vF; varying float vRoof;
float bh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gRough; float gMetal; float gEnvK; vec3 gWinE;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float mt = floor(vMat + 0.5);
  vec2 f = vF; vec2 fw = max(fwidth(f), vec2(1e-4));
  vec3 base; gWinE = vec3(0.0);
  if (mt < 0.5) { // 拉丝金属板：面板 3×1.2m，缝 2cm，纵向拉丝
    base = vec3(0.0080, 0.0130, 0.0232); gRough = 0.38; gMetal = 0.85; gEnvK = 0.9;
    vec2 pc = abs(fract(f / vec2(1.2, 3.0) + 0.5) - 0.5) * vec2(1.2, 3.0);
    float seam = smoothstep(0.01 - fw.x, 0.01 + fw.x, pc.x) * smoothstep(0.01 - fw.y, 0.01 + fw.y, pc.y);
    base *= mix(0.45, 1.0, seam) * (0.9 + 0.1 * bh(vec2(floor(f.x * 40.0), 1.0)));
    gRough += 0.06 * (bh(vec2(floor(f.x * 90.0), 3.0)) - 0.5);
  } else if (mt < 1.5) { // 深色混凝土：细噪点粗糙度 + 底部 1.5m 湿痕
    base = vec3(0.0044, 0.0091, 0.0176); gRough = 0.82; gMetal = 0.05; gEnvK = 0.6;
    float nz = bh(floor(f * 6.0)); base *= 0.85 + 0.3 * nz; gRough += 0.1 * (nz - 0.5);
    float wet = 1.0 - smoothstep(1.2, 1.6, f.y) * (1.0 - vRoof) - vRoof; wet = max(wet, 0.0);
    gRough = mix(gRough, 0.35, wet); base *= mix(1.0, 0.7, wet);
  } else { // 玻璃幕墙：envMap 1.4，竖梃 #1C2836 每 1.5m
    base = vec3(0.0030, 0.0070, 0.0137); gRough = 0.08; gMetal = 0.9; gEnvK = 1.4;
    float mu = abs(fract(f.x / 1.5 + 0.5) - 0.5) * 1.5;
    float tr = abs(fract(f.y / 3.5 + 0.5) - 0.5) * 3.5;
    float mull = 1.0 - smoothstep(0.035 - fw.x, 0.035 + fw.x, mu) * smoothstep(0.03 - fw.y, 0.03 + fw.y, tr);
    base = mix(base, vec3(0.0116, 0.0222, 0.0368), mull); gRough = mix(gRough, 0.5, mull); gEnvK = mix(gEnvK, 0.5, mull);
  }
  if (vRoof < 0.5 && f.y > 3.5) { // 亮窗：1.5m 开间 × 3.5m 层高，窗 1.0×1.8m，按栋+格哈希 ≈30% 点亮
    float wspan = mt > 1.5 ? 1.5 : 2.2;
    vec2 cell = floor(vec2(f.x / wspan, f.y / 3.5)); vec2 lc = vec2(fract(f.x / wspan) * wspan, fract(f.y / 3.5) * 3.5);
    float win = smoothstep(0.0, fw.x * 1.5, min(lc.x - (wspan - 1.0) * 0.5, wspan - (wspan - 1.0) * 0.5 - lc.x)) * smoothstep(0.0, fw.y * 1.5, min(lc.y - 0.9, 2.7 - lc.y));
    float h = bh(cell + vSeed * 17.0);
    float lit = step(h, 0.30) * clamp(1.0 - fw.x * 0.6, 0.0, 1.0);
    float grad = mix(1.0, 0.7, clamp((lc.y - 0.9) / 1.8, 0.0, 1.0)); // 上 70% / 下 100%
    gWinE = vWin * win * lit * grad * (0.75 + 0.5 * bh(cell.yx + vSeed)) * uWinK;
    base = mix(base, vec3(0.002, 0.004, 0.008), win * (1.0 - lit) * 0.6);
  }
  if (vRoof > 0.5) { base = vec3(0.006, 0.010, 0.016); gRough = 0.7; gMetal = 0.2; gEnvK = 0.3; gWinE = vWin * 0.1; } // 屋顶淡分区色（俯视可辨地块）
  diffuseColor.rgb = base;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(gRough, 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = gMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = gWinE;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nradiance *= gEnvK; iblIrradiance *= gEnvK * 0.5;')
  }
  m.customProgramCacheKey = () => 'buildingV2'
  return m
}

export function Buildings({ list }: { list: Prism[] }) {
  const geo = useMemo(() => buildingGeometry(list), [list])
  const mat = useMemo(makeBuildingMat, [])
  return <mesh geometry={geo} material={mat} userData={{ dynamic: true }} frustumCulled={false} />
}
