import { DevShowcasePage } from '../pages/DevShowcasePage'
import { MinViewportGuard } from '../shared/ui/MinViewportGuard/MinViewportGuard'
import { ToastViewport } from '../shared/ui/Toast/setup'

function App() {
  return (
    <MinViewportGuard>
      <ToastViewport />
      <DevShowcasePage />
    </MinViewportGuard>
  )
}

export default App
