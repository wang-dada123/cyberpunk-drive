import { useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { facadeEnvPMREM } from '../utils/look'

/**
 * 立面 v4。分带公式、竖梃 5cm、塔身腰线数量都不动。
 * 上一版三种墙贴在一起：envMap 是等距圆柱，IBL 只认 PMREM，反射项恒为 0，
 * 墙只剩三块接近的暗反照率。这一版立面单独烘一张没有窗格点的 CubeUV。
 * 混凝土更哑更暗；金属 env 拉高、缝仍是 2cm；玻璃改低金属度，靠锐高光/倒影分开。
 * 竖窗：uv 仍是立面米制，没有合批（userData.dynamic）。上一版每一跨都挖暗槽，
 * LOD1 再把一组填成横条，远处就糊成点阵。现在只画点亮的 1.3×2.08 竖窗，
 * 3–5 扇成列，旁边留出同样宽的实墙；>60m 仍是这些竖窗，只按像素加粗，不再合成横条。
 */
const lin = (hex: string) => {
  const c = new THREE.Color(hex)
  return `vec3(${c.r.toFixed(5)},${c.g.toFixed(5)},${c.b.toFixed(5)})`
}
const C_CONC = lin('#0E1824')
const C_METAL = lin('#141E2A')
const C_GLASS = lin('#0A1420')
const C_MULL = lin('#1C2836')

export type Prism = { poly: [number, number][]; h: number; mat: number; win: THREE.Color; seed: number }

export function buildingGeometry(list: Prism[]) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], am: number[] = [], aw: number[] = [], as: number[] = [], al: number[] = [], ah: number[] = []
  const put = (p: number[], n: number[], u: number[], b: Prism, len: number) => {
    pos.push(...p); nor.push(...n); uv.push(...u)
    am.push(b.mat); aw.push(b.win.r, b.win.g, b.win.b); as.push(b.seed); al.push(len); ah.push(b.h)
  }
  for (const b of list) {
    const P = b.poly, n = P.length
    let cx = 0, cz = 0; for (const [x, z] of P) { cx += x / n; cz += z / n }
    for (let i = 0; i < n; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % n]
      const L = Math.hypot(bx - ax, bz - az); if (L < 1e-3) continue
      let nx = (bz - az) / L, nz = -(bx - ax) / L
      const flip = nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0
      if (flip) { nx = -nx; nz = -nz }
      const [A, B] = flip ? [[bx, bz], [ax, az]] : [[ax, az], [bx, bz]]
      const q = [[A[0], 0, A[1], 0, 0], [B[0], 0, B[1], L, 0], [B[0], b.h, B[1], L, b.h], [A[0], b.h, A[1], 0, b.h]]
      for (const k of [0, 2, 1, 0, 3, 2]) put([q[k][0], q[k][1], q[k][2]], [nx, 0, nz], [q[k][3], q[k][4]], b, L)
    }
    for (let i = 1; i < n - 1; i++) {
      const tri = [P[0], P[i], P[i + 1]]
      const cr = (tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[1][1] - tri[0][1]) * (tri[2][0] - tri[0][0])
      const ord = cr < 0 ? [0, 1, 2] : [0, 2, 1]
      for (const k of ord) put([tri[k][0], b.h, tri[k][1]], [0, 1, 0], [tri[k][0], tri[k][1]], b, 0)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(am, 1))
  g.setAttribute('aWin', new THREE.Float32BufferAttribute(aw, 3))
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(as, 1))
  g.setAttribute('aLen', new THREE.Float32BufferAttribute(al, 1))
  g.setAttribute('aH', new THREE.Float32BufferAttribute(ah, 1))
  g.computeBoundingSphere()
  return g
}

/** 与着色器同一套分带，用来报混凝土 / 金属 / 玻璃面积比 */
export function zoneSplit(h: number) {
  const concTop = Math.min(Math.max(4, h * 0.4), Math.max(4, h - 5.5))
  const glassH = Math.min(Math.max(3, h * 0.2), Math.max(2.5, h - concTop - 2))
  return { concTop, gStart: h - glassH, glassH }
}
export function measureFacades(list: Prism[]) {
  let c = 0, m = 0, g = 0
  for (const b of list) {
    const lens: number[] = []
    for (let i = 0; i < b.poly.length; i++) {
      const a = b.poly[i], q = b.poly[(i + 1) % b.poly.length]
      const L = Math.hypot(q[0] - a[0], q[1] - a[1])
      if (L >= 1e-3) lens.push(L)
    }
    const per = lens.reduce((s, L) => s + L, 0)
    const h = b.h
    const { concTop, gStart } = zoneSplit(h)
    const concH = Math.min(concTop, h)
    const glassH = Math.max(0, h - gStart)
    const metalH = Math.max(0, gStart - concH)
    let corner = 0
    for (const L of lens) corner += Math.min(L, 3) * metalH
    c += per * concH
    m += Math.max(0, per * metalH - corner)
    g += per * glassH + corner
  }
  const s = c + m + g || 1
  return { concrete: c / s, metal: m / s, glass: g / s, buildings: list.length }
}

