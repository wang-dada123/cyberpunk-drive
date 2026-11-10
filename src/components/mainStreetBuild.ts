import * as THREE from 'three'
import { MAIN_BUILDINGS, bands, footprint, shopSignX, shopSignY, streetSigns, VIADUCT, BRIDGE_Z, CLOCK, STREET_LAMPS, ICE, COLD, type Bld } from '../data/mainStreet'
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
    const at: Attr = { ...base, len: L, shop: 0, s1: 0 }
    const P = (u: number, y: number) => {
      const t = u / L
      return [A[0] + (B[0] - A[0]) * t, y, A[1] + (B[1] - A[1]) * t]
    }
    const strip = (u0: number, u1: number, ya: number, yb: number) => {
      if (yb - ya < 0.04 || u1 - u0 < 0.04) return
      buf.quad(P(u0, ya), P(u1, ya), P(u1, yb), P(u0, yb), [[u0, ya], [u1, ya], [u1, yb], [u0, yb]], at)
    }
    // 朝街的底商挖一个洞，后面另做内凹铺面，不再贴一块米色
    if (front && shopKind > 0 && y1 > 3.1) {
      const jamb = Math.min(0.42, L * 0.12)
      const head = 2.82
      strip(0, L, y0, y0 + 0.16)
      strip(0, L, head, y1)
      strip(0, jamb, y0 + 0.16, head)
      strip(L - jamb, L, y0 + 0.16, head)
    } else buf.quad(P(0, y0), P(L, y0), P(L, y1), P(0, y1), [[0, y0], [L, y0], [L, y1], [0, y1]], at)
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
    float curtain = step(vGlass, vConc + 0.25);
    float md = abs(fract(vF.x / 1.5 + 0.5) - 0.5) * 1.5;
    float mullV = 1.0 - smoothstep(0.015, 0.045, md);
    float row = abs(fract((y - vConc) / 3.2) - 0.5) * 3.2;
    float mullH = (1.0 - smoothstep(0.06, 0.14, row)) * curtain;
    float mull = max(mullV, mullH);
    vec3 gls = mix(${lin('#070E16')}, ${lin('#162030')}, mull);
    base = conc * wC + met * wM + gls * wG;
    base *= vary;
    if (vS0 > 1.5 && vS0 < 2.5) base *= 0.62;
    if (vS0 > 2.5) base *= 0.5;
    gRough = mix(mix(0.92, 0.38, wet), 1.0, wC) * wC + mix(0.38, 0.9, seam) * wM + mix(0.08, 0.72, mull) * wG;
    gMetal = 0.04 * wC + 0.86 * wM + mix(0.08, 0.4, mull) * wG;
    gEnvK = 0.2 * wC + mix(0.7, 0.12, seam) * wM + mix(mix(0.45, 0.22, curtain), 0.12, mull) * wG;
    // 住宅窗格（A）和幕墙大格（B）。亮度停在 Bloom 阈值下，墙本身不进光晕。
    if (vRoof < 0.5 && y > 4.3 && vS0 < 0.5) {
      float floorH = 3.2;
      float yRel = y - 4.3;
      float fl = floor(yRel / floorH);
      float ly = yRel - fl * floorH;
      float period = 4.1;
      float xw = vF.x;
      float cell = floor(xw / period);
      float lx = xw - cell * period;
      float inGroup = step(lx, 2.35);
      float col = floor(lx / 0.82);
      float lxx = lx - col * 0.82;
      float win = step(0.14, lxx) * step(lxx, 0.68);
      float inY = step(0.62, ly) * step(ly, 2.45);
      float keep = step(0.22, bh(vec2(cell, fl + vSeed)));
      float pane = inGroup * win * inY * keep * step(0.0, yRel);
      float warmW = step(0.88, bh(vec2(cell + 5.0, fl + vSeed)));
      vec3 wc = mix(${lin('#E8F4FF')}, ${lin('#FFE6C4')}, warmW);
      float on = step(0.42, bh(vec2(cell + 1.7, fl)));
      gEmit = wc * pane * on * mix(0.42, 0.62, warmW);
      base = mix(base, vec3(0.012, 0.018, 0.028), pane);
    }
    if (vRoof < 0.5 && y > 3.6 && vS0 > 0.5 && vS0 < 1.5) {
      float glassF = step(0.5, vS0);
      float bay = mix(1.55, 2.45, glassF);
      float winW = mix(1.18, 2.1, glassF);
      float winH = mix(1.9, 2.6, glassF);
      float floorH = mix(3.2, 3.55, glassF);
      float sill = mix(0.52, 0.32, glassF);
      float yRel = y - 3.6;
      float fl = floor(yRel / floorH);
      float ly = yRel - fl * floorH;
      float inY = min(ly - sill, sill + winH - ly);
      float xw = vF.x + bh(vec2(vSeed, 3.0)) * 9.0;
      float cell = floor(xw / bay);
      float lx = xw - cell * bay;
      float inX = min(lx - (bay - winW) * 0.5, (bay + winW) * 0.5 - lx);
      float gsz = 3.0 + floor(bh(vec2(vSeed, 5.5)) * 2.99);
      float period = gsz * 3.0;
      float inGrp = mix(step(mod(cell, period) + 0.5, gsz), 1.0, glassF);
      float pane = step(0.0, inX) * step(0.0, inY) * inGrp * step(0.0, yRel);
      float grad = mix(0.72, 1.0, clamp((ly - sill) / max(winH, 0.01), 0.0, 1.0));
      float cold = step(mix(0.42, 0.7, glassF), bh(vec2(cell, fl + vSeed)));
      vec3 wc = mix(${lin('#4FC3F7')}, ${lin('#E8F4FF')}, cold);
      float lit = mix(1.0, step(0.58, bh(vec2(cell + 2.0, fl))), glassF);
      float drape = step(0.8, bh(vec2(cell + 4.0, vSeed))) * step(0.5, clamp((sill + winH - ly) / max(winH, 0.01), 0.0, 1.0));
      float kE = mix(0.72, 0.36, glassF);
      gEmit = wc * pane * grad * lit * mix(kE, kE * 0.4, drape);
      base = mix(base, mix(vec3(0.02, 0.032, 0.048), vec3(0.035, 0.055, 0.075), glassF), clamp(pane, 0.0, 1.0));
    }
    // C：稀的工业单点窗，墙更脏
    if (vRoof < 0.5 && vS0 > 1.5 && vS0 < 2.5 && y > 4.4) {
      float bay = 3.6;
      float cell = floor(vF.x / bay);
      float lx = vF.x - cell * bay - bay * 0.5;
      float row = floor((y - 4.4) / 5.1);
      float ly = y - 4.4 - row * 5.1 - 1.7;
      float on = step(0.74, bh(vec2(cell, row + vSeed)));
      float pane = step(abs(lx), 0.26) * step(abs(ly), 0.36) * on;
      gEmit += ${lin('#E8F4FF')} * pane * 0.5;
      base = mix(base, vec3(0.012, 0.018, 0.026), pane);
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
  } else if (vZone < 6.5) {
    base = ${lin('#0A1420')}; gEmit = ${lin('#E8F4FF')} * 1.45; gRough = 0.25; gMetal = 0.05; gEnvK = 0.3;
  } else if (vZone < 7.5) {
    vec3 warm = ${lin('#FFE6C4')};
    base = warm * 0.22; gEmit = warm * 1.55; gRough = 0.84; gMetal = 0.0; gEnvK = 0.15;
  } else if (vZone < 8.5) {
    base = ${lin('#121820')} * vary; gRough = 0.92; gMetal = 0.04; gEnvK = 0.18; gEmit = vec3(0.0);
  } else if (vZone < 9.5) {
    vec2 q = vF - 0.5;
    if (length(q) > 0.46) discard;
    vec3 warm = ${lin('#FFE6C4')};
    base = warm * 0.02; gEmit = warm * 0.5; gRough = 1.0; gMetal = 0.0; gEnvK = 0.0;
  } else if (vZone < 10.5) {
    base = ${lin('#071018')}; gEmit = ${lin('#4FC3F7')} * 2.4; gRough = 0.3; gMetal = 0.1; gEnvK = 0.2;
  } else {
    base = ${lin('#071018')}; gEmit = ${lin('#4FC3F7')} * 0.85; gRough = 0.35; gMetal = 0.05; gEnvK = 0.2;
  }
  diffuseColor.rgb = base;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(gRough, 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(gMetal, 0.0, 1.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = gEmit;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nradiance *= gEnvK;')
  }
  m.customProgramCacheKey = () => 'mainStreetV7'
  return m
}

