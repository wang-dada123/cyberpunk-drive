import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { AB } from '../utils/tier'

/** 沥青细节预烘：启动时 GPU 一次性渲染 1024² 无缝纹理（80m 周期，≈8cm/px，带 mipmap），每帧片元只需 1 次采样代替 ~15 次值噪声 */
export const groundRT = new THREE.WebGLRenderTarget(1024, 1024, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false })
groundRT.texture.wrapS = groundRT.texture.wrapT = THREE.RepeatWrapping
groundRT.texture.anisotropy = 4
if (import.meta.env.DEV) Object.assign(window, { __groundRT: groundRT })
const BAKE_FS = /* glsl */ `
varying vec2 vUv;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// 周期值噪声：格点按 per 取模 → 80m 无缝
float vnp(vec2 p, vec2 per){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 a = mod(i, per), b = mod(i + 1.0, per);
  return mix(mix(h21(a), h21(vec2(b.x, a.y)), u.x), mix(h21(vec2(a.x, b.y)), h21(b), u.x), u.y); }
float vw(vec2 w, vec2 s, vec2 off){ return vnp(w * s + off, 80.0 * s); }
float fb(vec2 w, float s, vec2 off){ return 0.5 * vw(w, vec2(s), off) + 0.3 * vw(w, vec2(2.0 * s), off + 7.1) + 0.2 * vw(w, vec2(4.0 * s), off + 3.7); }
void main(){
  vec2 w = vUv * 80.0;
  vec2 pw = w + (vec2(fb(w, 0.35, vec2(1.0)), fb(w, 0.35, vec2(9.0))) - 0.5) * 2.2; // 域扭曲：打散值噪声格子感 → 有机不规则边
  // 积水场 v2：大尺度(主尺度≈8m/4m)+强域扭曲，无细高频 → 大片、柔边、低噪
  vec2 pw2 = w + (vec2(fb(w, 0.0625, vec2(4.0)), fb(w, 0.0625, vec2(12.0))) - 0.5) * 9.0;
  float pn = 0.62 * vw(pw2, vec2(0.125), vec2(11.3)) + 0.3 * vw(pw2, vec2(0.25), vec2(3.1)) + 0.08 * vw(pw, vec2(0.5), vec2(5.7));
  float g = vw(w, vec2(7.0), vec2(0.0)), big = fb(w, 0.125, vec2(0.0));
  float col = 0.86 + 0.14 * g + 0.18 * (big - 0.5);
  // 拼缝：两套错开尺度 + 强域扭曲，避免规则网格感；对比再压一档
  vec2 q = w + (vec2(fb(w, 0.11, vec2(0.0)), fb(w, 0.11, vec2(5.0))) - 0.5) * 9.0;
  vec2 q2 = w + (vec2(fb(w, 0.07, vec2(2.0)), fb(w, 0.07, vec2(8.0))) - 0.5) * 6.0;
  const float RH = 80.0 / 11.0, RL = 80.0 / 7.0;   // 更大块，缝更稀
  const float RH2 = 80.0 / 19.0, RL2 = 80.0 / 15.0;
  float row = mod(floor(q.y / RH), 11.0);
  float sx = abs(fract((q.x + h21(vec2(row, 3.0)) * RL) / RL) - 0.5) * RL;
  float sy = abs(fract(q.y / RH) - 0.5) * RH;
  float sd = min(RL * 0.5 - sx, RH * 0.5 - sy);
  float row2 = mod(floor(q2.x / RL2), 15.0);
  float sx2 = abs(fract((q2.y + h21(vec2(row2, 7.0)) * RH2) / RH2) - 0.5) * RH2;
  float sy2 = abs(fract(q2.x / RL2) - 0.5) * RL2;
  float sd2 = min(RH2 * 0.5 - sx2, RL2 * 0.5 - sy2);
  float seamA = 1.0 - (1.0 - smoothstep(0.02, 0.09, sd)) * (0.18 + 0.14 * vw(w, vec2(0.55), vec2(0.0)));
  float seamB = 1.0 - (1.0 - smoothstep(0.015, 0.07, sd2)) * (0.12 + 0.1 * vw(w, vec2(0.9), vec2(4.0)));
  float seam = min(seamA, seamB);
  float cr = abs(vw(w, vec2(0.55), vec2(21.0)) - 0.5);
  seam *= 1.0 - (1.0 - smoothstep(0.006, 0.028, cr)) * 0.22 * step(0.6, vw(w, vec2(0.15), vec2(0.0)));
  float rough = fb(w, 0.5, vec2(0.0));
  float st = vw(w, vec2(0.45, 0.0625), vec2(2.0));
  gl_FragColor = vec4(pn, col * seam / 1.25, rough, st);
}`
let baked = false // v33.1 seam
export function bakeGround(gl: THREE.WebGLRenderer) {
  if (baked) return; baked = true
  const t0 = performance.now()
  const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mat = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: BAKE_FS })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); sc.add(quad)
  const prev = gl.getRenderTarget(); gl.setRenderTarget(groundRT); gl.render(sc, cam); gl.setRenderTarget(prev)
  mat.dispose(); quad.geometry.dispose()
  ;(window as unknown as { __bakeMs: number }).__bakeMs = performance.now() - t0
  if (import.meta.env.DEV) Object.assign(window, { __groundRT: groundRT })
}
/** 放在场景最前：首帧渲染前完成烘焙 */
export function GroundBake() { const gl = useThree((s) => s.gl); useMemo(() => bakeGround(gl), [gl]); return null }

