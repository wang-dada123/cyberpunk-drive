/** URL 开关：?debug 显示 FPS；?hq 开启湿地面实时反射（默认关，省 GPU） */
const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
export const DEBUG = q.has('debug')
export const HIGH_QUALITY = q.has('hq')
