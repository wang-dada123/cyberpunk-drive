import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { NAV, SIGNPOSTS, LANDMARKS, GROUND_LABELS, landmarkOf, type NavId, type SignLine } from '../data/nav'

/**
 * 路牌（美术定稿）：横向长条，底 #0E1824 85%，左侧主色色条，1px #E8F4FF 30% 边框，圆角 2px；
 * 文字 #E8F4FF、箭头与距离用主色。全部路牌 + 立杆 + 出生点地面文字预烘到一张图集，合成 1 个 mesh = 1 draw call。
 * 亮度：材质整体 ×1.2 → 色条 ≈1.2（刚到 Bloom 阈值），文字/箭头在图集里按 0.8/1.2 绘制 ≈0.8（不糊光）。
 */
const CW = 512, CH = 96, COLS = 2, ROWS = 16
const K = 1.2, TXT = 0.8 / K
const FONT_ZH = '"NavSC", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'
const FONT_EN = '"NavOrbitron", "Orbitron", sans-serif'
let fontsP: Promise<unknown> | null = null
export function loadFonts() {
  if (fontsP) return fontsP
  const base = import.meta.env.BASE_URL + 'fonts/'
  const fs = [new FontFace('NavSC', `url(${base}nav-sc.woff)`, { weight: '500' }), new FontFace('NavOrbitron', `url(${base}nav-orbitron.woff)`, { weight: '600' })]
  fontsP = Promise.all(fs.map((f) => f.load().then((ff) => document.fonts.add(ff)).catch(() => null)))
  return fontsP
}
const scale = (hex: string, k: number) => { const c = new THREE.Color(hex); return `rgb(${(c.r * k * 255) | 0},${(c.g * k * 255) | 0},${(c.b * k * 255) | 0})` }
function arrow(g: CanvasRenderingContext2D, x: number, y: number, dir: SignLine['arrow'], col: string) {
  g.save(); g.translate(x, y); g.rotate(dir === 'up' ? 0 : dir === 'right' ? Math.PI / 2 : -Math.PI / 2)
  g.fillStyle = col; g.beginPath(); g.moveTo(0, -22); g.lineTo(18, 0); g.lineTo(7, 0); g.lineTo(7, 20); g.lineTo(-7, 20); g.lineTo(-7, 0); g.lineTo(-18, 0); g.closePath(); g.fill(); g.restore()
}
const dist = (p: [number, number], id: NavId) => { const q = landmarkOf(id); return Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 10) * 10 }

function buildAtlas() {
  const cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * ROWS
  const g = cv.getContext('2d')!
  let n = 0
  const cell = () => { const i = n++; return { x: (i % COLS) * CW, y: Math.floor(i / COLS) * CH, i } }
  // 0：立杆实色
  const solid = cell(); g.fillStyle = scale('#2A3A4E', 1 / K); g.fillRect(solid.x, solid.y, CW, CH)
  const signCells: number[][] = []
  for (const sp of SIGNPOSTS) {
    signCells.push(sp.lines.map((l) => {
      const c = cell(), col = NAV[l.id].color
      const x = c.x + 4, y = c.y + 4, w = CW - 8, h = CH - 8
      g.fillStyle = 'rgba(12,20,30,0.85)'; g.beginPath(); g.roundRect(x, y, w, h, 3); g.fill()
      g.strokeStyle = 'rgba(232,244,255,0.3)'; g.lineWidth = 2; g.stroke()
      g.fillStyle = col; g.fillRect(x, y, 12, h) // 6px@256 → 12px 图集
      arrow(g, x + 52, y + h / 2, l.arrow, scale(col, TXT))
      g.fillStyle = scale('#E8F4FF', TXT); g.font = `500 46px ${FONT_ZH}`; g.textBaseline = 'middle'; g.textAlign = 'left'
      g.fillText(NAV[l.id].name, x + 92, y + h / 2 + 2)
      g.fillStyle = scale(col, TXT); g.font = `600 34px ${FONT_EN}`; g.textAlign = 'right'
      g.fillText(`${dist(sp.p, l.id)}m`, x + w - 18, y + h / 2 + 2)
      return c.i
    }))
  }
  const groundCells = GROUND_LABELS.map((l) => {
    const c = cell(); g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = scale(NAV[l.id].color, TXT); g.font = `500 58px ${FONT_ZH}`; g.fillText(NAV[l.id].name, c.x + CW / 2, c.y + CH / 2 + 2)
    return c.i
  })
  return { cv, solid: solid.i, signCells, groundCells }
}