/**
 * 地面程序化材质（美术总监定稿参数）：
 * - 沥青：深灰 + 噪声粗糙度 0.6–0.8 + 不规则拼缝/细裂缝；
 * - 积水：覆盖约 15–20%，直径 0.5–4m，边缘渐变；路边/灯下多、路中少。假反射仍在这块材质里：水平面镜向采样预烘霓虹，加上车灯/路灯在地面上的镜面高光。色相只留冰蓝/冷白。不用 Reflector。
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
import { FAKE_LAMP_GLSL, REAL_LIGHTS } from '../utils/fakeLights'
import { LOOK, neonEnvTex, carSpotUniform, lookTier } from '../utils/look'
const PD = LOOK.puddle, SP = LOOK.car.spot
const g3 = (c: string) => { const k = new THREE.Color(c); return `vec3(${k.r.toFixed(4)},${k.g.toFixed(4)},${k.b.toFixed(4)})` }
const ICE = g3('#4FC3F7'), WHITE = g3('#E8F4FF')
/** 头灯地面光斑（椭圆，车前 near–far，宽 width，中心亮度 k，边缘柔化） */
const CAR_SPOT_GLSL = `uniform vec4 uCar;
float carSpot(vec2 w){ vec2 d = w - uCar.xy; float a = dot(d, uCar.zw); float b = dot(d, vec2(-uCar.w, uCar.z));
  float r2 = pow((a - ${((SP.near+SP.far)/2).toFixed(2)}) / ${((SP.far-SP.near)/2).toFixed(2)}, 2.0) + pow(b / ${(SP.width/2).toFixed(2)}, 2.0);
  float s = 1.0 - smoothstep(0.0, 1.0, r2); return ${SP.k.toFixed(3)} * s * s; }`
const SPOT_EMIT = `totalEmissiveRadiance += ${g3(SP.color)} * carSpot(vWp.xz) * (${SP.gain.toFixed(3)} + ${(SP.pudGain-SP.gain).toFixed(3)} * gPudL);`
const LAMP_EMIT = REAL_LIGHTS ? '' : 'totalEmissiveRadiance += diffuseColor.rgb * RECIPROCAL_PI * gLamp; // 假光斑。水洼已把 gLamp 乘掉，避免彩蛋区薄荷绿串进倒影'
export const LAMPS_XZ: [number, number][] = [[0, 14], [0, -50], [60, 0], [-60, 0], [0, 112], [0, 140]] // 与 Scene.tsx 的 pointLight 一致

type Edge = { mode: 0 | 1; R?: number; W?: number }
export function makeAsphalt(color: string, edge: Edge) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.25 })
  if (AB.has('ground')) return m
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMode = { value: edge.mode }
    sh.uniforms.uDetail = { value: groundRT.texture }
    sh.uniforms.uEnv = { value: neonEnvTex }
    sh.uniforms.uCar = carSpotUniform
    sh.uniforms.uLook = lookTier
    sh.uniforms.uRing = { value: new THREE.Vector2(edge.R ?? 0, (edge.W ?? 1) / 2) }
    sh.uniforms.uLamps = { value: LAMPS_XZ.slice(0, 6).concat(Array(Math.max(0, 6 - LAMPS_XZ.length)).fill([9999, 9999])).map(([x, z]) => new THREE.Vector2(x, z)) }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec2 vUv0;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vUv0 = uv;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWp; varying vec2 vUv0; uniform float uMode; uniform vec2 uRing; uniform vec2 uLamps[6];
