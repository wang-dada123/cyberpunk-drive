import { EMPTY_PROGRESS, type Progress } from '../data/gadgets'

const KEY = 'cyberpunk-drive.v4.progress'

const subs = new Set<() => void>()
let cur: Progress = readStorage()

function readStorage(): Progress {
  if (typeof localStorage === 'undefined') return { ...EMPTY_PROGRESS }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY_PROGRESS }
    const o = JSON.parse(raw) as Partial<Progress>
    return {
      lights: o.lights ?? 0,
      stalls: o.stalls ?? 0,
      gate: o.gate ? 1 : 0,
      e8: o.e8 ? 1 : 0,
      s2: o.s2 ? 1 : 0,
      port: o.port ? 1 : 0,
    }
  } catch {
    return { ...EMPTY_PROGRESS }
  }
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cur))
  } catch {
    /* 无存储时只留在内存 */
  }
}

export function getProgress() {
  return cur
}

export function subscribeProgress(fn: () => void) {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

export function setProgress(next: Progress) {
  if (next === cur) return
  cur = next
  write()
  subs.forEach((fn) => fn())
}

export function resetProgress() {
  cur = { ...EMPTY_PROGRESS }
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  subs.forEach((fn) => fn())
}
