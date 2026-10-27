import { RAMPS, type Ramp } from './expansionLayout'

/**
 * 匝道碰撞：一条焊过的坡面（法线朝上，交给 FIX_INTERNAL_EDGES），
 * 护栏另条、不带这个旗，两面都能挡。坡口边缘埋进地面，没有立着的端盖。
 */
export type Tris = { v: Float32Array; i: Uint32Array }

const SIDES = [-1, -0.82, -0.68, 0, 0.68, 0.82, 1]

function weld(pos: number[], idx: number[], flip: boolean): Tris {
  const map = new Map<string, number>()
  const np: number[] = []
  const remap: number[] = []
  for (let i = 0; i < pos.length; i += 3) {
    const k = `${Math.round(pos[i] * 1000)},${Math.round(pos[i + 1] * 1000)},${Math.round(pos[i + 2] * 1000)}`
    let j = map.get(k)
    if (j === undefined) { j = np.length / 3; map.set(k, j); np.push(pos[i], pos[i + 1], pos[i + 2]) }
    remap.push(j)
  }
  const ii = idx.map((k) => remap[k])
  if (flip) for (let t = 0; t < ii.length; t += 3) { const s = ii[t + 1]; ii[t + 1] = ii[t + 2]; ii[t + 2] = s }
  return { v: new Float32Array(np), i: new Uint32Array(ii) }
}

function crossY(pos: number[], idx: number[]) {
  let y = 0
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    const abx = pos[b] - pos[a], abz = pos[b + 2] - pos[a + 2]
    const acx = pos[c] - pos[a], acz = pos[c + 2] - pos[a + 2]
    y += abz * acx - abx * acz
  }
  return y
}

function row(f: Ramp['frames'][number], hw: number, lift: number, bury: boolean) {
  const out: number[][] = []
  for (const s of SIDES) {
    let y = f.y + lift
    const a = Math.abs(s)
    if (bury && a > 0.68) {
      const k = Math.min(1, (a - 0.68) / 0.32)
      y = y * (1 - k) + (-0.18) * k
    }
    out.push([f.x + f.px * s * hw, y, f.z + f.pz * s * hw])
  }
  return out
}

export function rampCollider(ramp: Ramp): { deck: Tris; wall: Tris } {
  const { frames, halfW, lip } = ramp
  const pos: number[] = []
  const idx: number[] = []
  const across = SIDES.length
  const base = 0
  const rows = frames.map((f, i) => {
    const lift = i < lip ? 0 : Math.min(1, (i - lip + 1) / 3) * 0.03
    return row(f, halfW[i], lift, f.y < 0.35)
  })
  for (const r of rows) for (const p of r) pos.push(p[0], p[1], p[2])
  for (let i = 0; i < rows.length - 1; i++) {
    for (let s = 0; s < across - 1; s++) {
      const k = base + i * across + s
      const n = k + across
      idx.push(k, n, k + 1, n, n + 1, k + 1)
    }
  }
  const deck = weld(pos, idx, crossY(pos, idx) < 0)

  const wpos: number[] = []
  const widx: number[] = []
  const wallAt = frames.findIndex((f) => f.y > 0.5)
  const wallEnd = lip
  if (wallAt >= 0 && wallEnd - wallAt >= 2) {
    for (const side of [-1, 1]) {
      const a: number[][] = []
      const b: number[][] = []
      for (let i = wallAt; i <= wallEnd; i++) {
        const f = frames[i]
        const u = (i - wallAt) / Math.max(1, wallEnd - wallAt)
        const grow = Math.min(1, (i - wallAt + 1) / 5)
        const tail = u > 0.8 ? Math.max(0.2, (1 - u) / 0.2) : 1
        const hw = halfW[i] + 0.15
        const x = f.x + f.px * side * hw
        const z = f.z + f.pz * side * hw
        const top = f.y + 0.1 + 0.8 * grow * tail
        a.push([x, f.y + 0.02, z])
        b.push([x, top, z])
      }
      const wb = wpos.length / 3
      for (let i = 0; i < a.length; i++) wpos.push(a[i][0], a[i][1], a[i][2], b[i][0], b[i][1], b[i][2])
      for (let i = 0; i < a.length - 1; i++) {
        const k = wb + i * 2
        widx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
      }
    }
  }
  const wall = weld(wpos, widx, false)
  return { deck, wall }
}