function sidewalk(bd: Bld, out: number) {
  return bd.face - bd.side * out
}

/** 两端点之间的细方钢。厚是截面边长。 */
function beam(buf: Buf, a: number[], b: number[], thick: number, zone: number, seed: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
  const L = Math.hypot(dx, dy, dz) || 1
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = (a[2] + b[2]) / 2
  const yaw = Math.atan2(dx, dz)
  const pitch = Math.atan2(dy, Math.hypot(dx, dz))
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
  const h = thick / 2
  const X = (x: number, y: number, z: number) => {
    const y1 = y * cp - z * sp
    const z1 = y * sp + z * cp
    return [mx + x * cy + z1 * sy, my + y1, mz - x * sy + z1 * cy]
  }
  const at: Attr = { ...A0(), zone, seed, cx: mx, cy: my, cz: mz }
  const cnr = [
    X(-h, -h, -L / 2), X(h, -h, -L / 2), X(h, h, -L / 2), X(-h, h, -L / 2),
    X(-h, -h, L / 2), X(h, -h, L / 2), X(h, h, L / 2), X(-h, h, L / 2),
  ]
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]]
  const face = (i: number[]) => buf.quad(cnr[i[0]], cnr[i[1]], cnr[i[2]], cnr[i[3]], uv, at)
  face([4, 5, 6, 7]); face([1, 0, 3, 2]); face([5, 1, 2, 6]); face([0, 4, 7, 3]); face([3, 7, 6, 2]); face([0, 1, 5, 4])
}

function ring(buf: Buf, x: number, y: number, z: number, r: number, thick: number, zone: number, seed: number) {
  const n = 10
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2
    beam(buf, [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], thick, zone, seed + i)
  }
}

function spill(buf: Buf, x: number, z: number, seed: number, s = 2.4) {
  const at: Attr = { ...A0(), zone: 9, seed }
  buf.quad(
    [x - s / 2, 0.07, z + s / 2], [x + s / 2, 0.07, z + s / 2], [x + s / 2, 0.07, z - s / 2], [x - s / 2, 0.07, z - s / 2],
    [[0, 1], [1, 1], [1, 0], [0, 0]], at,
  )
}

