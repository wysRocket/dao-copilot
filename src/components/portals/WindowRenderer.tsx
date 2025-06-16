import React, {useEffect, useState} from 'react'
import {usePortalManager} from './PortalManager'

// Import window-specific components and layouts
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
        return (
          <WindowLayout>
            <div className="flex h-full flex-col space-y-6 p-6">
              {/* Header */}
              <div className="text-center">
                <h1 className="mb-2 text-3xl font-bold text-white">DAO Copilot</h1>
                <p className="text-white/70">Enhanced with Glass Morphism UI</p>
              </div>

              {/* Main Content */}
              <div className="flex flex-1 flex-col items-center justify-center space-y-8">
                <div className="max-w-md space-y-4 text-center">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-600">
                    <svg
                      className="h-8 w-8 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    </svg>
                  </div>

                  <h2 className="text-xl font-semibold text-white">Ready to Record</h2>
                  <p className="text-white/70">Click start to begin recording your session</p>
                </div>

                {/* Control Buttons */}
                <div className="flex space-x-4">
                  <button className="flex items-center space-x-2 rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-9-4v8a2 2 0 002 2h8a2 2 0 002-2v-8M7 7a2 2 0 012-2h6a2 2 0 012 2v1H7V7z"
                      />
                    </svg>
                    <span>Start Recording</span>
                  </button>

                  <button className="flex items-center space-x-2 rounded-lg bg-gray-600 px-6 py-3 text-white transition-colors hover:bg-gray-700">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    <span>Settings</span>
                  </button>
                </div>

                {/* Stats */}
                <div className="grid w-full max-w-lg grid-cols-3 gap-4">
                  <div className="rounded-lg bg-white/10 p-4 text-center backdrop-blur-sm">
                    <div className="text-2xl font-bold text-white">24</div>
                    <div className="text-sm text-white/60">Sessions</div>
                  </div>
                  <div className="rounded-lg bg-white/10 p-4 text-center backdrop-blur-sm">
                    <div className="text-2xl font-bold text-white">12h</div>
                    <div className="text-sm text-white/60">Total Time</div>
                  </div>
                  <div className="rounded-lg bg-white/10 p-4 text-center backdrop-blur-sm">
                    <div className="text-2xl font-bold text-white">98%</div>
                    <div className="text-sm text-white/60">Accuracy</div>
                  </div>
                </div>
              </div>
            </div>
          </WindowLayout>
        )

      case 'assistant':
        return (
          <WindowLayout>
            <AssistantWindowLayout />
          </WindowLayout>
        )

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
