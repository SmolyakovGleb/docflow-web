import { ErrorBoundary } from './ErrorBoundary'
import { AppRouter } from './router'
import { AuthBootstrap } from './auth/AuthBootstrap'
import { ToastViewport } from '@/shared/ui/Toast/setup'
import { MinViewportGuard } from '@/shared/ui/MinViewportGuard/MinViewportGuard'

function App() {
  return (
    <ErrorBoundary>
      <MinViewportGuard>
        <ToastViewport />
        <AuthBootstrap>
          <AppRouter />
        </AuthBootstrap>
      </MinViewportGuard>
    </ErrorBoundary>
  )
}

export default App
