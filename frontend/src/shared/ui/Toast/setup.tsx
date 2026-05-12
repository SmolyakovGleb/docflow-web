import { Toaster } from 'sonner'
import './toast.css'

export function ToastViewport() {
  return (
    <Toaster
      theme="dark"
      position="top-right"
      toastOptions={{
        classNames: {
          toast: 'docflow-toast',
          title: 'docflow-toast-title',
          description: 'docflow-toast-description',
          actionButton: 'docflow-toast-action',
          cancelButton: 'docflow-toast-cancel',
        },
      }}
    />
  )
}
