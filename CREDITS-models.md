# 模型来源

主街道具没有引入第三方网格。吧凳、桌、伞（锥面）、自行车、垃圾桶、货架、晾衣片、空调外机、栏杆、立管和电线，全部是 `src/components/mainStreetBuild.ts` 里的程序化几何（圆柱、锥面、斜板，不只是方盒），合进主街那一张网格。

楼体、阳台、天桥、钟柱、高架桁架、T5 塔、招牌壳体和全部文字也是自建。文字用 drei Text（SDF），字体 Orbitron / Noto Sans SC，随仓库分发。

车上的模型不在本轮范围内，仍是 Kenney Car Kit 的 `race-future.glb`（CC0），说明见 `README.md` 和 `public/models/KENNEY-LICENSE.txt`。
