import React, {useEffect} from 'react'
import {ThemeProvider} from './contexts/ThemeProvider'
import {GlassEffectsProvider} from './contexts/GlassEffectsProvider'
import {WindowStateProvider, useWindowState} from './contexts/WindowStateProvider'
import {MultiWindowProvider} from './contexts/MultiWindowContext'
import {PortalManagerProvider} from './components/portals/PortalManager'
import {router} from './routes/router'
import {assistantRouter} from './routes/router-assistant'
import {RouterProvider} from '@tanstack/react-router'
import {initializeTranscriptionEventMiddleware} from './middleware/TranscriptionEventMiddleware'

function AppContent() {
  const {windowState} = useWindowState()

  // Use assistant router for assistant windows, main router for others
  const currentRouter = windowState.windowType === 'assistant' ? assistantRouter : router

  return <RouterProvider router={currentRouter} />
}

export default function App() {
  useEffect(() => {
    // Initialize transcription event middleware on app startup
    const middleware = initializeTranscriptionEventMiddleware()

    // Cleanup on unmount
    return () => {
      middleware.destroy()
    }
  }, [])

  return (
    <ThemeProvider defaultMode="dark">
      <GlassEffectsProvider>
        <WindowStateProvider>
          <MultiWindowProvider>
            <PortalManagerProvider>
              <AppContent />
            </PortalManagerProvider>
          </MultiWindowProvider>
        </WindowStateProvider>
      </GlassEffectsProvider>
    </ThemeProvider>
  )
}
