import React, {useEffect, useState} from 'react'
import {usePortalManager} from './PortalManager'

// Import window-specific components and layouts
import HomePage from '../../pages/HomePage'
import AssistantWindowLayout from '../../layouts/AssistantWindowLayout'
import WindowLayout from '../../layouts/WindowLayout'

interface WindowRendererProps {
  // Optional override for window type
  windowType?: string
}

export const WindowRenderer: React.FC<WindowRendererProps> = ({windowType}) => {
  const portalManager = usePortalManager()
  const [currentWindowType, setCurrentWindowType] = useState<string>('main')

  useEffect(() => {
    // Get window type from URL parameters or current window info
    const urlParams = new URLSearchParams(window.location.search)
    const urlWindowType = urlParams.get('windowType')

    if (windowType) {
      setCurrentWindowType(windowType)
    } else if (urlWindowType) {
      setCurrentWindowType(urlWindowType)
    } else if (portalManager.currentWindow) {
      setCurrentWindowType(portalManager.currentWindow.type)
    }
  }, [windowType, portalManager.currentWindow])

  // Listen for window info updates
  useEffect(() => {
    const removeListener = portalManager.onInterWindowMessage(
      (channel: string, ...args: unknown[]) => {
        if (
          channel === 'window-info' &&
          args[0] &&
          typeof args[0] === 'object' &&
          'windowId' in args[0]
        ) {
          const windowInfo = args[0] as {windowId: string; type: string}
          setCurrentWindowType(windowInfo.type)
        }
      }
    )

    return removeListener
  }, [portalManager])

  // Render appropriate component based on window type
  const renderWindowContent = () => {
    switch (currentWindowType) {
      case 'main':
        return <HomePage />

      case 'assistant':
        return <AssistantWindowLayout />

      default:
        return (
          <WindowLayout>
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="text-lg font-semibold">Unknown Window Type</div>
                <div className="text-muted-foreground text-sm">
                  Window type: {currentWindowType}
                </div>
              </div>
            </div>
          </WindowLayout>
        )
    }
  }

  return <div className="h-full w-full">{renderWindowContent()}</div>
}