uniform sampler2D uDetail; uniform sampler2D uEnv; uniform float uLook; float gPud; float gPudR; float gLit; vec4 gD; vec3 gLamp; float gPudL;
vec3 satCap(vec3 c, float cap){ float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); float mx = max(c.r, max(c.g, c.b)); float mn = min(c.r, min(c.g, c.b));
  float s = (mx - mn) / max(mx, 1e-4); return mix(vec3(l), c, min(1.0, cap / max(s, 1e-4))); }
float pudLum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
${FAKE_LAMP_GLSL}
${CAR_SPOT_GLSL}
vec2 mirrorHit(vec2 lightXZ, float lightY){
  float camY = max(cameraPosition.y - vWp.y, 0.2);
  float h = max(lightY - vWp.y, 0.2);
  float t = camY / (camY + h);
  return mix(cameraPosition.xz, lightXZ, t);
}
float streak(vec2 hit, vec2 rt, vec2 vh, float sigA, float sigB){
  vec2 d = vWp.xz - hit;
  float a = dot(d, vh);
  float b = dot(d, rt);
  return exp(-a * a / (sigA * sigA) - b * b / (sigB * sigB));
}
float lampStreak(vec2 rt, vec2 vh){
  float e = 0.0;
  for (int i = 0; i < 6; i++) e += streak(mirrorHit(FL_P[i].xz, FL_P[i].y), rt, vh, 7.0, 0.72) * pudLum(FL_C[i]);
  return e;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 w = vWp.xz;
  // 预烘细节纹理（80m 周期无缝）：R 积水噪声 / G 颜色系数(颗粒+色差+拼缝+裂缝)/1.25 / B 粗糙度噪声 / A 倒影条纹
  gD = texture2D(uDetail, (w + vec2(2.0, 12.0)) / 80.0); // 偏移让 ref 视角路段落在积水区
  float edge = uMode < 0.5 ? abs(vUv0.x - 0.5) * 2.0 : clamp(abs(length(w) - uRing.x) / uRing.y, 0.0, 1.0);
  gLamp = fakeLamp(vWp);
  // 水洼只放路边 / 灯下（招牌多在路边），暗处路中阈值高到基本没有
  gLit = clamp(dot(gLamp, vec3(0.3, 0.5, 0.2)) * 10.0, 0.0, 1.0);
  float place = max(smoothstep(0.3, 0.8, edge), gLit);
  float thr = mix(${PD.thrDark.toFixed(3)}, ${PD.thrLit.toFixed(3)}, place);
  float dP = gD.r - thr;
  float dp = max(length(vec2(dFdx(dP), dFdy(dP))), 1e-5);
  float mPerPx = max(length(vec2(length(vec2(dFdx(w.x), dFdy(w.x))), length(vec2(dFdx(w.y), dFdy(w.y))))), 1e-4);
  float halfW = 0.15 * dp / mPerPx; // 边缘柔化 0.3m（值域宽度 / 坡度）
  gPud = smoothstep(-halfW, halfW, dP);
  // 车头前、车尾后用同一张噪声再补一块湿痕，头灯/尾灯才有地方落成倒影
  vec2 ahead = uCar.xy + uCar.zw * 2.6;
  vec2 behind = uCar.xy - uCar.zw * 1.8;
  gPud = max(gPud, smoothstep(3.6, 0.7, length(w - ahead)) * smoothstep(0.32, 0.55, gD.r));
  gPud = max(gPud, smoothstep(2.8, 0.5, length(w - behind)) * smoothstep(0.38, 0.6, gD.r));
  gPudR = max(smoothstep(-halfW * 1.35, halfW * 0.35, dP), gPud);
  diffuseColor.rgb *= gD.g * 1.25;
  diffuseColor.rgb *= mix(1.0, ${PD.darken.toFixed(3)}, gPud);
  gPudL = gPud;
  gLamp *= 1.0 - gPud;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(0.6 + 0.2 * gD.b, mix(${PD.roughEdge.toFixed(3)}, ${PD.rough.toFixed(3)}, gPud), gPudR);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(0.25, ${PD.metal.toFixed(3)}, gPud);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (gPud > 0.001) {
  // 水平湿地面：反射向量 R=(−Vx, Vy, −Vz)。只取环境图亮度，再涂回冰蓝/冷白。
  vec3 V = normalize(cameraPosition - vWp);
  vec3 R = vec3(-V.x, V.y, -V.z);
  vec2 euv = vec2(atan(R.z, R.x) * RECIPROCAL_PI2 + 0.5, asin(clamp(R.y, -1.0, 1.0)) * RECIPROCAL_PI + 0.5);
  vec3 ice = satCap(${ICE}, 0.5);
  vec3 wht = satCap(${WHITE}, 0.5);
  float fr = 0.55 + 1.15 * pow(1.0 - clamp(V.y, 0.0, 1.0), 2.0);
  vec2 rt = normalize(vec2(viewMatrix[0][0], viewMatrix[2][0]) + 1e-4);
  vec2 vh = vec2(-rt.y, rt.x);
  float mip = ${PD.mip.toFixed(2)};
  float envL = pudLum(texture2D(uEnv, euv, mip).rgb);
  if (uLook > 0.5) {
    envL += pudLum(texture2D(uEnv, euv + vec2(0.0, 0.022), mip).rgb);
    envL += pudLum(texture2D(uEnv, euv + vec2(0.0, 0.048), mip).rgb);
    envL += pudLum(texture2D(uEnv, euv - vec2(0.0, 0.014), mip).rgb);
    envL *= 0.25;
  }
  float horL = pudLum(texture2D(uEnv, vec2(euv.x, 0.54), mip + 0.35).rgb);
  envL = max(envL, horL * fr);
  float ripple = 1.0 - ${PD.streakK.toFixed(3)} + ${PD.streakK.toFixed(3)} * sin(dot(vWp.xz, vh) * ${PD.streakHz.toFixed(3)} + dot(vWp.xz, rt) * ${PD.phaseHz.toFixed(3)});
  vec2 headXZ = uCar.xy + uCar.zw * 1.05;
  vec2 tailXZ = uCar.xy - uCar.zw * 1.05;
  float hs = streak(mirrorHit(headXZ, 0.95), rt, vh, 4.6, 0.4);
  float ts = streak(mirrorHit(tailXZ, 1.02), rt, vh, 3.8, 0.48);
  vec3 refl = ice * ${PD.iceK.toFixed(3)};
  refl += mix(ice, wht, clamp(max(envL, gLit), 0.0, 1.0)) * envL * ${PD.envK.toFixed(3)};
  refl += (wht * hs * 1.5 + ice * ts * 0.95 + mix(ice, wht, 0.35) * lampStreak(rt, vh) * 0.8) * ${PD.lightK.toFixed(3)};
  refl *= gPud * ${PD.k.toFixed(3)} * fr * ripple;
  refl = satCap(refl, 0.5);
  refl.g = min(refl.g, max(refl.r, refl.b));
  float lookK = mix(${PD.lookLo.toFixed(3)}, 1.0, clamp(uLook, 0.0, 1.0));
  totalEmissiveRadiance += min(refl, vec3(${PD.cap.toFixed(3)})) * lookK;
}
${SPOT_EMIT}
${LAMP_EMIT}`)
  }
  m.customProgramCacheKey = () => 'asphaltPuddleV2'
  return m
}

/** 广场石材：极坐标 2m 分格（随半径自适应块数）+ 冰蓝线槽（每 4 块：r=8/16/24 环 + 16 条放射） */
export function makePlazaStone(R: number) {
  const m = new THREE.MeshStandardMaterial({ color: '#141C26', roughness: 0.55, metalness: 0.3 })
  if (AB.has('ground')) return m
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uR = { value: R }
    sh.uniforms.uCar = carSpotUniform
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWp; uniform float uR; float gGroove; vec3 gLamp; const float gPudL = 0.0; ${NOISE}
${FAKE_LAMP_GLSL}
${CAR_SPOT_GLSL}`)
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
  diffuseColor.rgb *= mix(0.88, 1.0, seam); // 缝对比压低，去网格感
  // 冰蓝线槽（宽 4cm）：每 4 块一条
  float ringD = abs(fract(r / 8.0 + 0.5) - 0.5) * 8.0;
  float radA = abs(fract(th / 6.2832 * 16.0 + 0.5) - 0.5) * (6.2832 * r / 16.0);
  float gd = min(ringD, radA);
  gGroove = (1.0 - smoothstep(0.025 - fw * 0.5, 0.025 + fw * 0.5, gd)) * clamp(0.04 / (2.0 * fw), 0.0, 1.0) * step(10.0, r) * step(r, uR - 1.5);
  diffuseColor.rgb *= 1.0 - gGroove * 0.12; // 线槽暗化减弱
  gLamp = fakeLamp(vWp);
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = 0.45 + 0.2 * vn(vWp.xz * 1.3);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += gGroove * vec3(0.31, 0.76, 0.97) * 0.06; // 再压，避免同心圆抢导向箭头
${LAMP_EMIT}
${SPOT_EMIT}`)
  }
  m.customProgramCacheKey = () => 'plazaStone3'
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
