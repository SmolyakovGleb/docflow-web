import { AppRouter } from './router'
import { AuthBootstrap } from './auth/AuthBootstrap'
import { ToastViewport } from '@/shared/ui/Toast/setup'
import { MinViewportGuard } from '@/shared/ui/MinViewportGuard/MinViewportGuard'

function App() {
  return (
    <MinViewportGuard>
      <ToastViewport />
      <AuthBootstrap>
        <AppRouter />
      </AuthBootstrap>
    </MinViewportGuard>
  )
}

export default App
