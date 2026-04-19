import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './i18n'
import './styles/globals.css'
import { queryClient } from '@/lib/queryClient'
import { DialogProvider } from '@/components/ui/Dialog'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <DialogProvider>
        <App />
      </DialogProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
