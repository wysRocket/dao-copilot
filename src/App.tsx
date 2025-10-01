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
import {markPerformance} from './utils/performance-profiler'
import {prewarmCriticalServices} from './utils/service-prewarming'

function AppContent() {
  const {windowState} = useWindowState()

  // Use assistant router for assistant windows, main router for others
  const currentRouter = windowState.windowType === 'assistant' ? assistantRouter : router

  useEffect(() => {
    // Mark when the main app content is ready
    markPerformance('app_content_mounted')
  }, [])

  return (
    <>
      <RouterProvider router={currentRouter} />
      {/* WebSocket diagnostics disabled for clean transcription interface */}
      {/* {shouldRenderComponent('websocket-diagnostics') && (
        <WebSocketDiagnosticsPanel
          isVisible={showDiagnostics}
          onToggle={() => setShowDiagnostics(prev => !prev)}
          showDetailed={true}
        />
      )} */}
    </>
  )
}

export default function App() {
  useEffect(() => {
    // Mark app start and initialize transcription event middleware
    markPerformance('transcription_middleware_init_start')
    const middleware = initializeTranscriptionEventMiddleware()
    markPerformance('transcription_middleware_init_complete')

    // Start pre-warming critical services immediately for faster startup
    prewarmCriticalServices()
      .then(results => {
        console.log('🚀 Service pre-warming completed:', results)
      })
      .catch(error => {
        console.warn('⚠️ Service pre-warming failed:', error)
      })

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
