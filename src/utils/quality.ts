/** URL 开关：?debug 显示 FPS；?hq 开启湿地面实时反射（默认关，省 GPU） */
const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
export const DEBUG = q.has('debug')
export const HIGH_QUALITY = q.has('hq')
/** 檐下巷验收机位。?shot=a 把车停住，相机在车后 4.5m、高 1.2m。 */
export const SHOT_A = q.get('shot') === 'a'
export const SHOT_A_CAM = {
  carZ: 31,
  back: 4.5,
  height: 1.2,
  /** 水平 52° 换算成 three 的垂直 fov（16:9），车宽约落到画面 22–26%。 */
  fov: 30.6,
  lookAhead: 25,
  pitch: -4 * Math.PI / 180,
}
/** ?reflect=0 关实时反射，?reflect=1 强制开。默认：手机 / 低档 / 软件渲染关。 */
export const REFLECT = q.get('reflect') === '0' ? 'off' : q.get('reflect') === '1' ? 'on' : 'auto'
/** ?expo=1.05 只给云端截图临时加曝光。默认 0.95。 */
export const EXPO = (() => {
  const n = Number(q.get('expo'))
  return Number.isFinite(n) && n > 0 ? n : 0.95
})()
