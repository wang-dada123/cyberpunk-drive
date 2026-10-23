import { useCallback, useRef, useState } from 'react'
import { setMobileActive, setMobileInput } from '../hooks/useControls'

const SIZE = 120
const KNOB = 44
const MAX = (SIZE - KNOB) / 2

/**
 * 左下角虚拟摇杆占位：可见 UI，能驱动前进/转向。
 * 第 1 周手感先够用；后续可再调死区与灵敏度。
 */
export function MobileControls() {
  const baseRef = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const [visible, setVisible] = useState(false)

  const onPointer = useCallback((clientX: number, clientY: number) => {
    const el = baseRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let dx = clientX - cx
    let dy = clientY - cy
    const len = Math.hypot(dx, dy) || 1
    if (len > MAX) {
      dx = (dx / len) * MAX
      dy = (dy / len) * MAX
    }
    setKnob({ x: dx, y: dy })
    // y 负 = 前进，x 负 = 左转（与键盘 A 一致）
    setMobileInput(-dy / MAX, -dx / MAX)
  }, [])

  const end = useCallback(() => {
    setKnob({ x: 0, y: 0 })
    setMobileInput(0, 0)
    setMobileActive(false)
    setVisible(false)
  }, [])

  return (
    <div
      className="mobile-controls"
      onPointerDown={(e) => {
        // 仅在左半屏唤起，避免挡路
        if (e.clientX > window.innerWidth * 0.55) return
        setMobileActive(true)
        setVisible(true)
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        onPointer(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (!visible) return
        onPointer(e.clientX, e.clientY)
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        ref={baseRef}
        className={`joystick-base ${visible ? 'active' : ''}`}
        style={{ width: SIZE, height: SIZE }}
      >
        <div
          className="joystick-knob"
          style={{
            width: KNOB,
            height: KNOB,
            transform: `translate(${knob.x}px, ${knob.y}px)`,
          }}
        />
      </div>
      <p className="joystick-hint">触屏摇杆 · WASD / 方向键</p>
    </div>
  )
}
