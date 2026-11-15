import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import CrashScreen from '@/components/shared/CrashScreen'
import { keepTypingInView } from '@/lib/keyboard'
import { applyTextSize } from '@/lib/textSize'

keepTypingInView()
// The text size picked in Settings, before anything draws.
applyTextSize()

ReactDOM.createRoot(document.getElementById('root')).render(
  <CrashScreen>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </CrashScreen>
)