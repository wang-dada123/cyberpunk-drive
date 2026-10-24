import { Scene } from './components/Scene'
import { MobileControls } from './components/MobileControls'
import { Minimap } from './components/Minimap'
import { PortfolioOverlay } from './components/PortfolioStreet'
import { useKeyboardControls } from './hooks/useControls'

export default function App() {
  useKeyboardControls()

  return (
    <div className="app">
      <Scene />
      <MobileControls />
      <PortfolioOverlay />
      <Minimap />
      <div className="hud">
        <h1>赛博车 · Demo</h1>
        <p>WASD / 方向键驾驶 · 触屏左半区摇杆</p>
      </div>
    </div>
  )
}
