/** URL 开关：?debug 显示 FPS；?hq 开启湿地面实时反射（默认关，省 GPU） */
const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
export const DEBUG = q.has('debug')
export const HIGH_QUALITY = q.has('hq')
/** 檐下巷验收机位。?shot=a 锁在效果图那种低机位，车停在镜头前。 */
export const SHOT_A = q.get('shot') === 'a'
export const SHOT_A_CAM = { pos: [0.15, 1.55, 23.2] as [number, number, number], look: [0, 4.5, 56] as [number, number, number], fov: 46, carZ: 31 }
