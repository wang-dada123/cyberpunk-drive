/** ⚠️ PLACEHOLDER 占位项目数据 —— 等 Carroll 提供真实作品后替换 */
export type Project = {
  id: string
  title: string
  description: string
  tags: string[]
  link?: string
  placeholder: true
}

const base = [
  ['Night Drift', 'Racing', 'UI'],
  ['Neon Alley', 'WebGL', 'R3F'],
  ['Rain OS', 'Design', 'UX'],
  ['Pulse Map', 'Data', 'Viz'],
  ['Ghost Shell', 'Three.js', 'Shader'],
  ['Ice Grid', 'Game', 'Physics'],
  ['Echo Chat', 'AI', 'React'],
  ['Cold Light', 'Brand', 'Motion'],
] as const

export const projects: Project[] = base.map(([title, a, b], i) => ({
  id: `placeholder-${i + 1}`,
  title: `${title} (placeholder)`,
  description: `占位项目 #${i + 1}：此处为项目简介示例文字，待替换为真实作品描述。`,
  tags: [a, b],
  placeholder: true,
}))
