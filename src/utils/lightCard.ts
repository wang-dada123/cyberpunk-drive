/** 光点作品卡片状态：碰到光点 i 弹出；关闭后离开该光点 12m 才会再次弹出。 */
const subs = new Set<() => void>()
let cur: number | null = null
let muted: number | null = null

export const getCard = () => cur
export function subscribeCard(fn: () => void) { subs.add(fn); return () => { subs.delete(fn) } }
function set(v: number | null) { if (v === cur) return; cur = v; subs.forEach((f) => f()) }

/** 每个物理步调用：near = 当前碰到的光点（-1 无），dist2 = 到上次弹出光点的距离平方 */
export function tickCard(near: number, farFrom: (i: number) => number) {
  if (muted !== null && farFrom(muted) > 144) muted = null
  if (cur !== null && farFrom(cur) > 625) set(null)
  if (near >= 0 && near !== cur && near !== muted) set(near)
}
export function closeCard() { if (cur !== null) muted = cur; set(null) }
