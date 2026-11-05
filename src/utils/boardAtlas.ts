/** 凡人灯箱正面图集的布局常量（运行时与离线烘焙共用）。8 个展品各占一格，4×2 格；12 块灯箱按 i % 8 取格。 */
export const ATL_S = 112 // px / m
export const FACE_W = 3, FACE_H = 4.5 // 与 PortfolioStreet 的 BOARD_W / BOARD_H 一致
export const CW = Math.ceil(FACE_W * ATL_S), CH = Math.ceil(FACE_H * ATL_S) // 336×504 / 格
export const COLS = 4, ROWS = 2 // 图集 1344×1008
export const ATLAS_URL = `${import.meta.env.BASE_URL}exhibits/fanren-atlas.webp`
