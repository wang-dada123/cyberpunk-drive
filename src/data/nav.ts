/** 导航数据（美术定稿配色）：目的地主色、地标、路牌、出生点三向箭头 */
import { BRIDGE, TUNNEL } from './mapLayout'

export const NAV = {
  portfolio: { name: '作品街', color: '#00B0FF', sub: '#E8F4FF' },
  aiStall: { name: 'AI 摆摊', color: '#FFB74D' },
  hidden: { name: '彩蛋区', color: '#64FFDA' },
  alley: { name: '雨夜窄巷', color: '#4FC3F7' },
  bridge: { name: '天桥', color: '#E8F4FF' },
  tunnel: { name: '隧道', color: '#4FC3F7' },
} as const
export type NavId = keyof typeof NAV
const Q = Math.SQRT1_2
const TUN_IN: [number, number] = [-TUNNEL.R0 * Q, TUNNEL.R0 * Q]

/** 地标：目的地上空的发光光柱（emissive≈2.0，进 Bloom），超出远裁剪面时用压深度的远景版 */
export const LANDMARKS: Array<{ id: NavId; p: [number, number]; h: number; what: string }> = [
  { id: 'portfolio', p: [0, -205], h: 70, what: '作品街北端全息光柱 + 作品展墙' },
  { id: 'aiStall', p: [208, 0], h: 60, what: '东门牌坊上空琥珀光柱' },
  { id: 'hidden', p: [-208, 0], h: 60, what: '西门薄荷光柱' },
  { id: 'alley', p: [0, 208], h: 60, what: '窄巷尽头门上空冰蓝光柱' },
  { id: 'bridge', p: [BRIDGE.c[0], BRIDGE.c[1]], h: 34, what: '天桥中央冷白光柱' },
  { id: 'tunnel', p: TUN_IN, h: 26, what: '隧道口冰蓝光柱' },
]
export const landmarkOf = (id: NavId) => LANDMARKS.find((l) => l.id === id)!.p

export type SignLine = { id: NavId; arrow: 'up' | 'left' | 'right' }
/** 路牌：p 位置，rot 使牌面朝来车，lines 自上而下 */
export const SIGNPOSTS: Array<{ p: [number, number]; rot: number; lines: SignLine[] }> = [
  { p: [9, -34], rot: 0, lines: [{ id: 'portfolio', arrow: 'up' }] },
  { p: [34, 9], rot: -Math.PI / 2, lines: [{ id: 'aiStall', arrow: 'up' }] },
  { p: [-34, -9], rot: Math.PI / 2, lines: [{ id: 'hidden', arrow: 'up' }] },
  { p: [-9, 34], rot: Math.PI, lines: [{ id: 'alley', arrow: 'up' }] },
  { p: [Q * 36 + 5, -Q * 36 + 5], rot: -Math.PI / 4, lines: [{ id: 'bridge', arrow: 'up' }] },
  { p: [-Q * 36 - 5, Q * 36 - 5], rot: (3 * Math.PI) / 4, lines: [{ id: 'tunnel', arrow: 'up' }] },
  // r75 环路口
  { p: [9, -63], rot: 0, lines: [{ id: 'portfolio', arrow: 'up' }, { id: 'bridge', arrow: 'right' }, { id: 'hidden', arrow: 'left' }] },
  { p: [63, 9], rot: -Math.PI / 2, lines: [{ id: 'aiStall', arrow: 'up' }, { id: 'bridge', arrow: 'left' }, { id: 'alley', arrow: 'right' }] },
  { p: [-63, -9], rot: Math.PI / 2, lines: [{ id: 'hidden', arrow: 'up' }, { id: 'portfolio', arrow: 'right' }, { id: 'tunnel', arrow: 'left' }] },
  { p: [-9, 63], rot: Math.PI, lines: [{ id: 'alley', arrow: 'up' }, { id: 'tunnel', arrow: 'right' }, { id: 'aiStall', arrow: 'left' }] },
]

/** 出生点 [0,20] 朝北：三组流光箭头（中＝作品街，左＝彩蛋区，右＝AI 摆摊），只铺前方约 20m */
export const SPAWN_PATHS: Array<{ id: NavId; pts: [number, number][] }> = [
  { id: 'portfolio', pts: [[0, 16], [0, 8.5]] },
  { id: 'hidden', pts: [[-1.8, 16], [-7, 10], [-14, 6], [-20, 3]] },
  { id: 'aiStall', pts: [[1.8, 16], [7, 10], [14, 6], [20, 3]] },
]
/** 地面导向文字（平铺在路面） */
export const GROUND_LABELS: Array<{ id: NavId; p: [number, number]; yaw: number }> = [
  { id: 'portfolio', p: [0, 11], yaw: 0 },
  { id: 'hidden', p: [-9.5, 11.5], yaw: 0.5 },
  { id: 'aiStall', p: [9.5, 11.5], yaw: -0.5 },
]
