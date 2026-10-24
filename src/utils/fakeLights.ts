import * as THREE from 'three'
import { colors, districts } from '../theme/colors'
import { AB } from './tier'

/** 场景 6 盏"灯"（v3.2）：不再是 three PointLight（每个受光材质每片元 6 次 GGX）。
 *  只在地面着色器里以自发光方式加"光斑"（FAKE_LAMP_GLSL）；建筑/车辆靠自身 emissive 与环境光。 */
export const LAMPS: Array<[number, number, number, string, number, number]> = [
  [0, 6, 14, colors.iceBlue, 1.0, 22], // 广场 / 出生点
  [0, 5, -50, districts.portfolio.accent2, 0.9, 20], // 作品街
  [60, 4, 0, districts.aiStall.accent, 1.0, 20], // AI 摊位
  [-60, 4, 0, districts.hidden.accent, 0.8, 18], // 彩蛋区
  [0, 4, 112, colors.iceBlue, 0.9, 14], // 雨夜窄巷
  [0, 8, 140, colors.iceBlue, 1.2, 18], // 窄巷尽头门
]
export const REAL_LIGHTS = AB.has('reallights') // DEV 对照：?ab=reallights 用回真点光源

const f = (n: number) => n.toFixed(4)
const P = LAMPS.map(([x, y, z]) => `vec3(${f(x)},${f(y)},${f(z)})`).join(',')
const C = LAMPS.map(([, , , c, i]) => { const k = new THREE.Color(c).multiplyScalar(i); return `vec3(${f(k.r)},${f(k.g)},${f(k.b)})` }).join(',')
const D = LAMPS.map((l) => f(l[5])).join(',')
/** 地面假光：返回朝上表面处的辐照度（与 PointLight decay=2 + cutoff 衰减、N·L 一致），无分支、无 uniform。
 *  用法：totalEmissiveRadiance += diffuse * fakeLamp(wp) * RECIPROCAL_PI（＝Lambert 漫反射，以自发光方式加入）。 */
export const FAKE_LAMP_GLSL = /* glsl */ `
const vec3 FL_P[6] = vec3[6](${P});
const vec3 FL_C[6] = vec3[6](${C});
const float FL_D[6] = float[6](${D});
vec3 fakeLamp(vec3 wp) {
  vec3 e = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    vec3 q = FL_P[i] - wp; float d2 = dot(q, q);
    float w = saturate(1.0 - d2 * d2 / (FL_D[i] * FL_D[i] * FL_D[i] * FL_D[i]));
    e += FL_C[i] * (w * w * max(q.y, 0.0) / (d2 * sqrt(d2) + 0.01));
  }
  return e;
}
`