export const winScale = { value: 1 } // 核显：亮窗 ×0.7

export function makeBuildingMat() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.5, envMapIntensity: 1 })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWinK = winScale
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aMat; attribute vec3 aWin; attribute float aSeed; attribute float aLen; attribute float aH;
varying float vMat; varying vec3 vWin; varying float vSeed; varying vec2 vF; varying float vRoof;
varying vec3 vWp; varying float vLen; varying float vH;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vMat = aMat; vWin = aWin; vSeed = aSeed; vF = uv; vRoof = step(0.5, normal.y);
vLen = aLen; vH = aH;
vWp = (modelMatrix * vec4(position, 1.0)).xyz;`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWinK;
varying float vMat; varying vec3 vWin; varying float vSeed; varying vec2 vF; varying float vRoof;
varying vec3 vWp; varying float vLen; varying float vH;
float bh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gRough; float gMetal; float gEnvK; float gIbl; vec3 gWinE;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 f = vF;
  vec2 fw = max(fwidth(f), vec2(1e-3));
  float fwX = fw.x, fwY = fw.y;
  float concTop = min(max(4.0, vH * 0.40), max(4.0, vH - 5.5));
  float glassH = min(max(3.0, vH * 0.20), max(2.5, vH - concTop - 2.0));
  float gStart = vH - glassH;
  float wC = 1.0 - smoothstep(concTop - 0.08, concTop + 0.08, f.y);
  float crown = smoothstep(gStart - 0.12, gStart + 0.12, f.y);
  float edgeU = min(f.x, max(vLen - f.x, 0.0));
  float corner = 1.0 - smoothstep(1.35, 1.65, edgeU);
  float gMix = max(crown, corner);
  float wG = (1.0 - wC) * gMix;
  float wM = (1.0 - wC) * (1.0 - gMix);

  float nz = bh(floor(f * 2.0));
  float wet = 1.0 - smoothstep(1.42, 1.58, f.y);
  vec3 concC = ${C_CONC} * (0.42 + 0.06 * nz);
  concC *= mix(1.0, 0.72, wet);
  float cR = mix(0.97, 0.40, wet);
  float cE = mix(0.05, 0.40, wet);

  float pd = abs(fract(f.x / 1.5 + 0.5) - 0.5) * 1.5;
  float seam = 1.0 - smoothstep(0.01 - fwX, 0.01 + fwX, pd);
  float pan = bh(vec2(floor(f.x / 1.5 + 0.001), vSeed * 3.0 + 1.0));
  float grain = 0.5 + 0.5 * sin(f.y * 12.0 + floor(f.x / 1.5) * 1.7);
  vec3 metC = ${C_METAL} * (1.55 + 0.55 * pan) * (0.94 + 0.06 * grain);
  metC = mix(metC, metC * 0.12, seam);
  float metR = mix(0.30, 0.90, seam);
  float metE = mix(8.0, 0.20, seam);

  float gPick = fract(vSeed * 0.173 + vMat * 0.31);
  float md = abs(fract(f.x / 1.5 + 0.5) - 0.5) * 1.5;
  float mull = 1.0 - smoothstep(0.025 - fwX, 0.025 + fwX, md);
  vec3 glC = mix(${C_GLASS}, ${C_MULL}, mull);
  float glR = mix(0.045, 0.72, mull);
  float glM = mix(0.02, 0.55, mull);
  float glE = mix(mix(14.0, 18.0, gPick), 0.35, mull);

  vec3 base = concC * wC + metC * wM + glC * wG;
  gRough = cR * wC + metR * wM + glR * wG;
  gMetal = 0.0 * wC + 0.90 * wM + glM * wG;
  gEnvK = cE * wC + metE * wM + glE * wG;
  gIbl = mix(0.04, 0.45, wet) * wC;
  gWinE = vec3(0.0);

  float bay = 1.5, winW = 1.3, winH = 2.08, floorH = 3.2, sill = 0.50;
  float yRel = f.y - 4.2;
  float fl = floor(yRel / floorH);
  float ly = yRel - fl * floorH;
  float inY = min(ly - sill, sill + winH - ly);
  float xw = f.x + bh(vec2(vSeed, 9.1)) * 12.0;
  float cell = floor(xw / bay);
  float lx = xw - cell * bay;
  float inX = min(lx - (bay - winW) * 0.5, (bay + winW) * 0.5 - lx);
  float gsz = 3.0 + floor(bh(vec2(vSeed * 1.7, 2.2)) * 2.999);
  float period = gsz * 2.0;
  float posIn = mod(cell, period);
  float inGrp = step(posIn + 0.5, gsz);
  float win = smoothstep(0.0, fwX, inX) * smoothstep(0.0, fwY, inY);
  float pane = win * inGrp;
  float dist = length(cameraPosition - vWp);
  float l1 = smoothstep(52.0, 68.0, dist);
  float grow = clamp(max(fwX, fwY) * 0.85, 0.0, 0.22) * l1;
  float paneFar = smoothstep(-grow, fwX, inX) * smoothstep(-grow, fwY, inY) * inGrp;
  float winOn = step(0.0, yRel) * (1.0 - vRoof);
  float glow = mix(pane, paneFar, l1) * winOn;
  float grad = mix(1.0, 0.70, clamp((ly - sill) / winH, 0.0, 1.0));
  gWinE = vWin * glow * grad * 1.8 * uWinK;
  base = mix(base, vec3(0.010, 0.016, 0.026), clamp(glow, 0.0, 1.0));

  if (vRoof > 0.5) {
    base = vec3(0.006, 0.010, 0.016);
    gRough = 0.72; gMetal = 0.15; gEnvK = 0.25; gIbl = 0.0; gWinE = vec3(0.0);
  }
  diffuseColor.rgb = base;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(gRough, 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(gMetal, 0.0, 1.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = gWinE;')
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
radiance *= gEnvK;
iblIrradiance *= gIbl;`)
  }
  m.customProgramCacheKey = () => 'facadeV4'
  return m
}

