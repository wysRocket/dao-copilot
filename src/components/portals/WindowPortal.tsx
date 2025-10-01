import React, {useEffect, useRef, useState, ReactNode} from 'react'
import {createPortal} from 'react-dom'

export interface WindowPortalProps {
  children: ReactNode
  windowId: string
  onWindowReady?: (windowId: string) => void
  onWindowClose?: (windowId: string) => void
}

export const WindowPortal: React.FC<WindowPortalProps> = ({
  children,
  windowId,
  onWindowReady,
  onWindowClose
}) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  const [isWindowReady, setIsWindowReady] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const initializePortal = async () => {
      try {
        // Wait for the window to be ready
        const windowInfo = await window.electronWindow?.getWindowInfo(windowId)
        if (!windowInfo) {
          console.warn(`Window ${windowId} not found`)
          return
        }

        // Create a container div for the portal content
        const container = document.createElement('div')
        container.id = `portal-container-${windowId}`
        container.style.cssText = `
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        `

        // Find the target window's document body
        const targetWindow = await getWindowById(windowId)
        if (targetWindow && targetWindow.document) {
          targetWindow.document.body.appendChild(container)
          setPortalContainer(container)
          setIsWindowReady(true)

          // Copy parent window's styles to child window
          copyStylesToWindow(targetWindow)

          // Set up cleanup
          cleanupRef.current = () => {
            if (container.parentNode) {
              container.parentNode.removeChild(container)
            }
          }

          onWindowReady?.(windowId)
        }
      } catch (error) {
        console.error(`Failed to initialize portal for window ${windowId}:`, error)
      }
    }

    const handleWindowClose = () => {
      setIsWindowReady(false)
      setPortalContainer(null)
      onWindowClose?.(windowId)
    }

    // Listen for window close events
    const removeCloseListener = window.electronWindow?.onInterWindowMessage?.(
      (channel: string, ...args: unknown[]) => {
        if (channel === 'window-closed' && args[0] === windowId) {
          handleWindowClose()
        }
      }
    )

    initializePortal()

    return () => {
      cleanupRef.current?.()
      removeCloseListener?.()
    }
  }, [windowId, onWindowReady, onWindowClose])

  // Render the portal if the container is ready
  if (!isWindowReady || !portalContainer) {
    return null
  }

  return createPortal(children, portalContainer)
}

// Helper function to get window reference by ID
// This version uses only APIs exposed via the preload script (window.electronWindow)
async function getWindowById(windowId: string): Promise<Window | null> {
  if (window.electronWindow && typeof window.electronWindow.getWindowReference === 'function') {
    try {
      // getWindowReference should be implemented in your preload script to safely return a reference or proxy
      const windowReference = await window.electronWindow.getWindowReference(windowId)
      return windowReference || null
    } catch (error) {
      console.error(`Failed to retrieve window with ID ${windowId}:`, error)
      return null
    }
  } else {
    console.warn(
      'window.electronWindow.getWindowReference is not available in preload. Returning null.'
    )
    return null
  }
}

// Helper function to copy styles from parent window to child window
function copyStylesToWindow(targetWindow: Window) {
  const parentDocument = document
  const targetDocument = targetWindow.document

  // Copy stylesheets
  const stylesheets = parentDocument.querySelectorAll('link[rel="stylesheet"], style')
  stylesheets.forEach(stylesheet => {
    const clonedStylesheet = stylesheet.cloneNode(true) as HTMLElement
    targetDocument.head.appendChild(clonedStylesheet)
  })

  // Copy CSS custom properties from the root element
  const rootStyles = getComputedStyle(parentDocument.documentElement)
  const targetRoot = targetDocument.documentElement

  // Copy CSS variables
  for (let i = 0; i < rootStyles.length; i++) {
    const property = rootStyles[i]
    if (property.startsWith('--')) {
      const value = rootStyles.getPropertyValue(property)
      targetRoot.style.setProperty(property, value)
    }
  }

  // Copy body classes for theme support
  targetDocument.body.className = parentDocument.body.className
}
