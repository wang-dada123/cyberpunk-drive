/** 冰蓝雨巷 定稿色板（Carroll 已确认）。旧键名保留以兼容组件，值已映射为冰蓝/冷白 */
export const colors = {
  bg: '#050A14',
  iceBlue: '#4FC3F7',
  deepBlue: '#00B0FF',
  coldWhite: '#E8F4FF',
  orange: '#FFB74D',
  fog: '#0B1A2C',
  road: '#0A1220',
  ground: '#070D18',
  building: '#0E1824',
  carBody: '#1C2330',
  tail: '#FF2A2A',
} as const

export const bloom = {
  intensity: 0.8,
  threshold: 0.75,
  tail: '#FF2A2A',
} as const

export const fogDensity = 0.022 // 俯视远机位下由 0.035 下调，避免发闷

/** v1.1 分街区色调：冷蓝底不变，每区一个强调色（≤20% 画面） */
export const districts = {
  alley: { accent: '#4FC3F7', accent2: '#E8F4FF', fog: '#0B1A2C', ambient: '#1A2A40', hemiSky: '#12243A' },
  portfolio: { accent: '#E8F4FF', accent2: '#00B0FF', fog: '#102338', ambient: '#22344E', hemiSky: '#1A3050' },
  aiStall: { accent: '#FFB74D', accent2: '#4FC3F7', fog: '#141C2A', ambient: '#2A2A34', hemiSky: '#1E2636' },
  hidden: { accent: '#64FFDA', accent2: '#E8F4FF', fog: '#08201E', ambient: '#12302C', hemiSky: '#0E2A28' },
} as const
export type DistrictId = keyof typeof districts