function buildGeo(a: ReturnType<typeof buildAtlas>) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  const quad = (cellI: number, pts: THREE.Vector3[], inset = 0) => {
    const u0 = ((cellI % COLS) * CW + inset) / (CW * COLS), u1 = ((cellI % COLS + 1) * CW - inset) / (CW * COLS)
    const v1 = 1 - (Math.floor(cellI / COLS) * CH + inset) / (CH * ROWS), v0 = 1 - ((Math.floor(cellI / COLS) + 1) * CH - inset) / (CH * ROWS)
    const b = pos.length / 3
    pts.forEach((p) => pos.push(p.x, p.y, p.z)); uv.push(u0, v0, u1, v0, u1, v1, u0, v1)
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  }
  const m = new THREE.Matrix4(), v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m)
  const BW = 4.2, BH = 0.8, GAP = 0.1
  SIGNPOSTS.forEach((sp, si) => {
    m.makeRotationY(sp.rot).setPosition(sp.p[0], 0, sp.p[1])
    const n = sp.lines.length, top = 3.4 + n * (BH + GAP)
    // 立杆（十字两片）
    const pw = 0.07
    quad(a.solid, [v(-pw, 0, 0), v(pw, 0, 0), v(pw, top + 0.1, 0), v(-pw, top + 0.1, 0)], 8)
    quad(a.solid, [v(0, 0, -pw), v(0, 0, pw), v(0, top + 0.1, pw), v(0, top + 0.1, -pw)], 8)
    a.signCells[si].forEach((ci, k) => {
      const y1 = top - k * (BH + GAP), y0 = y1 - BH, z = 0.09
      quad(ci, [v(-BW / 2 - 1.6, y0, z), v(BW / 2 - 1.6, y0, z), v(BW / 2 - 1.6, y1, z), v(-BW / 2 - 1.6, y1, z)])
    })
  })
  GROUND_LABELS.forEach((l, i) => {
    m.makeRotationY(l.yaw).setPosition(l.p[0], 0.065, l.p[1])
    const w = 5.0, h = 3.2 // 文字朝向车（从 +Z 往 -Z 看）
    quad(a.groundCells[i], [v(-w / 2, 0, h / 2), v(w / 2, 0, h / 2), v(w / 2, 0, -h / 2), v(-w / 2, 0, -h / 2)])
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx); geo.computeBoundingSphere()
  return geo
}

export function Signposts() {
  const [atlas, setAtlas] = useState<ReturnType<typeof buildAtlas> | null>(null)
  useEffect(() => { let ok = true; loadFonts().then(() => ok && setAtlas(buildAtlas())); return () => { ok = false } }, [])
  const res = useMemo(() => {
    if (!atlas) return null
    const tex = new THREE.CanvasTexture(atlas.cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false, alphaTest: 0.02 })
    mat.color.setScalar(K)
    return { geo: buildGeo(atlas), mat }
  }, [atlas])
  if (!res) return null
  return <mesh geometry={res.geo} material={res.mat} renderOrder={2} />
}

/** 地标光柱：主色 ×2.0 自发光；顶点着色器把超出远裁剪面的顶点压回 far 之内＝便宜的远景版（同一个 mesh，不另建 LOD）。1 draw call。 */
export function LandmarkBeacons() {
  const { geo, mat } = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0)
    const g = new THREE.InstancedBufferGeometry()
    g.index = box.index; g.setAttribute('position', box.getAttribute('position'))
    const off: number[] = [], scl: number[] = [], col: number[] = []
    const c = new THREE.Color()
    for (const l of LANDMARKS) {
      c.set(NAV[l.id].color)
      off.push(l.p[0], 0, l.p[1]); scl.push(1.1, l.h, 1.1); col.push(c.r, c.g, c.b, 1) // 光柱
      off.push(l.p[0], l.h, l.p[1]); scl.push(5, 0.5, 5); col.push(c.r, c.g, c.b, 2) // 顶部光环
    }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(off), 3))
    g.setAttribute('aScl', new THREE.InstancedBufferAttribute(new Float32Array(scl), 3))
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(new Float32Array(col), 4))
    g.instanceCount = LANDMARKS.length * 2
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aOff, aScl; attribute vec4 aCol; varying vec4 vC; varying float vY;
        void main(){ vC = aCol; vY = position.y;
          vec4 p = projectionMatrix * viewMatrix * vec4(position * aScl + aOff, 1.0);
          p.z = min(p.z, p.w * 0.99995); gl_Position = p; }`,
      fragmentShader: `varying vec4 vC; varying float vY;
        void main(){ float a = vC.a > 1.5 ? 1.0 : mix(0.85, 0.18, vY); gl_FragColor = vec4(vC.rgb * 2.0 * a, a); }`,
    })
    return { geo: g, mat: m }
  }, [])
  return <mesh geometry={geo} material={mat} frustumCulled={false} />
}