function umbrella(buf: Buf, x: number, z: number, seed: number) {
  cylY(buf, x, 1.15, z, 0.035, 2.15, 5, 8, seed)
  const n = 8
  const at: Attr = { ...A0(), zone: 1, seed, cx: x, cy: 2.05, cz: z }
  const tip = [x, 2.28, z]
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2
    buf.tri(tip, [x + Math.cos(a0) * 0.85, 2.02, z + Math.sin(a0) * 0.85], [x + Math.cos(a1) * 0.85, 2.02, z + Math.sin(a1) * 0.85], [0, 1, 0], [0.5, 1], [0, 0], [1, 0], at)
  }
}

/** 只打扮 A 段：阳台、栏杆、晾衣、空调、雨棚、立管。B/C 不走这里。 */
function dressAlley(buf: Buf, bd: Bld) {
  if (bd.side === 0) return
  const seed = hash(bd.id)
  const side = bd.side
  const face = bd.face
  const mz = (bd.z0 + bd.z1) / 2
  cylY(buf, face - side * 0.1, bd.h * 0.42, bd.z0 + 0.28, 0.05, bd.h * 0.78, 6, 1, seed)
  cylY(buf, face - side * 0.1, bd.h * 0.38, bd.z1 - 0.28, 0.04, bd.h * 0.6, 6, 1, seed + 1)
  {
    const zL = bd.z0 + 0.2, zR = bd.z1 - 0.2
    const xWall = face - side * 0.02
    const xLip = face - side * 1.2
    const at: Attr = { ...A0(), zone: 1, seed }
    buf.quad([xWall, 3.28, zL], [xWall, 3.28, zR], [xLip, 2.68, zR], [xLip, 2.68, zL], [[0, 0], [1, 0], [1, 1], [0, 1]], at)
  }
  let n = 0
  for (let y = 6.35; y < bd.h - 1.1; y += 3.1) {
    const w = Math.min(bd.z1 - bd.z0 - 0.7, 4.6)
    const px = face - side * 0.72
    prop(buf, px, y, mz, 1.2, 0.09, w, 0, 8, seed + n)
    const railX = px - side * 0.48
    const posts = Math.max(6, Math.round(w / 0.28))
    for (let p = 0; p < posts; p++) {
      const oz = -w * 0.42 + (p / (posts - 1)) * w * 0.84
      cylY(buf, railX, y + 0.36, mz + oz, 0.018, 0.62, 5, 1, seed + n * 17 + p)
    }
    beam(buf, [railX, y + 0.68, mz - w * 0.42], [railX, y + 0.68, mz + w * 0.42], 0.03, 1, seed)
    beam(buf, [railX, y + 0.32, mz - w * 0.42], [railX, y + 0.32, mz + w * 0.42], 0.025, 1, seed)
    // 窗框：成组的几何凹凸，不是贴图点子
    for (const oz of [-1.15, 0, 1.15]) {
      const wz = mz + oz
      const wx = face - side * 0.06
      prop(buf, wx, y + 1.15, wz - 0.38, 0.06, 1.35, 0.05, 0, 1, seed)
      prop(buf, wx, y + 1.15, wz + 0.38, 0.06, 1.35, 0.05, 0, 1, seed)
      prop(buf, wx, y + 1.8, wz, 0.06, 0.05, 0.8, 0, 1, seed)
      prop(buf, wx, y + 0.5, wz, 0.06, 0.05, 0.8, 0, 1, seed)
    }
    const xh = px - side * 0.12
    beam(buf, [xh, y + 0.5, mz - 1.05], [xh, y + 0.5, mz + 1.05], 0.025, 1, seed + 2)
    const cloth: Attr = { ...A0(), zone: 5, seed: seed + n, cx: xh, cy: y, cz: mz }
    buf.quad([xh, y + 0.45, mz - 0.85], [xh, y + 0.45, mz - 0.05], [xh, y - 0.45, mz - 0.05], [xh, y - 0.45, mz - 0.85], [[0, 0], [1, 0], [1, 1], [0, 1]], cloth)
    buf.quad([xh, y + 0.45, mz + 0.2], [xh, y + 0.45, mz + 0.95], [xh, y - 0.1, mz + 0.95], [xh, y - 0.1, mz + 0.2], [[0, 0], [1, 0], [1, 1], [0, 1]], { ...cloth, seed: seed + 4 })
    prop(buf, px + side * 0.2, y - 0.42, mz + w * 0.2, 0.42, 0.32, 0.5, 0, 1, seed + n)
    cylY(buf, px - side * 0.02, y - 0.42, mz + w * 0.2, 0.11, 0.05, 7, 1, seed + 6)
    if (n % 2 === 0) pot(buf, px - side * 0.08, mz - w * 0.3, seed + n, y + 0.08)
    n++
  }
  if (bd.shop) {
    const cx = face - side * 0.16
    for (let k = 0; k < 5; k++) {
      const zz = mz - 0.9 + k * 0.4
      const at: Attr = { ...A0(), zone: 5, seed: seed + 20 + k }
      buf.quad([cx, 2.15, zz], [cx, 2.15, zz + 0.22], [cx, 0.35, zz + 0.22], [cx, 0.35, zz], [[0, 0], [1, 0], [1, 1], [0, 1]], at)
    }
  }
}