export function Buildings({ list }: { list: Prism[] }) {
  const gl = useThree((s) => s.gl)
  const geo = useMemo(() => buildingGeometry(list), [list])
  const mat = useMemo(() => {
    const m = makeBuildingMat()
    m.envMap = facadeEnvPMREM(gl)
    return m
  }, [gl])
  return <mesh geometry={geo} material={mat} userData={{ dynamic: true }} frustumCulled={false} />
}

/** 檐线 / 腰线：截面 4×4cm，整街 1 个实例化绘制。默认强度 k；fade 时 <15m 降到 1.4 */
export type Trim = {
  p: [number, number, number]
  s: [number, number, number]
  ry: number
  color: string
  k: number
  fade: boolean
}

const trimBox = new THREE.BoxGeometry(1, 1, 1)
const _m4 = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

export function makeTrimMat() {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false })
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aK; attribute float aFade;
varying vec3 vWpT; varying float vKT; varying float vFadeT;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  vWpT = (modelMatrix * wp).xyz;
  vKT = aK; vFadeT = aFade;
}`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWpT; varying float vKT; varying float vFadeT;`)
      .replace('#include <opaque_fragment>', `{
  float d = distance(cameraPosition, vWpT);
  float kk = vFadeT > 0.5 ? mix(1.4, vKT, smoothstep(15.0, 20.0, d)) : vKT;
  outgoingLight *= kk;
}
#include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => 'trimFacadeV2'
  return m
}

export function TrimStrips({ items }: { items: Trim[] }) {
  const geo = useMemo(() => {
    const g = trimBox.clone()
    const ak = new Float32Array(items.length)
    const af = new Float32Array(items.length)
    items.forEach((t, i) => { ak[i] = t.k; af[i] = t.fade ? 1 : 0 })
    g.setAttribute('aK', new THREE.InstancedBufferAttribute(ak, 1))
    g.setAttribute('aFade', new THREE.InstancedBufferAttribute(af, 1))
    return g
  }, [items])
  const mat = useMemo(makeTrimMat, [])
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const im = ref.current
    if (!im) return
    const c = new THREE.Color()
    items.forEach((t, i) => {
      _q.setFromEuler(_e.set(0, t.ry, 0))
      _m4.compose(_p.set(t.p[0], t.p[1], t.p[2]), _q, _s.set(t.s[0], t.s[1], t.s[2]))
      im.setMatrixAt(i, _m4)
      im.setColorAt(i, c.set(t.color))
    })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.computeBoundingSphere()
  }, [items])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} frustumCulled={false} />
}
