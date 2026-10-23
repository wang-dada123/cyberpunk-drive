import { useEffect } from 'react'

export type DriveInput = {
  forward: number
  turn: number
}

/** 共享驾驶输入：键盘 + 手机摇杆都写这里 */
const input: DriveInput = { forward: 0, turn: 0 }

export function setMobileInput(forward: number, turn: number) {
  input.forward = clamp(forward, -1, 1)
  input.turn = clamp(turn, -1, 1)
}

export function getDriveInput(): DriveInput {
  return input
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

const keys = new Set<string>()
let mobileActive = false

function syncFromKeyboard() {
  let forward = 0
  let turn = 0
  if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) turn += 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) turn -= 1
  if (!mobileActive) {
    input.forward = forward
    input.turn = turn
  }
}

export function setMobileActive(active: boolean) {
  mobileActive = active
  if (!active) syncFromKeyboard()
}

export function useKeyboardControls() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.add(e.code)
      syncFromKeyboard()
    }
    const up = (e: KeyboardEvent) => {
      keys.delete(e.code)
      syncFromKeyboard()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
}
