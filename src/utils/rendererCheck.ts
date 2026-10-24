import type { WebGLRenderer } from 'three'

/** 读取 UNMASKED_RENDERER；软件渲染时页面顶部居中显示可关闭提示 */
export const rendererInfo = { name: 'unknown', software: false }
const SOFT = /swiftshader|llvmpipe|basic render|microsoft basic|softpipe/i

export function detectRenderer(gl: WebGLRenderer) {
  try {
    const ctx = gl.getContext()
    const ext = ctx.getExtension('WEBGL_debug_renderer_info')
    rendererInfo.name = String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER))
  } catch { /* 部分浏览器禁用该扩展 */ }
  rendererInfo.software = SOFT.test(rendererInfo.name)
  // ?shot：验收截图模式，不显示提示条
  if (new URLSearchParams(location.search).has('shot')) return
  if (!rendererInfo.software || document.getElementById('hw-accel-tip')) return
  const bar = document.createElement('div')
  bar.id = 'hw-accel-tip'
  Object.assign(bar.style, { position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: '50',
    maxWidth: '92vw', padding: '8px 36px 8px 14px', background: 'rgba(40,20,6,0.92)', color: '#ffd9a8',
    border: '1px solid #ff9f43', borderRadius: '8px', font: '13px/1.5 system-ui, sans-serif' })
  bar.textContent = '检测到软件渲染，硬件加速可能被关闭：请在 edge://settings/system 打开“使用图形加速（如可用）”并重启浏览器。'
  const x = document.createElement('button')
  x.textContent = '×'; x.setAttribute('aria-label', '关闭提示')
  Object.assign(x.style, { position: 'absolute', right: '8px', top: '4px', background: 'none', border: 'none', color: '#ffd9a8', fontSize: '18px', cursor: 'pointer' })
  x.onclick = () => bar.remove()
  bar.appendChild(x); document.body.appendChild(bar)
}