function alleyClutter(buf: Buf) {
  const bikes: Array<[number, number]> = [[-5.7, 35.2], [5.85, 42.5], [-5.65, 51.4], [5.75, 60.2]]
  bikes.forEach(([x, z], i) => bike(buf, x, z, 80 + i))
  const bins: Array<[number, number]> = [[-5.9, 39.2], [5.95, 48.6], [-5.85, 57.5]]
  bins.forEach(([x, z], i) => {
    cylY(buf, x, 0.42, z, 0.22, 0.7, 8, 8, 90 + i)
    cylY(buf, x, 0.8, z, 0.24, 0.06, 8, 1, 90 + i)
  })
  // 跨街电线，几段折线，不是一根方梁
  const wires: Array<[number, number, number]> = [[34.5, 9.2, 8.4], [43, 10.4, 9.1], [51.5, 8.8, 9.6], [60, 10.1, 8.6]]
  wires.forEach(([z, yL, yR], i) => {
    const n = 6
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n
      const sag = Math.sin(Math.PI * (t0 + t1) * 0.5) * 0.85
      const y0 = yL + (yR - yL) * t0 - sag
      const y1 = yL + (yR - yL) * t1 - Math.sin(Math.PI * t1) * 0.85
      beam(buf, [-6.2 + t0 * 12.4, y0, z], [-6.2 + t1 * 12.4, y1, z], 0.03, 1, 100 + i)
    }
  })
  umbrella(buf, -5.55, 40.4, 70)
  umbrella(buf, 5.7, 46.8, 71)
  // 桌：薄面 + 四条圆柱腿
  const tables: Array<[number, number]> = [[-5.6, 43.6], [5.7, 54.2]]
  tables.forEach(([x, z], i) => {
    prop(buf, x, 0.72, z, 0.7, 0.04, 0.7, 0.2, 1, 110 + i)
    for (const [dx, dz] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]]) {
      cylY(buf, x + dx, 0.35, z + dz, 0.02, 0.68, 5, 1, 110 + i)
    }
  })
}

function cylY(buf: Buf, x: number, y: number, z: number, r: number, h: number, n: number, zone: number, seed: number) {
  const at: Attr = { ...A0(), zone, seed, cx: x, cy: y, cz: z }
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2
    const c0 = Math.cos(a0) * r, s0 = Math.sin(a0) * r, c1 = Math.cos(a1) * r, s1 = Math.sin(a1) * r
    buf.quad([x + c0, y - h / 2, z + s0], [x + c1, y - h / 2, z + s1], [x + c1, y + h / 2, z + s1], [x + c0, y + h / 2, z + s0], [[0, 0], [1, 0], [1, 1], [0, 1]], at)
  }
  const top: number[][] = []
  for (let i = 0; i < n; i++) top.push([x + Math.cos((i / n) * Math.PI * 2) * r, y + h / 2, z + Math.sin((i / n) * Math.PI * 2) * r])
  for (let i = 1; i < n - 1; i++) buf.tri(top[0], top[i], top[i + 1], [0, 1, 0], [0, 0], [1, 0], [1, 1], at)
}

function stool(buf: Buf, x: number, z: number, seed: number) {
  cylY(buf, x, 0.46, z, 0.16, 0.06, 6, 4, seed)
  cylY(buf, x, 0.22, z, 0.035, 0.4, 5, 4, seed)
}
function pot(buf: Buf, x: number, z: number, seed: number, y = 0) {
  cylY(buf, x, y + 0.22, z, 0.16, 0.28, 6, 4, seed)
  prop(buf, x, y + 0.48, z, 0.22, 0.16, 0.1, 0.4, 5, seed)
  prop(buf, x + 0.06, y + 0.5, z + 0.05, 0.1, 0.18, 0.16, 0.8, 5, seed + 1)
}
function bike(buf: Buf, x: number, z: number, seed: number) {
  cylY(buf, x, 0.32, z - 0.38, 0.28, 0.06, 7, 4, seed)
  cylY(buf, x, 0.32, z + 0.38, 0.28, 0.06, 7, 4, seed)
  prop(buf, x, 0.42, z, 0.06, 0.06, 0.7, 0, 4, seed)
  prop(buf, x, 0.62, z + 0.15, 0.05, 0.32, 0.05, 0.5, 4, seed)
}
function crates(buf: Buf, x: number, z: number, seed: number) {
  prop(buf, x, 0.22, z, 0.48, 0.4, 0.42, 0.15, 4, seed)
  prop(buf, x + 0.04, 0.52, z + 0.02, 0.36, 0.28, 0.34, -0.2, 4, seed + 1)
  prop(buf, x - 0.02, 0.74, z - 0.02, 0.26, 0.18, 0.24, 0.4, 4, seed + 2)
}
function shelfRow(buf: Buf, x: number, z: number, w: number, seed: number, y0 = 0.55, n = 3) {
  for (let i = 0; i < n; i++) prop(buf, x, y0 + i * 0.48, z, 0.28, 0.05, w, 0, 1, seed + i)
}

