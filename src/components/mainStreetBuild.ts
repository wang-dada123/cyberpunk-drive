import * as THREE from 'three'
import { MAIN_BUILDINGS, bands, footprint, streetSigns, VIADUCT, ICE, COLD, type Bld } from '../data/mainStreet'
import type { Trim } from './Buildings'

/**
 * 主街新增几何：楼体、阳台、雨棚、天桥、高架、摊位、道具、贴花、蒸汽，全部进同一张 MeshStandard。
 * 墙 emissive = 0。窗、店内、屏幕、地面贴花才发光。招牌文字另批。
 */
const lin = (hex: string) => {
  const c = new THREE.Color(hex)
  return `vec3(${c.r.toFixed(5)},${c.g.toFixed(5)},${c.b.toFixed(5)})`
}

type Attr = {
  zone: number
  seed: number
  h: number
  len: number
  conc: number
  glass: number
  shop: number
  s0: number
  s1: number
  cx: number
  cy: number
  cz: number
  ox: number
  oy: number
}

const A0 = (): Attr => ({ zone: 0, seed: 1, h: 10, len: 1, conc: 4, glass: 8, shop: 0, s0: 0, s1: 0, cx: 0, cy: 0, cz: 0, ox: 0, oy: 0 })

class Buf {
  p: number[] = []
  n: number[] = []
  u: number[] = []
  f: number[] = []
  tri(a: number[], b: number[], c: number[], na: number[], ua: number[], ub: number[], uc: number[], at: Attr) {
    for (const [pos, uv] of [[a, ua], [b, ub], [c, uc]] as const) {
      this.p.push(pos[0], pos[1], pos[2])
      this.n.push(na[0], na[1], na[2])
      this.u.push(uv[0], uv[1])
      this.f.push(at.zone, at.seed, at.h, at.len, at.conc, at.glass, at.shop, at.s0, at.s1, at.cx, at.cy, at.cz, at.ox, at.oy)
    }
  }
  quad(p0: number[], p1: number[], p2: number[], p3: number[], uv: number[][], at: Attr) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2]
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2]
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
    const L = Math.hypot(nx, ny, nz) || 1
    nx /= L; ny /= L; nz /= L
    this.tri(p0, p2, p1, [nx, ny, nz], uv[0], uv[2], uv[1], at)
    this.tri(p0, p3, p2, [nx, ny, nz], uv[0], uv[3], uv[2], at)
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, ry: number, at: Attr) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2
    const c = Math.cos(ry), s = Math.sin(ry)
    const X = (x: number, y: number, z: number): number[] => [cx + x * c + z * s, cy + y, cz - x * s + z * c]
    const cnr = [
      X(-hx, -hy, -hz), X(hx, -hy, -hz), X(hx, hy, -hz), X(-hx, hy, -hz),
      X(-hx, -hy, hz), X(hx, -hy, hz), X(hx, hy, hz), X(-hx, hy, hz),
    ]
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const face = (i: number[]) => this.quad(cnr[i[0]], cnr[i[1]], cnr[i[2]], cnr[i[3]], uv, at)
    face([4, 5, 6, 7]); face([1, 0, 3, 2]); face([5, 1, 2, 6]); face([0, 4, 7, 3]); face([3, 7, 6, 2]); face([0, 1, 5, 4])
  }
  geo() {
    const g = new THREE.BufferGeometry()
    const F = (a: number[], n: number) => new THREE.Float32BufferAttribute(a, n)
    g.setAttribute('position', F(this.p, 3))
    g.setAttribute('normal', F(this.n, 3))
    g.setAttribute('uv', F(this.u, 2))
    const n = this.f.length / 14
    const aA = new Float32Array(n * 4), aB = new Float32Array(n * 4), aC = new Float32Array(n * 4), aD = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      const o = i * 14
      aA.set(this.f.slice(o, o + 4), i * 4)
      aB.set(this.f.slice(o + 4, o + 8), i * 4)
      aC.set(this.f.slice(o + 8, o + 12), i * 4)
      aD.set(this.f.slice(o + 12, o + 14), i * 2)
    }
    g.setAttribute('aA', new THREE.BufferAttribute(aA, 4))
    g.setAttribute('aB', new THREE.BufferAttribute(aB, 4))
    g.setAttribute('aC', new THREE.BufferAttribute(aC, 4))
    g.setAttribute('aD', new THREE.BufferAttribute(aD, 2))
    g.computeBoundingSphere()
    return g
  }
}

