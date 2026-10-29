import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import CrashScreen from '@/components/shared/CrashScreen'

ReactDOM.createRoot(document.getElementById('root')).render(
  <CrashScreen>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </CrashScreen>
)