/** 内凹铺面：框、玻璃、暖墙、各店自己的家具。玻璃进单独的透明网格。 */
function addShop(buf: Buf, glass: Buf, bd: Bld, trims: Trim[]) {
  if (bd.side === 0) return
  const seed = hash(bd.id)
  const into = (d: number) => bd.face + bd.side * d
  const zL = bd.z0 + 0.4, zR = bd.z1 - 0.4, zm = (zL + zR) / 2, zw = zR - zL
  const xFront = into(-0.05)
  prop(buf, into(1.85), 1.4, zm, 0.08, 2.55, zw, 0, 7, seed)
  prop(buf, into(0.95), 0.04, zm, 1.8, 0.05, zw, 0, 1, seed)
  prop(buf, into(0.95), 1.35, zL, 1.8, 2.5, 0.08, 0, 1, seed)
  prop(buf, into(0.95), 1.35, zR, 1.8, 2.5, 0.08, 0, 1, seed)
  prop(buf, into(0.55), 2.7, zm, 1.1, 0.06, zw, 0, 1, seed)
  // 竖梃 + 中横档
  const xm = into(-0.08)
  for (const t of [0.33, 0.66]) prop(buf, xm, 1.45, zL + zw * t, 0.05, 2.4, 0.05, 0, 1, seed)
  prop(buf, xm, 1.45, zm, 0.05, 0.05, zw * 0.92, 0, 1, seed)
  if (bd.shutter) {
    for (let i = 0; i < 5; i++) prop(buf, xm, 1.7 + i * 0.2, zm, 0.04, 0.08, zw * 0.86, 0, 1, seed + i)
  }
  const gAt = A0()
  glass.quad(
    [xFront, 0.22, zL], [xFront, 0.22, zR], [xFront, 2.72, zR], [xFront, 2.72, zL],
    [[0, 0], [1, 0], [1, 1], [0, 1]], gAt,
  )
  const lip = into(-0.72)
  prop(buf, (bd.face + lip) / 2, 2.98, zm, Math.abs(lip - bd.face), 0.07, zw + 0.2, 0, 1, seed)
  if (bd.seg === 'A') trims.push({ p: [lip, 2.92, zm], s: [0.035, 0.035, zw + 0.2], ry: Math.PI / 2, color: ICE, k: 1.35, fade: true })
  if (bd.seg === 'B' && bd.shop) {
    const aw = into(-1.7)
    glass.quad(
      [bd.face, 3.05, zL + 0.2], [bd.face, 3.05, zR - 0.2], [aw, 2.72, zR - 0.2], [aw, 2.72, zL + 0.2],
      [[0, 0], [1, 0], [1, 1], [0, 1]], A0(),
    )
  }
  const kind = bd.shop?.kind
  const xi = into(1.35)
  if (kind === 'noodle') {
    prop(buf, into(0.55), 1.0, zm, 0.42, 0.9, zw * 0.7, 0, 1, seed)
    prop(buf, into(0.5), 1.48, zm, 0.5, 0.06, zw * 0.62, 0, 7, seed)
    cylY(buf, into(0.5), 1.55, zm - 0.4, 0.16, 0.12, 6, 1, seed)
    cylY(buf, into(0.5), 1.55, zm + 0.35, 0.14, 0.1, 6, 1, seed)
    for (let i = 0; i < 4; i++) prop(buf, into(1.55), 1.7, zm - 1.1 + i * 0.55, 0.04, 0.55, 0.04, 0.4, 1, seed + i)
    stool(buf, sidewalk(bd, 0.42), zm - 0.85, seed)
    stool(buf, sidewalk(bd, 0.42), zm + 0.7, seed + 3)
  } else if (kind === 'repair' && bd.seg !== 'C') {
    shelfRow(buf, xi, zm, zw * 0.75, seed, 0.7, 4)
    for (let i = 0; i < 4; i++) prop(buf, xi - bd.side * 0.12, 0.85 + i * 0.4, zm - 0.8 + i * 0.15, 0.04, 0.22, 0.04, 0.3, 1, seed + i)
    prop(buf, into(0.4), 0.85, zm, 0.4, 0.7, 0.9, 0, 1, seed)
    bike(buf, sidewalk(bd, 0.5), zm + 0.9, seed)
    stool(buf, sidewalk(bd, 0.4), zm - 0.7, seed + 2)
  } else if (kind === 'tea') {
    shelfRow(buf, xi, zm, zw * 0.8, seed, 0.6, 4)
    for (let i = 0; i < 5; i++) cylY(buf, xi - bd.side * 0.1, 0.78 + (i % 2) * 0.48, zm - 1 + i * 0.4, 0.06, 0.1, 5, 1, seed + i)
    umbrella(buf, sidewalk(bd, 0.62), zm - 1.15, seed + 8)
    prop(buf, sidewalk(bd, 0.7), 0.42, zm + 1.35, 0.7, 0.06, 0.7, 0.2, 4, seed)
    stool(buf, sidewalk(bd, 0.4), zm + 0.9, seed + 4)
  } else if (kind === 'mart' && bd.seg !== 'C') {
    prop(buf, xi, 1.15, zm - zw * 0.28, 0.4, 2.0, 0.7, 0, 1, seed)
    prop(buf, xi - bd.side * 0.18, 1.2, zm - zw * 0.28, 0.02, 1.4, 0.5, 0, 6, seed)
    shelfRow(buf, xi, zm + 0.45, zw * 0.45, seed, 0.55, 4)
    shelfRow(buf, xi - bd.side * 0.35, zm + 0.2, zw * 0.35, seed + 4, 0.7, 3)
    bike(buf, sidewalk(bd, 0.48), zm + 0.2, seed + 2)
  } else if (kind === 'cafe') {
    prop(buf, into(0.7), 1.05, zm, 0.4, 0.95, zw * 0.72, 0, 1, seed)
    prop(buf, into(0.48), 1.15, zm, 0.08, 0.04, zw * 0.66, 0, 7, seed)
    stool(buf, sidewalk(bd, 0.55), zm - 1.1, seed)
    stool(buf, sidewalk(bd, 0.55), zm + 1.0, seed + 2)
    prop(buf, sidewalk(bd, 0.7), 0.4, zm + 1.6, 0.4, 0.42, 1.2, 0, 4, seed)
  } else if (kind === 'books') {
    for (const o of [-0.7, 0, 0.7]) {
      prop(buf, xi, 1.25, zm + o, 0.28, 2.2, 0.55, 0, 1, seed + o)
      shelfRow(buf, xi - bd.side * 0.02, zm + o, 0.48, seed + o * 3, 0.45, 4)
    }
    prop(buf, sidewalk(bd, 0.6), 0.4, zm, 0.4, 0.42, 1.3, 0, 4, seed)
  } else if (kind === 'flora') {
    pot(buf, into(0.4), zm - 0.8, seed)
    pot(buf, into(0.45), zm, seed + 2)
    pot(buf, into(0.4), zm + 0.75, seed + 4)
    pot(buf, sidewalk(bd, 0.4), zm - 0.3, seed + 6)
    pot(buf, sidewalk(bd, 0.55), zm + 0.85, seed + 8)
    pot(buf, sidewalk(bd, 0.48), zm + 1.45, seed + 10)
  } else if (bd.id === 'c-e-hall') {
    prop(buf, into(0.5), 1.0, zm, 0.42, 0.95, zw * 0.62, 0, 1, seed)
    prop(buf, into(0.42), 1.5, zm, 0.48, 0.06, zw * 0.55, 0, 7, seed)
    stool(buf, sidewalk(bd, 0.45), zm - 0.8, seed)
    stool(buf, sidewalk(bd, 0.45), zm + 0.7, seed + 2)
    umbrella(buf, sidewalk(bd, 0.7), zm + 1.5, seed + 4)
  } else if (bd.seg === 'C') {
    prop(buf, into(0.45), 0.85, zm, 0.5, 0.75, zw * 0.55, 0, 1, seed)
    shelfRow(buf, xi, zm, zw * 0.7, seed, 0.5, 3)
    prop(buf, xi - bd.side * 0.16, 1.15, zm - 0.4, 0.06, 0.4, 0.7, 0, 6, seed)
    prop(buf, xi - bd.side * 0.16, 0.82, zm + 0.45, 0.06, 0.28, 0.42, 0, 6, seed + 1)
    crates(buf, sidewalk(bd, 0.55), zm + 0.9, seed)
  }
  if (!kind && bd.shutter) {
    prop(buf, xi, 1.1, zm, 0.3, 1.6, zw * 0.5, 0, 1, seed)
  }
  if (bd.shop && bd.seg === 'A') {
    const boardW = bd.shop.word.length * 0.4 + (bd.shop.zh ? 0.9 : 0.45)
    const x = bd.face - bd.side * (1.15 + bd.shop.word.length * 0.2)
    prop(buf, x, 3.05, zm, boardW, 0.7, 0.12, 0, 1, seed)
    prop(buf, x, 3.05, zm - 0.08, boardW * 0.92, 0.5, 0.03, 0, 11, seed)
    spill(buf, bd.face - bd.side * 1.05, zm, seed + 11, 1.15)
  } else if (bd.shop && bd.seg === 'B') {
    const boardW = Math.min(zw * 0.96, bd.shop.word.length * 0.34 + (bd.shop.zh ? 1.5 : 0.7))
    const y = shopSignY(bd)
    const x = shopSignX(bd)
    prop(buf, x, y, zm - 0.02, boardW, 0.7, 0.16, 0, 1, seed)
    prop(buf, x, y, zm - 0.16, boardW * 0.9, 0.48, 0.03, 0, 11, seed)
  }
  if (bd.shop && bd.seg !== 'A') spill(buf, bd.face - bd.side * 1.45, zm, seed + 11)
  // 摊位雨棚
  if (bd.seg === 'C' && bd.shop) {
    const lipC = into(-1.05)
    prop(buf, (bd.face + lipC) / 2, 3.15, zm, Math.abs(lipC - bd.face), 0.06, zw + 0.4, 0, 1, seed + 9)
  }
}

