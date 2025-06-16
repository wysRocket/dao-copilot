import React, {useEffect, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {syncThemeWithLocal} from './helpers/theme_helpers'
import {EnhancedHomePage} from './pages/EnhancedHomePage'

import {router} from './routes/router'
import {RouterProvider} from '@tanstack/react-router'
import {PortalManagerProvider} from './components/portals/PortalManager'
import {WindowRenderer} from './components/portals/WindowRenderer'
import {MultiWindowProvider} from './contexts/MultiWindowContext'
import {WindowStateProvider} from './contexts/WindowStateProvider'

export default function App() {
  const [isMultiWindow, setIsMultiWindow] = useState(false)

  useEffect(() => {
    syncThemeWithLocal()

    // Check if this is a child window by looking for window type in URL
    const urlParams = new URLSearchParams(window.location.search)
    const windowType = urlParams.get('windowType')

    // If we have a window type and it's not 'main', use WindowRenderer
    if (windowType && windowType !== 'main') {
      setIsMultiWindow(true)
    }
  }, [])

  const urlParams = new URLSearchParams(window.location.search)
  const enhanced = urlParams.get('enhanced')

  if (enhanced === 'true') {
    return (
      <MultiWindowProvider>
        <WindowStateProvider>
          <PortalManagerProvider>
            <EnhancedHomePage />
          </PortalManagerProvider>
        </WindowStateProvider>
      </MultiWindowProvider>
    )
  }

  return (
    <MultiWindowProvider>
      <WindowStateProvider>
        <PortalManagerProvider>
          {isMultiWindow ? <WindowRenderer /> : <RouterProvider router={router} />}
        </PortalManagerProvider>
      </WindowStateProvider>
    </MultiWindowProvider>
  )
}

const root = createRoot(document.getElementById('app')!)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