function hash(id: string) {
  let s = 7
  for (let i = 0; i < id.length; i++) s = (s * 33 + id.charCodeAt(i)) % 1000
  return s + 1
}

function outline(bd: Bld): [number, number][] {
  const [x0, x1, z0, z1] = footprint(bd)
  if (bd.chamfer && bd.side < 0) {
    const cut = 2.6
    return [[x1 - cut, z0], [x1, z0 + cut], [x1, z1], [x0, z1], [x0, z0]]
  }
  if (bd.chamfer && bd.side > 0) {
    const cut = 2.6
    return [[x0, z0 + cut], [x0 + cut, z0], [x1, z0], [x1, z1], [x0, z1]]
  }
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
}

function extrude(buf: Buf, poly: [number, number][], y0: number, y1: number, base: Attr, shopSide: number, shopKind: number) {
  const n = poly.length
  let cx = 0, cz = 0
  for (const [x, z] of poly) { cx += x / n; cz += z / n }
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n]
    const L = Math.hypot(bx - ax, bz - az)
    if (L < 0.2) continue
    let nx = (bz - az) / L, nz = -(bx - ax) / L
    const outward = nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0
    if (outward) { nx = -nx; nz = -nz }
    const [A, B] = outward ? [[bx, bz], [ax, az]] : [[ax, az], [bx, bz]]
    const front = shopSide !== 0 && nx * -shopSide > 0.72 && Math.abs(nz) < 0.5
    const at: Attr = { ...base, len: L, shop: front ? shopKind : 0, s0: 0.42, s1: Math.max(0.5, L - 0.42) }
    const q = [
      [A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]],
    ]
    buf.quad(q[0], q[1], q[2], q[3], [[0, y0], [L, y0], [L, y1], [0, y1]], at)
  }
  const roof: Attr = { ...base, shop: 0, len: 0 }
  for (let i = 1; i < n - 1; i++) {
    const t = [poly[0], poly[i], poly[i + 1]]
    const cr = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0])
    const ord = cr < 0 ? [0, 1, 2] : [0, 2, 1]
    const p = ord.map((k) => [t[k][0], y1, t[k][1]])
    buf.tri(p[0], p[1], p[2], [0, 1, 0], [0, 0], [1, 0], [1, 1], roof)
  }
}

