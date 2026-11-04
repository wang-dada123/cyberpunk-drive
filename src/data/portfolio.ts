/**
 * 作品集卡片 v1 内容 —— 全部是【占位】文案，等 Carroll 提供真实项目后逐条替换。
 * 下标 = 作品街光点序号（LIGHTS[i]）。link 为 '#' 表示占位链接，不跳转。
 */
export type PortfolioItem = {
  title: string
  summary: string
  stack: string[]
  link: string
  linkLabel: string
  placeholder: boolean
}

export const PORTFOLIO: PortfolioItem[] = Array.from({ length: 8 }, (_, i) => ({
  title: `【占位】项目 ${i + 1} · 项目名待 Carroll 提供`,
  summary: '【占位】一句话简介待 Carroll 提供。',
  stack: ['【占位】技术栈待定'],
  link: '#',
  linkLabel: '【占位】链接待提供',
  placeholder: true,
}))
