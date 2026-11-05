import { useEffect, useState, type ReactNode } from 'react'
import { loadBrushFont } from '../utils/brushFont'
import type { Exhibit } from '../data/exhibits'

/** 云纹角饰（SVG 自绘）：L 形双线 + 卷云。四角用 CSS 翻转复用。 */
function Corner({ c }: { c: string }) {
  return (
    <svg className={`fx-corner ${c}`} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M2 38 V10 Q2 2 10 2 H38" />
      <path className="thin" d="M7 38 V13 Q7 7 13 7 H38" />
      <path d="M13 22 a5 5 0 1 1 5 -5 a2.6 2.6 0 1 0 -2.6 2.6" />
      <path className="thin" d="M22 13 q4 -4 8 0 M13 22 q-4 4 0 8" />
      <circle cx="31" cy="7" r="1.6" /><circle cx="7" cy="31" r="1.6" />
    </svg>
  )
}

/** 凡人展品卡正文：上半配图（开卡才加载）+ 暗色渐变 + 书法片名；底部版权小字。 */
export function ExhibitView({ ex, head, onClose, children }: { ex: Exhibit; head: ReactNode; onClose: () => void; children?: ReactNode }) {
  const [ok, setOk] = useState(false)
  useEffect(() => { loadBrushFont() }, [])
  return (
    <>
      <Corner c="tl" /><Corner c="tr" /><Corner c="bl" /><Corner c="br" />
      <div className={ex.light ? 'fx-hero light' : 'fx-hero'}>
        <img src={ex.img} alt="" loading="lazy" decoding="async" style={{ objectPosition: ex.focus }} className={ok ? 'on' : ''} onLoad={() => setOk(true)} draggable={false} />
        <div className="fx-shade" />
        <div className="fx-top">
          <span className="fx-tag">{head}</span>
          <button className="lc-close" onPointerDown={(e) => { e.stopPropagation(); onClose() }} onClick={onClose} aria-label="关闭作品卡片" tabIndex={-1}>关闭 ✕</button>
        </div>
        <div className="fx-titles">
          <div className="fx-series">《{ex.series}》</div>
          <div className="fx-title" style={{ ['--n' as string]: [...ex.title].length }}>{ex.title}</div>
        </div>
      </div>
      <div className="fx-body">
        <div className="fx-desc"><span className="fx-kind">{ex.kind}</span>{ex.summary}</div>
        {children}
        <div className="fx-copy">图片版权归原作者</div>
      </div>
    </>
  )
}