function edgeTrims(poly: [number, number][], ys: { y: number; color: string; k: number; fade: boolean }[], trims: Trim[]) {
  const n = poly.length
  let cx = 0, cz = 0
  for (const [x, z] of poly) { cx += x / n; cz += z / n }
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L < 0.4) continue
    let nx = b[1] - a[1], nz = -(b[0] - a[0])
    nx /= L; nz /= L
    if (nx * ((a[0] + b[0]) / 2 - cx) + nz * ((a[1] + b[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz }
    for (const t of ys) {
      trims.push({
        p: [(a[0] + b[0]) / 2 + nx * 0.05, t.y, (a[1] + b[1]) / 2 + nz * 0.05],
        s: [0.045, 0.045, L + 0.12],
        ry: Math.atan2(b[0] - a[0], b[1] - a[1]),
        color: t.color, k: t.k, fade: t.fade,
      })
    }
  }
}

function prop(buf: Buf, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, zone: number, seed: number) {
  buf.box(x, y, z, sx, sy, sz, ry, { ...A0(), zone, seed, cx: x, cy: y, cz: z })
}

export const streetTime = { value: 0 }

export function makeStreetMat() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0.4, envMapIntensity: 1, side: THREE.DoubleSide })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = streetTime
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; attribute vec2 aD;
uniform float uTime;
varying float vZone; varying float vSeed; varying float vH; varying float vLen;
varying float vConc; varying float vGlass; varying float vShop; varying float vS0; varying float vS1; varying float vRoof;
varying vec2 vF; varying vec3 vWp; varying vec3 vN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  float aZone = aA.x; float aSeed = aA.y; float aH = aA.z; float aLen = aA.w;
  float aConc = aB.x; float aGlass = aB.y; float aShop = aB.z; float aS0 = aB.w;
  float aS1 = aC.x; float aCx = aC.y; float aCy = aC.z; float aCz = aC.w;
  float aOx = aD.x; float aOy = aD.y;
  if (aZone > 2.5 && aZone < 3.5) {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    float bob = sin(uTime * 0.65 + aSeed) * 0.16;
    transformed = vec3(aCx, aCy, aCz) + right * aOx + vec3(0.0, aOy + bob, 0.0);
    if (distance(cameraPosition, vec3(aCx, aCy, aCz)) > 60.0) transformed = vec3(aCx, aCy, aCz);
  } else if (aZone > 3.5 && aZone < 4.5) {
    if (distance(cameraPosition, vec3(aCx, aCy, aCz)) > 60.0) transformed = vec3(aCx, aCy, aCz);
  }
  vZone = aZone; vSeed = aSeed; vH = aH; vLen = aLen; vConc = aConc; vGlass = aGlass;
  vShop = aShop; vS0 = aS0; vS1 = aS1; vF = uv;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
  vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vRoof = step(0.55, normal.y);`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vZone; varying float vSeed; varying float vH; varying float vLen;
varying float vConc; varying float vGlass; varying float vShop; varying float vS0; varying float vS1; varying float vRoof;
varying vec2 vF; varying vec3 vWp; varying vec3 vN;
float bh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gRough, gMetal, gEnvK; vec3 gEmit;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 base = ${lin('#141E2A')};
  gRough = 0.45; gMetal = 0.75; gEnvK = 0.8; gEmit = vec3(0.0);
  float vary = 0.94 + 0.12 * bh(vec2(vSeed, 2.2));
  if (vZone < 0.5) {
    float y = vF.y;
    float wC = 1.0 - smoothstep(vConc - 0.08, vConc + 0.08, y);
    float wG = smoothstep(vGlass - 0.1, vGlass + 0.1, y);
    float wM = (1.0 - wC) * (1.0 - wG);
    float nz = bh(floor(vF * 1.7));
    float wet = 1.0 - smoothstep(1.35, 1.6, y);
    vec3 conc = ${lin('#0E1824')} * (0.55 + 0.08 * nz) * mix(1.0, 0.72, wet);
    float pd = abs(fract(vF.x / 1.5 + 0.5) - 0.5) * 1.5;
    float seam = 1.0 - smoothstep(0.012, 0.028, pd);
    float pan = bh(vec2(floor(vF.x / 1.5), vSeed));
    vec3 met = ${lin('#141E2A')} * (1.15 + 0.55 * pan);
    met = mix(met, met * 0.35, seam);
    float md = abs(fract(vF.x / 1.5 + 0.5) - 0.5) * 1.5;
    float mull = 1.0 - smoothstep(0.02, 0.05, md);
    vec3 gls = mix(${lin('#0A1420')}, ${lin('#1C2836')}, mull);
    base = conc * wC + met * wM + gls * wG;
    base *= vary;
    gRough = mix(mix(0.92, 0.38, wet), 1.0, wC) * wC + mix(0.38, 0.9, seam) * wM + mix(0.06, 0.7, mull) * wG;
    gMetal = 0.04 * wC + 0.86 * wM + mix(0.15, 0.55, mull) * wG;
    gEnvK = 0.25 * wC + mix(1.1, 0.15, seam) * wM + mix(2.0, 0.3, mull) * wG;
    float inShop = step(0.5, vShop) * step(0.42, y) * step(y, 2.88) * step(vS0, vF.x) * step(vF.x, vS1) * (1.0 - vRoof);
    if (inShop > 0.5) {
      float edge = min(min(vF.x - vS0, vS1 - vF.x), min(y - 0.42, 2.88 - y));
      if (edge < 0.08) {
        base = ${lin('#1C2836')} * vary; gRough = 0.42; gMetal = 0.8; gEnvK = 0.9; gEmit = vec3(0.0);
      } else if (vShop > 1.5 && y > 1.62) {
        float rib = step(0.55, fract(y * 7.0));
        base = ${lin('#141E2A')} * mix(0.7, 0.25, rib); gRough = 0.48; gMetal = 0.7; gEnvK = 0.5; gEmit = vec3(0.0);
      } else {
        float uy = clamp((y - 0.42) / 2.4, 0.0, 1.0);
        float shelf = smoothstep(0.04, 0.0, abs(fract(uy * 3.2) - 0.12));
        vec3 warm = ${lin('#FFE6C4')};
        base = warm * (0.16 + 0.1 * (1.0 - shelf));
        gEmit = warm * 0.6 * (0.75 + 0.25 * (1.0 - shelf));
        gRough = 0.85; gMetal = 0.0; gEnvK = 0.2;
      }
    }
    if (vRoof < 0.5 && inShop < 0.5 && y > 4.15) {
      float bay = 1.5, winW = 1.3, winH = 2.08, floorH = 3.2, sill = 0.55;
      float yRel = y - 4.15;
      float fl = floor(yRel / floorH);
      float ly = yRel - fl * floorH;
      float inY = min(ly - sill, sill + winH - ly);
      float xw = vF.x + bh(vec2(vSeed, 3.0)) * 9.0;
      float cell = floor(xw / bay);
      float lx = xw - cell * bay;
      float inX = min(lx - (bay - winW) * 0.5, (bay + winW) * 0.5 - lx);
      float gsz = 3.0 + floor(bh(vec2(vSeed, 5.5)) * 2.99);
      float period = gsz * 3.0;
      float inGrp = step(mod(cell, period) + 0.5, gsz);
      float pane = step(0.0, inX) * step(0.0, inY) * inGrp * step(0.0, yRel);
      float grad = mix(0.7, 1.0, clamp((ly - sill) / winH, 0.0, 1.0));
      float cold = step(0.9, bh(vec2(cell, fl + vSeed)));
      vec3 wc = mix(${lin('#4FC3F7')}, ${lin('#E8F4FF')}, cold);
      float curtain = step(0.88, bh(vec2(cell + 4.0, vSeed))) * step(0.6, clamp((sill + winH - ly) / winH, 0.0, 1.0));
      gEmit = wc * pane * grad * mix(0.9, 0.35, curtain);
      base = mix(base, vec3(0.012, 0.018, 0.028), clamp(pane, 0.0, 1.0));
    }
    if (vRoof > 0.5) { base = vec3(0.012, 0.016, 0.022) * vary; gRough = 0.78; gMetal = 0.12; gEnvK = 0.2; gEmit = vec3(0.0); }
  } else if (vZone < 1.5) {
    base = ${lin('#1C2836')} * vary; gRough = 0.46; gMetal = 0.82; gEnvK = 1.0;
  } else if (vZone < 2.5) {
    vec2 q = vF - 0.5;
    float r = length(q) * 2.0;
    float ang = atan(q.y, q.x);
    float ring = step(0.58, r) * step(r, 0.9);
    float dotc = step(r, 0.22);
    float tick = step(0.72, r) * step(r, 0.9) * step(0.85, abs(sin(ang * 3.0)));
    if (ring + dotc + tick < 0.5) discard;
    base = ${lin('#E8F4FF')}; gEmit = ${lin('#E8F4FF')} * 0.85; gRough = 0.35; gMetal = 0.0; gEnvK = 0.4;
  } else if (vZone < 3.5) {
    float r = length(vF - 0.5);
    float blob = 0.34 + 0.07 * sin(atan(vF.y - 0.5, vF.x - 0.5) * 3.0 + vSeed);
    if (r > blob) discard;
    base = ${lin('#E8F4FF')} * 0.35; gEmit = ${lin('#E8F4FF')} * 0.28; gRough = 1.0; gMetal = 0.0; gEnvK = 0.0;
  } else if (vZone < 4.5) {
    base = ${lin('#1C2836')} * vary; gRough = 0.55; gMetal = 0.45; gEnvK = 0.6;
  } else if (vZone < 5.5) {
    float k = bh(vec2(vSeed, 8.0));
    base = mix(mix(${lin('#C5CED6')}, ${lin('#D9CBB4')}, step(0.33, k)), ${lin('#8EA0AE')}, step(0.66, k));
    gRough = 0.9; gMetal = 0.0; gEnvK = 0.15;
  } else {
    base = ${lin('#0A1420')}; gEmit = ${lin('#4FC3F7')} * 1.35; gRough = 0.2; gMetal = 0.1; gEnvK = 0.4;
  }
  diffuseColor.rgb = base;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(gRough, 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(gMetal, 0.0, 1.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = gEmit;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nradiance *= gEnvK;')
  }
  m.customProgramCacheKey = () => 'mainStreetV3'
  return m
}

function sidewalk(bd: Bld, out: number) {
  // 往街心挪 out 米，仍停在路缘外侧
  return bd.face - bd.side * out
}

export function buildMainStreet() {
  const buf = new Buf()
  const trims: Trim[] = []
  for (const bd of MAIN_BUILDINGS) {
    const seed = hash(bd.id)
    const band = bands(bd)
    const poly = outline(bd)
    const base: Attr = { ...A0(), seed, h: bd.h, conc: band.conc, glass: band.glass, cx: bd.face, cy: bd.h * 0.5, cz: (bd.z0 + bd.z1) / 2 }
    const kind = bd.shutter ? 2 : bd.shop ? 1 : 0
    if (bd.type === 'T2') {
      extrude(buf, poly, 0, bd.h - 3, base, bd.side, 0)
      const [x0, x1, z0, z1] = footprint(bd)
      const up: [number, number][] = [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x1 - 1, z1 - 1], [x0 + 1, z1 - 1]]
      extrude(buf, up, bd.h - 3, bd.h, base, 0, 0)
    } else {
      extrude(buf, poly, 0, bd.h, base, bd.side, kind)
    }
    const ys: { y: number; color: string; k: number; fade: boolean }[] = [{ y: bd.h - 0.04, color: COLD, k: 2.2, fade: true }]
    if (bd.h > 6) ys.push({ y: 4.35, color: ICE, k: 2.05, fade: true })
    if (bd.type === 'T5') {
      ys.push({ y: 34.4, color: '#00B0FF', k: 1.8, fade: false })
      ys.push({ y: 36.5, color: '#00B0FF', k: 1.8, fade: false })
    }
    edgeTrims(bd.type === 'T2' ? outline(bd) : poly, ys, trims)
    // 屋顶附件，不发光
    const [x0, x1, z0, z1] = footprint(bd)
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2
    if (bd.type === 'T1' || bd.type === 'T5') {
      prop(buf, mx, bd.h + 0.7, mz, 1.6, 1.4, 1.6, 0, 1, seed)
      prop(buf, mx + 0.2, bd.h + 2.3, mz, 0.08, 1.8, 0.08, 0, 1, seed)
      prop(buf, mx - 0.5, bd.h + 1.8, mz + 0.4, 0.06, 1.1, 0.06, 0, 1, seed)
    } else if (bd.type === 'T4') {
      for (const o of [-1.2, 0, 1.1]) prop(buf, mx + o * 0.15, bd.h + 0.28, mz + o, 0.7, 0.5, 0.55, 0, 1, seed + o)
    } else if (bd.type === 'T2') {
      prop(buf, mx, bd.h + 0.7, mz, 1.8, 1.3, 1.4, 0, 1, seed)
    }
    if (bd.balcony && bd.side !== 0) {
      const floors = bd.h >= 18 ? [7.15, 10.5] : [7.15]
      const w = Math.min(bd.z1 - bd.z0 - 0.6, 5.2)
      for (const y of floors) {
        const px = bd.face - bd.side * 0.55
        prop(buf, px, y, mz, 1.05, 0.16, w, 0, 1, seed)
        prop(buf, px - bd.side * 0.46, y + 0.52, mz, 0.06, 0.9, w, 0, 1, seed)
        if (bd.laundry) {
          const cloth: Attr = { ...A0(), zone: 5, seed: seed + y, cx: px, cy: y, cz: mz }
          const xh = px - bd.side * 0.2
          buf.quad(
            [xh, y - 0.05, mz - 0.8], [xh, y - 0.05, mz + 0.5], [xh, y - 0.85, mz + 0.5], [xh, y - 0.85, mz - 0.8],
            [[0, 0], [1, 0], [1, 1], [0, 1]], cloth,
          )
          buf.quad(
            [xh, y - 0.05, mz + 0.7], [xh, y - 0.05, mz + 1.5], [xh, y - 0.6, mz + 1.5], [xh, y - 0.6, mz + 0.7],
            [[0, 0], [1, 0], [1, 1], [0, 1]], { ...cloth, seed: seed + 3 },
          )
        }
      }
    }
    if (bd.shop && bd.side !== 0) {
      const w = Math.min(bd.z1 - bd.z0 - 0.8, 5.4)
      const lip = bd.face - bd.side * 0.78
      prop(buf, (bd.face + lip) / 2, 3.5, mz, Math.abs(lip - bd.face), 0.08, w, 0, 1, seed)
      trims.push({
        p: [lip, 3.44, mz], s: [0.04, 0.04, w], ry: Math.PI / 2,
        color: ICE, k: 1.6, fade: true,
      })
      const door = sidewalk(bd, 0.85)
      if (bd.shop.kind === 'noodle') {
        prop(buf, door, 0.45, mz - 0.7, 0.38, 0.9, 0.38, 0, 4, seed)
        prop(buf, door, 0.45, mz + 0.7, 0.38, 0.9, 0.38, 0, 4, seed)
      }
      if (bd.shop.kind === 'repair') {
        prop(buf, door, 0.42, mz - 0.5, 0.36, 0.84, 0.36, 0, 4, seed)
        prop(buf, door, 0.45, mz + 0.55, 0.25, 0.7, 1.3, 0.2, 4, seed)
      }
      if (bd.shop.kind === 'tea') {
        prop(buf, door, 1.15, mz, 1.1, 0.08, 1.1, 0, 4, seed)
        prop(buf, door, 0.55, mz, 0.06, 1.1, 0.06, 0, 4, seed)
        prop(buf, door, 0.42, mz + 0.8, 0.36, 0.84, 0.36, 0, 4, seed)
      }
      if (bd.shop.kind === 'mart') prop(buf, door, 0.48, mz, 0.28, 0.75, 1.35, 0.4, 4, seed)
      if (bd.shop.kind === 'cafe') {
        prop(buf, door, 0.55, mz, 0.45, 1.05, 2.4, 0, 4, seed)
        prop(buf, sidewalk(bd, 1.15), 0.42, mz + 1.6, 0.45, 0.48, 1.3, 0, 4, seed)
      }
      if (bd.shop.kind === 'books') prop(buf, sidewalk(bd, 1.15), 0.42, mz, 0.45, 0.48, 1.5, 0, 4, seed)
      if (bd.shop.kind === 'flora') {
        prop(buf, door, 0.45, mz - 0.8, 0.55, 0.7, 0.55, 0, 4, seed)
        prop(buf, door, 0.85, mz - 0.8, 0.7, 0.45, 0.7, 0, 5, seed + 2)
        prop(buf, door, 0.4, mz + 0.8, 0.5, 0.6, 0.5, 0, 4, seed)
        prop(buf, door, 0.75, mz + 0.8, 0.65, 0.4, 0.65, 0, 5, seed + 4)
      }
      // 店招背板
      const boardW = Math.min(w, bd.shop.word.length * 0.46 + 0.6)
      if (bd.seg === 'B') prop(buf, bd.face - bd.side * 1.15, 4.15, mz, boardW, 0.55, 0.08, 0, 1, seed)
      else prop(buf, bd.face - bd.side * 0.5, 4.55, mz, 0.08, 0.52, boardW, 0, 1, seed)
    }
    if (bd.glass && bd.side !== 0) {
      const lip = bd.face - bd.side * 1.05
      prop(buf, (bd.face + lip) / 2, 3.55, (bd.z0 + bd.z1) / 2, Math.abs(lip - bd.face), 0.06, bd.z1 - bd.z0 - 0.4, 0, 1, seed)
    }
  }

  // 蒸汽：6 片公告牌，绕面馆门口
  const noodle = MAIN_BUILDINGS.find((b) => b.shop?.kind === 'noodle')!
  {
    const x = noodle.face - noodle.side * 0.55
    const z = (noodle.z0 + noodle.z1) / 2
    for (let i = 0; i < 6; i++) {
      const y = 1.35 + (i % 3) * 0.38
      const at: Attr = { ...A0(), zone: 3, seed: 20 + i, cx: x + (i - 2.5) * 0.22, cy: y, cz: z - 0.3 + (i % 2) * 0.25, ox: 0, oy: 0 }
      const hw = 0.42, hh = 0.36
      // 顶点放在中心，偏移交给 aOx/aOy。这里直接写四角的 aOx/aOy。
      const corners: [number, number, number, number][] = [[-hw, -hh, 0, 0], [hw, -hh, 1, 0], [hw, hh, 1, 1], [-hw, hh, 0, 1]]
      const put = (ox: number, oy: number, u: number, v: number) => {
        buf.p.push(at.cx, at.cy, at.cz)
        buf.n.push(0, 0, 1)
        buf.u.push(u, v)
        buf.f.push(3, at.seed, 1, 0, 4, 8, 0, 0, 0, at.cx, at.cy, at.cz, ox, oy)
      }
      const tri = [0, 2, 1, 0, 3, 2]
      for (const k of tri) put(corners[k][0], corners[k][1], corners[k][2], corners[k][3])
    }
  }

  // 地面冷白圆标（咖啡馆 / 书店 / 花店），alpha-test 在着色器里裁成圆
  for (const id of ['b-w-cafe', 'b-e-books', 'b-w-flora']) {
    const bd = MAIN_BUILDINGS.find((b) => b.id === id)!
    const x = bd.face - bd.side * 1.7
    const z = (bd.z0 + bd.z1) / 2
    const s = 2.3
    const at: Attr = { ...A0(), zone: 2, seed: hash(id) }
    buf.quad(
      [x - s / 2, 0.07, z + s / 2], [x + s / 2, 0.07, z + s / 2], [x + s / 2, 0.07, z - s / 2], [x - s / 2, 0.07, z - s / 2],
      [[0, 1], [1, 1], [1, 0], [0, 0]], at,
    )
  }

  // 人行天桥，梁底 6.0m，柱子收在楼面内侧
  {
    prop(buf, 0, 6.16, 43.7, 18.6, 0.22, 2.15, 0, 1, 4)
    prop(buf, 0, 6.55, 42.72, 18.2, 0.08, 0.08, 0, 1, 4)
    prop(buf, 0, 6.55, 44.68, 18.2, 0.08, 0.08, 0, 1, 4)
    prop(buf, 0, 7.0, 42.68, 18.0, 0.72, 0.06, 0, 1, 4)
    prop(buf, 0, 7.0, 44.72, 18.0, 0.72, 0.06, 0, 1, 4)
    prop(buf, -9.15, 3.05, 43.7, 0.42, 6.1, 0.42, 0, 1, 4)
    prop(buf, 9.15, 3.05, 43.7, 0.42, 6.1, 0.42, 0, 1, 4)
    prop(buf, 0, 6.95, 42.55, 3.5, 0.62, 0.06, 0, 1, 4)
    trims.push({ p: [0, 5.96, 43.7], s: [0.035, 0.035, 17.4], ry: Math.PI / 2, color: ICE, k: 1.6, fade: true })
  }

  // 时钟柱
  prop(buf, 9.35, 4, 85.55, 0.72, 8, 0.72, 0, 1, 9)
  prop(buf, 9.35, 7.55, 85.55, 0.92, 0.7, 0.92, 0, 1, 9)

  // 斜穿轻轨。梁底 8m。墩在路外。
  {
    const ax = VIADUCT.a[0], az = VIADUCT.a[1], bx = VIADUCT.b[0], bz = VIADUCT.b[1]
    const dx = bx - ax, dz = bz - az
    const L = Math.hypot(dx, dz)
    const ry = Math.atan2(dx, dz)
    const mx = (ax + bx) / 2, mz = (az + bz) / 2
    prop(buf, mx, 8.32, mz, 3.25, 0.64, L, ry, 1, 11)
    prop(buf, ax, 4, az, 1.15, 8, 1.15, 0, 1, 11)
    prop(buf, bx, 4, bz, 1.15, 8, 1.15, 0, 1, 12)
    // 梁侧冰蓝线：沿桥向，略偏到一侧
    const nx = -dz / L, nz = dx / L
    trims.push({
      p: [mx + nx * 1.55, 8.02, mz + nz * 1.55],
      s: [0.04, 0.04, L],
      ry, color: ICE, k: 1.55, fade: false,
    })
  }

  // 竖招背板
  for (const s of streetSigns()) {
    if (!s.vertical) continue
    prop(buf, s.p[0], s.p[1], s.p[2] + 0.05, 0.62, 2.35, 0.07, 0, 1, 15)
    trims.push({ p: [s.p[0], s.p[1], s.p[2] + 0.02], s: [0.04, 2.35, 0.04], ry: 0, color: s.ice ? ICE : COLD, k: 1.45, fade: true })
  }

  // C 段摊位货架和纸箱（楼已经是 10/14m 市集块，这里补门口货）
  const stall = MAIN_BUILDINGS.find((b) => b.id === 'c-w-stall')!
  const hall = MAIN_BUILDINGS.find((b) => b.id === 'c-e-hall')!
  {
    const x = stall.face - stall.side * 0.7
    const z = (stall.z0 + stall.z1) / 2
    prop(buf, x, 0.9, z, 0.45, 1.7, 3.2, 0, 4, 30)
    prop(buf, x - stall.side * 0.15, 1.35, z - 0.4, 0.08, 0.55, 0.9, 0, 6, 30)
    prop(buf, x, 0.35, z + 1.5, 0.55, 0.55, 0.55, 0.2, 4, 31)
    prop(buf, x, 0.28, z + 1.9, 0.4, 0.4, 0.45, 0, 4, 32)
  }
  {
    const x = hall.face - hall.side * 0.65
    const z = (hall.z0 + hall.z1) / 2
    prop(buf, x, 0.85, z, 0.4, 1.6, 2.8, 0, 4, 33)
    prop(buf, x, 1.2, z + 0.2, 0.08, 0.5, 0.8, 0, 6, 33)
    prop(buf, x, 0.32, z - 1.6, 0.6, 0.5, 0.5, 0.4, 4, 34)
  }

  const geo = buf.geo()
  const tris = buf.p.length / 9 + trims.length * 12
  return { geo, trims, tris }
}

let cache: ReturnType<typeof buildMainStreet> | null = null
export function getMainStreet() {
  if (!cache) cache = buildMainStreet()
  return cache
}
