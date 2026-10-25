import * as THREE from 'three'

/** v3.3 美术定稿参数（易调常量集中于此） */
export const LOOK = {
  car: {
    paint: '#2A3444', metalness: 0.8, roughness: 0.3, envMapIntensity: 1.2,
    waist: '#4FC3F7', waistK: 1.5, waistH: 0.03,
    front: '#E8F4FF', frontK: 2.0,
    tail: '#00B0FF', tailK: 1.5,
    beam: { color: '#CFE8FF', len: 8, r0: 0.25, r1: 1.8, a0: 0.18 },
    spot: { color: '#CFE8FF', near: 2, far: 8, width: 3, k: 0.35, gain: 0.2, pudGain: 1.0 }, // 中心亮度 k；gain=地面响应（漫反射路面），水洼处 pudGain
    under: { color: '#4FC3F7', w: 1.6, l: 2.6, a: 0.35 },
  },
  puddle: {
    thrDark: 0.69, // 暗处/路中阈值（噪声高于阈值才是水；越高越少）→ 约 10%
    thrLit: 0.65, // 路边 + 灯下阈值 → 约 15%；综合覆盖率 ≈12%
    darken: 0.5, // 水面底色压暗，形成“暗镜面”轮廓
    rough: 0.02, roughEdge: 0.3,
    k: 0.55, // 水洼区伪反射总强度（0.5–0.6）
    envK: 0.9, streakK: 0.75, streakStretch: 1.75, // b4 拖影减半（GroundFX 纵向频率 ×2）
    ice: '#4FC3F7', iceK: 0.09, // 冰蓝低强度伪反射底色（路灯/招牌）
    cap: 0.3, // 单通道上限，防白斑
  },
}

/** 预烘霓虹城市环境图（512×256 等距柱状，启动时 Canvas 画一次）：冷蓝底 + 冰蓝/冷白光带，无品红 */
function drawNeonEnv() {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#03060C'); sky.addColorStop(0.42, '#0B1626'); sky.addColorStop(0.5, '#12233A'); sky.addColorStop(0.58, '#070D17'); sky.addColorStop(1, '#020408')
  g.fillStyle = sky; g.fillRect(0, 0, W, H)
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  // 楼体剪影 + 窗格
  for (let x = 0; x < W; ) {
    const bw = 10 + rnd() * 26, top = H * (0.22 + rnd() * 0.22)
    g.fillStyle = '#060B13'; g.fillRect(x, top, bw, H * 0.5 - top)
    for (let y = top + 4; y < H * 0.5 - 3; y += 5) for (let xx = x + 2; xx < x + bw - 2; xx += 4) if (rnd() < 0.22) { g.fillStyle = rnd() < 0.7 ? '#2A5C80' : '#7FB8D8'; g.fillRect(xx, y, 2, 2) }
    if (rnd() < 0.35) { g.fillStyle = rnd() < 0.6 ? '#4FC3F7' : '#E8F4FF'; g.fillRect(x + bw * 0.4, top + 6, 2, (H * 0.5 - top) * 0.6) } // 竖招牌
    x += bw + 1
  }
  // 水平光带（地平线附近）
  const band = (y: number, h: number, col: string, a: number) => { g.globalAlpha = a; g.fillStyle = col; g.fillRect(0, y, W, h); g.globalAlpha = 1 }
  band(H * 0.46, 4, '#4FC3F7', 1); band(H * 0.5, 3, '#E8F4FF', 0.95); band(H * 0.36, 2, '#4FC3F7', 0.7); band(H * 0.28, 2, '#E8F4FF', 0.6); band(H * 0.15, 3, '#4FC3F7', 0.45)
  // 顶部柔光
  const top = g.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 0.5); top.addColorStop(0, 'rgba(150,200,240,0.25)'); top.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = top; g.fillRect(0, 0, W, H * 0.5)
  return c
}
export const neonEnvTex = new THREE.CanvasTexture(drawNeonEnv())
neonEnvTex.mapping = THREE.EquirectangularReflectionMapping
neonEnvTex.colorSpace = THREE.SRGBColorSpace
neonEnvTex.wrapS = THREE.RepeatWrapping

let pmrem: THREE.Texture | null = null
/** 车漆用 PMREM（只生成一次，非实时 CubeCamera） */
export function neonEnvPMREM(gl: THREE.WebGLRenderer) {
  if (!pmrem) { const g = new THREE.PMREMGenerator(gl); pmrem = g.fromEquirectangular(neonEnvTex).texture; g.dispose() }
  return pmrem
}

/** 车 → 地面头灯光斑共享 uniform：xy=车位置 xz，zw=车头朝向 xz */
export const carSpotUniform = { value: new THREE.Vector4(0, 0, 0, -1) }