export function buildMainStreet() {
  const buf = new Buf()
  const glass = new Buf()
  const trims: Trim[] = []
  for (const bd of MAIN_BUILDINGS) {
    const seed = hash(bd.id)
    const band = bands(bd)
    const poly = outline(bd)
    const style = bd.type === 'T5' ? 3 : bd.glass ? 1 : bd.seg === 'C' ? 2 : 0
    const base: Attr = { ...A0(), seed, h: bd.h, conc: band.conc, glass: band.glass, s0: style, cx: bd.face, cy: bd.h * 0.5, cz: (bd.z0 + bd.z1) / 2 }
    const kind = bd.shutter ? 2 : bd.shop ? 1 : 0
    if (bd.type === 'T2') {
      extrude(buf, poly, 0, bd.h - 3, base, bd.side, 0)
      const [x0, x1, z0, z1] = footprint(bd)
      const up: [number, number][] = [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x1 - 1, z1 - 1], [x0 + 1, z1 - 1]]
      extrude(buf, up, bd.h - 3, bd.h, base, 0, 0)
    } else {
      extrude(buf, poly, 0, bd.h, base, bd.side, kind)
    }
    const ys: { y: number; color: string; k: number; fade: boolean }[] = []
    if (bd.seg === 'A') {
      ys.push({ y: bd.h - 0.04, color: COLD, k: 1.12, fade: true })
      if (bd.h > 6) ys.push({ y: 4.28, color: ICE, k: 1.22, fade: true })
    }
    edgeTrims(bd.type === 'T2' ? outline(bd) : poly, ys, trims)
    // 屋顶附件，不发光
    const [x0, x1, z0, z1] = footprint(bd)
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2
    if (bd.type === 'T5') {
      prop(buf, mx, 15.2, mz, 6.2, 1.5, 6.2, 0, 8, seed)
      ring(buf, mx, 16.4, mz, 3.6, 0.22, 10, seed)
      ring(buf, mx, 21.5, mz, 2.4, 0.18, 10, seed + 2)
      ring(buf, mx, bd.h - 3.2, mz, 2.2, 0.16, 10, seed + 4)
      ring(buf, mx, bd.h - 0.8, mz, 1.35, 0.14, 10, seed + 6)
      prop(buf, mx, bd.h + 1.6, mz, 0.22, 3.2, 0.22, 0, 1, seed)
    } else if (bd.type === 'T1') {
      prop(buf, mx, bd.h + 0.7, mz, 1.6, 1.4, 1.6, 0, 1, seed)
      prop(buf, mx + 0.2, bd.h + 2.3, mz, 0.08, 1.8, 0.08, 0, 1, seed)
    } else if (bd.type === 'T4') {
      for (const o of [-1.2, 0, 1.1]) prop(buf, mx + o * 0.15, bd.h + 0.28, mz + o, 0.7, 0.5, 0.55, 0, 1, seed + o)
    } else if (bd.type === 'T2') {
      prop(buf, mx, bd.h + 0.7, mz, 1.8, 1.3, 1.4, 0, 1, seed)
    }
    if (bd.balcony && bd.side !== 0) {
      const row = MAIN_BUILDINGS.filter((o) => o.seg === bd.seg && o.side === bd.side && o.balcony)
      const style = row.findIndex((o) => o.id === bd.id) % 3
      const floors = bd.h >= 18 ? [6.55, 9.9] : [6.55]
      const w = Math.min(bd.z1 - bd.z0 - 0.5, 5.4)
      for (const y of floors) {
        const px = bd.face - bd.side * 0.72
        const slab = style === 1 ? 1 : 8
        prop(buf, px, y, mz, 1.35, 0.12, w, 0, slab, seed)
        const railX = px - bd.side * 0.58
        if (style === 2) {
          prop(buf, railX, y + 0.28, mz, 0.04, 0.08, w, 0, 1, seed)
          prop(buf, px - bd.side * 0.15, y - 0.28, mz + w * 0.28, 0.42, 0.28, 0.32, 0, 1, seed)
        } else {
          prop(buf, railX, y + 0.48, mz, 0.045, 0.78, w, 0, 1, seed)
          for (const oz of [-w * 0.32, 0, w * 0.32]) prop(buf, railX, y + 0.36, mz + oz, 0.04, 0.55, 0.04, 0, 1, seed + oz)
        }
        if (style === 0) pot(buf, px - bd.side * 0.12, mz + w * 0.3, seed + y, y + 0.1)
        if (style === 1) {
          const cloth: Attr = { ...A0(), zone: 5, seed: seed + y, cx: px, cy: y, cz: mz }
          const xh = px - bd.side * 0.22
          buf.quad(
            [xh, y + 0.15, mz - 1.15], [xh, y + 0.15, mz + 0.15], [xh, y - 0.95, mz + 0.15], [xh, y - 0.95, mz - 1.15],
            [[0, 0], [1, 0], [1, 1], [0, 1]], cloth,
          )
          buf.quad(
            [xh, y + 0.15, mz + 0.4], [xh, y + 0.15, mz + 1.35], [xh, y - 0.55, mz + 1.35], [xh, y - 0.55, mz + 0.4],
            [[0, 0], [1, 0], [1, 1], [0, 1]], { ...cloth, seed: seed + 3 },
          )
        }
      }
    }
    if ((bd.shop || bd.shutter) && bd.side !== 0) addShop(buf, glass, bd, trims)
    if (bd.seg === 'A') dressAlley(buf, bd)
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

  // A 段天桥：薄桥面、下弦、斜腹杆、栏杆。不是一块板。
  {
    const z = BRIDGE_Z
    const span = 13.2
    const deckY = 6.55
    prop(buf, 0, deckY, z, span, 0.1, 1.05, 0, 1, 4)
    beam(buf, [-span / 2, deckY - 0.55, z], [span / 2, deckY - 0.55, z], 0.06, 1, 4)
    const bays = 8
    for (let i = 0; i <= bays; i++) {
      const x = -span / 2 + (span * i) / bays
      beam(buf, [x, deckY - 0.55, z], [x, deckY - 0.05, z], 0.045, 1, 4)
      if (i < bays) {
        const x2 = -span / 2 + (span * (i + 1)) / bays
        if (i % 2 === 0) beam(buf, [x, deckY - 0.55, z], [x2, deckY - 0.05, z], 0.04, 1, 5)
        else beam(buf, [x, deckY - 0.05, z], [x2, deckY - 0.55, z], 0.04, 1, 5)
      }
    }
    for (const zz of [z - 0.48, z + 0.48]) {
      beam(buf, [-span / 2 + 0.3, deckY + 0.55, zz], [span / 2 - 0.3, deckY + 0.55, zz], 0.035, 1, 4)
      for (let i = 0; i <= 10; i++) {
        const x = -span / 2 + 0.4 + (i * (span - 0.8)) / 10
        cylY(buf, x, deckY + 0.28, zz, 0.02, 0.5, 4, 1, 6)
      }
    }
    trims.push({ p: [0, deckY - 0.62, z], s: [0.025, 0.025, span - 0.6], ry: Math.PI / 2, color: ICE, k: 1.45, fade: true })
  }
  alleyClutter(buf)

  // 时钟柱：深钢柱身，没有青色包边。钟面是冷白发光板，数字贴在前面。
  prop(buf, CLOCK.x, 4, CLOCK.z, 0.72, 8, 0.72, 0, 8, 9)
  prop(buf, CLOCK.x, 7.55, CLOCK.z, 0.92, 0.78, 0.92, 0, 1, 9)
  prop(buf, CLOCK.x - 0.52, 7.55, CLOCK.z, 0.04, 0.5, 0.7, 0, 11, 9)
  prop(buf, CLOCK.x, 7.55, CLOCK.z - 0.52, 0.7, 0.5, 0.04, 0, 11, 9)

  // 斜穿桁架：桥面厚 0.28m，开放腹杆，细墩只在人行道。
  {
    const ax = VIADUCT.a[0], az = VIADUCT.a[1], bx = VIADUCT.b[0], bz = VIADUCT.b[1]
    const dx = bx - ax, dz = bz - az
    const L = Math.hypot(dx, dz)
    const yaw = Math.atan2(dx, dz)
    const mx = (ax + bx) / 2, mz = (az + bz) / 2
    const nx = -dz / L, nz = dx / L
    const deckY = 7.75
    const thick = 0.28
    prop(buf, mx, deckY, mz, 1.25, thick, L, yaw, 1, 11)
    const yTop = deckY - thick / 2
    const yBot = yTop - 0.92
    const side = 0.52
    const nBay = 7
    for (const s of [-1, 1]) {
      const ox = nx * side * s, oz = nz * side * s
      beam(buf, [ax + ox, yTop, az + oz], [bx + ox, yTop, bz + oz], 0.07, 1, 11)
      beam(buf, [ax + ox, yBot, az + oz], [bx + ox, yBot, bz + oz], 0.07, 1, 11)
      for (let i = 0; i <= nBay; i++) {
        const t = i / nBay
        const x = ax + dx * t + ox, z = az + dz * t + oz
        beam(buf, [x, yBot, z], [x, yTop, z], 0.055, 1, 11)
        if (i < nBay) {
          const t2 = (i + 1) / nBay
          const x2 = ax + dx * t2 + ox, z2 = az + dz * t2 + oz
          if (i % 2 === 0) beam(buf, [x, yBot, z], [x2, yTop, z2], 0.05, 1, 12)
          else beam(buf, [x, yTop, z], [x2, yBot, z2], 0.05, 1, 12)
        }
      }
    }
    for (let i = 1; i < nBay; i += 2) {
      const t = i / nBay
      const x = ax + dx * t, z = az + dz * t
      beam(buf, [x + nx * side, yBot, z + nz * side], [x - nx * side, yBot, z - nz * side], 0.05, 1, 12)
    }
    prop(buf, ax, yBot / 2, az, 0.32, yBot, 0.32, 0, 8, 11)
    prop(buf, bx, yBot / 2, bz, 0.32, yBot, 0.32, 0, 8, 12)
    trims.push({ p: [mx, yTop - 0.04, mz], s: [0.035, 0.035, L * 0.9], ry: yaw, color: ICE, k: 1.15, fade: true })
  }

  for (const lamp of STREET_LAMPS) {
    const [x, y, z] = lamp.p
    prop(buf, x, y * 0.48, z, 0.08, y * 0.96, 0.08, 0, 8, 21)
    prop(buf, x, y, z, 0.48, 0.1, 0.48, 0, 6, 21)
  }

  // 竖招背板。字朝来车，板在字后面。
  for (const s of streetSigns()) {
    if (!s.vertical) continue
    const h = Math.max(1.85, s.size * 5.1)
    const w = Math.max(0.64, s.size * 1.4)
    prop(buf, s.p[0], s.p[1], s.p[2] + 0.1, w, h, 0.06, 0, 1, 15)
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
    const x = hall.face - hall.side * 0.7
    const z = (hall.z0 + hall.z1) / 2
    prop(buf, x, 0.28, z - 1.4, 0.5, 0.42, 0.45, 0.3, 4, 34)
  }

  const geo = buf.geo()
  const glassGeo = glass.geo()
  const tris = buf.p.length / 9 + glass.p.length / 9 + trims.length * 12
  return { geo, glass: glassGeo, trims, tris }
}

let cache: ReturnType<typeof buildMainStreet> | null = null
export function getMainStreet() {
  if (!cache) cache = buildMainStreet()
  return cache
}