export function allRampColliders() {
  return RAMPS.map(rampCollider)
}

/** #7EBFDA：(max-min)/max = 0.422，低于 0.5。门框和箭头同色，合成一个网格。 */
export const GUIDE_HEX = '#7EBFDA'

function pushTri(pos: number[], idx: number[], a: number[], b: number[], c: number[]) {
  const k = pos.length / 3
  pos.push(...a, ...b, ...c)
  idx.push(k, k + 1, k + 2)
}

function pushBox(pos: number[], idx: number[], c: number[], ax: number[], ay: number[], az: number[], s: number[]) {
  const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2
  const p = (x: number, y: number, z: number) => [
    c[0] + ax[0] * x + ay[0] * y + az[0] * z,
    c[1] + ax[1] * x + ay[1] * y + az[1] * z,
    c[2] + ax[2] * x + ay[2] * y + az[2] * z,
  ]
  const v = [
    p(-hx, -hy, -hz), p(hx, -hy, -hz), p(hx, hy, -hz), p(-hx, hy, -hz),
    p(-hx, -hy, hz), p(hx, -hy, hz), p(hx, hy, hz), p(-hx, hy, hz),
  ]
  const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]
  for (const f of faces) {
    pushTri(pos, idx, v[f[0]], v[f[1]], v[f[2]])
    pushTri(pos, idx, v[f[0]], v[f[2]], v[f[3]])
  }
}

/** 四条坡口的地面箭头 + 门框灯牌，一个几何，调用方用同一材质画一次。 */
export function rampGuideMesh() {
  const pos: number[] = []
  const idx: number[] = []
  const up = [0, 1, 0]
  for (const ramp of RAMPS) {
    const fs = ramp.frames
    const mouth = fs[ramp.mouth]
    const tx = mouth.tx, tz = mouth.tz
    const px = mouth.px, pz = mouth.pz
    // 贴地段上 4 个尖朝坡上的箭头
    const arrows = fs.map((f, i) => ({ f, i })).filter(({ f, i }) => i <= ramp.mouth && f.y > -0.02 && Math.hypot(f.x, f.z) > 214 && Math.hypot(f.x, f.z) < 229)
    const pick = arrows.length ? [0, 0.33, 0.66, 0.95].map((u) => arrows[Math.min(arrows.length - 1, Math.round(u * (arrows.length - 1)))]) : []
    for (const { f } of pick) {
      if (!f) continue
      const yawX = f.tx, yawZ = f.tz
      const tip = [f.x + yawX * 0.7, 0.1, f.z + yawZ * 0.7]
      const left = [f.x - yawX * 0.35 + f.px * 0.42, 0.1, f.z - yawZ * 0.35 + f.pz * 0.42]
      const right = [f.x - yawX * 0.35 - f.px * 0.42, 0.1, f.z - yawZ * 0.35 - f.pz * 0.42]
      const notch = [f.x - yawX * 0.05, 0.1, f.z - yawZ * 0.05]
      pushTri(pos, idx, tip, right, notch)
      pushTri(pos, idx, tip, notch, left)
    }
    const gap = ramp.halfW[ramp.mouth] * 2 + 1.6
    const hw = gap / 2
    const cL = [mouth.x + px * hw, 1.7, mouth.z + pz * hw]
    const cR = [mouth.x - px * hw, 1.7, mouth.z - pz * hw]
    const ax = [px, 0, pz]
    const az = [tx, 0, tz]
    pushBox(pos, idx, cL, ax, up, az, [0.16, 3.2, 0.16])
    pushBox(pos, idx, cR, ax, up, az, [0.16, 3.2, 0.16])
    pushBox(pos, idx, [mouth.x, 3.28, mouth.z], ax, up, az, [gap + 0.16, 0.14, 0.16])
    pushBox(pos, idx, [mouth.x + tx * 0.2, 0.09, mouth.z + tz * 0.2], ax, up, az, [gap - 1.4, 0.045, 0.28])
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) }
}
